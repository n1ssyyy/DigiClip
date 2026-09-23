import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { useStore } from '../../lib/socket';

/**
 * Top loading line for full actions (navigation, saves): white bar with a
 * glowing comet head that swells toward the tip. Background socket events
 * (queue progress, renders, downloads) stay invisible so the line only
 * ever means "your action is landing".
 */
export default function PageLine() {
    const busy = useStore((s) => s.busy);
    const [bar, setBar] = useState(null);
    const timers = useRef([]);
    const trickle = useRef(null);

    useEffect(() => {
        const later = (fn, ms) => {
            const id = setTimeout(fn, ms);
            timers.current.push(id);
        };
        if (busy > 0 && !bar) {
            setBar({ width: 12, leaving: false });
            if (trickle.current) clearInterval(trickle.current);
            trickle.current = setInterval(() => {
                setBar((b) => (b && !b.leaving ? { ...b, width: Math.min(88, b.width + (88 - b.width) * 0.14) } : b));
            }, 160);
        } else if (busy === 0 && bar && !bar.leaving) {
            if (trickle.current) clearInterval(trickle.current);
            trickle.current = null;
            setBar((b) => (b ? { width: 100, leaving: true } : b));
            later(() => setBar(null), 400);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [busy]);

    useEffect(() => () => {
        if (trickle.current) clearInterval(trickle.current);
        timers.current.forEach(clearTimeout);
    }, []);

    if (!bar) return null;

    return (
        <div aria-hidden className={cn('pageline', bar.leaving && 'pageline-done')}>
            <div className="pageline-bar" style={{ width: `${bar.width}%` }} />
        </div>
    );
}
