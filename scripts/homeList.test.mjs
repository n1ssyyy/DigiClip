// Tests for Home's list of videos and its clip grid (imported by look.test.mjs):
//   node --test scripts/look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    SCORE_HIGH, STEPS, clipCountText, clipLength, clipStart, fmtAdded, fmtDur, fmtRange, jobTags, listModel, makingCount, neighbour, newcomer,
    phaseOf, rowMeta, rowStatus, scoreLevel, sortJobs, stageText, stepOf,
} from '../src/lib/homeList.js';
import {
    TILE_CHROME, TILE_FRAME, charsPerLine, clipShape, comfortTileWidth, fitName, fitTitle, gridPlan, maxTileWidth, minTileWidth, rowNameChars, shapeFromFile, tileHeight, wrapRows,
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

test('times: a clip\'s length and where it starts in its source', () => {
    assert.equal(clipLength({ start_s: 423, end_s: 438 }), '0:15');
    assert.equal(clipLength({ start_s: 423.2, end_s: 452.7 }), '0:30');
    assert.equal(clipLength({ start_s: 10, end_s: 10 }), null);
    assert.equal(clipLength({ start_s: 10 }), null);
    assert.equal(clipLength(undefined), null);
    assert.equal(clipStart({ start_s: 423 }), '7:03');
    assert.equal(clipStart({ start_s: 0 }), '0:00');
    assert.equal(clipStart({}), null);
});

test('score: accent from 70 up, muted below, never a warning', () => {
    assert.equal(SCORE_HIGH, 70);
    assert.equal(scoreLevel(70), 'high');
    assert.equal(scoreLevel(99), 'high');
    assert.equal(scoreLevel(69), 'plain');
    assert.equal(scoreLevel(12), 'plain');
    assert.equal(scoreLevel(0), 'plain');
});

// A fixed zone so the tests read the same on any machine.
const UTC = 'UTC';
const at = (iso) => Date.parse(iso);

test('added: today is the time, another day this year is day and month, another year adds the year', () => {
    const now = at('2026-10-09T15:30:00Z');
    assert.equal(fmtAdded(at('2026-10-09T14:05:00Z'), now, 'en', UTC), '14:05');
    assert.equal(fmtAdded(at('2026-10-09T00:07:00Z'), now, 'en', UTC), '00:07');
    assert.equal(fmtAdded(at('2026-10-03T14:05:00Z'), now, 'en', UTC), '3 Oct');
    assert.equal(fmtAdded(at('2026-01-31T23:59:00Z'), now, 'en', UTC), '31 Jan');
    assert.equal(fmtAdded(at('2025-10-03T14:05:00Z'), now, 'en', UTC), '3 Oct 2025');
    assert.equal(fmtAdded(at('2025-10-09T14:05:00Z'), now, 'en', UTC), '9 Oct 2025', 'the same day a year ago is not today');
});

test('added: yesterday and a day just past midnight are days, not times', () => {
    const now = at('2026-10-09T00:10:00Z');
    assert.equal(fmtAdded(at('2026-10-08T23:50:00Z'), now, 'en', UTC), '8 Oct');
    assert.equal(fmtAdded(at('2026-10-09T00:01:00Z'), now, 'en', UTC), '00:01');
});

test('added: nothing known says nothing', () => {
    assert.equal(fmtAdded(undefined, 0, 'en', UTC), null);
    assert.equal(fmtAdded(NaN, 0, 'en', UTC), null);
    assert.equal(fmtAdded(null, 0, 'en', UTC), null);
});

test('added: follows the language, and an unknown one falls back to English', () => {
    const now = at('2026-10-09T15:30:00Z');
    const day = at('2026-10-03T14:05:00Z');
    assert.notEqual(fmtAdded(day, now, 'de', UTC), fmtAdded(day, now, 'en', UTC));
    assert.notEqual(fmtAdded(day, now, 'tr', UTC), fmtAdded(day, now, 'en', UTC));
    for (const l of LANGS) {
        assert.equal(fmtAdded(at('2026-10-09T14:05:00Z'), now, l, UTC), '14:05', `${l}: the time reads the same`);
        assert.ok(/3/.test(fmtAdded(day, now, l, UTC)), l);
    }
    assert.equal(fmtAdded(day, now, 'xx-not-a-locale-', UTC), '3 Oct');
});

test('row meta: a finished video says clips and when, with a white dot until it is opened', () => {
    const now = at('2026-10-09T15:30:00Z');
    const done = job('a', 'done', { clips: Array.from({ length: 6 }, (_, i) => clip(i + 1)), created_ms: at('2026-10-03T14:05:00Z') });
    const m = rowMeta(done, { tr: en, now, fresh: true, timeZone: UTC });
    assert.equal(m.text, '6 clips · 3 Oct');
    assert.equal(m.dot, 'new');
    assert.equal(m.tone, 'ok');
    assert.equal(rowMeta(done, { tr: en, now, fresh: false, timeZone: UTC }).dot, null, 'no dot once it has been opened');
    assert.equal(rowMeta({ ...done, created_ms: at('2026-10-09T14:05:00Z') }, { tr: en, now, timeZone: UTC }).text, '6 clips · 14:05');
    assert.equal(rowMeta({ ...done, created_ms: undefined }, { tr: en, now, timeZone: UTC }).text, '6 clips');
    assert.equal(rowMeta(job('a', 'done', { created_ms: at('2026-10-03T14:05:00Z') }), { now, timeZone: UTC }).text, 'No clips · 3 Oct');
});

test('row meta: working is an orange pulsing dot, failed and cancelled a red one, with the words as today', () => {
    const opts = { tr: en, now: 5000, fresh: true };
    const working = rowMeta(job('a', 'transcribing'), opts);
    assert.deepEqual([working.text, working.dot, working.tone], ['Transcribing…', 'work', 'work']);
    const making = rowMeta(job('a', 'clips_ready', { clips: [clip(1, 'rendering'), clip(2)] }), opts);
    assert.deepEqual([making.text, making.dot], ['Making clips 1/2', 'work']);
    assert.deepEqual([rowMeta(job('a', 'failed'), opts).text, rowMeta(job('a', 'failed'), opts).dot], ['Failed', 'bad']);
    assert.deepEqual([rowMeta(job('a', 'cancelled'), opts).text, rowMeta(job('a', 'cancelled'), opts).dot], ['Cancelled', 'bad']);
    assert.equal(working.progress != null, true);
});

test('row meta: no word of the meta line is wider than the 232px list leaves it, in any language', () => {
    // 232 - ul padding 12 - scrollbar 11 - button padding 12 - thumbnail 64 - gap 8 = 125 for the text column;
    // the dot and its gap take 12; 10px mono is 6px a character
    const room = 125 - 12;
    const now = at('2026-10-09T15:30:00Z');
    const many = Array.from({ length: 19 }, (_, i) => clip(i + 2));
    const jobs = [
        job('a', 'failed'), job('a', 'cancelled'), job('a', 'queued'), job('a', 'extracting'), job('a', 'transcribing'),
        job('a', 'analyzing'), job('a', 'downloading'),
        job('a', 'clips_ready', { clips: [clip(1, 'rendering'), ...many] }),
        ...[at('2026-10-09T14:05:00Z'), at('2026-10-03T14:05:00Z'), at('2025-12-23T14:05:00Z')].flatMap((created_ms) => [
            job('a', 'done', { created_ms }), job('a', 'done', { created_ms, clips: [clip(1)] }), job('a', 'done', { created_ms, clips: [clip(1), ...many] }),
        ]),
    ];
    for (const l of LANGS) {
        for (const j of jobs) {
            const text = rowMeta(j, { tr: inLang(l), locale: l, now, timeZone: UTC, fresh: true }).text;
            for (const word of text.split(/\s+/)) assert.ok(word.length * 6 <= room, `${l}: "${word}" in "${text}"`);
        }
    }
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

const SHAPES = [{ w: 9, h: 16 }, { w: 4, h: 5 }, { w: 1, h: 1 }, { w: 16, h: 9 }];
// The visible grid area (its client box): a 1280x800 and a 960x640 window, the
// 900x520 of the brief, and a tiny box.
const BIG = { w: 950, h: 540 };
const SMALL = { w: 640, h: 390 };
const MID = { w: 900, h: 520 };
const TINY = { w: 640, h: 330 };
const PAD = 10;
const GAP = 8;
const plan = (area, n) => SHAPES.map((sh) => { const p = gridPlan(area, sh, n); return [p.cols, p.tileW, p.tileH, p.fits]; });

test('grid: tall tiles can be slim, wide ones need room; a shape\'s minimum < comfortable < maximum', () => {
    const w = (a, b) => minTileWidth({ w: a, h: b });
    assert.ok(w(9, 16) < w(4, 5));
    assert.ok(w(4, 5) < w(1, 1));
    assert.ok(w(1, 1) < w(16, 9));
    for (const sh of SHAPES) {
        assert.ok(minTileWidth(sh) < comfortTileWidth(sh), `${sh.w}:${sh.h}`);
        assert.ok(comfortTileWidth(sh) < maxTileWidth(sh), `${sh.w}:${sh.h}`);
    }
    assert.deepEqual(SHAPES.map((s) => [minTileWidth(s), comfortTileWidth(s), maxTileWidth(s)]), [[136, 176, 232], [152, 200, 264], [168, 224, 296], [224, 288, 400]]);
});

test('grid: six clips in each shape at the two window sizes and at 900x520', () => {
    assert.deepEqual(plan(BIG, 6), [[6, 148, 326, true], [3, 155, 256, true], [3, 194, 256, true], [3, 304, 233, true]]);
    assert.deepEqual(plan(SMALL, 6), [[3, 201, 420, false], [3, 201, 314, false], [2, 296, 358, false], [2, 306, 235, false]]);
    assert.deepEqual(plan(MID, 6), [[6, 140, 311, true], [4, 214, 330, false], [3, 184, 246, true], [3, 288, 224, true]]);
});

test('grid: six tall clips in 900x520 are ONE row of six, not five and one', () => {
    const p = gridPlan(MID, SHAPES[0], 6);
    assert.equal(p.cols, 6);
    assert.equal(p.fits, true);
    assert.equal(p.tileW, 140);
    assert.ok(p.tileH + PAD * 2 <= MID.h, 'the whole tile is in view');
    assert.ok(p.tileW * 6 + GAP * 5 + PAD * 2 <= MID.w);
});

test('grid: twelve tall clips in 900x520 cannot all fit, so they scroll in columns that share the row', () => {
    const p = gridPlan(MID, SHAPES[0], 12);
    assert.equal(p.fits, false);
    assert.equal(p.cols, 4); // the comfortable 176 decides: four fit
    assert.equal(p.tileW, 214); // and the four share the 880px row
    assert.ok(p.tileW >= comfortTileWidth(SHAPES[0]) && p.tileW <= maxTileWidth(SHAPES[0]));
    assert.ok(Math.ceil(12 / p.cols) * p.tileH > MID.h, 'taller than the box: it scrolls');
});

test('grid: twenty tall clips at the 1240 window (920x650 box) fill the row edge to edge', () => {
    const area = { w: 920, h: 650 };
    const p = gridPlan(area, SHAPES[0], 20);
    assert.equal(p.fits, false);
    assert.deepEqual([p.cols, p.tileW, p.tileH], [4, 219, 452]);
    const row = p.cols * p.tileW + GAP * (p.cols - 1);
    assert.ok(area.w - PAD * 2 - row < p.cols, 'less than a pixel a column is left over');
    // the narrow and the wide windows fill their rows the same way
    assert.deepEqual([gridPlan({ w: 640, h: 400 }, SHAPES[0], 20).cols, gridPlan({ w: 640, h: 400 }, SHAPES[0], 20).tileW], [3, 201]);
    assert.equal(gridPlan({ w: 960, h: 650 }, SHAPES[0], 20).cols, 5);
});

test('grid: one or two clips are capped, not giant, and fill no more than they need', () => {
    const roomy = { w: 1200, h: 900 };
    for (const sh of SHAPES) {
        for (const n of [1, 2]) {
            const p = gridPlan(roomy, sh, n);
            assert.equal(p.tileW, maxTileWidth(sh), `${sh.w}:${sh.h} x${n}`);
            assert.equal(p.cols, n, 'one row');
            assert.equal(p.fits, true);
        }
    }
    // in a short box the cap gives way to the height instead of scrolling
    const one = gridPlan(TINY, SHAPES[0], 1);
    assert.equal(one.fits, true);
    assert.ok(one.tileW < maxTileWidth(SHAPES[0]) && one.tileW >= minTileWidth(SHAPES[0]));
    assert.ok(one.tileH + PAD * 2 <= TINY.h);
});

test('grid: 1:1 and 16:9 take their own minimums and counts', () => {
    // 1:1, six clips, 900x520: two rows of three at 184
    assert.deepEqual(plan(MID, 6)[2], [3, 184, 246, true]);
    // 16:9, six clips, same box: two rows of three, capped nowhere
    assert.deepEqual(plan(MID, 6)[3], [3, 288, 224, true]);
    // a 16:9 tile never goes under its minimum: twelve in the small box scroll, never narrower than comfortable
    const wide = gridPlan(SMALL, SHAPES[3], 12);
    assert.equal(wide.fits, false);
    assert.equal(wide.tileW, 306); // two columns share the row
    assert.ok(wide.tileW >= comfortTileWidth(SHAPES[3]) && wide.tileW <= maxTileWidth(SHAPES[3]));
});

test('grid: a tiny box (640x330) holds two tall clips in one row and scrolls six', () => {
    assert.deepEqual(plan(TINY, 2)[0], [2, 139, 310, true]);
    assert.deepEqual(plan(TINY, 6), [[3, 201, 420, false], [3, 201, 314, false], [2, 296, 358, false], [2, 306, 235, false]]);
});

test('grid: when two column counts make the same tile, the one with fewer rows then fewer columns wins', () => {
    // six 4:5 clips in 950x540: 3 x 2 beats 5 + 1 (both give a 155 tile)
    assert.equal(gridPlan(BIG, SHAPES[1], 6).cols, 3);
    // four capped tiles sit in one row, not two
    assert.equal(gridPlan({ w: 1200, h: 900 }, SHAPES[0], 4).cols, 4);
});

test('grid: the column count is the one that makes the largest tile with every clip in view (checked by brute force)', () => {
    const best = (area, shape, n) => {
        const W = area.w - PAD * 2;
        const H = area.h - PAD * 2;
        let top = 0;
        for (let cols = 1; cols <= n; cols++) {
            const rows = Math.ceil(n / cols);
            for (let w = maxTileWidth(shape); w >= minTileWidth(shape); w--) {
                if (w * cols + GAP * (cols - 1) <= W && rows * tileHeight(w, shape) + GAP * (rows - 1) <= H) {
                    top = Math.max(top, w);
                    break;
                }
            }
        }
        return top;
    };
    for (const shape of SHAPES) {
        for (const n of [1, 2, 3, 4, 5, 6, 7, 9, 12, 20]) {
            for (let h = 300; h <= 1000; h += 97) {
                for (let w = 320; w <= 1400; w += 111) {
                    const p = gridPlan({ w, h }, shape, n);
                    const top = best({ w, h }, shape, n);
                    const tag = `${shape.w}:${shape.h} x${n} in ${w}x${h}`;
                    if (top > 0) {
                        assert.equal(p.fits, true, tag);
                        assert.equal(p.tileW, top, tag);
                        const rows = Math.ceil(n / p.cols);
                        assert.ok(rows * p.tileH + GAP * (rows - 1) + PAD * 2 <= h, `${tag}: all in view`);
                        assert.ok(p.cols * p.tileW + GAP * (p.cols - 1) + PAD * 2 <= w, `${tag}: row fits`);
                        assert.ok(p.tileW >= minTileWidth(shape) && p.tileW <= maxTileWidth(shape), tag);
                    } else {
                        assert.equal(p.fits, false, tag);
                        const W = w - PAD * 2;
                        const cols = Math.max(1, Math.floor((W + GAP) / (comfortTileWidth(shape) + GAP)));
                        assert.equal(p.cols, cols, tag);
                        assert.equal(p.tileW, Math.max(1, Math.min(maxTileWidth(shape), Math.floor((W - GAP * (cols - 1)) / cols))), tag);
                        assert.ok(p.cols * p.tileW + GAP * (p.cols - 1) <= W || W < comfortTileWidth(shape), tag);
                        assert.ok(p.cols >= 1, tag);
                    }
                }
            }
        }
    }
});

test('grid: tiles keep their shape (height follows width), never stretched', () => {
    for (const sh of SHAPES) {
        const p = gridPlan(MID, sh, 6);
        assert.equal(p.tileH, tileHeight(p.tileW, sh));
        assert.equal(p.tileH, Math.ceil((p.tileW * sh.h) / sh.w) + TILE_CHROME);
    }
});

test('grid: the chrome is what the tile is built from (no frame; gap 6, title 30, gap 2, line 24)', () => {
    assert.equal(TILE_FRAME, 0);
    assert.equal(TILE_CHROME, 6 + 30 + 2 + 24);
    assert.equal(tileHeight(9, { w: 9, h: 16 }), 16 + TILE_CHROME);
    assert.equal(tileHeight(144, { w: 9, h: 16 }), 256 + TILE_CHROME);
});

test('grid: the quiet line (chip, length, start, download) fits at the narrowest tile of every shape', () => {
    // chip 26 (two digits, 10px mono 6px a char + padding 12 + border 2), length "12:30" 30,
    // start "123:45" 36, download 22, three 6px gaps
    const need = 26 + 30 + 36 + 22 + 3 * 6;
    for (const sh of SHAPES) assert.ok(minTileWidth(sh) >= need, `${sh.w}:${sh.h}`);
    for (const area of [BIG, SMALL, MID, TINY, { w: 400, h: 300 }]) {
        for (const sh of SHAPES) for (const n of [1, 3, 6, 12]) assert.ok(gridPlan(area, sh, n).tileW >= minTileWidth(sh) || area.w - PAD * 2 < minTileWidth(sh), `${sh.w}:${sh.h} x${n}`);
    }
});

test('grid: before the width is known, with no clips, or when it is tiny, there is one column', () => {
    assert.equal(gridPlan({ w: 0, h: 0 }, { w: 9, h: 16 }, 6).cols, 1);
    assert.equal(gridPlan(undefined, { w: 9, h: 16 }, 6).cols, 1);
    assert.equal(gridPlan({ w: NaN, h: NaN }, { w: 9, h: 16 }, 6).cols, 1);
    assert.equal(gridPlan({ w: 100, h: 500 }, { w: 16, h: 9 }, 6).cols, 1);
    assert.equal(gridPlan({ w: 900, h: 500 }, { w: 9, h: 16 }, 0).fits, false);
    assert.equal(gridPlan({ w: 900, h: 500 }, { w: 9, h: 16 }).fits, false);
    assert.ok(gridPlan({ w: 100, h: 500 }, { w: 16, h: 9 }, 6).tileW >= 1);
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
    assert.equal(charsPerLine(156), Math.floor((156 - 1) / 6.6));
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

test('status: no word of a list status is wider than the narrowest (232px) list leaves it, in any language', () => {
    // 232px list: 231 inside, less ul padding 12, scrollbar 11, button padding 12, thumbnail 64, gap 8 = 124;
    // the status line's dot and its gap take 12; 10px mono is 6px a character
    const room = 124 - 12;
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
