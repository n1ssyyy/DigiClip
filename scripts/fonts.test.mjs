// Tests for the font library of Studio: the groups and search of the picker,
// the default and its pruning, names the engine may not have, what a removal
// does to the Look, the list without the ability, the font file URL, name
// cleaning, the stage's draw rule, face bookkeeping, metrics and the preview.
//   node --test scripts/fonts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanCaptions, fontBox, metricsOf, resolveCaptions } from '../src/lib/captionStyles.js';
import { createLookStore, fromEngine, sanitizeLook, toEngine } from '../src/lib/look.js';
import { HEADLINE_FONT, HEADLINE_SPECS, cleanHeadline, isPositioned } from '../src/lib/layerFields.js';
import { resolveHeadline } from '../src/lib/layers.js';
import { captionView } from '../src/lib/captionEffective.js';
import { headlineView } from '../src/lib/layerEffective.js';
import {
    BUILTIN_FONTS, CATEGORY_ORDER, chooseValue, entriesOf, findFont, flatRows, fontFileUrl, fontStatus, groupFonts, normalizeFonts,
    removalEdit, searchFonts, showSearch,
} from '../src/lib/fontLibrary.js';
import { APP_FONTS, FONT_NAME_MAX, appFont, cleanFontName, cssFont, sameFont } from '../src/lib/fontNames.js';
import { drawFont, faceMetrics, faceStatus, fontVersion, markFailed, markReady, resetFonts, setInstalled, subscribeFonts } from '../src/lib/fontState.js';
import { createFaceLoader } from '../src/lib/faceLoader.js';
import { createFontStore } from '../src/lib/fontStore.js';
import { parseFontMetrics } from '../src/lib/fontMetrics.js';
import { createFontPreview, withFontPreview } from '../src/lib/fontPreview.js';
import { isTypeKey, moveActive, typeahead } from '../src/lib/fontPicker.js';
import { fontTrait, lookSummary, withFont } from '../src/lib/lookSummary.js';

// The engine's listing: 15 bundled, then the creator's (digiclip-rs `fonts_list`).
const b = (family, category, file = `${family.replace(/\W/g, '')}.ttf`) => ({
    family, file, bundled: true, category, weight: 400, bytes: 1000, licence: 'OFL-1.1', rev: 'bundled', url: `/font/${file}`,
});
const ENGINE = [
    b('Anton', 'display'), b('Bebas Neue', 'display'), b('Oswald', 'display'), b('Archivo Black', 'display'),
    b('Lilita One', 'rounded'), b('Bangers', 'comic'), b('Luckiest Guy', 'comic'),
    b('Inter Medium', 'sans'), b('Montserrat ExtraBold', 'sans'), b('Poppins', 'sans'), b('Space Grotesk', 'sans'),
    b('DM Serif Display', 'serif'), b('Permanent Marker', 'hand'), b('JetBrains Mono', 'mono'), b('Space Mono', 'mono'),
    { family: 'Zeitung Pro', file: 'Zeitung-Pro.ttf', bundled: false, category: 'custom', weight: 700, bytes: 5000, rev: '7', url: '/font/Zeitung-Pro.ttf' },
    { family: 'Åkerbär', file: 'Akerbar.otf', bundled: false, category: 'custom', weight: 400, bytes: 4000, rev: '9', url: '/font/Akerbar.otf' },
];
const LIST = normalizeFonts({ fonts: ENGINE, dir: 'C:/fonts', max_bytes: 20971520 });

// Every test starts from a page that knows no fonts.
const it = (name, fn) => test(name, (...a) => {
    resetFonts();
    return fn(...a);
});

// ---- names -----------------------------------------------------------------------------------

