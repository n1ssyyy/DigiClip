// Tests for the stage's zoom and split, the camera-feel preview and the Layers summaries.
//   node --test scripts/sceneStage.test.mjs   (also run by look.test.mjs)
// Expected numbers come from digiclip-rs: `src/camera.rs` (`CamCfg::for_feel`), `src/compose.rs` (`split_rows`), `src/split.rs`
// (`a_moved_seam_gives_each_panel_its_own_aspect`) and `src/pipeline.rs` (`the_split_seam_drags_the_captions_with_it`).
import test from 'node:test';
import assert from 'node:assert/strict';

import { defaults } from '../src/lib/look.js';
import { CANVASES, resolveCaptions } from '../src/lib/captionStyles.js';
import { FEELS, GRADES } from '../src/lib/sceneFields.js';
import { FEEL_LABEL, GRADE_LABEL, LAYOUT_LABEL, sceneSummary } from '../src/lib/sceneSummary.js';
import { stageZoom } from '../src/lib/effectsLook.js';
import { seamCaptionY, splitFits, splitPanels, splitRows } from '../src/lib/layoutLook.js';
import { stageScene } from '../src/lib/stageScene.js';
import {
    BOX, CAM_BASE, FRAME, LOOP_S, SHOT_S, dotAt, feelParams, frameOrigin, shotFraming, simulate, startCam, stepCam,
} from '../src/lib/feelPreview.js';
import { close } from './layerkit.mjs';

// ---- zoom and the stage ------------------------------------------------------------------------

test('the stage scales the picture for zoom only on the tighter side', () => {
    assert.equal(stageZoom(1), 1);
    assert.equal(stageZoom(1.2), 1.2);
    assert.equal(stageZoom(1.4), 1.4);
    assert.equal(stageZoom(0.8), 1, 'the engine never frames wider than the full-height window');
});

test('a look without the fields draws the stage as it did', () => {
    const tall = CANVASES['9:16'];
    const plain = stageScene(defaults(null), tall);
    assert.deepEqual(plain, { zoom: 1, grade: null, vignette: 0, splitOn: false, split: undefined, seam: undefined });
    // Single with every other field set still has no split.
    const o = { ...defaults(null), layout: 'single', look: { captions: {}, layout: { split: 0.6 } } };
    assert.equal(stageScene(o, tall).splitOn, false);
    assert.equal(stageScene(o, tall).seam, undefined);
    // The captions are where the style puts them.
    const a = resolveCaptions('karaoke', '9:16', {}, { anim: 'pop' });
    const b = resolveCaptions('karaoke', '9:16', {}, { anim: 'pop', seam: plain.seam });
    assert.deepEqual(b.anchor, a.anchor);
    assert.deepEqual(b.center, a.center);
    // A set look.
    const set = { ...defaults(null), look: { captions: {}, camera: { zoom: 1.2 }, effects: { vignette: 0.5, grade: 'warm' } } };
    assert.deepEqual(stageScene(set, tall), { zoom: 1.2, grade: 'warm', vignette: 0.5, splitOn: false, split: undefined, seam: undefined });
    assert.equal(stageScene({ ...set, look: { effects: { grade: 'none' } } }, tall).grade, null);
    assert.equal(stageScene({ ...set, look: { camera: { zoom: 0.9 } } }, tall).zoom, 1);
});

// ---- the split ----------------------------------------------------------------------------------

test('the seam row for split 0.5 and 0.6 on 1080x1920, and the engine\'s other cases', () => {
    assert.equal(splitRows(1920, 0.5), 960);
    assert.equal(splitRows(1920, 0.6), 1152);
    assert.equal(splitRows(1920, undefined), 960);
    // compose.rs `split_rows_follow_the_look`.
    assert.equal(splitRows(1350, undefined), 674);
    assert.equal(splitRows(1350, 0.5), 674);
    assert.equal(splitRows(1920, 0.4), 768);
    assert.equal(splitRows(1920, 0.7), 1344);
    assert.equal(splitRows(1920, 0.3), 576);
    for (const s of [0.3, 0.37, 0.43, 0.5, 0.58, 0.64, 0.7]) assert.equal(splitRows(1350, s) % 2, 0);
    // The seam rows of a 0.6 split are what the two panels' heights add up to.
    const [top, bottom] = splitPanels(1920, 1080, CANVASES['9:16'], 0.6);
    assert.deepEqual([top.y, top.h, bottom.y, bottom.h], [0, 1152, 1152, 768]);
    assert.equal(splitFits(CANVASES['9:16']), true);
    assert.equal(splitFits(CANVASES['4:5']), true);
    assert.equal(splitFits(CANVASES['1:1']), false);
    assert.equal(splitFits(CANVASES['16:9']), false);
});

