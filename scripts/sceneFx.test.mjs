// Tests for the picture effects of the stage: the vignette, the colour grades and the blurred fill.
//   node --test scripts/sceneFx.test.mjs   (also run by look.test.mjs)
// Expected numbers come from digiclip-rs: `src/compose.rs` (`vignette_gain`, `fill_gain`, `GradeTab::new` and their tests).
import test from 'node:test';
import assert from 'node:assert/strict';

import { FILL_DIM_TODAY } from '../src/lib/sceneFields.js';
import { effectsView } from '../src/lib/sceneEffective.js';
import {
    BG_DIM, MONO_MATRIX, PUNCH_SAT_MEAN, castFade, castRgb, fillChroma, fillFilter, fillGain, gradeSteps, punchCurve, vignetteBackground,
    vignetteGain, vignetteRadius,
} from '../src/lib/effectsLook.js';
import { close } from './layerkit.mjs';

// ---- the vignette ------------------------------------------------------------------------

/** The engine's `vignette_gain`, written out. */
const engineGain = (r, v) => {
    const t = Math.min(1, Math.max(0, (r - 0.2) / 0.8));
    return 1 - 0.7 * Math.min(1, Math.max(0, v)) * t * t * (3 - 2 * t);
};

test('the vignette gain at centre, mid and corner is the engine\'s formula', () => {
    // r is the ellipse radius: the centre 0, the middle of an edge sqrt(1/2), a corner 1.
    assert.equal(vignetteRadius(0, 0), 0);
    close(vignetteRadius(1, 1), 1);
    close(vignetteRadius(1, 0), Math.SQRT1_2);
    close(vignetteRadius(0, -1), Math.SQRT1_2);
    for (const v of [0.25, 0.5, 1]) {
        assert.equal(vignetteGain(0, v), 1, 'the centre is untouched');
        assert.equal(vignetteGain(0.2, v), 1, 'so is everything inside 20%');
        close(vignetteGain(1, v), 1 - 0.7 * v, 1e-12);
        for (const r of [0.1, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) close(vignetteGain(r, v), engineGain(r, v), 1e-12);
    }
    // Mid: r 0.6 is halfway up the smoothstep (0.5): at v 1 the gain is 0.65, at v 0.5 it is 0.825.
    close(vignetteGain(0.6, 1), 0.65, 1e-12);
    close(vignetteGain(0.6, 0.5), 0.825, 1e-12);
    // Corners keep 30% of their light at full strength.
    close(vignetteGain(1, 1), 0.3, 1e-12);
    assert.equal(vignetteGain(1, 0), 1);
    assert.equal(vignetteGain(1, 7), vignetteGain(1, 1), 'clamped');
});

test('the vignette overlay follows the gain curve with enough stops', () => {
    assert.equal(vignetteBackground(0), null);
    assert.equal(vignetteBackground(undefined), null);
    const css = vignetteBackground(0.5);
    assert.ok(css.startsWith('radial-gradient(ellipse farthest-corner at 50% 50%, '));
    const stops = [...css.matchAll(/rgb\(0 0 0 \/ ([\d.]+)\) ([\d.]+)%/g)].map((m) => ({ a: +m[1], at: +m[2] / 100 }));
    assert.ok(stops.length >= 32, 'enough stops for the smoothstep');
    assert.deepEqual([stops[0].a, stops[0].at], [0, 0]);
    // The black over the picture is exactly the light the gain takes away.
    for (const s of stops) close(s.a, 1 - engineGain(s.at, 0.5), 1e-4);
    close(stops.at(-1).a, 0.35, 1e-4);
    assert.equal(stops.at(-1).at, 1);
    // Between stops the straight line stays within a fifth of a level (of 255) of the curve, at any strength.
    for (const v of [0.5, 1]) {
        const ss = [...vignetteBackground(v).matchAll(/rgb\(0 0 0 \/ ([\d.]+)\) ([\d.]+)%/g)].map((m) => ({ a: +m[1], at: +m[2] / 100 }));
        for (let i = 1; i < ss.length; i += 1) {
            const [p, q] = [ss[i - 1], ss[i]];
            if (q.at <= p.at) continue;
            for (const f of [0.25, 0.5, 0.75]) {
                const at = p.at + (q.at - p.at) * f;
                close(p.a + (q.a - p.a) * f, 1 - engineGain(at, v), 0.2 / 255);
            }
        }
    }
    // Stronger is darker at every stop.
    const strong = [...vignetteBackground(1).matchAll(/rgb\(0 0 0 \/ ([\d.]+)\)/g)].map((m) => +m[1]);
    strong.forEach((a, i) => assert.ok(a >= stops[i].a));
});

// ---- the grade -----------------------------------------------------------------------------

/** A 5x4 colour matrix applied to an RGB triple (0..1). */
const applyMatrix = (m, [r, g, b]) => [0, 1, 2].map((row) => m[row * 5] * r + m[row * 5 + 1] * g + m[row * 5 + 2] * b + m[row * 5 + 4]);
/** A table (feFuncX type="table") read at `c`, linearly between the values. */
function tableAt(tab, c) {
    const x = Math.min(1, Math.max(0, c)) * (tab.length - 1);
    const i = Math.min(tab.length - 2, Math.floor(x));
    return tab[i] + (tab[i + 1] - tab[i]) * (x - i);
}

test('mono is Rec.709 luma on every channel, exactly', () => {
    assert.equal(MONO_MATRIX.length, 20);
    for (let row = 0; row < 3; row += 1) assert.deepEqual(MONO_MATRIX.slice(row * 5, row * 5 + 5), [0.2126, 0.7152, 0.0722, 0, 0]);
    assert.deepEqual(MONO_MATRIX.slice(15), [0, 0, 0, 1, 0]);
    assert.deepEqual(gradeSteps('mono'), [{ matrix: MONO_MATRIX }]);
    // Pure colours go to their luma; greys and white stay put; the sum of the weights is 1.
    for (const [rgb, y] of [[[1, 0, 0], 0.2126], [[0, 1, 0], 0.7152], [[0, 0, 1], 0.0722], [[1, 1, 1], 1], [[0.4, 0.4, 0.4], 0.4], [[0, 0, 0], 0]]) {
        const out = applyMatrix(MONO_MATRIX, rgb);
        out.forEach((v) => close(v, y, 1e-12));
    }
    close(0.2126 + 0.7152 + 0.0722, 1, 1e-12);
    assert.equal(gradeSteps('none'), null);
    assert.equal(gradeSteps(undefined), null);
});

test('warm, cool and punchy are built from the engine\'s numbers', () => {
    // compose.rs: -3.6 U / +2.8 V is about +5 on red and -7.6 on blue (of 255) at constant luma.
    const [dr, dg, db] = castRgb(-3.6, 2.8).map((v) => v * 255);
    close(dr, 5.02, 0.01);
    close(dg, -0.72, 0.01);
    close(db, -7.6, 0.01);
    // Cool is the opposite shift.
    castRgb(3.6, -2.8).forEach((v, i) => close(v, -castRgb(-3.6, 2.8)[i], 1e-12));
    // The cast fades out into the deepest shadows: none at black, all from Y 72 up.
    assert.equal(castFade(0), 0);
    assert.equal(castFade(1), 1);
    assert.equal(castFade((72 - 16) / 219), 1);
    assert.ok(castFade(0.1) > 0 && castFade(0.1) < 1);
    const warm = gradeSteps('warm')[0].tables;
    const cool = gradeSteps('cool')[0].tables;
    for (const [tab, sign] of [[warm, 1], [cool, -1]]) {
        assert.equal(tab.r.length, 49);
        assert.equal(tableAt(tab.r, 0), 0, 'black stays black');
        close(tableAt(tab.r, 0.5), 0.5 + sign * castRgb(-3.6, 2.8)[0], 1e-4);
        close(tableAt(tab.b, 0.5), 0.5 + sign * castRgb(-3.6, 2.8)[2], 1e-4);
        assert.ok(tab.r.every((v) => v >= 0 && v <= 1));
    }
    assert.ok(tableAt(warm.r, 0.5) > 0.5 && tableAt(warm.b, 0.5) < 0.5, 'warm: more red, less blue');
    assert.ok(tableAt(cool.r, 0.5) < 0.5 && tableAt(cool.b, 0.5) > 0.5, 'cool: less red, more blue');
    // Punchy: the S-curve keeps the ends and the middle, lifts highlights and sinks shadows, plus saturation.
    assert.equal(punchCurve(0), 0);
    assert.equal(punchCurve(1), 1);
    close(punchCurve(0.5), 0.5, 1e-12);
    close(punchCurve(0.25), 0.25 + 0.3 * (0.15625 - 0.25), 1e-12);
    assert.ok(punchCurve(0.25) < 0.25 && punchCurve(0.75) > 0.75);
    const [sat, curve] = gradeSteps('punchy');
    assert.equal(sat.saturate, Math.round(PUNCH_SAT_MEAN * 1e4) / 1e4);
    assert.ok(PUNCH_SAT_MEAN > 1 && PUNCH_SAT_MEAN < 1.18);
    for (const k of ['r', 'g', 'b']) assert.deepEqual(curve.tables[k], curve.tables.r);
    close(tableAt(curve.tables.r, 0.25), punchCurve(0.25), 1e-3);
});

// ---- the blurred fill --------------------------------------------------------------------

test('fill_dim maps 0, 0.4, 1 and absent the way the engine does', () => {
    assert.equal(fillGain(0), 1);
    assert.equal(fillGain(FILL_DIM_TODAY), BG_DIM);
    close(fillGain(0.4), 0.72, 1e-12);
    close(fillGain(1), 0.04, 1e-12);
    // Absent: the control shows 0.4, the gain is today's 0.72.
    assert.equal(fillGain(effectsView({}).val('fill_dim')), 0.72);
    // Piecewise linear: halfway between the points.
    close(fillGain(0.2), (1 + 0.72) / 2, 1e-12);
    close(fillGain(0.7), (0.72 + 0.04) / 2, 1e-12);
    // Darker as it goes up, clamped outside 0..1.
    let last = Infinity;
    for (let i = 0; i <= 20; i += 1) {
        const g = fillGain(i / 20);
        assert.ok(g < last);
        last = g;
    }
    assert.equal(fillGain(-3), 1);
    assert.equal(fillGain(9), fillGain(1));
    // The colour keeps today's up to today's darkness, then fades with the light.
    assert.equal(fillChroma(0), 1);
    assert.equal(fillChroma(0.4), 1);
    close(fillChroma(1), 0.04 / 0.72, 1e-12);
    assert.match(fillFilter(0.4), /^brightness\(0\.7200\) saturate\(1\.3889\)$/);
    assert.match(fillFilter(0), /^brightness\(1\.0000\) saturate\(1\.0000\)$/);
});

