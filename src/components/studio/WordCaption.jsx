import { useMemo } from 'react';
import { cssFont } from '../../lib/fontNames';
import { fontBox, rgba } from '../../lib/captionStyles';
import { cfgOf, frameAt, glowParams, planFor } from '../../lib/captionMotion';
import { useClock } from './usePlayer';

const rnd = (v, d = 1000) => Math.round(v * d) / d;
const css = (c, a = 1) => `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])} / ${rnd(a)})`;

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
 * the dressing (box, shadow, glow, text) in the engine's layer order. All of
 * it is evaluated from the clock on each tick; nothing is a CSS transition.
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
    const styleShadow = r.shadow > 0 ? `drop-shadow(${r.shadow}px ${r.shadow}px 0 ${rgba(r.shadowColor, r.shadowOpacity)})` : '';

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
                                    backgroundColor: r.box.color,
                                    opacity: rnd(r.box.opacity * lf.alpha),
                                    filter: join(styleShadow, blurOf(lf.blur)),
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
                                    backgroundColor: css(bx.col),
                                    opacity: rnd(bx.opacity * lf.alpha),
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
                                    backgroundColor: css(bx.col),
                                    opacity: rnd(bx.opacity * st.op * lf.alpha),
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
                                    backgroundColor: css(cfg.abox.col),
                                    opacity: rnd(st.bo * lf.alpha),
                                    transform: wordTransform(st, plan),
                                    filter: blurOf(st.blur + lf.blur) || undefined,
                                })}
                            />,
                        );
                    }
                }

                // 1: the shadow object, a blurred copy under the text.
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
                                    opacity: rnd(sh.opacity * st.op * lf.alpha),
                                    transform: wordTransform(st, plan, [sh.x, sh.y]),
                                    filter: blurOf(sh.blur + st.blur + lf.blur) || undefined,
                                })}
                            >
                                {w.text}
                            </div>,
                        );
                    }
                }

                // 2: the glow, a grown, blurred copy; its strength is its opacity.
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
                                    opacity: rnd(st.gk * st.op * lf.alpha),
                                    transform: wordTransform(st, plan),
                                    filter: blurOf(gp.blur + st.blur + lf.blur) || undefined,
                                })}
                            >
                                {w.text}
                            </div>,
                        );
                    }
                }

                // 3: the words.
                for (const st of g.words) {
                    const w = of(st);
                    const stroke = ring(st.sw, css(st.scol));
                    out.push(
                        <div
                            key={`t${st.i}`}
                            style={placed(w, {
                                color: css(st.under ?? st.col),
                                textShadow: stroke,
                                opacity: rnd(st.op * lf.alpha),
                                transform: wordTransform(st, plan),
                                filter: join(r.box ? '' : styleShadow, blurOf(st.blur + lf.blur)),
                            })}
                        >
                            {w.text}
                            {st.sweep !== null && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        color: css(st.col),
                                        textShadow: 'none',
                                        clipPath: `inset(-30% ${rnd((1 - st.sweep) * 100, 100)}% -30% -10%)`,
                                    }}
                                >
                                    {w.text}
                                </span>
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
        </div>
    );
}
