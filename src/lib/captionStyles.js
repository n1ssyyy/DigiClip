// The engine's caption styles, mirrored for the Studio stage.
//
// Everything here follows digiclip-rs `src/captions/ass.rs` (presets, the
// placement rules, the Look overrides, grouping and the motion timings) and
// `src/look.rs` (ranges). When this file and the engine disagree, the
// engine is right. Pure data and functions: no React, no DOM, importable
// from Node for the tests.

export const CAPTION_STYLES = ['tiktok', 'karaoke', 'hormozi', 'minimal', 'beast', 'neon', 'highlight', 'ghost'];

/** Output canvases (the engine's PlayRes per shape). */
export const CANVASES = {
    '9:16': { w: 1080, h: 1920 },
    '4:5': { w: 1080, h: 1350 },
    '1:1': { w: 1080, h: 1080 },
    '16:9': { w: 1920, h: 1080 },
};

export const FONTS = ['Anton', 'Archivo Black', 'Inter Medium', 'JetBrains Mono'];

export const MOTIONS = ['pop', 'words', 'none', 'fade', 'slide', 'bounce'];

const PLAY_W = 1080;
const PLAY_H = 1920;
/** Padding (px at 1080 wide) of a box a Look adds to a style without one. */
export const BOX_PAD = 14;

// Font metrics of the bundled faces (head.unitsPerEm, OS/2 winAscent and
// winDescent, hhea ascender and descender). libass sizes type like
// VSFilter: the ASS font size is the height of the font's cell
// (winAscent + winDescent), so the em in px is size * upm / cell.
export const FONT_METRICS = {
    'Anton': { upm: 2048, winA: 2876, winD: 674, hheaA: 2409, hheaD: 674 },
    'Archivo Black': { upm: 1000, winA: 1035, winD: 312, hheaA: 878, hheaD: 210 },
    'Inter Medium': { upm: 2048, winA: 1984, winD: 494, hheaA: 1984, hheaD: 494 },
    'JetBrains Mono': { upm: 1000, winA: 1165, winD: 400, hheaA: 1020, hheaD: 300 },
};

/**
 * How to set a font so a browser draws it like libass does at ASS size
 * `fontPx`: the CSS font-size (em), how far the cell extends above and
 * below the baseline, and how far the baseline sits from the cell top
 * (so CSS' half-leading can be corrected).
 */
export function fontBox(font, fontPx) {
    const m = FONT_METRICS[font] ?? FONT_METRICS['Archivo Black'];
    const cell = m.winA + m.winD;
    const em = (fontPx * m.upm) / cell;
    const u = em / m.upm; // px per font unit
    // Content area the browser paints a background over (hhea).
    const cssAbove = m.hheaA * u;
    const cssBelow = m.hheaD * u;
    // Cell libass puts a box over.
    const cellAbove = (m.winA / cell) * fontPx;
    const cellBelow = (m.winD / cell) * fontPx;
    // Where CSS puts the baseline inside a line of height `fontPx`.
    const cssBaseline = (fontPx - (cssAbove + cssBelow)) / 2 + cssAbove;
    return {
        em,
        lineH: fontPx,
        // Nudge to make the baseline land where libass puts it.
        shiftY: cellAbove - cssBaseline,
        // Extra background above/below the content area to span the cell.
        padAbove: Math.max(0, cellAbove - cssAbove),
        padBelow: Math.max(0, cellBelow - cssBelow),
    };
}

/** ASS `&HAABBGGRR` -> CSS `#RRGGBB` (alpha dropped). */
export function assColor(c) {
    return `#${c.slice(8, 10)}${c.slice(6, 8)}${c.slice(4, 6)}`.toUpperCase();
}

/** ASS `&HAABBGGRR` -> opacity 0..1 (alpha 00 = opaque). */
export function assOpacity(c) {
    return 1 - parseInt(c.slice(2, 4), 16) / 255;
}

