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

/** Which of the four shape classes a shape belongs to (tall, 4:5, square, wide). */
const shapeClass = (shape) => {
    const r = shape.w / shape.h;
    if (r < 0.7) return 0; // 9:16
    if (r < 0.9) return 1; // 4:5
    if (r <= 1.1) return 2; // 1:1
    return 3; // 16:9 and wider
};

/** The narrowest a tile may be for its shape: the quiet line under the poster
 *  (score chip 26, length 30, start 30, download 22, three 6px gaps = 126) must
 *  still fit, and the picture must stay readable - tall posters can be slim,
 *  wide ones need room. */
export function minTileWidth(shape) {
    return [136, 152, 168, 224][shapeClass(shape)];
}

/** The widest a tile grows, so one or two clips are not giant. */
export function maxTileWidth(shape) {
    return [232, 264, 296, 400][shapeClass(shape)];
}

/** The width a tile gets when the clips cannot all be in view: roomy enough to
 *  read, and the grid scrolls. */
export function comfortTileWidth(shape) {
    return [176, 200, 224, 288][shapeClass(shape)];
}

/** What a tile costs besides its poster, in px. The poster IS the tile (no
 *  frame), so TILE_FRAME is 0; under it: gap 6, title 2 x 15, gap 2, quiet
 *  line 24. ClipTile's classes are built to these numbers, so a plan can know
 *  a tile's height. */
export const TILE_FRAME = 0;
export const TILE_CHROME = 62;

/** A tile's height at width `tileW`: its poster (in the clip's shape) plus the chrome. */
export function tileHeight(tileW, shape) {
    return Math.ceil(((tileW - TILE_FRAME) * shape.h) / shape.w) + TILE_CHROME;
}

/** Columns and tile size for the visible box `area` ({ w, h }, px) of the clip
 *  grid holding `count` clips. Among the column counts at which ALL the clips
 *  fit in view without scrolling (every tile at least the shape's minimum wide,
 *  at most its maximum), the one with the largest tile wins; a tie goes to
 *  fewer rows, then to fewer columns (so six clips make 3 + 3, not 5 + 1). When no count fits, the shape's comfortable
 *  width decides how many columns the row holds, the tiles share the row's
 *  width (up to the maximum), and the grid scrolls. Tiles never leave their shape.
 *  `pad` is the grid's padding on every side. */
export function gridPlan(area, shape, count, gap = 8, pad = 10) {
    const min = minTileWidth(shape);
    const max = maxTileWidth(shape);
    const comfort = comfortTileWidth(shape);
    const known = Number.isFinite(area?.w) && area.w > 0;
    const W = known ? Math.max(0, area.w - pad * 2) : comfort;
    const H = Number.isFinite(area?.h) && area.h > 0 ? area.h - pad * 2 : Infinity;
    const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

    let best = null;
    for (let cols = 1; known && cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        let w = Math.min(Math.floor((W - gap * (cols - 1)) / cols), max);
        if (Number.isFinite(H)) {
            const one = (H - gap * (rows - 1)) / rows; // the height one tile may take
            w = Math.min(w, Math.floor(((one - TILE_CHROME) * shape.w) / shape.h) + TILE_FRAME);
            while (w > 0 && rows * tileHeight(w, shape) + gap * (rows - 1) > H) w--;
        }
        if (w < min) continue;
        if (!best || w > best.tileW || (w === best.tileW && (rows < best.rows || (rows === best.rows && cols < best.cols)))) best = { cols, rows, tileW: w };
    }
    if (best) return { cols: best.cols, tileW: best.tileW, tileH: tileHeight(best.tileW, shape), fits: true };

    // Nothing fits: the comfortable width decides how many columns the row
    // holds, then the tiles share the row (up to the shape's maximum), so no
    // blank band is left on the right.
    const cols = Math.max(1, Math.floor((W + gap) / (comfort + gap)));
    const tileW = Math.max(1, Math.min(max, Math.floor((W - gap * (cols - 1)) / cols) || comfort));
    return { cols, tileW, tileH: tileHeight(tileW, shape), fits: false };
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
export function charsPerLine(tileW, fontPx = 11, padPx = 0) {
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
 *  less its padding and scrollbar, the row's padding, the 64px thumbnail and gap,
 *  and the buttons that sit beside the name (`actions` of them, 22px each).
 *  The type is 12px mono. */
export function rowNameChars(listW, actions = 0) {
    const reserve = actions > 0 ? actions * 22 + 6 : 0;
    return Math.max(4, Math.floor((listW - 104 - reserve - 1) / 7.2));
}

/** A video's name as the list shows it: two lines at most, shortened at a
 *  word gap with an ellipsis (a name with no gaps is cut in the word). The
 *  full name stays in the row's tooltip and in the video's header. */
export function fitName(name, listW, actions = 0) {
    if (!(listW > 0)) return String(name ?? '').replace(/\s+/g, ' ').trim();
    return fitTitle(name, rowNameChars(listW, actions), 2);
}
