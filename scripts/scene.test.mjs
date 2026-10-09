// Tests for the camera, effects and layout designers: the readers, the store, the maps and what the controls show.
//   node --test scripts/scene.test.mjs   (also run by look.test.mjs)
// Expected numbers come from digiclip-rs: `src/look.rs` (readers and ranges).
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyEdit, applyPatch, defaults, lookToEngine, sanitizeLook, toEngine } from '../src/lib/look.js';
import { getPath, nest } from '../src/lib/captionEffective.js';
import { layerClear, layerPatch } from '../src/lib/layerEffective.js';
import {
    dirtySections, numSpec, numUi, sectionHasOverrides, sectionKeys, sectionOf, sectionResetPatch,
} from '../src/lib/layerSections.js';
import {
    CAMERA_SPECS, EFFECTS_SPECS, FEELS, FILL_DIM_TODAY, GRADES, LAYOUT_SPECS, PUNCH_TODAY, SCENE_CLEANERS, SCENE_SPECS, cleanCamera, cleanEffects,
    cleanLayout,
} from '../src/lib/sceneFields.js';
import { CAMERA_LAYER, EFFECTS_LAYER, FLAT_DEFAULTS, LAYOUT_LAYER, SCENE_LAYERS } from '../src/lib/sceneSections.js';
import {
    cameraView, effectsView, feelPatch, gradePatch, layoutView, sceneChanged, sceneReset, splitPatch,
} from '../src/lib/sceneEffective.js';
import { close, fresh, look } from './layerkit.mjs';

const FULL = {
    camera: { feel: 'lively', zoom: 1.2, punch: 1.3 },
    effects: { vignette: 0.5, grade: 'warm', fill_dim: 0.7 },
    layout: { split: 0.6 },
};
const SET = { camera: 'setCamera', effects: 'setEffects', layout: 'setLayout' };
const CLEAN = SCENE_CLEANERS;

// ---- the readers ----------------------------------------------------------------------

test('the readers clamp and drop the way the engine does', () => {
    // look.rs `look_parses_...`: camera zoom 5 -> 1.4, punch 0.2 -> 1.0, effects vignette 2 -> 1, split 0.9 -> 0.7.
    assert.deepEqual(cleanCamera({ feel: 'lively', zoom: 5, punch: 0.2 }), { feel: 'lively', zoom: 1.4, punch: 1 });
    assert.deepEqual(cleanEffects({ vignette: 2, grade: 'mono', fill_dim: 0.4 }), { vignette: 1, grade: 'mono', fill_dim: 0.4 });
    assert.deepEqual(cleanLayout({ split: 0.9 }), { split: 0.7 });
    assert.deepEqual(cleanLayout({ split: 0.1 }), { split: 0.3 });
    assert.deepEqual(cleanCamera({ feel: 'LOCKED ', zoom: 0.1 }), { feel: 'locked', zoom: 0.8 });
    // Unusable values are absent, not defaulted.
    assert.deepEqual(cleanCamera({ feel: 'wobbly', zoom: '1.2', punch: null }), {});
    assert.deepEqual(cleanEffects({ grade: 'sepia', vignette: NaN, fill_dim: 'dark' }), {});
    assert.deepEqual(cleanCamera(undefined), {});
    assert.deepEqual(cleanLayout([]), {});
    // The full sections survive unchanged.
    for (const id of Object.keys(SCENE_LAYERS)) assert.deepEqual(CLEAN[id](FULL[id]), FULL[id], id);
    assert.deepEqual(FEELS, ['locked', 'steady', 'smooth', 'lively']);
    assert.deepEqual(GRADES, ['none', 'warm', 'cool', 'mono', 'punchy']);
});

// ---- the store ------------------------------------------------------------------------

