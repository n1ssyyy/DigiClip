#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
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

#[cfg(target_os = "windows")]
const ENGINE_EXE: &str = "digiclip.exe";
#[cfg(not(target_os = "windows"))]
const ENGINE_EXE: &str = "digiclip";

/// Locate the engine binary:
/// 1. `$DIGICLIP_BIN` (dev override),
/// 2. the bundled `resources/` sidecar (see tauri.conf) under the OS
///    resource dir — beside the exe on Windows, `Contents/Resources` in the
///    macOS bundle, `usr/lib/DigiClip` in the AppImage / deb,
/// 3. next to this exe (portable layouts),
/// 4. the workspace debug/release build (cargo dev).
fn engine_binary(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("DIGICLIP_BIN") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        let p = res.join("resources").join(ENGINE_EXE);
        if p.is_file() {
            return Some(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for p in [dir.join(ENGINE_EXE), dir.join("resources").join(ENGINE_EXE)] {
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
    let bin = engine_binary(app).ok_or_else(|| anyhow::anyhow!("engine binary not found"))?;
    eprintln!("[shell] engine: {}", bin.display());
    // Fixed port when free, else the next open one: a stale sidecar from
    // a crashed session must never wedge the app (its token died with
    // its spawner, so the port is the only thing we can route around).
    let mut port: u16 = 4317;
    while port < 4331 {
        if tokio::net::TcpListener::bind(("127.0.0.1", port))
            .await
            .is_ok()
        {
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
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("no sidecar stdout"))?;
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
    state
        .serve
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "engine not booted".into())
}

// ---------------------------------------------------------------------------
// Updates: the app never replaces its own files. It checks the latest
// GitHub release, downloads the DigiClip Setup for this platform (the
// offline installer with the new build inside), launches it and exits.
// ---------------------------------------------------------------------------

const RELEASES_API: &str = "https://api.github.com/repos/n1ssyyy/DigiClip/releases/latest";
const RELEASE_DOWNLOADS: &str = "https://github.com/n1ssyyy/DigiClip/releases/download/";

/// The release asset that installs DigiClip on this machine.
fn setup_asset() -> Option<&'static str> {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Some("DigiClip-Setup-Windows-x64.exe")
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some("DigiClip-Setup-macOS-arm64.zip")
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Some("DigiClip-Setup-Linux-x86_64.AppImage")
    } else {
        None
    }
}

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("DigiClip/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    version: String,
    notes: String,
    date: String,
    /// Setup download for this platform (None: no build for this machine).
    setup_url: Option<String>,
    setup_size: u64,
}

/// Latest published release (drafts and pre-releases never count).
#[tauri::command]
async fn check_update() -> Result<UpdateInfo, String> {
    let rel: serde_json::Value = http()?
        .get(RELEASES_API)
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let text = |k: &str| {
        rel.get(k)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    let version = text("tag_name").trim_start_matches(['v', 'V']).to_string();
    if version.is_empty() {
        return Err("Latest release has no version.".into());
    }
    let asset = setup_asset().and_then(|name| {
        rel.get("assets")?
            .as_array()?
            .iter()
            .find(|a| a.get("name").and_then(|n| n.as_str()) == Some(name))
    });
    Ok(UpdateInfo {
        version,
        notes: text("body"),
        date: text("published_at"),
        setup_url: asset
            .and_then(|a| a.get("browser_download_url")?.as_str())
            .map(str::to_string),
        setup_size: asset.and_then(|a| a.get("size")?.as_u64()).unwrap_or(0),
    })
}

#[derive(Debug, Clone, serde::Serialize)]
struct Progress {
    done: u64,
    total: u64,
}

/// Download the Setup into the app cache and make it launchable. Returns
/// the path `run_setup` takes (the .app bundle on macOS).
#[tauri::command]
async fn download_setup(app: AppHandle, url: String) -> Result<String, String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let name = setup_asset().ok_or("No DigiClip Setup is published for this platform.")?;
    if !url.starts_with(RELEASE_DOWNLOADS) || !url.ends_with(name) {
        return Err("Refusing to download Setup from an unexpected URL.".into());
    }
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("updates");
    let _ = tokio::fs::remove_dir_all(&dir).await;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    let dest = dir.join(name);
    let part = dir.join(format!("{name}.part"));

    let resp = http()?
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| format!("Setup download failed: {e}"))?;
    let total = resp.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&part)
        .await
        .map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    let mut done = 0u64;
    let mut last_emit = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        if done - last_emit >= 256 * 1024 || done == total {
            last_emit = done;
            let _ = app.emit("digiclip:update-progress", Progress { done, total });
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    if total > 0 && done != total {
        return Err(format!(
            "Setup download incomplete ({done} of {total} bytes)."
        ));
    }
    tokio::fs::rename(&part, &dest)
        .await
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        // The zip holds "DigiClip Setup.app"; ditto keeps the bundle's
        // symlinks, permissions and signature intact.
        let out = std::process::Command::new("ditto")
            .args(["-x", "-k"])
            .arg(&dest)
            .arg(&dir)
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(format!(
                "Could not unpack Setup: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        let bundle = std::fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|e| e.path())
            .find(|p| p.extension().and_then(|x| x.to_str()) == Some("app"))
            .ok_or("Setup zip has no .app bundle.")?;
        return Ok(bundle.display().to_string());
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    #[allow(unreachable_code)]
    Ok(dest.display().to_string())
}

/// True when the AppImage runtime can mount itself (static runtime: needs
/// /dev/fuse + `fusermount`); otherwise Setup is told to extract-and-run.
#[cfg(target_os = "linux")]
fn can_mount_appimage() -> bool {
    let fusermount = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"].iter().any(|d| {
        let d = std::path::Path::new(d);
        d.join("fusermount3").exists() || d.join("fusermount").exists()
    });
    fusermount && std::path::Path::new("/dev/fuse").exists()
}

