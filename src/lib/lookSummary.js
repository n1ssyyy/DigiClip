// A one-line summary of a saved look, derived from its options: the caption
// style, the shape and the first couple of traits that stand out. The trait
// phrases are English source text; the caller passes `tr` (the app's `t`)
// to show them in the person's language. Pure: no React.
import { aspectList, fromEngine } from './look.js';

/** How many traits follow the style and the shape, at most. */
export const TRAITS_SHOWN = 2;

/** The longest a summary may be, as shown: one line of the picker's menu
 *  (340 px wide, 10 px mono type) holds about 48 characters. A trait that
 *  would pass this is left out, so the line never needs cutting. */
export const SUMMARY_MAX = 44;

const GRADE = { warm: 'Warm colour', cool: 'Cool colour', mono: 'Mono colour', punchy: 'Punchy colour' };
const FEEL = { locked: 'Locked camera', steady: 'Steady camera', lively: 'Lively camera' };

const has = (o) => !!o && typeof o === 'object' && Object.keys(o).length > 0;

/** The traits worth a mention, most telling first (English phrases). */
export function traits(o) {
    const L = o.look ?? {};
    const c = L.captions ?? {};
    const out = [];
    if (c.show === false) out.push('No captions');
    if (o.layout === 'split') out.push('Split screen');
    else if (o.layout === 'auto') out.push('Auto split');
    if (c.words?.mode === 'single') out.push('One word at a time');
    else if (c.words?.mode === 'build') out.push('Words build up');
    if (has(c.glow) || has(c.words?.active?.glow) || has(c.words?.keyword?.glow)) out.push('Glowing words');
    if (has(c.box) && c.box !== 'none' && c.box.opacity !== 0) out.push('Boxed words');
    if (o.headline) out.push('Headline');
    if (o.progress_bar) out.push('Progress bar');
    if (L.effects?.grade && GRADE[L.effects.grade]) out.push(GRADE[L.effects.grade]);
    if (L.camera?.feel && FEEL[L.camera.feel]) out.push(FEEL[L.camera.feel]);
    if (o.punch === false) out.push('No punch-ins');
    if (L.effects?.vignette > 0) out.push('Vignette');
    if (o.logo) out.push('Logo');
    if (o.music) out.push('Music');
    return out;
}

/** The parts of the summary for engine options (a preset). */
export function summaryParts(options) {
    const o = fromEngine(options, null);
    return { style: o.style, shape: aspectList(o.aspect)[0], traits: traits(o).slice(0, TRAITS_SHOWN) };
}

/** `karaoke · 9:16 · Progress bar · Cool colour`: the style, the shape and as
 *  many of the first traits as fit on a line (the first always stays). */
export function lookSummary(options, tr = (s) => s) {
    const { style, shape, traits: tt } = summaryParts(options);
    const out = [style, shape];
    for (const x of tt) {
        const word = tr(x);
        if (out.length > 2 && [...out, word].join(' · ').length > SUMMARY_MAX) break;
        out.push(word);
    }
    return out.join(' · ');
}
