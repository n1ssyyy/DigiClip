// Every field of the Look's captions section, in one place: the enums, the
// ranges, the defaults the engine fills in, and the cleaner that reads the
// v2 ("full control") fields the way digiclip-rs `src/look.rs` does.
//
// The next chunk builds the inspector controls from `FIELD_SPECS`; the store
// and the stage read their numbers from here too, so a range changed here is
// changed everywhere. Pure data and functions: no React, no DOM.

export const ALIGNS = ['left', 'center', 'right'];
export const WORD_MODES = ['all', 'build', 'single'];
export const FILLS = ['snap', 'sweep'];
export const EASES = ['linear', 'out', 'in', 'back'];
export const ENTER_KINDS = ['none', 'pop', 'fade', 'slide_up', 'slide_down', 'slide_left', 'slide_right', 'zoom', 'bounce', 'blur', 'drop'];
export const EXIT_KINDS = ['none', 'fade', 'slide_up', 'slide_down', 'zoom', 'blur'];
export const BOX_PERS = ['line', 'word'];
export const WORD_STATES = ['upcoming', 'active', 'spoken'];

/**
 * One entry per field, keyed by its dotted path inside `look.captions`.
 *   number: { type: 'number', min, max, step, unit, int?, def? }
 *   enum:   { type: 'enum', values, def? }
 *   colour: { type: 'colour' }
 * `unit`: 'em' (a share of the type size), 'px' (output pixels on a
 * 1080-wide canvas), 'deg', 'ms', 'ratio' (0..1 or a multiplier), 'count'.
 * `def` is what the engine uses when the field is absent, where there is one
 * that does not depend on the style.
 */
