#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! DigiClip Setup — the custom, cross-platform installer.
//!
//! Windows: download + unzip into `%LOCALAPPDATA%\DigiClip`, register an
//!           uninstall entry, create Start Menu + desktop shortcuts.
//! macOS:  copy `DigiClip.app` into /Applications with `ditto`.
//! Linux:  extract the AppImage into `~/.local/opt/digiclip`, write a
//!         .desktop entry + icon, symlink into `~/.local/bin`.
//!
//! The wizard UI detects the machine and offers Install / Update /
//! Reinstall / Repair / Uninstall. Uninstall also works the OS way
//! (Windows "Apps & features" entry) via `--uninstall`.

mod install;
mod sys;

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter as _, Manager as _};

const OWNER_REPO: &str = "n1ssyyy/DigiClip";
const RELEASES_URL: &str = "https://github.com/n1ssyyy/DigiClip/releases";
const SETUP_ASSET: &str = "DigiClip-Setup.exe";

fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(target_os = "windows")]
fn hidden<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    sys::hidden(program)
}
#[cfg(not(target_os = "windows"))]
fn hidden<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    sys::hidden(program)
}

// ---------------------------------------------------------------------------
// Release lookup
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseInfo {
    version: String,
    payload_url: String,
    setup_url: String,
    notes: String,
    app_version: String,
    install_dir: String,
    location_label: String,
}

async fn github_latest() -> Result<serde_json::Value, String> {
    reqwest::Client::builder()
        .user_agent("DigiClip-Setup")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?
        .get(format!(
            "https://api.github.com/repos/{OWNER_REPO}/releases/latest"
        ))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}

fn asset_url<'a>(rel: &'a serde_json::Value, suffix: &str) -> Option<String> {
    rel.get("assets")
        .and_then(|a| a.as_array())
        .and_then(|assets| {
            assets.iter().find_map(|a| {
                let name = a.get("name")?.as_str()?;
                name.ends_with(suffix)
                    .then(|| a.get("browser_download_url")?.as_str().map(str::to_string))
                    .flatten()
            })
        })
}

#[tauri::command]
async fn fetch_latest() -> Result<ReleaseInfo, String> {
    let rel = github_latest().await?;
    let version = rel
        .get("tag_name")
        .and_then(|t| t.as_str())
        .unwrap_or_default()
        .trim_start_matches(['v', 'V'])
        .to_string();
    if version.is_empty() {
        return Err("Release has no version.".into());
    }
    let payload_url = asset_url(&rel, sys::payload_suffix())
        .ok_or_else(|| format!("Release v{version} has no payload for this platform."))?;
    let setup_url =
        asset_url(&rel, SETUP_ASSET).unwrap_or_else(|| format!("{RELEASES_URL}/latest"));
    let notes = rel
        .get("body")
        .and_then(|b| b.as_str())
        .unwrap_or("")
        .to_string();
    Ok(ReleaseInfo {
        version,
        payload_url,
        setup_url,
        notes,
        app_version: app_version().to_string(),
        install_dir: sys::resolve_install_dir().display().to_string(),
        location_label: sys::install_location_label().to_string(),
    })
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    done: u64,
    total: u64,
}

