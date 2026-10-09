// Tests for saved Looks and the exact frame (imported by look.test.mjs):
//   node --test scripts/look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { CURRENT_KEY, createLookStore, defaults, fromEngine, sanitizeLook, toEngine } from '../src/lib/look.js';
import { DESIGN_KEYS, STARTERS } from '../src/lib/starterLooks.js';
import { NAME_MAX, checkName, chooseName, nextFreeName } from '../src/lib/lookNames.js';
import {
    KEPT_KEYS, UNTITLED, applyStarter, canon, deleteLook, duplicateLook, isEdited, lookList, renameLook, reservedNames, resolveCurrent, saveLook,
} from '../src/lib/lookLibrary.js';
import { lookSummary, summaryParts } from '../src/lib/lookSummary.js';
import { FRAME_CAP, frameAvailability, frameKey, frameRequest, renderTime, warningLine } from '../src/lib/exactFrame.js';

const memory = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};

const neon = { name: 'Neon night', options: { style: 'neon', count: 5, look: { v: 1, captions: { size: 1.2 } } } };
const podcast = { name: 'Podcast', options: { style: 'minimal', aspect: '1:1', progress_bar: '#FFFFFF' } };
const zed = { name: 'zed', options: { style: 'ghost' } };
const alpha = { name: 'Alpha', options: { style: 'tiktok' } };

// ---------------------------------------------------------------------------
// the merged list
// ---------------------------------------------------------------------------

test('the list is the own looks alphabetically (case ignored), then the starters in their own order', () => {
    const list = lookList([zed, neon, podcast, alpha]);
    assert.deepEqual(list.mine.map((m) => m.name), ['Alpha', 'Neon night', 'Podcast', 'zed']);
    assert.ok(list.mine.every((m) => m.kind === 'mine'));
    assert.deepEqual(list.starters.map((s) => s.name), ['Classic', 'Punch', 'Quiet', 'Neon', 'Marker']);
    assert.ok(list.starters.every((s) => s.kind === 'starter' && s.blurb));
});

test('a starter whose name an own look already has is left out, so a name means one look; junk presets are skipped', () => {
    const list = lookList([{ name: 'neon', options: { style: 'neon' } }, null, { name: '', options: {} }, { name: 'x' }, { name: 'ok', options: { style: 'ghost' } }]);
    assert.deepEqual(list.mine.map((m) => m.name), ['neon', 'ok']);
    assert.ok(!list.starters.some((s) => s.name === 'Neon'));
    assert.equal(resolveCurrent(list, 'neon').kind, 'mine');
    assert.equal(lookList(undefined).mine.length, 0);
});

test('the six starters are all there with plain names and one line each', () => {
    assert.equal(STARTERS.length, 6);
    assert.equal(new Set(STARTERS.map((s) => s.name.toLowerCase())).size, 6);
    for (const s of STARTERS) {
        assert.ok(s.name.length <= 12 && !/\s/.test(s.name), s.name);
        assert.ok(s.blurb.length > 10 && s.blurb.length <= 90 && !s.blurb.includes('\n'), s.name);
    }
    assert.equal(new Set(STARTERS.map((s) => s.options.style)).size, 6);
});

test('a stored name finds its look: own first, then a starter; a name that is gone is an unsaved Untitled', () => {
    const list = lookList([neon]);
    assert.equal(resolveCurrent(list, 'Neon night').options, neon.options);
    assert.equal(resolveCurrent(list, 'Quiet').kind, 'starter');
    assert.deepEqual(resolveCurrent(list, 'Deleted one'), { kind: 'untitled', name: UNTITLED });
    assert.equal(resolveCurrent(list, null).kind, 'untitled');
    assert.equal(isEdited(defaults(), resolveCurrent(list, null)), false);
});

// ---------------------------------------------------------------------------
// names
// ---------------------------------------------------------------------------

