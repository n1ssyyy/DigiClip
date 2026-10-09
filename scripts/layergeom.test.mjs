// Tests for the headline, bar and logo geometry and timing:
//   node --test scripts/layergeom.test.mjs   (also run by look.test.mjs)
// Expected numbers come from digiclip-rs: `src/captions/motion.rs` (break_rows,
// balanced_rows, headline_rows), `src/captions/ass.rs` (rows, accent word,
// enter / exit / delay in centiseconds), `src/bar.rs` (BarFx bounds, track),
// `src/render.rs` (turned_box). Text widths here are a flat measure: the
// engine measures the real font, so only what does not depend on the font is
// compared number for number; the rest is compared as the engine's tests do.
import test from 'node:test';
import assert from 'node:assert/strict';

import { balancedRows, breakRows, flatMeasure, frameAt, GLOW_BLUR, GLOW_BORD, lineFx } from '../src/lib/captionMotion.js';
import { cleanLogo, isDressed } from '../src/lib/layerFields.js';
import { headlineRoom, headlineRows, headlineTiming, resolveHeadlineV2 } from '../src/lib/headlineV2.js';
import { headlineSettleMs, headlineEndMs, resolveBar, resolveHeadline, resolveLogo, barThickness, logoClear, turnedBox } from '../src/lib/layers.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const HEAD = 'Why most founders quit too early';
const LONG = 'Why most founders quit too early and what to do';
const TALL = '9:16';
const words = (t) => t.split(' ');
const at = (text, c, o = {}) => resolveHeadlineV2(text, c, TALL, { len: 9, ...o });
/** The rows of a resolved headline, as the words they hold. */
const rowsOf = (r) => r.plan.rows.map(({ from, to }) => r.plan.words.slice(from, to).map((w) => w.text));

// ---- rows (motion.rs) ----------------------------------------------------------

test('break_rows and balanced_rows are the engine\'s', () => {
    assert.deepEqual(breakRows([300, 300, 300, 300], 20, 700), [[0, 2], [2, 4]]);
    assert.deepEqual(breakRows([100, 100], 20, 700), [[0, 2]]);
    // A word wider than the room still gets a row of its own.
    assert.deepEqual(breakRows([900, 100], 20, 700), [[0, 1], [1, 2]]);
    const w = [100, 80, 120, 60, 90, 70];
    assert.deepEqual(balancedRows(w, 10, 1, 1000), [[0, 6]]);
    for (let rows = 2; rows <= 4; rows++) {
        const r = balancedRows(w, 10, rows, 1000);
        assert.equal(r.length, rows);
        assert.equal(r[0][0], 0);
        assert.equal(r.at(-1)[1], 6);
        assert.ok(r.every((x, i) => (i === 0 || r[i - 1][1] === x[0]) && x[1] > x[0]));
    }
    // Two rows: the split that makes the widest row narrowest.
    const width = ([a, b]) => w.slice(a, b).reduce((s, x) => s + x, 0) + 10 * (b - a - 1);
    const widest = Math.max(...balancedRows(w, 10, 2, 1000).map(width));
    for (let cut = 1; cut < 6; cut++) assert.ok(widest <= Math.max(width([0, cut]), width([cut, 6])) + 0.5);
    assert.deepEqual(balancedRows(w.slice(0, 3), 10, 5, 1000), [[0, 1], [1, 2], [2, 3]]);
    assert.deepEqual(balancedRows(Array(30).fill(10), 5, 3, 1000), [[0, 10], [10, 20], [20, 30]]);
    assert.deepEqual(balancedRows([], 5, 2, 100), [[0, 0]]);
});

