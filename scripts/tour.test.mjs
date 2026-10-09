// Tests for the first-run tour: where its card goes, and what its steps say
// (imported by look.test.mjs):
//   node --test scripts/look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GAP, MARGIN, PAD, cutOut, isPointable, overlaps, placeCard } from '../src/lib/tourGeometry.js';
import { tourSteps } from '../src/lib/tourSteps.js';
import clips from '../src/i18n/clips.js';
import home from '../src/i18n/home.js';
import mcp from '../src/i18n/mcp.js';
import options from '../src/i18n/options.js';
import settings from '../src/i18n/settings.js';
import shell from '../src/i18n/shell.js';
import studio from '../src/i18n/studio.js';
import tray from '../src/i18n/tray.js';

const W1280 = { w: 1280, h: 758 }; // 1280x800 less the 42px title bar
const W960 = { w: 960, h: 598 }; // 960x640 less the title bar
const CARD = { w: 380, h: 230 };
const R = (left, top, width, height) => ({ left, top, width, height });
const inside = (p, win, m = MARGIN) => p.left >= m && p.top >= m && p.left + p.w <= win.w - m && p.top + p.h <= win.h - m;
const box = (p) => ({ left: p.left, top: p.top, width: p.w, height: p.h });

test('tour: the cut-out is the target plus its padding, clamped to the window', () => {
    assert.deepEqual(cutOut(R(100, 100, 50, 40), W1280), R(100 - PAD, 100 - PAD, 50 + 2 * PAD, 40 + 2 * PAD));
    assert.deepEqual(cutOut(R(0, 0, 32, 32), W1280), R(0, 0, 32 + PAD, 32 + PAD));
    assert.deepEqual(cutOut(R(1250, 740, 40, 40), W1280), R(1250 - PAD, 740 - PAD, 1280 - 1242, 758 - 732));
    assert.deepEqual(cutOut(R(-20, -20, 3000, 3000), W960), R(0, 0, 960, 598));
    assert.deepEqual(cutOut(R(10.4, 20.6, 30.2, 10.1), W1280), R(2, 12, 47, 27)); // whole pixels, outward
});

test('tour: a target can be pointed at only when it has a size and is mostly on screen', () => {
    assert.equal(isPointable(R(10, 10, 100, 40), W1280), true);
    assert.equal(isPointable(R(-30, 10, 100, 40), W1280), true); // a little cut off
    assert.equal(isPointable(null, W1280), false);
    assert.equal(isPointable(R(10, 10, 0, 40), W1280), false);
    assert.equal(isPointable(R(10, 10, 100, 0), W1280), false);
    assert.equal(isPointable(R(-90, 10, 100, 40), W1280), false); // mostly off the left edge
    assert.equal(isPointable(R(10, 900, 100, 40), W1280), false);
    assert.equal(isPointable(R(10, 10, NaN, 40), W1280), false);
    assert.equal(isPointable(R(10, 10, 100, 40), { w: 0, h: 0 }), false);
});

test('tour: a rail button gets the card on its right, level with it, never over it', () => {
    for (const win of [W1280, W960]) {
        const btn = R(5, 300, 32, 32);
        const p = placeCard({ win, rect: btn, card: CARD });
        assert.equal(p.side, 'right');
        assert.equal(p.left, 5 + 32 + PAD + GAP);
        assert.equal(Math.round(p.top + p.h / 2), 316);
        assert.deepEqual(p.hole, cutOut(btn, win));
        assert.ok(inside(p, win));
        assert.equal(overlaps(box(p), p.hole), false);
    }
});

test('tour: a button at the foot of the rail keeps the card inside the window', () => {
    for (const win of [W1280, W960]) {
        const btn = R(5, win.h - 5 - 32, 32, 32);
        const p = placeCard({ win, rect: btn, card: CARD });
        assert.equal(p.side, 'right');
        assert.equal(p.top + p.h, win.h - MARGIN);
        assert.ok(inside(p, win));
        assert.equal(overlaps(box(p), p.hole), false);
    }
});

test('tour: a wide band across the top gets the card below it', () => {
    for (const win of [W1280, W960]) {
        const band = R(0, 0, win.w - 5, 128);
        const p = placeCard({ win, rect: band, card: CARD });
        assert.equal(p.side, 'bottom');
        assert.equal(p.top, p.hole.top + p.hole.height + GAP);
        assert.ok(inside(p, win));
        assert.equal(overlaps(box(p), p.hole), false);
    }
});

test('tour: the add card alone on the page has the card beside it when there is room, else below', () => {
    const wide = placeCard({ win: W1280, rect: R(300, 250, 500, 230), card: CARD });
    assert.equal(wide.side, 'right');
    const narrow = placeCard({ win: W960, rect: R(190, 100, 560, 200), card: CARD });
    assert.equal(narrow.side, 'bottom');
    for (const p of [wide, narrow]) assert.equal(overlaps(box(p), p.hole), false);
});

