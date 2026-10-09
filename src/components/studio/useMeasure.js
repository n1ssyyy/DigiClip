import { useEffect, useMemo, useState } from 'react';
import { FONTS, fontBox } from '../../lib/captionStyles';
import { cssFont } from '../../lib/fontNames';
import { useFontVersion } from './useFonts';
import { flatMeasure } from '../../lib/captionMotion';

let ctx;
function context() {
    if (ctx === undefined) {
        try {
            ctx = document.createElement('canvas').getContext('2d');
        } catch {
            ctx = null;
        }
    }
    return ctx;
}

/**
 * Measure text the way the engine does (`metrics.rs`): the advance of the
 * glyphs at the type size libass would use, with no kerning, and the ink's
 * reach (above and below the baseline, never under the cap height) and side
 * bearings, which the engine reads from the glyph outlines and a canvas
 * reads from the glyph bounds. Results are remembered per font, size, text.
 */
export function createCanvasMeasure() {
    const c = context();
    if (!c) return flatMeasure();
    const memo = new Map();
    const caps = new Map();
    const setFont = (font, fontPx) => {
        c.font = `${fontBox(font, fontPx).em}px ${cssFont(font)}`;
        try {
            c.fontKerning = 'none';
            c.letterSpacing = '0px';
        } catch {
        }
        c.textAlign = 'left';
        c.textBaseline = 'alphabetic';
    };
    const capHeight = (font, fontPx) => {
        const key = `${font}|${fontPx}`;
        let v = caps.get(key);
        if (v === undefined) {
            setFont(font, fontPx);
            v = c.measureText('H').actualBoundingBoxAscent || 0.72 * fontPx;
            caps.set(key, v);
        }
        return v;
    };
    return (text, font, fontPx) => {
        const key = `${font}|${fontPx}|${text}`;
        let m = memo.get(key);
        if (m) return m;
        setFont(font, fontPx);
        const t = c.measureText(text);
        const ink = t.actualBoundingBoxAscent + t.actualBoundingBoxDescent > 0 && text.trim() !== '';
        m = {
            w: t.width,
            top: ink ? Math.max(t.actualBoundingBoxAscent, capHeight(font, fontPx)) : 0.72 * fontPx,
            bottom: ink ? Math.min(0, -t.actualBoundingBoxDescent) : 0,
            lsb: ink ? Math.max(0, -t.actualBoundingBoxLeft) : 0,
            rsb: ink ? Math.max(0, t.width - t.actualBoundingBoxRight) : 0,
        };
        if (memo.size > 4000) memo.clear();
        memo.set(key, m);
        return m;
    };
}

/** A text measure that is renewed when the caption fonts finish loading
 *  (until then a canvas would measure the fallback face) and whenever a font
 *  face arrives from the engine or leaves (the stage only draws a face that
 *  has loaded, so what it measures is what it draws). */
export function useMeasure() {
    const [ver, setVer] = useState(0);
    const faces = useFontVersion();
    useEffect(() => {
        let dead = false;
        const bump = () => {
            if (!dead) setVer((v) => v + 1);
        };
        const fonts = typeof document !== 'undefined' ? document.fonts : null;
        if (fonts) {
            try {
                Promise.all(FONTS.map((f) => fonts.load(`40px ${cssFont(f)}`))).then(bump, bump);
                fonts.addEventListener?.('loadingdone', bump);
            } catch {
            }
        }
        return () => {
            dead = true;
            fonts?.removeEventListener?.('loadingdone', bump);
        };
    }, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => createCanvasMeasure(), [ver, faces]);
}
