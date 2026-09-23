/**
 * Tauri bridge: window controls, file picking, drag-drop, external links.
 * Same call shapes the old Titlebar/WindowController offered, minus the
 * HTTP round-trip — these are direct shell invokes now.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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

/** Browse for a source video (dialog plugin, native picker). */
export async function pickVideo() {
    const sel = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4a'] }],
    });
    return typeof sel === 'string' ? sel : null;
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
