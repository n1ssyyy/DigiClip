import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

/**
 * In-app tooltip in the app's own language (card surface, mono label).
 * Replaces every native `title` bubble. Visibility is state-driven
 * (hover/focus, 300ms beat) so it behaves identically everywhere.
 *
 * The bubble lives in a body portal with fixed positioning, so no
 * `overflow-hidden` ancestor (grid tiles, scroller masks, cards) can
 * clip it. It tracks the anchor every frame while open, so slides and
 * scrolls never detach it.
 */
export default function Tip({ label, side = 'top', className, wrap = false, children }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const timer = useRef(null);
    const anchorRef = useRef(null);
    const bubbleRef = useRef(null);
    const lastPos = useRef(null);

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    // Track the anchor while open: reposition every frame (covers scroll,
    // window moves, and the scroller slide), writing state only on change.
    useLayoutEffect(() => {
        if (!open) {
            lastPos.current = null;
            return;
        }
        let raf = 0;
        const gap = 8;
        const tick = () => {
            const anchor = anchorRef.current;
            const bubble = bubbleRef.current;
            if (anchor && bubble) {
                const r = anchor.getBoundingClientRect();
                const bw = bubble.offsetWidth;
                const bh = bubble.offsetHeight;
                let top = 0;
                let left = 0;
                if (side === 'bottom') {
                    top = r.bottom + gap;
                    left = r.left + r.width / 2 - bw / 2;
                } else if (side === 'left') {
                    top = r.top + r.height / 2 - bh / 2;
                    left = r.left - bw - gap;
                } else if (side === 'right') {
                    top = r.top + r.height / 2 - bh / 2;
                    left = r.right + gap;
                } else {
                    top = r.top - bh - gap;
                    left = r.left + r.width / 2 - bw / 2;
                }
                left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
                top = Math.max(8, Math.min(top, window.innerHeight - bh - 8));
                const prev = lastPos.current;
                if (!prev || Math.abs(prev.top - top) > 0.5 || Math.abs(prev.left - left) > 0.5) {
                    lastPos.current = { top, left };
                    setPos({ top, left });
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [open, side, label]);

    if (!label) return children;

    function show() {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpen(true), 300);
    }
    function hide() {
        if (timer.current) clearTimeout(timer.current);
        setOpen(false);
        setPos(null);
    }

    return (
        <span
            ref={anchorRef}
            className={cn('relative inline-flex min-w-0', className)}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
        >
            {children}
            {createPortal(
                <span
                    ref={bubbleRef}
                    role="tooltip"
                    aria-hidden={!open}
                    style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
                    className={cn(
                        'pointer-events-none fixed z-[100] font-mono text-[10px] text-popover-foreground',
                        wrap ? 'max-w-72 whitespace-normal break-words' : 'whitespace-nowrap',
                        'rounded-md border bg-popover px-2 py-1 shadow-lg',
                        'motion-safe:transition-opacity motion-safe:duration-150',
                        open && pos ? 'opacity-100' : 'opacity-0',
                    )}
                >
                    {label}
                </span>,
                document.body,
            )}
        </span>
    );
}
