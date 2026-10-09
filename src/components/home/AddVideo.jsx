import { Link2, UploadCloud } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import LookLine from '../digiclip/LookLine';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

/** Add a video: drop it on the box, click to browse, or paste a link, and see
 *  the Look the next video will be made with. With videos below it sits as a
 *  slim band (the box on the left, the link and the Look on the right); with
 *  none, `roomy` makes it the whole page, the box above the rest. */
export default function AddVideo({ add, roomy = false }) {
    const t = useT();
    const { link, setLink, linkOk, startFromLink, browse, uploading, dragging, dropHandlers } = add;

    return (
        <Card data-tour="add" className={cn('stagger-1 shrink-0', roomy ? 'w-full' : 'overflow-hidden')}>
            <div className={cn('p-2', roomy ? 'flex flex-col gap-2' : 'grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2')}>
                <div
                    role="button"
                    tabIndex={0}
                    aria-label={t('Pick a video to clip')}
                    onClick={browse}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            browse();
                        }
                    }}
                    {...dropHandlers}
                    className={cn(
                        'relative flex min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded border-2 border-dashed px-3 text-center transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        roomy ? 'h-44' : 'min-h-[104px]',
                        dragging ? 'border-primary bg-accent shadow-[0_0_0_3px_rgb(255_255_255/0.12),0_0_24px_rgb(255_255_255/0.08)]' : 'border-input hover:bg-accent/50',
                    )}
                >
                    <UploadCloud className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                    {uploading ? (
                        <span className="text-[13px] font-medium [overflow-wrap:anywhere]">{t('{name} — starting…', { name: uploading.name })}</span>
                    ) : (
                        <>
                            <span className="text-[13px] font-medium">{t('Drop a video here, or click to browse')}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">MP4 · MOV · MKV · WEBM{roomy ? ` · ${t('straight off your disk')}` : ''}</span>
                        </>
                    )}
                </div>
                <div className="flex min-w-0 flex-col justify-between">
                    <form className="flex h-8 shrink-0 items-stretch gap-1" onSubmit={(e) => { e.preventDefault(); startFromLink(); }}>
                        <div className="relative min-w-0 flex-1">
                            <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <input
                                type="url"
                                value={link}
                                onChange={(e) => setLink(e.target.value)}
                                placeholder={t('…or paste a link (YouTube, Vimeo, X…)')}
                                aria-label={t('Video link')}
                                className="h-full w-full min-w-0 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] pr-2 pl-8 text-[12px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>
                        <Button type="submit" size="sm" variant="secondary" disabled={!linkOk} className="h-full">
                            {t('Fetch')}
                        </Button>
                    </form>
                    <LookLine dim={dragging} />
                </div>
            </div>
        </Card>
    );
}
