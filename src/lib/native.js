/**
 * Tauri bridge: window controls, file picking, drag-drop, external links.
 * Same call shapes the old Titlebar/WindowController offered, minus the
 * HTTP round-trip — these are direct shell invokes now.
 */
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

export function isTauri() {
    if (typeof window === 'undefined') return false;
    return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

/** Sidecar address, published by the shell once the daemon prints its banner. */
export function getServe() {
    return invoke('get_serve');
}

export function onServeReady(fn) {
    return listen('digiclip:serve-ready', (e) => fn(e.payload));
}

export function onServeFailed(fn) {
    return listen('digiclip:serve-failed', (e) => fn(e.payload));
}

export function onMaximized(fn) {
    return listen('digiclip:maximized', (e) => fn(!!e.payload));
}

/** Drive the frameless window (Titlebar buttons, header double-click). */
export function sendWindowAction(action) {
    return invoke('window_action', { action }).catch(() => {});
}

/** Start a native window drag (header mousedown fallback — always works,
 *  even where the declarative drag region doesn't). */
export function dragWindow() {
    return invoke('drag_window').catch(() => {});
}

export function queryMaximized() {
    return invoke('is_maximized').catch(() => false);
}

/** Reveal a finished file in the OS file manager. */
export function reveal(path) {
    return invoke('reveal', { path }).catch(() => {});
}

/** External links leave the app via the OS browser. */
export function openExternal(url) {
    return invoke('open_url', { url }).catch(() => {});
}

/** Source files the engine takes (browse filter and drop filter). */
export const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'webm', 'm4v', 'm4a'];

/** Browse for source videos (dialog plugin, native picker). Several
 *  can be picked at once; each becomes its own queued job. */
export async function pickVideos() {
    const sel = await open({
        multiple: true,
        directory: false,
        filters: [{ name: 'Video', extensions: VIDEO_EXT }],
    });
    if (typeof sel === 'string') return [sel];
    return Array.isArray(sel) ? sel : [];
}

/** Browse for a single file of one kind (logo image, music bed). */
async function pickOne(name, extensions) {
    if (!isTauri()) return null;
    const sel = await open({ multiple: false, directory: false, filters: [{ name, extensions }] });
    return typeof sel === 'string' ? sel : null;
}

/** Browse for a folder (the watch folder). */
export async function pickFolder() {
    if (!isTauri()) return null;
    const sel = await open({ multiple: false, directory: true });
    return typeof sel === 'string' ? sel : null;
}

export function pickImage() {
    return pickOne('Image', ['png', 'jpg', 'jpeg']);
}

/** Browse for a font file the engine takes (null outside the app). */
export function pickFont() {
    return pickOne('Font', ['ttf', 'otf']);
}

export function pickAudio() {
    return pickOne('Audio', ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac']);
}

/** Native save flow: the user picks the destination, bytes go straight
 *  to disk. Plain anchor downloads don't run inside the webview, so
 *  every export (videos, upload kits) goes through here. Resolves the
 *  saved path, or null when the user cancels. */
export async function saveFile(data, { filename, filters }) {
    if (!isTauri()) return null;
    const dest = await save({ defaultPath: filename, filters });
    if (!dest) return null;
    await writeFile(dest, data);
    return dest;
}

/** Shared dual-scope drag-drop subscription: Rust targets `tauri://drag-*`
 *  at the window, so the webview-scoped listener alone can stay deaf
 *  while the window-scoped one hears everything (and vice versa across
 *  versions). Returns an unlisten-all cleanup. */
function hookDragDrop(handler) {
    const offs = [];
    function hook(getTarget) {
        let target = null;
        try {
            target = getTarget();
        } catch {
            return;
        }
        if (!target || typeof target.onDragDropEvent !== 'function') return;
        target
            .onDragDropEvent(handler)
            .then((u) => {
                offs.push(u);
            })
            .catch(() => {});
    }
    hook(getCurrentWebview);
    hook(getCurrentWindow);
    return () => {
        offs.forEach((u) => {
            try {
                u();
            } catch {
            }
        });
    };
}

/** Window-level file drops (Tauri drag-drop event carries real paths,
 *  unlike web drop events). `cb(paths[])` on completed drops only.
 *  Deliveries are deduped by path so a double delivery still starts
 *  exactly one job. */
export function onFilesDropped(cb) {
    let dead = false;
    const seen = new Map();
    const off = hookDragDrop((e) => {
        if (dead || e.payload?.type !== 'drop') return;
        const paths = e.payload.paths;
        if (!Array.isArray(paths)) return;
        const now = Date.now();
        const fresh = paths.filter((p) => now - (seen.get(p) ?? 0) > 2000);
        fresh.forEach((p) => seen.set(p, now));
        if (fresh.length) cb(fresh);
    });
    return () => {
        dead = true;
        off();
    };
}

/** Drag-hover mirror for the dropzone highlight: enter/over lights it,
 *  leave/drop clears it. Driven by the same OS channel drops arrive on
 *  (provably alive) instead of DOM drag events, which the shell's own
 *  drop handling can swallow before the page ever sees them. */
export function onDragHover(cb) {
    let dead = false;
    const off = hookDragDrop((e) => {
        if (dead) return;
        const t = e.payload?.type;
        if (t === 'enter' || t === 'over') cb(true);
        else if (t === 'leave' || t === 'drop') cb(false);
    });
    return () => {
        dead = true;
        off();
    };
}

// ---------------------------------------------------------------------------
// Tray: the app keeps running with its window closed. The tray menu is a
// second webview (label `tray`) running this same bundle.
// ---------------------------------------------------------------------------

/** Which window this page runs in: `main` or `tray` (null in a browser). */
export function windowLabel() {
    if (!isTauri()) return null;
    try {
        return getCurrentWindow().label;
    } catch {
        return null;
    }
}

/** `{ close_to_tray, tray_hint_seen, autostart, tray }` (null in a browser). */
export function shellPrefs() {
    if (!isTauri()) return Promise.resolve(null);
    return invoke('shell_prefs').catch(() => null);
}

export function setCloseToTray(on) {
    return invoke('set_close_to_tray', { on });
}

/** Launch at sign-in (starts hidden in the tray). */
export function setAutostart(on) {
    return invoke('set_autostart', { on });
}

/** Either window changed a shell pref: re-read them. */
export function onShellPrefs(fn) {
    return listen('digiclip:shell-prefs', () => fn());
}

/** Show the main window, optionally on a page (`home`, `settings`, …). */
export function openMain(page) {
    return invoke('open_main', { page: page ?? null }).catch(() => {});
}

export function hideTrayMenu() {
    return invoke('hide_tray_menu').catch(() => {});
}

/** The menu window follows its content's height. */
export function trayMenuSize(height) {
    return invoke('tray_menu_size', { height }).catch(() => {});
}

/** Stop the engine and exit (the tray's Quit). */
export function quitApp() {
    return invoke('quit_app').catch(() => {});
}

export function setTrayText(tooltip, open, quit) {
    return invoke('set_tray_text', { tooltip, open, quit }).catch(() => {});
}

export function onTrayOpen(fn) {
    return listen('digiclip:tray-open', () => fn());
}

export function onNavigate(fn) {
    return listen('digiclip:navigate', (e) => fn(e.payload));
}

/** Settings saved in one window reach the other: the engine answers a
 *  save only to the socket that sent it. */
export function broadcastSettings(settings) {
    if (!isTauri()) return;
    emit('digiclip:settings', settings).catch(() => {});
}

export function onSettings(fn) {
    return listen('digiclip:settings', (e) => fn(e.payload));
}
