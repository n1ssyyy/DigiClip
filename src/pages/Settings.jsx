import { useEffect, useState } from 'react';
import { Download, KeyRound, RefreshCw, RotateCcw } from 'lucide-react';
import shkollaIcon from '../assets/shkolla-icon.png';
import githubMark from '../assets/github.svg';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import ModelPicker from '../components/digiclip/ModelPicker';
import SttModelPicker from '../components/digiclip/SttModelPicker';
import { GpuToggle } from '../components/digiclip/controls';
import Tip from '../components/digiclip/Tooltip';
import { cn } from '../lib/utils';
import { deleteModel, downloadModel, saveSettings, useStore } from '../lib/socket';
import { checkForUpdates, downloadAndInstall, restartToUpdate, setAutoUpdate, updateProgress, useUpdates } from '../lib/updates';
import ProgressRing from '../components/digiclip/ProgressRing';

function Field({ label, aside, hint, children }) {
    return (
        <label className="block space-y-1.5">
            <span className="flex items-center gap-2 text-[13px] font-medium">{label}{aside}</span>
            {children}
            {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
        </label>
    );
}

function Section({ title, children, className }) {
    return (
        <section className={cn('space-y-3', className)}>
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{title}</p>
            {children}
        </section>
    );
}

const inputCls = 'flex h-9 w-full rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-3 py-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

/** GPU transcription row: switch + plain-language state. The device list
 *  comes from the backend detector (best first); with several GPUs the
 *  strongest transcribes. No GPU → switch disabled, reason in a tooltip. */
function GpuRow({ gpu, checked, onChange }) {
    const available = !!gpu?.available;
    const reason = gpu?.reason ?? 'No compatible GPU detected — CPU transcription only';
    const best = gpu?.best;
    const count = gpu?.devices?.length ?? 0;
    const mem = best?.memory_mb ? ` · ${best.memory_mb >= 1024 ? `${(best.memory_mb / 1024).toFixed(0)}GB` : `${best.memory_mb}MB`}` : '';
    const hint = !available
        ? reason
        : checked
            ? `Using ${best?.name ?? 'GPU'}${mem}${count > 1 ? ` — fastest of ${count} GPUs` : ''}. Turn off for CPU.`
            : 'Using CPU. Turn on for faster transcription.';

    return (
        <div className="flex items-center gap-3">
            <Tip label={available ? null : reason}>
                <GpuToggle checked={checked && available} disabled={!available} onChange={onChange} label="GPU transcription" />
            </Tip>
            <div className="min-w-0">
                <p className="text-[13px] font-medium">GPU transcription</p>
                <p className="text-[11px] text-muted-foreground">{hint}</p>
            </div>
        </div>
    );
}

/** App updates row: auto-check switch + status line + the action for
 *  whatever phase the updater is in (check / download / restart). */
function UpdatesRow() {
    const phase = useUpdates((s) => s.phase);
    const current = useUpdates((s) => s.current);
    const available = useUpdates((s) => s.available);
    const auto = useUpdates((s) => s.auto);
    const error = useUpdates((s) => s.error);
    const [working, setWorking] = useState(false);
    const pct = updateProgress();

    async function run(fn) {
        if (working) return;
        setWorking(true);
        try {
            await fn();
        } catch {
        } finally {
            setWorking(false);
        }
    }

    const status = (() => {
        switch (phase) {
            case 'checking':
                return 'Checking for updates…';
            case 'uptodate':
                return current ? `You're on the latest — v${current}.` : 'You’re on the latest.';
            case 'available':
                return available ? `v${available.version} is out${current ? ` — you're on v${current}` : ''}.` : 'A newer build is out.';
            case 'downloading':
                return `Downloading v${available?.version ?? ''}… ${pct !== null ? `${pct}%` : ''}`;
            case 'installing':
                return 'Installing… hang tight.';
            case 'ready':
                return `v${available?.version ?? ''} installed — restart to finish.`;
            case 'error':
                return error ? `Couldn't check: ${error}` : 'Update check failed.';
            case 'unsupported':
                return 'Updates need the desktop app, not the browser.';
            default:
                return 'Never checked this session.';
        }
    })();

    return (
        <div className="space-y-2.5">
            <div className="flex items-center gap-3">
                <GpuToggle checked={auto} onChange={setAutoUpdate} label="Check for updates on launch" />
                <div className="min-w-0">
                    <p className="text-[13px] font-medium">App updates</p>
                    <p className="text-[11px] text-muted-foreground">{auto ? 'Checked on launch, installed on your call.' : 'Automatic checks off — check by hand.'}</p>
                </div>
                {current && (
                    <Badge variant="secondary" className="ml-auto font-mono text-[10px] text-muted-foreground">
                        v{current}
                    </Badge>
                )}
            </div>
            <div className="flex items-center gap-2">
                {(phase === 'downloading' || phase === 'installing') && pct !== null && phase === 'downloading' ? (
                    <ProgressRing value={pct} size={16} label="Update download" />
                ) : null}
                <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={status}>{status}</p>
                {(phase === 'idle' || phase === 'uptodate' || phase === 'error') && (
                    <Button type="button" variant="secondary" size="sm" disabled={working} onClick={() => run(() => checkForUpdates())}>
                        <RefreshCw className="size-3.5" aria-hidden />
                        {working ? 'Checking…' : 'Check now'}
                    </Button>
                )}
                {phase === 'available' && (
                    <Button type="button" size="sm" disabled={working} onClick={() => run(downloadAndInstall)}>
                        <Download className="size-3.5" aria-hidden />
                        {working ? 'Starting…' : `Update to v${available?.version ?? ''}`}
                    </Button>
                )}
                {phase === 'ready' && (
                    <Button type="button" size="sm" onClick={() => restartToUpdate().catch(() => {})}>
                        <RotateCcw className="size-3.5" aria-hidden />
                        Restart now
                    </Button>
                )}
            </div>
        </div>
    );
}

export default function Settings() {
    const settings = useStore((s) => s.settings);
    const health = useStore((s) => s.health);
    const liveModels = useStore((s) => s.models);
    const [saving, setSaving] = useState(false);
    // Hovering the header or the form lights both borders together so the
    // pair reads as one unit without touching.
    const [hot, setHot] = useState(false);
    const [form, setForm] = useState(null);

    // Form follows the last saved settings (same settle behavior as the
    // baseline below: a saved form rests at Saved on its own).
    useEffect(() => {
        if (!settings) return;
        setForm((prev) => prev ?? {
            openrouter_key: '',
            openrouter_model: settings.openrouter_model ?? '',
            stt_model: settings.stt_model,
            gpu: !!settings.gpu,
            clips_count: settings.clips_count,
            caption_default: settings.caption_default,
            tighten: settings.tighten,
            punch: !!settings.punch,
        });
    }, [settings]);
    if (!settings || !form) return null;
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });

    // Live model disk/download state arrives over the socket (download
    // progress streams even with the dropdown closed); no polling.
    const modelStatus = {};
    const modelOptions = {};
    const modelDownloaded = {};
    for (const [id, m] of Object.entries(liveModels ?? {})) {
        modelOptions[id] = { size_mb: m.size_mb };
        modelDownloaded[id] = !!m.downloaded;
        modelStatus[id] = {
            downloaded: !!m.downloaded,
            downloading: !!m.downloading,
            progress: m.progress ?? 0,
            failed: !!m.error,
            error: m.error,
        };
    }

    const sttLive = modelStatus?.[form.stt_model];
    const sttState = sttLive
        ? (sttLive.downloaded ? 'ready' : sttLive.downloading ? 'downloading' : sttLive.failed ? 'failed' : 'missing')
        : 'missing';
    const sttHint = sttState === 'ready'
        ? 'On disk, ready to transcribe.'
        : sttState === 'downloading'
            ? `Downloading… ${sttLive?.progress ?? 0}% — keeps going in the background.`
            : sttState === 'failed'
                ? 'Download failed — pick the model again to retry.'
                : 'Not on disk yet — pick it to download in the background.';

    // One word, only alive when something actually changed. Baseline
    // re-derives from saved settings, so a saved form settles itself.
    const baseline = {
        openrouter_key: '',
        openrouter_model: settings.openrouter_model ?? '',
        stt_model: settings.stt_model,
        gpu: !!settings.gpu,
        clips_count: settings.clips_count,
        caption_default: settings.caption_default,
        tighten: settings.tighten,
        punch: !!settings.punch,
    };
    const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
    const saveLabel = saving ? 'Saving…' : dirty ? 'Save' : 'Saved';

    function save(e) {
        e.preventDefault();
        if (saving || !dirty) return;
        setSaving(true);
        saveSettings({ ...form }).then(() => {
            // Blank key keeps the saved one (server-side); reset the field
            // so the baseline comparison settles back to Saved.
            setForm((prev) => (prev ? { ...prev, openrouter_key: '' } : prev));
        }).catch(() => {}).finally(() => setSaving(false));
    }

    // Settings header stays its own panel; the stub in the gap below
    // points at the form so the two read as a pair without touching.
    // h-10 keeps all headers the same thickness.
    return (
        <div className="flex h-[calc(100dvh_-_var(--chrome)_-_5px)] min-h-[480px] flex-col gap-[5px]">
            <Card
                className={cn('relative shrink-0 transition-colors', hot && 'border-t-white/25 border-x-white/[0.13]')}
                onMouseEnter={() => setHot(true)}
                onMouseLeave={() => setHot(false)}
            >
                <span aria-hidden className="absolute top-full left-6 h-[5px] w-px bg-border" />
                <CardHeader className="h-10 justify-center px-4 py-0">
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-[13px]">Settings</CardTitle>
                        {health?.version && (
                            <Badge variant="secondary" className="font-mono text-[10px] text-muted-foreground">
                                v{health.version}
                            </Badge>
                        )}
                    </div>
                </CardHeader>
            </Card>
            <Card
                className={cn('stagger-1 flex min-h-0 flex-1 flex-col overflow-hidden transition-colors', hot && 'border-t-white/25 border-x-white/[0.13]')}
                onMouseEnter={() => setHot(true)}
                onMouseLeave={() => setHot(false)}
            >
                <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-4">
                    <div className="mx-auto my-auto w-full max-w-3xl space-y-5">
                    <form id="settings-form" className="space-y-5" onSubmit={save}>
                        <Section title="Connection" className="stagger-2">
                            <Field
                                label="OpenRouter API key"
                                aside={settings.key_set
                                    ? <Badge variant="success" className="text-[10px]">set</Badge>
                                    : <Badge variant="secondary" className="text-[10px]">not set</Badge>}
                                hint={settings.key_set ? 'Saved. Blank keeps it.' : 'No key, clips use heuristics.'}
                            >
                                <div className="relative">
                                    <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                    <input type="password" name="openrouter_key" autoComplete="off" placeholder={settings.key_set ? '•••••••• (unchanged)' : 'sk-or-…'}
                                        value={form.openrouter_key} onChange={set('openrouter_key')} className={cn(inputCls, 'pl-9')} />
                                </div>
                            </Field>
                        </Section>
                        <Section title="Models" className="stagger-3">
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Clip model">
                                    <ModelPicker
                                        value={form.openrouter_model}
                                        onChange={(id) => setForm({ ...form, openrouter_model: id })}
                                    />
                                </Field>
                                <Field
                                    label="Transcription model"
                                    hint={sttHint}
                                >
                                    <SttModelPicker
                                        value={form.stt_model}
                                        onChange={(id) => setForm({ ...form, stt_model: id })}
                                        options={modelOptions}
                                        downloaded={modelDownloaded}
                                        status={modelStatus}
                                        onDownload={downloadModel}
                                        onDelete={deleteModel}
                                    />
                                </Field>
                            </div>
                            <GpuRow
                                gpu={health ? { available: health.gpu_available, reason: health.gpu_reason } : null}
                                checked={form.gpu}
                                onChange={(v) => setForm({ ...form, gpu: v })}
                            />
                        </Section>
                    </form>
                    <Section title="Updates" className="stagger-4">
                        <UpdatesRow />
                    </Section>
                    <Section title="About" className="stagger-4">
                        <div className="space-y-2 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-muted/40 px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <span className="text-[13px] text-muted-foreground">
                                    Developed by{' '}
                                    <a
                                        href="https://github.com/n1ssyyy"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-semibold text-foreground"
                                    >
                                        n1ssyyy
                                    </a>
                                    {' '}in collaboration with{' '}
                                    <a
                                        href="https://shkolladigjitale.com/"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-semibold text-foreground"
                                    >
                                        Shkolla Digjitale
                                    </a>
                                </span>
                                <span className="ml-auto flex items-center gap-2">
                                    <Tip label="Shkolla Digjitale Prizren" side="top">
                                        <a
                                            href="https://shkolladigjitale.com/"
                                            target="_blank"
                                            rel="noreferrer"
                                            aria-label="Shkolla Digjitale Prizren"
                                            className="group inline-flex size-8 items-center justify-center rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] transition-colors hover:bg-white"
                                        >
                                            <img src={shkollaIcon} alt="" className="size-5 brightness-0 invert transition-[filter] group-hover:brightness-100 group-hover:invert-0" />
                                        </a>
                                    </Tip>
                                    <Tip label="DigiClip on GitHub" side="top">
                                        <a
                                            href="https://github.com/n1ssyyy/DigiClip"
                                            target="_blank"
                                            rel="noreferrer"
                                            aria-label="DigiClip on GitHub"
                                            className="group inline-flex size-8 items-center justify-center rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] transition-colors hover:bg-white"
                                        >
                                            <img src={githubMark} alt="" className="size-4 transition-[filter] group-hover:brightness-0" />
                                        </a>
                                    </Tip>
                                </span>
                            </div>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <p className="text-[11px] text-muted-foreground">Reviewed by Kebir Çesko and Arianit Tërshnjaku.</p>
                                <p className="font-mono text-[10px] text-muted-foreground">Local-first · stays on this machine.</p>
                                </div>
                            </div>
                        </Section>
                    </div>
                </CardContent>
                <div className="shrink-0 px-4 pb-3">
                    <div aria-hidden className="border-t border-border" />
                    <div className="flex items-center justify-between gap-2 pt-3">
                        <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('digiclip:tour'))}
                            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                            Take the tour again
                        </button>
                        <Button type="submit" form="settings-form" disabled={saving || !dirty}>
                            <span key={saveLabel} className="skel-fade-in block">
                                {saveLabel}
                            </span>
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