test('headline_rows widens the block before it gives up, and spreads long text over two rows', () => {
    // 64 px type, every character 38.4 px, a gap 38.4 px: the text is 1804.8 px on one row.
    const long = words(LONG);
    const rows = (room, bounds, ws = long, spacing = 0) => headlineRows('Archivo Black', 64, spacing, ws, room, bounds);
    assert.deepEqual(rows([1008, 1008], [1, 3]), [2, 1008]);
    // Four rows at 540 is one too many: the block widens to what is safe.
    assert.deepEqual(rows([540, 1008], [1, 3]), [2, 1008]);
    assert.deepEqual(rows([700, 1008], [1, 3]), [3, 700]);
    assert.equal(rows([300, 1008], [1, 1]), null);
    assert.equal(rows([1008, 1008], [1, 1]), null);
    // A short text can be spread over two rows, never over more rows than words.
    assert.deepEqual(rows([1008, 1008], [1, 3], words('Big news')), [1, 1008]);
    assert.deepEqual(rows([1008, 1008], [2, 3], words('Big news')), [2, 1008]);
    assert.deepEqual(rows([1008, 1008], [2, 3], words('Big')), [1, 1008]);
    // Letter spacing makes words wider.
    assert.ok(rows([1008, 1008], [1, 3], long, 12)[0] >= rows([1008, 1008], [1, 3])[0]);
});

test('rows follow max_lines and width', () => {
    // Today's rule: long enough to wrap is two balanced rows; a short text stays on one.
    const two = at(HEAD, { font: 'Archivo Black' });
    assert.equal(two.rows, 2);
    assert.equal(rowsOf(two).flat().join(' '), HEAD);
    assert.equal(rowsOf(two).length, 2);
    assert.equal(at('Big news', { font: 'Archivo Black' }).rows, 1);
    // max_lines 1: one row, and the headline gives up words from its end to fit.
    const one = at(LONG, { max_lines: 1 });
    assert.equal(one.rows, 1);
    assert.ok(LONG.startsWith(one.words.join(' ')) && one.words.length < words(LONG).length, one.words.join(' '));
    // With a measure the engine's Archivo Black width has (0.45 em a character), a narrow width gives three rows.
    const m = flatMeasure(0.45);
    const three = at(LONG, { width: 0.5, max_lines: 3 }, { measure: m });
    assert.equal(three.rows, 3);
    for (const row of rowsOf(three)) assert.ok(m(row.join(' '), 'Archivo Black', 64).w <= 0.5 * 1080 + 1, row.join(' '));
    // With two allowed the block widens (up to the card's room) to hold the words.
    const wide = at(LONG, { width: 0.3, max_lines: 2 }, { measure: m });
    assert.equal(wide.rows, 2);
    assert.ok(rowsOf(wide).some((row) => m(row.join(' '), 'Archivo Black', 64).w > 0.3 * 1080));
    // Never more rows than max_lines; a wider block never needs more rows.
    for (let n = 1; n <= 3; n++) assert.ok(at(LONG, { max_lines: n, width: 0.5 }, { measure: m }).rows <= n, `max_lines ${n}`);
    assert.ok(at(LONG, { width: 1, max_lines: 3 }, { measure: m }).rows <= at(LONG, { width: 0.5, max_lines: 3 }, { measure: m }).rows);
});

test('the headline room is the frame less its margins, wider beside a corner logo', () => {
    close(headlineRoom(TALL, null), 900 / 1080);
    close(headlineRoom(TALL, null, true), 900 / 1080);
    const logo = resolveLogo(TALL, 'tl', {}, null);
    const clear = logoClear(logo);
    assert.deepEqual(clear.top && clear.left, true);
    assert.ok(headlineRoom(TALL, clear) < headlineRoom(TALL, null));
    // A placed x stops making room for the logo.
    close(headlineRoom(TALL, clear, true), 900 / 1080);
    assert.equal(logoClear(resolveLogo(TALL, 'tl', { x: 0.2, y: 0.1 }, null)), null);
});

test('the accent word is auto, first, last or none', () => {
    const pick = (c) => at(HEAD, c).lines[0].words.map((w, i) => (w.key ? w.text : null)).filter(Boolean);
    assert.deepEqual(pick({ font: 'Archivo Black' }), ['founders']);
    assert.deepEqual(pick({ accent_word: 'auto' }), ['founders']);
    assert.deepEqual(pick({ accent_word: 'first' }), ['Why']);
    assert.deepEqual(pick({ accent_word: 'last' }), ['early']);
    assert.deepEqual(pick({ accent_word: 'none' }), []);
    const r = at(HEAD, { accent_word: 'last', case: 'upper', accent: '#00FF00' });
    assert.equal(r.words.at(-1), 'EARLY');
    assert.equal(r.accentIndex, 5);
    assert.equal(r.accent, '#00FF00');
    assert.equal(at(HEAD, { accent_word: 'none' }).accentIndex, -1);
});

