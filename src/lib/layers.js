// The engine's headline, progress bar and logo, mirrored for the Studio stage.
//
// Follows digiclip-rs `src/captions/ass.rs` (the Headline style, its
// markup, placement, clamp and entrance), `src/compose.rs` (`bar_thickness`,
// `draw_bar_at`), `src/render.rs` (`Logo`) and `src/look.rs` (ranges). When
// this file and the engine disagree, the engine is right. Pure functions:
// no React, no DOM, importable from Node for the tests.
import { canvasSize, clamp, hex, isKeyword, num } from './captionStyles.js';

export const HEADLINE_ANIMS = ['pop', 'fade', 'none'];
/** What the stage shows when the headline text is empty: real clips use
 *  their own title. */
export const HEADLINE_SAMPLE = 'Why most founders quit too early';
export const BAR_DEFAULT_COLOR = '#FFD400';
export const CORNERS = ['tl', 'tr', 'bl', 'br'];

/** Ranges of the sizes the stage resizes (look.rs). */
export const SIZE_RANGE = {
    captions: [0.5, 2],
    headline: [0.5, 2],
    logo: [0.4, 2.5],
};

const PLAY_W = 1080;
const HEADLINE_MAX = 48;
const HEADLINE_INK = '#111111';
const HEADLINE_ACCENT = '#FF3C1E';
const HEADLINE_PX = 64;
const HEADLINE_PAD = 24;
const HEADLINE_EDGE = 5;
/** Line height of the headline face as a share of its size. */
const HEADLINE_LINE = 1;
const HEADLINE_FADE_IN = 200;
const HEADLINE_FADE_OUT = 200;

// ---------------------------------------------------------------------------
// sections cleaned the way look.rs reads them
// ---------------------------------------------------------------------------

/** What the engine would make of `headline`: ranges clamped, bad values
 *  absent. `card` is `'none'` or a colour. */
export function cleanHeadline(h) {
    const o = h && typeof h === 'object' ? h : {};
    const out = {};
    for (const k of ['x', 'y']) {
        const n = num(o[k], 0, 1);
        if (n !== undefined) out[k] = n;
    }
    const size = num(o.size, 0.5, 2);
    if (size !== undefined) out.size = size;
    for (const k of ['ink', 'accent']) {
        const c = hex(o[k]);
        if (c) out[k] = c;
    }
    if (o.card === null || (typeof o.card === 'string' && o.card.trim().toLowerCase() === 'none')) out.card = 'none';
    else if (typeof o.card === 'string' && hex(o.card)) out.card = hex(o.card);
    if (typeof o.anim === 'string') {
        const a = o.anim.trim().toLowerCase();
        if (HEADLINE_ANIMS.includes(a)) out.anim = a;
    }
    const sec = num(o.seconds, 0, 3600);
    if (sec !== undefined) out.seconds = sec;
    return out;
}

export function cleanBar(b) {
    const o = b && typeof b === 'object' ? b : {};
    const out = {};
    if (typeof o.pos === 'string') {
        const p = o.pos.trim().toLowerCase();
        if (p === 'top' || p === 'bottom') out.pos = p;
    }
    const h = num(o.height, 0.5, 3);
    if (h !== undefined) out.height = h;
    return out;
}

export function cleanLogo(l) {
    const o = l && typeof l === 'object' ? l : {};
    const out = {};
    for (const k of ['x', 'y']) {
        const n = num(o[k], 0, 1);
        if (n !== undefined) out[k] = n;
    }
    const size = num(o.size, 0.4, 2.5);
    if (size !== undefined) out.size = size;
    const op = num(o.opacity, 0, 1);
    if (op !== undefined) out.opacity = op;
    return out;
}

// ---------------------------------------------------------------------------
// headline text and markup (headline_text, headline_markup)
// ---------------------------------------------------------------------------

