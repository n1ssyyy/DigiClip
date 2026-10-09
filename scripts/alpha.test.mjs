// Tests for opacity in Studio: colours with opacity (#RRGGBBAA), the element
// opacities, the stripping for an engine without `look.alpha`, the colour
// control's edits and the stage's per-part arithmetic (imported by
// look.test.mjs):
//   node --test scripts/look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ALPHA_CAP, alphaOf, colourOnly, cssColour, cssRgb, cutColours, fromPercent, isColour, mul, normColour, percentOf, rgbOf,
    stripLookAlpha, stripOptionsAlpha, withAlpha,
} from '../src/lib/alpha.js';
import { colourShown, pickColour, pickOpacity } from '../src/lib/colourField.js';
import { createLookStore, defaults, fromEngine, lookOptions, lookToEngine, sanitizeLook, toEngine } from '../src/lib/look.js';
import { cleanCaptions, rgba, resolveCaptions } from '../src/lib/captionStyles.js';
import { cfgOf, frameAt, planFor, flatMeasure, wordLooks } from '../src/lib/captionMotion.js';
import { captionView, clearPatch, editPatch } from '../src/lib/captionEffective.js';
import { cleanBar, cleanHeadline, cleanLogo, resolveBar, resolveHeadline, resolveLogo } from '../src/lib/layers.js';
import { barView, headlineView } from '../src/lib/layerEffective.js';
import { frameKey, frameRequest } from '../src/lib/exactFrame.js';
import { deleteLook, duplicateLook, loaded, saveLook } from '../src/lib/lookLibrary.js';
import { BAR_LAYER, HEADLINE_LAYER, sectionOf } from '../src/lib/layerSections.js';
import studio from '../src/i18n/studio.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const memory = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

// ---------------------------------------------------------------------------
// the colour arithmetic
// ---------------------------------------------------------------------------

test('colours are six or eight digits, nothing shorter', () => {
    assert.equal(normColour('#ff0000'), '#FF0000');
    assert.equal(normColour(' ff000080 '), '#FF000080');
    assert.equal(normColour('#f00'), undefined);
    assert.equal(normColour('#FF00008'), undefined);
    assert.equal(normColour('#FF0000800'), undefined);
    assert.equal(normColour(12), undefined);
    assert.deepEqual(['#FF0000', '#FF000080', '#f00', 'red', ''].map(isColour), [true, true, false, false, false]);
});

test('split and join: the opacity is the last byte, FF is six digits', () => {
    assert.deepEqual(rgbOf('#102030'), [16, 32, 48]);
    assert.deepEqual(rgbOf('#10203080'), [16, 32, 48]);
    assert.equal(alphaOf('#102030'), 1);
    assert.equal(alphaOf('#102030FF'), 1);
    assert.equal(alphaOf('#10203000'), 0);
    near(alphaOf('#10203080'), 128 / 255);
    assert.equal(colourOnly('#10203080'), '#102030');
    assert.equal(colourOnly('#102030'), '#102030');
    assert.equal(withAlpha('#102030', 1), '#102030');
    assert.equal(withAlpha('#10203080', 1), '#102030');
    assert.equal(withAlpha('#102030', 0), '#10203000');
    assert.equal(withAlpha('#102030', 0.5), '#10203080');
    assert.equal(withAlpha('#10203040', 0.5), '#10203080');
    assert.equal(withAlpha('#102030', 7), '#102030');
    assert.equal(withAlpha('#102030', -3), '#10203000');
});

test('every whole percent survives the trip to a byte and back', () => {
    for (let p = 0; p <= 100; p++) {
        const c = withAlpha('#AABBCC', fromPercent(p));
        assert.equal(percentOf(alphaOf(c)), p, `${p}%`);
        assert.equal(c.length, p === 100 ? 7 : 9, `${p}%`);
    }
});

