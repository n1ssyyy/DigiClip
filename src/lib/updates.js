/**
 * App updates, routed through the custom DigiClip Setup wizard.
 *
 * The app itself never replaces its files: it checks the published
 * `latest.json` (one tiny GET, no plugin), and when a newer version
 * exists the "Update" action fetches the Setup wizard (once, into the
 * user-data dir), launches it, and exits. The wizard detects the
 * running app, closes it, downloads the signed payload, and lays the
 * new build in — same custom UI as a fresh install.
 *
 * Phases: idle → checking → uptodate | available → handing-off
 * (setup running) — error anywhere lands on `error` with copy.
 */

import { useSyncExternalStore } from 'react';
import { isTauri } from './native.js';

const AUTO_KEY = 'digiclip.updates.auto';
const MANIFEST = 'https://github.com/n1ssyyy/DigiClip/releases/latest/download/latest.json';
const SETUP_URL = 'https://github.com/n1ssyyy/DigiClip/releases/latest/download/DigiClip-Setup.exe';

const U = {
    phase: 'idle', // idle | checking | uptodate | available | handing-off | error | unsupported
    current: null, // installed app version
    appVersion: null, // installed app version (lazy, no network)
    available: null, // { version, notes, date }
    error: null,
    lastCheck: 0,
    dismissed: null, // version the user waved away this session (banner only)
    auto: readAuto(),
};

function readAuto() {
    try {
        const v = localStorage.getItem(AUTO_KEY);
        return v === null ? true : v === '1';
    } catch {
        return true;
    }
}

const listeners = new Set();

function emit() {
    listeners.forEach((l) => {
        try {
            l();
        } catch {
            // A dead subscriber never breaks the store.
        }
    });
}

function subscribe(l) {
    listeners.add(l);
    return () => listeners.delete(l);
}

function snapshot() {
    return U;
}

export function useUpdates(sel) {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useSyncExternalStore(subscribe, () => (sel ? sel(snapshot()) : snapshot()));
}

export function updateAutoEnabled() {
    return U.auto;
}

export function setAutoUpdate(on) {
    U.auto = !!on;
    try {
        localStorage.setItem(AUTO_KEY, U.auto ? '1' : '0');
    } catch {
    }
    emit();
}

function set(patch) {
    Object.assign(U, patch);
    emit();
}

/** App (shell) version for display — the Settings header badge, anywhere the
 * engine version would be the wrong number. Cached after first read.
 * Null outside the Tauri shell (browser dev).
 */
export async function ensureAppVersion() {
    if (U.appVersion) return U.appVersion;
    if (!isTauri()) return null;
    try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const v = await getVersion();
        set({ appVersion: v, current: U.current ?? v });
        return v;
    } catch {
        return null;
    }
}

/** Compare dotted versions ("2.2.1" vs "2.10.0"): -1 | 0 | 1. */
function cmpVersions(a, b) {
    const pa = String(a ?? '').replace(/^[vV]/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b ?? '').replace(/^[vV]/, '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
}

export function dismissUpdate() {
    set({ dismissed: U.available?.version ?? null });
}

/** Silent boot check: one GET of latest.json, no plugin, no prompt. */
export async function checkForUpdates({ silent = false } = {}) {
    if (!isTauri()) {
        set({ phase: 'unsupported' });
        return null;
    }
    if (U.phase === 'checking') return null;
    set({ phase: 'checking', error: null });
    try {
        const current = (await ensureAppVersion()) ?? U.current;
        const res = await fetch(MANIFEST, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const version = String(data.version ?? '').replace(/^[vV]/, '');
        if (!version) throw new Error('Manifest has no version.');
        set({ lastCheck: Date.now(), current });
        if (cmpVersions(version, current) > 0) {
            const available = { version, notes: data.notes ?? '', date: data.pub_date ?? '' };
            set({ phase: 'available', available });
            return available;
        }
        set({ phase: 'uptodate', available: null });
        return null;
    } catch (e) {
        // Unreachable feed (offline, or no published latest.json yet) is
        // routine — only loud on a manual check, never on boot.
        set({ phase: 'error', error: e?.message ?? String(e) });
        if (!silent) throw e;
        return null;
    }
}

/**
 * Hand off to the custom Setup wizard: reuse the bundled/downloaded copy
 * when present, otherwise fetch it once. The shell launches it and exits
 * this app so files are free to replace.
 */
export async function runSetup() {
    if (U.phase === 'handing-off') return;
    set({ phase: 'handing-off', error: null });
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        let path = await invoke('get_setup').catch(() => null);
        if (!path) {
            path = await invoke('download_setup');
        }
        await invoke('run_setup', { path });
        // The shell exits right after launching; this is only reached if
        // the launch failed.
        set({ phase: 'error', error: 'Setup could not be started.' });
    } catch (e) {
        set({ phase: 'error', error: e?.message ?? String(e) });
    }
}

export { SETUP_URL };
