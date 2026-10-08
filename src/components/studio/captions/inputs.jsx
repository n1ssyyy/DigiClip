import { useEffect, useId, useRef, useState } from 'react';
import { Slider, Swatch } from '../../digiclip/controls';
import { Kicker } from '../../digiclip/JobOptions';
import { numSpec, numUi } from '../../../lib/captionSections';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/utils';
import { ResetBtn } from '../Field';
import { useCap } from './context';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const decimals = (step) => (String(step).split('.')[1] ?? '').length;
const fixed = (v, step) => Number(v.toFixed(decimals(step) + 2));

/** The quiet sub-heading inside a section. */
export function SubHead({ children }) {
    return (
        <div className="pt-1">
            <Kicker>{children}</Kicker>
        </div>
    );
}

/**
 * One labelled control: the label (quiet while the style's own value shows,
 * normal once the Look sets it), a small reset when it does, the control and
 * at most a one-line hint.
 */
export function Row({ label, htmlFor, set = false, onReset, hint, hintId, children }) {
    return (
        <div className="space-y-1">
            <div className="flex h-5 items-center justify-between gap-2">
                <label htmlFor={htmlFor} className={cn('min-w-0 truncate text-[11px]', set ? 'text-foreground' : 'text-muted-foreground')}>{label}</label>
                {set && onReset && <ResetBtn label={label} onClick={onReset} className="-mr-1" />}
            </div>
            {children}
            {hint && <p id={hintId} className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
        </div>
    );
}

/** A number typed into a small bevelled field with its unit; arrows step it,
 *  Enter or leaving commits, Escape puts it back. `value` is the stored
 *  number; `ui` (from `numUi`) says how it reads. */
export function NumBox({ id, label, value, spec, ui, set = false, disabled = false, onChange, className }) {
    const [draft, setDraft] = useState(null);
    const shown = (value * ui.k).toFixed(ui.digits);
    const put = (n) => {
        let v = clamp(n, spec.min, spec.max);
        if (spec.int) v = Math.round(v);
        v = fixed(v, spec.step);
        if (v !== value) onChange(v);
    };
    function commit(text) {
        setDraft(null);
        const n = parseFloat(String(text).replace(',', '.'));
        if (Number.isFinite(n)) put(n / ui.k);
    }
    return (
        <div
            className={cn(
                'flex h-8 w-[68px] shrink-0 items-center rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] pr-1.5 transition-shadow focus-within:ring-2 focus-within:ring-ring',
                disabled && 'pointer-events-none opacity-50',
                className,
            )}
        >
            <input
                id={id}
                type="text"
                inputMode="decimal"
                value={draft ?? shown}
                aria-label={label}
                disabled={disabled}
                spellCheck={false}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => { if (draft !== null) commit(e.target.value); }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(e.currentTarget.value);
                    else if (e.key === 'Escape') setDraft(null);
                    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const d = (e.key === 'ArrowUp' ? 1 : -1) * spec.step * (e.shiftKey ? 10 : 1);
                        setDraft(null);
                        put(value + d);
                    }
                }}
                className={cn('min-w-0 flex-1 bg-transparent pl-1.5 text-right font-mono text-[11px] tabular-nums outline-none', set ? 'text-foreground' : 'text-muted-foreground')}
            />
            {ui.unit && <span aria-hidden className="w-[1.1rem] shrink-0 pl-0.5 font-mono text-[10px] text-muted-foreground">{ui.unit}</span>}
        </div>
    );
}

/** Opens a gesture while a drag runs and closes it when the drag ends or the
 *  control goes away, so a drag is one undo step and none is left open. */
export function useDrag(g) {
    const open = useRef(false);
    const live = useRef(g);
    live.current = g;
    const begin = () => {
        if (open.current) return;
        open.current = true;
        live.current.begin();
    };
    const end = () => {
        if (!open.current) return;
        open.current = false;
        live.current.end();
    };
    useEffect(() => end, []);
    return { begin, end };
}

/** A number field of the Look: a slider to drag and a box to type in, both
 *  tied to the label; shows the effective value, normal once overridden. */
export function Num({ path, label, hint, disabled = false }) {
    const { view, set, clear, g } = useCap();
    const id = useId();
    const spec = numSpec(path);
    const ui = numUi(path);
    const drag = useDrag(g);
    const value = view.val(path);
    const isSet = view.isSet(path);
    const fmt = (v) => `${(v * ui.k).toFixed(ui.digits)}${ui.unit}`;
    return (
        <Row label={label} htmlFor={id} set={isSet} onReset={() => clear(path)} hint={hint}>
            <div className={cn('flex items-center gap-1.5', disabled && 'opacity-60')}>
                <Slider
                    label={label}
                    value={value}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    bigStep={spec.step * 10}
                    format={fmt}
                    showValue={false}
                    dim={!isSet}
                    disabled={disabled}
                    className="min-w-0 flex-1"
                    onChange={(v) => set(path, spec.int ? Math.round(v) : v)}
                    onDragStart={drag.begin}
                    onDragEnd={drag.end}
                />
                <NumBox id={id} value={value} spec={spec} ui={ui} set={isSet} disabled={disabled} onChange={(v) => set(path, v)} />
            </div>
        </Row>
    );
}

/** A colour field of the Look: its name, then the colour well (the effective
 *  colour shows quietly until the Look sets one). */
export function Colour({ path, label, disabled = false }) {
    const t = useT();
    const { view, set, clear } = useCap();
    const isSet = view.isSet(path);
    const value = view.val(path);
    return (
        <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2">
            <span className={cn('truncate text-[11px]', isSet ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
            <Swatch
                label={label}
                resetLabel={t('Reset {name}', { name: label })}
                value={isSet ? value : undefined}
                fallback={value}
                disabled={disabled}
                onChange={(v) => set(path, v)}
                onReset={() => clear(path)}
            />
        </div>
    );
}
