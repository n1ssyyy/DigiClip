import { Check, CircleAlert, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';
import { retrySetup } from '../../lib/socket';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

/** What DigiClip downloads for itself the first time, while any of it is
 *  still on the way: each thing with its size and where it stands, a bar for
 *  the one coming down, and the reason beside one that failed. Gone once
 *  everything is here. */
export default function Setup({ view }) {
    const t = useT();
    if (!view || view.phase === 'idle') return null;
    const failed = view.open.some((i) => i.state === 'failed');
    return (
        <section className="rise flex flex-col gap-2.5" aria-label={t('First-time downloads')}>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-64">
                    <h3 className="text-[13px] font-semibold">{t('First-time downloads')}</h3>
                    <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                        {t('DigiClip fetches these by itself. If the connection drops, it carries on where it stopped.')}
                    </p>
                </div>
                {failed && (
                    <Button size="sm" variant="secondary" onClick={retrySetup}>
                        <RotateCcw aria-hidden /> {t('Try again')}
                    </Button>
                )}
            </div>
            <ul className="flex flex-col rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-muted/30">
                {view.items.map((it) => {
                    const busy = it.state === 'downloading' || it.state === 'waiting';
                    return (
                        <li key={it.id} className="flex flex-col gap-1.5 border-b border-border px-3 py-2 last:border-b-0">
                            <div className="flex items-center gap-2.5">
                                <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
                                    {it.state === 'ready' && <Check className="size-3.5 text-foreground" />}
                                    {busy && <Loader2 className="size-3.5 animate-spin text-orange-500" />}
                                    {it.state === 'failed' && <CircleAlert className="size-3.5 text-destructive" />}
                                    {it.state === 'missing' && <span className="size-1.5 rounded-full bg-muted-foreground" />}
                                </span>
                                <p className="min-w-0 flex-1 truncate text-[12px] font-medium" title={it.label}>
                                    {it.label}
                                    <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">{it.size}</span>
                                </p>
                                <p className={cn('shrink-0 text-right text-[11px]', it.state === 'ready' ? 'text-muted-foreground' : it.state === 'failed' ? 'text-destructive' : 'text-foreground')}>
                                    {it.state === 'failed' || it.state === 'waiting' ? '' : it.line}
                                </p>
                            </div>
                            {(it.state === 'failed' || it.state === 'waiting') && (
                                <p className="pl-[26px] text-[11px] leading-snug text-muted-foreground">{it.line}</p>
                            )}
                            {it.state === 'downloading' && (
                                <div className="ml-[26px] h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={it.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={it.pct ?? undefined}>
                                    <div
                                        className={cn('h-full rounded-full bg-orange-500', it.pct == null ? 'w-1/3 animate-pulse' : 'motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out')}
                                        style={it.pct == null ? undefined : { width: `${it.pct}%` }}
                                    />
                                </div>
                            )}
                            {it.why && (
                                <p className="pl-[26px] font-mono text-[10.5px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{it.why}</p>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
