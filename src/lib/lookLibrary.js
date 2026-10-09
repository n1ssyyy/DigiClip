// The Looks of the person and the starters, as one list; which one the
// working copy is; whether it has been edited; and the operations that
// return the next `settings.presets` array. A Look is a preset: same storage,
// same shape (`{name, options}`), so the watch folder, the CLI and the Home
// line see every Look saved here. Pure: no React, no storage.
import { fromEngine, toEngine } from './look.js';
import { STARTERS } from './starterLooks.js';
import { nextFreeName } from './lookNames.js';

export const UNTITLED = 'Untitled';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** A value with its keys in sorted order all the way down, as text: two
 *  values that mean the same compare equal whatever order they were built in. */
export function canon(v) {
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
    return JSON.stringify(v) ?? 'null';
}

/** What the engine would be sent for a working copy, as comparable text. */
export const signature = (working) => canon(toEngine(working));

/** The same, for engine options (a preset), read back through the panel
 *  state the way the picker compares them. */
export const presetSignature = (options, settings) => signature(fromEngine(options, settings));

/** A preset with a usable name and options (anything else in the list is
 *  left alone by the operations and left out of the picker). */
export const isPreset = (p) => isObj(p) && typeof p.name === 'string' && p.name.trim() !== '' && isObj(p.options);

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * The picker's list: the person's looks alphabetically, then the starters in
 * their own order. A starter whose name a saved look of the person's already
 * has is left out, so a name always means one look.
 */
export function lookList(presets, starters = STARTERS) {
    const mine = (presets ?? []).filter(isPreset).map((p) => ({ kind: 'mine', name: p.name, options: p.options })).sort(byName);
    const taken = new Set(mine.map((m) => m.name.toLowerCase()));
    return {
        mine,
        starters: starters.filter((s) => !taken.has(s.name.toLowerCase())).map((s) => ({ kind: 'starter', name: s.name, id: s.id, blurb: s.blurb, options: s.options })),
    };
}

/** The look a stored name stands for: the person's own first, then a
 *  starter; a name that no longer exists is an unsaved "Untitled". */
export function resolveCurrent(list, name) {
    const hit = name ? (list.mine.find((m) => m.name === name) ?? list.starters.find((s) => s.name === name)) : null;
    return hit ?? { kind: 'untitled', name: UNTITLED };
}

/** The names a new look may not take (English and as shown). */
export function reservedNames(starters = STARTERS, tr = (s) => s) {
    return [...new Set(starters.flatMap((s) => [s.name, tr(s.name)]))];
}

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------

/** Kept from the person's working copy when a starter is applied: how clips
 *  are picked (kind, count, lengths, tighten, focus, merge flash), the shape
 *  (where the video is posted is not design), the caption language, the files
 *  and the text typed beside them. */
export const KEPT_KEYS = [
    'aspect', 'kind', 'count', 'dur_mode', 'dur_exact', 'dur_min', 'dur_max', 'tighten', 'merge_flash', 'focus', 'subs_lang',
    'logo', 'logo_pos', 'music', 'music_db', 'headline_text',
];

/** The working copy with a starter's design on it. */
export function applyStarter(working, starter, settings) {
    const design = fromEngine(starter.options, settings);
    const out = { ...design };
    for (const k of KEPT_KEYS) if (k in working) out[k] = working[k];
    return out;
}

/** The working copy a look makes when it is loaded. */
export function loaded(entry, working, settings) {
    return entry.kind === 'starter' ? applyStarter(working, entry, settings) : fromEngine(entry.options, settings);
}

/** Does the working copy differ from the look? A starter is compared on its
 *  design only (the person's cut, files and text are theirs). An "Untitled"
 *  has nothing to differ from. */
export function isEdited(working, entry, settings) {
    if (!entry || entry.kind === 'untitled') return false;
    return signature(working) !== signature(loaded(entry, working, settings));
}

// ---------------------------------------------------------------------------
// what the menu offers
// ---------------------------------------------------------------------------

/** The actions the picker's menu offers under the list, in order, for the
 *  look the stage is on: `kind` is `mine`, `starter` or `untitled`; `edited`
 *  whether the working copy differs from it. Save only for an own look that
 *  changed; Rename and Delete only for an own look; Duplicate only where
 *  there is a saved look or a starter to copy (an unsaved Untitled is
 *  covered by Save as new). */
export function lookActions(kind, edited = false) {
    const own = kind === 'mine';
    const out = [];
    if (own && edited) out.push('save');
    out.push('saveas');
    if (own) out.push('rename');
    if (own || kind === 'starter') out.push('duplicate');
    if (own) out.push('delete');
    return out;
}

// ---------------------------------------------------------------------------
// the next presets array
// ---------------------------------------------------------------------------

const names = (presets) => presets.filter(isPreset).map((p) => p.name);

/** Save `options` as the look `name`: in place when it exists (Save, and
 *  Save-as onto an own look that was asked to be replaced), else at the end. */
export function saveLook(presets, name, options) {
    const list = presets ?? [];
    if (list.some((p) => isPreset(p) && p.name === name)) return list.map((p) => (isPreset(p) && p.name === name ? { ...p, name, options } : p));
    return [...list, { name, options }];
}

/** Rename a look, keeping its place and options. */
export function renameLook(presets, from, to) {
    return (presets ?? []).map((p) => (isPreset(p) && p.name === from ? { ...p, name: to } : p));
}

/** A copy of `options` under the next free "<base> 2". */
export function duplicateLook(presets, base, options, reserved = []) {
    const list = presets ?? [];
    const name = nextFreeName(base, [...names(list), ...reserved]);
    return { presets: [...list, { name, options }], name };
}

export function deleteLook(presets, name) {
    return (presets ?? []).filter((p) => !(isPreset(p) && p.name === name));
}