// ---- enter, exit, delay, seconds (ass.rs) ----------------------------------------

test('enter, exit and delay land on the engine\'s centiseconds', () => {
    const span = (c, dur) => {
        const t = headlineTiming(c, dur);
        return [Math.round(t.startMs / 10), Math.round(t.endMs / 10)];
    };
    const still = { enter: { kind: 'none' } };
    // Static: the delay moves the start, the event runs to the end of the clip.
    assert.deepEqual(span({ ...still, delay_s: 0.5 }, 9), [50, 900]);
    assert.deepEqual(span(still, 9), [0, 900]);
    // seconds counts from the moment the headline enters, and it fades out for 200 ms.
    const timed = headlineTiming({ ...still, delay_s: 0.5, seconds: 2 }, 9);
    assert.deepEqual([timed.startMs, timed.endMs], [500, 2500]);
    assert.deepEqual(timed.exit, { kind: 'fade', ms: 200 });
    assert.equal(timed.early, true);
    // An explicit exit: its own kind and time (a slide up over 300 ms, from 1.70 s).
    const up = headlineTiming({ ...still, seconds: 2, exit: { kind: 'slide_up', ms: 300 } }, 9);
    assert.deepEqual([up.exit, up.endMs - up.exit.ms], [{ kind: 'slide_up', ms: 300 }, 1700]);
    // An exit at the end of the clip is cut from the clip's end.
    const end = headlineTiming({ ...still, exit: { kind: 'fade', ms: 400 } }, 5);
    assert.deepEqual([end.exit.kind, end.endMs - end.exit.ms, end.early], ['fade', 4600, false]);
    // An exit with a time and no kind is a fade.
    assert.deepEqual(headlineTiming({ ...still, exit: { ms: 400 } }, 5).exit, { kind: 'fade', ms: 400 });
    // Seconds past the clip's end are the clip's end; a short stay never fades longer than it stays.
    assert.equal(headlineTiming({ seconds: 99 }, 9).early, false);
    assert.equal(headlineTiming({ seconds: 99 }, 9).endMs, 9000);
    assert.equal(headlineTiming({ seconds: 0.1 }, 9).exit.ms, 100);
});

test('the entrance runs from the delay for its time, and v1 anim is its shorthand', () => {
    const slide = headlineTiming({ enter: { kind: 'slide_down', ms: 400 }, delay_s: 0.5 }, 9);
    assert.deepEqual([slide.startMs, slide.settleMs], [500, 900]);
    assert.deepEqual(headlineTiming({ anim: 'fade' }, 9).enter, { kind: 'fade', ms: 200, ease: 'linear' });
    assert.equal(headlineTiming({ anim: 'none' }, 9).settleMs, 0);
    // An explicit enter wins over anim.
    assert.deepEqual([headlineTiming({ anim: 'none', enter: { kind: 'zoom', ms: 300 } }, 9).enter.kind, headlineTiming({ anim: 'none', enter: { kind: 'zoom', ms: 300 } }, 9).settleMs], ['zoom', 300]);
    // Pop is the default entrance: 340 ms.
    assert.deepEqual([headlineTiming({}, 9).enter.kind, headlineTiming({}, 9).settleMs], ['pop', 340]);
    assert.equal(headlineTiming({}, 9).enter.ms, 340);
});