test('opacities multiply, each clamped; CSS holds the product', () => {
    near(mul(0.5, 0.5, undefined, 1), 0.25);
    assert.equal(mul(2, 0.5), 0.5);
    assert.equal(mul(), 1);
    assert.equal(mul(0.3, -1), 0);
    assert.equal(cssRgb([1, 2, 3], 0.5), 'rgb(1 2 3 / 0.5)');
    assert.equal(cssColour('#102030'), 'rgb(16 32 48 / 1)');
    assert.equal(cssColour('#10203000'), 'rgb(16 32 48 / 0)');
    assert.equal(cssColour('#102030', 0.5, 0.5), 'rgb(16 32 48 / 0.25)');
    assert.equal(cssColour('#10203080', 0.5), `rgb(16 32 48 / ${Math.round((128 / 255) * 0.5 * 1000) / 1000})`);
    assert.equal(rgba('#10203080', 0.5), cssColour('#10203080', 0.5));
});

// ---------------------------------------------------------------------------
// the Look keeps them, the engine without the ability never gets them
// ---------------------------------------------------------------------------

const LOOK = {
    captions: {
        opacity: 0.8, color: '#FFFFFF80', active: '#FFFF00CC', accent: '#00FFFF40', outline: '#00000080', box: '#33669980',
        stroke: { color: '#11223380', width: 2 }, shadow: { color: '#00000080', opacity: 0.5 }, glow: { color: '#FF00FF80', size: 10 },
        words: {
            upcoming: { color: '#FFFFFF80', opacity: 0.5 }, active: { color: '#FFFF0080', stroke: { color: '#00000080' }, glow: { color: '#00FFFF80' }, box: { color: '#FF000080' } },
            spoken: { color: '#FFFFFF80' }, keyword: { color: '#00FF0080', glow: { color: '#FF00FF80' } },
        },
    },
    headline: { opacity: 0.7, ink: '#11111180', accent: '#FF3C1E80', card: { color: '#FFFFFF80', opacity: 0.5 }, stroke: { color: '#00000080' }, shadow: { color: '#00000080' }, glow: { color: '#FFFFFF80' } },
    bar: { opacity: 0.6, color: '#FFD40080', track: '#00000080', track_opacity: 0.4, glow: { color: '#FFD40080' } },
    logo: { opacity: 0.5, shadow: { color: '#00000080', opacity: 0.5 }, glow: { color: '#FFFFFF80' } },
    camera: { zoom: 1.2 },
};

const EIGHT = /#[0-9a-f]{8}/gi;
const walk = (v, f, path = '') => {
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, f, `${path}.${k}`);
    else f(v, path);
};

test('stripLookAlpha: eight digits cut to six, the three new opacities dropped, the logo\'s kept', () => {
    const out = stripLookAlpha(LOOK);
    const seen = [];
    walk(out, (v, p) => { if (typeof v === 'string' && EIGHT.test(v)) seen.push(p); EIGHT.lastIndex = 0; });
    assert.deepEqual(seen, []);
    assert.equal(out.captions.opacity, undefined);
    assert.equal(out.headline.opacity, undefined);
    assert.equal(out.bar.opacity, undefined);
    assert.equal(out.logo.opacity, 0.5);
    // Colours keep their hue, and the numbers that are older stay.
    assert.equal(out.captions.color, '#FFFFFF');
    assert.equal(out.captions.box, '#336699');
    assert.equal(out.captions.words.keyword.glow.color, '#FF00FF');
    assert.equal(out.captions.words.upcoming.opacity, 0.5);
    assert.equal(out.captions.shadow.opacity, 0.5);
    assert.equal(out.headline.card.opacity, 0.5);
    assert.equal(out.bar.track_opacity, 0.4);
    assert.equal(out.logo.shadow.color, '#000000');
    assert.deepEqual(out.camera, { zoom: 1.2 });
    // The input is not touched.
    assert.equal(LOOK.captions.opacity, 0.8);
    assert.equal(LOOK.captions.color, '#FFFFFF80');
    // Words in a section named like a new opacity but nested are not the section's own.
    assert.equal(stripLookAlpha({ captions: { words: { active: { opacity: 0.4 } } } }).captions.words.active.opacity, 0.4);
    assert.deepEqual(stripLookAlpha({ bar: { opacity: 0.5 } }), { bar: {} });
});

