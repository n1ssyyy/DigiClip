import { useEffect, useMemo, useRef } from 'react';
import {
    BOX, FRAME, STILL_AT, dotAt, feelParams, frameOrigin, simulate, startCam, stepCam,
} from '../../../lib/feelPreview';
import { prefersReducedMotion } from '../CaptionLayer';
import { useSectionOpen } from '../kit/context';

/**
 * A frame outline following a moving dot with the picked feel's tuning (the
 * engine's dead band round the framing and its response time; Locked holds
 * one framing per shot). The dot wanders, fidgets, walks across and changes
 * shot; the frame follows. It runs on its own animation-frame clock, only
 * while its section is open and the page is visible, and under reduced
 * motion it is one still moment instead.
 */
export default function FeelPreview({ feel }) {
    const open = useSectionOpen();
    const reduced = useMemo(prefersReducedMotion, []);
    const frame = useRef(null);
    const band = useRef(null);
    const dot = useRef(null);

    useEffect(() => {
        const p = feelParams(feel);
        const draw = (cam, d) => {
            const o = frameOrigin(cam);
            const bw = 2 * p.bandX * FRAME.w;
            const bh = 2 * p.bandY * FRAME.h;
            frame.current?.setAttribute('transform', `translate(${o.x.toFixed(2)} ${o.y.toFixed(2)})`);
            band.current?.setAttribute('x', (o.x + FRAME.w / 2 - bw / 2).toFixed(2));
            band.current?.setAttribute('y', (o.y + FRAME.h / 2 - bh / 2).toFixed(2));
            band.current?.setAttribute('width', bw.toFixed(2));
            band.current?.setAttribute('height', bh.toFixed(2));
            dot.current?.setAttribute('cx', d.x.toFixed(2));
            dot.current?.setAttribute('cy', d.y.toFixed(2));
        };
        if (reduced) {
            const last = simulate(feel, STILL_AT).at(-1);
            draw(last.cam, last.dot);
            return undefined;
        }
        draw(startCam(p), dotAt(0));
        if (!open) return undefined;
        let raf = 0;
        let last = 0;
        let t = 0;
        let cam = startCam(p);
        let shot = dotAt(0).shot;
        const tick = (now) => {
            // A long gap (the page was hidden) is one short step, not a jump.
            const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
            last = now;
            t += dt;
            const d = dotAt(t);
            cam = stepCam(cam, d, dt, p, d.shot !== shot);
            shot = d.shot;
            draw(cam, d);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [feel, open, reduced]);

    return (
        <div className="overflow-hidden rounded-md border border-x-white/[0.06] border-t-black/50 border-b-white/10 bg-[color-mix(in_srgb,var(--background)_55%,black)] shadow-[inset_0_2px_10px_rgb(0_0_0/0.45)]">
            <svg viewBox={`0 0 ${BOX.w} ${BOX.h}`} className="block w-full text-foreground" aria-hidden>
                <rect ref={band} fill="currentColor" fillOpacity="0.16" />
                <g ref={frame}>
                    <rect width={FRAME.w} height={FRAME.h} rx="2" fill="none" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.2" />
                </g>
                <circle ref={dot} r="3.2" fill="currentColor" />
            </svg>
        </div>
    );
}
