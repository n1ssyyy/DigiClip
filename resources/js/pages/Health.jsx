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
        <li className="flex flex-1 items-center gap-3">
            <span><StatusIcon ok={value?.ok} /></span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                    {label}
                    {version && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{version}</span>}
                </p>
                {sub && <p className="truncate font-mono text-xs text-muted-foreground" title={sub}>{sub}</p>}
            </div>
            <Badge variant={value?.ok ? 'success' : 'secondary'} className="mb-1 self-end">{value?.ok ? 'ready' : 'pending'}</Badge>
        </li>
    );
}

function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
}

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
    const [updatedAt, setUpdatedAt] = useState(Date.now());
    const [conn, setConn] = useState('connecting');
    const [, setTick] = useState(0);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/health');
            if (!res.ok) return;
            setLive(await res.json());
            setUpdatedAt(Date.now());
        } catch {
            // Offline or backend restarting — keep last report, label goes stale.
        }
    }, []);

    // Event-based freshness: refetch when the view returns, the machine
    // reconnects, or the socket does. No button, no polling.
    useEffect(() => {
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
                <CardContent className="flex min-h-0 flex-1 flex-col px-4 pt-0 pb-3">
                    <ul className="flex min-h-0 flex-1 flex-col divide-y divide-border">
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