test('camera, effects and layout set, clear, prune and undo in the store', () => {
    for (const id of Object.keys(SCENE_LAYERS)) {
        const [s, c] = fresh();
        assert.equal(look(s)[id], undefined, `${id}: nothing to start with`);
        s[SET[id]](FULL[id]);
        assert.deepEqual(look(s)[id], FULL[id], `${id}: set`);
        c.tick(1000);
        // Clearing every field removes the section (no empty object stays).
        s[SET[id]](Object.fromEntries(Object.keys(FULL[id]).map((k) => [k, undefined])));
        assert.equal(look(s)[id], undefined, `${id}: pruned`);
        assert.equal(lookToEngine(s.get().options.look), null, `${id}: nothing to send`);
        s.undo();
        assert.deepEqual(look(s)[id], FULL[id], `${id}: undo brings it back`);
        s.undo();
        assert.equal(look(s)[id], undefined, `${id}: undo the set`);
        s.redo();
        assert.deepEqual(look(s)[id], FULL[id], `${id}: redo`);
    }
    // One field cleared leaves the others.
    const [s, c] = fresh();
    s.setCamera(FULL.camera);
    c.tick(1000);
    s.setCamera({ zoom: undefined });
    assert.deepEqual(look(s).camera, { feel: 'lively', punch: 1.3 });
    // Junk in a patch is not stored.
    c.tick(1000);
    s.setEffects({ grade: '', vignette: null });
    assert.equal(look(s).effects, undefined);
    // The sections go to the engine like the others do.
    const o = applyEdit(defaults(null), undefined, { camera: FULL.camera, effects: FULL.effects, layout: FULL.layout });
    assert.deepEqual(toEngine(o).look, { v: 1, ...FULL });
    assert.deepEqual(lookToEngine({ captions: {}, camera: {}, effects: { vignette: 0 } }), { v: 1, effects: { vignette: 0 } });
});

test('a drag on a scene control is one undo step, and distinct controls do not fold together', () => {
    const [s, c] = fresh();
    for (const v of [1.05, 1.1, 1.15, 1.2]) {
        s.setCamera({ zoom: v });
        c.tick(50);
    }
    assert.equal(look(s).camera.zoom, 1.2);
    s.undo();
    assert.equal(look(s).camera, undefined, 'the four writes were one step');
    // Another field right after is its own step.
    c.tick(1000);
    s.setCamera({ zoom: 1.1 });
    c.tick(50);
    s.setCamera({ punch: 1.3 });
    s.undo();
    assert.deepEqual(look(s).camera, { zoom: 1.1 });
    // Sections do not fold into each other either.
    c.tick(1000);
    s.setEffects({ vignette: 0.3 });
    c.tick(50);
    s.setLayout({ split: 0.6 });
    s.undo();
    assert.deepEqual(look(s).effects, { vignette: 0.3 });
    assert.equal(look(s).layout, undefined);
    // A gesture (the seam dragged on the stage) is one step however long.
    const [g, gc] = fresh();
    g.beginGesture();
    for (const v of [0.52, 0.55, 0.58, 0.6]) {
        g.setLayout({ split: v });
        gc.tick(1000);
    }
    g.endGesture();
    assert.equal(look(g).layout.split, 0.6);
    g.undo();
    assert.equal(look(g).layout, undefined);
    // Dragged back to the start: no step.
    g.beginGesture();
    g.setLayout({ split: 0.55 });
    g.setLayout({ split: undefined });
    g.endGesture();
    assert.equal(g.get().canUndo, false);
});

test('a section reset is one history step, with the flat options it edits', () => {
    const [s, c] = fresh();
    s.update({ layout: 'split', merge_flash: true });
    c.tick(1000);
    s.setLayout({ split: 0.6 });
    c.tick(1000);
    const L = look(s).layout;
    const r = sceneReset(LAYOUT_LAYER, L, 'layout');
    assert.deepEqual(r, { flat: { layout: 'single' }, patch: {} });
    s.edit(r.flat, { layout: r.patch });
    assert.equal(s.get().options.layout, 'single');
    assert.deepEqual(look(s).layout, { split: 0.6 }, 'the seam is the split section\'s');
    s.undo();
    assert.equal(s.get().options.layout, 'split');
    const cuts = sceneReset(LAYOUT_LAYER, L, 'cuts');
    assert.deepEqual(cuts.flat, { merge_flash: false });
    c.tick(1000);
    s.edit(cuts.flat, { layout: cuts.patch });
    assert.equal(s.get().options.merge_flash, false);
    // The flat options keep working as the Home popover edits them.
    assert.equal(applyPatch(defaults(null), { layout: 'auto' }).layout, 'auto');
    assert.equal(applyPatch(defaults(null), { punch: false }).punch, false);
    assert.equal(applyPatch(defaults(null), { merge_flash: true }).merge_flash, true);
    assert.deepEqual(toEngine(applyPatch(defaults(null), { layout: 'split', punch: false, merge_flash: true })).layout, 'split');
    assert.equal(sanitizeLook({ camera: { zoom: 9 }, layout: { split: 0.1 } }).camera.zoom, 1.4);
    assert.equal(sanitizeLook({ effects: 5 }).effects, undefined);
});

