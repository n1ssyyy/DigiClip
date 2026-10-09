// Every field of the Look's headline, bar and logo sections, in one place per
// layer: the enums, the ranges, the defaults the engine fills in, and the
// cleaners that read a section the way digiclip-rs `src/look.rs` does.
//
// The shapes the three layers share with the captions (stroke, shadow, glow,
// enter, exit) are the captions' own specs and cleaners: the engine reads
// them with the same functions, so a range cannot drift between them. The
// inspector builds its number and choice controls from these tables, the
// store and the stage take their numbers from here. Pure data and functions:
// no React, no DOM.
import { FONT_NAME_MAX, cleanFontName } from './fontNames.js';
import { faceStatus } from './fontState.js';
import {
    FIELD_SPECS as CAP, cleanEnter, cleanExit, cleanGlow, cleanShadowFx, cleanStroke, hexOf, numIn, plain, some, word,
} from './captionFields.js';

/** The headline's font when the Look names none. */
export const HEADLINE_FONT = 'Archivo Black';
export const CASES = ['upper', 'asis'];
export const ACCENT_WORDS = ['auto', 'none', 'first', 'last'];
export const HEADLINE_ANIMS = ['pop', 'fade', 'none'];
export const BAR_POSITIONS = ['bottom', 'top'];

const pick = (keys) => Object.fromEntries(keys.map((k) => [k, CAP[k]]));
const GROUPS = {
    stroke: ['stroke.color', 'stroke.width'],
    shadow: ['shadow.color', 'shadow.x', 'shadow.y', 'shadow.blur', 'shadow.opacity'],
    glow: ['glow.color', 'glow.size', 'glow.strength'],
    enter: ['enter.kind', 'enter.ms', 'enter.ease'],
    exit: ['exit.kind', 'exit.ms'],
};
const ratio = (min, max, step, def) => ({ type: 'number', min, max, step, unit: 'ratio', ...(def === undefined ? {} : { def }) });
const colour = () => ({ type: 'colour' });

/** One entry per field, keyed by its dotted path inside `look.headline`
 *  (same shapes as `captionFields.FIELD_SPECS`; `card` is the v1 colour or
 *  `none`, `card.*` its object form). `unit: 's'` is seconds; `sliderMin`, `sliderMax`
 *  keeps a slider usable where the engine allows far more. */
export const HEADLINE_SPECS = {
    // The whole headline's opacity: it multiplies every part's own.
    opacity: ratio(0, 1, 0.05, 1),
    x: ratio(0, 1, 0.01),
    y: ratio(0, 1, 0.01),
    size: ratio(0.5, 2, 0.05, 1),
    // Any family the engine has: a name, not a fixed list (see fontNames.js).
    font: { type: 'font', max: FONT_NAME_MAX, def: HEADLINE_FONT },
    case: { type: 'enum', values: CASES, def: 'asis' },
    spacing: CAP.spacing,
    align: { ...CAP.align, def: 'center' },
    max_lines: { type: 'number', min: 1, max: 3, step: 1, unit: 'count', int: true, def: 3 },
    width: ratio(0.4, 1, 0.01),
    ink: colour(),
    accent: colour(),
    ...pick(GROUPS.stroke),
    ...pick(GROUPS.shadow),
    ...pick(GROUPS.glow),
    card: { type: 'card' },
    'card.color': colour(),
    'card.opacity': ratio(0, 1, 0.05, 1),
    'card.pad': { type: 'number', min: 0, max: 80, step: 1, unit: 'px' },
    'card.radius': ratio(0, 1, 0.05, 0),
    accent_word: { type: 'enum', values: ACCENT_WORDS, def: 'auto' },
    anim: { type: 'enum', values: HEADLINE_ANIMS, def: 'pop' },
    ...pick(GROUPS.enter),
    ...pick(GROUPS.exit),
    delay_s: { type: 'number', min: 0, max: 5, step: 0.1, unit: 's', def: 0 },
    seconds: { type: 'number', min: 0, max: 3600, step: 0.5, unit: 's', def: 0, sliderMin: 0.5, sliderMax: 30 },
};

/** `look.bar`. */
export const BAR_SPECS = {
    // The whole bar's opacity: the bar is drawn as at full opacity (track, glow, fill)
    // and that result is blended with the picture by it (a group).
    opacity: ratio(0, 1, 0.05, 1),
    pos: { type: 'enum', values: BAR_POSITIONS, def: 'bottom' },
    height: ratio(0.5, 3, 0.05, 1),
    color: colour(),
    track: colour(),
    track_opacity: ratio(0, 1, 0.05),
    inset: ratio(0, 0.1, 0.005, 0),
    radius: ratio(0, 1, 0.05, 0),
    ...pick(GROUPS.glow),
};

/** `look.logo`. */
export const LOGO_SPECS = {
    x: ratio(0, 1, 0.01),
    y: ratio(0, 1, 0.01),
    size: ratio(0.4, 2.5, 0.05, 1),
    opacity: ratio(0, 1, 0.05, 0.9),
    rotate: { type: 'number', min: -30, max: 30, step: 0.5, unit: 'deg', def: 0 },
    ...pick(GROUPS.shadow),
    ...pick(GROUPS.glow),
};

