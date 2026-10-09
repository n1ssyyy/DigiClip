// The stroke of a see-through text fill, as the engine's renderer (libass)
// draws it: the outline is a ring AROUND the glyph at its own opacity and is
// cut away under the glyph, so a translucent fill shows the picture (and the
// shadow, glow and box beneath the letters, which are whole copies and are not
// cut), never its own stroke. CSS has no "everything but the glyph", so the
// stage paints the stroke copy in two marker colours (the glyph red, its ring
// black: the ring is a text-shadow, which lies under the glyph) and an SVG
// filter turns that into the ring alone: alpha = alpha - red, the colour the
// stroke's own. At full fill opacity the cut changes nothing (the fill hides
// it), so the stage only cuts when a fill is see-through. Pure: no React, no
// DOM.

/** A fill at or above this opacity hides the stroke under it completely. */
export const SOLID = 0.999;

/** The colour the glyph is painted in on the stroke copy, and its ring's. */
export const GLYPH_MARK = '#FF0000';
export const RING_MARK = '#000000';

/**
 * Does the stroke have to be cut away under the glyph? Only when some part of
 * the fill that lies over it is see-through: `finals` are those fills' final
 * opacities (colour opacity x state x word reveal x fade x element opacity).
 * A part that is not drawn at all (opacity 0) hides nothing but is not cut
 * either: the stroke then stands alone.
 */
export const strokeCut = (...finals) => finals.some((f) => Number.isFinite(f) && f < SOLID);

/** `feColorMatrix` values: the colour `rgb` (`[r, g, b]`, 0..255) for the ring,
 *  its alpha the marker copy's alpha less its red (glyph in, ring out). */
export const ringMatrix = (rgb) => {
    const c = rgb.map((n) => Math.round((n / 255) * 1000) / 1000);
    return `0 0 0 0 ${c[0]}  0 0 0 0 ${c[1]}  0 0 0 0 ${c[2]}  -1 0 0 1 0`;
};

/** The id of the filter for a stroke colour. */
export const ringId = (rgb) => `dc-ring-${rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

/** What the filter makes of a marker pixel: `glyph` is the glyph's coverage
 *  there and `ring` the coverage of the ring (the text-shadow copies) under it.
 *  The ring that is left is the filter's alpha. Used by the tests as the model
 *  of the filter; it is the compositing of red over black, un-premultiplied,
 *  then alpha - red. */
export function ringLeft(glyph, ring) {
    const g = Math.min(1, Math.max(0, glyph));
    const k = Math.min(1, Math.max(0, ring));
    const alpha = g + k * (1 - g);
    if (alpha <= 0) return 0;
    const red = g / alpha;
    return Math.max(0, alpha - red);
}
