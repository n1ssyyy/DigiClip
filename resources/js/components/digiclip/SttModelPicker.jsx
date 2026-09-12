import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const inputCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Transcription-model picker, same design system as ModelPicker
 * (trigger, popover panel, neutral scrollbar, check mark).
 * Options: [{ id, size_mb }] from config; badges call out the sweet spots.
 */
export default function SttModelPicker({ value, onChange, options }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        const onDown = (e) => {
            if (e.key === 'Escape') setOpen(false);
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onDown);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onDown);
        };
    }, []);

    const entries = Object.entries(options ?? {});
    const current = options?.[value];

    const tag = (id) => {
        if (id === 'base.en') return 'FAST';
        if (id === 'large-v3-turbo-q5_0') return 'BEST';
        if (id === 'tiny.en') return 'TINY';
        return null;
    };

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={cn(inputCls, 'cursor-pointer items-center justify-between text-left')}
            >
                <span className="truncate font-mono text-[13px]">
                    {value}{current ? ` · ${current.size_mb}MB` : ''}
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>

            {open && (
                <div className="absolute z-20 mt-1.5 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                    <ul role="listbox" aria-label="Transcription models" className="digi-scroll max-h-64 overflow-y-auto p-1">
                        {entries.map(([id, m]) => (
                            <li key={id} role="option" aria-selected={id === value}>
                                <button
                                    type="button"
                                    onClick={() => { onChange(id); setOpen(false); }}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-accent',
                                        id === value && 'bg-accent',
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{id}</span>
                                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{m.size_mb}MB</span>
                                    {tag(id) && (
                                        <span className={cn(
                                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                                            id === 'large-v3-turbo-q5_0'
                                                ? 'bg-[var(--viral)] text-black'
                                                : 'bg-secondary text-secondary-foreground',
                                        )}>
                                            {tag(id)}
                                        </span>
                                    )}
                                    {id === value && <Check className="size-4 shrink-0" aria-hidden />}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
