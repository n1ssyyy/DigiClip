import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, RefreshCw, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import Tip from './Tooltip';
import { usePanelBeat } from './usePanelBeat';
import { useFloatingPanel } from './useFloatingPanel';
import { loadAiModels } from '../../lib/socket';
import { useT } from '../../lib/i18n';

export const isContributor = (id) => id.toLowerCase().includes('contributor');
export const isFree = (id) => id.toLowerCase().endsWith(':free');

const inputCls = 'flex h-9 w-full rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-3 py-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Model picker (shadcn neutral) for the Clip AI provider: live model list
 * + search, plus Contributor / :free chips on OpenRouter. Controlled via
 * value/onChange so the parent owns persistence.
 *
 * The list is fetched by the engine (`ai_models`) and refetched on its
 * own whenever `refetchKey` changes (the provider, its key, its address).
 * When the engine picked a model for the user, a one-line hint says so.
 */
export default function ModelPicker({ provider = 'openrouter', value, onChange, refetchKey = '' }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [contribOnly, setContribOnly] = useState(false);
    const [freeOnly, setFreeOnly] = useState(false);
    const [models, setModels] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hint, setHint] = useState(null);
    const [draft, setDraft] = useState(null);
    const { show: panelShow, leaving: panelLeaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const panelPos = useFloatingPanel(panelShow, rootRef);
    const seq = useRef(0);
    const hintTimer = useRef(null);
    const byUser = useRef(false);
    const prevValue = useRef(value);
    const isOr = provider === 'openrouter';

    function showHint(model) {
        setHint({ model, seq: Date.now() });
        clearTimeout(hintTimer.current);
        hintTimer.current = setTimeout(() => setHint(null), 4000);
    }
    useEffect(() => () => clearTimeout(hintTimer.current), []);

    async function load(refresh = false) {
        const mine = ++seq.current;
        setLoading(true);
        setError(null);
        try {
            const data = await loadAiModels(provider, refresh);
            if (mine !== seq.current) return;
            setModels(data?.models ?? []);
            if (data?.picked) showHint(data.picked);
        } catch (e) {
            if (mine !== seq.current) return;
            setModels([]);
            setError(e?.message || t('Model list unavailable. Type any slug manually below.'));
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }

    // The auto fetch: on mount and whenever the provider, its key or its
    // address changes. Each provider has its own list, so start clean.
    useEffect(() => {
        setModels(null);
        setError(null);
        setQuery('');
        setContribOnly(false);
        setFreeOnly(false);
        setHint(null);
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider, refetchKey]);

    // A model appeared without the user choosing it (the engine picked
    // one right after a key was saved): say so, whichever fetch got there.
    useEffect(() => {
        if (!prevValue.current && value && !byUser.current) showHint(value);
        prevValue.current = value;
        byUser.current = false;
    }, [value]);

    function choose(id) {
        byUser.current = true;
        setHint(null);
        onChange(id);
    }

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
            if (isOr && (contribOnly || freeOnly)) {
                const ok = (contribOnly && isContributor(m.id)) || (freeOnly && isFree(m.id));
                if (!ok) return false;
            }
            if (q && !`${m.id} ${m.name}`.toLowerCase().includes(q)) return false;
            return true;
        }).slice(0, 150);
    }, [models, query, contribOnly, freeOnly, isOr]);

    const total = models?.length ?? 0;
    const slug = draft ?? value;
    const commitSlug = () => {
        if (draft !== null && draft.trim() !== value) choose(draft.trim());
        setDraft(null);
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
                <span className="truncate font-mono text-xs">{value || t('Select a model…')}</span>
                {loading
                    ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                    : <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </button>
            <div className="min-h-4 text-[11px]" aria-live="polite">
                {hint ? (
                    <p key={hint.seq} className="swap-in mt-1 flex items-center gap-1.5 text-foreground">
                        <Check className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{t('Picked {model} for you', { model: hint.model })}</span>
                    </p>
                ) : loading ? (
                    <p className="fade mt-1 text-muted-foreground">{t('Fetching models…')}</p>
                ) : null}
            </div>

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
                                    placeholder={t('Search models…')}
                                    aria-label={t('Search models')}
                                    className={cn(inputCls, 'h-8 pl-9')}
                                />
                            </div>
                            <Tip label={t('Refresh catalog')} side="bottom">
                                <button
                                    type="button"
                                    aria-label={t('Refresh catalog')}
                                    onClick={() => load(true)}
                                    className="rounded-md p-1.5 hover:bg-accent"
                                >
                                    <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden />
                                </button>
                            </Tip>
                        </div>
                        {(isOr || total > 0) && (
                            <div className="flex gap-1.5">
                                {isOr && (
                                    <>
                                        <button
                                            type="button"
                                            aria-pressed={contribOnly}
                                            onClick={() => setContribOnly((v) => !v)}
                                            className={cn(
                                                'rounded-md border px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors',
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
                                                'rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide transition-colors',
                                                freeOnly ? 'border-transparent bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                                            )}
                                        >
                                            {t('FREE')}
                                        </button>
                                    </>
                                )}
                                {total > 0 && (
                                    <span className="ml-auto self-center font-mono text-[10px] text-muted-foreground">
                                        {filtered.length}/{total}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <ul role="listbox" aria-label={t('Models')} className="digi-scroll max-h-64 overflow-y-auto p-1">
                        {error && <li className="px-2 py-3 text-[11px] break-words text-muted-foreground">{error}</li>}
                        {!error && filtered.map((m) => (
                            <li key={m.id} role="option" aria-selected={m.id === value}>
                                <button
                                    type="button"
                                    onClick={() => { choose(m.id); setOpen(false); }}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-accent',
                                        m.id === value && 'bg-accent',
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{m.id}</span>
                                    {m.name !== m.id && (
                                        <span className="max-w-[42%] shrink-0 truncate text-right text-[10px] text-muted-foreground">{m.name}</span>
                                    )}
                                    {isOr && isFree(m.id) && (
                                        <span className="shrink-0 rounded-full border border-primary/40 px-1.5 py-px font-mono text-[10px] font-semibold text-primary">{t('FREE')}</span>
                                    )}
                                    {isOr && isContributor(m.id) && !isFree(m.id) && (
                                        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">CONTRIBUTOR</span>
                                    )}
                                    {m.id === value && <Check className="size-4 shrink-0" aria-hidden />}
                                </button>
                            </li>
                        ))}
                        {!error && !loading && filtered.length === 0 && (
                            <li className="px-2 py-3 text-[11px] text-muted-foreground">
                                {total === 0 ? t('This provider lists no models. Type one below.') : t('No models match. Clear search or filters.')}
                            </li>
                        )}
                        {!error && loading && models === null && (
                            <li className="fade px-2 py-3 text-[11px] text-muted-foreground">{t('Fetching models…')}</li>
                        )}
                    </ul>
                    <div className="border-t p-2">
                        <input
                            value={slug}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commitSlug}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitSlug();
                                    setOpen(false);
                                }
                            }}
                            placeholder={t('…or paste any model slug')}
                            aria-label={t('Custom model slug')}
                            className={cn(inputCls, 'h-8 font-mono text-[11px]')}
                        />
                    </div>
                </div>, document.body,
            )}
        </div>
    );
}
