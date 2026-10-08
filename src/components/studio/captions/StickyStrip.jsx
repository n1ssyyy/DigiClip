import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';
import { useSectionOpen } from './context';

/** The nearest ancestor that scrolls vertically (the inspector's pane). */
function scrollParent(el) {
    for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if (o === 'auto' || o === 'scroll') return p;
    }
    return null;
}

/**
 * Keeps its child at the top of the inspector's scroll area while the block
 * it sits in (its parent element) is on screen, and lets it leave with the
 * end of that block. It is `position: sticky`, so it never sticks past its
 * parent and never overlaps the next section's header. The backing is opaque
 * (the panel surface); a hairline and soft shadow show only while it is
 * stuck. While the block is on screen the pane's scroll padding equals the
 * strip's height, so a control reached with the keyboard is scrolled out
 * from under it, never behind it.
 */
export default function StickyStrip({ children }) {
    const open = useSectionOpen();
    const bar = useRef(null);
    const [stuck, setStuck] = useState(false);

    useEffect(() => {
        const el = bar.current;
        const block = el?.parentElement;
        const root = el && scrollParent(el);
        if (!root || !block) return undefined;
        const before = root.style.scrollPaddingTop;
        let raf = 0;
        const measure = () => {
            raf = 0;
            const r = root.getBoundingClientRect();
            const top = r.top + root.clientTop;
            const bottom = top + root.clientHeight;
            const b = el.getBoundingClientRect();
            const k = block.getBoundingClientRect();
            const here = open && k.bottom > top && k.top < bottom;
            setStuck(open && b.top <= top + 0.5 && k.bottom > top);
            root.style.scrollPaddingTop = here ? `${Math.ceil(b.height)}px` : before;
        };
        const queue = () => {
            if (!raf) raf = requestAnimationFrame(measure);
        };
        measure();
        root.addEventListener('scroll', queue, { passive: true });
        const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(queue);
        ro?.observe(root);
        ro?.observe(block);
        if (root.firstElementChild) ro?.observe(root.firstElementChild);
        return () => {
            cancelAnimationFrame(raf);
            root.removeEventListener('scroll', queue);
            ro?.disconnect();
            root.style.scrollPaddingTop = before;
        };
    }, [open]);

    return (
        <div
            ref={bar}
            className={cn(
                'sticky top-0 z-10 -mx-1 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-1 pt-1 pb-1',
                'motion-safe:transition-shadow motion-safe:duration-[160ms] motion-safe:ease-[var(--ease-out)]',
                stuck ? 'shadow-[0_1px_0_rgb(255_255_255/0.08),0_8px_8px_-8px_rgb(0_0_0/0.7)]' : 'shadow-[0_1px_0_transparent,0_8px_8px_-8px_transparent]',
            )}
        >
            {children}
        </div>
    );
}
