// Tests for what the app says about first-run downloads:
//   node --test scripts/setup.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { setupItem, setupLabel, setupView } from '../src/lib/setupView.js';
import { healthView } from '../src/lib/healthView.js';
import { stageText, stepOf, phaseOf } from '../src/lib/homeList.js';
import clips from '../src/i18n/clips.js';
import home from '../src/i18n/home.js';
import mcp from '../src/i18n/mcp.js';
import options from '../src/i18n/options.js';
import settings from '../src/i18n/settings.js';
import setup from '../src/i18n/setup.js';
import shell from '../src/i18n/shell.js';
import studio from '../src/i18n/studio.js';
import tray from '../src/i18n/tray.js';

const item = (id, state, over = {}) => ({ id, size_mb: 100, state, ...over });
const ALL_READY = [item('face', 'ready', { size_mb: 1 }), item('ffmpeg', 'ready', { size_mb: 115 }), item('stt', 'ready', { model: 'base.en', size_mb: 142 }), item('yt-dlp', 'ready', { size_mb: 18 }), item('laya', 'ready', { size_mb: 1612 })];
const withState = (id, state, over = {}) => ALL_READY.map((it) => (it.id === id ? { ...it, state, ...over } : it));

test('setup: nothing known and nothing left both say nothing', () => {
    for (const s of [null, undefined, [], ALL_READY]) {
        const v = setupView(s);
        assert.equal(v.phase, 'idle');
        assert.equal(v.banner, null);
        assert.equal(v.needed, false);
    }
    assert.equal(setupView(null).known, false);
    assert.equal(setupView(ALL_READY).known, true);
    assert.equal(setupView(ALL_READY).items.length, 5);
});

test('setup: a fresh install says what is coming down and how far it is', () => {
    const fresh = [
        item('face', 'ready', { size_mb: 1 }),
        item('ffmpeg', 'downloading', { size_mb: 115, pct: 43 }),
        item('stt', 'missing', { model: 'base.en', size_mb: 142 }),
        item('yt-dlp', 'missing', { size_mb: 18 }),
        item('laya', 'missing', { size_mb: 1612 }),
    ];
    const v = setupView(fresh);
    assert.equal(v.phase, 'working');
    assert.equal(v.needed, true);
    assert.equal(v.banner.title, 'Getting DigiClip ready');
    assert.equal(v.banner.text, 'Downloading ffmpeg… 43%');
    assert.equal(v.banner.count, '1 of 5 ready');
    assert.equal(v.banner.pct, 43);
    assert.equal(v.banner.retry, false);
    assert.deepEqual(v.items.map((i) => i.line), ['Ready', 'Downloading… 43%', 'Next in line', 'Next in line', 'Next in line']);
    assert.deepEqual(v.items.map((i) => i.size), ['1 MB', '115 MB', '142 MB', '18 MB', '1.6 GB']);
    assert.equal(v.items[2].label, 'Speech model base.en');
    // Before the first byte there is no percent to show.
    assert.equal(setupView(withState('ffmpeg', 'downloading')).banner.text, 'Downloading ffmpeg…');
    // Between two downloads the next one is named.
    assert.equal(setupView(withState('yt-dlp', 'missing')).banner.text, 'Downloading Link downloader…');
});

test('setup: only extras left is a quieter title; a clip can already be made', () => {
    const v = setupView(withState('laya', 'downloading', { pct: 7 }));
    assert.equal(v.needed, false);
    assert.equal(v.banner.title, 'Finishing setup in the background');
    assert.equal(v.banner.text, 'Downloading Laya clip judge… 7%');
    assert.equal(v.banner.count, '4 of 5 ready');
});