/** `#RRGGBB` -> `rgb(r g b / a)` for CSS. */
export function rgba(hex, opacity = 1) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h, 16);
    return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${Math.round(opacity * 1000) / 1000})`;
}

// The eight presets, from `preset()` in ass.rs. Colours stay in ASS form
// (primary = spoken, secondary = not yet spoken, outline = outline or box,
// back = shadow) and are converted below.
const PRESETS = {
    tiktok: { font: 'Archivo Black', size: 84, caps: true, primary: '&H00FFFFFF', secondary: '&H00FFFFFF', outline: '&H00000000', back: '&H00552CFE', alignment: 2, marginV: 400, border: 1, outlineW: 2, shadow: 2, words: 3, chars: 14 },
    karaoke: { font: 'Archivo Black', size: 84, caps: true, primary: '&H0035E1FF', secondary: '&H00FFFFFF', outline: '&H00000000', back: '&H80000000', alignment: 5, marginV: 0, border: 1, outlineW: 3, shadow: 0, words: 3, chars: 14 },
    hormozi: { font: 'Anton', size: 110, caps: true, primary: '&H00FFFFFF', secondary: '&H00FFFFFF', outline: '&H00000000', back: '&HCC000000', alignment: 2, marginV: 450, border: 3, outlineW: 2, shadow: 0, words: 3, chars: 16 },
    minimal: { font: 'Inter Medium', size: 64, caps: false, primary: '&H00FFFFFF', secondary: '&H00FFFFFF', outline: '&H00000000', back: '&H99000000', alignment: 2, marginV: 300, border: 1, outlineW: 2, shadow: 1, words: 4, chars: 20 },
    beast: { font: 'Archivo Black', size: 96, caps: true, primary: '&H0000FFFF', secondary: '&H00FFFFFF', outline: '&H00000000', back: '&H80000000', alignment: 2, marginV: 420, border: 1, outlineW: 4, shadow: 0, words: 2, chars: 12 },
    neon: { font: 'Anton', size: 88, caps: true, primary: '&H00FFFF00', secondary: '&H00FFFFFF', outline: '&H00000000', back: '&H80000000', alignment: 5, marginV: 0, border: 1, outlineW: 3, shadow: 0, words: 3, chars: 14 },
    highlight: { font: 'Anton', size: 100, caps: true, primary: '&H00000000', secondary: '&H00000000', outline: '&H0035E6A3', back: '&HCC000000', alignment: 2, marginV: 450, border: 3, outlineW: 2, shadow: 0, words: 3, chars: 16 },
    ghost: { font: 'Inter Medium', size: 60, caps: false, primary: '&H00FFFFFF', secondary: '&H00FFFFFF', outline: '&H00000000', back: '&H99000000', alignment: 2, marginV: 200, border: 1, outlineW: 2, shadow: 1, words: 4, chars: 22 },
};

// Keyword colour per preset (`accent_for` in ass.rs).
const ACCENTS = { beast: '&H00FFFF00', neon: '&H00FF00FF', highlight: '&H00FFFFFF' };
const ACCENT_DEFAULT = '&H0000FFFF';

/** One style in the shape the stage wants (CSS colours, no ASS). */
export const STYLES = Object.fromEntries(CAPTION_STYLES.map((id) => {
    const p = PRESETS[id];
    return [id, {
        id,
        font: p.font,
        size: p.size,
        caps: p.caps,
        color: assColor(p.secondary),
        active: assColor(p.primary),
        accent: assColor(ACCENTS[id] ?? ACCENT_DEFAULT),
        outline: assColor(p.outline),
        outlineAlpha: Math.round((1 - assOpacity(p.outline)) * 255),
        outlineW: p.outlineW,
        shadow: p.shadow,
        shadowColor: assColor(p.back),
        shadowOpacity: assOpacity(p.back),
        border: p.border,
        alignment: p.alignment,
        marginV: p.marginV,
        words: p.words,
        chars: p.chars,
        anim: 'pop',
    }];
}));

export function validStyle(id) {
    return CAPTION_STYLES.includes(id) ? id : 'tiktok';
}

export function canvasSize(canvas) {
    if (canvas && typeof canvas === 'object' && canvas.w > 0 && canvas.h > 0) return { w: canvas.w, h: canvas.h };
    return CANVASES[canvas] ?? CANVASES['9:16'];
}

// ---------------------------------------------------------------------------
// the Look's captions section, cleaned the way look.rs reads it
// ---------------------------------------------------------------------------

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : undefined);
const HEX = /^#?[0-9a-f]{6}$/i;
const hex = (v) => (typeof v === 'string' && HEX.test(v.trim()) ? `#${v.trim().replace('#', '').toUpperCase()}` : undefined);

/** Engine motion name -> canonical id (`off`/`static` are `none`). */
export function animName(v) {
    if (typeof v !== 'string') return undefined;
    switch (v.trim().toLowerCase()) {
        case 'pop': return 'pop';
        case 'none': case 'off': case 'static': return 'none';
        case 'words': case 'word': case 'reveal': return 'words';
        case 'fade': return 'fade';
        case 'slide': return 'slide';
        case 'bounce': return 'bounce';
        default: return undefined;
    }
}

