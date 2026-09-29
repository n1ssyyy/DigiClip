import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import './app.css';
import './motion.css';
import { startIconMotion } from './lib/iconMotion';
import AppLayout from './layouts/AppLayout';
import BrandMark from './components/digiclip/BrandMark';
import { ChromeBar } from './components/digiclip/Titlebar';
import Home from './pages/Home';
import Health from './pages/Health';
import Settings from './pages/Settings';
import Mcp from './pages/Mcp';
import TrayMenu, { jobActivity } from './tray/TrayMenu';
import { connect, navigate, useStore, whenSynced } from './lib/socket';
import { getServe, isTauri, onNavigate, onServeFailed, onServeReady, setTrayText, windowLabel } from './lib/native';
import { t, useLang, useT } from './lib/i18n';
import { cn } from './lib/utils';

// The tray menu is a second window running this bundle (see tray.rs).
const IS_TRAY = windowLabel() === 'tray';
if (IS_TRAY) document.documentElement.classList.add('tray-root');

/** The shell boots the sidecar before first paint. Belt and suspenders:
 *  the shell emits `serve-ready`/`serve-failed`, but an event fired
 *  before this listener attaches would be missed — so a local `get_serve`
 *  poll backs it up (500ms; a shell invoke, not backend polling). */
function waitServe() {
    // Dev in a plain browser: `?port=…&token=…` points at a `--serve`
    // started by hand. Compiled out of production builds.
    if (import.meta.env.DEV && !isTauri()) {
        const q = new URLSearchParams(window.location.search);
        if (q.get('port') && q.get('token')) return Promise.resolve({ port: +q.get('port'), token: q.get('token') });
    }
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
        onServeFailed((e) => finish(reject, new Error(typeof e === 'string' ? e : t('engine failed to boot')))).then((f) => { offF = f; }).catch(() => {});
        const poll = () => {
            getServe().then((p) => finish(resolve, p)).catch(() => {});
        };
        poll();
        const timer = setInterval(poll, 500);
        const cap = setTimeout(() => finish(reject, new Error(t('engine did not answer in 60s'))), 60000);
    });
}

/** Boot splash: the title bar (so the window can be moved and closed
 *  while the engine starts), the clapperboard clapping on a beat, the
 *  phase line and an indeterminate sweep. When the app is ready it stays
 *  on top for one beat and dissolves into the shell. */
function Splash({ phase, leaving = false }) {
    const t = useT();
    const line = phase === 'sync' ? t('Syncing…') : t('Starting engine…');
    return (
        <div className={cn('fixed inset-0 z-[300] flex flex-col rounded-[inherit] bg-background text-foreground', leaving && 'splash-out pointer-events-none')}>
            <ChromeBar />
            <div className="flex flex-1 flex-col items-center justify-center gap-5 pb-[var(--chrome)]">
                <div className="boot-mark relative flex size-20 items-center justify-center">
                    <span aria-hidden className="boot-halo absolute inset-0 rounded-full" />
                    <BrandMark mode="loop" className="relative size-11" strokeWidth={1.6} />
                </div>
                <div className="boot-text flex flex-col items-center gap-1.5">
                    <p className="text-[15px] font-semibold tracking-tight">DigiClip</p>
                    <p key={line} role="status" className="swap-in font-mono text-[11px] text-muted-foreground">{line}</p>
                </div>
                <div aria-hidden className="boot-track h-[2px] w-36 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className="boot-sweep h-full w-1/3 rounded-full" />
                </div>
            </div>
        </div>
    );
}

function BootFailed({ error }) {
    const t = useT();
    return (
        <div className="flex h-screen flex-col bg-background text-foreground">
            <ChromeBar />
            <div className="flex flex-1 items-center justify-center p-6 pb-[calc(var(--chrome)+1.5rem)]">
                <div className="pop w-[min(440px,calc(100vw-3rem))] rounded-md border border-x-white/10 border-t-white/20 border-b-black/60 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-5 shadow-2xl">
                    <div className="flex items-start gap-3">
                        <span className="shake-in flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/15 text-red-400">
                            <AlertTriangle className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                            <h1 className="text-[13px] font-semibold">{t('Engine failed to start')}</h1>
                            <p className="mt-1.5 font-mono text-[11px] break-words text-muted-foreground">{String(error?.message ?? error)}</p>
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="group flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-95"
                        >
                            <RotateCw className="size-3.5" aria-hidden />
                            {t('Retry')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Main window only: the tray can ask for a page when it opens the app,
 *  and the tray icon's tooltip tracks what's running. */
function TrayBridge() {
    const lang = useLang();
    const active = useStore((s) => s.jobs.filter((j) => jobActivity(j)).length);
    useEffect(() => {
        const off = onNavigate((page) => {
            if (page) navigate(page);
        });
        return () => {
            off.then((f) => f()).catch(() => {});
        };
    }, []);
    useEffect(() => {
        const tip = active ? t('DigiClip — {count} running', { count: active }) : 'DigiClip';
        setTrayText(tip, t('Open DigiClip'), t('Quit DigiClip'));
    }, [active, lang]);
    return null;
}

function Shell() {
    const page = useStore((s) => s.page);
    return (
        <AppLayout>
            {isTauri() && <TrayBridge />}
            {page === 'health' ? <Health /> : page === 'settings' ? <Settings /> : page === 'mcp' ? <Mcp /> : <Home />}
        </AppLayout>
    );
}

function Boot() {
    const [phase, setPhase] = useState({ name: 'serve', error: null });
    // The splash lingers over the fresh shell for its exit beat.
    const [splash, setSplash] = useState(true);
    useEffect(() => {
        if (phase.name !== 'ready') return undefined;
        const tm = setTimeout(() => setSplash(false), 520);
        return () => clearTimeout(tm);
    }, [phase.name]);

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
                if (IS_TRAY) return;
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

    // The tray menu never waits on the engine: its status dot covers the
    // boot, and Quit must work even when the engine never comes up.
    if (IS_TRAY) return <TrayMenu />;
    if (phase.name === 'failed') return <BootFailed error={phase.error} />;
    if (phase.name !== 'ready') return <Splash phase={phase.name} />;
    return (
        <>
            <Shell />
            {splash && <Splash phase="sync" leaving />}
        </>
    );
}

if (!IS_TRAY) startIconMotion();
createRoot(document.getElementById('app')).render(<Boot />);
