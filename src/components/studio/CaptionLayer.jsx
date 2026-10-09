import { Fragment, useMemo } from 'react';
import { alphaOf, cssColour, cssRgb, rgbOf } from '../../lib/alpha';
import { cssFont } from '../../lib/fontNames';
import { fontBox, keywordBump, lineMotion, outlineRing, rgba, wordReveal } from '../../lib/captionStyles';
import { GLYPH_MARK, RING_MARK, strokeCut } from '../../lib/strokeCut';
import { RingFilters, ringFilter } from './RingCut';
import { useClock } from './usePlayer';
import WordCaption from './WordCaption';

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
 *
 * A Look with none of the v2 caption fields is drawn here, one line at a
 * time, as it always was. Any v2 field hands the caption to `WordCaption`,
 * which lays it out and moves it word by word like the engine's word-level
 * writer.
 */
export default function CaptionLayer(props) {
    return props.r.wordLevel ? <WordCaption {...props} /> : <LineCaption {...props} />;
}

function LineCaption({ r, lines, clock, reduced }) {
    const time = useClock(clock);
    const fb = useMemo(() => fontBox(r.font, r.fontPx), [r.font, r.fontPx]);
    const style = useMemo(() => {
        const width = r.outline && r.outline.width > 0 ? r.outline.width : 0;
        const strokeRgb = r.outline ? rgbOf(r.outline.color) : null;
        const strokeCol = strokeRgb ? cssRgb(strokeRgb) : null;
        const shadowCol = cssRgb(rgbOf(r.shadowColor));
        return {
            // A box's own shadow is the box's shape; without one it is a copy of the type.
            boxShadow: r.box && r.shadow > 0 ? `drop-shadow(${r.shadow}px ${r.shadow}px 0 ${rgba(r.shadowColor, r.shadowOpacity)})` : undefined,
            shadow: !r.box && r.shadow > 0 ? { col: shadowCol, off: r.shadow, a: alphaOf(r.shadowColor) * r.shadowOpacity, ring: width ? outlineRing(width, shadowCol) : undefined } : null,
            // The stroke is a copy of the type in its colour with a ring round it; where a
            // see-through fill is over it, the copy is painted in the marker colours and
            // cut to the ring alone (`strokeCut`).
            stroke: width ? { rgb: strokeRgb, col: strokeCol, a: alphaOf(r.outline.color), ring: outlineRing(width, strokeCol), mark: outlineRing(width, RING_MARK) } : null,
        };
    }, [r.shadow, r.shadowColor, r.shadowOpacity, r.outline, r.box]);

    if (!r.show) return null;
    const line = lines.find((l) => time >= l.t0 && time < l.t1);
    if (!line) return null;

    const local = (time - line.t0) * 1000;
    const dur = (line.t1 - line.t0) * 1000;
    const m = reduced ? STILL : lineMotion(r.anim, local, dur, r.h);
    const bottom = r.anchor.mode === 'bottom';
    // The line's fade and the element's opacity, on every part (text has no group
    // opacity; what a see-through fill shows is the part's own, see `strokeCut`).
    const fade = m.opacity * r.opacity;

    const outer = {
        position: 'absolute',
        left: r.anchor.x - r.wrapW / 2,
        width: r.wrapW,
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
        fontFamily: `${cssFont(r.font)}, sans-serif`,
        fontSize: fb.em,
        lineHeight: `${fb.lineH}px`,
        textAlign: 'center',
        textWrap: 'balance',
        whiteSpace: 'normal',
        fontWeight: 400,
    };

    const box = r.box;
    const pad = box ? box.pad : 0;
    // The box layer and the text layers wrap the same words in the same
    // padded runs, so they break lines in the same places.
    const run = (extra) => ({
        paddingLeft: pad,
        paddingRight: pad,
        WebkitBoxDecorationBreak: 'clone',
        boxDecorationBreak: 'clone',
        ...extra,
    });

    const first = line.words[0].s;
    /** Each word's reveal (later words fade in under the 'words' animation). */
    const reveals = line.words.map((w, i) => (reduced ? 1 : wordReveal(r.anim, i, (w.s - first) * 1000, local)));
    // The stroke is cut under the letters when any fill over it is see-through:
    // a fill colour's own opacity x the word's reveal x the line's fade.
    const cut = style.stroke ? strokeCut(...[r.color, r.active, r.accent].flatMap((c) => reveals.map((a) => alphaOf(c) * a * fade))) : false;
    /** The line's words in one layer: `paint(spoken, key)` is the colour of a word
     *  (its part's own opacity included), `ring` its stroke ring, `group`
     *  whether the layer carries the word's reveal as an opacity of its own
     *  (a single-colour layer) or the colour already holds it. */
    const words = (paint, ring, group) => line.words.map((w, i) => {
        const spoken = time >= w.k;
        const dt = (w.s - first) * 1000;
        const alpha = reveals[i];
        const bump = !reduced && w.key ? keywordBump(r.anim, dt, (time - w.s) * 1000) : 1;
        const s = { color: paint(spoken, w.key, alpha) };
        if (ring) s.textShadow = ring;
        if (group && alpha !== 1) s.opacity = alpha;
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
    const layer = { gridArea: '1 / 1', position: 'relative' };

    return (
        <div style={outer} aria-hidden>
            <div style={type}>
                {box && (
                    <div style={{ gridArea: '1 / 1', filter: style.boxShadow }}>
                        <span
                            style={run({
                                backgroundColor: cssColour(box.color, box.opacity, fade),
                                color: 'transparent',
                                paddingTop: fb.padAbove + pad,
                                paddingBottom: fb.padBelow + pad,
                            })}
                        >
                            {line.words.map((w) => w.text).join(' ')}
                        </span>
                    </div>
                )}
                {style.shadow && (
                    <div style={{ ...layer, opacity: style.shadow.a * fade, transform: `translate(${style.shadow.off}px, ${style.shadow.off}px)` }}>
                        {words(() => style.shadow.col, style.shadow.ring, true)}
                    </div>
                )}
                {style.stroke && (
                    <div style={{ ...layer, opacity: style.stroke.a * fade, filter: cut ? ringFilter(style.stroke.rgb) : undefined }}>
                        {words(() => (cut ? GLYPH_MARK : style.stroke.col), cut ? style.stroke.mark : style.stroke.ring, true)}
                    </div>
                )}
                <div style={layer}>
                    {(() => {
                        const fill = words((spoken, key, alpha) => cssColour(spoken ? (key ? r.accent : r.active) : r.color, fade, alpha), undefined, false);
                        return box ? <span style={run({})}>{fill}</span> : fill;
                    })()}
                </div>
            </div>
            {cut && <RingFilters colours={[style.stroke.rgb]} />}
        </div>
    );
}
