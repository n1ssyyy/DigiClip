/**
 * App updates, routed through the custom DigiClip Setup wizard.
 *
 * The app itself never replaces its files. The shell asks GitHub for the
 * latest release (Rust side — no CSP/CORS in the way), and "Update"
 * downloads this platform's DigiClip Setup (the offline installer with
 * the new build inside), launches it and exits. Setup closes anything
 * still running and lays the new build in — same custom UI as a fresh
 * install.
 *
 * Phases: idle → checking → uptodate | available → downloading →
 * handing-off (setup running) — error anywhere lands on `error` with copy.
 */

import { useSyncExternalStore } from 'react';
import { isTauri } from './native.js';

const AUTO_KEY = 'digiclip.updates.auto';
const RELEASES_URL = 'https://github.com/n1ssyyy/DigiClip/releases/latest';

const U = {
    phase: 'idle', // idle | checking | uptodate | available | downloading | handing-off | error | unsupported
    current: null, // installed app version
    appVersion: null, // installed app version (lazy, no network)
    available: null, // { version, notes, date, setupUrl }
    pct: null, // Setup download progress (0-100) while `downloading`
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

/** Silent boot check: one GitHub API call, no plugin, no prompt. */
export async function checkForUpdates({ silent = false } = {}) {
    if (!isTauri()) {
        set({ phase: 'unsupported' });
        return null;
    }
    if (U.phase === 'checking') return null;
    set({ phase: 'checking', error: null });
    try {
        const current = (await ensureAppVersion()) ?? U.current;
        const { invoke } = await import('@tauri-apps/api/core');
        const data = await invoke('check_update');
        const version = String(data.version ?? '').replace(/^[vV]/, '');
        if (!version) throw new Error('Latest release has no version.');
        set({ lastCheck: Date.now(), current });
        if (cmpVersions(version, current) > 0) {
            const available = { version, notes: data.notes ?? '', date: data.date ?? '', setupUrl: data.setupUrl ?? null };
            set({ phase: 'available', available });
            return available;
        }
        set({ phase: 'uptodate', available: null });
        return null;
    } catch (e) {
        // Unreachable GitHub (offline, rate-limited) is routine — only loud
        // on a manual check, never on boot.
        set({ phase: 'error', error: e?.message ?? String(e) });
        if (!silent) throw e;
        return null;
    }
}

/**
 * Hand off to the custom Setup wizard: download this platform's Setup from
 * the release, launch it, and let the shell exit this app so its files are
 * free to replace.
 */
export async function runSetup() {
    if (U.phase === 'downloading' || U.phase === 'handing-off') return;
    const url = U.available?.setupUrl;
    if (!url) {
        set({
            phase: 'error',
            error: `No DigiClip Setup for this platform in v${U.available?.version ?? '?'} — get it from ${RELEASES_URL}`,
        });
        return;
    }
    set({ phase: 'downloading', pct: 0, error: null });
    let off = null;
    try {
        const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]);
        off = await listen('digiclip:update-progress', (e) => {
            const { done, total } = e.payload ?? {};
            if (total > 0) set({ pct: Math.min(100, Math.round((done / total) * 100)) });
        });
        const path = await invoke('download_setup', { url });
        set({ phase: 'handing-off', pct: null });
        await invoke('run_setup', { path });
        // The shell exits right after launching; this is only reached if
        // the launch failed.
        set({ phase: 'error', error: 'Setup could not be started.' });
    } catch (e) {
        set({ phase: 'error', pct: null, error: e?.message ?? String(e) });
    } finally {
        off?.();
    }
}
