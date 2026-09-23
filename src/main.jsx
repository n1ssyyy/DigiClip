import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import './app.css';
import AppLayout from './layouts/AppLayout';
import Home from './pages/Home';
import Health from './pages/Health';
import Settings from './pages/Settings';
import { connect, useStore, whenSynced } from './lib/socket';
import { getServe, isTauri, onServeFailed, onServeReady } from './lib/native';

/** The shell boots the sidecar before first paint: either it is already
 *  up (`get_serve`) or the `serve-ready` event lands. No UI until then. */
/** The shell boots the sidecar before first paint. Belt and suspenders:
 *  the shell emits `serve-ready`/`serve-failed`, but an event fired
 *  before this listener attaches would be missed — so a local `get_serve`
 *  poll backs it up (500ms; a shell invoke, not backend polling). */
function waitServe() {
    return new Promise((resolve, reject) => {
        let done = false;
        let offR = null;
        let offF = null;
        const cleanup = () => {
            offR?.();
            offF?.();
            clearInterval(timer);
            clearTimeout(cap);
        };
        const finish = (fn, v) => {
            if (done) return;
            done = true;
            cleanup();
            fn(v);
        };
        onServeReady((p) => finish(resolve, p)).then((f) => { offR = f; }).catch(() => {});
        onServeFailed((e) => finish(reject, new Error(typeof e === 'string' ? e : 'engine failed to boot'))).then((f) => { offF = f; }).catch(() => {});
        const poll = () => {
            getServe().then((p) => finish(resolve, p)).catch(() => {});
        };
        poll();
        const timer = setInterval(poll, 500);
        const cap = setTimeout(() => finish(reject, new Error('engine did not answer in 60s')), 60000);
    });
}

function BootFailed({ error }) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
            <div className="pop w-[min(440px,calc(100vw-3rem))] rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-5 shadow-2xl">
                <h1 className="text-[13px] font-semibold">Engine failed to start</h1>
                <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">{String(error?.message ?? error)}</p>
                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="rounded-md bg-primary px-4 py-1.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Retry
                    </button>
                </div>
            </div>
        </div>
    );
}

function Shell() {
    const page = useStore((s) => s.page);
    return (
        <AppLayout>
            {page === 'health' ? <Health /> : page === 'settings' ? <Settings /> : <Home />}
        </AppLayout>
    );
}

function Boot() {
    const [phase, setPhase] = useState({ name: 'serve', error: null });

    useEffect(() => {
        let dead = false;
        waitServe()
            .then((serve) => {
                if (dead) return null;
                setPhase({ name: 'sync', error: null });
                connect(serve);
                return whenSynced();
            })
            .then((synced) => {
                if (dead || !synced) return;
                setPhase({ name: 'ready', error: null });
                // Silent boot check for app updates (own channel, not the
                // engine socket): no toast when up to date or offline.
                if (isTauri()) {
                    import('./lib/updates.js').then((m) => {
                        if (m.updateAutoEnabled()) m.checkForUpdates({ silent: true }).catch(() => {});
                    }).catch(() => {});
                }
            })
            .catch((error) => {
                if (dead) return;
                setPhase({ name: 'failed', error });
            });
        return () => {
            dead = true;
        };
    }, []);

    if (phase.name === 'failed') return <BootFailed error={phase.error} />;
    if (phase.name !== 'ready') {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
                <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
                <p className="font-mono text-[11px] text-muted-foreground">
                    {phase.name === 'sync' ? 'Syncing…' : 'Starting engine…'}
                </p>
            </div>
        );
    }
    return <Shell />;
}

createRoot(document.getElementById('app')).render(<Boot />);