export const FIELD_SPECS = {
    // type
    spacing: { type: 'number', min: -0.05, max: 0.3, step: 0.005, unit: 'em', def: 0 },
    line_gap: { type: 'number', min: 0.8, max: 1.6, step: 0.05, unit: 'ratio', def: 1 },
    lines: { type: 'number', min: 1, max: 2, step: 1, unit: 'count', int: true },
    max_chars: { type: 'number', min: 6, max: 40, step: 1, unit: 'count', int: true },
    align: { type: 'enum', values: ALIGNS },
    rotate: { type: 'number', min: -15, max: 15, step: 0.5, unit: 'deg', def: 0 },
    // stroke
    'stroke.color': { type: 'colour' },
    'stroke.width': { type: 'number', min: 0, max: 12, step: 0.5, unit: 'px' },
    // shadow, as an object (the v1 number is `shadow` itself)
    'shadow.color': { type: 'colour', def: '#000000' },
    'shadow.x': { type: 'number', min: -30, max: 30, step: 1, unit: 'px', def: 0 },
    'shadow.y': { type: 'number', min: -30, max: 30, step: 1, unit: 'px', def: 4 },
    'shadow.blur': { type: 'number', min: 0, max: 20, step: 1, unit: 'px', def: 4 },
    'shadow.opacity': { type: 'number', min: 0, max: 1, step: 0.05, unit: 'ratio', def: 0.6 },
    // glow
    'glow.color': { type: 'colour' },
    'glow.size': { type: 'number', min: 0, max: 40, step: 1, unit: 'px', def: 12 },
    'glow.strength': { type: 'number', min: 0, max: 1, step: 0.05, unit: 'ratio', def: 0.8 },
    // box, as an object (the v1 colour or "none" is `box` itself)
    'box.color': { type: 'colour' },
    'box.opacity': { type: 'number', min: 0, max: 1, step: 0.05, unit: 'ratio' },
    'box.pad_x': { type: 'number', min: 0, max: 60, step: 1, unit: 'px', def: 16 },
    'box.pad_y': { type: 'number', min: 0, max: 60, step: 1, unit: 'px', def: 8 },
    'box.radius': { type: 'number', min: 0, max: 1, step: 0.05, unit: 'ratio', def: 0 },
    'box.per': { type: 'enum', values: BOX_PERS, def: 'line' },
    // words
    'words.mode': { type: 'enum', values: WORD_MODES },
    'words.fill': { type: 'enum', values: FILLS, def: 'snap' },
    'words.attack_ms': { type: 'number', min: 0, max: 400, step: 10, unit: 'ms', def: 0 },
    'words.attack_ease': { type: 'enum', values: EASES, def: 'out' },
    'words.hold_ms': { type: 'number', min: 0, max: 600, step: 10, unit: 'ms', def: 0 },
    'words.release_ms': { type: 'number', min: 0, max: 2000, step: 50, unit: 'ms', def: 0 },
    'words.release_ease': { type: 'enum', values: EASES, def: 'out' },
    'words.upcoming.color': { type: 'colour' },
    'words.upcoming.opacity': { type: 'number', min: 0, max: 1, step: 0.05, unit: 'ratio', def: 1 },
    'words.upcoming.scale': { type: 'number', min: 0.5, max: 1.5, step: 0.05, unit: 'ratio', def: 1 },
    'words.upcoming.blur': { type: 'number', min: 0, max: 10, step: 0.5, unit: 'px', def: 0 },
    'words.active.color': { type: 'colour' },
    'words.active.opacity': { type: 'number', min: 0, max: 1, step: 0.05, unit: 'ratio', def: 1 },
    'words.active.scale': { type: 'number', min: 0.5, max: 1.5, step: 0.05, unit: 'ratio', def: 1 },
    'words.active.lift': { type: 'number', min: -0.3, max: 0.3, step: 0.01, unit: 'em', def: 0 },
    'words.active.rotate': { type: 'number', min: -10, max: 10, step: 0.5, unit: 'deg', def: 0 },
    'words.active.stroke.color': { type: 'colour' },
    'words.active.stroke.width': { type: 'number', min: 0, max: 12, step: 0.5, unit: 'px' },
    'words.active.glow.color': { type: 'colour' },
    'words.active.glow.size': { type: 'number', min: 0, max: 40, step: 1, unit: 'px', def: 12 },
    'words.active.glow.strength': { type: 'number', min: 0, max: 1, step: 0.05, unit: 'ratio', def: 0.8 },
    'words.active.box.color': { type: 'colour' },
    'words.active.box.opacity': { type: 'number', min: 0, max: 1, step: 0.05, unit: 'ratio', def: 1 },
    'words.active.box.radius': { type: 'number', min: 0, max: 1, step: 0.05, unit: 'ratio' },
    'words.spoken.color': { type: 'colour' },
    'words.spoken.opacity': { type: 'number', min: 0, max: 1, step: 0.05, unit: 'ratio', def: 1 },
    'words.spoken.scale': { type: 'number', min: 0.5, max: 1.5, step: 0.05, unit: 'ratio', def: 1 },
    'words.spoken.blur': { type: 'number', min: 0, max: 10, step: 0.5, unit: 'px', def: 0 },
    'words.keyword.color': { type: 'colour' },
    'words.keyword.scale': { type: 'number', min: 0.5, max: 1.5, step: 0.05, unit: 'ratio' },
    'words.keyword.glow.color': { type: 'colour' },
    'words.keyword.glow.size': { type: 'number', min: 0, max: 40, step: 1, unit: 'px', def: 12 },
    'words.keyword.glow.strength': { type: 'number', min: 0, max: 1, step: 0.05, unit: 'ratio', def: 0.8 },
    // line entrance and exit
    'enter.kind': { type: 'enum', values: ENTER_KINDS },
    'enter.ms': { type: 'number', min: 0, max: 800, step: 10, unit: 'ms' },
    'enter.ease': { type: 'enum', values: EASES },
    'exit.kind': { type: 'enum', values: EXIT_KINDS },
    'exit.ms': { type: 'number', min: 0, max: 600, step: 10, unit: 'ms' },
};

/** The v1 numbers, for the same lookup (their controls exist already). */
export const V1_RANGES = {
    x: [0, 1], y: [0, 1], size: [0.5, 2], outline_w: [0, 8], shadow: [0, 6], box_opacity: [0, 1], max_words: [1, 8],
};

/** [min, max] of a numeric field by dotted path (v2 or v1). */
export function rangeOf(path) {
    const s = FIELD_SPECS[path];
    if (s && s.type === 'number') return [s.min, s.max];
    return V1_RANGES[path] ?? null;
}

