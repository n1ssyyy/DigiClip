// What every inspector section does, whichever layer it belongs to: how a
// number reads, whether a section changes anything, and the patch that puts
// it back. Used by the caption map (`captionSections.js`) and by the
// headline, bar and logo maps (`layerSections.js`). Pure: no React, no DOM.

const decimals = (n) => {
    const s = String(Math.round(n * 1e6) / 1e6);
    return s.includes('.') ? s.split('.')[1].length : 0;
};

/**
 * How a number is shown to the person: the factor from the stored value, the
 * unit text and the decimals. Shares of the type size and 0..1 amounts read
 * as percent (`plain` keeps a ratio a plain multiple).
 */
export function uiOfSpec(spec, plain = false) {
    if (!spec || spec.type !== 'number') return undefined;
    let k = 1;
    let unit = '';
    if (spec.unit === 'em' || (spec.unit === 'ratio' && !plain)) {
        k = 100;
        unit = '%';
    } else if (spec.unit === 'px') unit = 'px';
    else if (spec.unit === 'deg') unit = '°';
    else if (spec.unit === 'ms') unit = 'ms';
    else if (spec.unit === 's') unit = 's';
    return { k, unit, digits: Math.min(2, decimals(spec.step * k)) };
}

/** Something real in the value: a plain value, or an object with such a value. */
export function present(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) return Object.values(v).some(present);
    if (typeof v === 'string') return v !== '';
    return typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
}

/** The top-level fields of a Look section that a list of dotted paths edits. */
export const keysOf = (paths) => [...new Set(paths.map((p) => p.split('.')[0]))];

/** Does the Look hold anything for these paths? */
export const hasOverrides = (L, paths) => keysOf(paths).some((k) => present(L?.[k]));

/** The patch that puts these paths back to their defaults: every field they
 *  own that is set, cleared. One patch is one undo step. */
export function resetPatch(L, paths) {
    const patch = {};
    for (const k of keysOf(paths)) if (present(L?.[k])) patch[k] = undefined;
    return patch;
}
