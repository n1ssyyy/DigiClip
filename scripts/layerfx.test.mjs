// Tests for the headline, bar and logo store and readers:
//   node --test scripts/layerfx.test.mjs   (also run by look.test.mjs)
// Expected numbers for the readers are the ones in digiclip-rs `src/look.rs`
// tests (`headline_dressing_fields_parse_clamp_and_fall_back`,
// `bar_fields_parse_clamp_and_fall_back`, `logo_fields_parse_clamp_and_fall_back`).
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyEdit, applyPatch, defaults, fromEngine, sanitizeLook, toEngine } from '../src/lib/look.js';
import { cleanBar, cleanHeadline, cleanLogo, isDressed, isPositioned, isShaped } from '../src/lib/layerFields.js';
import { sectionResetPatch, BAR_LAYER } from '../src/lib/layerSections.js';
import { BAR_DEFAULT_COLOR, resolveHeadline } from '../src/lib/layers.js';
import { FULL, clocked, close, fresh, look } from './layerkit.mjs';

// ---- the store ------------------------------------------------------------------

test('both forms of the headline card set, replace each other and clear', () => {
    const [s, c] = fresh();
    s.setHeadline({ card: '#102030' });
    assert.deepEqual(look(s).headline, { card: '#102030' });
    c.tick(1000);
    // The object replaces the colour (a colour carried over in the object stays the controls' job).
    s.setHeadline({ card: { color: '#102030', opacity: 0.7, radius: 1 } });
    assert.deepEqual(look(s).headline, { card: { color: '#102030', opacity: 0.7, radius: 1 } });
    c.tick(1000);
    // One leaf of the object changes on its own, and an emptied leaf goes.
    s.setHeadline({ card: { opacity: 0.5 } });
    assert.deepEqual(look(s).headline.card, { color: '#102030', opacity: 0.5, radius: 1 });
    c.tick(1000);
    s.setHeadline({ card: { color: undefined, radius: undefined } });
    assert.deepEqual(look(s).headline.card, { opacity: 0.5 });
    c.tick(1000);
    // `none` replaces the object, and clearing it leaves no headline at all.
    s.setHeadline({ card: 'none' });
    assert.deepEqual(look(s).headline, { card: 'none' });
    c.tick(1000);
    s.setHeadline({ card: undefined });
    assert.equal('headline' in look(s), false);
    // Each step undoes in turn, both forms back.
    s.undo();
    assert.deepEqual(look(s).headline, { card: 'none' });
    s.undo();
    assert.deepEqual(look(s).headline.card, { opacity: 0.5 });
    s.undo();
    assert.deepEqual(look(s).headline.card, { color: '#102030', opacity: 0.5, radius: 1 });
    s.undo();
    s.undo();
    assert.deepEqual(look(s).headline, { card: '#102030' });
    s.undo();
    assert.equal('headline' in look(s), false);
    assert.equal(s.get().canUndo, false);
});

test('headline fields set, clear and prune like the captions\' do', () => {
    const [s, c] = fresh();
    s.setHeadline({ font: 'Anton', shadow: { y: 6 }, glow: { size: 10 }, enter: { kind: 'blur', ms: 500 }, exit: { kind: 'fade' }, delay_s: 0.5, accent_word: 'last', max_lines: 2, ink: '' });
    assert.deepEqual(look(s).headline, { font: 'Anton', shadow: { y: 6 }, glow: { size: 10 }, enter: { kind: 'blur', ms: 500 }, exit: { kind: 'fade' }, delay_s: 0.5, accent_word: 'last', max_lines: 2 });
    c.tick(1000);
    s.setHeadline({ shadow: { y: undefined }, glow: undefined });
    assert.equal('shadow' in look(s).headline, false);
    assert.equal('glow' in look(s).headline, false);
    // A value is a value: 0 stays. What the store holds is what a control wrote; a Look
    // read back from a preset or storage is cleaned the way the engine reads it.
    s.setHeadline({ delay_s: 0 });
    assert.equal(look(s).headline.delay_s, 0);
    assert.deepEqual(sanitizeLook({ headline: { delay_s: 0, accent_word: 'second', spacing: 'wide', width: 9 } }).headline, { delay_s: 0, width: 1 });
    // The engine gets what the Look holds, and reads it back the same.
    const o = s.get().options;
    const sent = JSON.parse(JSON.stringify(toEngine({ ...o, headline: true, headline_text: 'Big news' }).look));
    assert.deepEqual(sent.headline, look(s).headline);
    assert.deepEqual(fromEngine({ look: sent }, null).look.headline, look(s).headline);
    // Emptied again, the section leaves the Look.
    s.setHeadline(Object.fromEntries(Object.keys(look(s).headline).map((k) => [k, undefined])));
    assert.equal('headline' in look(s), false);
});

