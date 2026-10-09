import { ChevronDown } from 'lucide-react';

/**
 * A choice that reads as part of a sentence: its text on the line, a small
 * chevron, and a native select laid invisibly over it. The select does the
 * work (keyboard, screen reader, the system's own list), so there is no
 * popup of our own to keep in step. `options`: `{value, text}`.
 */
export default function InlinePick({ label, value, text, options, onChange }) {
    return (
        <span className="relative inline-flex h-7 shrink-0 items-center rounded-md transition-colors hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <span aria-hidden className="flex items-center gap-1 px-2 text-[12px] whitespace-nowrap">
                {text}
                <ChevronDown className="size-3 text-muted-foreground" />
            </span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                aria-label={label}
                className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 outline-none [color-scheme:dark]"
            >
                {options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
            </select>
        </span>
    );
}
