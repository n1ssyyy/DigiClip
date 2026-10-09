// The keyboard of the font picker's list, as pure functions: where an arrow,
// Home, End or a page key moves the active row, and which row a typed letter
// jumps to. Pure: no React, no DOM.

const PAGE = 8;

/** The new active index for a navigation key in a list of `n` rows, or null
 *  when the key is not one (arrows do not wrap: the list has two ends). */
export function moveActive(i, key, n) {
    if (n <= 0) return null;
    const at = i < 0 ? 0 : i;
    switch (key) {
        case 'ArrowDown': return i < 0 ? 0 : Math.min(n - 1, at + 1);
        case 'ArrowUp': return i < 0 ? n - 1 : Math.max(0, at - 1);
        case 'PageDown': return Math.min(n - 1, at + PAGE);
        case 'PageUp': return Math.max(0, at - PAGE);
        case 'Home': return 0;
        case 'End': return n - 1;
        default: return null;
    }
}

/** A key that types a letter (not a shortcut). */
export const isTypeKey = (e) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

/** The next row (after `from`, wrapping) whose family starts with `typed`;
 *  -1 when none. Typing one letter again steps through those with it. */
export function typeahead(rows, typed, from = -1) {
    const q = typed.toLowerCase();
    if (!q || !rows.length) return -1;
    const same = [...q].every((c) => c === q[0]);
    const needle = same ? q[0] : q;
    const n = rows.length;
    for (let k = 1; k <= n; k++) {
        const j = (from + k + n) % n;
        if (rows[j].family.toLowerCase().startsWith(needle)) return j;
    }
    return -1;
}
