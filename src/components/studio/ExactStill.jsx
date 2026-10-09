import { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import { renderTime, warningLine } from '../../lib/exactFrame';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';

const typing = (el) => !!el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
const CHIP = 'rounded-[4px] bg-black/65 text-white/90 shadow-[0_1px_4px_rgb(0_0_0/0.5)]';

/** The thin line along the top of the frame while the engine is rendering. */
export function ExactLine() {
    const t = useT();
    return (
        <div role="progressbar" aria-label={t('Rendering the exact frame')} className="exact-line pointer-events-none absolute inset-x-0 top-0 z-20 h-[2px] overflow-hidden rounded-t-[4px]" />
    );
}

/**
 * The engine's own still, over the frame and exactly covering it. While the
 * pointer (or the C key) is held on "hold to compare" the still hides and the
 * stage's imitation shows. It stays on top of the stage, so the layers under
 * it cannot be dragged; the transport and the inspector are outside it.
 */
export default function ExactStill({ exact }) {
    const t = useT();
    const [compare, setCompare] = useState(false);
    const { dismiss } = exact;

    useEffect(() => {
        const down = (e) => {
            if (e.key === 'Escape' && !e.defaultPrevented) {
                e.preventDefault();
                dismiss();
            } else if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) {
                e.preventDefault();
                setCompare(true);
            }
        };
        const up = (e) => { if (e.key === 'c' || e.key === 'C') setCompare(false); };
        const off = () => setCompare(false);
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', off);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', off);
        };
    }, [dismiss]);

    const warn = warningLine(exact.data?.warnings);
    const hold = {
        onPointerDown: (e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setCompare(true);
        },
        onPointerUp: () => setCompare(false),
        onPointerCancel: () => setCompare(false),
        onLostPointerCapture: () => setCompare(false),
        // Space and Enter on the focused button hold it too, for as long as they are down.
        onKeyDown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); setCompare(true); } },
        onKeyUp: (e) => { if (e.key === ' ' || e.key === 'Enter') setCompare(false); },
        onBlur: () => setCompare(false),
    };

    return (
        <div className="@container absolute inset-0 z-20 overflow-hidden rounded-[4px]" onPointerDown={(e) => e.stopPropagation()}>
            <img
                src={exact.url}
                alt={t('Exact frame')}
                draggable={false}
                className={cn('fade absolute inset-0 size-full object-fill select-none transition-opacity duration-100 motion-reduce:transition-none', compare && 'opacity-0')}
            />
            <div className="fade absolute inset-x-2 top-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <p className={cn(CHIP, 'inline-block max-w-full truncate px-1.5 py-0.5 font-mono text-[10px]')}>
                        {t('Exact frame')} · {renderTime(exact.data?.ms)}
                    </p>
                    {warn && <p title={warn} className={cn(CHIP, 'mt-1 block max-w-full truncate px-1.5 py-0.5 font-mono text-[10px]')}>{warn}</p>}
                </div>
                <Tip label={`${t('Hold to compare')} · C`} side="bottom">
                    <button
                        type="button"
                        aria-label={t('Hold to compare')}
                        {...hold}
                        className={cn(CHIP, 'flex h-6 shrink-0 items-center gap-1.5 px-1.5 text-[10px] outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-ring', compare && 'bg-white/25')}
                    >
                        <Eye className="size-3.5" aria-hidden />
                        <span className="hidden @min-[300px]:inline">{t('Hold to compare')}</span>
                    </button>
                </Tip>
                <Tip label={`${t('Close')} · Esc`} side="bottom">
                    <button type="button" aria-label={t('Close')} onClick={dismiss} className={cn(CHIP, 'flex size-6 shrink-0 items-center justify-center outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-ring')}>
                        <X className="size-3.5" aria-hidden />
                    </button>
                </Tip>
            </div>
        </div>
    );
}
