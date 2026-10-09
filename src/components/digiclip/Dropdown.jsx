import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import Tip from './Tooltip';
import { usePanelBeat } from './usePanelBeat';
import { useFloatingPanel } from './useFloatingPanel';
import { extendTyped, findTyped, isTyping, isTypeKey, optionIndex, stepOption } from '../../lib/dropdown';
import { cn } from '../../lib/utils';

const ROW = 32; // a row's height, for how much room the list wants
const MAX_H = 320; // the list scrolls past this
const EDGE = 8; // never closer than this to the window

/**
 * A single choice from a list, in the app's own menu: the trigger is whatever
 * face the caller draws (`children`, given `{open, current}`), the list is a
 * `digi-menu` in a body portal under the trigger (above it when the window has
 * no room below), at least as wide as the trigger and wider when its options
 * need it. It scrolls inside itself with the current choice in view. Keys on the
 * trigger: Enter, Space, ArrowDown and ArrowUp open it; in the list the arrows,
 * Home and End move, Enter or Space choose, letters jump to the next option that
 * starts with them, Escape closes and gives focus back, Tab closes and moves on.
 *
 * @param {{value: *, text: string, disabled?: boolean}[]} options
 * @param {*} value  the current choice (compared as text with each option's value)
 * @param {(value: *) => void} onChange  called with the option's own value, only when it changed
 * @param {string} label  what the control is (the list's name; the trigger's name is "label: text")
 * @param {string} [name]  the trigger's accessible name, when "label: text" is not it
 * @param {string} [tip]  the trigger's tooltip
 * @param {string} [className]  the trigger's look
 * @param {'sm'|'md'} [size]  the text size of the rows
 * @param {boolean} [disabled]
 * @param {(state: {open: boolean, current: object|undefined}) => import('react').ReactNode} children  the trigger's face
 */
export default function Dropdown({ options, value, onChange, label, name, tip, className, size = 'sm', disabled = false, children }) {
    const uid = useId();
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [shift, setShift] = useState(0);
    const { show, leaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const btnRef = useRef(null);
    const panelRef = useRef(null);
    const listRef = useRef(null);
    const typed = useRef({ text: '', at: 0 });
    const need = Math.min(options.length * ROW + 10, MAX_H + 8);
    const pos = useFloatingPanel(show, rootRef, 6, 'left', need);
    const placed = !!pos;

    const at = optionIndex(options, value);
    const current = options[at];
    const optId = (i) => `${uid}-o${i}`;

    function close(refocus = true) {
        setOpen(false);
        if (refocus) btnRef.current?.focus();
    }
    function openList() {
        typed.current = { text: '', at: 0 };
        setActive(at >= 0 ? at : Math.max(0, stepOption(options, -1, 'ArrowDown') ?? 0));
        setOpen(true);
    }
    function choose(i) {
        const o = options[i];
        if (!o || o.disabled) return;
        close(true);
        if (i !== at) onChange(o.value);
    }
    function go(i, scroll) {
        setActive(i);
        if (scroll) document.getElementById(optId(i))?.scrollIntoView({ block: 'nearest' });
    }

    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    // The list lands with the current choice in the middle of what shows, and focus in it.
    // (Next frame: by then the panel has its placed height.)
    useLayoutEffect(() => {
        if (!open || !show || !placed) return undefined;
        const raf = requestAnimationFrame(() => {
            const list = listRef.current;
            if (!list) return;
            const row = list.querySelector('[data-current]');
            if (row) list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
            list.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(raf);
    }, [open, show, placed]);

    // Wider than the trigger, the list slides left rather than leave the window.
    useLayoutEffect(() => {
        const el = panelRef.current;
        if (!show || !pos || !el || pos.left === undefined) return;
        const over = pos.left + el.offsetWidth - (window.innerWidth - EDGE);
        setShift(Math.max(0, Math.min(pos.left - EDGE, over)));
    }, [show, pos, options]);

    function onTriggerKey(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (open) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close(true);
            }
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            openList();
        }
    }

    function onKeyDown(e) {
        // The page's own keys (play, step, undo) stay out of an open list.
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const next = stepOption(options, active, e.key);
        if (e.key === 'Escape') {
            e.preventDefault();
            close(true);
        } else if (e.key === 'Tab') {
            // Focus goes back first, so the Tab moves on from the trigger.
            close(true);
        } else if (next !== null) {
            e.preventDefault();
            go(next, true);
        } else if (e.key === 'Enter' || (e.key === ' ' && !isTyping(typed.current))) {
            e.preventDefault();
            choose(active);
        } else if (isTypeKey(e)) {
            e.preventDefault();
            typed.current = extendTyped(typed.current, e.key);
            const j = findTyped(options, typed.current.text, active);
            if (j >= 0) go(j, true);
        }
    }

    const room = pos ? window.innerHeight - EDGE - ('top' in pos ? pos.top : pos.bottom) : MAX_H;
    const text = size === 'md' ? 'text-[13px]' : 'text-[12px]';
    return (
        <div ref={rootRef} className="relative min-w-0">
            <Tip label={tip} side="bottom" className="w-full">
                <button
                    ref={btnRef}
                    type="button"
                    disabled={disabled}
                    data-dropdown=""
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-controls={open ? `${uid}-list` : undefined}
                    aria-label={name ?? `${label}: ${current?.text ?? ''}`}
                    onClick={() => (open ? close(false) : openList())}
                    onKeyDown={onTriggerKey}
                    className={cn('cursor-pointer outline-none disabled:cursor-default', className)}
                >
                    {children({ open, current })}
                </button>
            </Tip>
            {show && pos && createPortal(
                <div
                    ref={panelRef}
                    onKeyDown={onKeyDown}
                    style={{
                        ...(('top' in pos) ? { top: pos.top } : { bottom: pos.bottom }),
                        left: pos.left - shift,
                        minWidth: pos.width,
                        width: 'max-content',
                        maxWidth: 'min(22rem, calc(100vw - 16px))',
                    }}
                    className={cn('digi-menu fixed z-[100] rounded-md border bg-popover text-popover-foreground shadow-md', leaving ? 'menu-out pointer-events-none' : 'pop')}
                >
                    <div
                        ref={listRef}
                        id={`${uid}-list`}
                        role="listbox"
                        aria-label={label}
                        tabIndex={-1}
                        aria-activedescendant={active >= 0 ? optId(active) : undefined}
                        style={{ maxHeight: Math.max(96, Math.min(MAX_H, room)) - 2 }}
                        className="digi-scroll relative overflow-y-auto p-1 outline-none"
                    >
                        {options.map((o, i) => {
                            const on = i === at;
                            return (
                                <div
                                    key={String(o.value)}
                                    id={optId(i)}
                                    role="option"
                                    aria-selected={on}
                                    aria-disabled={o.disabled || undefined}
                                    data-current={on ? '' : undefined}
                                    data-active={i === active ? '' : undefined}
                                    onPointerMove={() => { if (!o.disabled && i !== active) setActive(i); }}
                                    onClick={() => choose(i)}
                                    className={cn(
                                        'flex min-h-8 items-center gap-2 rounded-sm px-2 py-1.5',
                                        text,
                                        o.disabled ? 'cursor-default text-muted-foreground' : 'cursor-pointer',
                                        on && 'bg-accent/60 font-medium',
                                        i === active && 'bg-accent',
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate">{o.text}</span>
                                    <Check className={cn('size-3.5 shrink-0', !on && 'opacity-0')} aria-hidden />
                                </div>
                            );
                        })}
                    </div>
                </div>, document.body,
            )}
        </div>
    );
}
