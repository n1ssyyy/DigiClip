// Tests for the Look store and the caption-style mirror:
//   node --test scripts/look.test.mjs
// Expected numbers are derived by hand from digiclip-rs `src/captions/ass.rs`
// (and its own tests) and `src/look.rs`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    HISTORY_CAP, STORE_KEY, aspectList, applyCaptions, applyPatch, createLookStore, defaults, fromEngine, lookOptions,
    lookToEngine, sanitizeLook, toEngine,
} from '../src/lib/look.js';
import {
    CANVASES, CAPTION_STYLES, DEFAULT_POSITIONS, STYLES, assColor, captionLines, cleanCaptions, defaultPosition, fontBox,
    groupWords, holdLines, isKeyword, keywordBump, lineMotion, outlineRing, resolveCaptions, wordReveal,
} from '../src/lib/captionStyles.js';

// ---------------------------------------------------------------------------
// the panel state -> engine options contract
// ---------------------------------------------------------------------------

// The model as it was in JobOptions.jsx before the Look existed.
function legacyDurRange(o) {
    if (o.dur_mode === 'exact') {
        const L = Math.min(300, Math.max(5, +o.dur_exact || 30));
        return { min_len: L, max_len: L };
    }
    if (o.dur_mode === 'minmax') {
        const lo = Math.min(300, Math.max(5, +o.dur_min || 15));
        const hi = Math.max(lo, Math.min(600, +o.dur_max || 60));
        return { min_len: lo, max_len: hi };
    }
    return {};
}
function legacyToEngine(o) {
    return {
        mode: 'clips',
        kind: o.kind,
        count: o.count,
        ...legacyDurRange(o),
        style: o.style,
        tighten: o.tighten,
        punch: o.punch,
        merge_flash: o.merge_flash,
        kit: true,
        framing: 'smart',
        ...lookOptions(o),
    };
}

const STATES = [
    {},
    { style: 'hormozi', count: 0, kind: 'timecut' },
    { dur_mode: 'exact', dur_exact: 40, aspect: '1:1,9:16' },
    { dur_mode: 'minmax', dur_min: 20, dur_max: 90, layout: 'split', subs_lang: 'de', caption_anim: 'words' },
    { headline: true, headline_text: '  Big news ', progress_bar: true, bar_color: '#00FF88', logo: 'C:\\logo.png', logo_pos: 'bl', music: 'C:\\bed.mp3', music_db: -10, focus: ' pricing ' },
    { caption_anim: 'none', punch: false, merge_flash: true, tighten: 'punchy' },
];

test('toEngine of an untouched panel is what the old code produced', () => {
    for (const settings of [null, { clips_count: 5, caption_default: 'beast', tighten: 'off', punch: false }]) {
        for (const patch of STATES) {
            const o = { ...defaults(settings), ...patch };
            assert.deepEqual(toEngine(o), legacyToEngine(o), JSON.stringify(patch));
            assert.equal('look' in toEngine(o), false);
        }
    }
});

test('an empty Look sends nothing', () => {
    const base = defaults(null);
    for (const look of [undefined, null, {}, { captions: {} }, { captions: { x: undefined, font: null, color: '', size: NaN }, headline: {} }, { v: 1 }]) {
        const out = toEngine({ ...base, look });
        assert.deepEqual(out, legacyToEngine(base));
    }
});

test('a Look is sent with its version and only its real fields', () => {
    const out = toEngine({ ...defaults(null), look: { captions: { x: 0.5, y: 0.8, show: false, size: 0, box: 'none', color: '', font: undefined }, bar: { pos: 'top' }, logo: {} } });
    assert.deepEqual(out.look, { v: 1, captions: { x: 0.5, y: 0.8, show: false, size: 0, box: 'none' }, bar: { pos: 'top' } });
});

test('the Look\'s motion and the flat caption_anim never conflict', () => {
    const at = (anim, flat) => toEngine({ ...defaults(null), caption_anim: flat, look: { captions: { anim } } });
    assert.equal('caption_anim' in at('bounce', 'words'), false);
    assert.equal('caption_anim' in at('fade', 'none'), false);
    assert.equal('caption_anim' in at('slide', 'pop'), false);
    assert.equal(at('words', 'pop').caption_anim, 'words');
    assert.equal(at('none', 'words').caption_anim, 'none');
    assert.equal('caption_anim' in at('pop', 'words'), false); // pop is the engine default
    assert.equal(at('bounce', 'words').look.captions.anim, 'bounce');
    // No Look motion: the flat option is untouched.
    assert.equal(toEngine({ ...defaults(null), caption_anim: 'words', look: { captions: { x: 0.2 } } }).caption_anim, 'words');
});