it('a font name is any non-empty family of a sane length; the app fonts keep their spelling', () => {
    assert.equal(cleanFontName('anton'), 'Anton');
    assert.equal(cleanFontName('  jetbrains mono '), 'JetBrains Mono');
    assert.equal(cleanFontName('  Zeitung Pro '), 'Zeitung Pro');
    assert.equal(cleanFontName('bangers'), 'bangers'); // the engine reads it case-insensitively
    for (const bad of ['', '   ', undefined, null, 12, true, {}, [], 'a'.repeat(FONT_NAME_MAX + 1), 'bad\u0000name', 'two\nlines']) {
        assert.equal(cleanFontName(bad), undefined, JSON.stringify(bad));
    }
    assert.equal(cleanFontName('a'.repeat(FONT_NAME_MAX)), 'a'.repeat(FONT_NAME_MAX));
    assert.ok(sameFont(' ANTON', 'anton') && !sameFont('Anton', 'Anton Two') && !sameFont(null, 'Anton'));
    assert.equal(appFont('inter medium'), 'Inter Medium');
    assert.equal(appFont('Bangers'), undefined);
    assert.equal(cssFont("Bob's \\ Font"), "'Bob\\'s \\\\ Font'");
});

it('the Look keeps a font name it cannot verify; wrong values are absent', () => {
    assert.deepEqual(cleanCaptions({ font: 'Ghost Sans', size: 1.5 }), { font: 'Ghost Sans', size: 1.5 });
    assert.deepEqual(cleanHeadline({ font: ' Ghost Sans ' }), { font: 'Ghost Sans' });
    for (const font of ['', '  ', 7, null, 'x'.repeat(81)]) {
        assert.deepEqual(cleanCaptions({ font }), {}, String(font));
        assert.deepEqual(cleanHeadline({ font }), {}, String(font));
    }
    // Old data with the four known names round-trips unchanged.
    for (const f of APP_FONTS) {
        assert.equal(cleanCaptions({ font: f }).font, f);
        assert.equal(cleanHeadline({ font: f }).font, f);
        const e = { style: 'tiktok', look: { captions: { font: f }, headline: { font: f } } };
        const back = toEngine(fromEngine(e, null)).look;
        assert.deepEqual([back.captions, back.headline], [e.look.captions, e.look.headline]);
    }
    assert.equal(HEADLINE_SPECS.font.type, 'font');
    assert.equal(HEADLINE_SPECS.font.def, HEADLINE_FONT);
});

it('an unknown font survives the store, a save and a reload, and is reported as not installed', () => {
    const store = createLookStore({ storage: null });
    store.setCaptions({ font: 'Ghost Sans' });
    store.setHeadline({ font: 'Ghost Serif' });
    const look = store.get().options.look;
    assert.equal(look.captions.font, 'Ghost Sans');
    assert.equal(look.headline.font, 'Ghost Serif');
    assert.deepEqual(sanitizeLook(look).captions, { font: 'Ghost Sans' });
    assert.equal(toEngine(store.get().options).look.captions.font, 'Ghost Sans');
    assert.equal(fromEngine(toEngine(store.get().options), null).look.headline.font, 'Ghost Serif');
    // The controls show the name, the engine's list says it is not there.
    assert.equal(captionView('tiktok', '9:16', look.captions).val('font'), 'Ghost Sans');
    const hv = headlineView(resolveHeadline('Big news', '9:16', look.headline, {}), look.headline);
    assert.equal(hv.val('font'), 'Ghost Serif');
    assert.equal(fontStatus('Ghost Sans', LIST, true), 'missing');
    assert.equal(fontStatus('ghost sans', LIST, false), 'unknown'); // the list has not loaded: cannot tell
    assert.equal(fontStatus('anton', LIST, true), 'ok');
    assert.equal(fontStatus('zeitung pro', LIST, true), 'ok');
    // The stage draws the default, which is what the engine does.
    setInstalled(LIST);
    const r = resolveCaptions('tiktok', '9:16', look.captions);
    assert.equal(r.font, 'Archivo Black');
    assert.equal(r.clean.font, 'Ghost Sans');
    assert.equal(resolveHeadline('Big news', '9:16', look.headline, {}).font, 'Archivo Black');
    // Choosing another font fixes it.
    store.setCaptions({ font: 'Anton' });
    assert.equal(store.get().options.look.captions.font, 'Anton');
    assert.equal(resolveCaptions('tiktok', '9:16', store.get().options.look.captions).font, 'Anton');
});

// ---- the list, groups, search --------------------------------------------------------------------

