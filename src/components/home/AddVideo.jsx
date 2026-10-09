import { Clapperboard, UploadCloud } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import LookLine from '../digiclip/LookLine';
import { navigate } from '../../lib/socket';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

const fieldClass = 'h-8 w-full min-w-0 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] pr-2 pl-8 text-[12px] outline-none';

/** Add a video, and see how the next one will be made. With videos below it is
 *  one slim card, every control 32px high on one baseline: a field that takes a
 *  pasted link (an upload icon inside) and one action beside it - Browse while
 *  the field is empty, Fetch once something is typed - then the four pickers
 *  (Look, Picking, Clips, Shape) of one width and a quiet way into Studio.
 *  Where the card is wide enough (1160px, measured on the card, not the
 *  window) that is one row; narrower it is two aligned rows: field and action,
 *  then the pickers and Studio. Dropping a file works anywhere on the page
 *  (Home paints the overlay), so there is no drop box here. With no videos at
 *  all, `roomy` makes it the page: the big box in the middle, the field and
 *  the pickers under it. */
export default function AddVideo({ add, roomy = false }) {
    const t = useT();
    const { link, setLink, linkOk, startFromLink, browse, uploading } = add;
    const typed = link.trim() !== '';

    const field = (
        <div className="relative min-w-0 flex-1">
            <UploadCloud className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            {uploading ? (
                <div role="status" className={cn(fieldClass, 'flex items-center')}>
                    <span className="truncate">{t('{name} — starting…', { name: uploading.name })}</span>
                </div>
            ) : (
                <input
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder={t('Paste a link or drop a video')}
                    aria-label={t('Video link')}
                    className={cn(fieldClass, 'placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring')}
                />
            )}
        </div>
    );
    const action = (
        <Button
            type={typed ? 'submit' : 'button'}
            size="sm"
            variant="secondary"
            disabled={typed && !linkOk}
            onClick={typed ? undefined : browse}
            className={cn('shrink-0 px-2', roomy ? 'w-[104px]' : 'w-[136px] @min-[1160px]:w-full')}
        >
            {typed ? t('Fetch') : t('Browse')}
        </Button>
    );
    const form = (className) => (
        <form
            className={cn('flex min-w-0 gap-2', className)}
            onSubmit={(e) => {
                e.preventDefault();
                if (typed) startFromLink();
            }}
        >
            {field}
            {action}
        </form>
    );
    const studio = (className) => (
        <Button type="button" size="sm" variant="ghost" onClick={() => navigate('studio')} className={cn('px-2.5 text-muted-foreground hover:text-foreground', className)}>
            <Clapperboard aria-hidden />
            {t('Open Studio')}
        </Button>
    );

    if (roomy) {
        return (
            <Card data-tour="add" className="stagger-1 w-full shrink-0">
                <div className="flex flex-col gap-2 p-2">
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
                        className="flex h-44 min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded border-2 border-dashed border-input px-3 text-center transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <UploadCloud className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                        {uploading ? (
                            <span className="text-[13px] font-medium [overflow-wrap:anywhere]">{t('{name} — starting…', { name: uploading.name })}</span>
                        ) : (
                            <>
                                <span className="text-[13px] font-medium">{t('Drop a video here, or click to browse')}</span>
                                <span className="font-mono text-[10px] text-muted-foreground">MP4 · MOV · MKV · WEBM · {t('straight off your disk')}</span>
                            </>
                        )}
                    </div>
                    {form()}
                    <div className="grid grid-cols-2 gap-2">
                        <LookLine />
                        {studio('col-span-2 w-full')}
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card data-tour="add" className="@container stagger-1 shrink-0">
            <div className="grid grid-cols-[repeat(4,minmax(0,1fr))_136px] items-center gap-2 p-2 @min-[1160px]:grid-cols-[minmax(260px,1fr)_96px_repeat(4,minmax(148px,164px))_auto]">
                {form('col-span-full @min-[1160px]:contents')}
                <LookLine />
                {studio('w-full')}
            </div>
        </Card>
    );
}