/** Each kind's own time (ms) when a Look names the kind but not the time. */
export const ENTER_MS = { none: 0, pop: 200, fade: 200, slide_up: 260, slide_down: 260, slide_left: 260, slide_right: 260, zoom: 240, blur: 240, bounce: 340, drop: 320 };
export const EXIT_MS = { none: 0, fade: 140, slide_up: 200, slide_down: 200, zoom: 200, blur: 200 };

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

const clampN = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const numIn = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? clampN(v, lo, hi) : undefined);
const HEX = /^#?[0-9a-f]{6}$/i;
const hexOf = (v) => (typeof v === 'string' && HEX.test(v.trim()) ? `#${v.trim().replace('#', '').toUpperCase()}` : undefined);
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const word = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : undefined);
const oneOf = (v, list) => {
    const w = word(v);
    return list.includes(w) ? w : undefined;
};

/** An object's defined fields, or `undefined` when it has none (the engine
 *  drops an object that says nothing usable). */
function some(o) {
    const out = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
    return Object.keys(out).length ? out : undefined;
}

const range = (path) => FIELD_SPECS[path];
const field = (path, v) => {
    const s = range(path);
    return numIn(v, s.min, s.max);
};

export function cleanStroke(o) {
    const s = plain(o);
    if (!s) return undefined;
    return some({ color: hexOf(s.color), width: field('stroke.width', s.width) });
}

export function cleanShadowFx(o) {
    const s = plain(o);
    if (!s) return undefined;
    return some({
        color: hexOf(s.color),
        x: field('shadow.x', s.x),
        y: field('shadow.y', s.y),
        blur: field('shadow.blur', s.blur),
        opacity: field('shadow.opacity', s.opacity),
    });
}

export function cleanGlow(o) {
    const s = plain(o);
    if (!s) return undefined;
    return some({ color: hexOf(s.color), size: field('glow.size', s.size), strength: field('glow.strength', s.strength) });
}

export function cleanBoxFx(o) {
    const s = plain(o);
    if (!s) return undefined;
    return some({
        color: hexOf(s.color),
        opacity: field('box.opacity', s.opacity),
        pad_x: field('box.pad_x', s.pad_x),
        pad_y: field('box.pad_y', s.pad_y),
        radius: field('box.radius', s.radius),
        per: oneOf(s.per, BOX_PERS),
    });
}

function cleanActiveBox(o) {
    const s = plain(o);
    if (!s) return undefined;
    return some({
        color: hexOf(s.color),
        opacity: field('words.active.box.opacity', s.opacity),
        radius: field('words.active.box.radius', s.radius),
    });
}

/** One word state; only the fields that state has are read. */
function cleanState(o, which) {
    const s = plain(o);
    if (!s) return undefined;
    const p = (f) => `words.${which}.${f}`;
    const out = {
        color: hexOf(s.color),
        opacity: field(p('opacity'), s.opacity),
        scale: field(p('scale'), s.scale),
    };
    if (which !== 'active') out.blur = field(p('blur'), s.blur);
    if (which === 'active') {
        out.lift = field(p('lift'), s.lift);
        out.rotate = field(p('rotate'), s.rotate);
        out.stroke = cleanStroke(s.stroke);
        out.glow = cleanGlow(s.glow);
        out.box = cleanActiveBox(s.box);
    }
    return some(out);
}

export function cleanWords(o) {
    const w = plain(o);
    if (!w) return undefined;
    const k = plain(w.keyword);
    return some({
        mode: oneOf(w.mode, WORD_MODES),
        upcoming: cleanState(w.upcoming, 'upcoming'),
        active: cleanState(w.active, 'active'),
        spoken: cleanState(w.spoken, 'spoken'),
        keyword: k ? some({ color: hexOf(k.color), scale: field('words.keyword.scale', k.scale), glow: cleanGlow(k.glow) }) : undefined,
        fill: oneOf(w.fill, FILLS),
        attack_ms: field('words.attack_ms', w.attack_ms),
        attack_ease: oneOf(w.attack_ease, EASES),
        hold_ms: field('words.hold_ms', w.hold_ms),
        release_ms: field('words.release_ms', w.release_ms),
        release_ease: oneOf(w.release_ease, EASES),
    });
}

