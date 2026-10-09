#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! DigiClip desktop shell: owns the `digiclip serve` sidecar and exposes
//! a handful of window/OS commands to the React UI. All pipeline state
//! flows over the sidecar's WebSocket — this process never polls anything.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter as _, Manager, State};

mod tray;

#[derive(Debug, Clone, serde::Serialize)]
struct ServeInfo {
    port: u16,
    token: String,
}

/// Where the engine boot stands (see `begin_boot` / `run_boot`).
enum Boot {
    /// Nothing started yet, or the engine was stopped.
    Idle,
    /// A boot is running (its attempts included).
    Booting,
    Ready(ServeInfo),
    Failed(String),
}

struct ShellState {
    boot: Mutex<Boot>,
    /// The engine process and the epoch of the boot that started it.
    child: Mutex<Option<(u64, tokio::process::Child)>>,
    /// Bumped by `stop_engine`: a boot that started before it gives up.
    epoch: AtomicU64,
}

impl Default for ShellState {
    fn default() -> Self {
        Self {
            boot: Mutex::new(Boot::Idle),
            child: Mutex::new(None),
            epoch: AtomicU64::new(0),
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

/// How long one start attempt waits for the `DIGICLIP_SERVE` banner. The
/// first start after an update is slow (antivirus scanning the new 56 MB
/// engine, a busy disk) and 30 s was not enough for it; a second start
/// right after is usually fast because the scan is cached. A minute covers
/// a slow scan with room to spare without leaving a broken start spinning
/// for long.
const BOOT_WAIT: std::time::Duration = std::time::Duration::from_secs(60);
/// Attempts the shell makes by itself at launch before the user is told
/// anything (a user-asked retry makes one).
const AUTO_ATTEMPTS: u32 = 2;
/// Lines of engine output kept per pipe for the failure message.
const TAIL_KEEP: usize = 12;
/// What the failure message quotes from them: at most this many lines, each
/// cut to `TAIL_LINE` characters, `TAIL_TOTAL` characters overall.
const TAIL_LINES: usize = 6;
const TAIL_LINE: usize = 160;
const TAIL_TOTAL: usize = 600;

/// The last lines the engine wrote while it was starting.
#[derive(Default)]
struct Tail {
    out: VecDeque<String>,
    err: VecDeque<String>,
}

fn push_line(q: &mut VecDeque<String>, line: &str) {
    if q.len() >= TAIL_KEEP {
        q.pop_front();
    }
    q.push_back(line.to_string());
}

/// A line made readable: terminal colour codes and control characters
/// dropped, trimmed, cut to `TAIL_LINE` characters.
fn clean_line(line: &str) -> String {
    let mut s = String::new();
    let mut chars = line.chars();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            for n in chars.by_ref() {
                if n.is_ascii_alphabetic() {
                    break;
                }
            }
        } else if !c.is_control() {
            s.push(c);
        }
    }
    let s = s.trim();
    if s.chars().count() > TAIL_LINE {
        let cut: String = s.chars().take(TAIL_LINE).collect();
        format!("{cut}…")
    } else {
        s.to_string()
    }
}

/// What to show after a failure: the engine's stderr when it wrote any,
/// else its last stdout lines; short enough for the error card.
fn tail_text(tail: &Tail) -> String {
    let pick = |q: &VecDeque<String>| -> Vec<String> {
        let all: Vec<String> = q
            .iter()
            .map(|l| clean_line(l))
            .filter(|l| !l.is_empty())
            .collect();
        all[all.len().saturating_sub(TAIL_LINES)..].to_vec()
    };
    let mut lines = pick(&tail.err);
    if lines.is_empty() {
        lines = pick(&tail.out);
    }
    while lines.len() > 1 && lines.iter().map(|l| l.chars().count() + 1).sum::<usize>() > TAIL_TOTAL
    {
        lines.remove(0);
    }
    lines.join("\n")
}

fn with_tail(base: &str, tail: &Arc<Mutex<Tail>>) -> String {
    let text = tail.lock().map(|t| tail_text(&t)).unwrap_or_default();
    if text.is_empty() {
        base.to_string()
    } else {
        format!("{base}:\n{text}")
    }
}

/// Kill the sidecar that belongs to the boot of `epoch` (or to an older
/// one) and wait for it to be gone, so the next start never runs beside a
/// leftover and the engine file is released. A child tagged with a newer
/// epoch was started by a boot that began after a stop: it is not ours.
async fn reap_child(app: &AppHandle, epoch: u64) {
    let child = {
        let state: State<ShellState> = app.state();
        let mut slot = match state.child.lock() {
            Ok(slot) => slot,
            Err(_) => return,
        };
        match slot.take() {
            Some((tag, child)) if tag <= epoch => Some(child),
            other => {
                *slot = other;
                None
            }
        }
    };
    if let Some(mut child) = child {
        let _ = child.start_kill();
        let _ = tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await;
    }
}

/// Is the engine process this shell started still running? No child, or
/// one that has exited, is dead; a child whose state cannot be read counts
/// as alive (a healthy engine is never replaced on a doubt).
fn engine_alive(state: &ShellState) -> bool {
    match state.child.lock() {
        Ok(mut slot) => match slot.as_mut() {
            Some((_, child)) => !matches!(child.try_wait(), Ok(Some(_))),
            None => false,
        },
        Err(_) => true,
    }
}

fn stopped_since(app: &AppHandle, epoch: u64) -> bool {
    let state: State<ShellState> = app.state();
    state.epoch.load(Ordering::SeqCst) != epoch
}

enum Ev {
    Banner,
    Eof,
}

/// One start of the sidecar: spawn it, wait up to `BOOT_WAIT` for its
/// `DIGICLIP_SERVE` banner. A failure leaves no child behind.
async fn boot_once(app: &AppHandle, epoch: u64) -> anyhow::Result<ServeInfo> {
    // Never two engines: whatever is left of an earlier start goes first.
    reap_child(app, epoch).await;
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
    std_cmd.args(["--serve", "--port", &port.to_string(), "--token", &token]);
    // Dev override: a throwaway settings/data dir (test runs without
    // touching the user's saved settings).
    // The MCP bridge starts the app (hidden) through this path when an AI
    // app calls while DigiClip is closed.
    if let Some(exe) = tray::app_exe() {
        std_cmd.env("DIGICLIP_APP_EXE", exe);
    }
    if let Some(dir) = std::env::var_os("DIGICLIP_DATA_DIR").filter(|d| !d.is_empty()) {
        std_cmd.arg("--data-dir").arg(dir);
    }
    std_cmd
        .stdout(Stdio::piped())
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
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow::anyhow!("no sidecar stdout"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| anyhow::anyhow!("no sidecar stderr"))?;
    // Held in the shell state from the start, so `stop_engine` can kill an
    // engine that is still starting. The epoch is checked under the same
    // lock `stop_engine` kills under: a stop that came first leaves this
    // child unstored (killed here); one that comes later finds it.
    let unstored = {
        let state: State<ShellState> = app.state();
        let mut slot = state.child.lock().unwrap();
        if state.epoch.load(Ordering::SeqCst) != epoch {
            Some(child)
        } else {
            if let Some((_, mut old)) = slot.replace((epoch, child)) {
                let _ = old.start_kill();
            }
            None
        }
    };
    if let Some(mut child) = unstored {
        let _ = child.start_kill();
        let _ = tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await;
        anyhow::bail!("the engine was stopped");
    }

    // Both pipes are drained for the child's whole life, from the moment it
    // starts: a piped child that fills a pipe nobody reads blocks forever,
    // and one whose reader goes away dies on its next write (Windows: os
    // error 232), which kills jobs and eats their real error output. The
    // last lines of each are kept for the failure message, and shown in
    // this shell's log.
    let tail = Arc::new(Mutex::new(Tail::default()));
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Ev>();
    {
        let tail = tail.clone();
        tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let mut lines = BufReader::new(stdout).lines();
            let mut seen = false;
            while let Ok(Some(l)) = lines.next_line().await {
                if !seen && l.starts_with("DIGICLIP_SERVE") {
                    // The banner carries the token: not logged, not kept.
                    seen = true;
                    let _ = tx.send(Ev::Banner);
                    continue;
                }
                eprintln!("[sidecar] {l}");
                if let Ok(mut t) = tail.lock() {
                    push_line(&mut t.out, &l);
                }
            }
            let _ = tx.send(Ev::Eof);
        });
    }
    let err_task = {
        let tail = tail.clone();
        tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                eprintln!("[sidecar] {l}");
                if let Ok(mut t) = tail.lock() {
                    push_line(&mut t.err, &l);
                }
            }
        })
    };

    // Wait for the banner (bounded: a missing banner means a failed start).
    let failure = match tokio::time::timeout(BOOT_WAIT, rx.recv()).await {
        Ok(Some(Ev::Banner)) => None,
        Ok(Some(Ev::Eof)) | Ok(None) => {
            // Let stderr finish: its last lines are the explanation.
            let _ = tokio::time::timeout(std::time::Duration::from_secs(1), err_task).await;
            Some(with_tail("the engine exited before it was ready", &tail))
        }
        Err(_) => Some(with_tail(
            &format!(
                "the engine did not report ready within {} seconds",
                BOOT_WAIT.as_secs()
            ),
            &tail,
        )),
    };
    if let Some(msg) = failure {
        reap_child(app, epoch).await;
        anyhow::bail!(msg);
    }
    if stopped_since(app, epoch) {
        // A stop during the start: this boot's engine does not outlive it.
        reap_child(app, epoch).await;
        anyhow::bail!("the engine was stopped");
    }
    eprintln!("[shell] serve ready on port {port}");
    Ok(ServeInfo { port, token })
}