it('the list is grouped in the picker order, the creator\'s fonts first, the engine\'s order inside', () => {
    assert.equal(LIST.length, 17);
    const g = groupFonts(LIST, '', 'Archivo Black');
    assert.deepEqual(g.map((x) => x.id), ['custom', 'display', 'rounded', 'comic', 'sans', 'serif', 'hand', 'mono']);
    assert.deepEqual(g.map((x) => x.label), ['Your fonts', 'Display', 'Rounded', 'Comic', 'Sans', 'Serif', 'Handwritten', 'Mono']);
    assert.deepEqual(g[0].rows.map((r) => r.family), ['Zeitung Pro', 'Åkerbär']);
    assert.deepEqual(g[1].rows.map((r) => r.family), ['Anton', 'Bebas Neue', 'Oswald', 'Archivo Black']);
    assert.deepEqual(g[4].rows.map((r) => r.family), ['Inter Medium', 'Montserrat ExtraBold', 'Poppins', 'Space Grotesk']);
    assert.equal(flatRows(g).length, 17);
    assert.deepEqual(CATEGORY_ORDER.slice(0, 2), ['custom', 'display']);
    // No creator fonts: no "Your fonts" group; a category the picker does not know goes last.
    const none = groupFonts(LIST.filter((f) => f.bundled).concat([{ ...LIST[0], family: 'Odd', category: 'future' }]));
    assert.equal(none[0].id, 'display');
    assert.equal(none.at(-1).id, 'other');
    assert.equal(none.at(-1).label, 'Other');
});

it('search finds words in any order, ignoring case and accents, and keeps the grouping', () => {
    assert.deepEqual(searchFonts(LIST, 'space').map((f) => f.family), ['Space Grotesk', 'Space Mono']);
    assert.deepEqual(searchFonts(LIST, 'MONO SPACE').map((f) => f.family), ['Space Mono']);
    assert.deepEqual(searchFonts(LIST, 'akerbar').map((f) => f.family), ['Åkerbär']);
    assert.deepEqual(searchFonts(LIST, 'aker').map((f) => f.family), ['Åkerbär']);
    assert.equal(searchFonts(LIST, '  ').length, LIST.length);
    assert.deepEqual(searchFonts(LIST, 'zzz'), []);
    const g = groupFonts(LIST, 'o', '');
    assert.ok(g.every((x) => x.rows.length) && g.every((x) => x.rows.every((r) => r.family.toLowerCase().includes('o'))));
    assert.deepEqual(groupFonts(LIST, 'nothing', ''), []);
    // The search field shows once there are more than about twelve entries.
    assert.equal(showSearch(LIST), true);
    assert.equal(showSearch(BUILTIN_FONTS), false);
    assert.equal(showSearch(LIST.slice(0, 12)), false);
    assert.equal(showSearch(LIST.slice(0, 13)), true);
});

it('the default font is marked, and choosing it clears the override like any other field', () => {
    const rows = flatRows(groupFonts(LIST, '', 'archivo black'));
    assert.deepEqual(rows.filter((r) => r.isDefault).map((r) => r.family), ['Archivo Black']);
    assert.deepEqual(flatRows(groupFonts(LIST, '', 'Anton')).filter((r) => r.isDefault).map((r) => r.family), ['Anton']);
    assert.equal(chooseValue('Archivo Black', 'Archivo Black'), undefined);
    assert.equal(chooseValue('Archivo Black', 'archivo black'), undefined);
    assert.equal(chooseValue('Bangers', 'Archivo Black'), 'Bangers');
    let clock = 0;
    const store = createLookStore({ storage: null, now: () => (clock += 1000) });
    const view = (s) => captionView('hormozi', '9:16', s.get().options.look.captions);
    assert.equal(view(store).defaultFont, 'Anton');
    store.setCaptions({ font: chooseValue('Bangers', view(store).defaultFont) });
    assert.equal(store.get().options.look.captions.font, 'Bangers');
    assert.equal(view(store).isSet('font'), true);
    store.setCaptions({ font: chooseValue('Anton', view(store).defaultFont) });
    assert.equal('font' in store.get().options.look.captions, false);
    assert.equal(view(store).isSet('font'), false);
    assert.equal(view(store).val('font'), 'Anton');
    assert.equal(headlineView(resolveHeadline('x', '9:16', {}, {}), {}).defaultFont, 'Archivo Black');
    // The font tweak is one undo step each.
    store.undo();
    assert.equal(store.get().options.look.captions.font, 'Bangers');
    store.undo();
    assert.equal('font' in store.get().options.look.captions, false);
});

