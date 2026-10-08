import { useId, useRef, useState } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';
import Tip from '../../digiclip/Tooltip';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/utils';
import { OpenContext } from './context';

const KEY = 'digiclip.studio.captionSections';

function readOpen() {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
        return {};
    }
}

function writeOpen(id, open) {
    try {
        localStorage.setItem(KEY, JSON.stringify({ ...readOpen(), [id]: open }));
    } catch {
    }
}

/**
 * One collapsible section of the caption inspector. The header is one row: a
 * real button (aria-expanded) with the name and, when anything inside
 * changes the style's look, a small dot; the reset-section button sits at the
 * row's end and shows on hover and whenever focus is inside the row. Open or
 * closed is remembered per section; the first section starts open.
 */
export default function Section({ id, title, changed, onReset, firstOpen = false, children }) {
    const t = useT();
    const uid = useId();
    const [open, setOpen] = useState(() => {
        const saved = readOpen()[id];
        return typeof saved === 'boolean' ? saved : firstOpen;
    });
    // Content mounts when first opened and stays, so closing keeps its state.
    const seen = useRef(open);
    if (open) seen.current = true;

    function toggle() {
        setOpen((o) => {
            writeOpen(id, !o);
            return !o;
        });
    }

    return (
        <section className="border-t border-white/[0.06] first:border-t-0">
            <div className="group/sec relative">
                <h3 className="m-0">
                    <button
                        type="button"
                        id={`${uid}-h`}
                        aria-expanded={open}
                        aria-controls={`${uid}-p`}
                        onClick={toggle}
                        className="flex h-9 w-full items-center gap-1.5 rounded-md pr-8 pl-0.5 text-left text-[12px] font-medium transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <ChevronRight
                            className={cn('size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-[160ms] motion-safe:ease-[var(--ease-out)]', open && 'rotate-90')}
                            aria-hidden
                        />
                        <span className="truncate">{title}</span>
                        {changed && (
                            <>
                                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-foreground/70" />
                                <span className="sr-only">{t('Changed from the style')}</span>
                            </>
                        )}
                    </button>
                </h3>
                {changed && onReset && (
                    <Tip label={t('Back to the style’s own values')} side="left" className="absolute top-1/2 right-1 -translate-y-1/2">
                        <button
                            type="button"
                            aria-label={t('Reset {name}', { name: title })}
                            onClick={onReset}
                            className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,color,background-color] group-focus-within/sec:opacity-100 group-hover/sec:opacity-100 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <RotateCcw className="size-3" aria-hidden />
                        </button>
                    </Tip>
                )}
            </div>
            <div
                id={`${uid}-p`}
                role="region"
                aria-labelledby={`${uid}-h`}
                inert={!open}
                className={cn(
                    'grid transition-[grid-template-rows] duration-[160ms] ease-[var(--ease-out)] motion-reduce:transition-none',
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
            >
                <div className="min-h-0 overflow-hidden">
                    <OpenContext.Provider value={open}>
                        {seen.current && <div className="space-y-3 px-1 pt-1 pb-4">{children}</div>}
                    </OpenContext.Provider>
                </div>
            </div>
        </section>
    );
}
