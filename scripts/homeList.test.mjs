// Tests for Home's list of videos and its clip grid (imported by look.test.mjs):
//   node --test scripts/look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    STEPS, clipCountText, fmtDur, fmtRange, jobTags, listModel, makingCount, neighbour, newcomer,
    phaseOf, rowStatus, sortJobs, stageText, stepOf,
} from '../src/lib/homeList.js';
import {
    charsPerLine, clipShape, fitTitle, gridPlan, minTileWidth, shapeFromFile, wrapRows,
} from '../src/lib/clipGrid.js';
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
const en = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
const inLang = (l) => (s, vars = {}) => en(strings[l][s] ?? s, vars);

const clip = (rank, render_status = 'done', extra = {}) => ({ rank, render_status, mp4: `clip-0${rank}-9x16.mp4`, ...extra });
const job = (id, status, extra = {}) => ({ id, name: `${id}.mp4`, status, created_ms: 1000, clips: [], ...extra });

// ---------------------------------------------------------------------------
// where a video stands
// ---------------------------------------------------------------------------

test('phase: before the clips exist a video is working; failed and cancelled stand apart', () => {
    for (const s of ['downloading', 'queued', 'extracting', 'transcribing', 'analyzing']) assert.equal(phaseOf(job('a', s)), 'working');
    assert.equal(phaseOf(job('a', 'failed')), 'failed');
    assert.equal(phaseOf(job('a', 'cancelled')), 'cancelled');
});

test('phase: clips picked is ready once every clip is made or failed, making until then', () => {
    assert.equal(phaseOf(job('a', 'clips_ready', { clips: [clip(1), clip(2)] })), 'ready');
    assert.equal(phaseOf(job('a', 'clips_ready', { clips: [clip(1), clip(2, 'rendering')] })), 'making');
    assert.equal(phaseOf(job('a', 'clips_ready', { clips: [clip(1), clip(2, 'failed')] })), 'ready');
    assert.equal(phaseOf(job('a', 'clips_ready', { clips: [clip(1, 'pending')] })), 'making');
    assert.equal(phaseOf(job('a', 'done', { clips: [clip(1)] })), 'ready');
    assert.equal(phaseOf(job('a', 'done')), 'ready', 'no clips found is still a finished video');
    assert.equal(makingCount(job('a', 'clips_ready', { clips: [clip(1), clip(2, 'rendering'), clip(3, 'pending')] })), 2);
});

test('steps: the stage a status is on, an unknown one is the first', () => {
    assert.deepEqual(['downloading', 'queued', 'extracting', 'transcribing', 'analyzing', 'nope'].map(stepOf), [0, 1, 1, 2, 3, 0]);
    assert.equal(STEPS.length, 4);
});

test('stage text: a title, a short line and a sentence for every working status', () => {
    for (const s of ['downloading', 'queued', 'extracting', 'transcribing', 'analyzing']) {
        const x = stageText(s);
        assert.ok(x.title && x.short && x.hint, s);
    }
    assert.equal(stageText('transcribing').short, 'Transcribing…');
    assert.equal(stageText('weird').title, stageText('downloading').title);
});

test('row status: the words under a name and how far along it is', () => {
    assert.deepEqual(rowStatus(job('a', 'failed')), { phase: 'failed', text: 'Failed', tone: 'bad', progress: null });
    assert.equal(rowStatus(job('a', 'cancelled')).text, 'Cancelled');
    const w = rowStatus(job('a', 'transcribing'));
    assert.equal(w.text, 'Transcribing…');
    assert.equal(w.tone, 'work');
    assert.equal(w.progress, 0.625);
    assert.ok(rowStatus(job('a', 'downloading')).progress < rowStatus(job('a', 'analyzing')).progress);
    const m = rowStatus(job('a', 'clips_ready', { clips: [clip(1), clip(2, 'rendering'), clip(3), clip(4, 'pending')] }), en);
    assert.equal(m.text, 'Making clips 2/4');
    assert.equal(m.progress, 0.5);
    assert.deepEqual(rowStatus(job('a', 'done', { clips: [clip(1), clip(2), clip(3), clip(4), clip(5), clip(6)] }), en), { phase: 'ready', text: '6 clips', tone: 'ok', progress: null });
});

