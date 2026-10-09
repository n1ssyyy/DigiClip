import { ChevronDown } from 'lucide-react';
import Tip from './Tooltip';
import { cn } from '../../lib/utils';

/** The face of a picker on Home's add bar: a field-height control with a small
 *  muted label, the current value (cut with an ellipsis when long; the label gives way first) and a
 *  chevron. The bevel is the link field's, so the row reads as one family. */
export const pickerBox = 'relative flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] pr-1.5 pl-2 text-left text-[12px] transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring';

export function PickerFace({ label, text, mark = false, open = false }) {
    return (
        <>
            <span aria-hidden className="min-w-0 shrink-[3] truncate font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{label}</span>
            <span aria-hidden className="min-w-0 grow truncate font-medium">{text}</span>
            {mark && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-foreground/80" />}
            <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
        </>
    );
}

/**
 * A choice on the add bar: the picker's face with a native select laid
 * invisibly over it. The select does the work (keyboard, screen reader, the
 * system's own list), so there is no popup of our own to keep in step. The full
 * value is the tooltip, for when the face cuts it. `options`: `{value, text}`.
 * `face`, when given, is what the face shows instead of `text` (a value that
 * would only repeat the label, like "5 clips" under "Clips"); the tooltip and
 * the name then say "Clips: 5", and the list of choices keeps the full wording.
 */
export default function InlinePick({ label, value, text, face, options, onChange }) {
    const shown = face ?? text;
    return (
        <Tip label={`${label}: ${shown}`} side="bottom" className="w-full">
            <span className={cn(pickerBox, 'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring')}>
                <PickerFace label={label} text={shown} />
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-label={face === undefined ? label : `${label}: ${face}`}
                    className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 outline-none [color-scheme:dark]"
                >
                    {options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
                </select>
            </span>
        </Tip>
    );
}
