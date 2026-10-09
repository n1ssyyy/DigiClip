// How Home lays out a video's clips: each tile takes its clip's own shape, the
// grid takes as many columns as the width allows for that shape, and a title
// that is too long for its two lines is shortened at a word (as is a video's
// name in the list). Pure: no React.
import { mainShape } from './shapes.js';

/** A clip's shape from its file name (`clip-01-4x5.mp4` -> 4:5). */
export function shapeFromFile(mp4) {
    const m = /-(\d+)x(\d+)\.mp4$/i.exec(mp4 ?? '');
    return m && +m[1] > 0 && +m[2] > 0 ? { w: +m[1], h: +m[2] } : null;
}

/** The shape of a clip's tile: its file's, else the shape the run was set to
 *  make (so a clip still being made already has its real tile), else 9:16. */
export function clipShape(clip, job) {
    const fromFile = shapeFromFile(clip?.mp4);
    if (fromFile) return { ...fromFile, tag: `${fromFile.w}x${fromFile.h}` };
    const [w, h] = mainShape(job?.options?.aspect).split(':').map(Number);
    return w > 0 && h > 0 ? { w, h, tag: `${w}x${h}` } : { w: 9, h: 16, tag: '9x16' };
}

/** The narrowest a tile may be for its shape: tall posters can be slim, wide
 *  ones need room. */
export function minTileWidth(shape) {
    const r = shape.w / shape.h;
    if (r < 0.7) return 156; // 9:16
    if (r < 0.9) return 172; // 4:5
    if (r <= 1.1) return 188; // 1:1
    return 256; // 16:9 and wider
}

/** What a tile costs besides its poster, in px: frame (border 2 + padding 12),
 *  score strip 16, title 2 x 15, footer 24 and three 4px gaps. ClipTile's
 *  classes are built to these numbers, so a plan can know a tile's height. */
export const TILE_FRAME = 14;
export const TILE_CHROME = 96;
/** The least a tile is squeezed to when the window is very short (its footer
 *  line, "#14 · 7:03 → 7:27" and the download, still fits). */
const FLOOR_W = 148;

/** A tile's height at width `tileW`: its poster (in the clip's shape) plus the chrome. */
export function tileHeight(tileW, shape) {
    return Math.ceil(((tileW - TILE_FRAME) * shape.h) / shape.w) + TILE_CHROME;
}

/** Columns and tile size for the visible box `area` ({ w, h }, px) of the clip
 *  grid. Width decides the columns (as many as fit at the shape's minimum, the
 *  tiles share what is left); height caps the tile so one whole row, picture to
 *  footer, fits in view without scrolling - tiles get smaller, not stretched,
 *  and need not fill the row. `pad` is the grid's padding on every side. */
export function gridPlan(area, shape, gap = 8, pad = 10) {
    const min = minTileWidth(shape);
    const W = Number.isFinite(area?.w) && area.w > 0 ? Math.max(0, area.w - pad * 2) : min;
    const H = Number.isFinite(area?.h) && area.h > 0 ? area.h - pad * 2 : Infinity;
    const cap = Number.isFinite(H)
        ? Math.max(FLOOR_W, Math.floor(((H - TILE_CHROME) * shape.w) / shape.h) + TILE_FRAME)
        : Infinity;
    const m = Math.min(min, cap);
    const cols = Math.max(1, Math.floor((W + gap) / (m + gap)));
    const tileW = Math.min(Math.floor((W - gap * (cols - 1)) / cols), cap);
    return { cols, tileW, tileH: tileHeight(tileW, shape) };
}

/** Rows a text takes at `per` characters a line when it is wrapped at word
 *  gaps; a word longer than a line is broken over lines. The type is mono, so
 *  counting characters is exact. */
export function wrapRows(text, per) {
    const rows = [];
    let cur = '';
    for (let w of String(text).split(' ').filter(Boolean)) {
        if (w.length > per) {
            if (cur) rows.push(cur);
            cur = '';
            while (w.length > per) {
                rows.push(w.slice(0, per));
                w = w.slice(per);
            }
            cur = w;
        } else if (!cur) {
            cur = w;
        } else if (cur.length + 1 + w.length <= per) {
            cur += ` ${w}`;
        } else {
            rows.push(cur);
            cur = w;
        }
    }
    if (cur) rows.push(cur);
    return rows;
}

/** Characters one line of a tile's title holds. */
export function charsPerLine(tileW, fontPx = 11, padPx = 14) {
    return Math.max(4, Math.floor((tileW - padPx - 1) / (fontPx * 0.6)));
}

/** The title as it is shown in a tile: whole when it fits in `lines` lines,
 *  else the words that fit with an ellipsis, cut at a word gap (and never
 *  after a trailing comma or dash). */
export function fitTitle(title, per, lines = 2) {
    const s = String(title ?? '').replace(/\s+/g, ' ').trim();
    if (!s || wrapRows(s, per).length <= lines) return s;
    const words = s.split(' ');
    for (let n = words.length - 1; n >= 1; n--) {
        const head = words.slice(0, n).join(' ').replace(/[\s,;:\-–—.]+$/, '');
        if (head && wrapRows(`${head}…`, per).length <= lines) return `${head}…`;
    }
    return `${words[0].slice(0, Math.max(1, per * lines - 1))}…`;
}

/** Characters one line of a video's name in the list holds: the list's width
 *  less its padding and scrollbar, the row's padding, the thumbnail and gap,
 *  and the buttons that sit beside the name (`actions` of them, 22px each).
 *  The type is 12px mono. */
export function rowNameChars(listW, actions = 0) {
    const reserve = actions > 0 ? actions * 22 + 6 : 0;
    return Math.max(4, Math.floor((listW - 96 - reserve - 1) / 7.2));
}

/** A video's name as the list shows it: two lines at most, shortened at a
 *  word gap with an ellipsis (a name with no gaps is cut in the word). The
 *  full name stays in the row's tooltip and in the video's header. */
export function fitName(name, listW, actions = 0) {
    if (!(listW > 0)) return String(name ?? '').replace(/\s+/g, ' ').trim();
    return fitTitle(name, rowNameChars(listW, actions), 2);
}