test('a name is trimmed, 1 to 40 characters', () => {
    assert.deepEqual(checkName('  Podcast  ', []), { kind: 'ok', name: 'Podcast' });
    assert.deepEqual(checkName('   ', []), { kind: 'invalid', reason: 'empty' });
    assert.deepEqual(checkName(undefined, []), { kind: 'invalid', reason: 'empty' });
    assert.equal(checkName('x'.repeat(NAME_MAX), []).kind, 'ok');
    assert.deepEqual(checkName('x'.repeat(NAME_MAX + 1), []), { kind: 'invalid', reason: 'long' });
    assert.equal(chooseName('', []), null);
});

test('names are unique without regard to case, and a clash offers the next free "Name 2"', () => {
    const own = ['Podcast', 'Podcast 2'];
    assert.deepEqual(checkName('podcast', own), { kind: 'clash', name: 'podcast', suggest: 'podcast 3' });
    assert.deepEqual(checkName('Podcast', own), { kind: 'clash', name: 'Podcast', suggest: 'Podcast 3' });
    assert.deepEqual(chooseName('PODCAST', own), { name: 'PODCAST 3', replace: false });
    assert.equal(checkName('Podcast 3', own).kind, 'ok');
});

test('starter names are reserved, in English and as shown', () => {
    const reserved = reservedNames(STARTERS, (s) => (s === 'Quiet' ? 'Ruhig' : s));
    assert.ok(reserved.includes('Ruhig') && reserved.includes('Quiet') && reserved.includes('Neon'));
    assert.deepEqual(checkName('neon', [], { reserved }), { kind: 'clash', name: 'neon', suggest: 'neon 2' });
    assert.equal(checkName('RUHIG', [], { reserved }).kind, 'clash');
    assert.equal(checkName('Neon 2', [], { reserved }).kind, 'ok');
});

test('save-as onto the exact name of an own look asks to replace; another case is a clash', () => {
    assert.deepEqual(checkName('Podcast', ['Podcast'], { allowReplace: true }), { kind: 'replace', name: 'Podcast' });
    assert.deepEqual(chooseName('Podcast', ['Podcast'], { allowReplace: true }), { name: 'Podcast', replace: true });
    assert.equal(checkName('podcast', ['Podcast'], { allowReplace: true }).kind, 'clash');
});

test('a look does not clash with itself when renamed, even to another case', () => {
    assert.deepEqual(checkName('podcast', ['Podcast', 'Other'], { except: 'Podcast' }), { kind: 'ok', name: 'podcast' });
    assert.deepEqual(checkName('Podcast', ['Podcast', 'Other'], { except: 'Podcast' }), { kind: 'ok', name: 'Podcast' });
    assert.equal(checkName('other', ['Podcast', 'Other'], { except: 'Podcast' }).kind, 'clash');
});

test('the next free name counts on, skips taken ones and stays inside the length limit', () => {
    assert.equal(nextFreeName('Neon', ['Neon']), 'Neon 2');
    assert.equal(nextFreeName('Neon', ['neon', 'NEON 2', 'Neon 3']), 'Neon 4');
    assert.equal(nextFreeName('Neon 2', ['Neon', 'Neon 2']), 'Neon 3');
    assert.equal(nextFreeName('Top 10', ['Top 10']), 'Top 10 2');
    const long = 'y'.repeat(NAME_MAX);
    const next = nextFreeName(long, [long]);
    assert.equal(next.length, NAME_MAX);
    assert.ok(next.endsWith(' 2'));
});

// ---------------------------------------------------------------------------
// edited
// ---------------------------------------------------------------------------

test('a look loaded is not edited; one field changed is; the way back is not', () => {
    const entry = lookList([neon]).mine[0];
    const working = fromEngine(neon.options, null);
    assert.equal(isEdited(working, entry, null), false);
    const edited = { ...working, look: { ...working.look, captions: { ...working.look.captions, size: 1.3 } } };
    assert.equal(isEdited(edited, entry, null), true);
    assert.equal(isEdited({ ...working, count: 4 }, entry, null), true);
    assert.equal(isEdited({ ...working, look: { ...working.look, captions: { size: 1.2 } } }, entry, null), false);
});

