import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Download, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import ProgressRing from './ProgressRing';
import { usePanelBeat } from './usePanelBeat';
import { useFloatingPanel } from './useFloatingPanel';
import { useT } from '../../lib/i18n';

const inputCls = 'flex h-9 w-full rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-3 py-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
export default function SttModelPicker({ value, onChange, options, downloaded = {}, status = {}, onDownload, onDelete }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const { show: panelShow, leaving: panelLeaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const panelPos = useFloatingPanel(panelShow, rootRef);
    // Two-step delete confirm, per row: first click arms, second deletes.
    const [confirmId, setConfirmId] = useState(null);
    const confirmTimer = useRef(null);

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

    useEffect(() => () => {
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
    }, []);

    const askDelete = (id) => {
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        setConfirmId(id);
        confirmTimer.current = setTimeout(() => {
            setConfirmId(null);
            confirmTimer.current = null;
        }, 3000);
    };
    const confirmDelete = (id) => {
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        confirmTimer.current = null;
        setConfirmId(null);
        onDelete?.(id);
    };

    const tag = (id) => {
        if (id === 'base.en') return t('FAST');
        if (id === 'large-v3-turbo-q5_0') return t('BEST');
        if (id === 'tiny.en') return t('TINY');
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
                <span className="flex min-w-0 items-center gap-2 truncate font-mono text-xs">
                    {isDownloading(value) && <ProgressRing value={progressOf(value)} label={t('Downloading {id}', { id: value })} />}
                    <span className="truncate">
                        {value}{current ? ` · ${current.size_mb}MB` : ''}{isDownloading(value) ? ` · ${progressOf(value)}%` : ''}
                    </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>

            {panelShow && panelPos && createPortal(
                <div ref={panelRef} style={panelPos} className={cn('digi-menu fixed z-[100] rounded-md border bg-popover text-popover-foreground shadow-md', panelLeaving ? 'menu-out' : 'pop')}>
                    <ul role="listbox" aria-label={t('Transcription models')} className="digi-scroll max-h-64 overflow-y-auto p-1">
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
                                        aria-label={t('Select {id}', { id })}
                                        className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    >
                                        {isDownloading(id) ? (
                                            <ProgressRing value={progressOf(id)} label={t('Downloading {id}', { id })} />
                                        ) : (
                                            id === value && <Check className="size-4 shrink-0" aria-hidden />
                                        )}
                                        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{id}</span>
                                    </button>
                                    <span className="flex shrink-0 items-center gap-1.5">
                                        {isDownloaded(id) && (
                                            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                                {t('on disk')}
                                            </span>
                                        )}
                                        {tag(id) && (
                                            <span className={cn(
                                                'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                                                id === 'large-v3-turbo-q5_0'
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-secondary text-secondary-foreground',
                                            )}>
                                                {tag(id)}
                                            </span>
                                        )}
                                        {isDownloading(id) ? (
                                            <span className="flex h-6 shrink-0 items-center font-mono text-[10px] text-muted-foreground tabular-nums">
                                                {progressOf(id)}%
                                            </span>
                                        ) : isDownloaded(id) ? (
                                            confirmId === id ? (
                                                <span className="flex shrink-0 items-center gap-1">
                                                    <span className="text-[10px] font-medium text-destructive">{t('Delete?')}</span>
                                                    <button
                                                        type="button"
                                                        aria-label={t('Confirm deleting {id} weights', { id })}
                                                        onClick={() => confirmDelete(id)}
                                                        className="flex size-6 items-center justify-center rounded-md bg-destructive font-mono text-[10px] font-bold text-destructive-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                    >
                                                        <Check className="size-3.5" aria-hidden />
                                                    </button>
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    aria-label={t('Delete {id} weights ({size}MB freed)', { id, size: m.size_mb })}
                                                    title={t('Delete weights, free {size}MB', { size: m.size_mb })}
                                                    onClick={() => askDelete(id)}
                                                    className="flex size-6 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-input hover:bg-background hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                >
                                                    <Trash2 className="size-3.5" aria-hidden />
                                                </button>
                                            )
                                        ) : (
                                            <button
                                                type="button"
                                                aria-label={isFailed(id) ? t('Retry downloading {id}', { id }) : t('Download {id} ({size}MB)', { id, size: m.size_mb })}
                                                title={isFailed(id) ? (live(id).error ?? t('Download failed — retry')) : t('Download {size}MB in the background', { size: m.size_mb })}
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