test('each panel shows the engine\'s crop: its own aspect, inside the source, around its person', () => {
    const tall = CANVASES['9:16'];
    // split.rs `a_moved_seam_gives_each_panel_its_own_aspect`: 1080x1152 above, 1080x768 below.
    const [top, bottom] = splitPanels(1920, 1080, tall, 0.6);
    close(top.crop.w / top.crop.h, 1080 / 1152, 1e-6);
    close(bottom.crop.w / bottom.crop.h, 1080 / 768, 1e-6);
    for (const p of [top, bottom]) {
        assert.ok(p.crop.x >= -1e-9 && p.crop.x + p.crop.w <= 1920 + 1e-9);
        assert.ok(p.crop.y >= -1e-9 && p.crop.y + p.crop.h <= 1080 + 1e-9);
    }
    // 0.5 is the even split: both panels 1080x960.
    const even = splitPanels(1920, 1080, tall, 0.5);
    for (const p of even) close(p.crop.w / p.crop.h, 1.125, 1e-6);
    assert.deepEqual(splitPanels(1920, 1080, tall, undefined), even);
    // The people stand at 27% and 73% of the width: each crop is centred near its person and stops short of the other.
    const cx = (p) => p.crop.x + p.crop.w / 2;
    assert.ok(Math.abs(cx(even[0]) - 0.27 * 1920) < 1e-6 && Math.abs(cx(even[1]) - 0.73 * 1920) < 1e-6);
    assert.ok(even[0].crop.x + even[0].crop.w < 0.73 * 1920);
    assert.ok(even[1].crop.x > 0.27 * 1920);
    // A narrower source gives a different crop; a 4:5 canvas has its own panels.
    const portrait = splitPanels(1920, 1080, CANVASES['4:5'], 0.5);
    assert.deepEqual([portrait[0].y, portrait[0].h, portrait[1].y, portrait[1].h], [0, 674, 674, 676]);
    assert.ok(portrait.every((p) => p.crop.x >= 0 && p.crop.x + p.crop.w <= 1920 + 1e-9));
});

test('the captions follow the seam, and do not when they are placed', () => {
    const tall = CANVASES['9:16'];
    // pipeline.rs `the_split_seam_drags_the_captions_with_it`: absent or 0.5 the style's own seam rule (the middle);
    // a moved seam puts the captions on the seam row.
    assert.equal(seamCaptionY(1920, undefined), 0.5);
    assert.equal(seamCaptionY(1920, 0.5), 0.5);
    assert.equal(seamCaptionY(1920, 0.6), 0.6);
    assert.equal(seamCaptionY(1920, 0.3), 0.3);
    close(seamCaptionY(1350, 0.6), splitRows(1350, 0.6) / 1350, 1e-12);
    const on = (split, look = {}) => resolveCaptions('karaoke', '9:16', look, { anim: 'pop', seam: stageScene({ ...defaults(null), layout: 'split', look: { captions: {}, layout: { split } } }, tall).seam });
    const s5 = on(undefined);
    assert.deepEqual([s5.anchor.mode, s5.anchor.x, s5.anchor.y], ['middle', 540, 960]);
    const s6 = on(0.6);
    assert.deepEqual([s6.anchor.mode, s6.anchor.x, s6.anchor.y], ['middle', 540, 1152]);
    close(s6.center.y, 0.6, 1e-9);
    assert.equal(on(0.3).anchor.y, 576);
    // A position the Look gave the captions wins (y 0.8 -> row 1536, whatever the seam).
    const placed = on(0.6, { y: 0.8 });
    assert.equal(placed.anchor.y, 1536);
    assert.equal(placed.placed, true);
    // The layout off the split: the captions stay where the style puts them.
    const single = resolveCaptions('karaoke', '9:16', {}, { anim: 'pop', seam: stageScene(defaults(null), tall).seam });
    assert.deepEqual(single.anchor, resolveCaptions('karaoke', '9:16', {}, { anim: 'pop' }).anchor);
    // A canvas that cannot split draws one camera, so no seam either.
    const sq = stageScene({ ...defaults(null), layout: 'split' }, CANVASES['1:1']);
    assert.deepEqual([sq.splitOn, sq.seam], [false, undefined]);
    const split = stageScene({ ...defaults(null), layout: 'split', look: { layout: { split: 0.6 }, camera: { zoom: 1.3 } } }, tall);
    assert.deepEqual([split.splitOn, split.split, split.seam, split.zoom], [true, 0.6, 0.6, 1], 'zoom does not apply to the two crops');
    // `auto` is the engine's call, not the stage's.
    assert.equal(stageScene({ ...defaults(null), layout: 'auto' }, tall).splitOn, false);
});

