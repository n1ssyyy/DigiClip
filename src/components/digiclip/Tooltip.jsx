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
// Which edge of the bubble touches its anchor: it grows out of there.
const EDGE = 8; // never closer than this to the window
const GAP = 8; // bubble to anchor
const DRIFT = 0.25; // a clamp may push the bubble this far (of its width) off-centre

const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** Ideal (unclamped) box for one side, centred on the anchor. */
function place(side, r, bw, bh) {
    if (side === 'bottom') return { top: r.bottom + GAP, left: r.left + r.width / 2 - bw / 2 };
    if (side === 'left') return { top: r.top + r.height / 2 - bh / 2, left: r.left - bw - GAP };
    if (side === 'right') return { top: r.top + r.height / 2 - bh / 2, left: r.right + GAP };
    return { top: r.top - bh - GAP, left: r.left + r.width / 2 - bw / 2 };
}

/**
 * Pick the side and box. The preferred side wins while a clamp keeps the
 * bubble roughly centred on the anchor (within 25% of its width, or of its
 * height for left/right). Otherwise flip: along the main axis when the side
 * is out of room, sideways (top/bottom to right/left) when the clamp would
 * drag it off-centre. If nothing fits better, the clamp stands.
 */
function layout(pref, r, bw, bh) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampX = (x) => Math.max(EDGE, Math.min(x, vw - bw - EDGE));
    const clampY = (y) => Math.max(EDGE, Math.min(y, vh - bh - EDGE));
    const fits = (side, p) => {
        if (side === 'top') return p.top >= EDGE;
        if (side === 'bottom') return p.top + bh <= vh - EDGE;
        if (side === 'left') return p.left >= EDGE;
        return p.left + bw <= vw - EDGE;
    };
    // How far the clamp drags the box off-centre, across the axis it centres on.
    const drift = (side, p) => (side === 'top' || side === 'bottom' ? Math.abs(clampX(p.left) - p.left) : Math.abs(clampY(p.top) - p.top));
    const limit = (side) => DRIFT * (side === 'top' || side === 'bottom' ? bw : bh);
    const good = (side) => {
        const p = place(side, r, bw, bh);
        return fits(side, p) && drift(side, p) <= limit(side);
    };
    let side = pref;
    if (!good(pref)) {
        const horizontal = pref === 'top' || pref === 'bottom';
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // Try the side with more room first.
        const cross = horizontal ? (cx < vw / 2 ? ['right', 'left'] : ['left', 'right']) : cy < vh / 2 ? ['bottom', 'top'] : ['top', 'bottom'];
        const order = [OPPOSITE[pref], ...cross].filter((x) => x !== pref);
        const next = order.find(good);
        if (next) side = next;
    }
    const p = place(side, r, bw, bh);
    const left = clampX(p.left);
    const top = clampY(p.top);
    // Grow from the anchor: origin is the anchor's centre in bubble space, held to the box.
    const ox = Math.max(0, Math.min(r.left + r.width / 2 - left, bw));
    const oy = Math.max(0, Math.min(r.top + r.height / 2 - top, bh));
    return { top, left, ox, oy };
}

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
        const tick = () => {
            const anchor = anchorRef.current;
            const bubble = bubbleRef.current;
            if (anchor && bubble) {
                const r = anchor.getBoundingClientRect();
                const bw = bubble.offsetWidth;
                const bh = bubble.offsetHeight;
                const next = layout(side, r, bw, bh);
                const { top, left, ox, oy } = next;
                const prev = lastPos.current;
                if (!prev || Math.abs(prev.top - top) > 0.5 || Math.abs(prev.left - left) > 0.5 || Math.abs(prev.ox - ox) > 0.5 || Math.abs(prev.oy - oy) > 0.5) {
                    lastPos.current = next;
                    setPos(next);
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
        timer.current = setTimeout(() => setOpen(true), 240);
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
                    style={pos ? { top: pos.top, left: pos.left, transformOrigin: `${pos.ox}px ${pos.oy}px` } : { visibility: 'hidden' }}
                    className={cn(
                        'pointer-events-none fixed z-[100] font-mono text-[10px] text-popover-foreground',
                        wrap ? 'max-w-72 whitespace-normal break-words' : 'whitespace-nowrap',
                        'rounded-md border bg-popover px-2 py-1 shadow-lg',
                        'motion-safe:transition-[opacity,scale] motion-safe:ease-[var(--ease-out)]',
                        open && pos ? 'scale-100 opacity-100 motion-safe:duration-[160ms]' : 'scale-95 opacity-0 motion-safe:duration-[90ms]',
                    )}
                >
                    {label}
                </span>,
                document.body,
            )}
        </span>
    );
}
