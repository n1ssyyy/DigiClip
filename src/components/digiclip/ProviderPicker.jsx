import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePanelBeat } from './usePanelBeat';
import { useFloatingPanel } from './useFloatingPanel';
import { useT } from '../../lib/i18n';

const inputCls = 'flex h-9 w-full rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-3 py-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** The letter tile every provider gets (same look as the AI apps rows). */
export function Monogram({ label, on = false, className }) {
    return (
        <span
            aria-hidden
            className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold transition-colors',
                on ? 'border-[var(--viral)]/40 text-[var(--viral)]' : 'text-muted-foreground',
                className,
            )}
        >
            {String(label ?? '?').trim().charAt(0).toUpperCase()}
        </span>
    );
}

/** What to say about a provider on its row. */
export function providerStatus(p, keysSet) {
    if (keysSet.includes(p.id)) return { id: 'saved', text: 'Key saved', tone: 'ok' };
    if (p.local) return { id: 'local', text: 'On this PC', tone: 'muted' };
    if (p.needs_key === 'required') return { id: 'needs', text: 'Needs a key', tone: 'warn' };
    if (p.needs_key === 'optional') return { id: 'optional', text: 'Optional key', tone: 'muted' };
    return { id: 'none', text: 'No key needed', tone: 'muted' };
}

const isLocalGroup = (p) => p.local || p.id === 'custom';

/**
 * Provider picker: the same popover as ModelPicker (floating panel in a
 * body portal, `digi-menu`, pop / menu-out), with a searchable, grouped
 * list. Arrow keys move, Enter picks, Esc closes.
 */
export default function ProviderPicker({ value, providers, keysSet = [], onChange }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [cursor, setCursor] = useState(0);
    const { show: panelShow, leaving: panelLeaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const listRef = useRef(null);
    const panelPos = useFloatingPanel(panelShow, rootRef);
    const current = providers.find((p) => p.id === value);

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const hits = providers.filter((p) => !q || `${p.label} ${p.id}`.toLowerCase().includes(q));
        return [
            { id: 'cloud', title: 'Cloud', items: hits.filter((p) => !isLocalGroup(p)) },
            { id: 'local', title: 'On this PC / custom', items: hits.filter(isLocalGroup) },
        ].filter((g) => g.items.length);
    }, [providers, query]);
    const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

    function close() {
        setOpen(false);
        setQuery('');
    }
    function pick(p) {
        if (p.id !== value) onChange(p.id);
        close();
    }

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
                rootRef.current?.querySelector('button')?.focus();
                return;
            }
            if (e.type === 'keydown') return;
            if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
            close();
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onDown, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onDown, true);
        };
    }, [open]);

    // Start on the current provider each time the list opens.
    useEffect(() => {
        if (open) setCursor(Math.max(0, flat.findIndex((p) => p.id === value)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    useEffect(() => setCursor(0), [query]);
    useEffect(() => {
        listRef.current?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [cursor, panelShow]);

    function onKeyDown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(flat.length - 1, c + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(0, c - 1));
        } else if (e.key === 'Home') {
            setCursor(0);
        } else if (e.key === 'End') {
            setCursor(Math.max(0, flat.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (flat[cursor]) pick(flat[cursor]);
        }
    }

    let n = -1;
    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => (open ? close() : setOpen(true))}
                onKeyDown={(e) => {
                    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
                className={cn(inputCls, 'cursor-pointer items-center justify-between gap-2.5 text-left')}
            >
                <Monogram label={current?.label} on={keysSet.includes(value)} className="size-5 text-[10px]" />
                <span className="min-w-0 flex-1 truncate">{current?.label ?? value ?? t('Select a provider…')}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>

            {panelShow && panelPos && createPortal(
                <div
                    ref={panelRef}
                    style={panelPos}
                    className={cn('digi-menu fixed z-[100] rounded-md border bg-popover text-popover-foreground shadow-md', panelLeaving ? 'menu-out' : 'pop')}
                >
                    <div className="border-b p-2">
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={onKeyDown}
                                placeholder={t('Search providers…')}
                                aria-label={t('Search providers')}
                                role="combobox"
                                aria-expanded="true"
                                aria-controls="provider-list"
                                className={cn(inputCls, 'h-8 pl-9')}
                            />
                        </div>
                    </div>
                    <div ref={listRef} id="provider-list" role="listbox" aria-label={t('Providers')} className="digi-scroll max-h-72 overflow-y-auto p-1">
                        {groups.map((g) => (
                            <div key={g.id} role="group" aria-label={t(g.title)}>
                                <p className="px-2 pt-2 pb-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{t(g.title)}</p>
                                {g.items.map((p) => {
                                    n += 1;
                                    const at = n;
                                    const on = at === cursor;
                                    const st = providerStatus(p, keysSet);
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            role="option"
                                            aria-selected={p.id === value}
                                            data-cursor={on}
                                            tabIndex={-1}
                                            onMouseMove={() => setCursor(at)}
                                            onClick={() => pick(p)}
                                            className={cn(
                                                'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors',
                                                on && 'bg-accent',
                                            )}
                                        >
                                            <Monogram label={p.label} on={st.id === 'saved'} />
                                            <span className="min-w-0 flex-1 truncate text-[13px]">{p.label}</span>
                                            <span
                                                className={cn(
                                                    'shrink-0 text-[10px]',
                                                    st.tone === 'ok' && 'text-[var(--viral)]',
                                                    st.tone === 'warn' && 'text-orange-400',
                                                    st.tone === 'muted' && 'text-muted-foreground',
                                                )}
                                            >
                                                {t(st.text)}
                                            </span>
                                            {p.id === value && <Check className="size-4 shrink-0" aria-hidden />}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                        {flat.length === 0 && (
                            <p className="px-2 py-3 text-[11px] text-muted-foreground">{t('No providers match.')}</p>
                        )}
                    </div>
                </div>, document.body,
            )}
        </div>
    );
}
