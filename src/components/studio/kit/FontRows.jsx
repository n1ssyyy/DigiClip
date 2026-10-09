import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { useT } from '../../../lib/i18n';
import { cssFont } from '../../../lib/fontNames';
import { cn } from '../../../lib/utils';
import { ensureFace } from '../useFonts';

/** A family's name set in its own face (the interface face until it loads). */
export const faceStyle = (family) => ({ fontFamily: `${cssFont(family)}, 'JetBrains Mono', monospace` });

/** Load a row's face when the row first comes near the list's visible part. */
function useLazyFace(ref, rootRef, entry) {
    useEffect(() => {
        const el = ref.current;
        if (!el || !entry.file) return undefined;
        if (typeof IntersectionObserver === 'undefined') {
            ensureFace(entry);
            return undefined;
        }
        const io = new IntersectionObserver((hits) => {
            if (hits.some((h) => h.isIntersecting)) {
                ensureFace(entry);
                io.disconnect();
            }
        }, { root: rootRef.current, rootMargin: '120px 0px' });
        io.observe(el);
        return () => io.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref, rootRef, entry.family, entry.file, entry.rev]);
}

/**
 * One row of the picker: the family in its own face, a check on the current
 * one, "Default" on the layer's default, and for the creator's own fonts a
 * remove control that asks "Remove? Yes / No" in the row itself.
 */
export default function FontRow({
    id, entry, current, active, confirming, rootRef, onHover, onPick, onAskRemove, onRemove, onCancelRemove, removing,
}) {
    const t = useT();
    const ref = useRef(null);
    useLazyFace(ref, rootRef, entry);
    const custom = !entry.bundled;
    return (
        <div
            ref={ref}
            data-active={active || undefined}
            className={cn('group/row flex items-start rounded-sm', active && 'bg-white/[0.07]')}
            onPointerMove={onHover}
        >
            <div
                id={id}
                role="option"
                aria-selected={current}
                onClick={onPick}
                className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 px-2 py-1.5"
            >
                <Check className={cn('mt-[3px] size-3.5 shrink-0', current ? 'opacity-100' : 'opacity-0')} aria-hidden />
                <span className="min-w-0 flex-1">
                    <span style={faceStyle(entry.family)} className="block text-[15px] leading-snug break-words">{entry.family}</span>
                    {entry.isDefault && <span className="block text-[10px] leading-snug text-muted-foreground">{t('Default')}</span>}
                    {confirming && (
                        <span className="mt-1 flex items-center gap-1.5 text-[11px]">
                            <span className="text-muted-foreground">{t('Remove?')}</span>
                            <button
                                type="button"
                                disabled={removing}
                                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                                className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                            >
                                {t('Yes')}
                            </button>
                            <button
                                type="button"
                                autoFocus
                                disabled={removing}
                                onClick={(e) => { e.stopPropagation(); onCancelRemove(); }}
                                className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                            >
                                {t('No')}
                            </button>
                        </span>
                    )}
                </span>
            </div>
            {custom && !confirming && (
                <button
                    type="button"
                    aria-label={t('Remove {name}', { name: entry.family })}
                    onClick={onAskRemove}
                    className="m-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-60 transition-[opacity,color,background-color] hover:bg-white/10 hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-hover/row:opacity-100"
                >
                    <X className="size-3.5" aria-hidden />
                </button>
            )}
        </div>
    );
}
