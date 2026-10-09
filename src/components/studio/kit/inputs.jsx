import { useContext, useEffect, useId, useRef, useState } from 'react';
import { Slider, Swatch } from '../../digiclip/controls';
import { Kicker } from '../../digiclip/fields';
import { mergePatch } from '../../../lib/captionEffective';
import { colourShown, colourText, pickColour, pickOpacity } from '../../../lib/colourField';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/utils';
import { ResetBtn } from '../Field';
import { useAlpha } from '../useAlpha';
import { PanelContext, usePanel } from './context';

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
export function Row({ label, detail, htmlFor, set = false, onReset, hint, hintId, children }) {
    const labels = useContext(PanelContext)?.labels;
    return (
        <div className="space-y-1">
            <div className="flex h-5 items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-1.5">
                    <label htmlFor={htmlFor} className={cn('min-w-0 truncate text-[11px]', set ? 'text-foreground' : 'text-muted-foreground')}>{label}</label>
                    {detail && <span className={cn('shrink-0 text-[11px]', set ? 'text-foreground' : 'text-muted-foreground')}>{detail}</span>}
                </div>
                {set && onReset && <ResetBtn label={label} tip={labels?.value} onClick={onReset} className="-mr-1" />}
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
    const { view, set, clear, g, num } = usePanel();
    const id = useId();
    const { spec, ui } = num(path);
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
                    min={spec.sliderMin ?? spec.min}
                    max={spec.sliderMax ?? spec.max}
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
 *  colour shows quietly until the Look sets one). The name is never cut: it
 *  keeps a 96px column beside the well, and when a longer name leaves the
 *  well under 168px (room for eight hex digits, the opacity chip and the
 *  reset) the well drops to a line of its own below the name.
 *
 *  With the engine's `look.alpha` the well has an Opacity slider (0 to 100 %)
 *  that writes the colour's own opacity (`#RRGGBBAA` below 100 %). When the
 *  colour's opacity is a number of the Look (`opacity`, the path of that
 *  number: a box's, a card's, a track's, a shadow's) the slider edits that
 *  number instead and the colour stays six digits, with or without the
 *  ability: one source of truth. A Look that holds both shows their product
 *  and keeps the number alone from the next edit.
 *
 *  `onPick` / `onBack` write somewhere other than the Look's section (the
 *  bar's flat colour). */
export function Colour({ path, label, opacity: opacityPath, disabled = false, onPick, onBack }) {
    const t = useT();
    const alpha = useAlpha();
    const { view, set, clear, setPatch, patchFor, g } = usePanel();
    const drag = useDrag(g);
    const bound = opacityPath !== undefined;
    const colourSet = view.isSet(path);
    const numberSet = bound && view.isSet(opacityPath);
    const value = view.val(path);
    const number = bound ? view.val(opacityPath) : undefined;
    const shown = colourShown(value, number);

    /** Write what an edit answered: the colour and, bound, the number. */
    function write({ colour, number: n }) {
        if (colour !== undefined && onPick) onPick(colour);
        let patch = {};
        if (colour !== undefined && !onPick) patch = mergePatch(patch, patchFor(path, colour));
        if (n !== undefined) patch = mergePatch(patch, patchFor(opacityPath, n));
        if (Object.keys(patch).length) setPatch(patch);
    }
    const slider = bound || alpha;
    return (
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <span className={cn('flex min-h-8 max-w-full min-w-[96px] items-center text-[11px] leading-snug break-words', colourSet || numberSet ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
            <Swatch
                label={label}
                resetLabel={t('Reset {name}', { name: label })}
                value={colourSet ? colourText(value, alpha) : undefined}
                fallback={colourText(value, alpha)}
                set={colourSet || numberSet}
                disabled={disabled}
                onChange={(typed) => {
                    const res = pickColour(value, typed, number);
                    if (res) write(res);
                }}
                onReset={() => {
                    if (onBack) onBack();
                    else clear(...(bound ? [path, opacityPath] : [path]));
                }}
                opacity={slider ? {
                    value: shown.opacity,
                    label: t('Opacity of {name}', { name: label }),
                    set: bound ? (numberSet || (colourSet && shown.both)) : (colourSet && shown.opacity < 1),
                    onChange: (a) => {
                        // An unset colour at full opacity is still the style's own.
                        if (!bound && !colourSet && a >= 1) return;
                        write(pickOpacity(value, a, bound));
                    },
                    onDragStart: drag.begin,
                    onDragEnd: drag.end,
                } : undefined}
                className="min-w-0 grow basis-[168px]"
            />
        </div>
    );
}

/** The Opacity of a whole element (captions, headline, bar, logo): a slider
 *  and a box, 0 to 100 %, tied to `opacity` of the layer's Look section.
 *  Captions, headline and bar have it with the engine's `look.alpha` only; the
 *  logo's is older (`always`). */
export function ElementOpacity({ always = false, disabled = false }) {
    const t = useT();
    const alpha = useAlpha();
    if (!always && !alpha) return null;
    return <Num path="opacity" label={t('Opacity')} disabled={disabled} />;
}
