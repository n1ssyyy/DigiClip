import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { previewBlock, previewTiming } from '../../../lib/captionPreview';
import { resolveCaptions } from '../../../lib/captionStyles';
import { useT } from '../../../lib/i18n';
import { prefersReducedMotion } from '../CaptionLayer';
import { useMeasure } from '../useMeasure';
import WordCaption from '../WordCaption';
import { useCap, useSectionOpen } from './context';

// The strip draws on a small virtual frame in engine pixels (the type scales
// down with it), centred in a short window.
const FRAME = { w: 300, h: 400 };
const STRIP_H = 84;

/**
 * A clock of its own for the strip: it loops `loopMs`, runs on
 * requestAnimationFrame only while `active` and the page is visible, and under
 * reduced motion holds one representative moment instead of running.
 */
function usePreviewClock({ active, loopMs, stillMs, reduced }) {
    const time = useRef(stillMs / 1000);
    const subs = useRef(new Set());
    const clock = useMemo(() => ({
        get: () => time.current,
        subscribe: (f) => {
            subs.current.add(f);
            return () => subs.current.delete(f);
        },
    }), []);
    useEffect(() => {
        const emit = () => subs.current.forEach((f) => f());
        if (reduced) {
            time.current = stillMs / 1000;
            emit();
            return undefined;
        }
        if (!active) return undefined;
        let raf = 0;
        let origin = 0;
        const tick = (now) => {
            time.current = ((now - origin) % loopMs) / 1000;
            emit();
            raf = requestAnimationFrame(tick);
        };
        const start = () => {
            if (raf || document.hidden) return;
            origin = performance.now() - time.current * 1000;
            raf = requestAnimationFrame(tick);
        };
        const stop = () => {
            cancelAnimationFrame(raf);
            raf = 0;
        };
        const onVisibility = () => (document.hidden ? stop() : start());
        document.addEventListener('visibilitychange', onVisibility);
        start();
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            stop();
        };
    }, [active, loopMs, stillMs, reduced]);
    return clock;
}

/**
 * Three sample words in the current look, said one after another on a loop
 * with the real timings, so a fade back of half a second is something you
 * see. It draws with the stage's own word model and rests while its section
 * is closed or the tab is hidden.
 */
export default function WordPreview() {
    const t = useT();
    const { view } = useCap();
    const open = useSectionOpen();
    const measure = useMeasure();
    const reduced = useMemo(prefersReducedMotion, []);
    const wrap = useRef(null);
    const [width, setWidth] = useState(252);

    useLayoutEffect(() => {
        const el = wrap.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width || 252));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const attack = view.val('words.attack_ms');
    const hold = view.val('words.hold_ms');
    const release = view.val('words.release_ms');
    const timing = useMemo(() => previewTiming({ attack_ms: attack, hold_ms: hold, release_ms: release }), [attack, hold, release]);

    // The Look's own fields in the caption's style, centred, one size.
    const look = JSON.stringify({ ...view.c, x: 0.5, y: 0.5, size: undefined, show: undefined, max_chars: undefined, max_words: undefined, lines: undefined });
    const r = useMemo(
        () => resolveCaptions(view.r.style, FRAME, JSON.parse(look), { anim: view.r.anim }),
        [look, view.r.style, view.r.anim],
    );
    const sample = t('Just stop now');
    const words = useMemo(() => {
        const parts = sample.split(' ').filter(Boolean);
        while (parts.length < 3) parts.push('…');
        return parts.slice(0, 3).map((w) => (r.caps ? w.toUpperCase() : w));
    }, [sample, r.caps]);
    const block = useMemo(() => previewBlock(words, timing), [words, timing]);
    const lines = useMemo(() => [block], [block]);

    const clock = usePreviewClock({ active: open, loopMs: timing.loopMs, stillMs: timing.stillMs, reduced });
    const s = width / FRAME.w;

    return (
        <div
            ref={wrap}
            role="img"
            aria-label={t('Preview: three words with the timing above')}
            className="relative overflow-hidden rounded-md border border-x-white/[0.06] border-t-black/50 border-b-white/10 bg-[#0d0d0f] shadow-[inset_0_2px_8px_rgb(0_0_0/0.45)]"
            style={{ height: STRIP_H }}
        >
            <div
                aria-hidden
                style={{
                    position: 'absolute',
                    left: 0,
                    top: STRIP_H / 2 - (FRAME.h / 2) * s,
                    width: FRAME.w,
                    height: FRAME.h,
                    transform: `scale(${s})`,
                    transformOrigin: '0 0',
                }}
            >
                <WordCaption r={r} lines={lines} clock={clock} reduced={reduced} measure={measure} />
            </div>
        </div>
    );
}