test('a Look with caption overrides round-trips through toEngine and fromEngine', () => {
    const captions = {
        show: true, x: 0.25, y: 0.8, size: 1.5, font: 'Anton', case: 'asis', color: '#FFFFFF', active: '#FF3B30', accent: '#00FF00',
        outline: '#101010', outline_w: 5, shadow: 4, box: '#336699', box_opacity: 0.6, max_words: 2, anim: 'bounce',
    };
    const o = { ...defaults(null), style: 'minimal', aspect: '1:1', look: { captions, headline: { size: 1.2, anim: 'fade' } } };
    const e = toEngine(o);
    assert.deepEqual(e.look.captions, captions);
    assert.equal(e.look.v, 1);
    const back = fromEngine(JSON.parse(JSON.stringify(e)), null);
    assert.deepEqual(back.look.captions, captions);
    assert.deepEqual(back.look.headline, { size: 1.2, anim: 'fade' });
    assert.deepEqual(toEngine(back), e);
});

test('fromEngine tolerates a junk look', () => {
    for (const look of [null, 7, 'x', [], [1, 2], { captions: 5 }, { captions: [1] }, { captions: { size: 'big', font: 'Comic Sans', color: 'red', anim: 'spin', x: 4, outline_w: 99 } }]) {
        const p = fromEngine({ style: 'karaoke', look }, null);
        assert.equal(typeof p.look, 'object');
        assert.equal(typeof p.look.captions, 'object');
    }
    const p = fromEngine({ look: { captions: { size: 'big', font: 'Comic Sans', color: 'red', anim: 'spin', x: 4, outline_w: 99, box: null } } }, null);
    // Clamped like the engine reads it; bad enums and colours are absent.
    assert.deepEqual(p.look.captions, { x: 1, outline_w: 8, box: 'none' });
    // No look at all is the default panel look.
    assert.deepEqual(fromEngine({}, null).look, { captions: {} });
    // A deep copy: editing the result leaves the preset alone.
    const preset = { look: { captions: { x: 0.3 } } };
    fromEngine(preset, null).look.captions.x = 0.9;
    assert.equal(preset.look.captions.x, 0.3);
});

test('aspectList, lookToEngine and sanitizeLook basics', () => {
    assert.deepEqual(aspectList('1:1, 9:16,1:1,bogus'), ['1:1', '9:16']);
    assert.deepEqual(aspectList(''), ['9:16']);
    assert.equal(lookToEngine(null), null);
    assert.equal(lookToEngine({ captions: {} }), null);
    assert.deepEqual(sanitizeLook(undefined), { captions: {} });
});

// ---------------------------------------------------------------------------
// the store
// ---------------------------------------------------------------------------

function memoryStorage(initial) {
    const m = new Map(initial ? [[STORE_KEY, initial]] : []);
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), _m: m };
}
function clocked() {
    let t = 1000;
    return { now: () => t, tick: (ms) => { t += ms; } };
}

test('the store seeds from settings and from local storage the way the hook did', () => {
    const a = createLookStore({ storage: memoryStorage() });
    a.seed({ clips_count: 5, caption_default: 'neon', tighten: 'off', punch: false });
    const o = a.get().options;
    assert.deepEqual([o.count, o.style, o.tighten, o.punch], [5, 'neon', 'off', false]);
    assert.deepEqual(o.look, { captions: {} });

    // Saved state wins over settings; an old save without a look gets one.
    const b = createLookStore({ storage: memoryStorage(JSON.stringify({ style: 'ghost', count: 2 })) });
    b.seed({ caption_default: 'neon' });
    assert.equal(b.get().options.style, 'ghost');
    assert.equal(b.get().options.count, 2);
    assert.deepEqual(b.get().options.look, { captions: {} });

    // Junk in storage is ignored.
    const c = createLookStore({ storage: memoryStorage('{nope') });
    c.seed(null);
    assert.equal(c.get().options.style, 'karaoke');
});

test('changes persist under the same key and notify subscribers', () => {
    const storage = memoryStorage();
    const s = createLookStore({ storage });
    s.seed(null);
    let n = 0;
    const off = s.subscribe(() => { n++; });
    s.update({ style: 'beast' });
    s.setCaptions({ x: 0.3, y: 0.7 });
    assert.equal(n, 2);
    const saved = JSON.parse(storage.getItem(STORE_KEY));
    assert.equal(saved.style, 'beast');
    assert.deepEqual(saved.look.captions, { x: 0.3, y: 0.7 });
    off();
    s.update({ style: 'neon' });
    assert.equal(n, 2);
    // No-op updates do not notify.
    const before = s.get();
    s.update({ style: 'neon' });
    assert.equal(s.get(), before);
});

test('setCaptions removes fields that are unset', () => {
    const s = createLookStore({ storage: memoryStorage() });
    s.seed(null);
    s.setCaptions({ size: 1.5, font: 'Anton' });
    s.setCaptions({ size: undefined, font: '' });
    assert.deepEqual(s.get().options.look.captions, {});
    assert.deepEqual(applyCaptions({ look: { captions: { a: 1 } } }, { a: 1 }), { look: { captions: { a: 1 } } });
});

