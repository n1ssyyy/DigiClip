// Tests for the Look store and the caption-style mirror:
//   node --test scripts/look.test.mjs
// Expected numbers are derived by hand from digiclip-rs `src/captions/ass.rs`
// (and its own tests) and `src/look.rs`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    HISTORY_CAP, STORE_KEY, aspectList, applyCaptions, applyEdit, applyPatch, applySection, createLookStore, defaults, fromEngine, lookOptions,
    lookToEngine, sanitizeLook, toEngine,
} from '../src/lib/look.js';
import {
    HEADLINE_SAMPLE, barThickness, cleanBar, cleanHeadline, cleanLogo, headlineMarkup, headlineMotion, headlineText, logoClear,
    resolveBar, resolveHeadline, resolveLogo, snapAxis, snapCentre, stageHeadline,
} from '../src/lib/layers.js';
import {
    CANVASES, CAPTION_STYLES, DEFAULT_POSITIONS, STYLES, assColor, captionLines, cleanCaptions, defaultPosition, fontBox,
    groupWords, holdLines, isKeyword, keywordBump, lineMotion, outlineRing, resolveCaptions, wordReveal,
} from '../src/lib/captionStyles.js';
import {
    BACK_AT, BACK_PEAK, NO_FX, accel, backShape, blockExtent, breakRows, captionBlocks, cfgOf, easeFn, flatMeasure, frameAt, glowParams,
    lineBox, lineFx, planFor, wordFrame, wordLooks,
} from '../src/lib/captionMotion.js';
import {
    ALIGNS, BOX_PERS, EASES, ENTER_KINDS, ENTER_MS, EXIT_KINDS, EXIT_MS, FIELD_SPECS, FILLS, WORD_MODES, effectiveMotion, rangeOf,
} from '../src/lib/captionFields.js';
import {
    ALIASES, ENUM_ORDER, FIELD_SECTION, SECTION_CAP, SECTION_IDS, SECTION_PATHS, dirtySections, numSpec, numUi, sectionHasOverrides, sectionKeys,
    sectionResetPatch, sectionOf,
} from '../src/lib/captionSections.js';
import {
    activeExtraPatch, boxModePatch, captionView, clearPatch, editPatch, getPath, glowPatch, nest, shadowPatch,
} from '../src/lib/captionEffective.js';
import { blockAt, parkTime } from '../src/lib/stageTime.js';
import { PREVIEW_KEYWORD, previewBlock, previewTiming } from '../src/lib/captionPreview.js';

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
    // A font name is kept (the engine may know it); the stage draws the default until it is.
    assert.deepEqual(p.look.captions, { x: 1, outline_w: 8, box: 'none', font: 'Comic Sans' });
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
    same({ case: 'title', anim: 'spin' }, {});
    // An unknown font is kept in the Look, and drawn as the default.
    assert.equal(resolveCaptions('karaoke', '9:16', { font: 'Papyrus' }).font, resolveCaptions('karaoke', '9:16', {}).font);
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

// ---------------------------------------------------------------------------
// the headline, progress bar and logo sections: store, contract, geometry
// ---------------------------------------------------------------------------

test('headline, bar and logo are pruned like captions: empty sections are not sent', () => {
    const base = defaults(null);
    const s = createLookStore({ storage: memoryStorage() });
    s.seed(null);
    s.setHeadline({ x: 0.5, y: 0.2, card: 'none', ink: '', size: undefined });
    s.setBar({ pos: 'top', height: 1.5 });
    s.setLogo({ opacity: 0, size: 2 });
    const o = s.get().options;
    assert.deepEqual(o.look.headline, { x: 0.5, y: 0.2, card: 'none' });
    assert.deepEqual(toEngine(o).look, {
        v: 1,
        headline: { x: 0.5, y: 0.2, card: 'none' },
        bar: { pos: 'top', height: 1.5 },
        logo: { opacity: 0, size: 2 },
    });
    // Emptied again: the section leaves the Look and nothing is sent.
    s.setHeadline({ x: undefined, y: undefined, card: undefined });
    s.setBar({ pos: undefined, height: undefined });
    s.setLogo({ opacity: undefined, size: undefined });
    assert.deepEqual(s.get().options.look, { captions: {} });
    assert.deepEqual(toEngine(s.get().options), legacyToEngine(base));
    // An untouched state is exactly what it was.
    assert.deepEqual(toEngine(defaults(null)), legacyToEngine(defaults(null)));
});

test('the three sections round-trip through toEngine and fromEngine', () => {
    const look = {
        captions: {},
        headline: { x: 0.4, y: 0.75, size: 1.5, ink: '#FFFFFF', card: '#111111', accent: '#FFD400', anim: 'fade', seconds: 3 },
        bar: { pos: 'top', height: 2.5 },
        logo: { x: 0.9, y: 0.1, size: 0.6, opacity: 0.5 },
    };
    const o = { ...defaults(null), headline: true, headline_text: 'Big news', progress_bar: true, logo: 'C:\\a.png', look };
    const e = JSON.parse(JSON.stringify(toEngine(o)));
    assert.deepEqual(e.look, { v: 1, headline: look.headline, bar: look.bar, logo: look.logo });
    const back = fromEngine(e, null);
    assert.deepEqual(back.look, look);
    assert.deepEqual(toEngine(back), toEngine(o));
    // No card is a value too, and bad values are read the way look.rs reads them.
    const p = fromEngine({ look: { headline: { card: null, size: 9, anim: 'spin', ink: 'red', seconds: -2 }, bar: { pos: 'left', height: 0 }, logo: { size: 0, opacity: 4, x: -1 } } }, null);
    assert.deepEqual(p.look.headline, { card: 'none', size: 2, seconds: 0 });
    assert.deepEqual(p.look.bar, { height: 0.5 });
    assert.deepEqual(p.look.logo, { size: 0.4, opacity: 1, x: 0 });
    assert.deepEqual(cleanHeadline({ card: 'NONE', anim: 'Fade ' }), { card: 'none', anim: 'fade' });
    assert.deepEqual(cleanBar(null), {});
    assert.deepEqual(cleanLogo('x'), {});
});

test('applySection and applyEdit change several things in one result', () => {
    const d = defaults(null);
    assert.equal(applySection(d, 'logo', { x: undefined }), d);
    const n = applyEdit({ ...d, logo: 'a.png', logo_pos: 'tr', look: { captions: {}, logo: { x: 0.2, y: 0.3, size: 2 } } }, { logo_pos: 'bl' }, { logo: { x: undefined, y: undefined } });
    assert.equal(n.logo_pos, 'bl');
    assert.deepEqual(n.look.logo, { size: 2 });
    assert.equal(applyEdit(d, null, null), d);
});

test('one drag is one undo step, however long it pauses', () => {
    const c = clocked();
    const s = createLookStore({ storage: memoryStorage(), now: c.now });
    s.seed(null);
    s.setCaptions({ x: 0.3, y: 0.6 });
    c.tick(1000);
    s.beginGesture();
    for (let i = 1; i <= 40; i++) {
        s.setCaptions({ x: 0.3 + i / 100, y: 0.6 - i / 200 });
        // Pauses longer than the folding window in the middle of the drag.
        c.tick(i % 10 === 0 ? 900 : 16);
    }
    s.endGesture();
    const end = s.get().options.look.captions;
    close(end.x, 0.7);
    close(end.y, 0.4);
    // Ctrl+Z puts it back where it was before the drag.
    s.undo();
    assert.deepEqual(s.get().options.look.captions, { x: 0.3, y: 0.6 });
    s.undo();
    assert.deepEqual(s.get().options.look.captions, {});
    assert.equal(s.get().canUndo, false);
    s.redo();
    s.redo();
    close(s.get().options.look.captions.x, 0.7);
});

test('a gesture covers every layer; undo waits for it; a drag that goes nowhere leaves no step', () => {
    const c = clocked();
    const s = createLookStore({ storage: memoryStorage(), now: c.now });
    s.seed(null);
    s.beginGesture();
    s.setHeadline({ x: 0.2, y: 0.2 });
    s.setHeadline({ x: 0.4, y: 0.4 });
    s.setHeadline({ size: 1.2 });
    s.undo(); // ignored while the pointer is down
    s.redo();
    assert.deepEqual(s.get().options.look.headline, { x: 0.4, y: 0.4, size: 1.2 });
    s.endGesture();
    s.endGesture(); // harmless
    s.undo();
    assert.equal('headline' in s.get().options.look, false);
    assert.equal(s.get().canUndo, false);

    // A click that never moves, and a drag dropped where it began.
    s.redo();
    s.beginGesture();
    s.endGesture();
    s.beginGesture();
    s.setHeadline({ x: 0.9 });
    s.setHeadline({ x: 0.4 });
    s.endGesture();
    // Only the first drag is a step: undo takes the headline away again.
    assert.deepEqual(s.get().options.look.headline, { x: 0.4, y: 0.4, size: 1.2 });
    s.undo();
    assert.equal('headline' in s.get().options.look, false);
    assert.equal(s.get().canUndo, false);
    s.redo();
    s.setLogo({ x: 0.5 });
    c.tick(1000);
    s.setLogo({ x: 0.6 });
    s.undo();
    assert.equal(s.get().options.look.logo.x, 0.5);
});

test('edit changes flat options and sections as one step', () => {
    const c = clocked();
    const s = createLookStore({ storage: memoryStorage(), now: c.now });
    s.seed(null);
    s.update({ logo: 'a.png', logo_pos: 'tr' });
    c.tick(1000);
    s.setLogo({ x: 0.3, y: 0.3 });
    c.tick(1000);
    s.edit({ logo_pos: 'bl' }, { logo: { x: undefined, y: undefined } });
    assert.equal(s.get().options.logo_pos, 'bl');
    assert.equal('logo' in s.get().options.look, false);
    s.undo();
    assert.equal(s.get().options.logo_pos, 'tr');
    assert.deepEqual(s.get().options.look.logo, { x: 0.3, y: 0.3 });
});

// ---- headline geometry (ass.rs) --------------------------------------------

const HEAD = 'Why most founders quit too early';

test('headline text is sentence-cased and cut at a word, like headline_text', () => {
    assert.equal(headlineText('  the  {big}\\ *one*. ', 64), 'The big one');
    assert.equal(headlineText('the secret to growing fast is doing less of it', 30), 'The secret to growing fast');
    assert.equal(headlineText('nobody talks about this, but it changes everything', 40), 'Nobody talks about this');
    assert.equal(headlineText('Why is nobody doing this?', 44), 'Why is nobody doing this?');
    assert.equal(headlineText('{}', 48), '');
    assert.equal(stageHeadline(''), HEADLINE_SAMPLE);
    assert.equal(stageHeadline(' {} '), HEADLINE_SAMPLE);
    assert.equal(stageHeadline('Big news'), 'Big news');
    assert.equal(HEADLINE_SAMPLE, HEAD);
});

test('headline markup: two balanced lines and one accent word', () => {
    const words = (m) => m.map((l) => l.map((w) => w.text).join(' '));
    const accent = (m) => m.flat().filter((w) => w.accent).map((w) => w.text);
    let m = headlineMarkup('The secret to growing fast');
    assert.deepEqual(words(m), ['The secret to', 'growing fast']);
    assert.deepEqual(accent(m), ['secret']);
    m = headlineMarkup('I made $1 million');
    assert.deepEqual(words(m), ['I made $1 million']);
    assert.deepEqual(accent(m), ['$1']);
    m = headlineMarkup("Feel like I'm in a coffin");
    assert.deepEqual(accent(m), ['coffin']);
    // The sample: no keyword, so the longest content word.
    m = headlineMarkup(HEAD);
    assert.deepEqual(words(m), ['Why most founders', 'quit too early']);
    assert.deepEqual(accent(m), ['founders']);
});

test('headline today: a white card at the top of a 1080x1920 frame', () => {
    const r = resolveHeadline(HEAD, '9:16', {});
    assert.equal(r.font, 'Archivo Black');
    assert.equal(r.fontPx, 64);
    assert.deepEqual(r.card, { color: '#FFFFFF', pad: 24 });
    assert.equal(r.outline, null);
    assert.equal(r.ink, '#111111');
    assert.equal(r.accent, '#FF3C1E');
    assert.equal(r.block, 128);
    // MarginV 163 (8.5% of 1920) is the top of the type; the card's middle follows.
    assert.equal(r.wrapW, 900);
    assert.equal(r.placed, false);
    assert.equal(r.cx, 540);
    assert.equal(r.cy, 227);
    assert.deepEqual(r.center, { x: 0.5, y: 227 / 1920 });
    assert.equal(r.anim, 'pop');
    assert.equal(r.seconds, 0);
    assert.equal(resolveHeadline('{}', '9:16', {}), null);
});

test('headline size scales the type and the card padding together', () => {
    let r = resolveHeadline(HEAD, '9:16', { size: 1.5 });
    assert.deepEqual([r.fontPx, r.card.pad], [96, 36]);
    r = resolveHeadline(HEAD, '9:16', { size: 0.5 });
    assert.deepEqual([r.fontPx, r.card.pad], [32, 12]);
    r = resolveHeadline(HEAD, '9:16', { size: 9 }); // clamped to 2
    assert.equal(r.fontPx, 128);
});

test('headline colours, no card and the outline rule', () => {
    let r = resolveHeadline(HEAD, '9:16', { ink: '#ffffff', card: '#111111', accent: '#FFD400' });
    assert.deepEqual([r.ink, r.card.color, r.accent], ['#FFFFFF', '#111111', '#FFD400']);
    r = resolveHeadline(HEAD, '9:16', { card: 'none' });
    assert.equal(r.card, null);
    assert.equal(r.ink, '#FFFFFF');
    assert.deepEqual(r.outline, { color: '#000000', width: 5 });
    assert.equal(r.accent, '#FF3C1E');
    r = resolveHeadline(HEAD, '9:16', { card: 'none', size: 2 });
    assert.deepEqual([r.fontPx, r.outline.width], [128, 10]);
    r = resolveHeadline(HEAD, '9:16', { card: 'none', ink: '#FFD400' });
    assert.deepEqual([r.ink, r.outline.color], ['#FFD400', '#000000']);
    // A dark ink gets a light edge.
    r = resolveHeadline(HEAD, '9:16', { card: 'none', ink: '#101010' });
    assert.deepEqual([r.ink, r.outline.color], ['#101010', '#FFFFFF']);
});

test('a placed headline is anchored by its centre and kept inside the frame', () => {
    const at = (look) => {
        const r = resolveHeadline(HEAD, '9:16', look);
        return [r.cx, r.cy, r.margin];
    };
    assert.deepEqual(at({ x: 0.5, y: 0.7 }), [540, 1344, 90]);
    assert.deepEqual(at({ x: 0.35, y: 0.2 }), [378, 384, 252]);
    // Hard against an edge the centre is nudged in so words still fit.
    assert.deepEqual(at({ x: 0.02, y: 0.5 }), [306, 960, 324]);
    assert.deepEqual(at({ x: 1, y: 0.5 }), [774, 960, 324]);
    // One coordinate: the other is the middle (x) or where it sits today (y).
    assert.deepEqual(at({ y: 0.25 }), [540, 480, 90]);
    assert.deepEqual(at({ x: 0.5 }), [540, 227, 90]);
    assert.equal(resolveHeadline(HEAD, '9:16', { x: 0.5 }).placed, true);
    // The whole card stays on the frame, top and bottom.
    assert.deepEqual(at({ x: 0.5, y: 0 }), [540, 88, 90]);
    assert.deepEqual(at({ x: 0.5, y: 1 }), [540, 1832, 90]);
    // The wrapped text never leaves the frame, wherever x is.
    for (let i = 0; i <= 20; i++) {
        const r = resolveHeadline(HEAD, '9:16', { x: i / 20, y: 0.5 });
        const half = 540 - r.margin;
        assert.ok(r.cx - half >= 89 && r.cx + half <= 991, `x ${i / 20}`);
    }
    // A square frame scales the type by 0.9 (size 1.3: 75 px type, 28 px padding).
    const r = resolveHeadline(HEAD, '1:1', { x: 0.5, y: 0.7, size: 1.3, card: '#111111' });
    assert.deepEqual([r.fontPx, r.card.pad, r.cx, r.cy], [75, 28, 540, 756]);
});