test('tour: the list of videos, a tall column at the left, gets the card on its right', () => {
    for (const win of [W1280, W960]) {
        const list = R(5, 140, 300, win.h - 145);
        const p = placeCard({ win, rect: list, card: CARD });
        assert.equal(p.side, 'right');
        assert.ok(inside(p, win));
        assert.equal(overlaps(box(p), p.hole), false);
    }
});

test('tour: a target at the right edge puts the card on its left', () => {
    const p = placeCard({ win: W1280, rect: R(1200, 300, 70, 60), card: CARD });
    assert.equal(p.side, 'left');
    assert.equal(p.left + p.w + GAP, p.hole.left);
    assert.equal(overlaps(box(p), p.hole), false);
});

test('tour: with no room beside it, the card goes above', () => {
    const p = placeCard({ win: W960, rect: R(5, 520, 940, 60), card: CARD });
    assert.equal(p.side, 'top');
    assert.equal(p.top + p.h + GAP, p.hole.top);
    assert.equal(overlaps(box(p), p.hole), false);
});

test('tour: no target, an unusable one, or no room anywhere is a centred card pointing at nothing', () => {
    const mid = (win, p) => [Math.round((win.w - p.w) / 2), Math.round((win.h - p.h) / 2)];
    for (const rect of [null, undefined, R(0, 0, 0, 0), R(-500, -500, 50, 50), R(10, 9999, 40, 40)]) {
        const p = placeCard({ win: W1280, rect, card: CARD });
        assert.equal(p.side, 'center');
        assert.equal(p.hole, null);
        assert.deepEqual([p.left, p.top], mid(W1280, p));
    }
    const huge = placeCard({ win: W960, rect: R(0, 0, 960, 598), card: CARD });
    assert.equal(huge.side, 'center');
    assert.equal(huge.hole, null);
    const nearly = placeCard({ win: W960, rect: R(20, 20, 920, 560), card: CARD });
    assert.equal(nearly.side, 'center');
});

test('tour: a card taller or wider than the window shrinks to fit inside its margins', () => {
    const win = { w: 300, h: 200 };
    const p = placeCard({ win, rect: null, card: { w: 380, h: 500 } });
    assert.deepEqual([p.w, p.h], [300 - 2 * MARGIN, 200 - 2 * MARGIN]);
    assert.ok(inside(p, win));
});

// The promise, over many windows, cards and targets: the card stays inside
// the window, and is never over what it points at.
test('tour: wherever the target is, the card stays in the window and off the target', () => {
    const wins = [W1280, W960, { w: 720, h: 480 }, { w: 1920, h: 1000 }];
    const cards = [{ w: 380, h: 190 }, { w: 380, h: 260 }, { w: 330, h: 330 }];
    let pointed = 0;
    for (const win of wins) for (const card of cards) {
        for (let left = -40; left < win.w + 40; left += 53) {
            for (let top = -40; top < win.h + 40; top += 47) {
                for (const [width, height] of [[32, 32], [300, 90], [90, 400], [560, 230], [win.w, 128], [win.w - 5, win.h - 5]]) {
                    const p = placeCard({ win, rect: R(left, top, width, height), card });
                    assert.ok(inside(p, win), `inside ${JSON.stringify([win, card, left, top, width, height])}`);
                    if (p.side === 'center') {
                        assert.equal(p.hole, null);
                    } else {
                        pointed++;
                        assert.equal(overlaps(box(p), p.hole), false, `off the target ${JSON.stringify([win, card, left, top, width, height])}`);
                        assert.ok(p.hole.left >= 0 && p.hole.top >= 0 && p.hole.left + p.hole.width <= win.w && p.hole.top + p.hole.height <= win.h);
                    }
                }
            }
        }
    }
    assert.ok(pointed > 1000);
});

const plain = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s);
const lines = (step) => step.body;

test('tour: six short steps, a welcome that points at nothing, then the real things', () => {
    const steps = tourSteps(plain, { hasVideos: true });
    assert.deepEqual(steps.map((s) => s.key), ['welcome', 'add', 'videos', 'studio', 'ai', 'health']);
    assert.deepEqual(steps.map((s) => s.target), [null, 'add', 'videos', 'rail-studio', 'rail-settings', 'rail-health']);
    assert.deepEqual(steps.map((s) => s.title), ['Welcome', 'Add a video', 'Your videos', 'Studio', 'Smart clip picking', 'Health']);
    assert.deepEqual(steps.filter((s) => s.action).map((s) => [s.action.label, s.action.page]), [['Open Studio', 'studio'], ['Open Settings', 'settings']]);
    for (const s of steps) {
        assert.ok(lines(s).length >= 1 && lines(s).length <= 2, s.key);
        for (const l of lines(s)) assert.ok((l.match(/[.!?](\s|$)/g) ?? []).length <= 2 || s.key === 'ai', `${s.key}: ${l}`);
    }
});