test('undo and redo walk the history; a new change forgets the future', () => {
    const c = clocked();
    const s = createLookStore({ storage: memoryStorage(), now: c.now });
    s.seed(null);
    s.update({ style: 'beast' });
    c.tick(1000);
    s.update({ style: 'neon' });
    assert.deepEqual([s.get().canUndo, s.get().canRedo], [true, false]);
    s.undo();
    assert.equal(s.get().options.style, 'beast');
    assert.equal(s.get().canRedo, true);
    s.redo();
    assert.equal(s.get().options.style, 'neon');
    s.undo();
    s.undo();
    assert.equal(s.get().options.style, 'karaoke');
    assert.equal(s.get().canUndo, false);
    s.undo(); // nothing left: harmless
    s.redo();
    assert.equal(s.get().options.style, 'beast');
    c.tick(1000);
    s.update({ style: 'ghost' });
    assert.equal(s.get().canRedo, false);
});

test('rapid changes to one field are one undo step', () => {
    const c = clocked();
    const s = createLookStore({ storage: memoryStorage(), now: c.now });
    s.seed(null);
    for (let i = 1; i <= 20; i++) {
        s.setCaptions({ size: 1 + i / 20 });
        c.tick(16); // a slider drag
    }
    assert.equal(s.get().options.look.captions.size, 2);
    s.undo();
    assert.deepEqual(s.get().options.look.captions, {});
    assert.equal(s.get().canUndo, false);

    // Another field, or a pause of 400ms or more, starts a new step.
    s.redo();
    s.setCaptions({ y: 0.5 });
    c.tick(100);
    s.setCaptions({ x: 0.5 });
    c.tick(500);
    s.setCaptions({ x: 0.6 });
    s.undo();
    assert.equal(s.get().options.look.captions.x, 0.5);
    s.undo();
    assert.equal(s.get().options.look.captions.x, undefined);
    assert.equal(s.get().options.look.captions.y, 0.5);
});

test('history is capped at 100 steps', () => {
    const c = clocked();
    const s = createLookStore({ storage: memoryStorage(), now: c.now });
    s.seed(null);
    for (let i = 1; i <= 150; i++) {
        c.tick(1000);
        s.update({ count: i % 11 === 0 ? 1 : 0, dur_exact: i });
    }
    let steps = 0;
    while (s.get().canUndo) {
        s.undo();
        steps++;
    }
    assert.equal(steps, HISTORY_CAP);
    assert.equal(s.get().options.dur_exact, 50);
});

test('reset clears the captions or the whole Look in one step', () => {
    const c = clocked();
    const s = createLookStore({ storage: memoryStorage(), now: c.now });
    s.seed(null);
    s.update({ look: { captions: { size: 1.4 }, headline: { size: 1.2 } } });
    c.tick(1000);
    s.reset('captions');
    assert.deepEqual(s.get().options.look, { captions: {}, headline: { size: 1.2 } });
    s.undo();
    assert.deepEqual(s.get().options.look.captions, { size: 1.4 });
    s.reset();
    assert.deepEqual(s.get().options.look, { captions: {} });
    s.reset(); // already clean: nothing to undo twice
    s.undo();
    assert.deepEqual(s.get().options.look.captions, { size: 1.4 });
});

test('a motion picked in the Home popover replaces the Look\'s motion', () => {
    const p = { ...defaults(null), look: { captions: { anim: 'bounce', x: 0.3 } } };
    const n = applyPatch(p, { caption_anim: 'pop' });
    assert.equal(n.caption_anim, 'pop');
    assert.deepEqual(n.look.captions, { x: 0.3 });
    // Without a Look motion it is a plain patch, and no change is no change.
    assert.equal(applyPatch(defaults(null), { caption_anim: 'pop' }).look.captions.anim, undefined);
    const d = defaults(null);
    assert.equal(applyPatch(d, { style: d.style }), d);
});

// ---------------------------------------------------------------------------
// the caption styles, as ass.rs builds them
// ---------------------------------------------------------------------------

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('ASS colours convert to CSS', () => {
    assert.equal(assColor('&H0035E1FF'), '#FFE135');
    assert.equal(assColor('&H00552CFE'), '#FE2C55');
    assert.equal(assColor('&H0035E6A3'), '#A3E635');
});

test('every style resolves on every canvas', () => {
    for (const s of CAPTION_STYLES) {
        for (const cv of Object.keys(CANVASES)) {
            const r = resolveCaptions(s, cv, {});
            assert.ok(r.fontPx >= 1 && r.wrapW > 0, `${s} ${cv}`);
            const p = DEFAULT_POSITIONS[s][cv];
            assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1, `${s} ${cv} ${JSON.stringify(p)}`);
        }
    }
    assert.equal(resolveCaptions('nope', '9:16', {}).style, 'tiktok');
});

