//! Laying the embedded app payload down (and removing it again), per platform.
//!
//! Windows: unzip into the install dir, keep a payload-free copy of Setup
//!          there as the uninstaller, register an uninstall entry, create
//!          Start Menu + desktop shortcuts.
//! macOS:  copy DigiClip.app into /Applications with `ditto` (preserves
//!         the bundle's symlinks), admin prompt when not writable.
//! Linux:  unpack the AppImage into ~/.local/opt/digiclip/app (so it runs
//!         without FUSE), write a .desktop entry + icon.

use std::path::{Path, PathBuf};

use crate::payload::Payload;
use crate::sys;

// ---------------------------------------------------------------------------
// Register (OS integration)
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
const UNINSTALLER: &str = "DigiClip-Setup.exe";

/// Copy this Setup — minus the embedded payload — into the install dir so
/// "Apps & features → Uninstall" keeps working after the downloaded
/// installer is deleted. Returns the path to register.
#[cfg(target_os = "windows")]
fn write_uninstaller(install_dir: &Path, payload: &Payload) -> Result<PathBuf, String> {
    use std::io::{Read, Write};
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dest = install_dir.join(UNINSTALLER);
    if dest == exe {
        return Ok(dest);
    }
    let keep = payload.stub_len().unwrap_or(u64::MAX);
    let mut src = std::fs::File::open(&exe).map_err(|e| e.to_string())?;
    let part = dest.with_extension("exe.part");
    let mut out = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    std::io::copy(&mut (&mut src).take(keep), &mut out).map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())?;
    drop(out);
    let _ = std::fs::remove_file(&dest);
    std::fs::rename(&part, &dest).map_err(|e| e.to_string())?;
    Ok(dest)
}

#[cfg(target_os = "windows")]
fn tree_size_kb(dir: &Path) -> u64 {
    fn walk(p: &Path) -> u64 {
        std::fs::read_dir(p)
            .map(|rd| {
                rd.flatten()
                    .map(|e| match e.file_type() {
                        Ok(t) if t.is_dir() => walk(&e.path()),
                        _ => e.metadata().map(|m| m.len()).unwrap_or(0),
                    })
                    .sum()
            })
            .unwrap_or(0)
    }
    walk(dir) / 1024
}

#[cfg(target_os = "windows")]
pub fn register(version: &str, install_dir: &Path, payload: &Payload) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let setup_exe = write_uninstaller(install_dir, payload)
        .or_else(|_| std::env::current_exe().map_err(|e| e.to_string()))?;
    let hk = RegKey::predef(HKEY_CURRENT_USER);
    let (k, _) = hk
        .create_subkey(sys::UNINSTALL_KEY)
        .map_err(|e| format!("registry create: {e}"))?;
    let size_kb = u32::try_from(tree_size_kb(install_dir)).unwrap_or(u32::MAX);
    macro_rules! set {
        ($name:expr, $value:expr) => {
            k.set_value($name, $value)
                .map_err(|e| format!("registry {}: {e}", $name))?
        };
    }
    let setup = format!("\"{}\"", setup_exe.display());
    set!("DisplayName", &sys::DISPLAY_NAME);
    set!("DisplayVersion", &version);
    set!("Publisher", &sys::PUBLISHER);
    set!("InstallLocation", &install_dir.display().to_string());
    set!(
        "DisplayIcon",
        &format!("{},0", install_dir.join("digiclip-app.exe").display())
    );
    set!("NoModify", &1u32);
    set!("NoRepair", &1u32);
    set!("EstimatedSize", &size_kb);
    set!("UninstallString", &format!("{setup} --uninstall"));
    set!(
        "QuietUninstallString",
        &format!("{setup} --uninstall --quiet")
    );
    set!("URLInfoAbout", &"https://github.com/n1ssyyy/DigiClip");
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

/// The user's real Desktop (it can be redirected, e.g. into OneDrive).
#[cfg(target_os = "windows")]
fn desktop_dir() -> PathBuf {
    let out = sys::hidden("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[Environment]::GetFolderPath('Desktop')",
        ])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            let p = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if p.is_empty() {
                sys::home_dir().join("Desktop")
            } else {
                PathBuf::from(p)
            }
        }
        _ => sys::home_dir().join("Desktop"),
    }
}