/// Launch the downloaded Setup, then exit so it can replace the install.
/// Setup re-detects whatever is still running and closes it.
#[tauri::command]
async fn run_setup(app: AppHandle, path: String) -> Result<(), String> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("updates");
    let bin = PathBuf::from(&path);
    if !bin.starts_with(&cache) || !bin.exists() {
        return Err("Setup not found — download it again.".into());
    }
    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open")
        .arg("-n")
        .arg(&bin)
        .spawn();
    #[cfg(target_os = "linux")]
    let spawned = {
        let mut cmd = std::process::Command::new(&bin);
        if !can_mount_appimage() {
            cmd.env("APPIMAGE_EXTRACT_AND_RUN", "1");
        }
        cmd.spawn()
    };
    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new(&bin).spawn();
    let mut child = spawned.map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    // Give the wizard a moment to open, then drop the app + engine.
    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    app.exit(0);
    Ok(())
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
    app.get_webview_window("main")
        .ok_or("no main window")?
        .is_maximized()
        .map_err(|e| e.to_string())
}

/// Start a native window move (called from the header mousedown; the
/// fallback when the declarative drag region doesn't grab).
#[tauri::command]
async fn drag_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("no main window")?
        .start_dragging()
        .map_err(|e| e.to_string())
}

/// Reveal a file in the OS file manager (same contract as the old
/// `/api/open-external` + reveal buttons: silent no-op on failure).
#[tauri::command]
fn reveal(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{path}"))
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|p| p.display().to_string())
            .unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
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
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ShellState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let booted = boot_sidecar(&handle).await;
                match &booted {
                    Ok(info) => {
                        eprintln!("[shell] emitting serve-ready");
                        let _ = handle.emit("digiclip:serve-ready", info);
                    }
                    Err(e) => {
                        eprintln!("[shell] boot failed: {e}");
                        let _ = handle.emit("digiclip:serve-failed", e.to_string());
                    }
                }
                // Install smoke test (CI): report whether the installed app
                // found and booted its bundled engine, then quit.
                if let Some(report) = std::env::var_os("DIGICLIP_SMOKE_TEST") {
                    let line = match &booted {
                        Ok(info) => format!(
                            "ok engine={} port={}\n",
                            engine_binary(&handle)
                                .map(|p| p.display().to_string())
                                .unwrap_or_default(),
                            info.port
                        ),
                        Err(e) => format!("error {e}\n"),
                    };
                    let _ = std::fs::write(report, line);
                    handle.exit(if booted.is_ok() { 0 } else { 1 });
                }
            });
            Ok(())
        })
        .on_window_event(|win, ev| {
            // Keep the shell's rounded/fused look in sync with maximize.
            if matches!(
                ev,
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }
            ) {
                if let Ok(maxed) = win.is_maximized() {
                    let _ = win.emit("digiclip:maximized", maxed);
                }
            }
            // CloseRequested (user X / "close" action) and Destroyed (alt-F4
            // tearing the webview down) both end the process. `kill_on_drop`
            // only fires if the whole runtime unwinds cleanly — a window
            // close short-circuits that, which is how the engine used to
            // survive as an orphan holding `resources\digiclip.exe` and
            // breaking the next install ("Error opening file for writing").
            if matches!(
                ev,
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
            ) {
                if let Some(state) = win.app_handle().try_state::<ShellState>() {
                    if let Ok(mut slot) = state.child.lock() {
                        if let Some(child) = slot.as_mut() {
                            let _ = child.start_kill();
                        }
                        *slot = None;
                    }
                    let _ = state.serve.lock().map(|mut s| *s = None);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_serve,
            check_update,
            download_setup,
            run_setup,
            window_action,
            is_maximized,
            drag_window,
            reveal,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("tauri run");
}