test('clip count text: none, one, many', () => {
    assert.deepEqual([0, 1, 2, 12].map((n) => clipCountText(n)), ['No clips', '1 clip', '{n} clips', '{n} clips']);
    assert.equal(clipCountText(6, (s, v) => en(s, v)), '6 clips');
});

// ---------------------------------------------------------------------------
// the list
// ---------------------------------------------------------------------------

test('list: newest first, a tie keeps the order the engine sent', () => {
    const a = job('a', 'done', { created_ms: 100 });
    const b = job('b', 'done', { created_ms: 300 });
    const c = job('c', 'done', { created_ms: 200 });
    const d = job('d', 'done', { created_ms: 200 });
    assert.deepEqual(sortJobs([a, b, c, d]).map((j) => j.id), ['b', 'c', 'd', 'a']);
    assert.deepEqual(sortJobs(undefined), []);
    assert.deepEqual(sortJobs([job('x', 'done', { created_ms: undefined }), a]).map((j) => j.id), ['a', 'x']);
});

test('list: counts of working, failed and ready, and what "remove finished" would take', () => {
    const m = listModel([
        job('a', 'transcribing', { created_ms: 5 }),
        job('b', 'failed', { created_ms: 4 }),
        job('c', 'cancelled', { created_ms: 3 }),
        job('d', 'done', { created_ms: 2, clips: [clip(1)] }),
        job('e', 'clips_ready', { created_ms: 1, clips: [clip(1, 'rendering')] }),
    ]);
    assert.deepEqual(m.ids, ['a', 'b', 'c', 'd', 'e']);
    assert.equal(m.working, 2);
    assert.equal(m.failed, 2);
    assert.equal(m.ready, 1);
    assert.deepEqual(m.finishedIds, ['b', 'c', 'd'], 'a running video, or one still making clips, is never taken');
    assert.deepEqual(m.rows.map((r) => r.phase), ['working', 'failed', 'cancelled', 'ready', 'making']);
});

test('list: twelve videos are twelve rows and nothing else', () => {
    const jobs = Array.from({ length: 12 }, (_, i) => job(`j${i}`, i < 2 ? 'analyzing' : 'done', { created_ms: i }));
    const m = listModel(jobs);
    assert.equal(m.rows.length, 12);
    assert.equal(m.ids[0], 'j11');
    assert.equal(m.working, 2);
    assert.deepEqual(listModel([]).rows, []);
});

test('newcomer: a video just started here comes up, a loaded list does not move you', () => {
    const now = 1_000_000;
    const old = job('old', 'done', { created_ms: now - 3_600_000 });
    const fresh = job('new', 'downloading', { created_ms: now - 2000 });
    assert.equal(newcomer(new Set(), [old], now), null, 'an old job is not a newcomer');
    assert.equal(newcomer(new Set(['old']), [fresh, old], now), 'new');
    assert.equal(newcomer(new Set(['old', 'new']), [fresh, old], now), null, 'already known');
    assert.equal(newcomer(new Set(), [job('w', 'queued', { created_ms: now - 1000, origin: 'watch' })], now), null, 'the watch folder does not steal the view');
    assert.equal(newcomer(new Set(), [job('m', 'queued', { created_ms: now - 1000, origin: 'mcp:claude' })], now), null, 'nor does an AI app');
    assert.equal(newcomer(new Set(), [job('x', 'queued', {})], now), null);
    assert.equal(newcomer(new Set(), [], now), null);
});