test('karaoke on 9:16: Archivo Black 84, centred in the frame', () => {
    const r = resolveCaptions('karaoke', '9:16', {});
    assert.equal(r.font, 'Archivo Black');
    assert.equal(r.fontPx, 84);
    assert.equal(r.caps, true);
    assert.equal(r.color, '#FFFFFF'); // not yet spoken (ASS secondary)
    assert.equal(r.active, '#FFE135'); // spoken (ASS primary &H0035E1FF)
    assert.equal(r.accent, '#FFFF00');
    assert.deepEqual(r.outline, { color: '#000000', width: 3 });
    assert.equal(r.box, null);
    assert.equal(r.shadow, 0);
    assert.deepEqual([r.maxWords, r.maxChars], [3, 14]);
    // alignment 5 on a tall canvas: the middle of the frame
    assert.deepEqual(r.anchor, { mode: 'middle', x: 540, y: 960 });
    assert.deepEqual(r.center, { x: 0.5, y: 0.5 });
    assert.equal(r.wrapW, 1000);
    assert.equal(r.placed, false);
    assert.equal(r.anim, 'pop');
});

test('karaoke on 1:1: scaled by 0.9 and moved to the lower third', () => {
    const r = resolveCaptions('karaoke', '1:1', {});
    assert.equal(r.k, 0.9);
    assert.equal(r.fontPx, 76); // round(84 * 0.9) = 76 (the engine's own test)
    assert.deepEqual(r.outline, { color: '#000000', width: 3 }); // round(3 * 0.9)
    // alignment 5 becomes 2 with marginV = round(1080 * 0.14) = 151
    assert.deepEqual(r.anchor, { mode: 'bottom', x: 540, y: 929 });
    close(r.center.y, (929 - 76 / 2) / 1080);
    assert.equal(r.wrapW, 1000);
});

test('hormozi: Anton 110 on a black box, bottom-anchored', () => {
    const r = resolveCaptions('hormozi', '9:16', {});
    assert.equal(r.font, 'Anton');
    assert.equal(r.fontPx, 110);
    assert.equal(r.color, '#FFFFFF');
    assert.equal(r.active, '#FFFFFF');
    assert.equal(r.outline, null);
    assert.deepEqual(r.box, { color: '#000000', opacity: 1, pad: 2, soft: false });
    assert.deepEqual(r.anchor, { mode: 'bottom', x: 540, y: 1920 - 450 });
    close(r.center.y, (1470 - 55) / 1920);
    assert.deepEqual([r.maxWords, r.maxChars], [3, 16]);

    const sq = resolveCaptions('hormozi', '1:1', {});
    assert.equal(sq.fontPx, 99);
    // marginV = max(round(450 * 1080 / 1920) = 253, round(108)) = 253
    assert.deepEqual(sq.anchor, { mode: 'bottom', x: 540, y: 1080 - 253 });
    close(sq.center.y, (827 - 99 / 2) / 1080);
    assert.equal(sq.box.pad, 2);
});

test('minimal: Inter Medium 64 as spoken, with a soft shadow', () => {
    const r = resolveCaptions('minimal', '9:16', {});
    assert.equal(r.font, 'Inter Medium');
    assert.equal(r.fontPx, 64);
    assert.equal(r.caps, false);
    assert.deepEqual(r.outline, { color: '#000000', width: 2 });
    assert.equal(r.shadow, 1);
    assert.equal(r.shadowColor, '#000000');
    close(r.shadowOpacity, 1 - 0x99 / 255);
    assert.deepEqual(r.anchor, { mode: 'bottom', x: 540, y: 1620 });
    close(r.center.y, (1620 - 32) / 1920);
    assert.deepEqual([r.maxWords, r.maxChars], [4, 20]);

    const sq = resolveCaptions('minimal', '1:1', {});
    assert.equal(sq.fontPx, 58);
    // marginV = max(round(300 * 1080 / 1920) = 169, 108); the engine's slide
    // test ends at y = 911 on this canvas.
    assert.deepEqual(sq.anchor, { mode: 'bottom', x: 540, y: 911 });
    close(sq.center.y, (911 - 29) / 1080);
    assert.deepEqual(sq.outline, { color: '#000000', width: 2 });
});