/** What the engine would make of `captions`: ranges clamped, bad values
 *  absent. Colours come back `#RRGGBB`, `box` is `'none'` or a colour. */
export function cleanCaptions(c) {
    const o = c && typeof c === 'object' ? c : {};
    const out = {};
    if (typeof o.show === 'boolean') out.show = o.show;
    for (const k of ['x', 'y']) {
        const n = num(o[k], 0, 1);
        if (n !== undefined) out[k] = n;
    }
    const size = num(o.size, 0.5, 2);
    if (size !== undefined) out.size = size;
    if (typeof o.font === 'string') {
        const f = FONTS.find((n) => n.toLowerCase() === o.font.trim().toLowerCase());
        if (f) out.font = f;
    }
    if (typeof o.case === 'string') {
        const w = o.case.trim().toLowerCase();
        if (w === 'upper' || w === 'asis') out.case = w;
    }
    for (const k of ['color', 'active', 'accent', 'outline']) {
        const h = hex(o[k]);
        if (h) out[k] = h;
    }
    const ow = num(o.outline_w, 0, 8);
    if (ow !== undefined) out.outline_w = ow;
    const sh = num(o.shadow, 0, 6);
    if (sh !== undefined) out.shadow = sh;
    if (o.box === null || (typeof o.box === 'string' && o.box.trim().toLowerCase() === 'none')) out.box = 'none';
    else if (typeof o.box === 'string' && hex(o.box)) out.box = hex(o.box);
    const bo = num(o.box_opacity, 0, 1);
    if (bo !== undefined) out.box_opacity = bo;
    const mw = num(o.max_words, 1, 8);
    if (mw !== undefined) out.max_words = Math.round(mw);
    const an = animName(o.anim);
    if (an) out.anim = an;
    return out;
}

// ---------------------------------------------------------------------------
// resolveCaptions: the style with the Look on top, as the engine builds it
// ---------------------------------------------------------------------------

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * The fully resolved caption look for a style on a canvas.
 *
 * @param {string} styleId   one of CAPTION_STYLES
 * @param {string|{w,h}} canvas  '9:16' | '4:5' | '1:1' | '16:9' (or a size)
 * @param {object} look  the Look's `captions` section (may be empty)
 * @param {{anim?: string}} [flat]  the flat `caption_anim` option
 */
