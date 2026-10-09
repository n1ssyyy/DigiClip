// The headline, bar and logo designers' maps: which inspector section owns
// which field of the layer's Look section, and the pure logic of a section
// ("does it change anything", "put it back"). The caption map is
// `captionSections.js`; this is the same thing for the other three layers.
// No React, no DOM, importable from Node.
//
// A layer's `paths` is the one declarative list: every field its specs hold
// appears under exactly one section, the section whose controls edit it, and
// the panel builds its number and choice controls from `numSpec` and `enums`,
// so a field cannot gain a range there without gaining a control here.
import { ALIGNS, EASES, ENTER_KINDS, EXIT_KINDS } from './captionFields.js';
import {
    ACCENT_WORDS, BAR_POSITIONS, BAR_SPECS, CASES, HEADLINE_ANIMS, HEADLINE_SPECS, LOGO_SPECS,
} from './layerFields.js';
import { hasOverrides, keysOf, resetPatch, uiOfSpec } from './sectionKit.js';

const FX_V2_NOTE = 'look.headline.v2';

export const HEADLINE_LAYER = {
    id: 'headline',
    specs: HEADLINE_SPECS,
    ids: ['headline', 'type', 'fill', 'shadow', 'card', 'motion'],
    paths: {
        headline: ['accent_word'],
        type: ['font', 'case', 'size', 'spacing', 'align', 'max_lines', 'width', 'x', 'y'],
        fill: ['ink', 'accent', 'stroke.color', 'stroke.width'],
        shadow: [
            'shadow.color', 'shadow.x', 'shadow.y', 'shadow.blur', 'shadow.opacity',
            'glow.color', 'glow.size', 'glow.strength',
        ],
        card: ['card', 'card.color', 'card.opacity', 'card.pad', 'card.radius'],
        motion: ['anim', 'enter.kind', 'enter.ms', 'enter.ease', 'exit.kind', 'exit.ms', 'delay_s', 'seconds'],
    },
    /** The engine ability a section needs; the first section needs the base. */
    cap: { headline: 'look.headline', type: FX_V2_NOTE, fill: FX_V2_NOTE, shadow: FX_V2_NOTE, card: FX_V2_NOTE, motion: FX_V2_NOTE },
    /** The v1 fields a v2 control also edits: the field, and the path whose control shows it. */
    aliases: { anim: 'enter.kind' },
    /** The order a choice control lists the values of an enum field. */
    enums: {
        case: CASES,
        align: ALIGNS,
        accent_word: ACCENT_WORDS,
        anim: HEADLINE_ANIMS,
        'enter.kind': ENTER_KINDS,
        'enter.ease': EASES,
        'exit.kind': EXIT_KINDS,
    },
};

export const BAR_LAYER = {
    id: 'bar',
    specs: BAR_SPECS,
    ids: ['bar', 'track', 'shape', 'glow'],
    paths: {
        bar: ['pos', 'height', 'color'],
        track: ['track', 'track_opacity'],
        shape: ['inset', 'radius'],
        glow: ['glow.color', 'glow.size', 'glow.strength'],
    },
    cap: { bar: 'look.bar', track: 'look.bar.v2', shape: 'look.bar.v2', glow: 'look.bar.v2' },
    aliases: {},
    enums: { pos: BAR_POSITIONS },
};

export const LOGO_LAYER = {
    id: 'logo',
    specs: LOGO_SPECS,
    ids: ['logo', 'rotation', 'shadow'],
    paths: {
        logo: ['x', 'y', 'size', 'opacity'],
        rotation: ['rotate'],
        shadow: [
            'shadow.color', 'shadow.x', 'shadow.y', 'shadow.blur', 'shadow.opacity',
            'glow.color', 'glow.size', 'glow.strength',
        ],
    },
    cap: { logo: 'look.logo', rotation: 'look.logo.v2', shadow: 'look.logo.v2' },
    aliases: {},
    enums: {},
};

export const LAYERS = { headline: HEADLINE_LAYER, bar: BAR_LAYER, logo: LOGO_LAYER };

/** The section that owns a field path of a layer. */
export const sectionOf = (def, path) => def.ids.find((s) => def.paths[s].includes(path));

/** Spec of a number field of a layer by path, or undefined. */
export function numSpec(def, path) {
    const s = def.specs[path];
    return s && s.type === 'number' ? s : undefined;
}

/** How a number of a layer reads (see `uiOfSpec`). */
export const numUi = (def, path) => uiOfSpec(numSpec(def, path));

/** The top-level fields of the layer's Look section a section edits. */
export const sectionKeys = (def, id) => keysOf(def.paths[id]);

/** Does the Look change anything the section controls? */
export const sectionHasOverrides = (def, L, id) => hasOverrides(L, def.paths[id]);

/** The patch that puts a section back to the defaults: every field it owns,
 *  cleared. One patch is one undo step. */
export const sectionResetPatch = (def, L, id) => resetPatch(L, def.paths[id]);

/** Sections that change something, in panel order. */
export const dirtySections = (def, L) => def.ids.filter((s) => sectionHasOverrides(def, L, s));