/// Claim the right to start a boot. False when one is already running
/// (the caller joins it: the page follows `boot_status`) or the engine is
/// already up. Never two boots at once, so never two engines.
fn begin_boot(app: &AppHandle) -> bool {
    let state: State<ShellState> = app.state();
    let mut boot = state.boot.lock().unwrap();
    match *boot {
        Boot::Booting | Boot::Ready(_) => false,
        Boot::Idle | Boot::Failed(_) => {
            *boot = Boot::Booting;
            true
        }
    }
}

/// The error card's Retry: like `begin_boot`, and also when the state says
/// the engine is ready but its process is gone (it died after its banner,
/// or the page could not reach it): that counts as a failed boot. A live
/// engine is never replaced, however slow it is to answer.
fn begin_retry(app: &AppHandle) -> bool {
    let state: State<ShellState> = app.state();
    let mut boot = state.boot.lock().unwrap();
    match *boot {
        Boot::Booting => false,
        Boot::Ready(_) if engine_alive(&state) => false,
        Boot::Idle | Boot::Failed(_) | Boot::Ready(_) => {
            *boot = Boot::Booting;
            true
        }
    }
}

/// Run a boot that `begin_boot` granted: up to `attempts` starts, then
/// publish the outcome (state first, event second) and return it. A failed
/// start leaves no child and no serve info behind.
async fn run_boot(app: &AppHandle, attempts: u32) -> Result<ServeInfo, String> {
    let epoch = {
        let state: State<ShellState> = app.state();
        state.epoch.load(Ordering::SeqCst)
    };
    let mut result: Result<ServeInfo, String> = Err("engine not started".into());
    for attempt in 1..=attempts.max(1) {
        result = boot_once(app, epoch).await.map_err(|e| e.to_string());
        match &result {
            Ok(_) => break,
            Err(e) => eprintln!("[shell] boot attempt {attempt} failed: {e}"),
        }
        if stopped_since(app, epoch) {
            break;
        }
    }
    if stopped_since(app, epoch) {
        // The app is shutting down: nothing left to publish.
        return Err("the engine was stopped".into());
    }
    let state: State<ShellState> = app.state();
    match &result {
        Ok(info) => {
            *state.boot.lock().unwrap() = Boot::Ready(info.clone());
            eprintln!("[shell] emitting serve-ready");
            let _ = app.emit("digiclip:serve-ready", info);
        }
        Err(e) => {
            *state.boot.lock().unwrap() = Boot::Failed(e.clone());
            eprintln!("[shell] boot failed: {e}");
            let _ = app.emit("digiclip:serve-failed", e.clone());
        }
    }
    result
}

