import { useStore } from '../../lib/socket';

/** The one-line "this engine is older" note. It shows only while the
 *  engine's capability list (its `hello` snapshot) lacks `cap`, so each
 *  panel warns about exactly what it needs. `unless` names a cap whose own
 *  note already says it: with that one missing too, this note stays quiet. */
export function CapNotice({ cap, text, unless }) {
    const caps = useStore((s) => s.caps);
    if (caps.includes(cap) || (unless && !caps.includes(unless))) return null;
    return <p className="text-[11px] leading-snug text-muted-foreground">{text}</p>;
}
