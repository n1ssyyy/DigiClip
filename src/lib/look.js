// The shared Look store: the per-video option panel's state model, now one
// module-level store that Home (the options popover) and Studio both edit.
//
// The first half is pure (defaults, toEngine, fromEngine, Look helpers) so
// it can be tested from Node; the store is a factory with an injectable
// storage and clock for the same reason. The React hooks sit at the bottom.
import { useSyncExternalStore } from 'react';
import { cleanCaptions } from './captionStyles.js';
import { cleanBar, cleanHeadline, cleanLogo } from './layers.js';

export const STORE_KEY = 'digiclip.jobOptions';

export const ASPECTS = ['9:16', '4:5', '1:1', '16:9'];
export const CAPTION_ANIMS = ['pop', 'words', 'none'];
export const LAYOUTS = ['single', 'split', 'auto'];

/** Caption languages offered for translated subtitles (ISO codes). */
export const SUBS_LANGS = [
    ['off', 'Spoken language'], ['en', 'English'], ['sq', 'Albanian'], ['de', 'German'],
    ['fr', 'French'], ['es', 'Spanish'], ['it', 'Italian'], ['tr', 'Turkish'],
    ['pt', 'Portuguese'], ['nl', 'Dutch'], ['pl', 'Polish'], ['sr', 'Serbian'],
    ['hr', 'Croatian'], ['mk', 'Macedonian'], ['el', 'Greek'], ['ru', 'Russian'],
    ['uk', 'Ukrainian'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['ja', 'Japanese'],
    ['ko', 'Korean'], ['zh', 'Chinese'],
];

export function defaults(settings) {
    return {
        kind: 'smart',
        count: settings?.clips_count ?? 3,
        dur_mode: 'auto',
        dur_exact: 30,
        dur_min: 15,
        dur_max: 60,
        style: settings?.caption_default ?? 'karaoke',
        tighten: settings?.tighten ?? 'light',
        punch: settings?.punch ?? true,
        merge_flash: false,
        // Look: output shape and brand overlays.
        aspect: '9:16',
        caption_anim: 'pop',
        headline: false,
        headline_text: '',
        progress_bar: false,
        bar_color: '#FFD400',
        logo: '',
        logo_pos: 'tr',
        music: '',
        music_db: -16,
        focus: '',
        layout: 'single',
        subs_lang: 'off',
        // The Look proper (engine `options.look`): per-section overrides.
        look: { captions: {} },
    };
}

/** The picked shapes, main first: `"9:16,1:1"` -> ['9:16', '1:1']. */
export function aspectList(v) {
    const out = [];
    for (const a of String(v ?? '').split(',').map((x) => x.trim())) {
        if (ASPECTS.includes(a) && !out.includes(a)) out.push(a);
    }
    return out.length ? out : ['9:16'];
}

/** The engine options for the Look knobs: only what's switched on is
 *  sent, so an untouched panel renders exactly as before. */
export function lookOptions(o) {
    const out = {};
    // First shape is the main render, the rest are extra variants.
    const aspects = aspectList(o.aspect);
    if (aspects.join(',') !== '9:16') out.aspect = aspects.join(',');
    // Split needs smart framing, which every app job uses.
    if (LAYOUTS.includes(o.layout) && o.layout !== 'single') out.layout = o.layout;
    if (o.subs_lang && o.subs_lang !== 'off') out.subs_lang = o.subs_lang;
    // Pop is the engine default.
    if (CAPTION_ANIMS.includes(o.caption_anim) && o.caption_anim !== 'pop') out.caption_anim = o.caption_anim;
    // Empty headline = the clip's own title.
    if (o.headline) out.headline = (o.headline_text ?? '').trim();
    if (o.progress_bar) out.progress_bar = /^#[0-9a-f]{6}$/i.test(o.bar_color ?? '') ? o.bar_color : '';
    if (o.logo) {
        out.logo = o.logo;
        out.logo_pos = o.logo_pos || 'tr';
    }
    if (o.music) {
        out.music = o.music;
        out.music_db = Number.isFinite(+o.music_db) ? +o.music_db : -16;
    }
    const focus = (o.focus ?? '').trim();
    if (focus) out.focus = focus;
    return out;
}

function durRange(o) {
    if (o.dur_mode === 'exact') {
        const L = Math.min(300, Math.max(5, +o.dur_exact || 30));
        return { min_len: L, max_len: L };
    }
    if (o.dur_mode === 'minmax') {
        const lo = Math.min(300, Math.max(5, +o.dur_min || 15));
        const hi = Math.max(lo, Math.min(600, +o.dur_max || 60));
        return { min_len: lo, max_len: hi };
    }
    return {};
}

// ---------------------------------------------------------------------------
// the Look object
// ---------------------------------------------------------------------------

/** Sections of `options.look` (look.rs). Captions, headline, bar and logo
 *  are live; the rest wait for the engine. */
export const LOOK_SECTIONS = ['captions', 'headline', 'bar', 'logo', 'camera', 'effects', 'layout'];

const real = (v) => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && !Number.isFinite(v));

