// Which fonts the stage may draw with right now. The Look names a font; the
// stage draws it only once its face is in the page (the four app fonts always
// are, any other once it has loaded from the engine) and draws the default
// until then, so text is never laid out with a fallback face and kept that
// way. Module state with a version number and subscribers: the hooks turn a
// change into a re-resolve and a re-measure. Pure: no React, no DOM.
import { appFont, sameFont } from './fontNames.js';

const key = (name) => String(name).trim().toLowerCase();

/** lower-case family -> the engine's spelling; null while the list is unknown. */
let installed = null;
/** lower-case family -> metrics, for faces that finished loading. */
const ready = new Map();
const failed = new Set();
let version = 0;
const subs = new Set();

function bump() {
    version += 1;
    subs.forEach((f) => {
        try {
            f();
        } catch {
        }
    });
}

export const fontVersion = () => version;

export function subscribeFonts(f) {
    subs.add(f);
    return () => subs.delete(f);
}

/**
 * The engine's fonts list arrived (an array of `{family}`) or is gone (null:
 * an older engine, or none yet). Faces of families that left the list are
 * forgotten; their names come back so the DOM glue can drop the `FontFace`.
 */
export function setInstalled(list) {
    const next = Array.isArray(list) ? new Map(list.map((f) => [key(f.family), f.family])) : null;
    const gone = [];
    for (const k of [...ready.keys()]) {
        if (!next || !next.has(k)) {
            gone.push(k);
            ready.delete(k);
        }
    }
    for (const k of [...failed]) if (!next || !next.has(k)) failed.delete(k);
    installed = next;
    bump();
    return gone;
}

/** A face finished loading: `metrics` are its file's (see `parseFontMetrics`). */
export function markReady(family, metrics) {
    failed.delete(key(family));
    ready.set(key(family), metrics ?? null);
    bump();
}

/** A face could not be loaded: the stage keeps the default for it. */
export function markFailed(family) {
    ready.delete(key(family));
    failed.add(key(family));
    bump();
}

/** Forget a family's face and failure (it was removed, or is being reloaded). */
export function forgetFace(family) {
    const a = ready.delete(key(family));
    const b = failed.delete(key(family));
    if (a || b) bump();
}

/** Back to nothing known (tests). */
export function resetFonts() {
    installed = null;
    ready.clear();
    failed.clear();
    version = 0;
}

/** The family as the engine spells it, when the list has it. */
export const canonicalFont = (name) => appFont(name) ?? installed?.get(key(name));

/**
 * The state of a named font on the stage:
 * `app` (bundled, always drawn), `ready`, `failed`, `missing` (the list is
 * known and does not have it) or `loading` (not drawn yet).
 */
export function faceStatus(name) {
    if (typeof name !== 'string' || !name.trim()) return 'missing';
    if (appFont(name)) return 'app';
    if (installed && !installed.has(key(name))) return 'missing';
    if (ready.has(key(name))) return 'ready';
    if (failed.has(key(name))) return 'failed';
    return 'loading';
}

/**
 * The font the stage draws for `name`: its canonical spelling when the face is
 * in the page, else `fallback` (the default). The same rule as the engine's
 * for a font it does not have.
 */
export function drawFont(name, fallback) {
    const s = faceStatus(name);
    if (s === 'app') return appFont(name);
    if (s === 'ready') return canonicalFont(name) ?? name.trim();
    return fallback;
}

/** Metrics of a loaded face (family in the engine's spelling), or undefined. */
export const faceMetrics = (family) => ready.get(key(family)) ?? undefined;

export { sameFont };
