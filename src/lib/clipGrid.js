// How Home lays out a video's clips: each tile takes its clip's own shape, the
// grid takes as many columns as the width allows for that shape, and a title
// that is too long for its two lines is shortened at a word. Pure: no React.
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

/** Columns and tile width for a grid `width` px wide: as many columns as fit
 *  at the minimum, then the tiles share what is left (so they never grow past
 *  a column's worth over the minimum). */
export function gridPlan(width, shape, gap = 8) {
    const min = minTileWidth(shape);
    const w = Number.isFinite(width) && width > 0 ? width : min;
    const cols = Math.max(1, Math.floor((w + gap) / (min + gap)));
    return { cols, tileW: Math.floor((w - gap * (cols - 1)) / cols) };
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
