import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';
import Tip from './Tooltip';

/** On/off switch: the track fills, the knob springs across, and while
 *  pressed the knob stretches toward where it is going (a squash that
 *  makes the flip feel physical). Disabled state gets its explanation
 *  from the wrapping Tip, not the control itself. */
export function GpuToggle({ checked, disabled, onChange, label }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'group/sw relative h-5 w-9 shrink-0 rounded-full border border-transparent',
                'transition-[background-color,box-shadow] duration-200',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                checked ? 'bg-primary shadow-[0_0_12px_rgb(255_255_255/0.18)]' : 'bg-input hover:bg-white/[0.22]',
                disabled && 'cursor-not-allowed opacity-50',
            )}
        >
            <span
                aria-hidden
                className={cn(
                    'absolute top-px left-px h-4 w-4 rounded-full bg-background shadow-[0_1px_2px_rgb(0_0_0/0.5)]',
                    'motion-safe:transition-[translate,width] motion-safe:duration-300 motion-safe:ease-[var(--spring)]',
                    !disabled && 'group-active/sw:w-5',
                    checked ? (disabled ? 'translate-x-4' : 'translate-x-4 group-active/sw:translate-x-3') : 'translate-x-0',
                )}
            />
        </button>
    );
}

/** Opens and closes its content by animating grid rows (no height
 *  measuring), fading as it goes. Closed content is inert. */
export function Reveal({ open, children }) {
    return (
        <div
            className={cn(
                'grid transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none',
                open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
            aria-hidden={!open}
            inert={!open}
        >
            <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
    );
}

/**
 * Segmented choice: one row of options with a pill that slides to the
 * picked one on a spring. Segments are equal width, so the pill needs no
 * measuring. `options`: `{ id, label, tip? }` (label may be a node);
 * `size`: `sm` (h-8, dense panels) or `md` (h-9, forms).
 */
export function Segmented({ label, value, options, onChange, size = 'md', className, dim = false }) {
    const t = useT();
    const idx = options.findIndex((o) => o.id === value);
    const n = options.length;
    return (
        <div
            className={cn(
                'relative flex w-full overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-[3px]',
                size === 'sm' ? 'h-8' : 'h-9',
                className,
            )}
            role="radiogroup"
            aria-label={label}
        >
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute inset-y-[3px] left-[3px] rounded-[4px] border-t border-white/15 bg-accent shadow-[0_1px_3px_rgb(0_0_0/0.45)]',
                    'motion-safe:transition-[translate,opacity] motion-safe:duration-300 motion-safe:ease-[var(--spring)]',
                    idx < 0 && 'opacity-0',
                    dim && idx >= 0 && 'opacity-50',
                )}
                style={{ width: `calc((100% - 6px) / ${n})`, translate: `${Math.max(0, idx) * 100}% 0` }}
            />
            {options.map((o) => {
                const on = o.id === value;
                const btn = (
                    <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={typeof o.label === 'string' ? undefined : t(o.tip)}
                        onClick={() => onChange(o.id)}
                        className={cn(
                            'relative flex h-full min-w-0 flex-1 items-center justify-center truncate rounded-[4px] px-1.5 transition-[color,background-color] duration-150',
                            size === 'sm' ? 'text-[11px]' : 'text-[12px]',
                            on ? (dim ? 'text-muted-foreground' : 'font-medium text-foreground') : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                        )}
                    >
                        {typeof o.label === 'string' ? t(o.label) : o.label}
                    </button>
                );
                return o.tip
                    ? <Tip key={o.id} label={t(o.tip)} side="top" className="flex min-w-0 flex-1">{btn}</Tip>
                    : btn;
            })}
        </div>
    );
}

/** Number input with always-visible custom steppers (native spinners
 *  hide cross-browser and can't be styled). `compact` drops to h-8 for
 *  dense popovers; default stays h-9 for forms. */