#[cfg(target_os = "windows")]
fn create_shortcuts(install_dir: &Path) -> Result<(), String> {
    let app = install_dir.join("digiclip-app.exe");
    let start_link = start_menu_dir().join("DigiClip.lnk");
    let desktop_link = desktop_dir().join("DigiClip.lnk");
    let _ = std::fs::create_dir_all(start_menu_dir());
    // PowerShell single-quoted strings: a literal ' is written as ''.
    let q = |p: &Path| p.display().to_string().replace('\'', "''");
    let script = format!(
        "$s = (New-Object -ComObject WScript.Shell); \
         $l = $s.CreateShortcut('{sl}'); $l.TargetPath = '{app}'; $l.WorkingDirectory = '{dir}'; $l.Save(); \
         $d = $s.CreateShortcut('{dl}'); $d.TargetPath = '{app}'; $d.WorkingDirectory = '{dir}'; $d.Save();",
        sl = q(&start_link),
        dl = q(&desktop_link),
        app = q(&app),
        dir = q(install_dir),
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
pub fn register(_version: &str, install_dir: &Path, _payload: &Payload) -> Result<(), String> {
    // The .app is self-describing (Info.plist carries the version); touch it
    // so Finder/Launchpad notice the new bundle immediately.
    let _ = std::process::Command::new("touch")
        .arg(install_dir.join("DigiClip.app"))
        .status();
    Ok(())
}

/// Desktop id = the window's WM_CLASS / Wayland app_id (`digiclip-app`).
/// GNOME links a window to its launcher through StartupWMClass, and when
/// two entries claim the same class it prefers the one whose file name
/// matches it exactly — so an old system-wide DigiClip package (whose
/// /usr/share/applications/DigiClip.desktop claims `digiclip-app` too)
/// can't hand our window its icon.
#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
const DESKTOP_ID: &str = "digiclip-app.desktop";

/// An icon name no other package ships: old DigiClip packages installed
/// `digiclip`/`digiclip-app` icons system-wide, in sizes this one lacked,
/// and the theme lookup picked theirs.
#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
const ICON_NAME: &str = "com.digiclip.app";

/// What Setup ≤ 1.1.2 wrote (entry + a single 256px icon).
#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
const LEGACY_DESKTOP: &str = "digiclip.desktop";

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn data_home() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| sys::home_dir().join(".local").join("share"))
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn applications_dir() -> PathBuf {
    data_home().join("applications")
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn hicolor_dir() -> PathBuf {
    data_home().join("icons").join("hicolor")
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
pub fn register(version: &str, install_dir: &Path, _payload: &Payload) -> Result<(), String> {
    std::fs::write(install_dir.join(".digiclip-version"), version).map_err(|e| e.to_string())?;
    let app_run = install_dir.join("app").join("AppRun");
    // Desktop entry: per-user, no root. Exec is quoted (spec §"Exec key").
    let apps = applications_dir();
    let _ = std::fs::create_dir_all(&apps);
    let exec = app_run
        .display()
        .to_string()
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('`', "\\`")
        .replace('$', "\\$");
    let entry = format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=DigiClip\n\
         Comment=Drop a video, get TikTok-ready clips\n\
         Exec=\"{exec}\" %U\n\
         Icon={ICON_NAME}\n\
         Terminal=false\n\
         Categories=AudioVideo;Video;AudioVideoEditing;\n\
         StartupWMClass=digiclip-app\n"
    );
    remove_legacy_entry();
    install_icons(
        &install_dir
            .join("app")
            .join("usr")
            .join("share")
            .join("icons"),
    );
    std::fs::write(apps.join(DESKTOP_ID), entry).map_err(|e| e.to_string())?;
    let _ = std::process::Command::new("update-desktop-database")
        .arg(&apps)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
    Ok(())
}

/// Every PNG the AppImage ships, filed under its real pixel size (Tauri's
/// `256x256@2` dir holds a 256px image) with the unique icon name.
#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn install_icons(src: &Path) {
    let root = hicolor_dir();
    let mut pngs = Vec::new();
    collect_pngs(src, &mut pngs);
    for png in pngs {
        let Some((w, h)) = png_size(&png) else {
            continue;
        };
        if w != h || w == 0 {
            continue;
        }
        let dir = root.join(format!("{w}x{w}")).join("apps");
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::copy(&png, dir.join(format!("{ICON_NAME}.png")));
    }
    touch_dir(&root);
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn collect_pngs(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            collect_pngs(&p, out);
        } else if p.extension().and_then(|s| s.to_str()) == Some("png") {
            out.push(p);
        }
    }
}

