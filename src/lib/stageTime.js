// Where the stage's playhead rests and which caption block it measures:
// pure helpers for Studio (no React, no DOM, importable from Node).
import { effectiveMotion } from './captionFields.js';
import { headlineEndMs, headlineSettleMs } from './layers.js';

/** Settled a moment, not only reached: the playhead lands this far (s) past
 *  the settle point so no easing is still on its last step. */
const MARGIN_S = 0.05;

/**
 * The moment (seconds into the sample window) to park the playhead at: the
 * first one where a caption line is up and settled and, if the headline is
 * on, the headline is visible and settled too. Nothing plays; it is only
 * where the stage opens, so the first thing seen is a finished caption.
 *
 * @param {{t0:number,t1:number}[]} lines  `captionLines()` / `captionBlocks()` output
 * @param {{
 *   len: number,
 *   captions?: boolean, clean?: object, anim?: string,
 *   headline?: {anim: string, seconds: number}|null,
 * }} o  `clean`/`anim`: the resolved captions' (for the line's entrance time)
 * @returns {number} 0 when nothing qualifies
 */
export function parkTime(lines, { len, captions = true, clean, anim, headline = null }) {
    const top = Math.max(0, len ?? 0);
    const head = headline ? { lo: headlineSettleMs(headline) / 1000, hi: headlineEndMs(headline, top * 1000) / 1000 } : null;
    const enterS = captions ? effectiveMotion(clean, anim).enter.ms / 1000 : 0;
    const fit = (lo, hi) => {
        const a = Math.max(lo, head ? head.lo : 0);
        const b = Math.min(hi, head ? head.hi : Infinity, top);
        return a + MARGIN_S <= b ? a + MARGIN_S : (a < b ? a : null);
    };
    if (captions && lines?.length) {
        for (const l of lines) {
            const t = fit(l.t0 + enterS, l.t1);
            if (t !== null) return t;
        }
        // The headline never lines up with a line: the first line settled.
        const first = lines[0];
        return Math.min(top, first.t0 + enterS + MARGIN_S);
    }
    if (head) return Math.min(top, head.lo + MARGIN_S);
    return 0;
}

/**
 * The caption block to measure at `time`: the one on screen; between lines
 * the nearest one in time (the line that just left, else the one coming), so
 * the selection box rests where the caption is, not at the widest line of the
 * whole sample. `null` with no lines at all.
 */
export function blockAt(lines, time) {
    if (!lines?.length) return null;
    let best = null;
    let gap = Infinity;
    for (const l of lines) {
        if (time >= l.t0 && time < l.t1) return l;
        const d = time < l.t0 ? l.t0 - time : time - l.t1;
        // A tie goes to the line that just left.
        if (d < gap || (d === gap && time >= l.t1)) {
            gap = d;
            best = l;
        }
    }
    return best;
}
