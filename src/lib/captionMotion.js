// The engine's word-level caption model, mirrored for the Studio stage.
//
// Everything here follows digiclip-rs `src/captions/motion.rs` (the word
// timeline, the looks, the line's entrance and exit, the layout) and the
// grouping in `src/captions/ass.rs`. Where the engine writes ASS transforms
// the shapes are reproduced: `\t` accelerations 0.5 and 2 for "out" and "in",
// the two chained moves of "back", the pop and bounce keyframes. When this
// file and the engine disagree, the engine is right.
//
// Pure data and functions: no React, no DOM. Text widths come from a
// `measure` the caller supplies (the stage measures with a canvas, the tests
// with a fixed-width stand-in), so the same layout runs in both.
//
// Times in a plan are milliseconds on the sample's clock; lengths are output
// pixels.

import { captionLines, metricsOf } from './captionStyles.js';
import { ENTER_MS, EXIT_MS, effectiveMotion, fromAnim } from './captionFields.js';

// ---- constants (motion.rs) ---------------------------------------------------

export const BACK_AT = 0.58;
export const BACK_PEAK = 0.10;
export const BACK_C1 = 1.70158;
export const BUMP = 1.14;
export const BUMP_UP_MS = 90;
export const BUMP_END_MS = 240;
export const SLIDE_V = 0.022;
export const SLIDE_H = 0.04;
export const DROP_V = 0.06;
export const FX_BLUR = 8;
export const GLOW_BORD = 0.55;
export const GLOW_BLUR = 0.6;
export const GLOW_SIZE = 12;
export const GLOW_STRENGTH = 0.8;
export const SHADOW_Y = 4;
export const SHADOW_BLUR = 4;
export const SHADOW_OPACITY = 0.6;
export const BOX_PAD_X = 16;
export const BOX_PAD_Y = 8;

const EPS = 1e-6;

// ---- ease ------------------------------------------------------------------------

const clamp01 = (u) => Math.min(1, Math.max(0, u));

/** Progress `u` (0..1) through an ease (`ease_fn`). */
export function easeFn(ease, u) {
    u = clamp01(u);
    switch (ease) {
        case 'out': return Math.sqrt(u);
        case 'in': return u * u;
        case 'back': {
            const c3 = BACK_C1 + 1;
            return 1 + c3 * (u - 1) ** 3 + BACK_C1 * (u - 1) ** 2;
        }
        default: return u;
    }
}

/**
 * The shape the engine writes for an ease-back ramp that stands alone (the
 * ASS carries it as two chained moves): 0.4 acceleration up to 10% past the
 * target at 58% of the time, then a straight settle. The smooth curve
 * `easeFn('back')` is what the engine samples when several things move at
 * once; both reach the same peak at the same moment.
 */
export function backShape(u) {
    u = clamp01(u);
    if (u <= BACK_AT) return (1 + BACK_PEAK) * (u / BACK_AT) ** 0.4;
    return 1 + BACK_PEAK - (BACK_PEAK * (u - BACK_AT)) / (1 - BACK_AT);
}

/** The `\t` acceleration of an ease that is a plain power curve. */
export function accel(ease) {
    return ease === 'out' ? 0.5 : ease === 'in' ? 2 : 1;
}

/** A value that cannot go past its ends (colour, opacity) has no overshoot. */
const flat = (e) => (e === 'back' ? 'out' : e);

// ---- colours -------------------------------------------------------------------------

