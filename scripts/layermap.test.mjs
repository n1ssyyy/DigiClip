// Tests for the headline, bar and logo maps, sections and views:
//   node --test scripts/layermap.test.mjs   (also run by look.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyPatch, defaults, toEngine } from '../src/lib/look.js';
import { getPath } from '../src/lib/captionEffective.js';
import { ALIGNS } from '../src/lib/captionFields.js';
import { FONTS } from '../src/lib/captionStyles.js';
import {
    ACCENT_WORDS, BAR_POSITIONS, BAR_SPECS, CASES, HEADLINE_ANIMS, HEADLINE_SPECS, LAYER_SPECS, LOGO_SPECS, cleanBar, cleanHeadline, cleanLogo,
} from '../src/lib/layerFields.js';
import {
    BAR_LAYER, HEADLINE_LAYER, LAYERS, LOGO_LAYER, dirtySections, numSpec, numUi, sectionHasOverrides, sectionKeys, sectionOf, sectionResetPatch,
} from '../src/lib/layerSections.js';
import { barView, cardPatch, headlineEdit, headlineView, layerClear, layerPatch, logoView, shadowFxPatch } from '../src/lib/layerEffective.js';
import { resolveBar, resolveHeadline, resolveLogo } from '../src/lib/layers.js';
import { CLEAN, FULL, SET, close, fresh, look } from './layerkit.mjs';

// ---- the maps ----------------------------------------------------------------------

test('every field of each layer\'s specs has a section, and every listed field is one', () => {
    for (const [id, def] of Object.entries(LAYERS)) {
        const specs = LAYER_SPECS[id];
        assert.equal(def.specs, specs, id);
        assert.deepEqual(Object.keys(def.paths), def.ids, `${id}: the sections are listed in panel order`);
        for (const p of Object.keys(specs)) assert.ok(sectionOf(def, p), `${id}: no section for ${p}`);
        const listed = def.ids.flatMap((s) => def.paths[s]);
        assert.equal(new Set(listed).size, listed.length, `${id}: a path is listed twice`);
        for (const p of listed) assert.ok(p in specs, `${id}: ${p} is not a field`);
        assert.equal(listed.length, Object.keys(specs).length, `${id}: counts`);
        // The v1 forms a v2 control also edits point at a path of the same section.
        for (const [v1, target] of Object.entries(def.aliases)) {
            assert.ok(target in specs, `${id}: ${v1} -> ${target}`);
            assert.equal(sectionOf(def, v1), sectionOf(def, target));
        }
        // The first section needs the layer's base ability, the others its v2.
        const caps = def.ids.map((s) => def.cap[s]);
        assert.deepEqual(caps, [`look.${id}`, ...Array(caps.length - 1).fill(`look.${id}.v2`)]);
        // The reader keeps every field a control can set.
        const clean = CLEAN[id](FULL[id]);
        for (const p of Object.keys(specs)) assert.notEqual(getPath(clean, p), undefined, `${id}: ${p} did not survive cleaning`);
        assert.deepEqual(clean, FULL[id]);
    }
    assert.deepEqual(HEADLINE_LAYER.ids, ['headline', 'type', 'fill', 'shadow', 'card', 'motion']);
    assert.deepEqual(BAR_LAYER.ids, ['bar', 'track', 'shape', 'glow']);
    assert.deepEqual(LOGO_LAYER.ids, ['logo', 'rotation', 'shadow']);
    assert.equal(HEADLINE_LAYER.aliases.anim, 'enter.kind');
});

