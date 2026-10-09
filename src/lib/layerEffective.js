// What each headline, bar and logo control shows and writes.
//
// A control shows the EFFECTIVE value: the Look's own when it sets the field,
// else what the engine does without it. `headlineView`, `barView` and
// `logoView` answer `val(path)` / `isSet(path)` for every path of the layer's
// map (`layerSections.js`); `headlineEdit` and the `...Patch` helpers turn a
// control change into the patch for the store (folding the v1 forms a v2
// control replaces, so one field says it). The caption equivalent is
// `captionEffective.js`, whose `nest` and `getPath` these share. Pure: no
// React, no DOM.
import { glowDefault, rgbOf } from './captionMotion.js';
import { getPath, nest } from './captionEffective.js';
import { cleanBar, cleanHeadline, cleanLogo, GLOW_DEFAULTS, HEADLINE_FONT, HEADLINE_PAD, SHADOW_DEFAULTS, TRACK_OPACITY } from './layerFields.js';
import { headlineTiming } from './headlineV2.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const hexOf = (rgb) => `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** The shadow and glow values every layer shows (the captions' defaults). */
function fxVal(L, path, glowFill) {
    const [group, f] = path.split('.');
    const own = L?.[group]?.[f];
    if (own !== undefined) return own;
    if (group === 'shadow') return SHADOW_DEFAULTS[f];
    if (f === 'color') return glowFill;
    return GLOW_DEFAULTS[f];
}

/** Does the Look set this field itself? (`x` and `y` are one place.) */
function isSetIn(L, path) {
    if (path === 'x' || path === 'y') return L.x !== undefined || L.y !== undefined;
    return getPath(L, path) !== undefined;
}

// ---------------------------------------------------------------------------
// headline
// ---------------------------------------------------------------------------

/**
 * The view of the headline controls.
 *
 * @param {object} r  `resolveHeadline()` output (either writer)
 * @param {object} look  the Look's `headline` section
 * @param {{len?: number, room?: number}} [o]  the clip's length (seconds) and
 *        the default room of the text block (share of the frame width)
 */
export function headlineView(r, look, { len = Infinity, room = 0.8 } = {}) {
    const L = cleanHeadline(look);
    const timing = headlineTiming(L, len);
    const cardObj = isObj(L.card) ? L.card : null;
    const cardCol = cardObj?.color ?? (typeof L.card === 'string' && L.card !== 'none' ? L.card : '#FFFFFF');
    const glowFill = hexOf(glowDefault(rgbOf(r.ink)));

    function val(path) {
        switch (path) {
            case 'x': return r.center.x;
            case 'y': return r.center.y;
            case 'opacity': return L.opacity ?? 1;
            case 'size': return r.size;
            case 'font': return L.font ?? HEADLINE_FONT;
            case 'case': return L.case ?? 'asis';
            case 'spacing': return L.spacing ?? 0;
            case 'align': return L.align ?? 'center';
            case 'max_lines': return L.max_lines ?? 3;
            case 'width': return L.width ?? room;
            case 'ink': return r.ink;
            case 'accent': return r.accent;
            case 'stroke.color': return L.stroke?.color ?? r.stroke.color;
            case 'stroke.width': return L.stroke?.width ?? round(r.stroke.width);
            case 'card.color': return cardCol;
            case 'card.opacity': return cardObj?.opacity ?? 1;
            case 'card.pad': return cardObj?.pad ?? round(HEADLINE_PAD * r.size);
            case 'card.radius': return cardObj?.radius ?? 0;
            case 'accent_word': return L.accent_word ?? 'auto';
            case 'anim': return L.anim ?? 'pop';
            case 'enter.kind': return timing.enter.kind;
            case 'enter.ms': return timing.enter.ms;
            case 'enter.ease': return timing.enter.ease ?? 'out';
            case 'exit.kind': return timing.exit.kind;
            case 'exit.ms': return timing.exit.ms;
            case 'delay_s': return L.delay_s ?? 0;
            case 'seconds': return L.seconds ?? 0;
            default:
                if (path.startsWith('shadow.') || path.startsWith('glow.')) return fxVal(L, path, glowFill);
                return getPath(L, path);
        }
    }
    function isSet(path) {
        switch (path) {
            case 'card': return L.card !== undefined;
            case 'card.color': return cardObj?.color !== undefined || (typeof L.card === 'string' && L.card !== 'none');
            case 'enter.kind': return getPath(L, path) !== undefined || L.anim !== undefined;
            default: return isSetIn(L, path);
        }
    }
    return {
        r,
        L,
        timing,
        val,
        isSet,
        /** The card is off for a `none` card only (a card object at no opacity stays "on" to edit). */
        cardOn: L.card !== 'none',
        shadowOn: !!L.shadow,
        glowOn: !!L.glow,
        shadowIsObject: !!L.shadow,
        /** The font the headline draws without the Look. */
        defaultFont: HEADLINE_FONT,
    };
}