it('without the ability the list is the four built-in fonts', () => {
    const e = entriesOf({ fonts: null });
    assert.deepEqual(e.map((f) => f.family), ['Anton', 'Archivo Black', 'Inter Medium', 'JetBrains Mono']);
    assert.deepEqual(e, BUILTIN_FONTS);
    assert.deepEqual(groupFonts(e).map((g) => g.id), ['display', 'sans', 'mono']);
    assert.equal(fontStatus('Bangers', e, true), 'missing');
    assert.equal(fontStatus('Anton', e, true), 'ok');
    assert.equal(entriesOf(undefined), BUILTIN_FONTS);
    assert.equal(findFont(e, 'inter medium').family, 'Inter Medium');
    assert.equal(findFont(e, 'Bangers'), undefined);
    // The built-ins have no file to load; the engine's list has.
    assert.ok(e.every((f) => f.file === ''));
});

it('a damaged engine list is read as far as it can be', () => {
    assert.equal(normalizeFonts(null), null);
    assert.equal(normalizeFonts({ fonts: 'x' }), null);
    assert.equal(normalizeFonts({ fonts: [] }), null);
    const out = normalizeFonts({ fonts: [null, 3, { family: 'No file' }, { family: '', file: 'a.ttf' }, ENGINE[0], { ...ENGINE[0], file: 'dup.ttf' },
        { family: 'Mine', file: 'Mine.ttf', category: 'custom', rev: 4 }] });
    assert.deepEqual(out.map((f) => f.family), ['Anton', 'Mine']);
    assert.equal(out[1].rev, '4');
    assert.equal(out[1].bundled, false);
});

// ---- removal -------------------------------------------------------------------------------------

it('removing a font puts the layers that use it back on their default, as one undo step', () => {
    const store = createLookStore({ storage: null });
    store.setCaptions({ font: 'Zeitung Pro', size: 1.2 });
    store.setHeadline({ font: 'zeitung pro', ink: '#FFFFFF' });
    const edit = removalEdit(store.get().options.look, 'Zeitung Pro');
    assert.deepEqual(edit.layers, ['captions', 'headline']);
    assert.deepEqual(edit.sections, { captions: { font: undefined }, headline: { font: undefined } });
    store.edit(null, edit.sections);
    const look = store.get().options.look;
    assert.deepEqual(look.captions, { size: 1.2 });
    assert.deepEqual(look.headline, { ink: '#FFFFFF' });
    store.undo(); // ONE step brings both back
    assert.equal(store.get().options.look.captions.font, 'Zeitung Pro');
    assert.equal(store.get().options.look.headline.font, 'zeitung pro');
    // Only the layer that uses it; nothing at all when none does.
    assert.deepEqual(removalEdit({ captions: { font: 'Anton' }, headline: { font: 'Zeitung Pro' } }, 'Zeitung Pro').layers, ['headline']);
    assert.equal(removalEdit({ captions: { font: 'Anton' } }, 'Zeitung Pro'), null);
    assert.equal(removalEdit(undefined, 'Zeitung Pro'), null);
    assert.equal(removalEdit({}, 'Zeitung Pro'), null);
});

// ---- URL --------------------------------------------------------------------------------------------

it('a font file is fetched from the engine\'s font route with the token and the revision', () => {
    const serve = { port: 4711, token: 'a b&c' };
    assert.equal(fontFileUrl(serve, ENGINE[15]), 'http://127.0.0.1:4711/font/Zeitung-Pro.ttf?token=a%20b%26c&v=7');
    assert.equal(fontFileUrl(serve, { file: 'we ird/é.ttf', rev: '' }), 'http://127.0.0.1:4711/font/we%20ird%2F%C3%A9.ttf?token=a%20b%26c');
    assert.equal(fontFileUrl(null, ENGINE[0]), null);
    assert.equal(fontFileUrl({ port: 1 }, ENGINE[0]), null);
    assert.equal(fontFileUrl(serve, { file: '' }), null);
});