test('a corner logo widens the default headline margin only', () => {
    const clear = { top: true, left: false, px: 260 };
    let r = resolveHeadline(HEAD, '9:16', {}, { clear });
    // MarginL 90, MarginR 260: the text is centred in what is left.
    assert.deepEqual([r.wrapW, r.cx], [1080 - 90 - 260, 90 + (1080 - 350) / 2]);
    r = resolveHeadline(HEAD, '9:16', { size: 1.2 }, { clear });
    assert.equal(r.wrapW, 730);
    r = resolveHeadline(HEAD, '9:16', { x: 0.5, y: 0.12 }, { clear });
    // Placed: the usual side margins, the logo is not made room for.
    assert.equal(r.margin, 90);
    assert.equal(r.cx, 540);
    r = resolveHeadline(HEAD, '9:16', {}, { clear: { top: false, left: false, px: 260 } });
    assert.equal(r.wrapW, 900);
    // The clearance of a real corner logo (pipeline.rs): its width, inset and a gap.
    assert.deepEqual(logoClear(resolveLogo('9:16', 'tl', {}, null)), { top: true, left: true, px: 152 + 43 + 27 });
    assert.equal(logoClear(resolveLogo('9:16', 'tl', { x: 0.2 }, null)), null);
    assert.equal(logoClear(null), null);
});

test('headline motion: pop, fade, none and a limited time on screen', () => {
    const r = (look) => resolveHeadline(HEAD, '9:16', look);
    const pop = r({});
    close(headlineMotion(pop, 0, 9000).opacity, 0);
    close(headlineMotion(pop, 0, 9000).scale, 0.72);
    close(headlineMotion(pop, 80, 9000).opacity, 0.5);
    close(headlineMotion(pop, 200, 9000).scale, 1.06);
    close(headlineMotion(pop, 270, 9000).scale, 1.03);
    assert.deepEqual(headlineMotion(pop, 1000, 9000), { opacity: 1, scale: 1 });
    const fade = r({ anim: 'fade' });
    assert.deepEqual(headlineMotion(fade, 100, 9000), { opacity: 0.5, scale: 1 });
    assert.deepEqual(headlineMotion(r({ anim: 'none' }), 0, 9000), { opacity: 1, scale: 1 });
    // Three seconds of a nine second clip, then a 200 ms fade out inside them.
    const timed = r({ anim: 'none', seconds: 3 });
    assert.deepEqual(headlineMotion(timed, 2800, 9000), { opacity: 1, scale: 1 });
    close(headlineMotion(timed, 2900, 9000).opacity, 0.5);
    assert.equal(headlineMotion(timed, 3000, 9000), null);
    // Never past the clip, and no fade when it lasts the whole clip.
    assert.equal(headlineMotion(r({ seconds: 20 }), 8999, 9000).opacity, 1);
    assert.equal(headlineMotion(r({ seconds: 20 }), 9000, 9000), null);
    assert.equal(headlineMotion(r({ seconds: 0 }), 5000, 9000).opacity, 1);
});

// ---- progress bar (compose.rs) ---------------------------------------------

test('bar thickness follows the engine on every canvas', () => {
    assert.equal(barThickness('9:16', 1), 12);
    assert.equal(barThickness('1:1', 1), 8);
    assert.equal(barThickness('16:9', 1), 8);
    assert.equal(barThickness('4:5', 1), 8); // 1350 * 0.0065 = 8.8 -> 8
    assert.equal(barThickness('9:16', 2), 24);
    assert.equal(barThickness('9:16', 0.5), 6);
    assert.equal(barThickness('1:1', 0.5), 4);
    assert.equal(barThickness('1:1', 3), 24);
    // Always even.
    for (const c of Object.keys(CANVASES)) for (const h of [0.5, 0.75, 1, 1.3, 2, 3]) assert.equal(barThickness(c, h) % 2, 0);
});

test('the bar sits on the bottom or the top edge and fills in even pixels', () => {
    let b = resolveBar('9:16', '#00ff88', {});
    assert.deepEqual([b.top, b.y, b.thickness, b.color], [false, 1908, 12, '#00FF88']);
    b = resolveBar('9:16', '', { pos: 'top', height: 2 });
    assert.deepEqual([b.top, b.y, b.thickness, b.color], [true, 0, 24, '#FFD400']);
    b = resolveBar('1:1', '#FFD400', { pos: 'bottom', height: 3 });
    assert.deepEqual([b.y, b.thickness], [1080 - 24, 24]);
    b = resolveBar('16:9', '#FFD400', {});
    assert.deepEqual([b.w, b.y], [1920, 1072]);
    assert.deepEqual([0, 0.5, 1, 2, -1, NaN].map((p) => b.fill(p)), [0, 960, 1920, 1920, 0, 0]);
    assert.equal(resolveBar('9:16', '#FFD400', {}).fill(1 / 3), 360);
    close(resolveBar('9:16', '#FFD400', {}).center.y, 1914 / 1920);
    close(resolveBar('9:16', '#FFD400', { pos: 'top' }).center.y, 6 / 1920);
});

// ---- logo (render.rs) ------------------------------------------------------

test('logo box: 14% of the short side tall, 26% wide, whatever the shape', () => {
    assert.deepEqual(resolveLogo('9:16', 'tr', {}, null).box, { w: 152, h: 152 });
    assert.deepEqual(resolveLogo('9:16', 'tr', {}, { w: 800, h: 200 }).box, { w: 280, h: 70 });
    assert.deepEqual(resolveLogo('9:16', 'tr', {}, { w: 100, h: 200 }).box, { w: 76, h: 152 });
    assert.deepEqual(resolveLogo('9:16', 'tr', { size: 2.5 }, { w: 4, h: 1 }).box, { w: 702, h: 176 });
    assert.deepEqual(resolveLogo('9:16', 'tr', { size: 0.4 }, null).box, { w: 60, h: 60 });
    // The short side counts, so 16:9 and 1:1 have the same box as 9:16.
    assert.deepEqual(resolveLogo('16:9', 'tr', {}, null).box, { w: 152, h: 152 });
});

test('logo corners keep the engine\'s insets; bottom corners sit higher', () => {
    const at = (canvas, corner) => {
        const r = resolveLogo(canvas, corner, {}, null);
        return [r.x, r.y];
    };
    assert.deepEqual(at('9:16', 'tl'), [43, 67]);
    assert.deepEqual(at('1:1', 'tr'), [1080 - 152 - 43, 38]);
    assert.deepEqual(at('16:9', 'bl'), [77, 1080 - 152 - 76]);
    assert.deepEqual(at('4:5', 'br'), [1080 - 152 - 43, 1350 - 152 - 94]);
    assert.equal(resolveLogo('9:16', 'zz', {}, null).corner, 'tr');
    assert.equal(resolveLogo('9:16', 'tl', {}, null).free, false);
    assert.equal(resolveLogo('9:16', 'tl', {}, null).opacity, 0.9);
    assert.equal(resolveLogo('9:16', 'tl', { opacity: 0.456 }, null).opacity, 0.46);
    assert.equal(resolveLogo('9:16', 'tl', { opacity: 3 }, null).opacity, 1);
});

test('a free logo is centred on its point and wins over the corner', () => {
    const o = (look, nat = null) => {
        const r = resolveLogo('9:16', 'bl', look, nat);
        return [r.x, r.y];
    };
    assert.deepEqual(o({ x: 0.5, y: 0.5 }), [464, 884]);
    assert.deepEqual(o({ x: 0.25 }), [194, 884]);
    assert.deepEqual(o({ y: 0.1 }), [464, 116]);
    assert.deepEqual(o({ x: 0.5, y: 0.5 }, { w: 4, h: 1 }), [400, 926]);
    assert.equal(resolveLogo('9:16', 'bl', { y: 0.1 }, null).free, true);
    const c = resolveLogo('9:16', 'bl', { x: 0.5, y: 0.5 }, null).center;
    assert.deepEqual(c, { x: 0.5, y: 960 / 1920 });
});

test('a free logo never leaves the frame', () => {
    assert.equal(resolveLogo('9:16', 'tr', { x: 0, y: 0 }, null).x, 0);
    let r = resolveLogo('9:16', 'tr', { x: 1, y: 1 }, null);
    assert.deepEqual([r.x, r.y], [928, 1768]);
    r = resolveLogo('9:16', 'tr', { size: 2.5, x: 1, y: 0.5 }, { w: 4, h: 1 });
    assert.deepEqual([r.box.w, r.box.h, r.x, r.y], [702, 176, 378, 872]);
    for (const canvas of Object.keys(CANVASES)) {
        const { w, h } = CANVASES[canvas];
        for (const aspect of [1, 4, 0.5]) {
            for (const size of [0.4, 1, 2.5]) {
                for (const [x, y] of [[0, 0], [1, 1], [0, 1], [1, 0], [0.5, 0.01]]) {
                    const l = resolveLogo(canvas, 'tr', { size, x, y }, { w: aspect * 100, h: 100 });
                    assert.ok(l.x + l.box.w <= w && l.y + l.box.h <= h, `${canvas} ${aspect} ${size}`);
                    assert.ok(l.x % 2 === 0 && l.y % 2 === 0 && l.x >= 0 && l.y >= 0);
                }
            }
        }
    }
});

// ---- snapping --------------------------------------------------------------

test('snapping pulls the centre to the middle lines and the 5% margins', () => {
    assert.deepEqual(snapAxis(0.51, 0.1, 0.02), { v: 0.5, guide: 0.5 });
    assert.deepEqual(snapAxis(0.2, 0.1, 0.02), { v: 0.2, guide: null });
    assert.deepEqual(snapAxis(0.055, 0.1, 0.01), { v: 0.05, guide: 0.05 });
    assert.deepEqual(snapAxis(0.945, 0.1, 0.01), { v: 0.95, guide: 0.95 });
    // The box's edge snaps to the margin too, and the guide is the margin line.
    const e = snapAxis(0.148, 0.1, 0.01);
    close(e.v, 0.15);
    assert.equal(e.guide, 0.05);
    // The nearest one wins.
    assert.equal(snapAxis(0.498, 0.3, 0.01).guide, 0.5);
    // Both axes; Alt (free) leaves the point alone.
    assert.deepEqual(snapCentre(0.51, 0.949, { x: 0.1, y: 0.05 }, { x: 0.02, y: 0.02 }), { x: 0.5, y: 0.95, guideX: 0.5, guideY: 0.95 });
    assert.deepEqual(snapCentre(0.51, 0.949, { x: 0.1, y: 0.05 }, { x: 0.02, y: 0.02 }, true), { x: 0.51, y: 0.949, guideX: null, guideY: null });
});

// ===========================================================================
// the v2 ("full control") caption fields
//
// Expected numbers come from digiclip-rs: its tests in `captions/ass.rs` and
// `captions/motion.rs`, and the ranges in `look.rs`. The sample words are the
// engine tests' own: "so I made 3 million dollars last year. Never stop
// building", 0.4 s apart, each 0.35 s long.
// ===========================================================================

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const nearAll = (a, b, eps = 1e-6) => a.forEach((x, i) => near(x, b[i], eps));
const rnd6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : Array.isArray(v) ? v.map(rnd6) : v);
const deepNear = (a, b) => assert.deepEqual(rnd6(a), rnd6(b));
const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const WHITE = [255, 255, 255];
const YELLOW = [255, 255, 0];

/** A caption look on a style: the resolved style, its blocks and plans. */
function rig(style, captions, { canvas = '9:16', words = SAMPLE, measure = flatMeasure(), flat = {} } = {}) {
    const r = resolveCaptions(style, canvas, captions, flat);
    const cfg = cfgOf(r);
    const blocks = captionBlocks(words, r, measure);
    const plan = (i = 0) => planFor(cfg, r, blocks[i], measure);
    return { r, cfg, blocks, plan, measure };
}
/** The static minimal rig the engine's word tests use: line 1 is "so I made 3", 0 to 1.55 s. */
const st = (words) => rig('minimal', { anim: 'none', words });
const word = (plan, text) => plan.words.find((w) => w.text === text);
const at = (plan, text, t) => wordFrame(word(plan, text).fx, t);

// ---- the store: set, read, clear, prune, undo --------------------------------------------

test('nested v2 fields are set, read and cleared through the store, and emptied objects vanish', () => {
    const s = createLookStore({ storage: memoryStorage() });
    s.seed(null);
    const caps = () => s.get().options.look.captions;
    s.setCaptions({ glow: { size: 20, color: '#00E5FF' }, spacing: 0.08, align: 'left' });
    assert.deepEqual(caps(), { glow: { size: 20, color: '#00E5FF' }, spacing: 0.08, align: 'left' });
    // A nested patch merges field by field...
    s.setCaptions({ glow: { strength: 0.5 } });
    assert.deepEqual(caps().glow, { size: 20, color: '#00E5FF', strength: 0.5 });
    // ...and a field set to nothing goes.
    s.setCaptions({ glow: { color: undefined, strength: '' } });
    assert.deepEqual(caps().glow, { size: 20 });
    s.setCaptions({ glow: { size: null } });
    assert.equal('glow' in caps(), false, 'an object left empty disappears');
    // Deep: words.active.box.radius
    s.setCaptions({ words: { active: { box: { radius: 1 }, scale: 1.2 }, mode: 'build' } });
    assert.deepEqual(caps().words, { active: { box: { radius: 1 }, scale: 1.2 }, mode: 'build' });
    s.setCaptions({ words: { active: { box: { radius: undefined } } } });
    assert.deepEqual(caps().words, { active: { scale: 1.2 }, mode: 'build' });
    s.setCaptions({ words: { active: { scale: undefined }, mode: undefined } });
    assert.equal('words' in caps(), false);
    // A field cleared whole, and the cleared fields leave the engine's options.
    s.setCaptions({ enter: { kind: 'bounce', ms: 300 }, exit: { kind: 'blur' } });
    assert.deepEqual(toEngine(s.get().options).look.captions, { spacing: 0.08, align: 'left', enter: { kind: 'bounce', ms: 300 }, exit: { kind: 'blur' } });
    s.setCaptions({ enter: undefined, exit: undefined, spacing: undefined, align: undefined });
    assert.deepEqual(caps(), {});
    assert.equal('look' in toEngine(s.get().options), false);
    // A patch that changes nothing is no step and no notice.
    s.setCaptions({ rotate: -6 });
    const before = s.get();
    s.setCaptions({ rotate: -6, glow: { size: undefined } });
    assert.equal(s.get(), before);
});

