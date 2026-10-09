import { useMemo } from 'react';
import { alphaOf, cssColour, cssRgb, rgbOf } from '../../lib/alpha';
import { cssFont } from '../../lib/fontNames';
import { fontBox, rgba } from '../../lib/captionStyles';
import { cfgOf, frameAt, glowParams, planFor } from '../../lib/captionMotion';
import { GLYPH_MARK, RING_MARK, strokeCut } from '../../lib/strokeCut';
import { RingFilters, ringFilter } from './RingCut';
import { useClock } from './usePlayer';

const rnd = (v, d = 1000) => Math.round(v * d) / d;
/** CSS for an `[r, g, b]` colour at opacity `a`. */
const css = (c, a = 1) => cssRgb(c, a);

const rings = new Map();
/** Text-shadow ring that draws a solid border `r` px wide around glyphs
 *  (libass' `\bord`); remembered, since the strings are long. */
function ring(r, color) {
    if (!(r > 0.05)) return undefined;
    const n = Math.max(r > 4 ? 24 : r > 2 ? 16 : 8, r > 12 ? Math.min(48, Math.ceil(r * 1.5)) : 0);
    const key = `${rnd(r, 20)}|${color}`;
    let s = rings.get(key);
    if (s === undefined) {
        const parts = [];
        for (let i = 0; i < n; i++) {
            const a = (2 * Math.PI * i) / n;
            parts.push(`${(Math.cos(a) * r).toFixed(2)}px ${(Math.sin(a) * r).toFixed(2)}px 0 ${color}`);
        }
        s = parts.join(',');
        if (rings.size > 600) rings.clear();
        rings.set(key, s);
    }
    return s;
}

const blurOf = (b) => (b > 0.05 ? `blur(${rnd(b, 100)}px)` : '');
const join = (...f) => f.filter(Boolean).join(' ') || undefined;

/** Move, turn and scale one word about its own centre: the lift is a
 *  screen-vertical move, so inside the tilted block it is turned back by
 *  the tilt. `shift` is a screen offset (a shadow's). */
function wordTransform(st, plan, shift) {
    const th = (plan.tilt * Math.PI) / 180;
    const sin = Math.sin(th);
    const cos = Math.cos(th);
    const lift = st.lift * plan.size;
    let x = -lift * sin;
    let y = -lift * cos;
    if (shift) {
        x += shift[0] * cos + shift[1] * sin;
        y += -shift[0] * sin + shift[1] * cos;
    }
    const parts = [];
    if (Math.abs(x) > 0.01 || Math.abs(y) > 0.01) parts.push(`translate(${rnd(x, 100)}px, ${rnd(y, 100)}px)`);
    if (Math.abs(st.rot) > 0.005) parts.push(`rotate(${rnd(st.rot, 100)}deg)`);
    if (Math.abs(st.sc - 1) > 0.0005) parts.push(`scale(${rnd(st.sc, 10000)})`);
    return parts.length ? parts.join(' ') : undefined;
}

/**
 * The caption block drawn word by word, the way the engine's word-level
 * writer lays it out: every word in its own slot (so a neighbour never
 * moves when a word scales, lifts or tilts), its look read off the engine's
 * timeline at the playhead, the line's entrance and exit on the block, and
 * the dressing (box, shadow, glow, stroke, text) in the engine's layer order.
 * All of it is evaluated from the clock on each tick; nothing is a CSS
 * transition.
 *
 * Opacity is straight alpha, one product per part and no group opacity for
 * text: a part's own colour opacity x its state's opacity x the line's
 * entrance and exit fade x the element's opacity (`r.opacity`). A part is one
 * layer (a layer of a single colour may carry its product as its `opacity`).
 * What lies under a half-transparent fill shows through it, as in the real
 * render: the picture, the box, and the shadow and glow, whole copies of the
 * glyph. The stroke does not: libass draws it as a ring round the glyph and
 * cuts it away under the glyph, so where a fill is see-through the stroke
 * layer is cut to its ring (`strokeCut`, an SVG filter, see `RingCut`).
 */
