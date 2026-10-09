import { useEffect, useRef, useState } from 'react';
import { splitRows } from '../../lib/layoutLook';
import { clamp } from '../../lib/captionStyles';
import { LAYOUT_LAYER } from '../../lib/sceneSections';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';

/** Pointer travel before a press becomes a drag (a click only selects). */
const DRAG_PX = 3;
/** How near (screen px) the even split pulls the seam. */
const SNAP_PX = 8;
/** The height of the strip that takes the pointer (screen px). */
const GRAB_PX = 24;
const [MIN, MAX] = [LAYOUT_LAYER.specs.split.min, LAYOUT_LAYER.specs.split.max];

/**
 * The seam of a split-screen stage: a line across the frame where the two
 * panels meet, drawn in screen pixels over the picture. Click it to pick the
 * Layout (its panel opens), drag it up or down to move it (one undo step per
 * drag, between `onBegin` and `onEnd`, at most one change per animation
 * frame; it snaps to the even split, Alt drags it free), double-click to put
 * it back. It sits under the other layers' pointer areas, so a caption on the
 * seam is picked first and the seam is still reached beside it.
 */
export default function StageSeam({ s, cw, ch, split, selected, onSelect, onSplit, onReset, onBegin, onEnd }) {
    const t = useT();
    const live = useRef(null);
    live.current = { s, ch, onSelect, onSplit, onBegin, onEnd };
    const rootRef = useRef(null);
    const drag = useRef(null);
    const [hover, setHover] = useState(false);
    const [readout, setReadout] = useState(null);

    // Leaving mid-drag must not leave the history frozen.
    useEffect(() => () => {
        const d = drag.current;
        if (!d) return;
        if (d.raf) cancelAnimationFrame(d.raf);
        if (d.active) live.current.onEnd();
    }, []);

    function apply(d) {
        const P = live.current;
        const root = rootRef.current;
        if (!d.ev || !root) return;
        const frame = root.getBoundingClientRect();
        let f = clamp((d.ev.y - frame.top) / (P.s * P.ch), MIN, MAX);
        if (!d.ev.alt && Math.abs(f - 0.5) * P.s * P.ch <= SNAP_PX) f = 0.5;
        f = Math.round(f * 100) / 100;
        P.onSplit(f);
        setReadout(f);
    }

    function down(e) {
        if (e.button !== 0) return;
        e.stopPropagation();
        const active = document.activeElement;
        if (active && active !== document.body && active.blur) active.blur();
        live.current.onSelect('layout');
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
        }
        drag.current = { pid: e.pointerId, y0: e.clientY, active: false, ev: null, raf: 0 };
    }

    function move(e) {
        const d = drag.current;
        if (!d || e.pointerId !== d.pid) return;
        d.ev = { y: e.clientY, alt: e.altKey };
        if (!d.active) {
            if (Math.abs(e.clientY - d.y0) < DRAG_PX) return;
            d.active = true;
            live.current.onBegin();
        }
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
                d.ev = { y: e.clientY, alt: e.altKey };
                apply(d);
            }
            live.current.onEnd();
        }
        setReadout(null);
    }

    const w = cw * s;
    const y = splitRows(ch, split) * s;
    const lit = selected || readout !== null;
    return (
        <div ref={rootRef} aria-hidden className="pointer-events-none absolute inset-0 z-10">
            <div
                className={cn('absolute inset-x-0 border-t transition-colors duration-150', lit ? 'border-white' : hover ? 'border-white/60' : 'border-dashed border-white/30')}
                style={{ top: y }}
            />
            {[0, 1].map((side) => (
                <span
                    key={side}
                    className={cn('absolute h-[18px] w-[6px] -translate-y-1/2 rounded-full border border-black/50 transition-colors duration-150', lit || hover ? 'bg-white' : 'bg-white/50')}
                    style={{ top: y, [side ? 'right' : 'left']: 3 }}
                />
            ))}
            <div
                className="pointer-events-auto absolute inset-x-0"
                style={{ top: y - GRAB_PX / 2, height: GRAB_PX, cursor: 'ns-resize', touchAction: 'none' }}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onPointerEnter={() => setHover(true)}
                onPointerLeave={() => setHover(false)}
                onDoubleClick={onReset}
            />
            {readout !== null && (
                <div
                    className="absolute -translate-x-1/2 rounded-sm bg-black/80 px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-white"
                    style={{ left: w / 2, top: Math.max(4, y - 28) }}
                >
                    {t('Seam {n}%', { n: Math.round(readout * 100) })}
                </div>
            )}
        </div>
    );
}
