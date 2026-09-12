import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { getEcho, onConnect, onDisconnect } from '../lib/echo';
import { cn } from '../lib/utils';

function StatusIcon({ ok }) {
    if (ok === true) return <CheckCircle2 className="size-4 text-[var(--viral)]" aria-label="ok" />;
    if (ok === false) return <XCircle className="size-4 text-destructive" aria-label="missing" />;
    return <MinusCircle className="size-4 text-muted-foreground" aria-label="unknown" />;
}

function Row({ label, version, value, hint }) {
    const sub = value?.path ?? hint ?? value?.hint;
    return (
        <li className="flex items-center gap-3 py-2.5">
            <span><StatusIcon ok={value?.ok} /></span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                    {label}
                    {version && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{version}</span>}
                </p>
                {sub && <p className="truncate font-mono text-xs text-muted-foreground" title={sub}>{sub}</p>}
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
        <div className="px-3 py-2 text-center">
            <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">{label}</p>
            <p className={cn('text-lg font-semibold tabular-nums', alert && value > 0 && 'text-red-500')}>{value}</p>
        </div>
    );
}

const WORKING = ['queued', 'extracting', 'extracted', 'transcribing', 'transcribed', 'analyzing'];

const CHECKS = (live) => [
    { label: 'PHP', version: live.php.version, value: { ok: live.php.ok } },
    { label: 'Node', version: live.node.version, value: live.node },
    { label: `ffmpeg${live.ffmpeg.libass ? ' + libass' : ''}`, version: live.ffmpeg.version, value: live.ffmpeg },
    { label: 'render encoder', version: live.encoder.version, value: live.encoder },
    { label: 'whisper.cpp', version: live.whisper.version, value: live.whisper },
    { label: 'Storage', value: live.storage },
    { label: 'Database (SQLite)', value: live.database },
    { label: `Queue (${live.queue.connection})`, value: live.queue },
];

export default function Health({ report }) {
    const [live, setLive] = useState(report);
    const [snap, setSnap] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(Date.now());
    const [conn, setConn] = useState('connecting');
    const [, setTick] = useState(0);

    const fetchSnap = useCallback(async () => {
        try {
            const res = await fetch('/api/snapshot');
            if (res.ok) setSnap(await res.json());
        } catch {
            // Same story as health: keep last numbers, labels go stale.
        }
    }, []);

    const refresh = useCallback(async () => {
        fetchSnap();
        try {
            const res = await fetch('/api/health');
            if (!res.ok) return;
            setLive(await res.json());
            setUpdatedAt(Date.now());
        } catch {
            // Offline or backend restarting — keep last report, label goes stale.
        }
    }, [fetchSnap]);

    // Event-based freshness: refetch when the view returns, the machine
    // reconnects, or the socket does. Snapshot additionally polls while
    // the pipeline is hot. No button anywhere.
    useEffect(() => {
        refresh();
        const onVisible = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        const onOnline = () => refresh();
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onOnline);
        window.addEventListener('online', onOnline);
        const echo = getEcho();
        if (echo) {
            onConnect(() => { setConn('connected'); refresh(); });
            onDisconnect(() => setConn('connecting'));
        }
        const clock = setInterval(() => setTick((t) => t + 1), 10000);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onOnline);
            window.removeEventListener('online', onOnline);
            clearInterval(clock);
        };
    }, [refresh]);

    const checks = CHECKS(live);
    const ready = checks.filter((c) => c.value?.ok).length;
    const exts = Object.entries(live.php.extensions ?? {});
    const missing = exts.filter(([, v]) => !v).map(([k]) => k);

    // Snapshot buckets + adaptive polling: idle board rests on events,
    // an active pipeline re-reads every few seconds until it drains.
    const P = snap?.projects ?? {};
    const R = snap?.renders ?? {};
    const num = (v) => Number(v) || 0;
    const working = WORKING.reduce((a, s) => a + num(P[s]), 0);
    const paused = num(P.paused);
    const readyCount = num(P.clips_ready);
    const rendered = num(R.done);
    const failed = num(P.failed) + num(R.failed);
    const rendering = num(R.rendering) + num(R.queued);

    useEffect(() => {
        if (working === 0 && rendering === 0) return;
        const t = setInterval(fetchSnap, 8000);
        return () => clearInterval(t);
    }, [working, rendering, fetchSnap]);

    return (
        <div className="h-[calc(100dvh-101px)] min-h-[480px]">
            <Card className="flex h-full flex-col overflow-hidden">
                <CardHeader className="shrink-0 px-4 py-3">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <CardTitle className="text-sm">System health</CardTitle>
                        <Badge variant={ready === checks.length ? 'success' : 'secondary'}>
                            {ready}/{checks.length} ready
                        </Badge>
                        <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                            <span className={cn(
                                'size-1.5 rounded-full',
                                conn === 'connected' ? 'animate-pulse bg-[var(--viral)]' : 'bg-muted-foreground',
                            )} aria-hidden />
                            {conn === 'connected' ? 'Live' : 'Updated'} · {ago(Date.now() - updatedAt)}
                        </span>
                    </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-0 pb-3">
                    {snap && (
                        <div className="mb-3 grid shrink-0 grid-cols-5 divide-x divide-border rounded-md border">
                            <Stat label="Working" value={working} />
                            <Stat label="Paused" value={paused} />
                            <Stat label="Ready" value={readyCount} />
                            <Stat label="Rendered" value={rendered} />
                            <Stat label="Failed" value={failed} alert />
                        </div>
                    )}
                    <ul className="mt-auto flex shrink-0 flex-col divide-y divide-border">
                        {checks.map((c) => <Row key={c.label} {...c} />)}
                    </ul>
                    {missing.length > 0 && (
                        <p className="shrink-0 pt-2 font-mono text-xs text-muted-foreground">
                            missing PHP ext: {missing.join(', ')}
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