test('setup: a dropped connection is waiting, not failing', () => {
    const v = setupView(withState('stt', 'waiting', { pct: 61, why: 'the connection dropped' }));
    assert.equal(v.phase, 'working');
    assert.equal(v.banner.tone, 'work');
    assert.equal(v.banner.text, 'Speech model base.en: waiting for the connection…');
    assert.equal(v.banner.pct, null, 'no bar that looks stuck');
    const it = v.items.find((i) => i.id === 'stt');
    assert.equal(it.line, 'Waiting for the connection. It carries on by itself.');
    assert.equal(it.why, 'the connection dropped');
});

test('setup: failed downloads say which, that it retries, and offer to retry now', () => {
    const s = withState('ffmpeg', 'failed', { why: 'ffmpeg download failed: no connection.' }).map((it) => (it.id === 'laya' ? { ...it, state: 'failed' } : it));
    const v = setupView(s);
    assert.equal(v.phase, 'stuck');
    assert.equal(v.banner.tone, 'bad');
    assert.equal(v.banner.retry, true);
    assert.match(v.banner.text, /^ffmpeg, Laya clip judge: not downloaded yet\. It tries again by itself/);
    assert.equal(v.items.find((i) => i.id === 'ffmpeg').why, 'ffmpeg download failed: no connection.');
    // Something else still coming down: that is what the line is about.
    const mixed = setupView(s.map((it) => (it.id === 'stt' ? { ...it, state: 'downloading', pct: 5 } : it)));
    assert.equal(mixed.phase, 'working');
    assert.equal(mixed.banner.retry, false);
});

test('setup: odd input never throws', () => {
    assert.equal(setupView('nope').phase, 'idle');
    assert.equal(setupView([null, 7, { id: 3 }]).items.length, 0);
    const v = setupView([{ id: 'new-thing', state: 'downloading', pct: 250 }]);
    assert.equal(v.items[0].label, 'new-thing');
    assert.equal(v.items[0].pct, 100);
    assert.equal(setupLabel(null), '');
    assert.equal(setupItem(null, 'ffmpeg'), null);
    assert.equal(setupItem(ALL_READY, 'stt', 'large-v3'), null, 'another model than the one picked');
    assert.equal(setupItem(ALL_READY, 'stt', 'base.en').id, 'stt');
});

// --- what Health makes of it -------------------------------------------------

const GOOD = {
    version: '2.9.0', ffmpeg_ok: true, ffmpeg_libass: true, encoder: 'libx264',
    stt_embedded: true, whisper_cli: false, whisper_vulkan: false, yunet_ok: true,
    gpu_available: true, gpu_reason: 'GPU mode ON', jobs_dir: 'C:\\jobs',
};
const state = (over = {}) => ({ health: GOOD, conn: 'live', settings: { stt_model: 'base.en' }, models: { 'base.en': { downloaded: true } }, setup: ALL_READY, ...over });
const ids = (list) => list.map((x) => x.id);

test('health: a fresh install is not told its speech-to-text is missing', () => {
    const v = healthView(state());
    assert.equal(v.overall, 'ok');
    assert.deepEqual(v.problems, []);
    assert.equal(v.facts.find((f) => f.id === 'stt').value, 'base.en, on the processor');
    // An engine that says nothing about it and has neither program still is.
    const old = healthView(state({ health: { ...GOOD, stt_embedded: undefined } }));
    assert.deepEqual(ids(old.problems), ['whisper']);
});

test('health: while ffmpeg and the model download, that is a note and "getting ready", not a problem', () => {
    const v = healthView(state({
        health: { ...GOOD, ffmpeg_ok: false, ffmpeg_libass: false },
        models: { 'base.en': { downloaded: false } },
        setup: withState('ffmpeg', 'downloading', { pct: 12 }).map((it) => (it.id === 'stt' ? { ...it, state: 'missing' } : it)),
    }));
    assert.equal(v.overall, 'setup');
    assert.deepEqual(v.problems, []);
    assert.deepEqual(ids(v.notes), ['ffmpeg', 'model']);
    assert.match(v.notes[0].text, /^ffmpeg is downloading/);
    assert.match(v.notes[1].text, /base\.en downloads by itself/);
    // Waiting for the connection is still on its way.
    const waiting = healthView(state({ health: { ...GOOD, ffmpeg_ok: false }, setup: withState('ffmpeg', 'waiting') }));
    assert.equal(waiting.overall, 'setup');
});