// ---- the maps ----------------------------------------------------------------------------

test('every field of the scene specs has a section, and every listed field is one', () => {
    assert.deepEqual(Object.keys(SCENE_LAYERS), ['camera', 'effects', 'layout']);
    for (const [id, def] of Object.entries(SCENE_LAYERS)) {
        assert.equal(def.specs, SCENE_SPECS[id], id);
        assert.deepEqual(Object.keys(def.paths), def.ids, `${id}: the sections are listed in panel order`);
        for (const p of Object.keys(def.specs)) assert.ok(sectionOf(def, p), `${id}: no section for ${p}`);
        const listed = def.ids.flatMap((s) => def.paths[s]);
        assert.equal(new Set(listed).size, listed.length, `${id}: a path is listed twice`);
        for (const p of listed) assert.ok(p in def.specs, `${id}: ${p} is not a field`);
        assert.equal(listed.length, Object.keys(def.specs).length, `${id}: counts`);
        // Every section names the ability the panel's notice checks.
        assert.deepEqual(def.ids.map((s) => def.cap[s]), def.ids.map(() => `look.${id}`));
        // Every number has a display, every enum a choice list in the spec's values.
        for (const [p, s] of Object.entries(def.specs)) {
            if (s.type === 'number') {
                assert.deepEqual([numSpec(def, p).min, numSpec(def, p).max], [s.min, s.max]);
                const ui = numUi(def, p);
                assert.ok(ui && ui.k > 0 && Number.isInteger(ui.digits), `${id}: ${p} has no number display`);
            }
            if (s.type === 'enum') assert.deepEqual([...def.enums[p]].sort(), [...s.values].sort(), `${id}: ${p} choices`);
        }
        for (const p of Object.keys(def.enums)) assert.equal(def.specs[p]?.type, 'enum', `${id}.${p}`);
        // The reader keeps every field a control can set.
        const clean = CLEAN[id](FULL[id]);
        for (const p of Object.keys(def.specs)) assert.notEqual(getPath(clean, p), undefined, `${id}: ${p} did not survive cleaning`);
        // A section's keys do not overlap, and resetting one leaves the others.
        const keys = def.ids.flatMap((s) => sectionKeys(def, s));
        assert.equal(new Set(keys).size, keys.length);
        assert.deepEqual(dirtySections(def, {}), []);
        assert.deepEqual(dirtySections(def, FULL[id]), def.ids.filter((s) => def.paths[s].length));
        for (const s of def.ids.filter((x) => def.paths[x].length)) {
            const patch = sectionResetPatch(def, FULL[id], s);
            assert.deepEqual(Object.keys(patch).sort(), sectionKeys(def, s).sort());
            assert.equal(sectionHasOverrides(def, { ...FULL[id], ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) }, s), false);
        }
    }
    assert.deepEqual(CAMERA_LAYER.ids, ['movement', 'zoom', 'punch']);
    assert.deepEqual(EFFECTS_LAYER.ids, ['vignette', 'colour', 'fill']);
    assert.deepEqual(LAYOUT_LAYER.ids, ['layout', 'split', 'cuts']);
    assert.deepEqual(CAMERA_LAYER.paths, { movement: ['feel'], zoom: ['zoom'], punch: ['punch'] });
    assert.deepEqual(EFFECTS_LAYER.paths, { vignette: ['vignette'], colour: ['grade'], fill: ['fill_dim'] });
    assert.deepEqual(LAYOUT_LAYER.paths, { layout: [], split: ['split'], cuts: [] });
    // The flat options a section edits are named, and have a default to go back to.
    assert.deepEqual(CAMERA_LAYER.flat, { punch: ['punch'] });
    assert.deepEqual(LAYOUT_LAYER.flat, { layout: ['layout'], cuts: ['merge_flash'] });
    assert.deepEqual(FLAT_DEFAULTS, { layout: 'single', merge_flash: false });
    assert.deepEqual([CAMERA_SPECS.zoom.min, CAMERA_SPECS.zoom.max, CAMERA_SPECS.punch.min, CAMERA_SPECS.punch.max], [0.8, 1.4, 1, 1.4]);
    assert.deepEqual([EFFECTS_SPECS.vignette.max, EFFECTS_SPECS.fill_dim.max, LAYOUT_SPECS.split.min, LAYOUT_SPECS.split.max], [1, 1, 0.3, 0.7]);
    // How the numbers read: percent, like the other layers' shares.
    assert.deepEqual(numUi(CAMERA_LAYER, 'zoom'), { k: 100, unit: '%', digits: 0 });
    assert.deepEqual(numUi(LAYOUT_LAYER, 'split'), { k: 100, unit: '%', digits: 0 });
});

