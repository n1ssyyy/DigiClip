//! DigiClip desktop shell: owns the `digiclip serve` sidecar and exposes
//! a handful of window/OS commands to the React UI. All pipeline state
//! flows over the sidecar's WebSocket — this process never polls anything.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Emitter as _, Manager, State};

#[derive(Debug, Clone, serde::Serialize)]
struct ServeInfo {
    port: u16,
    token: String,
}

struct ShellState {
    serve: std::sync::Mutex<Option<ServeInfo>>,
    child: std::sync::Mutex<Option<tokio::process::Child>>,
}

impl Default for ShellState {
    fn default() -> Self {
        Self {
            serve: std::sync::Mutex::new(None),
            child: std::sync::Mutex::new(None),
        }
    }
}

static TOKEN_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Locate the engine binary:
/// 1. `$DIGICLIP_BIN` (dev override),
/// 2. next to this exe (bundled `resources/` sidecar — see tauri.conf),
/// 3. the workspace debug/release build (cargo dev).
fn engine_binary() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("DIGICLIP_BIN") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in ["digiclip.exe", "digiclip"] {
                let p = dir.join(name);
                if p.is_file() {
                    return Some(p);
                }
            }
            // Bundled resources land beside the exe under `resources/`.
            for name in ["resources/digiclip.exe", "resources/digiclip"] {
                let p = dir.join(name);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    // Cargo dev: engine checkout at <repo>/engine (git submodule, pinned to
    // the DigiClip-CLI repo) or the sibling <repo>/../digiclip-rs (local
    // two-checkout dev before the submodule exists).
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let root = manifest.parent()?.parent()?.to_path_buf();
    for dir in [root.join("engine"), root.join("..").join("digiclip-rs")] {
        for profile in ["debug", "release"] {
            for name in ["digiclip.exe", "digiclip"] {
                let p = dir.join("target").join(profile).join(name);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    None
}

/// Boot the sidecar, wait for its `DIGICLIP_SERVE` banner, publish info.
async fn boot_sidecar(app: &AppHandle) -> anyhow::Result<ServeInfo> {
    let bin = engine_binary().ok_or_else(|| anyhow::anyhow!("engine binary not found"))?;
    eprintln!("[shell] engine: {}", bin.display());
    // Fixed port when free, else the next open one: a stale sidecar from
    // a crashed session must never wedge the app (its token died with
    // its spawner, so the port is the only thing we can route around).
    let mut port: u16 = 4317;
    while port < 4331 {
        if tokio::net::TcpListener::bind(("127.0.0.1", port)).await.is_ok() {
            break;
        }
        port += 1;
    }
    if port >= 4331 {
        anyhow::bail!("no free port in 4317-4330");
    }
    let token = format!(
        "{:x}{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0),
        TOKEN_COUNTER.fetch_add(1, Ordering::SeqCst) ^ (std::process::id() as u64),
    );
    // Hidden subprocess: the engine is a console binary, and on Windows a
    // plain spawn opens a visible terminal next to the app. Build a std
    // command with CREATE_NO_WINDOW first, then hand it to tokio.
    let mut std_cmd = std::process::Command::new(&bin);
    std_cmd
        .args(["--serve", "--port", &port.to_string(), "--token", &token])
        .stdout(Stdio::piped())
        // Piped (not null): on a pre-banner exit the tail below becomes
        // the boot error instead of silence.
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: no console window for the engine.
        std_cmd.creation_flags(0x08000000);
    }
    let mut child = tokio::process::Command::from(std_cmd)
        .kill_on_drop(true)
        .spawn()?;

    // Wait for the banner (bounded — a missing banner means boot failure).
    // Both pipes stay drained for the child's whole life afterwards: a
    // piped child whose reader goes away dies on its next write
    // (Windows: os error 232), which both kills jobs and eats their real
    // error output. Draining also surfaces sidecar logs in this shell.
    let mut stderr = child.stderr.take();
    let (info, stdout) = {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let stdout = child.stdout.take().ok_or_else(|| anyhow::anyhow!("no sidecar stdout"))?;
        let mut lines = BufReader::new(stdout).lines();
        let deadline = tokio::time::sleep(std::time::Duration::from_secs(30));
        tokio::pin!(deadline);
        loop {
            tokio::select! {
                _ = &mut deadline => anyhow::bail!("sidecar did not print DIGICLIP_SERVE in 30s"),
                line = lines.next_line() => {
                    match line? {
                        Some(l) if l.starts_with("DIGICLIP_SERVE") => {
                            break (ServeInfo { port, token: token.clone() }, lines.into_inner());
                        }
                        Some(_) => continue,
                        None => {
                            let mut tail = String::new();
                            if let Some(e) = stderr.as_mut() {
                                use tokio::io::AsyncReadExt;
                                let mut buf = vec![0u8; 2048];
                                if let Ok(n) = e.read(&mut buf).await {
                                    tail = String::from_utf8_lossy(&buf[..n]).into_owned();
                                }
                            }
                            anyhow::bail!("sidecar exited before banner{}", if tail.trim().is_empty() { String::new() } else { format!(": {tail}") });
                        }
                    }
                }
            }
        }
    };
    tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(l)) = lines.next_line().await {
            eprintln!("[sidecar] {l}");
        }
    });
    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                eprintln!("[sidecar] {l}");
            }
        });
    }

    let state: State<ShellState> = app.state();
    *state.serve.lock().unwrap() = Some(info.clone());
    *state.child.lock().unwrap() = Some(child);
    eprintln!("[shell] serve ready on port {}", info.port);
    Ok(info)
}

