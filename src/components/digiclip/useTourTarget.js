import { useLayoutEffect, useState } from 'react';

/** The element carrying `data-tour="key"` that is actually on screen (the
 *  first one that is displayed and not hidden), or null. */
export function findTourTarget(key) {
    if (!key || typeof document === 'undefined') return null;
    for (const el of document.querySelectorAll(`[data-tour="${key}"]`)) {
        if (!el.getClientRects().length) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        return el;
    }
    return null;
}

const same = (a, b) => a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

/**
 * Where the target is, in the overlay's own coordinates, and how big the
 * overlay (the window below the title bar) is. It follows window resizes,
 * the target's own size, and settles through the page's entrance motion with
 * a short burst of frame-by-frame measuring after each change, instead of
 * running a loop for as long as the tour is open. `watch` lists values whose
 * change should re-measure (a step, the number of videos).
 * @returns {{win: {w:number,h:number}|null, rect: object|null}}
 */
export default function useTourTarget(overlayRef, key, watch = []) {
    const [m, setM] = useState({ win: null, rect: null });

    useLayoutEffect(() => {
        const ov = overlayRef.current;
        if (!ov) return undefined;
        let raf = 0;
        let until = 0;
        let watched = null;
        const measure = () => {
            const o = ov.getBoundingClientRect();
            const win = { w: Math.round(o.width), h: Math.round(o.height) };
            const el = findTourTarget(key);
            if (el !== watched) {
                if (watched) ro.unobserve(watched);
                if (el) ro.observe(el);
                watched = el;
            }
            let rect = null;
            if (el) {
                const r = el.getBoundingClientRect();
                rect = { left: r.left - o.left, top: r.top - o.top, width: r.width, height: r.height };
            }
            setM((prev) => (prev.win && prev.win.w === win.w && prev.win.h === win.h && same(prev.rect, rect) ? prev : { win, rect }));
        };
        const tick = () => {
            raf = 0;
            measure();
            if (performance.now() < until) raf = requestAnimationFrame(tick);
        };
        const burst = () => {
            until = performance.now() + 1100;
            if (!raf) raf = requestAnimationFrame(tick);
        };
        const ro = new ResizeObserver(burst);
        ro.observe(ov);
        measure();
        burst();
        window.addEventListener('resize', burst);
        return () => {
            window.removeEventListener('resize', burst);
            ro.disconnect();
            if (raf) cancelAnimationFrame(raf);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [overlayRef, key, ...watch]);

    return m;
}