/// Kill the sidecar now. `kill_on_drop` only fires if the whole runtime
/// unwinds cleanly — a window close short-circuits that, which is how the
/// engine used to survive as an orphan holding `resources\digiclip.exe`
/// and breaking the next install ("Error opening file for writing").
/// Also ends a boot that is still running (it publishes nothing).
pub(crate) fn stop_engine(app: &AppHandle) {
    if let Some(state) = app.try_state::<ShellState>() {
        state.epoch.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut slot) = state.child.lock() {
            if let Some((_, child)) = slot.as_mut() {
                let _ = child.start_kill();
            }
            *slot = None;
        }
        let _ = state.boot.lock().map(|mut b| *b = Boot::Idle);
    }
}

#[derive(serde::Serialize)]
struct BootStatus {
    /// `booting`, `ready` or `failed`.
    state: &'static str,
    /// Why it failed (what the engine wrote), when it did.
    message: Option<String>,
    port: Option<u16>,
    token: Option<String>,
}

/// Where the engine boot stands. The page asks this instead of guessing:
/// it stays on its boot screen while this says `booting` and shows the
/// failure as soon as it says `failed`.
#[tauri::command]
fn boot_status(state: State<ShellState>) -> BootStatus {
    match &*state.boot.lock().unwrap() {
        Boot::Idle | Boot::Booting => BootStatus {
            state: "booting",
            message: None,
            port: None,
            token: None,
        },
        Boot::Ready(info) => BootStatus {
            state: "ready",
            message: None,
            port: Some(info.port),
            token: Some(info.token.clone()),
        },
        Boot::Failed(msg) => BootStatus {
            state: "failed",
            message: Some(msg.clone()),
            port: None,
            token: None,
        },
    }
}