// ---- what the stage draws ----------------------------------------------------------------------------------

it('the stage draws the Look\'s font only once its face is in the page, else the default', () => {
    const seen = [];
    const off = subscribeFonts(() => seen.push(fontVersion()));
    // Nothing known: the four app fonts draw, everything else waits (the default meanwhile).
    assert.equal(drawFont('anton', 'Archivo Black'), 'Anton');
    assert.equal(drawFont('Bangers', 'Archivo Black'), 'Archivo Black');
    assert.equal(faceStatus('Bangers'), 'loading');
    setInstalled(LIST);
    assert.equal(faceStatus('Bangers'), 'loading');
    assert.equal(faceStatus('Ghost'), 'missing');
    assert.equal(drawFont('Bangers', 'Anton'), 'Anton');
    markReady('Bangers', { upm: 1000, winA: 900, winD: 300, hheaA: 800, hheaD: 200 });
    assert.equal(faceStatus('bangers'), 'ready');
    assert.equal(drawFont('bangers', 'Anton'), 'Bangers'); // the engine's spelling
    assert.deepEqual(resolveCaptions('tiktok', '9:16', { font: 'bangers' }).font, 'Bangers');
    assert.equal(resolveHeadline('Big news', '9:16', { font: 'Bangers' }, {}).font, 'Bangers');
    assert.ok(seen.length >= 2 && seen.every((v, i) => i === 0 || v > seen[i - 1]), 'every change is a new version');
    // The layout follows the face it was loaded with.
    const m = faceMetrics('Bangers');
    assert.equal(m.winA, 900);
    assert.equal(metricsOf('Bangers'), m);
    assert.equal(metricsOf('Nope'), metricsOf('Archivo Black'));
    const a = fontBox('Bangers', 100);
    assert.ok(Math.abs(a.em - (100 * 1000) / 1200) < 1e-9);
    // A failed face keeps the default and says so.
    markFailed('Oswald');
    assert.equal(faceStatus('Oswald'), 'failed');
    assert.equal(drawFont('Oswald', 'Anton'), 'Anton');
    // A font that leaves the list is forgotten, with its face.
    const gone = setInstalled(LIST.filter((f) => f.family !== 'Bangers'));
    assert.deepEqual(gone, ['bangers']);
    assert.equal(drawFont('Bangers', 'Anton'), 'Anton');
    assert.equal(faceStatus('Bangers'), 'missing');
    assert.equal(faceMetrics('Bangers'), undefined);
    // An engine without the ability: no list, the unknown wait, the four draw.
    setInstalled(null);
    assert.equal(drawFont('Space Mono', 'Anton'), 'Anton');
    assert.equal(drawFont('JetBrains Mono', 'Anton'), 'JetBrains Mono');
    off();
});

it('a headline with a font the engine does not have stays the plain headline, as in the engine', () => {
    setInstalled(LIST);
    assert.equal(isPositioned(cleanHeadline({ font: 'Ghost' })), false);
    assert.equal(isPositioned(cleanHeadline({ font: 'Bangers' })), true);
    assert.equal(isPositioned(cleanHeadline({ font: 'Anton' })), true);
});

// ---- faces ----------------------------------------------------------------------------------------------------

