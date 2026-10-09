// The caption designer's map: which inspector section owns which field of the
// Look's captions section, and the pure logic of a section ("does it change
// anything", "put it back"). No React, no DOM, importable from Node.
//
// `SECTION_PATHS` is the one declarative list: every field the Look can hold
// (the v1 ones and every path of `FIELD_SPECS`) appears under exactly one
// section, which is the section whose controls edit it. The panel builds its
// number controls from `numSpec` / `numUi`, so a field cannot gain a range
// here without gaining a control there.
import { hasOverrides, keysOf, resetPatch, uiOfSpec } from './sectionKit.js';
import { FIELD_SPECS, ALIGNS, BOX_PERS, EASES, ENTER_KINDS, EXIT_KINDS, FILLS, WORD_MODES } from './captionFields.js';

export const SECTION_IDS = ['style', 'type', 'fill', 'shadow', 'box', 'words', 'motion'];

/** The engine ability a section needs beyond the base `look.captions`. */
export const SECTION_CAP = {
    type: 'look.captions.type',
    fill: 'look.captions.fx',
    shadow: 'look.captions.fx',
    box: 'look.captions.fx',
    words: 'look.captions.words',
    motion: 'look.captions.motion',
};

const state = (name, fields) => fields.map((f) => `words.${name}.${f}`);

export const SECTION_PATHS = {
    style: ['show'],
    type: ['font', 'size', 'case', 'x', 'y', 'max_words', 'spacing', 'line_gap', 'lines', 'max_chars', 'align', 'rotate'],
    fill: ['color', 'stroke.color', 'stroke.width', 'outline', 'outline_w'],
    shadow: ['shadow', 'shadow.color', 'shadow.x', 'shadow.y', 'shadow.blur', 'shadow.opacity', 'glow', 'glow.color', 'glow.size', 'glow.strength'],
    box: ['box', 'box.color', 'box.opacity', 'box.pad_x', 'box.pad_y', 'box.radius', 'box.per', 'box_opacity'],
    words: [
        'active', 'accent',
        'words.mode', 'words.fill', 'words.attack_ms', 'words.attack_ease', 'words.hold_ms', 'words.release_ms', 'words.release_ease',
        ...state('upcoming', ['color', 'opacity', 'scale', 'blur']),
        ...state('active', ['color', 'opacity', 'scale', 'lift', 'rotate', 'stroke.color', 'stroke.width', 'glow.color', 'glow.size', 'glow.strength', 'box.color', 'box.opacity', 'box.radius']),
        ...state('spoken', ['color', 'opacity', 'scale', 'blur']),
        ...state('keyword', ['color', 'scale', 'glow.color', 'glow.size', 'glow.strength']),
    ],
    motion: ['anim', 'enter.kind', 'enter.ms', 'enter.ease', 'exit.kind', 'exit.ms'],
};

/** v1 fields that an older Look (or the Home popover) may hold and that a v2
 *  control now edits: the field, and the path whose control shows it. */
export const ALIASES = {
    outline: 'stroke.color',
    outline_w: 'stroke.width',
    box_opacity: 'box.opacity',
    active: 'words.active.color',
    accent: 'words.keyword.color',
    anim: 'enter.kind',
};

/** The v1 numbers' ranges (their steps), for the controls. */
const V1_NUM = {
    size: { type: 'number', min: 0.5, max: 2, step: 0.05, unit: 'ratio', def: 1 },
    max_words: { type: 'number', min: 1, max: 8, step: 1, unit: 'count', int: true },
};

/** The order a choice control lists the values of an enum field. */
export const ENUM_ORDER = {
    align: ALIGNS,
    'box.per': BOX_PERS,
    'words.mode': WORD_MODES,
    'words.fill': FILLS,
    'words.attack_ease': EASES,
    'words.release_ease': EASES,
    'enter.kind': ENTER_KINDS,
    'enter.ease': EASES,
    'exit.kind': EXIT_KINDS,
};

export const FIELD_SECTION = Object.fromEntries(
    SECTION_IDS.flatMap((s) => SECTION_PATHS[s].map((p) => [p, s])),
);

/** The section that owns a field path. */
export const sectionOf = (path) => FIELD_SECTION[path];

/** Spec of a number field by path (v2 or v1), or undefined. */
export function numSpec(path) {
    const s = FIELD_SPECS[path] ?? V1_NUM[path];
    return s && s.type === 'number' ? s : undefined;
}

/**
 * How a number is shown to the person (see `uiOfSpec`); a line gap reads as a
 * plain multiple, the rest of the shares as percent.
 */
export function numUi(path) {
    return uiOfSpec(numSpec(path), path === 'line_gap');
}

// ---------------------------------------------------------------------------
// what a section holds in a Look
// ---------------------------------------------------------------------------

/** The top-level fields of the captions section a section edits. */
export const sectionKeys = (section) => keysOf(SECTION_PATHS[section]);

/** Does the Look change anything the section controls? */
export const sectionHasOverrides = (L, section) => hasOverrides(L, SECTION_PATHS[section]);

/** The captions patch that puts a section back to the style's own values:
 *  every field it owns, cleared. One patch is one undo step. */
export const sectionResetPatch = (L, section) => resetPatch(L, SECTION_PATHS[section]);

/** Sections that change something, in panel order. */
export const dirtySections = (L) => SECTION_IDS.filter((s) => sectionHasOverrides(L, s));
