// What the camera, effects and layout controls show and write.
//
// A control shows the EFFECTIVE value: the Look's own when it sets the field,
// else what the engine does without it. `cameraView`, `effectsView` and
// `layoutView` answer `val(path)` / `isSet(path)` for every path of the
// section's map (`sceneSections.js`); the `...Patch` helpers turn a choice
// into the patch for the store (the default choice clears the field, so a
// Look that says "smooth" says nothing). The patches for numbers are
// `layerPatch` / `layerClear` of `layerEffective.js`. Pure: no React, no DOM.
import { FILL_DIM_TODAY, PUNCH_TODAY, SPLIT_EVEN, cleanCamera, cleanEffects, cleanLayout } from './sceneFields.js';
import { FLAT_DEFAULTS } from './sceneSections.js';
import { resetPatch } from './sectionKit.js';

const viewOf = (L, today) => ({
    L,
    val: (path) => L[path] ?? today[path],
    isSet: (path) => L[path] !== undefined,
});

/** The camera controls. `flat`: the options (`punch` is the on/off switch). */
export function cameraView(look, flat = {}) {
    const L = cleanCamera(look);
    return { ...viewOf(L, { feel: 'smooth', zoom: 1, punch: PUNCH_TODAY }), punchOn: !!flat.punch };
}

export function effectsView(look) {
    const L = cleanEffects(look);
    return viewOf(L, { vignette: 0, grade: 'none', fill_dim: FILL_DIM_TODAY });
}

/** The layout controls. `splitLive`: the layout splits (or may, on `auto`), so the seam counts. */
export function layoutView(look, flat = {}) {
    const L = cleanLayout(look);
    const layout = flat.layout ?? 'single';
    return { ...viewOf(L, { split: SPLIT_EVEN }), layout, splitLive: layout !== 'single' };
}

/** The camera feel: smooth is the engine's own, so it is no override. */
export const feelPatch = (v) => ({ feel: v === 'smooth' ? undefined : v });

/** The colour grade: none is the picture as it is. */
export const gradePatch = (v) => ({ grade: v === 'none' ? undefined : v });

/** The seam from a drag or a key: the even split is no override. */
export const splitPatch = (v) => ({ split: Math.abs(v - SPLIT_EVEN) < 0.005 ? undefined : v });

/** Does a section change anything? The Look's fields, and for the layout and
 *  cuts sections the flat option they edit. */
export function sceneChanged(def, L, flat, id) {
    if (def.id === 'layout' && id === 'layout') return (flat.layout ?? 'single') !== FLAT_DEFAULTS.layout;
    if (def.id === 'layout' && id === 'cuts') return !!flat.merge_flash;
    return def.paths[id].some((p) => L?.[p] !== undefined);
}

/** What puts a section back: the flat options it edits and the patch for the
 *  Look's section, applied together as one history step by `edit`. */
export function sceneReset(def, L, id) {
    const flat = {};
    for (const k of def.flat[id] ?? []) if (k in FLAT_DEFAULTS) flat[k] = FLAT_DEFAULTS[k];
    return { flat: Object.keys(flat).length ? flat : undefined, patch: resetPatch(L, def.paths[id]) };
}