#[tauri::command]
fn get_serve(state: State<ShellState>) -> Result<ServeInfo, String> {
    state.serve.lock().unwrap().clone().ok_or_else(|| "engine not booted".into())
}

#[tauri::command]
async fn window_action(app: AppHandle, action: String) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("no main window")?;
    match action.as_str() {
        "minimize" => win.minimize().map_err(|e| e.to_string()),
        "maximize" => win.maximize().map_err(|e| e.to_string()),
        "unmaximize" => win.unmaximize().map_err(|e| e.to_string()),
        "close" => win.close().map_err(|e| e.to_string()),
        _ => Err("unknown window action".into()),
    }
}

#[tauri::command]
async fn is_maximized(app: AppHandle) -> Result<bool, String> {
    app.get_webview_window("main").ok_or("no main window")?.is_maximized().map_err(|e| e.to_string())
}

/// Start a native window move (called from the header mousedown; the
/// fallback when the declarative drag region doesn't grab).
#[tauri::command]
async fn drag_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main").ok_or("no main window")?.start_dragging().map_err(|e| e.to_string())
}

/// Reveal a file in the OS file manager (same contract as the old
/// `/api/open-external` + reveal buttons: silent no-op on failure).
#[tauri::command]
fn reveal(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(format!("/select,{path}")).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg("-R").arg(&path).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let parent = std::path::Path::new(&path).parent().map(|p| p.display().to_string()).unwrap_or(path);
        std::process::Command::new("xdg-open").arg(&parent).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
}

/// Open an http(s) URL in the OS browser.
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
            // Hide the one-shot `cmd /C start` helper (no console flash).
            cmd.creation_flags(0x08000000);
        }
        cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&url).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(&url).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ShellState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match boot_sidecar(&handle).await {
                    Ok(info) => {
                        eprintln!("[shell] emitting serve-ready");
                        let _ = handle.emit("digiclip:serve-ready", &info);
                    }
                    Err(e) => {
                        eprintln!("[shell] boot failed: {e}");
                        let _ = handle.emit("digiclip:serve-failed", e.to_string());
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|win, ev| {
            // Keep the shell's rounded/fused look in sync with maximize.
            if matches!(ev, tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }) {
                if let Ok(maxed) = win.is_maximized() {
                    let _ = win.emit("digiclip:maximized", maxed);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![get_serve, window_action, is_maximized, drag_window, reveal, open_url])
        .run(tauri::generate_context!())
        .expect("tauri run");
}
