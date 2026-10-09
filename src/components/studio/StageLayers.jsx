import { Fragment, useLayoutEffect, useMemo, useRef } from 'react';
import { alphaOf, cssColour, cssRgb, rgbOf } from '../../lib/alpha';
import { cssFont } from '../../lib/fontNames';
import { fontBox, outlineRing } from '../../lib/captionStyles';
import { GLYPH_MARK, RING_MARK, strokeCut } from '../../lib/strokeCut';
import { RingFilters, ringFilter } from './RingCut';
import { blockExtent, cfgOf, planFor } from '../../lib/captionMotion';
import { headlineMotion } from '../../lib/layers';
import { blockAt } from '../../lib/stageTime';
import { useClock, useClockPick } from './usePlayer';

const STILL = { opacity: 1, scale: 1 };

/** Report an element's layout size (engine pixels: the frame is scaled as
 *  a whole, offset sizes ignore that) when it changes. */
function useSize(ref, onSize, deps) {
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !onSize) return undefined;
        const report = () => onSize({ w: el.offsetWidth, h: el.offsetHeight });
        report();
        const ro = new ResizeObserver(report);
        ro.observe(el);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}

/**
 * The headline as it was before the Look gave it more fields (a v2 headline
 * is drawn by `WordCaption`, see Stage), drawn in engine pixels: the card (or outlined type), two
 * balanced lines, one accent word, and the entrance and fade-out the engine
 * gives it. It is always laid out (so it can be measured and selected) and
 * only its opacity says whether it is up at this moment of the sample.
 */
export function HeadlineLayer({ r, clock, len, reduced, onSize }) {
    const time = useClock(clock);
    const fb = useMemo(() => fontBox(r.font, r.fontPx), [r.font, r.fontPx]);
    const ring = useMemo(() => {
        if (!r.outline) return undefined;
        const rgb = rgbOf(r.outline.color);
        return { rgb, plain: outlineRing(r.outline.width, cssRgb(rgb)), mark: outlineRing(r.outline.width, RING_MARK) };
    }, [r.outline]);
    const ref = useRef(null);
    useSize(ref, onSize, [r.font, r.fontPx, r.text, r.wrapW, r.edgeW, r.noCard]);

    const m = headlineMotion(r, time * 1000, len * 1000);
    const live = m ? (reduced ? STILL : m) : null;
    // The fade and the element's opacity, on every part (the card and the type each
    // carry it: the type has no group opacity).
    const fade = live ? live.opacity * r.opacity : 0;
    // The outline is a ring round the letters and is cut away under them, so a
    // see-through ink (or one that is fading) shows what lies under the letters,
    // the card or the picture, and never the outline. Only then is it cut.
    const cut = !!ring && strokeCut(alphaOf(r.ink) * fade, alphaOf(r.accent) * fade);
    const pad = r.card ? r.card.pad : 0;
    const boxH = r.block + 2 * pad;
    const outer = {
        position: 'absolute',
        left: r.cx,
        top: r.cy - boxH / 2,
        width: 'max-content',
        maxWidth: r.wrapW + 2 * pad,
        boxSizing: 'border-box',
        pointerEvents: 'none',
        userSelect: 'none',
        transformOrigin: r.originTop ? `50% ${pad}px` : '50% 50%',
        transform: `translateX(-50%) scale(${live ? live.scale : 1})`,
    };
    const type = {
        top: fb.shiftY,
        fontFamily: `${cssFont(r.font)}, sans-serif`,
        fontSize: fb.em,
        lineHeight: `${fb.lineH}px`,
        textAlign: 'center',
        whiteSpace: 'normal',
        fontWeight: 400,
    };
    /** The two lines of words; `paint(colour)` is a word's colour, `textShadow` the ring. */
    const rows = (paint, textShadow) => r.lines.map((line, i) => (
        <div key={i}>
            {line.map((w, j) => (
                <Fragment key={j}>
                    {j > 0 && ' '}
                    <span style={{ color: paint(w.accent ? r.accent : r.ink), textShadow }}>{w.text}</span>
                </Fragment>
            ))}
        </div>
    ));
    return (
        <div ref={ref} style={{ ...outer, backgroundColor: r.card ? cssColour(r.card.color, fade) : undefined, padding: pad }} aria-hidden>
            <div style={{ position: 'relative' }}>
                {ring && (
                    // The outline, under the type: a ring round the letters, at its own opacity
                    // and nothing under the letters themselves.
                    <div style={{ ...type, position: 'absolute', left: 0, right: 0, opacity: alphaOf(r.outline.color) * fade, filter: cut ? ringFilter(ring.rgb) : undefined }}>
                        {rows(() => (cut ? GLYPH_MARK : cssRgb(ring.rgb)), cut ? ring.mark : ring.plain)}
                    </div>
                )}
                <div style={{ ...type, position: 'relative' }}>{rows((c) => cssColour(c, fade))}</div>
            </div>
            {cut && <RingFilters colours={[ring.rgb]} />}
        </div>
    );
}

/**
 * An invisible copy of the caption block on screen (between lines, the
 * nearest one), laid out exactly like the real one, so the stage knows how
 * big the caption is at the playhead (for its selection box).
 */
export function CaptionProbe(props) {
    return props.r.wordLevel ? <WordProbe {...props} /> : <LineProbe {...props} />;
}

/** The word-level caption's size comes from its layout, not the DOM: the
 *  block at the playhead (rows, boxes, stroke, tilt) and its row height. */
function WordProbe({ r, lines, clock, measure, onSize }) {
    const picked = useClockPick(clock, (t) => blockAt(lines, t));
    const ext = useMemo(() => {
        const cfg = cfgOf(r);
        let block = picked;
        if (!block) {
            const w = (text, s, e) => ({ text, raw: text, s, e, key: false });
            const up = (x) => (r.caps ? x.toUpperCase() : x);
            block = { t0: 0, t1: 1, words: [w(up('Stop'), 0, 0.4), w(up('scrolling'), 0.4, 0.9)] };
        }
        const e = blockExtent(planFor(cfg, r, block, measure), r);
        return { w: e.w, h: e.h, bh: e.bh };
    }, [r, picked, measure]);
    useLayoutEffect(() => {
        onSize?.(ext);
    }, [ext, onSize]);
    return null;
}

function LineProbe({ r, lines, clock, onSize }) {
    const fb = useMemo(() => fontBox(r.font, r.fontPx), [r.font, r.fontPx]);
    const picked = useClockPick(clock, (t) => blockAt(lines, t));
    const text = useMemo(
        () => (picked ? picked.words.map((w) => w.text).join(' ') : (r.caps ? 'STOP SCROLLING' : 'Stop scrolling')),
        [picked, r.caps],
    );
    const ref = useRef(null);
    useSize(ref, onSize, [r.font, r.fontPx, r.wrapW, r.box?.pad, text]);
    const pad = r.box ? r.box.pad : 0;
    return (
        <div aria-hidden style={{ position: 'absolute', left: r.anchor.x - r.wrapW / 2, top: 0, width: r.wrapW, display: 'flex', justifyContent: 'center', visibility: 'hidden', pointerEvents: 'none' }}>
            <span
                ref={ref}
                style={{
                    display: 'inline-block',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    padding: pad,
                    fontFamily: `${cssFont(r.font)}, sans-serif`,
                    fontSize: fb.em,
                    lineHeight: `${fb.lineH}px`,
                    textAlign: 'center',
                    textWrap: 'balance',
                }}
            >
                {text}
            </span>
        </div>
    );
}
