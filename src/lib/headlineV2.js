// The engine's word-level headline, mirrored for the Studio stage.
//
// A headline whose Look holds any field beyond the v1 ones is drawn by the
// engine's word-level writer: the rows are laid out from the font's metrics,
// the card is one vector shape around every row, shadow and glow are copies of
// the text, and the entrance and exit are the captions' own. This file follows
// digiclip-rs `src/captions/ass.rs` (`headline_v2`) and `src/captions/motion.rs`
// (`headline_rows`, `headline_events`) and builds the same thing the caption
// stage draws: a resolved "caption" and one block of words that the caption
// model (`captionMotion.js`) lays out and `WordCaption` draws. When this file
// and the engine disagree, the engine is right. Pure functions: no React, no
// DOM; text widths come from a `measure` the caller supplies.
import { canvasSize } from './captionStyles.js';
import { mergeMotion } from './captionFields.js';
import { balancedRows, breakRows, cfgOf, flatMeasure, lineBox, planFor } from './captionMotion.js';
import { DANGLING, accentPick, bare, charLen } from './headlineText.js';
import { HEADLINE_EDGE, HEADLINE_PAD } from './layerFields.js';

const PLAY_W = 1080;
const HEADLINE_PX = 64;
const INK = '#111111';
const ACCENT = '#FF3C1E';
const FADE_IN = 200;
const FADE_OUT = 200;
const POP_MS = 340;