test('the stage block follows the timing at exact times; a delay past the end draws nothing', () => {
    const r = at(HEAD, { enter: { kind: 'fade', ms: 400, ease: 'linear' }, exit: { kind: 'fade', ms: 400 }, delay_s: 1, seconds: 4 });
    const [b] = r.lines;
    assert.deepEqual([b.t0, b.t1], [1, 5]);
    const plan = r.plan;
    assert.deepEqual([plan.l0, plan.l1], [1000, 5000]);
    const alpha = (ms) => lineFx(plan.lwin, ms).alpha;
    close(alpha(1000), 0);
    close(alpha(1200), 0.5, 1e-3);
    close(alpha(1400), 1);
    close(alpha(3000), 1);
    close(alpha(4600), 1);
    close(alpha(4800), 0.5, 1e-3);
    assert.equal(frameAt(plan, 999).groups.length, 0);
    assert.equal(frameAt(plan, 1000).groups.length, 1);
    assert.equal(frameAt(plan, 5000).groups.length, 0);
    // The page's park and end times read the same timing.
    assert.equal(headlineSettleMs(r), 1400);
    assert.equal(headlineEndMs(r, 9000), 5000);
    assert.equal(headlineEndMs(r, 3000), 3000);
    // Nothing to draw when it starts at or past the end of the clip.
    assert.deepEqual(at(HEAD, { delay_s: 5 }, { len: 4 }).lines, []);
    assert.deepEqual(at(HEAD, { delay_s: 3.99 }, { len: 4 }).lines, []);
    assert.equal(at(HEAD, { delay_s: 3 }, { len: 4 }).lines.length, 1);
    // The v1 headline does not use any of this.
    assert.equal(resolveHeadline(HEAD, TALL, { card: '#111111' }, { len: 9 }).positioned, false);
    assert.equal(resolveHeadline(HEAD, TALL, { glow: { size: 10 } }, { len: 9 }).positioned, true);
});

test('the headline box is the card, or the type and its edge', () => {
    const carded = at(HEAD, { card: { radius: 1, pad: 30 } });
    assert.equal(carded.noCard, false);
    assert.deepEqual(carded.card, { color: '#FFFFFF', opacity: 1, pad: 30, radius: 1 });
    assert.ok(carded.rect.w > 0 && carded.rect.h > 0);
    // Invisible is no card; so is `none`; the type then gets its dark edge.
    for (const card of ['none', { opacity: 0 }]) {
        const r = at(HEAD, { card });
        assert.equal(r.noCard, true);
        assert.equal(r.card, null);
        assert.equal(r.ink, '#FFFFFF');
        assert.equal(r.stroke.width, 5);
    }
    // A card needs no stroke; a stroke of its own is in design px.
    assert.equal(carded.stroke.width, 0);
    assert.equal(at(HEAD, { stroke: { width: 3, color: '#102030' } }).stroke.width, 3);
    // The whole card stays in the frame, and the top wins.
    const low = at(HEAD, { y: 1, card: { pad: 80 } });
    // The anchor is a whole pixel, as the engine's is.
    assert.ok(low.rect.y + low.rect.h <= 1920 - 12 + 1);
    const high = at(HEAD, { y: 0 });
    assert.ok(high.rect.y >= 12 - 1);
});

// ---- the bar (bar.rs) --------------------------------------------------------------

test('inset is the margin from the sides and the edge the bar sits on', () => {
    const bh = barThickness(TALL, 1);
    assert.equal(bh, 12);
    const b = resolveBar(TALL, '#FFD400', { inset: 0.04 });
    // 4 % of 1080 is 43.2 px: the nearest even number, 44.
    assert.deepEqual([b.x0, b.y, b.x1, b.y + bh], [44, 1920 - 44 - bh, 1080 - 44, 1920 - 44]);
    assert.deepEqual(b.rect, { x: 44, y: 1864, w: 992, h: 12 });
    const top = resolveBar(TALL, '#FFD400', { inset: 0.04, pos: 'top' });
    assert.deepEqual([top.x0, top.y, top.x1, top.y + bh], [44, 44, 1080 - 44, 44 + bh]);
    // No inset: the bar runs to the frame's edges as before.
    const flat = resolveBar(TALL, '#FFD400', { radius: 0 });
    assert.deepEqual([flat.x0, flat.y, flat.x1, flat.y + bh], [0, 1920 - bh, 1080, 1920]);
    // The plain bar is the unshaped one.
    assert.equal(resolveBar(TALL, '#FFD400', {}).shaped, false);
    assert.deepEqual(resolveBar(TALL, '#FFD400', { pos: 'top', height: 2 }).rect, { x: 0, y: 0, w: 1080, h: 24 });
    // Never so much inset that the bar disappears.
    assert.equal(resolveBar(TALL, '#FFD400', { inset: 0.1 }).inset, 108);
    assert.equal(resolveBar('1:1', '#FFD400', { inset: 0.1, height: 3 }).inset, 108);
});

