// The hover preview of a font: a layer and a family the stage draws instead of
// the Look's own, without the Look knowing. Its own tiny store, apart from the
// Look's (no undo step, nothing saved). Pure: no React, no DOM.

/** The Look with the previewed font laid over it, for the stage only. The
 *  Look itself is never changed; with no preview it is the same object. */
export function withFontPreview(look, preview) {
    if (!preview || (preview.layer !== 'captions' && preview.layer !== 'headline') || !preview.font) return look;
    return { ...look, [preview.layer]: { ...(look?.[preview.layer] ?? {}), font: preview.font } };
}

export function createFontPreview() {
    let cur = null;
    const subs = new Set();
    const put = (next) => {
        if (next === cur || (next && cur && next.layer === cur.layer && next.font === cur.font)) return;
        cur = next;
        subs.forEach((f) => f());
    };
    return {
        get: () => cur,
        subscribe(f) {
            subs.add(f);
            return () => subs.delete(f);
        },
        /** Preview `font` on `layer` (`captions` or `headline`). */
        show: (layer, font) => put({ layer, font }),
        /** Back to the Look's own. */
        clear: () => put(null),
    };
}
