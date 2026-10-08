import { useEffect, useRef, useState } from 'react';
import { SIZE_RANGE, snapCentre } from '../../lib/layers';
import { clamp } from '../../lib/captionStyles';
import { useT } from '../../lib/i18n';

// Back-to-front, so a layer later in the list is on top of the ones before.
const ORDER = ['bar', 'logo', 'captions', 'headline'];
/** Pointer travel before a press becomes a drag (a click only selects). */
const DRAG_PX = 3;
/** How near (screen px) a guide pulls a layer. */
const SNAP_PX = 8;
/** The smallest grab area of a layer (screen px): thin things stay easy to hit. */
const GRAB_PX = 28;
const HANDLE = 8;
const CORNERS = [
    { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
    { id: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
    { id: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
    { id: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
];

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Everything you do to the stage with the pointer. It sits over the frame
 * in screen pixels (so lines and handles keep their weight however small
 * the frame is drawn), takes clicks to select, drags to move, corner
 * handles to resize and the bar's drag to flip. Changes go out at most once
 * per animation frame, between `onBegin` and `onEnd`.
 *
 * `rects` are the layers' boxes in engine pixels, `centres` their centres
 * (fractions of the frame) and `sizes` their size multipliers; `s` is how
 * big the frame is drawn (screen px per engine px).
 */
export default function StageOverlay({ s, cw, ch, rects, centres, sizes, selected, onSelect, onMove, onResize, onFlipBar, onReset, onBegin, onEnd }) {
    const t = useT();
    const live = useRef(null);
    live.current = { s, cw, ch, rects, centres, sizes, onSelect, onMove, onResize, onFlipBar, onBegin, onEnd };
    const rootRef = useRef(null);
    const drag = useRef(null);
    const [hover, setHover] = useState(null);
    const [fx, setFx] = useState(null);

    // Leaving mid-drag must not leave the history frozen.
    useEffect(() => () => {
        const d = drag.current;
        if (!d) return;
        if (d.raf) cancelAnimationFrame(d.raf);
        if (d.active) live.current.onEnd();
    }, []);

    function apply(d) {
        const P = live.current;
        const ev = d.ev;
        const root = rootRef.current;
        if (!ev || !root) return;
        const frame = root.getBoundingClientRect();
        const unit = P.s;
        if (d.id === 'bar') {
            const fy = (ev.y - frame.top) / (unit * P.ch);
            const pos = fy < 0.5 ? 'top' : 'bottom';
            P.onFlipBar(pos);
            const y0 = pos === 'top' ? 0 : P.ch - d.rect.h;
            setFx({ guideX: null, guideY: null, readout: { text: t(pos === 'top' ? 'Top' : 'Bottom'), cx: P.cw / 2, top: y0, bottom: y0 + d.rect.h } });
            return;
        }
        if (d.mode === 'move') {
            const dx = (ev.x - d.x0) / (unit * P.cw);
            const dy = (ev.y - d.y0) / (unit * P.ch);
            const snapped = snapCentre(
                clamp(d.c0.x + dx, 0, 1),
                clamp(d.c0.y + dy, 0, 1),
                { x: d.rect.w / 2 / P.cw, y: d.rect.h / 2 / P.ch },
                { x: SNAP_PX / (unit * P.cw), y: SNAP_PX / (unit * P.ch) },
                ev.alt,
            );
            const x = r3(clamp(snapped.x, 0, 1));
            const y = r3(clamp(snapped.y, 0, 1));
            P.onMove(d.id, x, y);
            const shiftX = (x - d.c0.x) * P.cw;
            const shiftY = (y - d.c0.y) * P.ch;
            setFx({
                guideX: snapped.guideX,
                guideY: snapped.guideY,
                readout: { text: `X ${Math.round(x * 100)}%  Y ${Math.round(y * 100)}%`, cx: d.rect.x + d.rect.w / 2 + shiftX, top: d.rect.y + shiftY, bottom: d.rect.y + d.rect.h + shiftY },
            });
            return;
        }
        // Resize: the layer scales about its centre with the pointer's distance from it.
        const cxs = frame.left + d.centre.x * unit;
        const cys = frame.top + d.centre.y * unit;
        const dist = Math.hypot(ev.x - cxs, ev.y - cys);
        const [lo, hi] = SIZE_RANGE[d.id];
        const size = r3(clamp(d.size0 * (dist / Math.max(d.dist0, 1)), lo, hi));
        P.onResize(d.id, Math.round(size * 100) / 100);
        setFx({ guideX: null, guideY: null, readout: { text: `${t('Size')} ${Math.round(size * 100)}%`, cx: d.rect.x + d.rect.w / 2, top: d.rect.y, bottom: d.rect.y + d.rect.h } });
    }

    function begin(e, id, mode) {
        if (e.button !== 0) return;
        e.stopPropagation();
        const P = live.current;
        const active = document.activeElement;
        if (active && active !== document.body && active.blur) active.blur();
        P.onSelect(id);
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
        }
        const rect = P.rects[id];
        const centre = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
        const frame = rootRef.current.getBoundingClientRect();
        const cxs = frame.left + centre.x * P.s;
        const cys = frame.top + centre.y * P.s;
        drag.current = {
            id,
            mode,
            pid: e.pointerId,
            x0: e.clientX,
            y0: e.clientY,
            active: false,
            ev: null,
            raf: 0,
            rect,
            c0: P.centres[id],
            centre,
            size0: P.sizes[id] ?? 1,
            dist0: Math.hypot(e.clientX - cxs, e.clientY - cys),
        };
    }

    function move(e) {
        const d = drag.current;
        if (!d || e.pointerId !== d.pid) return;
        d.ev = { x: e.clientX, y: e.clientY, alt: e.altKey };
        if (!d.active) {
            if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_PX) return;
            d.active = true;
            live.current.onBegin();
        }
        // One change per animation frame, whatever the pointer's rate.
        if (!d.raf) {
            d.raf = requestAnimationFrame(() => {
                d.raf = 0;
                apply(d);
            });
        }
    }

    function up(e) {
        const d = drag.current;
        if (!d || e.pointerId !== d.pid) return;
        drag.current = null;
        if (d.raf) cancelAnimationFrame(d.raf);
        try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
        }
        if (d.active) {
            if (e.type === 'pointerup') {
                d.ev = { x: e.clientX, y: e.clientY, alt: e.altKey };
                apply(d);
            }
            live.current.onEnd();
        }
        setFx(null);
    }

    const dragging = !!fx;
    const w = cw * s;
    const h = ch * s;
    return (
        <div ref={rootRef} aria-hidden className="pointer-events-none absolute inset-0 z-10">
            {fx?.guideX != null && <div className="absolute inset-y-0 w-px bg-white" style={{ left: fx.guideX * w }} />}
            {fx?.guideY != null && <div className="absolute inset-x-0 h-px bg-white" style={{ top: fx.guideY * h }} />}

            {ORDER.filter((id) => rects[id]).map((id) => {
                const R = rects[id];
                const x = R.x * s;
                const y = R.y * s;
                const bw = R.w * s;
                const bh = R.h * s;
                // Grab area: the box, grown to a comfortable minimum.
                const gx = Math.max(0, (GRAB_PX - bw) / 2);
                const gy = Math.max(0, (GRAB_PX - bh) / 2);
                return (
                    <div key={id}>
                        <div
                            className="pointer-events-auto absolute"
                            style={{ left: x - gx, top: y - gy, width: bw + 2 * gx, height: bh + 2 * gy, cursor: id === 'bar' ? 'ns-resize' : 'move', touchAction: 'none' }}
                            onPointerDown={(e) => begin(e, id, 'move')}
                            onPointerMove={move}
                            onPointerUp={up}
                            onPointerCancel={up}
                            onPointerEnter={() => setHover(id)}
                            onPointerLeave={() => setHover((h0) => (h0 === id ? null : h0))}
                            onDoubleClick={() => onReset(id)}
                        />
                        {selected !== id && hover === id && !dragging && (
                            <div className="pointer-events-none absolute border border-white/30" style={{ left: x, top: y, width: bw, height: bh, boxSizing: 'border-box' }} />
                        )}
                    </div>
                );
            })}

            {/* The selection is drawn last so its handles are never under another layer. */}
            {selected && rects[selected] && (() => {
                const R = rects[selected];
                const x = R.x * s;
                const y = R.y * s;
                const bw = R.w * s;
                const bh = R.h * s;
                return (
                    <>
                        <div className="pointer-events-none absolute border border-white" style={{ left: x, top: y, width: bw, height: bh, boxSizing: 'border-box' }} />
                        {selected !== 'bar' && CORNERS.map((c) => (
                            <div
                                key={c.id}
                                className="pointer-events-auto absolute"
                                style={{ left: x + c.x * bw - HANDLE, top: y + c.y * bh - HANDLE, width: HANDLE * 2, height: HANDLE * 2, cursor: c.cursor, touchAction: 'none' }}
                                onPointerDown={(e) => begin(e, selected, 'resize')}
                                onPointerMove={move}
                                onPointerUp={up}
                                onPointerCancel={up}
                            >
                                <span className="absolute border border-black/60 bg-white" style={{ left: HANDLE / 2, top: HANDLE / 2, width: HANDLE, height: HANDLE, boxSizing: 'border-box' }} />
                            </div>
                        ))}
                    </>
                );
            })()}

            {fx?.readout && <Readout r={fx.readout} s={s} w={w} h={h} />}
        </div>
    );
}

/** The small X/Y (or size) label that follows a layer during a drag. */
function Readout({ r, s, w, h }) {
    const above = r.top * s - 28;
    const top = above < 4 ? Math.min(r.bottom * s + 8, h - 24) : above;
    const left = clamp(r.cx * s, 52, Math.max(52, w - 52));
    return (
        <div
            className="absolute -translate-x-1/2 rounded-sm bg-black/80 px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-white"
            style={{ left, top }}
        >
            {r.text}
        </div>
    );
}
