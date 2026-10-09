// The three sample words of the Words section's preview strip and the loop
// they play: pure timing, so the strip and the tests agree. The strip draws
// them with the stage's own model (`captionMotion.js`); this only says when
// each word is said and how long the loop runs.

/** [start, end] in seconds of the three words, evenly spaced. */
export const PREVIEW_SPANS = [[0.1, 0.45], [0.6, 0.95], [1.1, 1.45]];
/** The middle word is the keyword, so its own look shows. */
export const PREVIEW_KEYWORD = 1;
/** Quiet time after the last word has settled and before the loop restarts (ms). */
const PAUSE_MS = 700;
/** The line leaves this long before the loop restarts (ms). */
const GAP_MS = 250;

/**
 * The strip's timing for a Look's word timeline.
 *
 * @param {{attack_ms: number, hold_ms: number, release_ms: number}} w  the effective timeline
 * @returns {{
 *   words: {s:number,e:number}[],   seconds
 *   loopMs: number, lineEnd: number (s, when the line is gone),
 *   stillMs: number,                one representative moment for reduced motion
 * }}
 */
export function previewTiming(w) {
    const ms = (v) => (Number.isFinite(v) ? Math.max(0, v) : 0);
    const attack = ms(w.attack_ms);
    const hold = ms(w.hold_ms);
    const release = ms(w.release_ms);
    const words = PREVIEW_SPANS.map(([s, e]) => ({ s, e }));
    // The last word settles: its attack, then it stays through its end plus hold, then the release.
    const last = words[words.length - 1];
    const settled = Math.max(last.e * 1000 + hold, last.s * 1000 + attack) + release;
    const loopMs = Math.ceil((settled + PAUSE_MS) / 50) * 50;
    // The middle word halfway through: one before it spoken, one after it still to come.
    const mid = words[PREVIEW_KEYWORD];
    return { words, loopMs, lineEnd: (loopMs - GAP_MS) / 1000, stillMs: Math.round(((mid.s + mid.e) / 2) * 1000) };
}

/**
 * The block the strip draws, in the shape of `captionLines()` output.
 *
 * @param {string[]} texts  the three words, already in the caption's case
 */
export function previewBlock(texts, timing) {
    let k = timing.words[0].s;
    const words = texts.slice(0, timing.words.length).map((text, i) => {
        const { s, e } = timing.words[i];
        const w = { text, raw: text, s, e, k, key: i === PREVIEW_KEYWORD };
        k += e - s;
        return w;
    });
    return { t0: 0, t1: timing.lineEnd, words };
}