test('cutColours leaves six digits, other text and numbers alone', () => {
    assert.deepEqual(cutColours({ a: '#11223344', b: '#112233', c: 'solid', d: [ '#AABBCCDD' ], e: 3, f: null }), { a: '#112233', b: '#112233', c: 'solid', d: ['#AABBCC'], e: 3, f: null });
});

test('lookToEngine: everything passes with the ability, is cut without it', () => {
    const withCap = lookToEngine(LOOK);
    assert.equal(withCap.captions.color, '#FFFFFF80');
    assert.equal(withCap.captions.opacity, 0.8);
    assert.equal(withCap.bar.opacity, 0.6);
    assert.equal(lookToEngine(LOOK, { alpha: true }).headline.opacity, 0.7);
    const without = lookToEngine(LOOK, { alpha: false });
    assert.equal(without.captions.color, '#FFFFFF');
    assert.equal(without.captions.opacity, undefined);
    assert.equal(without.headline.opacity, undefined);
    assert.equal(without.bar.opacity, undefined);
    assert.equal(without.logo.opacity, 0.5);
    assert.equal(without.v, 1);
    // A section left with nothing real disappears.
    assert.equal(lookToEngine({ captions: { opacity: 0.5 }, bar: { opacity: 0.5 } }, { alpha: false }), null);
    assert.deepEqual(lookToEngine({ captions: { opacity: 0.5 }, bar: { opacity: 0.5 } }), { v: 1, captions: { opacity: 0.5 }, bar: { opacity: 0.5 } });
});

test('toEngine: the flat progress_bar colour and the Look follow the ability', () => {
    const o = { ...defaults(null), progress_bar: true, bar_color: '#FFD40080', look: sanitizeLook(LOOK) };
    const on = toEngine(o);
    assert.equal(on.progress_bar, '#FFD40080');
    assert.equal(on.look.captions.opacity, 0.8);
    const same = toEngine(o, { alpha: true });
    assert.deepEqual(same, on);
    const off = toEngine(o, { alpha: false });
    assert.equal(off.progress_bar, '#FFD400');
    assert.equal(off.look.captions.opacity, undefined);
    assert.equal(off.look.captions.color, '#FFFFFF');
    assert.equal(off.look.logo.opacity, 0.5);
    // Everything else is the same.
    const { look: a, progress_bar: p, ...restOn } = on;
    const { look: b, progress_bar: q, ...restOff } = off;
    assert.deepEqual(restOff, restOn);
    // The app's Look keeps them whatever was sent.
    assert.equal(o.look.captions.color, '#FFFFFF80');
    assert.equal(o.bar_color, '#FFD40080');
    // The six-digit option is still sent as it was; a bad one is still empty.
    assert.equal(lookOptions({ progress_bar: true, bar_color: '#FFD400' }).progress_bar, '#FFD400');
    assert.equal(lookOptions({ progress_bar: true, bar_color: '#FFD4' }).progress_bar, '');
    assert.equal(lookOptions({ progress_bar: true, bar_color: 'FFD400' }).progress_bar, '');
    assert.equal(stripOptionsAlpha({ progress_bar: '#11223344', style: 'x' }).progress_bar, '#112233');
    assert.equal(stripOptionsAlpha({ progress_bar: true }).progress_bar, true);
    assert.equal(ALPHA_CAP, 'look.alpha');
});

test('the exact frame asks with what the engine takes and goes stale on nothing else', () => {
    const o = { ...defaults(null), look: sanitizeLook({ captions: { color: '#FFFFFF80', opacity: 0.5 } }) };
    const sample = { job: { id: 'j' }, start: 1, len: 5 };
    assert.equal(frameRequest(o, sample, 1).options.look.captions.color, '#FFFFFF80');
    assert.equal(frameRequest(o, sample, 1, { alpha: false }).options.look.captions.color, '#FFFFFF');
    assert.equal(frameRequest(o, sample, 1, { alpha: false }).options.look.captions.opacity, undefined);
    assert.notEqual(frameKey(o, sample, 1), frameKey(o, sample, 1, { alpha: false }));
    assert.equal(frameKey(o, sample, 1, { alpha: false }), frameKey(o, sample, 1, { alpha: false }));
});

