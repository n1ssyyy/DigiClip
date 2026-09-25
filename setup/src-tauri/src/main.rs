//! DigiClip Setup — the custom installer.
//!
//! From scratch: no NSIS/MSI involvement. The wizard downloads the signed
//! app payload from the GitHub release, lays it into the install
//! directory, registers an uninstall entry in the per-user registry, and
//! creates Start Menu + desktop shortcuts. Uninstall (from here or from
//! Add/Remove Programs) runs the same binary with `--uninstall`.

use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, Emitter as _};

const OWNER_REPO: &str = "n1ssyyy/DigiClip";
const RELEASES_URL: &str = "https://github.com/n1ssyyy/DigiClip/releases";
const SETUP_ASSET: &str = "DigiClip-Setup.exe";
const UNINSTALL_KEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DigiClip";
const DISPLAY_NAME: &str = "DigiClip";
const PUBLISHER: &str = "n1ssyyy";
const APP_EXE: &str = "digiclip-app.exe";
const ENGINE_EXE: &str = "digiclip.exe";

fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Hidden child processes: tasklist/taskkill/PowerShell helpers must never
/// flash a console next to the wizard.
fn hidden<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd
}

fn local_app_data() -> PathBuf {
    std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn default_install_dir() -> PathBuf {
    local_app_data().join(DISPLAY_NAME)
}

fn temp_dir() -> PathBuf {
    std::env::temp_dir()
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

struct InstallInfo {
    installed: bool,
    version: Option<String>,
    install_dir: Option<String>,
}

fn read_install_info() -> InstallInfo {
    use winreg::enums::*;
    use winreg::RegKey;
    let hk = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(k) = hk.open_subkey(UNINSTALL_KEY) else {
        return InstallInfo {
            installed: false,
            version: None,
            install_dir: None,
        };
    };
    let dir: String = k.get_value("InstallLocation").unwrap_or_default();
    let version: String = k.get_value("DisplayVersion").unwrap_or_default();
    InstallInfo {
        installed: true,
        version: (!version.is_empty()).then_some(version),
        install_dir: (!dir.is_empty()).then_some(dir),
    }
}

fn write_uninstall_entry(
    version: &str,
    install_dir: &Path,
    setup_exe: &Path,
) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hk = RegKey::predef(HKEY_CURRENT_USER);
    let (k, _) = hk
        .create_subkey(UNINSTALL_KEY)
        .map_err(|e| format!("registry create: {e}"))?;
    k.set_value("DisplayName", &DISPLAY_NAME)
        .map_err(|e| e.to_string())?;
    k.set_value("DisplayVersion", &version)
        .map_err(|e| e.to_string())?;
    k.set_value("Publisher", &PUBLISHER)
        .map_err(|e| e.to_string())?;
    k.set_value("InstallLocation", &install_dir.display().to_string())
        .map_err(|e| e.to_string())?;
    k.set_value(
        "DisplayIcon",
        &format!("{},0", install_dir.join(APP_EXE).display()),
    )
    .map_err(|e| e.to_string())?;
    k.set_value("NoModify", &1u32).map_err(|e| e.to_string())?;
    k.set_value("NoRepair", &1u32).map_err(|e| e.to_string())?;
    k.set_value("EstimatedSize", &350u32)
        .map_err(|e| e.to_string())?;
    // Both use this same binary, so "Uninstall program" in Windows always
    // lands on the custom UI.
    let setup = format!("\"{}\"", setup_exe.display());
    k.set_value("UninstallString", &format!("{setup} --uninstall"))
        .map_err(|e| e.to_string())?;
    k.set_value(
        "QuietUninstallString",
        &format!("{setup} --uninstall --quiet"),
    )
    .map_err(|e| e.to_string())?;
    k.set_value("URLInfoAbout", &RELEASES_URL.to_string())
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_uninstall_entry() {
    use winreg::enums::*;
    use winreg::RegKey;
    let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey(UNINSTALL_KEY);
}

// ---------------------------------------------------------------------------
// Install location
// ---------------------------------------------------------------------------

fn resolve_install_dir() -> PathBuf {
    let info = read_install_info();
    info.install_dir
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .unwrap_or_else(default_install_dir)
}

#[cfg(target_os = "windows")]
fn write_install_location(install_dir: &Path) -> Result<(), String> {
    let path = std::fs::canonicalize(install_dir).map_err(|e| format!("{install_dir:?}: {e}"))?;
    let key = format!("SOFTWARE\\{PUBLISHER}\\{DISPLAY_NAME}");
    use winreg::enums::*;
    use winreg::RegKey;
    let (k, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(&key)
        .map_err(|e| format!("registry create: {e}"))?;
    k.set_value("InstallLocation", &path.display().to_string())
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn read_install_location() -> Option<PathBuf> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hk = RegKey::predef(HKEY_CURRENT_USER);
    let key = format!("SOFTWARE\\{PUBLISHER}\\{DISPLAY_NAME}");
    let k = hk.open_subkey(&key).ok()?;
    let dir: String = k.get_value("InstallLocation").ok()?;
    (!dir.is_empty()).then(|| PathBuf::from(dir))
}

// ---------------------------------------------------------------------------
// Latest release
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
    let payload_url = asset_url(&rel, "_win-x64-app.zip")
        .ok_or_else(|| format!("Release v{version} has no Windows app payload."))?;
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
        install_dir: resolve_install_dir().display().to_string(),
    })
}