export default function WordCaption({ r, lines, clock, reduced, measure }) {
    const time = useClock(clock);
    const cfg = useMemo(() => cfgOf(r), [r]);
    const fb = useMemo(() => fontBox(r.font, r.fontPx), [r.font, r.fontPx]);
    if (!r.show) return null;
    const block = lines.find((l) => time >= l.t0 && time < l.t1);
    if (!block) return null;
    const plan = planFor(cfg, r, block, measure);
    const { groups } = frameAt(plan, time * 1000, { reduced });
    if (!groups.length) return null;

    const { size, spc, centre } = plan;
    const type = {
        position: 'absolute',
        fontFamily: `${cssFont(r.font)}, sans-serif`,
        fontSize: fb.em,
        lineHeight: `${size}px`,
        letterSpacing: spc ? `${rnd(spc, 100)}px` : undefined,
        whiteSpace: 'nowrap',
        textAlign: 'center',
        fontWeight: 400,
        pointerEvents: 'none',
        userSelect: 'none',
    };
    // The style's own shadow (a hard copy under the text) and its colour.
    const styleShadow = r.shadow > 0 && !r.box
        ? { off: r.shadow, col: cssRgb(rgbOf(r.shadowColor)), a: alphaOf(r.shadowColor) * r.shadowOpacity }
        : null;
    const ringColours = [];
    const boxShadow = r.shadow > 0 && r.box ? `drop-shadow(${r.shadow}px ${r.shadow}px 0 ${rgba(r.shadowColor, r.shadowOpacity)})` : '';

    // Where a word's text sits: centred on its slot's middle, the ink (not the
    // trailing letter space) on it, baseline where libass puts it.
    const placed = (w, extra) => {
        const left = w.pos[0] - (w.width - spc) / 2;
        const top = w.pos[1] - size / 2 + fb.shiftY;
        return {
            ...type,
            left,
            top,
            width: w.width,
            height: size,
            transformOrigin: `${(w.width - spc) / 2}px ${size / 2 - fb.shiftY}px`,
            ...extra,
        };
    };
    // A rectangle of its own that follows a word about the word's centre.
    const around = (w, rect, extra) => ({
        position: 'absolute',
        left: w.pos[0] + rect.ax - rect.w / 2,
        top: w.pos[1] + rect.ay - rect.h / 2,
        width: rect.w,
        height: rect.h,
        borderRadius: rect.radius,
        transformOrigin: `${rect.w / 2 - rect.ax}px ${rect.h / 2 - rect.ay}px`,
        pointerEvents: 'none',
        ...extra,
    });

    return (
        <div aria-hidden>
            {groups.map((g, gi) => {
                const lf = g.fx;
                // The line's fade and the element's opacity, on every part.
                const fade = lf.alpha * cfg.elem;
                const parts = [];
                if (Math.abs(lf.dx) > 0.01 || Math.abs(lf.dy) > 0.01) parts.push(`translate(${rnd(lf.dx, 100)}px, ${rnd(lf.dy, 100)}px)`);
                if (Math.abs(lf.sc - 1) > 0.0005) parts.push(`scale(${rnd(lf.sc, 10000)})`);
                if (plan.tilt) parts.push(`rotate(${plan.tilt}deg)`);
                const group = {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: 0,
                    height: 0,
                    pointerEvents: 'none',
                    transformOrigin: `${centre[0]}px ${centre[1]}px`,
                    transform: parts.length ? parts.join(' ') : undefined,
                };
                const out = [];
                const visible = new Set(g.words.map((s) => s.i));
                const of = (st) => plan.words[st.i];

                // 0: boxes. The style's own (or a v1) box, per row; the box
                // object, per row or per word; the spoken word's box.
                if (r.box) {
                    for (const b of plan.boxes.libass) {
                        if (b.word !== undefined && !visible.has(b.word)) continue;
                        out.push(
                            <div
                                key={`l${b.word ?? b.row.from}`}
                                style={{
                                    position: 'absolute',
                                    left: b.cx - b.w / 2 - r.box.pad,
                                    top: b.cy - size / 2 - r.box.pad,
                                    width: b.w + 2 * r.box.pad,
                                    height: size + 2 * r.box.pad,
                                    backgroundColor: cssColour(r.box.color, r.box.opacity, fade),
                                    filter: join(boxShadow, blurOf(lf.blur)),
                                    pointerEvents: 'none',
                                }}
                            />,
                        );
                    }
                }
                if (cfg.boxfx) {
                    const bx = cfg.boxfx;
                    for (const b of plan.boxes.line) {
                        out.push(
                            <div
                                key={`b${b.row.from}`}
                                style={{
                                    position: 'absolute',
                                    left: b.cx - b.w / 2,
                                    top: b.cy - b.h / 2,
                                    width: b.w,
                                    height: b.h,
                                    borderRadius: b.radius,
                                    backgroundColor: css(bx.col, bx.alpha * bx.opacity * fade),
                                    filter: blurOf(lf.blur) || undefined,
                                    pointerEvents: 'none',
                                }}
                            />,
                        );
                    }
                    for (const b of plan.boxes.word) {
                        if (!visible.has(b.word)) continue;
                        const st = g.words.find((s) => s.i === b.word);
                        const w = plan.words[b.word];
                        out.push(
                            <div
                                key={`w${b.word}`}
                                style={around(w, b, {
                                    backgroundColor: css(bx.col, bx.alpha * bx.opacity * st.op * fade),
                                    transform: wordTransform(st, plan),
                                    filter: blurOf(st.blur + lf.blur) || undefined,
                                })}
                            />,
                        );
                    }
                }
                if (cfg.abox) {
                    for (const b of plan.boxes.active) {
                        const st = g.words.find((s) => s.i === b.word);
                        if (!st || !(st.bo > 0.001)) continue;
                        out.push(
                            <div
                                key={`a${b.word}`}
                                style={around(plan.words[b.word], b, {
                                    backgroundColor: css(cfg.abox.col, cfg.abox.alpha * st.bo * fade),
                                    transform: wordTransform(st, plan),
                                    filter: blurOf(st.blur + lf.blur) || undefined,
                                })}
                            />,
                        );
                    }
                }

                // 1: the style's own shadow, a hard copy of the text and its stroke.
                if (styleShadow) {
                    for (const st of g.words) {
                        const w = of(st);
                        const own = wordTransform(st, plan);
                        out.push(
                            <div
                                key={`d${st.i}`}
                                style={placed(w, {
                                    color: styleShadow.col,
                                    textShadow: ring(st.sw, styleShadow.col),
                                    opacity: rnd(styleShadow.a * st.op * fade),
                                    // Local to the word: it turns and scales with it.
                                    transform: join(own, `translate(${rnd(styleShadow.off, 100)}px, ${rnd(styleShadow.off, 100)}px)`),
                                    filter: blurOf(st.blur + lf.blur) || undefined,
                                })}
                            >
                                {w.text}
                            </div>,
                        );
                    }
                }

                // 2: the shadow object, a blurred copy under the text.
                if (cfg.shadow && cfg.shadow.opacity > 0) {
                    const sh = cfg.shadow;
                    const col = css(sh.col);
                    for (const st of g.words) {
                        const w = of(st);
                        out.push(
                            <div
                                key={`s${st.i}`}
                                style={placed(w, {
                                    color: col,
                                    textShadow: ring(st.sw, col),
                                    opacity: rnd(sh.opacity * cfg.shadowA * st.op * fade),
                                    transform: wordTransform(st, plan, [sh.x, sh.y]),
                                    filter: blurOf(sh.blur + st.blur + lf.blur) || undefined,
                                })}
                            >
                                {w.text}
                            </div>,
                        );
                    }
                }

                // 3: the glow, a grown, blurred copy; its strength is its opacity.
                if (cfg.glow || cfg.glowAct || cfg.glowKw) {
                    for (const st of g.words) {
                        if (!(st.gk > 0.001) || !(st.gs > 0.01)) continue;
                        const w = of(st);
                        const col = css(st.gcol);
                        const gp = glowParams(st.gs, st.sw);
                        out.push(
                            <div
                                key={`g${st.i}`}
                                style={placed(w, {
                                    color: col,
                                    textShadow: ring(gp.border, col),
                                    opacity: rnd(st.gk * st.gca * st.op * fade),
                                    transform: wordTransform(st, plan),
                                    filter: blurOf(gp.blur + st.blur + lf.blur) || undefined,
                                })}
                            >
                                {w.text}
                            </div>,
                        );
                    }
                }

                // 4: the stroke, a ring round the glyph in the stroke's colour and
                // nothing under the glyph itself: where a fill over it is see-through
                // the copy is painted in the marker colours (glyph red, ring black) and
                // the filter keeps the ring only; under a solid fill the plain copy
                // (the text grown by its width) is the same picture and cheaper.
                for (const st of g.words) {
                    if (!(st.sw > 0.05)) continue;
                    const w = of(st);
                    const a = st.op * fade;
                    const cut = strokeCut(...(st.sweep !== null ? [st.underA * a, st.ca * a] : [(st.under ? st.underA : st.ca) * a]));
                    const col = css(st.scol);
                    if (cut) ringColours.push(st.scol);
                    out.push(
                        <div
                            key={`k${st.i}`}
                            style={placed(w, {
                                color: cut ? GLYPH_MARK : col,
                                textShadow: ring(st.sw, cut ? RING_MARK : col),
                                opacity: rnd(st.sca * a),
                                transform: wordTransform(st, plan),
                                filter: join(cut ? ringFilter(st.scol) : '', blurOf(st.blur + lf.blur)),
                            })}
                        >
                            {w.text}
                        </div>,
                    );
                }

                // 5: the words. Under a sweep the unswept part and the swept part
                // are each clipped to their own side, so a clear fill never doubles.
                for (const st of g.words) {
                    const w = of(st);
                    const a = st.op * fade;
                    const swept = st.sweep !== null;
                    const sweepStyle = { position: 'absolute', inset: 0, textShadow: 'none' };
                    out.push(
                        <div
                            key={`t${st.i}`}
                            style={placed(w, {
                                color: swept ? 'transparent' : css(st.under ?? st.col, (st.under ? st.underA : st.ca) * a),
                                transform: wordTransform(st, plan),
                                filter: blurOf(st.blur + lf.blur) || undefined,
                            })}
                        >
                            {w.text}
                            {swept && (
                                <>
                                    <span
                                        style={{
                                            ...sweepStyle,
                                            color: css(st.under, st.underA * a),
                                            clipPath: `inset(-30% -10% -30% ${rnd(st.sweep * 100, 100)}%)`,
                                        }}
                                    >
                                        {w.text}
                                    </span>
                                    <span
                                        style={{
                                            ...sweepStyle,
                                            color: css(st.col, st.ca * a),
                                            clipPath: `inset(-30% ${rnd((1 - st.sweep) * 100, 100)}% -30% -10%)`,
                                        }}
                                    >
                                        {w.text}
                                    </span>
                                </>
                            )}
                        </div>,
                    );
                }
                return (
                    <div key={gi} style={group}>
                        {out}
                    </div>
                );
            })}
            <RingFilters colours={ringColours} />
        </div>
    );
}