export function Stepper({ label, value, min = 1, max = 10, onChange, compact = false }) {
    const t = useT();
    const clamp = (v) => Math.min(max, Math.max(min, Number.isFinite(+v) ? +v : min));
    const stepCls = 'flex flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent/60';
    return (
        <div className={cn('flex w-full overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] transition-shadow focus-within:ring-2 focus-within:ring-ring', compact ? 'h-8' : 'h-9')}>
            <input
                type="number"
                aria-label={label}
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(clamp(e.target.value))}
                className="no-spin min-w-0 flex-1 bg-transparent px-3 py-1 text-[13px] outline-none"
            />
            <div className="flex w-9 shrink-0 flex-col divide-y divide-input border-l border-input">
                <button type="button" aria-label={t('More {label}', { label })} onClick={() => onChange(clamp(value + 1))} className={stepCls}>
                    <ChevronUp className="size-3.5" aria-hidden />
                </button>
                <button type="button" aria-label={t('Fewer {label}', { label })} onClick={() => onChange(clamp(value - 1))} className={stepCls}>
                    <ChevronDown className="size-3.5" aria-hidden />
                </button>
            </div>
        </div>
    );
}

/** Tighten picker: one choice, three verbs, no dropdown. `compact`
 *  for dense popovers. */
export function TightenSeg({ value, onChange, compact = false }) {
    const t = useT();
    return (
        <Segmented
            label={t('Tighten')}
            value={value}
            onChange={onChange}
            size={compact ? 'sm' : 'md'}
            options={[
                { id: 'off', label: 'Off' },
                { id: 'light', label: 'Light' },
                { id: 'punchy', label: 'Punchy' },
            ]}
        />
    );
}

const clampN = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const decimals = (step) => (String(step).split('.')[1] ?? '').length;

/**
 * Slider in the Segmented/Stepper language: a 32px bevelled box with a
 * thin track, a round thumb and the value at the right. Pointer drag
 * (captured), arrow keys step (Shift = bigger step, PageUp/PageDown too),
 * Home/End jump to the ends, and a double-click resets: to `onReset()`
 * when given, else to `defaultValue`. `dim` draws it as "not set" (a
 * style default). `marks` are 0..1 positions drawn as small ticks.
 */
export function Slider({ label, value, min = 0, max = 1, step = 0.01, bigStep, onChange, onReset, defaultValue, format, dim = false, marks, disabled = false, showValue = true, className, onDragStart, onDragEnd }) {
    const trackRef = useRef(null);
    const [drag, setDrag] = useState(false);
    // `onDragStart` / `onDragEnd` bracket a pointer drag (a caller that wants it
    // to be one undo step opens and closes a gesture with them).
    const dragging = useRef(false);
    function begin() {
        if (dragging.current) return;
        dragging.current = true;
        onDragStart?.();
    }
    function finish() {
        setDrag(false);
        if (!dragging.current) return;
        dragging.current = false;
        onDragEnd?.();
    }
    const span = max - min || 1;
    const shown = Number.isFinite(+value) ? +value : min;
    const frac = clampN((shown - min) / span, 0, 1);
    const fmt = format ?? ((v) => String(Math.round(v * 100) / 100));
    const big = bigStep ?? step * 10;

    function snap(v) {
        const n = Math.round((v - min) / step) * step + min;
        return clampN(Number(n.toFixed(decimals(step) + 2)), min, max);
    }
    function emit(v) {
        const n = snap(v);
        if (n !== shown) onChange(n);
    }
    function at(clientX) {
        const r = trackRef.current.getBoundingClientRect();
        emit(min + clampN((clientX - r.left) / (r.width || 1), 0, 1) * span);
    }
    function onKey(e) {
        const k = e.key;
        const d = e.shiftKey ? big : step;
        let next = null;
        if (k === 'ArrowRight' || k === 'ArrowUp') next = shown + d;
        else if (k === 'ArrowLeft' || k === 'ArrowDown') next = shown - d;
        else if (k === 'PageUp') next = shown + big;
        else if (k === 'PageDown') next = shown - big;
        else if (k === 'Home') next = min;
        else if (k === 'End') next = max;
        if (next == null) return;
        e.preventDefault();
        emit(next);
    }
    const reset = onReset ?? (defaultValue !== undefined ? () => onChange(defaultValue) : null);

    return (
        <div
            className={cn(
                'flex h-8 w-full items-center gap-2 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] pr-2.5 pl-1 transition-shadow focus-within:ring-2 focus-within:ring-ring',
                disabled && 'pointer-events-none opacity-50',
                className,
            )}
        >
            <div
                ref={trackRef}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-label={label}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={shown}
                aria-valuetext={fmt(shown)}
                aria-disabled={disabled || undefined}
                onKeyDown={onKey}
                onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    // Act first: a capture that fails (a pointer the page
                    // cannot hold) must not cost the click its value.
                    setDrag(true);
                    begin();
                    at(e.clientX);
                    try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                    }
                }}
                onPointerMove={(e) => { if (drag) at(e.clientX); }}
                onPointerUp={(e) => {
                    finish();
                    try {
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                    } catch {
                    }
                }}
                onPointerCancel={finish}
                onLostPointerCapture={finish}
                onDoubleClick={() => { if (reset) reset(); }}
                className="group/sl relative flex h-full min-w-0 flex-1 cursor-pointer touch-none items-center px-2 outline-none"
            >
                <div className="relative h-1 w-full rounded-full bg-white/10">
                    <span aria-hidden className={cn('absolute inset-y-0 left-0 rounded-full', dim ? 'bg-white/25' : 'bg-foreground/70')} style={{ width: `${frac * 100}%` }} />
                    {marks?.map((m, i) => (
                        <span key={i} aria-hidden className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/35" style={{ left: `${clampN(m, 0, 1) * 100}%` }} />
                    ))}
                    <span
                        aria-hidden
                        className={cn(
                            'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40 shadow-[0_1px_2px_rgb(0_0_0/0.5)]',
                            'motion-safe:transition-[scale] motion-safe:duration-150 motion-safe:ease-[var(--spring)]',
                            dim ? 'bg-white/60' : 'bg-foreground',
                            drag ? 'scale-125' : 'group-hover/sl:scale-110 group-focus-visible/sl:scale-110',
                        )}
                        style={{ left: `${frac * 100}%` }}
                    />
                </div>
            </div>
            {showValue && (
                <span className={cn('w-11 shrink-0 text-right font-mono text-[11px] tabular-nums', dim ? 'text-muted-foreground' : 'text-foreground')}>
                    {fmt(shown)}
                </span>
            )}
        </div>
    );
}

