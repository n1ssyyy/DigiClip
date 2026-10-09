// Helpers and the fixture the headline, bar and logo tests share.
import assert from 'node:assert/strict';
import { createLookStore } from '../src/lib/look.js';
import { cleanBar, cleanHeadline, cleanLogo } from '../src/lib/layerFields.js';

export const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
export function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), _m: m };
}
export function clocked() {
    let t = 1000;
    return { now: () => t, tick: (ms) => { t += ms; } };
}
export const fresh = (c = clocked()) => {
    const s = createLookStore({ storage: memoryStorage(), now: c.now });
    s.seed(null);
    return [s, c];
};
export const look = (s) => s.get().options.look;

/** A Look section with every field the specs name. */
export const FULL = {
    headline: {
        opacity: 0.8, x: 0.5, y: 0.2, size: 1.2, font: 'Anton', case: 'upper', spacing: 0.05, align: 'left', max_lines: 2, width: 0.8,
        ink: '#FFFFFF', accent: '#FFD400', stroke: { color: '#000000', width: 3 },
        shadow: { color: '#000000', x: 2, y: 6, blur: 8, opacity: 0.5 }, glow: { color: '#00E5FF', size: 12, strength: 0.7 },
        card: { color: '#101826', opacity: 0.8, pad: 30, radius: 0.5 }, accent_word: 'last', anim: 'fade',
        enter: { kind: 'slide_down', ms: 400, ease: 'back' }, exit: { kind: 'blur', ms: 300 }, delay_s: 0.5, seconds: 4,
    },
    bar: {
        opacity: 0.6, pos: 'top', height: 1.5, color: '#FF3B30', track: '#FFFFFF', track_opacity: 0.3, inset: 0.04, radius: 1,
        glow: { color: '#00E5FF', size: 14, strength: 0.5 },
    },
    logo: {
        x: 0.9, y: 0.1, size: 1.5, opacity: 0.5, rotate: -12,
        shadow: { color: '#000000', x: 2, y: 6, blur: 8, opacity: 0.5 }, glow: { color: '#FFD400', size: 10, strength: 0.6 },
    },
};
export const CLEAN = { headline: cleanHeadline, bar: cleanBar, logo: cleanLogo };
export const SET = { headline: 'setHeadline', bar: 'setBar', logo: 'setLogo' };
