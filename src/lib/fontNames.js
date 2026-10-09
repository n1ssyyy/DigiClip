// What a font name is in a Look: any non-empty family name of a sane length.
// The four faces the app ships itself are the only ones it can vouch for; any
// other name is kept as typed, because the engine may know it (its fonts list
// has not loaded yet, or the Look came from another PC) and the engine reads
// the name case-insensitively. Pure: no React, no DOM.

/** The faces the app bundles (`@font-face` in app.css), by the engine's names. */
export const APP_FONTS = ['Anton', 'Archivo Black', 'Inter Medium', 'JetBrains Mono'];

/** The longest family name a Look keeps (family names are far shorter). */
export const FONT_NAME_MAX = 80;

/** Characters a family name never holds (controls). */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Same family, the way the engine compares names: case does not matter. */
export const sameFont = (a, b) => typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The app's own spelling of a name it bundles, else undefined. */
export const appFont = (name) => (typeof name === 'string' ? APP_FONTS.find((f) => sameFont(f, name)) : undefined);

/**
 * A Look's font value, cleaned: the family name trimmed, an app font in its
 * own spelling, anything else as typed. Empty, over-long, control characters
 * or not a string: absent (undefined).
 */
export function cleanFontName(v) {
    if (typeof v !== 'string') return undefined;
    const n = v.trim();
    if (!n || n.length > FONT_NAME_MAX || CONTROL.test(n)) return undefined;
    return appFont(n) ?? n;
}

/** A family name as a CSS `font-family` value (quoted, quote and backslash escaped). */
export const cssFont = (name) => `'${String(name).replace(/[\\']/g, '\\$&')}'`;