test('unset fields and key order do not make a look edited', () => {
    const entry = { kind: 'mine', name: 'a', options: { style: 'neon', count: 5, look: { v: 1, captions: { x: 0.4, y: 0.6, size: 1.2 } } } };
    const working = fromEngine({ look: { captions: { size: 1.2, y: 0.6, x: 0.4 } }, count: 5, style: 'neon', aspect: '9:16', layout: 'single' }, null);
    assert.equal(isEdited(working, entry, null), false);
    assert.equal(canon({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }), canon({ a: { c: null, d: [2, { y: 2, z: 1 }] }, b: 1 }));
    assert.notEqual(canon({ a: 1 }), canon({ a: 2 }));
});

test('a starter is edited by its design only: the cut, the files and the text are the person\'s', () => {
    const punch = lookList([]).starters.find((s) => s.name === 'Punch');
    const base = defaults();
    const working = applyStarter(base, punch, null);
    assert.equal(isEdited(working, punch, null), false);
    assert.equal(isEdited({ ...working, count: 9, kind: 'moments', logo: 'C:\\logo.png', music: 'C:\\m.mp3', headline_text: 'Hi', focus: 'guest', tighten: 'hard', subs_lang: 'de' }, punch, null), false);
    assert.equal(isEdited({ ...working, style: 'neon' }, punch, null), true);
    assert.equal(isEdited({ ...working, look: { ...working.look, camera: { feel: 'locked' } } }, punch, null), true);
});

// ---------------------------------------------------------------------------
// the operations
// ---------------------------------------------------------------------------

test('save replaces in place when the look exists and appends when it does not', () => {
    const presets = [alpha, neon, zed];
    const o = { style: 'beast' };
    assert.deepEqual(saveLook(presets, 'Neon night', o), [alpha, { name: 'Neon night', options: o }, zed]);
    assert.deepEqual(saveLook(presets, 'New', o), [...presets, { name: 'New', options: o }]);
    assert.equal(presets.length, 3);
    assert.deepEqual(saveLook(undefined, 'First', o), [{ name: 'First', options: o }]);
});

test('rename keeps place and options, and leaves the others alone', () => {
    const next = renameLook([alpha, neon, zed], 'Neon night', 'Night');
    assert.deepEqual(next, [alpha, { name: 'Night', options: neon.options }, zed]);
    assert.deepEqual(renameLook([alpha], 'Missing', 'x'), [alpha]);
});

test('duplicate adds a copy under the next free name and does not touch the original', () => {
    const r = duplicateLook([alpha, { name: 'Alpha 2', options: {} }], 'Alpha', alpha.options, ['Quiet']);
    assert.equal(r.name, 'Alpha 3');
    assert.equal(r.presets.length, 3);
    assert.deepEqual(r.presets[2], { name: 'Alpha 3', options: alpha.options });
    assert.equal(duplicateLook([], 'Quiet', {}, ['Quiet']).name, 'Quiet 2');
    assert.equal(duplicateLook([], UNTITLED, {}).name, 'Untitled 2');
});

test('delete removes the look by name and keeps every other entry as it was', () => {
    const junk = { weird: true };
    assert.deepEqual(deleteLook([alpha, junk, neon], 'Alpha'), [junk, neon]);
    assert.deepEqual(deleteLook([alpha], 'Nope'), [alpha]);
    assert.deepEqual(deleteLook(undefined, 'x'), []);
    assert.deepEqual(renameLook([junk, alpha], 'Alpha', 'B'), [junk, { name: 'B', options: alpha.options }]);
});

// ---------------------------------------------------------------------------
// starters
// ---------------------------------------------------------------------------

