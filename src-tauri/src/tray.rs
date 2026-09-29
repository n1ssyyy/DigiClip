//! Tray: DigiClip keeps running (engine, watch folder) with its window
//! closed. Left click opens the app; right click opens the tray menu, a
//! small frameless window drawn by the React UI (label `tray`), placed
//! next to the icon and hidden again as soon as it loses focus. Linux
//! tray icons don't report clicks, so there the icon gets a native menu.
//!
//! Also here: the shell's own preferences (`shell.json` in the app config
//! dir — the engine's settings don't reach this process) and launching at
//! sign-in, which starts DigiClip hidden in the tray (`--hidden`).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter as _, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

/// Label of the tray menu window.
pub const MENU: &str = "tray";
const TRAY_ID: &str = "digiclip";
/// Menu width in logical px; the height follows the content (`tray_menu_size`).
const MENU_W: f64 = 300.0;
/// Gap between the menu and the work-area edge / taskbar.
const EDGE: f64 = 8.0;
/// Launch flag the sign-in entry passes: start in the tray, no window.
pub const HIDDEN_ARG: &str = "--hidden";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
struct Prefs {
    close_to_tray: bool,
    /// The first close shows what "close to tray" means, once.
    tray_hint_seen: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            tray_hint_seen: false,
        }
    }
}

#[derive(Default)]
pub struct TrayState {
    prefs: Mutex<Prefs>,
    /// The tray icon exists (it can fail on Linux without an indicator
    /// host); closing to a tray that isn't there would strand the app.
    ready: AtomicBool,
    quitting: AtomicBool,
    /// Where the menu last opened from (physical px), for re-placing it
    /// when its height changes.
    anchor: Mutex<Option<PhysicalPosition<f64>>>,
    /// When the menu last hid on blur: a click on the icon blurs the open
    /// menu first, and must not reopen it straight away.
    hidden_at: Mutex<Option<Instant>>,
}

fn prefs_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("shell.json"))
}

