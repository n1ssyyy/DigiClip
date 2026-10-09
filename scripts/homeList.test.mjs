// Tests for Home's list of videos and its clip grid (imported by look.test.mjs):
//   node --test scripts/look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    STEPS, clipCountText, fmtDur, fmtRange, jobTags, listModel, makingCount, neighbour, newcomer,
    phaseOf, rowStatus, sortJobs, stageText, stepOf,
} from '../src/lib/homeList.js';
import {
    TILE_CHROME, charsPerLine, clipShape, fitName, fitTitle, gridPlan, minTileWidth, rowNameChars, shapeFromFile, tileHeight, wrapRows,
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

const SHAPES = [{ w: 9, h: 16 }, { w: 4, h: 5 }, { w: 1, h: 1 }, { w: 16, h: 9 }];
// The visible grid area (its client box) in a 1280x800 and a 960x640 window.
const BIG = { w: 950, h: 540 };
const SMALL = { w: 640, h: 390 };
const PAD = 10;

test('grid: columns and tile size for each shape at the two window sizes', () => {
    const plan = (area) => SHAPES.map((sh) => { const p = gridPlan(area, sh); return [p.cols, p.tileW, p.tileH]; });
    assert.deepEqual(plan(BIG), [[5, 179, 390], [5, 179, 303], [4, 226, 308], [3, 304, 260]]);
    assert.deepEqual(plan(SMALL), [[3, 168, 370], [3, 201, 330], [3, 201, 283], [2, 306, 261]]);
});

test('grid: at both window sizes one whole row (picture, title, footer) is in view for every shape', () => {
    for (const area of [BIG, SMALL]) {
        for (const shape of SHAPES) {
            const { cols, tileW, tileH } = gridPlan(area, shape);
            assert.equal(tileH, tileHeight(tileW, shape));
            assert.ok(tileH + PAD * 2 <= area.h, `${shape.w}:${shape.h} in ${area.w}x${area.h}: ${tileH} high`);
            assert.ok(tileW * cols + 8 * (cols - 1) + PAD * 2 <= area.w, 'a row fits the width');
        }
    }
});

test('grid: a short window makes tiles smaller, not stretched; a tall one leaves them be', () => {
    const tall = gridPlan({ w: 640, h: 900 }, SHAPES[0]);
    const short = gridPlan(SMALL, SHAPES[0]);
    assert.equal(tall.tileW, 201);
    assert.ok(short.tileW < tall.tileW);
    assert.ok(short.tileW >= minTileWidth(SHAPES[0]));
});

test('grid: sweeping window sizes, a row always fits the height unless the floor is hit, and the width always', () => {
    for (const shape of SHAPES) {
        for (let h = 300; h <= 1000; h += 41) {
            for (let w = 320; w <= 1400; w += 53) {
                const { cols, tileW, tileH } = gridPlan({ w, h }, shape);
                assert.ok(cols >= 1 && tileW >= 1);
                if (tileW > 148) assert.ok(tileH + PAD * 2 <= h, `height ${w}x${h}`);
                if (w - PAD * 2 >= tileW) assert.ok(tileW * cols + 8 * (cols - 1) <= w - PAD * 2, `width ${w}x${h}`);
                if (tileW > minTileWidth(shape)) assert.ok(tileW < minTileWidth(shape) * 2 + 8, 'not huge');
            }
        }
    }
});

test('grid: the chrome is what the tile is built from (frame 14, strip 16, title 30, footer 24, gaps 12)', () => {
    assert.equal(TILE_CHROME, 14 + 16 + 30 + 24 + 12);
    assert.equal(tileHeight(14, { w: 9, h: 16 }), TILE_CHROME);
    assert.equal(tileHeight(158, { w: 9, h: 16 }), 256 + TILE_CHROME);
});

test('grid: the number and time range stay on one line, with the download, at the narrowest tile', () => {
    const char = 6; // 10px mono
    const room = (tileW) => tileW - 14 - 22 - 4; // inside the frame, less the download and the gap
    const text = '#14 · 7:03 → 7:27';
    for (const area of [BIG, SMALL, { w: 400, h: 300 }]) {
        for (const shape of SHAPES) {
            const { tileW } = gridPlan(area, shape);
            assert.ok(room(tileW) >= text.length * char, `${shape.w}:${shape.h} ${tileW}`);
        }
    }
});

test('grid: before the width is known, or when it is tiny, there is one column', () => {
    assert.equal(gridPlan({ w: 0, h: 0 }, { w: 9, h: 16 }).cols, 1);
    assert.equal(gridPlan(undefined, { w: 9, h: 16 }).cols, 1);
    assert.equal(gridPlan({ w: NaN, h: NaN }, { w: 9, h: 16 }).cols, 1);
    assert.equal(gridPlan({ w: 100, h: 500 }, { w: 16, h: 9 }).cols, 1);
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

test('name: a video name in the list takes two lines at most, shortened at a word gap', () => {
    const long = 'Interview with the founder about how the agency grew from nothing to seven figures in one year';
    for (const listW of [215, 240, 260, 299]) {
        for (const actions of [0, 1, 2]) {
            const out = fitName(long, listW, actions);
            const per = rowNameChars(listW, actions);
            assert.ok(wrapRows(out, per).length <= 2, `${listW}/${actions}: ${out}`);
            assert.ok(out.endsWith('…'));
            assert.ok(long.startsWith(out.slice(0, -1)) && long[out.length - 1] === ' ', `cut at a gap: ${out}`);
        }
    }
    assert.equal(fitName('Short one', 215, 0), 'Short one');
    assert.equal(fitName('Short one', 215, 2), 'Short one');
});

test('name: one without gaps is cut inside the word; an unknown width leaves it whole', () => {
    const out = fitName('a'.repeat(120), 215, 2);
    assert.ok(out.endsWith('…') && out.length <= rowNameChars(215, 2) * 2);
    assert.equal(fitName('  two   words ', 0), 'two words');
});

test('name: the buttons beside a name take room from it, a wider list gives it back', () => {
    assert.ok(rowNameChars(215, 2) < rowNameChars(215, 1));
    assert.ok(rowNameChars(215, 1) < rowNameChars(215, 0));
    assert.ok(rowNameChars(299, 2) > rowNameChars(215, 2));
});

test('status: no word of a list status is wider than the narrowest list leaves it, in any language', () => {
    // 216px list: 215 inside, less ul padding 12, scrollbar 11, button padding 12, thumbnail 56, gap 8 = 116;
    // the status line's dot and its gap take 12; 10px mono is 6px a character
    const room = 116 - 12;
    const jobs = [
        job('a', 'failed'), job('a', 'cancelled'), job('a', 'queued'), job('a', 'extracting'), job('a', 'transcribing'),
        job('a', 'analyzing'), job('a', 'downloading'),
        job('a', 'clips_ready', { clips: [clip(1, 'rendering'), ...Array.from({ length: 19 }, (_, i) => clip(i + 2))] }),
        job('a', 'done'), job('a', 'done', { clips: [clip(1)] }), job('a', 'done', { clips: [clip(1), clip(2)] }),
    ];
    for (const l of LANGS) {
        for (const j of jobs) {
            const text = rowStatus(j, inLang(l)).text;
            for (const word of text.split(/\s+/)) assert.ok(word.length * 6 <= room, `${l}: "${word}" in "${text}"`);
        }
    }
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