/** What the engine uses for a shadow's or glow's missing fields (the
 *  captions' defaults, shared by all three layers). */
export const SHADOW_DEFAULTS = { color: '#000000', x: 0, y: 4, blur: 4, opacity: 0.6 };
export const GLOW_DEFAULTS = { size: 12, strength: 0.8 };
/** The thickness of the dark edge of a headline without a card, and the
 *  card's padding, before `size` (px on a 1080-wide canvas). */
export const HEADLINE_EDGE = 5;
export const HEADLINE_PAD = 24;
/** The opacity of a track that has a colour and no opacity. */
export const TRACK_OPACITY = 0.55;

/** The specs of a layer by its Look section. */
export const LAYER_SPECS = { headline: HEADLINE_SPECS, bar: BAR_SPECS, logo: LOGO_SPECS };

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

/** The top-level fields of a spec table (a `card` and the dotted objects are
 *  read on their own), read from `o` and clamped; absent where unusable. */
export function readFlat(specs, o) {
    const out = {};
    for (const [k, s] of Object.entries(specs)) {
        if (k.includes('.')) continue;
        let v;
        if (s.type === 'number') {
            v = numIn(o[k], s.min, s.max);
            if (v !== undefined && s.int) v = Math.round(v);
        } else if (s.type === 'enum') {
            const w = word(o[k]);
            v = s.values.find((x) => x.toLowerCase() === w) ?? (k === 'align' && w === 'centre' ? 'center' : undefined);
        } else if (s.type === 'font') v = cleanFontName(o[k]);
        else if (s.type === 'colour') v = hexOf(o[k]);
        if (v !== undefined) out[k] = v;
    }
    return out;
}

/** `card`: `'none'`, a colour, or `{color, opacity, pad, radius}`. */
export function cleanCard(c) {
    if (c === null) return 'none';
    if (typeof c === 'string') return c.trim().toLowerCase() === 'none' ? 'none' : hexOf(c);
    const o = plain(c);
    if (!o) return undefined;
    return some({
        color: hexOf(o.color),
        opacity: numIn(o.opacity, 0, 1),
        pad: numIn(o.pad, 0, 80),
        radius: numIn(o.radius, 0, 1),
    });
}

/** Add the object fields a section may hold, when they say something. */
function withObjects(out, o, readers) {
    for (const [k, read] of Object.entries(readers)) {
        const v = read(o[k]);
        if (v !== undefined) out[k] = v;
    }
    return out;
}

/** What the engine would make of `headline`: ranges clamped, bad values
 *  absent. `card` is `'none'`, a colour or an object. */
export function cleanHeadline(h) {
    const o = plain(h) ?? {};
    const out = withObjects(readFlat(HEADLINE_SPECS, o), o, {
        stroke: cleanStroke, shadow: cleanShadowFx, glow: cleanGlow, enter: cleanEnter, exit: cleanExit,
    });
    const card = cleanCard(o.card);
    if (card !== undefined) out.card = card;
    return out;
}

export function cleanBar(b) {
    const o = plain(b) ?? {};
    return withObjects(readFlat(BAR_SPECS, o), o, { glow: cleanGlow });
}

export function cleanLogo(l) {
    const o = plain(l) ?? {};
    return withObjects(readFlat(LOGO_SPECS, o), o, { shadow: cleanShadowFx, glow: cleanGlow });
}

// ---------------------------------------------------------------------------
// which drawing a section asks for (the engine's "positioned", "shaped", "dressed")
// ---------------------------------------------------------------------------

/** Does this (cleaned) headline need the word-level writer? Any field beyond
 *  the v1 ones does (`HeadlineLook::positioned`); a `card` colour or `none`
 *  is still v1, a card object is not. */
export function isPositioned(c) {
    if (!c || typeof c !== 'object') return false;
    // A font the engine does not have is no font to it (the v1 writer stays).
    return !!((c.font && faceStatus(c.font) !== 'missing') || c.case || c.spacing !== undefined || c.align || c.max_lines !== undefined || c.width !== undefined
        || c.stroke || c.shadow || c.glow || plain(c.card) || c.accent_word || c.enter || c.exit || c.delay_s !== undefined);
}

/** Does this (cleaned) bar need the shaped drawing (`BarLook::shaped`)? The
 *  position, height and colour alone keep the plain one. */
export function isShaped(c) {
    return !!c && (c.track !== undefined || c.track_opacity !== undefined || c.inset !== undefined || c.radius !== undefined || !!c.glow);
}

/** A turn under this many degrees is no turn (`Logo::with_look`). */
export const MIN_TURN = 0.01;

/** Does this (cleaned) logo need the dressed chain (`Logo::dressed`)? */
export function isDressed(c) {
    return !!c && (Math.abs(c.rotate ?? 0) > MIN_TURN || !!c.shadow || !!c.glow);
}