export function resolveCaptions(styleId, canvas, look, flat = {}) {
    const id = validStyle(styleId);
    const st = STYLES[id];
    const c = cleanCaptions(look);
    const { w: pw, h: ph } = canvasSize(canvas);

    // Type is designed at 1080 wide; shorter canvases scale it down.
    const k = Math.min(pw / PLAY_W, ph / 1200, 1);
    const px = (v) => Math.max(1, Math.round(v * k));
    const tall = pw / ph < 0.6;

    let alignment;
    let marginV;
    if (tall) {
        alignment = st.alignment;
        marginV = st.marginV;
    } else if (st.alignment === 5) {
        alignment = 2;
        marginV = Math.round(ph * 0.14);
    } else {
        alignment = st.alignment;
        marginV = Math.max(Math.round((st.marginV * ph) / PLAY_H), Math.round(ph * 0.1));
    }
    const side = Math.round((40 * pw) / PLAY_W);

    // An explicit position wins over the style's alignment. The block is
    // centred on the point and wraps inside the nearer frame edge; close to
    // an edge the centre is nudged inward so a few words still fit.
    const placed = c.x !== undefined || c.y !== undefined;
    let anchor;
    let wrapW;
    if (placed) {
        const cx0 = (c.x ?? 0.5) * pw;
        const half = Math.max(Math.min(cx0, pw - cx0) - side, 0.2 * pw);
        const cx = Math.min(Math.max(cx0, half + side), pw - half - side);
        const margin = Math.max(Math.round(pw / 2 - half), 0);
        anchor = { mode: 'middle', x: Math.round(cx), y: Math.round((c.y ?? 0.5) * ph) };
        wrapW = pw - 2 * margin;
    } else if (alignment === 2) {
        anchor = { mode: 'bottom', x: pw / 2, y: ph - marginV };
        wrapW = pw - 2 * side;
    } else {
        anchor = { mode: 'middle', x: pw / 2, y: ph / 2 };
        wrapW = pw - 2 * side;
    }

    const font = c.font ?? st.font;
    const fontPx = px(st.size * (c.size ?? 1));
    const caps = c.case ? c.case === 'upper' : st.caps;
    const active = c.active ?? c.color ?? st.active;
    const color = c.color ?? st.color;
    const accent = c.accent ?? st.accent;

    // Box: BorderStyle 3 draws it in the outline colour, `outline_w` wide.
    const boxAlpha = (op) => Math.round((1 - clamp(op, 0, 1)) * 255);
    let border = st.border;
    let outlineHex = st.outline;
    let outlineAlpha = st.outlineAlpha;
    let outlineW = px(st.outlineW);
    if (c.box === 'none') {
        border = 1;
    } else if (c.box) {
        outlineHex = c.box;
        outlineAlpha = boxAlpha(c.box_opacity ?? 1);
        if (border !== 3) {
            border = 3;
            outlineW = px(BOX_PAD);
        }
    } else if (border === 3 && c.box_opacity !== undefined) {
        outlineAlpha = boxAlpha(c.box_opacity);
    }
    if (border !== 3 && c.outline) {
        outlineHex = c.outline;
        outlineAlpha = 0;
    }
    if (c.outline_w !== undefined) outlineW = c.outline_w * k;
    outlineW = round2(outlineW);
    const shadow = round2(c.shadow !== undefined ? c.shadow * k : st.shadow);

    const boxed = border === 3;
    // A see-through box is drawn on its own (see ass.rs `soft_box`).
    const softBox = boxed && outlineAlpha !== 0;

    // Words per line: the style's character budget stretches with the word
    // limit so a higher limit is reachable.
    let maxWords = st.words;
    let maxChars = st.chars;
    if (c.max_words !== undefined) {
        const n = c.max_words;
        if (n > st.words) maxChars = Math.ceil((st.chars * n) / st.words);
        maxWords = n;
    }

    const lineH = fontPx;
    const center = anchor.mode === 'bottom'
        ? { x: anchor.x / pw, y: (anchor.y - lineH / 2) / ph }
        : { x: anchor.x / pw, y: anchor.y / ph };

    return {
        style: id,
        w: pw,
        h: ph,
        k,
        show: c.show !== false,
        font,
        fontPx,
        lineH,
        caps,
        color,
        active,
        accent,
        outline: boxed ? null : { color: outlineHex, width: outlineW },
        box: boxed ? { color: outlineHex, opacity: round2(1 - outlineAlpha / 255), pad: outlineW, soft: softBox } : null,
        // outline_w is the padding while a box is on.
        outlineW,
        shadow,
        shadowColor: st.shadowColor,
        shadowOpacity: st.shadowOpacity,
        maxWords,
        maxChars,
        wordCap: c.max_words ?? null,
        anim: c.anim ?? animName(flat.anim) ?? st.anim,
        anchor,
        wrapW,
        placed,
        center,
    };
}

/** Where a style puts its caption by default: the centre of one line as a
 *  fraction of the frame. */
export function defaultPosition(styleId, canvas) {
    const { center } = resolveCaptions(styleId, canvas, {});
    return { x: center.x, y: center.y };
}

/** The default position of every style on every canvas. */
export const DEFAULT_POSITIONS = Object.fromEntries(CAPTION_STYLES.map((s) => [
    s,
    Object.fromEntries(Object.keys(CANVASES).map((cv) => [cv, defaultPosition(s, cv)])),
]));

// ---------------------------------------------------------------------------
// keywords and grouping
// ---------------------------------------------------------------------------

export const POWER_WORDS = [
    'free', 'secret', 'never', 'always', 'new', 'best', 'stop', 'money', 'win', 'wins', 'viral', 'insane',
    'crazy', 'easy', 'fast', 'proven', 'truth', 'lies', 'lie', 'mistake', 'mistakes', 'hack', 'million',
    'billion', 'first', 'last', 'warning', 'exposed', 'rich', 'guaranteed', 'subscribe', 'subscribed',
    'challenge', 'challenges', 'world',
];

const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
/** Rust `str::len`: UTF-8 bytes. */
const byteLen = (s) => (enc ? enc.encode(s).length : s.length);
const charLen = (s) => [...s].length;
const NON_ALNUM_EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Keyword test on the original casing: digits and power words always
 *  pop; proper nouns pop unless they open the sentence. */
export function isKeyword(raw, sentenceStart = false) {
    const t = String(raw).trim().replace(NON_ALNUM_EDGE, '').toLowerCase();
    if (!t) return false;
    if (/[0-9]/.test(t)) return true;
    if (POWER_WORDS.includes(t)) return true;
    if (sentenceStart) return false;
    const first = [...String(raw).trim()][0];
    return !!first && /\p{Lu}/u.test(first) && byteLen(t) > 1;
}