// ---- the camera feel ------------------------------------------------------------------------------

test('the feel preview carries the engine\'s tuning per feel', () => {
    // camera.rs `CamCfg::for_feel`: steady = bands x1.8, safe x1.25, response x1.5, glides x1.3;
    // lively = bands x0.5, safe x0.8, response x0.5, glides x0.7; locked = defaults, held; smooth = defaults.
    const smooth = feelParams('smooth');
    assert.deepEqual([smooth.bandX, smooth.bandY, smooth.bandZ, smooth.safeX, smooth.safeY], [0.05, 0.04, 0.06, 0.2, 0.14]);
    assert.deepEqual([smooth.panS, smooth.tiltS, smooth.zoomS], [1.3, 1.8, 2.6]);
    assert.deepEqual([smooth.glideBase, smooth.glidePer, smooth.glideMin, smooth.glideMax], [0.5, 0.6, 0.6, 1.2]);
    assert.equal(smooth.hold, false);
    const steady = feelParams('steady');
    close(steady.bandX, 0.09);
    close(steady.bandY, 0.072);
    close(steady.bandZ, 0.108);
    close(steady.safeX, 0.25);
    close(steady.safeY, 0.175);
    close(steady.panS, 1.95);
    close(steady.tiltS, 2.7);
    close(steady.zoomS, 3.9);
    close(steady.glideMin, 0.78);
    close(steady.glideMax, 1.56);
    assert.equal(steady.hold, false);
    const lively = feelParams('lively');
    close(lively.bandX, 0.025);
    close(lively.bandY, 0.02);
    close(lively.safeX, 0.16);
    close(lively.safeY, 0.112);
    close(lively.panS, 0.65);
    close(lively.tiltS, 0.9);
    close(lively.glideBase, 0.35);
    close(lively.glideMax, 0.84);
    const locked = feelParams('locked');
    assert.equal(locked.hold, true);
    assert.deepEqual([locked.bandX, locked.panS, locked.safeX], [CAM_BASE.bandX, CAM_BASE.panS, CAM_BASE.safeX]);
    // Anything else is smooth.
    assert.deepEqual(feelParams('wobbly'), feelParams('smooth'));
    assert.deepEqual(feelParams(undefined), feelParams('smooth'));
    // The bands narrow and the response quickens from steady through smooth to lively.
    assert.ok(steady.bandX > smooth.bandX && smooth.bandX > lively.bandX);
    assert.ok(steady.panS > smooth.panS && smooth.panS > lively.panS);
});