test('the other canvases follow the same rules', () => {
    const wide = resolveCaptions('minimal', '16:9', {});
    assert.equal(wide.k, 0.9);
    assert.equal(wide.w, 1920);
    assert.equal(wide.wrapW, 1920 - 2 * 71); // side margin round(40 * 1920 / 1080)
    assert.equal(wide.anchor.y, 1080 - 169);
    const four5 = resolveCaptions('tiktok', '4:5', {});
    assert.equal(four5.k, 1);
    assert.equal(four5.anchor.y, 1350 - Math.max(Math.round((400 * 1350) / 1920), Math.round(135)));
    // 4:5 is not "tall": a style centred on 9:16 drops to the lower third.
    assert.equal(resolveCaptions('neon', '4:5', {}).anchor.mode, 'bottom');
    assert.equal(resolveCaptions('neon', '9:16', {}).anchor.mode, 'middle');
    const tt = resolveCaptions('tiktok', '9:16', {});
    assert.equal(tt.shadow, 2);
    assert.equal(tt.shadowColor, '#FE2C55');
    assert.equal(tt.shadowOpacity, 1);
    assert.equal(resolveCaptions('beast', '9:16', {}).accent, '#00FFFF');
    assert.equal(resolveCaptions('neon', '9:16', {}).accent, '#FF00FF');
    assert.equal(resolveCaptions('highlight', '9:16', {}).accent, '#FFFFFF');
    assert.equal(resolveCaptions('highlight', '9:16', {}).box.color, '#A3E635');
});

test('a Look position centres the block and nudges away from the edges', () => {
    const at = (look) => resolveCaptions('karaoke', '9:16', look);
    let r = at({ x: 0.25, y: 0.8 });
    assert.deepEqual(r.anchor, { mode: 'middle', x: 270, y: 1536 });
    assert.equal(r.wrapW, 1080 - 2 * 310); // margin 310 each side, as the engine's test
    assert.equal(r.placed, true);
    assert.deepEqual(r.center, { x: 0.25, y: 0.8 });
    // A missing x or y is the middle.
    r = at({ y: 0.25 });
    assert.deepEqual(r.anchor, { mode: 'middle', x: 540, y: 480 });
    assert.equal(r.wrapW, 1000);
    assert.deepEqual(at({ x: 0.5 }).anchor, { mode: 'middle', x: 540, y: 960 });
    // Hard against an edge the centre moves in.
    r = at({ x: 0.02, y: 0.5 });
    assert.deepEqual(r.anchor, { mode: 'middle', x: 256, y: 960 });
    assert.equal(r.wrapW, 1080 - 2 * 324);
    assert.equal(at({ x: 1 }).anchor.x, 824);
    // A position beats the style's own anchor, on any canvas.
    const sq = resolveCaptions('minimal', '1:1', { x: 0.5, y: 0.9 });
    assert.deepEqual(sq.anchor, { mode: 'middle', x: 540, y: 972 });
    assert.equal(sq.wrapW, 1000);
});

test('size, font and case', () => {
    assert.equal(resolveCaptions('karaoke', '9:16', { size: 1.5 }).fontPx, 126);
    assert.equal(resolveCaptions('karaoke', '9:16', { size: 0.5 }).fontPx, 42);
    assert.equal(resolveCaptions('karaoke', '1:1', { size: 1.5 }).fontPx, 113);
    assert.equal(resolveCaptions('karaoke', '9:16', { size: 9 }).fontPx, 168); // clamped to 2
    assert.equal(resolveCaptions('karaoke', '9:16', { font: 'anton' }).font, 'Anton');
    assert.equal(resolveCaptions('karaoke', '9:16', { font: 'Comic Sans' }).font, 'Archivo Black');
    assert.equal(resolveCaptions('minimal', '9:16', { case: 'upper' }).caps, true);
    assert.equal(resolveCaptions('karaoke', '9:16', { case: 'asis' }).caps, false);
});

test('colours: color alone sets both, active only the spoken one', () => {
    let r = resolveCaptions('karaoke', '9:16', { color: '#102030' });
    assert.deepEqual([r.color, r.active], ['#102030', '#102030']);
    r = resolveCaptions('karaoke', '9:16', { active: '#FF3B30' });
    assert.deepEqual([r.color, r.active, r.accent], ['#FFFFFF', '#FF3B30', '#FFFF00']);
    r = resolveCaptions('karaoke', '9:16', { color: '#ffffff', active: '#FF3B30', accent: '#00FF00' });
    assert.deepEqual([r.color, r.active, r.accent], ['#FFFFFF', '#FF3B30', '#00FF00']);
    // Bad colours are absent.
    r = resolveCaptions('karaoke', '9:16', { color: 'red', active: '#12345' });
    assert.deepEqual([r.color, r.active], ['#FFFFFF', '#FFE135']);
});

test('outline and shadow scale like the type', () => {
    let r = resolveCaptions('karaoke', '9:16', { outline: '#FF0000', outline_w: 5, shadow: 4 });
    assert.deepEqual(r.outline, { color: '#FF0000', width: 5 });
    assert.equal(r.shadow, 4);
    r = resolveCaptions('karaoke', '1:1', { outline_w: 5, shadow: 4 });
    assert.deepEqual([r.outline.width, r.shadow], [4.5, 3.6]);
    r = resolveCaptions('tiktok', '9:16', { outline_w: 0, shadow: 0 });
    assert.deepEqual([r.outline.width, r.shadow], [0, 0]);
    assert.equal(resolveCaptions('karaoke', '9:16', { outline_w: 99, shadow: 99 }).shadow, 6);
});

