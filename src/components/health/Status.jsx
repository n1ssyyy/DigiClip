import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { Skeleton } from '../digiclip/Skeleton';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

function ago(ms, t) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 10) return t('just now');
    if (s < 60) return t('{s}s ago', { s });
    return t('{m}m ago', { m: Math.floor(s / 60) });
}

/** The one line the page is about, as a status region so a screen reader
 *  hears the overall state when it changes, and when it was last checked. */
export default function Status({ overall, count, live, updatedAt }) {
    const t = useT();
    const sentence = overall === 'checking'
        ? t('Checking…')
        : overall === 'ok'
            ? t('Everything DigiClip needs is working.')
            : count === 1
                ? t('One thing needs your attention.')
                : t('{n} things need your attention.', { n: count });

    return (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div role="status" className="flex min-w-0 items-center gap-2.5">
                {overall === 'ok' && <CheckCircle2 className="size-5 shrink-0 text-[var(--viral)]" aria-hidden />}
                {overall === 'problem' && <CircleAlert className="size-5 shrink-0 text-destructive" aria-hidden />}
                {overall === 'checking' && <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
                <h2 className="text-[15px] leading-snug font-semibold">{sentence}</h2>
            </div>
            {overall !== 'checking' && updatedAt != null && (
                <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
                    <span
                        className={cn('size-1.5 rounded-full', live ? 'bg-[var(--viral)] motion-safe:animate-pulse' : 'bg-muted-foreground')}
                        aria-hidden
                    />
                    {live ? t('Live') : t('Updated')} · {ago(Date.now() - updatedAt, t)}
                </span>
            )}
        </div>
    );
}

/** Stand-in for the details until the engine has answered. */
export function DetailsSkeleton() {
    return (
        <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-3" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="contents">
                    <Skeleton className="h-3 w-20 rounded-sm" />
                    <Skeleton className="h-3 w-40 rounded-sm" />
                </div>
            ))}
        </div>
    );
}
