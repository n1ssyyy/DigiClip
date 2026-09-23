import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

/** GPU switch: track flips with primary, knob slides. Disabled state gets
 *  its explanation from the wrapping Tip, not the control itself. */
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
                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                checked ? 'bg-primary' : 'bg-input',
                disabled && 'cursor-not-allowed opacity-50',
            )}
        >
            <span
                aria-hidden
                className={cn(
                    'absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow transition-transform',
                    'motion-safe:duration-200 motion-safe:ease-out',
                    checked ? 'translate-x-4' : 'translate-x-0',
                )}
            />
        </button>
    );
}

/** Number input with always-visible custom steppers (native spinners
 *  hide cross-browser and can't be styled). `compact` drops to h-8 for
 *  dense popovers; default stays h-9 for forms. */
export function Stepper({ label, value, min = 1, max = 10, onChange, compact = false }) {
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
                <button type="button" aria-label={`More ${label}`} onClick={() => onChange(clamp(value + 1))} className={stepCls}>
                    <ChevronUp className="size-3.5" aria-hidden />
                </button>
                <button type="button" aria-label={`Fewer ${label}`} onClick={() => onChange(clamp(value - 1))} className={stepCls}>
                    <ChevronDown className="size-3.5" aria-hidden />
                </button>
            </div>
        </div>
    );
}

/** Tighten picker: same segmented language as the filter chips —
 *  one choice, three verbs, no dropdown. `compact` for dense popovers. */
export function TightenSeg({ value, onChange, compact = false }) {
    const opts = [
        { id: 'off', label: 'Off' },
        { id: 'light', label: 'Light' },
        { id: 'punchy', label: 'Punchy' },
    ];
    return (
        <div className={cn('flex w-full overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]', compact ? 'h-8' : 'h-9')} role="radiogroup" aria-label="Tighten">
            {opts.map((o) => (
                <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={value === o.id}
                    onClick={() => onChange(o.id)}
                    className={cn(
                        'flex-1 text-[13px] transition-colors hover:bg-accent hover:text-foreground',
                        value === o.id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground',
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