test('box on: the outline is ignored and outline_w is the padding', () => {
    // A see-through box on a style without one: padded by 14, see-through.
    let r = resolveCaptions('minimal', '9:16', { box: '#000000', box_opacity: 0.6, outline: '#FF0000' });
    assert.equal(r.outline, null);
    assert.deepEqual(r.box, { color: '#000000', opacity: 0.6, pad: 14, soft: true });
    // Opaque: no see-through handling.
    r = resolveCaptions('minimal', '9:16', { box: '#000000', box_opacity: 1 });
    assert.equal(r.box.soft, false);
    r = resolveCaptions('minimal', '9:16', { box: '#336699' });
    assert.deepEqual(r.box, { color: '#336699', opacity: 1, pad: 14, soft: false });
    // An explicit outline_w is the padding.
    assert.equal(resolveCaptions('minimal', '9:16', { box: '#336699', outline_w: 6 }).box.pad, 6);
    // On 1:1 the default padding scales: round(14 * 0.9).
    assert.equal(resolveCaptions('minimal', '1:1', { box: '#336699' }).box.pad, 13);
    // Removing a style's box brings its outline back (and the style's colour).
    for (const off of [{ box: 'none' }, { box: null }, { box: 'None' }]) {
        const h = resolveCaptions('hormozi', '9:16', off);
        assert.equal(h.box, null);
        assert.deepEqual(h.outline, { color: '#000000', width: 2 });
    }
    assert.deepEqual(resolveCaptions('highlight', '9:16', { box: 'none' }).outline, { color: '#A3E635', width: 2 });
    // Opacity alone fades the style's own box, and does nothing to no box.
    r = resolveCaptions('hormozi', '9:16', { box_opacity: 0.5 });
    assert.equal(r.box.color, '#000000');
    assert.equal(r.box.opacity, 0.5);
    assert.equal(r.box.soft, true);
    assert.equal(resolveCaptions('minimal', '9:16', { box_opacity: 0.5 }).box, null);
    // A new colour keeps the style's box and its padding.
    r = resolveCaptions('highlight', '9:16', { box: '#FF00FF' });
    assert.deepEqual(r.box, { color: '#FF00FF', opacity: 1, pad: 2, soft: false });
});

test('words per line stretch the character budget', () => {
    let r = resolveCaptions('minimal', '9:16', { max_words: 8 });
    assert.deepEqual([r.maxWords, r.maxChars, r.wordCap], [8, 40, 8]);
    r = resolveCaptions('minimal', '9:16', { max_words: 2 });
    assert.deepEqual([r.maxWords, r.maxChars], [2, 20]);
    assert.equal(resolveCaptions('minimal', '9:16', { max_words: 50 }).maxWords, 8);
    assert.equal(resolveCaptions('minimal', '9:16', { max_words: 0 }).maxWords, 1);
    assert.equal(resolveCaptions('minimal', '9:16', {}).wordCap, null);
});

test('motion: the Look beats the flat option, and show can hide everything', () => {
    assert.equal(resolveCaptions('karaoke', '9:16', {}, { anim: 'words' }).anim, 'words');
    assert.equal(resolveCaptions('karaoke', '9:16', { anim: 'fade' }, { anim: 'words' }).anim, 'fade');
    assert.equal(resolveCaptions('karaoke', '9:16', { anim: 'off' }).anim, 'none');
    assert.equal(resolveCaptions('karaoke', '9:16', { show: false }).show, false);
    assert.equal(resolveCaptions('karaoke', '9:16', { show: 'no' }).show, true);
});

test('out-of-range and bad values fall back like the engine', () => {
    const same = (bad, good) => assert.deepEqual(resolveCaptions('karaoke', '9:16', bad), resolveCaptions('karaoke', '9:16', good));
    same({ size: 9 }, { size: 2 });
    same({ size: 0.01 }, { size: 0.5 });
    same({ x: 7, y: -2 }, { x: 1, y: 0 });
    same({ outline_w: 99, shadow: 99 }, { outline_w: 8, shadow: 6 });
    same({ font: 'Papyrus', case: 'title', anim: 'spin' }, {});
    same({ color: 'red', active: '#12345', accent: '#GGGGGG', outline: 7 }, {});
    same({ box: 'teal', box_opacity: 'half', size: 'big', show: 'no' }, {});
    same({ unknown: 1, x: null }, {});
    assert.deepEqual(cleanCaptions({ box: null, anim: 'static' }), { box: 'none', anim: 'none' });
});

