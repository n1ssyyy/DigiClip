import { useLayoutEffect, useState } from 'react';

/**
 * Floating geometry for dropdown panels: fixed to the viewport under
 * (or above, when space is short) the trigger, tracked across scroll
 * and resize. Render the panel in a body portal with this style and no
 * overflow-hidden ancestor can ever clip it. `align` picks which trigger
 * edge the panel hangs from ('left' default; 'right' for corner triggers
 * whose panel would otherwise spill past the viewport edge).
 */
export function useFloatingPanel(active, anchorRef, gap = 6, align = 'left') {
    const [style, setStyle] = useState(null);

    useLayoutEffect(() => {
        if (!active || !anchorRef.current) return;
        const update = () => {
            const el = anchorRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const roomBelow = window.innerHeight - r.bottom;
            const edge = align === 'right'
                ? { right: Math.max(8, window.innerWidth - r.right) }
                : { left: Math.max(8, r.left) };
            // Tallest panel content (~260px): flip above when cramped.
            if (roomBelow < 280 && r.top > roomBelow) {
                setStyle({ bottom: Math.max(8, window.innerHeight - r.top + gap), ...edge, width: r.width });
            } else {
                setStyle({ top: r.bottom + gap, ...edge, width: r.width });
            }
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [active, anchorRef, gap, align]);

    return style;
}