const luma = (hexColour) => {
    const n = parseInt(hexColour.slice(1), 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};

/** The room the headline text has across the frame (px), as the engine
 *  works it out: the frame less the side margins, wider on the side of a
 *  corner logo. `clear` is `logoClear()`'s answer. */
export function headlineMargins(pw, clear) {
    const side = Math.round((90 * pw) / PLAY_W);
    let ml = side;
    let mr = side;
    if (clear && clear.top === true) {
        const wide = Math.max(side, clear.px);
        if (clear.left) ml = wide;
        else mr = wide;
    }
    return { side, ml, mr };
}

/** The share of the frame width a headline text block may take by default. */
export function headlineRoom(canvas, clear, placedX = false) {
    const { w: pw } = canvasSize(canvas);
    const { side, ml, mr } = headlineMargins(pw, clear);
    return (placedX ? pw - 2 * side : pw - ml - mr) / pw;
}

/** How many rows a headline of these words takes and how wide the block may
 *  be: `avail` px first, then up to `safe` px when that is what it takes to
 *  stay within `maxRows`. `null` when it still needs more rows. Text that is
 *  `minRows` long is spread over at least that many rows (never more rows
 *  than words) (`headline_rows`). */
export function headlineRows(font, size, spacing, words, [avail, safe], [minRows, maxRows], measure = flatMeasure()) {
    const sp = measure(' ', font, size).w + spacing;
    const widths = words.map((t) => measure(t, font, size).w + charLen(t) * spacing);
    for (const room of [avail, Math.max(safe, avail)]) {
        const n = breakRows(widths, sp, room).length;
        if (n <= maxRows) return [Math.min(Math.max(n, minRows), maxRows, Math.max(words.length, 1)), room];
    }
    return null;
}

/** The headline's entrance and exit, and when it is on screen (seconds on the
 *  clip's clock): the v1 `anim` is the entrance unless `enter` says
 *  otherwise; a headline that ends early fades out unless `exit` says
 *  otherwise; an `exit` with a time and no kind is a fade. `dur` is the
 *  clip's length (seconds). */
export function headlineTiming(c, dur = Infinity) {
    const start = c.delay_s ?? 0;
    const end = c.seconds > 0 && start + c.seconds < dur ? start + c.seconds : dur;
    const early = end < dur - 1e-9;
    const anim = c.anim ?? 'pop';
    const en0 = anim === 'fade'
        ? { kind: 'fade', ms: FADE_IN, ease: 'linear' }
        : anim === 'none' ? { kind: 'none', ms: 0, ease: null } : { kind: 'pop', ms: POP_MS, ease: null };
    const ex0 = early ? { kind: 'fade', ms: Math.min(FADE_OUT, (end - start) * 1000) } : { kind: 'none', ms: 0 };
    const lookExit = c.exit ? { ...c.exit, kind: c.exit.kind ?? 'fade' } : null;
    const { enter, exit } = mergeMotion(c.enter, lookExit, en0, ex0);
    const startMs = start * 1000;
    return {
        start,
        end,
        early,
        enter,
        exit,
        startMs,
        endMs: end * 1000,
        // When the entrance has settled (ms into the clip).
        settleMs: startMs + (enter.kind === 'none' ? 0 : enter.ms),
    };
}

/**
 * The positioned headline on a canvas.
 *
 * @param {string} text  the cleaned headline (`headlineText`), at most 48 characters
 * @param {object} c  the Look's cleaned `headline` section
 * @param {string|{w,h}} canvas
 * @param {{measure?: Function, clear?: object|null, len?: number}} [opts]
 *        `measure` the text measure, `clear` a corner logo's claim on the top
 *        margin, `len` the clip's length in seconds
 * @returns `cap` (a resolved caption for the word model), `lines` (its one
 *   block, empty when nothing is drawn), `plan`, `rect` (the card's or the
 *   type's box in px) and the numbers the inspector shows.
 */
export function resolveHeadlineV2(text, c, canvas, { measure = flatMeasure(), clear = null, len = Infinity } = {}) {
    const { w: pw, h: ph } = canvasSize(canvas);
    const k = Math.min(pw / PLAY_W, ph / 1200, 1);
    const px = (v) => Math.max(1, Math.round(v * k));
    const tall = pw / ph < 0.6;
    const size = c.size ?? 1;
    const font = c.font ?? 'Archivo Black';
    const fontPx = px(HEADLINE_PX * size);

    // The card: a colour or an object; `none` (or an invisible object) is no card.
    const cardObj = c.card && typeof c.card === 'object' ? c.card : null;
    const noCard = c.card === 'none' || (!!cardObj && cardObj.opacity === 0);
    const cardCol = cardObj?.color ?? (typeof c.card === 'string' && c.card !== 'none' ? c.card : '#FFFFFF');
    const cardOp = cardObj?.opacity ?? 1;
    const pad = cardObj?.pad ?? HEADLINE_PAD * size;
    const radius = cardObj?.radius ?? 0;
    // Ink, and the stroke: a card needs none, bare type gets today's dark edge.
    const inkRgb = c.ink ?? (noCard ? '#FFFFFF' : undefined);
    const ink = inkRgb ?? INK;
    const dark = !inkRgb || luma(inkRgb) < 90;
    let strokeColor = dark ? '#FFFFFF' : '#000000';
    let strokeW = noCard ? px(HEADLINE_EDGE * size) : 0;
    if (c.stroke?.color) strokeColor = c.stroke.color;
    if (c.stroke?.width !== undefined) strokeW = c.stroke.width * k;
    const accent = c.accent ?? ACCENT;

    // The words, as typed and as drawn.
    const raw = text.split(' ').filter(Boolean);
    const upper = c.case === 'upper';
    const drawn = (w) => (upper ? w.toUpperCase() : w);
    // Room: the text block's width, and the most the card allows.
    const { side, ml, mr } = headlineMargins(pw, clear);
    const edge = 12 * k;
    const placedX = c.x !== undefined;
    const cx = placedX ? c.x * pw : (ml + pw - mr) / 2;
    const room = placedX ? pw - 2 * side : pw - ml - mr;
    const want = c.width !== undefined ? Math.min(c.width * pw, pw) : room;
    const cardEx = (noCard ? 0 : pad * k) + strokeW + edge;
    const safe = Math.max(pw - 2 * cardEx, 40);
    let avail = Math.min(want, safe);

    // Rows: as many as the width needs, two once it is long enough to wrap,
    // at most `max_lines` (3 when not set). When that does not fit, the block
    // widens up to the card's room, and after that the headline loses words
    // from its end (never ending on a word that hangs).
    const maxRows = c.max_lines ?? 3;
    const spacing = (c.spacing ?? 0) * fontPx;
    let kept = raw.length;
    let rows = 1;
    for (;;) {
        const words = raw.slice(0, kept).map(drawn);
        const long = charLen(raw.slice(0, kept).join(' ')) > 18 && kept > 1;
        const minRows = long && maxRows >= 2 ? 2 : 1;
        const r = headlineRows(font, fontPx, spacing, words, [avail, safe], [minRows, maxRows], measure);
        if (r) {
            [rows, avail] = r;
            break;
        }
        if (kept <= 1) {
            rows = 1;
            avail = safe;
            break;
        }
        kept -= 1;
        while (kept > 2 && DANGLING.includes(bare(raw[kept - 1]))) kept -= 1;
    }
    const shown = raw.slice(0, kept);
    shown[kept - 1] = shown[kept - 1].replace(/[,;:.\-—]+$/u, '');
    const words = shown.map(drawn);
    const aw = c.accent_word ?? 'auto';
    const pick = aw === 'none' ? -1 : aw === 'first' ? 0 : aw === 'last' ? shown.length - 1 : accentPick(shown);

    const timing = headlineTiming(c, len);
    const { start, end } = timing;

    // Layout (`headline_events`): the block's rows, the ink's reach, the card
    // and where the block goes.
    const n = words.length;
    const sp = measure(' ', font, fontPx).w + spacing;
    const { asc, desc } = lineBox(font, fontPx);
    const widths = words.map((t) => measure(t, font, fontPx).w + charLen(t) * spacing);
    const marginX = Math.max(Math.round((pw - avail) / 2), 0);
    const availE = Math.max(pw - 2 * marginX, 40);
    const ranges = rows <= 1 ? [[0, n]] : balancedRows(widths, sp, rows, availE);
    const inkOf = (t) => {
        const m = measure(t, font, fontPx);
        return [m.top, m.bottom];
    };
    const textOf = ([a, b]) => words.slice(a, b).join(' ');
    const rowW = ([a, b]) => widths.slice(a, b).reduce((s, x) => s + x, 0) + sp * Math.max(b - a - 1, 0);
    const blockW = Math.max(0, ...ranges.map(rowW));
    const nrows = ranges.length;
    const topInk = fontPx / 2 + (asc - desc) / 2 - inkOf(textOf(ranges[0]))[0];
    const bottomInk = fontPx / 2 + (nrows - 1) * fontPx + (asc - desc) / 2 - inkOf(textOf(ranges[nrows - 1]))[1];
    const padPx = noCard ? 0 : pad * k;
    const ex = padPx + strokeW;
    const ey = padPx + strokeW;
    const cardH = bottomInk - topInk + 2 * ey;
    const blockH = (nrows - 1) * fontPx + fontPx;
    const topEdge = Math.round(ph * (tall ? 0.085 : 0.05));
    let top = c.y === undefined ? topEdge - (topInk - ey) : c.y * ph - (topInk + bottomInk) / 2;
    // The whole card inside the frame (the top wins when it cannot be).
    const over = top + topInk - ey + cardH - (ph - edge);
    if (over > 0) top -= over;
    const under = edge - (top + topInk - ey);
    if (under > 0) top += under;
    const half = Math.max(Math.min(blockW / 2 + ex, pw / 2 - edge), 0);
    const x = Math.min(Math.max(cx, half + edge), pw - half - edge);
    const anchor = { mode: 'middle', x: Math.round(x), y: Math.round(top + blockH / 2) };
    const blockTop = anchor.y - blockH / 2;

    // What the caption model reads: the headline's fields under the names the
    // captions use, every word on screen together, no keyword bump.
    const fx = {
        words: { mode: 'all', keyword: { scale: 1 } },
        enter: { kind: timing.enter.kind, ms: timing.enter.ms, ease: timing.enter.ease },
        exit: { kind: timing.exit.kind, ms: timing.exit.ms },
    };
    if (c.spacing !== undefined) fx.spacing = c.spacing;
    if (c.align) fx.align = c.align;
    if (c.shadow) fx.shadow = c.shadow;
    if (c.glow) fx.glow = c.glow;
    if (!noCard) fx.box = { color: cardCol, opacity: cardOp, pad_x: pad, pad_y: pad, radius, per: 'line' };
    const cap = {
        style: 'headline',
        w: pw,
        h: ph,
        k,
        show: true,
        font,
        fontPx,
        lineH: fontPx,
        caps: false,
        color: ink,
        active: ink,
        accent,
        outline: null,
        box: null,
        outlineW: 0,
        shadow: 0,
        shadowColor: '#000000',
        shadowOpacity: 1,
        anim: 'none',
        clean: fx,
        wordLevel: true,
        base: { stroke: { color: strokeColor, w: strokeW }, boxCol: null, boxOpacity: cardOp },
        anchor,
        wrapW: availE,
        headlineRows: nrows,
    };
    const block = { t0: start, t1: end, words: words.map((t, i) => ({ text: t, raw: t, s: start, e: end, key: i === pick })) };
    // Nothing is drawn for a headline that is on screen for no time at all.
    const lines = end - start < 0.02 ? [] : [block];
    const plan = planFor(cfgOf(cap), cap, block, measure);

    // The box the stage selects: the card, or the type and its edge.
    const card = !noCard ? plan.boxes.line[0] : null;
    const rect = card
        ? { x: card.cx - card.w / 2, y: card.cy - card.h / 2, w: card.w, h: card.h }
        : { x: anchor.x - (blockW / 2 + ex), y: blockTop + topInk - ey, w: blockW + 2 * ex, h: cardH };
    const centreY = blockTop + (topInk + bottomInk) / 2;
    return {
        positioned: true,
        w: pw,
        h: ph,
        k,
        text,
        words,
        rows: nrows,
        font,
        fontPx,
        size,
        ink,
        accent,
        accentIndex: pick,
        noCard,
        card: noCard ? null : { color: cardCol, opacity: cardOp, pad, radius },
        stroke: { color: strokeColor, width: strokeW / k },
        edgeW: strokeW,
        room: room / pw,
        wrapW: availE,
        cx: anchor.x,
        cy: centreY,
        center: { x: anchor.x / pw, y: centreY / ph },
        placed: c.x !== undefined || c.y !== undefined,
        enter: timing.enter,
        exit: timing.exit,
        timing,
        cap,
        lines,
        plan,
        rect,
    };
}