test('bar and logo fields set, clear, prune and undo', () => {
    const [s, c] = fresh();
    s.setBar({ track: '#FFFFFF', track_opacity: 0.3, inset: 0.04, radius: 1, glow: { size: 14 }, pos: 'top' });
    assert.deepEqual(look(s).bar, { track: '#FFFFFF', track_opacity: 0.3, inset: 0.04, radius: 1, glow: { size: 14 }, pos: 'top' });
    c.tick(1000);
    s.setLogo({ rotate: -12, shadow: { y: 6 }, glow: { color: '#FFD400', size: 10 } });
    assert.deepEqual(look(s).logo, { rotate: -12, shadow: { y: 6 }, glow: { color: '#FFD400', size: 10 } });
    // Zero is a value: no inset, a clear track, no turn.
    c.tick(1000);
    s.setBar({ inset: 0, track_opacity: 0 });
    s.setLogo({ rotate: 0 });
    assert.deepEqual([look(s).bar.inset, look(s).bar.track_opacity, look(s).logo.rotate], [0, 0, 0]);
    // The Look the engine gets and gives back.
    const o = { ...s.get().options, progress_bar: true, logo: 'C:\\a.png' };
    const sent = JSON.parse(JSON.stringify(toEngine(o).look));
    assert.deepEqual([sent.bar, sent.logo], [look(s).bar, look(s).logo]);
    assert.deepEqual(fromEngine({ look: sent }, null).look.logo, look(s).logo);
    // Cleared, they leave; each clear is a step.
    c.tick(1000);
    s.setLogo({ rotate: undefined, shadow: undefined, glow: undefined });
    assert.equal('logo' in look(s), false);
    s.undo();
    assert.equal(look(s).logo.glow.size, 10);
    s.setBar({ glow: undefined });
    assert.equal('glow' in look(s).bar, false);
});

test('a drag on a layer\'s number is one undo step, and a gesture covers all three layers', () => {
    const [s, c] = fresh();
    s.setBar({ inset: 0.01 });
    c.tick(1000);
    s.beginGesture();
    for (let i = 2; i <= 9; i++) {
        s.setBar({ inset: i / 100 });
        s.setLogo({ rotate: -i });
        s.setHeadline({ card: { pad: i * 5 } });
        c.tick(i % 3 === 0 ? 900 : 16);
    }
    s.endGesture();
    close(look(s).bar.inset, 0.09);
    s.undo();
    assert.deepEqual([look(s).bar, 'logo' in look(s), 'headline' in look(s)], [{ inset: 0.01 }, false, false]);
    s.redo();
    assert.deepEqual([look(s).logo.rotate, look(s).headline.card.pad], [-9, 45]);
});

test('quick edits of one field fold into one step; another field starts a new one', () => {
    const [s, c] = fresh();
    s.setBar({ radius: 0.2 });
    c.tick(100);
    s.setBar({ radius: 0.4 });
    c.tick(100);
    s.setBar({ radius: 0.6 });
    c.tick(100);
    s.setBar({ inset: 0.02 });
    s.undo();
    assert.deepEqual(look(s).bar, { radius: 0.6 });
    s.undo();
    assert.equal('bar' in look(s), false);
    assert.equal(s.get().canUndo, false);
});