it('each font file loads once per revision; the newest revision wins; failures can be retried', async () => {
    const calls = [];
    const ready = [];
    const failed = [];
    let fail = new Set();
    const l = createFaceLoader({
        load: async (e) => {
            calls.push(`${e.family}@${e.rev}`);
            if (fail.has(e.family)) throw new Error('nope');
            return { bytes: e.rev };
        },
        onReady: (e, r) => ready.push(`${e.family}@${r.bytes}`),
        onFailed: (e) => failed.push(e.family),
    });
    const z = ENGINE[15];
    assert.equal(l.status(z), 'idle');
    const p = l.ensure(z);
    assert.equal(l.status(z), 'loading');
    assert.equal(l.ensure({ ...z }), p, 'the same file is not requested twice');
    assert.equal(await p, true);
    assert.equal(l.status(z), 'ready');
    await l.ensure(z);
    assert.deepEqual(calls, ['Zeitung Pro@7']);
    // The app's own faces are never loaded.
    assert.equal(await l.ensure(LIST[0]), true);
    assert.equal(await l.ensure(BUILTIN_FONTS[0]), true);
    assert.equal(await l.ensure(null), true);
    assert.deepEqual(calls, ['Zeitung Pro@7']);
    // A new revision (the file changed) loads again; an older one finishing late is dropped.
    const slow = l.ensure({ ...z, rev: '8' });
    const newest = l.ensure({ ...z, rev: '9' });
    await Promise.all([slow, newest]);
    assert.deepEqual(ready, ['Zeitung Pro@7', 'Zeitung Pro@9']);
    // Failure is remembered, then tried again when asked.
    fail = new Set(['Åkerbär']);
    assert.equal(await l.ensure(ENGINE[16]), false);
    assert.equal(await l.ensure(ENGINE[16]), false);
    assert.deepEqual(failed, ['Åkerbär']);
    assert.equal(calls.filter((c) => c.startsWith('Åkerbär')).length, 1);
    fail = new Set();
    l.retryFailed();
    assert.equal(await l.ensure(ENGINE[16]), true);
    assert.equal(l.status(ENGINE[16]), 'ready');
    // Forgetting a family makes it load again.
    l.forget('zeitung pro');
    assert.equal(l.status(z), 'idle');
});

it('the library store reads the list, keeps the last good one, adds and removes through the engine', async () => {
    const log = [];
    let list = ENGINE.slice(0, 15);
    let fail = false;
    const lists = [];
    const store = createFontStore({
        ask: async (name, params) => {
            log.push([name, params]);
            if (name === 'fonts_list') {
                if (fail) throw new Error('down');
                return { fonts: list, dir: 'D', max_bytes: 5 };
            }
            if (name === 'fonts_add') {
                if (params.path.endsWith('bad.ttf')) throw new Error('cannot add “bad.ttf”: not a font');
                list = [...list, ENGINE[15]];
                return { font: ENGINE[15] };
            }
            const gone = list.find((f) => f.family === params.font);
            list = list.filter((f) => f !== gone);
            return { font: gone };
        },
        onList: (f) => lists.push(f && f.length),
    });
    assert.equal(store.get().status, 'idle');
    await store.refresh();
    assert.equal(store.get().status, 'ready');
    assert.equal(store.get().fonts.length, 15);
    assert.equal(store.get().dir, 'D');
    assert.equal(store.get().maxBytes, 5);
    const added = await store.add('C:\\fonts\\Zeitung.ttf');
    assert.equal(added.family, 'Zeitung Pro');
    assert.equal(store.get().fonts.length, 16, 'the list is read again after an add');
    await assert.rejects(store.add('C:\\x\\bad.ttf'), /cannot add “bad.ttf”: not a font/);
    assert.equal(store.get().fonts.length, 16);
    const removed = await store.remove('Zeitung Pro');
    assert.equal(removed.family, 'Zeitung Pro');
    assert.equal(store.get().fonts.length, 15);
    assert.deepEqual(log.filter(([n]) => n !== 'fonts_list').map(([n, p]) => [n, p]), [
        ['fonts_add', { path: 'C:\\fonts\\Zeitung.ttf' }], ['fonts_add', { path: 'C:\\x\\bad.ttf' }], ['fonts_remove', { font: 'Zeitung Pro' }],
    ]);
    // The engine is down: the last list stays, marked failed.
    fail = true;
    await store.refresh();
    assert.equal(store.get().status, 'failed');
    assert.equal(store.get().fonts.length, 15);
    // An older engine / gone: no list at all.
    store.reset();
    assert.equal(store.get().fonts, null);
    assert.equal(lists.at(-1), null);
    assert.deepEqual(entriesOf(store.get()), BUILTIN_FONTS);
});

it('only the newest answer of the engine counts', async () => {
    const answers = [];
    const store = createFontStore({ ask: () => new Promise((res) => answers.push(res)) });
    const first = store.refresh();
    const second = store.refresh();
    answers[1]({ fonts: ENGINE.slice(0, 3) });
    await second;
    answers[0]({ fonts: ENGINE.slice(0, 1) });
    await first;
    assert.equal(store.get().fonts.length, 3);
});