fn load_prefs(app: &AppHandle) -> Prefs {
    prefs_path(app)
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save_prefs(app: &AppHandle, prefs: &Prefs) -> Result<(), String> {
    let path = prefs_path(app).ok_or("no config dir")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let body = serde_json::to_vec_pretty(prefs).map_err(|e| e.to_string())?;
    std::fs::write(path, body).map_err(|e| e.to_string())
}

fn update_prefs(app: &AppHandle, f: impl FnOnce(&mut Prefs)) -> Result<(), String> {
    let state = app.state::<TrayState>();
    let mut prefs = state.prefs.lock().unwrap();
    f(&mut prefs);
    save_prefs(app, &prefs)
}

/// Closing the main window hides it instead of quitting.
pub fn keeps_running(app: &AppHandle) -> bool {
    let state = app.state::<TrayState>();
    state.ready.load(Ordering::SeqCst)
        && !state.quitting.load(Ordering::SeqCst)
        && state.prefs.lock().unwrap().close_to_tray
}

/// Stop the engine and leave: the only real exit once the app lives in
/// the tray.
pub fn quit(app: &AppHandle) {
    app.state::<TrayState>()
        .quitting
        .store(true, Ordering::SeqCst);
    crate::stop_engine(app);
    app.exit(0);
}

/// Bring the main window back (tray click, second launch, dock click),
/// optionally on a given page.
pub fn show_main(app: &AppHandle, page: Option<&str>) {
    hide_menu(app);
    if let Some(win) = app.get_webview_window("main") {
        crate::place_main_once(&win);
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        if let Some(page) = page {
            let _ = win.emit("digiclip:navigate", page);
        }
    }
}

fn hide_menu(app: &AppHandle) {
    if let Some(menu) = app.get_webview_window(MENU) {
        if menu.is_visible().unwrap_or(false) {
            let _ = menu.hide();
        }
    }
}

/// Place the menu by the icon: above a bottom taskbar, below a top one
/// (and the macOS menu bar), beside a side one, always inside the work
/// area of the monitor that was clicked.
fn place_menu(app: &AppHandle, menu: &WebviewWindow, at: PhysicalPosition<f64>) {
    let Ok(Some(monitor)) = app.monitor_from_point(at.x, at.y) else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (left, top) = (area.position.x as f64, area.position.y as f64);
    let (right, bottom) = (left + area.size.width as f64, top + area.size.height as f64);
    let size = menu
        .inner_size()
        .map(|s| (s.width as f64, s.height as f64))
        .unwrap_or((MENU_W * scale, 320.0 * scale));
    let (w, h) = size;
    let gap = EDGE * scale;
    let clamp = |v: f64, lo: f64, hi: f64| v.max(lo).min(hi.max(lo));
    // Inside the work area (Windows' hidden-icons flyout, a side taskbar)
    // it opens like a native context menu: from the cursor, flipped left
    // or up when it wouldn't fit.
    let x = if at.x < left {
        left + gap
    } else if at.x > right {
        right - w - gap
    } else if at.x + w <= right - gap {
        at.x
    } else {
        clamp(at.x - w, left + gap, right - w - gap)
    };
    let y = if at.y >= bottom {
        bottom - h - gap
    } else if at.y <= top {
        top + gap
    } else if at.y + h <= bottom - gap {
        at.y
    } else {
        clamp(at.y - h, top + gap, bottom - h - gap)
    };
    let _ = menu.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

fn toggle_menu(app: &AppHandle, at: PhysicalPosition<f64>) {
    let Some(menu) = app.get_webview_window(MENU) else {
        show_main(app, None);
        return;
    };
    let state = app.state::<TrayState>();
    if menu.is_visible().unwrap_or(false) {
        let _ = menu.hide();
        return;
    }
    // This click just blurred (and hid) the open menu: leave it closed.
    let just_hid = state
        .hidden_at
        .lock()
        .unwrap()
        .is_some_and(|t| t.elapsed() < Duration::from_millis(250));
    if just_hid {
        return;
    }
    *state.anchor.lock().unwrap() = Some(at);
    place_menu(app, &menu, at);
    let _ = menu.emit("digiclip:tray-open", ());
    let _ = menu.show();
    let _ = menu.set_focus();
}

/// Blur hides the menu; so does Escape (from the page).
pub fn menu_window_event(win: &tauri::Window, ev: &tauri::WindowEvent) {
    if let tauri::WindowEvent::Focused(false) = ev {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
            *win.app_handle()
                .state::<TrayState>()
                .hidden_at
                .lock()
                .unwrap() = Some(Instant::now());
        }
    }
}

/// Create the tray icon (and, off Linux, the hidden menu window). Returns
/// whether the app should start hidden.
pub fn setup(app: &AppHandle) -> bool {
    let state = app.state::<TrayState>();
    *state.prefs.lock().unwrap() = load_prefs(app);

    let Some(icon) = app.default_window_icon().cloned() else {
        return false;
    };
    #[allow(unused_mut)]
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("DigiClip")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle();
            if let TrayIconEvent::Click {
                button,
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            {
                match button {
                    // macOS convention: any click on a menu-bar item opens
                    // its menu. Windows: left opens the app.
                    MouseButton::Left if !cfg!(target_os = "macos") => show_main(app, None),
                    MouseButton::Left | MouseButton::Right => toggle_menu(app, position),
                    _ => {}
                }
            }
        });

    #[cfg(target_os = "linux")]
    {
        match linux_menu(app, "Open DigiClip", "Quit DigiClip") {
            Ok(menu) => {
                builder = builder
                    .menu(&menu)
                    .on_menu_event(|app, ev| match ev.id().as_ref() {
                        "open" => show_main(app, None),
                        "quit" => quit(app),
                        _ => {}
                    });
            }
            Err(e) => eprintln!("[shell] tray menu: {e}"),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        if let Err(e) = build_menu_window(app) {
            eprintln!("[shell] tray menu window: {e}");
        }
    }

    match builder.build(app) {
        Ok(_) => state.ready.store(true, Ordering::SeqCst),
        Err(e) => eprintln!("[shell] tray icon unavailable: {e}"),
    }
    refresh_autostart();
    state.ready.load(Ordering::SeqCst) && std::env::args().any(|a| a == HIDDEN_ARG)
}

#[cfg(not(target_os = "linux"))]
fn build_menu_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    tauri::WebviewWindowBuilder::new(app, MENU, tauri::WebviewUrl::App("index.html".into()))
        .title("DigiClip")
        .inner_size(MENU_W, 320.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .build()
}

#[cfg(target_os = "linux")]
fn linux_menu(
    app: &AppHandle,
    open: &str,
    quit: &str,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open", open, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", quit, true, None::<&str>)?,
        ],
    )
}

// ---------------------------------------------------------------------------
// Launch at sign-in
// ---------------------------------------------------------------------------

