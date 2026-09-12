import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

const sides = {
    top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
    bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
    left: 'right-full top-1/2 mr-2 -translate-y-1/2',
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
};

/**
 * In-app tooltip in the app's own language (card surface, mono label).
 * Replaces every native `title` bubble. Visibility is state-driven
 * (hover/focus, 300ms beat) so it behaves identically everywhere.
 */
export default function Tip({ label, side = 'top', className, children }) {
    const [open, setOpen] = useState(false);
    const timer = useRef(null);

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    if (!label) return children;

    function show() {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpen(true), 300);
    }
    function hide() {
        if (timer.current) clearTimeout(timer.current);
        setOpen(false);
    }

    return (
        <span
            className={cn('relative inline-flex min-w-0', className)}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
        >
            {children}
            <span
                role="tooltip"
                aria-hidden={!open}
                className={cn(
                    'pointer-events-none absolute z-50 font-mono text-[11px] whitespace-nowrap text-popover-foreground',
                    'rounded-md border bg-popover px-2 py-1 shadow-lg',
                    'motion-safe:transition-opacity motion-safe:duration-150',
                    open ? 'opacity-100' : 'opacity-0',
                    sides[side] ?? sides.top,
                )}
            >
                {label}
            </span>
        </span>
    );
}