test('box and shadow take both forms, and switching forms is one undo step', () => {
    const c = clocked();
    const s = createLookStore({ storage: memoryStorage(), now: c.now });
    s.seed(null);
    const caps = () => s.get().options.look.captions;
    s.setCaptions({ box: '#101010', shadow: 3 });
    assert.deepEqual(caps(), { box: '#101010', shadow: 3 });
    c.tick(5000);
    // v1 -> object: the object replaces the colour (it does not merge into a string).
    s.setCaptions({ box: { radius: 1, per: 'word' }, shadow: { x: 3, blur: 6 } });
    assert.deepEqual(caps(), { box: { radius: 1, per: 'word' }, shadow: { x: 3, blur: 6 } });
    s.undo();
    assert.deepEqual(caps(), { box: '#101010', shadow: 3 }, 'one step back to both v1 forms');
    s.redo();
    c.tick(5000);
    // object -> v1.
    s.setCaptions({ box: 'none', shadow: 2 });
    assert.deepEqual(caps(), { box: 'none', shadow: 2 });
    s.undo();
    assert.deepEqual(caps(), { box: { radius: 1, per: 'word' }, shadow: { x: 3, blur: 6 } });
    // What the engine gets: either form, nothing else.
    assert.deepEqual(toEngine(s.get().options).look.captions, { box: { radius: 1, per: 'word' }, shadow: { x: 3, blur: 6 } });
    s.setCaptions({ box: undefined, shadow: undefined });
    assert.deepEqual(caps(), {});
});

test('a slider over a nested field is one undo step; another field is another step', () => {
    const c = clocked();
    const s = createLookStore({ storage: memoryStorage(), now: c.now });
    s.seed(null);
    for (let i = 0; i < 10; i++) {
        s.setCaptions({ glow: { size: 10 + i } });
        c.tick(30);
    }
    s.setCaptions({ glow: { strength: 0.4 } });
    s.setCaptions({ glow: { strength: 0.5 } });
    assert.deepEqual(s.get().options.look.captions.glow, { size: 19, strength: 0.5 });
    s.undo();
    assert.deepEqual(s.get().options.look.captions.glow, { size: 19 }, 'the strength drag is one step');
    s.undo();
    assert.equal('glow' in s.get().options.look.captions, false, 'the size drag is one step');
    assert.equal(s.get().canUndo, false);
    // A gesture over a nested field is one step too.
    s.beginGesture();
    for (let i = 0; i < 5; i++) s.setCaptions({ words: { active: { lift: i / 50 } } });
    s.endGesture();
    s.undo();
    assert.equal('words' in s.get().options.look.captions, false);
    // And edit() with nested sections is one step.
    s.edit({ style: 'neon' }, { captions: { stroke: { width: 6 } } });
    assert.deepEqual([s.get().options.style, s.get().options.look.captions.stroke], ['neon', { width: 6 }]);
    s.undo();
    assert.deepEqual([s.get().options.style, 'stroke' in s.get().options.look.captions], ['karaoke', false]);
});

test('the engine gets only real values, nested; sanitizeLook keeps and cleans the v2 fields', () => {
    const look = {
        captions: {
            glow: { color: '#00e5ff', size: 20, strength: undefined },
            stroke: {},
            shadow: { x: 3, y: NaN, blur: '' },
            box: { color: '', opacity: 0.5 },
            words: { active: { stroke: { width: 4 }, glow: {} }, keyword: {} },
            enter: { kind: 'bounce' },
        },
    };
    assert.deepEqual(lookToEngine(look), {
        v: 1,
        captions: { glow: { color: '#00e5ff', size: 20 }, shadow: { x: 3 }, box: { opacity: 0.5 }, words: { active: { stroke: { width: 4 } } }, enter: { kind: 'bounce' } },
    });
    // Read back from a preset: ranges clamped, colours upper-case, bad things absent.
    const back = sanitizeLook({
        captions: {
            spacing: 5, line_gap: 0.1, lines: 7, max_chars: 2, align: 'Centre', rotate: -99,
            stroke: { color: '#abcdef', width: 99 }, shadow: { x: 99, y: -99, blur: 99, opacity: 9 }, glow: { size: 99, strength: 9, color: 'red' },
            box: { pad_x: 900, per: 'Paragraph', radius: 9, opacity: -1 },
            words: { mode: 'sideways', fill: 'sweep', upcoming: { lift: 0.2, opacity: 3 }, active: { lift: 5, rotate: 99, scale: 0.1, blur: 5 }, keyword: { scale: 9 }, hold_ms: -4, release_ease: 'wobble' },
            enter: { kind: 'zoom', ms: 99999, ease: 'back' }, exit: { kind: 'spin', ms: 99999 },
        },
    }).captions;
    assert.deepEqual(back, {
        spacing: 0.3, line_gap: 0.8, lines: 2, max_chars: 6, align: 'center', rotate: -15,
        stroke: { color: '#ABCDEF', width: 12 }, shadow: { x: 30, y: -30, blur: 20, opacity: 1 }, glow: { size: 40, strength: 1 },
        box: { pad_x: 60, radius: 1, opacity: 0 },
        words: { fill: 'sweep', upcoming: { opacity: 1 }, active: { lift: 0.3, rotate: 10, scale: 0.5 }, keyword: { scale: 1.5 }, hold_ms: 0 },
        enter: { kind: 'zoom', ms: 800, ease: 'back' }, exit: { ms: 600 },
    });
    // Both forms survive the round trip through the engine's options.
    for (const caps of [{ box: '#101010', shadow: 4 }, { box: 'none' }, { box: { radius: 0.5, per: 'word' }, shadow: { y: 6 } }]) {
        const o = { ...defaults(null), look: { captions: caps } };
        assert.deepEqual(fromEngine(toEngine(o)).look.captions, caps);
    }
});

test('every field has its range and values in one place, and the cleaner agrees with it', () => {
    // The engine's ranges (look.rs).
    const engine = {
        spacing: [-0.05, 0.3], line_gap: [0.8, 1.6], lines: [1, 2], max_chars: [6, 40], rotate: [-15, 15],
        'stroke.width': [0, 12], 'shadow.x': [-30, 30], 'shadow.y': [-30, 30], 'shadow.blur': [0, 20], 'shadow.opacity': [0, 1],
        'glow.size': [0, 40], 'glow.strength': [0, 1], 'box.opacity': [0, 1], 'box.pad_x': [0, 60], 'box.pad_y': [0, 60], 'box.radius': [0, 1],
        'words.attack_ms': [0, 400], 'words.hold_ms': [0, 600], 'words.release_ms': [0, 2000],
        'words.upcoming.opacity': [0, 1], 'words.upcoming.scale': [0.5, 1.5], 'words.upcoming.blur': [0, 10],
        'words.active.opacity': [0, 1], 'words.active.scale': [0.5, 1.5], 'words.active.lift': [-0.3, 0.3], 'words.active.rotate': [-10, 10],
        'words.active.stroke.width': [0, 12], 'words.active.glow.size': [0, 40], 'words.active.glow.strength': [0, 1],
        'words.active.box.opacity': [0, 1], 'words.active.box.radius': [0, 1],
        'words.spoken.opacity': [0, 1], 'words.spoken.scale': [0.5, 1.5], 'words.spoken.blur': [0, 10],
        'words.keyword.scale': [0.5, 1.5], 'words.keyword.glow.size': [0, 40], 'words.keyword.glow.strength': [0, 1],
        'enter.ms': [0, 800], 'exit.ms': [0, 600],
    };
    const nest = (path, v) => path.split('.').reduceRight((acc, k) => ({ [k]: acc }), v);
    const read = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
    for (const [path, [lo, hi]] of Object.entries(engine)) {
        assert.deepEqual(rangeOf(path), [lo, hi], path);
        assert.equal(FIELD_SPECS[path].type, 'number', path);
        near(read(cleanCaptions(nest(path, lo - 1000)), path), lo, 1e-9);
        near(read(cleanCaptions(nest(path, hi + 1000)), path), hi, 1e-9);
    }
    // Enums.
    assert.deepEqual(ENTER_KINDS, ['none', 'pop', 'fade', 'slide_up', 'slide_down', 'slide_left', 'slide_right', 'zoom', 'bounce', 'blur', 'drop']);
    assert.deepEqual(EXIT_KINDS, ['none', 'fade', 'slide_up', 'slide_down', 'zoom', 'blur']);
    assert.deepEqual([EASES, ALIGNS, WORD_MODES, FILLS, BOX_PERS], [['linear', 'out', 'in', 'back'], ['left', 'center', 'right'], ['all', 'build', 'single'], ['snap', 'sweep'], ['line', 'word']]);
    for (const [path, spec] of Object.entries(FIELD_SPECS)) {
        if (spec.type !== 'enum') continue;
        for (const v of spec.values) assert.deepEqual(read(cleanCaptions(nest(path, v)), path), v, path);
        assert.equal(read(cleanCaptions(nest(path, 'wobble')), path), undefined, path);
    }
    // Every spec path is a field of the section: its cleaned value is not dropped.
    for (const [path, spec] of Object.entries(FIELD_SPECS)) {
        const v = spec.type === 'number' ? spec.min : spec.type === 'enum' ? spec.values[0] : '#112233';
        assert.notEqual(read(cleanCaptions(nest(path, v)), path), undefined, path);
    }
    // Defaults the engine fills in.
    assert.deepEqual([FIELD_SPECS['glow.size'].def, FIELD_SPECS['glow.strength'].def], [12, 0.8]);
    assert.deepEqual(['shadow.y', 'shadow.blur', 'shadow.opacity'].map((p) => FIELD_SPECS[p].def), [4, 4, 0.6]);
    assert.deepEqual(['box.pad_x', 'box.pad_y'].map((p) => FIELD_SPECS[p].def), [16, 8]);
});

test('any v2 field switches to the word model; the v1 forms and junk do not', () => {
    const wl = (c) => resolveCaptions('karaoke', '9:16', c).wordLevel;
    for (const c of [
        { spacing: 0.1 }, { line_gap: 1.2 }, { lines: 2 }, { max_chars: 20 }, { align: 'left' }, { rotate: 3 }, { stroke: { width: 4 } },
        { shadow: { x: 3 } }, { glow: { size: 10 } }, { box: { radius: 1 } }, { words: { active: { glow: { size: 9 } } } }, { words: { keyword: { glow: { size: 9 } } } },
        { words: { mode: 'single' } }, { enter: { kind: 'fade' } }, { exit: { kind: 'fade' } },
    ]) assert.equal(wl(c), true, JSON.stringify(c));
    for (const c of [
        {}, { box: '#101010' }, { box: 'none' }, { shadow: 4 }, { outline: '#FF0000', outline_w: 5 }, { max_words: 2 }, { anim: 'bounce' },
        { glow: { size: 'big' } }, { glow: {} }, { box: { radius: 'round' } }, { stroke: 5 }, { align: 'middle' }, { spacing: 'wide' },
        { words: {} }, { enter: {}, exit: {} }, { words: { mode: 'sideways', fill: 'wipe', upcoming: { color: 'red' } } },
    ]) assert.equal(wl(c), false, JSON.stringify(c));
});

// ---- resolving the dressing -------------------------------------------------------------------

test('stroke object wins over the v1 outline; a box object steps the style\'s box aside; a shadow object replaces its shadow', () => {
    const rs = (style, c, canvas = '9:16') => resolveCaptions(style, canvas, c);
    // Both given: the object's colour and width, and it is the text's stroke too.
    let r = rs('karaoke', { outline: '#FF0000', outline_w: 5, stroke: { color: '#00FF00', width: 9 } });
    assert.deepEqual([r.outline, r.base.stroke], [{ color: '#00FF00', width: 9 }, { color: '#00FF00', w: 9 }]);
    // Half given: the other half comes from v1, then the style.
    r = rs('karaoke', { outline: '#FF0000', stroke: { width: 7 } });
    assert.deepEqual(r.base.stroke, { color: '#FF0000', w: 7 });
    r = rs('karaoke', { stroke: { color: '#336699' } });
    assert.deepEqual(r.base.stroke, { color: '#336699', w: 3 });
    assert.equal(rs('karaoke', { stroke: { width: 99 } }).base.stroke.w, 12);
    // Scaled with the canvas (0.9 on a square one).
    near(rs('karaoke', { stroke: { width: 10 } }, '1:1').base.stroke.w, 9, 1e-9);
    // The style's box is its outline slot: no stroke under it.
    r = rs('hormozi', {});
    assert.deepEqual([!!r.box, r.base.stroke.w], [true, 0]);
    // A box object replaces it: the shape takes the style's colour, no stroke is invented.
    r = rs('hormozi', { box: { radius: 0.3 } });
    assert.deepEqual([r.box, r.base.stroke.w, r.base.boxCol], [null, 0, '#000000']);
    assert.equal(rs('highlight', { box: { radius: 0.3 } }).base.boxCol, '#A3E635');
    // A v1 colour is still a libass box, "none" still removes it.
    assert.equal(rs('karaoke', { box: '#101010' }).box.color, '#101010');
    assert.equal(rs('hormozi', { box: 'none' }).box, null);
    // A colour from the v1 field is the shape's default; opacity from v1 too.
    r = rs('karaoke', { box: { radius: 1 } });
    assert.equal(r.base.boxCol, null);
    assert.equal(cfgOf(rs('karaoke', { box: { radius: 1 }, box_opacity: 0.5 })).boxfx.opacity, 0.5);
    assert.deepEqual(cfgOf(rs('karaoke', { box: { color: '#00FF00' }, box_opacity: 0.5 })).boxfx.col, GREEN);
    // The shadow object takes the style's own shadow off; the v1 number keeps it.
    assert.equal(rs('minimal', { shadow: { blur: 2 } }).shadow, 0);
    assert.equal(rs('minimal', { shadow: 4 }).shadow, 4);
    assert.equal(rs('minimal', {}).shadow, 1);
});