// ---------------------------------------------------------------------------
// Process management (the running app + the engine hold files locked)
// ---------------------------------------------------------------------------

fn pids_of(image: &str) -> Vec<u32> {
    let out = hidden("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {image}"), "/FO", "CSV", "/NH"])
        .output();
    let Ok(out) = out else { return vec![] };
    if !out.status.success() {
        return vec![];
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| l.to_ascii_lowercase().contains(&image.to_ascii_lowercase()))
        .filter_map(|l| l.split(',').nth(1))
        .filter_map(|p| p.trim().parse::<u32>().ok())
        .collect()
}

/// Is DigiClip (app or engine) running? A running app is what makes
/// installs fail with "Error opening file for writing" — every path that
/// writes files must go through `stop_app` first.
#[tauri::command]
fn app_running() -> bool {
    !pids_of(APP_EXE).is_empty() || !pids_of(ENGINE_EXE).is_empty()
}

/// Politely close, then force. Returns true once nothing is left.
#[tauri::command]
fn stop_app() -> bool {
    for image in [ENGINE_EXE, APP_EXE] {
        if !pids_of(image).is_empty() {
            let _ = hidden("taskkill").args(["/IM", image]).status();
        }
    }
    // Give the OS a moment to release handles, then force anything left.
    for _ in 0..10 {
        std::thread::sleep(std::time::Duration::from_millis(250));
        let mut pids = pids_of(APP_EXE);
        if pids.is_empty() {
            // The engine may outlive the app briefly; take it too.
            pids = pids_of(ENGINE_EXE);
        }
        if pids.is_empty() {
            return true;
        }
        for image in [ENGINE_EXE, APP_EXE] {
            let _ = hidden("taskkill").args(["/F", "/IM", image]).status();
        }
    }
    !app_running()
}

// ---------------------------------------------------------------------------
// Download + extract + write
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    done: u64,
    total: u64,
}

/// Stream the app payload to temp with live progress (`setup:download`).
/// Resumable: a killed wizard continues where it stopped.
#[tauri::command]
async fn download_payload(app: AppHandle, url: String) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("Refusing non-https download.".into());
    }
    let dest = temp_dir().join("DigiClip-app-payload.zip");
    let part = dest.with_extension("zip.part");
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
    tokio::fs::rename(&part, &dest)
        .await
        .map_err(|e| e.to_string())?;
    Ok(dest.display().to_string())
}

