// Tests for what the Health page says (imported by look.test.mjs):
//   node --test scripts/look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { healthView } from '../src/lib/healthView.js';
import clips from '../src/i18n/clips.js';
import home from '../src/i18n/home.js';
import mcp from '../src/i18n/mcp.js';
import options from '../src/i18n/options.js';
import settings from '../src/i18n/settings.js';
import shell from '../src/i18n/shell.js';
import studio from '../src/i18n/studio.js';
import tray from '../src/i18n/tray.js';

const GOOD = {
    version: '2.5.0', ffmpeg_ok: true, ffmpeg_libass: true, encoder: 'h264_nvenc',
    whisper_cli: true, whisper_vulkan: true, yunet_ok: true,
    gpu_available: true, gpu_reason: 'GPU mode ON (RTX 3060, 12288MB)', jobs_dir: 'C:\\Users\\kim\\AppData\\Roaming\\digiclip\\jobs',
};
const MODELS = { 'base.en': { downloaded: true }, 'large-v3': { downloaded: false } };
const state = (over = {}) => ({ health: GOOD, conn: 'live', settings: { stt_model: 'base.en' }, models: MODELS, ...over });
const ids = (list) => list.map((x) => x.id);
const fact = (v, id) => v.facts.find((f) => f.id === id);

test('health: all well is one line and plain facts, nothing marked', () => {
    const v = healthView(state());
    assert.equal(v.overall, 'ok');
    assert.deepEqual(v.problems, []);
    assert.deepEqual(v.notes, []);
    assert.deepEqual(ids(v.facts), ['engine', 'ffmpeg', 'encoder', 'stt', 'gpu', 'storage', 'connection']);
    assert.equal(fact(v, 'engine').value, 'v2.5.0');
    assert.equal(fact(v, 'ffmpeg').value, 'with libass');
    assert.equal(fact(v, 'encoder').value, 'h264_nvenc');
    assert.equal(fact(v, 'stt').value, 'base.en, on the graphics card');
    assert.equal(fact(v, 'storage').value, GOOD.jobs_dir);
    for (const f of v.facts) assert.deepEqual(Object.keys(f).sort(), ['id', 'label', 'value']);
});

test('health: ffmpeg without libass is a fact, not a problem', () => {
    const v = healthView(state({ health: { ...GOOD, ffmpeg_libass: false } }));
    assert.equal(v.overall, 'ok');
    assert.equal(fact(v, 'ffmpeg').value, 'without libass');
});

test('health: before the first answer it is checking, with nothing to show', () => {
    for (const conn of ['boot', 'live']) {
        const v = healthView(state({ health: null, conn, settings: null, models: {} }));
        assert.equal(v.overall, 'checking');
        assert.deepEqual([v.problems, v.notes, v.facts], [[], [], []]);
    }
});

test('health: engine not connected is the first problem, even with an older answer', () => {
    for (const conn of ['retry', 'failed']) {
        const bare = healthView(state({ health: null, conn }));
        assert.equal(bare.overall, 'problem');
        assert.deepEqual(ids(bare.problems), ['connection']);
        assert.match(bare.problems[0].text, /reconnect/);
        const stale = healthView(state({ conn, models: { 'base.en': { downloaded: false } } }));
        assert.equal(stale.overall, 'problem');
        assert.equal(stale.problems[0].id, 'connection');
        assert.equal(stale.facts.some((f) => f.id === 'connection'), false);
    }
});

