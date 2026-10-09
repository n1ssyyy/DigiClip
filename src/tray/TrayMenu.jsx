import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppWindow, Clapperboard, FolderOpen, FolderPlus, Power, Settings as SettingsIcon } from 'lucide-react';
import { GpuToggle } from '../components/digiclip/controls';
import { cn } from '../lib/utils';
import { saveSettings, useStore } from '../lib/socket';
import { syncLang, useT } from '../lib/i18n';
import {
    hideTrayMenu,
    onShellPrefs,
    onTrayOpen,
    openMain,
    quitApp,
    reveal,
    setAutostart,
    shellPrefs,
    trayMenuSize,
} from '../lib/native';

/** Pipeline stages a job walks through before its clips exist (same four
 *  steps as the queue stepper on Home). */
const STAGE = {
    downloading: [0, 'Downloading'],
    queued: [1, 'Queued'],
    extracting: [1, 'Extracting audio'],
    transcribing: [2, 'Transcribing'],
    analyzing: [3, 'Picking clips'],
};
const MAX_JOBS = 3;

/** What a job is doing right now, or null when it is at rest. */
export function jobActivity(job) {
    const stage = STAGE[job.status];
    if (stage) return { step: stage[0], label: stage[1] };
    if (job.status === 'clips_ready' || job.status === 'done') {
        const clips = job.clips ?? [];
        const busy = clips.filter((c) => c.render_status === 'pending' || c.render_status === 'rendering');
        if (busy.length) {
            const done = clips.filter((c) => c.render_status === 'done' || c.render_status === 'failed').length;
            return { render: { done, total: clips.length } };
        }
    }
    return null;
}

function Row({ icon: Icon, children, onClick, danger, disabled }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'flex h-8 w-full items-center gap-2.5 rounded-[5px] px-2.5 text-left text-[12px] transition-colors',
                'focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50',
                danger ? 'text-red-400 hover:bg-red-500/10' : 'hover:bg-accent',
            )}
        >
            <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{children}</span>
        </button>
    );
}

function Divider() {
    return <div className="mx-1 my-1 h-px bg-white/[0.07]" aria-hidden />;
}

