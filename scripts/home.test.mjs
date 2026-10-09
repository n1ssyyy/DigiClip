// Tests for the Look line on Home, the extra shapes, the watch folder's choice,
// the Layers summaries and the Space key (imported by look.test.mjs):
//   node --test scripts/look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { defaults } from '../src/lib/look.js';
import { extraShapes, joinShapes, mainShape, setMainShape, shapeCount, toggleExtra } from '../src/lib/shapes.js';
import { KINDS, clipsText, countChoices, homePieces, homeSummary, kindText, shapeText } from '../src/lib/homeLine.js';
import { CUSTOM, watchChoice } from '../src/lib/watchLook.js';
import { fileSummary, headlineSummary } from '../src/lib/layerSummary.js';
import { spaceAction } from '../src/lib/exactFrame.js';
import clips from '../src/i18n/clips.js';
import home from '../src/i18n/home.js';
import mcp from '../src/i18n/mcp.js';
import options from '../src/i18n/options.js';
import settings from '../src/i18n/settings.js';
import shell from '../src/i18n/shell.js';
import studio from '../src/i18n/studio.js';
import tray from '../src/i18n/tray.js';

const LANGS = ['sq', 'de', 'fr', 'es', 'it', 'tr'];
const strings = Object.fromEntries(LANGS.map((l) => [l, Object.assign({}, ...[clips, home, mcp, options, settings, shell, studio, tray].map((d) => d[l]))]));

/** The app's `t` for English: fills the {name} slots. */
const en = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
/** A language's `t`, falling back to the English text the way the app does. */
const inLang = (l) => (s, vars = {}) => en(strings[l][s] ?? s, vars);

// ---------------------------------------------------------------------------
// extra shapes
// ---------------------------------------------------------------------------

test('shapes: main and extras of the comma list', () => {
    assert.equal(mainShape('9:16'), '9:16');
    assert.equal(mainShape('1:1,16:9'), '1:1');
    assert.deepEqual(extraShapes('9:16'), []);
    assert.deepEqual(extraShapes('9:16,16:9,1:1'), ['1:1', '16:9']);
    assert.equal(shapeCount('9:16,1:1,4:5'), 3);
    assert.equal(shapeCount(undefined), 1);
});

test('shapes: junk in the list is dropped, empty is the vertical default', () => {
    assert.equal(joinShapes('nope', ['1:1']), '9:16,1:1');
    assert.equal(joinShapes('4:5', ['4:5', '1:1', 'x']), '4:5,1:1');
    assert.deepEqual(extraShapes('9:16,x,1:1,1:1'), ['1:1']);
    assert.equal(mainShape(''), '9:16');
});

test('shapes: turning an extra on and off keeps the main shape and a steady order', () => {
    let v = '9:16';
    v = toggleExtra(v, '16:9');
    v = toggleExtra(v, '4:5');
    assert.equal(v, '9:16,4:5,16:9');
    v = toggleExtra(v, '16:9');
    assert.equal(v, '9:16,4:5');
    v = toggleExtra(v, '4:5');
    assert.equal(v, '9:16');
});

test('shapes: the main shape is never an extra, an unknown shape changes nothing', () => {
    assert.equal(toggleExtra('1:1,16:9', '1:1'), '1:1,16:9');
    assert.equal(toggleExtra('1:1', 'banana'), '1:1');
});

test('shapes: switching the main shape keeps the extras and drops a duplicate', () => {
    assert.equal(setMainShape('9:16,1:1', '4:5'), '4:5,1:1');
    // The new main shape was an extra: it moves up, it is not made twice.
    assert.equal(setMainShape('9:16,1:1,16:9', '1:1'), '1:1,16:9');
    assert.equal(setMainShape('9:16', '9:16'), '9:16');
    assert.equal(setMainShape('9:16,1:1', 'banana'), '9:16,1:1');
});

// ---------------------------------------------------------------------------
// the line on Home
// ---------------------------------------------------------------------------

const wc = (patch) => ({ ...defaults(null), ...patch });

test('home line: the default working copy', () => {
    assert.equal(homeSummary(wc({}), en), 'Smart · 3 clips · 9:16');
});

test('home line: auto count, one clip, every way of picking', () => {
    assert.equal(homeSummary(wc({ count: 0 }), en), 'Smart · Auto clips · 9:16');
    assert.equal(homeSummary(wc({ count: 1, kind: 'timecut' }), en), 'Timecut · 1 clip · 9:16');
    assert.equal(homeSummary(wc({ count: 10, kind: 'complete' }), en), 'Complete · 10 clips · 9:16');
    assert.equal(homeSummary(wc({ kind: 'moments', count: 5 }), en), 'Moments · 5 clips · 9:16');
});

