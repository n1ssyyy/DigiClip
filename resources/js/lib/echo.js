import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

let echo = null;

export function getEcho() {
    if (echo) return echo;
    if (typeof window === 'undefined') return null;
    window.Pusher = window.Pusher ?? Pusher;
    echo = new Echo({
        broadcaster: 'reverb',
        key: import.meta.env.VITE_REVERB_APP_KEY,
        wsHost: import.meta.env.VITE_REVERB_HOST ?? '127.0.0.1',
        wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
        wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 8080),
        forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'http') === 'https',
        enabledTransports: ['ws'],
        disableStats: true,
    });
    return echo;
}

export function connectionState() {
    try {
        return getEcho()?.connector?.pusher?.connection?.state ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

export function onConnect(fn) {
    const conn = getEcho()?.connector?.pusher?.connection;
    if (!conn) return;
    // The singleton may already be connected (remount) — pusher never
    // replays past transitions, so sync state first.
    if (conn.state === 'connected') fn();
    conn.bind('connected', fn);
}

export function onDisconnect(fn) {
    const e = getEcho();
    e?.connector?.pusher?.connection?.bind('disconnected', fn);
}

// TEMP-DEBUG: report renderer-side socket states to the server log so we can
// see connection failures without devtools. Remove once Echo is stable.
export function beaconStates() {
    const e = getEcho();
    const conn = e?.connector?.pusher?.connection;
    if (!conn) {
        beacon('no-connector', typeof window !== 'undefined' && 'Pusher' in window ? 'has-window-pusher' : 'no-window-pusher');
        return;
    }
    ['connecting', 'connected', 'disconnected', 'failed', 'error', 'unavailable'].forEach((ev) =>
        conn.bind(ev, (detail) => beacon(ev, safeDetail(detail)))
    );
}

function safeDetail(detail) {
    try {
        if (!detail) return '';
        if (typeof detail === 'string') return detail.slice(0, 200);
        return JSON.stringify({ type: detail?.type, code: detail?.code, error: String(detail?.error ?? '').slice(0, 200) });
    } catch {
        return 'unserializable';
    }
}

function beacon(event, detail) {
    try {
        const q = new URLSearchParams({ event, detail: detail ?? '' }).toString();
        fetch(`/api/echo-debug?${q}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).catch(() => {});
    } catch {
    }
}