test('tour: with no video yet the videos step points at nothing and says where they will appear', () => {
    const none = tourSteps(plain, { hasVideos: false }).find((s) => s.key === 'videos');
    const some = tourSteps(plain, { hasVideos: true }).find((s) => s.key === 'videos');
    assert.equal(none.target, null);
    assert.equal(some.target, 'videos');
    assert.match(none.body[0], /will be listed on Home/);
    assert.notEqual(none.body[0], some.body[0]);
});

test('tour: the steps say what things are for, not where they are', () => {
    for (const hasVideos of [true, false]) {
        const text = tourSteps(plain, { hasVideos }).flatMap(lines).join(' ');
        assert.doesNotMatch(text, /top left|bottom left|right below|on the right|on the left|sidebar|Queue/i);
    }
});

test('tour: the welcome uses the device name when there is one', () => {
    const named = tourSteps(plain, { name: 'Kim' })[0];
    assert.equal(named.body[0], 'Hey {name} — welcome to DigiClip.');
    assert.deepEqual(named.slots, { name: 'Kim' });
    const bare = tourSteps(plain, {})[0];
    assert.equal(bare.body[0], 'Welcome to DigiClip.');
    assert.deepEqual(bare.slots, {});
});

test('tour: the settings step keeps the provider facts and the no-key fallback', () => {
    const ai = tourSteps(plain, {}).find((s) => s.key === 'ai');
    assert.match(ai.body[0], /OpenAI, Anthropic, Gemini, OpenRouter, Ollama/);
    assert.match(ai.body[0], /Ollama or LM Studio on this PC need no key/);
    assert.match(ai.body[1], /heuristics/);
    assert.match(ai.body[1], /Transcription itself is always offline/);
    assert.deepEqual(ai.slots, { where: 'Settings → Clip AI' });
});

// Every sentence of the tour, and the buttons around it, in all six languages.
test('tour: every string it shows is translated', () => {
    const LANGS = ['sq', 'de', 'fr', 'es', 'it', 'tr'];
    const dicts = [clips, home, mcp, options, settings, shell, studio, tray];
    const spoken = new Set();
    const t = (s, vars) => { spoken.add(s); return plain(s, vars); };
    for (const hasVideos of [true, false]) for (const name of ['Kim', null]) tourSteps(t, { hasVideos, name });
    for (const s of ['Onboarding: {title}', 'Skip tour', 'Back', 'Next', 'Get started', 'Take the tour']) spoken.add(s);
    assert.ok(spoken.size >= 20);
    for (const l of LANGS) {
        const merged = Object.assign({}, ...dicts.map((d) => d[l]));
        for (const s of spoken) assert.ok(merged[s], `${l}: ${s}`);
    }
});

test('tour: the old tour strings are gone from every language', () => {
    const gone = ['1 · Drop a video', '2 · Watch the queue', '3 · Clip AI (for smart clips)', '4 · Play and share', 'Queue',
        'Upload → Audio → Script → Clips', 'Settings → Connection'];
    for (const d of [clips, home, mcp, options, settings, shell, studio, tray]) {
        for (const l of ['sq', 'de', 'fr', 'es', 'it', 'tr']) for (const k of gone) assert.equal(k in d[l], false, `${l}: ${k}`);
    }
});

// The targets are real: each `data-tour` value a step names is on an element.
test('tour: every target the steps name is an attribute on a real element', () => {
    const src = (p) => fs.readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), 'utf8');
    const side = src('components/digiclip/Sidebar.jsx');
    assert.match(src('components/home/AddVideo.jsx'), /<Card data-tour="add"/);
    assert.match(src('components/home/VideoList.jsx'), /data-tour="videos"/);
    assert.match(side, /data-tour=\{`rail-\$\{page\}`\}/);
    const targets = tourSteps(plain, { hasVideos: true }).map((s) => s.target).filter(Boolean);
    for (const tg of targets.filter((x) => x.startsWith('rail-'))) {
        assert.match(side, new RegExp(`<SideLink page="${tg.slice(5)}"`), tg);
    }
    assert.match(src('layouts/AppLayout.jsx'), /<Onboarding/);
});

test('tour: Onboarding is the app\'s tour: the storage key, the escape hatch and the replay stay as they were', () => {
    const on = fs.readFileSync(fileURLToPath(new URL('../src/components/digiclip/Onboarding.jsx', import.meta.url)), 'utf8');
    assert.match(on, /'digiclip\.onboardingDone'/);
    assert.match(on, /window\.__DIGICLIP_NO_TOUR/);
    assert.match(on, /role="dialog"/);
    assert.match(on, /aria-modal="true"/);
    assert.match(on, /navigate\('home'\)/);
    assert.match(on, /e\.key === 'Escape'/);
    assert.equal(on.split('\n').length < 350, true);
});
