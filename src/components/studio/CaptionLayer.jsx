import { Fragment, useMemo } from 'react';
import { fontBox, keywordBump, lineMotion, outlineRing, rgba, wordReveal } from '../../lib/captionStyles';
import { useClock } from './usePlayer';

const STILL = { opacity: 1, scale: 1, dy: 0 };

/** Does the user ask the system for less motion? */
export function prefersReducedMotion() {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

/**
 * The caption block, drawn in engine pixels (the frame is laid out at the
 * canvas's real size and scaled as a whole). Placement, wrap width, type
 * size, colours, outline, shadow and box come from `resolveCaptions`; the
 * line's entrance is evaluated from the engine's timings every frame
 * rather than with CSS keyframes, so a scrub or a pause shows exactly the
 * phase the burned-in video would have at that moment.
 *
 * `lines` are `captionLines()` output; `reduced` cuts the motion to none
 * (the words still switch colour in time).
 */
export default function CaptionLayer({ r, lines, clock, reduced }) {
    const time = useClock(clock);
    const fb = useMemo(() => fontBox(r.font, r.fontPx), [r.font, r.fontPx]);
    const style = useMemo(() => {
        const shadow = r.shadow > 0
            ? `drop-shadow(${r.shadow}px ${r.shadow}px 0 ${rgba(r.shadowColor, r.shadowOpacity)})`
            : undefined;
        const ring = r.outline && r.outline.width > 0 ? outlineRing(r.outline.width, r.outline.color) : undefined;
        return { shadow, ring };
    }, [r.shadow, r.shadowColor, r.shadowOpacity, r.outline]);

    if (!r.show) return null;
    const line = lines.find((l) => time >= l.t0 && time < l.t1);
    if (!line) return null;

    const local = (time - line.t0) * 1000;
    const dur = (line.t1 - line.t0) * 1000;
    const m = reduced ? STILL : lineMotion(r.anim, local, dur, r.h);
    const bottom = r.anchor.mode === 'bottom';

    const outer = {
        position: 'absolute',
        left: r.anchor.x - r.wrapW / 2,
        width: r.wrapW,
        opacity: m.opacity,
        pointerEvents: 'none',
        userSelect: 'none',
        transformOrigin: bottom ? '50% 100%' : '50% 50%',
        transform: `${bottom ? '' : 'translateY(-50%) '}translateY(${m.dy}px) scale(${m.scale})`,
        ...(bottom ? { bottom: r.h - r.anchor.y } : { top: r.anchor.y }),
    };
    const type = {
        position: 'relative',
        top: fb.shiftY,
        display: 'grid',
        fontFamily: `'${r.font}', sans-serif`,
        fontSize: fb.em,
        lineHeight: `${fb.lineH}px`,
        textAlign: 'center',
        textWrap: 'balance',
        whiteSpace: 'normal',
        fontWeight: 400,
    };

    const box = r.box;
    const pad = box ? box.pad : 0;
    // The box layer and the text layer wrap the same words in the same
    // padded runs, so they break lines in the same places.
    const run = (extra) => ({
        paddingLeft: pad,
        paddingRight: pad,
        WebkitBoxDecorationBreak: 'clone',
        boxDecorationBreak: 'clone',
        ...extra,
    });

    const first = line.words[0].s;
    const words = line.words.map((w, i) => {
        const spoken = time >= w.k;
        const dt = (w.s - first) * 1000;
        const color = spoken ? (w.key ? r.accent : r.active) : r.color;
        const alpha = reduced ? 1 : wordReveal(r.anim, i, dt, local);
        const bump = !reduced && w.key ? keywordBump(r.anim, dt, (time - w.s) * 1000) : 1;
        const s = { color };
        if (style.ring) s.textShadow = style.ring;
        if (alpha !== 1) s.opacity = alpha;
        if (bump !== 1) {
            s.display = 'inline-block';
            s.transform = `scale(${bump})`;
            s.transformOrigin = '50% 70%';
        }
        return (
            <Fragment key={i}>
                {i > 0 && ' '}
                <span style={s}>{w.text}</span>
            </Fragment>
        );
    });

    return (
        <div style={outer} aria-hidden>
            <div style={type}>
                {box && (
                    <div style={{ gridArea: '1 / 1', opacity: box.opacity, filter: style.shadow }}>
                        <span
                            style={run({
                                backgroundColor: box.color,
                                color: 'transparent',
                                paddingTop: fb.padAbove + pad,
                                paddingBottom: fb.padBelow + pad,
                            })}
                        >
                            {line.words.map((w) => w.text).join(' ')}
                        </span>
                    </div>
                )}
                <div style={{ gridArea: '1 / 1', position: 'relative', filter: box ? undefined : style.shadow }}>
                    {box ? <span style={run({})}>{words}</span> : words}
                </div>
            </div>
        </div>
    );
}