test('every field of the specs has the control its kind needs: number display, choice order', () => {
    for (const def of Object.values(LAYERS)) {
        for (const [p, s] of Object.entries(def.specs)) {
            if (s.type === 'number') {
                assert.deepEqual([numSpec(def, p).min, numSpec(def, p).max], [s.min, s.max]);
                const ui = numUi(def, p);
                assert.ok(ui && ui.k > 0 && Number.isInteger(ui.digits), `${def.id}: ${p} has no number display`);
            }
            if (s.type === 'enum') assert.deepEqual([...def.enums[p]].sort(), [...s.values].sort(), `${def.id}: ${p} choices`);
        }
        // An enum list with no field would be a control for nothing.
        for (const p of Object.keys(def.enums)) assert.equal(def.specs[p]?.type, 'enum', `${def.id}: ${p}`);
    }
    assert.deepEqual([CASES, ACCENT_WORDS, HEADLINE_ANIMS, BAR_POSITIONS], [['upper', 'asis'], ['auto', 'none', 'first', 'last'], ['pop', 'fade', 'none'], ['bottom', 'top']]);
    assert.deepEqual(HEADLINE_LAYER.enums.font, FONTS);
    assert.deepEqual(HEADLINE_LAYER.enums.align, ALIGNS);
    // How the numbers read: shares as percent, seconds, degrees, pixels.
    assert.deepEqual(numUi(BAR_LAYER, 'inset'), { k: 100, unit: '%', digits: 1 });
    assert.deepEqual(numUi(BAR_LAYER, 'height'), { k: 100, unit: '%', digits: 0 });
    assert.deepEqual(numUi(LOGO_LAYER, 'rotate'), { k: 1, unit: '°', digits: 1 });
    assert.deepEqual(numUi(HEADLINE_LAYER, 'delay_s'), { k: 1, unit: 's', digits: 1 });
    assert.equal(numUi(HEADLINE_LAYER, 'card.pad').unit, 'px');
    assert.equal(numUi(HEADLINE_LAYER, 'max_lines').digits, 0);
    assert.equal(numSpec(HEADLINE_LAYER, 'seconds').sliderMax, 30);
    assert.equal(numSpec(HEADLINE_LAYER, 'card'), undefined);
    assert.deepEqual([LOGO_SPECS.rotate.min, LOGO_SPECS.rotate.max, BAR_SPECS.inset.max, HEADLINE_SPECS.max_lines.max], [-30, 30, 0.1, 3]);
});

// ---- sections ---------------------------------------------------------------------

test('a section knows when it changes the layer, and puts itself back in one patch', () => {
    for (const [id, def] of Object.entries(LAYERS)) {
        const full = FULL[id];
        assert.deepEqual(dirtySections(def, {}), []);
        assert.deepEqual(dirtySections(def, undefined), []);
        assert.deepEqual(dirtySections(def, full), def.ids, id);
        for (const s of def.ids) {
            assert.equal(sectionHasOverrides(def, full, s), true, `${id}.${s}`);
            const patch = sectionResetPatch(def, full, s);
            assert.deepEqual(Object.keys(patch).sort(), sectionKeys(def, s).sort(), `${id}.${s} reset names its keys`);
            const after = applyPatchSection(id, full, patch);
            assert.equal(sectionHasOverrides(def, after, s), false, `${id}.${s} still has overrides`);
            for (const o of def.ids.filter((x) => x !== s)) {
                for (const k of sectionKeys(def, o)) assert.deepEqual(after[k], full[k], `${id}.${s} reset touched ${k}`);
            }
        }
        assert.deepEqual(sectionResetPatch(def, {}, def.ids[0]), {});
        // An object left empty says nothing.
        assert.equal(sectionHasOverrides(def, { shadow: {}, glow: {}, stroke: {}, enter: {}, card: {} }, def.ids[1]), false);
        // The keys a section owns do not overlap.
        const all = def.ids.flatMap((s) => sectionKeys(def, s));
        assert.equal(new Set(all).size, all.length, id);
    }
    assert.deepEqual(dirtySections(HEADLINE_LAYER, { width: 0.8, glow: { size: 3 }, delay_s: 1 }), ['type', 'shadow', 'motion']);
    assert.deepEqual(dirtySections(BAR_LAYER, { color: '#FF0000', glow: { size: 3 } }), ['bar', 'glow']);
    assert.deepEqual(dirtySections(LOGO_LAYER, { rotate: 5 }), ['rotation']);
    // The card's string form counts for the card section.
    assert.deepEqual(dirtySections(HEADLINE_LAYER, { card: 'none' }), ['card']);
    assert.deepEqual(dirtySections(HEADLINE_LAYER, { anim: 'fade' }), ['motion']);
});

/** What the Look's section is after the store applies a patch to it. */
function applyPatchSection(id, full, patch) {
    const [s] = fresh();
    s[SET[id]](full);
    s[SET[id]](patch);
    return look(s)[id] ?? {};
}

test('one section reset is one undo step in the store', () => {
    const [s, c] = fresh();
    s.setHeadline(FULL.headline);
    c.tick(1000);
    s.setHeadline(sectionResetPatch(HEADLINE_LAYER, look(s).headline, 'motion'));
    assert.equal(sectionHasOverrides(HEADLINE_LAYER, look(s).headline, 'motion'), false);
    assert.equal(look(s).headline.glow.size, 12);
    s.undo();
    assert.deepEqual(look(s).headline, FULL.headline);
});

// ---- what the controls show and write -------------------------------------------------

