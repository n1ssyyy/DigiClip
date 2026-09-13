import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import ProgressRing from './ProgressRing';
import { usePanelBeat } from './usePanelBeat';
import { useFloatingPanel } from './useFloatingPanel';

const inputCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Transcription-model picker, same design system as ModelPicker
 * (trigger, popover panel, neutral scrollbar, check mark).
 * Options: [{ id, size_mb }] from config; badges call out the sweet spots.
 *
 * On-demand models: picking a row that is not on disk yet selects it AND
 * starts a background download (onDownload). The row's left slot shows a
 * hollow ring filling with progress; a finished row shows the check.
 * status: { [id]: { downloaded, downloading, progress, failed, error } }
 */
export default function SttModelPicker({ value, onChange, options, downloaded = {}, status = {}, onDownload }) {
    const [open, setOpen] = useState(false);
    const { show: panelShow, leaving: panelLeaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const panelPos = useFloatingPanel(panelShow, rootRef);

    useEffect(() => {
        const onDown = (e) => {
            if (e.key === 'Escape') setOpen(false);
            if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
            setOpen(false);
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
    const live = (id) => status?.[id] ?? {};
    const isDownloaded = (id) => live(id).downloaded ?? !!downloaded[id];
    const isDownloading = (id) => !!live(id).downloading;
    const progressOf = (id) => live(id).progress ?? 0;
    const isFailed = (id) => !!live(id).failed;

    const pick = (id) => {
        onChange(id);
        setOpen(false);
        // First touch fetches the weights in the background; the ring on
        // the row tracks it. Selecting again after a failure retries.
        if (!isDownloaded(id) && !isDownloading(id)) onDownload?.(id);
    };

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
                <span className="flex min-w-0 items-center gap-2 truncate font-mono text-[13px]">
                    {isDownloading(value) && <ProgressRing value={progressOf(value)} label={`Downloading ${value}`} />}
                    <span className="truncate">
                        {value}{current ? ` · ${current.size_mb}MB` : ''}{isDownloading(value) ? ` · ${progressOf(value)}%` : ''}
                    </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>

            {panelShow && panelPos && createPortal(
                <div ref={panelRef} style={panelPos} className={cn('digi-menu fixed z-[100] rounded-md border bg-popover text-popover-foreground shadow-md', panelLeaving ? 'menu-out' : 'pop')}>
                    <ul role="listbox" aria-label="Transcription models" className="digi-scroll max-h-64 overflow-y-auto p-1">
                        {entries.map(([id, m]) => (
                            <li key={id} role="option" aria-selected={id === value}>
                                <div
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-sm px-2 py-1.5 hover:bg-accent',
                                        id === value && 'bg-accent',
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => pick(id)}
                                        aria-label={`Select ${id}`}
                                        className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    >
                                        {isDownloading(id) ? (
                                            <ProgressRing value={progressOf(id)} label={`Downloading ${id}`} />
                                        ) : (
                                            id === value && <Check className="size-4 shrink-0" aria-hidden />
                                        )}
                                        <span className="min-w-0 flex-1 truncate font-mono text-xs">{id}</span>
                                    </button>
                                    <span className="flex shrink-0 items-center gap-1.5">
                                        {isDownloaded(id) && (
                                            <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                                on disk
                                            </span>
                                        )}
                                        {isDownloading(id) && (
                                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                                                {progressOf(id)}%
                                            </span>
                                        )}
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
                                        {!isDownloaded(id) && !isDownloading(id) && (
                                            <button
                                                type="button"
                                                aria-label={isFailed(id) ? `Retry downloading ${id}` : `Download ${id} (${m.size_mb}MB)`}
                                                title={isFailed(id) ? (live(id).error ?? 'Download failed — retry') : `Download ${m.size_mb}MB in the background`}
                                                onClick={() => onDownload?.(id)}
                                                className={cn(
                                                    'flex size-6 items-center justify-center rounded-md border border-transparent transition-colors',
                                                    'hover:border-input hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                                    isFailed(id) ? 'text-destructive' : 'text-muted-foreground hover:text-foreground',
                                                )}
                                            >
                                                <Download className="size-3.5" aria-hidden />
                                            </button>
                                        )}
                                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{m.size_mb}MB</span>
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>, document.body,
            )}
        </div>
    );
}