test('the flat bar colour replaces the Look\'s own, and one edit can do both', () => {
    const d = defaults(null);
    const withLook = { ...d, look: { captions: {}, bar: { color: '#FF0000', pos: 'top' } } };
    const n = applyPatch(withLook, { bar_color: '#00FF00' });
    assert.equal(n.bar_color, '#00FF00');
    assert.deepEqual(n.look.bar, { pos: 'top' });
    // When it was the only field, the bar leaves the Look.
    assert.equal('bar' in applyPatch({ ...d, look: { captions: {}, bar: { color: '#FF0000' } } }, { bar_color: '#00FF00' }).look, false);
    // A Look with no colour is left alone.
    assert.equal(applyPatch({ ...d, look: { captions: {}, bar: { pos: 'top' } } }, { bar_color: '#00FF00' }).look.bar.pos, 'top');
    // The reset of the Bar section: the flat colour and the Look's fields, one step.
    const [s, c] = fresh();
    s.update({ progress_bar: true, bar_color: '#00FF00' });
    c.tick(1000);
    s.setBar({ pos: 'top', color: '#FF0000' });
    c.tick(1000);
    s.edit({ bar_color: BAR_DEFAULT_COLOR }, { bar: sectionResetPatch(BAR_LAYER, look(s).bar, 'bar') });
    assert.equal(s.get().options.bar_color, BAR_DEFAULT_COLOR);
    assert.equal('bar' in look(s), false);
    s.undo();
    assert.deepEqual([s.get().options.bar_color, look(s).bar], ['#00FF00', { pos: 'top', color: '#FF0000' }]);
    assert.equal(applyEdit(d, null, null), d);
});

// ---- the readers ---------------------------------------------------------------

test('the headline reader clamps and falls back as look.rs does', () => {
    const h = cleanHeadline({
        font: 'jetbrains mono', case: 'Upper', spacing: 9, align: 'Right', max_lines: 9, width: 0.1, delay_s: 99,
        stroke: { color: '#102030', width: 99 }, shadow: { color: '#000000', x: -99, y: 99, blur: 99, opacity: 9 },
        glow: { color: '#FFD400', size: 99, strength: -1 }, accent_word: 'LAST',
        enter: { kind: 'slide_down', ms: 9999, ease: 'back' }, exit: { kind: 'blur', ms: -5 },
    });
    assert.deepEqual(h, {
        font: 'JetBrains Mono', case: 'upper', spacing: 0.3, align: 'right', max_lines: 3, width: 0.4, delay_s: 5,
        stroke: { color: '#102030', width: 12 }, shadow: { color: '#000000', x: -30, y: 30, blur: 20, opacity: 1 },
        glow: { color: '#FFD400', size: 40, strength: 0 }, accent_word: 'last',
        enter: { kind: 'slide_down', ms: 800, ease: 'back' }, exit: { kind: 'blur', ms: 0 },
    });
    assert.deepEqual(cleanHeadline({ spacing: -9, max_lines: 0, width: 9, delay_s: -3, font: 'anton', align: 'centre' }), {
        spacing: -0.05, max_lines: 1, width: 1, delay_s: 0, font: 'Anton', align: 'center',
    });
    for (const [j, want] of [['first', 'first'], ['Auto', 'auto'], ['none', 'none']]) assert.equal(cleanHeadline({ accent_word: j }).accent_word, want);
    // Bad values are absent, and empty objects are nothing.
    for (const j of [
        { font: '   ', case: 'title', align: 'middle', accent_word: 'second' },
        { spacing: 'wide', max_lines: 'two', width: null, delay_s: 'soon' },
        { stroke: {}, shadow: {}, glow: {}, card: {}, enter: {}, exit: {} },
        { stroke: 5, shadow: [1], glow: 'big', enter: 'pop', exit: 3 },
        { enter: { kind: 'spin', ease: 'wobble' }, exit: { kind: 'slide_left' } },
        { glow: { color: 'gold' }, card: { color: 'teal', pad: 'big' } },
    ]) assert.deepEqual(cleanHeadline(j), {}, JSON.stringify(j));
    assert.deepEqual(cleanHeadline({ width: 0.7 }), { width: 0.7 });
    assert.deepEqual(cleanHeadline({ delay_s: 0 }), { delay_s: 0 });
});

