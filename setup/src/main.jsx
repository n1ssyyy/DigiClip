import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ArrowDownToLine,
    CheckCircle2,
    Clapperboard,
    Loader2,
    RotateCcw,
    Trash2,
    Wrench,
    X,
    XCircle,
} from 'lucide-react';
import './app.css';
import { Button, ProgressRing } from './ui';
import {
    closeApp,
    closeSetup,
    cmpVersions,
    detectInstall,
    downloadSetup,
    fetchLatest,
    installSilent,
    isAppRunning,
    launchApp,
    onDownloadProgress,
    openExternal,
    uninstallSilent,
} from './lib';

/**
 * DigiClip Setup: the custom installer. Detects this machine (installed
 * version vs latest release) and offers exactly the actions that make
 * sense: Install / Update / Reinstall / Repair / Uninstall. The native
 * NSIS installer does the file work silently underneath; this window is
 * the whole visible setup experience.
 */

const RELEASES_URL = 'https://github.com/n1ssyyy/DigiClip/releases';

function Titlebar() {
    return (
        <header
            className="flex h-11 shrink-0 items-center gap-2 pr-2 pl-4 select-none"
            data-tauri-drag-region
            onMouseDown={(e) => {
                if (e.button !== 0) return;
                if (e.target.closest('button')) return;
            }}
        >
            <Clapperboard className="size-4" aria-hidden />
            <p className="text-[13px] font-semibold tracking-tight">DigiClip Setup</p>
            <div className="flex-1" aria-hidden />
            <button
                type="button"
                onClick={closeSetup}
                aria-label="Close setup"
                data-no-drag
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
                <X className="size-4" aria-hidden />
            </button>
        </header>
    );
}

function Center({ children }) {
    return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 py-6 text-center">
            {children}
        </div>
    );
}

function ManageRow({ onReinstall, onRepair, onUninstall, disabled }) {
    return (
        <div className="rise flex items-center justify-center gap-1">
            <Button variant="ghost" size="sm" disabled={disabled} onClick={onReinstall}>
                <RotateCcw className="size-3.5" aria-hidden />
                Reinstall
            </Button>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={onRepair}>
                <Wrench className="size-3.5" aria-hidden />
                Repair
            </Button>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={onUninstall}>
                <Trash2 className="size-3.5" aria-hidden />
                Uninstall
            </Button>
        </div>
    );
}