export function cleanEnter(o) {
    const e = plain(o);
    if (!e) return undefined;
    return some({ kind: oneOf(e.kind, ENTER_KINDS), ms: field('enter.ms', e.ms), ease: oneOf(e.ease, EASES) });
}

export function cleanExit(o) {
    const e = plain(o);
    if (!e) return undefined;
    return some({ kind: oneOf(e.kind, EXIT_KINDS), ms: field('exit.ms', e.ms) });
}

/** The v2 fields of a captions section, cleaned; absent where the engine
 *  would have none. (`shadow` and `box` in their object form are returned
 *  under `shadow` and `box`; the caller decides between that and the v1
 *  number / colour.) */
export function cleanFx(o) {
    const out = {};
    const set = (k, v) => {
        if (v !== undefined) out[k] = v;
    };
    set('spacing', field('spacing', o.spacing));
    set('line_gap', field('line_gap', o.line_gap));
    const lines = field('lines', o.lines);
    if (lines !== undefined) out.lines = Math.round(lines);
    const mc = field('max_chars', o.max_chars);
    if (mc !== undefined) out.max_chars = Math.round(mc);
    const al = word(o.align);
    set('align', al === 'centre' ? 'center' : oneOf(al, ALIGNS));
    set('rotate', field('rotate', o.rotate));
    set('stroke', cleanStroke(o.stroke));
    set('glow', cleanGlow(o.glow));
    set('words', cleanWords(o.words));
    set('enter', cleanEnter(o.enter));
    set('exit', cleanExit(o.exit));
    return out;
}

/** Does this (cleaned) captions section make the engine draw word by word?
 *  Mirrors `CaptionsLook::positioned`. */
export function isWordLevel(c) {
    if (!c || typeof c !== 'object') return false;
    return !!(c.words || c.enter || c.exit
        || c.spacing !== undefined || c.line_gap !== undefined || c.lines !== undefined
        || c.max_chars !== undefined || c.align !== undefined || c.rotate !== undefined
        || c.stroke || c.glow
        || (plain(c.shadow) && Object.keys(c.shadow).length)
        || (plain(c.box) && Object.keys(c.box).length));
}

// ---------------------------------------------------------------------------
// the v1 `anim` as mode + entrance + exit, and the Look's own on top
// ---------------------------------------------------------------------------

/** What a v1 motion name stands for (`from_anim` in motion.rs). `ease:
 *  null` is the kind's own shape (the pop and bounce keyframes, or its
 *  default ease). */
export function fromAnim(anim) {
    const en = (kind, ms, ease = null) => ({ kind, ms, ease });
    const ex = (kind, ms) => ({ kind, ms });
    switch (anim) {
        case 'words': return { mode: 'build', enter: en('pop', 200), exit: ex('fade', 60) };
        case 'none': return { mode: 'all', enter: en('none', 0), exit: ex('none', 0) };
        case 'fade': return { mode: 'all', enter: en('fade', 200, 'linear'), exit: ex('fade', 140) };
        case 'slide': return { mode: 'all', enter: en('slide_up', 260, 'linear'), exit: ex('fade', 60) };
        case 'bounce': return { mode: 'all', enter: en('bounce', 340), exit: ex('fade', 60) };
        default: return { mode: 'all', enter: en('pop', 200), exit: ex('fade', 60) };
    }
}

/** The entrance and exit a Look ends up with: its own fields over its
 *  `anim`'s. A kind with no time is none (`effective_motion`). */
export function effectiveMotion(c, anim) {
    const { enter: en, exit: ex } = fromAnim(anim);
    let enter = en;
    if (c?.enter) {
        const kind = c.enter.kind ?? en.kind;
        const same = kind === en.kind;
        enter = { kind, ms: c.enter.ms ?? (same ? en.ms : ENTER_MS[kind]), ease: c.enter.ease ?? (same ? en.ease : null) };
    }
    let exit = ex;
    if (c?.exit) {
        const kind = c.exit.kind ?? ex.kind;
        const same = kind === ex.kind;
        exit = { kind, ms: c.exit.ms ?? (same ? ex.ms : EXIT_MS[kind]) };
    }
    return {
        enter: enter.ms <= 0 ? { ...enter, kind: 'none' } : enter,
        exit: exit.ms <= 0 ? { ...exit, kind: 'none' } : exit,
    };
}