// ---- metrics ----------------------------------------------------------------------------------------------------

/** A minimal sfnt with the tables the reader needs. */
function sfnt({ upm = 1000, win = [900, 300], hhea = [800, -200], os2 = true, magic = 0x00010000 } = {}) {
    const tables = {};
    const head = new DataView(new ArrayBuffer(54));
    head.setUint16(18, upm);
    tables.head = head;
    const hh = new DataView(new ArrayBuffer(36));
    hh.setInt16(4, hhea[0]);
    hh.setInt16(6, hhea[1]);
    tables.hhea = hh;
    if (os2) {
        const o = new DataView(new ArrayBuffer(78));
        o.setUint16(74, win[0]);
        o.setUint16(76, win[1]);
        tables['OS/2'] = o;
    }
    const names = Object.keys(tables);
    let off = 12 + names.length * 16;
    const total = off + names.reduce((n, k) => n + tables[k].byteLength, 0);
    const out = new DataView(new ArrayBuffer(total));
    out.setUint32(0, magic);
    out.setUint16(4, names.length);
    names.forEach((k, i) => {
        const r = 12 + i * 16;
        for (let c = 0; c < 4; c++) out.setUint8(r + c, (k + '    ').charCodeAt(c));
        out.setUint32(r + 8, off);
        out.setUint32(r + 12, tables[k].byteLength);
        for (let c = 0; c < tables[k].byteLength; c++) out.setUint8(off + c, tables[k].getUint8(c));
        off += tables[k].byteLength;
    });
    return out.buffer;
}

it('the vertical metrics are read like the engine reads them (OS/2 win, else hhea)', () => {
    assert.deepEqual(parseFontMetrics(sfnt()), { upm: 1000, winA: 900, winD: 300, hheaA: 800, hheaD: 200 });
    assert.deepEqual(parseFontMetrics(new Uint8Array(sfnt({ upm: 2048, win: [2876, 674] }))), { upm: 2048, winA: 2876, winD: 674, hheaA: 800, hheaD: 200 });
    assert.deepEqual(parseFontMetrics(sfnt({ os2: false })), { upm: 1000, winA: 800, winD: 200, hheaA: 800, hheaD: 200 });
    assert.deepEqual(parseFontMetrics(sfnt({ win: [0, 0] })), { upm: 1000, winA: 800, winD: 200, hheaA: 800, hheaD: 200 });
    assert.deepEqual(parseFontMetrics(sfnt({ magic: 0x4f54544f })).upm, 1000); // OpenType (CFF)
    assert.equal(parseFontMetrics(sfnt({ upm: 8 })), null);
    assert.equal(parseFontMetrics(sfnt({ magic: 0x774f4646 })), null); // woff
    assert.equal(parseFontMetrics(sfnt({ os2: false, hhea: [0, 0] })), null);
    assert.equal(parseFontMetrics(new ArrayBuffer(3)), null);
    assert.equal(parseFontMetrics('x'), null);
});

// ---- preview ------------------------------------------------------------------------------------------------------

it('a hover preview paints the stage without touching the Look', () => {
    const store = createLookStore({ storage: null });
    store.setCaptions({ font: 'Anton' });
    const before = JSON.stringify(store.get());
    const steps = store.get().canUndo;
    const look = store.get().options.look;
    const p = createFontPreview();
    let n = 0;
    const off = p.subscribe(() => { n += 1; });
    assert.equal(withFontPreview(look, p.get()), look, 'no preview: the very same Look');
    p.show('captions', 'Bangers');
    const shown = withFontPreview(look, p.get());
    assert.equal(shown.captions.font, 'Bangers');
    assert.equal(look.captions.font, 'Anton');
    assert.equal(JSON.stringify(store.get()), before, 'the store never saw it');
    assert.equal(store.get().canUndo, steps);
    assert.equal(withFontPreview(look, { layer: 'headline', font: 'Oswald' }).headline.font, 'Oswald');
    assert.equal(withFontPreview({}, { layer: 'headline', font: 'Oswald' }).headline.font, 'Oswald');
    assert.equal(withFontPreview(look, { layer: 'bar', font: 'Oswald' }), look);
    assert.equal(withFontPreview(look, { layer: 'captions', font: '' }), look);
    p.show('captions', 'Bangers'); // same again: not a change
    assert.equal(n, 1);
    p.clear();
    p.clear();
    assert.equal(n, 2);
    assert.equal(p.get(), null);
    off();
});