/** `#RRGGBB` -> [r, g, b]. */
export function rgbOf(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const sameCol = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** The colour a glow takes when none is given: the letters' own, or white
 *  when they are too dark to glow. */
export function glowDefault(fill) {
    const luma = 0.2126 * fill[0] + 0.7152 * fill[1] + 0.0722 * fill[2];
    return luma < 70 ? [255, 255, 255] : fill;
}

// ---- the resolved model (Cfg::resolve) ------------------------------------------------

const NO_GLOW = { col: [255, 255, 255], size: 0, strength: 0 };

/**
 * Everything the word model needs, after the v1 fields, the v2 fields and the
 * style's own values are folded together (`Cfg::resolve`).
 *
 * @param {object} r  `resolveCaptions()` output (it carries the cleaned Look)
 */
export function buildCfg(r) {
    const c = r.clean ?? {};
    const w = c.words ?? {};
    const k = r.k;
    const { enter, exit } = effectiveMotion(c, r.anim);
    const mode = w.mode ?? fromAnim(r.anim).mode;
    const fill = w.fill ?? 'snap';
    const prim = rgbOf(r.active);
    const sec = rgbOf(r.color);
    const accent = rgbOf(r.accent);
    const baseStroke = { col: rgbOf(r.base.stroke.color), w: r.base.stroke.w };
    const state = (s, color, opacity, scale) => ({
        color: s?.color ? rgbOf(s.color) : color,
        opacity: s?.opacity ?? opacity,
        scale: s?.scale ?? scale,
        blur: (s?.blur ?? 0) * k,
        lift: s?.lift ?? 0,
        rotate: s?.rotate ?? 0,
        stroke: baseStroke,
        glow: NO_GLOW,
        abox: 0,
    });
    const up = state(w.upcoming, sec, 1, 1);
    const act = state(w.active, prim, 1, 1);
    // A spoken word keeps the sung colour, as it does today.
    const spk = state(w.spoken, act.color, 1, 1);
    // The spoken word's own stroke is the caption's with its fields on top.
    const as = w.active?.stroke;
    if (as) {
        act.stroke = {
            col: as.color ? rgbOf(as.color) : baseStroke.col,
            w: as.width !== undefined ? as.width * k : baseStroke.w,
        };
    }
    // Boxes: the caption's (one per line or per word), and the spoken word's.
    const bx = c.box && typeof c.box === 'object' ? c.box : null;
    const boxCol = r.base.boxCol ? rgbOf(r.base.boxCol) : null;
    const boxfx = bx && {
        col: bx.color ? rgbOf(bx.color) : (boxCol ?? [0, 0, 0]),
        opacity: bx.opacity ?? r.base.boxOpacity,
        padX: (bx.pad_x ?? BOX_PAD_X) * k,
        padY: (bx.pad_y ?? BOX_PAD_Y) * k,
        radius: bx.radius ?? 0,
        perWord: bx.per === 'word',
        // A headline's card is one shape around every row.
        block: !!r.headlineRows,
    };
    const ab = w.active?.box;
    const abox = ab && {
        col: ab.color ? rgbOf(ab.color) : (boxCol ?? accent),
        radius: ab.radius ?? boxfx?.radius ?? 0,
        padX: boxfx ? boxfx.padX : BOX_PAD_X * k,
        padY: boxfx ? boxfx.padY : BOX_PAD_Y * k,
    };
    if (ab) act.abox = ab.opacity ?? 1;
    const sf = c.shadow && typeof c.shadow === 'object' ? c.shadow : null;
    const shadow = sf && {
        col: sf.color ? rgbOf(sf.color) : [0, 0, 0],
        x: (sf.x ?? 0) * k,
        y: (sf.y ?? SHADOW_Y) * k,
        blur: (sf.blur ?? SHADOW_BLUR) * k,
        opacity: sf.opacity ?? SHADOW_OPACITY,
    };
    const strokeMax = Math.max(baseStroke.w, up.stroke.w, act.stroke.w, spk.stroke.w);
    const decor = !!(boxfx || abox || shadow || c.glow || w.active?.glow || w.keyword?.glow);
    return {
        mode,
        fill,
        up,
        act,
        spk,
        spkColorSet: !!w.spoken?.color,
        kwColor: w.keyword?.color ? rgbOf(w.keyword.color) : accent,
        kwScale: w.keyword?.scale ?? null,
        attack: w.attack_ms ?? (mode === 'build' ? 80 : 0),
        attackEase: w.attack_ease ?? 'out',
        hold: w.hold_ms ?? 0,
        release: w.release_ms ?? 0,
        releaseEase: w.release_ease ?? 'out',
        enter,
        exit,
        spacing: (c.spacing ?? 0) * r.fontPx,
        lineGap: c.line_gap ?? 1,
        align: c.align ?? null,
        rotate: c.rotate ?? 0,
        // A headline has decided its rows (): one row never
        // wraps, more are spread evenly.
        maxLines: r.headlineRows ? (r.headlineRows === 1 ? 1 : null) : (c.lines ?? null),
        forceRows: r.headlineRows > 1 ? r.headlineRows : null,
        strokeMax,
        shadow,
        boxfx,
        abox,
        glow: c.glow ?? null,
        glowAct: w.active?.glow ?? null,
        glowKw: w.keyword?.glow ?? null,
        k,
        decor,
    };
}

/** Does the entrance bump keywords (the pop family, as today)? */
const bumps = (cfg) => cfg.kwScale === null && (cfg.enter.kind === 'pop' || cfg.enter.kind === 'bounce');

/** One state's glow: the layers of the Look over each other (a layer's unset
 *  fields keep the one below), the defaults under all of them. No layer, no
 *  glow. */
function resolveGlow(layers, fill, k) {
    const ls = layers.filter(Boolean);
    if (!ls.length) return { ...NO_GLOW, col: fill };
    const pick = (f) => {
        for (let i = ls.length - 1; i >= 0; i--) if (ls[i][f] !== undefined) return ls[i][f];
        return undefined;
    };
    const col = pick('color');
    return {
        col: col ? rgbOf(col) : glowDefault(fill),
        size: (pick('size') ?? GLOW_SIZE) * k,
        strength: pick('strength') ?? GLOW_STRENGTH,
    };
}

/**
 * A word's three looks [upcoming, active, spoken], with the keyword rule
 * applied (`word_looks`). A keyword is lit in the keyword colour (it replaces
 * the active colour and, unless `spoken.color` is set, stays once spoken);
 * `keyword.scale` multiplies its active and spoken scale; the glow layers
 * stack: the caption's, the spoken word's, then the keywords'.
 */
export function wordLooks(cfg, kw) {
    const up = { ...cfg.up };
    const act = { ...cfg.act };
    const spk = { ...cfg.spk };
    if (kw) {
        act.color = cfg.kwColor;
        if (!cfg.spkColorSet) spk.color = cfg.kwColor;
        const m = cfg.kwScale ?? 1;
        act.scale *= m;
        spk.scale *= m;
    }
    const gk = kw ? cfg.glowKw : null;
    up.glow = resolveGlow([cfg.glow], up.color, cfg.k);
    act.glow = resolveGlow([cfg.glow, cfg.glowAct, gk], act.color, cfg.k);
    spk.glow = resolveGlow([cfg.glow, gk], spk.color, cfg.k);
    return [up, act, spk];
}

/** When a word's release starts and ends (ms): the attack runs from the
 *  word's start; the word stays active until its end plus `hold` (never
 *  before the attack is done); the release runs from there. */
export function wordTimeline(cfg, s, e) {
    const a1 = s + cfg.attack;
    const r0 = Math.max(e + cfg.hold, a1);
    return [r0, r0 + cfg.release];
}

// ---- tracks -------------------------------------------------------------------------------

function mkTrack(base) {
    return { base, segs: [] };
}

function ramp(tr, t0, t1, to, ease) {
    const from = tr.segs.length ? tr.segs[tr.segs.length - 1].to : tr.base;
    if (from.every((a, i) => Math.abs(a - to[i]) < 1e-9)) return;
    tr.segs.push({ t0, t1: Math.max(t1, t0), from, to, ease });
}

/** A track's value at `t`: a start and ramps in order (a ramp with t0 == t1
 *  is a step; a moment that is a segment's end up to rounding counts as past it). */
export function evalTrack(tr, t) {
    let v = tr.base;
    for (const s of tr.segs) {
        if (t >= s.t1 - EPS) {
            v = s.to;
        } else if (t > s.t0) {
            const u = (t - s.t0) / (s.t1 - s.t0);
            const p = s.two ? backShape(u) : easeFn(s.ease, u);
            return s.from.map((a, i) => a + (s.to[i] - a) * p);
        } else {
            return v;
        }
    }
    return v;
}

/** A word's looks over time (`word_fx`). `s`, `e`: its times (ms). */
export function wordFx(cfg, s, e, looks, r0, r1, bump) {
    const [u, a, sp] = looks;
    const a1 = s + cfg.attack;
    const build = cfg.mode === 'build';
    const sweep = cfg.fill === 'sweep' && !sameCol(u.color, a.color);
    const upOp = build ? 0 : u.opacity;
    const ea = cfg.attackEase;
    const er = cfg.releaseEase;
    // Under a sweep the colour starts out as the active colour: the unswept
    // part is drawn in the secondary slot.
    const col = mkTrack(sweep ? a.color : u.color);
    if (!sweep) ramp(col, s, a1, a.color, flat(ea));
    ramp(col, r0, r1, sp.color, flat(er));
    const track = (base, va, vs, overshoot) => {
        const t = mkTrack([base]);
        ramp(t, s, a1, [va], overshoot ? ea : flat(ea));
        ramp(t, r0, r1, [vs], overshoot ? er : flat(er));
        return t;
    };
    const colour = (bu, ba, bs) => {
        const t = mkTrack(bu);
        ramp(t, s, a1, ba, flat(ea));
        ramp(t, r0, r1, bs, flat(er));
        return t;
    };
    return {
        s,
        e,
        col,
        op: track(upOp, a.opacity, sp.opacity, false),
        sc: track(u.scale, a.scale, sp.scale, true),
        blur: track(u.blur, a.blur, sp.blur, true),
        lift: track(0, a.lift, 0, true),
        rot: track(0, a.rotate, 0, true),
        sw: track(u.stroke.w, a.stroke.w, sp.stroke.w, false),
        scol: colour(u.stroke.col, a.stroke.col, sp.stroke.col),
        gs: track(u.glow.size, a.glow.size, sp.glow.size, false),
        gk: track(u.glow.strength, a.glow.strength, sp.glow.strength, false),
        gcol: colour(u.glow.col, a.glow.col, sp.glow.col),
        bo: track(u.abox, a.abox, sp.abox, false),
        bump,
        sweep: sweep ? u.color : null,
    };
}

const cs10 = (ms) => Math.round(ms / 10) * 10;

/**
 * Mark the ease-back ramps of scale, tilt and blur that the engine writes
 * as one two-move transform (`Item::exact`): the ramp must run exactly
 * between two of the item's own change points (centisecond-rounded), with
 * the line steady, the word not bumping and nothing moving across it.
 * Anywhere else the engine samples the smooth curve and so do we.
 *
 * @param {object} fx  a word's tracks
 * @param {[number, number]} win  when the word is on screen
 * @param {object} lwin  the line window its entrance and exit run on
 */
export function markExact(fx, win, lwin) {
    const backs = [fx.sc, fx.blur, fx.rot].filter((t) => t.segs.some((s) => s.ease === 'back'));
    if (!backs.length) return;
    const knots = [win[0], win[1]];
    const e = lwin.enter;
    if (e.kind !== 'none' && e.ms > 0) {
        knots.push(lwin.e0, lwin.e0 + e.ms, lwin.e0 + enterFadeMs(e));
        const keys = e.kind === 'pop' && e.ease == null ? POP_KEYS : e.kind === 'bounce' ? BOUNCE_KEYS : [];
        for (const k of keys) knots.push(lwin.e0 + k[0] * e.ms);
    }
    if (lwin.exit.kind !== 'none' && lwin.exit.ms > 0) knots.push(lwin.x1 - lwin.exit.ms, lwin.x1);
    const tracks = [fx.col, fx.scol, fx.gcol, fx.op, fx.sw, fx.gs, fx.gk, fx.bo, fx.sc, fx.blur, fx.lift, fx.rot];
    for (const t of tracks) for (const s of t.segs) knots.push(s.t0, s.t1);
    if (fx.bump) knots.push(fx.s, fx.s + BUMP_UP_MS, fx.s + BUMP_END_MS);
    if (fx.sweep) knots.push(fx.s, fx.e);
    const [lo, hi] = [cs10(win[0]), cs10(win[1])];
    const ks = [...new Set(knots.map(cs10).filter((k) => k >= lo && k <= hi))].sort((a, b) => a - b);
    const steady = (a, b) => {
        const pts = [a + 0.001, (a + b) / 2, b - 0.001].map((t) => lineFx(lwin, t));
        return pts.every((p) => ['sc', 'dx', 'dy', 'alpha', 'blur'].every((k) => Math.abs(p[k] - pts[0][k]) < 1e-6));
    };
    for (const t of backs) {
        for (const s of t.segs) {
            if (s.ease !== 'back') continue;
            const a = cs10(s.t0);
            const b = cs10(s.t1);
            if (b - a < 10 || ks.some((k) => k > a && k < b) || !ks.includes(a) || !ks.includes(b)) continue;
            if (fx.bump && a < fx.s + BUMP_END_MS && b > fx.s) continue;
            if (!steady(a, b)) continue;
            const lifts = [a + 0.001, (a + b) / 2, b - 0.001].map((x) => evalTrack(fx.lift, x)[0]);
            if (lifts.some((l) => Math.abs(l - lifts[0]) > 1e-3)) continue;
            s.two = true;
        }
    }
}

/** A glow's border and blur (px): the glow is the text grown by 0.55 x its
 *  size (on top of the stroke it starts from) and blurred by 0.6 x its size. */
export function glowParams(size, stroke = 0) {
    return { border: stroke + size * GLOW_BORD, blur: size * GLOW_BLUR };
}

/** The keyword bump: 14% up over 90 ms, back over the next 150. */
export function pulse(fx, t) {
    if (!fx.bump) return 1;
    const d = t - fx.s;
    if (d <= 0 || d >= BUMP_END_MS) return 1;
    if (d < BUMP_UP_MS) return 1 + ((BUMP - 1) * d) / BUMP_UP_MS;
    return BUMP - ((BUMP - 1) * (d - BUMP_UP_MS)) / (BUMP_END_MS - BUMP_UP_MS);
}

/** A word's state at `t` (ms): what `Item::frame` reads off its tracks. */
export function wordFrame(fx, t) {
    return {
        col: evalTrack(fx.col, t),
        op: evalTrack(fx.op, t)[0],
        sc: evalTrack(fx.sc, t)[0] * pulse(fx, t),
        blur: evalTrack(fx.blur, t)[0],
        lift: evalTrack(fx.lift, t)[0],
        rot: evalTrack(fx.rot, t)[0],
        sw: evalTrack(fx.sw, t)[0],
        scol: evalTrack(fx.scol, t),
        gs: evalTrack(fx.gs, t)[0],
        gk: evalTrack(fx.gk, t)[0],
        gcol: evalTrack(fx.gcol, t),
        bo: evalTrack(fx.bo, t)[0],
    };
}

// ---- the line: entrance and exit ----------------------------------------------------------------

export const NO_FX = Object.freeze({ sc: 1, dx: 0, dy: 0, alpha: 1, blur: 0 });

export const POP_KEYS = [[0, 0.84], [0.55, 1.05], [1, 1]];
export const BOUNCE_KEYS = [[0, 0.70], [0.353, 1.22], [0.618, 0.94], [0.824, 1.04], [1, 1]];

/** Linear between keyframes (`keyed`). */
export function keyed(keys, u) {
    for (let i = 1; i < keys.length; i++) {
        const [a, va] = keys[i - 1];
        const [b, vb] = keys[i];
        if (u <= b) return va + (vb - va) * clamp01((u - a) / (b - a));
    }
    return keys[keys.length - 1][1];
}

/** How long an entrance's own fade takes (ms). */
export function enterFadeMs(e) {
    switch (e.kind) {
        case 'none': return 0;
        case 'pop': case 'bounce': return Math.min(e.ms, 80);
        case 'slide_up': case 'slide_down': case 'slide_left': case 'slide_right': return Math.min(e.ms, 160);
        case 'zoom': return Math.min(e.ms, 150);
        case 'drop': return Math.min(e.ms, 100);
        default: return e.ms; // fade, blur
    }
}

/** Pixel sizes the line effects travel (frame size, canvas scale). */
export function reachOf(r) {
    return { v: SLIDE_V * r.h, h: SLIDE_H * r.w, drop: DROP_V * r.h, blur: FX_BLUR * r.k };
}

/** The line's entrance at `t`. `win` = { e0, x1, enter, exit, reach }. */
export function enterFx(win, t) {
    const e = win.enter;
    if (e.kind === 'none' || e.ms <= 0 || t >= win.e0 + e.ms) return NO_FX;
    const el = Math.max(t - win.e0, 0);
    const u = el / e.ms;
    const fade = enterFadeMs(e);
    const a = fade > 0 ? clamp01(el / fade) : 1;
    const p = (def) => easeFn(e.ease ?? def, u);
    const fx = { ...NO_FX, alpha: a };
    const rc = win.reach;
    switch (e.kind) {
        case 'pop': fx.sc = e.ease == null ? keyed(POP_KEYS, u) : 0.84 + 0.16 * easeFn(e.ease, u); break;
        case 'bounce': fx.sc = keyed(BOUNCE_KEYS, u); break;
        case 'fade': fx.alpha = clamp01(p('linear')); break;
        case 'slide_up': fx.dy = rc.v * (1 - p('out')); break;
        case 'slide_down': fx.dy = -rc.v * (1 - p('out')); break;
        case 'slide_left': fx.dx = rc.h * (1 - p('out')); break;
        case 'slide_right': fx.dx = -rc.h * (1 - p('out')); break;
        case 'zoom': fx.sc = 0.6 + 0.4 * p('out'); break;
        case 'blur': {
            const q = p('out');
            fx.blur = rc.blur * Math.max(1 - q, 0);
            fx.alpha = clamp01(q);
            break;
        }
        case 'drop': fx.dy = -rc.drop * (1 - p('back')); break;
        default: break;
    }
    return fx;
}

/** The line's exit at `t`. */
export function exitFx(win, t) {
    const x = win.exit;
    if (x.kind === 'none' || x.ms <= 0) return NO_FX;
    const v = clamp01((t - (win.x1 - x.ms)) / x.ms);
    if (v <= 0) return NO_FX;
    const q = v * v;
    const fx = { ...NO_FX, alpha: 1 - v };
    switch (x.kind) {
        case 'slide_up': fx.dy = -win.reach.v * q; break;
        case 'slide_down': fx.dy = win.reach.v * q; break;
        case 'zoom': fx.sc = 1 - 0.4 * q; break;
        case 'blur': fx.blur = win.reach.blur * v; break;
        default: break;
    }
    return fx;
}

/** Entrance and exit together. */
export function lineFx(win, t) {
    const a = enterFx(win, t);
    const b = exitFx(win, t);
    return { sc: a.sc * b.sc, dx: a.dx + b.dx, dy: a.dy + b.dy, alpha: a.alpha * b.alpha, blur: a.blur + b.blur };
}

// ---- text measure ----------------------------------------------------------------------------------

/**
 * A stand-in measure: every character the same width. For tests and for the
 * moments before the fonts are in. `measure(text, font, fontPx)` returns the
 * advance `w`, the ink's reach above and below the baseline (`top` >= `bottom`,
 * both upward, so a descender makes `bottom` negative) and the side bearings.
 */
export function flatMeasure(advance = 0.6) {
    return (text, font, fontPx) => {
        const n = [...text].length;
        return { w: n * advance * fontPx, top: 0.72 * fontPx, bottom: 0, lsb: 0.04 * fontPx, rsb: 0.04 * fontPx };
    };
}

/** libass' line box above and below the baseline for a font at `fontPx`:
 *  the ascent and the descent (both positive; together `fontPx`). */
export function lineBox(font, fontPx) {
    const m = metricsOf(font);
    const cell = m.winA + m.winD;
    return { asc: (m.winA / cell) * fontPx, desc: (m.winD / cell) * fontPx };
}

// ---- layout ---------------------------------------------------------------------------------------------

/**
 * Break a line's words (widths `w`, gap `sp`) into rows no wider than
 * `avail`, as evenly as the least number of rows allows. Returns [from, to)
 * pairs. (`break_rows`: the least row count by a greedy pass, then the set of
 * breaks with that many rows whose widest row is narrowest.)
 */
export function breakRows(w, sp, avail) {
    const n = w.length;
    let rows = 1;
    let cur = 0;
    w.forEach((x, i) => {
        const add = i === 0 || cur === 0 ? x : sp + x;
        if (cur > 0 && cur + add > avail) {
            rows += 1;
            cur = x;
        } else {
            cur += add;
        }
    });
    if (rows === 1 || n < 2) return [[0, n]];
    rows = Math.min(rows, n);
    if (n > 20) {
        // Far past the contract (8 words): the greedy rows will do.
        const out = [];
        let start = 0;
        let run = 0;
        w.forEach((x, i) => {
            const add = i === start ? x : sp + x;
            if (i > start && run + add > avail) {
                out.push([start, i]);
                start = i;
                run = x;
            } else {
                run += add;
            }
        });
        out.push([start, n]);
        return out;
    }
    return balancedRows(w, sp, rows, avail);
}

/**
 * Break a line's words into exactly `rows` rows: the narrowest widest row
 * wins (rows wider than `avail` only when nothing fits), then the wider top
 * row (`balanced_rows`). Far more words than any caption or headline has
 * are split evenly. Returns [from, to) pairs.
 */
export function balancedRows(w, sp, rows, avail) {
    const n = w.length;
    rows = Math.min(Math.max(rows, 1), Math.max(n, 1));
    if (rows === 1 || n < 2) return [[0, n]];
    if (n > 22) {
        const cuts = Array.from({ length: rows + 1 }, (_, i) => Math.floor((i * n) / rows));
        return cuts.slice(0, -1).map((c, i) => [c, cuts[i + 1]]);
    }
    const width = (a, b) => {
        let s = 0;
        for (let i = a; i < b; i++) s += w[i];
        return s + sp * Math.max(b - a - 1, 0);
    };
    let best = null;
    for (let mask = 0; mask < 2 ** (n - 1); mask++) {
        let bits = 0;
        for (let m = mask; m; m &= m - 1) bits++;
        if (bits !== rows - 1) continue;
        const cuts = [0];
        for (let i = 1; i < n; i++) if (mask & (1 << (i - 1))) cuts.push(i);
        cuts.push(n);
        let widest = 0;
        let fits = true;
        for (let j = 0; j + 1 < cuts.length; j++) {
            const x = width(cuts[j], cuts[j + 1]);
            widest = Math.max(widest, x);
            if (x > avail + 0.5) fits = false;
        }
        const key = widest + (fits ? 0 : 1e6);
        if (best === null || key < best.key - 0.5) best = { key, cuts };
    }
    const cuts = best ? best.cuts : [0, n];
    const out = [];
    for (let j = 0; j + 1 < cuts.length; j++) out.push([cuts[j], cuts[j + 1]]);
    return out;
}

const CLEAN = /[{}\n\r]/g;
const charCount = (s) => [...s].length;

/** The room a block has: the wrap width, never under 40 px. */
const availOf = (r) => Math.max(r.wrapW, 40);

/**
 * Split caption blocks so that none needs more than `maxRows` rows in the
 * room there is (a word wider than the room still gets a block of its own).
 * Sized for the biggest look a word takes, so a block that fits stays
 * fitting. (`fit_rows`; `lines` are raw `{w, s, e}` words.)
 */
export function fitRows(cfg, r, measure, lines, maxRows) {
    if (cfg.mode === 'single') return lines;
    const size = r.fontPx;
    const sp = measure(' ', r.font, size).w + cfg.spacing;
    const avail = availOf(r);
    const grow = Math.max(1, cfg.up.scale, cfg.act.scale, cfg.spk.scale) * Math.max(cfg.kwScale ?? 1, 1);
    const width = (w) => {
        const t = (r.caps ? w.w.toUpperCase() : w.w).replace(CLEAN, '');
        return (measure(t, r.font, size).w + charCount(t) * cfg.spacing) * grow;
    };
    const out = [];
    for (const line of lines) {
        let cur = [];
        for (const w of line) {
            cur.push(w);
            if (cur.length > 1 && breakRows(cur.map(width), sp, avail).length > maxRows) {
                const last = cur.pop();
                out.push(cur);
                cur = [last];
            }
        }
        if (cur.length) out.push(cur);
    }
    return out;
}

const cfgCache = new WeakMap();
/** `buildCfg`, remembered per resolved style. */
export function cfgOf(r) {
    let c = cfgCache.get(r);
    if (!c) {
        c = buildCfg(r);
        cfgCache.set(r, c);
    }
    return c;
}

/**
 * Caption blocks the way the word-level writer groups them: the line writer's
 * grouping under a Look's `max_chars` / `max_words`, then cut to `lines` rows.
 * Same shape as `captionLines` (`{t0, t1, words}`).
 */
export function captionBlocks(words, r, measure = flatMeasure()) {
    const cfg = cfgOf(r);
    const fit = cfg.maxLines ? (lines) => fitRows(cfg, r, measure, lines, cfg.maxLines) : null;
    return captionLines(words, r, fit);
}

/**
 * Lay one block out (the body of `events`): every word's slot, the rows and
 * where they sit, the block's centre and size, when each word is on screen,
 * and the geometry of the boxes. Cached per block, style and measure.
 */
export function layoutBlock(cfg, r, block, measure) {
    const size = r.fontPx;
    const spc = cfg.spacing;
    const sp = measure(' ', r.font, size).w + spc;
    const pitch = size * cfg.lineGap;
    const { asc, desc } = lineBox(r.font, size);
    const avail = availOf(r);
    const single = cfg.mode === 'single';
    const l0 = block.t0 * 1000;
    const l1 = block.t1 * 1000;
    const bumpOn = bumps(cfg);

    const ws = block.words.map((w) => {
        const m = measure(w.text, r.font, size);
        return {
            text: w.text,
            key: w.key,
            s: w.s * 1000,
            e: w.e * 1000,
            m,
            width: m.w + charCount(w.text) * spc,
        };
    });
    const looks = ws.map((w) => wordLooks(cfg, w.key));
    const slot = ws.map((w, i) => w.width * Math.max(1, ...looks[i].map((x) => x.scale)));
    const oneRow = single || cfg.maxLines === 1;
    const rowRanges = oneRow ? [[0, ws.length]] : cfg.forceRows ? balancedRows(slot, sp, cfg.forceRows, avail) : breakRows(slot, sp, avail);
    const nrows = single ? 1 : rowRanges.length;
    const cx = r.anchor.x;
    const blockH = (nrows - 1) * pitch + size;
    const top = r.anchor.mode === 'bottom' ? r.anchor.y - blockH : r.anchor.y - blockH / 2;
    const rowW = ([a, b]) => {
        let s = 0;
        for (let i = a; i < b; i++) s += slot[i];
        return s + sp * Math.max(b - a - 1, 0);
    };
    const blockW = Math.max(0, ...rowRanges.map(rowW));
    const centre = [cx, top + blockH / 2];

    const pos = ws.map(() => [0, 0]);
    const rows = [];
    if (single) {
        const cy = top + size / 2;
        ws.forEach((w, i) => { pos[i] = [cx, cy]; });
    } else {
        const blockL = cx - blockW / 2;
        rowRanges.forEach(([a, b], ri) => {
            const rw = rowW([a, b]);
            let x0;
            if (cfg.align === 'left') x0 = blockL;
            else if (cfg.align === 'right') x0 = blockL + blockW - rw;
            else if (cfg.align === 'center') x0 = blockL + (blockW - rw) / 2;
            else x0 = cx - rw / 2;
            const cy = top + size / 2 + ri * pitch;
            let x = x0;
            for (let i = a; i < b; i++) {
                pos[i] = [x + slot[i] / 2, cy];
                x += slot[i] + sp;
            }
            rows.push({ from: a, to: b, x0, width: rw, cy });
        });
    }

    // When a word is shown: the whole line, from its own start, or until the
    // next word comes (a release is cut there).
    const tails = ws.map((w) => wordTimeline(cfg, w.s, w.e));
    const win = ws.map((w, i) => {
        if (cfg.mode === 'all') return [l0, l1];
        if (cfg.mode === 'build') return [Math.max(w.s, l0), l1];
        const w0 = Math.max(w.s, l0);
        const next = Math.min(i + 1 < ws.length ? ws[i + 1].s : l1, l1);
        const end = looks[i][2].opacity <= 0 ? Math.min(next, tails[i][1]) : next;
        return [w0, Math.max(end, w0 + 10)];
    });
    const reach = reachOf(r);
    const winOf = (a, b) => ({ e0: a, x1: b, enter: cfg.enter, exit: cfg.exit, reach });
    const words = ws.map((w, i) => {
        const bump = bumpOn && !single && w.key && w.s - l0 >= cfg.enter.ms;
        const fx = wordFx(cfg, w.s, w.e, looks[i], tails[i][0], tails[i][1], bump);
        const lwin = single ? winOf(win[i][0], win[i][1]) : winOf(l0, l1);
        markExact(fx, win[i], lwin);
        return { ...w, i, pos: pos[i], slot: slot[i], looks: looks[i], tails: tails[i], win: win[i], fx, lwin };
    });

    // Where the ink of a word and of a row really is inside its line box: the
    // side bearings, and the ink's height above and below the baseline. A box
    // hugs the ink, not the line box.
    const rowOf = (i) => rowRanges.find(([a, b]) => i >= a && i < b);
    const bandOf = (text) => {
        const m = measure(text, r.font, size);
        return { top: m.top, bottom: m.bottom };
    };
    const oy = (b) => (asc - desc) / 2 - (b.top + b.bottom) / 2;
    const joined = ([a, b]) => ws.slice(a, b).map((w) => w.text).join(' ');
    const rowBand = (i) => (single ? bandOf(ws[i].text) : bandOf(joined(rowOf(i))));
    const wordBox = (i, bnd, padX, padY, radius) => {
        const { lsb, rsb } = ws[i].m;
        const w = ws[i].width - spc - lsb - rsb + 2 * (padX + cfg.strokeMax);
        const h = bnd.top - bnd.bottom + 2 * (padY + cfg.strokeMax);
        return { w, h, ax: (lsb - rsb) / 2, ay: oy(bnd), radius: radius * Math.min(w, h) / 2 };
    };

    const boxes = { libass: [], line: [], word: [], active: [] };
    if (r.box) {
        // The style's own (or a v1) box: libass draws it per row over the row's
        // whole width, or per word when one is shown at a time.
        if (single) {
            ws.forEach((w, i) => {
                boxes.libass.push({ word: i, cx: pos[i][0], cy: pos[i][1], w: w.m.w });
            });
        } else {
            rows.forEach((row) => boxes.libass.push({ row, cx: row.x0 + row.width / 2, cy: row.cy, w: row.width }));
        }
    }
    if (cfg.boxfx) {
        const bx = cfg.boxfx;
        if (bx.perWord || single) {
            ws.forEach((w, i) => {
                const b = wordBox(i, rowBand(i), bx.padX, bx.padY, bx.radius);
                boxes.word.push({ word: i, ...b });
            });
        } else if (bx.block) {
            // One card around every row: from the left-most ink to the
            // right-most, from the top of the first row's ink to the bottom
            // of the last row's.
            let l = Infinity;
            let rr = -Infinity;
            for (const row of rows) {
                const first = ws[row.from];
                const last = ws[row.to - 1];
                l = Math.min(l, pos[row.from][0] - (first.width - spc) / 2 + first.m.lsb);
                rr = Math.max(rr, pos[row.to - 1][0] + (last.width - spc) / 2 - last.m.rsb);
            }
            const a = rows[0];
            const z = rows[rows.length - 1];
            const topInk = a.cy + (asc - desc) / 2 - bandOf(joined([a.from, a.to])).top;
            const bottomInk = z.cy + (asc - desc) / 2 - bandOf(joined([z.from, z.to])).bottom;
            const w = rr - l + 2 * (bx.padX + cfg.strokeMax);
            const h = bottomInk - topInk + 2 * (bx.padY + cfg.strokeMax);
            boxes.line.push({ row: a, cx: (l + rr) / 2, cy: (topInk + bottomInk) / 2, w, h, radius: bx.radius * Math.min(w, h) / 2 });
        } else {
            rows.forEach((row) => {
                const bnd = bandOf(joined([row.from, row.to]));
                const first = ws[row.from];
                const last = ws[row.to - 1];
                const l = pos[row.from][0] - (first.width - spc) / 2 + first.m.lsb;
                const rr = pos[row.to - 1][0] + (last.width - spc) / 2 - last.m.rsb;
                const w = rr - l + 2 * (bx.padX + cfg.strokeMax);
                const h = bnd.top - bnd.bottom + 2 * (bx.padY + cfg.strokeMax);
                boxes.line.push({ row, cx: (l + rr) / 2, cy: row.cy + oy(bnd), w, h, radius: bx.radius * Math.min(w, h) / 2 });
            });
        }
    }
    if (cfg.abox) {
        const ab = cfg.abox;
        ws.forEach((w, i) => {
            boxes.active.push({ word: i, ...wordBox(i, rowBand(i), ab.padX, ab.padY, ab.radius) });
        });
    }

    return { cfg, size, spc, sp, single, l0, l1, lwin: winOf(l0, l1), centre, blockW, blockH, top, rows, words, boxes, tilt: cfg.rotate, asc, desc };
}

const planCache = new WeakMap();
/** `layoutBlock`, remembered per block while the style and measure stay. */
export function planFor(cfg, r, block, measure) {
    let e = planCache.get(block);
    if (e && e.cfg === cfg && e.measure === measure) return e.plan;
    const plan = layoutBlock(cfg, r, block, measure);
    planCache.set(block, { cfg, measure, plan });
    return plan;
}

// ---- state at a moment ---------------------------------------------------------------------------------------

/**
 * What the block looks like at `t` (ms): the line's motion and, for each word
 * that is on screen, its look. `reduced` keeps the colour, opacity, stroke and
 * glow but no motion (no entrance, scale, lift, tilt, blur or sweep).
 *
 * @returns {{groups: {fx: object, words: object[]}[]}} the words of a group
 *   share one line motion: one group for the block, or one per word in
 *   `single` mode where each word comes and goes on its own.
 */
export function frameAt(plan, t, { reduced = false } = {}) {
    const state = (w) => {
        const f = wordFrame(w.fx, t);
        const sweepOn = w.fx.sweep && !reduced;
        let p = null;
        if (w.fx.sweep) {
            if (reduced) p = t >= w.s ? 1 : 0;
            else p = w.e > w.s ? clamp01((t - w.s) / (w.e - w.s)) : (t >= w.s ? 1 : 0);
        }
        // Unswept, or snapped: the word's colour is the unswept one before it
        // is spoken and the track's after.
        const col = w.fx.sweep && p === 0 ? w.fx.sweep : f.col;
        const state = {
            i: w.i,
            col,
            under: sweepOn && p > 0 && p < 1 ? w.fx.sweep : null,
            sweep: sweepOn && p > 0 && p < 1 ? p : null,
            op: f.op,
            sc: reduced ? 1 : f.sc,
            blur: reduced ? 0 : f.blur,
            lift: reduced ? 0 : f.lift,
            rot: reduced ? 0 : f.rot,
            sw: f.sw,
            scol: f.scol,
            gs: f.gs,
            gk: f.gk,
            gcol: f.gcol,
            bo: f.bo,
        };
        return state;
    };
    const on = (w) => t >= w.win[0] && t < w.win[1];
    if (plan.single) {
        const groups = [];
        for (const w of plan.words) {
            if (!on(w)) continue;
            groups.push({ fx: reduced ? NO_FX : lineFx(w.lwin, t), words: [state(w)] });
        }
        return { groups };
    }
    if (!(t >= plan.l0 && t < plan.l1)) return { groups: [] };
    const fx = reduced ? NO_FX : lineFx(plan.lwin, t);
    return { groups: [{ fx, words: plan.words.filter(on).map(state) }] };
}

// ---- size of the block (for the selection box) --------------------------------------------------------------------

/**
 * How big a block is on the stage: its width and height with the room its
 * boxes and stroke take, turned by the block's tilt, and the height of the
 * rows alone (`bh`), which is what sits against the anchor.
 */
export function blockExtent(plan, r) {
    const cfg = plan.cfg;
    let padX = cfg.strokeMax;
    let padY = cfg.strokeMax;
    if (r.box) {
        padX = Math.max(padX, r.box.pad);
        padY = Math.max(padY, r.box.pad);
    }
    if (cfg.boxfx) {
        padX = Math.max(padX, cfg.boxfx.padX + cfg.strokeMax);
        padY = Math.max(padY, cfg.boxfx.padY + cfg.strokeMax);
    }
    const w = plan.blockW + 2 * padX;
    const h = plan.blockH + 2 * padY;
    const th = (plan.tilt * Math.PI) / 180;
    const c = Math.abs(Math.cos(th));
    const s = Math.abs(Math.sin(th));
    return { w: w * c + h * s, h: w * s + h * c, bh: plan.blockH };
}
