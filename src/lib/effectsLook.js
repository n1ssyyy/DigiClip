// The Look's effects on the stage's PICTURE, derived from the engine's own
// numbers (digiclip-rs `src/compose.rs`: `vignette_gain`, `GradeTab::new`,
// `fill_gain`, and the 4:2:0 maths behind them). The engine works on
// gamma-coded video (limited-range BT.709 YUV); CSS and SVG filters work on
// gamma-coded sRGB too, so a multiply or an offset on R'G'B' here is the same
// operation there. Pure: no React, no DOM, importable from Node.
import { FILL_DIM_TODAY } from './sceneFields.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth01 = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// vignette
// ---------------------------------------------------------------------------

/** The corners keep this share less of their light at `vignette` 1. */
export const VIGNETTE_MAX = 0.7;
const VIGNETTE_STOPS = 32;

/** Normalised radius of a point: each axis divided by its half-size (an
 *  ellipse), `sqrt((dx² + dy²) / 2)`; the centre is 0, the corners 1.
 *  `dx`, `dy` are -1..1 across the frame. */
export const vignetteRadius = (dx, dy) => Math.sqrt((dx * dx + dy * dy) / 2);

/** Gain (1 = untouched) at radius `r` for strength `v`: a smoothstep from
 *  20% of the way out (`vignette_gain`). Luma and chroma both scale by it,
 *  so on R'G'B' the picture is multiplied by it. */
export function vignetteGain(r, v) {
    const t = clamp((r - 0.2) / 0.8, 0, 1);
    return 1 - VIGNETTE_MAX * clamp(v, 0, 1) * t * t * (3 - 2 * t);
}

/** Black over the picture at strength `v`: a CSS ellipse that reaches the
 *  corners at its 100% (its position is the engine's `r`), with a stop every
 *  1/20 of the falloff so the straight pieces between them follow the
 *  smoothstep to a fraction of a level. `null` for no vignette. */
export function vignetteBackground(v) {
    if (!(v > 0)) return null;
    const stops = ['rgb(0 0 0 / 0) 0%'];
    for (let i = 0; i <= VIGNETTE_STOPS; i += 1) {
        const r = 0.2 + (0.8 * i) / VIGNETTE_STOPS;
        const a = 1 - vignetteGain(r, v);
        stops.push(`rgb(0 0 0 / ${a.toFixed(4)}) ${(r * 100).toFixed(1)}%`);
    }
    return `radial-gradient(ellipse farthest-corner at 50% 50%, ${stops.join(', ')})`;
}

// ---------------------------------------------------------------------------
// grade
// ---------------------------------------------------------------------------

/** Rec.709 luma, the engine's mono: chroma 0 keeps only Y, so R' = G' = B' = Y'. */
export const MONO_MATRIX = [
    0.2126, 0.7152, 0.0722, 0, 0,
    0.2126, 0.7152, 0.0722, 0, 0,
    0.2126, 0.7152, 0.0722, 0, 0,
    0, 0, 0, 1, 0,
];

/** Chroma offsets (8-bit units: U, V) of the two casts. */
const CASTS = { warm: [-3.6, 2.8], cool: [3.6, -2.8] };
/** Saturation gain of Punchy at its plateau and the S-curve's weight. */
const PUNCH_SAT = 1.18;
const PUNCH_CURVE = 0.3;

/** The offset of a cast on R', G', B' (0..1), from its chroma offsets at
 *  constant luma (BT.709: R = Y + 1.5748 Cr, G = Y - 0.1873 Cb - 0.4681 Cr,
 *  B = Y + 1.8556 Cb; chroma spans 224 levels). Warm: +5, -0.7, -7.6 of 255. */
export function castRgb(du, dv) {
    const cb = du / 224;
    const cr = dv / 224;
    return [1.5748 * cr, -0.1873 * cb - 0.4681 * cr, 1.8556 * cb];
}

