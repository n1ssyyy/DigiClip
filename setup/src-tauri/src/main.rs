//! DigiClip Setup: custom installer wizard.
//!
//! Detects the machine (installed version via the uninstall registry key),
//! fetches the latest release from GitHub, and drives the native NSIS
//! installer silently underneath a design-system UI: Install / Update /
//! Reinstall / Repair / Uninstall. Windows-only by design.

use std::path::PathBuf;

use tauri::{AppHandle, Emitter as _};

const OWNER_REPO: &str = "n1ssyyy/DigiClip";
const PRODUCT: &str = "DigiClip";
const APP_EXE: &str = "DigiClip.exe";

/// Hidden child processes: helper CLIs (tasklist/taskkill) must never flash
/// a console next to the wizard.
fn hidden<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallInfo {
    installed: bool,
    version: Option<String>,
    install_dir: Option<String>,
}

/// Read the NSIS uninstall entry (current-user first, then machine-wide).
/// Missing key = not installed. Never fails — worst case is `installed: false`.
#[tauri::command]
fn detect_install() -> InstallInfo {
    #[cfg(target_os = "windows")]
    {
        use winreg::RegKey;
        use winreg::enums::*;
        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            let hk = RegKey::predef(root);
            let Ok(un) = hk.open_subkey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall") else {
                continue;
            };
            for name in un.enum_keys().flatten() {
                let Ok(k) = un.open_subkey(&name) else { continue };
                let disp: String = k.get_value("DisplayName").unwrap_or_default();
                if disp != PRODUCT {
                    continue;
                }
                let version: String = k.get_value("DisplayVersion").unwrap_or_default();
                let dir: String = k.get_value("InstallLocation").unwrap_or_default();
                return InstallInfo {
                    installed: true,
                    version: if version.is_empty() { None } else { Some(version) },
                    install_dir: if dir.is_empty() { None } else { Some(dir) },
                };
            }
        }
    }
    InstallInfo { installed: false, version: None, install_dir: None }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LatestRelease {
    version: String,
    setup_url: String,
}

/// Latest GitHub release + its `*_x64-setup.exe` asset. Needs network —
/// errors (offline, API hiccup) surface as the wizard's offline state.
#[tauri::command]
async fn fetch_latest() -> Result<LatestRelease, String> {
    let client = reqwest::Client::builder()
        .user_agent("DigiClip-Setup")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let rel: serde_json::Value = client
        .get(format!("https://api.github.com/repos/{OWNER_REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let version = rel
        .get("tag_name")
        .and_then(|t| t.as_str())
        .unwrap_or_default()
        .trim_start_matches(['v', 'V'])
        .to_string();
    if version.is_empty() {
        return Err("Release has no version.".into());
    }
    let url = rel
        .get("assets")
        .and_then(|a| a.as_array())
        .map(|assets| {
            assets.iter().filter_map(|a| {
                let name = a.get("name")?.as_str()?;
                if name.ends_with("_x64-setup.exe") {
                    a.get("browser_download_url")?.as_str().map(str::to_string)
                } else {
                    None
                }
            }).next()
        })
        .flatten()
        .ok_or_else(|| "No Windows setup in the latest release.".to_string())?;
    Ok(LatestRelease { version, setup_url: url })
}

#[derive(Debug, Clone, serde::Serialize)]
struct DownloadProgress {
    done: u64,
    total: u64,
}

/// Stream the installer to temp with live progress (`setup:download`).
/// Resumable servers + a `.part` file survive a killed wizard.
#[tauri::command]
async fn download_setup(app: AppHandle, url: String) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("Refusing non-https download.".into());
    }
    let dest = std::env::temp_dir().join("DigiClip-Setup-latest.exe");
    let part = dest.with_extension("exe.part");
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
    tokio::fs::rename(&part, &dest).await.map_err(|e| e.to_string())?;
    Ok(dest.display().to_string())
}

#[derive(Debug, Clone, serde::Serialize)]
struct Exit {
    code: i32,
}

/// Run the downloaded NSIS installer silently (`/S`). No progress comes
/// back from a silent NSIS run — the wizard shows indeterminate motion.
#[tauri::command]
fn install_silent(path: String) -> Result<Exit, String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err("Installer file not found.".into());
    }
    let status = hidden(&p).arg("/S").status().map_err(|e| e.to_string())?;
    Ok(Exit { code: status.code().unwrap_or(-1) })
}

fn uninstall_exe() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        use winreg::RegKey;
        use winreg::enums::*;
        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            let hk = RegKey::predef(root);
            let Ok(un) = hk.open_subkey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall") else {
                continue;
            };
            for name in un.enum_keys().flatten() {
                let Ok(k) = un.open_subkey(&name) else { continue };
                let disp: String = k.get_value("DisplayName").unwrap_or_default();
                if disp != PRODUCT {
                    continue;
                }
                let raw: String = k.get_value("UninstallString").unwrap_or_default();
                // `"C:\...\uninstall.exe"` — strip quotes, drop any args.
                let exe = raw.trim().trim_matches('"');
                let exe = exe.split("\" ").next().unwrap_or(exe);
                let p = PathBuf::from(exe);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    None
}

/// Run the registered uninstaller silently (`/S`, hidden console).
#[tauri::command]
fn uninstall_silent() -> Result<Exit, String> {
    let exe = uninstall_exe().ok_or_else(|| "No registered uninstaller found.".to_string())?;
    let status = hidden(&exe).arg("/S").status().map_err(|e| e.to_string())?;
    Ok(Exit { code: status.code().unwrap_or(-1) })
}

fn installed_exe() -> Option<PathBuf> {
    let info = detect_install();
    if !info.installed {
        return None;
    }
    if let Some(dir) = info.install_dir {
        let p = PathBuf::from(dir).join(APP_EXE);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

/// Launch the installed app (detached) — the wizard's goodbye.
#[tauri::command]
fn launch_app() -> Result<(), String> {
    let exe = installed_exe().ok_or_else(|| "DigiClip is not installed.".to_string())?;
    hidden(exe).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Is DigiClip.exe currently running? Silent installers fail on locked
/// files, so the wizard asks before replacing them.
#[tauri::command]
fn is_app_running() -> bool {
    #[cfg(target_os = "windows")]
    {
        let out = hidden("tasklist")
            .args(["/FI", "IMAGENAME eq DigiClip.exe", "/FO", "CSV", "/NH"])
            .output();
        return out.is_ok_and(|o| {
            o.status.success() && String::from_utf8_lossy(&o.stdout).contains("DigiClip.exe")
        });
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// Force-close the running app (only after the user explicitly agrees).
#[tauri::command]
fn close_app() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        hidden("taskkill")
            .args(["/F", "/IM", "DigiClip.exe"])
            .output()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// External links (the by-hand installer fallback) leave the wizard via
/// the OS browser — never a webview child window.
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
    #[cfg(not(target_os = "windows"))]
    {
        let _ = url;
        Err("unsupported platform".into())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            detect_install,
            fetch_latest,
            download_setup,
            install_silent,
            uninstall_silent,
            launch_app,
            is_app_running,
            close_app,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("setup run");
}
