// What the colour control does with an edit, as pure functions: the hex
// field, the picker's hue and the Opacity slider, for a colour on its own and
// for a colour whose opacity is a number of the Look (a caption box's, a
// headline card's, a bar track's, a shadow's: the slider then edits that
// number and the colour stays six digits). Each answers with the values to
// write: `colour` and `number`, `undefined` meaning "leave it". No React.
import { alphaOf, colourOnly, normColour, withAlpha } from './alpha.js';

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * What the control shows for a colour and the number bound to it (`number`:
 * its effective value, or `undefined` when the colour has none). A Look that
 * holds both an 8-digit colour and the number shows their product.
 *
 * @returns {{rgb: string, opacity: number, both: boolean}}
 */
export function colourShown(colour, number) {
    const own = alphaOf(colour);
    const bound = isNum(number);
    return { rgb: colourOnly(colour), opacity: own * (bound ? number : 1), both: bound && own < 1 };
}

/**
 * The hex field or the picker gave `typed` (six or eight digits). A new hue
 * keeps the current opacity; digits that carry their own opacity set it.
 *
 * @param {string} colour  the colour now (effective)
 * @param {string} typed
 * @param {number} [number]  the bound opacity number's value, when there is one
 * @returns {{colour: string, number?: number}|null}  `null` for text that is no colour
 */
export function pickColour(colour, typed, number) {
    const t = normColour(typed);
    if (!t) return null;
    const own = t.length === 9;
    if (isNum(number)) {
        // A colour that arrives with both its own opacity and the number is
        // folded into the number on this edit.
        if (own) return { colour: colourOnly(t), number: alphaOf(t) };
        const cur = alphaOf(colour);
        return cur < 1 ? { colour: t, number: cur * number } : { colour: t };
    }
    return own ? { colour: t } : { colour: withAlpha(t, alphaOf(colour)) };
}

/**
 * The Opacity slider moved to `a` (0..1).
 *
 * @param {string} colour  the colour now (effective)
 * @param {number} a
 * @param {boolean} bound  the opacity is a number of the Look
 * @returns {{colour?: string, number?: number}}
 */
export function pickOpacity(colour, a, bound) {
    if (bound) return alphaOf(colour) < 1 ? { colour: colourOnly(colour), number: a } : { number: a };
    return { colour: withAlpha(colour, a) };
}