test('the scene controls show the engine\'s value until the Look sets the field', () => {
    const cv = cameraView({}, { punch: true });
    assert.deepEqual(['feel', 'zoom', 'punch'].map((p) => cv.val(p)), ['smooth', 1, PUNCH_TODAY]);
    assert.deepEqual(['feel', 'zoom', 'punch'].map((p) => cv.isSet(p)), [false, false, false]);
    assert.equal(cv.punchOn, true);
    assert.equal(cameraView({}, { punch: false }).punchOn, false);
    const cs = cameraView({ feel: 'steady', zoom: 1.1 }, {});
    assert.deepEqual([cs.val('feel'), cs.val('zoom'), cs.isSet('feel'), cs.isSet('punch')], ['steady', 1.1, true, false]);
    const ev = effectsView({});
    assert.deepEqual(['vignette', 'grade', 'fill_dim'].map((p) => ev.val(p)), [0, 'none', FILL_DIM_TODAY]);
    assert.equal(effectsView({ fill_dim: 0 }).val('fill_dim'), 0);
    assert.equal(effectsView({ fill_dim: 0 }).isSet('fill_dim'), true);
    const lv = layoutView({}, {});
    assert.deepEqual([lv.val('split'), lv.layout, lv.splitLive, lv.isSet('split')], [0.5, 'single', false, false]);
    assert.equal(layoutView({ split: 0.6 }, { layout: 'auto' }).splitLive, true);
    // The default choice is no override; the others are.
    assert.deepEqual(feelPatch('smooth'), { feel: undefined });
    assert.deepEqual(feelPatch('locked'), { feel: 'locked' });
    assert.deepEqual(gradePatch('none'), { grade: undefined });
    assert.deepEqual(gradePatch('mono'), { grade: 'mono' });
    assert.deepEqual(splitPatch(0.5), { split: undefined });
    assert.deepEqual(splitPatch(0.502), { split: undefined });
    assert.deepEqual(splitPatch(0.6), { split: 0.6 });
    // The number controls use the shared nest / clear patches.
    assert.deepEqual(layerPatch('zoom', 1.2), nest('zoom', 1.2));
    assert.deepEqual(layerClear('zoom'), { zoom: undefined });
    // What marks a section changed.
    assert.equal(sceneChanged(LAYOUT_LAYER, {}, { layout: 'single' }, 'layout'), false);
    assert.equal(sceneChanged(LAYOUT_LAYER, {}, { layout: 'split' }, 'layout'), true);
    assert.equal(sceneChanged(LAYOUT_LAYER, {}, { merge_flash: true }, 'cuts'), true);
    assert.equal(sceneChanged(LAYOUT_LAYER, { split: 0.6 }, {}, 'split'), true);
    assert.equal(sceneChanged(CAMERA_LAYER, { zoom: 1 }, {}, 'zoom'), true, 'a Look that says 100% is still the Look\'s word');
    assert.equal(sceneChanged(CAMERA_LAYER, {}, { punch: false }, 'punch'), false);
    assert.equal(sceneChanged(EFFECTS_LAYER, { grade: 'cool' }, {}, 'colour'), true);
});

