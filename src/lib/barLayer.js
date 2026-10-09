// The engine's progress bar, mirrored for the Studio stage.
//
// Follows digiclip-rs `src/compose.rs` (`bar_thickness`, `draw_bar_at`: the
// plain bar, pixel for pixel as it always was), `src/bar.rs` (`BarFx`: the
// shaped bar, drawn when the Look sets `track`, `track_opacity`, `inset`,
// `radius` or `glow`) and `bar_color` (the Look's colour wins over the flat
// one). When this file and the engine disagree, the engine is right. Pure
// functions: no React, no DOM.
import { alphaOf } from './alpha.js';
import { canvasSize, clamp, hex } from './captionStyles.js';
import { GLOW_BLUR, GLOW_BORD, glowDefault, rgbOf } from './captionMotion.js';
import { GLOW_DEFAULTS, TRACK_OPACITY, cleanBar, isShaped } from './layerFields.js';

export const BAR_DEFAULT_COLOR = '#FFD400';

const even = (v) => Math.round(v / 2) * 2;
const hexOf = (rgb) => `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Bar thickness in px (even): 0.65% of the height, at least 8, times the
 *  Look's height multiplier (never under 4). */
export function barThickness(canvas, height = 1) {
    const { h } = canvasSize(canvas);
    return Math.min(Math.max(even(h * 0.0065 * height), even(8 * height), 4), h - (h % 2));
}

/** The canvas scale of the 1080-wide design (what a glow's size is scaled by). */
export const designScale = (w, h) => Math.min(w / 1080, h / 1200, 1);

/**
 * The bar on a canvas: its row, thickness and colour, and the shaped
 * drawing's parts. `fill(progress)` is where the filled part ends (an x in
 * px): the plain bar steps by two pixels, the shaped one is continuous.
 *
 * `color` is the flat `progress_bar` colour; the Look's `color` replaces it.
 * `glow` is the halo of the fill (`null` for none), `track` the track's own
 * colour and opacity (`null` is the plain dimming).
 */
export function resolveBar(canvas, color, look) {
    const c = cleanBar(look);
    const { w, h } = canvasSize(canvas);
    const thickness = barThickness(canvas, c.height ?? 1);
    const top = c.pos === 'top';
    const fill = c.color ?? hex(color) ?? BAR_DEFAULT_COLOR;
    const shaped = isShaped(c);
    let x0 = 0;
    let x1 = w;
    let y = top ? 0 : h - thickness;
    let inset = 0;
    if (shaped) {
        // The margin from the sides and from its own edge, never so much that
        // the bar disappears (`BarFx::new`).
        const room = Math.min(Math.max(Math.floor(w / 2) - 8, 0), Math.floor(Math.max(h - thickness, 0) / 2)) & ~1;
        inset = Math.min(even((c.inset ?? 0) * w), room);
        x0 = inset;
        x1 = w - inset;
        y = top ? inset : h - inset - thickness;
    }
    const k = designScale(w, h);
    const g = shaped ? c.glow : null;
    let glow = null;
    if (g) {
        const size = (g.size ?? GLOW_DEFAULTS.size) * k;
        const strength = g.strength ?? GLOW_DEFAULTS.strength;
        if (size > 0 && strength > 0) {
            glow = {
                color: g.color ?? hexOf(glowDefault(rgbOf(fill))),
                size,
                strength,
                grow: size * GLOW_BORD,
                sigma: Math.max(size * GLOW_BLUR, 0.3),
            };
        }
    }
    const tracked = shaped && (c.track !== undefined || c.track_opacity !== undefined);
    return {
        w,
        h,
        top,
        pos: top ? 'top' : 'bottom',
        height: c.height ?? 1,
        thickness,
        y,
        x0,
        x1,
        inset,
        shaped,
        /** The whole bar's opacity: the bar is drawn as at full opacity and that result
         *  is blended with the picture by it (a group; see `barParts`). */
        opacity: c.opacity ?? 1,
        color: fill,
        radius: shaped ? (c.radius ?? 0) * (thickness / 2) : 0,
        glow,
        track: tracked ? { color: c.track ?? '#000000', opacity: c.track_opacity ?? TRACK_OPACITY } : null,
        // The selection box on the stage: the track's bounds.
        rect: { x: x0, y, w: x1 - x0, h: thickness },
        center: { x: 0.5, y: (y + thickness / 2) / h },
        fill(progress) {
            const p = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
            return shaped ? x0 + p * (x1 - x0) : Math.min(Math.round((p * w) / 2) * 2, w);
        },
    };
}

/** The plain bar's dimmed track, as the opacity of black the stage stands in
 *  for the picture darkened with. */
export const PLAIN_TRACK = 0.55;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/**
 * The opacities the stage draws the bar's parts with, from `resolveBar`. The
 * bar is a true group in the engine: drawn exactly as at full opacity, bottom
 * to top picture, track, glow, fill, and that result blended with the picture
 * by `opacity` (so an opaque fill at 0.5 is the fill at 0.5 over the picture,
 * with no track showing through it, and overlapping parts do not add up).
 * Inside the group a part's opacity is only its own:
 *
 * - `fill`: its colour's opacity;
 * - `track`: its colour's opacity x `track_opacity` (a bar with neither is the
 *   plain dimmed track: black at `PLAIN_TRACK`, the stage's stand-in for the
 *   darkened picture);
 * - `glow`: its colour's opacity x its strength (not over 1).
 *
 * `cut`: when the fill's COLOUR is see-through, the track and the glow are
 * left out where the fill is, so the picture shows through the fill and not
 * the track or the glow's body; the glow still shows outside the fill's shape
 * and the track beside it. With an opaque fill colour nothing is left out.
 * That holds for the plain bar too.
 *
 * @returns {{group: number, fill: number, track: {color: string, a: number}, glow: ({color: string, a: number}|null), cut: boolean}}
 */
export function barParts(bar) {
    const fill = alphaOf(bar.color);
    const track = bar.track
        ? { color: bar.track.color, a: alphaOf(bar.track.color) * clamp01(bar.track.opacity) }
        : { color: '#000000', a: PLAIN_TRACK };
    const g = bar.glow;
    return {
        group: clamp01(bar.opacity ?? 1),
        fill,
        track,
        glow: g ? { color: g.color, a: alphaOf(g.color) * clamp01(Math.min(g.strength, 1)) } : null,
        cut: fill < 1,
    };
}