test('the fill ends where the progress says; the shaped bar is continuous', () => {
    const shaped = resolveBar(TALL, '#FFD400', { inset: 0 });
    // fe = x0 + progress * (x1 - x0): 432 at 40 %.
    close(shaped.fill(0.4), 432);
    close(shaped.fill(0), 0);
    close(shaped.fill(1), 1080);
    close(resolveBar(TALL, '#FFD400', { inset: 0.04 }).fill(0.5), 44 + 0.5 * 992);
    close(shaped.fill((100.25 + 0.5) / 1080), 100.75);
    // The plain bar steps by two pixels, as it always did.
    const plain = resolveBar(TALL, '#FFD400', {});
    assert.equal(plain.fill(0.4), 432);
    assert.equal(plain.fill(0.4004) % 2, 0);
    assert.equal(plain.fill(2), 1080);
    assert.equal(plain.fill(NaN), 0);
});

test('the track takes its own colour and opacity; the radius is a share of half the bar', () => {
    assert.deepEqual(resolveBar(TALL, '#FFD400', { track: '#FFFFFF', track_opacity: 0.3 }).track, { color: '#FFFFFF', opacity: 0.3 });
    // A track colour alone has the strength of the plain dimming (55 %).
    assert.deepEqual(resolveBar(TALL, '#FFD400', { track: '#FFFFFF' }).track, { color: '#FFFFFF', opacity: 0.55 });
    // An opacity alone dims towards black.
    assert.deepEqual(resolveBar(TALL, '#FFD400', { track_opacity: 0.8 }).track, { color: '#000000', opacity: 0.8 });
    // Fully clear: the picture shows through.
    assert.deepEqual(resolveBar(TALL, '#FFD400', { track_opacity: 0 }).track, { color: '#000000', opacity: 0 });
    // Shaped without a track field, or plain: the plain dimming.
    assert.equal(resolveBar(TALL, '#FFD400', { inset: 0.02 }).track, null);
    assert.equal(resolveBar(TALL, '#FFD400', { track: '#FFFFFF' }).shaped, true);
    // Radius 1 is a pill: half the bar's thickness.
    assert.equal(resolveBar(TALL, '#FFD400', { radius: 1 }).radius, 6);
    assert.equal(resolveBar(TALL, '#FFD400', { radius: 0.5 }).radius, 3);
    assert.equal(resolveBar(TALL, '#FFD400', { radius: 0 }).radius, 0);
});

