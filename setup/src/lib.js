/**
 * Thin bridge to the setup shell: install detection, release lookup,
 * download/install/uninstall commands, download progress events.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function closeSetup() {
    return getCurrentWindow().close().catch(() => {});
}

export function detectInstall() {
    return invoke('detect_install');
}

export function fetchLatest() {
    return invoke('fetch_latest');
}

export function downloadSetup(url) {
    return invoke('download_setup', { url });
}

export function installSilent(path) {
    return invoke('install_silent', { path });
}

export function uninstallSilent() {
    return invoke('uninstall_silent');
}

export function launchApp() {
    return invoke('launch_app').catch(() => null);
}

export function isAppRunning() {
    return invoke('is_app_running');
}

export function closeApp() {
    return invoke('close_app');
}

export function onDownloadProgress(fn) {
    return listen('setup:download', (e) => fn(e.payload));
}

export function openExternal(url) {
    return invoke('open_url', { url }).catch(() => {});
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