test('the preview camera: locked holds, the others follow with their own patience', () => {
    // The dot is deterministic, stays in the picture, and changes shot halfway.
    for (let t = 0; t < LOOP_S; t += 0.1) {
        const d = dotAt(t);
        assert.ok(d.x > 0 && d.x < BOX.w && d.y > 0 && d.y < BOX.h, `${t}`);
        assert.equal(d.shot, t < SHOT_S ? 0 : 1);
    }
    assert.deepEqual(dotAt(1.3), dotAt(1.3 + LOOP_S));
    const travel = {};
    const trail = {};
    for (const feel of ['locked', 'steady', 'smooth', 'lively']) {
        const run = simulate(feel);
        let moved = 0;
        let gap = 0;
        for (let i = 1; i < run.length; i += 1) {
            if (run[i].dot.shot === run[i - 1].dot.shot) moved += Math.hypot(run[i].cam.x - run[i - 1].cam.x, run[i].cam.y - run[i - 1].cam.y);
            gap += Math.abs(run[i].dot.x - run[i].cam.x);
        }
        travel[feel] = moved;
        trail[feel] = gap / run.length;
        // The frame stays inside the picture.
        for (const r of run) {
            const o = frameOrigin(r.cam);
            assert.ok(o.x >= 0 && o.y >= 0 && o.x + FRAME.w <= BOX.w && o.y + FRAME.h <= BOX.h);
        }
    }
    assert.equal(travel.locked, 0, 'locked does not move inside a shot');
    assert.ok(travel.steady < travel.smooth && travel.smooth < travel.lively, JSON.stringify(travel));
    assert.ok(trail.lively < trail.smooth && trail.smooth < trail.steady && trail.steady < trail.locked, JSON.stringify(trail));
    // A new shot is a cut for every feel; locked picks the middle of where the dot goes.
    const p = feelParams('locked');
    const first = shotFraming(0);
    assert.deepEqual(startCam(p), first);
    const cut = stepCam(first, dotAt(SHOT_S + 0.01), 1 / 30, p, true);
    assert.deepEqual(cut, shotFraming(1));
    const live = stepCam({ x: 10, y: 10 }, dotAt(SHOT_S + 0.01), 1 / 30, feelParams('lively'), true);
    assert.deepEqual(live, { x: dotAt(SHOT_S + 0.01).x, y: dotAt(SHOT_S + 0.01).y });
    // Inside the dead band the camera does not move; the safe band limits the trail.
    const sm = feelParams('smooth');
    const still = stepCam({ x: 100, y: 50 }, { x: 100 + 0.5 * sm.bandX * FRAME.w, y: 50, shot: 0 }, 0.1, sm);
    assert.deepEqual(still, { x: 100, y: 50 });
    const far = stepCam({ x: 100, y: 50 }, { x: 200, y: 50, shot: 0 }, 5, sm);
    assert.ok(200 - far.x <= sm.safeX * FRAME.w + 1e-9);
});

// ---- the Layers summaries --------------------------------------------------------------------------

test('Camera, Layout and Effects rows show a live summary', () => {
    // `t` with its {name} placeholders filled, the English being the key.
    const id = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));
    const o = (over = {}, lk = {}) => ({ ...defaults(null), ...over, look: { captions: {}, ...lk } });
    assert.equal(sceneSummary('camera', o(), id), 'Smooth · 100%');
    assert.equal(sceneSummary('camera', o({}, { camera: { feel: 'lively', zoom: 1.2 } }), id), 'Lively · 120%');
    assert.equal(sceneSummary('camera', o({}, { camera: { feel: 'locked' } }), id), 'Locked · 100%');
    assert.equal(sceneSummary('camera', o({}, { camera: { zoom: 9 } }), id), 'Smooth · 140%');
    assert.equal(sceneSummary('layout', o(), id), 'Single');
    assert.equal(sceneSummary('layout', o({ layout: 'split' }, { layout: { split: 0.6 } }), id), 'Split · 60%');
    assert.equal(sceneSummary('layout', o({ layout: 'split' }), id), 'Split · 50%');
    assert.equal(sceneSummary('layout', o({ layout: 'auto' }, { layout: { split: 0.4 } }), id), 'Auto · 40%');
    assert.equal(sceneSummary('layout', o({ layout: 'single' }, { layout: { split: 0.6 } }), id), 'Single');
    assert.equal(sceneSummary('effects', o(), id), 'None');
    assert.equal(sceneSummary('effects', o({}, { effects: { grade: 'warm', vignette: 0.4 } }), id), 'Warm · Vignette 40%');
    assert.equal(sceneSummary('effects', o({}, { effects: { vignette: 0.25 } }), id), 'Vignette 25%');
    assert.equal(sceneSummary('effects', o({}, { effects: { grade: 'none', vignette: 0 } }), id), 'None');
    assert.equal(sceneSummary('effects', o({}, { effects: { fill_dim: 0.6 } }), id), 'Fill 60%');
    assert.equal(sceneSummary('clips', o(), id), '');
    // The words go through `t`, with the English as the key.
    const seen = [];
    sceneSummary('effects', o({}, { effects: { grade: 'mono', vignette: 0.5 } }), (s) => { seen.push(s); return s; });
    assert.deepEqual(seen, ['Mono', 'Vignette {n}%']);
    assert.equal(seen.length, 2);
    assert.deepEqual(Object.keys(FEEL_LABEL), FEELS);
    assert.deepEqual(Object.keys(GRADE_LABEL), GRADES);
    assert.deepEqual(Object.keys(LAYOUT_LABEL), ['single', 'split', 'auto']);
});
