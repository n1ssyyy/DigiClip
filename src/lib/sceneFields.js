// Every field of the Look's camera, effects and layout sections, in one place:
// the enums, the ranges and the values the engine uses when a field is absent
// (digiclip-rs `src/look.rs`, `camera.rs`, `compose.rs`). They are read the
// way the engine reads them (`readFlat`, shared with the headline, bar and
// logo): a number is clamped into its range, anything unusable is absent.
// Pure data and functions: no React, no DOM.
import { plain } from './captionFields.js';
import { readFlat } from './layerFields.js';

export const FEELS = ['locked', 'steady', 'smooth', 'lively'];
export const GRADES = ['none', 'warm', 'cool', 'mono', 'punchy'];

/** The peak scale of an emphasis punch-in when the Look says nothing
 *  (`PunchCfg::default`). */
export const PUNCH_TODAY = 1.18;
/** The `fill_dim` that gives today's darkness of the blurred fill. */
export const FILL_DIM_TODAY = 0.4;
/** The seam of an even split. */
export const SPLIT_EVEN = 0.5;

const ratio = (min, max, step, def) => ({ type: 'number', min, max, step, unit: 'ratio', def });

/** `look.camera`. `feel` smooth, `zoom` 1 and no `punch` are today's camera. */
export const CAMERA_SPECS = {
    feel: { type: 'enum', values: FEELS, def: 'smooth' },
    zoom: ratio(0.8, 1.4, 0.05, 1),
    punch: ratio(1, 1.4, 0.01, PUNCH_TODAY),
};

/** `look.effects`. */
export const EFFECTS_SPECS = {
    vignette: ratio(0, 1, 0.05, 0),
    grade: { type: 'enum', values: GRADES, def: 'none' },
    fill_dim: ratio(0, 1, 0.05, FILL_DIM_TODAY),
};

/** `look.layout`. */
export const LAYOUT_SPECS = {
    split: ratio(0.3, 0.7, 0.01, SPLIT_EVEN),
};

/** The specs of a scene section by its Look section. */
export const SCENE_SPECS = { camera: CAMERA_SPECS, effects: EFFECTS_SPECS, layout: LAYOUT_SPECS };

const reader = (specs) => (s) => readFlat(specs, plain(s) ?? {});

export const cleanCamera = reader(CAMERA_SPECS);
export const cleanEffects = reader(EFFECTS_SPECS);
export const cleanLayout = reader(LAYOUT_SPECS);
export const SCENE_CLEANERS = { camera: cleanCamera, effects: cleanEffects, layout: cleanLayout };
