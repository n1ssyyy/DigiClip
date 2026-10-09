// The keyboard of the app's dropdown list, as pure functions: which option a
// key moves to, which one typed letters jump to, and the buffer they build.
// Options are {value, text, disabled?}. Pure: no React, no DOM.

/** How long a pause ends the word being typed. */
export const TYPE_MS = 700;

/** Index of the option whose value is `value` (compared as text, so a number and its
 *  string match, as they did in the native select); -1 when none. */
export const optionIndex = (options, value) => options.findIndex((o) => String(o.value) === String(value));

const free = (o) => !o.disabled;

/** The new active index for Arrow, Home, End and the page keys in a list, skipping
 *  disabled options; null when the key is not one of those. Arrows stop at the ends. */
export function stepOption(options, from, key) {
    const n = options.length;
    if (!n) return null;
    const first = options.findIndex(free);
    const last = options.findLastIndex(free);
    if (first < 0) return null;
    switch (key) {
        case 'Home':
        case 'PageUp': return first;
        case 'End':
        case 'PageDown': return last;
        case 'ArrowDown': {
            for (let i = Math.max(from, -1) + 1; i < n; i++) if (free(options[i])) return i;
            return from >= 0 && free(options[from]) ? from : last;
        }
        case 'ArrowUp': {
            for (let i = (from < 0 ? n : from) - 1; i >= 0; i--) if (free(options[i])) return i;
            return from >= 0 && free(options[from]) ? from : first;
        }
        default: return null;
    }
}

/** A key that types a letter (not a shortcut). */
export const isTypeKey = (e) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

/** Lower case without accents, so "e" finds "Español" and "turk" finds "Türkçe". */
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The text typed so far after one more key: it starts again after a pause. */
export function extendTyped(typed, key, now = Date.now()) {
    const fresh = !typed.text || now - typed.at > TYPE_MS;
    return { text: fresh ? key : typed.text + key, at: now };
}

/** Is a word being typed (so Space is a letter of it, not a choice)? */
export const isTyping = (typed, now = Date.now()) => !!typed.text && now - typed.at <= TYPE_MS;

/** The option (after `from`, wrapping) whose text starts with `text`; -1 when none. One
 *  letter typed again steps through the options that start with it; a longer word keeps
 *  the option it is on when that still matches. */
export function findTyped(options, text, from = -1) {
    const q = fold(text);
    if (!q.trim() || !options.length) return -1;
    const same = [...q].every((c) => c === q[0]);
    const needle = same ? q[0] : q;
    const n = options.length;
    const start = same ? 1 : 0;
    for (let k = start; k < n + start; k++) {
        const j = (from + k + n) % n;
        if (free(options[j]) && fold(options[j].text).startsWith(needle)) return j;
    }
    return -1;
}