test('looks keep eight digits and the new fields through save, load, duplicate, export', () => {
    const o = { ...defaults(null), progress_bar: true, bar_color: '#FFD40080', look: sanitizeLook(LOOK) };
    // sanitizing is not stripping
    assert.equal(o.look.captions.color, '#FFFFFF80');
    assert.equal(o.look.captions.opacity, 0.8);
    assert.equal(o.look.headline.card.color, '#FFFFFF80');
    assert.equal(o.look.bar.glow.color, '#FFD40080');
    assert.equal(o.look.logo.opacity, 0.5);
    const sent = toEngine(o);
    const presets = saveLook([], 'Soft', sent);
    assert.equal(presets[0].options.look.captions.color, '#FFFFFF80');
    assert.equal(presets[0].options.progress_bar, '#FFD40080');
    // JSON (export / import / settings) is the same.
    const back = JSON.parse(JSON.stringify(presets));
    const entry = { kind: 'mine', name: 'Soft', options: back[0].options };
    const again = loaded(entry, defaults(null), null);
    assert.deepEqual(toEngine(again), sent);
    assert.equal(again.bar_color, '#FFD40080');
    const dup = duplicateLook(back, 'Soft', toEngine(again));
    assert.equal(dup.presets[1].options.look.bar.opacity, 0.6);
    assert.equal(deleteLook(dup.presets, 'Soft')[0].options.look.captions.opacity, 0.8);
    // fromEngine on a preset that carries the fields
    assert.equal(fromEngine(sent, null).look.headline.opacity, 0.7);
    // A bad colour is still dropped, a bad opacity is clamped.
    assert.equal(sanitizeLook({ captions: { color: '#FFF', opacity: 9 }, headline: { ink: '#FFFFFF9' } }).captions.color, undefined);
    assert.equal(sanitizeLook({ captions: { opacity: 9 } }).captions.opacity, 1);
    assert.equal(sanitizeLook({ headline: { opacity: -1 } }).headline.opacity, 0);
    assert.equal(sanitizeLook({ headline: { ink: '#FFFFFF9' } }).headline.ink, undefined);
    // The store round-trips it too.
    const s = createLookStore({ storage: memory() });
    s.seed(null);
    s.setCaptions({ color: '#11223344', opacity: 0.4 });
    assert.deepEqual(s.get().options.look.captions, { color: '#11223344', opacity: 0.4 });
});

