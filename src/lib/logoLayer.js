// The engine's logo, mirrored for the Studio stage.
//
// Follows digiclip-rs `src/render.rs` (`Logo`, `logo_chain`,
// `dressed_logo_chain`, `turned_box`). A logo the Look turns or gives a
// shadow or a glow is built in a longer chain; the logo keeps its centre
// where it would have been without them. When this file and the engine
// disagree, the engine is right. Pure functions: no React, no DOM.
import { canvasSize } from './captionStyles.js';
import { GLOW_DEFAULTS, MIN_TURN, SHADOW_DEFAULTS, cleanLogo, isDressed } from './layerFields.js';
import { GLOW_BLUR, GLOW_BORD } from './captionMotion.js';
import { designScale } from './barLayer.js';

export const CORNERS = ['tl', 'tr', 'bl', 'br'];

/** Corner insets (x, y) in px. */
export function logoInset(canvas) {
    const { w, h } = canvasSize(canvas);
    return [Math.round(w * 0.04), Math.round(h * 0.035)];
}

/** The box (even px) a `w` x `h` logo turned by `deg` degrees fits in
 *  (`turned_box`). */
export function turnedBox(w, h, deg) {
    const th = (deg * Math.PI) / 180;
    const s = Math.abs(Math.sin(th));
    const c = Math.abs(Math.cos(th));
    const up = (v) => Math.max(Math.ceil((v - 1e-6) / 2) * 2, 2);
    return { w: up(w * c + h * s), h: up(w * s + h * c) };
}

/**
 * The logo box on a canvas.
 *
 * @param {string|{w,h}} canvas
 * @param {string} corner  the flat `logo_pos`: tl | tr | bl | br
 * @param {object} look  the Look's `logo` section
 * @param {{w:number,h:number}|null} [natural]  the image's pixel size
 *        (unknown = square)
 * @returns `box` is the logo's own size; `x`, `y` its top-left, unturned.
 *   `rotate` is the turn in degrees (clockwise, 0 when under 0.01), `bounds`
 *   the upright box round the turned logo (what the stage selects), `shadow`
 *   and `glow` the effects in px (`null` for none).
 */
export function resolveLogo(canvas, corner, look, natural) {
    const c = cleanLogo(look);
    const { w: cw, h: ch } = canvasSize(canvas);
    const aspect = natural && natural.w > 0 && natural.h > 0 ? natural.w / natural.h : 1;
    const scale = c.size ?? 1;
    const s = Math.min(cw, ch);
    const [bw, bh] = [s * 0.26 * scale, s * 0.14 * scale];
    const wRaw = Math.min(bw, bh * aspect);
    const even = (v) => Math.max(Math.round(v / 2) * 2, 2);
    const w = even(wRaw);
    const h = even(wRaw / aspect);
    const pos = CORNERS.includes(corner) ? corner : 'tr';
    const free = c.x !== undefined || c.y !== undefined;
    let x;
    let y;
    if (free) {
        const place = (centre, extent, room) => {
            const lo = centre - extent / 2;
            const e = Math.max(Math.round(lo / 2) * 2, 0);
            return Math.min(e, Math.max(room - extent, 0) & ~1);
        };
        x = place((c.x ?? 0.5) * cw, w, cw);
        y = place((c.y ?? 0.5) * ch, h, ch);
    } else {
        const [mx, my] = logoInset(canvas);
        x = pos[1] === 'l' ? mx : cw - w - mx;
        // Bottom corners sit higher: clear of the progress bar.
        y = pos[0] === 't' ? my : ch - h - my * 2;
    }
    const k = designScale(cw, ch);
    const rotate = Math.abs(c.rotate ?? 0) > MIN_TURN ? c.rotate : 0;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const turned = rotate ? turnedBox(w, h, rotate) : { w, h };
    const sh = c.shadow ? { ...SHADOW_DEFAULTS, ...c.shadow } : null;
    const shadow = sh && sh.opacity > 0
        ? { color: sh.color, x: sh.x * k, y: sh.y * k, blur: sh.blur * k, opacity: sh.opacity }
        : null;
    // A glow with no colour is white (it is made from the logo's alpha alone).
    const gl = c.glow ? { ...GLOW_DEFAULTS, color: '#FFFFFF', ...c.glow } : null;
    const gsize = gl ? gl.size * k : 0;
    const glow = gl && gsize > 0 && gl.strength > 0
        ? { color: gl.color, size: gsize, strength: gl.strength, grow: gsize * GLOW_BORD, sigma: gsize * GLOW_BLUR }
        : null;
    return {
        w: cw,
        h: ch,
        corner: pos,
        free,
        aspect,
        scale,
        box: { w, h },
        x,
        y,
        rotate,
        dressed: isDressed(c),
        shadow,
        glow,
        bounds: { x: cx - turned.w / 2, y: cy - turned.h / 2, w: turned.w, h: turned.h },
        center: { x: cx / cw, y: cy / ch },
        opacity: c.opacity !== undefined ? Math.round(c.opacity * 100) / 100 : 0.9,
    };
}

/** What headline text a corner logo makes the default headline keep clear
 *  of: the logo's width, its inset and a gap (pipeline.rs). `null` when the
 *  logo is placed freely, which the text does not make room for. */
export function logoClear(logo) {
    if (!logo || logo.free) return null;
    return {
        top: logo.corner[0] === 't',
        left: logo.corner[1] === 'l',
        px: logo.box.w + logoInset({ w: logo.w, h: logo.h })[0] + Math.round(logo.w * 0.025),
    };
}