const endsSentence = (w) => /[.!?…]$/u.test(w);

function attachPunctuation(words) {
    const out = [];
    for (const w of words) {
        const isPunct = w.w.length > 0 && !/[\p{L}\p{N}]/u.test(w.w);
        if (out.length && isPunct) {
            const last = out[out.length - 1];
            last.w += w.w;
            last.e = Math.max(last.e, w.e);
            continue;
        }
        out.push({ ...w });
    }
    return out;
}

function group(words, maxWords, maxChars, maxGap, maxDur) {
    const lines = [];
    let cur = [];
    for (const w of words) {
        let flush = false;
        if (cur.length) {
            const last = cur[cur.length - 1];
            const textLen = cur.reduce((n, x) => n + byteLen(x.w) + 1, 0) + byteLen(w.w);
            flush = cur.length >= maxWords || textLen > maxChars || (w.s - last.e) > maxGap || (w.e - cur[0].s) > maxDur;
        }
        if (flush) {
            lines.push(cur);
            cur = [];
        }
        cur.push(w);
    }
    if (cur.length) lines.push(cur);
    return lines;
}

function splitSentences(lines) {
    const out = [];
    for (const line of lines) {
        let cur = [];
        for (const w of line) {
            cur.push(w);
            if (endsSentence(w.w)) {
                out.push(cur);
                cur = [];
            }
        }
        if (cur.length) out.push(cur);
    }
    return out;
}

/** Shortest time a caption line stays up (s). */
export const MIN_LINE_S = 0.45;
/** Gaps shorter than this between lines are bridged (s). */
export const BRIDGE_S = 0.35;

function mergeFlashes(lines, maxC, wordCap) {
    const chars = (l) => l.reduce((n, w) => n + charLen(w.w) + 1, 0);
    const span = (l) => l[l.length - 1].e - l[0].s;
    const fits = (a, b) => !endsSentence(a[a.length - 1].w)
        && b[0].s - a[a.length - 1].e < 0.6
        && chars(a) + chars(b) <= maxC + 8
        && (wordCap == null || a.length + b.length <= wordCap);
    const out = [];
    const q = lines.slice();
    while (q.length) {
        const line = q.shift();
        if (span(line) < MIN_LINE_S) {
            if (q.length && fits(line, q[0])) {
                line.push(...q.shift());
                out.push(line);
                continue;
            }
            const prev = out[out.length - 1];
            if (prev && fits(prev, line)) {
                prev.push(...line);
                continue;
            }
        }
        out.push(line);
    }
    return out;
}

/**
 * Caption lines the way the engine groups them: words are joined with
 * their punctuation, split on gaps over 0.6 s, lines over 4 s, the word
 * and character budgets; moving motions then also break at sentence ends
 * and fold lines too short to read into a neighbour.
 *
 * @param {{w:string,s:number,e:number}[]} words
 * @param {number} maxWords  @param {number} maxChars
 * @param {{moving?: boolean, wordCap?: number|null}} [opts]
 */
export function groupWords(words, maxWords, maxChars, opts = {}) {
    const { moving = true, wordCap = null } = opts;
    let lines = group(attachPunctuation(words ?? []), maxWords, maxChars, 0.6, 4.0);
    if (moving) lines = mergeFlashes(splitSentences(lines), maxChars, wordCap);
    return lines;
}

/** On-screen span per line, held through short gaps and to a minimum. */
export function holdLines(lines, end = Infinity) {
    return lines.map((l, i) => {
        const s = l[0].s;
        const e0 = l[l.length - 1].e;
        const next = Math.min(i + 1 < lines.length ? lines[i + 1][0].s : end, end);
        const e = next - e0 < BRIDGE_S ? next : Math.min(Math.max(e0, s + MIN_LINE_S), next);
        return [s, Math.max(e, Math.min(e0, end))];
    });
}

/**
 * Lines ready to draw: grouped, timed and with each word's display text
 * and keyword flag.
 *
 * @returns {{t0:number,t1:number,words:{text:string,raw:string,s:number,e:number,key:boolean}[]}[]}
 */
