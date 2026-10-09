import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2, Plus, Search } from 'lucide-react';
import { useFloatingPanel } from '../../digiclip/useFloatingPanel';
import { usePanelBeat } from '../../digiclip/usePanelBeat';
import { useT } from '../../../lib/i18n';
import { chooseValue, findFont, flatRows, fontStatus, groupFonts, showSearch } from '../../../lib/fontLibrary';
import { isTypeKey, moveActive, typeahead } from '../../../lib/fontPicker';
import { cn } from '../../../lib/utils';
import { addFontFromDialog, removeFont } from '../fontActions';
import { ensureFace, fontPreview, useFaceStatus, useFontLibrary } from '../useFonts';
import FontRow, { faceStyle } from './FontRows';

const box = 'rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]';

/**
 * The font control of a Type section: the current family in its own face;
 * open, a listbox of every font grouped by kind, each in its own face. Hover
 * or arrow over a row previews it on the stage (the Look is not written);
 * choosing writes one undo step (the layer's default font clears the field).
 *
 * @param {string} label  the control's name
 * @param {'captions'|'headline'} layer  which layer the preview paints
 * @param {string} value  the font the layer has now (named, or its default)
 * @param {string} def  the layer's default font
 * @param {(font: string|undefined) => void} onPick  undefined clears the field
 */
