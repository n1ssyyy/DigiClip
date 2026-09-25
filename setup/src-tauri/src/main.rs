#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! DigiClip Setup — the custom, cross-platform, offline installer.
//!
//! Each release ships one Setup per platform with the app payload embedded
//! (see `payload.rs`), so installing needs no network:
//!
//! Windows: unzip into `%LOCALAPPDATA%\DigiClip`, register an uninstall
//!           entry, create Start Menu + desktop shortcuts.
//! macOS:  copy `DigiClip.app` into /Applications with `ditto`.
//! Linux:  unpack the AppImage into `~/.local/opt/digiclip/app` (runs
//!         without FUSE), write a .desktop entry + icon.
//!
//! The wizard UI detects the machine and offers Install / Update /
//! Reinstall / Repair / Uninstall. Headless flags (used by CI and for
//! scripted installs):
//!
//!   --payload-info                 print the embedded version, exit 2 if none
//!   --detect                       print what is installed on this machine
//!   --install [--dir D] [--reinstall]   install the embedded build
//!   --uninstall [--quiet]          remove DigiClip (the registered uninstaller)

mod install;
mod payload;
mod sys;

use std::io::Write as _;
use std::path::PathBuf;

use tauri::{AppHandle, Manager as _};

fn setup_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectInfo {
    installed: bool,
    version: Option<String>,
    install_dir: String,
    location_label: String,
    can_choose_dir: bool,
    app_running: bool,
    setup_version: String,
    /// Version this Setup installs; `None` = maintenance-only copy.
    payload_version: Option<String>,
}