/// Width and height from a PNG's IHDR chunk.
#[cfg(any(test, all(not(target_os = "windows"), not(target_os = "macos"))))]
fn png_size(p: &Path) -> Option<(u32, u32)> {
    use std::io::Read;
    let mut b = [0u8; 24];
    std::fs::File::open(p).ok()?.read_exact(&mut b).ok()?;
    if &b[..8] != b"\x89PNG\r\n\x1a\n" || &b[12..16] != b"IHDR" {
        return None;
    }
    let w = u32::from_be_bytes(b[16..20].try_into().ok()?);
    let h = u32::from_be_bytes(b[20..24].try_into().ok()?);
    Some((w, h))
}

/// GTK re-reads an icon theme when the theme dir's mtime changes.
#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn touch_dir(dir: &Path) {
    let f = dir.join(".digiclip-touch");
    if std::fs::write(&f, b"").is_ok() {
        let _ = std::fs::remove_file(&f);
    }
}

/// Drop the entry + icon an older Setup wrote — only if the entry is ours
/// (it launches an unpacked AppImage), never someone else's digiclip.desktop.
#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn remove_legacy_entry() {
    let entry = applications_dir().join(LEGACY_DESKTOP);
    let ours = std::fs::read_to_string(&entry)
        .map(|t| is_legacy_setup_entry(&t))
        .unwrap_or(false);
    if ours {
        let _ = std::fs::remove_file(&entry);
        let _ = std::fs::remove_file(
            hicolor_dir()
                .join("256x256")
                .join("apps")
                .join("digiclip.png"),
        );
    }
}

#[cfg(any(test, all(not(target_os = "windows"), not(target_os = "macos"))))]
fn is_legacy_setup_entry(text: &str) -> bool {
    text.contains("StartupWMClass=digiclip-app") && text.contains("/app/AppRun\"")
}

// ---------------------------------------------------------------------------
// Unregister
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
pub fn unregister() {
    use winreg::enums::*;
    use winreg::RegKey;
    let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey(sys::UNINSTALL_KEY);
    let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey(format!(
        "SOFTWARE\\{}\\{}",
        sys::PUBLISHER,
        sys::DISPLAY_NAME
    ));
    let _ = std::fs::remove_file(start_menu_dir().join("DigiClip.lnk"));
    let _ = std::fs::remove_file(desktop_dir().join("DigiClip.lnk"));
}

#[cfg(target_os = "macos")]
pub fn unregister() {}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
pub fn unregister() {
    let _ = std::fs::remove_file(applications_dir().join(DESKTOP_ID));
    remove_legacy_entry();
    if let Ok(sizes) = std::fs::read_dir(hicolor_dir()) {
        for size in sizes.flatten() {
            let _ = std::fs::remove_file(size.path().join("apps").join(format!("{ICON_NAME}.png")));
        }
    }
    touch_dir(&hicolor_dir());
    // Setup ≤2.3.1 symlinked the AppImage as ~/.local/bin/digiclip. Remove
    // it only if it is that symlink — never a real `digiclip` CLI.
    let link = sys::home_dir().join(".local").join("bin").join("digiclip");
    if let Ok(target) = std::fs::read_link(&link) {
        if target.ends_with("DigiClip.AppImage") {
            let _ = std::fs::remove_file(&link);
        }
    }
}

// ---------------------------------------------------------------------------
// Payload extraction
// ---------------------------------------------------------------------------

