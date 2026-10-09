import { FileVideo, RotateCcw, X } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import { FadeImg } from '../digiclip/Skeleton';
import { artUrl } from '../../lib/socket';
import { rowStatus } from '../../lib/homeList';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

const TONE = { work: 'text-orange-500', bad: 'text-red-500', ok: 'text-muted-foreground' };
const DOT = { work: 'animate-pulse bg-orange-500', bad: 'bg-red-500', ok: 'bg-muted-foreground/50' };

/** One video in the list: its thumbnail, its name (wraps, never cut) and one
 *  line of where it stands - "6 clips", "Transcribing…", "Failed" - with a thin
 *  bar under it while it is being worked on. A video that is running, failed or
 *  cancelled carries its own cancel / retry / remove buttons. The current one
 *  is marked; a finished one not opened yet carries a green dot. */
export default function VideoRow({ job, current, fresh, onPick, onRetry, onRemove }) {
    const t = useT();
    const st = rowStatus(job, t);
    const retryable = st.phase === 'failed' || st.phase === 'cancelled';
    const actions = st.phase === 'working' || retryable;
    const dot = st.phase === 'ready' && fresh ? 'bg-emerald-500' : DOT[st.tone];

    return (
        <li className={cn('queue-in flex items-center gap-1 rounded-md transition-colors', current ? 'bg-accent' : 'hover:bg-accent/50')}>
            <button
                type="button"
                data-video={job.id}
                aria-current={current || undefined}
                onClick={onPick}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span className="relative h-8 w-14 shrink-0 overflow-hidden rounded bg-muted">
                    <FileVideo className="absolute inset-0 m-auto size-4 text-muted-foreground" aria-hidden />
                    <FadeImg src={artUrl(job.id, 'poster.jpg')} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className={cn('block text-[12px] leading-snug [overflow-wrap:anywhere]', current ? 'font-semibold' : 'font-medium')}>{job.name}</span>
                    <span className={cn('mt-0.5 flex items-center gap-1.5 font-mono text-[10px] leading-snug', TONE[st.tone])}>
                        <span className={cn('size-1.5 shrink-0 rounded-full motion-safe:transition-colors motion-safe:duration-500', dot)} aria-hidden />
                        <span className="min-w-0 [overflow-wrap:anywhere]">{st.text}</span>
                    </span>
                    {st.progress != null && (
                        <span className="mt-1 block h-0.5 overflow-hidden rounded-full bg-border" aria-hidden>
                            <span
                                className="block h-full rounded-full bg-orange-500/80 motion-safe:transition-[width] motion-safe:duration-700"
                                style={{ width: `${Math.round(st.progress * 100)}%` }}
                            />
                        </span>
                    )}
                </span>
            </button>
            {actions && (
                <span className="flex shrink-0 items-center pr-1">
                    {retryable && (
                        <Tip label={t('Retry')} side="top">
                            <button
                                type="button" aria-label={t('Retry {name}', { name: job.name })}
                                onClick={onRetry}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                                <RotateCcw className="size-3.5" aria-hidden />
                            </button>
                        </Tip>
                    )}
                    <Tip label={retryable ? t('Remove') : t('Cancel and remove')} side="top">
                        <button
                            type="button" aria-label={retryable ? t('Remove {name}', { name: job.name }) : t('Cancel {name}', { name: job.name })}
                            onClick={onRemove}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <X className="size-3.5" aria-hidden />
                        </button>
                    </Tip>
                </span>
            )}
        </li>
    );
}
