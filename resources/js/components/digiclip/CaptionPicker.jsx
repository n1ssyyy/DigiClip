import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export const CAPTION_STYLES = ['tiktok', 'karaoke', 'hormozi', 'minimal'];

const inputCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Caption style picker — same trigger + popover language as ModelPicker,
 * minus the catalog machinery (four fixed styles).
 */
export default function CaptionPicker({ value, onChange }) {
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

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={cn(inputCls, 'cursor-pointer items-center justify-between text-left')}
            >
                <span className="truncate font-mono text-[13px]">{value || 'Select a style…'}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>

            {open && (
                <div className="absolute z-20 mt-1.5 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                    <ul role="listbox" aria-label="Caption styles" className="p-1">
                        {CAPTION_STYLES.map((s) => (
                            <li key={s} role="option" aria-selected={s === value}>
                                <button
                                    type="button"
                                    onClick={() => { onChange(s); setOpen(false); }}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-accent',
                                        s === value && 'bg-accent',
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{s}</span>
                                    {s === value && <Check className="size-4 shrink-0" aria-hidden />}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
