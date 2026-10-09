// The camera, layout and effects designers' maps: which inspector section owns
// which field of the Look section, in the same shape as the headline, bar and
// logo maps (`layerSections.js`, whose helpers work on any of them). A
// section with no Look field of its own edits a flat option instead: the
// layout choice, the merge flash (`flat`). No React, no DOM.
//
// Every field of the specs appears under exactly one section; the panel builds
// its number and choice controls from `numSpec`, `numUi` and `enums`.
import { CAMERA_SPECS, EFFECTS_SPECS, FEELS, GRADES, LAYOUT_SPECS } from './sceneFields.js';
import { LAYOUTS } from './look.js';

export const CAMERA_LAYER = {
    id: 'camera',
    specs: CAMERA_SPECS,
    ids: ['movement', 'zoom', 'punch'],
    paths: { movement: ['feel'], zoom: ['zoom'], punch: ['punch'] },
    cap: { movement: 'look.camera', zoom: 'look.camera', punch: 'look.camera' },
    aliases: {},
    enums: { feel: FEELS },
    /** The flat options a section also edits (the punch-ins switch is the Home popover's too). */
    flat: { punch: ['punch'] },
};

export const EFFECTS_LAYER = {
    id: 'effects',
    specs: EFFECTS_SPECS,
    ids: ['vignette', 'colour', 'fill'],
    paths: { vignette: ['vignette'], colour: ['grade'], fill: ['fill_dim'] },
    cap: { vignette: 'look.effects', colour: 'look.effects', fill: 'look.effects' },
    aliases: {},
    enums: { grade: GRADES },
    flat: {},
};

export const LAYOUT_LAYER = {
    id: 'layout',
    specs: LAYOUT_SPECS,
    ids: ['layout', 'split', 'cuts'],
    paths: { layout: [], split: ['split'], cuts: [] },
    cap: { layout: 'look.layout', split: 'look.layout', cuts: 'look.layout' },
    aliases: {},
    enums: {},
    flat: { layout: ['layout'], cuts: ['merge_flash'] },
    choices: { layout: LAYOUTS },
};

export const SCENE_LAYERS = { camera: CAMERA_LAYER, effects: EFFECTS_LAYER, layout: LAYOUT_LAYER };

/** What the flat options are when nothing was chosen: the layout choice goes
 *  back to Single, the merge flash to off. (The punch-ins switch has no
 *  default of its own: it follows the saved settings.) */
export const FLAT_DEFAULTS = { layout: 'single', merge_flash: false };
