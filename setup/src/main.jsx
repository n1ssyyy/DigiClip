import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ArrowDownToLine,
    CheckCircle2,
    Clapperboard,
    FolderOpen,
    Loader2,
    RefreshCw,
    RotateCcw,
    Trash2,
    Wrench,
    X,
    XCircle,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import './app.css';
import { Button, ProgressRing } from './ui';
import {
    appRunning,
    closeSetup,
    cmpVersions,
    detect,
    dragWindow,
    fetchLatest,
    installApp,
    launchApp,
    onDownloadProgress,
    openExternal,
    stopApp,
    uninstallApp,
} from './lib';

/**
 * DigiClip Setup: the custom installer, from scratch. Detects this
 * machine (registry + process state) and offers exactly what fits:
 * Install / Update / Reinstall / Repair / Uninstall. File work
 * (download, extract, register, shortcuts) happens in the Rust shell.
 */

const RELEASES_URL = 'https://github.com/n1ssyyy/DigiClip/releases';

function Titlebar() {
    return (
        <header
            className="flex h-11 shrink-0 items-center gap-2 pr-2 pl-4 select-none"
            data-tauri-drag-region
            onMouseDown={(e) => {
                // Declarative drag region + native fallback: on some
                // webview builds the attribute alone doesn't grab, and the
                // wizard would be stuck in one spot.
                if (e.button !== 0) return;
                if (e.target.closest('button, a, [data-no-drag]')) return;
                dragWindow();
            }}
            onDoubleClick={(e) => {
                if (e.target.closest('button, a, [data-no-drag]')) return;
                closeSetup();
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

function Glyph({ children, tone = 'default' }) {
    return (
        <div className="pop flex size-16 items-center justify-center rounded-2xl border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]">
            <div className={tone === 'viral' ? 'text-[var(--viral)]' : tone === 'danger' ? 'text-destructive' : 'text-foreground'}>
                {children}
            </div>
        </div>
    );
}

function InstallLocation({ dir, label, onChange }) {
    return (
        <div className="rise flex w-full max-w-sm items-center gap-2 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-muted-foreground" title={dir}>
                {label ?? dir}
            </p>
            <button
                type="button"
                onClick={async () => {
                    const sel = await open({ directory: true, multiple: false, defaultPath: dir }).catch(() => null);
                    if (typeof sel === 'string') onChange(sel);
                }}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
                <FolderOpen className="size-3.5" aria-hidden />
                Change
            </button>
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
    const [s, setS] = useState({
        phase: 'boot',
        detect: null,
        latest: null,
        error: null,
        work: null,
        done: null,
        pending: null,
        dir: null,
    });
    const stateRef = useRef(s);
    stateRef.current = s;
    const patch = useCallback((p) => setS((prev) => ({ ...prev, ...p })), []);

    const refresh = useCallback(async () => {
        patch({ phase: 'boot', error: null, pending: null });
        const d = await detect().catch(() => null);
        if (!d) {
            patch({ phase: 'error', error: 'Setup could not inspect this machine.' });
            return;
        }
        patch({ detect: d, dir: d.installDir });
        const latest = await fetchLatest().catch(() => null);
        if (!latest) {
            patch({ phase: 'offline' });
            return;
        }
        patch({ latest });
        if (!d.installed) {
            patch({ phase: 'install' });
        } else {
            patch({ phase: cmpVersions(latest.version, d.version) > 0 ? 'update' : 'current' });
        }
    }, [patch]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        let off = null;
        onDownloadProgress(({ done, total }) => {
            const st = stateRef.current;
            if (st.phase !== 'working' || st.work?.kind !== 'download') return;
            const pct = total > 0 ? Math.min(99, Math.round((done / total) * 100)) : null;
            patch({ work: { ...st.work, pct } });
        })
            .then((f) => {
                off = f;
            })
            .catch(() => {});
        return () => off?.();
    }, [patch]);

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

    async function runInstall(version, kind, title) {
        const dir = stateRef.current.dir || stateRef.current.detect?.installDir;
        try {
            patch({ phase: 'working', work: { kind: 'download', title: `Downloading DigiClip v${version}…`, pct: null } });
            const res = await installApp(dir, version);
            patch({
                phase: 'done',
                done: { kind, version: res.version, installDir: res.installDir },
                detect: { ...stateRef.current.detect, installed: true, version: res.version, installDir: res.installDir },
            });
        } catch (e) {
            patch({ phase: 'error', error: e?.message ?? String(e) });
        }
    }

    async function withStoppedApp(fn) {
        try {
            if (await appRunning().catch(() => false)) {
                patch({ phase: 'confirm-close' });
                return false;
            }
            await fn();
            return true;
        } catch (e) {
            patch({ phase: 'error', error: e?.message ?? String(e) });
            return false;
        }
    }

    const startInstall = () =>
        withStoppedApp(() => runInstall(stateRef.current.latest?.version, 'installed', 'Installing DigiClip…'));
    const startUpdate = () =>
        withStoppedApp(() => runInstall(stateRef.current.latest?.version, 'updated', 'Updating DigiClip…'));
    // Reinstall/repair both re-apply the current build: files are restored,
    // user data (clips, models, jobs) is never touched.
    const startReinstall = () => withStoppedApp(() => runInstall(stateRef.current.detect?.version, 'reinstalled', 'Reinstalling DigiClip…'));
    const startRepair = () => withStoppedApp(() => runInstall(stateRef.current.detect?.version, 'repaired', 'Repairing DigiClip…'));

    async function startUninstall() {
        try {
            patch({ phase: 'working', work: { kind: 'uninstall', title: 'Removing DigiClip…', pct: null } });
            await uninstallApp();
            patch({ phase: 'done', done: { kind: 'uninstalled' } });
        } catch (e) {
            patch({ phase: 'error', error: e?.message ?? String(e) });
        }
    }

    async function confirmCloseAndGo() {
        const action = stateRef.current.pending;
        patch({ pending: null });
        await stopApp().catch(() => {});
        if (action === 'install') await startInstall();
        else if (action === 'update') await startUpdate();
        else if (action === 'reinstall') await startReinstall();
        else if (action === 'repair') await startRepair();
    }

    const { phase, detect: d, latest, error, work, done, dir } = s;
    const installedV = d?.version;

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
                    <Glyph>
                        <Clapperboard className="size-7" aria-hidden />
                    </Glyph>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">Install DigiClip</h1>
                        <p className="font-mono text-[11px] text-muted-foreground">v{latest?.version} · drop a video, get TikTok-ready clips</p>
                    </div>
                    <InstallLocation dir={dir} label={d?.locationLabel} onChange={(v) => patch({ dir: v })} />
                    <Button onClick={startInstall}>
                        <ArrowDownToLine className="size-4" aria-hidden />
                        Install now
                    </Button>
                </Center>
            )}
            {phase === 'update' && (
                <Center>
                    <Glyph tone="viral">
                        <ArrowDownToLine className="size-7" aria-hidden />
                    </Glyph>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">Update available</h1>
                        <p className="font-mono text-[11px] text-muted-foreground">v{installedV} → v{latest?.version}</p>
                    </div>
                    <Button onClick={startUpdate}>Update to v{latest?.version}</Button>
                    <ManageRow onReinstall={startReinstall} onRepair={startRepair} onUninstall={() => patch({ phase: 'confirm-uninstall' })} />
                </Center>
            )}
            {phase === 'current' && (
                <Center>
                    <Glyph tone="viral">
                        <CheckCircle2 className="size-7" aria-hidden />
                    </Glyph>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">You are up to date</h1>
                        <p className="font-mono text-[11px] text-muted-foreground">DigiClip v{installedV} is installed</p>
                    </div>
                    <ManageRow onReinstall={startReinstall} onRepair={startRepair} onUninstall={() => patch({ phase: 'confirm-uninstall' })} />
                </Center>
            )}
            {phase === 'offline' && (
                <Center>
                    <Glyph>
                        <XCircle className="size-7 text-destructive" aria-hidden />
                    </Glyph>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">Cannot reach the releases page</h1>
                        <p className="font-mono text-[11px] text-muted-foreground">Check your connection, then try again.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={refresh}>
                            <RefreshCw className="size-3.5" aria-hidden />
                            Retry
                        </Button>
                        {d?.installed && <Button variant="ghost" onClick={() => patch({ phase: 'confirm-uninstall' })}>Uninstall…</Button>}
                    </div>
                </Center>
            )}
            {phase === 'confirm-uninstall' && (
                <Center>
                    <Glyph tone="danger">
                        <Trash2 className="size-7" aria-hidden />
                    </Glyph>
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
                    <Glyph>
                        <Loader2 className="size-7 text-muted-foreground" aria-hidden />
                    </Glyph>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">DigiClip is running</h1>
                        <p className="font-mono text-[11px] text-muted-foreground">It must close so its files can be replaced.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => { patch({ pending: null }); refresh(); }}>Cancel</Button>
                        <Button onClick={confirmCloseAndGo}>Close DigiClip and continue</Button>
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
                        {work.kind !== 'download' && <div className="indet h-1.5 rounded-full" aria-hidden />}
                    </div>
                </Center>
            )}
            {phase === 'done' && done && (
                <Center>
                    <Glyph tone="viral">
                        <CheckCircle2 className="size-7" aria-hidden />
                    </Glyph>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">
                            {done.kind === 'uninstalled' && 'DigiClip removed'}
                            {done.kind === 'installed' && `DigiClip v${done.version} installed`}
                            {done.kind === 'updated' && `Updated to v${done.version}`}
                            {done.kind === 'reinstalled' && `DigiClip v${done.version} reinstalled`}
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
                                <Button onClick={() => { launchApp(done.installDir ?? d?.installDir); closeSetup(); }}>Launch DigiClip</Button>
                            </>
                        )}
                    </div>
                </Center>
            )}
            {phase === 'error' && (
                <Center>
                    <Glyph tone="danger">
                        <XCircle className="size-7" aria-hidden />
                    </Glyph>
                    <div className="rise space-y-1">
                        <h1 className="text-[17px] font-semibold tracking-tight">Something went wrong</h1>
                        <p className="max-w-96 font-mono text-[11px] break-words text-muted-foreground">{error ?? 'Unknown error.'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={refresh}>Back to start</Button>
                        <a className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" href={RELEASES_URL}>
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
