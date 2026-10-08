import { useStore } from '../../lib/socket';

/** The one-line "this engine is older" note. It shows only while the
 *  engine's capability list (its `hello` snapshot) lacks `cap`, so each
 *  panel warns about exactly what it needs. */
export function CapNotice({ cap, text }) {
    const caps = useStore((s) => s.caps);
    if (caps.includes(cap)) return null;
    return <p className="text-[11px] leading-snug text-muted-foreground">{text}</p>;
}