const hv = (L = {}, len = 9) => {
    const L2 = cleanHeadline(L);
    return headlineView(resolveHeadline('Why most founders quit too early', '9:16', L2, { len }), L2, { len, room: 0.8333 });
};

test('headline controls show the engine\'s value until the Look sets the field', () => {
    const v = hv();
    assert.deepEqual([v.val('size'), v.val('font'), v.val('case'), v.val('spacing'), v.val('align'), v.val('max_lines')], [1, 'Archivo Black', 'asis', 0, 'center', 3]);
    assert.deepEqual([v.val('accent_word'), v.val('enter.kind'), v.val('enter.ms'), v.val('exit.kind'), v.val('delay_s'), v.val('seconds')], ['auto', 'pop', 340, 'none', 0, 0]);
    assert.deepEqual([v.val('ink'), v.val('card.opacity'), v.val('card.radius'), v.val('card.pad'), v.val('card.color')], ['#111111', 1, 0, 24, '#FFFFFF']);
    assert.deepEqual([v.val('shadow.y'), v.val('shadow.opacity'), v.val('glow.size'), v.val('glow.strength')], [4, 0.6, 12, 0.8]);
    close(v.val('width'), 0.8333);
    assert.equal(v.cardOn, true);
    for (const p of ['size', 'font', 'accent_word', 'enter.kind', 'card', 'shadow.y', 'x', 'delay_s']) assert.equal(v.isSet(p), false, p);
    // Set fields show their own value, and say so.
    const w = hv({ max_lines: 2, width: 0.6, card: 'none', delay_s: 0.5, glow: { size: 20 } });
    assert.deepEqual([w.val('max_lines'), w.val('width'), w.val('delay_s'), w.val('glow.size'), w.val('glow.strength')], [2, 0.6, 0.5, 20, 0.8]);
    assert.deepEqual([w.isSet('card'), w.cardOn, w.glowOn, w.shadowOn, w.isSet('glow.size'), w.isSet('glow.strength')], [true, false, true, false, true, false]);
    // A card colour is a set colour; the old entrance is the entrance shown.
    const x = hv({ card: '#102030', anim: 'fade' });
    assert.deepEqual([x.val('card.color'), x.isSet('card.color'), x.val('enter.kind'), x.isSet('enter.kind'), x.val('enter.ease')], ['#102030', true, 'fade', true, 'linear']);
    // The card object with no opacity is fully opaque; a position is one place.
    assert.equal(hv({ card: { radius: 1 } }).val('card.opacity'), 1);
    assert.equal(hv({ y: 0.4 }).isSet('x'), true);
    // The timing view reads the clip's length.
    assert.equal(hv({ seconds: 3 }, 9).timing.early, true);
    assert.equal(hv({ seconds: 30 }, 9).timing.early, false);
});

test('headline edits fold the old forms into the new one', () => {
    // A colour card turned into an object keeps its colour.
    const v = hv({ card: '#102030' });
    assert.deepEqual(headlineEdit(v, 'card.radius', 0.5), { card: { color: '#102030', radius: 0.5 } });
    assert.deepEqual(headlineEdit(hv({ card: { color: '#102030' } }), 'card.radius', 0.5), { card: { radius: 0.5 } });
    assert.deepEqual(headlineEdit(hv(), 'card.opacity', 0.7), { card: { opacity: 0.7 } });
    // The first edit of an enter field takes the v1 entrance with it.
    const f = hv({ anim: 'fade' });
    assert.deepEqual(headlineEdit(f, 'enter.ms', 500), { enter: { kind: 'fade', ms: 500, ease: 'linear' }, anim: undefined });
    assert.deepEqual(headlineEdit(hv({ anim: 'none' }), 'enter.kind', 'zoom'), { enter: { kind: 'zoom', ms: 0 }, anim: undefined });
    assert.deepEqual(headlineEdit(hv(), 'enter.ms', 500), { enter: { ms: 500 } });
    assert.deepEqual(headlineEdit(hv(), 'shadow.y', 8), { shadow: { y: 8 } });
    // Clearing: a position is both, the entrance kind clears the old entrance too.
    assert.deepEqual(layerClear('x'), { x: undefined, y: undefined });
    assert.deepEqual(layerClear('y'), { x: undefined, y: undefined });
    assert.deepEqual(layerClear('enter.kind'), { enter: { kind: undefined }, anim: undefined });
    assert.deepEqual(layerClear('glow.size'), { glow: { size: undefined } });
    assert.deepEqual(layerPatch('inset', 0.04), { inset: 0.04 });
    // The switches: no card is `none`, the default card is nothing; shadows start from what matters.
    assert.deepEqual([cardPatch(false), cardPatch(true)], [{ card: 'none' }, { card: undefined }]);
    assert.deepEqual([shadowFxPatch(true), shadowFxPatch(false)], [{ shadow: { y: 4, opacity: 0.6 } }, { shadow: undefined }]);
    // Edits made through the store keep the Look reading the way the controls meant.
    const [s] = fresh();
    s.setHeadline({ card: '#102030' });
    s.setHeadline(headlineEdit(hv(look(s).headline), 'card.radius', 0.5));
    assert.deepEqual(look(s).headline.card, { color: '#102030', radius: 0.5 });
    s.setHeadline({ anim: 'fade' });
    s.setHeadline(headlineEdit(hv(look(s).headline), 'enter.ms', 500));
    assert.deepEqual([look(s).headline.enter, 'anim' in look(s).headline], [{ kind: 'fade', ms: 500, ease: 'linear' }, false]);
});