/// Stage the payload into a temp folder, then lay it into the install dir
/// with retries (Windows holds handles for a beat after a process dies).
fn extract_and_write(zip_path: &Path, install_dir: &Path) -> Result<(), String> {
    let staging = temp_dir().join(format!("DigiClip-stage-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    {
        let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            // Zip-slip guard: nothing may escape the staging dir.
            let Some(rel) = entry.enclosed_name() else {
                return Err("Payload contains an unsafe path.".into());
            };
            let out = staging.join(&rel);
            if entry.is_dir() {
                std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
                continue;
            }
            if let Some(p) = out.parent() {
                std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut f).map_err(|e| e.to_string())?;
        }
    }
    std::fs::create_dir_all(install_dir).map_err(|e| e.to_string())?;
    // Copy staged files in, retrying while Windows releases locks.
    let mut last_err = String::new();
    for attempt in 0..12 {
        last_err.clear();
        copy_tree(&staging, install_dir, &mut last_err);
        if last_err.is_empty() {
            let _ = std::fs::remove_dir_all(&staging);
            return Ok(());
        }
        let _ = hidden("taskkill").args(["/F", "/IM", APP_EXE]).status();
        let _ = hidden("taskkill").args(["/F", "/IM", ENGINE_EXE]).status();
        std::thread::sleep(std::time::Duration::from_millis(400 * (attempt + 1)));
    }
    let _ = std::fs::remove_dir_all(&staging);
    Err(format!("Could not write some files: {last_err}"))
}

