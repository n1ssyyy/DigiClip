/**
 * Thin bridge to the setup shell: machine detection and the
 * install/uninstall commands. The app payload is embedded in Setup, so
 * nothing here touches the network.
 */
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function closeSetup() {
    return getCurrentWindow().close().catch(() => {});
}

export function detect() {
    return invoke('detect');
}
/** Lay the embedded build down; `clean` wipes the old install first. */
export function installApp(installDir, clean = false) {
    return invoke('install', { installDir, clean });
}

export function launchApp(installDir) {
    return invoke('launch_app', { installDir }).catch(() => null);
}

export function uninstallApp() {
    return invoke('uninstall');
}

export function appRunning() {
    return invoke('app_running');
}

export function stopApp() {
    return invoke('stop_app');
}

export function openExternal(url) {
    return invoke('open_url', { url }).catch(() => {});
}

/** Frameless window: native drag for the header. */
export function dragWindow() {
    return invoke('drag_window').catch(() => {});
}

/** Compare dotted versions ("2.2.1" vs "2.10.0"): -1 | 0 | 1. */
export function cmpVersions(a, b) {
    const pa = String(a ?? '').replace(/^[vV]/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b ?? '').replace(/^[vV]/, '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
}
