//! Platform layer: paths, process management, hidden child processes.
//!
//! Windows: install dir + uninstall registry entry + shortcuts.
//! macOS:  /Applications/DigiClip.app (admin prompt when needed).
//! Linux:  ~/.local/opt/digiclip (AppImage) + .desktop + ~/.local/bin.

use std::path::{Path, PathBuf};

/// Hidden child processes on Windows (CREATE_NO_WINDOW). No-op elsewhere.
pub fn hidden<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd
}

pub fn home_dir() -> PathBuf {
    dirs_home().unwrap_or_else(|| PathBuf::from("."))
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

pub fn local_app_data() -> PathBuf {
    std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home_dir().join("AppData").join("Local"))
}

pub fn temp_dir() -> PathBuf {
    std::env::temp_dir()
}

pub const DISPLAY_NAME: &str = "DigiClip";
pub const PUBLISHER: &str = "n1ssyyy";
pub const UNINSTALL_KEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DigiClip";

/// Release asset suffix for this machine's app payload.
pub fn payload_suffix() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "_win-x64-app.zip"
    }
    #[cfg(target_os = "macos")]
    {
        "_mac-arm64-app.tar.gz"
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        "_linux-x86_64-app.tar.gz"
    }
}

/// Human label for the install location, used in the wizard copy.
pub fn install_location_label() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        r"%LOCALAPPDATA%\DigiClip"
    }
    #[cfg(target_os = "macos")]
    {
        "/Applications"
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        "~/.local/opt/digiclip"
    }
}

// ---------------------------------------------------------------------------
// Install location
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
fn windows_installed() -> Option<(Option<String>, Option<String>)> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hk = RegKey::predef(HKEY_CURRENT_USER);
    let k = hk.open_subkey(UNINSTALL_KEY).ok()?;
    let dir: String = k.get_value("InstallLocation").unwrap_or_default();
    let version: String = k.get_value("DisplayVersion").unwrap_or_default();
    Some((
        (!dir.is_empty()).then_some(dir),
        (!version.is_empty()).then_some(version),
    ))
}

#[cfg(target_os = "macos")]
fn mac_installed() -> Option<(Option<String>, Option<String>)> {
    let app = default_install_dir().join("DigiClip.app");
    if !app.is_dir() {
        return None;
    }
    let plist = app.join("Contents").join("Info.plist");
    let version = std::fs::read_to_string(&plist)
        .ok()
        .and_then(|t| {
            t.split("<key>CFBundleShortVersionString</key>")
                .nth(1)
                .and_then(|rest| rest.split('<').nth(1).map(|s| s.trim_end().to_string()))
        })
        .filter(|v| !v.is_empty());
    Some((Some(app.display().to_string()), version))
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn linux_installed() -> Option<(Option<String>, Option<String>)> {
    let dir = default_install_dir();
    let appimage = dir.join("DigiClip.AppImage");
    if !appimage.is_file() {
        return None;
    }
    let version = std::fs::read_to_string(dir.join(".digiclip-version"))
        .ok()
        .map(|v| v.trim().to_string());
    Some((
        Some(appimage.display().to_string()),
        version.filter(|v| !v.is_empty()),
    ))
}

/// (install location, version) when DigiClip is installed.
pub fn installed() -> Option<(Option<String>, Option<String>)> {
    #[cfg(target_os = "windows")]
    {
        windows_installed()
    }
    #[cfg(target_os = "macos")]
    {
        mac_installed()
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        linux_installed()
    }
}

pub fn default_install_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        local_app_data().join(DISPLAY_NAME)
    }
    #[cfg(target_os = "macos")]
    {
        PathBuf::from("/Applications")
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        home_dir().join(".local").join("opt").join("digiclip")
    }
}

pub fn resolve_install_dir() -> PathBuf {
    installed()
        .and_then(|(dir, _)| dir)
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .unwrap_or_else(default_install_dir)
}

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

const APP_IMAGES: &[&str] = &[
    "digiclip-app",
    "digiclip-app.exe",
    "digiclip.exe",
    "digiclip",
];

#[cfg(target_os = "windows")]
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

#[cfg(not(target_os = "windows"))]
fn pids_of(image: &str) -> Vec<u32> {
    let out = std::process::Command::new("pgrep")
        .args(["-x", image])
        .output();
    let Ok(out) = out else { return vec![] };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| l.trim().parse::<u32>().ok())
        .collect()
}

/// Is DigiClip (app or engine) running? A running app is what makes
/// installs fail with "Error opening file for writing" — every write path
/// goes through `stop_app` first.
pub fn app_running() -> bool {
    APP_IMAGES.iter().any(|i| !pids_of(i).is_empty())
}

/// Politely close, then force. Returns true once nothing is left.
pub fn stop_app() -> bool {
    for _ in 0..10 {
        let running: Vec<&str> = APP_IMAGES
            .iter()
            .copied()
            .filter(|i| !pids_of(i).is_empty())
            .collect();
        if running.is_empty() {
            return true;
        }
        for image in running {
            #[cfg(target_os = "windows")]
            {
                let _ = hidden("taskkill").args(["/F", "/IM", image]).status();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = std::process::Command::new("pkill")
                    .args(["-TERM", "-x", image])
                    .status();
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
    // Last resort: SIGKILL equivalents.
    for image in APP_IMAGES {
        #[cfg(target_os = "windows")]
        {
            let _ = hidden("taskkill").args(["/F", "/IM", image]).status();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = std::process::Command::new("pkill")
                .args(["-KILL", "-x", image])
                .status();
        }
    }
    std::thread::sleep(std::time::Duration::from_millis(500));
    !app_running()
}

/// Path of the installed app executable (or the AppImage on Linux).
pub fn installed_executable(install_dir: &Path) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let p = install_dir.join("digiclip-app.exe");
        p.is_file().then_some(p)
    }
    #[cfg(target_os = "macos")]
    {
        let p = install_dir.join("DigiClip.app");
        p.join("Contents")
            .join("MacOS")
            .join("digiclip-app")
            .is_file()
            .then_some(p)
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let p = install_dir.join("DigiClip.AppImage");
        p.is_file().then_some(p)
    }
}
