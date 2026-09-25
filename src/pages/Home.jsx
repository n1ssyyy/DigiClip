import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { UploadCloud, FileVideo, X, RotateCcw, Film, Download, Loader2, Merge, FileText, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import {
    artUrl, srcUrl, startJob, removeJob, retryJob,
    fetchKit, downloadArt, downloadText, flashMessage, useStore,
} from '../lib/socket';
import { isTauri, onDragHover, onFilesDropped, pickVideo } from '../lib/native';
import Tip from '../components/digiclip/Tooltip';
import { FadeImg } from '../components/digiclip/Skeleton';
import OptionsButton, { useJobOptions } from '../components/digiclip/JobOptions';

// Pipeline steps shown as dots joined by lines in the queue.
const STEPS = [
    { key: 'upload', label: 'Upload' },
    { key: 'audio', label: 'Audio' },
    { key: 'script', label: 'Script' },
    { key: 'clips', label: 'Clips' },
];

// Maps a job status to { done, active, failed, paused } step indexes.
function stepState(status) {
    switch (status) {
        case 'queued':
        case 'extracting':
            return { done: 1, active: 1 };
        case 'transcribing':
            return { done: 2, active: 2 };
        case 'analyzing':
            return { done: 3, active: 3 };
        case 'clips_ready':
        case 'done':
            return { done: 4, active: null };
        case 'cancelled':
            return { done: 1, active: null, paused: true };
        case 'failed':
            return { done: 1, active: null, failed: true };
        default:
            return { done: 0, active: 0 };
    }
}

const LIVE_LABEL = {
    queued: 'Queued', extracting: 'Extracting audio',
    transcribing: 'Transcribing', analyzing: 'Picking clips',
    clips_ready: 'Ready', done: 'Ready', cancelled: 'Cancelled', failed: 'Failed',
};

// Status signal, one language everywhere: green done, orange working,
// red broken. Colors crossfade (background-color + color transitions)
// so status changes melt instead of snapping.
function statusDot(status) {
    if (status === 'failed') return 'bg-red-500';
    if (status === 'clips_ready' || status === 'done') return 'bg-emerald-500';
    if (status === 'cancelled') return 'bg-orange-500';
    return 'animate-pulse bg-orange-500';
}

// Scroller names read the same signal as the pill: white done,
// orange working, red broken.
function statusText(status) {
    if (status === 'failed') return 'text-red-500';
    if (status === 'clips_ready' || status === 'done') return 'text-white';
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
    const tone = TONES[st.failed ? 'red' : status === 'clips_ready' || status === 'done' ? 'green' : 'orange'];
    const current = st.active != null ? STEPS[st.active]?.label : (LIVE_LABEL[status] ?? 'Done');
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
 *  Overlay fades (fade/fade-out), box pops (pop/pop-out) — the outs use
 *  dedicated keyframes so Chromium restarts the animation on close.
 *  Pinned below the window header (top-[var(--chrome)]) with a
 *  sidebar-width left offset: the header stays sharp/clickable, the box
 *  centers in the content page, not the viewport. Held mounted by the
 *  parent's ExitBeat (ms=200). */
function CancelDialog({ project, onClose, leaving }) {
    const keepRef = useRef(null);

    useEffect(() => {
        keepRef.current?.focus();
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    function confirm() {
        if (project?.id) removeJob(project.id);
        onClose();
    }

    return (
        <div
            className={cn('fixed inset-x-0 bottom-0 top-[var(--chrome)] z-50 flex items-center justify-center bg-black/60 pl-[var(--chrome)] backdrop-blur-sm', leaving ? 'fade-out' : 'fade')}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="cancel-title"
                aria-describedby="cancel-desc"
                className={cn('w-[min(400px,calc(100vw-3rem))] rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-5 shadow-2xl', leaving ? 'pop-out' : 'pop')}
            >
                <h2 id="cancel-title" className="text-[13px] font-semibold">Cancel and remove?</h2>
                <p id="cancel-desc" className="mt-1.5 text-[13px] text-muted-foreground">
                    <span className="font-medium text-foreground">{project.name}</span>
                    {' '}stops processing and its clips are deleted. Your source file stays put. This can't be undone.
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

/** Bulk-remove confirmation: same overlay language as the cancel dialog
 *  (overlay fade/fade-out, box pop/pop-out; pinned below the header,
 *  centered in the content page; ExitBeat-held exit). Only finished jobs
 *  (done, failed, cancelled) leave; running work is never touched. */
function ClearDialog({ count, onClose, onConfirm, leaving }) {
    const keepRef = useRef(null);

    useEffect(() => {
        keepRef.current?.focus();
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className={cn('fixed inset-x-0 bottom-0 top-[var(--chrome)] z-50 flex items-center justify-center bg-black/60 pl-[var(--chrome)] backdrop-blur-sm', leaving ? 'fade-out' : 'fade')}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="clear-title"
                aria-describedby="clear-desc"
                className={cn('w-[min(400px,calc(100vw-3rem))] rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-5 shadow-2xl', leaving ? 'pop-out' : 'pop')}
            >
                <h2 id="clear-title" className="text-[13px] font-semibold">Remove finished?</h2>
                <p id="clear-desc" className="mt-1.5 text-[13px] text-muted-foreground">
                    {count} finished job{count === 1 ? '' : 's'} leave{count === 1 ? 's' : ''} the queue.
                    {' '}Running work stays put, and source files are never touched. This can't be undone.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                    <Button ref={keepRef} variant="outline" size="sm" onClick={onClose}>
                        Keep
                    </Button>
                    <Button variant="destructive" size="sm" onClick={onConfirm}>
                        Remove
                    </Button>
                </div>
            </div>
        </div>
    );
}

/** One queue row: top half (name left, status center, buttons right),
 *  bottom half (thicker live stepper). Enters by dropping in from above
 *  (.queue-in); exits via `leaving` (slide toward the nearest edge when
 *  the row sits at the top/bottom of the list, plain fade for middle
 *  rows), held mounted by the parent's ExitBeat. */
function QueueRow({ project, onCancel, leaving, edge }) {
    const failed = project.status === 'failed';
    const cancelled = project.status === 'cancelled';
    const retryable = failed || cancelled;
    const label = LIVE_LABEL[project.status] ?? project.status;
    const merged = project.options?.merge != null;

    return (
        <div className={cn(
            'flex items-center gap-2 overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-card p-1.5',
            !leaving && 'queue-in',
            leaving && edge === 'top' && 'row-out-top',
            leaving && edge === 'bottom' && 'row-out-bottom',
            leaving && !edge && 'row-out-fade',
        )}>
            <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                <FileVideo className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
                <FadeImg src={artUrl(project.id, 'poster.jpg')} />
                <span className={cn('absolute top-1.5 left-1.5 size-2 rounded-full ring-2 ring-black/50', statusDot(project.status))} aria-hidden />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-1 self-stretch overflow-hidden py-0.5">
                <div className="flex items-center gap-2">
                    <Tip label={project.name} side="top" className="min-w-0">
                        <p className="min-w-0 shrink truncate text-[13px] font-medium">
                            {project.name}
                            {merged && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">merged</span>}
                        </p>
                    </Tip>
                    <span className="flex flex-1 items-center justify-center">
                        <Tip label={failed ? project.error : null} side="top" wrap>
                        <Badge variant="secondary" className={cn(
                            'whitespace-nowrap motion-safe:transition-all motion-safe:duration-500',
                            failed ? 'text-red-500' : project.status === 'clips_ready' || project.status === 'done' ? 'text-emerald-500' : 'text-orange-500',
                        )}
                        >
                            <SwapLabel text={label} />
                        </Badge>
                        </Tip>
                    </span>
                    <span className="flex shrink-0 items-center justify-end gap-0.5">
                        {retryable && (
                            <Tip label="Retry" side="top">
                                <button
                                    type="button" aria-label={`Retry ${project.name}`}
                                    onClick={() => retryJob(project.id)}
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
                <div className="rounded-md border bg-muted/40 px-2 py-1">
                    <Stepper status={project.status} />
                </div>
            </div>
        </div>
    );
}

/** Delayed unmount: keeps children mounted for the exit beat after
 *  `open` flips false, passing `leaving` down so the dialog can play
 *  its exit (overlay fade-out + box pop-out). Renders immediately when
 *  `open` flips true so the enter animation starts on the same commit,
 *  no one-frame flash of nothing. `ms` must cover the exit animation
 *  (dialogs 180ms -> hold 200ms, rows 240ms). */
function ExitBeat({ open, ms = 200, children }) {
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

    // Render on the same commit `open` turns true (held may still be
    // false until the effect above runs) so the fade/pop enter starts
    // instantly; keep rendering while held during the exit beat.
    if (!held && !open) return null;
    const kids = open ? children : heldRef.current;
    if (!kids) return null;
    const only = Array.isArray(kids) ? kids[0] : kids;
    if (only && typeof only === 'object' && 'props' in only) {
        return { ...only, props: { ...only.props, leaving } };
    }
    return kids;
}

/** One queue row with a graceful delete: when the row's id disappears
 *  from `ids` (server confirmed the delete over the socket), the row plays its
 *  exit (slide toward the nearest edge for top/bottom rows, fade for
 *  middle rows) while the surviving rows ease into place, then unmounts.
 *  New rows drop in from above with .queue-in. */
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
/** In-app video player: same overlay language as the cancel dialog
 *  (overlay fade/fade-out, box pop/pop-out; pinned below the header,
 *  centered in the content page). The <video> element is mounted once and only its src/poster swap per selection: remounting
 *  mid-load restarted buffering from byte zero, which read as a
 *  flash/cutout. State also resets only when the src actually changes,
 *  so background store updates can't yank a playing video back to its
 *  skeleton. */
function PlayerDialog({ title, sub, src, poster, tall, download, kit, onClose, leaving }) {
    const videoRef = useRef(null);
    const [waiting, setWaiting] = useState(true);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [kitText, setKitText] = useState(null);
    const srcRef = useRef(src);

    // New selection: show the loader behind the incoming video, keep the
    // old frame visible underneath until the new one can play.
    if (srcRef.current !== src) {
        srcRef.current = src;
        setWaiting(true);
        setFailed(false);
        setKitText(null);
    }

    useEffect(() => {
        if (!kit) return;
        let dead = false;
        fetchKit(kit.job, kit.rank).then((text) => { if (!dead) setKitText(text); }).catch(() => {});
        return () => { dead = true; };
    }, [kit]);

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
            className={cn('fixed inset-x-0 bottom-0 top-[var(--chrome)] z-50 flex items-center justify-center bg-black/70 p-4 pl-[calc(var(--chrome)_+_1rem)] backdrop-blur-sm', leaving ? 'fade-out' : 'fade')}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={cn(
                    'rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-3 shadow-2xl',
                    // Generated clips are 9:16 vertical: narrow portrait box
                    // sized to land on true 9:16 (no pillar bars).
                    // Source playback stays a wide landscape box.
                    tall ? 'w-[min(340px,100%)]' : 'w-[min(760px,100%)]',
                    leaving ? 'pop-out' : 'pop',
                )}
            >
                <div className="flex items-center gap-2 pb-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{title}</p>
                    {sub && <p className="shrink-0 font-mono text-[10px] text-muted-foreground">{sub}</p>}
                    {kitText && kit && (
                        <Tip label="Upload kit (title + hashtags)" side="top">
                            <button
                                type="button" aria-label="Download upload kit"
                                onClick={() => downloadText(kitText, kit.filename ?? 'upload-kit.txt').catch((e) => flashMessage(`Couldn't save kit: ${e?.message ?? e}`))}
                                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <FileText className="size-4" aria-hidden />
                            </button>
                        </Tip>
                    )}
                    {download && (
                        <Tip label="Download video" side="top">
                            <button
                                type="button" aria-label="Download video"
                                onClick={() => downloadArt(download.url, download.filename).catch((e) => flashMessage(`Couldn't save video: ${e?.message ?? e}`))}
                                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <Download className="size-4" aria-hidden />
                            </button>
                        </Tip>
                    )}
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
                            <p className="text-[13px] font-medium text-white">Couldn't load this video</p>
                            <button
                                type="button"
                                onClick={() => { setFailed(false); setWaiting(true); videoRef.current?.load(); }}
                                className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-white/20"
                            >
                                Retry
                            </button>
                        </div>
                    )}
                    <div className={cn(
                        'overflow-hidden rounded bg-black',
                        // The frame owns the shape: portrait clips get a
                        // full-width 9:16 box so the video fills the dialog
                        // edge to edge; landscape keeps its wide box.
                        tall ? 'mx-auto aspect-[9/16] max-h-[72dvh] w-full' : 'aspect-video w-full',
                    )}>
                    <video
                        ref={videoRef}
                        className={cn(
                            'h-full w-full object-contain motion-safe:transition-opacity motion-safe:duration-300',
                            ready ? 'opacity-100' : 'opacity-0',
                        )}
                        controls
                        controlsList="nodownload"
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
        </div>
    );
}

/** Paged flip support: while `leaving`, the tile sinks downward after
 *  `exitDelay`ms. Entering is staged by the parent (`entered` flips per
 *  row on timers): offset below until entered, then it rises into place
 *  — plain transitions, no keyframes, so nothing can snap. Unpaged
 *  mounts keep the classic rise-in. */
function ClipTile({ job, clip, tall, projectName, onPlay, fresh, leaving = false, exitDelay = 0, entered = true, paged = false }) {
    const playable = clip.render_status === 'done' && clip.mp4;
    // making -> done crossfade: the render pill melts between states
    // instead of snapping, and the poster fades in over the tile.
    const [pillShown, setPillShown] = useState(playable ? 'done' : clip.render_status === 'failed' ? 'failed' : 'making');
    const [pillPhase, setPillPhase] = useState('in');
    const pillTimer = useRef(null);
    const pillTarget = playable ? 'done' : clip.render_status === 'failed' ? 'failed' : 'making';
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
    // Progress covers the whole making phase: face-tracking reports
    // first (render_pct is still 0), the encode takes over after.
    const progress = (clip.render_pct ?? 0) > 0 ? clip.render_pct : (clip.track_pct ?? 0);
    const rendering = clip.render_status === 'rendering' && progress > 0;
    const play = () => onPlay({
        title: clip.title || `Clip #${clip.rank}`,
        sub: projectName,
        src: artUrl(job.id, clip.mp4),
        tall: true,
        download: { url: artUrl(job.id, clip.mp4), filename: `digiclip-clip${clip.rank}-9x16.mp4` },
        kit: clip.kit ? { job: job.id, rank: clip.rank, filename: clip.kit } : null,
    });
    return (
        <div
            role={playable ? 'button' : undefined}
            tabIndex={playable ? 0 : undefined}
            aria-label={playable ? `Play ${clip.title || `Clip #${clip.rank}`}` : undefined}
            onClick={playable ? play : undefined}
            onKeyDown={playable ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    play();
                }
            } : undefined}
            className={cn(
                'flex min-h-0 flex-col justify-between overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-card p-1.5',
                !paged && fresh && 'tile-in',
                tall && 'row-span-2',
                playable && 'cursor-pointer transition-colors hover:border-muted-foreground/40',
                paged && !entered && 'opacity-0 translate-y-3',
                leaving && 'opacity-0 translate-y-3',
            )}
            style={paged
                ? { transition: 'opacity 220ms ease-out, translate 220ms ease-out, transform 220ms ease-out', ...(leaving ? { transitionDelay: `${exitDelay}ms` } : {}) }
                : undefined}
        >
            <span className="flex h-6 items-center gap-1.5 text-[11px] font-medium">
                <Film className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{clip.title || `Clip #${clip.rank}`}</span>
            </span>
            <span className="relative my-1 min-h-0 flex-1 overflow-hidden rounded bg-muted/50">
                <Film className="absolute inset-0 m-auto size-4 text-muted-foreground/50" aria-hidden />
                {playable && clip.poster && <FadeImg src={artUrl(job.id, clip.poster)} />}
                {rendering && (
                    <span
                        aria-hidden
                        className="absolute right-0 bottom-0 left-0 h-[2px] bg-white/80 motion-safe:transition-[width] motion-safe:duration-300"
                        style={{ width: `${progress}%` }}
                    />
                )}
            </span>
            <span className="flex h-6 items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span className="truncate">#{clip.rank}{fmtRange(clip.start_s, clip.end_s) ? ` · ${fmtRange(clip.start_s, clip.end_s)}` : ''}</span>
                <span className={cn(
                    'inline-flex shrink-0 motion-safe:transition-opacity motion-safe:duration-150',
                    pillPhase === 'out' ? 'opacity-0' : 'opacity-100',
                )}>
                {pillShown === 'done' ? (
                    <Tip label={`Download clip #${clip.rank}`} side="top">
                        <button
                            type="button"
                            aria-label={`Download clip #${clip.rank}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                downloadArt(artUrl(job.id, clip.mp4), `digiclip-clip${clip.rank}-9x16.mp4`).catch((e) => flashMessage(`Couldn't save video: ${e?.message ?? e}`));
                            }}
                            className="shrink-0 rounded-md p-1 text-foreground hover:bg-accent"
                        >
                            <Download className="size-3.5" aria-hidden />
                        </button>
                    </Tip>
                ) : pillShown === 'failed' ? (
                    <span className="shrink-0 text-red-500">failed</span>
                ) : (
                    <Tip label="Clip is being made" side="top">
                        <span className="flex shrink-0 items-center gap-1 justify-end">
                            making
                            {rendering ? ` ${progress}%` : ''}
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
        const ready = p.status === 'clips_ready' || p.status === 'done';
        const fresh = ready && !seenIds?.has(p.id);
        const tone = p.status === 'failed' ? 'red'
            : !ready ? 'orange'
            : fresh ? 'green' : 'white';
        const base = {
            red: 'bg-red-500',
            orange: 'bg-orange-500',
            green: 'bg-emerald-500',
            white: 'bg-white ring-1 ring-black/30',
        }[tone];
        // Selected bar fills its (grown) row at the original slim width;
        // the button pads it 3px.
        if (current) return `h-full w-2 ${base}`;
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
        const ready = p.status === 'clips_ready' || p.status === 'done';
        const fresh = ready && !seenIds?.has(p.id);
        if (current) {
            if (p.status === 'failed') return 'font-semibold text-red-500';
            if (!ready) return 'font-semibold text-orange-500';
            return fresh ? 'font-semibold text-emerald-500' : 'font-semibold text-white';
        }
        if (p.status === 'failed') return 'text-red-500';
        if (!ready) return 'text-orange-500';
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
    // Dynamic row sizing, ratios-style (flex-grow thinking, flex-basis
    // mechanics): neighbors sit at a compact 16px; the selected row
    // absorbs the whole strip minus its visible neighbors — 40px with
    // two neighbors, 32 with one, full height alone. Rows before `first`
    // are always plain neighbors, so the slide offset stays exact while
    // the heights ease behind it. (Pure flex-grow can't do this: it only
    // distributes free space in a fixed container, and ours must stay
    // content-sized for the travel animation.)
    const smallH = 16;
    const visCount = Math.min(n, rows);
    const selH = viewH - smallH * (visCount - 1);
    const first = n <= rows ? 0 : Math.min(Math.max(idx - 1, 0), n - rows);
    const y = -first * smallH;
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
                'pointer-events-none absolute top-1/2 right-full z-10 mr-1.5 -translate-y-1/2 py-[6px] transition-opacity motion-safe:duration-300',
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
                                className="flex shrink-0 origin-right items-center justify-end transition-[height,transform] motion-safe:duration-300"
                                style={{ height: current ? selH : smallH, transform: `scale(${d === 0 ? 1 : d === 1 ? 0.88 : 0.76})` }}
                            >
                                <span
                                    style={{ opacity: nameOpacity }}
                                    className={cn(
                                        'block max-w-36 truncate text-right text-[13px] transition-all motion-safe:duration-300',
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
            <div className="m-auto rounded-full border border-x-white/10 border-b-black/60 border-t-white/20 bg-card/95 p-0.5 shadow-lg backdrop-blur">
                <div className={`overflow-hidden ${mask}`} style={{ height: viewH }}>
                    <div className="flex h-full flex-col" style={slide}>
                        {projects.map((p, i) => {
                            const d = Math.abs(i - idx);
                            const current = p.id === activeId;
                            return (
                                <PillExitBeat key={p.id} id={p.id} ids={projects.map((q) => q.id)} top={i === 0} bottom={i === projects.length - 1}>
                                <div
                                    className="flex shrink-0 items-center justify-center motion-safe:transition-[height] motion-safe:duration-300"
                                    style={{ height: current ? selH : smallH }}
                                >
                                        <button
                                            type="button"
                                            aria-label={`Jump to ${p.name}`}
                                            aria-current={current || undefined}
                                            onClick={() => onJump(p.id)}
                                            className={cn(
                                                'flex h-full w-full cursor-pointer items-center justify-center',
                                                current && 'p-[2px]',
                                            )}
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

export default function Home() {
    const projects = useStore((s) => s.jobs);
    const settings = useStore((s) => s.settings);
    const [jobOptions, setJobOptions] = useJobOptions(settings);
    const limits = { accept: 'MP4 · MOV · MKV · WEBM', note: 'straight off your disk' };
    const wheelLock = useRef(0);
    const wheelAcc = useRef(0);
    const touchY = useRef(null);
    // Nesting counter so the hover paint doesn't flicker when the drag
    // crosses child elements (the options button) inside the card.
    const dragDepth = useRef(0);
    // Last time the OS-level Tauri drop (real paths) fired. Compared
    // against DOM drops to detect a dead shell event (see onDrop).
    const lastTauriDrop = useRef(0);
    const [dragging, setDragging] = useState(false);
    // hotPair lights a header + its body together on hover so the pair
    // reads as one unit without touching.
    const [hotPair, setHotPair] = useState(null);
    const [confirmTarget, setConfirmTarget] = useState(null);
    const [confirmClear, setConfirmClear] = useState(false);
    // Finished jobs only (done, failed, cancelled): running work is
    // never touched by the bulk clear.
    const finishedIds = projects.filter((p) => p.status === 'done' || p.status === 'failed' || p.status === 'cancelled').map((p) => p.id);
    function clearFinished() {
        finishedIds.forEach((id) => removeJob(id));
        setConfirmClear(false);
    }
    const [player, setPlayer] = useState(null);
    const [uploading, setUploading] = useState(null);
    const [activeId, setActiveId] = useState(null);
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
    const [shownId, setShownId] = useState(null);
    const [leaving, setLeaving] = useState(false);
    // Project names fade; pills always stay. Names surface on movement or
    // when the mouse gets close to the scroller, then fade back out.
    const [namesVisible, setNamesVisible] = useState(false);
    const hideNamesTimer = useRef(null);
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
    const ids = projects.map((p) => p.id);
    const shownIdx = Math.max(0, ids.indexOf(shownId));
    const shown = projects[shownIdx] ?? null;

    // Dynamic grid layout: the outer height stays fixed, the arrangement
    // follows the clip count (vertical tiles for few, strip + grid for many).
    const showClips = shown?.clips ?? [];
    const clipCount = showClips.length;
    // Pager: 5+ clips flip through pages of 4 (1 source strip + 4 clips)
    // inside the same cells; 4 or fewer show all with the count-based
    // layout below.
    const [clipPage, setClipPage] = useState(0);
    const PAGE = 4;
    const paged = clipCount > PAGE;
    const pageTotal = Math.max(1, Math.ceil(clipCount / PAGE));
    const page = Math.min(clipPage, pageTotal - 1);
    const visClips = paged ? showClips.slice(page * PAGE, page * PAGE + PAGE) : showClips.slice(0, PAGE);
    // Deepest grid row on this page (source owns row 0, clips pair up
    // below it): drives the staggered delays in both directions.
    const maxRow = visClips.length > 0 ? 1 + Math.floor((visClips.length - 1) / 2) : 0;
    // Paged flip choreography, identical in both directions: the source
    // always slides out upward while the clip rows sink downward,
    // bottom-row first; the new page then rises in from below with the
    // source first, then top row, then bottom. Reduced motion cuts
    // clean instead.
    const [pageLeaving, setPageLeaving] = useState(false);
    // Enter staircase: -1 = fully offset, then 0 (source), 1, 2 ease in
    // row by row. Starts "all entered" so boot and project switches
    // appear instantly; flips drive it -1 upward (see flipPage).
    const [enterStep, setEnterStep] = useState(2);
    const pageTimer = useRef(null);
    const enterTimer = useRef(null);
    useEffect(() => () => {
        if (pageTimer.current) clearTimeout(pageTimer.current);
        if (enterTimer.current) clearInterval(enterTimer.current);
    }, []);
    function flipPage(target) {
        const clamped = Math.max(0, Math.min(pageTotal - 1, target));
        if (clamped === page || pageLeaving) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
            setClipPage(clamped);
            return;
        }
        setPageLeaving(true);
        if (pageTimer.current) clearTimeout(pageTimer.current);
        if (enterTimer.current) clearInterval(enterTimer.current);
        // Deepest row on the TARGET page: the staircase stops there.
        const targetList = showClips.slice(clamped * PAGE, clamped * PAGE + PAGE);
        const targetMax = targetList.length > 0 ? 1 + Math.floor((targetList.length - 1) / 2) : 0;
        pageTimer.current = setTimeout(() => {
            // New page mounts fully offset; the staircase below eases it
            // in row by row — plain transitions, no keyframes or fill
            // modes, so there is nothing that can snap.
            setClipPage(clamped);
            setPageLeaving(false);
            setEnterStep(-1);
            enterTimer.current = setInterval(() => {
                setEnterStep((s) => {
                    if (s >= targetMax) {
                        clearInterval(enterTimer.current);
                        return s;
                    }
                    return s + 1;
                });
            }, 70);
        }, 360);
    }
    const gridCls = paged ? 'grid-cols-2 grid-rows-3'
        : clipCount === 0 ? 'grid-cols-1 grid-rows-1'
        : clipCount === 1 ? 'grid-cols-2 grid-rows-1'
        : clipCount === 3 ? 'grid-cols-2 grid-rows-2'
        : 'grid-cols-2 grid-rows-3';
    const sourceCls = paged || (clipCount !== 0 && clipCount !== 1 && clipCount !== 3) ? 'col-span-2' : '';
    const tallClip = !paged && clipCount === 2;

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
        if (enterTimer.current) clearInterval(enterTimer.current);
        setEnterStep(2);
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

    /** Shared knobs for a fresh job off this screen. Durations are
     *  sanitized here so stale/corrupt local storage can never send
     *  the engine an inverted window; auto sends nothing (15–90s). */
    function durRange() {
        if (jobOptions.dur_mode === 'exact') {
            const L = Math.min(300, Math.max(5, +jobOptions.dur_exact || 30));
            return { min_len: L, max_len: L };
        }
        if (jobOptions.dur_mode === 'minmax') {
            const lo = Math.min(300, Math.max(5, +jobOptions.dur_min || 15));
            const hi = Math.max(lo, Math.min(600, +jobOptions.dur_max || 60));
            return { min_len: lo, max_len: hi };
        }
        return {};
    }
    function baseOptions() {
        return {
            mode: 'clips',
            kind: jobOptions.kind,
            count: jobOptions.count,
            ...durRange(),
            style: jobOptions.style,
            tighten: jobOptions.tighten,
            punch: jobOptions.punch,
            merge_flash: jobOptions.merge_flash,
            kit: true,
            framing: 'smart',
            model: settings?.stt_model,
            gpu: settings?.gpu,
        };
    }

    /** Bare compilation of the shown project's picks (the anti-repeat
     *  path): a new job off the same source, badged "merged" in the queue. */
    function mergeShown() {
        if (!shown) return;
        startJob(shown.source, { ...baseOptions(), merge: '' }).catch(() => {});
    }
    /** Start a job from a local path (dialog pick or window drop). The
     *  file never uploads anywhere — the engine reads it off disk.
     *  Failures surface in the banner instead of dying silently. */
    function startFromPath(path) {
        if (!path) return;
        const name = path.split(/[\\/]/).pop() ?? path;
        setUploading({ name });
        // Banner receipt: proves the OS drop reached us. If this shows
        // but no job appears, the failure is downstream (and the catch
        // below will name it); if even this stays silent, the drop
        // event itself never arrived.
        flashMessage(`Starting ${name}…`);
        startJob(path, baseOptions())
            .catch((e) => flashMessage(`Couldn't start ${name}: ${e?.message ?? e}`))
            .finally(() => {
                setTimeout(() => setUploading(null), 800);
            });
    }

    function browse() {
        pickVideo()
            .then((path) => { if (path) startFromPath(path); })
            .catch((e) => flashMessage(`Browse failed: ${e?.message ?? e}`));
    }

    // Window drops carry real paths (Tauri drag-drop event); the upload
    // card's own drag handlers are hover paint only.
    useEffect(() => onFilesDropped((paths) => {
        lastTauriDrop.current = Date.now();
        const vid = (paths ?? []).find((p) => /\.(mp4|mov|mkv|webm|m4a)$/i.test(p));
        if (vid) startFromPath(vid);
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

    // Hover paint rides the OS drag channel (enter/over lights the card,
    // leave/drop clears it) — the same channel drops provably arrive on.
    // The card's own DOM handlers below stay as backup.
    useEffect(() => onDragHover(setDragging), []); // eslint-disable-line react-hooks/exhaustive-deps

    // A drop landing anywhere except the card must never navigate the
    // webview away to the file (which used to blank the whole app). The
    // OS-level Tauri drop event above still fires — this only stops the
    // browser default.
    useEffect(() => {
        const stop = (e) => e.preventDefault();
        window.addEventListener('dragover', stop);
        window.addEventListener('drop', stop);
        return () => {
            window.removeEventListener('dragover', stop);
            window.removeEventListener('drop', stop);
        };
    }, []);

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
        <div className="grid h-full min-h-[480px] grid-cols-2 gap-[5px]">
            {/* LEFT HALF: upload (30%) over queue */}
            <div className="flex min-h-0 min-w-0 flex-col gap-[5px]">
                <Card className="stagger-1 flex h-[30%] min-h-[148px] shrink-0 flex-col overflow-hidden">
                    <CardContent className="flex min-h-0 flex-1 flex-col p-2">
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label="Pick a video to clip"
                            onClick={browse}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    browse();
                                }
                            }}
                            onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDragging(true); }}
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }}
                            onDrop={(e) => {
                                e.preventDefault();
                                dragDepth.current = 0;
                                setDragging(false);
                                // Diagnostic: a DOM drop always fires in a
                                // webview. If the OS-level Tauri drop (real
                                // paths) doesn't follow within a beat, the
                                // shell event is dead — say so instead of
                                // failing silently.
                                const files = [...(e.dataTransfer?.files ?? [])];
                                if (isTauri() && files.length > 0) {
                                    const names = files.map((f) => f.name).join(', ');
                                    setTimeout(() => {
                                        if (Date.now() - lastTauriDrop.current > 1500) {
                                            flashMessage(`Got “${names}” but no file path arrived — the drop event isn't firing. Rebuild the desktop app to pick up the fix.`);
                                        }
                                    }, 1500);
                                }
                            }}
                            className={cn(
                                'relative flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded border-2 border-dashed px-2 text-center transition-colors',
                                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                dragging ? 'border-primary bg-accent shadow-[0_0_0_3px_rgb(255_255_255/0.12),0_0_24px_rgb(255_255_255/0.08)]' : 'border-input hover:bg-accent/50',
                            )}
                        >
                            <div
                                className="absolute top-1.5 right-1.5"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                            >
                                <OptionsButton options={jobOptions} onChange={setJobOptions} />
                            </div>
                            <UploadCloud className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="text-[13px] font-medium">Drop a video here, or click to browse</span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                                {limits.accept} · {limits.note}
                            </span>
                        </div>
                        {uploading && (
                            <p className="pt-1 font-mono text-[11px] text-muted-foreground">
                                {uploading.name} — starting…
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Queue header stays its own panel; the stub hanging into the
                    gap below points at the list so the two read as a pair
                    without touching. h-10 keeps all headers the same. */}
                <Card
                    className={cn('relative shrink-0 transition-colors', hotPair === 'queue' && 'border-t-white/25 border-x-white/[0.13]')}
                    onMouseEnter={() => setHotPair('queue')}
                    onMouseLeave={() => setHotPair(null)}
                >
                    <span aria-hidden className="absolute top-full left-6 h-[5px] w-px bg-border" />
                    <CardHeader className="h-10 justify-center py-0 pr-2 pl-4">
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-[13px]">Queue</CardTitle>
                            <Tip label="Remove finished jobs" side="top">
                                <button
                                    type="button" aria-label="Remove finished jobs"
                                    disabled={finishedIds.length === 0}
                                    onClick={() => setConfirmClear(true)}
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                                >
                                    <Trash2 className="size-4" aria-hidden />
                                </button>
                            </Tip>
                        </div>
                    </CardHeader>
                </Card>
                <Card
                    className={cn('stagger-2 flex min-h-0 flex-1 flex-col overflow-hidden transition-colors', hotPair === 'queue' && 'border-t-white/25 border-x-white/[0.13]')}
                    onMouseEnter={() => setHotPair('queue')}
                    onMouseLeave={() => setHotPair(null)}
                >
                    <CardContent className="min-h-0 flex-1 overflow-y-auto p-2">
                        {projects.length === 0 ? (
                            <div className="flex min-h-full items-center justify-center">
                                <p className="text-center text-[13px] text-muted-foreground">
                                Queue is clear. Drop your first video above.
                            </p>
                            </div>
                        ) : (
                            <div className="space-y-1" data-queue-list>
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

            {/* RIGHT HALF: Projects header stays its own panel; same stub
                as Queue so the header points at the viewer below. */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[5px]">
                <Card
                    className={cn('relative shrink-0 transition-colors', hotPair === 'projects' && 'border-t-white/25 border-x-white/[0.13]')}
                    onMouseEnter={() => setHotPair('projects')}
                    onMouseLeave={() => setHotPair(null)}
                >
                    <span aria-hidden className="absolute top-full left-6 h-[5px] w-px bg-border" />
                    <CardHeader className="h-10 justify-center py-0 pr-2 pl-4">
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[13px]">
                            <span className="font-semibold">Projects</span>
                            {shown != null && (
                                <>
                                    <Badge variant="secondary" className="gap-1.5">
                                        {LIVE_LABEL[shown.status] ?? shown.status}
                                        <span className={cn('size-1.5 rounded-full', statusDot(shown.status))} aria-hidden />
                                        <span className="font-mono text-[10px]">
                                            {shownIdx + 1}/{projects.length}
                                        </span>
                                    </Badge>
                                    <span className="flex min-w-0 items-center justify-end gap-1">
                                        {shown.options?.merge != null && (
                                            <Badge variant="secondary" className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                                merged
                                            </Badge>
                                        )}
                                        <span className="truncate font-medium">
                                            {shown.name}
                                        </span>
                                        <Tip label="Merge picks into one video" side="top">
                                            <button
                                                type="button" aria-label={`Merge ${shown.name} into one video`}
                                                onClick={mergeShown}
                                                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                            >
                                                <Merge className="size-4" aria-hidden />
                                            </button>
                                        </Tip>
                                    </span>
                                </>
                            )}
                        </div>
                    </CardHeader>
                </Card>
                <Card
                    className={cn('stagger-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-colors', hotPair === 'projects' && 'border-t-white/25 border-x-white/[0.13]')}
                    onMouseEnter={() => setHotPair('projects')}
                    onMouseLeave={() => setHotPair(null)}
                >
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
                            <p className="text-center text-[13px] text-muted-foreground">
                            Nothing here yet. Uploads appear here grouped by project.
                        </p>
                        </div>
                    ) : (
                        <div className="flex h-full min-h-0 gap-1.5 p-2">
                            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
                            {/* Dynamic grid: fixed outer height, but the
                                arrangement follows the clip count, vertical
                                tiles for a few videos, source strip + grid
                                once there are more. Tiles animate in place:
                                new clips rise in, the source strip eases to
                                its new cell, nothing remounts on poll. Only
                                the grid animates; the pill strip stays put.
                                Overflow flips pages of 3 through the pager
                                row below instead of a "+N more" tile. */}
                            <div
                                key={shown.id}
                                className={cn(
                                    'grid min-h-0 min-w-0 flex-1 gap-1.5',
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
                                        src: srcUrl(shown.id),
                                        poster: artUrl(shown.id, 'poster.jpg'),
                                        tall: false,
                                        download: { url: srcUrl(shown.id), filename: `${shown.name}.mp4` },
                                        kit: null,
                                    })}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setPlayer({
                                                title: shown.name,
                                                sub: 'Source' + (fmtDur(shown.duration_s) ? ` · ${fmtDur(shown.duration_s)}` : ''),
                                                src: srcUrl(shown.id),
                                                poster: artUrl(shown.id, 'poster.jpg'),
                                                tall: false,
                                                download: { url: srcUrl(shown.id), filename: `${shown.name}.mp4` },
                                                kit: null,
                                            });
                                        }
                                    }}
                                    className={cn(
                                        'relative min-h-0 w-full flex-1 cursor-pointer overflow-hidden rounded-md bg-muted transition-all motion-safe:duration-200 hover:ring-1 hover:ring-muted-foreground/40',
                                        // Page flip: the source always dips
                                        // out upward and rises back in
                                        // first, either direction.
                                        (pageLeaving || (paged && enterStep < 0)) && 'opacity-0',
                                        pageLeaving && '-translate-y-3',
                                        paged && !pageLeaving && enterStep < 0 && 'translate-y-3',
                                    )}
                                    {...(pageLeaving ? { style: { transitionDelay: `${maxRow * 60}ms` } } : {})}
                                >
                                    <FileVideo className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
                                    <FadeImg src={artUrl(shown.id, 'poster.jpg')} eager />
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
                                {visClips.map((c, i) => {
                                    // Grid rows below the source strip pair
                                    // up. Exit runs bottom-first; enter is
                                    // staged top-first by enterStep.
                                    const row = 1 + Math.floor(i / 2);
                                    return (
                                        <ClipTile
                                            key={c.rank} job={shown} clip={c} tall={tallClip} projectName={shown.name} onPlay={setPlayer} fresh
                                            leaving={pageLeaving} exitDelay={(maxRow - row) * 60}
                                            entered={enterStep >= row} paged={paged}
                                        />
                                    );
                                })}
                            </div>
                            {pageTotal > 1 && (
                                <div className="flex h-6 shrink-0 items-center justify-center gap-1" role="navigation" aria-label="Clip pages">
                                    <button
                                        type="button"
                                        aria-label="Previous clips"
                                        disabled={page === 0}
                                        onClick={() => flipPage(page - 1)}
                                        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                    >
                                        <ChevronLeft className="size-3.5" aria-hidden />
                                    </button>
                                    <span className="min-w-10 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
                                        {page + 1} / {pageTotal}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label="Next clips"
                                        disabled={page >= pageTotal - 1}
                                        onClick={() => flipPage(page + 1)}
                                        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                                    >
                                        <ChevronRight className="size-3.5" aria-hidden />
                                    </button>
                                </div>
                            )}
                            </div>
                            <ProjectScroller projects={projects} activeId={activeId} onJump={(id) => goTo(id)} snap={snap} visible={namesVisible} seenIds={seenIds} />
                        </div>
                    )}
                </CardContent>
                </Card>
            </div>
            <ExitBeat open={confirmTarget != null} ms={200}>
                {confirmTarget && (
                    <CancelDialog project={confirmTarget} onClose={() => setConfirmTarget(null)} />
                )}
            </ExitBeat>
            <ExitBeat open={confirmClear} ms={200}>
                {confirmClear && (
                    <ClearDialog count={finishedIds.length} onClose={() => setConfirmClear(false)} onConfirm={clearFinished} />
                )}
            </ExitBeat>
            <ExitBeat open={player != null} ms={200}>
                {player && (
                    <PlayerDialog {...player} onClose={() => setPlayer(null)} />
                )}
            </ExitBeat>
        </div>
    );
}
