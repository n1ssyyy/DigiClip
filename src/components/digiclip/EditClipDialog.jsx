import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Minus, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { editClip, flashMessage, getTranscript } from '../../lib/socket';
import CaptionPicker from './CaptionPicker';
import Modal, { fmtTime, parseTime } from './Modal';

const CONTEXT_S = 12;
const STEP_S = 0.5;
const inputCls = 'h-8 w-full min-w-0 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-2.5 text-[12px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring';

/** Start/end field: typed `m:ss.s` plus half-second nudges. */
function TimeField({ label, value, onChange, min, max }) {
    const [text, setText] = useState(fmtTime(value));
    useEffect(() => setText(fmtTime(value)), [value]);
    const clamp = (v) => Math.max(min, Math.min(max, Math.round(v * 100) / 100));
    function commit() {
        const v = parseTime(text);
        if (v == null) setText(fmtTime(value));
        else onChange(clamp(v));
    }
    return (
        <div className="min-w-0 space-y-1">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <div className="flex h-8 items-stretch gap-1">
                <button type="button" aria-label={`${label} earlier`} onClick={() => onChange(clamp(value - STEP_S))} className="rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                    <Minus className="size-3.5" aria-hidden />
                </button>
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
                    aria-label={label}
                    className={cn(inputCls, 'text-center font-mono tabular-nums')}
                />
                <button type="button" aria-label={`${label} later`} onClick={() => onChange(clamp(value + STEP_S))} className="rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                    <Plus className="size-3.5" aria-hidden />
                </button>
            </div>
        </div>
    );
}

/** Re-render one clip: trim or extend its range on the transcript, fix
 *  misheard caption words, change title or caption style. The engine
 *  re-cuts and re-renders only this clip. */
