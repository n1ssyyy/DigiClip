import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { addClip, flashMessage, getTranscript } from '../../lib/socket';
import Modal, { fmtTime } from './Modal';

const inputCls = 'h-8 w-full min-w-0 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-2.5 text-[12px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring';

/** Paragraphs: break on a long pause or every ~45 words, each headed by
 *  its start time. */
function paragraphs(words) {
    const out = [];
    let cur = [];
    words.forEach((w, i) => {
        const prev = words[i - 1];
        if (cur.length && ((prev && w.s - prev.e > 1.2) || cur.length >= 45)) {
            out.push(cur);
            cur = [];
        }
        cur.push(i);
    });
    if (cur.length) out.push(cur);
    return out;
}

/** Make a clip from any stretch of the talk: click the first word, then
 *  the last. The engine cuts, captions and renders it as a new clip. */
export default function TranscriptDialog({ job, onClose, leaving }) {
    const [words, setWords] = useState(null);
    const [loadErr, setLoadErr] = useState(null);
    const [a, setA] = useState(null); // word index
    const [b, setB] = useState(null);
    const [hover, setHover] = useState(null);
    const [query, setQuery] = useState('');
    const [title, setTitle] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let dead = false;
        getTranscript(job.id)
            .then((d) => { if (!dead) setWords(d?.words ?? []); })
            .catch((e) => { if (!dead) setLoadErr(e?.message ?? String(e)); });
        return () => { dead = true; };
    }, [job.id]);

    const paras = useMemo(() => paragraphs(words ?? []), [words]);
    const q = query.trim().toLowerCase();
    const hits = useMemo(() => {
        if (!q || !words) return null;
        const set = new Set();
        words.forEach((w, i) => { if (w.w.toLowerCase().includes(q)) set.add(i); });
        return set;
    }, [q, words]);

    // Live range: first click anchors, the hover previews the second.
    const lo = a == null ? null : Math.min(a, b ?? hover ?? a);
    const hi = a == null ? null : Math.max(a, b ?? hover ?? a);
    const range = a != null && b != null && words ? { s: words[lo].s, e: words[hi].e } : null;
    const len = range ? range.e - range.s : 0;

    function click(i) {
        if (a == null || b != null) {
            setA(i);
            setB(null);
        } else {
            setB(i);
        }
    }

    function make() {
        if (!range) return;
        setSaving(true);
        addClip(job.id, range.s, range.e, title.trim() ? { title: title.trim() } : {})
            .then((d) => {
                flashMessage(`Making clip #${d?.rank ?? ''} from the transcript…`);
                onClose();
            })
            .catch((e) => flashMessage(`Couldn't make the clip: ${e?.message ?? e}`))
            .finally(() => setSaving(false));
    }

    return (
        <Modal
            title={`Transcript · ${job.name}`}
            sub={range ? `${fmtTime(range.s)} → ${fmtTime(range.e)} · ${len.toFixed(1)}s` : 'Click the first word, then the last'}
            width={720}
            onClose={onClose}
            leaving={leaving}
            labelId="transcript-title"
            footer={(
                <>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Title (optional)"
                        aria-label="New clip title"
                        maxLength={120}
                        className={cn(inputCls, 'mr-auto max-w-64')}
                    />
                    {range && (len < 5 || len > 180) && (
                        <span className="text-[11px] text-orange-400">{len < 5 ? 'Very short clip' : 'Long for a short'}</span>
                    )}
                    <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                    <Button size="sm" disabled={!range || len < 1 || saving} onClick={make}>
                        {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                        Make clip
                    </Button>
                </>
            )}
        >
            <div className="sticky top-0 z-10 -mx-1 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-1 pb-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Find a word or phrase"
                        aria-label="Search the transcript"
                        className={cn(inputCls, 'pl-7')}
                    />
                    {hits && <span className="absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">{hits.size} found</span>}
                </div>
            </div>
            {loadErr ? (
                <p className="text-[13px] text-red-400">Couldn't load the transcript: {loadErr}</p>
            ) : words == null ? (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading transcript…</p>
            ) : words.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">This video has no transcript.</p>
            ) : (
                <div className="space-y-2 text-[13px] leading-7" onMouseLeave={() => setHover(null)}>
                    {paras.map((idx) => (
                        <p key={idx[0]}>
                            <span className="mr-2 font-mono text-[10px] text-muted-foreground">{fmtTime(words[idx[0]].s)}</span>
                            {idx.map((i) => {
                                const sel = lo != null && i >= lo && i <= hi;
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => click(i)}
                                        onMouseEnter={() => setHover(i)}
                                        className={cn(
                                            'rounded px-0.5 hover:bg-white/15',
                                            sel && (b != null ? 'bg-emerald-500/30 text-foreground' : 'bg-white/15'),
                                            hits?.has(i) && 'ring-1 ring-orange-400',
                                        )}
                                    >
                                        {words[i].w.trim()}
                                    </button>
                                );
                            })}
                        </p>
                    ))}
                </div>
            )}
        </Modal>
    );
}