test('the default position is the style\'s own', () => {
    assert.deepEqual(defaultPosition('karaoke', '9:16'), { x: 0.5, y: 0.5 });
    close(defaultPosition('hormozi', '9:16').y, 1415 / 1920);
    close(DEFAULT_POSITIONS.minimal['1:1'].y, 882 / 1080);
});

test('fonts are sized like libass: the ASS size is the cell height', () => {
    const a = fontBox('Anton', 110);
    close(a.em, (110 * 2048) / (2876 + 674));
    assert.equal(a.lineH, 110);
    const i = fontBox('Inter Medium', 64);
    close(i.em, (64 * 2048) / (1984 + 494));
    close(i.shiftY, 0, 1e-9); // hhea and win metrics agree: nothing to correct
    assert.ok(a.padAbove >= 0 && a.padBelow >= 0);
});

// ---------------------------------------------------------------------------
// keywords and grouping
// ---------------------------------------------------------------------------

const W = (w, s, e) => ({ w, s, e });

test('keywords: digits, power words, proper nouns that do not open a sentence', () => {
    assert.equal(isKeyword('million'), true);
    assert.equal(isKeyword('"Never,"'), true);
    assert.equal(isKeyword('3'), true);
    assert.equal(isKeyword('$1'), true);
    assert.equal(isKeyword('the'), false);
    assert.equal(isKeyword(''), false);
    assert.equal(isKeyword('Paris', false), true);
    assert.equal(isKeyword('Paris', true), false);
    assert.equal(isKeyword('Stop', true), true); // a power word at the start still pops
    assert.equal(isKeyword('I', false), false); // one letter is not a name
    assert.equal(isKeyword('world', true), true);
});

// "so I made 3 million dollars last year. Never stop building" at 0.4s steps:
// the engine's own sample().
const SAMPLE = 'so I made 3 million dollars last year. Never stop building'.split(' ').map((w, i) => W(w, i * 0.4, i * 0.4 + 0.35));

test('keywords in a line follow the engine\'s sentence tracking', () => {
    const r = resolveCaptions('minimal', '9:16', { max_words: 8 });
    const lines = captionLines(SAMPLE, r);
    const flat = lines.flatMap((l) => l.words);
    const keys = flat.filter((w) => w.key).map((w) => w.raw);
    assert.deepEqual(keys, ['3', 'million', 'last', 'Never', 'stop']);
    assert.equal(flat.find((w) => w.raw === 'I').key, false);
});

test('caption lines break at sentence ends and never flash', () => {
    const ws = [W('kindergarten', 0.0, 0.4), W('teacher.', 0.45, 0.6), W('raise', 0.65, 0.7), W('hands', 2.0, 2.1)];
    const r = resolveCaptions('minimal', '9:16', {});
    const lines = captionLines(ws, r);
    assert.equal(lines.length, 3);
    assert.deepEqual(lines.map((l) => l.words.map((w) => w.raw)), [['kindergarten', 'teacher.'], ['raise'], ['hands']]);
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
    // Short gap bridged; a lone flash held to the minimum (the engine's test).
    near(lines[0].t0, 0); near(lines[0].t1, 0.65);
    near(lines[1].t0, 0.65); near(lines[1].t1, 1.1);
    near(lines[2].t0, 2.0); near(lines[2].t1, 2.45);
    // Static keeps the words' own spans.
    const st = captionLines(ws, resolveCaptions('minimal', '9:16', { anim: 'none' }));
    assert.deepEqual(st.map((l) => [l.t0, l.t1]), [[0, 0.4], [0.45, 0.7], [2.0, 2.1]]);
});

test('grouping: the style\'s word and character budget, gaps and long lines', () => {
    const nine = 'so this is the part where it gets good'.split(' ').map((w, i) => W(w, i * 0.4, i * 0.4 + 0.35));
    const lines = groupWords(nine, 4, 20, { moving: false });
    assert.deepEqual(lines.map((l) => l.length), [4, 4, 1]);
    assert.deepEqual(lines[0].map((w) => w.w), ['so', 'this', 'is', 'the']);
    // A gap over 0.6s starts a new line.
    assert.equal(groupWords([W('a', 0, 0.2), W('b', 1.0, 1.2)], 4, 20, { moving: false }).length, 2);
    // A line over 4s long is cut.
    const slow = [W('a', 0, 1), W('b', 1.1, 2), W('c', 2.1, 3), W('d', 3.1, 4.2)];
    assert.equal(groupWords(slow, 8, 99, { moving: false }).length, 2);
    // Punctuation on its own joins the word before it.
    const p = groupWords([W('hello', 0, 0.3), W('!', 0.3, 0.35), W('there', 0.4, 0.7)], 4, 20, { moving: false });
    assert.deepEqual(p[0].map((w) => w.w), ['hello!', 'there']);
    // The Look's word cap holds when short lines are folded together.
    const cap = groupWords([W('a', 0, 0.1), W('b', 0.15, 0.2), W('c', 0.25, 0.3), W('d', 0.35, 0.4)], 1, 20, { moving: true, wordCap: 2 });
    assert.ok(cap.every((l) => l.length <= 2));
    assert.deepEqual(holdLines([[W('a', 0, 0.1)]]), [[0, 0.45]]);
});