test('every colour field of every section reads six or eight digits', () => {
    const c = cleanCaptions(LOOK.captions);
    for (const p of [c.color, c.active, c.accent, c.outline, c.box, c.stroke.color, c.shadow.color, c.glow.color, c.words.upcoming.color, c.words.active.color,
        c.words.active.stroke.color, c.words.active.glow.color, c.words.active.box.color, c.words.spoken.color, c.words.keyword.color, c.words.keyword.glow.color]) {
        assert.match(p, /^#[0-9A-F]{8}$/);
    }
    const h = cleanHeadline(LOOK.headline);
    for (const p of [h.ink, h.accent, h.card.color, h.stroke.color, h.shadow.color, h.glow.color]) assert.match(p, /^#[0-9A-F]{8}$/);
    assert.equal(cleanHeadline({ card: '#FFFFFF80' }).card, '#FFFFFF80');
    const b = cleanBar(LOOK.bar);
    for (const p of [b.color, b.track, b.glow.color]) assert.match(p, /^#[0-9A-F]{8}$/);
    const l = cleanLogo(LOOK.logo);
    for (const p of [l.shadow.color, l.glow.color]) assert.match(p, /^#[0-9A-F]{8}$/);
    assert.deepEqual([c.opacity, h.opacity, b.opacity, l.opacity], [0.8, 0.7, 0.6, 0.5]);
    assert.equal(cleanCaptions({ opacity: 'half' }).opacity, undefined);
});

test('the new element opacities belong to the first section of their panel', () => {
    assert.equal(sectionOf(HEADLINE_LAYER, 'opacity'), 'headline');
    assert.equal(sectionOf(BAR_LAYER, 'opacity'), 'bar');
});

// ---------------------------------------------------------------------------
// the colour control
// ---------------------------------------------------------------------------

test('colour control: a new hue keeps the opacity, a typed opacity sets it', () => {
    assert.deepEqual(pickColour('#11223380', '#ff0000'), { colour: '#FF000080' });
    assert.deepEqual(pickColour('#112233', '#ff0000'), { colour: '#FF0000' });
    assert.deepEqual(pickColour('#112233', '#ff000040'), { colour: '#FF000040' });
    assert.deepEqual(pickColour('#11223380', '#ff0000ff'), { colour: '#FF0000FF' });
    assert.equal(pickColour('#112233', 'nope'), null);
    assert.equal(pickColour('#112233', '#f00'), null);
});

test('colour control: the slider writes the colour\'s own AA, six digits at 100%', () => {
    assert.deepEqual(pickOpacity('#112233', 0.5, false), { colour: '#11223380' });
    assert.deepEqual(pickOpacity('#11223380', 1, false), { colour: '#112233' });
    assert.deepEqual(pickOpacity('#11223380', 0, false), { colour: '#11223300' });
});

test('colour control: where the opacity is a number of the Look the slider edits the number', () => {
    // The colour stays six digits; the number moves.
    assert.deepEqual(pickOpacity('#112233', 0.3, true), { number: 0.3 });
    assert.deepEqual(pickColour('#112233', '#ff0000', 0.3), { colour: '#FF0000' });
    // A Look with both shows the product and is normalised to the number on the next edit.
    const s = colourShown('#11223380', 0.5);
    near(s.opacity, (128 / 255) * 0.5);
    assert.equal(s.both, true);
    assert.equal(colourShown('#112233', 0.5).both, false);
    assert.equal(colourShown('#112233', undefined).opacity, 1);
    assert.equal(colourShown('#11223380', undefined).opacity, alphaOf('#11223380'));
    const hue = pickColour('#11223380', '#ff0000', 0.5);
    assert.equal(hue.colour, '#FF0000');
    near(hue.number, (128 / 255) * 0.5);
    const slide = pickOpacity('#11223380', 0.9, true);
    assert.deepEqual(slide, { colour: '#112233', number: 0.9 });
    // Typed eight digits become the number.
    const typed = pickColour('#112233', '#ff000040', 0.5);
    assert.equal(typed.colour, '#FF0000');
    near(typed.number, 64 / 255);
});

test('colour control: the bound edits land in the Look as one patch and reset clears both', () => {
    // Caption box: the colour and its opacity are box.color and box.opacity.
    const view = captionView('hormozi', '9:16', {}, {});
    const colour = editPatch(view, 'box.color', '#FF0000');
    const number = editPatch(view, 'box.opacity', 0.4);
    assert.equal(colour.box.color, '#FF0000');
    assert.equal(number.box.opacity, 0.4);
    assert.deepEqual(clearPatch('box.opacity'), { box: { opacity: undefined }, box_opacity: undefined });
    // The v1 pair is shown as its product's number.
    const v1 = captionView('minimal', '9:16', { box: '#336699', box_opacity: 0.6 }, {});
    assert.equal(v1.val('box.opacity'), 0.6);
    assert.equal(v1.val('box.color'), '#336699');
    // Shadows, cards and tracks have theirs.
    assert.equal(captionView('minimal', '9:16', { shadow: { opacity: 0.3 } }, {}).val('shadow.opacity'), 0.3);
});

test('editing a box that is a v1 colour keeps its colour and its opacity', () => {
    const view = captionView('minimal', '9:16', { box: '#336699', box_opacity: 0.6 }, {});
    const patch = editPatch(view, 'box.opacity', 0.9);
    assert.equal(patch.box.color, '#336699');
    assert.equal(patch.box.opacity, 0.9);
    assert.equal(patch.box_opacity, undefined);
    assert.ok('box_opacity' in patch);
});

// ---------------------------------------------------------------------------
// the element opacities in the controls' views
// ---------------------------------------------------------------------------

test('Opacity of an element shows 100% until the Look sets it', () => {
    assert.equal(captionView('karaoke', '9:16', {}, {}).val('opacity'), 1);
    assert.equal(captionView('karaoke', '9:16', {}, {}).isSet('opacity'), false);
    assert.equal(captionView('karaoke', '9:16', { opacity: 0.4 }, {}).val('opacity'), 0.4);
    const r = resolveHeadline('Big news today', '9:16', {});
    assert.equal(headlineView(r, {}).val('opacity'), 1);
    assert.equal(headlineView(r, { opacity: 0.3 }).val('opacity'), 0.3);
    assert.equal(headlineView(r, { opacity: 0.3 }).isSet('opacity'), true);
    assert.equal(barView(resolveBar('9:16', '#FFD400', {}), {}).val('opacity'), 1);
    assert.equal(barView(resolveBar('9:16', '#FFD400', { opacity: 0.2 }), { opacity: 0.2 }).val('opacity'), 0.2);
});

// ---------------------------------------------------------------------------
// the stage's arithmetic
// ---------------------------------------------------------------------------

const WORDS = [{ w: 'JUST', s: 0, e: 0.4 }, { w: 'STOP', s: 0.4, e: 0.9 }, { w: 'NOW', s: 0.9, e: 1.4 }];
const block = (words = ['A', 'B']) => ({ t0: 0, t1: 3, words: words.map((t, i) => ({ text: t, raw: t, s: i * 0.5, e: i * 0.5 + 0.5, key: false })) });
const planOf = (look, blk = block()) => {
    const r = resolveCaptions('karaoke', { w: 300, h: 400 }, { x: 0.5, y: 0.5, ...look }, { anim: 'pop' });
    return { r, cfg: cfgOf(r), plan: planFor(cfgOf(r), r, blk, flatMeasure()) };
};
const wordAt = (plan, t, i) => frameAt(plan, t).groups[0].words.find((w) => w.i === i);

test('captions: the colours\' opacities ride beside their colours, per part', () => {
    const { r, cfg, plan } = planOf({
        color: '#FFFFFF40', active: '#FF000080', stroke: { color: '#00FF0020', width: 3 }, glow: { color: '#0000FF60', size: 12 }, shadow: { color: '#00000050' }, opacity: 0.5,
    });
    assert.equal(r.opacity, 0.5);
    assert.equal(cfg.elem, 0.5);
    near(cfg.up.alpha, 64 / 255);
    near(cfg.act.alpha, 128 / 255);
    near(cfg.up.strokeA, 32 / 255);
    near(cfg.act.strokeA, 32 / 255);
    near(cfg.shadowA, 80 / 255);
    const [up, act, spk] = wordLooks(cfg, false);
    near(up.glowA, 96 / 255);
    near(act.glowA, 96 / 255);
    // The rgb is the colour alone.
    assert.deepEqual(up.color, [255, 255, 255]);
    assert.deepEqual(act.color, [255, 0, 0]);
    near(spk.alpha, act.alpha);
    // Before the word: the unsung colour's; at the word: the sung colour's; the stroke's own all along.
    const before = wordAt(plan, 0, 1);
    near(before.ca, 64 / 255);
    near(before.sca, 32 / 255);
    near(before.gca, 96 / 255);
    const during = wordAt(plan, 700, 1);
    near(during.ca, 128 / 255);
});

test('captions: a colour opacity moves with the colour as a word is spoken', () => {
    // Attack 400 ms from the word's start: half way the opacity is half way between the two.
    const { plan } = planOf({ color: '#FFFFFF00', active: '#FF0000FF', words: { attack_ms: 400, attack_ease: 'linear' } });
    near(wordAt(plan, 500, 1).ca, 0, 1e-9);
    near(wordAt(plan, 700, 1).ca, 0.5, 1e-6);
    near(wordAt(plan, 900, 1).ca, 1, 1e-9);
    // The colour moves by the same ramp.
    near(wordAt(plan, 700, 1).col[1], 127.5, 1e-6);
});

test('captions: a keyword takes its colour\'s opacity; a spoken word keeps the sung one unless it has its own', () => {
    const cfg = cfgOf(resolveCaptions('karaoke', '9:16', { active: '#FF000080', words: { keyword: { color: '#00FF0040' } } }));
    const [, act, spk] = wordLooks(cfg, true);
    near(act.alpha, 64 / 255);
    near(spk.alpha, 64 / 255);
    const [, act2, spk2] = wordLooks(cfg, false);
    near(act2.alpha, 128 / 255);
    near(spk2.alpha, 128 / 255);
    const own = cfgOf(resolveCaptions('karaoke', '9:16', { active: '#FF000080', words: { spoken: { color: '#0000FF20' } } }));
    near(wordLooks(own, false)[2].alpha, 32 / 255);
});

test('captions: a sweep keeps the unswept colour\'s opacity for the part not yet swept', () => {
    const { plan } = planOf({ color: '#FFFFFF40', active: '#FF0000FF', words: { fill: 'sweep' } });
    const mid = wordAt(plan, 650, 1);
    assert.ok(mid.sweep > 0 && mid.sweep < 1);
    near(mid.underA, 64 / 255);
    near(mid.ca, 1);
    // Before the word starts (p = 0) the whole word is the unswept colour.
    near(wordAt(plan, 200, 1).ca, 64 / 255);
});

test('captions: the box, the shadow and the card keep their colours\' opacities', () => {
    const cfg = cfgOf(resolveCaptions('karaoke', '9:16', { box: { color: '#00FF0080', opacity: 0.5 }, shadow: { color: '#11223340' }, words: { active: { box: { color: '#FF000020' } } } }));
    near(cfg.boxfx.alpha, 128 / 255);
    assert.equal(cfg.boxfx.opacity, 0.5);
    near(cfg.abox.alpha, 32 / 255);
    near(cfg.shadowA, 64 / 255);
    assert.deepEqual(cfg.boxfx.col, [0, 255, 0]);
    // A v1 box colour carries its opacity into the drawn box.
    const v1 = cfgOf(resolveCaptions('karaoke', '9:16', { box: '#33669980', shadow: { y: 1 } }));
    assert.equal(v1.boxfx, null);
    assert.equal(resolveCaptions('minimal', '9:16', { box: '#33669980' }).box.color, '#33669980');
    // The colour with nothing set has none.
    near(cfgOf(resolveCaptions('karaoke', '9:16', { glow: { size: 10 } })).act.glowA, 1);
});

test('captions: the whole element\'s opacity does not make a caption word-level', () => {
    assert.equal(resolveCaptions('karaoke', '9:16', { opacity: 0.5 }).wordLevel, false);
    assert.equal(resolveCaptions('karaoke', '9:16', { color: '#FFFFFF80' }).wordLevel, false);
    assert.equal(resolveCaptions('karaoke', '9:16', { opacity: 0.5 }).opacity, 0.5);
    assert.equal(resolveCaptions('karaoke', '9:16', {}).opacity, 1);
});

test('the headline: eight-digit ink reads as its colour for contrast, and the opacity rides along', () => {
    // A dark ink with opacity still gets the light edge; a light one the dark.
    const dark = resolveHeadline('Big news', '9:16', { ink: '#00000080', card: 'none' });
    assert.equal(dark.outline.color, '#FFFFFF');
    const light = resolveHeadline('Big news', '9:16', { ink: '#FFFFFF80', card: 'none' });
    assert.equal(light.outline.color, '#000000');
    assert.equal(light.opacity, 1);
    assert.equal(resolveHeadline('Big news', '9:16', { opacity: 0.4 }).opacity, 0.4);
    const v2 = resolveHeadline('Big news', '9:16', { opacity: 0.4, ink: '#00000080', card: 'none', width: 0.8 });
    assert.equal(v2.positioned, true);
    assert.equal(v2.opacity, 0.4);
    assert.equal(v2.cap.opacity, 0.4);
    assert.equal(v2.cap.clean.box, undefined);
    assert.equal(v2.stroke.color, '#FFFFFF');
    const card = resolveHeadline('Big news', '9:16', { card: { color: '#FFFFFF80', opacity: 0.5 }, shadow: { y: 2 } });
    near(cfgOf(card.cap).boxfx.alpha, 128 / 255);
    assert.equal(cfgOf(card.cap).boxfx.opacity, 0.5);
    assert.equal(cfgOf(card.cap).elem, 1);
});

test('the bar: the element opacity and the colours\' opacities are kept apart', () => {
    const b = resolveBar('9:16', '#FFD40080', { opacity: 0.5, track: '#00000080', track_opacity: 0.4, glow: { size: 10, color: '#FFFFFF40', strength: 0.5 } });
    assert.equal(b.opacity, 0.5);
    assert.equal(b.color, '#FFD40080');
    assert.deepEqual(b.track, { color: '#00000080', opacity: 0.4 });
    assert.equal(b.glow.color, '#FFFFFF40');
    assert.equal(b.glow.strength, 0.5);
    assert.equal(resolveBar('9:16', '#FFD400', {}).opacity, 1);
    assert.equal(resolveBar('9:16', '#FFD400', { opacity: 0.2 }).shaped, false);
    // The Look's colour wins; the default glow colour is the fill's hue alone.
    assert.equal(resolveBar('9:16', '#FFD400', { color: '#00FF0080' }).color, '#00FF0080');
    assert.equal(resolveBar('9:16', '#FFD40080', { glow: { size: 10 } }).glow.color, '#FFD400');
    // The CSS the stage draws: fill = colour x opacity; track = colour x track x element; glow = colour x strength x element.
    assert.equal(cssColour(b.color, b.opacity), `rgb(255 212 0 / ${Math.round((128 / 255) * 0.5 * 1000) / 1000})`);
    assert.equal(cssColour(b.track.color, b.track.opacity, b.opacity), `rgb(0 0 0 / ${Math.round((128 / 255) * 0.4 * 0.5 * 1000) / 1000})`);
    assert.equal(cssColour(b.glow.color, b.glow.strength, b.opacity), `rgb(255 255 255 / ${Math.round((64 / 255) * 0.5 * 0.5 * 1000) / 1000})`);
});

test('the logo: its stack is one group, its shadow and glow carry their colours\' opacities', () => {
    const l = resolveLogo('9:16', 'tr', { opacity: 0.5, shadow: { color: '#00000080', opacity: 0.5 }, glow: { color: '#FFFFFF40', size: 10, strength: 0.5 } }, null);
    assert.equal(l.opacity, 0.5);
    assert.equal(l.shadow.color, '#00000080');
    assert.equal(l.glow.color, '#FFFFFF40');
    assert.equal(cssColour(l.shadow.color, l.shadow.opacity), `rgb(0 0 0 / ${Math.round((128 / 255) * 0.5 * 1000) / 1000})`);
    assert.equal(resolveLogo('9:16', 'tr', {}, null).opacity, 0.9);
});

// ---------------------------------------------------------------------------
// the words
// ---------------------------------------------------------------------------

test('the new strings are in all six languages and nothing else was lost', () => {
    for (const lang of ['sq', 'de', 'fr', 'es', 'it', 'tr']) {
        for (const key of ['Opacity', 'Opacity of {name}', 'Show opacity of {name}']) assert.ok(studio[lang][key], `${lang}: ${key}`);
        assert.match(studio[lang]['Opacity of {name}'], /\{name\}/);
        assert.match(studio[lang]['Show opacity of {name}'], /\{name\}/);
    }
});
