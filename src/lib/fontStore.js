// The font library as a small store over the engine's `fonts_list`,
// `fonts_add` and `fonts_remove`. The commands are passed in (`ask`), so this
// is pure and runs in Node; `useFonts.js` binds it to the socket. No React.
import { normalizeFont, normalizeFonts } from './fontLibrary.js';

/**
 * @param {object} o
 * @param {(name: string, params?: object) => Promise<any>} o.ask  an engine command
 * @param {(fonts: object[]|null) => void} [o.onList]  the list changed (null: no list)
 */
export function createFontStore({ ask, onList = () => {} }) {
    let state = { status: 'idle', fonts: null, dir: '', maxBytes: 0 };
    let seq = 0;
    const subs = new Set();
    const set = (next) => {
        state = next;
        subs.forEach((f) => {
            try {
                f();
            } catch {
            }
        });
    };

    /** Read the list again. Only the newest answer counts; a failure keeps the list there was. */
    async function refresh() {
        const mine = ++seq;
        set({ ...state, status: state.fonts ? 'ready' : 'loading' });
        try {
            const data = await ask('fonts_list');
            const fonts = normalizeFonts(data);
            if (mine !== seq) return state.fonts;
            if (!fonts) throw new Error('empty font list');
            set({ status: 'ready', fonts, dir: String(data.dir ?? ''), maxBytes: Number(data.max_bytes) || 0 });
            onList(fonts);
        } catch {
            if (mine === seq) set({ ...state, status: 'failed' });
        }
        return state.fonts;
    }

    /** No list (an older engine, or the engine is gone). */
    function reset() {
        seq += 1;
        set({ status: 'idle', fonts: null, dir: '', maxBytes: 0 });
        onList(null);
    }

    /** Add a font file by path. Resolves the new entry; the engine's sentence rejects. */
    async function add(path) {
        const data = await ask('fonts_add', { path });
        const entry = normalizeFont(data?.font);
        await refresh();
        return entry;
    }

    /** Remove one of the creator's fonts. Resolves the removed entry. */
    async function remove(font) {
        const data = await ask('fonts_remove', { font });
        const entry = normalizeFont(data?.font);
        await refresh();
        return entry;
    }

    return {
        get: () => state,
        subscribe(f) {
            subs.add(f);
            return () => subs.delete(f);
        },
        refresh,
        reset,
        add,
        remove,
    };
}