fn copy_tree(from: &Path, to: &Path, err: &mut String) {
    let Ok(entries) = std::fs::read_dir(from) else {
        return;
    };
    for e in entries.flatten() {
        let src = e.path();
        let dst = to.join(e.file_name());
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            let _ = std::fs::create_dir_all(&dst);
            copy_tree(&src, &dst, err);
        } else {
            if dst.is_file() {
                // Unchanged files keep their mtime (fast repair path).
                if let (Ok(a), Ok(b)) = (std::fs::metadata(&src), std::fs::metadata(&dst)) {
                    if a.len() == b.len() && a.modified().ok() == b.modified().ok() {
                        continue;
                    }
                }
            }
            if let Ok(meta) = std::fs::metadata(&dst) {
                let mut perms = meta.permissions();
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(&dst, perms);
            }
            if let Err(e) = std::fs::copy(&src, &dst) {
                err.push_str(&format!("{}: {e}; ", dst.display()));
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

fn create_shortcuts(install_dir: &Path) -> Result<(), String> {
    let app = install_dir.join(APP_EXE);
    let programs = PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into()))
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs");
    let start_link = programs.join("DigiClip.lnk");
    let desktop_link = local_app_data()
        .join("..")
        .join("Desktop")
        .join("DigiClip.lnk");
    let script = format!(
        "$s = (New-Object -ComObject WScript.Shell); \
         $l = $s.CreateShortcut('{}'); $l.TargetPath = '{}'; $l.Save(); \
         $d = $s.CreateShortcut('{}'); $d.TargetPath = '{}'; $d.Save();",
        start_link.display(),
        app.display(),
        desktop_link.display(),
        app.display(),
    );
    let out = hidden("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|e| format!("shortcuts: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "shortcuts: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

fn remove_shortcuts() {
    let programs = PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into()))
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs");
    let _ = std::fs::remove_file(programs.join("DigiClip.lnk"));
    let _ = std::fs::remove_file(
        local_app_data()
            .join("..")
            .join("Desktop")
            .join("DigiClip.lnk"),
    );
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
    app_running: bool,
    setup_version: String,
}

#[tauri::command]
fn detect() -> DetectInfo {
    let info = read_install_info();
    let dir = read_install_location()
        .filter(|p| p.is_dir())
        .or_else(|| info.install_dir.clone().map(PathBuf::from))
        .unwrap_or_else(default_install_dir);
    DetectInfo {
        installed: info.installed,
        version: info.version,
        install_dir: dir.display().to_string(),
        app_running: app_running(),
        setup_version: app_version().to_string(),
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallResult {
    version: String,
    install_dir: String,
}

fn do_install(payload: &Path, version: &str, install_dir: &Path) -> Result<InstallResult, String> {
    if !stop_app() {
        return Err("DigiClip (or its engine) is still running — close it and retry.".into());
    }
    extract_and_write(payload, install_dir)?;
    let exe = install_dir.join(APP_EXE);
    if !exe.is_file() {
        return Err(format!("Payload did not contain {APP_EXE}."));
    }
    let setup_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    write_uninstall_entry(version, install_dir, &setup_exe)?;
    write_install_location(install_dir)?;
    create_shortcuts(install_dir)?;
    Ok(InstallResult {
        version: version.to_string(),
        install_dir: install_dir.display().to_string(),
    })
}

/// Full flow: stop the app, download the app payload, extract it into
/// `install_dir` (default: the current/standard location), register.
#[tauri::command]
async fn install(
    app: AppHandle,
    install_dir: Option<String>,
    version: Option<String>,
) -> Result<InstallResult, String> {
    let target = install_dir
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(resolve_install_dir);
    let rel = github_latest().await?;
    let ver = version.unwrap_or_else(|| {
        rel.get("tag_name")
            .and_then(|t| t.as_str())
            .unwrap_or_default()
            .trim_start_matches(['v', 'V'])
            .to_string()
    });
    let url = asset_url(&rel, "_win-x64-app.zip")
        .ok_or_else(|| "Release has no Windows app payload.".to_string())?;
    let payload = download_payload(app, url).await?;
    do_install(Path::new(&payload), &ver, &target)
}

#[tauri::command]
fn launch_app(install_dir: Option<String>) -> Result<(), String> {
    let dir = install_dir
        .map(PathBuf::from)
        .unwrap_or_else(resolve_install_dir);
    let exe = dir.join(APP_EXE);
    if !exe.is_file() {
        return Err("DigiClip is not installed.".into());
    }
    hidden(exe).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Remove the install. Runs detached from a temp copy of this binary when
/// invoked as `--uninstall` (Add/Remove Programs) or from the wizard.
fn uninstall_impl(quiet: bool) -> Result<(), String> {
    let dir = resolve_install_dir();
    let _ = stop_app();
    if !quiet {
        eprintln!("[setup] removing {}", dir.display());
    }
    // Delete after a grace period: this process may live inside the tree.
    let target = dir.display().to_string();
    let script = format!(
        "Start-Sleep -Milliseconds 800; \
         $d = '{target}'; \
         Get-Process digiclip, digiclip-app, digiclip-setup -ErrorAction SilentlyContinue | \
           Where-Object {{ $_.Path -like ($d + '*') }} | \
           Stop-Process -Force -ErrorAction SilentlyContinue; \
         Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue"
    );
    let _ = hidden("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &script,
        ])
        .spawn();
    remove_shortcuts();
    remove_uninstall_entry();
    // Drop the "where was I installed" key too.
    use winreg::enums::*;
    use winreg::RegKey;
    let _ = RegKey::predef(HKEY_CURRENT_USER)
        .delete_subkey(&format!("SOFTWARE\\{PUBLISHER}\\{DISPLAY_NAME}"));
    Ok(())
}

#[tauri::command]
fn uninstall() -> Result<(), String> {
    uninstall_impl(false)
}

/// Open an http(s) URL in the OS browser — never a webview child window.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("only http(s) urls".into());
    }
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", "start", "", &url]);
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let quiet = args.iter().any(|a| a == "--quiet");
    // Detached worker (already copied to temp): do the removal, never respawn.
    if args.iter().any(|a| a == "--do-uninstall") {
        let _ = uninstall_impl(quiet);
        return;
    }
    // Registered uninstall path (from Add/Remove Programs): copy ourselves
    // to temp so the real tree can be deleted while we run.
    if args.iter().any(|a| a == "--uninstall") {
        if let Ok(exe) = std::env::current_exe() {
            let temp_copy = temp_dir().join("DigiClip-Setup-uninstaller.exe");
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
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("setup run");
}