test('health: a download that failed is a problem with a way to try again now', () => {
    const v = healthView(state({
        health: { ...GOOD, ffmpeg_ok: false },
        models: { 'base.en': { downloaded: false, error: 'no connection' } },
        setup: withState('ffmpeg', 'failed').map((it) => (it.id === 'stt' ? { ...it, state: 'failed' } : it)),
    }));
    assert.equal(v.overall, 'problem');
    assert.deepEqual(ids(v.problems), ['ffmpeg', 'model']);
    for (const p of v.problems) {
        assert.deepEqual(p.action, { kind: 'retry', label: 'Try again' });
        assert.match(p.text, /It tries again by itself; check the internet connection\.$/);
        assert.doesNotMatch(p.text, /einstall|Settings/);
    }
});

test('health: without word from the engine the old advice stands', () => {
    const v = healthView(state({ health: { ...GOOD, ffmpeg_ok: false }, models: { 'base.en': { downloaded: false } }, setup: null }));
    assert.deepEqual(ids(v.problems), ['ffmpeg', 'model']);
    assert.match(v.problems[0].text, /downloads ffmpeg by itself/);
    assert.equal(v.problems[1].action.kind, 'settings');
    // The list is about another model than the one picked: same.
    const other = healthView(state({ settings: { stt_model: 'large-v3' }, models: { 'large-v3': { downloaded: false } } }));
    assert.equal(other.problems[0].action.kind, 'settings');
});

// --- the job that waits for it ------------------------------------------------

test('home: a video whose engine is fetching what it needs is not "waiting for its turn"', () => {
    assert.equal(phaseOf({ status: 'preparing' }), 'working');
    assert.equal(stepOf('preparing'), 1);
    const s = stageText('preparing');
    assert.equal(s.title, 'Getting things ready');
    assert.notEqual(s.title, stageText('queued').title);
    assert.match(s.hint, /downloads a few things/);
});

test('setup: every sentence is in all six languages', () => {
    const dicts = [clips, home, mcp, options, settings, setup, shell, studio, tray];
    const spoken = new Set();
    const t = (s, vars) => { spoken.add(s); return s.replace(/\{(\w+)\}/g, (_, k) => vars?.[k]); };
    for (const st of ['ready', 'downloading', 'waiting', 'failed', 'missing']) {
        for (const id of ['face', 'ffmpeg', 'stt', 'yt-dlp', 'laya']) {
            setupView(withState(id, st), t);
            setupView(withState(id, st, { pct: 5 }), t);
            healthView(state({ health: { ...GOOD, ffmpeg_ok: false }, models: { 'base.en': { downloaded: false } }, setup: withState(id, st) }), t);
        }
    }
    healthView(state({ health: { ...GOOD, ffmpeg_ok: false }, setup: null }), t);
    stageText('preparing', t);
    spoken.add('First-time downloads');
    spoken.add('DigiClip fetches these by itself. If the connection drops, it carries on where it stopped.');
    spoken.add('DigiClip is downloading what it needs. It will be ready in a moment.');
    spoken.add('Details');
    for (const l of ['sq', 'de', 'fr', 'es', 'it', 'tr']) {
        const merged = Object.assign({}, ...dicts.map((d) => d[l]));
        for (const s of spoken) assert.ok(merged[s], `${l}: ${s}`);
        // A translation keeps every placeholder of its sentence.
        for (const [k, v] of Object.entries(setup[l])) {
            assert.deepEqual((v.match(/\{\w+\}/g) ?? []).sort(), (k.match(/\{\w+\}/g) ?? []).sort(), `${l}: ${k}`);
        }
    }
});
