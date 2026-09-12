import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import { Button } from '../components/ui/button';
import { UploadCloud, FileVideo, Pause, Play, X, RotateCcw, Film, Download, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { getEcho } from '../lib/echo';

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

function statusDot(status) {
    if (status === 'failed') return 'bg-red-500';
    if (status === 'paused') return 'bg-amber-500';
    if (status === 'clips_ready') return 'bg-emerald-500';
    return 'animate-pulse bg-emerald-500';
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

/** Dots-and-lines pipeline stepper for one queued video. */
function Stepper({ status }) {
    const st = stepState(status);
    const current = st.active != null ? STEPS[st.active]?.label : (st.failed ? 'Failed' : st.paused ? 'Paused' : 'Done');
    return (
        <div className="flex items-center" aria-label={`Pipeline: ${current}`}>
            {STEPS.map((s, i) => {
                const done = i < st.done;
                const active = i === st.active;
                const failedDot = st.failed && i === 1;
                return (
                    <div key={s.key} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
                        <span
                            title={s.label}
                            className={cn(
                                'size-2.5 shrink-0 rounded-full',
                                done && !failedDot && 'bg-primary',
                                active && 'animate-pulse bg-primary ring-4 ring-primary/20',
                                failedDot && 'bg-red-500 ring-4 ring-red-500/20',
                                !done && !active && !failedDot && 'bg-border',
                                st.paused && !done && 'bg-amber-500/50',
                            )}
                        />
                        {i < STEPS.length - 1 && (
                            <span className={cn('mx-1 h-0.5 flex-1 rounded-full', i + 1 <= st.done ? 'bg-primary/60' : 'bg-border')} aria-hidden />
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="cancel-title"
                aria-describedby="cancel-desc"
                className="w-[min(400px,calc(100vw-3rem))] rounded-lg border bg-card p-5 shadow-2xl"
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
        <div className="flex items-center gap-3 rounded-lg border bg-card p-2.5">
            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
                <FileVideo className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
                <video
                    className="absolute inset-0 h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                    poster={`/projects/${project.id}/poster`}
                    src={`/projects/${project.id}/stream`}
                />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 self-stretch py-0.5">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <p className="truncate text-sm font-medium" title={project.name}>{project.name}</p>
                    <span className={cn(
                        'flex items-center gap-1.5 text-xs whitespace-nowrap',
                        failed ? 'text-red-500' : 'text-muted-foreground',
                    )}
                    >
                        <span className={cn('size-1.5 rounded-full', statusDot(project.status))} aria-hidden />
                        {label}
                    </span>
                    <span className="flex items-center justify-end gap-0.5">
                        {pausable && (
                            <button
                                type="button" title="Pause" aria-label={`Pause ${project.name}`}
                                onClick={() => router.post(`/projects/${project.id}/pause`, {}, { preserveScroll: true })}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <Pause className="size-4" />
                            </button>
                        )}
                        {paused && (
                            <button
                                type="button" title="Resume" aria-label={`Resume ${project.name}`}
                                onClick={() => router.post(`/projects/${project.id}/resume`, {}, { preserveScroll: true })}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <Play className="size-4" />
                            </button>
                        )}
                        {failed && (
                            <button
                                type="button" title="Retry" aria-label={`Retry ${project.name}`}
                                onClick={() => router.post(`/projects/${project.id}/retry`, {}, { preserveScroll: true })}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <RotateCcw className="size-4" />
                            </button>
                        )}
                        <button
                            type="button" title="Cancel and remove" aria-label={`Cancel ${project.name}`}
                            onClick={() => onCancel(project)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                            <X className="size-4" />
                        </button>
                    </span>
                </div>
                <div className="rounded-md border bg-muted/40 px-2.5 py-2">
                    <Stepper status={project.status} />
                    {failed && project.error && (
                        <p className="mt-1 truncate text-[11px] text-red-500" title={project.error}>{project.error}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/** One generated clip: title, time range, and its render state — a download
 *  button the moment the video file exists. */
function ClipTile({ clip, tall }) {
    const renders = clip.renders ?? [];
    const render = renders[renders.length - 1] ?? null;
    return (
        <div className={cn(
            'flex min-h-0 flex-col justify-between overflow-hidden rounded-md border bg-card p-2',
            tall && 'row-span-2',
        )}
        >
            <span className="flex items-center gap-1.5 text-xs font-medium">
                <Film className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{clip.title || `Clip #${clip.rank}`}</span>
            </span>
            <span className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span className="truncate">#{clip.rank}{fmtRange(clip.start_s, clip.end_s) ? ` · ${fmtRange(clip.start_s, clip.end_s)}` : ''}</span>
                {render?.status === 'done' ? (
                    <a
                        href={`/renders/${render.id}/download`}
                        title={`Download clip #${clip.rank}`}
                        aria-label={`Download clip #${clip.rank}`}
                        className="shrink-0 rounded-md p-1 text-foreground hover:bg-accent"
                    >
                        <Download className="size-3.5" aria-hidden />
                    </a>
                ) : render?.status === 'failed' ? (
                    <span className="shrink-0 text-red-500">failed</span>
                ) : (
                    <span className="flex shrink-0 items-center gap-1" title="Clip is being made">
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                        making
                    </span>
                )}
            </span>
        </div>
    );
}

/** Floating project scroller: one roomy container holding all the pills,
 *  project names riding outside it to the left. Current project centered
 *  and full-size; the rest shrink and fade with distance. Scroll the panel
 *  (or tap a name or pill) to rotate. */
function ProjectScroller({ projects, activeId, onJump, snap, visible }) {
    const n = projects.length;
    const idx = Math.max(0, projects.findIndex((p) => p.id === activeId));
    const activeStatus = projects[idx]?.status;
    // Pill signal: white = done and ready, orange = still working, red = error.
    const pillCls =
        activeStatus === 'failed' ? 'bg-red-500'
        : activeStatus === 'clips_ready' ? 'bg-white ring-1 ring-black/30'
        : 'bg-orange-500';

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
            className="absolute top-1/2 right-3 z-10 flex -translate-y-1/2 items-center gap-2"
            role="navigation"
            aria-label="Projects"
            title="Scroll to switch project"
        >
            {/* Names live outside the container and fade; pills always stay. */}
            <div className={cn(
                'py-[6px] transition-opacity motion-safe:duration-300',
                visible ? 'opacity-100' : 'pointer-events-none opacity-0',
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
                                <button
                                    type="button"
                                    title={p.name}
                                    aria-label={`Jump to ${p.name}`}
                                    aria-current={current || undefined}
                                    onClick={() => onJump(p.id)}
                                    className="min-w-0"
                                >
                                    <span
                                        style={{ opacity: nameOpacity }}
                                        className={cn(
                                            'block max-w-36 truncate text-right text-sm transition-opacity motion-safe:duration-300',
                                            current ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {p.name}
                                    </span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
            </div>
            {/* One container, all pills inside. Uniform 8px all around:
                8px box sides; 6px box + 2px row slack vertically. */}
            <div className="rounded-full border border-border bg-card/95 px-2 py-[6px] shadow-lg backdrop-blur">
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
                                        title={p.name}
                                        aria-label={`Jump to ${p.name}`}
                                        aria-current={current || undefined}
                                        onClick={() => onJump(p.id)}
                                        className="flex h-full w-full items-center justify-center"
                                    >
                                        <span className={cn(
                                            'block rounded-full transition-all motion-safe:duration-300',
                                            current ? `h-5 w-2 ${pillCls}`
                                            : d === 1 ? 'size-2 bg-muted-foreground/70'
                                            : d === 2 ? 'size-1.5 bg-muted-foreground/45'
                                            : 'size-1 bg-muted-foreground/25',
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
    const [uploading, setUploading] = useState(null);
    const [activeId, setActiveId] = useState(projects[0]?.id ?? null);
    const [dir, setDir] = useState(null);
    // snap: far jumps (wrap-around, distant tap) cut instead of sweeping.
    const [snap, setSnap] = useState(false);
    // shownId trails activeId: the outgoing videos fade out first, then the
    // incoming project fades in — never a crossfade overlap.
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

    // Dynamic stage layout: the outer height stays fixed, the arrangement
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
    // New project on stage: clips start on page one.
    useEffect(() => {
        setClipPage(0);
    }, [shownId]);

    // The scroller is the control: wheel (or swipe) anywhere on the right
    // panel rotates projects. Accumulated + cooldown so trackpads flip once.
    function onWheel(e) {
        const now = Date.now();
        if (now < wheelLock.current) return;
        wheelAcc.current += e.deltaY;
        if (Math.abs(wheelAcc.current) < 40) return;
        const d = wheelAcc.current > 0 ? 1 : -1;
        wheelAcc.current = 0;
        wheelLock.current = now + 700;
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

    // Live queue: Reverb pushes status events per project; poll as backup.
    useEffect(() => {
        const ids = projects.map((p) => p.id);
        const echo = getEcho();
        if (echo) {
            ids.forEach((id) => {
                echo.channel(`project.${id}`).listen('.project.status', () => {
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
    // flips collapse onto the latest target — no stale flash.
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
                <Card className="flex h-[30%] min-h-[148px] shrink-0 flex-col overflow-hidden">
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
                                {uploading.name} — {uploading.pct}%
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
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

            {/* RIGHT HALF: one project's videos at a time — scroll flips projects */}
            <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                <CardHeader className="shrink-0 px-4 py-3">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                        <span className="font-semibold">Projects</span>
                        {shown != null && (
                            <>
                                <Badge variant="secondary" className="gap-1.5">
                                    <span className={cn('size-1.5 rounded-full', statusDot(shown.status))} aria-hidden />
                                    {LIVE_LABEL[shown.status] ?? shown.status}
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
                        // once clearly away — no flicker at the boundary.
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
                            Nothing here yet — uploads appear here grouped by project.
                        </p>
                        </div>
                    ) : (
                        <div
                            key={shown.id}
                            className={cn(
                                'flex h-full flex-col px-4 pt-1 pb-4',
                                leaving && dir === 'down' && 'proj-leave-down',
                                leaving && dir === 'up' && 'proj-leave-up',
                                !leaving && dir === 'down' && 'proj-enter-down',
                                !leaving && dir === 'up' && 'proj-enter-up',
                            )}
                        >
                            {/* Dynamic stage: fixed outer height, but the
                                arrangement follows the clip count — vertical
                                tiles for a few videos, source strip + grid
                                once there are more. */}
                            <div className={cn('grid min-h-0 flex-1 gap-2', gridCls)}>
                                <div
                                    className={cn('relative min-h-0 overflow-hidden rounded-md bg-muted', sourceCls)}
                                >
                                    <FileVideo className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
                                    <video
                                        className="absolute inset-0 h-full w-full object-cover"
                                        muted playsInline preload="metadata"
                                        poster={`/projects/${shown.id}/poster`}
                                        src={`/projects/${shown.id}/stream`}
                                    />
                                    <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                                        SOURCE{fmtDur(shown.duration_s) ? ` · ${fmtDur(shown.duration_s)}` : ''}
                                    </span>
                                    {clipCount === 0 && shown.status !== 'failed' && (
                                        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                                            Clips land here
                                        </span>
                                    )}
                                </div>
                                {visClips.map((c) => (
                                    <ClipTile key={c.id} clip={c} tall={tallClip} />
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
                        </div>
                    )}
                    <ProjectScroller projects={projects} activeId={activeId} onJump={(id) => goTo(id)} snap={snap} visible={namesVisible} />
                </CardContent>
            </Card>
            {confirmTarget && (
                <CancelDialog project={confirmTarget} onClose={() => setConfirmTarget(null)} />
            )}
        </div>
    );
}
