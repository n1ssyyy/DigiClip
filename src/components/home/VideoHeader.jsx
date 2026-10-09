import { Merge, Play, ScrollText, Trash2 } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import { Button } from '../ui/button';
import { clipCountText, fmtDur, jobTags } from '../../lib/homeList';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

const quiet = 'px-2.5 text-[12px] text-muted-foreground hover:text-foreground';
/** The words of a labelled button: gone below 560px of header, where the icon
 *  keeps its tooltip and its aria-label. */
const words = 'hidden @min-[560px]:inline';

/** The head of the shown video: its name (15px, wraps, never cut), under it a
 *  line of facts, and quiet labelled buttons - Play original, and once it has
 *  clips Transcript, Merge clips and remove. Under 560px of header the words
 *  go and the icons stay. No rule below: spacing separates it from the tiles. */
export default function VideoHeader({ job, ready, onPlaySource, onTranscript, onMerge, onRemove }) {
    const t = useT();
    const facts = [fmtDur(job.duration_s), ready ? clipCountText((job.clips ?? []).length, t) : null, ...jobTags(job, t)].filter(Boolean);
    const canPlay = job.status !== 'downloading';

    return (
        <div className="@container shrink-0 px-3 pt-3 pb-1">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="min-w-[min(100%,240px)] flex-1">
                    <h2 className="text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{job.name}</h2>
                    {facts.length > 0 && (
                        <p className="mt-1 font-mono text-[10px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{facts.join(' · ')}</p>
                    )}
                </div>
                <span className="ml-auto flex shrink-0 items-center gap-1">
                    <Tip label={t('Play original')} side="top">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={!canPlay}
                            onClick={onPlaySource}
                            aria-label={t('Play {name}', { name: job.name })}
                            className={quiet}
                        >
                            <Play aria-hidden />
                            <span className={words}>{t('Play original')}</span>
                        </Button>
                    </Tip>
                    {ready && (
                        <>
                            <Tip label={t('Transcript: make a clip from any stretch')} side="top">
                                <Button type="button" size="sm" variant="ghost" onClick={onTranscript} aria-label={t('Open the transcript of {name}', { name: job.name })} className={quiet}>
                                    <ScrollText aria-hidden />
                                    <span className={words}>{t('Transcript')}</span>
                                </Button>
                            </Tip>
                            <Tip label={t('Merge picks into one video')} side="top">
                                <Button type="button" size="sm" variant="ghost" onClick={onMerge} aria-label={t('Merge {name} into one video', { name: job.name })} className={quiet}>
                                    <Merge aria-hidden />
                                    <span className={words}>{t('Merge clips')}</span>
                                </Button>
                            </Tip>
                            <Tip label={t('Remove')} side="top">
                                <Button type="button" size="sm" variant="ghost" onClick={onRemove} aria-label={t('Remove {name}', { name: job.name })} className={cn(quiet, 'w-8 px-0')}>
                                    <Trash2 aria-hidden />
                                </Button>
                            </Tip>
                        </>
                    )}
                </span>
            </div>
        </div>
    );
}
