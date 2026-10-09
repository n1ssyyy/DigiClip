// The rules for a Look's name. Pure: no React, no storage.
//
// A name is trimmed, 1 to 40 characters, and unique without regard to case
// among the person's own looks and the starter looks (those names are
// reserved). A name that clashes is offered the next free "Name 2", which the
// person confirms; it is never taken for them.

export const NAME_MAX = 40;

const low = (s) => String(s).toLowerCase();

/** The names as the rules compare them. */
function nameSet(list) {
    return new Set(list.map(low));
}

/** `name` with the first free " 2", " 3", ... after it, none of them in
 *  `taken` (case-insensitive) and the whole kept within the length limit.
 *  A name already ending in a number that comes from a free-standing
 *  base ("Neon 2" when "Neon" exists) counts on from there. */
export function nextFreeName(name, taken) {
    const set = nameSet(taken);
    let base = String(name ?? '').trim() || 'Look';
    const m = /^(.*\S)\s+\d+$/.exec(base);
    if (m && set.has(low(m[1]))) base = m[1];
    for (let n = 2; ; n++) {
        const suffix = ` ${n}`;
        const cand = `${base.slice(0, NAME_MAX - suffix.length).trimEnd()}${suffix}`;
        if (!set.has(low(cand))) return cand;
    }
}

/**
 * Is `raw` fine as the name of a look?
 *
 * @param {string} raw
 * @param {string[]} own  the names of the person's saved looks
 * @param {{reserved?: string[], except?: string|null, allowReplace?: boolean}} [o]
 *        `reserved` the starter names (as shown, and in English); `except` the
 *        look being renamed, which does not clash with itself; `allowReplace`
 *        Save-as: an exact match with another look of the person's means
 *        replacing it.
 * @returns {{kind:'invalid', reason:'empty'|'long'}
 *          |{kind:'ok', name:string}
 *          |{kind:'replace', name:string}
 *          |{kind:'clash', name:string, suggest:string}}
 */
export function checkName(raw, own, { reserved = [], except = null, allowReplace = false } = {}) {
    const name = String(raw ?? '').trim();
    if (!name) return { kind: 'invalid', reason: 'empty' };
    if (name.length > NAME_MAX) return { kind: 'invalid', reason: 'long' };
    const others = own.filter((n) => n !== except);
    if (others.includes(name)) {
        return allowReplace ? { kind: 'replace', name } : { kind: 'clash', name, suggest: nextFreeName(name, [...others, ...reserved]) };
    }
    const lowered = nameSet([...others, ...reserved]);
    if (lowered.has(low(name))) return { kind: 'clash', name, suggest: nextFreeName(name, [...others, ...reserved]) };
    return { kind: 'ok', name };
}

/**
 * What Enter does with the name typed. A name that is taken is never changed
 * behind the person's back: the field gets the suggestion to look at, and a
 * second Enter (now a free name) saves it.
 *
 * @returns {{kind:'invalid', reason:'empty'|'long'}
 *          |{kind:'save', name:string}
 *          |{kind:'replace', name:string}
 *          |{kind:'taken', name:string, suggest:string}}
 */
export function nameStep(raw, own, opts) {
    const c = checkName(raw, own, opts);
    if (c.kind === 'ok') return { kind: 'save', name: c.name };
    if (c.kind === 'clash') return { kind: 'taken', name: c.name, suggest: c.suggest };
    return c;
}

/** The name to store for `raw` and whether it replaces a look, or `null`
 *  when the name cannot be used as typed (empty, too long, or taken). */
export function chooseName(raw, own, opts) {
    const c = checkName(raw, own, opts);
    if (c.kind === 'ok') return { name: c.name, replace: false };
    if (c.kind === 'replace') return { name: c.name, replace: true };
    return null;
}