test('karaoke timing is cumulative, as libass runs \\k tags', () => {
    const ws = [W('one', 0, 0.2), W('two', 0.5, 0.7), W('three', 1.0, 1.4)];
    const [line] = captionLines(ws, resolveCaptions('karaoke', '9:16', { max_words: 3, anim: 'none' }));
    assert.deepEqual(line.words.map((w) => Math.round(w.k * 100) / 100), [0, 0.2, 0.4]);
});

// ---------------------------------------------------------------------------
// motion timings
// ---------------------------------------------------------------------------

test('pop: 84% to 105% over 110ms, settles to 100% by 200ms, fades 80/60', () => {
    let m = lineMotion('pop', 0, 1000, 1920);
    assert.deepEqual([m.opacity, m.scale, m.dy], [0, 0.84, 0]);
    close(lineMotion('pop', 110, 1000, 1920).scale, 1.05);
    close(lineMotion('pop', 155, 1000, 1920).scale, 1.025);
    assert.equal(lineMotion('pop', 200, 1000, 1920).scale, 1);
    assert.equal(lineMotion('pop', 600, 1000, 1920).opacity, 1);
    close(lineMotion('pop', 40, 1000, 1920).opacity, 0.5);
    close(lineMotion('pop', 970, 1000, 1920).opacity, 0.5); // fading out over 60ms
    m = lineMotion('words', 110, 1000, 1920);
    close(m.scale, 1.05);
});

test('bounce, fade, slide and static', () => {
    close(lineMotion('bounce', 0, 1000, 1920).scale, 0.7);
    close(lineMotion('bounce', 120, 1000, 1920).scale, 1.22);
    close(lineMotion('bounce', 210, 1000, 1920).scale, 0.94);
    close(lineMotion('bounce', 280, 1000, 1920).scale, 1.04);
    assert.equal(lineMotion('bounce', 340, 1000, 1920).scale, 1);
    const f = lineMotion('fade', 100, 1000, 1920);
    assert.deepEqual([f.scale, f.dy], [1, 0]);
    close(f.opacity, 0.5); // 200ms in
    // Slide rises 2.2% of the frame height (42px of 1920) over 260ms.
    assert.equal(lineMotion('slide', 0, 1000, 1920).dy, 42);
    close(lineMotion('slide', 130, 1000, 1920).dy, 21);
    assert.equal(lineMotion('slide', 260, 1000, 1920).dy, 0);
    close(lineMotion('slide', 80, 1000, 1920).opacity, 0.5); // fade in 160ms
    assert.deepEqual(lineMotion('none', 10, 1000, 1920), { opacity: 1, scale: 1, dy: 0 });
});

test('keyword bump and the word-by-word reveal', () => {
    assert.equal(keywordBump('pop', 400, -5), 1);
    close(keywordBump('pop', 400, 90), 1.14);
    close(keywordBump('pop', 400, 45), 1.07);
    close(keywordBump('pop', 400, 165), 1.07);
    assert.equal(keywordBump('pop', 400, 240), 1);
    // Too early in the line: the entrance has not settled.
    assert.equal(keywordBump('pop', 150, 90), 1);
    assert.equal(keywordBump('bounce', 300, 90), 1);
    assert.ok(keywordBump('bounce', 400, 90) > 1);
    // No bump without a scaling entrance.
    for (const a of ['fade', 'slide', 'none']) assert.equal(keywordBump(a, 800, 90), 1);
    // Words appear as they are spoken; the first is there from the start.
    assert.equal(wordReveal('words', 0, 0, 0), 1);
    assert.equal(wordReveal('words', 1, 400, 300), 0);
    close(wordReveal('words', 1, 400, 440), 0.5);
    assert.equal(wordReveal('words', 1, 400, 600), 1);
    assert.equal(wordReveal('pop', 1, 400, 0), 1);
});

test('the outline ring is a circle of shadows', () => {
    assert.equal(outlineRing(0, '#000'), '');
    assert.equal(outlineRing(3, '#000').split('px 0 #000').length - 1, 16);
    assert.equal(outlineRing(1, '#000').split('px 0 #000').length - 1, 8);
    assert.equal(outlineRing(6, '#000').split('px 0 #000').length - 1, 24);
});

test('the style table has all eight styles', () => {
    assert.deepEqual(Object.keys(STYLES), CAPTION_STYLES);
    assert.equal(CAPTION_STYLES.length, 8);
});
