// The split-screen seam as the engine draws it (digiclip-rs `src/compose.rs`
// `split_rows`, `src/split.rs` `pair_rects` and `src/preview.rs`
// `assumed_pair`, `src/pipeline.rs` `ass_opts`): where the seam row is, what
// each panel shows of the picture in a still (one person assumed at 27% and
// one at 73% of the width), and where the captions sit. Pure.
import { SPLIT_EVEN } from './sceneFields.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Split needs a tall canvas: two panels stacked have room only there. */
export const splitFits = (canvas) => canvas.h > canvas.w;

/** Rows of the top panel: an even half today, the Look's share otherwise,
 *  always even (the 4:2:0 chroma rows must line up). */
export function splitRows(h, split) {
    if (split !== undefined && Math.abs(split - SPLIT_EVEN) > 1e-9) {
        const rows = Math.round((h * split) / 2) * 2;
        return clamp(rows, 2, (h - 2) & ~1);
    }
    return (h >> 1) & ~1;
}

/** Where the captions sit in a split frame, as a fraction of the height: on
 *  the seam, wherever the Look put it. An even seam is the style's own seam
 *  rule (the middle of the frame). */
export function seamCaptionY(h, split) {
    return split !== undefined && Math.abs(split - SPLIT_EVEN) > 1e-9 ? splitRows(h, split) / h : 0.5;
}

// ---- the crops --------------------------------------------------------------------------

/** Head-and-shoulders: crop height in face heights (`HEADROOM`). */
const HEADROOM = 3.2;

/** The fewest source rows a crop may shrink to (`Canvas::min_crop_h`). */
const minCropH = (canvas) => canvas.h * (540 / 1920);

const clampRect = ({ x, y, w, h }, sw, sh) => {
    const w2 = clamp(w, 2, sw);
    const h2 = clamp(h, 2, sh);
    const cx = x + w / 2;
    const cy = y + h / 2;
    return { x: clamp(cx - w2 / 2, 0, Math.max(sw - w2, 0)), y: clamp(cy - h2 / 2, 0, Math.max(sh - h2, 0)), w: w2, h: h2 };
};

/** The crop of one stand-in person at `cx`, for a panel that takes `share`
 *  of the canvas height (`pair_rects`' `one`). */
function crop(cx, face, sep, sw, sh, canvas, share) {
    const aspect = canvas.w / (canvas.h * share);
    const minH = minCropH(canvas) * share;
    let h = Math.min(Math.max(face * HEADROOM, minH), sh);
    const floor = Math.max(face * 1.6, minH);
    if (h * aspect > sep * 0.95) h = Math.min(Math.max((sep * 0.95) / aspect, floor), h);
    let w = h * aspect;
    if (w > sw) {
        w = sw;
        h = w / aspect;
    }
    const cy = sh * 0.38 + 0.12 * h;
    return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h }, sw, sh);
}

/**
 * The two panels of a split still of a `sw` x `sh` source on `canvas`: for
 * each, its rows in the canvas (`y`, `h`) and the part of the source it shows
 * (`crop`, trimmed to the panel's aspect about its centre, as `compose_split`
 * does). The people are the engine's stand-ins: faces 22% of the source's height,
 * centred on 27% and 73% of the width, 38% down.
 */
export function splitPanels(sw, sh, canvas, split) {
    const rows = splitRows(canvas.h, split);
    const top = split === undefined ? SPLIT_EVEN : split;
    const face = sh * 0.22;
    const sep = sw * 0.73 - sw * 0.27;
    const raw = [crop(sw * 0.27, face, sep, sw, sh, canvas, top), crop(sw * 0.73, face, sep, sw, sh, canvas, 1 - top)];
    return [[0, rows], [rows, canvas.h - rows]].map(([y, h], i) => {
        const r = raw[i];
        const aspect = canvas.w / h;
        const [w, hh] = r.w / r.h > aspect ? [r.h * aspect, r.h] : [r.w, r.w / aspect];
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        return { y, h, crop: { x: cx - w / 2, y: cy - hh / 2, w, h: hh } };
    });
}