const HEX6 = /^#?[0-9a-f]{6}$/i;
const normHex = (v) => `#${String(v).trim().replace('#', '').toUpperCase()}`;

/**
 * Colour well: a swatch that opens the native colour input, a hex field,
 * and an "unset" state (`value` empty) that shows `fallback` (the
 * style's colour) dimmed. `onReset` adds a small reset once a value is set.
 */
export function Swatch({ label, value, fallback = '#FFFFFF', onChange, onReset, resetLabel, disabled = false, className }) {
    const set = HEX6.test(value ?? '');
    const shown = set ? normHex(value) : normHex(fallback);
    const [draft, setDraft] = useState(null);
    const text = draft ?? (set ? shown : '');
    function commit(v) {
        if (HEX6.test(v)) onChange(normHex(v));
        setDraft(null);
    }
    return (
        <div
            className={cn(
                'flex h-8 w-full items-center gap-2 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] pr-1 pl-1.5 transition-shadow focus-within:ring-2 focus-within:ring-ring',
                disabled && 'pointer-events-none opacity-50',
                className,
            )}
        >
            <label className="relative size-5 shrink-0 cursor-pointer overflow-hidden rounded border border-white/25" style={{ backgroundColor: shown, opacity: set ? 1 : 0.45 }}>
                <input
                    type="color"
                    value={shown.toLowerCase()}
                    onChange={(e) => onChange(normHex(e.target.value))}
                    aria-label={label}
                    disabled={disabled}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
            </label>
            <input
                type="text"
                value={text}
                placeholder={shown}
                spellCheck={false}
                maxLength={7}
                aria-label={`${label} (hex)`}
                disabled={disabled}
                onChange={(e) => {
                    setDraft(e.target.value);
                    if (HEX6.test(e.target.value)) onChange(normHex(e.target.value));
                }}
                onBlur={(e) => commit(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(e.currentTarget.value);
                    if (e.key === 'Escape') setDraft(null);
                }}
                className={cn('min-w-0 flex-1 bg-transparent font-mono text-[12px] uppercase outline-none placeholder:text-muted-foreground/60', !set && 'text-muted-foreground')}
            />
            {set && onReset && (
                <button
                    type="button"
                    aria-label={resetLabel ?? label}
                    onClick={onReset}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                    <RotateCcw className="size-3" aria-hidden />
                </button>
            )}
        </div>
    );
}