fn stage_dir(install_dir: &Path) -> PathBuf {
    // Linux stages inside the install dir: the final rename must stay on
    // one filesystem, and the AppImage has to execute to unpack itself
    // (/tmp is often noexec).
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let base = {
        let _ = std::fs::create_dir_all(install_dir);
        install_dir.join(format!(".stage-{}", std::process::id()))
    };
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    let base = {
        let _ = install_dir;
        sys::temp_dir().join(format!("DigiClip-stage-{}", std::process::id()))
    };
    let d = base;
    let _ = std::fs::remove_dir_all(&d);
    let _ = std::fs::create_dir_all(&d);
    d
}

/// Unpack the payload (a zip of the app folder) into a staging dir.
#[cfg(target_os = "windows")]
fn extract(payload: &Payload, staging: &Path) -> Result<(), String> {
    let reader = payload.open().map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("payload: {e}"))?;
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

/// Unpack the payload (a tar.gz of DigiClip.app / the AppImage) into a
/// staging dir, streaming — never the whole archive in memory.
#[cfg(not(target_os = "windows"))]
fn extract(payload: &Payload, staging: &Path) -> Result<(), String> {
    let reader = payload.open().map_err(|e| e.to_string())?;
    let gz = flate2::read::GzDecoder::new(std::io::BufReader::new(reader));
    let mut tar = tar::Archive::new(gz);
    tar.set_preserve_permissions(true);
    tar.unpack(staging).map_err(|e| format!("payload: {e}"))
}

/// Payloads built before 2.3.2 wrapped the app in a top-level `DigiClip/`
/// folder; step into it so files land directly in the install dir.
#[cfg(target_os = "windows")]
fn payload_root(staging: &Path) -> PathBuf {
    let nested = staging.join("DigiClip");
    if !staging.join("digiclip-app.exe").is_file() && nested.join("digiclip-app.exe").is_file() {
        nested
    } else {
        staging.to_path_buf()
    }
}

