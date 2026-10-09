// The headline's text, as the engine writes it: cleaned, sentence-cased and
// never cut mid-thought (`headline_text`), the word it accents
// (`accent_pick`) and the balanced two-line markup of the one-event writer.
// Pure functions: no React, no DOM.
import { isKeyword } from './captionStyles.js';

export const HEADLINE_MAX = 48;
/** What the stage shows when the headline text is empty: real clips use
 *  their own title. */
export const HEADLINE_SAMPLE = 'Why most founders quit too early';

/** Words a headline never ends on. */
export const DANGLING = [
    'a', 'an', 'the', 'and', 'or', 'but', 'so', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
    'from', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'that', 'this', 'my', 'your', 'our',
    'their', 'his', 'her', 'its', 'if', 'when', 'than', 'then', 'because', 'about', 'into', 'i',
    'you', 'we', 'they', 'he', 'she', 'it', 'not', 'just', 'very', 'really', 'like', 'all',
];
const BARE_EDGE = /^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu;
export const bare = (w) => w.replace(BARE_EDGE, '').toLowerCase();
export const charLen = (s) => [...s].length;

/** Headline text: clean, sentence-cased, at most `max` chars and never cut
 *  mid-thought (`headline_text`). */
export function headlineText(raw, max = HEADLINE_MAX) {
    const t = String(raw ?? '').replace(/[{}\\*"“”]/g, '').split(/\s+/).filter(Boolean);
    let n = 0;
    let len = 0;
    for (const w of t) {
        const l = charLen(w) + (n > 0 ? 1 : 0);
        if (len + l > max) break;
        len += l;
        n += 1;
    }
    let keep = t.slice(0, n);
    if (n < t.length) {
        // Last clause break that keeps at least 3 words.
        let cut = -1;
        for (let i = n; i >= 3; i--) {
            if (/[,;:.!?—]$/u.test(keep[i - 1])) {
                cut = i;
                break;
            }
        }
        if (cut > 0) keep = keep.slice(0, cut);
        else while (keep.length > 2 && DANGLING.includes(bare(keep[keep.length - 1]))) keep = keep.slice(0, -1);
    }
    const out = keep.join(' ').replace(/[,;:.\-—…]+$/u, '').trim();
    return out ? out[0].toUpperCase() + out.slice(1) : '';
}

const filled = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : '');

/**
 * The text the stage draws for the headline, in the order the engine picks it:
 * the typed text (when the engine would keep something of it), else the title
 * of the sample video's first clip, else the video's own title. The fixed line
 * is only for the stand-in sample (`job` null) or a video with no title at all.
 *
 * @param {string} raw  the headline text option
 * @param {{name?: string, clips?: {title?: string}[]}|null} [job]  the sample video
 */
export function stageHeadline(raw, job = null) {
    if (headlineText(raw, HEADLINE_MAX)) return String(raw);
    return filled(job?.clips?.[0]?.title) || filled(job?.name) || HEADLINE_SAMPLE;
}

/** The word of a headline the engine accents: a keyword, else the longest
 *  content word (the earlier one on a tie); -1 when there is none. "I",
 *  "I'm"… are capitalized but never the point (`accent_pick`). */
export function accentPick(words) {
    for (let i = 1; i < words.length; i++) {
        const b = bare(words[i]);
        if (isKeyword(words[i], false) && !b.startsWith("i'") && b !== 'i') return i;
    }
    // The longest content word; ties go to the earlier one.
    let best = -1;
    for (let i = 0; i < words.length; i++) {
        const b = bare(words[i]);
        if (charLen(b) >= 5 && !DANGLING.includes(b)) {
            if (best < 0 || charLen(words[i]) > charLen(words[best])) best = i;
        }
    }
    return best;
}

/** The headline as lines of words, one word the accent: two balanced lines
 *  once it is long enough to wrap (`headline_markup`). */
export function headlineMarkup(h) {
    const words = h.split(' ');
    const pick = accentPick(words);
    const total = charLen(h);
    let brk = -1;
    if (total > 18 && words.length > 1) {
        let bestScore = Infinity;
        for (let i = 1; i < words.length; i++) {
            const a = charLen(words.slice(0, i).join(' '));
            const score = Math.max(a, total - a - 1);
            if (score < bestScore) {
                bestScore = score;
                brk = i;
            }
        }
    }
    const lines = [[]];
    words.forEach((w, i) => {
        if (i === brk) lines.push([]);
        lines[lines.length - 1].push({ text: w, accent: i === pick });
    });
    return lines;
}