// ---- keyboard ----------------------------------------------------------------------------------------------------

it('arrows, Home, End and pages move through the rows; typing jumps by name', () => {
    assert.equal(moveActive(-1, 'ArrowDown', 5), 0);
    assert.equal(moveActive(-1, 'ArrowUp', 5), 4);
    assert.equal(moveActive(2, 'ArrowDown', 5), 3);
    assert.equal(moveActive(4, 'ArrowDown', 5), 4);
    assert.equal(moveActive(0, 'ArrowUp', 5), 0);
    assert.equal(moveActive(2, 'Home', 5), 0);
    assert.equal(moveActive(2, 'End', 5), 4);
    assert.equal(moveActive(1, 'PageDown', 20), 9);
    assert.equal(moveActive(3, 'PageUp', 20), 0);
    assert.equal(moveActive(0, 'ArrowDown', 0), null);
    assert.equal(moveActive(0, 'a', 5), null);
    const rows = LIST;
    assert.equal(rows[typeahead(rows, 'sp', -1)].family, 'Space Grotesk');
    assert.equal(rows[typeahead(rows, 'spa', 0)].family, 'Space Grotesk');
    assert.equal(rows[typeahead(rows, 's', rows.findIndex((r) => r.family === 'Space Grotesk'))].family, 'Space Mono');
    assert.equal(rows[typeahead(rows, 'ss', rows.findIndex((r) => r.family === 'Space Grotesk'))].family, 'Space Mono', 'a repeated letter steps on');
    assert.equal(typeahead(rows, 'qq', -1), -1);
    assert.equal(typeahead(rows, '', -1), -1);
    assert.equal(typeahead([], 'a', -1), -1);
    assert.ok(isTypeKey({ key: 'a' }) && !isTypeKey({ key: 'a', ctrlKey: true }) && !isTypeKey({ key: 'Enter' }));
});

// ---- summaries --------------------------------------------------------------------------------------------------

it('a summary names a font that is not the default, only where it fits', () => {
    assert.equal(fontTrait({ style: 'tiktok', look: { captions: { font: 'Anton' } } }), 'Anton');
    assert.equal(fontTrait({ style: 'hormozi', look: { captions: { font: 'anton' } } }), null);
    assert.equal(fontTrait({ style: 'tiktok', look: { captions: { font: 'Archivo Black' } } }), null);
    assert.equal(fontTrait({ style: 'tiktok', headline: 'x', look: { headline: { font: 'Bangers' } } }), 'Bangers');
    assert.equal(fontTrait({ style: 'tiktok', look: { headline: { font: 'Bangers' } } }), null, 'the headline is off');
    assert.equal(fontTrait({ style: 'tiktok', headline: 'x', look: { headline: { font: 'Archivo Black' } } }), null);
    assert.equal(fontTrait({ style: 'tiktok' }), null);
    assert.equal(lookSummary({ style: 'minimal', look: { captions: { font: 'Bangers' } } }), 'minimal · 9:16 · Bangers');
    const long = lookSummary({ style: 'minimal', progress_bar: '#FFFFFF', headline: 'x', look: { captions: { font: 'Montserrat ExtraBold' } } });
    assert.ok(!long.includes('Montserrat'), long);
    assert.equal(withFont('tiktok · 100%', 'Bangers', 24), 'tiktok · 100% · Bangers');
    assert.equal(withFont('tiktok · 100%', 'Montserrat ExtraBold', 24), 'tiktok · 100%');
    assert.equal(withFont('tiktok · 100%', null, 24), 'tiktok · 100%');
    // Family names are data: a translator never sees them.
    assert.equal(lookSummary({ style: 'minimal', look: { captions: { font: 'Bangers' } } }, (s) => `<${s}>`), 'minimal · 9:16 · Bangers');
});
