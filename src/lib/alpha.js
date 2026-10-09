// Colours with opacity, in one place.
//
// Every colour of the Look (and the flat `progress_bar` option) is `#RRGGBB`
// or `#RRGGBBAA`: AA is the colour's own opacity (`FF` opaque), no short
// forms. This module splits and joins them, multiplies opacities the way the
// engine does (straight alpha, one product per text part; the bar and the
// logo are groups, see `barParts`) and writes the CSS the stage draws with; the cap-gated stripping for an engine without
// `look.alpha` is here too. Pure: no React, no DOM.

/** The engine ability that takes 8-digit colours and the element opacities. */
export const ALPHA_CAP = 'look.alpha';

const HEX = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i;
const HEX8 = /^#[0-9a-f]{8}$/i;

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const byteHex = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();

/** `#RRGGBB` or `#RRGGBBAA` upper-cased with its `#`, or `undefined` when the
 *  text is neither (a leading `#` is optional, spaces round it are ignored). */
export function normColour(v) {
    if (typeof v !== 'string') return undefined;
    const m = HEX.exec(v.trim());
    return m ? `#${m[1]}${m[2] ?? ''}`.toUpperCase() : undefined;
}

/** Is this a colour the Look can hold (6 or 8 digits)? */
export const isColour = (v) => normColour(v) !== undefined;

/** The colour without its opacity: `#RRGGBB` (the input unchanged when it
 *  is not a colour). */
export function colourOnly(v) {
    const n = normColour(v);
    return n ? n.slice(0, 7) : v;
}

/** `[r, g, b]` of a colour (0 0 0 when it is not one). */
export function rgbOf(v) {
    const n = normColour(v);
    if (!n) return [0, 0, 0];
    const x = parseInt(n.slice(1, 7), 16);
    return [(x >> 16) & 255, (x >> 8) & 255, x & 255];
}

/** The colour's own opacity, 0..1 (1 for six digits). */
export function alphaOf(v) {
    const n = normColour(v);
    return n && n.length === 9 ? parseInt(n.slice(7), 16) / 255 : 1;
}

/** `#RRGGBB` from `[r, g, b]`. */
export const hexFromRgb = (rgb) => `#${rgb.map(byteHex).join('')}`;

/** A colour with opacity `a` (0..1) on it: six digits when that is opaque,
 *  else `#RRGGBBAA`. Whatever opacity `v` had is replaced. */
export function withAlpha(v, a) {
    const base = colourOnly(v);
    const byte = Math.round(clamp01(Number.isFinite(a) ? a : 1) * 255);
    return byte >= 255 ? base : `${base}${byteHex(byte)}`;
}

/** Opacity (0..1) as the percent a slider shows. */
export const percentOf = (a) => Math.round(clamp01(a) * 100);

/** The opacity (0..1) a percent stands for. */
export const fromPercent = (p) => clamp01(p / 100);

/** Product of opacities, each clamped to 0..1 (an absent one counts as 1). */
export function mul(...factors) {
    let p = 1;
    for (const f of factors) if (typeof f === 'number' && Number.isFinite(f)) p *= clamp01(f);
    return p;
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/** CSS for `rgb` (`[r, g, b]`) at opacity `a`. */
export function cssRgb(rgb, a = 1) {
    return `rgb(${Math.round(rgb[0])} ${Math.round(rgb[1])} ${Math.round(rgb[2])} / ${round3(clamp01(a))})`;
}

/** CSS for a colour: its own opacity times every factor in `by` (the part's
 *  own opacity number, the fades, the element's opacity). */
export function cssColour(v, ...by) {
    return cssRgb(rgbOf(v), alphaOf(v) * mul(...by));
}

// ---------------------------------------------------------------------------
// an engine without the ability
// ---------------------------------------------------------------------------

/** The sections whose `opacity` is new with the ability (the logo's is not). */
const NEW_OPACITY = ['captions', 'headline', 'bar'];

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** `value` with every 8-digit colour cut to six digits, all the way down. */
export function cutColours(value) {
    if (typeof value === 'string') return HEX8.test(value) ? value.slice(0, 7) : value;
    if (Array.isArray(value)) return value.map(cutColours);
    if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cutColours(v)]));
    return value;
}

/** A Look as an engine without `look.alpha` takes it: 8-digit colours cut to
 *  six digits and the new `opacity` of captions, headline and bar dropped
 *  (the logo's opacity is older and stays). Anything else is left as it is. */
export function stripLookAlpha(look) {
    if (!isPlain(look)) return look;
    const out = {};
    for (const [k, v] of Object.entries(look)) {
        if (NEW_OPACITY.includes(k) && isPlain(v)) {
            const { opacity, ...rest } = v;
            out[k] = cutColours(rest);
        } else out[k] = cutColours(v);
    }
    return out;
}

/** Engine job options for an engine without the ability: the Look stripped
 *  and the flat `progress_bar` colour cut to six digits. */
export function stripOptionsAlpha(options) {
    if (!isPlain(options)) return options;
    const out = { ...options };
    if (typeof out.progress_bar === 'string') out.progress_bar = cutColours(out.progress_bar);
    if (out.look !== undefined) out.look = stripLookAlpha(out.look);
    return out;
}
