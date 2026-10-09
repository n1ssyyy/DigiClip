import { FileVideo, Merge, Play, ScrollText, Trash2 } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import { FadeImg } from '../digiclip/Skeleton';
import { artUrl } from '../../lib/socket';
import { clipCountText, fmtDur, jobTags } from '../../lib/homeList';
import { useT } from '../../lib/i18n';

const iconBtn = 'shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50';

/** The head of the shown video: its poster (click to play the original), its
 *  name in full, a line of facts, and - once it has clips - the transcript, the
 *  merge into one video, and remove. */
export default function VideoHeader({ job, ready, onPlaySource, onTranscript, onMerge, onRemove }) {
    const t = useT();
    const facts = [fmtDur(job.duration_s), ready ? clipCountText((job.clips ?? []).length, t) : null, ...jobTags(job, t)].filter(Boolean);
    const canPlay = job.status !== 'downloading';

    return (
        <div className="flex shrink-0 items-start gap-3 border-b border-border p-2.5">
            <Tip label={t('Play {name}', { name: job.name })} side="bottom" className="shrink-0">
                <button
                    type="button"
                    aria-label={t('Play {name}', { name: job.name })}
                    disabled={!canPlay}
                    onClick={onPlaySource}
                    className="group relative block h-[54px] w-24 overflow-hidden rounded bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <FileVideo className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
                    <FadeImg src={artUrl(job.id, 'poster.jpg')} eager />
                    {canPlay && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40 group-focus-visible:bg-black/40">
                            <Play className="size-5 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                        </span>
                    )}
                </button>
            </Tip>
            <div className="min-w-0 flex-1">
                <h2 className="text-[13px] leading-snug font-semibold [overflow-wrap:anywhere]">{job.name}</h2>
                {facts.length > 0 && (
                    <p className="mt-1 font-mono text-[10px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{facts.join(' · ')}</p>
                )}
            </div>
            {ready && (
                <span className="flex shrink-0 items-center gap-0.5">
                    <Tip label={t('Transcript: make a clip from any stretch')} side="top">
                        <button type="button" aria-label={t('Open the transcript of {name}', { name: job.name })} onClick={onTranscript} className={iconBtn}>
                            <ScrollText className="size-4" aria-hidden />
                        </button>
                    </Tip>
                    <Tip label={t('Merge picks into one video')} side="top">
                        <button type="button" aria-label={t('Merge {name} into one video', { name: job.name })} onClick={onMerge} className={iconBtn}>
                            <Merge className="size-4" aria-hidden />
                        </button>
                    </Tip>
                    <Tip label={t('Remove')} side="top">
                        <button type="button" aria-label={t('Remove {name}', { name: job.name })} onClick={onRemove} className={iconBtn}>
                            <Trash2 className="size-4" aria-hidden />
                        </button>
                    </Tip>
                </span>
            )}
        </div>
    );
}
