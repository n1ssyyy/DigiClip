// Bookkeeping for loading font faces: each file once (per revision), what is
// loading, ready or failed, and only the newest revision of a family counts.
// The actual loading (fetch + FontFace) is passed in, so this is pure and
// runs in Node. No React, no DOM.
import { appFont } from './fontNames.js';

/**
 * @param {object} o
 * @param {(entry: object) => Promise<any>} o.load  loads one font file; its result goes to `onReady`
 * @param {(entry: object, result: any) => void} o.onReady
 * @param {(entry: object, error: unknown) => void} o.onFailed
 */
export function createFaceLoader({ load, onReady, onFailed }) {
    const seen = new Map();
    const latest = new Map();
    const keyOf = (e) => `${e.family.toLowerCase()}|${e.rev ?? ''}|${e.file}`;
    const fam = (e) => e.family.toLowerCase();

    function ensure(entry) {
        if (!entry || !entry.file || (entry.bundled && appFont(entry.family))) return Promise.resolve(true);
        const k = keyOf(entry);
        const hit = seen.get(k);
        if (hit) return hit.promise;
        latest.set(fam(entry), k);
        const rec = { status: 'loading', promise: null };
        rec.promise = Promise.resolve()
            .then(() => load(entry))
            .then((res) => {
                rec.status = 'ready';
                if (latest.get(fam(entry)) === k) onReady(entry, res);
                return true;
            }, (err) => {
                rec.status = 'failed';
                if (latest.get(fam(entry)) === k) onFailed(entry, err);
                return false;
            });
        seen.set(k, rec);
        return rec.promise;
    }

    return {
        ensure,
        /** `idle`, `loading`, `ready` or `failed` for this revision of the entry. */
        status: (entry) => seen.get(keyOf(entry))?.status ?? 'idle',
        /** Let failed files be tried again (the engine's list was read anew). */
        retryFailed() {
            for (const [k, r] of [...seen]) if (r.status === 'failed') seen.delete(k);
        },
        /** Forget a family entirely (it was removed). */
        forget(family) {
            const f = family.toLowerCase();
            latest.delete(f);
            for (const k of [...seen.keys()]) if (k.startsWith(`${f}|`)) seen.delete(k);
        },
    };
}
