import { useMemo } from 'react';
import { CircleAlert, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';
import { navigate, retrySetup, useStore } from '../../lib/socket';
import { setupView } from '../../lib/setupView';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

/** One slim line on Home while DigiClip is still downloading what it needs
 *  (the first run, or a newly picked speech model): what is coming down and
 *  how far it is, and a way to the full list on Health. When downloads failed
 *  it says so and offers to try again now. Nothing when all is here. */
export default function SetupBanner({ className }) {
    const t = useT();
    const setup = useStore((s) => s.setup);
    const banner = useMemo(() => setupView(setup, t).banner, [setup, t]);
    if (!banner) return null;
    const bad = banner.tone === 'bad';
    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                'rise relative flex flex-wrap items-center gap-x-3 gap-y-2 overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-card px-3 py-2',
                className,
            )}
        >
            {bad
                ? <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
                : <Loader2 className="size-4 shrink-0 animate-spin text-orange-500" aria-hidden />}
            <p className="min-w-0 flex-1 basis-56 text-[12px] leading-snug">
                <span className="font-semibold">{banner.title}</span>
                <span className="mx-2 text-muted-foreground" aria-hidden>·</span>
                <span className="text-muted-foreground [overflow-wrap:anywhere]">{banner.text}</span>
            </p>
            {banner.count && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{banner.count}</span>}
            {banner.retry && (
                <Button size="sm" variant="secondary" onClick={retrySetup}>
                    <RotateCcw aria-hidden /> {t('Try again')}
                </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => navigate('health')}>{t('Details')}</Button>
            {banner.pct != null && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10" aria-hidden>
                    <span
                        className="block h-full bg-orange-500 motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
                        style={{ width: `${banner.pct}%` }}
                    />
                </span>
            )}
        </div>
    );
}