test('neighbour: the one below takes its place, else the one above, else none', () => {
    assert.equal(neighbour(['a', 'b', 'c'], 'b'), 'c');
    assert.equal(neighbour(['a', 'b', 'c'], 'c'), 'b');
    assert.equal(neighbour(['a'], 'a'), null);
    assert.equal(neighbour(['a', 'b'], 'gone'), 'a');
    assert.equal(neighbour([], 'a'), null);
});

test('tags: merged, who started it, a shape other than 9:16, the focus topic', () => {
    assert.deepEqual(jobTags(job('a', 'done')), []);
    assert.deepEqual(jobTags(job('a', 'done', { options: { merge: '' } })), ['merged']);
    assert.deepEqual(jobTags(job('a', 'done', { origin: 'watch', options: { aspect: '1:1', focus: 'pricing' } })), ['watch folder', '1:1', 'focus: {topic}']);
    assert.deepEqual(jobTags(job('a', 'done', { origin: 'mcp:Claude', options: { aspect: '9:16' } }), (s, v) => en(s, v)), ['via Claude']);
});

test('times: m:ss and a range', () => {
    assert.equal(fmtDur(83), '1:23');
    assert.equal(fmtDur(5), '0:05');
    assert.equal(fmtDur(null), null);
    assert.equal(fmtRange(42, 90), '0:42 → 1:30');
    assert.equal(fmtRange(42, null), null);
});

// ---------------------------------------------------------------------------
// the clip grid
// ---------------------------------------------------------------------------

test('shape: from the file name, else the shape the run was set to, else 9:16', () => {
    assert.deepEqual(shapeFromFile('clip-01-4x5.mp4'), { w: 4, h: 5 });
    assert.equal(shapeFromFile('clip-01.mp4'), null);
    assert.equal(shapeFromFile(undefined), null);
    assert.deepEqual(clipShape({ mp4: 'clip-02-16x9.mp4' }, {}), { w: 16, h: 9, tag: '16x9' });
    assert.deepEqual(clipShape({}, { options: { aspect: '1:1,16:9' } }), { w: 1, h: 1, tag: '1x1' }, 'a clip still being made already has its real shape');
    assert.deepEqual(clipShape({}, {}), { w: 9, h: 16, tag: '9x16' });
    assert.deepEqual(clipShape(undefined, undefined), { w: 9, h: 16, tag: '9x16' });
});

test('grid: tall tiles can be slim, wide ones need room', () => {
    const w = (a, b) => minTileWidth({ w: a, h: b });
    assert.ok(w(9, 16) < w(4, 5));
    assert.ok(w(4, 5) < w(1, 1));
    assert.ok(w(1, 1) < w(16, 9));
});

test('grid: columns for each shape at the two window sizes', () => {
    // the grid is ~950px wide in a 1280 window and ~640px in a 960 one
    const cols = (a, b, width) => gridPlan(width, { w: a, h: b }).cols;
    assert.deepEqual([[9, 16], [4, 5], [1, 1], [16, 9]].map(([a, b]) => cols(a, b, 950)), [5, 5, 4, 3]);
    assert.deepEqual([[9, 16], [4, 5], [1, 1], [16, 9]].map(([a, b]) => cols(a, b, 640)), [3, 3, 3, 2]);
});

test('grid: tiles share the width, never narrower than the minimum, never a column wider than needed', () => {
    for (const shape of [{ w: 9, h: 16 }, { w: 4, h: 5 }, { w: 1, h: 1 }, { w: 16, h: 9 }]) {
        for (let width = 300; width <= 1400; width += 37) {
            const { cols, tileW } = gridPlan(width, shape);
            assert.ok(cols >= 1);
            assert.ok(tileW * cols + 8 * (cols - 1) <= width, `fits ${width}`);
            if (width >= minTileWidth(shape)) assert.ok(tileW >= minTileWidth(shape), `min at ${width}`);
            assert.ok(tileW < minTileWidth(shape) * 2, `not huge at ${width}`);
        }
    }
});

