import { ChevronDown, ChevronUp } from 'lucide-react';
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
export function Segmented({ label, value, options, onChange, size = 'md', className }) {
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
                            on ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
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
