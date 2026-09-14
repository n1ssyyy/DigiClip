import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import { Button } from '../components/ui/button';
import { UploadCloud, FileVideo, Pause, Play, X, RotateCcw, Film, Download, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { getEcho } from '../lib/echo';
import Tip from '../components/digiclip/Tooltip';
import { FadeImg } from '../components/digiclip/Skeleton';

// Pipeline steps shown as dots joined by lines in the queue.
const STEPS = [
    { key: 'upload', label: 'Upload' },
    { key: 'audio', label: 'Audio' },
    { key: 'script', label: 'Script' },
    { key: 'clips', label: 'Clips' },
];

// Maps a project status to { done, active, failed, paused } step indexes.
function stepState(status) {
    switch (status) {
        case 'queued':
        case 'extracting':
            return { done: 1, active: 1 };
        case 'extracted':
        case 'transcribing':
            return { done: 2, active: 2 };
        case 'transcribed':
        case 'analyzing':
            return { done: 3, active: 3 };
        case 'clips_ready':
            return { done: 4, active: null };
        case 'paused':
            return { done: 1, active: null, paused: true };
        case 'failed':
            return { done: 1, active: null, failed: true };
        default:
            return { done: 0, active: 0 };
    }
}

const ACTIVE = ['queued', 'extracting', 'extracted', 'transcribing', 'transcribed', 'analyzing'];
const LIVE_LABEL = {
    queued: 'Queued', extracting: 'Extracting audio', extracted: 'Audio ready',
    transcribing: 'Transcribing', transcribed: 'Transcript ready', analyzing: 'Picking clips',
    clips_ready: 'Ready', paused: 'Paused', failed: 'Failed',
};

// Status signal, one language everywhere: green done, orange working,
// red broken. Colors crossfade (background-color + color transitions)
// so status changes melt instead of snapping.
function statusDot(status) {
    if (status === 'failed') return 'bg-red-500';
    if (status === 'clips_ready') return 'bg-emerald-500';
    return 'animate-pulse bg-orange-500';
}

// Scroller names read the same signal as the pill: white done,
// orange working, red broken.
function statusText(status) {
    if (status === 'failed') return 'text-red-500';
    if (status === 'clips_ready') return 'text-white';
    return 'text-orange-500';
}

/** Crossfading label: old text fades out, new text fades in, and the
 *  wrapper width animates so the pill breathes with its content. */
function SwapLabel({ text, className }) {
    const [shown, setShown] = useState(text);
    const [phase, setPhase] = useState('in');
    const timer = useRef(null);

    useEffect(() => {
        if (text === shown) return;
        setPhase('out');
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            setShown(text);
            setPhase('in');
        }, 140);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [text, shown]);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    return (
        <span
            className={cn(
                'inline-block motion-safe:transition-all motion-safe:duration-150',
                phase === 'out' ? 'opacity-0' : 'opacity-100',
                className,
            )}
        >
            {shown}
        </span>
    );
}