test('shadow, glow, box and stroke objects map onto what the engine draws', () => {
    // Shadow: defaults black, x 0, y 4, blur 4, opacity 0.6; px scale with the canvas.
    let c = cfgOf(resolveCaptions('karaoke', '9:16', { shadow: { x: 1 } }));
    assert.deepEqual(c.shadow, { col: [0, 0, 0], x: 1, y: 4, blur: 4, opacity: 0.6 });
    c = cfgOf(resolveCaptions('karaoke', '1:1', { shadow: { color: '#102030', x: 6, y: 8, blur: 8, opacity: 0.6 } }));
    near(c.k, 0.9);
    assert.deepEqual(c.shadow.col, [16, 32, 48]);
    nearAll([c.shadow.x, c.shadow.y, c.shadow.blur, c.shadow.opacity], [5.4, 7.2, 7.2, 0.6]);
    // Glow: a copy grown by 0.55 x size and blurred by 0.6 x size (engine: size 20 on a 3 px stroke is a 14 px border, blur 12; size 40 blurs by 24).
    assert.deepEqual(glowParams(20, 3), { border: 14, blur: 12 });
    near(glowParams(40).blur, 24);
    // Glow defaults: size 12, strength 0.8, the letters' own colour...
    const look = (cap, kw) => wordLooks(cfgOf(resolveCaptions('neon', '9:16', cap)), kw);
    let [up, act, spk] = look({ glow: {} , spacing: 0 });
    assert.deepEqual([up.glow.size, up.glow.strength], [0, 0], 'no glow object, no glow');
    [up, act, spk] = look({ glow: { size: 10 } });
    assert.deepEqual([act.glow.size, act.glow.strength], [10, 0.8]);
    assert.deepEqual([up.glow.col, act.glow.col], [WHITE, [0, 255, 255]]);
    // ...or white when they are dark (highlight sings in black).
    [up, act] = wordLooks(cfgOf(resolveCaptions('highlight', '9:16', { glow: { size: 10 } })), false);
    assert.deepEqual([up.glow.col, act.glow.col], [WHITE, WHITE]);
    // Layers stack: the caption's glow, the spoken word's on it, the keywords' on both; a keyword keeps its glow once spoken.
    const stack = { glow: { color: '#FFFFFF', size: 10, strength: 0.5 }, words: { active: { glow: { color: '#00E5FF', size: 20 } }, keyword: { glow: { color: '#FF00FF', strength: 1 } } } };
    [up, act, spk] = look(stack, false);
    assert.deepEqual([up.glow, act.glow, spk.glow], [
        { col: WHITE, size: 10, strength: 0.5 }, { col: [0, 229, 255], size: 20, strength: 0.5 }, { col: WHITE, size: 10, strength: 0.5 },
    ]);
    [up, act, spk] = look(stack, true);
    assert.deepEqual([act.glow, spk.glow], [{ col: [255, 0, 255], size: 20, strength: 1 }, { col: [255, 0, 255], size: 10, strength: 1 }]);
    // Box: pads default 16 x 8, radius 0, perWord from "per"; the spoken word's box inherits the shape's radius and pads.
    c = cfgOf(resolveCaptions('karaoke', '9:16', { box: { per: 'word' }, words: { active: { box: {} } } }));
    assert.deepEqual([c.boxfx.padX, c.boxfx.padY, c.boxfx.radius, c.boxfx.perWord], [16, 8, 0, true]);
    c = cfgOf(resolveCaptions('karaoke', '9:16', { box: { pad_x: 20, pad_y: 10, radius: 0.5 }, words: { active: { box: { color: '#FFD400', opacity: 0.25 } } } }));
    assert.deepEqual([c.abox.col, c.abox.radius, c.abox.padX, c.abox.padY, c.act.abox], [[255, 212, 0], 0.5, 20, 10, 0.25]);
    // The spoken word's own stroke is the caption's with its fields on top.
    c = cfgOf(resolveCaptions('karaoke', '9:16', { words: { active: { stroke: { color: '#FFFFFF', width: 8 } } } }));
    assert.deepEqual([c.act.stroke, c.up.stroke, c.strokeMax], [{ col: WHITE, w: 8 }, { col: [0, 0, 0], w: 3 }, 8]);
    // Spacing is a share of the type size: 0.1 em of an 84 px face is 8.4 px, -0.05 em is -4.2.
    near(cfgOf(resolveCaptions('karaoke', '9:16', { spacing: 0.1 })).spacing, 8.4);
    near(cfgOf(resolveCaptions('karaoke', '9:16', { spacing: -0.05 })).spacing, -4.2);
});

// ---- the word timeline ----------------------------------------------------------------------------

test('easing: the engine\'s curves, and the two-step shape of ease back', () => {
    for (const e of EASES) {
        near(easeFn(e, 0), 0);
        near(easeFn(e, 1), 1);
    }
    assert.ok(easeFn('out', 0.25) > 0.25 && easeFn('in', 0.25) < 0.25);
    near(easeFn('out', 0.25), 0.5);
    near(easeFn('in', 0.25), 0.0625);
    near(easeFn('linear', 0.25), 0.25);
    // Back peaks at 58% of the time, 10% past the target.
    near(easeFn('back', BACK_AT), 1 + BACK_PEAK, 0.01);
    near(backShape(BACK_AT), 1.1, 1e-9);
    near(backShape(0), 0);
    near(backShape(1), 1);
    // ...the \t accelerations the engine writes: out 0.5, in 2, linear 1.
    assert.deepEqual(['out', 'in', 'linear', 'back'].map(accel), [0.5, 2, 1, 1]);
    near(backShape(0.29), 1.1 * 0.5 ** 0.4, 1e-9);
});

test('a word\'s timeline lands on the attack, hold and release the engine writes', () => {
    // "I" is spoken 400..750 in a static line 0..1.55. Attack 200 from the start (400..600), hold 100 past the end (850), release 500 (850..1350).
    const { plan } = st({ upcoming: { opacity: 0.5 }, spoken: { opacity: 0.25 }, attack_ms: 200, attack_ease: 'linear', hold_ms: 100, release_ms: 500, release_ease: 'linear' });
    const p = plan();
    const op = (t) => at(p, 'I', t).op;
    // Before its start, mid-attack, active, in the hold, mid-release, spoken.
    for (const [t, v] of [[0, 0.5], [399, 0.5], [400, 0.5], [500, 0.75], [600, 1], [700, 1], [800, 1], [849, 1], [850, 1], [1100, 0.625], [1349, 0.2515], [1350, 0.25], [1500, 0.25]]) near(op(t), v, 0.001);
    // The line (and its words) ends at 1.55: "3" is the last word, its attack is cut off by the line, its release never starts.
    deepNear(word(p, '3').win, [0, 1550]);
    near(at(p, '3', 1300).op, 0.75, 0.001);
    // Without hold the release starts at the word's end.
    const q = st({ upcoming: { opacity: 0.5 }, spoken: { opacity: 0.25 }, release_ms: 500, release_ease: 'linear' }).plan();
    deepNear(word(q, 'I').tails, [750, 1250]);
    near(at(q, 'I', 1000).op, 0.625, 1e-9);
    // An attack longer than the word holds the release back until it is done.
    const l = st({ upcoming: { opacity: 0.5 }, spoken: { opacity: 0.25 }, attack_ms: 400, attack_ease: 'linear', release_ms: 100, release_ease: 'linear' }).plan();
    deepNear(word(l, 'I').tails, [800, 900]);
    near(at(l, 'I', 600).op, 0.75, 1e-9);
    near(at(l, 'I', 850).op, 0.625, 1e-9);
    // Defaults: attack 0 (80 in build), hold 0, release 0, eases out.
    const d = st({}).cfg;
    assert.deepEqual([d.attack, d.hold, d.release, d.attackEase, d.releaseEase], [0, 0, 0, 'out', 'out']);
    assert.equal(st({ mode: 'build' }).cfg.attack, 80);
    assert.equal(st({ mode: 'build', attack_ms: 0 }).cfg.attack, 0);
});

test('state fields switch at the word\'s start and back at its end', () => {
    const g0 = st({
        upcoming: { color: '#112233', scale: 0.8, blur: 3, opacity: 0.5 },
        active: { color: '#FF0000', scale: 1.2, lift: 0.1, rotate: 5, stroke: { width: 6 }, glow: { size: 20, strength: 1 }, box: { opacity: 0.5 } },
        spoken: { color: '#00FF00', scale: 1.5, blur: 2, opacity: 0.25 },
    });
    const p = g0.plan();
    const b0 = g0.r.base.stroke.w;
    const s = (t) => at(p, 'I', t);
    let f = s(300);
    assert.deepEqual(f.col, [17, 34, 51]);
    nearAll([f.sc, f.blur, f.op, f.lift, f.rot, f.sw, f.gs, f.gk, f.bo], [0.8, 3, 0.5, 0, 0, b0, 0, 0, 0]);
    f = s(500);
    assert.deepEqual(f.col, RED);
    nearAll([f.sc, f.blur, f.op, f.lift, f.rot, f.sw, f.gs, f.gk, f.bo], [1.2, 0, 1, 0.1, 5, 6, 20, 1, 0.5]);
    f = s(800);
    assert.deepEqual(f.col, GREEN);
    nearAll([f.sc, f.blur, f.op, f.lift, f.rot, f.sw, f.gs, f.gk, f.bo], [1.5, 2, 0.25, 0, 0, b0, 0, 0, 0]);
    // The step is at the start: the moment before it the word is still upcoming.
    assert.deepEqual(s(399.9).col, [17, 34, 51]);
    assert.deepEqual(s(400).col, RED);
    // Lift and tilt belong to the active look only: the spoken word sits down.
    assert.deepEqual([at(p, 'so', 200).lift, at(p, 'so', 600).lift], [0.1, 0]);
});

test('a release overlaps the next word\'s attack', () => {
    // "so" ends at 350 and trails for 600 ms; "I" is lit from 400.
    const p = st({ active: { color: '#FF0000' }, spoken: { color: '#00FF00' }, release_ms: 600, release_ease: 'linear' }).plan();
    deepNear(word(p, 'so').tails, [350, 950]);
    nearAll(at(p, 'so', 650).col, [127.5, 127.5, 0]);
    assert.deepEqual(at(p, 'I', 650).col, RED);
    assert.deepEqual(at(p, 'so', 950).col, GREEN);
    // Both are on screen over the same moments: they share the line's span.
    deepNear([word(p, 'so').win, word(p, 'I').win], [[0, 1550], [0, 1550]]);
});

test('every ease is a power curve, or the two-step back', () => {
    const run = (ease) => st({ active: { color: '#FF0000', scale: 1.2 }, spoken: { color: '#00FF00', scale: 1 }, hold_ms: 100, release_ms: 500, release_ease: ease }).plan();
    // The release of "I": 850..1350. A quarter of the way in.
    const quarter = (ease) => at(run(ease), 'I', 975);
    near(quarter('linear').sc, 1.2 - 0.2 * 0.25);
    near(quarter('out').sc, 1.2 - 0.2 * 0.5);
    near(quarter('in').sc, 1.2 - 0.2 * 0.0625);
    nearAll(quarter('out').col, [255 * 0.5, 255 * 0.5, 0]);
    // Back: colour just eases out; the scale runs 10% past its target (98 for 120 -> 100) 58% of the way (1140), and settles.
    const back = run('back');
    near(at(back, 'I', 1140).sc, 0.98, 1e-9);
    nearAll(at(back, 'I', 975).col, [255 * 0.5, 255 * 0.5, 0]);
    near(at(back, 'I', 1350).sc, 1);
    near(at(back, 'I', 1245).sc, 0.98 + (1 - 0.98) * 0.5, 1e-9, 'the settle is a straight line');
    // The same on the way in (opacity eases out under back).
    const att = (ease) => at(st({ upcoming: { opacity: 0.5 }, attack_ms: 200, attack_ease: ease }).plan(), 'I', 450);
    near(att('linear').op, 0.5 + 0.5 * 0.25);
    near(att('out').op, 0.5 + 0.5 * 0.5);
    near(att('in').op, 0.5 + 0.5 * 0.0625);
    near(att('back').op, att('out').op);
    near(att('wobble').op, att('out').op, 1e-9, 'an unknown ease is the default, out');
    // An overshoot on the way in: scale runs past the target and settles.
    const sc = st({ active: { scale: 1.2 }, attack_ms: 200, attack_ease: 'back' }).plan();
    near(at(sc, 'I', 400 + 200 * BACK_AT).sc, 1 + 0.2 * 1.1, 1e-9);
    // A ramp that shares its time with others moving (a lift) is sampled from the smooth curve instead.
    const lift = st({ active: { scale: 1.2, lift: 0.1 }, attack_ms: 200, attack_ease: 'back' }).plan();
    near(at(lift, 'I', 400 + 200 * BACK_AT).sc, 1 + 0.2 * easeFn('back', BACK_AT), 1e-9);
});

test('snap turns active at once; a sweep runs left to right over the word\'s own time', () => {
    const { plan } = st({ fill: 'sweep', active: { color: '#FF0000' }, attack_ms: 200 });
    const p = plan();
    const frame = (t, w = 'I') => frameAt(p, t).groups[0].words.find((x) => x.i === word(p, w).i);
    // "I" is spoken 400..750: unswept, half swept, done.
    let f = frame(399);
    assert.deepEqual([f.col, f.sweep], [WHITE, null]);
    f = frame(575);
    assert.deepEqual([f.under, f.col], [WHITE, RED]);
    near(f.sweep, 0.5);
    f = frame(750);
    assert.deepEqual([f.col, f.sweep], [RED, null]);
    // The attack is ignored by a sweep: the colour is not tweened (halfway through a 200 ms attack the sweep is at 0.29).
    near(frame(500).sweep, 100 / 350);
    // The first word of a line starts its sweep at once.
    near(frame(175, 'so').sweep, 0.5);
    // Snap: no sweep, the colour is the track's.
    const snap = st({ active: { color: '#FF0000' } }).plan();
    const g = frameAt(snap, 575).groups[0].words.find((x) => x.i === word(snap, 'I').i);
    assert.deepEqual([g.col, g.sweep], [RED, null]);
    // Nothing to sweep when the colour does not change.
    const same = st({ fill: 'sweep', active: { color: '#FFFFFF' } }).plan();
    const h = frameAt(same, 575).groups[0].words.find((x) => x.i === word(same, 'I').i);
    assert.deepEqual([h.col, h.sweep], [WHITE, null]);
    // Reduced motion snaps it.
    const hard = frameAt(p, 575, { reduced: true }).groups[0].words.find((x) => x.i === word(p, 'I').i);
    assert.deepEqual([hard.col, hard.sweep], [RED, null]);
});

test('modes: all, build and single', () => {
    const vis = (plan, t) => frameAt(plan, t).groups.flatMap((g) => g.words.map((w) => plan.words[w.i].text));
    const a = st({ mode: 'all', upcoming: { opacity: 0.5 } }).plan();
    assert.deepEqual(vis(a, 100), ['so', 'I', 'made', '3']);
    near(at(a, 'I', 100).op, 0.5);
    // Build: a word is not there before it is spoken, and comes in at its own start (80 ms from nothing).
    const b = st({ mode: 'build' }).plan();
    assert.deepEqual(vis(b, 100), ['so']);
    assert.deepEqual(vis(b, 450), ['so', 'I']);
    assert.deepEqual(vis(b, 1000), ['so', 'I', 'made']);
    deepNear(word(b, 'I').win, [400, 1550]);
    deepNear(word(b, 'made').win, [800, 1550]);
    near(at(b, 'I', 400).op, 0);
    near(at(b, 'I', 440).op, Math.sqrt(0.5), 1e-9);
    near(at(b, 'I', 480).op, 1);
    // ...and the slots are the whole line's from the start: "so" does not move when later words arrive.
    assert.deepEqual(word(b, 'so').pos, st({ mode: 'all' }).plan().words[0].pos);
    // Single: one word at a time, each up until the next one starts, all at the same spot.
    const s = st({ mode: 'single' }).plan();
    deepNear(['so', 'I', 'made', '3'].map((w) => word(s, w).win), [[0, 400], [400, 800], [800, 1200], [1200, 1550]]);
    assert.deepEqual(vis(s, 100), ['so']);
    assert.deepEqual(vis(s, 500), ['I']);
    assert.deepEqual(vis(s, 1400), ['3']);
    assert.deepEqual(vis(s, 1600), []);
    assert.deepEqual(word(s, 'so').pos, word(s, 'I').pos);
    // A spoken look that is invisible clears the word when its release ends.
    const c1 = st({ mode: 'single', spoken: { opacity: 0 }, release_ms: 100, release_ease: 'linear' }).plan();
    deepNear(word(c1, 'so').win, [0, 400]);
    const c2 = st({ mode: 'single', spoken: { opacity: 0 }, release_ms: 20, release_ease: 'linear' }).plan();
    deepNear(word(c2, 'so').win, [0, 370]);
    // Only one word is ever on screen, however the windows fall.
    for (let t = 0; t < 1600; t += 7) assert.ok(vis(s, t).length <= 1, String(t));
    // Single mode puts every word through the line's entrance on its own.
    const e = rig('minimal', { anim: 'none', words: { mode: 'single' }, enter: { kind: 'fade', ms: 100, ease: 'linear' } }).plan();
    assert.equal(frameAt(e, 450).groups[0].fx.alpha, 0.5);
    assert.equal(frameAt(e, 50).groups[0].fx.alpha, 0.5);
});

