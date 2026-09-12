import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import { cn } from '../../lib/utils';

/**
 * Top loading line for real navigations and saves: white bar with a
 * glowing comet head that swells toward the tip. Partial reloads
 * (queue/snapshot polling) stay invisible so the line only ever means
 * "the page itself is changing".
 */
export default function PageLine() {
    const [bar, setBar] = useState(null);
    const timers = useRef([]);

    useEffect(() => {
        let trickle = null;
        const later = (fn, ms) => {
            const id = setTimeout(fn, ms);
            timers.current.push(id);
        };
        const onStart = (e) => {
            if (e?.detail?.visit?.only?.length) return;
            timers.current.forEach(clearTimeout);
            timers.current = [];
            if (trickle) clearInterval(trickle);
            setBar({ width: 12, leaving: false });
            trickle = setInterval(() => {
                setBar((b) => (b && !b.leaving ? { ...b, width: Math.min(88, b.width + (88 - b.width) * 0.14) } : b));
            }, 160);
        };
        const onFinish = () => {
            if (trickle) clearInterval(trickle);
            trickle = null;
            setBar((b) => (b ? { width: 100, leaving: true } : b));
            later(() => setBar(null), 400);
        };
        const offStart = router.on('start', onStart);
        const offFinish = router.on('finish', onFinish);
        return () => {
            if (trickle) clearInterval(trickle);
            timers.current.forEach(clearTimeout);
            offStart();
            offFinish();
        };
    }, []);

    if (!bar) return null;

    return (
        <div aria-hidden className={cn('pageline', bar.leaving && 'pageline-done')}>
            <div className="pageline-bar" style={{ width: `${bar.width}%` }} />
        </div>
    );
}
