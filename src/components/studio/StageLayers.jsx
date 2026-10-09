import { Fragment, useLayoutEffect, useMemo, useRef } from 'react';
import { fontBox, outlineRing } from '../../lib/captionStyles';
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
    const ring = useMemo(() => (r.outline ? outlineRing(r.outline.width, r.outline.color) : undefined), [r.outline]);
    const ref = useRef(null);
    useSize(ref, onSize, [r.font, r.fontPx, r.text, r.wrapW, r.edgeW, r.noCard]);

    const m = headlineMotion(r, time * 1000, len * 1000);
    const live = m ? (reduced ? STILL : m) : null;
    const pad = r.card ? r.card.pad : 0;
    const boxH = r.block + 2 * pad;
    const outer = {
        position: 'absolute',
        left: r.cx,
        top: r.cy - boxH / 2,
        width: 'max-content',
        maxWidth: r.wrapW + 2 * pad,
        boxSizing: 'border-box',
        opacity: live ? live.opacity : 0,
        pointerEvents: 'none',
        userSelect: 'none',
        transformOrigin: r.originTop ? `50% ${pad}px` : '50% 50%',
        transform: `translateX(-50%) scale(${live ? live.scale : 1})`,
    };
    return (
        <div ref={ref} style={{ ...outer, backgroundColor: r.card ? r.card.color : undefined, padding: pad }} aria-hidden>
            <div
                style={{
                    position: 'relative',
                    top: fb.shiftY,
                    fontFamily: `'${r.font}', sans-serif`,
                    fontSize: fb.em,
                    lineHeight: `${fb.lineH}px`,
                    textAlign: 'center',
                    whiteSpace: 'normal',
                    fontWeight: 400,
                    color: r.ink,
                    textShadow: ring,
                }}
            >
                {r.lines.map((line, i) => (
                    <div key={i}>
                        {line.map((w, j) => (
                            <Fragment key={j}>
                                {j > 0 && ' '}
                                <span style={w.accent ? { color: r.accent } : undefined}>{w.text}</span>
                            </Fragment>
                        ))}
                    </div>
                ))}
            </div>
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
                    fontFamily: `'${r.font}', sans-serif`,
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