/// The executable that starts DigiClip (on Linux the AppImage/AppRun,
/// not the unpacked binary).
pub fn app_exe() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    #[cfg(target_os = "linux")]
    let exe = {
        // Installed builds run from an unpacked AppImage: start it through
        // its AppRun (sets up the bundled libraries), not the bare binary.
        let apprun = std::env::var_os("APPIMAGE").map(PathBuf::from).or_else(|| {
            exe.ancestors()
                .take(5)
                .map(|d| d.join("AppRun"))
                .find(|p| p.is_file())
        });
        apprun.unwrap_or(exe)
    };
    Some(exe)
}

/// What the sign-in entry runs. Quoted where the entry is a command line
/// (Windows Run key, Linux `Exec=`), so a path with spaces still starts.
fn launch_path() -> Option<String> {
    let exe = app_exe()?;
    if cfg!(target_os = "macos") {
        Some(exe.display().to_string())
    } else {
        Some(format!("\"{}\"", exe.display()))
    }
}

fn launcher() -> Result<auto_launch::AutoLaunch, String> {
    let path = launch_path().ok_or("can't find the DigiClip executable")?;
    auto_launch::AutoLaunchBuilder::new()
        .set_app_name("DigiClip")
        .set_app_path(&path)
        .set_use_launch_agent(true)
        .set_args(&[HIDDEN_ARG])
        .build()
        .map_err(|e| e.to_string())
}

fn autostart_enabled() -> bool {
    launcher()
        .and_then(|l| l.is_enabled().map_err(|e| e.to_string()))
        .unwrap_or(false)
}

/// An enabled entry is rewritten on every start, so it follows the app
/// when it is reinstalled somewhere else.
fn refresh_autostart() {
    if let Ok(l) = launcher() {
        if l.is_enabled().unwrap_or(false) {
            let _ = l.enable();
        }
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct ShellPrefs {
    close_to_tray: bool,
    tray_hint_seen: bool,
    autostart: bool,
    /// A tray icon is up (closing to the tray is possible at all).
    tray: bool,
}

#[tauri::command]
pub fn shell_prefs(app: AppHandle) -> ShellPrefs {
    let state = app.state::<TrayState>();
    let prefs = state.prefs.lock().unwrap().clone();
    ShellPrefs {
        close_to_tray: prefs.close_to_tray,
        tray_hint_seen: prefs.tray_hint_seen,
        autostart: autostart_enabled(),
        tray: state.ready.load(Ordering::SeqCst),
    }
}

#[tauri::command]
pub fn set_close_to_tray(app: AppHandle, on: bool) -> Result<ShellPrefs, String> {
    update_prefs(&app, |p| {
        p.close_to_tray = on;
        p.tray_hint_seen = true;
    })?;
    let _ = app.emit("digiclip:shell-prefs", ());
    Ok(shell_prefs(app))
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, on: bool) -> Result<ShellPrefs, String> {
    let l = launcher()?;
    if on { l.enable() } else { l.disable() }.map_err(|e| e.to_string())?;
    let _ = app.emit("digiclip:shell-prefs", ());
    Ok(shell_prefs(app))
}

#[tauri::command]
pub fn open_main(app: AppHandle, page: Option<String>) {
    show_main(&app, page.as_deref());
}

#[tauri::command]
pub fn hide_tray_menu(app: AppHandle) {
    hide_menu(&app);
}

/// The menu page reports its rendered height; the window follows and is
/// re-placed against the same anchor so it stays glued to the icon.
#[tauri::command]
pub fn tray_menu_size(app: AppHandle, height: f64) {
    let Some(menu) = app.get_webview_window(MENU) else {
        return;
    };
    let height = height.clamp(120.0, 640.0);
    let _ = menu.set_size(LogicalSize::new(MENU_W, height));
    if let Some(at) = *app.state::<TrayState>().anchor.lock().unwrap() {
        place_menu(&app, &menu, at);
    }
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    quit(&app);
}

/// Tooltip (and on Linux the native menu labels) in the UI language.
#[tauri::command]
pub fn set_tray_text(app: AppHandle, tooltip: String, open: String, quit: String) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let _ = tray.set_tooltip(Some(tooltip));
    #[cfg(target_os = "linux")]
    if let Ok(menu) = linux_menu(&app, &open, &quit) {
        let _ = tray.set_menu(Some(menu));
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (open, quit);
}