#[tauri::command]
async fn download_payload(app: AppHandle, url: String) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("Refusing non-https download.".into());
    }
    let ext = if url.ends_with(".zip") {
        "zip"
    } else {
        "tar.gz"
    };
    let dest = sys::temp_dir().join(format!("DigiClip-app-payload.{ext}"));
    let part = dest.with_extension("part");
    let resume_from = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    let client = reqwest::Client::builder()
        .user_agent("DigiClip-Setup")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(&url);
    if resume_from > 0 {
        req = req.header("Range", format!("bytes={resume_from}-"));
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() && resp.status().as_u16() != 206 {
        return Err(format!("Download failed: HTTP {}.", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0) + resume_from;
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(resume_from > 0)
        .write(true)
        .truncate(resume_from == 0)
        .open(&part)
        .await
        .map_err(|e| e.to_string())?;
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;
    let mut stream = resp.bytes_stream();
    let mut done = resume_from;
    let _ = app.emit("setup:download", DownloadProgress { done, total });
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        let _ = app.emit("setup:download", DownloadProgress { done, total });
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    let _ = std::fs::remove_file(&dest);
    tokio::fs::rename(&part, &dest)
        .await
        .map_err(|e| e.to_string())?;
    Ok(dest.display().to_string())
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
    app_running: bool,
    setup_version: String,
}

#[tauri::command]
fn detect() -> DetectInfo {
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
        app_running: sys::app_running(),
        setup_version: app_version().to_string(),
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallResult {
    version: String,
    install_dir: String,
}

/// Stop the app, download, lay down, register. `version` pins the build
/// (repair/reinstall pass the detected one).
#[tauri::command]
async fn install(
    app: AppHandle,
    install_dir: Option<String>,
    version: Option<String>,
) -> Result<InstallResult, String> {
    let target = install_dir
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(sys::resolve_install_dir);
    let rel = github_latest().await?;
    let ver = version.unwrap_or_else(|| {
        rel.get("tag_name")
            .and_then(|t| t.as_str())
            .unwrap_or_default()
            .trim_start_matches(['v', 'V'])
            .to_string()
    });
    let url = asset_url(&rel, sys::payload_suffix())
        .ok_or_else(|| "Release has no payload for this platform.".to_string())?;
    if !sys::stop_app() {
        return Err("DigiClip (or its engine) is still running — close it and retry.".into());
    }
    let payload = download_payload(app, url).await?;
    install::lay_down(Path::new(&payload), &target)?;
    install::register(&ver, &target)?;
    Ok(InstallResult {
        version: ver,
        install_dir: target.display().to_string(),
    })
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
        let _ = std::process::Command::new("open")
            .arg("-a")
            .arg(&exe)
            .status();
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        hidden(exe).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn app_running() -> bool {
    sys::app_running()
}

#[tauri::command]
fn stop_app() -> bool {
    sys::stop_app()
}

#[tauri::command]
fn uninstall() -> Result<(), String> {
    let dir = sys::resolve_install_dir();
    let _ = sys::stop_app();
    install::unregister();
    install::remove_tree(&dir);
    Ok(())
}

/// Open an http(s) URL in the OS browser — never a webview child window.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("only http(s) urls".into());
    }
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", "start", "", &url]);
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

/// Frameless window: the header mousedown drags the wizard. The
/// declarative `data-tauri-drag-region` alone doesn't grab on every
/// webview build, so the UI calls this as the fallback.
#[tauri::command]
async fn drag_window(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("no main window")?;
    win.start_dragging().map_err(|e| e.to_string())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let quiet = args.iter().any(|a| a == "--quiet");
    // Detached worker (already copied to temp): do the removal, never respawn.
    if args.iter().any(|a| a == "--do-uninstall") {
        let _ = quiet;
        let dir = sys::resolve_install_dir();
        let _ = sys::stop_app();
        install::unregister();
        install::remove_tree(&dir);
        return;
    }
    // Registered uninstall path (from Add/Remove Programs): copy ourselves
    // to temp so the real tree can be deleted while we run.
    if args.iter().any(|a| a == "--uninstall") {
        if let Ok(exe) = std::env::current_exe() {
            let temp_copy = sys::temp_dir().join("DigiClip-Setup-uninstaller");
            #[cfg(target_os = "windows")]
            let temp_copy = temp_copy.with_extension("exe");
            if std::fs::copy(&exe, &temp_copy).is_ok() {
                let mut a: Vec<String> = vec!["--do-uninstall".into()];
                if quiet {
                    a.push("--quiet".into());
                }
                let _ = hidden(temp_copy).args(a).spawn();
            }
        }
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            detect,
            fetch_latest,
            download_payload,
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
