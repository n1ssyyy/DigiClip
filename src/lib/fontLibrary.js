// The font library the picker shows: the engine's `fonts_list` entries (or the
// four bundled faces without it), grouped, searched, marked and turned into
// the Look edits and URLs the picker needs. Pure: no React, no DOM.
import { APP_FONTS, appFont, cleanFontName, sameFont } from './fontNames.js';

/** The picker's groups, in order; the creator's own fonts come first. */
export const CATEGORY_ORDER = ['custom', 'display', 'rounded', 'comic', 'sans', 'serif', 'hand', 'mono'];

/** English source text of each group's label (the picker passes it to `t`). */
export const CATEGORY_LABEL = {
    custom: 'Your fonts',
    display: 'Display',
    rounded: 'Rounded',
    comic: 'Comic',
    sans: 'Sans',
    serif: 'Serif',
    hand: 'Handwritten',
    mono: 'Mono',
    other: 'Other',
};

/** A search field shows when the list has more than this many entries. */
export const SEARCH_FROM = 12;

const CATEGORY_OF = { 'Anton': 'display', 'Archivo Black': 'display', 'Inter Medium': 'sans', 'JetBrains Mono': 'mono' };

/** What the list is without `look.fonts`: the faces the app bundles (they have
 *  no route to load from; the page already has them). */
export const BUILTIN_FONTS = APP_FONTS.map((family) => ({
    family, file: '', bundled: true, category: CATEGORY_OF[family], weight: 400, bytes: 0, rev: 'app', url: '',
}));

/** One `fonts_list` entry, checked; null when it cannot be used. */
export function normalizeFont(f) {
    if (!f || typeof f !== 'object') return null;
    const family = cleanFontName(f.family);
    if (!family || typeof f.file !== 'string' || !f.file) return null;
    return {
        family: appFont(family) ?? family,
        file: f.file,
        bundled: f.bundled === true,
        category: typeof f.category === 'string' && f.category ? f.category : (f.bundled === true ? 'other' : 'custom'),
        weight: Number.isFinite(f.weight) ? f.weight : 400,
        bytes: Number.isFinite(f.bytes) ? f.bytes : 0,
        ...(typeof f.licence === 'string' ? { licence: f.licence } : {}),
        rev: f.rev === undefined || f.rev === null ? '' : String(f.rev),
        url: typeof f.url === 'string' ? f.url : '',
    };
}

/** The `fonts` of a `fonts_list` reply, in the engine's order, one per family;
 *  null when the reply holds none (so the caller keeps what it had). */
export function normalizeFonts(data) {
    const raw = Array.isArray(data?.fonts) ? data.fonts : null;
    if (!raw) return null;
    const seen = new Set();
    const out = [];
    for (const f of raw) {
        const e = normalizeFont(f);
        if (!e || seen.has(e.family.toLowerCase())) continue;
        seen.add(e.family.toLowerCase());
        out.push(e);
    }
    return out.length ? out : null;
}

/** The entries a library state lists (the four bundled faces until the engine's list is in). */
export const entriesOf = (state) => state?.fonts ?? BUILTIN_FONTS;

/** The entry for a family name (any case), or undefined. */
export const findFont = (entries, name) => entries.find((e) => sameFont(e.family, name));

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The entries whose names hold every word of `query` (case and accents ignored). */
export function searchFonts(entries, query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return entries;
    return entries.filter((e) => {
        const n = fold(e.family);
        return words.every((w) => n.includes(w));
    });
}

export const showSearch = (entries) => entries.length > SEARCH_FROM;

/**
 * The rows of the open picker: groups in the picker's order (the creator's
 * fonts first), empty groups left out, each row an entry marked `isDefault`
 * when it is the font the layer has without the Look (`def`). Inside a group
 * the engine's order stands.
 */
export function groupFonts(entries, query = '', def = '') {
    const found = searchFonts(entries, query);
    const order = [...CATEGORY_ORDER, 'other'];
    const buckets = new Map(order.map((id) => [id, []]));
    for (const e of found) {
        const id = CATEGORY_ORDER.includes(e.category) ? e.category : 'other';
        buckets.get(id).push({ ...e, isDefault: sameFont(e.family, def) });
    }
    return order.filter((id) => buckets.get(id).length).map((id) => ({ id, label: CATEGORY_LABEL[id], rows: buckets.get(id) }));
}

/** All rows of the groups in the order they are listed (the keyboard's order). */
export const flatRows = (groups) => groups.flatMap((g) => g.rows);

/** What choosing `family` writes: nothing (the override is cleared) for the
 *  layer's default font, else the family itself. */
export const chooseValue = (family, def) => (sameFont(family, def) ? undefined : family);

/**
 * Is the named font usable? `ok`, `missing` (the engine's list is known and
 * lacks it: the engine and the stage use the default) or `unknown` (the list
 * has not loaded yet, so it cannot be told).
 */
export function fontStatus(name, entries, loaded) {
    if (!name || appFont(name) || findFont(entries, name)) return 'ok';
    return loaded ? 'missing' : 'unknown';
}

/**
 * What removing a font does to the Look: the layers that name it go back to
 * their default (the `font` field cleared), as the sections of one edit.
 * `look` is `options.look`. Null when no layer uses it.
 */
export function removalEdit(look, family) {
    const sections = {};
    const layers = [];
    for (const layer of ['captions', 'headline']) {
        if (sameFont(look?.[layer]?.font, family)) {
            sections[layer] = { font: undefined };
            layers.push(layer);
        }
    }
    return layers.length ? { sections, layers } : null;
}

/** URL of a listed font's file on the engine's HTTP port (like `artUrl`):
 *  the entry's own `url` has no host or token, and its `rev` busts the cache. */
export function fontFileUrl(serve, entry) {
    if (!serve?.port || !serve?.token || !entry?.file) return null;
    const v = entry.rev ? `&v=${encodeURIComponent(entry.rev)}` : '';
    return `http://127.0.0.1:${serve.port}/font/${encodeURIComponent(entry.file)}?token=${encodeURIComponent(serve.token)}${v}`;
}
