import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import Tip from '../components/digiclip/Tooltip';
import { Skeleton, Swap } from '../components/digiclip/Skeleton';
import { refreshHealth, useStore } from '../lib/socket';

function StatusIcon({ ok }) {
    if (ok === true) return <CheckCircle2 className="size-4 text-[var(--viral)]" aria-label="ok" />;
    if (ok === false) return <XCircle className="size-4 text-destructive" aria-label="missing" />;
    return <MinusCircle className="size-4 text-muted-foreground" aria-label="unknown" />;
}

function Row({ label, version, value, hint }) {
    const sub = value?.path ?? hint ?? value?.hint;
    return (
        <li className="rise flex items-center gap-3 py-2.5">
            <span><StatusIcon ok={value?.ok} /></span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                    {label}
                    {version && <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">{version}</span>}
                </p>
                {sub && (
                    <Tip label={sub} side="top" className="min-w-0">
                        <p className="truncate font-mono text-[11px] text-muted-foreground min-w-0">{sub}</p>
                    </Tip>
                )}
            </div>
            <Badge variant={value?.ok ? 'success' : 'secondary'}>{value?.ok ? 'ready' : 'pending'}</Badge>
        </li>
    );
}

function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
}

function Stat({ label, value, alert }) {
    return (
        <div className="flex flex-col items-center justify-center px-3 py-2">
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase indent-[0.1em]">{label}</p>
            <p className={cn('text-base leading-snug font-semibold tabular-nums', alert && value > 0 && 'text-red-500')}>{value}</p>
        </div>
    );
}

const ACTIVE = ['queued', 'extracting', 'transcribing', 'analyzing'];

// Checklist rows over the serve health shape. Same 9-row board, same
// density — only the probes changed (engine instead of PHP/Node).
const CHECKS = (live, extra) => [
    { label: 'Engine', version: live.version, value: { ok: true } },
    { label: `ffmpeg${live.ffmpeg_libass ? ' + libass' : ''}`, value: { ok: live.ffmpeg_ok, hint: extra.jobsDir } },
    { label: 'render encoder', version: live.encoder, value: { ok: true } },
    {
        label: 'whisper sidecar',
        version: live.whisper_vulkan ? 'vulkan' : live.whisper_cli ? 'cpu' : null,
        value: { ok: live.whisper_cli || live.whisper_vulkan },
    },
    { label: 'GPU', value: { ok: live.gpu_available, hint: extra.gpuReason } },
    {
        label: `STT model (${extra.sttModel})`,
        value: { ok: extra.sttReady, hint: extra.sttReady ? 'On disk, ready to transcribe.' : 'Pick it in Settings to download.' },
    },
    { label: 'Storage', value: { ok: true, hint: extra.jobsDir } },
    { label: 'Queue (gpu worker)', value: { ok: true, hint: extra.queueHint } },
    { label: 'Connection', value: { ok: extra.connected, hint: extra.socketHint } },
];

const FALLBACK = {
    version: '…', ffmpeg_ok: null, ffmpeg_libass: false, encoder: '…',
    whisper_cli: null, whisper_vulkan: false, yunet_ok: null,
    gpu_available: null, gpu_reason: 'Probing…', jobs_dir: '…',
};