/**
 * The patch for one headline control change. A card colour turned into an
 * object keeps its colour; the v1 `anim` is folded into `enter` the first time
 * an `enter` field is edited, so the entrance on screen is the entrance sent.
 */
export function headlineEdit(view, path, value) {
    const L = view.L;
    const patch = nest(path, value);
    if (path.startsWith('card.') && typeof L.card === 'string' && L.card !== 'none') {
        return { card: { color: L.card, ...patch.card } };
    }
    if (path.startsWith('enter.') && L.anim !== undefined) {
        const e = view.timing.enter;
        return { enter: { kind: e.kind, ms: e.ms, ...(e.ease ? { ease: e.ease } : {}), ...patch.enter }, anim: undefined };
    }
    return patch;
}

/** The patch that clears one headline control (a field, or the v1 forms it also reads). */
export function layerClear(path) {
    if (path === 'x' || path === 'y') return { x: undefined, y: undefined };
    const patch = nest(path, undefined);
    if (path === 'enter.kind') patch.anim = undefined;
    return patch;
}

/** The patch for the card switch: `none` is no card, nothing is today's. */
export const cardPatch = (on) => ({ card: on ? undefined : 'none' });

/** The patch for the shadow switch (a shadow object, started from its defaults that matter). */
export const shadowFxPatch = (on) => ({ shadow: on ? { y: SHADOW_DEFAULTS.y, opacity: SHADOW_DEFAULTS.opacity } : undefined });

// ---------------------------------------------------------------------------
// bar
// ---------------------------------------------------------------------------

/**
 * The view of the bar controls.
 *
 * @param {object} r  `resolveBar()` output
 * @param {object} look  the Look's `bar` section
 * @param {boolean} flatSet  the flat bar colour is not the default one
 */
export function barView(r, look, flatSet = false) {
    const L = cleanBar(look);
    function val(path) {
        switch (path) {
            case 'opacity': return L.opacity ?? 1;
            case 'pos': return r.pos;
            case 'height': return r.height;
            case 'color': return r.color;
            case 'track': return L.track ?? '#000000';
            case 'track_opacity': return L.track_opacity ?? TRACK_OPACITY;
            case 'inset': return L.inset ?? 0;
            case 'radius': return L.radius ?? 0;
            default:
                if (path.startsWith('glow.')) return fxVal(L, path, hexOf(glowDefault(rgbOf(r.color))));
                return getPath(L, path);
        }
    }
    const isSet = (path) => (path === 'color' ? L.color !== undefined || flatSet : isSetIn(L, path));
    return { r, L, val, isSet, glowOn: !!L.glow };
}

// ---------------------------------------------------------------------------
// logo
// ---------------------------------------------------------------------------

/** The view of the logo controls (`r`: `resolveLogo()` output). */
export function logoView(r, look) {
    const L = cleanLogo(look);
    function val(path) {
        switch (path) {
            case 'x': return r.center.x;
            case 'y': return r.center.y;
            case 'size': return r.scale;
            case 'opacity': return r.opacity;
            case 'rotate': return L.rotate ?? 0;
            default:
                if (path.startsWith('shadow.') || path.startsWith('glow.')) return fxVal(L, path, '#FFFFFF');
                return getPath(L, path);
        }
    }
    return { r, L, val, isSet: (path) => isSetIn(L, path), shadowOn: !!L.shadow, glowOn: !!L.glow, shadowIsObject: !!L.shadow };
}

/** The patch for one bar or logo control change (a plain nested field). */
export const layerPatch = (path, value) => nest(path, value);