test('home line: the shape, with the extra shapes of the run', () => {
    assert.equal(homeSummary(wc({ aspect: '1:1' }), en), 'Smart · 3 clips · 1:1');
    assert.equal(homeSummary(wc({ aspect: '9:16,1:1' }), en), 'Smart · 3 clips · 9:16 + 1:1');
    assert.equal(homeSummary(wc({ aspect: '4:5,16:9,9:16,1:1' }), en), 'Smart · 3 clips · 4:5 + 9:16, 1:1, 16:9');
    assert.equal(shapeText(undefined), '9:16');
});

test('home line: a saved copy with odd values still reads', () => {
    assert.equal(homeSummary(wc({ kind: 'weird', count: 'x', aspect: 'nope' }), en), 'Smart · Auto clips · 9:16');
    assert.equal(homeSummary(wc({ count: 2.6 }), en), 'Smart · 3 clips · 9:16');
    assert.equal(homeSummary(wc({ count: -4 }), en), 'Smart · Auto clips · 9:16');
});

test('home line: pieces hold the value their control sets', () => {
    const p = homePieces(wc({ kind: 'complete', count: 4, aspect: '4:5,1:1' }), en);
    assert.deepEqual(p, {
        kind: { value: 'complete', text: 'Complete' },
        count: { value: 4, text: '4 clips' },
        shape: { value: '4:5', text: '4:5 + 1:1' },
    });
    assert.deepEqual(KINDS.map((k) => kindText(k, en)), ['Smart', 'Complete', 'Moments', 'Timecut']);
});

