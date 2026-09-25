//! Laying the app payload down (and removing it again), per platform.
//!
//! Windows: unzip into the install dir, register an uninstall entry,
//! create Start Menu + desktop shortcuts.
//! macOS:  copy DigiClip.app into /Applications with `ditto` (preserves
//!         the bundle's symlinks), admin prompt when not writable.
//! Linux:  extract the AppImage to ~/.local/opt/digiclip, write a
//!         .desktop entry + icon, symlink into ~/.local/bin.

use std::path::{Path, PathBuf};

use crate::sys;

#[cfg(target_os = "windows")]
pub fn register(version: &str, install_dir: &Path) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let setup_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let hk = RegKey::predef(HKEY_CURRENT_USER);
    let (k, _) = hk
        .create_subkey(sys::UNINSTALL_KEY)
        .map_err(|e| format!("registry create: {e}"))?;
    k.set_value("DisplayName", &sys::DISPLAY_NAME)
        .map_err(|e| e.to_string())?;
    k.set_value("DisplayVersion", &version)
        .map_err(|e| e.to_string())?;
    k.set_value("Publisher", &sys::PUBLISHER)
        .map_err(|e| e.to_string())?;
    k.set_value("InstallLocation", &install_dir.display().to_string())
        .map_err(|e| e.to_string())?;
    k.set_value(
        "DisplayIcon",
        &format!("{},0", install_dir.join("digiclip-app.exe").display()),
    )
    .map_err(|e| e.to_string())?;
    k.set_value("NoModify", &1u32).map_err(|e| e.to_string())?;
    k.set_value("NoRepair", &1u32).map_err(|e| e.to_string())?;
    k.set_value("EstimatedSize", &350u32)
        .map_err(|e| e.to_string())?;
    let setup = format!("\"{}\"", setup_exe.display());
    k.set_value("UninstallString", &format!("{setup} --uninstall"))
        .map_err(|e| e.to_string())?;
    k.set_value(
        "QuietUninstallString",
        &format!("{setup} --uninstall --quiet"),
    )
    .map_err(|e| e.to_string())?;
    k.set_value(
        "URLInfoAbout",
        &"https://github.com/n1ssyyy/DigiClip/releases".to_string(),
    )
    .map_err(|e| e.to_string())?;
    let key = format!("SOFTWARE\\{}\\{}", sys::PUBLISHER, sys::DISPLAY_NAME);
    let (loc, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(&key)
        .map_err(|e| format!("registry create: {e}"))?;
    loc.set_value("InstallLocation", &install_dir.display().to_string())
        .map_err(|e| e.to_string())?;
    create_shortcuts(install_dir)
}

#[cfg(target_os = "windows")]
fn start_menu_dir() -> PathBuf {
    PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into()))
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
}