test('health: ffmpeg missing is a problem and drops its fact', () => {
    const v = healthView(state({ health: { ...GOOD, ffmpeg_ok: false } }));
    assert.equal(v.overall, 'problem');
    assert.deepEqual(ids(v.problems), ['ffmpeg']);
    assert.match(v.problems[0].text, /^ffmpeg wasn't found/);
    assert.equal(fact(v, 'ffmpeg'), undefined);
});

test('health: no whisper program is a problem; either build counts as present', () => {
    const none = healthView(state({ health: { ...GOOD, whisper_cli: false, whisper_vulkan: false } }));
    assert.equal(none.overall, 'problem');
    assert.deepEqual(ids(none.problems), ['whisper']);
    assert.equal(fact(none, 'stt'), undefined);
    const cpuOnly = healthView(state({ health: { ...GOOD, whisper_vulkan: false } }));
    assert.equal(cpuOnly.overall, 'ok');
    assert.equal(fact(cpuOnly, 'stt').value, 'base.en, on the processor');
    const vulkanOnly = healthView(state({ health: { ...GOOD, whisper_cli: false } }));
    assert.equal(vulkanOnly.overall, 'ok');
});

test('health: speech model not downloaded points to Settings with a button', () => {
    const v = healthView(state({ settings: { stt_model: 'large-v3' } }));
    assert.equal(v.overall, 'problem');
    assert.deepEqual(ids(v.problems), ['model']);
    assert.match(v.problems[0].text, /large-v3/);
    assert.match(v.problems[0].text, /Settings/);
    assert.deepEqual(v.problems[0].action, { kind: 'settings', label: 'Open Settings' });
});

test('health: a model on its way is a note; unknown settings or models judge nothing', () => {
    const dl = healthView(state({ models: { 'base.en': { downloaded: false, downloading: true } } }));
    assert.equal(dl.overall, 'ok');
    assert.deepEqual(ids(dl.notes), ['model']);
    assert.equal(healthView(state({ settings: null })).overall, 'ok');
    assert.equal(healthView(state({ models: {} })).overall, 'ok');
    assert.equal(healthView(state({ settings: {} })).problems.length, 0);
});

test('health: no GPU is a note with the engine reason when it gives one, never a problem', () => {
    const base = { ...GOOD, gpu_available: false, whisper_vulkan: false, encoder: 'libx264' };
    const why = healthView(state({ health: { ...base, gpu_reason: 'no GPU detected: all-CPU mode' } }));
    assert.equal(why.overall, 'ok');
    assert.deepEqual(why.problems, []);
    assert.deepEqual(ids(why.notes), ['gpu']);
    assert.match(why.notes[0].text, /processor and take longer\. \(no GPU detected: all-CPU mode\)$/);
    assert.equal(fact(why, 'gpu'), undefined);
    const bare = healthView(state({ health: { ...base, gpu_reason: '  ' } }));
    assert.equal(bare.overall, 'ok');
    assert.match(bare.notes[0].text, /take longer\.$/);
    assert.equal(healthView(state({ health: { ...base, gpu_available: null } })).notes.length, 0);
});

test('health: several problems keep the order connection, ffmpeg, whisper, model', () => {
    const v = healthView(state({
        conn: 'retry',
        health: { ...GOOD, ffmpeg_ok: false, whisper_cli: false, whisper_vulkan: false },
        models: { 'base.en': { downloaded: false } },
    }));
    assert.deepEqual(ids(v.problems), ['connection', 'ffmpeg', 'whisper', 'model']);
});

test('health: it speaks through the given translator', () => {
    const seen = [];
    healthView(state({ health: { ...GOOD, gpu_available: false, ffmpeg_ok: false } }), (s, vars) => { seen.push(s); return s.replace(/\{(\w+)\}/g, (_, k) => vars?.[k]); });
    assert.ok(seen.includes('Engine'));
    assert.ok(seen.some((s) => s.startsWith("ffmpeg wasn't found")));
});

// Every sentence the page can show has a line in all six languages.
test('health: every string it shows is translated', () => {
    const LANGS = ['sq', 'de', 'fr', 'es', 'it', 'tr'];
    const dicts = [clips, home, mcp, options, settings, shell, studio, tray];
    const spoken = new Set();
    const t = (s, vars) => { spoken.add(s); return s.replace(/\{(\w+)\}/g, (_, k) => vars?.[k]); };
    healthView(state({ conn: 'retry', health: { ...GOOD, ffmpeg_ok: false, whisper_cli: false, whisper_vulkan: false, gpu_available: false }, models: { 'base.en': { downloaded: false } } }), t);
    healthView(state({ models: { 'base.en': { downloading: true } } }), t);
    healthView(state({ health: { ...GOOD, ffmpeg_libass: false } }), t);
    healthView(state({ health: { ...GOOD, gpu_reason: '', whisper_vulkan: false } }), t);
    healthView(state({ health: { ...GOOD, gpu_available: false, gpu_reason: '' } }), t);
    for (const l of LANGS) {
        const merged = Object.assign({}, ...dicts.map((d) => d[l]));
        for (const s of spoken) assert.ok(merged[s], `${l}: ${s}`);
    }
});
