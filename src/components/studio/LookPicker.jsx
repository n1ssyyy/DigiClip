import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { usePanelBeat } from '../digiclip/usePanelBeat';
import { useFloatingPanel } from '../digiclip/useFloatingPanel';
import { lookSummary } from '../../lib/lookSummary';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { ActionRows, Confirm, NameField } from './LookActions';

export const CLOSED = { open: false, mode: 'list' };

/** The enabled items of the open menu, in order. */
const items = (panel) => [...(panel?.querySelectorAll('[data-look-item]:not(:disabled)') ?? [])];

function Group({ label, children }) {
    const id = useId();
    return (
        <div role="group" aria-labelledby={id}>
            <p id={id} className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            {children}
        </div>
    );
}

function LookRow({ entry, on, summary, name, onPick }) {
    return (
        <button
            type="button"
            role="menuitemradio"
            aria-checked={on}
            data-look-item=""
            data-current={on ? '' : undefined}
            onClick={onPick}
            className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent', on && 'bg-accent/60')}
        >
            <span className="min-w-0 flex-1">
                <span className="block break-words text-[12px]">{name}</span>
                <span className="block break-words font-mono text-[10px] text-muted-foreground">{summary}</span>
            </span>
            <Check className={cn('size-3.5 shrink-0', !on && 'opacity-0')} aria-hidden />
        </button>
    );
}

/**
 * The Look picker, which is the title of the Studio page: the current look's
 * name, a dot when the working copy differs from it, and a menu to switch,
 * save, rename, duplicate and delete. `ui` (`{open, mode, name}`) is held by
 * the page so Ctrl+S can open the menu on Save as new.
 */
export default function LookPicker({ looks, ui, setUi }) {
    const t = useT();
    const { open, mode } = ui;
    const { show, leaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const btnRef = useRef(null);
    const pos = useFloatingPanel(show, rootRef, 6, 'left');
    // The geometry is a new object on every scroll; only its arrival matters.
    const placed = !!pos;
    const { current, edited } = looks;
    const shown = current.kind === 'mine' ? current.name : t(current.name);

    const close = (refocus = true) => {
        setUi(CLOSED);
        if (refocus) btnRef.current?.focus();
    };
    const back = () => setUi({ open: true, mode: 'list' });

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
            setUi(CLOSED);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open, setUi]);

    // Opening the menu (or coming back to the list) puts focus on the look
    // that is current, else the first item.
    useEffect(() => {
        if (!open || !show || leaving || mode !== 'list') return;
        const list = items(panelRef.current);
        (panelRef.current?.querySelector('[data-current]') ?? list[0])?.focus();
    }, [open, show, leaving, mode, placed]);

    function onKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (mode === 'list') close();
            else back();
            return;
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            close();
            return;
        }
        if (e.target.tagName === 'INPUT') return;
        const keys = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' };
        if (!(e.key in keys)) return;
        e.preventDefault();
        const list = items(panelRef.current);
        if (!list.length) return;
        const i = list.indexOf(document.activeElement);
        const step = keys[e.key];
        const next = step === 'first' ? 0 : step === 'last' ? list.length - 1 : (i + step + list.length) % list.length;
        list[next].focus();
    }

    // Run an action; the menu closes once it worked.
    const run = async (fn) => {
        if (await fn()) close();
    };
    const pick = (entry) => {
        looks.load(entry);
        close();
    };

    const row = (entry) => (
        <LookRow
            key={`${entry.kind}:${entry.name}`}
            entry={entry}
            on={entry.kind === current.kind && entry.name === current.name}
            name={entry.kind === 'mine' ? entry.name : t(entry.name)}
            summary={entry.kind === 'mine' ? lookSummary(entry.options, t) : t(entry.blurb)}
            onPick={() => pick(entry)}
        />
    );

    return (
        <div ref={rootRef} className="relative min-w-0">
            <button
                ref={btnRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`${t('Look')}: ${shown}${edited ? `, ${t('edited')}` : ''}`}
                onClick={() => setUi(open ? CLOSED : { open: true, mode: 'list' })}
                className="group flex h-8 max-w-full min-w-0 items-center gap-2 rounded-md px-2 text-[13px] font-semibold outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span className="min-w-0 truncate">{shown}</span>
                {edited && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-foreground/80" />}
                <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
            </button>
            {show && pos && createPortal(
                <div
                    ref={panelRef}
                    role="menu"
                    aria-label={t('Looks')}
                    data-look-menu=""
                    onKeyDown={onKeyDown}
                    style={{ ...pos, width: 340 }}
                    className={cn('digi-menu fixed z-[100] rounded-md border bg-popover text-popover-foreground shadow-md', leaving ? 'menu-out' : 'pop')}
                >
                    <div className="digi-scroll max-h-80 overflow-y-auto p-1">
                        {looks.list.mine.length > 0 && <Group label={t('Your looks')}>{looks.list.mine.map(row)}</Group>}
                        <Group label={t('Starter looks')}>{looks.list.starters.map(row)}</Group>
                    </div>
                    <div className="border-t border-white/10 p-1">
                        {mode === 'list' && <ActionRows looks={looks} setMode={(m) => setUi({ open: true, ...m })} run={run} />}
                        {(mode === 'saveas' || mode === 'rename') && (
                            <NameField
                                key={mode}
                                kind={mode}
                                looks={looks}
                                onDone={() => close()}
                                onCancel={back}
                                onReplace={(name) => setUi({ open: true, mode: 'replace', name })}
                            />
                        )}
                        {mode === 'replace' && (
                            <Confirm
                                label={t('Replace “{name}”?', { name: ui.name })}
                                busy={looks.saving}
                                onYes={() => looks.saveAs(ui.name).then((ok) => { if (ok) close(); })}
                                onNo={() => setUi({ open: true, mode: 'saveas' })}
                            />
                        )}
                        {mode === 'delete' && (
                            <Confirm
                                label={t('Delete “{name}”?', { name: current.name })}
                                busy={looks.saving}
                                onYes={() => run(looks.remove)}
                                onNo={back}
                            />
                        )}
                    </div>
                </div>, document.body,
            )}
        </div>
    );
}
