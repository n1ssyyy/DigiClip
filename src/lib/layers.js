// The engine's headline, progress bar and logo, mirrored for the Studio stage.
//
// This file holds the headline's one-event writer (the v1 fields: `src/
// captions/ass.rs`, the Headline style, its placement, clamp and entrance),
// its time on screen and the stage's snapping guides, and gathers the three
// layers' pieces under one import: the word-level headline is in
// `headlineV2.js`, the bar in `barLayer.js`, the logo in `logoLayer.js`,
// the text in `headlineText.js` and the fields and their cleaners in
// `layerFields.js`. When this file and the engine disagree, the engine is
// right. Pure functions: no React, no DOM, importable from Node for the tests.
import { canvasSize, clamp } from './captionStyles.js';
import { HEADLINE_EDGE, HEADLINE_PAD, cleanHeadline, isPositioned } from './layerFields.js';
import { HEADLINE_MAX, headlineMarkup, headlineText } from './headlineText.js';
import { resolveHeadlineV2 } from './headlineV2.js';

export {
    ACCENT_WORDS, BAR_POSITIONS, CASES, HEADLINE_ANIMS, HEADLINE_SPECS, BAR_SPECS, LOGO_SPECS, cleanBar, cleanHeadline, cleanLogo,
} from './layerFields.js';
export { HEADLINE_SAMPLE, headlineMarkup, headlineText, stageHeadline } from './headlineText.js';
export { headlineRoom, headlineTiming } from './headlineV2.js';
export { BAR_DEFAULT_COLOR, barThickness, resolveBar } from './barLayer.js';
export { CORNERS, logoClear, logoInset, resolveLogo, turnedBox } from './logoLayer.js';

/** Ranges of the sizes the stage resizes (look.rs). */
export const SIZE_RANGE = {
    captions: [0.5, 2],
    headline: [0.5, 2],
    logo: [0.4, 2.5],
};

const PLAY_W = 1080;
const HEADLINE_INK = '#111111';
const HEADLINE_ACCENT = '#FF3C1E';
const HEADLINE_PX = 64;
/** Line height of the headline face as a share of its size. */
const HEADLINE_LINE = 1;
const HEADLINE_FADE_IN = 200;
const HEADLINE_FADE_OUT = 200;

// ---------------------------------------------------------------------------
// resolveHeadline
// ---------------------------------------------------------------------------

/**
 * The headline as the engine draws it. A Look with only the v1 fields is the
 * one-event writer's headline (`positioned: false`); any other field makes it
 * the word-level one (`headlineV2.js`, `positioned: true`), which also needs
 * the text `measure` and the clip's length `len` (seconds).
 *
 * @param {string} text  the typed headline (empty = nothing to draw)
 * @param {string|{w,h}} canvas
 * @param {object} look  the Look's `headline` section (may be empty)
 * @param {{clear?: {top:boolean,left:boolean,px:number}, measure?: Function, len?: number}} [opts]
 *        `clear`: a corner logo the default placement keeps clear of
 * @returns {null|object}
 */
export function resolveHeadline(text, canvas, look, opts = {}) {
    const clean = headlineText(text, HEADLINE_MAX);
    if (!clean) return null;
    const c = cleanHeadline(look);
    if (isPositioned(c)) return resolveHeadlineV2(clean, c, canvas, opts);
    const { w: pw, h: ph } = canvasSize(canvas);
    const k = Math.min(pw / PLAY_W, ph / 1200, 1);
    const px = (v) => Math.max(1, Math.round(v * k));
    const tall = pw / ph < 0.6;
    const size = c.size ?? 1;
    const top = Math.round(ph * (tall ? 0.085 : 0.05));
    const sideH = Math.round((90 * pw) / PLAY_W);

    const noCard = c.card === 'none';
    const inkRgb = c.ink ?? (noCard ? '#FFFFFF' : undefined);
    const ink = inkRgb ?? HEADLINE_INK;
    const accent = c.accent ?? HEADLINE_ACCENT;
    let edge;
    let edgeW;
    // Dark ink gets a light edge, any other a dark one.
    let dark = !inkRgb;
    if (inkRgb) {
        const n = parseInt(inkRgb.slice(1), 16);
        dark = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 90;
    }
    if (noCard) {
        // No card: a dark outline keeps the type readable (a light one when
        // the ink itself is dark).
        edge = dark ? '#FFFFFF' : '#000000';
        edgeW = px(HEADLINE_EDGE * size);
    } else {
        edge = c.card ?? '#FFFFFF';
        edgeW = px(HEADLINE_PAD * size);
    }
    const fontPx = px(HEADLINE_PX * size);
    const lines = headlineMarkup(clean);
    const block = lines.length * fontPx * HEADLINE_LINE;

    const placed = c.x !== undefined || c.y !== undefined;
    let cx;
    let cy;
    let margin;
    let wrapW;
    if (placed) {
        const cx0 = (c.x ?? 0.5) * pw;
        const half = Math.max(Math.min(cx0, pw - cx0) - sideH, 0.2 * pw);
        cx = Math.min(Math.max(cx0, half + sideH), pw - half - sideH);
        const cy0 = c.y === undefined ? top + block / 2 : c.y * ph;
        // The whole card stays inside the frame.
        const reach = block / 2 + edgeW;
        cy = Math.min(Math.max(cy0, reach), Math.max(ph - reach, reach));
        margin = Math.max(Math.round(pw / 2 - half), 0);
        cx = Math.round(cx);
        cy = Math.round(cy);
        wrapW = pw - 2 * margin;
    } else {
        let ml = sideH;
        let mr = sideH;
        const cl = opts.clear;
        if (cl && cl.top === true) {
            const wide = Math.max(sideH, cl.px);
            if (cl.left) ml = wide;
            else mr = wide;
        }
        margin = null;
        wrapW = pw - ml - mr;
        cx = ml + wrapW / 2;
        cy = top + block / 2;
    }

    // Time on screen: the whole clip, or `seconds` of it with a short fade out.
    const seconds = c.seconds > 0 ? c.seconds : 0;
    return {
        positioned: false,
        w: pw,
        h: ph,
        k,
        text: clean,
        lines,
        font: 'Archivo Black',
        fontPx,
        size,
        ink,
        accent,
        noCard,
        card: noCard ? null : { color: edge, pad: edgeW },
        outline: noCard ? { color: edge, width: edgeW } : null,
        // The stroke round the letters, as a field of the Look would say it
        // (width in px on a 1080-wide canvas).
        stroke: { color: noCard ? edge : (dark ? '#FFFFFF' : '#000000'), width: noCard ? edgeW / k : 0 },
        edgeW,
        block,
        wrapW,
        margin,
        cx,
        cy,
        center: { x: cx / pw, y: cy / ph },
        placed,
        // Libass scales a top-aligned line about its top edge.
        originTop: !placed,
        anim: c.anim ?? 'pop',
        seconds,
    };
}