/** How much of a cast a tone keeps: it fades out into the deepest shadows
 *  (`smooth01(16, 72, Y)`). `c` is the R'G'B' level, 0..1 (Y = 16 + 219 c). */
export const castFade = (c) => smooth01(16, 72, 16 + 219 * c);

/** The mean of Punchy's saturation gain over the luma range. The engine's
 *  gain is 1.18 in the mid tones and fades to 1 in shadows and highlights;
 *  one matrix cannot follow that, so the stage uses the average. */
export const PUNCH_SAT_MEAN = 1 + (PUNCH_SAT - 1) * ((130 + 22 + 22.5) / 219);

const TABLE_N = 49;
const samples = (f) => Array.from({ length: TABLE_N }, (_, i) => clamp(f(i / (TABLE_N - 1)), 0, 1));
const round4 = (a) => a.map((v) => Math.round(v * 1e4) / 1e4);

/** Punchy's soft S-curve on a level (luma only in the engine; applied per
 *  channel here, the same for greys). */
export const punchCurve = (c) => c + PUNCH_CURVE * (c * c * (3 - 2 * c) - c);

/**
 * The SVG steps that imitate a grade, in order, or `null` for none:
 *  - `{ matrix }`   an feColorMatrix of 20 numbers,
 *  - `{ saturate }` an feColorMatrix saturate value,
 *  - `{ tables }`   an feComponentTransfer: `r`, `g`, `b` table values.
 */
export function gradeSteps(grade) {
    if (grade === 'mono') return [{ matrix: MONO_MATRIX }];
    if (grade === 'warm' || grade === 'cool') {
        const d = castRgb(...CASTS[grade]);
        const tab = (k) => round4(samples((c) => c + d[k] * castFade(c)));
        return [{ tables: { r: tab(0), g: tab(1), b: tab(2) } }];
    }
    if (grade === 'punchy') {
        const tab = round4(samples(punchCurve));
        return [{ saturate: round4([PUNCH_SAT_MEAN])[0] }, { tables: { r: tab, g: tab, b: tab } }];
    }
    return null;
}

// ---------------------------------------------------------------------------
// blurred fill
// ---------------------------------------------------------------------------

/** The fill's luma gain at today's darkness, and at `fill_dim` 1. */
export const BG_DIM = 0.72;
export const BG_DIM_MAX = 0.04;

/** Luma gain of the blurred fill for `fill_dim` (`fill_gain`): 0 -> 1, today's
 *  0.4 -> 0.72, 1 -> 0.04, linear between. */
export function fillGain(dim) {
    const d = clamp(dim, 0, 1);
    const lerp = (a, b, u) => a * (1 - u) + b * u;
    return d <= FILL_DIM_TODAY
        ? lerp(1, BG_DIM, d / FILL_DIM_TODAY)
        : lerp(BG_DIM, BG_DIM_MAX, (d - FILL_DIM_TODAY) / (1 - FILL_DIM_TODAY));
}

/** How much of the fill's colour stays: past today's darkness it fades with
 *  the light (`fill_chroma`). */
export const fillChroma = (dim) => Math.min(fillGain(dim) / BG_DIM, 1);

/** The CSS filter that darkens a blurred fill the way the engine does: the
 *  light by the gain, the colour by `fillChroma` (`brightness` scales both,
 *  `saturate` puts back the difference). */
export function fillFilter(dim) {
    const g = fillGain(dim);
    return `brightness(${g.toFixed(4)}) saturate(${(fillChroma(dim) / g).toFixed(4)})`;
}

// ---------------------------------------------------------------------------
// zoom
// ---------------------------------------------------------------------------

/** How much the stage scales the picture about its centre for `camera.zoom`.
 *  The engine never frames wider than the full-height window (`zoom_window`:
 *  loosening stops at the base window), and the stage's picture is that
 *  window, so only the tighter side shows. */
export const stageZoom = (zoom) => (zoom > 1 ? zoom : 1);
