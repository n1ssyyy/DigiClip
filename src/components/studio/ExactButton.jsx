import { Loader2, ScanEye } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';

/** The "Exact frame" button of the top bar: a real render of the stage at the
 *  playhead. It shrinks to its icon when the page is narrow; the tooltip says
 *  what it does, or why it cannot yet. */
export default function ExactButton({ exact, narrow }) {
    const t = useT();
    const pending = exact.phase === 'pending';
    const shown = exact.phase === 'shown';
    const Icon = pending ? Loader2 : ScanEye;
    const tip = exact.ok ? t('Render the real frame at the playhead, as the engine draws it.') : t(exact.reason);
    return (
        <Tip label={tip} side="bottom">
            <button
                type="button"
                aria-label={t('Exact frame')}
                aria-disabled={!exact.ok || undefined}
                aria-busy={pending || undefined}
                aria-pressed={shown}
                onClick={exact.request}
                className={cn(
                    'flex h-8 shrink-0 items-center justify-center gap-2 rounded-md text-[12px] transition-[background-color,color,transform] outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    narrow ? 'w-8' : 'min-w-[7.75rem] px-2.5',
                    !exact.ok ? 'cursor-not-allowed text-muted-foreground/40' : shown ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95',
                    pending && 'cursor-progress text-foreground',
                )}
            >
                <Icon className={cn('size-4 shrink-0', pending && 'motion-safe:animate-spin')} aria-hidden />
                {!narrow && <span className="whitespace-nowrap">{pending ? t('Rendering…') : t('Exact frame')}</span>}
            </button>
        </Tip>
    );
}
