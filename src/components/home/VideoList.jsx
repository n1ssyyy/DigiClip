import { Trash2 } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import VideoRow from './VideoRow';
import { retryJob } from '../../lib/socket';
import { useT } from '../../lib/i18n';

/** "Your videos": every video, newest first, one row each, the current one
 *  marked. It scrolls by itself, so a dozen videos or fifty never grow the
 *  page. Up and down move between rows. The bulk remove shows once two or more
 *  videos are finished. */
export default function VideoList({ rows, activeId, seen, finishedCount, onPick, onRemove, onClear }) {
    const t = useT();

    function onKeyDown(e) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const at = rows.findIndex((r) => r.job.id === activeId);
        const next = rows[at + (e.key === 'ArrowDown' ? 1 : -1)];
        if (!next) return;
        e.preventDefault();
        onPick(next.job.id);
        const list = e.currentTarget;
        requestAnimationFrame(() => list.querySelector(`[data-video="${CSS.escape(next.job.id)}"]`)?.focus());
    }

    return (
        <div className="flex min-h-0 w-[clamp(216px,26%,300px)] shrink-0 flex-col border-r border-border">
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 pr-1.5 pl-3">
                <h2 className="flex items-baseline gap-2 text-[13px] font-semibold">
                    {t('Your videos')}
                    <span className="font-mono text-[10px] font-normal text-muted-foreground tabular-nums">{rows.length}</span>
                </h2>
                {finishedCount >= 2 && (
                    <Tip label={t('Remove finished videos')} side="top">
                        <button
                            type="button" aria-label={t('Remove finished videos')}
                            onClick={onClear}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <Trash2 className="size-4" aria-hidden />
                        </button>
                    </Tip>
                )}
            </div>
            <ul aria-label={t('Your videos')} onKeyDown={onKeyDown} className="digi-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-1.5 [scrollbar-gutter:stable]">
                {rows.map(({ job }) => (
                    <VideoRow
                        key={job.id}
                        job={job}
                        current={job.id === activeId}
                        fresh={!seen.has(job.id)}
                        onPick={() => onPick(job.id)}
                        onRetry={() => retryJob(job.id)}
                        onRemove={() => onRemove(job)}
                    />
                ))}
            </ul>
        </div>
    );
}