#[tauri::command]
async fn detect() -> DetectInfo {
    tauri::async_runtime::spawn_blocking(|| {
        let (dir, version) = sys::installed().unwrap_or((None, None));
        let install_dir = dir
            .clone()
            .map(PathBuf::from)
            .filter(|p| p.exists())
            .unwrap_or_else(sys::default_install_dir);
        DetectInfo {
            installed: version.is_some() || dir.is_some(),
            version,
            install_dir: install_dir.display().to_string(),
            location_label: sys::install_location_label().to_string(),
            can_choose_dir: sys::can_choose_dir(),
            app_running: sys::app_running(),
            setup_version: setup_version().to_string(),
            payload_version: payload::embedded().map(|p| p.version),
        }
    })
    .await
    .expect("detect task")
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallResult {
    version: String,
    install_dir: String,
}

/// Stop the app, lay the embedded build down, register it. `clean` wipes
/// the old install first (Reinstall); otherwise files are overwritten in
/// place (Install / Update / Repair).
fn do_install(install_dir: Option<PathBuf>, clean: bool) -> Result<InstallResult, String> {
    let payload = payload::embedded().ok_or_else(|| {
        "This copy of DigiClip Setup doesn't include the app. Download the installer from the releases page.".to_string()
    })?;
    let target = sys::install_dir_for(install_dir.as_deref());
    if !sys::stop_app() {
        return Err("DigiClip (or its engine) is still running — close it and retry.".into());
    }
    install::lay_down(&payload, &target, clean)?;
    install::register(&payload.version, &target, &payload)?;
    Ok(InstallResult {
        version: payload.version,
        install_dir: target.display().to_string(),
    })
}

#[tauri::command]
async fn install(
    install_dir: Option<String>,
    clean: Option<bool>,
) -> Result<InstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        do_install(install_dir.map(PathBuf::from), clean.unwrap_or(false))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn launch_app(install_dir: Option<String>) -> Result<(), String> {
    let dir = install_dir
        .map(PathBuf::from)
        .unwrap_or_else(sys::resolve_install_dir);
    let exe =
        sys::installed_executable(&dir).ok_or_else(|| "DigiClip is not installed.".to_string())?;
    #[cfg(target_os = "macos")]
    {
        // Launch through LaunchServices so the app gets its Dock identity.
        std::process::Command::new("open")
            .arg("-a")
            .arg(&exe)
            .status()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let mut cmd = sys::hidden(&exe);
        if let Some(parent) = exe.parent() {
            cmd.current_dir(parent);
        }
        cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn app_running() -> bool {
    tauri::async_runtime::spawn_blocking(sys::app_running)
        .await
        .unwrap_or(false)
}

#[tauri::command]
async fn stop_app() -> bool {
    tauri::async_runtime::spawn_blocking(sys::stop_app)
        .await
        .unwrap_or(false)
}

fn do_uninstall() {
    let dir = sys::resolve_install_dir();
    let _ = sys::stop_app();
    install::unregister();
    install::remove_tree(&dir);
}

#[tauri::command]
async fn uninstall() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(do_uninstall)
        .await
        .map_err(|e| e.to_string())
}

/// Open an http(s) URL in the OS browser — never a webview child window.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("only http(s) urls".into());
    }
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = sys::hidden("cmd");
        c.args(["/C", "start", "", &url]);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(&url);
        c
    };
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(&url);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Frameless window: the header mousedown drags the wizard. The
/// declarative `data-tauri-drag-region` alone doesn't grab on every
/// webview build, so the UI calls this as the fallback.
#[tauri::command]
async fn drag_window(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("no main window")?;
    win.start_dragging().map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Headless entry points
// ---------------------------------------------------------------------------

fn arg_value(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

/// Handle a headless invocation; `None` means "open the wizard".
fn headless(args: &[String]) -> Option<i32> {
    let has = |f: &str| args.iter().any(|a| a == f);
    let quiet = has("--quiet");
    let mut out = std::io::stdout();
    let mut err = std::io::stderr();

    if has("--help") || has("-h") {
        let _ = writeln!(
            out,
            "DigiClip Setup {}\n\n  --payload-info                 print the DigiClip version this Setup installs\n  --detect                       print what is installed on this machine\n  --install [--dir D] [--reinstall]   install without the wizard\n  --uninstall [--quiet]          remove DigiClip",
            setup_version()
        );
        return Some(0);
    }
    if has("--payload-info") {
        return Some(match payload::embedded() {
            Some(p) => {
                let _ = writeln!(out, "{} {}", p.version, p.len);
                0
            }
            None => {
                let _ = writeln!(err, "no embedded payload");
                2
            }
        });
    }
    if has("--detect") {
        let (dir, version) = sys::installed().unwrap_or((None, None));
        let _ = writeln!(
            out,
            "installed={} version={} dir={}",
            dir.is_some() || version.is_some(),
            version.unwrap_or_default(),
            dir.unwrap_or_default()
        );
        return Some(0);
    }
    if has("--install") {
        let dir = arg_value(args, "--dir").map(PathBuf::from);
        return Some(match do_install(dir, has("--reinstall")) {
            Ok(r) => {
                let _ = writeln!(out, "installed {} in {}", r.version, r.install_dir);
                0
            }
            Err(e) => {
                let _ = writeln!(err, "install failed: {e}");
                1
            }
        });
    }
    // Detached worker (already copied to temp): do the removal, never respawn.
    if has("--do-uninstall") {
        do_uninstall();
        // The spawning uninstaller may still hold its exe for a moment.
        let dir = sys::resolve_install_dir();
        for _ in 0..20 {
            if !dir.join("digiclip-app.exe").exists() && !dir.join("DigiClip-Setup.exe").exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
            install::remove_tree(&dir);
        }
        return Some(0);
    }
    if has("--uninstall") {
        // Windows can't delete a running exe, and the registered
        // uninstaller lives inside the install dir: copy ourselves to temp
        // (payload-free, so the copy is small) and let that copy remove
        // the tree. macOS/Linux just remove it in-process.
        #[cfg(target_os = "windows")]
        {
            if let Ok(exe) = std::env::current_exe() {
                let temp_copy =
                    sys::temp_dir().join(format!("DigiClip-Uninstall-{}.exe", std::process::id()));
                if std::fs::copy(&exe, &temp_copy).is_ok() {
                    let mut a: Vec<&str> = vec!["--do-uninstall"];
                    if quiet {
                        a.push("--quiet");
                    }
                    if sys::hidden(&temp_copy).args(a).spawn().is_ok() {
                        return Some(0);
                    }
                }
            }
        }
        let _ = quiet;
        do_uninstall();
        return Some(0);
    }
    None
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(code) = headless(&args) {
        std::process::exit(code);
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // The window is created hidden (tauri.conf `visible: false`) and shown
        // here, once it is fully undecorated: mapped straight away, GNOME
        // briefly framed it with a title bar, and window-effect extensions
        // (e.g. Blur my Shell) kept that frame's offset.
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect,
            install,
            launch_app,
            uninstall,
            app_running,
            stop_app,
            open_url,
            drag_window
        ])
        .run(tauri::generate_context!())
        .expect("setup run");
}
