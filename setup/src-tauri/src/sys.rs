//! Platform layer: paths, process management, hidden child processes.
//!
//! Windows: install dir + uninstall registry entry + shortcuts.
//! macOS:  /Applications/DigiClip.app (admin prompt when needed).
//! Linux:  ~/.local/opt/digiclip/app (the AppImage, unpacked — runs
//!         without FUSE) + .desktop entry.

use std::path::{Path, PathBuf};

/// Hidden child processes on Windows (CREATE_NO_WINDOW). No-op elsewhere.
pub fn hidden<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd
}

pub fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

#[cfg(target_os = "windows")]
pub fn local_app_data() -> PathBuf {
    std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home_dir().join("AppData").join("Local"))
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
pub fn temp_dir() -> PathBuf {
    std::env::temp_dir()
}

#[cfg(target_os = "windows")]
pub const DISPLAY_NAME: &str = "DigiClip";
#[cfg(target_os = "windows")]
pub const PUBLISHER: &str = "n1ssyyy";
#[cfg(target_os = "windows")]
pub const UNINSTALL_KEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DigiClip";

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

/// Only Windows installs are relocatable: macOS apps belong in
/// /Applications and the Linux layout (desktop entry, detection) is fixed.
pub fn can_choose_dir() -> bool {
    cfg!(target_os = "windows")
}

/// Where a user-picked folder actually installs. Picking `D:\Apps` means
/// `D:\Apps\DigiClip` — never the picked folder itself, because uninstall
/// removes the whole install dir.
pub fn install_dir_for(chosen: Option<&Path>) -> PathBuf {
    let Some(chosen) = chosen.filter(|p| !p.as_os_str().is_empty()) else {
        return resolve_install_dir();
    };
    if !can_choose_dir() {
        return resolve_install_dir();
    }
    let named = chosen
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.eq_ignore_ascii_case("DigiClip"));
    if named {
        chosen.to_path_buf()
    } else {
        chosen.join("DigiClip")
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
                .and_then(|rest| rest.split('<').nth(1))
                .and_then(|s| s.split('>').nth(1))
                .map(|s| s.trim().to_string())
        })
        .filter(|v| !v.is_empty());
    // The install *dir* is /Applications; the bundle is inside it.
    Some((Some(default_install_dir().display().to_string()), version))
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn linux_installed() -> Option<(Option<String>, Option<String>)> {
    let dir = default_install_dir();
    if installed_executable(&dir).is_none() && !dir.join("DigiClip.AppImage").is_file() {
        return None;
    }
    let version = std::fs::read_to_string(dir.join(".digiclip-version"))
        .ok()
        .map(|v| v.trim().to_string());
    Some((
        Some(dir.display().to_string()),
        version.filter(|v| !v.is_empty()),
    ))
}

/// (install dir, version) when DigiClip is installed.
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

/// What counts as "DigiClip is running". The engine is matched by its
/// bundled location on macOS/Linux so a standalone `digiclip` CLI the user
/// runs from a terminal is never killed by an install.
enum Proc {
    /// Process image / comm name.
    Image(&'static str),
    /// Substring of the full command line (unix `pgrep -f`).
    #[cfg_attr(target_os = "windows", allow(dead_code))]
    Cmdline(&'static str),
}

#[cfg(target_os = "windows")]
const APP_PROCS: &[Proc] = &[Proc::Image("digiclip-app.exe"), Proc::Image("digiclip.exe")];
#[cfg(not(target_os = "windows"))]
const APP_PROCS: &[Proc] = &[
    Proc::Image("digiclip-app"),
    // macOS: …/DigiClip.app/Contents/Resources/resources/digiclip --serve
    // Linux: …/app/usr/lib/DigiClip/resources/digiclip --serve
    Proc::Cmdline("resources/digiclip --serve"),
];

#[cfg(target_os = "windows")]
fn is_running(p: &Proc) -> bool {
    let (Proc::Image(image) | Proc::Cmdline(image)) = p;
    let out = hidden("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {image}"), "/FO", "CSV", "/NH"])
        .output();
    let Ok(out) = out else { return false };
    out.status.success()
        && String::from_utf8_lossy(&out.stdout)
            .to_ascii_lowercase()
            .contains(&format!("\"{}\"", image.to_ascii_lowercase()))
}

#[cfg(not(target_os = "windows"))]
fn pgrep_args(p: &Proc) -> [&str; 2] {
    match p {
        Proc::Image(name) => ["-x", name],
        Proc::Cmdline(pat) => ["-f", pat],
    }
}

#[cfg(not(target_os = "windows"))]
fn is_running(p: &Proc) -> bool {
    std::process::Command::new("pgrep")
        .args(pgrep_args(p))
        .output()
        .map(|o| o.status.success() && !o.stdout.is_empty())
        .unwrap_or(false)
}

fn kill(p: &Proc, force: bool) {
    #[cfg(target_os = "windows")]
    {
        let _ = force;
        let (Proc::Image(image) | Proc::Cmdline(image)) = p;
        let _ = hidden("taskkill").args(["/F", "/IM", image]).status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let [mode, pat] = pgrep_args(p);
        let sig = if force { "-KILL" } else { "-TERM" };
        let _ = std::process::Command::new("pkill")
            .args([sig, mode, pat])
            .status();
    }
}

/// Is DigiClip (app or engine) running? A running app is what makes
/// installs fail with "Error opening file for writing" — every write path
/// goes through `stop_app` first.
pub fn app_running() -> bool {
    APP_PROCS.iter().any(is_running)
}

/// Politely close, then force. Returns true once nothing is left.
pub fn stop_app() -> bool {
    for _ in 0..10 {
        let running: Vec<&Proc> = APP_PROCS.iter().filter(|p| is_running(p)).collect();
        if running.is_empty() {
            return true;
        }
        for p in running {
            kill(p, false);
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
    for p in APP_PROCS {
        kill(p, true);
    }
    std::thread::sleep(std::time::Duration::from_millis(500));
    !app_running()
}

/// What to launch for the installed app: the exe (Windows), the bundle
/// (macOS, opened through LaunchServices) or the unpacked AppImage's
/// `AppRun` (Linux).
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
        let p = install_dir.join("app").join("AppRun");
        p.exists().then_some(p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picked_folder_gets_a_digiclip_subdir() {
        if !can_choose_dir() {
            // Fixed layout: any pick resolves to the platform default.
            assert_eq!(
                install_dir_for(Some(Path::new("/tmp/elsewhere"))),
                resolve_install_dir()
            );
            return;
        }
        assert_eq!(
            install_dir_for(Some(Path::new(r"D:\Apps"))),
            Path::new(r"D:\Apps").join("DigiClip")
        );
        assert_eq!(
            install_dir_for(Some(Path::new(r"D:\Apps\digiclip"))),
            Path::new(r"D:\Apps\digiclip")
        );
    }
}
