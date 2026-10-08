import { useRef } from 'react';
import { GpuToggle } from '../../digiclip/controls';
import Tip from '../../digiclip/Tooltip';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/utils';

/** Arrow / Home / End move through a row of options (radios and tabs both). */
function stepKey(e, i, n) {
    switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': return (i + 1) % n;
        case 'ArrowLeft': case 'ArrowUp': return (i - 1 + n) % n;
        case 'Home': return 0;
        case 'End': return n - 1;
        default: return null;
    }
}

/** Roving focus for a row of options: `ref(i)` for each button and `onKey`
 *  for its keydown; an arrow focuses the next one and picks it. */
export function useRoving(count, pick) {
    const refs = useRef([]);
    return {
        ref: (i) => (el) => { refs.current[i] = el; },
        onKey(e, i) {
            const j = stepKey(e, i, count);
            if (j === null) return;
            e.preventDefault();
            e.stopPropagation();
            refs.current[j]?.focus();
            pick(j);
        },
    };
}

const TONE = {
    // Picked and set by the Look / picked, but only the style's own.
    on: 'border-white/40 bg-accent font-medium text-foreground',
    soft: 'border-white/[0.14] bg-accent/60 text-muted-foreground',
    off: 'border-white/[0.07] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
};

/**
 * A radio group of options: one tab stop, arrows move the pick (and make it),
 * the pick is drawn firm once the Look sets it and quiet while it is the
 * style's own. `options`: `{ id, label, aria?, tip?, style? }` (labels already
 * translated; a label may be an icon, and `tip` shows as the app's tooltip).
 */
export function Choice({ label, value, options, set = true, onChange, cols, disabled = false, size = 'md', wrap = false, className }) {
    const found = options.findIndex((o) => o.id === value);
    const stop = found < 0 ? 0 : found;
    const rove = useRoving(options.length, (j) => onChange(options[j].id));
    return (
        <div
            role="radiogroup"
            aria-label={label}
            className={cn('grid gap-1', className)}
            style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}
        >
            {options.map((o, i) => {
                const on = i === found;
                const btn = (
                    <button
                        key={o.id}
                        ref={rove.ref(i)}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={o.aria}
                        tabIndex={i === stop ? 0 : -1}
                        disabled={disabled}
                        onClick={() => onChange(o.id)}
                        onKeyDown={(e) => rove.onKey(e, i)}
                        style={o.style}
                        className={cn(
                            'flex min-w-0 items-center justify-center rounded-md border px-1.5 transition-[background-color,border-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                            o.tip && 'w-full',
                            wrap ? 'text-center leading-[1.1] break-words' : 'truncate',
                            size === 'lg' ? 'h-9 text-[14px]' : size === 'sm' ? 'h-7 text-[11px]' : wrap ? 'h-8 text-[10.5px]' : 'h-8 text-[11px]',
                            on ? (set ? TONE.on : TONE.soft) : TONE.off,
                        )}
                    >
                        {o.label}
                    </button>
                );
                return o.tip ? (
                    <Tip key={o.id} label={o.tip} className="w-full">
                        {btn}
                    </Tip>
                ) : btn;
            })}
        </div>
    );
}

/**
 * The state switcher: tabs with one tab stop, arrows moving between them
 * (the panel follows). `marked` lists the tabs that hold overrides, shown as
 * a small dot.
 */
export function Tabs({ label, value, options, marked = [], onChange, idBase, cols }) {
    const t = useT();
    const found = Math.max(0, options.findIndex((o) => o.id === value));
    const rove = useRoving(options.length, (j) => onChange(options[j].id));
    return (
        <div
            role="tablist"
            aria-label={label}
            className="grid auto-rows-[2rem] gap-px overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-white/[0.06]"
            style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}
        >
            {options.map((o, i) => {
                const on = i === found;
                return (
                    <button
                        key={o.id}
                        ref={rove.ref(i)}
                        id={`${idBase}-tab-${o.id}`}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        aria-controls={`${idBase}-panel`}
                        tabIndex={on ? 0 : -1}
                        onClick={() => onChange(o.id)}
                        onKeyDown={(e) => rove.onKey(e, i)}
                        className={cn(
                            'relative flex min-w-0 items-center justify-center gap-1 truncate px-1 text-[11px] transition-[background-color,color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                            on ? 'bg-accent font-medium text-foreground' : 'bg-[color-mix(in_srgb,var(--card)_78%,black)] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                        )}
                    >
                        <span className="truncate">{o.label}</span>
                        {marked.includes(o.id) && (
                            <>
                                <span aria-hidden className="size-1 shrink-0 rounded-full bg-foreground/70" />
                                <span className="sr-only">{t('Changed from the style')}</span>
                            </>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/** A switch with its name beside it; `set` draws the name firm. */
export function ToggleRow({ label, checked, onChange, set = false, hint }) {
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <GpuToggle checked={checked} disabled={false} onChange={onChange} label={label} />
                <span className={cn('min-w-0 truncate text-[12px]', set ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
            </div>
            {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
        </div>
    );
}
