// Tests for what the Health page says (imported by look.test.mjs):
//   node --test scripts/look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { healthView, platformOf } from '../src/lib/healthView.js';
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

test('health: ffmpeg without libass is a problem that says what it means and what to do', () => {
    const v = healthView(state({ health: { ...GOOD, ffmpeg_libass: false } }));
    assert.equal(v.overall, 'problem');
    assert.deepEqual(ids(v.problems), ['libass']);
    assert.match(v.problems[0].text, /burn captions/);
    assert.match(v.problems[0].text, /build that includes libass/);
    assert.doesNotMatch(v.problems[0].text, /Reinstall|remove|delete/i);
    assert.equal(fact(v, 'ffmpeg'), undefined);
    // Unknown libass (older engine) judges nothing; missing ffmpeg is the ffmpeg problem only.
    assert.equal(healthView(state({ health: { ...GOOD, ffmpeg_libass: undefined } })).problems.length, 0);
    assert.deepEqual(ids(healthView(state({ health: { ...GOOD, ffmpeg_ok: false, ffmpeg_libass: false } })).problems), ['ffmpeg']);
    assert.deepEqual(ids(healthView(state({ health: { ...GOOD, ffmpeg_ok: null, ffmpeg_libass: false } })).problems), []);
});

test('health: missing ffmpeg says what is true for the system, never "reinstall"', () => {
    const text = (platform) => healthView(state({ platform, health: { ...GOOD, ffmpeg_ok: false } })).problems[0].text;
    assert.match(text('windows'), /downloads ffmpeg by itself.*80 MB.*internet/);
    assert.doesNotMatch(text('windows'), /brew|apt/);
    assert.match(text('macos'), /Homebrew \(brew install ffmpeg\)/);
    assert.doesNotMatch(text('macos'), /80 MB|apt/);
    assert.match(text('linux'), /apt install ffmpeg.*dnf install ffmpeg/);
    assert.doesNotMatch(text('linux'), /brew|80 MB/);
    for (const p of [undefined, '', 'plan9']) {
        assert.match(text(p), /On Windows.*80 MB.*On macOS and Linux.*brew install ffmpeg.*apt install ffmpeg.*dnf install ffmpeg/);
    }
    for (const p of ['windows', 'macos', 'linux', '']) assert.doesNotMatch(text(p), /einstall/i);
});

test('health: the speech-to-text advice still says reinstall (it ships with the app)', () => {
    const v = healthView(state({ health: { ...GOOD, whisper_cli: false, whisper_vulkan: false } }));
    assert.match(v.problems[0].text, /Reinstalling DigiClip brings it back/);
});

test('health: the platform comes from the webview user agent', () => {
    assert.equal(platformOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/130.0'), 'windows');
    assert.equal(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'), 'macos');
    assert.equal(platformOf('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15'), 'linux');
    assert.equal(platformOf(''), '');
    assert.equal(platformOf(undefined), '');
});

test('health: before the first answer it is checking, with nothing to show', () => {
    for (const conn of ['boot', 'live']) {
        const v = healthView(state({ health: null, conn, settings: null, models: {} }));
        assert.equal(v.overall, 'checking');
        assert.deepEqual([v.problems, v.notes, v.facts], [[], [], []]);
    }
});

test('health: unknown (null, undefined) is checking even when settings and models are known, and invents nothing', () => {
    const models = { 'base.en': { downloaded: false }, 'large-v3': { downloaded: false } };
    for (const health of [null, undefined]) {
        for (const platform of ['windows', 'macos', 'linux', '']) {
            const v = healthView(state({ health, conn: 'live', platform, models }));
            assert.equal(v.overall, 'checking');
            assert.deepEqual([v.problems, v.notes, v.facts], [[], [], []]);
        }
    }
    assert.equal(healthView({ health: null }).overall, 'checking');
    assert.equal(healthView().overall, 'checking');
});

test('health: the same state fills in when the answer arrives (null then object)', () => {
    const before = healthView(state({ health: null }));
    const after = healthView(state({ health: GOOD }));
    assert.equal(before.overall, 'checking');
    assert.equal(after.overall, 'ok');
    assert.ok(after.facts.length > 0);
    // A late answer that finds a problem is a problem, not "checking".
    assert.equal(healthView(state({ health: { ...GOOD, ffmpeg_ok: false } })).overall, 'problem');
});

test('health: unknown while the engine is down is the connection problem only', () => {
    const v = healthView(state({ health: null, conn: 'retry' }));
    assert.equal(v.overall, 'problem');
    assert.deepEqual(ids(v.problems), ['connection']);
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

// The checking sentence, the re-check link and the graphics-card line while unknown.
test('health: the unknown-state strings are translated', () => {
    const merged = (l) => Object.assign({}, ...[clips, home, mcp, options, settings, shell, studio, tray].map((d) => d[l]));
    for (const l of ['sq', 'de', 'fr', 'es', 'it', 'tr']) {
        for (const s of ['Checking that everything DigiClip needs is working…', 'Check again', 'Checking…', 'Checking for a compatible graphics card…', "Couldn't check health: {error}"]) {
            assert.ok(merged(l)[s], `${l}: ${s}`);
        }
    }
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
    for (const platform of ['windows', 'macos', 'linux', '']) healthView(state({ platform, health: { ...GOOD, ffmpeg_ok: false } }), t);
    healthView(state({ health: { ...GOOD, gpu_reason: '', whisper_vulkan: false } }), t);
    healthView(state({ health: { ...GOOD, gpu_available: false, gpu_reason: '' } }), t);
    for (const l of LANGS) {
        const merged = Object.assign({}, ...dicts.map((d) => d[l]));
        for (const s of spoken) assert.ok(merged[s], `${l}: ${s}`);
    }
});
