import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createFaceLoader } from '../../lib/faceLoader';
import { entriesOf, findFont } from '../../lib/fontLibrary';
import { parseFontMetrics } from '../../lib/fontMetrics';
import { cssFont } from '../../lib/fontNames';
import { createFontPreview } from '../../lib/fontPreview';
import { faceStatus, fontVersion, forgetFace, markFailed, markReady, setInstalled, subscribeFonts } from '../../lib/fontState';
import { createFontStore } from '../../lib/fontStore';
import { cmd, fontUrl, useStore } from '../../lib/socket';

// The page side of the font library: the engine's list (one store), the faces
// loaded from the engine's font route with the CSS Font Loading API, and the
// hooks that make the stage re-resolve and re-measure when one arrives. The
// four app fonts are `@font-face` rules in app.css and are never loaded here.

/** family (lower case) -> the `FontFace` this page added for it. */
const faces = new Map();

function dropFace(family) {
    const f = faces.get(family);
    faces.delete(family);
    if (f) {
        try {
            document.fonts.delete(f);
        } catch {
        }
    }
}

/** Fetch one font file, read its metrics and make a face of the same bytes. */
async function loadFace(entry) {
    const url = fontUrl(entry);
    if (!url) throw new Error('the engine address is not known yet');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`font file ${res.status}`);
    const bytes = await res.arrayBuffer();
    const metrics = parseFontMetrics(bytes);
    if (!metrics) throw new Error('not a font the stage can measure');
    const face = new FontFace(cssFont(entry.family), bytes);
    await face.load();
    return { face, metrics };
}

const loader = createFaceLoader({
    load: loadFace,
    onReady(entry, { face, metrics }) {
        const k = entry.family.toLowerCase();
        const old = faces.get(k);
        document.fonts.add(face);
        faces.set(k, face);
        if (old) {
            try {
                document.fonts.delete(old);
            } catch {
            }
        }
        // Metrics first, then the version bump the stage listens to.
        markReady(entry.family, metrics);
    },
    onFailed: (entry) => markFailed(entry.family),
});

export const library = createFontStore({
    ask: (name, params) => cmd(name, params),
    onList(fonts) {
        for (const k of setInstalled(fonts)) {
            dropFace(k);
            loader.forget(k);
        }
        if (fonts) loader.retryFailed();
    },
});

/** Start loading a listed font's face (once); resolves whether it is usable. */
export const ensureFace = (entry) => loader.ensure(entry);

/** A family that has gone: its face and the failure memory too. */
export function forgetFamily(family) {
    dropFace(family.toLowerCase());
    loader.forget(family);
    forgetFace(family);
}

/** The hover preview (its own store; the Look never sees it). */
export const fontPreview = createFontPreview();

/** Changes whenever a face arrives or the list does: re-resolve and re-measure on it. */
export const useFontVersion = () => useSyncExternalStore(subscribeFonts, fontVersion, fontVersion);

export const useFontPreview = () => useSyncExternalStore(fontPreview.subscribe, fontPreview.get, fontPreview.get);

/** The library for a control: the entries (the four bundled ones until the
 *  engine's list is in), and whether the list can tell a missing font. */
export function useFontLibrary() {
    const s = useSyncExternalStore(library.subscribe, library.get, library.get);
    const hasCap = useStore((st) => st.caps.includes('look.fonts'));
    return useMemo(() => ({
        entries: entriesOf(s),
        hasCap,
        status: s.status,
        // Without the ability the four are all there is; with it, the list decides.
        loaded: !hasCap || s.fonts !== null,
    }), [s, hasCap]);
}

/** Studio keeps the list: read when it opens, again after the engine reconnects;
 *  without the ability there is no list. */
export function useFontSync() {
    const hasCap = useStore((st) => st.caps.includes('look.fonts'));
    const conn = useStore((st) => st.conn);
    useEffect(() => {
        if (!hasCap) library.reset();
        else if (conn === 'live') library.refresh();
    }, [hasCap, conn]);
}

/** Load the faces of the fonts a Look uses (and the one being previewed). */
export function useFaces(names) {
    const lib = useFontLibrary();
    const key = names.filter(Boolean).join('\n');
    useEffect(() => {
        for (const n of key.split('\n')) {
            const entry = n ? findFont(lib.entries, n) : null;
            if (entry) ensureFace(entry);
        }
    }, [key, lib.entries]);
}

/** The state of a named font on the stage (re-renders when a face arrives). */
export function useFaceStatus(name) {
    useFontVersion();
    return faceStatus(name);
}