export default function EditClipDialog({ job, clip, onClose, leaving }) {
    const [words, setWords] = useState(null);
    const [loadErr, setLoadErr] = useState(null);
    const [start, setStart] = useState(clip.start_s);
    const [end, setEnd] = useState(clip.end_s);
    const [title, setTitle] = useState(clip.title ?? '');
    const [style, setStyle] = useState(clip.style || 'karaoke');
    const [mode, setMode] = useState('range'); // range | fix
    const [fixes, setFixes] = useState({}); // word start (s) -> text
    const [editing, setEditing] = useState(null); // word start being typed
    const [saving, setSaving] = useState(false);
    const editRef = useRef(null);

    useEffect(() => {
        let dead = false;
        getTranscript(job.id)
            .then((d) => { if (!dead) setWords(d?.words ?? []); })
            .catch((e) => { if (!dead) setLoadErr(e?.message ?? String(e)); });
        return () => { dead = true; };
    }, [job.id]);

    useEffect(() => { editRef.current?.focus(); }, [editing]);

    const duration = job.duration_s || Math.max(end + CONTEXT_S, 1);
    // Words around the clip, so it can grow into its neighbours.
    const near = useMemo(() => (words ?? []).filter(
        (w) => w.e >= Math.min(start, clip.start_s) - CONTEXT_S && w.s <= Math.max(end, clip.end_s) + CONTEXT_S,
    ), [words, start, end, clip.start_s, clip.end_s]);

    function clickWord(w) {
        if (mode === 'fix') {
            if (w.s >= start - 0.05 && w.e <= end + 0.05) setEditing(w.s);
            return;
        }
        // Range mode: the nearer edge moves to the word.
        if (w.s < start || (w.s - start) < (end - w.e)) setStart(Math.min(w.s, end - 1));
        else setEnd(Math.max(w.e, start + 1));
    }

    const len = end - start;
    const rangeChanged = Math.abs(start - clip.start_s) > 1e-3 || Math.abs(end - clip.end_s) > 1e-3;
    // Fixes only count for words still inside the clip.
    const fixList = Object.entries(fixes)
        .map(([s, w]) => ({ s: +s, w }))
        .filter((f) => f.s >= start - 0.05 && f.s <= end);
    const dirty = rangeChanged || title.trim() !== (clip.title ?? '') || style !== clip.style || fixList.length > 0;

    function save() {
        if (len < 1) {
            flashMessage('A clip needs at least a second.');
            return;
        }
        const patch = {};
        if (rangeChanged) {
            patch.start_s = start;
            patch.end_s = end;
        }
        if (title.trim() !== (clip.title ?? '')) patch.title = title.trim();
        if (style !== clip.style) patch.style = style;
        if (fixList.length) patch.fixes = fixList;
        setSaving(true);
        editClip(job.id, clip.rank, patch)
            .then(() => {
                flashMessage(`Re-rendering clip #${clip.rank}…`);
                onClose();
            })
            .catch((e) => flashMessage(`Couldn't edit clip #${clip.rank}: ${e?.message ?? e}`))
            .finally(() => setSaving(false));
    }

    return (
        <Modal
            title={`Edit clip #${clip.rank}`}
            sub={`${fmtTime(start)} → ${fmtTime(end)} · ${len.toFixed(1)}s`}
            width={620}
            onClose={onClose}
            leaving={leaving}
            labelId="edit-clip-title"
            footer={(
                <>
                    <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                    <Button size="sm" disabled={!dirty || saving} onClick={save}>
                        {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                        Re-render
                    </Button>
                </>
            )}
        >
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <TimeField label="Start" value={start} min={0} max={end - 1} onChange={setStart} />
                    <TimeField label="End" value={end} min={start + 1} max={duration} onChange={setEnd} />
                </div>
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Transcript</p>
                        <div className="flex overflow-hidden rounded-md border border-white/10 text-[11px]" role="radiogroup" aria-label="Click words to">
                            {[{ id: 'range', label: 'Set range' }, { id: 'fix', label: 'Fix words' }].map((o) => (
                                <button
                                    key={o.id} type="button" role="radio" aria-checked={mode === o.id}
                                    onClick={() => { setMode(o.id); setEditing(null); }}
                                    className={cn('px-2 py-1 hover:bg-accent', mode === o.id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground')}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        {mode === 'range'
                            ? 'Click a word to move the nearer edge of the clip to it.'
                            : 'Click a word inside the clip to correct its caption. Leave it empty to drop the word.'}
                    </p>
                    <div className="max-h-56 overflow-y-auto rounded-md border border-white/10 bg-black/20 p-2 text-[13px] leading-7">
                        {loadErr ? (
                            <p className="text-red-400">Couldn't load the transcript: {loadErr}</p>
                        ) : words == null ? (
                            <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading transcript…</p>
                        ) : near.map((w) => {
                            const inside = w.s >= start - 0.05 && w.e <= end + 0.05;
                            const fixed = fixes[w.s];
                            if (editing === w.s) {
                                return (
                                    <input
                                        key={w.s}
                                        ref={editRef}
                                        defaultValue={fixed ?? w.w}
                                        aria-label={`Caption for “${w.w}”`}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') e.currentTarget.blur();
                                            if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); }
                                        }}
                                        onBlur={(e) => {
                                            const v = e.currentTarget.value.trim();
                                            setFixes((f) => {
                                                const next = { ...f };
                                                if (v === w.w.trim()) delete next[w.s];
                                                else next[w.s] = v;
                                                return next;
                                            });
                                            setEditing(null);
                                        }}
                                        className="mx-0.5 inline-block w-28 rounded border border-white/30 bg-black/40 px-1 text-[13px] outline-none"
                                    />
                                );
                            }
                            return (
                                <button
                                    key={w.s}
                                    type="button"
                                    title={fmtTime(w.s)}
                                    onClick={() => clickWord(w)}
                                    className={cn(
                                        'rounded px-0.5 hover:bg-white/15',
                                        inside ? 'bg-white/10 text-foreground' : 'text-muted-foreground/60',
                                        fixed != null && 'underline decoration-orange-400 decoration-2 underline-offset-4',
                                    )}
                                >
                                    {fixed != null ? (fixed || <s className="opacity-60">{w.w.trim()}</s>) : w.w.trim()}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <div className="min-w-0 space-y-1">
                        <p className="text-[10px] text-muted-foreground">Title</p>
                        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Clip title" className={inputCls} />
                    </div>
                    <div className="w-44 space-y-1">
                        <p className="text-[10px] text-muted-foreground">Caption style</p>
                        <CaptionPicker value={style} onChange={setStyle} compact />
                    </div>
                </div>
            </div>
        </Modal>
    );
}