test('keywords light in their colour and scale by the keyword scale', () => {
    // "million" opens line 2 (spoken 1.60 to 1.95) and is a keyword; "dollars" is not. Static minimal: line 2 is "million dollars last year.".
    const k = (words, cap = {}) => {
        const g = rig('minimal', { anim: 'none', ...cap, words });
        const p = g.plan(1);
        return { p, f: (w, t) => wordFrame(word(p, w).fx, t) };
    };
    // The style's accent (yellow for minimal) replaces the active colour, and is what stays once spoken.
    let { f } = k({ active: { color: '#FF0000' } });
    assert.deepEqual([f('million', 1700).col, f('million', 2100).col], [YELLOW, YELLOW]);
    assert.deepEqual([f('dollars', 2100).col, f('dollars', 2500).col], [RED, RED]);
    // The v1 accent is the default keyword colour; the v2 colour beats it.
    ({ f } = k({ active: { color: '#FF0000' } }, { accent: '#00FF00' }));
    assert.deepEqual(f('million', 1700).col, GREEN);
    ({ f } = k({ keyword: { color: '#FF00FF' }, active: { color: '#FF0000' } }, { accent: '#00FF00' }));
    assert.deepEqual(f('million', 1700).col, [255, 0, 255]);
    // An explicit spoken colour wins over the keyword colour once spoken.
    ({ f } = k({ spoken: { color: '#888888' } }));
    assert.deepEqual([f('million', 1700).col, f('million', 2000).col], [YELLOW, [136, 136, 136]]);
    // Keyword scale multiplies the active and the spoken scale.
    ({ f } = k({ keyword: { scale: 1.3 } }));
    near(f('million', 1700).sc, 1.3);
    ({ f } = k({ keyword: { scale: 1.5 }, active: { scale: 1.2 }, spoken: { scale: 0.8 } }));
    nearAll([f('million', 1700).sc, f('million', 2100).sc, f('dollars', 2100).sc], [1.8, 1.2, 1.2]);
    // Today's bump stays with the pop entrance: 14% up in 90 ms, back in 150 more, when the word starts after the entrance settled (and not with a keyword scale).
    const bump = (cap) => {
        const g = rig('minimal', cap);
        const p = g.plan(0);
        return (t) => wordFrame(word(p, '3').fx, t).sc;
    };
    const b = bump({ words: { upcoming: { opacity: 0.9 } } });
    nearAll([b(1200), b(1245), b(1290), b(1365), b(1440), b(1500)], [1, 1.07, 1.14, 1.07, 1, 1]);
    const noBump = (cap) => bump(cap)(1290);
    near(noBump({ words: { keyword: { scale: 1.1 } } }), 1.1);
    near(noBump({ anim: 'fade', words: { upcoming: { opacity: 0.9 } } }), 1);
    near(noBump({ enter: { kind: 'bounce' }, words: { upcoming: { opacity: 0.9 } } }), 1.14);
    near(noBump({ enter: { kind: 'slide_up' }, words: { upcoming: { opacity: 0.9 } } }), 1);
});

test('per-style defaults: upcoming is the unsung colour, active the sung, spoken keeps the active', () => {
    for (const id of CAPTION_STYLES) {
        const cfg = cfgOf(resolveCaptions(id, '9:16', { words: { mode: 'all' } }));
        const hex = (c) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        assert.equal(hex(cfg.up.color), STYLES[id].color, id);
        assert.equal(hex(cfg.act.color), STYLES[id].active, id);
        assert.equal(hex(cfg.spk.color), STYLES[id].active, id);
        assert.equal(hex(cfg.kwColor), STYLES[id].accent, id);
        assert.deepEqual([cfg.up, cfg.act, cfg.spk].map((l) => [l.opacity, l.scale, l.blur, l.lift, l.rotate]), [[1, 1, 0, 0, 0], [1, 1, 0, 0, 0], [1, 1, 0, 0, 0]], id);
        assert.deepEqual(cfg.up.stroke.w, STYLES[id].border === 3 ? 0 : STYLES[id].outlineW, id);
    }
    // The Look's colours are the sung / unsung ones: `active` over `color`.
    const c = cfgOf(resolveCaptions('beast', '9:16', { color: '#102030', active: '#FF0000', words: { mode: 'all' } }));
    assert.deepEqual([c.up.color, c.act.color, c.spk.color], [[16, 32, 48], RED, RED]);
    assert.deepEqual(cfgOf(resolveCaptions('beast', '9:16', { color: '#102030', words: { mode: 'all' } })).act.color, [16, 32, 48]);
    // Blur is px on a 1080-wide canvas: a square one scales it.
    near(cfgOf(resolveCaptions('beast', '1:1', { words: { upcoming: { blur: 10 } } })).up.blur, 9);
});

test('v1 anim maps onto mode and motion, and the v2 fields win', () => {
    const m = (anim, cap = {}) => effectiveMotion(cap, anim);
    assert.deepEqual(m('pop'), { enter: { kind: 'pop', ms: 200, ease: null }, exit: { kind: 'fade', ms: 60 } });
    assert.deepEqual(m('bounce'), { enter: { kind: 'bounce', ms: 340, ease: null }, exit: { kind: 'fade', ms: 60 } });
    assert.deepEqual(m('slide'), { enter: { kind: 'slide_up', ms: 260, ease: 'linear' }, exit: { kind: 'fade', ms: 60 } });
    assert.deepEqual(m('fade'), { enter: { kind: 'fade', ms: 200, ease: 'linear' }, exit: { kind: 'fade', ms: 140 } });
    assert.deepEqual(m('words'), m('pop'));
    assert.deepEqual(m('none').enter.kind, 'none');
    assert.deepEqual(m('none').exit.kind, 'none');
    // words -> build mode with the pop; an explicit mode beats it; the entrance stays.
    const mode = (anim, w = {}) => cfgOf(resolveCaptions('minimal', '9:16', { anim, words: { upcoming: { opacity: 0.9 }, ...w } })).mode;
    assert.deepEqual([mode('words'), mode('words', { mode: 'all' }), mode('pop'), mode('none'), mode('slide')], ['build', 'all', 'all', 'all', 'all']);
    // The flat option means the same; the Look's own words beat it.
    const flatMode = (flat, w) => cfgOf(resolveCaptions('minimal', '9:16', { words: w }, { anim: flat })).mode;
    assert.deepEqual([flatMode('words', { upcoming: { opacity: 0.9 } }), flatMode('words', { mode: 'all' })], ['build', 'all']);
    // v2 enter beats the shorthand's, kind by kind: a new kind brings its own time, ease and shape.
    assert.deepEqual(m('slide', { enter: { kind: 'fade' } }).enter, { kind: 'fade', ms: 200, ease: null });
    assert.deepEqual(m('slide', { enter: { kind: 'zoom' } }).enter, { kind: 'zoom', ms: 240, ease: null });
    // A time alone keeps the shorthand's kind (and ease).
    assert.deepEqual(m('slide', { enter: { ms: 400 }, exit: { ms: 300 } }), { enter: { kind: 'slide_up', ms: 400, ease: 'linear' }, exit: { kind: 'fade', ms: 300 } });
    // Each kind's own time and the exit's.
    assert.deepEqual(ENTER_KINDS.map((k) => ENTER_MS[k]), [0, 200, 200, 260, 260, 260, 260, 240, 340, 240, 320]);
    assert.deepEqual(EXIT_KINDS.map((k) => EXIT_MS[k]), [0, 140, 200, 200, 200, 200]);
    // A kind with no time is none.
    assert.deepEqual(m('pop', { enter: { kind: 'zoom', ms: 0 }, exit: { kind: 'fade', ms: 0 } }), m('none', { enter: { kind: 'none' }, exit: { kind: 'none' } }).enter.kind === 'none' ? { enter: { kind: 'none', ms: 0, ease: null }, exit: { kind: 'none', ms: 0 } } : null);
    // A static shorthand with word looks keeps the static grouping: the lines run exactly the words' span.
    const g = rig('minimal', { anim: 'none', words: { upcoming: { opacity: 0.9 } } });
    deepNear([g.blocks[0].t0, g.blocks[0].t1], [0, 1.55]);
    // ...and the motion that moves holds and merges lines as the line writer does.
    assert.ok(rig('minimal', { words: { upcoming: { opacity: 0.9 } } }).blocks[0].t1 > 1.55 - 1e-9);
});

// ---- the line's entrance and exit -------------------------------------------------------------------------

/** The line motion of the first block of the minimal rig at `t` ms, with `enter` / `exit` given. */
function motionAt(cap, t, canvas = '9:16') {
    const g = rig('minimal', { anim: 'none', ...cap }, { canvas });
    const p = g.plan();
    return { fx: lineFx(p.lwin, t), g, p };
}

test('every entrance kind starts where it should and ends at rest', () => {
    const en = (kind) => ({ enter: { kind, ms: 300, ease: 'linear' } });
    const first = (kind, t = 0) => motionAt(en(kind), t).fx;
    const none = first('none');
    assert.deepEqual(none, NO_FX);
    // pop 0.84, zoom 0.6, bounce 0.7: the line starts smaller.
    near(first('pop').sc, 0.84);
    near(first('zoom').sc, 0.6);
    near(first('bounce').sc, 0.7);
    // fade and blur start clear; blur starts soft (8 px at 1080 wide).
    assert.equal(first('fade').alpha, 0);
    assert.deepEqual([first('blur').blur, first('blur').alpha], [8, 0]);
    // Slides start 2.2% of the frame height lower / higher, 4% of its width right / left (1920 x 0.022 = 42.24, 1080 x 0.04 = 43.2).
    near(first('slide_up').dy, 42.24);
    near(first('slide_down').dy, -42.24);
    near(first('slide_left').dx, 43.2);
    near(first('slide_right').dx, -43.2);
    // Drop starts 6% of the height above.
    near(first('drop').dy, -115.2);
    // Middle of the way, linear: slides halfway, zoom at 0.8, pop at 0.92.
    near(first('slide_up', 150).dy, 21.12);
    near(first('zoom', 150).sc, 0.8);
    near(first('pop', 150).sc, 0.92);
    // The entrance is over in the time given.
    for (const k of ENTER_KINDS) assert.deepEqual(first(k, 300), NO_FX, k);
    for (const k of ENTER_KINDS) assert.deepEqual(first(k, 1000), NO_FX, k);
    // A square canvas: the same shares of its own size, the blur scaled with the type (k = 0.9).
    near(motionAt(en('slide_up'), 0, '1:1').fx.dy, 1080 * 0.022);
    near(motionAt(en('blur'), 0, '1:1').fx.blur, 7.2);
    // Each kind's own fade: pop and bounce 80 ms, slides 160, zoom 150, drop 100, fade / blur the whole time.
    const alpha = (kind, ms, t) => motionAt({ enter: { kind, ms } }, t).fx.alpha;
    near(alpha('pop', 200, 40), 0.5);
    near(alpha('bounce', 340, 80), 1);
    near(alpha('slide_up', 260, 80), 0.5);
    near(alpha('zoom', 240, 75), 0.5);
    near(alpha('drop', 320, 50), 0.5);
    near(alpha('slide_up', 100, 50), 0.5, 1e-9, 'a fade is never longer than the entrance');
    // The built-in shapes: pop's keyframes (0.84, 1.05 at 55%, 1) and bounce's.
    const sc = (kind, u, ms = 200) => motionAt({ enter: { kind, ms } }, u * ms).fx.sc;
    nearAll([sc('pop', 0), sc('pop', 0.55), sc('pop', 1 - 1e-9), sc('pop', 0.275)], [0.84, 1.05, 1, 0.945], 1e-6);
    nearAll([sc('bounce', 0, 340), sc('bounce', 0.353, 340), sc('bounce', 0.618, 340), sc('bounce', 0.824, 340), sc('bounce', 0.5, 340)], [0.7, 1.22, 0.94, 1.04, 1.22 + (0.94 - 1.22) * ((0.5 - 0.353) / (0.618 - 0.353))], 1e-6);
    // Bounce ignores the ease; pop with an ease is a plain ramp from 84%.
    near(motionAt({ enter: { kind: 'bounce', ms: 200, ease: 'in' } }, 0.353 * 200).fx.sc, 1.22);
    near(motionAt({ enter: { kind: 'pop', ms: 200, ease: 'linear' } }, 100).fx.sc, 0.92);
    near(motionAt({ enter: { kind: 'pop', ms: 200, ease: 'out' } }, 50).fx.sc, 0.84 + 0.16 * 0.5);
});

test('the entrance ease shapes the travel', () => {
    // How far a slide has come a quarter of the way in.
    const travelled = (ease) => 1 - motionAt({ enter: { kind: 'slide_up', ms: 400, ease } }, 100).fx.dy / (1920 * 0.022);
    const [lin, out, inn] = ['linear', 'out', 'in'].map(travelled);
    near(lin, 0.25);
    near(out, 0.5);
    near(inn, 0.0625);
    // The default ease of a slide is out; of a fade, linear.
    near(1 - motionAt({ enter: { kind: 'slide_up', ms: 400 } }, 100).fx.dy / (1920 * 0.022), 0.5);
    near(motionAt({ enter: { kind: 'fade', ms: 400 } }, 100).fx.alpha, 0.25);
    near(motionAt({ enter: { kind: 'fade', ms: 400, ease: 'out' } }, 100).fx.alpha, 0.5);
    // Back runs past the end and settles: a rising slide goes above its rest place.
    const dys = [];
    for (let t = 0; t <= 400; t += 10) dys.push(motionAt({ enter: { kind: 'slide_up', ms: 400, ease: 'back' } }, t).fx.dy);
    assert.ok(dys.some((y) => y < -0.5), 'overshoots');
    near(Math.min(...dys), (1920 * 0.022) * (1 - 1.1), 0.2);
    assert.ok(dys.every((y, i) => i === 0 || y <= dys[0] + 1e-9));
    // Drop: the default ease is back, so it overshoots (falls past, then settles).
    const drop = [];
    for (let t = 0; t <= 320; t += 10) drop.push(motionAt({ enter: { kind: 'drop' } }, t).fx.dy);
    assert.ok(drop.some((y) => y > 1), 'a drop falls past its rest place');
    near(drop[0], -115.2);
    // Zoom and blur use out by default.
    near(motionAt({ enter: { kind: 'zoom', ms: 400 } }, 100).fx.sc, 0.6 + 0.4 * 0.5);
    near(motionAt({ enter: { kind: 'blur', ms: 400 } }, 100).fx.blur, 8 * 0.5);
});