test('the card is a colour, none or an object; only the object and the new fields position the headline', () => {
    for (const j of [{ card: '#111111' }, { card: 'none' }, { card: null }, { x: 0.5, y: 0.2, size: 1.2, ink: '#FFFFFF', accent: '#FF0000', anim: 'fade', seconds: 2 }]) {
        assert.equal(isPositioned(cleanHeadline(j)), false, JSON.stringify(j));
    }
    const c = cleanHeadline({ card: { color: '#102030', opacity: 2, pad: 999, radius: -1 } });
    assert.deepEqual(c.card, { color: '#102030', opacity: 1, pad: 80, radius: 0 });
    assert.equal(isPositioned(c), true);
    assert.equal(isPositioned(cleanHeadline({ card: { radius: 1 } })), true);
    for (const j of [
        { font: 'Anton' }, { case: 'asis' }, { spacing: 0 }, { align: 'left' }, { max_lines: 2 }, { width: 0.8 }, { stroke: { width: 1 } },
        { shadow: { y: 1 } }, { glow: { size: 1 } }, { accent_word: 'none' }, { enter: { kind: 'none' } }, { exit: { kind: 'fade' } }, { delay_s: 1 },
    ]) assert.equal(isPositioned(cleanHeadline(j)), true, JSON.stringify(j));
    // The stage takes the same decision.
    assert.equal(resolveHeadline('Big news', '9:16', { card: '#111111' }, {}).positioned, false);
    assert.equal(resolveHeadline('Big news', '9:16', { card: { radius: 1 } }, {}).positioned, true);
});

test('the bar reader clamps, and only the shape fields shape it', () => {
    assert.deepEqual(cleanBar({ pos: 'top', height: 2, color: '#FF3B30', track: '#FFFFFF', track_opacity: 9, inset: 0.5, radius: -2, glow: { color: '#00E5FF', size: 99, strength: 0.5 } }), {
        pos: 'top', height: 2, color: '#FF3B30', track: '#FFFFFF', track_opacity: 1, inset: 0.1, radius: 0, glow: { color: '#00E5FF', size: 40, strength: 0.5 },
    });
    assert.deepEqual(cleanBar({ inset: -1, track_opacity: -1, radius: 9 }), { inset: 0, track_opacity: 0, radius: 1 });
    assert.deepEqual(cleanBar({ color: 'red', track: '#12', track_opacity: 'half', inset: 'wide', radius: null, glow: {} }), {});
    for (const j of [{}, { pos: 'top', height: 2 }, { color: '#FF0000' }]) assert.equal(isShaped(cleanBar(j)), false, JSON.stringify(j));
    for (const j of [{ track: '#000000' }, { track_opacity: 0.5 }, { inset: 0 }, { radius: 0 }, { glow: { size: 1 } }]) assert.equal(isShaped(cleanBar(j)), true, JSON.stringify(j));
});

test('the logo reader clamps; the v1 fields are untouched by the new ones', () => {
    assert.deepEqual(cleanLogo({ rotate: -99, shadow: { color: '#000000', x: 99, y: -99, blur: 99, opacity: -1 }, glow: { color: '#FFD400', size: 99, strength: 9 } }), {
        rotate: -30, shadow: { color: '#000000', x: 30, y: -30, blur: 20, opacity: 0 }, glow: { color: '#FFD400', size: 40, strength: 1 },
    });
    assert.equal(cleanLogo({ rotate: 99 }).rotate, 30);
    for (const j of [{ rotate: 'left', shadow: {}, glow: 5 }, { shadow: [1], glow: { color: 'red' } }]) assert.deepEqual(cleanLogo(j), {}, JSON.stringify(j));
    const v1 = cleanLogo({ x: 0.2, size: 1.5, opacity: 0.5 });
    assert.deepEqual(v1, { x: 0.2, size: 1.5, opacity: 0.5 });
    assert.equal(isDressed(v1), false);
    assert.equal(isDressed(cleanLogo({ glow: { size: 5 } })), true);
});
