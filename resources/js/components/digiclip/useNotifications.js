import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * In-app notification feed. Polls the unread endpoint; anything that
 * arrives while the window is focused becomes a toast. Arrivals while
 * away already went out as desktop banners (Notifier routing), so a
 * refocus baselines them silently instead of double-pinging.
 */
export function useNotifications({ pollMs = 5000 } = {}) {
    const [toasts, setToasts] = useState([]);
    const seenRef = useRef(new Set());
    const baselinedRef = useRef(false);

    const markRead = useCallback((ids) => {
        if (ids.length === 0) return;
        const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
        fetch('/api/notifications/read', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': token,
                'X-Requested-With': 'XMLHttpRequest',
                Accept: 'application/json',
            },
            body: JSON.stringify({ ids }),
        }).catch(() => {});
    }, []);

    const dismiss = useCallback((id) => {
        setToasts((ts) => ts.filter((t) => t.id !== id));
        markRead([id]);
    }, [markRead]);

    // New arrivals only toast when the window is actually looking at them.
    const ingest = useCallback((items, { silent = false } = {}) => {
        const fresh = items.filter((n) => !seenRef.current.has(n.id));
        fresh.forEach((n) => seenRef.current.add(n.id));
        if (silent || fresh.length === 0) {
            if (silent && fresh.length > 0) markRead(fresh.map((n) => n.id));
            return;
        }
        if (!document.hasFocus()) {
            // Away: desktop banner already sent, don't stack toasts for later.
            markRead(fresh.map((n) => n.id));
            return;
        }
        setToasts((ts) => [...ts, ...fresh].slice(-4));
        markRead(fresh.map((n) => n.id));
    }, [markRead]);

    useEffect(() => {
        let dead = false;
        const load = (silent) => fetch('/api/notifications', { headers: { Accept: 'application/json' } })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (!dead && j?.notifications) ingest(j.notifications, { silent }); })
            .catch(() => {});
        load(true);
        baselinedRef.current = true;
        const t = setInterval(() => load(false), pollMs);
        // Refocusing means the away-period banners already fired in the OS:
        // absorb the backlog quietly.
        const onFocus = () => load(true);
        window.addEventListener('focus', onFocus);
        return () => { dead = true; clearInterval(t); window.removeEventListener('focus', onFocus); };
    }, [ingest, pollMs]);

    return { toasts, dismiss };
}