test('every exit kind ends where it should', () => {
    // The fx a block has `before` ms ahead of its end (a moving line's end is where its exit finishes).
    const ex = (kind, ms, before) => {
        const p = rig('minimal', { anim: 'none', exit: { kind, ms } }).plan();
        return lineFx(p.lwin, p.l1 - before);
    };
    deepNear([ex('none', 200, 1).alpha], [1]);
    assert.deepEqual(ex('fade', 100, 150), NO_FX, 'nothing before the exit starts');
    // fade: ending clear exactly at the line's end.
    nearAll([ex('fade', 100, 100).alpha, ex('fade', 100, 50).alpha, ex('fade', 100, 0).alpha], [1, 0.5, 0], 1e-9);
    // zoom shrinks to 60%, blur to 8 px, slides 2.2% of the height (squared: slow, then quick).
    const z = ex('zoom', 200, 0);
    nearAll([z.sc, z.alpha], [0.6, 0], 1e-9);
    near(ex('zoom', 200, 100).sc, 1 - 0.4 * 0.25);
    const bl = ex('blur', 200, 0);
    nearAll([bl.blur, bl.alpha], [8, 0], 1e-9);
    near(ex('blur', 200, 100).blur, 4);
    near(ex('slide_up', 200, 0).dy, -42.24);
    near(ex('slide_down', 200, 0).dy, 42.24);
    near(ex('slide_up', 200, 100).dy, -42.24 * 0.25);
    // A longer exit starts earlier.
    assert.ok(ex('fade', 400, 300).alpha < 1 && ex('fade', 100, 300).alpha === 1);
    // Entrance and exit compose on a long line: the exit has not begun at the entrance's middle.
    const both = motionAt({ enter: { kind: 'zoom', ms: 200, ease: 'linear' }, exit: { kind: 'zoom', ms: 200 } }, 100);
    near(both.fx.sc, 0.8);
    // The v1 pop's fade out is 60 ms.
    near(effectiveMotion({}, 'pop').exit.ms, 60);
});

// ---- grouping, rows, slots --------------------------------------------------------------------------------------

const LONG = 'so I made 3 million dollars last year. Never stop building the best thing ever'.split(' ').map((w, i) => ({ w, s: i * 0.4, e: i * 0.4 + 0.35 }));
const text = (b) => b.words.map((w) => w.text).join(' ');

test('max_chars is a hard limit per block, and max_words still caps the word count', () => {
    for (const n of [6, 12, 20, 40]) {
        for (const anim of ['pop', 'none']) {
            const { blocks } = rig('karaoke', { max_chars: n, anim }, { words: LONG });
            assert.ok(blocks.length > 0);
            for (const b of blocks) assert.ok([...text(b)].length <= n || b.words.length === 1, `${n} ${anim} ${text(b)}`);
        }
    }
    // Fewer characters, more blocks; the style's own budget (karaoke: 3 words) is out of the way when max_chars is set.
    const count = (n) => rig('karaoke', { max_chars: n }, { words: LONG }).blocks.length;
    assert.ok(count(8) > count(40));
    assert.ok(rig('karaoke', { max_chars: 40 }, { words: LONG, }).blocks.some((b) => b.words.length > 3));
    assert.equal(rig('karaoke', { max_chars: 40 }, { words: LONG }).r.maxWords, 8);
    assert.equal(rig('karaoke', { max_chars: 40, max_words: 2 }, { words: LONG }).r.maxWords, 2);
    for (let n = 1; n <= 8; n++) {
        const { blocks } = rig('minimal', { max_words: n, enter: { kind: 'fade' } }, { words: LONG });
        assert.ok(blocks.every((b) => b.words.length <= n), String(n));
    }
    // A single word longer than the budget is its own block.
    const wide = rig('karaoke', { max_chars: 6 }, { words: [{ w: 'extraordinary', s: 0, e: 1 }, { w: 'ok', s: 1, e: 1.5 }] }).blocks;
    assert.deepEqual(wide.map(text), ['EXTRAORDINARY', 'OK']);
});

test('lines: 1 never wraps and lines: 2 stays in two rows', () => {
    const cap = { max_chars: 40, max_words: 8, size: 1.6, anim: 'none' };
    const one = rig('karaoke', { ...cap, lines: 1 }, { words: LONG });
    const two = rig('karaoke', { ...cap, lines: 2 }, { words: LONG });
    for (let i = 0; i < one.blocks.length; i++) assert.equal(one.plan(i).rows.length, 1, text(one.blocks[i]));
    for (let i = 0; i < two.blocks.length; i++) assert.ok(two.plan(i).rows.length <= 2, text(two.blocks[i]));
    // The same text with room for two rows needs fewer blocks, and some of them use both rows.
    assert.ok(two.blocks.length < one.blocks.length, `${two.blocks.length} ${one.blocks.length}`);
    assert.ok(two.blocks.some((b, i) => two.plan(i).rows.length === 2));
    // Without `lines` a long block just wraps as it needs to.
    const free = rig('karaoke', { ...cap }, { words: LONG });
    assert.ok(free.blocks.some((b, i) => free.plan(i).rows.length > 2) || free.blocks.length <= two.blocks.length);
    // One row stays one row however wide it is.
    const w = rig('karaoke', { lines: 1, size: 2, max_chars: 40, max_words: 8 }, { words: LONG });
    for (let i = 0; i < w.blocks.length; i++) assert.equal(w.plan(i).rows.length, 1);
    // Out of range clamps.
    assert.equal(resolveCaptions('karaoke', '9:16', { lines: 9 }).clean.lines, 2);
    assert.equal(resolveCaptions('karaoke', '9:16', { lines: 0 }).clean.lines, 1);
    // Single mode is never cut.
    const s = rig('karaoke', { words: { mode: 'single' }, lines: 1, max_chars: 40 }, { words: LONG });
    assert.deepEqual(s.blocks.map((b) => b.words.length), rig('karaoke', { words: { mode: 'single' }, max_chars: 40 }, { words: LONG }).blocks.map((b) => b.words.length));
});

test('rows break as evenly as the fewest rows allow', () => {
    // From motion.rs: four 300 px words in 700 px, a gap of 20.
    assert.deepEqual(breakRows([300, 300, 300, 300], 20, 700), [[0, 2], [2, 4]]);
    assert.deepEqual(breakRows([100, 100], 20, 700), [[0, 2]]);
    // A word wider than the room still gets a row of its own.
    assert.deepEqual(breakRows([900, 100], 20, 700), [[0, 1], [1, 2]]);
    assert.deepEqual(breakRows([], 20, 700), [[0, 0]]);
    assert.deepEqual(breakRows([50], 20, 700), [[0, 1]]);
    // Three rows are as even as they can be.
    const rows = breakRows([200, 100, 400, 100, 200, 300], 10, 700);
    assert.ok(rows.length >= 2);
    for (const [a, b] of rows) assert.ok([200, 100, 400, 100, 200, 300].slice(a, b).reduce((s, x) => s + x, 0) + 10 * (b - a - 1) <= 700.5);
});

test('every word keeps a slot for the biggest look it ever takes, so a neighbour never moves', () => {
    const cap = { anim: 'none', words: { active: { scale: 1.4, rotate: 3, lift: 0.1 }, spoken: { scale: 1.2 }, attack_ms: 200, release_ms: 300 } };
    const g = rig('minimal', cap);
    const p = g.plan();
    const m = g.measure;
    const widths = p.words.map((w) => m(w.text, g.r.font, g.r.fontPx).w);
    // The slot is the width times the biggest scale (1.4, or 1.4 x the keyword's 1 for "3": a keyword has no scale of its own).
    p.words.forEach((w, i) => near(w.slot, widths[i] * 1.4, 1e-9));
    // Neighbours sit slot-centre to slot-centre with a space (at the biggest size) between: nothing depends on what a word does.
    for (let i = 0; i + 1 < p.words.length; i++) near(p.words[i + 1].pos[0] - p.words[i].pos[0], (p.words[i].slot + p.words[i + 1].slot) / 2 + p.sp, 1e-9);
    // One row, centred on the anchor.
    near((p.rows[0].x0 + p.rows[0].width / 2), g.r.anchor.x, 1e-9);
    // Wherever the playhead is, only the look changes: the slots the frames use are the plan's.
    const xs = p.words.map((w) => w.pos.slice());
    for (let t = 0; t < 1600; t += 25) frameAt(p, t);
    assert.deepEqual(p.words.map((w) => w.pos), xs);
    // The room is the same for every word however the others look: the same text laid out with no scales sits tighter.
    const tight = rig('minimal', { anim: 'none', words: { mode: 'all' } }).plan();
    assert.ok(p.blockW > tight.blockW);
    // A bigger keyword scale reserves room for the keyword only.
    const kw = rig('minimal', { anim: 'none', words: { keyword: { scale: 1.5 } } }).plan();
    near(word(kw, '3').slot, widths[3] * 1.5, 1e-9);
    near(word(kw, 'made').slot, widths[2], 1e-9);
    // Row breaks are decided on the slots: a line that wraps wraps the same way for its whole life.
    const wrap = rig('minimal', { anim: 'none', size: 2, words: { active: { scale: 1.5 }, spoken: { scale: 1.25 }, release_ms: 200 } }, { words: LONG });
    const q = wrap.plan();
    assert.ok(q.rows.length >= 2, 'a 128 px line of four words wraps');
    assert.deepEqual(new Set(q.rows.map((r) => r.cy)).size, q.rows.length);
});

test('a wrapped block is centred on its anchor; rows sit against the edge the align says', () => {
    // Bottom-anchored: the block's last row sits on the anchor, the block grows upward.
    const one = rig('minimal', { anim: 'none', words: { mode: 'all' } }).plan();
    const two = rig('minimal', { anim: 'none', size: 2, words: { mode: 'all' } }, { words: LONG });
    const p2 = two.plan(1);
    assert.ok(p2.rows.length >= 2);
    near(one.top + one.blockH, two.r.anchor.y, 1e-9);
    near(p2.top + p2.blockH, two.r.anchor.y, 1e-9);
    // Centred anchor (a placed caption): the block's middle is the point.
    const pg = rig('minimal', { anim: 'none', x: 0.5, y: 0.3, size: 2, words: { mode: 'all' } }, { words: LONG });
    assert.equal(pg.r.anchor.mode, 'middle');
    near(pg.plan(1).centre[1], pg.r.anchor.y, 1e-9);
    // Rows: left, right, centre.
    const rows = (align) => rig('karaoke', { max_words: 6, max_chars: 40, size: 1.25, anim: 'none', align }, { words: LONG }).plan();
    const [l, c, r] = ['left', 'center', 'right'].map(rows);
    assert.ok(l.rows.length >= 2, String(l.rows.length));
    near(l.rows[0].x0, l.rows[1].x0, 1e-9);
    near(r.rows[0].x0 + r.rows[0].width, r.rows[1].x0 + r.rows[1].width, 1e-9);
    assert.ok(Math.abs(c.rows[0].x0 - c.rows[1].x0) > 5 && Math.abs(c.rows[0].x0 + c.rows[0].width - c.rows[1].x0 - c.rows[1].width) > 5);
    // The block keeps its place: the widest row spans the same extent however its rows sit.
    const span = (p) => [Math.min(...p.rows.map((x) => x.x0)), Math.max(...p.rows.map((x) => x.x0 + x.width))];
    nearAll(span(l), span(r), 1e-9);
    nearAll(span(l), span(c), 1e-9);
    // Unset align centres the rows too; "centre" is "center".
    assert.deepEqual(rows(undefined).rows, c.rows);
    assert.equal(resolveCaptions('karaoke', '9:16', { align: 'centre' }).clean.align, 'center');
    // A one-row block ignores align.
    const alone = (align) => rig('karaoke', { anim: 'none', align }, { words: [{ w: 'hi', s: 0, e: 1 }] }).plan().rows;
    deepNear(alone('left').map((x) => [x.x0, x.width, x.cy]), alone('right').map((x) => [x.x0, x.width, x.cy]));
});

test('letter spacing widens the line, line gap sets the row pitch, tilt turns the block about its middle', () => {
    const base = rig('karaoke', { anim: 'none', max_words: 8, max_chars: 40, size: 2 }, { words: LONG });
    const sp = (cap) => rig('karaoke', { anim: 'none', max_words: 8, max_chars: 40, size: 2, ...cap }, { words: LONG });
    // Spacing is after every character: a word is wider by its characters x spacing; it widens the block.
    const a = sp({ spacing: 0.1 });
    near(a.cfg.spacing, 0.1 * a.r.fontPx);
    const wa = a.plan().words[0];
    near(wa.width, a.measure(wa.text, a.r.font, a.r.fontPx).w + [...wa.text].length * a.cfg.spacing, 1e-9);
    // A three-word block fits on one row, so its width shows the spacing.
    const few = (cap) => rig('karaoke', { anim: 'none', max_words: 3, ...cap }, { words: LONG }).plan();
    assert.equal(few({}).rows.length, 1);
    assert.ok(few({ spacing: 0.1 }).blockW > few({}).blockW);
    assert.ok(few({ spacing: -0.05 }).blockW < few({}).blockW);
    // Row pitch: size x line gap (1 by default); a 1.4 gap is 1.4 times the pitch.
    const pitch = (g) => g.plan().rows[1].cy - g.plan().rows[0].cy;
    assert.ok(base.plan().rows.length >= 2);
    near(pitch(base), base.r.fontPx, 1e-9);
    near(pitch(sp({ line_gap: 1.4 })) / pitch(base), 1.4, 1e-9);
    assert.equal(resolveCaptions('karaoke', '9:16', { line_gap: 9 }).clean.line_gap, 1.6);
    assert.equal(resolveCaptions('karaoke', '9:16', { line_gap: 0 }).clean.line_gap, 0.8);
    // The block grows with the pitch: height = (rows - 1) x pitch + size.
    near(sp({ line_gap: 1.4 }).plan().blockH, (sp({ line_gap: 1.4 }).plan().rows.length - 1) * 1.4 * base.r.fontPx + base.r.fontPx, 1e-9);
    // Tilt: the block's bounding box turns with it; it stays about the middle (the group turns about plan.centre).
    const t0 = blockExtent(base.plan(), base.r);
    const tilted = sp({ rotate: 6 });
    const t6 = blockExtent(tilted.plan(), tilted.r);
    const th = (6 * Math.PI) / 180;
    near(t6.w, t0.w * Math.cos(th) + t0.h * Math.sin(th), 1e-6);
    near(t6.h, t0.w * Math.sin(th) + t0.h * Math.cos(th), 1e-6);
    near(t6.bh, t0.bh, 1e-9);
    assert.equal(tilted.plan().tilt, 6);
    assert.equal(resolveCaptions('karaoke', '9:16', { rotate: 90 }).clean.rotate, 15);
});