export default function Health() {
    const health = useStore((s) => s.health);
    const conn = useStore((s) => s.conn);
    const jobs = useStore((s) => s.jobs);
    const settings = useStore((s) => s.settings);
    const models = useStore((s) => s.models);
    const [updatedAt, setUpdatedAt] = useState(Date.now());
    // Hovering the header or the content lights both borders together so
    // the pair reads as one unit without touching.
    const [hot, setHot] = useState(false);
    const [, setTick] = useState(0);

    const refresh = () => {
        refreshHealth().then(() => setUpdatedAt(Date.now())).catch(() => {});
    };

    // Event-based freshness: re-ask over the same socket when the view
    // returns or the machine reconnects. No polling, no buttons. The
    // clock below only re-renders the "ago" label.
    useEffect(() => {
        refresh();
        const onVisible = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        const onOnline = () => refresh();
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onOnline);
        window.addEventListener('online', onOnline);
        const clock = setInterval(() => setTick((t) => t + 1), 10000);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onOnline);
            window.removeEventListener('online', onOnline);
            clearInterval(clock);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (conn === 'live') refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conn]);

    const live = health ?? FALLBACK;
    const clips = jobs.flatMap((j) => (j.clips ?? []).map((c) => ({ ...c, job: j.id })));
    const jobActive = (j) => ACTIVE.includes(j.status) || (j.status === 'clips_ready' && (j.clips ?? []).some((c) => c.render_status !== 'done' && c.render_status !== 'failed'));
    const working = jobs.filter(jobActive).length;
    const paused = 0;
    const readyCount = jobs.filter((j) => j.status === 'clips_ready' || j.status === 'done').length;
    const rendered = clips.filter((c) => c.render_status === 'done').length;
    const failed = jobs.filter((j) => j.status === 'failed').length
        + clips.filter((c) => c.render_status === 'failed').length;
    const sttModel = settings?.stt_model ?? 'base.en';
    const runningJob = jobs.find((j) => ACTIVE.includes(j.status));
    const checks = CHECKS(live, {
        jobsDir: live.jobs_dir,
        gpuReason: live.gpu_reason,
        sttModel,
        sttReady: !!models[sttModel]?.downloaded,
        queueHint: runningJob ? `rendering ${runningJob.name}` : 'idle',
        connected: conn === 'live',
        socketHint: conn === 'live' ? 'local socket' : 'reconnecting…',
    });
    const ready = checks.filter((c) => c.value?.ok).length;
    const connected = conn === 'live';

    // Health header stays its own panel; the stub in the gap below
    // points at the content so the two read as a pair without touching.
    // h-10 keeps all headers the same thickness.
    return (
        <div className="flex h-full min-h-[480px] flex-col gap-[5px]">
            <Card
                className={cn('relative shrink-0 transition-colors', hot && 'border-t-white/25 border-x-white/[0.13]')}
                onMouseEnter={() => setHot(true)}
                onMouseLeave={() => setHot(false)}
            >
                <span aria-hidden className="absolute top-full left-6 h-[5px] w-px bg-border" />
                <CardHeader className="h-10 justify-center px-4 py-0">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <CardTitle className="text-[13px]">System health</CardTitle>
                        <Badge variant={ready === checks.length ? 'success' : 'secondary'}>
                            {ready}/{checks.length} ready
                        </Badge>
                        <span className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                            <span className={cn(
                                'size-1.5 rounded-full',
                                connected ? 'animate-pulse bg-[var(--viral)]' : 'bg-muted-foreground',
                            )} aria-hidden />
                            {connected ? 'Live' : 'Updated'} · {ago(Date.now() - updatedAt)}
                        </span>
                    </div>
                </CardHeader>
            </Card>
            <Card
                className={cn('stagger-1 flex min-h-0 flex-1 flex-col overflow-hidden transition-colors', hot && 'border-t-white/25 border-x-white/[0.13]')}
                onMouseEnter={() => setHot(true)}
                onMouseLeave={() => setHot(false)}
            >
                <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-0 pb-3">
                    <div className="flex-1" aria-hidden />
                    <Swap
                        ready
                        className="w-full shrink-0"
                        skeleton={(
                            <div className="grid grid-cols-5 divide-x divide-border rounded-md border">
                                {['Working', 'Paused', 'Ready', 'Rendered', 'Failed'].map((label) => (
                                    <div key={label} className="flex flex-col items-center justify-center gap-1.5 px-3 py-2">
                                        <Skeleton className="h-3 w-14 rounded-sm" />
                                        <Skeleton className="h-6 w-8 rounded-sm" />
                                    </div>
                                ))}
                            </div>
                        )}
                    >
                        <div className="grid grid-cols-5 divide-x divide-border rounded-md border">
                            <Stat label="Working" value={working} />
                            <Stat label="Paused" value={paused} />
                            <Stat label="Ready" value={readyCount} />
                            <Stat label="Rendered" value={rendered} />
                            <Stat label="Failed" value={failed} alert />
                        </div>
                    </Swap>
                    <div className="flex-1" aria-hidden />
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('digiclip:tour'))}
                        className="shrink-0 font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                        Take the tour again
                    </button>
                    <ul className="flex shrink-0 flex-col divide-y divide-border">
                        {checks.map((c) => <Row key={c.label} {...c} />)}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}