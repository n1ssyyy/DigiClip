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
// red broken. (The scroller's active pill is the single exception: it
// reads white when ready so it pops against the dots.)
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
                                'size-2.5 shrink-0 rounded-full',
                                done && !failedDot && tone.dot,
                                active && cn('animate-pulse ring-4', tone.dot, tone.ring),
                                failedDot && cn(tone.dot, 'ring-4', tone.ring),
                                !done && !active && !failedDot && 'bg-border',
                                st.paused && !done && 'bg-orange-500/50',
                            )}
                        />
                        </Tip>
                        {i < STEPS.length - 1 && (
                            <span className={cn('mx-1 h-0.5 flex-1 rounded-full', i + 1 <= st.done ? tone.line : 'bg-border')} aria-hidden />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** Cancel confirmation: replaces window.confirm with an in-app dialog. */
function CancelDialog({ project, onClose }) {
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
            className="fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="cancel-title"
                aria-describedby="cancel-desc"
                className="pop w-[min(400px,calc(100vw-3rem))] rounded-lg border bg-card p-5 shadow-2xl"
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
 *  bottom half (thicker live stepper). */
function QueueRow({ project, onCancel }) {
    const pausable = ACTIVE.includes(project.status);
    const paused = project.status === 'paused';
    const failed = project.status === 'failed';
    const label = LIVE_LABEL[project.status] ?? project.status;

    return (
        <div className="rise flex items-center gap-3 rounded-lg border bg-card p-2.5">
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
                            'whitespace-nowrap',
                            failed ? 'text-red-500' : project.status === 'clips_ready' ? 'text-emerald-500' : 'text-orange-500',
                        )}
                        >
                            {label}
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

/** One generated clip: title, time range, and its render state, a download
 *  button the moment the video file exists. */
/** In-app video player: same overlay language as the cancel dialog. */
function PlayerDialog({ title, sub, src, poster, onClose }) {
    const [waiting, setWaiting] = useState(true);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="pop w-[min(760px,100%)] rounded-lg border bg-card p-4 shadow-2xl"
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
                    {waiting && (
                        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </span>
                    )}
                    <video
                        key={src}
                        className={cn(
                            'aspect-video w-full rounded-md bg-black motion-safe:transition-opacity motion-safe:duration-300',
                            ready ? 'opacity-100' : 'opacity-0',
                        )}
                        src={src}
                        poster={poster}
                        controls
                        playsInline
                        preload="auto"
                        onCanPlay={() => { setWaiting(false); setReady(true); }}
                        onPlaying={() => { setWaiting(false); setReady(true); }}
                        onWaiting={() => setWaiting(true)}
                    />
                </div>
            </div>
        </div>
    );
}

function ClipTile({ clip, tall, projectName, onPlay }) {
    const renders = clip.renders ?? [];
    const render = renders[renders.length - 1] ?? null;
    const playable = render?.status === 'done';
    return (
        <div
            role={playable ? 'button' : undefined}
            tabIndex={playable ? 0 : undefined}
            aria-label={playable ? `Play ${clip.title || `Clip #${clip.rank}`}` : undefined}
            onClick={playable ? () => onPlay({
                title: clip.title || `Clip #${clip.rank}`,
                sub: projectName,
                src: `/renders/${render.id}/stream`,
            }) : undefined}
            onKeyDown={playable ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPlay({
                        title: clip.title || `Clip #${clip.rank}`,
                        sub: projectName,
                        src: `/renders/${render.id}/stream`,
                    });
                }
            } : undefined}
            className={cn(
                'rise flex min-h-0 flex-col justify-between overflow-hidden rounded-md border bg-card p-2',
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
                {render?.status === 'done' ? (
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
                ) : render?.status === 'failed' ? (
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
        </div>
    );
}

/** Project scroller: the pill strip sits in flow at the panel edge so it
 *  never covers the grid; project names float over the grid as
 *  clickthrough labels. Current project centered and full-size; the rest
 *  shrink and fade with distance. Scroll the panel (or tap a pill) to
 *  rotate. */
function ProjectScroller({ projects, activeId, onJump, snap, visible }) {
    const n = projects.length;
    const idx = Math.max(0, projects.findIndex((p) => p.id === activeId));
    // Pill signal per project: white = done and selected, green = done,
    // orange = still working, red = error. Inactive pills keep their own
    // status color, dimmed with distance.
    function pillClsFor(status, current, d) {
        if (current) {
            if (status === 'failed') return 'h-5 w-2 bg-red-500';
            if (status === 'clips_ready') return 'h-5 w-2 bg-white ring-1 ring-black/30';
            return 'h-5 w-2 bg-orange-500';
        }
        const size = d === 1 ? 'size-2' : d === 2 ? 'size-1.5' : 'size-1';
        if (status === 'failed') return `${size} ${d === 1 ? 'bg-red-500/70' : d === 2 ? 'bg-red-500/45' : 'bg-red-500/25'}`;
        if (status === 'clips_ready') return `${size} ${d === 1 ? 'bg-emerald-500/80' : d === 2 ? 'bg-emerald-500/50' : 'bg-emerald-500/30'}`;
        return `${size} ${d === 1 ? 'bg-orange-500/70' : d === 2 ? 'bg-orange-500/45' : 'bg-orange-500/25'}`;
    }

    if (n === 0) return null;
    const rowH = 24;
    const rows = 3;
    // Hug the content: a short list gets a short viewport (no dead space),
    // a long list centers the active row in a 3-row window.
    const viewH = Math.min(n, rows) * rowH;
    const y = n <= rows ? 0 : (viewH - rowH) / 2 - idx * rowH;
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
                                        current
                                            ? `font-semibold ${statusText(p.status)}`
                                            : p.status === 'failed'
                                                ? 'text-red-500'
                                                : p.status === 'clips_ready'
                                                    ? 'text-emerald-500'
                                                    : 'text-orange-500',
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
                                <div
                                    key={p.id}
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
                                                pillClsFor(p.status, current, d),
                                            )}
                                            />
                                        </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
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
    useEffect(() => () => { if (hideNamesTimer.current) clearTimeout(hideNamesTimer.current); }, []);
    const activeLive = projects.some((p) => ACTIVE.includes(p.status) || p.status === 'paused');
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
    // New project in view: clips start on page one.
    useEffect(() => {
        setClipPage(0);
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
                            <div className="space-y-2">
                                {projects.map((p) => <QueueRow key={p.id} project={p} onCancel={setConfirmTarget} />)}
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
                                once there are more. Only the grid animates;
                                the pill strip stays put. */}
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
                                    })}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setPlayer({
                                                title: shown.name,
                                                sub: 'Source' + (fmtDur(shown.duration_s) ? ` · ${fmtDur(shown.duration_s)}` : ''),
                                                src: `/projects/${shown.id}/stream`,
                                                poster: `/projects/${shown.id}/poster`,
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
                                    <ClipTile key={c.id} clip={c} tall={tallClip} projectName={shown.name} onPlay={setPlayer} />
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
                            <ProjectScroller projects={projects} activeId={activeId} onJump={(id) => goTo(id)} snap={snap} visible={namesVisible} />
                        </div>
                    )}
                </CardContent>
            </Card>
            {confirmTarget && (
                <CancelDialog project={confirmTarget} onClose={() => setConfirmTarget(null)} />
            )}
            {player && (
                <PlayerDialog {...player} onClose={() => setPlayer(null)} />
            )}
        </div>
    );
}
