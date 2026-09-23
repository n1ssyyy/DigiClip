import { useEffect, useRef, useState } from 'react';

/**
 * Open/close beat for popups (dropdown panels): mounts instantly on
 * open, and on close holds the panel for one exit beat so the
 * slide-and-fade-out can play before unmount. Each caller is independent.
 */
export function usePanelBeat(open, ms = 140) {
    const [show, setShow] = useState(open);
    const [leaving, setLeaving] = useState(false);
    const timer = useRef(null);

    useEffect(() => {
        if (open) {
            if (timer.current) clearTimeout(timer.current);
            setShow(true);
            setLeaving(false);
            return;
        }
        setLeaving((was) => {
            if (was) return was;
            timer.current = setTimeout(() => {
                setShow(false);
                setLeaving(false);
            }, ms);
            return true;
        });
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, ms ]);

    return { show, leaving };
}
