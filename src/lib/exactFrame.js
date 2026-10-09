// The exact frame: a real rendered still of the working copy at the
// playhead, asked of the engine (`preview_frame`). Pure: the request, the
// staleness key and the reasons it is not available. The socket call and the
// state around it live in components/studio/useExactFrame.js.
import { aspectList, toEngine } from './look.js';
import { canon } from './lookLibrary.js';

export const FRAME_CAP = 'preview_frame';

/** Engine options that decide how many clips there are and where they cut,
 *  not what a still looks like. */
const CUT_ONLY = ['kind', 'count', 'min_len', 'max_len', 'tighten'];

const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The seconds the sample's window has: the playhead within it. */
function at(t, len) {
    const n = Number.isFinite(+t) ? +t : 0;
    return r3(clamp(n, 0, Math.max(0, +len || 0)));
}

/**
 * The command's parameters for the sample on the stage, or `null` when the
 * stage has no real video behind it (the stand-in).
 *
 * @param {object} working  the working copy of the options
 * @param {{job: {id: string}|null, start: number, len: number}} sample  `useSample()`
 * @param {number} t  the playhead, in seconds within the sample
 * @param {{alpha?: boolean}} [engine]  `alpha`: the engine takes opacity in colours
 *        (`look.alpha`); without it the options are cut to what it knows
 */
export function frameRequest(working, sample, t, { alpha = true } = {}) {
    if (!sample?.job?.id) return null;
    return {
        job: sample.job.id,
        start_s: r3(sample.start ?? 0),
        len_s: r3(sample.len ?? 0),
        t: at(t, sample.len),
        options: toEngine(working, { alpha }),
    };
}

/**
 * What a shown still was rendered for: the look (all of it that a picture
 * depends on), the shape on the stage, the sample and the playhead. When the
 * key now differs from the one the request was made with, the still is stale.
 */
export function frameKey(working, sample, t, { alpha = true } = {}) {
    const o = { ...toEngine(working, { alpha }) };
    for (const k of CUT_ONLY) delete o[k];
    // Only the first shape is on the stage; the others are further runs.
    o.aspect = aspectList(working.aspect)[0];
    return canon({ job: sample?.job?.id ?? null, start: r3(sample?.start ?? 0), len: r3(sample?.len ?? 0), t: at(t, sample?.len), shape: o.aspect, options: o });
}

/**
 * Can the button work now? `reason` is the English line for its tooltip
 * (shown through `t()`), `null` when it can.
 */
export function frameAvailability(caps, hasVideo) {
    if (!(caps ?? []).includes(FRAME_CAP)) return { ok: false, reason: 'This engine is older than exact frames. Update the engine to use them.' };
    if (!hasVideo) return { ok: false, reason: 'Pick a sample video: the stand-in has no picture to render.' };
    return { ok: true, reason: null };
}

/** The render time of a reply as `3.4 s`. */
export function renderTime(ms) {
    return `${(Math.max(0, +ms || 0) / 1000).toFixed(1)} s`;
}

/** The warnings of a reply as one line (engine text, as it came). */
export function warningLine(warnings) {
    return (Array.isArray(warnings) ? warnings : []).filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim()).join(' · ');
}

/**
 * What the Space key does on the Studio page. While the engine's still is
 * up, Space on the "Exact frame" button (where focus stays after it was
 * clicked) would only press that button again and close the still; it
 * closes the still and plays instead. Anywhere else the key is the focused
 * control's own when it means something to it.
 *
 * @param {{typing: boolean, free: boolean, stillShown: boolean, onStillButton: boolean}} s
 *   typing: focus is in a text field; free: focus is on nothing that uses Space;
 *   stillShown: the still is up; onStillButton: focus is on the Exact frame button
 * @returns {'none'|'play'|'close-and-play'}
 */
export function spaceAction({ typing, free, stillShown, onStillButton }) {
    if (typing) return 'none';
    if (stillShown && (free || onStillButton)) return 'close-and-play';
    return free ? 'play' : 'none';
}