/** Words a headline never ends on. */
const DANGLING = [
    'a', 'an', 'the', 'and', 'or', 'but', 'so', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
    'from', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'that', 'this', 'my', 'your', 'our',
    'their', 'his', 'her', 'its', 'if', 'when', 'than', 'then', 'because', 'about', 'into', 'i',
    'you', 'we', 'they', 'he', 'she', 'it', 'not', 'just', 'very', 'really', 'like', 'all',
];
const BARE_EDGE = /^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu;
const bare = (w) => w.replace(BARE_EDGE, '').toLowerCase();
const charLen = (s) => [...s].length;

/** Headline text: clean, sentence-cased, at most `max` chars and never cut
 *  mid-thought (`headline_text`). */
export function headlineText(raw, max = HEADLINE_MAX) {
    const t = String(raw ?? '').replace(/[{}\\*"“”]/g, '').split(/\s+/).filter(Boolean);
    let n = 0;
    let len = 0;
    for (const w of t) {
        const l = charLen(w) + (n > 0 ? 1 : 0);
        if (len + l > max) break;
        len += l;
        n += 1;
    }
    let keep = t.slice(0, n);
    if (n < t.length) {
        // Last clause break that keeps at least 3 words.
        let cut = -1;
        for (let i = n; i >= 3; i--) {
            if (/[,;:.!?—]$/u.test(keep[i - 1])) {
                cut = i;
                break;
            }
        }
        if (cut > 0) keep = keep.slice(0, cut);
        else while (keep.length > 2 && DANGLING.includes(bare(keep[keep.length - 1]))) keep = keep.slice(0, -1);
    }
    const out = keep.join(' ').replace(/[,;:.\-—…]+$/u, '').trim();
    return out ? out[0].toUpperCase() + out.slice(1) : '';
}

/** The text the stage draws for the typed headline: itself, or the sample
 *  title while it is empty (or nothing the engine would keep). */
export function stageHeadline(raw) {
    return headlineText(raw, HEADLINE_MAX) ? String(raw) : HEADLINE_SAMPLE;
}

/** The headline as lines of words, one word the accent: two balanced lines
 *  once it is long enough to wrap (`headline_markup`). */
export function headlineMarkup(h) {
    const words = h.split(' ');
    let pick = -1;
    for (let i = 1; i < words.length; i++) {
        const b = bare(words[i]);
        if (isKeyword(words[i], false) && !b.startsWith("i'") && b !== 'i') {
            pick = i;
            break;
        }
    }
    if (pick < 0) {
        // The longest content word; ties go to the earlier one.
        let best = -1;
        for (let i = 0; i < words.length; i++) {
            const b = bare(words[i]);
            if (charLen(b) >= 5 && !DANGLING.includes(b)) {
                if (best < 0 || charLen(words[i]) > charLen(words[best])) best = i;
            }
        }
        pick = best;
    }
    const total = charLen(h);
    let brk = -1;
    if (total > 18 && words.length > 1) {
        let bestScore = Infinity;
        for (let i = 1; i < words.length; i++) {
            const a = charLen(words.slice(0, i).join(' '));
            const score = Math.max(a, total - a - 1);
            if (score < bestScore) {
                bestScore = score;
                brk = i;
            }
        }
    }
    const lines = [[]];
    words.forEach((w, i) => {
        if (i === brk) lines.push([]);
        lines[lines.length - 1].push({ text: w, accent: i === pick });
    });
    return lines;
}

// ---------------------------------------------------------------------------
// resolveHeadline
// ---------------------------------------------------------------------------

/**
 * The headline as the engine draws it.
 *
 * @param {string} text  the typed headline (empty = nothing to draw)
 * @param {string|{w,h}} canvas
 * @param {object} look  the Look's `headline` section (may be empty)
 * @param {{clear?: {top:boolean,left:boolean,px:number}}} [opts]  a corner
 *        logo the default placement keeps clear of
 * @returns {null|object}
 */
export function resolveHeadline(text, canvas, look, opts = {}) {
    const clean = headlineText(text, HEADLINE_MAX);
    if (!clean) return null;
    const c = cleanHeadline(look);
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
    if (noCard) {
        // No card: a dark outline keeps the type readable (a light one when
        // the ink itself is dark).
        let dark = false;
        if (inkRgb) {
            const n = parseInt(inkRgb.slice(1), 16);
            dark = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 90;
        }
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
// the progress bar
// ---------------------------------------------------------------------------

/** Bar thickness in px (even): 0.65% of the height, at least 8, times the
 *  Look's height multiplier (never under 4). */
export function barThickness(canvas, height = 1) {
    const { h } = canvasSize(canvas);
    const even = (v) => Math.round(v / 2) * 2;
    return Math.min(Math.max(even(h * 0.0065 * height), even(8 * height), 4), h - (h % 2));
}

/** The bar's place on a canvas: its row, thickness, colour and where the
 *  fill ends at `progress` (0..1). */
export function resolveBar(canvas, color, look) {
    const c = cleanBar(look);
    const { w, h } = canvasSize(canvas);
    const thickness = barThickness(canvas, c.height ?? 1);
    const top = c.pos === 'top';
    const y = top ? 0 : h - thickness;
    return {
        w,
        h,
        top,
        pos: top ? 'top' : 'bottom',
        height: c.height ?? 1,
        thickness,
        y,
        color: hex(color) ?? BAR_DEFAULT_COLOR,
        center: { x: 0.5, y: (y + thickness / 2) / h },
        fill(progress) {
            const p = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
            return Math.min(Math.round((p * w) / 2) * 2, w);
        },
    };
}

// ---------------------------------------------------------------------------
// the logo
// ---------------------------------------------------------------------------

/** Corner insets (x, y) in px. */
export function logoInset(canvas) {
    const { w, h } = canvasSize(canvas);
    return [Math.round(w * 0.04), Math.round(h * 0.035)];
}

/**
 * The logo box on a canvas.
 *
 * @param {string|{w,h}} canvas
 * @param {string} corner  the flat `logo_pos`: tl | tr | bl | br
 * @param {object} look  the Look's `logo` section
 * @param {{w:number,h:number}|null} [natural]  the image's pixel size
 *        (unknown = square)
 */
export function resolveLogo(canvas, corner, look, natural) {
    const c = cleanLogo(look);
    const { w: cw, h: ch } = canvasSize(canvas);
    const aspect = natural && natural.w > 0 && natural.h > 0 ? natural.w / natural.h : 1;
    const scale = c.size ?? 1;
    const s = Math.min(cw, ch);
    const [bw, bh] = [s * 0.26 * scale, s * 0.14 * scale];
    const wRaw = Math.min(bw, bh * aspect);
    const even = (v) => Math.max(Math.round(v / 2) * 2, 2);
    const w = even(wRaw);
    const h = even(wRaw / aspect);
    const pos = CORNERS.includes(corner) ? corner : 'tr';
    const free = c.x !== undefined || c.y !== undefined;
    let x;
    let y;
    if (free) {
        const place = (centre, extent, room) => {
            const lo = centre - extent / 2;
            const e = Math.max(Math.round(lo / 2) * 2, 0);
            return Math.min(e, Math.max(room - extent, 0) & ~1);
        };
        x = place((c.x ?? 0.5) * cw, w, cw);
        y = place((c.y ?? 0.5) * ch, h, ch);
    } else {
        const [mx, my] = logoInset(canvas);
        x = pos[1] === 'l' ? mx : cw - w - mx;
        // Bottom corners sit higher: clear of the progress bar.
        y = pos[0] === 't' ? my : ch - h - my * 2;
    }
    return {
        w: cw,
        h: ch,
        corner: pos,
        free,
        aspect,
        scale,
        box: { w, h },
        x,
        y,
        center: { x: (x + w / 2) / cw, y: (y + h / 2) / ch },
        opacity: c.opacity !== undefined ? Math.round(c.opacity * 100) / 100 : 0.9,
    };
}

/** What headline text a corner logo makes the default headline keep clear
 *  of: the logo's width, its inset and a gap (pipeline.rs). `null` when the
 *  logo is placed freely, which the text does not make room for. */
export function logoClear(logo) {
    if (!logo || logo.free) return null;
    return {
        top: logo.corner[0] === 't',
        left: logo.corner[1] === 'l',
        px: logo.box.w + logoInset({ w: logo.w, h: logo.h })[0] + Math.round(logo.w * 0.025),
    };
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
