// The shapes of one run: `aspect` is a comma list, the first is the main
// shape (what the stage draws) and the rest are extra shapes the same run
// also makes. Every operation takes and returns that text. Pure: no React.
import { ASPECTS, aspectList } from './look.js';

/** The main shape of a run. */
export const mainShape = (v) => aspectList(v)[0];

/** The extra shapes of a run, in the order of `ASPECTS`. */
export function extraShapes(v) {
    const rest = aspectList(v).slice(1);
    return ASPECTS.filter((a) => rest.includes(a));
}

/** The list text for a main shape and its extras (the main one is never
 *  also an extra; an unknown shape is dropped). */
export function joinShapes(main, extras = []) {
    const m = ASPECTS.includes(main) ? main : '9:16';
    return [m, ...ASPECTS.filter((a) => a !== m && extras.includes(a))].join(',');
}

/** Switch the main shape and keep the extras (a shape that was an extra
 *  becomes the main one and stops being an extra). */
export function setMainShape(v, id) {
    if (!ASPECTS.includes(id)) return aspectList(v).join(',');
    return joinShapes(id, extraShapes(v));
}

/** Turn one extra shape on or off. The main shape cannot be an extra. */
export function toggleExtra(v, id) {
    const main = mainShape(v);
    const extras = extraShapes(v);
    if (id === main || !ASPECTS.includes(id)) return joinShapes(main, extras);
    return joinShapes(main, extras.includes(id) ? extras.filter((a) => a !== id) : [...extras, id]);
}

/** How many files one clip comes out as. */
export const shapeCount = (v) => aspectList(v).length;