function JobLine({ job }) {
    const t = useT();
    const a = jobActivity(job);
    const label = a.render
        ? t('Rendering clips {done}/{total}', { done: a.render.done, total: a.render.total })
        : t(a.label);
    return (
        <div className="px-2.5 py-1.5">
            <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px]" title={job.name}>{job.name}</span>
                <span className="shrink-0 text-[10px] text-orange-400">{label}</span>
            </div>
            {a.render ? (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                        className="h-full rounded-full bg-orange-500 transition-[width] duration-500"
                        style={{ width: `${Math.max(6, (a.render.done / Math.max(1, a.render.total)) * 100)}%` }}
                    />
                </div>
            ) : (
                <div className="mt-1.5 grid grid-cols-4 gap-1" aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                        <span
                            key={i}
                            className={cn(
                                'h-1 rounded-full',
                                i < a.step ? 'bg-orange-500' : i === a.step ? 'animate-pulse bg-orange-500/70' : 'bg-white/[0.06]',
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/** The tray menu: a small card by the tray icon, same materials as the
 *  app's dialogs. Its window is sized to this card and hidden on blur. */
export default function TrayMenu() {
    const t = useT();
    const conn = useStore((s) => s.conn);
    const jobs = useStore((s) => s.jobs);
    const settings = useStore((s) => s.settings);
    const [prefs, setPrefs] = useState(null);
    const [confirmQuit, setConfirmQuit] = useState(false);
    const [openKey, setOpenKey] = useState(0);
    const card = useRef(null);

    const active = jobs.filter((j) => jobActivity(j));
    const watchDir = settings?.watch_dir ?? '';
    const watchOn = !!settings?.watch_on && !!watchDir;
    const folderName = watchDir.split(/[\\/]/).filter(Boolean).pop() ?? watchDir;

    useEffect(() => {
        const refresh = () => shellPrefs().then(setPrefs);
        refresh();
        const offs = [
            onShellPrefs(refresh),
            onTrayOpen(() => {
                // Fresh open: replay the pop, drop a stale confirm, and
                // pick up anything changed while hidden.
                setConfirmQuit(false);
                setOpenKey((k) => k + 1);
                syncLang();
                refresh();
                card.current?.querySelector('button')?.focus({ preventScroll: true });
            }),
        ];
        const onKey = (e) => {
            if (e.key === 'Escape') hideTrayMenu();
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            offs.forEach((p) => p.then((off) => off()).catch(() => {}));
        };
    }, []);

    // The window follows the card's height (content changes with jobs).
    useLayoutEffect(() => {
        const el = card.current;
        if (!el) return undefined;
        const report = () => trayMenuSize(Math.ceil(el.getBoundingClientRect().height));
        report();
        const ro = new ResizeObserver(report);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    function go(page) {
        openMain(page);
    }

    function quit() {
        if (active.length && !confirmQuit) {
            setConfirmQuit(true);
            return;
        }
        quitApp();
    }

    const live = conn === 'live';
    return (
        <div ref={card} className="p-0">
            <div
                key={openKey}
                role="menu"
                aria-label="DigiClip"
                className="pop overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-1 text-foreground shadow-2xl select-none"
            >
                <div className="flex h-9 items-center gap-2 px-2.5">
                    <Clapperboard className="size-3.5" aria-hidden />
                    <span className="text-[13px] font-semibold tracking-tight">DigiClip</span>
                    <span className="flex-1" />
                    <span className={cn('size-1.5 rounded-full', live ? 'bg-foreground' : 'animate-pulse bg-orange-500')} aria-hidden />
                    <span className="text-[10px] text-muted-foreground">{live ? t('Engine running') : t('Reconnecting…')}</span>
                </div>
                <Divider />

                <p className="px-2.5 pt-1 pb-0.5 text-[10px] tracking-wider text-muted-foreground uppercase">{t('Now')}</p>
                {active.length === 0 ? (
                    <p className="px-2.5 pt-0.5 pb-2 text-[11px] text-muted-foreground">
                        {watchOn ? t('Idle — watching for new videos.') : t('Nothing running.')}
                    </p>
                ) : (
                    <>
                        {active.slice(0, MAX_JOBS).map((j) => <JobLine key={j.id} job={j} />)}
                        {active.length > MAX_JOBS && (
                            <button
                                type="button"
                                onClick={() => go('home')}
                                className="px-2.5 pb-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                            >
                                {t('+{count} more in the queue', { count: active.length - MAX_JOBS })}
                            </button>
                        )}
                    </>
                )}
                <Divider />

                {watchDir ? (
                    <div className="flex items-center gap-2.5 px-2.5 py-1.5">
                        <button
                            type="button"
                            onClick={() => reveal(watchDir)}
                            title={watchDir}
                            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[5px] text-left hover:text-foreground focus-visible:outline-none"
                        >
                            <FolderOpen className="size-3.5 shrink-0 opacity-80" aria-hidden />
                            <span className="min-w-0">
                                <span className="block text-[12px]">{t('Watch folder')}</span>
                                <span className="block truncate text-[10px] text-muted-foreground">
                                    {watchOn ? t('Watching {folder}', { folder: folderName }) : t('Paused — {folder}', { folder: folderName })}
                                </span>
                            </span>
                        </button>
                        <GpuToggle
                            checked={watchOn}
                            disabled={!live}
                            onChange={(v) => saveSettings({ watch_on: v }).catch(() => {})}
                            label={t('Watch a folder')}
                        />
                    </div>
                ) : (
                    <Row icon={FolderPlus} onClick={() => go('settings')}>{t('Set up a watch folder')}</Row>
                )}
                <Divider />

                <Row icon={AppWindow} onClick={() => go('home')}>{t('Open DigiClip')}</Row>
                <Row icon={SettingsIcon} onClick={() => go('settings')}>{t('Settings')}</Row>
                {prefs && (
                    <div className="flex h-8 items-center gap-2.5 px-2.5">
                        <span className="min-w-0 flex-1 truncate text-[12px]">{t('Start when I sign in')}</span>
                        <GpuToggle
                            checked={!!prefs.autostart}
                            onChange={(v) => setAutostart(v).then(setPrefs).catch(() => {})}
                            label={t('Start when I sign in')}
                        />
                    </div>
                )}
                <Divider />

                {confirmQuit ? (
                    <div className="px-2.5 py-1.5">
                        <p className="text-[11px] text-muted-foreground">
                            {t('{count} running — quitting stops them. Quit anyway?', { count: active.length })}
                        </p>
                        <div className="mt-2 flex justify-end gap-1.5">
                            <button
                                type="button"
                                onClick={() => setConfirmQuit(false)}
                                className="rounded-md px-3 py-1 text-[12px] hover:bg-accent"
                            >
                                {t('Cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={quit}
                                className="rounded-md bg-red-500/90 px-3 py-1 text-[12px] font-medium text-white hover:bg-red-500"
                            >
                                {t('Quit')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <Row icon={Power} danger onClick={quit}>{t('Quit DigiClip')}</Row>
                )}
            </div>
        </div>
    );
}