test('the bar colour and glow', () => {
    // The Look's colour replaces the flat one and keeps the plain drawing.
    const c = resolveBar(TALL, '#112233', { color: '#FF3B30' });
    assert.deepEqual([c.color, c.shaped], ['#FF3B30', false]);
    assert.equal(resolveBar(TALL, '#112233', {}).color, '#112233');
    assert.equal(resolveBar(TALL, 'nope', {}).color, '#FFD400');
    // A glow shapes the bar: design px on a canvas as wide as the design, grown and blurred.
    close(GLOW_BORD, 0.55);
    close(GLOW_BLUR, 0.6);
    const g = resolveBar(TALL, '#FFD400', { glow: { size: 14 } });
    assert.equal(g.shaped, true);
    assert.deepEqual([g.glow.size, g.glow.strength], [14, 0.8]);
    close(g.glow.grow, 14 * 0.55);
    close(g.glow.sigma, 14 * 0.6);
    assert.match(g.glow.color, /^#[0-9A-F]{6}$/);
    assert.equal(resolveBar(TALL, '#FFD400', { glow: { size: 14, color: '#00E5FF' } }).glow.color, '#00E5FF');
    // Smaller canvases scale it; nothing to glow with is no glow.
    close(resolveBar('1:1', '#FFD400', { glow: { size: 12 } }).glow.size, 12 * Math.min(1080 / 1080, 1080 / 1200, 1));
    assert.equal(resolveBar(TALL, '#FFD400', { glow: { size: 0 } }).glow, null);
    assert.equal(resolveBar(TALL, '#FFD400', { glow: { strength: 0 } }).glow, null);
    assert.equal(resolveBar(TALL, '#FFD400', { track: '#000000' }).glow, null);
});

// ---- the logo (render.rs) ----------------------------------------------------------

test('a turned logo is held by an even box that is never smaller than it', () => {
    assert.deepEqual(turnedBox(152, 152, -12), { w: 182, h: 182 });
    assert.deepEqual(turnedBox(280, 70, 0), { w: 280, h: 70 });
    for (const [w, h, d] of [[152, 152, 30], [280, 70, 12], [70, 280, -30], [2, 2, 5]]) {
        const b = turnedBox(w, h, d);
        const rad = (d * Math.PI) / 180;
        const [sn, cs] = [Math.abs(Math.sin(rad)), Math.abs(Math.cos(rad))];
        assert.ok(b.w % 2 === 0 && b.h % 2 === 0, `${w}x${h} ${d}`);
        assert.ok(b.w >= w * cs + h * sn - 1e-3 && b.w <= w * cs + h * sn + 2 + 1e-3, `${w}x${h} ${d}`);
        assert.ok(b.h >= w * sn + h * cs - 1e-3 && b.h <= w * sn + h * cs + 2 + 1e-3, `${w}x${h} ${d}`);
    }
    const { w, h } = turnedBox(280, 70, 30);
    assert.ok(w < 280 + 70 && h > 70 + 100, `${w} ${h}`);
});

test('the logo keeps its centre when turned, and selects the upright box round it', () => {
    const plain = resolveLogo(TALL, 'tr', {}, null);
    assert.deepEqual(plain.box, { w: 152, h: 152 });
    assert.deepEqual(plain.bounds, { x: plain.x, y: plain.y, w: 152, h: 152 });
    const turned = resolveLogo(TALL, 'tr', { rotate: -12 }, null);
    assert.equal(turned.rotate, -12);
    assert.deepEqual(turned.center, plain.center);
    // The box grows by 15 px on each side of the logo, as the engine's overlay does (W-210 for W-195).
    assert.deepEqual(turned.bounds, { x: plain.x - 15, y: plain.y - 15, w: 182, h: 182 });
    assert.deepEqual([turned.x, turned.y], [plain.x, plain.y]);
    // Under 0.01 degrees is no turn at all.
    for (const rotate of [0, 0.01, -0.01]) assert.equal(resolveLogo(TALL, 'tr', { rotate }, null).rotate, 0);
    assert.equal(resolveLogo(TALL, 'tr', { rotate: 0.02 }, null).rotate, 0.02);
    // Free placement keeps the same centre when turned.
    const free = resolveLogo(TALL, 'tr', { x: 0.3, y: 0.6, rotate: 20 }, null);
    assert.deepEqual(free.center, resolveLogo(TALL, 'tr', { x: 0.3, y: 0.6 }, null).center);
    // The turn is limited to 30 degrees either way.
    assert.equal(cleanLogo({ rotate: 99 }).rotate, 30);
    assert.equal(cleanLogo({ rotate: -99 }).rotate, -30);
    assert.equal(resolveLogo(TALL, 'tr', { rotate: -99 }, null).rotate, -30);
});

test('a logo\'s shadow and glow are the engine\'s, in design px', () => {
    const l = resolveLogo(TALL, 'tr', { shadow: { y: 6 }, glow: { size: 10 } }, null);
    assert.deepEqual(l.shadow, { color: '#000000', x: 0, y: 6, blur: 4, opacity: 0.6 });
    // A glow with no colour is white.
    assert.deepEqual([l.glow.color, l.glow.size, l.glow.strength], ['#FFFFFF', 10, 0.8]);
    close(l.glow.grow, 5.5);
    close(l.glow.sigma, 6);
    assert.equal(l.dressed, true);
    assert.equal(resolveLogo(TALL, 'tr', {}, null).dressed, false);
    assert.equal(isDressed({ rotate: 5 }), true);
    // Nothing visible is no effect.
    assert.equal(resolveLogo(TALL, 'tr', { shadow: { opacity: 0 } }, null).shadow, null);
    assert.equal(resolveLogo(TALL, 'tr', { glow: { size: 0 } }, null).glow, null);
    assert.equal(resolveLogo(TALL, 'tr', { glow: { strength: 0 } }, null).glow, null);
    // Smaller canvases scale the effects with the design.
    close(resolveLogo('1:1', 'tr', { glow: { size: 12 } }, null).glow.size, 12 * (1080 / 1200));
});
