import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, RefreshCw, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import Tip from './Tooltip';
import { usePanelBeat } from './usePanelBeat';
import { useFloatingPanel } from './useFloatingPanel';

export const isContributor = (id) => id.toLowerCase().includes('contributor');
export const isFree = (id) => id.toLowerCase().endsWith(':free');

const inputCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Custom model picker (shadcn neutral): live OpenRouter catalog + search +
 * Contributor / :free filter chips. Controlled via value/onChange so the
 * parent form owns persistence (PUT /settings actually sets the model).
 */
export default function ModelPicker({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [contribOnly, setContribOnly] = useState(false);
    const [freeOnly, setFreeOnly] = useState(false);
    const [models, setModels] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const { show: panelShow, leaving: panelLeaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const panelPos = useFloatingPanel(panelShow, rootRef);

    async function load(refresh = false) {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/openrouter-models${refresh ? '?refresh=1' : ''}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setModels(data.models ?? []);
        } catch (e) {
            setError('Model list unavailable. Type any slug manually below.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

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

    const filtered = useMemo(() => {
        if (!models) return [];
        const q = query.trim().toLowerCase();
        return models.filter((m) => {
            if (contribOnly || freeOnly) {
                const ok = (contribOnly && isContributor(m.id)) || (freeOnly && isFree(m.id));
                if (!ok) return false;
            }
            if (q && !`${m.id} ${m.name}`.toLowerCase().includes(q)) return false;
            return true;
        }).slice(0, 150);
    }, [models, query, contribOnly, freeOnly]);

    const total = models?.length ?? 0;

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={cn(inputCls, 'cursor-pointer items-center justify-between text-left')}
            >
                <span className="truncate font-mono text-[13px]">{value || 'Select a model…'}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>

            {panelShow && panelPos && createPortal(
                <div ref={panelRef} style={panelPos} className={cn('digi-menu fixed z-[100] rounded-md border bg-popover text-popover-foreground shadow-md', panelLeaving ? 'menu-out' : 'pop')}>
                    <div className="space-y-2 border-b p-2">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                <input
                                    autoFocus
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search models…"
                                    aria-label="Search models"
                                    className={cn(inputCls, 'h-8 pl-9')}
                                />
                            </div>
                            <Tip label="Refresh catalog" side="bottom">
                                <button
                                    type="button"
                                    aria-label="Refresh catalog"
                                    onClick={() => load(true)}
                                    className="rounded-md p-1.5 hover:bg-accent"
                                >
                                    <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden />
                                </button>
                            </Tip>
                        </div>
                        <div className="flex gap-1.5">
                            <button
                                type="button"
                                aria-pressed={contribOnly}
                                onClick={() => setContribOnly((v) => !v)}
                                className={cn(
                                    'rounded-md border px-2.5 py-1 text-xs font-semibold tracking-wide transition-colors',
                                    contribOnly ? 'border-transparent bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                                )}
                            >
                                CONTRIBUTOR
                            </button>
                            <button
                                type="button"
                                aria-pressed={freeOnly}
                                onClick={() => setFreeOnly((v) => !v)}
                                className={cn(
                                    'rounded-md border px-2.5 py-1 font-mono text-xs font-semibold tracking-wide transition-colors',
                                    freeOnly ? 'border-transparent bg-[var(--viral)] text-black' : 'text-muted-foreground hover:bg-accent',
                                )}
                            >
                                FREE
                            </button>
                            {total > 0 && (
                                <span className="ml-auto self-center font-mono text-[11px] text-muted-foreground">
                                    {filtered.length}/{total}
                                </span>
                            )}
                        </div>
                    </div>
                    <ul role="listbox" aria-label="Models" className="digi-scroll max-h-64 overflow-y-auto p-1">
                        {error && <li className="px-2 py-3 text-xs text-muted-foreground">{error}</li>}
                        {!error && filtered.map((m) => (
                            <li key={m.id} role="option" aria-selected={m.id === value}>
                                <button
                                    type="button"
                                    onClick={() => { onChange(m.id); setOpen(false); }}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-accent',
                                        m.id === value && 'bg-accent',
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{m.id}</span>
                                    {m.name !== m.id && (
                                        <span className="max-w-[42%] shrink-0 truncate text-right text-[11px] text-muted-foreground">{m.name}</span>
                                    )}
                                    {isFree(m.id) && (
                                        <span className="shrink-0 rounded-full bg-[var(--viral)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-black">FREE</span>
                                    )}
                                    {isContributor(m.id) && !isFree(m.id) && (
                                        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">CONTRIBUTOR</span>
                                    )}
                                    {m.id === value && <Check className="size-4 shrink-0" aria-hidden />}
                                </button>
                            </li>
                        ))}
                        {!error && !loading && filtered.length === 0 && (
                            <li className="px-2 py-3 text-xs text-muted-foreground">No models match. Clear search or filters.</li>
                        )}
                        {!error && loading && models === null && (
                            <li className="px-2 py-3 text-xs text-muted-foreground">Loading catalog…</li>
                        )}
                    </ul>
                    <div className="border-t p-2">
                        <input
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="…or paste any model slug"
                            aria-label="Custom model slug"
                            className={cn(inputCls, 'h-8 font-mono text-xs')}
                        />
                    </div>
                </div>, document.body,
            )}
        </div>
    );
}