test('grid: before the width is known, or when it is tiny, there is one column', () => {
    assert.equal(gridPlan(0, { w: 9, h: 16 }).cols, 1);
    assert.equal(gridPlan(NaN, { w: 9, h: 16 }).cols, 1);
    assert.equal(gridPlan(100, { w: 16, h: 9 }).cols, 1);
});

test('wrap: words fill a line, a word longer than a line breaks over lines', () => {
    assert.deepEqual(wrapRows('one two three', 7), ['one two', 'three']);
    assert.deepEqual(wrapRows('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
    assert.deepEqual(wrapRows('hi abcdefghij', 4), ['hi', 'abcd', 'efgh', 'ij']);
    assert.deepEqual(wrapRows('', 4), []);
});

test('title: whole when it fits in two lines, never cut by a rule that is not at a word', () => {
    assert.equal(fitTitle('Why most startups fail', 13), 'Why most startups fail');
    assert.equal(fitTitle('  spaced   out  ', 20), 'spaced out');
    assert.equal(fitTitle('', 20), '');
    assert.equal(fitTitle(undefined, 20), '');
});

test('title: longer ones are shortened at a word with an ellipsis and then fit in two lines', () => {
    const long = 'How I turned a failed startup into a seven figure agency in one year';
    for (const per of [12, 16, 20, 24, 30]) {
        const out = fitTitle(long, per);
        assert.ok(wrapRows(out, per).length <= 2, `${per}: ${out}`);
        assert.ok(out.endsWith('…'));
        const head = out.slice(0, -1);
        assert.ok(long.startsWith(head), 'a prefix of the title');
        assert.ok(long[head.length] === ' ', `cut at a word gap (${out})`);
    }
    assert.equal(fitTitle('aa bb, cccccccc dd', 8), 'aa bb…', 'no comma left before the ellipsis');
});

test('title: one word longer than two lines is the only thing cut mid-word', () => {
    const out = fitTitle('Supercalifragilisticexpialidocious'.repeat(2), 10);
    assert.ok(out.endsWith('…'));
    assert.ok(wrapRows(out, 10).length <= 2);
});

test('title: characters per line follow the tile width (mono type, 0.6 em)', () => {
    assert.equal(charsPerLine(156), Math.floor((156 - 15) / 6.6));
    assert.ok(charsPerLine(300) > charsPerLine(156));
    assert.equal(charsPerLine(10), 4);
});

// ---------------------------------------------------------------------------
// words, in every language
// ---------------------------------------------------------------------------

test('home list: every word it can say has all six languages', () => {
    const said = new Set();
    const spy = (s) => { said.add(s); return s; };
    for (const s of ['downloading', 'queued', 'extracting', 'transcribing', 'analyzing']) {
        const x = stageText(s, spy);
        void x;
    }
    for (const j of [
        job('a', 'failed'), job('a', 'cancelled'), job('a', 'transcribing'),
        job('a', 'clips_ready', { clips: [clip(1, 'rendering')] }),
        job('a', 'done', { clips: [clip(1)] }), job('a', 'done', { clips: [clip(1), clip(2)] }), job('a', 'done'),
    ]) rowStatus(j, spy);
    jobTags(job('a', 'done', { origin: 'watch', options: { merge: '', focus: 'x' } }), spy);
    jobTags(job('a', 'done', { origin: 'mcp:Claude' }), spy);
    for (const s of STEPS) said.add(s);
    for (const l of LANGS) {
        for (const s of said) assert.ok(strings[l][s], `${l}: ${s}`);
    }
});

test('home list: other languages say it in their own words', () => {
    assert.equal(inLang('de')('Failed'), strings.de.Failed);
    assert.notEqual(stageText('transcribing', inLang('de')).short, stageText('transcribing').short);
    assert.equal(rowStatus(job('a', 'done', { clips: [clip(1), clip(2)] }), inLang('de')).text, '2 Clips');
});
