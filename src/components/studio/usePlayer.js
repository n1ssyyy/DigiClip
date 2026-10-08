import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Subscribe to the playhead (seconds into the sample window). The
 *  clock lives outside React state so only the parts that draw the
 *  playhead re-render on each frame. */
export function useClock(clock) {
    return useSyncExternalStore(clock.subscribe, clock.get, clock.get);
}

/**
 * The stage's transport. While playing, the video's own `currentTime`
 * drives the playhead (requestAnimationFrame); when there is no usable
 * video (the stand-in, a load error, a stalled start) a timer does. The
 * window loops inside `len` seconds, scrubbing seeks the video at once.
 */
export function usePlayer({ len, start, videoRef, hasVideo, loop, resetKey }) {
    const [playing, setPlaying] = useState(false);
    const timeRef = useRef(0);
    const subs = useRef(new Set());
    const clock = useMemo(() => ({
        get: () => timeRef.current,
        subscribe: (f) => {
            subs.current.add(f);
            return () => subs.current.delete(f);
        },
    }), []);

    const live = useRef({});
    live.current = { len, start, hasVideo, loop };

    const setTime = useCallback((t) => {
        timeRef.current = t;
        subs.current.forEach((f) => f());
    }, []);

    const seek = useCallback((t) => {
        const { len: L, start: S, hasVideo: V } = live.current;
        const n = clamp(t, 0, L);
        setTime(n);
        const v = videoRef.current;
        if (v && V) {
            try {
                v.currentTime = S + n;
            } catch {
            }
        }
    }, [setTime, videoRef]);

    // A new sample starts from its first frame, paused. Only a different
    // sample does this: its details (clip start, length) arrive a moment
    // after the page opens and must not throw away a click on the scrubber
    // made in between.
    useEffect(() => {
        setPlaying(false);
        seek(0);
    }, [resetKey, seek]);

    // The window moved or changed length: keep the playhead where the
    // person put it (inside the new length) and land the video on it.
    useEffect(() => {
        if (timeRef.current > len) setTime(len);
        const v = videoRef.current;
        if (v && live.current.hasVideo) {
            try {
                v.currentTime = start + timeRef.current;
            } catch {
            }
        }
    }, [start, len, setTime, videoRef]);

    // The video element mounts after the sample changes: land it on the
    // playhead once it knows its length.
    const onLoadedMetadata = useCallback(() => {
        // Seeks made before the video knew its length wait here.
        const v = videoRef.current;
        if (!v) return;
        try {
            v.currentTime = live.current.start + timeRef.current;
        } catch {
        }
    }, [videoRef]);

    useEffect(() => {
        const v = videoRef.current;
        if (!playing) {
            if (v && hasVideo) v.pause();
            return undefined;
        }
        if (v && hasVideo) {
            try {
                v.currentTime = live.current.start + timeRef.current;
            } catch {
            }
            const p = v.play();
            if (p && p.catch) p.catch(() => {});
        }
        let raf = 0;
        let last = performance.now();
        const tick = (now) => {
            const dt = Math.min(0.25, (now - last) / 1000);
            last = now;
            const { len: L, start: S, hasVideo: V, loop: lp } = live.current;
            const vid = videoRef.current;
            const driven = V && vid && !vid.paused && vid.readyState >= 2 && !vid.error;
            const t = driven ? vid.currentTime - S : timeRef.current + dt;
            if (t >= L) {
                if (lp) {
                    seek(0);
                    if (V && vid) {
                        const p = vid.play();
                        if (p && p.catch) p.catch(() => {});
                    }
                } else {
                    setTime(L);
                    setPlaying(false);
                    return;
                }
            } else {
                setTime(Math.max(0, t));
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, hasVideo, resetKey, videoRef, seek, setTime]);

    // Leaving the page stops the picture.
    useEffect(() => () => {
        const v = videoRef.current;
        if (v) v.pause();
    }, [videoRef]);

    const toggle = useCallback(() => {
        setPlaying((p) => {
            // At the very end, play restarts the window.
            if (!p && timeRef.current >= live.current.len - 0.02) seek(0);
            return !p;
        });
    }, [seek]);

    return { clock, playing, toggle, seek, onLoadedMetadata };
}
