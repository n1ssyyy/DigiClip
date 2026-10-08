// What each caption control shows and writes.
//
// A control shows the EFFECTIVE value: the Look's own when it sets the field,
// else what the style (or the engine's default) gives. `captionView` folds a
// Look over a style the way `resolveCaptions` and the motion model do and
// answers `val(path)` / `isSet(path)` for every field path of
// `captionSections.js`; `editPatch` and the `...Patch` helpers turn a control
// change into the patch for the store (seeding the shadow and box objects from
// what the style draws, so the first touch does not make the caption jump).
// Pure: no React, no DOM.
import { FIELD_SPECS, effectiveMotion, fromAnim } from './captionFields.js';
import { resolveCaptions, validStyle } from './captionStyles.js';
import {
    BOX_PAD_X, BOX_PAD_Y, GLOW_SIZE, GLOW_STRENGTH, SHADOW_BLUR, SHADOW_OPACITY, SHADOW_Y, glowDefault, rgbOf,
} from './captionMotion.js';

const hexOf = (rgb) => `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** `{a: {b: 1}}` at `'a.b'`. */
export function getPath(o, path) {
    let cur = o;
    for (const k of path.split('.')) {
        if (!isObj(cur)) return undefined;
        cur = cur[k];
    }
    return cur;
}

/** The patch `{a: {b: value}}` for `'a.b'` (undefined clears). */
export function nest(path, value) {
    const keys = path.split('.');
    const out = {};
    let cur = out;
    keys.forEach((k, i) => {
        if (i === keys.length - 1) cur[k] = value;
        else cur = (cur[k] = {});
    });
    return out;
}

/** Deep merge of two patches (a later leaf wins). */
export function mergePatch(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? mergePatch(out[k], v) : v;
    return out;
}

/**
 * The view of the captions controls for a style, canvas and Look.
 *
 * @param {string} styleId  @param {string|{w,h}} canvas
 * @param {object} L  the Look's `captions` section  @param {{anim?: string}} [flat]
 */
export function captionView(styleId, canvas, L, flat = {}) {
    const id = validStyle(styleId);
    const r = resolveCaptions(id, canvas, L ?? {}, flat);
    const base = resolveCaptions(id, canvas, {}, flat);
    const c = r.clean;
    const w = c.words ?? {};
    const k = r.k;
    const mode = w.mode ?? fromAnim(r.anim).mode;
    const mot = effectiveMotion(c, r.anim);
    const shadowObj = isObj(c.shadow);
    const boxObj = isObj(c.box);

    // What the engine assumes for a shadow object's missing fields.
    const engineShadow = { color: '#000000', x: 0, y: SHADOW_Y, blur: SHADOW_BLUR, opacity: SHADOW_OPACITY };
    // The shadow the caption draws without a shadow object, as such an object:
    // a depth (the style's, or a v1 number) is a hard offset in the style's
    // colour; none is the engine's defaults.
    const depth = typeof c.shadow === 'number' ? c.shadow : base.shadow;
    const drawnShadow = depth > 0 ? { color: r.shadowColor.toUpperCase(), x: depth, y: depth, blur: 0, opacity: r.shadowOpacity } : null;
    const v1Shadow = drawnShadow ?? engineShadow;

    const activeColour = w.active?.color ?? r.active;
    const strokeColour = r.base.stroke.color.toUpperCase();
    const strokeWidth = round(r.base.stroke.w / k);
    const boxCol = r.base.boxCol ? r.base.boxCol.toUpperCase() : null;
    const glowOf = (g, fill) => ({
        color: g?.color ?? hexOf(glowDefault(rgbOf(fill))),
        size: g?.size ?? GLOW_SIZE,
        strength: g?.strength ?? GLOW_STRENGTH,
    });

    /** Effective value of a field path. */
    function val(path) {
        switch (path) {
            case 'show': return r.show;
            case 'font': return r.font;
            case 'size': return c.size ?? 1;
            case 'case': return r.caps ? 'upper' : 'asis';
            case 'x': return r.center.x;
            case 'y': return r.center.y;
            case 'max_words': return r.maxWords;
            case 'max_chars': return r.maxChars;
            case 'lines': return c.lines ?? 2;
            case 'align': return c.align ?? 'center';
            case 'spacing': case 'line_gap': case 'rotate': return c[path] ?? FIELD_SPECS[path].def;
            case 'color': return r.color.toUpperCase();
            case 'outline': return val('stroke.color');
            case 'outline_w': return val('stroke.width');
            case 'stroke.color': return c.stroke?.color ?? strokeColour;
            case 'stroke.width': return c.stroke?.width ?? strokeWidth;
            case 'shadow.color': return (shadowObj ? c.shadow.color : undefined) ?? v1Shadow.color.toUpperCase();
            case 'shadow.x': case 'shadow.y': case 'shadow.blur': case 'shadow.opacity': {
                const f = path.split('.')[1];
                return (shadowObj ? c.shadow[f] : undefined) ?? v1Shadow[f];
            }
            case 'glow.color': case 'glow.size': case 'glow.strength':
                return glowOf(c.glow, activeColour)[path.split('.')[1]];
            case 'box': return boxMode();
            case 'box.per': return boxMode() === 'word' ? 'word' : 'line';
            case 'box.color': return (boxObj ? c.box.color : undefined) ?? boxCol ?? '#000000';
            case 'box.opacity': case 'box_opacity': return (boxObj ? c.box.opacity : undefined) ?? c.box_opacity ?? 1;
            case 'box.pad_x': return (boxObj ? c.box.pad_x : undefined) ?? BOX_PAD_X;
            case 'box.pad_y': return (boxObj ? c.box.pad_y : undefined) ?? BOX_PAD_Y;
            case 'box.radius': return (boxObj ? c.box.radius : undefined) ?? 0;
            case 'words.mode': return mode;
            case 'words.fill': return w.fill ?? 'snap';
            case 'words.attack_ms': return w.attack_ms ?? (mode === 'build' ? 80 : 0);
            case 'words.attack_ease': return w.attack_ease ?? 'out';
            case 'words.hold_ms': return w.hold_ms ?? 0;
            case 'words.release_ms': return w.release_ms ?? 0;
            case 'words.release_ease': return w.release_ease ?? 'out';
            case 'active': case 'words.active.color': return activeColour.toUpperCase();
            case 'accent': case 'words.keyword.color': return (w.keyword?.color ?? r.accent).toUpperCase();
            case 'words.upcoming.color': return (w.upcoming?.color ?? r.color).toUpperCase();
            case 'words.spoken.color': return (w.spoken?.color ?? activeColour).toUpperCase();
            case 'words.active.stroke.color': return w.active?.stroke?.color ?? val('stroke.color');
            case 'words.active.stroke.width': return w.active?.stroke?.width ?? val('stroke.width');
            case 'words.active.box.color': return w.active?.box?.color ?? boxCol ?? r.accent.toUpperCase();
            case 'words.active.box.opacity': return w.active?.box?.opacity ?? 1;
            case 'words.active.box.radius': return w.active?.box?.radius ?? (boxObj ? c.box.radius ?? 0 : 0);
            case 'words.active.glow.color': case 'words.active.glow.size': case 'words.active.glow.strength':
                return glowOf(w.active?.glow, activeColour)[path.split('.')[3]];
            case 'words.keyword.glow.color': case 'words.keyword.glow.size': case 'words.keyword.glow.strength':
                return glowOf(w.keyword?.glow, w.keyword?.color ?? r.accent)[path.split('.')[3]];
            case 'words.keyword.scale': return w.keyword?.scale ?? 1;
            case 'enter.kind': return mot.enter.kind;
            case 'enter.ms': return mot.enter.ms;
            case 'enter.ease': return mot.enter.ease ?? 'out';
            case 'exit.kind': return mot.exit.kind;
            case 'exit.ms': return mot.exit.ms;
            case 'anim': return r.anim;
            default: {
                // The state looks that share their ranges' defaults.
                const spec = FIELD_SPECS[path];
                const own = getPath(c, path);
                return own ?? spec?.def;
            }
        }
    }

    /** Does the Look set this field itself? */
    function isSet(path) {
        if (path === 'x' || path === 'y') return c.x !== undefined || c.y !== undefined;
        if (path === 'case') return c.case !== undefined;
        if (path === 'box') return c.box !== undefined;
        if (path === 'shadow') return c.shadow !== undefined;
        if (path === 'glow') return !!c.glow;
        if (path === 'lines' || path === 'align' || path === 'max_chars' || path === 'max_words') return c[path] !== undefined;
        if (path === 'words.active.color') return getPath(c, path) !== undefined || c.active !== undefined;
        if (path === 'words.keyword.color') return getPath(c, path) !== undefined || c.accent !== undefined;
        if (path === 'stroke.color') return c.stroke?.color !== undefined || c.outline !== undefined;
        if (path === 'stroke.width') return c.stroke?.width !== undefined || c.outline_w !== undefined;
        if (path === 'box.opacity') return getPath(c, path) !== undefined || c.box_opacity !== undefined;
        if (path === 'enter.kind' || path === 'exit.kind') return getPath(c, path) !== undefined || c.anim !== undefined;
        return getPath(c, path) !== undefined;
    }

    function boxMode() {
        if (boxObj) return c.box.per === 'word' ? 'word' : 'line';
        if (c.box === 'none') return 'off';
        return r.box ? 'line' : 'off';
    }

    return {
        r,
        base,
        c,
        val,
        isSet,
        boxMode,
        /** Is the shadow on (an object, a v1 depth, or the style's own)? */
        shadowOn: shadowObj ? true : r.shadow > 0 || (typeof c.shadow === 'number' && c.shadow > 0),
        glowOn: !!c.glow,
        shadowIsObject: shadowObj,
        boxIsObject: boxObj,
        /** The shadow object the caption draws now, less what the engine already assumes. */
        shadowSeed: () => {
            const out = {};
            if (!drawnShadow) return out;
            for (const [f, d] of Object.entries(engineShadow)) {
                if (drawnShadow[f] !== d) out[f] = drawnShadow[f];
            }
            return out;
        },
    };
}

// ---------------------------------------------------------------------------
// edits
// ---------------------------------------------------------------------------

/**
 * The patch for one control change. The shadow and box objects, absent until
 * now, start from what the style draws; the colours of the spoken and keyword
 * words replace their v1 forms so one field says it.
 */
export function editPatch(view, path, value) {
    let patch = nest(path, value);
    if (path === 'words.active.color') patch.active = undefined;
    if (path === 'words.keyword.color') patch.accent = undefined;
    if (path.startsWith('shadow.') && !view.shadowIsObject) patch = { shadow: { ...view.shadowSeed(), ...patch.shadow } };
    if (path.startsWith('box.') && !view.boxIsObject) patch = { box: { per: 'line', ...boxSeed(view), ...patch.box } };
    return patch;
}

/** What a new box starts with: the style's own box keeps its colour; a box on
 *  a style without one starts see-through-ish rather than solid black. */
function boxSeed(view) {
    return view.base.box ? {} : { opacity: 0.6 };
}

/** The patch for the shadow switch. */
export function shadowPatch(view, on) {
    if (on) return { shadow: { ...view.shadowSeed(), ...(Object.keys(view.shadowSeed()).length ? {} : { opacity: SHADOW_OPACITY }) } };
    // Off: a depth of nothing when the style has a shadow to turn off, else just clear.
    return { shadow: view.base.shadow > 0 ? 0 : undefined };
}

/** The patch for the glow switch. */
export const glowPatch = (on) => ({ glow: on ? { size: GLOW_SIZE, strength: GLOW_STRENGTH } : undefined });

/** The patch for the box choice (`off`, `line`, `word`). */
export function boxModePatch(view, mode) {
    if (mode === 'off') return { box: view.base.box ? 'none' : undefined, box_opacity: undefined };
    if (view.boxIsObject) return { box: { per: mode } };
    return { box: { per: mode, ...boxSeed(view) }, box_opacity: undefined };
}

/** The patch for a spoken-word extra (`stroke`, `glow`, `box`) switch. */
export function activeExtraPatch(view, which, on) {
    if (!on) return { words: { active: { [which]: undefined } } };
    const seed = {
        stroke: { color: view.val('stroke.color'), width: view.val('stroke.width') },
        glow: { size: GLOW_SIZE, strength: GLOW_STRENGTH },
        box: { opacity: 1 },
    }[which];
    return { words: { active: { [which]: seed } } };
}

/** The patch for the keyword glow switch. */
export const keywordGlowPatch = (on) => ({ words: { keyword: { glow: on ? { size: GLOW_SIZE, strength: GLOW_STRENGTH } : undefined } } });

/** The patch that clears one control (a field, or the v1 forms it also reads). */
export function clearPatch(path) {
    let patch = nest(path, undefined);
    if (path === 'words.active.color') patch.active = undefined;
    if (path === 'words.keyword.color') patch.accent = undefined;
    if (path === 'stroke.color') patch.outline = undefined;
    if (path === 'stroke.width') patch.outline_w = undefined;
    if (path === 'box.opacity') patch.box_opacity = undefined;
    if (path === 'x' || path === 'y') patch = { x: undefined, y: undefined };
    if (path === 'enter.kind' || path === 'exit.kind') patch.anim = undefined;
    return patch;
}