test('a starter applied keeps the cut, the caption language, the files and the typed text, and sets the design', () => {
    const mine = {
        ...defaults(),
        kind: 'moments', count: 7, dur_mode: 'minmax', dur_min: 20, dur_max: 45, tighten: 'hard', focus: 'the guest', subs_lang: 'de', merge_flash: true,
        logo: 'C:\\brand\\logo.png', logo_pos: 'bl', music: 'C:\\m\\bed.mp3', music_db: -10, headline_text: 'My title',
        style: 'beast', aspect: '1:1', caption_anim: 'words', headline: true, progress_bar: true, bar_color: '#123456', layout: 'split', punch: false,
        look: { captions: { size: 1.5, x: 0.2 }, camera: { zoom: 1.2 } },
    };
    const neonStarter = lookList([]).starters.find((s) => s.name === 'Neon');
    const out = applyStarter(mine, neonStarter, null);
    for (const k of KEPT_KEYS) assert.deepEqual(out[k], mine[k], k);
    assert.equal(out.style, 'neon');
    assert.equal(out.aspect, '9:16');
    assert.equal(out.caption_anim, 'pop');
    assert.equal(out.headline, false);
    assert.equal(out.progress_bar, true);
    assert.equal(out.bar_color, '#00FFFF');
    assert.equal(out.layout, 'single');
    assert.equal(out.punch, true);
    assert.deepEqual(out.look, sanitizeLook(neonStarter.options.look));
    assert.equal(out.look.captions.size, undefined);
    assert.equal(out.look.camera, undefined);
    assert.equal(mine.style, 'beast');
});

test('Classic is today\'s defaults: applied to a fresh working copy it changes nothing', () => {
    const classic = lookList([]).starters[0];
    assert.equal(classic.name, 'Classic');
    assert.deepEqual(applyStarter(defaults(), classic, null), defaults());
    const touched = { ...defaults(), style: 'ghost', progress_bar: true, look: { captions: { size: 1.4 }, effects: { vignette: 0.5 } } };
    assert.equal(canon(applyStarter(touched, classic, null)), canon(defaults()));
});

test('every starter survives the store\'s own cleaning unchanged', () => {
    for (const s of STARTERS) {
        const look = s.options.look ?? {};
        const clean = sanitizeLook(look);
        for (const sec of Object.keys(look)) assert.deepEqual(clean[sec], look[sec], `${s.name}.${sec}`);
        for (const sec of Object.keys(clean)) assert.ok(sec === 'captions' || sec in look, `${s.name} gains ${sec}`);
        // The whole thing round-trips through the panel state to the same engine options.
        const once = toEngine(fromEngine(s.options, null));
        assert.equal(canon(toEngine(fromEngine(once, null))), canon(once), s.name);
        // Nothing was dropped: what it says is what the engine would be sent.
        for (const k of Object.keys(s.options)) if (k !== 'look') assert.deepEqual(once[k], s.options[k], `${s.name}.${k}`);
    }
});