/** A section without undefined/null/empty fields (and without anything
 *  that is not a plain value). */
function pruneSection(s) {
    const out = {};
    if (!s || typeof s !== 'object' || Array.isArray(s)) return out;
    for (const [k, v] of Object.entries(s)) {
        if (!real(v)) continue;
        if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') out[k] = v;
    }
    return out;
}

/** The Look as the engine takes it: `{v: 1, ...sections}` with empty
 *  sections and fields dropped, or `null` when there is nothing real. */
export function lookToEngine(look) {
    if (!look || typeof look !== 'object') return null;
    const out = {};
    for (const sec of LOOK_SECTIONS) {
        const p = pruneSection(look[sec]);
        if (Object.keys(p).length) out[sec] = p;
    }
    return Object.keys(out).length ? { v: 1, ...out } : null;
}

const CLEANERS = { captions: cleanCaptions, headline: cleanHeadline, bar: cleanBar, logo: cleanLogo };

/** A Look read back from anywhere (a preset, local storage): deep copy,
 *  junk dropped, captions cleaned the way the engine reads them. */
export function sanitizeLook(raw) {
    const look = { captions: {} };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return look;
    for (const sec of LOOK_SECTIONS) {
        const s = raw[sec];
        if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
        look[sec] = (CLEANERS[sec] ?? pruneSection)(s);
    }
    return look;
}

/** Panel state -> engine job options. Machine settings (model, GPU) are
 *  left to the caller, so presets and the watch folder stay portable. */
export function toEngine(o) {
    const out = {
        mode: 'clips',
        kind: o.kind,
        count: o.count,
        ...durRange(o),
        style: o.style,
        tighten: o.tighten,
        punch: o.punch,
        merge_flash: o.merge_flash,
        kit: true,
        framing: 'smart',
        ...lookOptions(o),
    };
    const look = lookToEngine(o.look);
    if (look) {
        // The Look's motion wins in the engine. The flat option follows it
        // for the motions older engines know, and steps aside for the rest.
        const a = look.captions?.anim;
        if (a) {
            if (a === 'words' || a === 'none') out.caption_anim = a;
            else delete out.caption_anim;
        }
        out.look = look;
    }
    return out;
}

/** Engine job options (a preset) -> panel state. Unset fields fall back
 *  to the panel defaults, so an old preset never keeps stale knobs. */
export function fromEngine(e, settings) {
    const v = (k) => (e?.[k] ?? null);
    const p = defaults(settings);
    for (const k of ['kind', 'count', 'style', 'tighten', 'punch', 'merge_flash', 'caption_anim', 'logo_pos', 'music_db', 'layout', 'subs_lang']) {
        if (v(k) != null) p[k] = v(k);
    }
    const lo = v('min_len');
    const hi = v('max_len');
    if (lo != null && hi != null) {
        if (lo === hi) Object.assign(p, { dur_mode: 'exact', dur_exact: lo });
        else Object.assign(p, { dur_mode: 'minmax', dur_min: lo, dur_max: hi });
    }
    p.aspect = aspectList(v('aspect')).join(',');
    p.headline = v('headline') != null;
    p.headline_text = v('headline') ?? '';
    p.progress_bar = v('progress_bar') != null;
    if (v('progress_bar')) p.bar_color = v('progress_bar');
    p.logo = v('logo') ?? '';
    p.music = v('music') ?? '';
    p.focus = v('focus') ?? '';
    p.look = sanitizeLook(e?.look);
    return p;
}

