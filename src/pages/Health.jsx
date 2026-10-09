import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/card';
import Details from '../components/health/Details';
import Findings from '../components/health/Findings';
import Footer from '../components/health/Footer';
import Status, { DetailsSkeleton } from '../components/health/Status';
import { Swap } from '../components/digiclip/Skeleton';
import { healthView, platformOf } from '../lib/healthView';
import { refreshHealth, useStore } from '../lib/socket';
import { useT } from '../lib/i18n';

/** One calm sentence on whether DigiClip is fit to work; when it is not,
 *  what to do about each problem first; the details below, quiet. */
export default function Health() {
    const health = useStore((s) => s.health);
    const conn = useStore((s) => s.conn);
    const settings = useStore((s) => s.settings);
    const models = useStore((s) => s.models);
    const healthAt = useStore((s) => s.healthAt);
    const checking = useStore((s) => s.healthBusy);
    const [, setTick] = useState(0);
    const t = useT();
    const platform = useMemo(() => platformOf(typeof navigator === 'undefined' ? '' : navigator.userAgent), []);

    // Never rejects; one check at a time (asking again shares the one running).
    const refresh = () => {
        refreshHealth();
    };

    // Event-based freshness: re-ask over the same socket when the view
    // returns or the machine reconnects. No polling, no buttons. The
    // clock below only re-renders the "ago" label.
    useEffect(() => {
        refresh();
        const onVisible = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        const onOnline = () => refresh();
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onOnline);
        window.addEventListener('online', onOnline);
        const clock = setInterval(() => setTick((n) => n + 1), 10000);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onOnline);
            window.removeEventListener('online', onOnline);
            clearInterval(clock);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (conn === 'live') refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conn]);

    const view = useMemo(
        () => healthView({ health, conn, settings, models, platform }, t),
        [health, conn, settings, models, platform, t],
    );

    return (
        <Card className="stagger-1 digi-scroll h-full min-h-0 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-6 py-8">
                <Status overall={view.overall} count={view.problems.length} live={conn === 'live'} updatedAt={healthAt} />
                <Findings problems={view.problems} notes={view.notes} />
                <Swap ready={view.overall !== 'checking'} skeleton={<DetailsSkeleton />} className="w-full">
                    <Details facts={view.facts} />
                </Swap>
                <Footer checking={checking} onCheck={refresh} />
            </div>
        </Card>
    );
}