export function captionLines(words, resolved) {
    const moving = resolved.anim !== 'none';
    const lines = groupWords(words, resolved.maxWords, resolved.maxChars, { moving, wordCap: resolved.wordCap });
    const spans = moving ? holdLines(lines) : lines.map((l) => [l[0].s, l[l.length - 1].e]);
    let fresh = true; // the next word opens a sentence (tracked across lines)
    return lines.map((l, i) => {
        // libass' \k tags are cumulative: a word lights up when the words
        // before it have used up their own durations, not at its start.
        let ks = l[0].s;
        return {
            t0: spans[i][0],
            t1: spans[i][1],
            words: l.map((w) => {
                const key = isKeyword(w.w, fresh);
                fresh = endsSentence(w.w);
                const text = (resolved.caps ? w.w.toUpperCase() : w.w).replace(/[{}\n\r]/g, '');
                const k = ks;
                ks += Math.max(1, Math.round((w.e - w.s) * 100)) / 100;
                return { text, raw: w.w, s: w.s, e: w.e, k, key };
            }),
        };
    });
}

// ---------------------------------------------------------------------------
// motion: the engine's entrance and exit timings
// ---------------------------------------------------------------------------

const POP_MS = 200;
const BOUNCE_MS = 340;
const SLIDE_MS = 260;
const SLIDE_RISE = 0.022;
// [ms, scale]: linear between points, as the \t tags interpolate.
const POP_CURVE = [[0, 0.84], [110, 1.05], [200, 1]];
const BOUNCE_CURVE = [[0, 0.7], [120, 1.22], [210, 0.94], [280, 1.04], [340, 1]];
const FADES = { pop: [80, 60], words: [80, 60], bounce: [80, 60], fade: [200, 140], slide: [160, 60] };

function along(curve, ms) {
    if (ms <= curve[0][0]) return curve[0][1];
    for (let i = 1; i < curve.length; i++) {
        const [t1, v1] = curve[i];
        if (ms <= t1) {
            const [t0, v0] = curve[i - 1];
            return v0 + ((v1 - v0) * (ms - t0)) / (t1 - t0);
        }
    }
    return curve[curve.length - 1][1];
}

/** Whether a motion scales the line in (and so bumps keywords). */
export const scalesIn = (anim) => anim === 'pop' || anim === 'words' || anim === 'bounce';

/**
 * A line's opacity, scale and vertical offset (px, down is positive)
 * `localMs` after it appeared; `durMs` is how long it stays up.
 */
export function lineMotion(anim, localMs, durMs, frameH) {
    if (anim === 'none' || !FADES[anim]) return { opacity: 1, scale: 1, dy: 0 };
    const [fin, fout] = FADES[anim];
    const inn = fin > 0 ? localMs / fin : 1;
    const out = fout > 0 ? (durMs - localMs) / fout : 1;
    const opacity = clamp(Math.min(inn, out), 0, 1);
    let scale = 1;
    if (anim === 'pop' || anim === 'words') scale = along(POP_CURVE, localMs);
    else if (anim === 'bounce') scale = along(BOUNCE_CURVE, localMs);
    let dy = 0;
    if (anim === 'slide') {
        const rise = Math.round(frameH * SLIDE_RISE);
        dy = rise * (1 - clamp(localMs / SLIDE_MS, 0, 1));
    }
    return { opacity, scale, dy };
}

/** A keyword's bump after it is spoken (1 = none). Only motions that
 *  scale in bump, and not in the first moments while the line settles. */
export function keywordBump(anim, wordStartInLineMs, sinceWordMs) {
    if (!scalesIn(anim)) return 1;
    const settled = anim === 'bounce' ? BOUNCE_MS : POP_MS;
    if (wordStartInLineMs < settled || sinceWordMs < 0) return 1;
    if (sinceWordMs < 90) return 1 + (0.14 * sinceWordMs) / 90;
    if (sinceWordMs < 240) return 1.14 - (0.14 * (sinceWordMs - 90)) / 150;
    return 1;
}

/** Word-by-word reveal: later words fade in as they are spoken. */
export function wordReveal(anim, index, wordStartInLineMs, localMs) {
    if (anim !== 'words' || index === 0) return 1;
    return clamp((localMs - wordStartInLineMs) / 80, 0, 1);
}

/** Text-shadow ring that draws an outline `r` px wide around glyphs. */
export function outlineRing(r, color) {
    if (!(r > 0)) return '';
    const n = r > 4 ? 24 : r > 2 ? 16 : 8;
    const parts = [];
    for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        parts.push(`${(Math.cos(a) * r).toFixed(2)}px ${(Math.sin(a) * r).toFixed(2)}px 0 ${color}`);
    }
    return parts.join(',');
}