// ---------------------------------------------------------------------------
// Write into place
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
fn write_staged(staging: &Path, install_dir: &Path, err: &mut String) {
    let Ok(entries) = std::fs::read_dir(staging) else {
        err.push_str("staging dir vanished; ");
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
            if let Ok(meta) = std::fs::metadata(&dst) {
                let mut perms = meta.permissions();
                #[allow(clippy::permissions_set_readonly_false)]
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
        let sh = |p: &Path| format!("'{}'", p.display().to_string().replace('\'', r"'\''"));
        let script = format!(
            "do shell script {:?} with administrator privileges",
            format!(
                "rm -rf {dst} && ditto {src} {dst}",
                dst = sh(&dst),
                src = sh(&src)
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
    use std::os::unix::fs::PermissionsExt;
    // The payload holds the AppImage; unpack it (the runtime extracts
    // without FUSE) and swap the result in as `app/`.
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
    let _ = std::fs::set_permissions(&appimage, std::fs::Permissions::from_mode(0o755));
    let unpacked = staging.join("squashfs-root");
    let _ = std::fs::remove_dir_all(&unpacked);
    let out = std::process::Command::new(&appimage)
        .arg("--appimage-extract")
        .current_dir(staging)
        .env_remove("APPIMAGE")
        .env_remove("APPDIR")
        .stdout(std::process::Stdio::null())
        .output();
    match out {
        Ok(o) if o.status.success() && unpacked.join("AppRun").exists() => {}
        Ok(o) => {
            err.push_str(&format!(
                "unpacking the AppImage failed: {}; ",
                String::from_utf8_lossy(&o.stderr).trim()
            ));
            return;
        }
        Err(e) => {
            err.push_str(&format!("unpacking the AppImage failed: {e}; "));
            return;
        }
    }
    // Rename the old tree aside, then the new one in: both renames work
    // even while files of the old app are still mapped.
    let dst = install_dir.join("app");
    let old = install_dir.join(format!(".app-old-{}", std::process::id()));
    if dst.exists() {
        if let Err(e) = std::fs::rename(&dst, &old) {
            err.push_str(&format!("{}: {e}; ", dst.display()));
            return;
        }
    }
    if let Err(e) = std::fs::rename(&unpacked, &dst) {
        let _ = std::fs::rename(&old, &dst);
        err.push_str(&format!("{}: {e}; ", dst.display()));
        return;
    }
    let _ = std::fs::remove_dir_all(&old);
    // Setup 2.3.1 kept the packed AppImage here; the unpacked app replaces it.
    let _ = std::fs::remove_file(install_dir.join("DigiClip.AppImage"));
}

/// Stage, then write into `install_dir` with retries while the OS
/// releases locks. `clean` wipes the old install first (Reinstall).
pub fn lay_down(payload: &Payload, install_dir: &Path, clean: bool) -> Result<(), String> {
    let staging = stage_dir(install_dir);
    if let Err(e) = extract(payload, &staging) {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(e);
    }
    if clean {
        remove_app(install_dir);
    }
    #[cfg(target_os = "windows")]
    let staging_root = payload_root(&staging);
    #[cfg(not(target_os = "windows"))]
    let staging_root = staging.clone();
    let _ = std::fs::create_dir_all(install_dir);
    let mut last = String::new();
    for attempt in 0..12u64 {
        last.clear();
        write_staged(&staging_root, install_dir, &mut last);
        if last.is_empty() {
            break;
        }
        let _ = sys::stop_app();
        std::thread::sleep(std::time::Duration::from_millis(400 * (attempt + 1)));
    }
    let _ = std::fs::remove_dir_all(&staging);
    if !last.is_empty() {
        return Err(format!("Could not write some files: {last}"));
    }
    #[cfg(target_os = "windows")]
    {
        // Setup 2.3.0 installed one level too deep (…\DigiClip\DigiClip\);
        // that copy is dead weight now.
        let legacy = install_dir.join("DigiClip");
        if legacy.join("digiclip-app.exe").is_file() {
            let _ = std::fs::remove_dir_all(legacy);
        }
    }
    if sys::installed_executable(install_dir).is_none() {
        return Err("Install finished but the app is missing — try Reinstall.".into());
    }
    Ok(())
}

/// Clear the old app out of `install_dir` before a clean reinstall, leaving
/// the in-progress staging dir alone.
fn remove_app(install_dir: &Path) {
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let _ = std::fs::remove_dir_all(install_dir.join("app"));
        let _ = std::fs::remove_file(install_dir.join("DigiClip.AppImage"));
    }
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    remove_tree(install_dir);
}

/// Remove the installed app (never user data: clips, models and settings
/// live in the OS user-data dir, not here).
pub fn remove_tree(install_dir: &Path) {
    #[cfg(target_os = "macos")]
    {
        let app = install_dir.join("DigiClip.app");
        if app.exists() && std::fs::remove_dir_all(&app).is_err() {
            let script = format!(
                "do shell script {:?} with administrator privileges",
                format!(
                    "rm -rf '{}'",
                    app.display().to_string().replace('\'', r"'\''")
                )
            );
            let _ = std::process::Command::new("osascript")
                .args(["-e", &script])
                .status();
        }
    }
    #[cfg(target_os = "windows")]
    {
        // Only ever a DigiClip folder (see sys::install_dir_for) — never a
        // user-picked parent like Desktop or D:\.
        let named = install_dir
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.eq_ignore_ascii_case("DigiClip"));
        if named || install_dir.join("digiclip-app.exe").is_file() {
            let _ = std::fs::remove_dir_all(install_dir);
        }
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let _ = std::fs::remove_dir_all(install_dir.join("app"));
        let _ = std::fs::remove_file(install_dir.join("DigiClip.AppImage"));
        let _ = std::fs::remove_file(install_dir.join(".digiclip-version"));
        // Only drops the dir when nothing else lives there.
        let _ = std::fs::remove_dir(install_dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_size_reads_ihdr() {
        let icon = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src-tauri/icons/32x32.png");
        assert_eq!(png_size(&icon), Some((32, 32)));
        let not_png = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        assert_eq!(png_size(&not_png), None);
    }

    #[test]
    fn legacy_entry_only_when_ours() {
        let ours = "[Desktop Entry]\nExec=\"/home/u/.local/opt/digiclip/app/AppRun\" %U\nIcon=digiclip\nStartupWMClass=digiclip-app\n";
        assert!(is_legacy_setup_entry(ours));
        // The old 1.x package's entry (same file name, different app).
        let other = "[Desktop Entry]\nExec=/opt/DigiClip/digiclip %U\nIcon=digiclip\nStartupWMClass=digiclip\n";
        assert!(!is_legacy_setup_entry(other));
    }
}