function fmtDur(s) {
    if (s == null) return null;
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function fmtRange(a, b) {
    if (a == null || b == null) return null;
    return `${fmtDur(a)} → ${fmtDur(b)}`;
}

/** Dots-and-lines pipeline stepper for one queued video. Wears the status
 *  color end to end: green done, orange working, red broken. */
const TONES = {
    green: { dot: 'bg-emerald-500', line: 'bg-emerald-500/60', ring: 'ring-emerald-500/20' },
    orange: { dot: 'bg-orange-500', line: 'bg-orange-500/60', ring: 'ring-orange-500/20' },
    red: { dot: 'bg-red-500', line: 'bg-red-500/60', ring: 'ring-red-500/20' },
};

function Stepper({ status }) {
    const st = stepState(status);
    const tone = TONES[st.failed ? 'red' : status === 'clips_ready' ? 'green' : 'orange'];
    const current = st.active != null ? STEPS[st.active]?.label : (st.failed ? 'Failed' : st.paused ? 'Paused' : 'Done');
    return (
        <div className="flex items-center" aria-label={`Pipeline: ${current}`}>
            {STEPS.map((s, i) => {
                const done = i < st.done;
                const active = i === st.active;
                const failedDot = st.failed && i === 1;
                return (
                    <div key={s.key} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
                        <Tip label={s.label} side="top" className="shrink-0">
                            <span
                                className={cn(
                                'size-2.5 shrink-0 rounded-full motion-safe:transition-colors motion-safe:duration-500',
                                done && !failedDot && tone.dot,
                                active && cn('animate-pulse ring-4', tone.dot, tone.ring),
                                failedDot && cn(tone.dot, 'ring-4', tone.ring),
                                !done && !active && !failedDot && 'bg-border',
                                st.paused && !done && 'bg-orange-500/50',
                            )}
                        />
                        </Tip>
                        {i < STEPS.length - 1 && (
                            <span className={cn('relative mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-border')} aria-hidden>
                                <span className={cn(
                                    'absolute inset-0 origin-left rounded-full motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out',
                                    tone.line,
                                    i + 1 <= st.done ? 'scale-x-100' : 'scale-x-0',
                                )} />
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** Cancel confirmation: replaces window.confirm with an in-app dialog.
 *  Exit plays the entrance in reverse (pop-out + fade-out) before
 *  unmounting, so open and close feel like one motion. */
function CancelDialog({ project, onClose, leaving }) {
    const keepRef = useRef(null);

    useEffect(() => {
        keepRef.current?.focus();
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    function confirm() {
        router.delete(`/projects/${project.id}`, { preserveScroll: true, onFinish: onClose });
    }

    return (
        <div
            className={cn('fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm', leaving ? 'fade-out' : 'fade')}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="cancel-title"
                aria-describedby="cancel-desc"
                className={cn('w-[min(400px,calc(100vw-3rem))] rounded-lg border bg-card p-5 shadow-2xl', leaving ? 'pop-out' : 'pop')}
            >
                <h2 id="cancel-title" className="text-sm font-semibold">Cancel and remove?</h2>
                <p id="cancel-desc" className="mt-1.5 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{project.name}</span>
                    {' '}stops processing and its source file is deleted. This can't be undone.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                    <Button ref={keepRef} variant="outline" size="sm" onClick={onClose}>
                        Keep video
                    </Button>
                    <Button variant="destructive" size="sm" onClick={confirm}>
                        Remove
                    </Button>
                </div>
            </div>
        </div>
    );
}

/** One queue row: top half (name left, status center, buttons right),
 *  bottom half (thicker live stepper). Exits via `leaving` (slide toward
 *  the nearest edge when the row sits at the top/bottom of the list,
 *  plain fade for middle rows), held mounted by the parent's ExitBeat. */
function QueueRow({ project, onCancel, leaving, edge }) {
    const pausable = ACTIVE.includes(project.status);
    const paused = project.status === 'paused';
    const failed = project.status === 'failed';
    const label = LIVE_LABEL[project.status] ?? project.status;

    return (
        <div className={cn(
            'flex items-center gap-3 rounded-lg border bg-card p-2.5',
            !leaving && 'rise',
            leaving && edge === 'top' && 'row-out-top',
            leaving && edge === 'bottom' && 'row-out-bottom',
            leaving && !edge && 'row-out-fade',
        )}>
            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
                <FileVideo className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
                <FadeImg src={`/projects/${project.id}/poster`} />
                <span className={cn('absolute top-1.5 left-1.5 size-2 rounded-full ring-2 ring-black/50', statusDot(project.status))} aria-hidden />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 self-stretch py-0.5">
                <div className="flex items-center gap-2">
                    <Tip label={project.name} side="top" className="min-w-0">
                        <p className="min-w-0 shrink truncate text-sm font-medium">{project.name}</p>
                    </Tip>
                    <span className="flex flex-1 items-center justify-center">
                        <Badge variant="secondary" className={cn(
                            'whitespace-nowrap motion-safe:transition-all motion-safe:duration-500',
                            failed ? 'text-red-500' : project.status === 'clips_ready' ? 'text-emerald-500' : 'text-orange-500',
                        )}
                        >
                            <SwapLabel text={label} />
                        </Badge>
                    </span>
                    <span className="flex shrink-0 items-center justify-end gap-0.5">
                        {pausable && (
                            <Tip label="Pause" side="top">
                                <button
                                    type="button" aria-label={`Pause ${project.name}`}
                                    onClick={() => router.post(`/projects/${project.id}/pause`, {}, { preserveScroll: true })}
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                    <Pause className="size-4" />
                                </button>
                            </Tip>
                        )}
                        {paused && (
                            <Tip label="Resume" side="top">
                                <button
                                    type="button" aria-label={`Resume ${project.name}`}
                                    onClick={() => router.post(`/projects/${project.id}/resume`, {}, { preserveScroll: true })}
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                    <Play className="size-4" />
                                </button>
                            </Tip>
                        )}
                        {failed && (
                            <Tip label="Retry" side="top">
                                <button
                                    type="button" aria-label={`Retry ${project.name}`}
                                    onClick={() => router.post(`/projects/${project.id}/retry`, {}, { preserveScroll: true })}
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                    <RotateCcw className="size-4" />
                                </button>
                            </Tip>
                        )}
                        <Tip label="Cancel and remove" side="top">
                            <button
                                type="button" aria-label={`Cancel ${project.name}`}
                                onClick={() => onCancel(project)}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                                <X className="size-4" />
                            </button>
                        </Tip>
                    </span>
                </div>
                <div className="rounded-md border bg-muted/40 px-2.5 py-2">
                    <Stepper status={project.status} />
                    {failed && project.error && (
                        <Tip label={project.error} side="top" className="min-w-0">
                            <p className="mt-1 truncate text-[11px] text-red-500 min-w-0">{project.error}</p>
                        </Tip>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Delayed unmount: keeps children mounted for the exit beat after
 *  `open` flips false, passing `leaving` down so the dialog can play
 *  its entrance in reverse. Mounts instantly when `open` flips true.
 *  `ms` must cover the exit animation (dialogs 150ms, rows 240ms). */
function ExitBeat({ open, ms = 150, children }) {
    const [held, setHeld] = useState(open);
    const [leaving, setLeaving] = useState(false);
    const timer = useRef(null);
    const heldRef = useRef(null);
    if (open) heldRef.current = children;

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        if (open) {
            setHeld(true);
            setLeaving(false);
        } else if (held) {
            setLeaving(true);
            timer.current = setTimeout(() => {
                setHeld(false);
                setLeaving(false);
            }, ms);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    if (!held) return null;
    const kids = open ? children : heldRef.current;
    if (!kids) return null;
    const only = Array.isArray(kids) ? kids[0] : kids;
    if (only && typeof only === 'object' && 'props' in only) {
        return { ...only, props: { ...only.props, leaving } };
    }
    return kids;
}

/** One queue row with a graceful delete: when the row's id disappears
 *  from `ids` (server confirmed the delete via poll), the row plays its
 *  exit (slide toward the nearest edge for top/bottom rows, fade for
 *  middle rows) while the surviving rows ease into place, then unmounts.
 *  New rows still mount with .rise. */
function QueueExitBeat({ id, ids, project, onCancel }) {
    const [gone, setGone] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [edge, setEdge] = useState(null);
    const timer = useRef(null);
    const ref = useRef(null);

    useEffect(() => {
        if (ids.includes(id)) return;
        setLeaving(true);
        timer.current = setTimeout(() => setGone(true), 240);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [ids, id]);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    // Edge from live position: measure once when the exit starts.
    useEffect(() => {
        if (!leaving || !ref.current) return;
        try {
            const list = ref.current.closest('[data-queue-list]');
            if (!list) return;
            const rows = [...list.querySelectorAll('[data-queue-row]')];
            const at = rows.indexOf(ref.current);
            if (at === 0) setEdge('top');
            else if (at === rows.length - 1) setEdge('bottom');
            else setEdge(null);
        } catch {
        }
    }, [leaving]);

    if (gone) return null;
    return (
        <div ref={ref} data-queue-row>
            <QueueRow project={project} onCancel={onCancel} leaving={leaving} edge={edge} />
        </div>
    );
}

/** One generated clip: title, time range, and its render state, a download
 *  button the moment the video file exists. */
/** In-app video player: same overlay language as the cancel dialog.
 *  The <video> element is mounted once and only its src/poster swap per
 *  selection: remounting on every poll (or mid-load) restarted buffering
 *  from byte zero, which read as a flash/cutout. State also resets only
 *  when the src actually changes, so the parent's 10s reloads can't yank
 *  a playing video back to its skeleton. */
function PlayerDialog({ title, sub, src, poster, tall, onClose, leaving }) {
    const videoRef = useRef(null);
    const [waiting, setWaiting] = useState(true);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const srcRef = useRef(src);

    // New selection: show the loader behind the incoming video, keep the
    // old frame visible underneath until the new one can play.
    if (srcRef.current !== src) {
        srcRef.current = src;
        setWaiting(true);
        setFailed(false);
    }

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        if (el.getAttribute('src') !== src) el.setAttribute('src', src);
        el.load();
    }, [src]);

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        if (poster != null) el.setAttribute('poster', poster);
        else el.removeAttribute('poster');
    }, [poster]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className={cn('fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm', leaving ? 'fade-out' : 'fade')}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={cn(
                    'rounded-lg border bg-card p-4 shadow-2xl',
                    // Generated clips are 9:16 vertical: narrow portrait box.
                    // Source playback stays a wide landscape box.
                    tall ? 'w-[min(400px,100%)]' : 'w-[min(760px,100%)]',
                    leaving ? 'pop-out' : 'pop',
                )}
            >
                <div className="flex items-center gap-2 pb-3">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
                    {sub && <p className="shrink-0 font-mono text-[11px] text-muted-foreground">{sub}</p>}
                    <button
                        type="button" aria-label="Close player" autoFocus
                        onClick={onClose}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="size-4" aria-hidden />
                    </button>
                </div>
                <div className="relative">
                    {!ready && <span aria-hidden className="skel absolute inset-0 rounded-md" />}
                    {waiting && !failed && (
                        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </span>
                    )}
                    {failed && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-md bg-black/60 p-4 text-center">
                            <p className="text-sm font-medium text-white">Couldn't load this video</p>
                            <button
                                type="button"
                                onClick={() => { setFailed(false); setWaiting(true); videoRef.current?.load(); }}
                                className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                            >
                                Retry
                            </button>
                        </div>
                    )}
                    <video
                        ref={videoRef}
                        className={cn(
                            'rounded-md bg-black motion-safe:transition-opacity motion-safe:duration-300',
                            // Portrait clips letterbox inside a capped 9:16
                            // frame; landscape source fills the wide box.
                            tall ? 'mx-auto aspect-[9/16] max-h-[62dvh] w-auto' : 'aspect-video w-full',
                            ready ? 'opacity-100' : 'opacity-0',
                        )}
                        controls
                        playsInline
                        preload="auto"
                        onCanPlay={() => { setWaiting(false); setFailed(false); setReady(true); }}
                        onPlaying={() => { setWaiting(false); setFailed(false); setReady(true); }}
                        onWaiting={() => { if (!failed) setWaiting(true); }}
                        onStalled={() => { if (!ready && !failed) setWaiting(true); }}
                        onError={() => { setWaiting(false); setFailed(true); }}
                    />
                </div>
            </div>
        </div>
    );
}

function ClipTile({ clip, tall, projectName, onPlay, fresh }) {
    const renders = clip.renders ?? [];
    const render = renders[renders.length - 1] ?? null;
    const playable = render?.status === 'done';
    // making -> done crossfade: the render pill melts between states
    // instead of snapping, and the poster fades in over the tile.
    const [pillShown, setPillShown] = useState(playable ? 'done' : render?.status === 'failed' ? 'failed' : 'making');
    const [pillPhase, setPillPhase] = useState('in');
    const pillTimer = useRef(null);
    const pillTarget = playable ? 'done' : render?.status === 'failed' ? 'failed' : 'making';
    useEffect(() => {
        if (pillTarget === pillShown) return;
        setPillPhase('out');
        if (pillTimer.current) clearTimeout(pillTimer.current);
        pillTimer.current = setTimeout(() => {
            setPillShown(pillTarget);
            setPillPhase('in');
        }, 140);
        return () => { if (pillTimer.current) clearTimeout(pillTimer.current); };
    }, [pillTarget, pillShown]);
    useEffect(() => () => { if (pillTimer.current) clearTimeout(pillTimer.current); }, []);
    return (
        <div
            role={playable ? 'button' : undefined}
            tabIndex={playable ? 0 : undefined}
            aria-label={playable ? `Play ${clip.title || `Clip #${clip.rank}`}` : undefined}
            onClick={playable ? () => onPlay({
                title: clip.title || `Clip #${clip.rank}`,
                sub: projectName,
                src: `/renders/${render.id}/stream`,
                tall: true,
            }) : undefined}
            onKeyDown={playable ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPlay({
                        title: clip.title || `Clip #${clip.rank}`,
                        sub: projectName,
                        src: `/renders/${render.id}/stream`,
                        tall: true,
                    });
                }
            } : undefined}
            className={cn(
                'flex min-h-0 flex-col justify-between overflow-hidden rounded-md border bg-card p-2',
                fresh && 'tile-in',
                tall && 'row-span-2',
                playable && 'cursor-pointer transition-colors hover:border-muted-foreground/40',
            )}
        >
            <span className="flex items-center gap-1.5 text-xs font-medium">
                <Film className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{clip.title || `Clip #${clip.rank}`}</span>
            </span>
            <span className="relative my-1 min-h-0 flex-1 overflow-hidden rounded bg-muted/50">
                <Film className="absolute inset-0 m-auto size-4 text-muted-foreground/50" aria-hidden />
                {playable && <FadeImg src={`/renders/${render.id}/poster`} />}
            </span>
            <span className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span className="truncate">#{clip.rank}{fmtRange(clip.start_s, clip.end_s) ? ` · ${fmtRange(clip.start_s, clip.end_s)}` : ''}</span>
                <span className={cn(
                    'inline-flex shrink-0 motion-safe:transition-opacity motion-safe:duration-150',
                    pillPhase === 'out' ? 'opacity-0' : 'opacity-100',
                )}>
                {pillShown === 'done' ? (
                    <Tip label={`Download clip #${clip.rank}`} side="top">
                        <a
                            href={`/renders/${render.id}/download`}
                            aria-label={`Download clip #${clip.rank}`}
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 rounded-md p-1 text-foreground hover:bg-accent"
                        >
                            <Download className="size-3.5" aria-hidden />
                        </a>
                    </Tip>
                ) : pillShown === 'failed' ? (
                    <span className="shrink-0 text-red-500">failed</span>
                ) : (
                    <Tip label="Clip is being made" side="top">
                        <span className="flex shrink-0 items-center gap-1 justify-end">
                            making
                            <Loader2 className="size-3 animate-spin" aria-hidden />
                        </span>
                    </Tip>
                )}
                </span>
            </span>
        </div>
    );
}

/** Project scroller: clamped-centering strip. The selected project sits
 *  in the middle row, except the first/last which pin to the top/bottom
 *  edge so no dead gap appears at either end. Project names float over
 *  the grid as clickthrough labels. Scroll the panel (or tap a pill) to
 *  rotate. */
function ProjectScroller({ projects, activeId, onJump, snap, visible, seenIds }) {
    const n = projects.length;
    const idx = Math.max(0, projects.findIndex((p) => p.id === activeId));
    // Signal per project: white = opened, green = fresh/unviewed,
    // orange = still working, red = error. Seen-ness is local UI state
    // (a Set of ids mirrored from localStorage), not server status.
    function pillClsFor(p, current, d) {
        const fresh = p.status === 'clips_ready' && !seenIds?.has(p.id);
        const tone = p.status === 'failed' ? 'red'
            : p.status !== 'clips_ready' ? 'orange'
            : fresh ? 'green' : 'white';
        const base = {
            red: 'bg-red-500',
            orange: 'bg-orange-500',
            green: 'bg-emerald-500',
            white: 'bg-white ring-1 ring-black/30',
        }[tone];
        if (current) return `h-5 w-2 ${base}`;
        const dim = {
            red: ['bg-red-500/70', 'bg-red-500/45', 'bg-red-500/25'],
            orange: ['bg-orange-500/70', 'bg-orange-500/45', 'bg-orange-500/25'],
            green: ['bg-emerald-500/80', 'bg-emerald-500/50', 'bg-emerald-500/30'],
            white: ['bg-white/80', 'bg-white/50', 'bg-white/30'],
        }[tone][Math.min(d - 1, 2)];
        const size = d === 1 ? 'size-2' : d === 2 ? 'size-1.5' : 'size-1';
        return `${size} ${dim}`;
    }

    function nameClsFor(p, current) {
        const fresh = p.status === 'clips_ready' && !seenIds?.has(p.id);
        if (current) {
            if (p.status === 'failed') return 'font-semibold text-red-500';
            if (p.status !== 'clips_ready') return 'font-semibold text-orange-500';
            return fresh ? 'font-semibold text-emerald-500' : 'font-semibold text-white';
        }
        if (p.status === 'failed') return 'text-red-500';
        if (p.status !== 'clips_ready') return 'text-orange-500';
        return fresh ? 'text-emerald-500' : 'text-white';
    }

    if (n === 0) return null;
    const rowH = 24;
    const rows = 3;
    // Clamped centering: the active project sits in the middle row,
    // except at the ends where it pins to the edge so no dead gap
    // appears — idx 0 shows rows 0-2 with active on top, idx n-1
    // shows n-3..n-1 with active on bottom. Short lists hug content.
    const viewH = Math.min(n, rows) * rowH;
    const first = n <= rows ? 0 : Math.min(Math.max(idx - 1, 0), n - rows);
    const y = -first * rowH;
    const slide = {
        transform: `translateY(${y}px)`,
        transition: snap ? 'none' : 'transform 350ms cubic-bezier(0.22, 1, 0.36, 1)',
    };
    const mask = '[mask-image:linear-gradient(to_bottom,transparent,black_22%,black_78%,transparent)]';
    return (
        <div
            className="relative flex shrink-0 items-center self-stretch"
            role="navigation"
            aria-label="Projects"
        >
            {/* Names float over the grid as clickthrough labels; only the
                pills take up space. */}
            <div className={cn(
                'pointer-events-none absolute top-1/2 right-full z-10 mr-2 -translate-y-1/2 py-[6px] transition-opacity motion-safe:duration-300',
                visible ? 'opacity-100' : 'opacity-0',
            )}
            >
            <div className="overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)]" style={{ height: viewH }}>
                <div className="flex flex-col" style={slide}>
                    {projects.map((p, i) => {
                        const d = Math.abs(i - idx);
                        const current = p.id === activeId;
                        const nameOpacity = d === 0 ? 1 : d === 1 ? 0.6 : d === 2 ? 0.35 : 0;
                        return (
                            <div
                                key={p.id}
                                className="flex shrink-0 origin-right items-center justify-end transition-transform motion-safe:duration-300"
                                style={{ height: rowH, transform: `scale(${d === 0 ? 1 : d === 1 ? 0.88 : 0.76})` }}
                            >
                                <span
                                    style={{ opacity: nameOpacity }}
                                    className={cn(
                                        'block max-w-36 truncate text-right text-sm transition-all motion-safe:duration-300',
                                        nameClsFor(p, current),
                                    )}
                                >
                                    {p.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
            </div>
            {/* One container, all pills inside. Gutters match the panel:
                8px grid gap + 6px box side = 14px each side, same as the
                6px box side + 8px panel edge on the right. */}
            <div className="m-auto rounded-full border border-border bg-card/95 px-1.5 py-1 shadow-lg backdrop-blur">
                <div className={`overflow-hidden ${mask}`} style={{ height: viewH }}>
                    <div className="flex h-full flex-col" style={slide}>
                        {projects.map((p, i) => {
                            const d = Math.abs(i - idx);
                            const current = p.id === activeId;
                            return (
                                <PillExitBeat key={p.id} id={p.id} ids={projects.map((q) => q.id)} top={i === 0} bottom={i === projects.length - 1}>
                                <div
                                    className="flex shrink-0 items-center justify-center"
                                    style={{ height: rowH }}
                                >
                                        <button
                                            type="button"
                                            aria-label={`Jump to ${p.name}`}
                                            aria-current={current || undefined}
                                            onClick={() => onJump(p.id)}
                                            className="flex h-full w-full cursor-pointer items-center justify-center"
                                        >
                                            <span className={cn(
                                                'block rounded-full transition-all motion-safe:duration-300',
                                                pillClsFor(p, current, d),
                                            )}
                                            />
                                        </button>
                                </div>
                                </PillExitBeat>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Scroller pill with a graceful delete: when the pill's id leaves
 *  `ids`, it slides toward its edge (top pills up, bottom pills down,
 *  middle pills fade) then unmounts while survivors ease into place. */
function PillExitBeat({ id, ids, top, bottom, children }) {
    const [gone, setGone] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const timer = useRef(null);

    useEffect(() => {
        if (ids.includes(id)) return;
        setLeaving(true);
        timer.current = setTimeout(() => setGone(true), 240);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [ids, id]);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    if (gone) return null;
    if (!leaving) return children;
    return (
        <div className={cn(
            top && 'row-out-top',
            bottom && !top && 'row-out-bottom',
            !top && !bottom && 'row-out-fade',
        )}>
            {children}
        </div>
    );
}

export default function Home({ projects, limits }) {
    const inputRef = useRef(null);
    const wheelLock = useRef(0);
    const wheelAcc = useRef(0);
    const touchY = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [confirmTarget, setConfirmTarget] = useState(null);
    const [player, setPlayer] = useState(null);
    const [uploading, setUploading] = useState(null);
    const [activeId, setActiveId] = useState(projects[0]?.id ?? null);
    const [dir, setDir] = useState(null);
    // snap: far jumps (wrap-around, distant tap) cut instead of sweeping.
    const [snap, setSnap] = useState(false);
    // Fresh-vs-opened projects (scroller green -> white): local UI state,
    // persisted per browser. A project counts as opened only once its
    // clips have actually been on screen (shownId), not when merely
    // scrolled past (activeId).
    const [seenIds, setSeenIds] = useState(() => {
        try {
            const raw = localStorage.getItem('digiclip.seenProjects');
            const arr = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(arr) ? arr : []);
        } catch {
            return new Set();
        }
    });
    // shownId trails activeId: the outgoing videos fade out first, then the
    // incoming project fades in, never a crossfade overlap.
    const [shownId, setShownId] = useState(projects[0]?.id ?? null);
    const [leaving, setLeaving] = useState(false);
    // Project names fade; pills always stay. Names surface on movement or
    // when the mouse gets close to the scroller, then fade back out.
    const [namesVisible, setNamesVisible] = useState(false);
    const hideNamesTimer = useRef(null);
    // Proximity: names stay while the mouse is near, gone the moment it leaves.
    function showNamesSticky() {
        if (hideNamesTimer.current) clearTimeout(hideNamesTimer.current);
        setNamesVisible(true);
    }
    function hideNamesNow() {
        if (hideNamesTimer.current) clearTimeout(hideNamesTimer.current);
        setNamesVisible(false);
    }
    // Movement: names linger, then fade after a beat.
    useEffect(() => {
        setNamesVisible(true);
        if (hideNamesTimer.current) clearTimeout(hideNamesTimer.current);
        hideNamesTimer.current = setTimeout(() => setNamesVisible(false), 1600);
        return () => { if (hideNamesTimer.current) clearTimeout(hideNamesTimer.current); };
    }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
    const activeLive = projects.some((p) => ACTIVE.includes(p.status) || p.status === 'paused')
        // Also poll while any clip render is still in progress (project may
        // already be clips_ready but renders run asynchronously on the render queue).
        || projects.some((p) => (p.clip_candidates ?? []).some((c) => (c.renders ?? []).some((r) => r.status !== 'done' && r.status !== 'failed')));
    const ids = projects.map((p) => p.id);
    const shownIdx = Math.max(0, ids.indexOf(shownId));
    const shown = projects[shownIdx] ?? null;

    // Dynamic grid layout: the outer height stays fixed, the arrangement
    // follows the clip count (vertical tiles for few, strip + grid for many).
    const showClips = shown?.clip_candidates ?? [];
    const clipCount = showClips.length;
    // Overflow pager: 6+ clips flip through pages of 3 inside the same cells.
    const [clipPage, setClipPage] = useState(0);
    const PAGE = 3;
    const pageTotal = Math.max(1, Math.ceil(clipCount / PAGE));
    const page = Math.min(clipPage, pageTotal - 1);
    const visClips = clipCount > 5 ? showClips.slice(page * PAGE, page * PAGE + PAGE) : showClips.slice(0, 5);
    const remaining = clipCount - (page * PAGE + PAGE);
    const gridCls =
        clipCount === 0 ? 'grid-cols-1 grid-rows-1'
        : clipCount === 1 ? 'grid-cols-2 grid-rows-1'
        : clipCount === 3 ? 'grid-cols-2 grid-rows-2'
        : 'grid-cols-2 grid-rows-3';
    const sourceCls = clipCount === 0 || clipCount === 1 || clipCount === 3 ? '' : 'col-span-2';
    const tallClip = clipCount === 2;

    // Flip to another project with a directional slide. Wraps around.
    function goTo(id, forcedDir) {
        if (id === activeId || !ids.includes(id)) return;
        const from = ids.indexOf(activeId);
        const to = ids.indexOf(id);
        setDir(forcedDir ?? (to > from ? 'down' : 'up'));
        setSnap(Math.abs(to - from) > 1);
        setActiveId(id);
    }
    function step(d) {
        if (ids.length < 2) return;
        const cur = Math.max(0, ids.indexOf(activeId));
        const next = (cur + d + ids.length) % ids.length;
        setDir(d > 0 ? 'down' : 'up');
        setSnap((d > 0 && cur === ids.length - 1) || (d < 0 && cur === 0));
        setActiveId(ids[next]);
    }
    // One-shot: the snap render cuts, then animation restores itself.
    useEffect(() => {
        if (snap) setSnap(false);
    }, [activeId, snap]);
    // New project in view: clips start on page one, and the project
    // counts as opened (scroller green -> white) once its clips land.
    useEffect(() => {
        setClipPage(0);
    }, [shownId]);
    useEffect(() => {
        if (shownId == null) return;
        setSeenIds((prev) => {
            if (prev.has(shownId)) return prev;
            const next = new Set(prev);
            next.add(shownId);
            try {
                localStorage.setItem('digiclip.seenProjects', JSON.stringify([...next].slice(-200)));
            } catch {
            }
            return next;
        });
    }, [shownId]);

    // The scroller is the control: wheel (or swipe) anywhere on the right
    // panel rotates projects, one notch one flip with a short 300ms gate
    // so trackpads don't machine-gun through the list. Fast successive
    // flips collapse onto the latest target.
    function onWheel(e) {
        const now = Date.now();
        if (now < wheelLock.current) return;
        if (Math.sign(e.deltaY) !== Math.sign(wheelAcc.current)) wheelAcc.current = 0;
        wheelAcc.current += e.deltaY;
        if (Math.abs(wheelAcc.current) < 40) return;
        const d = wheelAcc.current > 0 ? 1 : -1;
        wheelAcc.current = 0;
        wheelLock.current = now + 300;
        step(d);
    }

    function send(file) {
        if (!file) return;
        setUploading({ name: file.name, pct: 0 });
        router.post('/projects', { video: file }, {
            forceFormData: true,
            preserveScroll: true,
            onProgress: (e) => e.total && setUploading({ name: file.name, pct: Math.round((e.loaded / e.total) * 100) }),
            onFinish: () => setUploading(null),
            onError: () => setUploading(null),
        });
    }

    // Live queue: Reverb pushes status + render events per project; poll as backup.
    useEffect(() => {
        const ids = projects.map((p) => p.id);
        const echo = getEcho();
        if (echo) {
            ids.forEach((id) => {
                echo.channel(`project.${id}`)
                    .listen('.project.status', () => {
                        router.reload({ only: ['projects'] });
                    })
                    .listen('.render.progress', () => {
                        router.reload({ only: ['projects'] });
                    });
            });
        }
        const onVisible = () => {
            if (document.visibilityState === 'visible') router.reload({ only: ['projects'] });
        };
        document.addEventListener('visibilitychange', onVisible);
        const poll = activeLive ? setInterval(() => router.reload({ only: ['projects'] }), 10000) : null;
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            if (poll) clearInterval(poll);
            if (echo) ids.forEach((id) => echo.leave(`project.${id}`));
        };
    }, [projects.map((p) => p.id).join(','), activeLive]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep the viewer on a live project when the list reloads underneath it.
    useEffect(() => {
        if (projects.length === 0) return;
        if (!ids.includes(activeId)) {
            setDir(null);
            setActiveId(ids[0]);
        }
    }, [projects.map((p) => p.id).join(','), activeId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sequential swap: fade the current videos out, then show the incoming
    // project (which fades in from the travel direction). Fast successive
    // flips collapse onto the latest target, no stale flash.
    useEffect(() => {
        if (activeId === shownId) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (dir == null || reduce) {
            setShownId(activeId);
            return;
        }
        setLeaving(true);
        const t = setTimeout(() => {
            setShownId(activeId);
            setLeaving(false);
        }, 180);
        return () => clearTimeout(t);
    }, [activeId, shownId, dir]);

    return (
        <div className="grid h-[calc(100dvh-101px)] min-h-[480px] grid-cols-2 gap-4">
            {/* LEFT HALF: upload (30%) over queue */}
            <div className="flex min-h-0 min-w-0 flex-col gap-4">
                <Card className="stagger-1 flex h-[30%] min-h-[148px] shrink-0 flex-col overflow-hidden">
                    <CardContent className="flex min-h-0 flex-1 flex-col p-4">
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={(e) => { e.preventDefault(); setDragging(false); send(e.dataTransfer.files?.[0]); }}
                            className={cn(
                                'flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 text-center transition-colors',
                                dragging ? 'border-primary bg-accent' : 'border-input hover:bg-accent/50',
                            )}
                        >
                            <UploadCloud className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="text-sm font-medium">Drop a video here, or click to browse</span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                                {limits.accept} · up to {limits.max_mb} MB
                            </span>
                        </button>
                        <input
                            ref={inputRef} type="file" accept={limits.accept} className="hidden"
                            onChange={(e) => { send(e.target.files?.[0]); e.target.value = ''; }}
                        />
                        {uploading && (
                            <p className="pt-2 font-mono text-xs text-muted-foreground">
                                {uploading.name}, {uploading.pct}%
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card className="stagger-2 flex min-h-0 flex-1 flex-col overflow-hidden">
                    <CardHeader className="shrink-0 px-4 py-3">
                        <CardTitle className="text-sm">Queue</CardTitle>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1 overflow-y-auto px-4 pt-0 pb-3">
                        {projects.length === 0 ? (
                            <div className="flex min-h-full items-center justify-center">
                                <p className="text-center text-sm text-muted-foreground">
                                Queue is clear. Drop your first video above.
                            </p>
                            </div>
                        ) : (
                            <div className="space-y-2" data-queue-list>
                                {projects.map((p) => (
                                    <QueueExitBeat
                                        key={p.id}
                                        id={p.id}
                                        ids={projects.map((q) => q.id)}
                                        project={p}
                                        onCancel={setConfirmTarget}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* RIGHT HALF: one project's videos at a time, scroll flips projects */}
            <Card className="stagger-3 flex min-h-0 min-w-0 flex-col overflow-hidden">
                <CardHeader className="shrink-0 px-4 py-3">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                        <span className="font-semibold">Projects</span>
                        {shown != null && (
                            <>
                                <Badge variant="secondary" className="gap-1.5">
                                    {LIVE_LABEL[shown.status] ?? shown.status}
                                    <span className={cn('size-1.5 rounded-full', statusDot(shown.status))} aria-hidden />
                                    <span className="font-mono text-[11px]">
                                        {shownIdx + 1}/{projects.length}
                                    </span>
                                </Badge>
                                <span className="truncate text-right font-medium">
                                    {shown.name}
                                </span>
                            </>
                        )}
                    </div>
                </CardHeader>
                <CardContent
                    className="relative min-h-0 flex-1 overflow-hidden p-0"
                    onWheel={onWheel}
                    onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const dist = rect.right - e.clientX;
                        // Hysteresis: appear when properly close, only vanish
                        // once clearly away, no flicker at the boundary.
                        if (dist < 120) showNamesSticky();
                        else if (dist > 230) hideNamesNow();
                    }}
                    onMouseLeave={() => hideNamesNow()}
                    onTouchStart={(e) => { touchY.current = e.touches[0].clientY; }}
                    onTouchEnd={(e) => {
                        if (touchY.current == null) return;
                        const dy = touchY.current - e.changedTouches[0].clientY;
                        touchY.current = null;
                        if (Math.abs(dy) < 40) return;
                        step(dy > 0 ? 1 : -1);
                    }}
                >
                    {shown == null ? (
                        <div className="flex h-full items-center justify-center px-4">
                            <p className="text-center text-sm text-muted-foreground">
                            Nothing here yet. Uploads appear here grouped by project.
                        </p>
                        </div>
                    ) : (
                        <div className="flex h-full min-h-0 gap-2 pt-1 pr-2 pb-4 pl-4">
                            {/* Dynamic grid: fixed outer height, but the
                                arrangement follows the clip count, vertical
                                tiles for a few videos, source strip + grid
                                once there are more. Tiles animate in place:
                                new clips rise in, the source strip eases to
                                its new cell, nothing remounts on poll. Only
                                the grid animates; the pill strip stays put. */}
                            <div
                                key={shown.id}
                                className={cn(
                                    'grid min-h-0 min-w-0 flex-1 gap-2',
                                    gridCls,
                                    leaving && dir === 'down' && 'proj-leave-down',
                                    leaving && dir === 'up' && 'proj-leave-up',
                                    !leaving && dir === 'down' && 'proj-enter-down',
                                    !leaving && dir === 'up' && 'proj-enter-up',
                                )}
                            >
                                <Tip label={`Play ${shown.name}`} side="top" className={cn('flex min-h-0', sourceCls)}>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Play ${shown.name}`}
                                    onClick={() => setPlayer({
                                        title: shown.name,
                                        sub: 'Source' + (fmtDur(shown.duration_s) ? ` · ${fmtDur(shown.duration_s)}` : ''),
                                        src: `/projects/${shown.id}/stream`,
                                        poster: `/projects/${shown.id}/poster`,
                                        tall: false,
                                    })}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setPlayer({
                                                title: shown.name,
                                                sub: 'Source' + (fmtDur(shown.duration_s) ? ` · ${fmtDur(shown.duration_s)}` : ''),
                                                src: `/projects/${shown.id}/stream`,
                                                poster: `/projects/${shown.id}/poster`,
                                                tall: false,
                                            });
                                        }
                                    }}
                                    className={cn('relative min-h-0 w-full flex-1 cursor-pointer overflow-hidden rounded-md bg-muted transition-all motion-safe:duration-200 hover:ring-1 hover:ring-muted-foreground/40')}
                                >
                                    <FileVideo className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
                                    <FadeImg src={`/projects/${shown.id}/poster`} eager />
                                    <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                                        SOURCE{fmtDur(shown.duration_s) ? ` · ${fmtDur(shown.duration_s)}` : ''}
                                    </span>
                                    {clipCount === 0 && shown.status !== 'failed' && (
                                        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                                            Clips land here
                                        </span>
                                    )}
                                </div>
                                </Tip>
                                {visClips.map((c) => (
                                    <ClipTile key={c.id} clip={c} tall={tallClip} projectName={shown.name} onPlay={setPlayer} fresh />
                                ))}
                                {clipCount > 5 && (
                                    <button
                                        type="button"
                                        onClick={() => setClipPage(remaining > 0 ? clipPage + 1 : clipPage - 1)}
                                        className="flex min-h-0 items-center justify-center rounded-md border bg-card text-sm text-muted-foreground hover:bg-accent/50"
                                    >
                                        {remaining > 0 ? `+${remaining} more` : '‹ back'}
                                    </button>
                                )}
                            </div>
                            <ProjectScroller projects={projects} activeId={activeId} onJump={(id) => goTo(id)} snap={snap} visible={namesVisible} seenIds={seenIds} />
                        </div>
                    )}
                </CardContent>
            </Card>
            <ExitBeat open={confirmTarget != null} ms={150}>
                {confirmTarget && (
                    <CancelDialog project={confirmTarget} onClose={() => setConfirmTarget(null)} />
                )}
            </ExitBeat>
            <ExitBeat open={player != null} ms={150}>
                {player && (
                    <PlayerDialog {...player} onClose={() => setPlayer(null)} />
                )}
            </ExitBeat>
        </div>
    );
}