/** When the headline's entrance has settled (ms into the clip). */
export function headlineSettleMs(r) {
    if (r.positioned) return r.timing.settleMs;
    return r.anim === 'pop' ? 340 : r.anim === 'fade' ? HEADLINE_FADE_IN : 0;
}

/** When the headline goes (ms into a clip `durMs` long). */
export function headlineEndMs(r, durMs) {
    if (r.positioned) return Math.min(r.timing.endMs, durMs);
    return r.seconds > 0 && r.seconds * 1000 < durMs ? r.seconds * 1000 : durMs;
}

/**
 * Opacity and scale of the headline `localMs` into the clip, or `null`
 * once it has gone. `durMs` is the clip's length.
 */
export function headlineMotion(r, localMs, durMs) {
    const end = r.seconds > 0 && r.seconds * 1000 < durMs ? r.seconds * 1000 : durMs;
    const fout = end < durMs ? Math.min(HEADLINE_FADE_OUT, Math.floor(end)) : 0;
    if (localMs < 0 || localMs >= end) return null;
    let fin = 0;
    let scale = 1;
    if (r.anim === 'pop') {
        fin = 160;
        const curve = [[0, 0.72], [200, 1.06], [340, 1]];
        if (localMs <= 0) scale = curve[0][1];
        else if (localMs >= 340) scale = 1;
        else {
            const i = localMs <= 200 ? 1 : 2;
            const [t0, v0] = curve[i - 1];
            const [t1, v1] = curve[i];
            scale = v0 + ((v1 - v0) * (localMs - t0)) / (t1 - t0);
        }
    } else if (r.anim === 'fade') {
        fin = HEADLINE_FADE_IN;
    }
    const inn = fin > 0 ? localMs / fin : 1;
    const out = fout > 0 ? (end - localMs) / fout : 1;
    return { opacity: clamp(Math.min(inn, out), 0, 1), scale };
}

// ---------------------------------------------------------------------------
// snapping (the stage's guides)
// ---------------------------------------------------------------------------

/** Distance (fraction of the frame) of the safe margin from each edge. */
export const SAFE_MARGIN = 0.05;

/**
 * Snap one axis. `v` is the centre and `half` half the layer's extent (both
 * fractions of the frame). The centre snaps to the frame's middle line and
 * to the safe margins; the layer's edges snap to the margins too. Returns
 * the snapped centre and the guide line to draw (`null` = free).
 */
export function snapAxis(v, half, threshold) {
    const cands = [
        [0.5, 0.5],
        [SAFE_MARGIN, SAFE_MARGIN],
        [1 - SAFE_MARGIN, 1 - SAFE_MARGIN],
        [SAFE_MARGIN + half, SAFE_MARGIN],
        [1 - SAFE_MARGIN - half, 1 - SAFE_MARGIN],
    ];
    let best = null;
    for (const [to, guide] of cands) {
        const d = Math.abs(to - v);
        if (d <= threshold && (!best || d < best.d)) best = { d, v: to, guide };
    }
    return best ? { v: best.v, guide: best.guide } : { v, guide: null };
}

/** Snap a centre on both axes; `free` (Alt) leaves it alone. */
export function snapCentre(x, y, half, threshold, free = false) {
    if (free) return { x, y, guideX: null, guideY: null };
    const a = snapAxis(x, half.x, threshold.x);
    const b = snapAxis(y, half.y, threshold.y);
    return { x: a.v, y: b.v, guideX: a.guide, guideY: b.guide };
}
