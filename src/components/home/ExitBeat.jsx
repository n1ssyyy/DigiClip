import { useEffect, useRef, useState } from 'react';

/** Delayed unmount: keeps children mounted for the exit beat after
 *  `open` flips false, passing `leaving` down so the dialog can play
 *  its exit (overlay fade-out + box pop-out). Renders immediately when
 *  `open` flips true so the enter animation starts on the same commit,
 *  no one-frame flash of nothing. `ms` must cover the exit animation
 *  (dialogs 180ms -> hold 200ms). */
export default function ExitBeat({ open, ms = 200, children }) {
    const [held, setHeld] = useState(open);
    const [leaving, setLeaving] = useState(false);
    const timer = useRef(null);
    const heldRef = useRef(null);
    if (open) heldRef.current = children;

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        if (open) {
            setHeld(true);
            setLeaving(false);
        } else if (held) {
            setLeaving(true);
            timer.current = setTimeout(() => {
                setHeld(false);
                setLeaving(false);
            }, ms);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    // Render on the same commit `open` turns true (held may still be
    // false until the effect above runs) so the fade/pop enter starts
    // instantly; keep rendering while held during the exit beat.
    if (!held && !open) return null;
    const kids = open ? children : heldRef.current;
    if (!kids) return null;
    const only = Array.isArray(kids) ? kids[0] : kids;
    if (only && typeof only === 'object' && 'props' in only) {
        return { ...only, props: { ...only.props, leaving } };
    }
    return kids;
}