test('home line: the counts on offer, with a saved one beyond the range', () => {
    assert.deepEqual(countChoices(3), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual(countChoices(14).slice(-2), [10, 14]);
    assert.equal(clipsText(7, en), '7 clips');
});

test('home line: other languages say it in their own words', () => {
    for (const l of LANGS) {
        const line = homeSummary(wc({ count: 0 }), inLang(l));
        assert.notEqual(line, homeSummary(wc({ count: 0 }), en), `${l} left the line in English`);
        assert.ok(!line.includes('{'), `${l}: ${line}`);
    }
});

test('home line: every new string has all six languages', () => {
    const keys = ['Auto clips', 'Open Studio', 'Also make', 'One run then makes each clip in every chosen shape.',
        'Your text', 'Your logo', 'Your music', 'Custom (look since changed)', 'Design and save Looks in Studio.',
        'No Looks yet: design one in Studio and save it.'];
    for (const l of LANGS) {
        for (const k of keys) {
            assert.ok(strings[l][k], `${l} lacks "${k}"`);
            assert.notEqual(strings[l][k], k, `${l} "${k}" is not translated`);
        }
    }
});

// ---------------------------------------------------------------------------
// the watch folder's choice
// ---------------------------------------------------------------------------

const podcast = { name: 'Podcast', options: { style: 'minimal', aspect: '1:1' } };
const neon = { name: 'neon night', options: { style: 'neon', count: 5 } };
const alpha = { name: 'Alpha', options: { style: 'tiktok' } };

test('watch choice: lists the Looks by name, alphabetically', () => {
    const c = watchChoice({}, [podcast, neon, alpha]);
    assert.deepEqual(c.names, ['Alpha', 'neon night', 'Podcast']);
});

test('watch choice: matched by value, so a renamed Look is still the one', () => {
    assert.equal(watchChoice({ style: 'minimal', aspect: '1:1' }, [podcast, neon]).value, 'Podcast');
    const renamed = [{ ...podcast, name: 'Talks' }, neon];
    assert.equal(watchChoice({ style: 'minimal', aspect: '1:1' }, renamed).value, 'Talks');
});

test('watch choice: nothing set is the defaults, anything else is custom', () => {
    assert.deepEqual(watchChoice(undefined, [podcast]), { value: '', names: ['Podcast'], custom: false });
    assert.equal(watchChoice({ style: null, count: null }, [podcast]).value, '');
    const c = watchChoice({ style: 'ghost' }, [podcast]);
    assert.equal(c.value, CUSTOM);
    assert.equal(c.custom, true);
});

test('watch choice: with no Looks there is nothing to list', () => {
    assert.deepEqual(watchChoice({}, undefined), { value: '', names: [], custom: false });
    assert.deepEqual(watchChoice({ style: 'ghost' }, []).names, []);
});

test('watch choice: entries that are not Looks are left out, a name is listed once', () => {
    const c = watchChoice({}, [null, { name: '', options: {} }, { name: 'x' }, podcast, { ...podcast }, 7]);
    assert.deepEqual(c.names, ['Podcast']);
});

// ---------------------------------------------------------------------------
// the Layers list
// ---------------------------------------------------------------------------

const MAX = 24;

test('headline summary: no text is the clip\'s own title', () => {
    assert.equal(headlineSummary({ text: '', max: MAX, tr: en }), "The clip's own title");
    assert.equal(headlineSummary({ text: '   ', max: MAX, tr: en }), "The clip's own title");
});

test('headline summary: a typed text is "Your text" and the whole words that fit', () => {
    assert.equal(headlineSummary({ text: 'Hello', max: MAX, tr: en }), 'Your text · Hello');
    assert.equal(headlineSummary({ text: 'Hello big wide world of clips', max: MAX, tr: en }), 'Your text · Hello big');
    assert.equal(headlineSummary({ text: 'Hello   big', max: MAX, tr: en }), 'Your text · Hello big');
});

test('headline summary: a first word that does not fit leaves just "Your text"', () => {
    assert.equal(headlineSummary({ text: 'Supercalifragilisticexpialidocious', max: MAX, tr: en }), 'Your text');
});

test('headline summary: never longer than the row, never a cut word', () => {
    const text = 'The quick brown fox jumps over the lazy dog and keeps running';
    for (const size of [undefined, 0.8, 1.25, 2]) {
        for (let max = 10; max <= 40; max++) {
            const out = headlineSummary({ text, size, max, tr: en });
            if (out.length > max) assert.equal(out, 'Your text', `${max}: ${out}`);
            const words = out.replace(/ · \d+%$/, '').replace(/^Your text( · )?/, '');
            for (const w of words.split(' ').filter(Boolean)) assert.ok(text.split(' ').includes(w), `cut word "${w}" in "${out}"`);
        }
    }
});

test('headline summary: the size stays when it fits, steps aside when it does not', () => {
    assert.equal(headlineSummary({ text: 'Hello big', size: 1.2, max: MAX, tr: en }), 'Your text · Hello · 120%');
    assert.equal(headlineSummary({ text: '', size: 1.2, max: MAX, tr: en }), "The clip's own title");
    assert.equal(headlineSummary({ text: '', size: 1.2, max: 40, tr: en }), "The clip's own title · 120%");
});

test('headline summary: a font that is not the default follows only with room', () => {
    assert.equal(headlineSummary({ text: 'Hi', font: 'Lobster', max: MAX, tr: en }), 'Your text · Hi · Lobster');
    assert.equal(headlineSummary({ text: 'Hello big', font: 'Playfair Display', max: MAX, tr: en }), 'Your text · Hello big');
});

test('file summary: the name when it fits, else a plain word', () => {
    assert.equal(fileSummary({ file: 'C:\\media\\logo.png', size: 1.5, max: MAX, fallback: 'Your logo' }), 'logo.png · 150%');
    assert.equal(fileSummary({ file: '/a/b/beach-sunrise-ambient-loop.mp3', max: MAX, fallback: 'Your music' }), 'Your music');
    assert.equal(fileSummary({ file: 'C:\\x\\a-rather-long-brand-logo-name.png', size: 1.5, max: MAX, fallback: 'Your logo' }), 'Your logo · 150%');
    assert.equal(fileSummary({ file: 'C:\\x\\twenty-chars-logo-ab.png', size: 1.5, max: MAX, fallback: 'Your logo' }), 'twenty-chars-logo-ab.png');
});

// ---------------------------------------------------------------------------
// Space with the engine's still up
// ---------------------------------------------------------------------------

const keys = (patch) => ({ typing: false, free: false, stillShown: false, onStillButton: false, ...patch });

test('space: plays when nothing else wants the key', () => {
    assert.equal(spaceAction(keys({ free: true })), 'play');
    assert.equal(spaceAction(keys({ free: false })), 'none');
});

test('space: never while typing', () => {
    assert.equal(spaceAction(keys({ typing: true, free: true })), 'none');
    assert.equal(spaceAction(keys({ typing: true, stillShown: true, onStillButton: true })), 'none');
});

test('space: with the still up, on the Exact frame button, it closes the still and plays', () => {
    assert.equal(spaceAction(keys({ stillShown: true, onStillButton: true })), 'close-and-play');
    assert.equal(spaceAction(keys({ stillShown: true, free: true })), 'close-and-play');
});

test('space: with the still up, another control keeps its own Space', () => {
    assert.equal(spaceAction(keys({ stillShown: true })), 'none');
});

test('space: the Exact frame button alone, without a still, keeps its own press', () => {
    assert.equal(spaceAction(keys({ onStillButton: true })), 'none');
});
