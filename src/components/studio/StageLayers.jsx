import { Fragment, useLayoutEffect, useMemo, useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { fontBox, outlineRing } from '../../lib/captionStyles';
import { blockExtent, cfgOf, planFor } from '../../lib/captionMotion';
import { headlineMotion } from '../../lib/layers';
import { baseName } from '../digiclip/JobOptions';
import { useClock } from './usePlayer';

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
 * The headline, drawn in engine pixels: the card (or outlined type), two
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

/** The progress bar: the engine's dimmed track with the fill up to the
 *  playhead's place in the sample. */
export function BarLayer({ r, clock, len }) {
    const time = useClock(clock);
    const fill = r.fill(len > 0 ? time / len : 0);
    return (
        <div aria-hidden style={{ position: 'absolute', left: 0, top: r.y, width: r.w, height: r.thickness, background: 'rgb(0 0 0 / 0.55)', pointerEvents: 'none' }}>
            <div style={{ width: fill, height: '100%', background: r.color }} />
        </div>
    );
}

/** The logo. The image itself cannot be read here (the app has no
 *  permission to load a local file into the page), so a neutral box of the
 *  engine's size stands in, with the file's name. */
export function LogoLayer({ r, file }) {
    const { w, h } = r.box;
    const unit = Math.min(w, h);
    return (
        <div
            aria-hidden
            style={{
                position: 'absolute',
                left: r.x,
                top: r.y,
                width: w,
                height: h,
                boxSizing: 'border-box',
                opacity: r.opacity,
                pointerEvents: 'none',
                userSelect: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: unit * 0.06,
                padding: unit * 0.06,
                border: `${Math.max(2, unit * 0.02)}px dashed rgb(255 255 255 / 0.5)`,
                background: 'rgb(255 255 255 / 0.12)',
                color: 'rgb(255 255 255 / 0.8)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: Math.max(10, unit * 0.1),
                lineHeight: 1.2,
            }}
        >
            <ImagePlus size={Math.max(12, unit * 0.28)} strokeWidth={1.5} />
            <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{baseName(file)}</span>
        </div>
    );
}

/**
 * An invisible copy of the widest caption line, laid out exactly like the
 * real one, so the stage knows how big the caption block is even between
 * lines (for its selection box).
 */
export function CaptionProbe(props) {
    return props.r.wordLevel ? <WordProbe {...props} /> : <LineProbe {...props} />;
}

/** The word-level caption's size comes from its layout, not the DOM: the
 *  biggest block of the sample (rows, boxes, stroke, tilt) and its row height. */
function WordProbe({ r, lines, measure, onSize }) {
    const ext = useMemo(() => {
        const cfg = cfgOf(r);
        let blocks = lines;
        if (!blocks.length) {
            const w = (text, s, e) => ({ text, raw: text, s, e, key: false });
            const up = (x) => (r.caps ? x.toUpperCase() : x);
            blocks = [{ t0: 0, t1: 1, words: [w(up('Stop'), 0, 0.4), w(up('scrolling'), 0.4, 0.9)] }];
        }
        let out = { w: 0, h: 0, bh: 0 };
        for (const b of blocks) {
            const e = blockExtent(planFor(cfg, r, b, measure), r);
            out = { w: Math.max(out.w, e.w), h: Math.max(out.h, e.h), bh: Math.max(out.bh, e.bh) };
        }
        return out;
    }, [r, lines, measure]);
    useLayoutEffect(() => {
        onSize?.(ext);
    }, [ext, onSize]);
    return null;
}

function LineProbe({ r, lines, onSize }) {
    const fb = useMemo(() => fontBox(r.font, r.fontPx), [r.font, r.fontPx]);
    const text = useMemo(() => {
        let best = '';
        for (const l of lines) {
            const s = l.words.map((w) => w.text).join(' ');
            if (s.length > best.length) best = s;
        }
        return best || (r.caps ? 'STOP SCROLLING' : 'Stop scrolling');
    }, [lines, r.caps]);
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
