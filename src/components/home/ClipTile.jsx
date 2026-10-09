import { Download, Film, Loader2 } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import { FadeImg } from '../digiclip/Skeleton';
import { overall, scoreTone } from '../digiclip/ClipInsights';
import { artUrl, downloadArt, flashMessage } from '../../lib/socket';
import { charsPerLine, clipShape, fitTitle } from '../../lib/clipGrid';
import { fmtRange } from '../../lib/homeList';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

/** One generated clip, whole: the poster in the clip's own shape (the burned-in
 *  caption is never cropped), with its score on it; under it the title (two
 *  lines, shortened at a word when longer), the number and time range, and the
 *  download the moment the file exists. Opens the player on click or Enter. */
export default function ClipTile({ job, clip, width, onPlay }) {
    const t = useT();
    const playable = clip.render_status === 'done' && clip.mp4;
    const failed = clip.render_status === 'failed';
    // Progress covers the whole making phase: face-tracking reports
    // first (render_pct is still 0), the encode takes over after.
    const progress = (clip.render_pct ?? 0) > 0 ? clip.render_pct : (clip.track_pct ?? 0);
    const rendering = clip.render_status === 'rendering' && progress > 0;
    const shape = clipShape(clip, job);
    const fileName = `digiclip-clip${clip.rank}-${shape.tag}.mp4`;
    const score = overall(clip);
    const title = clip.title || t('Clip #{n}', { n: clip.rank });
    const range = fmtRange(clip.start_s, clip.end_s);
    const play = () => onPlay({
        title,
        sub: job.name,
        src: artUrl(job.id, clip.mp4, clip.rev),
        shape,
        download: { url: artUrl(job.id, clip.mp4, clip.rev), filename: fileName },
        kit: clip.kit ? { job: job.id, rank: clip.rank, filename: clip.kit } : null,
        clipRef: { job: job.id, rank: clip.rank },
    });
    const save = (e) => {
        e.stopPropagation();
        downloadArt(artUrl(job.id, clip.mp4, clip.rev), fileName)
            .catch((err) => flashMessage(t('Couldn\'t save video: {error}', { error: err?.message ?? err })));
    };

    return (
        <div
            role={playable ? 'button' : undefined}
            tabIndex={playable ? 0 : undefined}
            aria-label={playable ? t('Play {name}', { name: title }) : undefined}
            onClick={playable ? play : undefined}
            onKeyDown={playable ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    play();
                }
            } : undefined}
            className={cn(
                'tile-in flex min-w-0 flex-col gap-1.5 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-card p-1.5 outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring',
                playable && 'cursor-pointer transition-colors hover:border-t-white/30 hover:border-x-white/[0.16]',
            )}
        >
            <span className="relative block w-full overflow-hidden rounded bg-muted/50" style={{ aspectRatio: `${shape.w} / ${shape.h}` }}>
                <Film className="absolute inset-0 m-auto size-4 text-muted-foreground/50" aria-hidden />
                {playable && clip.poster && (
                    <FadeImg key={clip.rev ?? 0} src={artUrl(job.id, clip.poster, clip.rev)} imgClassName="h-full w-full object-contain" />
                )}
                {score != null && (
                    <Tip label={t('Virality score (open the clip for why)')} side="top" className="absolute top-1 left-1">
                        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white tabular-nums">
                            <span className={cn('size-1.5 rounded-full', scoreTone(score))} aria-hidden />
                            {score}
                        </span>
                    </Tip>
                )}
                {rendering && (
                    <span
                        aria-hidden
                        className="absolute right-0 bottom-0 left-0 h-[2px] bg-white/80 motion-safe:transition-[width] motion-safe:duration-300"
                        style={{ width: `${progress}%` }}
                    />
                )}
            </span>
            <span className="block text-[11px] leading-snug font-medium [overflow-wrap:anywhere]" title={title}>
                {fitTitle(title, charsPerLine(width))}
            </span>
            <span className="flex min-h-6 items-center justify-between gap-1 font-mono text-[10px] text-muted-foreground">
                <span className="min-w-0 [overflow-wrap:anywhere]">#{clip.rank}{range ? ` · ${range}` : ''}</span>
                <span key={playable ? 'done' : failed ? 'failed' : 'making'} className="fade inline-flex shrink-0">
                    {playable ? (
                        <Tip label={t('Download clip #{n}', { n: clip.rank })} side="top">
                            <button
                                type="button"
                                aria-label={t('Download clip #{n}', { n: clip.rank })}
                                onClick={save}
                                className="shrink-0 rounded-md p-1 text-foreground hover:bg-accent"
                            >
                                <Download className="size-3.5" aria-hidden />
                            </button>
                        </Tip>
                    ) : failed ? (
                        <span className="text-red-500">{t('failed')}</span>
                    ) : (
                        <Tip label={t('Clip is being made')} side="top">
                            <span className="flex items-center gap-1">
                                {t('making')}{rendering ? ` ${progress}%` : ''}
                                <Loader2 className="size-3 animate-spin" aria-hidden />
                            </span>
                        </Tip>
                    )}
                </span>
            </span>
        </div>
    );
}