#[cfg(target_os = "windows")]
pub fn create_shortcuts(install_dir: &Path) -> Result<(), String> {
    let app = install_dir.join("digiclip-app.exe");
    let start_link = start_menu_dir().join("DigiClip.lnk");
    let desktop_link = sys::home_dir().join("Desktop").join("DigiClip.lnk");
    let _ = std::fs::create_dir_all(start_menu_dir());
    let script = format!(
        "$s = (New-Object -ComObject WScript.Shell); \
         $l = $s.CreateShortcut('{}'); $l.TargetPath = '{}'; $l.Save(); \
         $d = $s.CreateShortcut('{}'); $d.TargetPath = '{}'; $d.Save();",
        start_link.display(),
        app.display(),
        desktop_link.display(),
        app.display(),
    );
    let out = sys::hidden("powershell")
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

#[cfg(target_os = "macos")]
pub fn register(version: &str, install_dir: &Path) -> Result<(), String> {
    // The .app is self-describing; the wizard also drops a LaunchServices
    // hint so Finder/Dock notice the new bundle immediately.
    let _ = std::process::Command::new("touch")
        .arg(install_dir.join("DigiClip.app"))
        .status();
    let ls_dir = sys::home_dir()
        .join("Library")
        .join("Application Support")
        .join("DigiClip");
    let _ = std::fs::create_dir_all(&ls_dir);
    let _ = std::fs::write(ls_dir.join("installed-version"), version);
    Ok(())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
pub fn register(version: &str, install_dir: &Path) -> Result<(), String> {
    let _ = std::fs::write(install_dir.join(".digiclip-version"), version);
    let appimage = install_dir.join("DigiClip.AppImage");
    // Desktop entry: per-user, no root.
    let apps = sys::home_dir()
        .join(".local")
        .join("share")
        .join("applications");
    let _ = std::fs::create_dir_all(&apps);
    let entry = format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=DigiClip\n\
         Comment=Drop a video, get TikTok-ready clips\n\
         Exec={} %U\n\
         Icon=digiclip\n\
         Terminal=false\n\
         Categories=AudioVideo;Video;AudioVideoEditing;\n\
         StartupWMClass=DigiClip\n",
        appimage.display()
    );
    std::fs::write(apps.join("digiclip.desktop"), entry).map_err(|e| e.to_string())?;
    let _ = std::process::Command::new("update-desktop-database")
        .arg(apps.join("digiclip.desktop"))
        .status();
    // CLI symlink so `digiclip` works from a terminal too.
    let bin = sys::home_dir().join(".local").join("bin");
    let _ = std::fs::create_dir_all(&bin);
    let link = bin.join("digiclip");
    let _ = std::fs::remove_file(&link);
    #[cfg(unix)]
    let _ = std::os::unix::fs::symlink(&appimage, &link);
    // Icon: pull it out of the AppImage's own squashfs root when possible.
    let tmp = sys::temp_dir().join(format!("digiclip-icon-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp);
    let _ = std::fs::create_dir_all(&tmp);
    let _ = std::process::Command::new(&appimage)
        .arg("--appimage-extract")
        .arg("usr/share/icons/*")
        .current_dir(&tmp)
        .status();
    if let Some(icon) = find_png(
        &tmp.join("squashfs-root")
            .join("usr")
            .join("share")
            .join("icons"),
    ) {
        let dest = sys::home_dir()
            .join(".local")
            .join("share")
            .join("icons")
            .join("hicolor")
            .join("256x256")
            .join("apps");
        let _ = std::fs::create_dir_all(&dest);
        let _ = std::fs::copy(icon, dest.join("digiclip.png"));
    }
    let _ = std::fs::remove_dir_all(&tmp);
    Ok(())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn find_png(dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    let mut best: Option<PathBuf> = None;
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            if let Some(found) = find_png(&p) {
                if found.to_string_lossy().contains("256x256") {
                    return Some(found);
                }
                best = best.or(Some(found));
            }
        } else if p.extension().and_then(|s| s.to_str()) == Some("png") && best.is_none() {
            best = Some(p);
        }
    }
    best
}

// ---------------------------------------------------------------------------
// Unregister
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
pub fn unregister() {
    use winreg::enums::*;
    use winreg::RegKey;
    let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey(sys::UNINSTALL_KEY);
    let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey(&format!(
        "SOFTWARE\\{}\\{}",
        sys::PUBLISHER,
        sys::DISPLAY_NAME
    ));
    let _ = std::fs::remove_file(start_menu_dir().join("DigiClip.lnk"));
    let _ = std::fs::remove_file(sys::home_dir().join("Desktop").join("DigiClip.lnk"));
}

#[cfg(target_os = "macos")]
pub fn unregister() {
    let ls_dir = sys::home_dir()
        .join("Library")
        .join("Application Support")
        .join("DigiClip");
    let _ = std::fs::remove_file(ls_dir.join("installed-version"));
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
pub fn unregister() {
    let _ = std::fs::remove_file(
        sys::home_dir()
            .join(".local")
            .join("share")
            .join("applications")
            .join("digiclip.desktop"),
    );
    let _ = std::fs::remove_file(sys::home_dir().join(".local").join("bin").join("digiclip"));
    let _ = std::fs::remove_file(
        sys::home_dir()
            .join(".local")
            .join("share")
            .join("icons")
            .join("hicolor")
            .join("256x256")
            .join("apps")
            .join("digiclip.png"),
    );
}

// ---------------------------------------------------------------------------
// Payload extraction
// ---------------------------------------------------------------------------

fn stage_dir() -> PathBuf {
    let d = sys::temp_dir().join(format!("DigiClip-stage-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    let _ = std::fs::create_dir_all(&d);
    d
}

/// Unpack the downloaded payload into a staging dir.
#[cfg(target_os = "windows")]
fn extract(payload: &Path, staging: &Path) -> Result<(), String> {
    let file = std::fs::File::open(payload).map_err(|e| e.to_string())?;
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
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn extract(payload: &Path, staging: &Path) -> Result<(), String> {
    use std::io::Read;
    let file = std::fs::File::open(payload).map_err(|e| e.to_string())?;
    let mut gz = flate2::read::GzDecoder::new(file);
    let mut buf = Vec::new();
    gz.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    let mut tar = tar::Archive::new(&buf[..]);
    tar.unpack(staging).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Write into place
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
fn write_staged(staging: &Path, install_dir: &Path, err: &mut String) {
    let Ok(entries) = std::fs::read_dir(staging) else {
        return;
    };
    for e in entries.flatten() {
        let src = e.path();
        let dst = install_dir.join(e.file_name());
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            let _ = std::fs::create_dir_all(&dst);
            write_staged(&src, &dst, err);
        } else {
            if dst.is_file() {
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

#[cfg(target_os = "macos")]
fn write_staged(staging: &Path, install_dir: &Path, err: &mut String) {
    // The payload holds DigiClip.app; ditto preserves bundle metadata and
    // the symlinks in Contents/Frameworks.
    let src = staging.join("DigiClip.app");
    if !src.is_dir() {
        err.push_str("payload has no DigiClip.app; ");
        return;
    }
    let dst = install_dir.join("DigiClip.app");
    if dst.exists() {
        let _ = std::fs::remove_dir_all(&dst);
    }
    let out = std::process::Command::new("ditto")
        .arg(&src)
        .arg(&dst)
        .output();
    let ok = matches!(&out, Ok(o) if o.status.success());
    if !ok {
        // /Applications normally needs elevation — ask the OS (this is the
        // standard macOS admin prompt, not a silent sudo).
        let script = format!(
            "do shell script {:?} with administrator privileges",
            format!(
                "rm -rf '{}' && ditto '{}' '{}'",
                dst.display(),
                src.display(),
                dst.display()
            )
        );
        let admin = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output();
        match admin {
            Ok(a) if a.status.success() => {}
            Ok(a) => {
                let detail = String::from_utf8_lossy(&a.stderr).trim().to_string();
                let first = match &out {
                    Ok(o) => String::from_utf8_lossy(&o.stderr).trim().to_string(),
                    Err(e) => e.to_string(),
                };
                err.push_str(&format!(
                    "copy to /Applications failed ({first}); admin copy: {detail}; "
                ));
            }
            Err(e) => err.push_str(&format!("ditto: {e}; ")),
        }
    }
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn write_staged(staging: &Path, install_dir: &Path, err: &mut String) {
    // The payload holds the AppImage; flatten it to a stable name.
    let appimage = std::fs::read_dir(staging).ok().and_then(|entries| {
        entries
            .flatten()
            .map(|e| e.path())
            .find(|p| p.extension().and_then(|s| s.to_str()) == Some("AppImage"))
    });
    let Some(appimage) = appimage else {
        err.push_str("payload has no AppImage; ");
        return;
    };
    if let Err(e) = std::fs::create_dir_all(install_dir) {
        err.push_str(&format!("{}: {e}; ", install_dir.display()));
        return;
    }
    let dst = install_dir.join("DigiClip.AppImage");
    if let Err(e) = std::fs::copy(&appimage, &dst) {
        err.push_str(&format!("{}: {e}; ", dst.display()));
        return;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dst, std::fs::Permissions::from_mode(0o755));
    }
}

/// Stage, then write into `install_dir` with retries while Windows
/// releases locks (no-op benefit elsewhere, harmless).
pub fn lay_down(payload: &Path, install_dir: &Path) -> Result<(), String> {
    let staging = stage_dir();
    extract(payload, &staging)?;
    let _ = std::fs::create_dir_all(install_dir);
    let mut last = String::new();
    for attempt in 0..12 {
        last.clear();
        write_staged(&staging, install_dir, &mut last);
        if last.is_empty() {
            let _ = std::fs::remove_dir_all(&staging);
            return Ok(());
        }
        let _ = sys::stop_app();
        let _ = std::thread::sleep(std::time::Duration::from_millis(400 * (attempt + 1)));
    }
    let _ = std::fs::remove_dir_all(&staging);
    Err(format!("Could not write some files: {last}"))
}

/// Remove the installed tree (and, on macOS, with elevation if needed).
pub fn remove_tree(install_dir: &Path) {
    #[cfg(target_os = "macos")]
    {
        let app = install_dir.join("DigiClip.app");
        if app.exists() {
            if std::fs::remove_dir_all(&app).is_err() {
                let script = format!(
                    "do shell script {:?} with administrator privileges",
                    format!("rm -rf '{}'", app.display())
                );
                let _ = std::process::Command::new("osascript")
                    .args(["-e", &script])
                    .status();
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        if install_dir.exists() {
            let _ = std::fs::remove_dir_all(install_dir);
        }
    }
}