test('boxes hug the ink: the line\'s box, each word\'s, the spoken word\'s; radius is a share of half the shorter side', () => {
    // A measure with known numbers: 10 px per character, ink 70 above and 20 below the baseline, bearings 2 and 3.
    const m = (t) => ({ w: [...t].length * 10, top: 70, bottom: -20, lsb: 2, rsb: 3 });
    const g = rig('karaoke', { anim: 'none', stroke: { width: 0 }, box: { color: '#102030', opacity: 0.5, pad_x: 20, pad_y: 10, radius: 0 } }, { measure: m });
    const p = g.plan();
    const row = p.rows[0];
    // One box per row: ink of the row (without the outer bearings) + 2 pad_x; ink band + 2 pad_y.
    assert.equal(p.boxes.line.length, p.rows.length);
    const b = p.boxes.line[0];
    near(b.w, row.width - 2 - 3 + 40, 1e-9);
    near(b.h, 90 + 20, 1e-9);
    assert.equal(b.radius, 0);
    // The shape is centred on the ink: on the row in x (bearings differ by 1 px), and off the line box's middle in y by where the ink sits.
    const { asc, desc } = lineBox(g.r.font, g.r.fontPx);
    near(b.cy, row.cy + (asc - desc) / 2 - (70 - 20) / 2, 1e-9);
    near(b.cx, row.x0 + row.width / 2 + (2 - 3) / 2, 1e-9);
    assert.deepEqual([g.cfg.boxfx.opacity, g.cfg.boxfx.col], [0.5, [16, 32, 48]]);
    // Radius: a share of half the shorter side. 1 is a pill (half the height), 0.5 a quarter of it.
    const r1 = rig('karaoke', { anim: 'none', box: { radius: 1 } }, { measure: m }).plan().boxes.line[0];
    near(r1.radius, Math.min(r1.w, r1.h) / 2, 1e-9);
    near(r1.radius, r1.h / 2, 1e-9);
    const r5 = rig('karaoke', { anim: 'none', box: { radius: 0.5 } }, { measure: m }).plan().boxes.line[0];
    near(r5.radius, r5.h / 4, 1e-9);
    // Per word: one box each, as wide as the word plus padding and the widest stroke (karaoke strokes 3 px).
    const pw = rig('karaoke', { anim: 'none', box: { per: 'word', pad_x: 10, pad_y: 6 } }, { measure: m }).plan();
    assert.equal(pw.boxes.word.length, pw.words.length);
    assert.equal(pw.boxes.line.length, 0);
    const w0 = pw.words[0];
    near(pw.boxes.word[0].w, w0.width - 2 - 3 + 20 + 2 * 3, 1e-9);
    near(pw.boxes.word[0].h, 90 + 12 + 6, 1e-9);
    near(pw.boxes.word[0].ax, (2 - 3) / 2, 1e-9);
    // The spoken word's box: pads and radius from the shape, else the defaults (16 x 8, square).
    const ab = rig('karaoke', { anim: 'none', words: { active: { box: { radius: 1 } } } }, { measure: m }).plan();
    assert.equal(ab.boxes.active.length, ab.words.length);
    near(ab.boxes.active[0].w, ab.words[0].width - 2 - 3 + 32 + 2 * 3, 1e-9);
    near(ab.boxes.active[0].radius, Math.min(ab.boxes.active[0].w, ab.boxes.active[0].h) / 2, 1e-9);
    // Its opacity is a word look: the box is there while the word is spoken, gone before and after.
    const f = (t) => wordFrame(ab.words[0].fx, t).bo;
    assert.deepEqual([f(100), f(0), f(400)], [1, 1, 0]);
    // Single mode: a box per word.
    assert.equal(rig('karaoke', { anim: 'none', box: {}, words: { mode: 'single' } }, { measure: m }).plan().boxes.line.length, 0);
    // The style's own box (hormozi's) is the row's, over the row's whole width; a v1 colour likewise.
    const h = rig('hormozi', { anim: 'none', words: { mode: 'all' } }, { measure: m });
    assert.equal(h.plan().boxes.libass.length, h.plan().rows.length);
    near(h.plan().boxes.libass[0].w, h.plan().rows[0].width, 1e-9);
    assert.equal(rig('hormozi', { box: { radius: 1 } }, { measure: m }).plan().boxes.libass.length, 0);
});

test('a block\'s size for the selection box covers rows, boxes and stroke', () => {
    const m = (t) => ({ w: [...t].length * 10, top: 70, bottom: -20, lsb: 2, rsb: 3 });
    const plain = rig('karaoke', { anim: 'none', words: { mode: 'all' } }, { measure: m });
    const e0 = blockExtent(plain.plan(), plain.r);
    near(e0.w, plain.plan().blockW + 2 * 3, 1e-9);
    near(e0.h, plain.plan().blockH + 2 * 3, 1e-9);
    const boxed = rig('karaoke', { anim: 'none', box: { pad_x: 30, pad_y: 12 } }, { measure: m });
    const e1 = blockExtent(boxed.plan(), boxed.r);
    near(e1.w, boxed.plan().blockW + 2 * 33, 1e-9);
    near(e1.h, boxed.plan().blockH + 2 * 15, 1e-9);
    // The v1 box (hormozi): its padding.
    const h = rig('hormozi', { anim: 'none', words: { mode: 'all' } }, { measure: m });
    near(blockExtent(h.plan(), h.r).w, h.plan().blockW + 2 * h.r.box.pad, 1e-9);
    // The row height alone is what sits against the anchor.
    near(e1.bh, boxed.plan().blockH, 1e-9);
});

// ---------------------------------------------------------------------------
// the caption designer: which section owns which field, and what its controls show
// ---------------------------------------------------------------------------

const V1_FIELDS = ['show', 'x', 'y', 'size', 'font', 'case', 'color', 'active', 'accent', 'max_words', 'outline', 'outline_w', 'shadow', 'box', 'box_opacity', 'anim'];

/** A value inside the field's range, for the path. */
function sampleOf(path) {
    const s = FIELD_SPECS[path];
    if (s.type === 'number') return s.int ? s.max : (s.min + s.max) / 2 === s.def ? s.max : (s.min + s.max) / 2;
    if (s.type === 'enum') return s.values[s.values.length - 1];
    return '#123456';
}

/** A Look that sets every v2 field (the object forms of shadow and box). */
function fullLook() {
    const out = {};
    for (const p of Object.keys(FIELD_SPECS)) {
        const keys = p.split('.');
        let cur = out;
        keys.forEach((k, i) => {
            if (i === keys.length - 1) cur[k] = sampleOf(p);
            else cur = (cur[k] ??= {});
        });
    }
    // The v1 forms that do not clash with the objects.
    return { ...out, show: false, x: 0.4, y: 0.6, size: 1.2, font: 'Anton', case: 'asis', color: '#FFFFFF', active: '#FFFF00', accent: '#00FFFF', max_words: 3, outline: '#000000', outline_w: 2, box_opacity: 0.5, anim: 'fade' };
}

test('every caption field has a section, and the map matches what the Look can hold', () => {
    const paths = [...Object.keys(FIELD_SPECS), ...V1_FIELDS];
    for (const p of paths) assert.ok(sectionOf(p), `no section for ${p}`);
    // Each path is listed once, under a real section, and nothing is listed that is not a field.
    const listed = SECTION_IDS.flatMap((s) => SECTION_PATHS[s]);
    assert.equal(new Set(listed).size, listed.length, 'a path is listed twice');
    const known = new Set([...paths, 'glow']);
    for (const p of listed) assert.ok(known.has(p), `${p} is not a caption field`);
    assert.deepEqual(Object.keys(SECTION_PATHS), SECTION_IDS);
    // The v1 forms that a v2 control also edits point at a path of the same section.
    for (const [v1, target] of Object.entries(ALIASES)) {
        assert.ok(FIELD_SECTION[target], `${v1} -> ${target}`);
        assert.equal(sectionOf(v1), sectionOf(target));
    }
    // A section other than the first needs an engine ability, named the way the panels ask for it.
    for (const s of SECTION_IDS.slice(1)) assert.match(SECTION_CAP[s], /^look\.captions\.(type|fx|words|motion)$/);
    assert.equal(SECTION_CAP.style, undefined);
    // Every field of the specs is one the engine's reader keeps (so a control can really set it).
    const clean = cleanCaptions(fullLook());
    for (const p of Object.keys(FIELD_SPECS)) assert.notEqual(getPath(clean, p), undefined, `${p} did not survive cleaning`);
});

test('every field of the specs has the control its kind needs: number display, choice order', () => {
    for (const [p, s] of Object.entries(FIELD_SPECS)) {
        if (s.type === 'number') {
            assert.deepEqual([numSpec(p).min, numSpec(p).max], [s.min, s.max]);
            const ui = numUi(p);
            assert.ok(ui && ui.k > 0 && Number.isInteger(ui.digits), `${p} has no number display`);
        }
        if (s.type === 'enum') assert.deepEqual([...ENUM_ORDER[p]].sort(), [...s.values].sort(), `${p} choices`);
    }
    // The v1 numbers with a control of their own.
    assert.deepEqual([numSpec('size').min, numSpec('size').max, numSpec('max_words').max], [0.5, 2, 8]);
    // Shares of the type size and 0..1 amounts read as percent, a line gap as a multiple.
    assert.deepEqual(numUi('words.release_ms'), { k: 1, unit: 'ms', digits: 0 });
    assert.deepEqual(numUi('shadow.opacity'), { k: 100, unit: '%', digits: 0 });
    assert.deepEqual(numUi('spacing'), { k: 100, unit: '%', digits: 1 });
    assert.deepEqual(numUi('line_gap'), { k: 1, unit: '', digits: 2 });
    assert.equal(numUi('rotate').unit, '°');
});

test('a section knows when it changes the style, and puts itself back in one patch', () => {
    const full = fullLook();
    assert.deepEqual(dirtySections({}), []);
    assert.deepEqual(dirtySections(undefined), []);
    // An object left empty says nothing.
    assert.equal(sectionHasOverrides({ shadow: {}, words: { active: {} } }, 'shadow'), false);
    assert.equal(sectionHasOverrides({ words: { active: {} } }, 'words'), false);
    assert.deepEqual(dirtySections({ show: false }), ['style']);
    assert.deepEqual(dirtySections({ words: { release_ms: 500 } }), ['words']);
    assert.deepEqual(dirtySections({ outline_w: 4, glow: { size: 3 }, accent: '#00FF00' }), ['fill', 'shadow', 'words']);
    for (const s of SECTION_IDS) {
        assert.equal(sectionHasOverrides(full, s), true, s);
        const patch = sectionResetPatch(full, s);
        assert.deepEqual(Object.keys(patch).sort(), sectionKeys(s).sort(), `${s} reset names its keys`);
        const after = applyCaptions({ look: { captions: full } }, patch).look.captions;
        assert.equal(sectionHasOverrides(after, s), false, `${s} still has overrides`);
        // The other sections keep every field.
        for (const o of SECTION_IDS.filter((x) => x !== s)) {
            for (const k of sectionKeys(o)) assert.deepEqual(after[k], full[k], `${s} reset touched ${k}`);
        }
    }
    // Nothing set, nothing to clear.
    assert.deepEqual(sectionResetPatch({}, 'words'), {});
    // The keys a section owns do not overlap.
    const all = SECTION_IDS.flatMap(sectionKeys);
    assert.equal(new Set(all).size, all.length);
    // One reset is one undo step.
    let clock = 0;
    const store = createLookStore({ storage: null, now: () => (clock += 1000) });
    store.setCaptions({ font: 'Anton', size: 1.2, spacing: 0.1, words: { release_ms: 400 } });
    const before = JSON.stringify(store.get().options.look);
    store.setCaptions(sectionResetPatch(store.get().options.look.captions, 'type'));
    assert.equal(sectionHasOverrides(store.get().options.look.captions, 'type'), false);
    assert.equal(store.get().options.look.captions.words.release_ms, 400);
    store.undo();
    assert.equal(JSON.stringify(store.get().options.look), before);
});

const viewOf = (style, L = {}, flat = {}, canvas = '9:16') => captionView(style, canvas, L, flat);
const applied = (patch, L = {}) => applyCaptions({ look: { captions: L } }, patch).look.captions;

test('controls show the style\'s own value until the Look sets the field', () => {
    const k = viewOf('karaoke');
    assert.equal(k.val('words.active.color'), STYLES.karaoke.active.toUpperCase());
    assert.equal(k.val('words.upcoming.color'), '#FFFFFF');
    assert.equal(k.val('words.keyword.color'), STYLES.karaoke.accent.toUpperCase());
    assert.equal(k.val('words.spoken.color'), k.val('words.active.color'));
    assert.equal(k.val('color'), '#FFFFFF');
    assert.equal(k.val('font'), 'Archivo Black');
    assert.equal(k.val('lines'), 2);
    assert.equal(k.val('align'), 'center');
    assert.equal(k.val('line_gap'), 1);
    assert.equal(k.val('words.hold_ms'), 0);
    assert.equal(k.val('words.upcoming.scale'), 1);
    assert.equal(k.val('stroke.width'), 3);
    assert.equal(k.val('max_words'), 3);
    assert.equal(k.val('max_chars'), 14);
    for (const p of ['words.active.color', 'font', 'lines', 'stroke.width', 'shadow', 'box', 'enter.kind', 'x']) assert.equal(k.isSet(p), false, p);
    // The Look's own value wins and reads as set.
    const o = viewOf('karaoke', { words: { active: { color: '#123456' }, release_ms: 500 }, lines: 1, stroke: { width: 7 }, x: 0.3 });
    assert.equal(o.val('words.active.color'), '#123456');
    assert.equal(o.val('words.release_ms'), 500);
    assert.equal(o.val('lines'), 1);
    assert.equal(o.val('stroke.width'), 7);
    assert.equal(o.isSet('x') && o.isSet('y'), true);
    for (const p of ['words.active.color', 'words.release_ms', 'lines', 'stroke.width']) assert.equal(o.isSet(p), true, p);
    // The v1 forms count: an older Look's colour, outline and motion show in the v2 controls.
    const v1 = viewOf('karaoke', { active: '#ABCDEF', accent: '#FEDCBA', outline_w: 5, outline: '#222222', anim: 'none' });
    assert.equal(v1.val('words.active.color'), '#ABCDEF');
    assert.equal(v1.val('words.keyword.color'), '#FEDCBA');
    assert.equal(v1.val('stroke.width'), 5);
    assert.equal(v1.val('stroke.color'), '#222222');
    assert.equal(v1.val('enter.kind'), 'none');
    for (const p of ['words.active.color', 'words.keyword.color', 'stroke.width', 'stroke.color', 'enter.kind', 'exit.kind']) assert.equal(v1.isSet(p), true, p);
    // The style's own motion: pop in 200 ms; the reveal follows the motion.
    assert.deepEqual([k.val('enter.kind'), k.val('enter.ms'), k.val('exit.kind')], ['pop', 200, 'fade']);
    const w = viewOf('karaoke', {}, { anim: 'words' });
    assert.equal(w.val('words.mode'), 'build');
    assert.equal(w.val('words.attack_ms'), 80);
    assert.equal(w.isSet('words.mode'), false);
    assert.equal(viewOf('karaoke', { words: { mode: 'single' } }).val('words.mode'), 'single');
    // Case follows the style until set.
    assert.equal(viewOf('minimal').val('case'), 'asis');
    assert.equal(viewOf('minimal', { case: 'upper' }).val('case'), 'upper');
    // Glow starts from the speaking colour, or white when that is too dark.
    assert.equal(viewOf('karaoke').val('glow.color'), STYLES.karaoke.active.toUpperCase());
    assert.equal(viewOf('highlight').val('glow.color'), '#FFFFFF');
    assert.deepEqual([k.val('glow.size'), k.val('glow.strength')], [12, 0.8]);
});