/** Fields of the captions section that are set. */
export function captionsSet(look) {
    return Object.keys(pruneSection(look?.captions));
}

// ---------------------------------------------------------------------------
// pure state updates
// ---------------------------------------------------------------------------

/** `prev` with `patch` on top. A flat motion chosen elsewhere (the Home
 *  popover) replaces the Look's motion, so what is shown is what is sent. */
export function applyPatch(prev, patch) {
    const dropsAnim = 'caption_anim' in patch && !('look' in patch) && prev.look?.captions?.anim !== undefined;
    let changed = dropsAnim;
    for (const k of Object.keys(patch)) {
        if (prev[k] !== patch[k]) changed = true;
    }
    if (!changed) return prev;
    const next = { ...prev, ...patch };
    if (dropsAnim) {
        const { anim, ...rest } = prev.look.captions;
        next.look = { ...prev.look, captions: rest };
    }
    return next;
}

/** `prev` with one section of the Look patched; undefined/null/'' removes
 *  a field. A section left empty is dropped (captions keep their empty
 *  object, the store's shape). */
export function applySection(prev, section, patch) {
    const cur = prev.look?.[section] ?? {};
    const next = { ...cur };
    for (const [k, v] of Object.entries(patch)) {
        if (real(v)) next[k] = v;
        else delete next[k];
    }
    if (JSON.stringify(next) === JSON.stringify(cur)) return prev;
    const look = { ...(prev.look ?? {}) };
    if (section !== 'captions' && !Object.keys(next).length) delete look[section];
    else look[section] = next;
    return { ...prev, look };
}

export const applyCaptions = (prev, patch) => applySection(prev, 'captions', patch);

/** One edit across the flat options and any sections of the Look: what a
 *  single control (a corner pick that also drops a free position) needs to
 *  be one history step. */
export function applyEdit(prev, flat, sections) {
    let next = flat ? applyPatch(prev, flat) : prev;
    for (const [sec, patch] of Object.entries(sections ?? {})) next = applySection(next, sec, patch);
    return next;
}

// ---------------------------------------------------------------------------
// the store
// ---------------------------------------------------------------------------

export const HISTORY_CAP = 100;
export const COLLAPSE_MS = 400;

function browserStorage() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    } catch {
    }
    return null;
}

/**
 * One store of panel state with undo history. History is in memory only,
 * capped at `HISTORY_CAP` steps; rapid changes to the same field within
 * `COLLAPSE_MS` fold into one step (a slider drag is one undo).
 */