test('a starter carries design only: no file, no headline text, no focus, no cut', () => {
    const forbidden = ['logo', 'logo_pos', 'music', 'music_db', 'headline_text', 'focus', 'kind', 'count', 'min_len', 'max_len', 'dur_mode', 'tighten', 'subs_lang', 'merge_flash', 'mode', 'framing', 'kit'];
    for (const s of STARTERS) {
        for (const k of Object.keys(s.options)) {
            assert.ok(DESIGN_KEYS.includes(k), `${s.name} sets ${k}`);
            assert.ok(!forbidden.includes(k), `${s.name} sets ${k}`);
        }
        assert.ok(s.options.headline === undefined || s.options.headline === '', `${s.name} headline text`);
        const text = JSON.stringify(s.options);
        assert.ok(!/[A-Za-z]:\\|\.(png|jpg|jpeg|webp|mp3|wav|m4a|ogg)|\//i.test(text), `${s.name} has a path`);
        const bar = fromEngine(s.options, null);
        assert.equal(bar.logo, '');
        assert.equal(bar.music, '');
        assert.equal(bar.focus, '');
        assert.equal(bar.headline_text, '');
    }
});

test('the starters are clearly different from each other', () => {
    const sigs = STARTERS.map((s) => canon(toEngine(fromEngine(s.options, null))));
    assert.equal(new Set(sigs).size, STARTERS.length);
    const parts = STARTERS.map((s) => summaryParts(s.options));
    assert.equal(new Set(parts.map((p) => p.style)).size, STARTERS.length);
});

// ---------------------------------------------------------------------------
// row summaries
// ---------------------------------------------------------------------------

test('a summary is the style, the shape and up to two traits', () => {
    assert.equal(lookSummary({ style: 'minimal' }), 'minimal · 9:16');
    assert.equal(lookSummary({ style: 'neon', aspect: '1:1,9:16', progress_bar: '#00FFFF', headline: '', look: { effects: { grade: 'cool', vignette: 0.4 } } }), 'neon · 1:1 · Headline · Progress bar');
    assert.equal(lookSummary({ style: 'hormozi', look: { captions: { words: { mode: 'single' }, glow: { size: 10 } }, camera: { feel: 'lively' } } }), 'hormozi · 9:16 · One word at a time · Glowing words');
    assert.equal(lookSummary({ style: 'tiktok', layout: 'auto', punch: false }), 'tiktok · 9:16 · Auto split · No punch-ins');
    assert.deepEqual(summaryParts({ style: 'ghost', logo: 'a.png', music: 'b.mp3', look: { effects: { vignette: 0.2 } } }).traits, ['Vignette', 'Logo']);
});

test('summary phrases pass through the translator, the style and shape do not', () => {
    const tr = (s) => `<${s}>`;
    assert.equal(lookSummary({ style: 'neon', progress_bar: '#FFFFFF' }, tr), 'neon · 9:16 · <Progress bar>');
    assert.equal(lookSummary(undefined), 'karaoke · 9:16');
});

// ---------------------------------------------------------------------------
// the exact frame
// ---------------------------------------------------------------------------

const sample = (over = {}) => ({ job: { id: 'job-1' }, start: 41.5, len: 12, ...over });

test('the request names the job, the window, the playhead and the options the engine would get', () => {
    const working = { ...defaults(), style: 'neon', aspect: '4:5' };
    const r = frameRequest(working, sample(), 3.25);
    assert.deepEqual(r, { job: 'job-1', start_s: 41.5, len_s: 12, t: 3.25, options: toEngine(working) });
    assert.equal(r.options.aspect, '4:5');
    assert.equal(frameRequest(working, sample(), -2).t, 0);
    assert.equal(frameRequest(working, sample(), 99).t, 12);
    assert.equal(frameRequest(working, sample(), NaN).t, 0);
    assert.equal(frameRequest(working, sample({ start: 41.12345678 }), 1.23456789).start_s, 41.123);
    assert.equal(frameRequest(working, sample({ start: 41.12345678 }), 1.23456789).t, 1.235);
});

test('the stand-in has no frame to ask for', () => {
    assert.equal(frameRequest(defaults(), { job: null, start: 0, len: 6 }, 1), null);
    assert.equal(frameRequest(defaults(), null, 1), null);
});

test('the staleness key changes with the look, the shape, the sample and the playhead, and with nothing else', () => {
    const w = defaults();
    const k = frameKey(w, sample(), 2);
    assert.equal(frameKey({ ...w }, sample(), 2), k);
    assert.notEqual(frameKey({ ...w, style: 'neon' }, sample(), 2), k);
    assert.notEqual(frameKey({ ...w, look: { captions: { size: 1.1 } } }, sample(), 2), k);
    assert.notEqual(frameKey({ ...w, progress_bar: true }, sample(), 2), k);
    assert.notEqual(frameKey({ ...w, aspect: '1:1' }, sample(), 2), k);
    assert.notEqual(frameKey(w, sample({ job: { id: 'job-2' } }), 2), k);
    assert.notEqual(frameKey(w, sample({ start: 50 }), 2), k);
    assert.notEqual(frameKey(w, sample({ len: 9 }), 2), k);
    assert.notEqual(frameKey(w, sample(), 2.5), k);
    // Not the cut, and not the shapes that are only further runs.
    assert.equal(frameKey({ ...w, count: 9, tighten: 'hard', kind: 'moments', dur_mode: 'exact', dur_exact: 20 }, sample(), 2), k);
    assert.equal(frameKey({ ...w, aspect: '9:16,1:1' }, sample(), 2), k);
    assert.notEqual(frameKey({ ...w, aspect: '1:1,9:16' }, sample(), 2), k);
});

test('the exact frame needs the capability and a real video, and says why not', () => {
    assert.deepEqual(frameAvailability([FRAME_CAP, 'look'], true), { ok: true, reason: null });
    const old = frameAvailability(['look'], true);
    assert.equal(old.ok, false);
    assert.match(old.reason, /engine/);
    const none = frameAvailability([FRAME_CAP], false);
    assert.equal(none.ok, false);
    assert.match(none.reason, /stand-in/);
    assert.equal(frameAvailability(undefined, true).ok, false);
});

test('the render time and the warnings read as one short line each', () => {
    assert.equal(renderTime(3412), '3.4 s');
    assert.equal(renderTime(undefined), '0.0 s');
    assert.equal(warningLine(['headline cut off', '  ', 'no face found']), 'headline cut off · no face found');
    assert.equal(warningLine(undefined), '');
});

// ---------------------------------------------------------------------------
// loading a look in the store
// ---------------------------------------------------------------------------

test('loading a look is one undo step: undo brings the previous working copy back exactly, name included', () => {
    const storage = memory();
    const store = createLookStore({ storage, now: () => 0 });
    store.seed(null);
    store.update({ count: 7 });
    store.setCaptions({ size: 1.4 });
    store.setCurrent('Mine');
    const before = store.get().options;
    const beforeJson = JSON.stringify(before);

    const punch = lookList([]).starters.find((s) => s.name === 'Punch');
    store.load(applyStarter(before, punch, null), punch.name);
    assert.equal(store.get().current, 'Punch');
    assert.equal(store.get().options.style, 'hormozi');
    assert.equal(store.get().options.count, 7);
    assert.equal(storage.getItem(CURRENT_KEY), 'Punch');

    store.undo();
    assert.equal(JSON.stringify(store.get().options), beforeJson);
    assert.equal(store.get().options, before);
    assert.equal(store.get().current, 'Mine');
    assert.equal(storage.getItem(CURRENT_KEY), 'Mine');

    store.redo();
    assert.equal(store.get().current, 'Punch');
    assert.equal(store.get().options.style, 'hormozi');
});

test('one load is one step even after rapid edits, and loading can be undone back through edits', () => {
    let clock = 0;
    const store = createLookStore({ storage: memory(), now: () => clock });
    store.seed(null);
    store.setCaptions({ size: 1.1 });
    clock += 10;
    store.setCaptions({ size: 1.2 });
    const edited = store.get().options;
    store.load(fromEngine(neon.options, null), 'Neon night');
    store.setCaptions({ size: 0.8 });
    store.undo();
    assert.equal(store.get().options.look.captions.size, 1.2);
    assert.equal(store.get().current, 'Neon night');
    store.undo();
    assert.equal(store.get().options, edited);
    assert.equal(store.get().current, null);
    assert.equal(store.get().canUndo, true);
});

test('loading the same options only names them: no step, nothing to undo', () => {
    const store = createLookStore({ storage: memory(), now: () => 0 });
    store.seed(null);
    store.load(fromEngine(neon.options, null), 'Neon night');
    store.undo();
    const was = store.get().options;
    store.load({ ...was }, 'Other');
    assert.equal(store.get().current, 'Other');
    assert.equal(store.get().canUndo, false);
    assert.equal(store.get().options, was);
});

test('the current look is kept in its own key, survives a reload, and edits stay on it', () => {
    const storage = memory();
    const a = createLookStore({ storage, now: () => 0 });
    a.seed(null);
    a.load(fromEngine(neon.options, null), 'Neon night');
    a.update({ count: 2 });
    assert.equal(a.get().current, 'Neon night');
    assert.ok(storage.getItem('digiclip.jobOptions'));
    const b = createLookStore({ storage, now: () => 0 });
    b.seed(null);
    assert.equal(b.get().current, 'Neon night');
    assert.equal(b.get().options.count, 2);
    b.setCurrent(null);
    assert.equal(storage.getItem(CURRENT_KEY), null);
    assert.equal(b.get().canUndo, false);
});