function Boot() {
    // s = { phase, installed, latest, error, work, done, pending }
    const [s, setS] = useState({ phase: 'boot', installed: null, latest: null, error: null, work: null, done: null, pending: null });
    const stateRef = useRef(s);
    stateRef.current = s;

    const patch = useCallback((p) => setS((prev) => ({ ...prev, ...p })), []);

    const refresh = useCallback(async () => {
        patch({ phase: 'boot', error: null });
        const [installed, latest] = await Promise.all([
            detectInstall().catch(() => ({ installed: false })),
            fetchLatest().catch(() => null),
        ]);
        if (!latest) {
            patch({ phase: 'offline', installed, latest: null });
            return;
        }
        if (!installed?.installed) {
            patch({ phase: 'install', installed, latest });
            return;
        }
        patch({
            phase: cmpVersions(latest.version, installed.version) > 0 ? 'update' : 'current',
            installed,
            latest,
        });
    }, [patch]);

    useEffect(() => {
        refresh().catch((e) => patch({ phase: 'error', error: e?.message ?? String(e) }));
    }, [refresh]);

    // External links leave the wizard via the OS browser.
    useEffect(() => {
        const onClick = (e) => {
            const a = e.target.closest?.('a[href^="http"]');
            if (!a) return;
            e.preventDefault();
            openExternal(a.href);
        };
        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, []);

    // Download progress rides the shell's event (same pattern as engine jobs).
    useEffect(() => {
        let off = null;
        onDownloadProgress(({ done, total }) => {
            const st = stateRef.current;
            if (st.phase !== 'working' || st.work?.kind !== 'download') return;
            const pct = total > 0 ? Math.min(99, Math.round((done / total) * 100)) : null;
            patch({ work: { ...st.work, pct } });
        }).then((f) => { off = f; }).catch(() => {});
        return () => { off?.(); };
    }, [patch]);

    /** Guard: silent installers fail on locked files — close first. */
    async function ensureClosed(action) {
        if (await isAppRunning().catch(() => false)) {
            patch({ phase: 'confirm-close', pending: action });
            return false;
        }
        return true;
    }

    async function doDownloadAndInstall(kind, title) {
        const { latest } = stateRef.current;
        try {
            patch({ phase: 'working', work: { kind: 'download', title: `Downloading DigiClip v${latest.version}…`, pct: null } });
            const path = await downloadSetup(latest.setup_url);
            patch({ phase: 'working', work: { kind: 'install', title, pct: null } });
            const { code } = await installSilent(path);
            if (code !== 0) throw new Error(`Installer exited with code ${code}.`);
            const installed = await detectInstall().catch(() => null);
            patch({ phase: 'done', done: { kind, version: installed?.version ?? latest.version }, installed });
        } catch (e) {
            patch({ phase: 'error', error: e?.message ?? String(e) });
        }
    }

    async function startInstall() {
        if (!(await ensureClosed('install'))) return;
        await doDownloadAndInstall('installed', 'Installing DigiClip…');
    }

    async function startUpdate() {
        if (!(await ensureClosed('update'))) return;
        await doDownloadAndInstall('updated', 'Updating DigiClip…');
    }

    async function startRepair() {
        if (!(await ensureClosed('repair'))) return;
        await doDownloadAndInstall('repaired', 'Repairing DigiClip…');
    }

    async function startUninstall() {
        try {
            patch({ phase: 'working', work: { kind: 'uninstall', title: 'Removing DigiClip…', pct: null } });
            const { code } = await uninstallSilent();
            if (code !== 0) throw new Error(`Uninstaller exited with code ${code}.`);
            patch({ phase: 'done', done: { kind: 'uninstalled' }, installed: { installed: false } });
        } catch (e) {
            patch({ phase: 'error', error: e?.message ?? String(e) });
        }
    }

    async function confirmCloseAndGo() {
        const action = stateRef.current.pending;
        patch({ pending: null });
        await closeApp().catch(() => {});
        // Give the process a beat to release its files.
        await new Promise((r) => setTimeout(r, 1200));
        if (action === 'install') await startInstall();
        else if (action === 'update') await startUpdate();
        else if (action === 'repair') await startRepair();
    }

    const { phase, installed, latest, error, work, done } = s;
    const installedV = installed?.version;

    return (
        <div className="flex h-screen flex-col bg-background text-foreground">
            <Titlebar />
            {phase === 'boot' && (
                <Center>
                    <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
                    <p className="font-mono text-[11px] text-muted-foreground">Checking this machine…</p>
                </Center>
            )}
            {phase === 'install' && (
                <Center>
                    <div className="pop flex size-16 items-center justify-center rounded-2xl border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]">
                        <Clapperboard className="size-7" aria-hidden />
                    </div>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">Install DigiClip</h1>
                        <p className="font-mono text-[11px] text-muted-foreground">v{latest.version} · drop a video, get TikTok-ready clips</p>
                    </div>
                    <Button onClick={startInstall}>
                        <ArrowDownToLine className="size-4" aria-hidden />
                        Install now
                    </Button>
                </Center>
            )}
            {phase === 'update' && (
                <Center>
                    <div className="pop flex size-16 items-center justify-center rounded-2xl border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]">
                        <ArrowDownToLine className="size-7 text-[var(--viral)]" aria-hidden />
                    </div>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">Update available</h1>
                        <p className="font-mono text-[11px] text-muted-foreground">v{installedV} → v{latest.version}</p>
                    </div>
                    <Button onClick={startUpdate}>Update to v{latest.version}</Button>
                    <ManageRow onReinstall={startInstall} onRepair={startRepair} onUninstall={() => patch({ phase: 'confirm-uninstall' })} />
                </Center>
            )}
            {phase === 'current' && (
                <Center>
                    <div className="pop flex size-16 items-center justify-center rounded-2xl border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]">
                        <CheckCircle2 className="size-7 text-[var(--viral)]" aria-hidden />
                    </div>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">You are up to date</h1>
                        <p className="font-mono text-[11px] text-muted-foreground">DigiClip v{installedV} is installed</p>
                    </div>
                    <ManageRow onReinstall={startInstall} onRepair={startRepair} onUninstall={() => patch({ phase: 'confirm-uninstall' })} />
                </Center>
            )}
            {phase === 'offline' && (
                <Center>
                    <div className="pop flex size-16 items-center justify-center rounded-2xl border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]">
                        <XCircle className="size-7 text-destructive" aria-hidden />
                    </div>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">Cannot reach the releases page</h1>
                        <p className="font-mono text-[11px] text-muted-foreground">Check your connection, then try again.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={refresh}>Retry</Button>
                        {installed?.installed && (
                            <Button variant="ghost" onClick={() => patch({ phase: 'confirm-uninstall' })}>Uninstall…</Button>
                        )}
                    </div>
                </Center>
            )}
            {phase === 'confirm-uninstall' && (
                <Center>
                    <div className="pop flex size-16 items-center justify-center rounded-2xl border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]">
                        <Trash2 className="size-7 text-destructive" aria-hidden />
                    </div>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">Remove DigiClip{installedV ? ` v${installedV}` : ''}?</h1>
                        <p className="font-mono text-[11px] text-muted-foreground">Your clips and projects stay on disk.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={refresh}>Keep it</Button>
                        <Button variant="danger" onClick={startUninstall}>Uninstall</Button>
                    </div>
                </Center>
            )}
            {phase === 'confirm-close' && (
                <Center>
                    <div className="pop flex size-16 items-center justify-center rounded-2xl border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]">
                        <Loader2 className="size-7 text-muted-foreground" aria-hidden />
                    </div>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">DigiClip is running</h1>
                        <p className="font-mono text-[11px] text-muted-foreground">It must close so its files can be replaced.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => { patch({ pending: null }); refresh(); }}>Cancel</Button>
                        <Button onClick={confirmCloseAndGo}>Close app and continue</Button>
                    </div>
                </Center>
            )}
            {phase === 'working' && work && (
                <Center>
                    {work.kind === 'download' && work.pct !== null ? (
                        <ProgressRing value={work.pct} size={56} label="Setup download" />
                    ) : (
                        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
                    )}
                    <div className="rise w-full max-w-72 space-y-2">
                        <p className="text-[13px] font-medium">{work.title}</p>
                        {work.kind === 'download' && work.pct !== null && (
                            <>
                                <div className="dl-track" aria-hidden>
                                    <div className="dl-fill" style={{ width: `${work.pct}%` }} />
                                </div>
                                <p className="font-mono text-[11px] text-muted-foreground">{work.pct}%</p>
                            </>
                        )}
                        {work.kind !== 'download' && (
                            <div className="indet h-1.5 rounded-full" aria-hidden />
                        )}
                    </div>
                </Center>
            )}
            {phase === 'done' && done && (
                <Center>
                    <div className="pop flex size-16 items-center justify-center rounded-2xl border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]">
                        <CheckCircle2 className="size-7 text-[var(--viral)]" aria-hidden />
                    </div>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">
                            {done.kind === 'uninstalled' && 'DigiClip removed'}
                            {done.kind === 'installed' && `DigiClip v${done.version} installed`}
                            {done.kind === 'updated' && `Updated to v${done.version}`}
                            {done.kind === 'repaired' && `DigiClip v${done.version} repaired`}
                        </h1>
                        <p className="font-mono text-[11px] text-muted-foreground">
                            {done.kind === 'uninstalled' ? 'Thanks for trying it out.' : 'Ready when you are.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {done.kind === 'uninstalled' ? (
                            <>
                                <Button variant="secondary" onClick={refresh}>Install fresh</Button>
                                <Button variant="ghost" onClick={closeSetup}>Close</Button>
                            </>
                        ) : (
                            <>
                                <Button variant="ghost" onClick={closeSetup}>Close</Button>
                                <Button onClick={() => { launchApp(); closeSetup(); }}>Launch DigiClip</Button>
                            </>
                        )}
                    </div>
                </Center>
            )}
            {phase === 'error' && (
                <Center>
                    <div className="pop flex size-16 items-center justify-center rounded-2xl border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]">
                        <XCircle className="size-7 text-destructive" aria-hidden />
                    </div>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">Something went wrong</h1>
                        <p className="max-w-96 font-mono text-[11px] break-words text-muted-foreground">{error ?? 'Unknown error.'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={refresh}>Back to start</Button>
                        <a className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" href={RELEASES_URL} target="_blank" rel="noreferrer">
                            Get the installer by hand
                        </a>
                    </div>
                </Center>
            )}
            <footer className="flex shrink-0 items-center justify-center pb-4">
                <p className="font-mono text-[10px] text-muted-foreground">DigiClip Setup · local-first, stays on this machine</p>
            </footer>
        </div>
    );
}

createRoot(document.getElementById('app')).render(<Boot />);