export default function FontPicker({ label, layer, value, def, onPick }) {
    const t = useT();
    const uid = useId();
    const lib = useFontLibrary();
    const status = fontStatus(value, lib.entries, lib.loaded);
    const own = useFaceStatus(value);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);
    const { show, leaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const typed = useRef({ text: '', at: 0 });
    const adding = useRef(false);
    const pos = useFloatingPanel(show, rootRef);

    const searchable = showSearch(lib.entries);
    const groups = useMemo(() => groupFonts(lib.entries, searchable ? query : '', def), [lib.entries, query, def, searchable]);
    const rows = useMemo(() => flatRows(groups), [groups]);
    const at = Math.min(active, Math.max(0, rows.length - 1));
    const current = rows.findIndex((r) => r.family.toLowerCase() === String(value).toLowerCase());
    const rowId = (i) => `${uid}-o-${i}`;

    // The closed control draws the name in its own face once that face is in the page.
    useEffect(() => {
        const e = findFont(lib.entries, value);
        if (e) ensureFace(e);
    }, [value, lib.entries]);

    function preview(i) {
        const r = rows[i];
        if (r) {
            ensureFace(r);
            fontPreview.show(layer, r.family);
        }
    }
    function endConfirm() {
        setConfirm(null);
        (inputRef.current ?? listRef.current)?.focus();
    }
    function close(refocus) {
        setOpen(false);
        setQuery('');
        setConfirm(null);
        fontPreview.clear();
        if (refocus) rootRef.current?.querySelector('button')?.focus();
    }
    function pick(i) {
        const r = rows[i];
        if (!r) return;
        onPick(chooseValue(r.family, def));
        close(true);
    }
    function openList() {
        setOpen(true);
        setActive(Math.max(0, rows.findIndex((r) => r.family.toLowerCase() === String(value).toLowerCase())));
    }
    function go(i, keyboard) {
        setActive(i);
        preview(i);
        if (keyboard) requestAnimationFrame(() => document.getElementById(rowId(i))?.scrollIntoView({ block: 'nearest' }));
    }

    // Focus the search (or the list) when it opens; leave the preview off when it goes.
    useEffect(() => {
        if (!open || !show) return;
        (inputRef.current ?? listRef.current)?.focus();
        requestAnimationFrame(() => document.getElementById(rowId(Math.max(0, current)))?.scrollIntoView({ block: 'nearest' }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, show, Boolean(pos)]);
    useEffect(() => () => fontPreview.clear(), []);
    useEffect(() => {
        if (!open) return undefined;
        const down = (e) => {
            if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
            close(false);
        };
        document.addEventListener('mousedown', down);
        return () => document.removeEventListener('mousedown', down);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    function onKeyDown(e) {
        const onButton = !!e.target.closest?.('button');
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (confirm) endConfirm();
            else close(true);
            return;
        }
        if (onButton) return;
        const inInput = e.target === inputRef.current;
        const key = inInput && (e.key === 'Home' || e.key === 'End') ? null : moveActive(rows.length ? at : -1, e.key, rows.length);
        if (key !== null) {
            e.preventDefault();
            go(key, true);
        } else if (e.key === 'Enter' || (e.key === ' ' && !inInput && !(typed.current.text && Date.now() - typed.current.at < 700))) {
            e.preventDefault();
            pick(at);
        } else if (e.key === 'Delete' && !inInput && rows[at] && !rows[at].bundled) {
            e.preventDefault();
            setConfirm(rows[at].family);
        } else if (!searchable && isTypeKey(e)) {
            // No search field: typing jumps to the next family that starts that way.
            e.preventDefault();
            const now = Date.now();
            const tp = typed.current;
            tp.text = now - tp.at > 700 ? e.key : tp.text + e.key;
            tp.at = now;
            const j = typeahead(rows, tp.text, at);
            if (j >= 0) go(j, true);
        } else if (e.key === 'Tab') {
            close(false);
        } else if (inInput || e.key.startsWith('Arrow')) {
            // The page's own keys (play, step) stay out of a list that is open.
            e.stopPropagation();
        }
    }

    async function add() {
        adding.current = true;
        setBusy(true);
        const entry = await addFontFromDialog(t);
        adding.current = false;
        setBusy(false);
        if (entry) {
            onPick(chooseValue(entry.family, def));
            close(true);
        }
    }

    async function remove(family) {
        setBusy(true);
        await removeFont(family, t);
        setBusy(false);
        endConfirm();
    }

    const ctl = {
        'aria-controls': `${uid}-list`,
        'aria-activedescendant': rows.length ? rowId(at) : undefined,
    };
    const drawn = own === 'app' || own === 'ready';
    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-label={`${label}: ${value}`}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => (open ? close(false) : openList())}
                className={cn(box, 'flex min-h-9 w-full items-center justify-between gap-2 px-2.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring')}
            >
                <span className="min-w-0 flex-1 text-[15px] leading-snug break-words" style={drawn ? faceStyle(value) : undefined}>
                    <span className={drawn ? undefined : 'font-mono text-[12px]'}>{value}</span>
                    {status === 'missing' && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{t('not installed')}</span>}
                </span>
                <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
            {show && pos && createPortal(
                <div
                    ref={panelRef}
                    tabIndex={-1}
                    style={pos}
                    onKeyDown={onKeyDown}
                    onBlur={(e) => {
                        if (adding.current || panelRef.current?.contains(e.relatedTarget) || rootRef.current?.contains(e.relatedTarget)) return;
                        close(false);
                    }}
                    className={cn('digi-menu fixed z-[100] rounded-md border bg-popover text-popover-foreground shadow-md outline-none', leaving ? 'menu-out' : 'pop')}
                >
                    {searchable && (
                        <div className="relative border-b p-2">
                            <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <input
                                ref={inputRef}
                                role="combobox"
                                aria-expanded="true"
                                aria-autocomplete="list"
                                aria-label={t('Search fonts')}
                                placeholder={t('Search fonts')}
                                value={query}
                                spellCheck={false}
                                onChange={(e) => { setQuery(e.target.value); setActive(0); fontPreview.clear(); }}
                                {...ctl}
                                className={cn(box, 'h-8 w-full pl-8 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring')}
                            />
                        </div>
                    )}
                    <div
                        ref={listRef}
                        id={`${uid}-list`}
                        role="listbox"
                        aria-label={t('Fonts')}
                        tabIndex={searchable ? -1 : 0}
                        {...(searchable ? {} : ctl)}
                        onPointerLeave={() => fontPreview.clear()}
                        className="digi-scroll max-h-[min(16rem,40vh)] overflow-y-auto p-1 outline-none"
                    >
                        {groups.map((g) => (
                            <div key={g.id} role="group" aria-labelledby={`${uid}-g-${g.id}`}>
                                <div id={`${uid}-g-${g.id}`} className="px-2 pt-2 pb-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{t(g.label)}</div>
                                {g.rows.map((r) => {
                                    const i = rows.indexOf(r);
                                    return (
                                        <FontRow
                                            key={r.family}
                                            id={rowId(i)}
                                            entry={r}
                                            current={i === current}
                                            active={i === at}
                                            confirming={confirm === r.family}
                                            removing={busy}
                                            rootRef={listRef}
                                            onHover={() => { if (i !== at || !fontPreviewIs(layer, r.family)) go(i, false); }}
                                            onPick={() => pick(i)}
                                            onAskRemove={() => setConfirm(r.family)}
                                            onRemove={() => remove(r.family)}
                                            onCancelRemove={endConfirm}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                        {rows.length === 0 && <p className="px-2 py-3 text-[11px] text-muted-foreground">{t('No fonts match.')}</p>}
                    </div>
                    <div className="border-t p-1">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={add}
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                        >
                            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                            {t('Add a font…')}
                        </button>
                    </div>
                </div>, document.body,
            )}
        </div>
    );
}

/** Is this font already the one previewed on the layer? */
function fontPreviewIs(layer, family) {
    const p = fontPreview.get();
    return !!p && p.layer === layer && p.font === family;
}