test('the shadow and the box start from what the style draws, so a first touch does not jump', () => {
    // A style with a shadow: its depth is a hard offset in its colour.
    const t = viewOf('tiktok');
    assert.equal(t.shadowOn, true);
    assert.equal(t.shadowIsObject, false);
    assert.deepEqual([t.val('shadow.x'), t.val('shadow.y'), t.val('shadow.blur'), t.val('shadow.opacity'), t.val('shadow.color')], [2, 2, 0, 1, '#FE2C55']);
    assert.deepEqual(editPatch(t, 'shadow.blur', 6), { shadow: { color: '#FE2C55', x: 2, y: 2, blur: 6, opacity: 1 } });
    // Once it is an object, a touch changes only its field.
    const o = viewOf('tiktok', { shadow: { color: '#FE2C55', x: 2, y: 2, blur: 6, opacity: 1 } });
    assert.deepEqual(editPatch(o, 'shadow.x', 9), { shadow: { x: 9 } });
    assert.equal(applied(editPatch(o, 'shadow.x', 9), { shadow: { x: 2, blur: 6 } }).shadow.blur, 6);
    // A style without one: the engine's own defaults, and the first touch writes only that field.
    const k = viewOf('karaoke');
    assert.equal(k.shadowOn, false);
    assert.deepEqual([k.val('shadow.x'), k.val('shadow.y'), k.val('shadow.blur'), k.val('shadow.opacity'), k.val('shadow.color')], [0, 4, 4, 0.6, '#000000']);
    assert.deepEqual(editPatch(k, 'shadow.x', 5), { shadow: { x: 5 } });
    // The switch: on starts from the style (or the default opacity); off is a zero depth only where the style has a shadow.
    assert.deepEqual(shadowPatch(k, true), { shadow: { opacity: 0.6 } });
    assert.deepEqual(shadowPatch(t, true), { shadow: { color: '#FE2C55', x: 2, y: 2, blur: 0, opacity: 1 } });
    assert.deepEqual(shadowPatch(t, false), { shadow: 0 });
    assert.deepEqual(shadowPatch(k, false), { shadow: undefined });
    assert.equal(viewOf('tiktok', { shadow: 0 }).shadowOn, false);
    assert.equal(viewOf('karaoke', { shadow: { y: 6 } }).shadowOn, true);
    // A v1 depth is the offset, in the style's colour.
    const v = viewOf('karaoke', { shadow: 3 });
    assert.deepEqual([v.shadowOn, v.val('shadow.x'), v.val('shadow.y'), v.val('shadow.blur')], [true, 3, 3, 0]);
    assert.deepEqual(editPatch(v, 'shadow.blur', 2).shadow.blur, 2);
    assert.equal(applied(editPatch(v, 'shadow.blur', 2), { shadow: 3 }).shadow.x, 3);
    // Glow: a switch with the engine's size and strength.
    assert.deepEqual(glowPatch(true), { glow: { size: 12, strength: 0.8 } });
    assert.deepEqual(glowPatch(false), { glow: undefined });
    assert.equal(viewOf('karaoke', { glow: { size: 3 } }).glowOn, true);
    // The box: the style's own is "behind the line", none is off, the object says per line or word.
    const h = viewOf('hormozi');
    assert.equal(h.boxMode(), 'line');
    assert.equal(h.isSet('box'), false);
    assert.equal(k.boxMode(), 'off');
    assert.equal(viewOf('karaoke', { box: { per: 'word' } }).boxMode(), 'word');
    assert.equal(viewOf('hormozi', { box: 'none' }).boxMode(), 'off');
    assert.equal(viewOf('karaoke', { box: '#112233' }).boxMode(), 'line');
    assert.deepEqual([k.val('box.pad_x'), k.val('box.pad_y'), k.val('box.radius'), k.val('box.opacity')], [16, 8, 0, 1]);
    assert.deepEqual(boxModePatch(k, 'word'), { box: { per: 'word', opacity: 0.6 }, box_opacity: undefined });
    assert.deepEqual(boxModePatch(h, 'word'), { box: { per: 'word' }, box_opacity: undefined });
    assert.deepEqual(boxModePatch(h, 'off'), { box: 'none', box_opacity: undefined });
    assert.deepEqual(boxModePatch(k, 'off'), { box: undefined, box_opacity: undefined });
    assert.deepEqual(boxModePatch(viewOf('karaoke', { box: { per: 'line', radius: 0.5 } }), 'word'), { box: { per: 'word' } });
    assert.deepEqual(editPatch(k, 'box.radius', 0.4), { box: { per: 'line', opacity: 0.6, radius: 0.4 } });
    // The box object replaces a v1 colour box and the style's: the patch swaps the form.
    assert.deepEqual(applied(boxModePatch(k, 'line'), { box: '#112233' }).box, { per: 'line', opacity: 0.6 });
    assert.equal(applied(boxModePatch(h, 'off'), {}).box, 'none');
    // The spoken word's own stroke, glow and box start from the caption's.
    const s = viewOf('karaoke');
    assert.deepEqual(activeExtraPatch(s, 'stroke', true), { words: { active: { stroke: { color: '#000000', width: 3 } } } });
    assert.deepEqual(activeExtraPatch(s, 'glow', true), { words: { active: { glow: { size: 12, strength: 0.8 } } } });
    assert.deepEqual(activeExtraPatch(s, 'box', true), { words: { active: { box: { opacity: 1 } } } });
    assert.deepEqual(activeExtraPatch(s, 'glow', false), { words: { active: { glow: undefined } } });
    const hadGlow = { words: { active: { glow: { size: 5 }, scale: 1.2 } } };
    assert.equal(applied(activeExtraPatch(s, 'glow', false), hadGlow).words.active.glow, undefined);
    assert.equal(applied(activeExtraPatch(s, 'glow', false), hadGlow).words.active.scale, 1.2);
});

test('an edit writes one field and a reset clears it, with the v1 forms folded in', () => {
    const k = viewOf('karaoke', { active: '#ABCDEF', accent: '#FEDCBA' });
    // The speaking and keyword colours say it once, in the v2 field.
    const a = applied(editPatch(k, 'words.active.color', '#111111'), { active: '#ABCDEF', size: 1.1 });
    assert.deepEqual(a, { size: 1.1, words: { active: { color: '#111111' } } });
    assert.equal(applied(editPatch(k, 'words.keyword.color', '#222222'), { accent: '#FEDCBA' }).accent, undefined);
    // Deep fields nest; a number lands where the path says.
    assert.deepEqual(nest('words.active.glow.size', 9), { words: { active: { glow: { size: 9 } } } });
    assert.deepEqual(editPatch(k, 'words.release_ms', 450), { words: { release_ms: 450 } });
    assert.deepEqual(editPatch(k, 'lines', 1), { lines: 1 });
    // Clearing a field clears what it also reads.
    assert.deepEqual(clearPatch('stroke.width'), { stroke: { width: undefined }, outline_w: undefined });
    assert.deepEqual(clearPatch('stroke.color'), { stroke: { color: undefined }, outline: undefined });
    assert.deepEqual(clearPatch('x'), { x: undefined, y: undefined });
    assert.deepEqual(clearPatch('enter.kind'), { enter: { kind: undefined }, anim: undefined });
    assert.deepEqual(clearPatch('words.active.color'), { words: { active: { color: undefined } }, active: undefined });
    const L = { stroke: { color: '#112233', width: 4 }, outline_w: 6, words: { active: { color: '#445566', scale: 1.2 } }, active: '#778899' };
    const after = applied(clearPatch('stroke.width'), L);
    assert.deepEqual(after.stroke, { color: '#112233' });
    assert.equal(after.outline_w, undefined);
    assert.deepEqual(applied(clearPatch('words.active.color'), L).words.active, { scale: 1.2 });
    // The last field of an object takes the object with it.
    assert.equal(applied(clearPatch('stroke.width'), { stroke: { width: 3 } }).stroke, undefined);
});

// A few steady lines on the sample's clock.
const PARK_LINES = [{ t0: 0.2, t1: 1.4 }, { t0: 1.6, t1: 3 }];
const pop = { clean: {}, anim: 'pop' };

test('the playhead parks where a caption is up and settled, and where the headline is too', () => {
    // The first line, after its entrance (pop is 200 ms) and a hair more.
    near(parkTime(PARK_LINES, { len: 6, ...pop }), 0.2 + 0.2 + 0.05);
    // A slower entrance settles later; no entrance is up at once.
    near(parkTime(PARK_LINES, { len: 6, clean: {}, anim: 'bounce' }), 0.2 + 0.34 + 0.05);
    near(parkTime(PARK_LINES, { len: 6, clean: {}, anim: 'none' }), 0.2 + 0.05);
    near(parkTime(PARK_LINES, { len: 6, clean: { enter: { kind: 'slide_up', ms: 500 } }, anim: 'pop' }), 0.2 + 0.5 + 0.05);
    // The headline must be settled too (pop 340 ms): a line up from the start waits for it.
    near(parkTime([{ t0: 0, t1: 2 }], { len: 6, ...pop, headline: { anim: 'pop', seconds: 0 } }), 0.34 + 0.05);
    near(parkTime(PARK_LINES, { len: 6, ...pop, headline: { anim: 'fade', seconds: 0 } }), 0.4 + 0.05);
    near(parkTime(PARK_LINES, { len: 6, ...pop, headline: { anim: 'none', seconds: 0 } }), 0.45);
    // A first line gone before the headline has settled: the next line that is up with it.
    near(parkTime([{ t0: 0, t1: 0.3 }, { t0: 1, t1: 3 }], { len: 6, ...pop, headline: { anim: 'pop', seconds: 0 } }), 1.25);
    // A headline gone before any line settles: the first settled line.
    near(parkTime(PARK_LINES, { len: 6, ...pop, headline: { anim: 'pop', seconds: 0.3 } }), 0.2 + 0.2 + 0.05);
    // Captions off: only the headline counts. Nothing at all: the start.
    near(parkTime(PARK_LINES, { len: 6, captions: false, ...pop, headline: { anim: 'pop', seconds: 0 } }), 0.39);
    assert.equal(parkTime(PARK_LINES, { len: 6, captions: false, ...pop }), 0);
    assert.equal(parkTime([], { len: 6, ...pop }), 0);
    near(parkTime([], { len: 6, ...pop, headline: { anim: 'none', seconds: 0 } }), 0.05);
    // Never past the end of the window.
    assert.ok(parkTime([{ t0: 9, t1: 10 }], { len: 3, ...pop }) <= 3);
    // On the real stand-in: it lands inside a line that is on screen.
    const r = resolveCaptions('karaoke', '9:16', {});
    const lines = captionLines(SAMPLE, r);
    const at = parkTime(lines, { len: 6, clean: r.clean, anim: r.anim });
    assert.ok(lines.some((l) => at >= l.t0 && at < l.t1), 'parked inside a line');
    assert.ok(at > 0);
});

test('the sample headline is the typed text, else the first clip\'s title, else the video\'s, else the fixed line', () => {
    const job = { name: 'Podcast 41.mp4', clips: [{ title: 'Why I quit' }, { title: 'Second' }] };
    assert.equal(stageHeadline('My own words', job), 'My own words');
    assert.equal(stageHeadline('', job), 'Why I quit');
    assert.equal(stageHeadline('   ', job), 'Why I quit');
    assert.equal(stageHeadline(' {} ', job), 'Why I quit');
    assert.equal(stageHeadline('', { name: 'Podcast 41.mp4', clips: [{ title: '  ' }] }), 'Podcast 41.mp4');
    assert.equal(stageHeadline('', { name: 'Podcast 41.mp4', clips: [] }), 'Podcast 41.mp4');
    assert.equal(stageHeadline('', { name: 'Podcast 41.mp4' }), 'Podcast 41.mp4');
    // The fixed line is only the stand-in's (no video), or a video with no title at all.
    assert.equal(stageHeadline('', null), HEADLINE_SAMPLE);
    assert.equal(stageHeadline(''), HEADLINE_SAMPLE);
    assert.equal(stageHeadline('', { name: '', clips: [{}] }), HEADLINE_SAMPLE);
    assert.equal(stageHeadline(undefined, undefined), HEADLINE_SAMPLE);
    // It goes through the engine's own clean-up like any headline.
    assert.equal(headlineText(stageHeadline('', job)), 'Why I quit');
});

test('the selection box follows the caption block at the playhead', () => {
    const lines = [{ t0: 1, t1: 2, id: 'a' }, { t0: 3, t1: 4, id: 'b' }];
    assert.equal(blockAt(lines, 1.5).id, 'a');
    assert.equal(blockAt(lines, 3).id, 'b');
    assert.equal(blockAt(lines, 2).id, 'a', 'a line ends where the gap starts: the nearest is the one that just left');
    // Between lines: the nearest in time (the one that just left on a tie).
    assert.equal(blockAt(lines, 2.2).id, 'a');
    assert.equal(blockAt(lines, 2.8).id, 'b');
    assert.equal(blockAt(lines, 2.5).id, 'a');
    assert.equal(blockAt(lines, 0).id, 'a');
    assert.equal(blockAt(lines, 9).id, 'b');
    assert.equal(blockAt([], 1), null);
    assert.equal(blockAt(undefined, 1), null);
    // Its size is the block's, not the widest of the sample.
    const m = (t) => ({ w: [...t].length * 10, top: 70, bottom: -20, lsb: 0, rsb: 0 });
    const r = resolveCaptions('karaoke', '9:16', { words: { mode: 'all' } }, { anim: 'none' });
    const words = [{ w: 'Hi', s: 0, e: 0.3 }, { w: 'yo', s: 0.3, e: 0.6 }, { w: 'Amazing', s: 5, e: 5.5 }, { w: 'people', s: 5.5, e: 6 }];
    const blocks = captionBlocks(words, r, m);
    assert.equal(blocks.length, 2);
    const ext = (t) => blockExtent(planFor(cfgOf(r), r, blockAt(blocks, t), m), r).w;
    assert.ok(ext(0.4) < ext(5.2), 'the short block is narrower than the long one');
    near(ext(0.4), planFor(cfgOf(r), r, blocks[0], m).blockW + 2 * 3, 1e-9);
});

test('the preview strip loops the real timing: three words, the middle a keyword', () => {
    const t0 = previewTiming({});
    assert.equal(t0.words.length, 3);
    assert.equal(PREVIEW_KEYWORD, 1);
    // Plain timing: the last word is said by 1.45 s, then a pause before the loop restarts.
    assert.equal(t0.loopMs, 2150);
    near(t0.lineEnd, 1.9);
    assert.equal(t0.stillMs, 775);
    // The loop grows with the hold and the fade back; the fade back is what you wait to see.
    assert.equal(previewTiming({ release_ms: 500 }).loopMs, 2650);
    assert.equal(previewTiming({ hold_ms: 300, attack_ms: 400 }).loopMs, 2450);
    assert.ok(previewTiming({ release_ms: 2000 }).loopMs >= 4150);
    // A bad number does not break it.
    assert.equal(previewTiming({ attack_ms: -5, hold_ms: NaN, release_ms: undefined }).loopMs >= 2000, true);
    const b = previewBlock(['Just', 'stop', 'now'], t0);
    assert.deepEqual(b.words.map((w) => w.key), [false, true, false]);
    assert.deepEqual([b.t0, b.t1], [0, t0.lineEnd]);
    assert.equal(b.words[1].s, 0.6);
    // Drawn with the stage's model, the middle word settles over the fade back: active at its end, spoken half a second later.
    // (The middle word is the keyword, so its speaking colour is the keyword colour.)
    const L = { words: { release_ms: 500, keyword: { color: '#FF0000' }, spoken: { color: '#00FF00' }, upcoming: { color: '#0000FF' } } };
    const r = resolveCaptions('karaoke', { w: 300, h: 400 }, { ...L, x: 0.5, y: 0.5 }, { anim: 'pop' });
    const tm = previewTiming({ release_ms: 500 });
    const plan = planFor(cfgOf(r), r, previewBlock(['JUST', 'STOP', 'NOW'], tm), flatMeasure());
    const col = (ms) => frameAt(plan, ms).groups[0].words.find((w) => w.i === 1).col;
    nearAll(col(949), [255, 0, 0], 1e-6);
    const mid = col(950 + 250);
    assert.ok(mid[0] > 0 && mid[0] < 255 && mid[1] > 0 && mid[1] < 255, `mid-fade colour ${mid}`);
    nearAll(col(950 + 500), [0, 255, 0], 1e-6);
});

// The headline, bar and logo designers (their own files, run by this command).
import './layerfx.test.mjs';
import './layermap.test.mjs';
import './layergeom.test.mjs';
import './scene.test.mjs';
import './sceneFx.test.mjs';
import './sceneStage.test.mjs';
import './looks.test.mjs';
import './fonts.test.mjs';
import './home.test.mjs';
