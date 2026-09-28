import { useEffect, useState } from 'react';
import { ChevronDown, Download, FolderOpen, KeyRound, Loader2, RefreshCw, Trash2, X } from 'lucide-react';
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
import { isTauri, pickFolder } from '../lib/native';
import { LANGUAGES, setLang, useLang, useT } from '../lib/i18n';
import { deleteModel, downloadModel, saveSettings, useStore } from '../lib/socket';
import { checkForUpdates, ensureAppVersion, runSetup, setAutoUpdate, useUpdates } from '../lib/updates';

/** `as="div"` for groups of buttons: a label would forward clicks on its
 *  caption to the first button. */
function Field({ label, aside, hint, children, as: Tag = 'label' }) {
    return (
        <Tag className="block space-y-1.5">
            <span className="flex items-center gap-2 text-[13px] font-medium">{label}{aside}</span>
            {children}
            {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
        </Tag>
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

/** Spoken languages offered for transcription (whisper codes). Auto
 *  detects per video; the rest pin it, which is faster and never guesses
 *  wrong on a short intro. Albanian/Serbian first after English: that's
 *  who uses this most. */
const LANGS = [
    ['auto', 'Auto-detect'], ['en', 'English'], ['sq', 'Albanian'], ['sr', 'Serbian'],
    ['hr', 'Croatian'], ['bs', 'Bosnian'], ['mk', 'Macedonian'], ['tr', 'Turkish'],
    ['de', 'German'], ['fr', 'French'], ['it', 'Italian'], ['es', 'Spanish'],
    ['pt', 'Portuguese'], ['nl', 'Dutch'], ['pl', 'Polish'], ['el', 'Greek'],
    ['ru', 'Russian'], ['uk', 'Ukrainian'], ['ar', 'Arabic'], ['hi', 'Hindi'],
    ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'],
];

/** Transcription language: native select in the input look (keyboard and
 *  screen readers for free; the list is too long for a segmented row). */
function LangSelect({ value, onChange }) {
    const t = useT();
    return (
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={cn(inputCls, 'appearance-none pr-9 [color-scheme:dark]')}
            >
                {LANGS.map(([id, name]) => <option key={id} value={id}>{t(name)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        </div>
    );
}

/** UI language: applies at once and is kept on this machine (the
 *  engine never sees it). Names are shown in their own language. */
function UiLangSelect() {
    const lang = useLang();
    const t = useT();
    return (
        <div className="relative">
            <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                aria-label={t('App language')}
                className={cn(inputCls, 'appearance-none pr-9 [color-scheme:dark]')}
            >
                {LANGUAGES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        </div>
    );
}

/** GPU transcription row: switch + plain-language state. The device list
 *  comes from the backend detector (best first); with several GPUs the
 *  strongest transcribes. No GPU → switch disabled, reason in a tooltip. */
function GpuRow({ gpu, checked, onChange }) {
    const t = useT();
    const available = !!gpu?.available;
    const reason = gpu?.reason ?? t('No compatible GPU detected — CPU transcription only');
    const best = gpu?.best;
    const count = gpu?.devices?.length ?? 0;
    const mem = best?.memory_mb ? ` · ${best.memory_mb >= 1024 ? `${(best.memory_mb / 1024).toFixed(0)}GB` : `${best.memory_mb}MB`}` : '';
    const hint = !available
        ? reason
        : checked
            ? (count > 1
                ? t('Using {name}{mem} — fastest of {count} GPUs. Turn off for CPU.', { name: best?.name ?? 'GPU', mem, count })
                : t('Using {name}{mem}. Turn off for CPU.', { name: best?.name ?? 'GPU', mem }))
            : t('Using CPU. Turn on for faster transcription.');

    return (
        <div className="flex items-center gap-3">
            <Tip label={available ? null : reason}>
                <GpuToggle checked={checked && available} disabled={!available} onChange={onChange} label={t('GPU transcription')} />
            </Tip>
            <div className="min-w-0">
                <p className="text-[13px] font-medium">{t('GPU transcription')}</p>
                <p className="text-[11px] text-muted-foreground">{hint}</p>
            </div>
        </div>
    );
}

const DECIDERS = [
    { id: 'auto', label: 'Auto', hint: 'Jev when a key is set, else Laya when downloaded and the talk is English, else off.' },
    { id: 'jev', label: 'Jev', hint: 'TypeSafe\u2019s hosted Jev re-judges every pick. Needs a Jev key.' },
    { id: 'laya', label: 'Laya', hint: 'Local Laya on the CPU, English talks only. Downloads ~1.6 GB on first use.' },
    { id: 'off', label: 'Off', hint: 'Keep the clip model\u2019s picks as they are.' },
];

/** Clip judge picker: the same segmented look as the job options. */
function DeciderSeg({ value, onChange }) {
    const t = useT();
    return (
        <div className="flex h-9 w-full overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]" role="radiogroup" aria-label={t('Clip judge')}>
            {DECIDERS.map((o) => (
                <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={value === o.id}
                    onClick={() => onChange(o.id)}
                    className={cn(
                        'flex min-w-0 flex-1 items-center justify-center text-[12px] transition-colors hover:bg-accent hover:text-foreground',
                        value === o.id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground',
                    )}
                >
                    {t(o.label)}
                </button>
            ))}
        </div>
    );
}

/** Laya's local bundle: size, live download progress, fetch or remove. */
function LayaRow({ model }) {
    const t = useT();
    const size = model?.size_mb ? `${(model.size_mb / 1024).toFixed(1)} GB` : '~1.6 GB';
    const state = !model ? 'missing'
        : model.downloaded ? 'ready'
            : model.downloading ? 'downloading'
                : model.error ? 'failed' : 'missing';
    const text = state === 'ready'
        ? t('On disk ({size}), ready to judge.', { size })
        : state === 'downloading'
            ? t('Downloading\u2026 {pct}% \u2014 keeps going in the background.', { pct: model.progress ?? 0 })
            : state === 'failed'
                ? t('Download failed: {error}', { error: model.error })
                : t('Not on disk. {size}, downloaded once.', { size });
    return (
        <div className="flex items-center gap-3 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-muted/40 px-3 py-2">
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{t('Laya model')}</p>
                <p className="truncate text-[11px] text-muted-foreground" title={text}>{text}</p>
                {state === 'downloading' && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-primary transition-[width]" style={{ width: `${model.progress ?? 0}%` }} />
                    </div>
                )}
            </div>
            {state === 'ready' ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => deleteModel('laya')}>
                    <Trash2 className="size-3.5" aria-hidden />
                    {t('Remove')}
                </Button>
            ) : (
                <Button type="button" variant="secondary" size="sm" disabled={state === 'downloading'} onClick={() => downloadModel('laya')}>
                    {state === 'downloading' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
                    {state === 'failed' ? t('Retry') : t('Download')}
                </Button>
            )}
        </div>
    );
}

/** Which saved options the watch folder runs with: a preset, or the
 *  engine defaults. Matched by value, so renaming a preset is harmless. */
function watchPick(options, presets) {
    const cur = JSON.stringify(options ?? {});
    const hit = presets.find((p) => JSON.stringify(p.options) === cur);
    if (hit) return hit.name;
    return Object.values(options ?? {}).every((v) => v == null) ? '' : '__custom';
}

/** App updates row: auto-check switch + status line + the action for
 *  whatever phase the updater is in (check / hand off to Setup). */
function UpdatesRow() {
    const phase = useUpdates((s) => s.phase);
    const current = useUpdates((s) => s.current);
    const available = useUpdates((s) => s.available);
    const auto = useUpdates((s) => s.auto);
    const error = useUpdates((s) => s.error);
    const pct = useUpdates((s) => s.pct);
    const [working, setWorking] = useState(false);
    const t = useT();

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
                return t('Checking for updates…');
            case 'uptodate':
                return current ? t("You're on the latest — v{version}.", { version: current }) : t('You’re on the latest.');
            case 'available':
                return available
                    ? (current
                        ? t("v{version} is out — you're on v{current}.", { version: available.version, current })
                        : t('v{version} is out.', { version: available.version }))
                    : t('A newer build is out.');
            case 'downloading':
                return t('Downloading DigiClip Setup… {pct}%', { pct: pct ?? 0 });
            case 'handing-off':
                return t('Opening DigiClip Setup…');
            case 'error':
                return error ? t("Couldn't check: {error}", { error }) : t('Update check failed.');
            case 'unsupported':
                return t('Updates need the desktop app, not the browser.');
            default:
                return t('Never checked this session.');
        }
    })();

    return (
        <div className="space-y-2.5">
            <div className="flex items-center gap-3">
                <GpuToggle checked={auto} onChange={setAutoUpdate} label={t('Check for updates on launch')} />
                <div className="min-w-0">
                    <p className="text-[13px] font-medium">{t('App updates')}</p>
                    <p className="text-[11px] text-muted-foreground">{auto ? t('Checked on launch, installed on your call.') : t('Automatic checks off — check by hand.')}</p>
                </div>
                {current && (
                    <Badge variant="secondary" className="ml-auto font-mono text-[10px] text-muted-foreground">
                        v{current}
                    </Badge>
                )}
            </div>
            <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={status}>{status}</p>
                {(phase === 'idle' || phase === 'uptodate' || phase === 'error') && (
                    <Button type="button" variant="secondary" size="sm" disabled={working} onClick={() => run(() => checkForUpdates())}>
                        <RefreshCw className="size-3.5" aria-hidden />
                        {working ? t('Checking…') : t('Check now')}
                    </Button>
                )}
                {phase === 'available' && (
                    <Button type="button" size="sm" disabled={working} onClick={() => run(runSetup)}>
                        <Download className="size-3.5" aria-hidden />
                        {working ? t('Starting…') : t('Update to v{version}', { version: available?.version ?? '' })}
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
    const appVersion = useUpdates((s) => s.appVersion);
    const [saving, setSaving] = useState(false);
    const t = useT();
    // Header badge is the APP version (shell), never the engine version
    // from health — the two diverge (engine 2.0.1 vs app 2.2.x).
    useEffect(() => {
        ensureAppVersion().catch(() => {});
    }, []);
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
            stt_lang: settings.stt_lang ?? 'en',
            gpu: !!settings.gpu,
            clips_count: settings.clips_count,
            caption_default: settings.caption_default,
            tighten: settings.tighten,
            punch: !!settings.punch,
            jev_key: '',
            decider: settings.decider ?? 'auto',
            watch_on: !!settings.watch_on,
            watch_dir: settings.watch_dir ?? '',
            watch_options: settings.watch_options ?? {},
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
        if (m.kind && m.kind !== 'stt') continue;
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
        ? t('On disk, ready to transcribe.')
        : sttState === 'downloading'
            ? t('Downloading… {pct}% — keeps going in the background.', { pct: sttLive?.progress ?? 0 })
            : sttState === 'failed'
                ? t('Download failed — pick the model again to retry.')
                : t('Not on disk yet — pick it to download in the background.');

    const langName = t(LANGS.find(([id]) => id === form.stt_lang)?.[1] ?? form.stt_lang);
    const langHint = form.stt_model?.endsWith('.en') && form.stt_lang !== 'en'
        ? (form.stt_lang === 'auto'
            ? t('{model} is English-only — pick a large-v3 model to transcribe other languages.', { model: form.stt_model })
            : t('{model} is English-only — pick a large-v3 model to transcribe {lang}.', { model: form.stt_model, lang: langName }))
        : form.stt_lang === 'auto'
            ? t('Detected per video. Pin it when you know it: faster, never guesses wrong.')
            : t('Videos are transcribed as {lang}.', { lang: langName });

    // One word, only alive when something actually changed. Baseline
    // re-derives from saved settings, so a saved form settles itself.
    const baseline = {
        openrouter_key: '',
        openrouter_model: settings.openrouter_model ?? '',
        stt_model: settings.stt_model,
        stt_lang: settings.stt_lang ?? 'en',
        gpu: !!settings.gpu,
        clips_count: settings.clips_count,
        caption_default: settings.caption_default,
        tighten: settings.tighten,
        punch: !!settings.punch,
        jev_key: '',
        decider: settings.decider ?? 'auto',
        watch_on: !!settings.watch_on,
        watch_dir: settings.watch_dir ?? '',
        watch_options: settings.watch_options ?? {},
    };
    const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
    const saveLabel = saving ? t('Saving…') : dirty ? t('Save') : t('Saved');

    function clearJevKey() {
        saveSettings({ jev_key: null }).catch(() => {});
    }
    const presets = settings.presets ?? [];
    const watchSel = watchPick(form.watch_options, presets);
    function browseWatch() {
        pickFolder().then((d) => { if (d) setForm((f) => ({ ...f, watch_dir: d })); }).catch(() => {});
    }
    const deciderHint = t(DECIDERS.find((d) => d.id === form.decider)?.hint ?? '');
    const jevMissing = form.decider === 'jev' && !settings.jev_key_set && !form.jev_key.trim();

    function save(e) {
        e.preventDefault();
        if (saving || !dirty) return;
        setSaving(true);
        // An empty folder clears it (a blank string is ignored).
        saveSettings({ ...form, watch_dir: form.watch_dir.trim() || null }).then(() => {
            // Blank key keeps the saved one (server-side); reset the field
            // so the baseline comparison settles back to Saved.
            setForm((prev) => (prev ? { ...prev, openrouter_key: '', jev_key: '' } : prev));
        }).catch(() => {}).finally(() => setSaving(false));
    }

    // Settings header stays its own panel; the stub in the gap below
    // points at the form so the two read as a pair without touching.
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
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-[13px]">{t('Settings')}</CardTitle>
                        {appVersion && (
                            <Badge variant="secondary" className="font-mono text-[10px] text-muted-foreground">
                                v{appVersion}
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
                    <Section title={t('Language')} className="stagger-2">
                        <div className="grid grid-cols-2 gap-4">
                            <Field as="div" label={t('App language')} hint={t('Menus and messages. Applies right away.')}>
                                <UiLangSelect />
                            </Field>
                        </div>
                    </Section>
                    <form id="settings-form" className="space-y-5" onSubmit={save}>
                        <Section title={t('Connection')} className="stagger-2">
                            <Field
                                label={t('OpenRouter API key')}
                                aside={settings.key_set
                                    ? <Badge variant="success" className="text-[10px]">{t('set')}</Badge>
                                    : <Badge variant="secondary" className="text-[10px]">{t('not set')}</Badge>}
                                hint={settings.key_set ? t('Saved. Blank keeps it.') : t('No key, clips use heuristics.')}
                            >
                                <div className="relative">
                                    <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                    <input type="password" name="openrouter_key" autoComplete="off" placeholder={settings.key_set ? t('•••••••• (unchanged)') : 'sk-or-…'}
                                        value={form.openrouter_key} onChange={set('openrouter_key')} className={cn(inputCls, 'pl-9')} />
                                </div>
                            </Field>
                        </Section>
                        <Section title={t('Models')} className="stagger-3">
                            <div className="grid grid-cols-2 gap-4">
                                <Field label={t('Clip model')}>
                                    <ModelPicker
                                        value={form.openrouter_model}
                                        onChange={(id) => setForm({ ...form, openrouter_model: id })}
                                    />
                                </Field>
                                <Field
                                    label={t('Transcription model')}
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
                            <div className="grid grid-cols-2 items-start gap-4">
                                <Field label={t('Spoken language')} hint={langHint}>
                                    <LangSelect value={form.stt_lang} onChange={(v) => setForm({ ...form, stt_lang: v })} />
                                </Field>
                                <div className="pt-6">
                                    <GpuRow
                                        gpu={health ? { available: health.gpu_available, reason: health.gpu_reason } : null}
                                        checked={form.gpu}
                                        onChange={(v) => setForm({ ...form, gpu: v })}
                                    />
                                </div>
                            </div>
                        </Section>
                        <Section title={t('Clip judge (System One)')} className="stagger-3">
                            <Field as="div" label={t('Judge')} hint={jevMissing ? t('Jev needs a key below; without one picks stay as they are.') : deciderHint}>
                                <DeciderSeg value={form.decider} onChange={(v) => setForm({ ...form, decider: v })} />
                            </Field>
                            <div className="grid grid-cols-2 items-start gap-4">
                                <Field
                                    label={t('Jev API key')}
                                    aside={settings.jev_key_set
                                        ? <Badge variant="success" className="text-[10px]">{t('set')}</Badge>
                                        : <Badge variant="secondary" className="text-[10px]">{t('not set')}</Badge>}
                                    hint={settings.jev_key_set
                                        ? <>{t('Saved. Blank keeps it.')} <button type="button" onClick={clearJevKey} className="underline underline-offset-2 hover:text-foreground">{t('Remove key')}</button></>
                                        : t('From TypeSafe. Only needed for Jev.')}
                                >
                                    <div className="relative">
                                        <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                        <input type="password" name="jev_key" autoComplete="off" placeholder={settings.jev_key_set ? t('\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (unchanged)') : 'jev-\u2026'}
                                            value={form.jev_key} onChange={set('jev_key')} className={cn(inputCls, 'pl-9')} />
                                    </div>
                                </Field>
                                <div className="pt-6">
                                    <LayaRow model={liveModels?.laya} />
                                </div>
                            </div>
                        </Section>
                        <Section title={t('Watch folder')} className="stagger-3">
                            <div className="flex items-center gap-3">
                                <GpuToggle checked={form.watch_on} disabled={!form.watch_dir.trim()} onChange={(v) => setForm({ ...form, watch_on: v })} label={t('Watch a folder')} />
                                <div className="min-w-0">
                                    <p className="text-[13px] font-medium">{t('Clip new videos automatically')}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {!form.watch_dir.trim()
                                            ? t('Pick a folder first.')
                                            : form.watch_on
                                                ? t('Videos that land in the folder start a job once they finish copying. Files already there stay put.')
                                                : t('Off. Turn on to start a job for every new video in the folder.')}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 items-start gap-4">
                                <Field as="div" label={t('Folder')}>
                                    <div className="flex h-9 items-stretch gap-1">
                                        <button
                                            type="button"
                                            onClick={browseWatch}
                                            disabled={!isTauri()}
                                            title={form.watch_dir || undefined}
                                            className={cn(inputCls, 'items-center gap-2 text-left hover:bg-accent')}
                                        >
                                            <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                            <span className={cn('truncate', !form.watch_dir && 'text-muted-foreground')}>{form.watch_dir || t('Choose a folder\u2026')}</span>
                                        </button>
                                        {form.watch_dir && (
                                            <Tip label={t('Stop watching this folder')} side="top">
                                                <button type="button" aria-label={t('Clear folder')} onClick={() => setForm({ ...form, watch_dir: '', watch_on: false })} className="shrink-0 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                                                    <X className="size-4" aria-hidden />
                                                </button>
                                            </Tip>
                                        )}
                                    </div>
                                </Field>
                                <Field label={t('Options')} hint={presets.length ? t('Save presets from the job options panel on Home.') : t('No presets yet: save one from the job options panel on Home.')}>
                                    <div className="relative">
                                        <select
                                            value={watchSel}
                                            onChange={(e) => {
                                                const p = presets.find((x) => x.name === e.target.value);
                                                // Defaults = every field unset, shaped like the saved value so
                                                // the form settles back to Saved.
                                                const none = Object.fromEntries(Object.keys(settings.watch_options ?? {}).map((k) => [k, null]));
                                                setForm({ ...form, watch_options: p ? p.options : none });
                                            }}
                                            className={cn(inputCls, 'appearance-none pr-9 [color-scheme:dark]')}
                                        >
                                            <option value="">{t('Defaults (from these settings)')}</option>
                                            {presets.map((p) => <option key={p.name} value={p.name}>{t('Preset: {name}', { name: p.name })}</option>)}
                                            {watchSel === '__custom' && <option value="__custom" disabled>{t('Custom (preset since changed)')}</option>}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                    </div>
                                </Field>
                            </div>
                        </Section>
                    </form>
                    <Section title={t('Updates')} className="stagger-4">
                        <UpdatesRow />
                    </Section>
                    <Section title={t('About')} className="stagger-4">
                        <div className="space-y-2 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-muted/40 px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <span className="text-[13px] text-muted-foreground">
                                    {t('Developed by')}{' '}
                                    <a
                                        href="https://github.com/n1ssyyy"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-semibold text-foreground"
                                    >
                                        n1ssyyy
                                    </a>
                                    {' '}{t('in collaboration with')}{' '}
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
                                    <Tip label={t('DigiClip on GitHub')} side="top">
                                        <a
                                            href="https://github.com/n1ssyyy/DigiClip"
                                            target="_blank"
                                            rel="noreferrer"
                                            aria-label={t('DigiClip on GitHub')}
                                            className="group inline-flex size-8 items-center justify-center rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] transition-colors hover:bg-white"
                                        >
                                            <img src={githubMark} alt="" className="size-4 transition-[filter] group-hover:brightness-0" />
                                        </a>
                                    </Tip>
                                </span>
                            </div>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <p className="text-[11px] text-muted-foreground">{t('Reviewed by Kebir Çesko and Arianit Tërshnjaku.')}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">{t('Local-first · stays on this machine.')}</p>
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
                            {t('Take the tour again')}
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