export function createLookStore({ storage = browserStorage(), now = () => Date.now() } = {}) {
    let state = null;
    let past = [];
    let future = [];
    let lastKey = null;
    let lastAt = 0;
    let snap = null;
    // A drag in progress: every change inside it is one history step.
    let gesture = null;
    const subs = new Set();

    function build() {
        snap = { options: state, canUndo: past.length > 0, canRedo: future.length > 0 };
    }
    function persist() {
        try {
            storage?.setItem(STORE_KEY, JSON.stringify(state));
        } catch {
        }
    }
    function emit() {
        build();
        persist();
        subs.forEach((f) => {
            try {
                f();
            } catch {
            }
        });
    }
    function commit(next, key) {
        if (next === state) return;
        const t = now();
        if (gesture) {
            // The first change of the gesture opens its step, the rest fold in.
            if (!gesture.pushed) {
                past.push(state);
                if (past.length > HISTORY_CAP) past.shift();
                gesture.pushed = true;
            }
            future = [];
            lastKey = null;
            lastAt = t;
            state = next;
            emit();
            return;
        }
        const fold = key && key === lastKey && t - lastAt < COLLAPSE_MS && past.length > 0;
        if (!fold) {
            past.push(state);
            if (past.length > HISTORY_CAP) past.shift();
        }
        future = [];
        lastKey = key;
        lastAt = t;
        state = next;
        emit();
    }

    /** Seed once from saved settings and local storage. */
    function seed(settings) {
        if (state) return;
        let saved = null;
        try {
            const raw = storage?.getItem(STORE_KEY);
            if (raw) saved = JSON.parse(raw);
        } catch {
        }
        const base = defaults(settings);
        state = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...base, ...saved } : base;
        state.look = sanitizeLook(state.look);
        build();
    }

    const api = {
        seed,
        subscribe(f) {
            subs.add(f);
            return () => subs.delete(f);
        },
        get() {
            if (!state) seed(null);
            return snap;
        },
        update(patch) {
            if (!state) seed(null);
            commit(applyPatch(state, patch), `f:${Object.keys(patch).sort().join(',')}`);
        },
        setCaptions(patch) {
            if (!state) seed(null);
            commit(applySection(state, 'captions', patch), `c:${Object.keys(patch).sort().join(',')}`);
        },
        setHeadline(patch) {
            if (!state) seed(null);
            commit(applySection(state, 'headline', patch), `h:${Object.keys(patch).sort().join(',')}`);
        },
        setBar(patch) {
            if (!state) seed(null);
            commit(applySection(state, 'bar', patch), `b:${Object.keys(patch).sort().join(',')}`);
        },
        setLogo(patch) {
            if (!state) seed(null);
            commit(applySection(state, 'logo', patch), `l:${Object.keys(patch).sort().join(',')}`);
        },
        /** Flat options and sections together, as one history step. */
        edit(flat, sections) {
            if (!state) seed(null);
            const keys = [...Object.keys(flat ?? {}), ...Object.entries(sections ?? {}).flatMap(([s, p]) => Object.keys(p).map((k) => `${s}.${k}`))];
            commit(applyEdit(state, flat, sections), `e:${keys.sort().join(',')}`);
        },
        /** Start a drag: until `endGesture` every change is one undo step.
         *  Nothing changed means no step. */
        beginGesture() {
            if (!state) seed(null);
            if (gesture) return;
            gesture = { pushed: false, base: JSON.stringify(state) };
        },
        endGesture() {
            if (!gesture) return;
            const g = gesture;
            gesture = null;
            lastKey = null;
            // Dragged back to where it began: no step to undo.
            if (g.pushed && JSON.stringify(state) === g.base) {
                past.pop();
                emit();
            }
        },
        /** Clear one section of the Look (or all of it). */
        reset(section) {
            if (!state) seed(null);
            let look;
            if (!section) look = { captions: {} };
            else if (section === 'captions') look = { ...state.look, captions: {} };
            else {
                look = { ...state.look };
                delete look[section];
            }
            if (JSON.stringify(look) === JSON.stringify(state.look)) return;
            commit({ ...state, look }, null);
        },
        undo() {
            if (gesture || !past.length) return;
            future.push(state);
            state = past.pop();
            lastKey = null;
            emit();
        },
        redo() {
            if (gesture || !future.length) return;
            past.push(state);
            state = future.pop();
            lastKey = null;
            emit();
        },
    };
    return api;
}

/** The app's one store. */
export const lookStore = createLookStore();

// ---------------------------------------------------------------------------
// hooks
// ---------------------------------------------------------------------------

/** Per-job knobs for the next upload. Persisted locally; seeded from
 *  saved settings on first sight (count, style, tighten, punch). Home and
 *  Studio read the same store. */
export function useJobOptions(settings) {
    lookStore.seed(settings);
    const snap = useSyncExternalStore(lookStore.subscribe, lookStore.get, lookStore.get);
    return [snap.options, lookStore.update];
}

/** The Look for Studio: the same state plus captions edits and history. */
export function useLook(settings) {
    lookStore.seed(settings);
    const snap = useSyncExternalStore(lookStore.subscribe, lookStore.get, lookStore.get);
    return {
        options: snap.options,
        update: lookStore.update,
        setCaptions: lookStore.setCaptions,
        setHeadline: lookStore.setHeadline,
        setBar: lookStore.setBar,
        setLogo: lookStore.setLogo,
        edit: lookStore.edit,
        beginGesture: lookStore.beginGesture,
        endGesture: lookStore.endGesture,
        undo: lookStore.undo,
        redo: lookStore.redo,
        canUndo: snap.canUndo,
        canRedo: snap.canRedo,
        reset: lookStore.reset,
    };
}
