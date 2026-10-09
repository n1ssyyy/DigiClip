// The line under the upload box on Home: what the next video will be cut and
// shaped like, in plain words. The three things people change per video (how
// clips are picked, how many, the shape) each have a piece; everything else
// about how clips look is the Look's. `tr` is the app's `t`, so the text
// follows the language. Pure: no React.
import { aspectList } from './look.js';
import { extraShapes } from './shapes.js';

/** How clips are picked, in the order the control lists them. */
export const KINDS = ['smart', 'complete', 'moments', 'timecut'];
const KIND_NAME = { smart: 'Smart', complete: 'Complete', moments: 'Moments', timecut: 'Timecut' };

/** How many clips can be asked for (0 = let the engine decide). */
export const COUNT_MAX = 10;

const asCount = (n) => (Number.isFinite(+n) ? Math.max(0, Math.round(+n)) : 0);

/** The counts the control offers: 0..COUNT_MAX, plus the current one when a
 *  saved copy holds more. */
export function countChoices(n) {
    const out = Array.from({ length: COUNT_MAX + 1 }, (_, i) => i);
    const c = asCount(n);
    return out.includes(c) ? out : [...out, c];
}

/** "3 clips", "1 clip", "Auto clips". */
export function clipsText(n, tr = (s) => s) {
    const c = asCount(n);
    if (c === 0) return tr('Auto clips');
    if (c === 1) return tr('1 clip');
    return tr('{n} clips', { n: c });
}

/** The count as the add bar's picker shows it under the label "Clips": the
 *  number alone, or the word for automatic (the list of choices keeps the full
 *  wording of clipsText). */
export const countFace = (n, tr = (s) => s) => (asCount(n) === 0 ? tr('Auto') : String(asCount(n)));

/** The way clips are picked as it is shown ("Smart"); an unknown one is Smart. */
export const kindText = (kind, tr = (s) => s) => tr(KIND_NAME[kind] ?? 'Smart');

/** The shape text: the main shape, and "+ 1:1, 4:5" for the extras. */
export function shapeText(aspect) {
    const [main] = aspectList(aspect);
    const extra = extraShapes(aspect);
    return extra.length ? `${main} + ${extra.join(', ')}` : main;
}

/** The three pieces of the line, each with the value its control holds and
 *  the text it shows. */
export function homePieces(o, tr = (s) => s) {
    const kind = KINDS.includes(o.kind) ? o.kind : 'smart';
    return {
        kind: { value: kind, text: kindText(kind, tr) },
        count: { value: asCount(o.count), text: clipsText(o.count, tr) },
        shape: { value: aspectList(o.aspect)[0], text: shapeText(o.aspect) },
    };
}

/** The whole line as one piece of text: "Smart · 3 clips · 9:16". */
export function homeSummary(o, tr = (s) => s) {
    const p = homePieces(o, tr);
    return [p.kind.text, p.count.text, p.shape.text].join(' · ');
}
