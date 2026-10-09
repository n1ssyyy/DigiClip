import { FileVideo, RotateCcw, X } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import { FadeImg } from '../digiclip/Skeleton';
import { artUrl } from '../../lib/socket';
import { fitName } from '../../lib/clipGrid';
import { rowMeta } from '../../lib/homeList';
import { cn } from '../../lib/utils';
import { getLang, useT } from '../../lib/i18n';

const TONE = { work: 'text-orange-500', bad: 'text-red-500', ok: 'text-muted-foreground' };
const DOT = { work: 'animate-pulse bg-orange-500', bad: 'bg-red-500', new: 'bg-foreground' };

/** One video in the list: a 64x36 thumbnail (its poster; a quiet film icon
 *  until there is one), its name (two lines at most, shortened at a word with
 *  an ellipsis; the full name is the row's tooltip and accessible name) and ONE
 *  meta line - "6 clips · 3 Oct" for a finished video, the stage word for one
 *  being worked on, "Failed" / "Cancelled" - which wraps only at word gaps,
 *  with a thin bar under it while it is being worked on. The dot sits in the
 *  meta line: white = finished and not opened yet (none once it has been),
 *  orange pulsing = being worked on, red = failed or cancelled. A video that is
 *  running, failed or cancelled carries its own cancel / retry / remove
 *  buttons, set beside the name so the meta line keeps the full width. The
 *  current row wears the accent background and a 2px bar on its left edge.
 *  `listW` is the list's width, for shortening the name. */
export default function VideoRow({ job, current, fresh, listW, onPick, onRetry, onRemove }) {
    const t = useT();
    const st = rowMeta(job, { tr: t, locale: getLang(), fresh });
    const retryable = st.phase === 'failed' || st.phase === 'cancelled';
    const actions = st.phase === 'working' || retryable;
    const buttons = retryable ? 2 : actions ? 1 : 0;

    return (
        <li className={cn('queue-in relative rounded-md transition-colors', current ? 'bg-accent' : 'hover:bg-accent/50')}>
            {current && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-foreground" />}
            <button
                type="button"
                data-video={job.id}
                aria-current={current || undefined}
                onClick={onPick}
                title={job.name}
                aria-label={`${job.name}, ${st.text}`}
                className="flex w-full min-w-0 items-start gap-2 rounded-md p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span className="relative mt-px block h-9 w-16 shrink-0 overflow-hidden rounded bg-muted">
                    <FileVideo className="absolute inset-0 m-auto size-4 text-muted-foreground/60" aria-hidden />
                    <FadeImg src={artUrl(job.id, 'poster.jpg')} />
                </span>
                <span className="min-w-0 flex-1">
                    <span
                        className={cn(
                            'line-clamp-2 text-[12px] leading-snug [overflow-wrap:anywhere]',
                            current ? 'font-semibold' : 'font-medium',
                            buttons === 2 && 'min-h-[22px] pr-[50px]',
                            buttons === 1 && 'min-h-[22px] pr-7',
                        )}
                    >
                        {fitName(job.name, listW, buttons)}
                    </span>
                    <span className={cn('mt-0.5 flex items-baseline gap-1.5 font-mono text-[10px] leading-snug', TONE[st.tone])}>
                        {st.dot && <span className={cn('size-1.5 shrink-0 translate-y-px self-center rounded-full motion-safe:transition-colors motion-safe:duration-500', DOT[st.dot])} aria-hidden />}
                        <span className="min-w-0 break-normal">{st.text}</span>
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
                <span className="absolute top-1 right-1 flex items-center">
                    {retryable && (
                        <Tip label={t('Retry')} side="top">
                            <button
                                type="button" aria-label={t('Retry {name}', { name: job.name })}
                                onClick={onRetry}
                                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                                <RotateCcw className="size-3.5" aria-hidden />
                            </button>
                        </Tip>
                    )}
                    <Tip label={retryable ? t('Remove') : t('Cancel and remove')} side="top">
                        <button
                            type="button" aria-label={retryable ? t('Remove {name}', { name: job.name }) : t('Cancel {name}', { name: job.name })}
                            onClick={onRemove}
                            className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <X className="size-3.5" aria-hidden />
                        </button>
                    </Tip>
                </span>
            )}
        </li>
    );
}