test('bar and logo controls show the engine\'s value until the Look sets the field', () => {
    const bv = (L = {}, flatSet = false) => barView(resolveBar('9:16', '#FFD400', cleanBar(L)), L, flatSet);
    const b = bv();
    assert.deepEqual([b.val('pos'), b.val('height'), b.val('color'), b.val('track'), b.val('track_opacity'), b.val('inset'), b.val('radius')], ['bottom', 1, '#FFD400', '#000000', 0.55, 0, 0]);
    assert.deepEqual([b.val('glow.size'), b.val('glow.strength')], [12, 0.8]);
    for (const p of ['pos', 'color', 'track', 'inset', 'radius', 'glow.size']) assert.equal(b.isSet(p), false, p);
    // The flat colour counts as the colour being set.
    assert.equal(bv({}, true).isSet('color'), true);
    const s = bv({ pos: 'top', track: '#FFFFFF', inset: 0.04, glow: { size: 20 } });
    assert.deepEqual([s.val('pos'), s.val('track'), s.val('inset'), s.val('glow.size'), s.glowOn, s.isSet('track_opacity')], ['top', '#FFFFFF', 0.04, 20, true, false]);
    assert.match(s.val('glow.color'), /^#[0-9A-F]{6}$/);
    const lv = (L = {}) => logoView(resolveLogo('9:16', 'tr', cleanLogo(L), null), L);
    const l = lv();
    assert.deepEqual([l.val('size'), l.val('opacity'), l.val('rotate'), l.val('shadow.y'), l.val('glow.color'), l.val('glow.size')], [1, 0.9, 0, 4, '#FFFFFF', 12]);
    assert.deepEqual([l.isSet('rotate'), l.isSet('x'), l.shadowOn, l.glowOn], [false, false, false, false]);
    const m = lv({ x: 0.3, rotate: -12, shadow: { y: 6 } });
    assert.deepEqual([m.val('rotate'), m.isSet('rotate'), m.isSet('y'), m.shadowOn, m.val('shadow.y'), m.val('shadow.opacity')], [-12, true, true, true, 6, 0.6]);
    close(m.val('x'), resolveLogo('9:16', 'tr', { x: 0.3 }, null).center.x);
});

test('a look without the new fields draws the three layers as before', () => {
    const v1h = resolveHeadline('Why most founders quit too early', '9:16', { x: 0.5, y: 0.2, size: 1.2, ink: '#FFFFFF', card: '#111111', anim: 'fade', seconds: 3 }, { len: 9 });
    assert.equal(v1h.positioned, false);
    assert.equal(v1h.lines.length, 2);
    assert.equal(resolveHeadline('Why most founders quit too early', '9:16', {}, {}).positioned, false);
    const plain = resolveBar('9:16', '#FFD400', { pos: 'top', height: 2, color: '#FF0000' });
    assert.deepEqual([plain.shaped, plain.glow, plain.track, plain.radius, plain.inset, plain.x0, plain.x1], [false, null, null, 0, 0, 0, 1080]);
    const logo = resolveLogo('9:16', 'tr', { x: 0.2, size: 1.5, opacity: 0.5 }, null);
    assert.deepEqual([logo.rotate, logo.shadow, logo.glow, logo.dressed], [0, null, null, false]);
    assert.deepEqual(logo.bounds, { x: logo.x, y: logo.y, w: logo.box.w, h: logo.box.h });
    // An untouched state still sends nothing.
    assert.equal(toEngine(defaults(null)).look, undefined);
});