/// The error card's Retry: start a new boot after a failed one. A boot
/// already running is joined, a live engine is left alone; an engine that
/// is "ready" but dead is started again. The state is `booting` before this
/// returns, so the page's next `boot_status` already shows it.
#[tauri::command]
fn retry_boot(app: AppHandle) {
    if begin_retry(&app) {
        tauri::async_runtime::spawn(async move {
            let _ = run_boot(&app, 1).await;
        });
    }
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

/// The main window is placed once, the first time it is shown (at launch,
/// or from the tray after a `--hidden` start). Later shows keep wherever
/// the user moved it.
static PLACED: AtomicBool = AtomicBool::new(false);

/// Size and centre the main window on the monitor under the pointer (the
/// one the user just launched from), inside that monitor's work area so
/// it never tucks under the taskbar or straddles two screens. 1280x800
/// when it fits, otherwise 92% of the work area, never below the minimum.
pub(crate) fn place_main_once(win: &tauri::WebviewWindow) {
    if PLACED.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = win.app_handle();
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .or_else(|| win.current_monitor().ok().flatten());
    let Some(m) = monitor else {
        let _ = win.center();
        return;
    };
    let area = *m.work_area();
    let scale = m.scale_factor();
    let (aw, ah) = (area.size.width as f64, area.size.height as f64);
    let fit = |want: f64, min: f64, avail: f64| {
        (want * scale)
            .min(avail * 0.92)
            .max((min * scale).min(avail))
            .round()
    };
    let (w, h) = (fit(1280.0, 1024.0, aw), fit(800.0, 640.0, ah));
    let x = area.position.x + ((aw - w) / 2.0).round() as i32;
    let y = area.position.y + ((ah - h) / 2.0).round() as i32;
    // Move first so a DPI change between monitors has already happened
    // when the size lands, then settle the position for the final size.
    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
    let _ = win.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
}

/// WebKitGTK renders pages in a separate process; if that process dies
/// (e.g. a media pipeline crash) the window just goes white. Reload
/// instead — the engine holds all state, so the UI reconnects to exactly
/// where it was. Capped at 3 reloads a minute so a crash loop can't spin.
#[cfg(target_os = "linux")]
fn reload_on_web_process_crash(win: &tauri::WebviewWindow) {
    let _ = win.with_webview(|wv| {
        use webkit2gtk::WebViewExt;
        let recent = std::cell::RefCell::new(Vec::<std::time::Instant>::new());
        wv.inner()
            .connect_web_process_terminated(move |view, reason| {
                let now = std::time::Instant::now();
                let mut recent = recent.borrow_mut();
                recent.retain(|t| now.duration_since(*t).as_secs() < 60);
                if recent.len() >= 3 {
                    eprintln!("[shell] web process terminated ({reason:?}) again — not reloading");
                    return;
                }
                recent.push(now);
                eprintln!("[shell] web process terminated ({reason:?}) — reloading");
                view.reload();
            });
    });
}

fn main() {
    let app = tauri::Builder::default()
        // First: a second launch (start menu) just brings the running app
        // forward.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A hidden start (sign-in entry, the MCP bridge waking the app)
            // must not pop the window of the running one.
            if !args.iter().any(|a| a == tray::HIDDEN_ARG) {
                tray::show_main(app, None);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ShellState::default())
        .manage(tray::TrayState::default())
        .setup(|app| {
            let hidden = tray::setup(app.handle());
            // Created hidden (tauri.conf `visible: false`) and shown once it
            // is fully undecorated: mapped straight away, GNOME briefly
            // framed it with a title bar, and window-effect extensions
            // (e.g. Blur my Shell) kept that frame's offset. Started at
            // sign-in (`--hidden`) it stays in the tray.
            if let Some(win) = app.get_webview_window("main") {
                if !hidden {
                    place_main_once(&win);
                    let _ = win.show();
                }
                #[cfg(target_os = "linux")]
                reload_on_web_process_crash(&win);
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Up to two starts before the page is told anything; the
                // outcome (state + event) is published by `run_boot`.
                let booted = if begin_boot(&handle) {
                    run_boot(&handle, AUTO_ATTEMPTS).await
                } else {
                    Err("the engine is already starting".to_string())
                };
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
            if win.label() == tray::MENU {
                tray::menu_window_event(win, ev);
                return;
            }
            if win.label() != "main" {
                return;
            }
            // Keep the shell's rounded/fused look in sync with maximize.
            if matches!(
                ev,
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }
            ) {
                if let Ok(maxed) = win.is_maximized() {
                    let _ = win.emit("digiclip:maximized", maxed);
                }
            }
            match ev {
                // The X (or alt-F4): with the tray on, the app keeps running
                // — engine, queue and watch folder included — until Quit.
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let app = win.app_handle();
                    if tray::keeps_running(app) {
                        api.prevent_close();
                        let _ = win.hide();
                    } else {
                        tray::quit(app);
                    }
                }
                tauri::WindowEvent::Destroyed => stop_engine(win.app_handle()),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            boot_status,
            retry_boot,
            check_update,
            download_setup,
            run_setup,
            window_action,
            is_maximized,
            drag_window,
            reveal,
            open_url,
            tray::shell_prefs,
            tray::set_close_to_tray,
            tray::set_autostart,
            tray::open_main,
            tray::hide_tray_menu,
            tray::tray_menu_size,
            tray::quit_app,
            tray::set_tray_text
        ])
        .build(tauri::generate_context!())
        .expect("tauri build");
    app.run(|app, ev| match ev {
        tauri::RunEvent::Exit => stop_engine(app),
        // macOS: clicking the Dock icon of the running app.
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => tray::show_main(app, None),
        _ => {}
    });
}
