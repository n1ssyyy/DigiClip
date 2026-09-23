/**
 * In-app updates, over the Tauri updater plugin (signed `latest.json` on
 * the GitHub releases page — see src-tauri/tauri.conf.json).
 *
 * One boot check (silent: no toast when up to date or unreachable) plus
 * manual checks from Settings. State lives here in a tiny external store
 * (same shape as lib/socket.js) so the banner, dialog and Settings row
 * all read one source of truth.
 *
 * Phases: idle → checking → uptodate | available → downloading → ready
 * (restart applies it) — error anywhere lands on `error` with copy.
 */

import { useSyncExternalStore } from 'react';
import { isTauri } from './native.js';

const AUTO_KEY = 'digiclip.updates.auto';

const U = {
    phase: 'idle', // idle | checking | uptodate | available | downloading | ready | installing | error | unsupported
    current: null, // installed version string
    available: null, // { version, notes, date }
    total: 0, // expected download bytes (0 = unknown)
    done: 0, // downloaded bytes so far
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

let pending = null; // inflight Update object from check()
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

/** Silent boot check: resolves when settled, never throws. */
export async function checkForUpdates({ silent = false } = {}) {
    if (!isTauri()) {
        set({ phase: 'unsupported' });
        return null;
    }
    if (U.phase === 'checking' || U.phase === 'downloading' || U.phase === 'installing') return null;
    set({ phase: 'checking', error: null });
    try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const { check } = await import('@tauri-apps/plugin-updater');
        const current = await getVersion().catch(() => null);
        const update = await check();
        set({ lastCheck: Date.now() });
        if (!update) {
            pending = null;
            set({ phase: 'uptodate', current: current ?? U.current, available: null });
            return null;
        }
        pending = update;
        const available = {
            version: update.version,
            notes: update.body ?? '',
            date: update.date ?? '',
        };
        set({ phase: 'available', current: current ?? U.current, available });
        return available;
    } catch (e) {
        // Unreachable server (offline, or no published latest.json yet) is
        // routine — only loud on a manual check, never on boot.
        pending = null;
        const raw = e?.message ?? String(e);
        // No signed build published for this OS/arch (e.g. Intel Macs while
        // only arm64 ships) — plain words, not the updater's target key.
        const msg = /Target(?:s)?NotFound/i.test(raw)
            ? 'No update published for this machine yet.'
            : raw;
        set({ phase: 'error', error: msg });
        if (!silent) throw e;
        return null;
    }
}

export function dismissUpdate() {
    set({ dismissed: U.available?.version ?? null });
}

/** Download + install the pending update, then sit on `ready`. */
export async function downloadAndInstall() {
    if (!pending || U.phase === 'downloading' || U.phase === 'installing') return;
    set({ phase: 'downloading', done: 0, total: 0, error: null });
    try {
        let downloaded = 0;
        let total = 0;
        await pending.downloadAndInstall((ev) => {
            if (ev.event === 'Started') {
                total = ev.data.contentLength ?? 0;
                set({ total });
            } else if (ev.event === 'Progress') {
                downloaded += ev.data.chunkLength ?? 0;
                set({ done: downloaded, total });
            } else if (ev.event === 'Finished') {
                set({ done: total || downloaded, phase: 'installing' });
            }
        });
        // Installed — the new version starts on relaunch.
        set({ phase: 'ready' });
    } catch (e) {
        set({ phase: 'error', error: e?.message ?? String(e) });
        throw e;
    }
}

/** Relaunch into the installed update. */
export async function restartToUpdate() {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
}

export function updateProgress() {
    if (!U.total) return null;
    return Math.min(99, Math.round((U.done / U.total) * 100));
}
