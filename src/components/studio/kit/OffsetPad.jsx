import { useId, useRef, useState } from 'react';
import { mergePatch } from '../../../lib/captionEffective';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/utils';
import { usePanel } from './context';
import { NumBox, Row, useDrag } from './inputs';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * The shadow's offset: a small square to drag a dot about (the middle is no
 * offset), with the two numbers beside it for typing. A drag is one undo
 * step. The pad is a focus stop of its own: arrows nudge by one (Shift: five),
 * Home puts the dot in the middle.
 */
export default function OffsetPad() {
    const t = useT();
    const { view, setPatch, patchFor, clear, g, num } = usePanel();
    const { spec: SX, ui } = num('shadow.x');
    const { spec: SY } = num('shadow.y');
    const id = useId();
    const ref = useRef(null);
    const [drag, setDrag] = useState(false);
    const gesture = useDrag(g);
    const x = view.val('shadow.x');
    const y = view.val('shadow.y');
    const isSet = view.isSet('shadow.x') || view.isSet('shadow.y');

    function put(nx, ny) {
        const vx = Math.round(clamp(nx, SX.min, SX.max));
        const vy = Math.round(clamp(ny, SY.min, SY.max));
        if (vx === x && vy === y) return;
        setPatch(mergePatch(patchFor('shadow.x', vx), patchFor('shadow.y', vy)));
    }
    function at(e) {
        const r = ref.current.getBoundingClientRect();
        const fx = clamp((e.clientX - r.left) / (r.width || 1), 0, 1);
        const fy = clamp((e.clientY - r.top) / (r.height || 1), 0, 1);
        put(SX.min + fx * (SX.max - SX.min), SY.min + fy * (SY.max - SY.min));
    }
    function onKey(e) {
        const d = e.shiftKey ? 5 : 1;
        const move = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
        if (move) put(x + move[0], y + move[1]);
        else if (e.key === 'Home') put(0, 0);
        else return;
        e.preventDefault();
        e.stopPropagation();
    }
    const left = ((x - SX.min) / (SX.max - SX.min)) * 100;
    const top = ((y - SY.min) / (SY.max - SY.min)) * 100;
    const label = t('Offset');
    return (
        <Row label={label} set={isSet} onReset={() => clear('shadow.x', 'shadow.y')}>
            <div className="flex items-start gap-3">
                <div
                    ref={ref}
                    role="group"
                    tabIndex={0}
                    aria-label={t('Shadow offset: {x} across, {y} down', { x, y })}
                    onKeyDown={onKey}
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        setDrag(true);
                        gesture.begin();
                        at(e);
                        try {
                            e.currentTarget.setPointerCapture(e.pointerId);
                        } catch {
                        }
                    }}
                    onPointerMove={(e) => { if (drag) at(e); }}
                    onPointerUp={() => { setDrag(false); gesture.end(); }}
                    onPointerCancel={() => { setDrag(false); gesture.end(); }}
                    onLostPointerCapture={() => { setDrag(false); gesture.end(); }}
                    onDoubleClick={() => put(0, 0)}
                    className="relative size-[88px] shrink-0 cursor-crosshair touch-none overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
                    <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                    <span aria-hidden className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-white/25" />
                    <span
                        aria-hidden
                        className={cn(
                            'absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-[0_1px_2px_rgb(0_0_0/0.5)] motion-safe:transition-[scale] motion-safe:duration-150 motion-safe:ease-[var(--spring)]',
                            isSet ? 'border-black/40 bg-foreground' : 'border-white/30 bg-white/50',
                            drag && 'scale-125',
                        )}
                        style={{ left: `${left}%`, top: `${top}%` }}
                    />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                        <label htmlFor={`${id}-x`} className="w-3 shrink-0 font-mono text-[10px] text-muted-foreground">X</label>
                        <NumBox id={`${id}-x`} value={x} spec={SX} ui={ui} set={isSet} onChange={(v) => put(v, y)} className="w-full min-w-0 shrink" />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <label htmlFor={`${id}-y`} className="w-3 shrink-0 font-mono text-[10px] text-muted-foreground">Y</label>
                        <NumBox id={`${id}-y`} value={y} spec={SY} ui={ui} set={isSet} onChange={(v) => put(x, v)} className="w-full min-w-0 shrink" />
                    </div>
                </div>
            </div>
        </Row>
    );
}
