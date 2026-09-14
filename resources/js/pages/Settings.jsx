import { useEffect, useState } from 'react';
import { router } from '@inertiajs/react';
import { ChevronDown, ChevronUp, KeyRound } from 'lucide-react';
import shkollaIcon from '../assets/shkolla-icon.png';
import githubMark from '../assets/github.svg';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import ModelPicker from '../components/digiclip/ModelPicker';
import SttModelPicker from '../components/digiclip/SttModelPicker';
import CaptionPicker from '../components/digiclip/CaptionPicker';
import Tip from '../components/digiclip/Tooltip';
import { cn } from '../lib/utils';

function Field({ label, aside, hint, children }) {
    return (
        <label className="block space-y-1.5">
            <span className="flex items-center gap-2 text-sm font-medium">{label}{aside}</span>
            {children}
            {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </label>
    );
}

function Section({ title, children, className }) {
    return (
        <section className={cn('space-y-3', className)}>
            <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">{title}</p>
            {children}
        </section>
    );
}

const inputCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

/** GPU switch: track flips with primary, knob slides. Disabled state gets
 *  its explanation from the wrapping Tip, not the control itself. */
function GpuToggle({ checked, disabled, onChange, label }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                checked ? 'bg-primary' : 'bg-input',
                disabled && 'cursor-not-allowed opacity-50',
            )}
        >
            <span
                aria-hidden
                className={cn(
                    'absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow transition-transform',
                    'motion-safe:duration-200 motion-safe:ease-out',
                    checked ? 'translate-x-4' : 'translate-x-0',
                )}
            />
        </button>
    );
}

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
                <p className="text-sm font-medium">GPU transcription</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
        </div>
    );
}

/** Number input with always-visible custom steppers (native spinners
 *  hide cross-browser and can't be styled). */
function Stepper({ label, value, min = 1, max = 10, onChange }) {    const clamp = (v) => Math.min(max, Math.max(min, Number.isFinite(+v) ? +v : min));
    const stepCls = 'flex flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent/60';
    return (
        <div className="flex h-9 w-full overflow-hidden rounded-md border border-input bg-background transition-shadow focus-within:ring-2 focus-within:ring-ring">
            <input
                type="number"
                aria-label={label}
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(clamp(e.target.value))}
                className="no-spin min-w-0 flex-1 bg-transparent px-3 py-1 text-sm outline-none"
            />
            <div className="flex w-9 shrink-0 flex-col divide-y divide-input border-l border-input">
                <button type="button" aria-label={`More ${label}`} onClick={() => onChange(clamp(value + 1))} className={stepCls}>
                    <ChevronUp className="size-3.5" aria-hidden />
                </button>
                <button type="button" aria-label={`Fewer ${label}`} onClick={() => onChange(clamp(value - 1))} className={stepCls}>
                    <ChevronDown className="size-3.5" aria-hidden />
                </button>
            </div>
        </div>
    );
}

export default function Settings({ settings, model_presets }) {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        openrouter_key: '',
        openrouter_model: settings.openrouter_model,
        stt_model: settings.stt_model,
        stt_gpu: !!settings.stt_gpu,
        clips_count: settings.clips_count,
        caption_default: settings.caption_default,
    });
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });

    // Live model disk/download state. Downloads run server-side (queue), so
    // the ring keeps filling even with the dropdown closed; 2.5s polling is
    // cheap (single JSON, no props reload) and stops with the page.
    const [modelStatus, setModelStatus] = useState(null);
    useEffect(() => {
        let dead = false;
        const load = () => fetch('/api/stt-models', { headers: { Accept: 'application/json' } })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (!dead && j?.models) setModelStatus(j.models); })
            .catch(() => {});
        load();
        const t = setInterval(load, 2500);
        return () => { dead = true; clearInterval(t); };
    }, []);

    const csrf = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
    const refreshModels = () => fetch('/api/stt-models', { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j?.models) setModelStatus(j.models); })
        .catch(() => {});
    function downloadModel(id) {
        fetch(`/api/stt-models/${encodeURIComponent(id)}/download`, {
            method: 'POST',
            headers: { 'X-CSRF-TOKEN': csrf(), 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
        })
            .then((r) => (r.ok || r.status === 202 ? r.json() : null))
            .then(() => refreshModels())
            .catch(() => {});
    }
    function deleteModel(id) {
        fetch(`/api/stt-models/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'X-CSRF-TOKEN': csrf(), 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
        })
            .then(() => refreshModels())
            .catch(() => {});
    }

    const sttLive = modelStatus?.[form.stt_model];
    const sttState = sttLive
        ? (sttLive.downloaded ? 'ready' : sttLive.downloading ? 'downloading' : sttLive.failed ? 'failed' : 'missing')
        : (settings.stt_downloaded?.[form.stt_model] ? 'ready' : 'missing');
    const sttHint = sttState === 'ready'
        ? 'On disk, ready to transcribe.'
        : sttState === 'downloading'
            ? `Downloading… ${sttLive?.progress ?? 0}% — keeps going in the background.`
            : sttState === 'failed'
                ? 'Download failed — pick the model again to retry.'
                : 'Not on disk yet — pick it to download in the background.';

    // One word, only alive when something actually changed. Baseline
    // re-derives from server props, so a saved form settles itself.
    const baseline = {
        openrouter_key: '',
        openrouter_model: settings.openrouter_model,
        stt_model: settings.stt_model,
        stt_gpu: !!settings.stt_gpu,
        clips_count: settings.clips_count,
        caption_default: settings.caption_default,
    };
    const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
    const saveLabel = saving ? 'Saving…' : dirty ? 'Save' : 'Saved';

    function save(e) {
        e.preventDefault();
        router.put('/settings', form, {
            preserveScroll: true,
            onStart: () => setSaving(true),
            onFinish: () => setSaving(false),
        });
    }

    return (
        <div className="h-[calc(100dvh-101px)] min-h-[480px]">
            <Card className="stagger-1 flex h-full flex-col overflow-hidden">
                <CardHeader className="shrink-0 px-4 py-3">
                    <CardTitle className="text-sm">Settings</CardTitle>
                </CardHeader>
                <div aria-hidden className="mx-4 shrink-0 border-t border-border" />
                <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-4">
                    <div className="mx-auto my-auto w-full max-w-3xl space-y-5">
                    <form id="settings-form" className="space-y-5" onSubmit={save}>
                        <Section title="Connection" className="stagger-2">
                            <Field
                                label="OpenRouter API key"
                                aside={settings.openrouter_key_set
                                    ? <Badge variant="success" className="text-[10px]">set</Badge>
                                    : <Badge variant="secondary" className="text-[10px]">not set</Badge>}
                                hint={settings.openrouter_key_set ? 'Saved. Blank keeps it.' : 'No key, clips use heuristics.'}
                            >
                                <div className="relative">
                                    <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                    <input type="password" name="openrouter_key" autoComplete="off" placeholder={settings.openrouter_key_set ? '•••••••• (unchanged)' : 'sk-or-…'}
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
                                        options={settings.stt_models}
                                        downloaded={settings.stt_downloaded}
                                        status={modelStatus ?? {}}
                                        onDownload={downloadModel}
                                        onDelete={deleteModel}
                                    />
                                </Field>
                            </div>
                            <GpuRow
                                gpu={settings.gpu}
                                checked={form.stt_gpu}
                                onChange={(v) => setForm({ ...form, stt_gpu: v })}
                            />
                        </Section>
                        <Section title="Output" className="stagger-4">
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Clips per video" hint="1-10">
                                    <Stepper
                                        label="Clips per video"
                                        value={form.clips_count}
                                        min={1}
                                        max={10}
                                        onChange={(v) => setForm({ ...form, clips_count: v })}
                                    />
                                </Field>
                                <Field label="Caption style">
                                    <CaptionPicker
                                        value={form.caption_default}
                                        onChange={(s) => setForm({ ...form, caption_default: s })}
                                    />
                                </Field>
                            </div>
                        </Section>
                    </form>
                    <Section title="About" className="stagger-4">
                        <div className="space-y-2.5 rounded-lg border bg-muted/40 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <span className="text-sm text-muted-foreground">
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
                                            className="group inline-flex size-8 items-center justify-center rounded-md border border-input bg-background transition-colors hover:bg-white"
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
                                            className="group inline-flex size-8 items-center justify-center rounded-md border border-input bg-background transition-colors hover:bg-white"
                                        >
                                            <img src={githubMark} alt="" className="size-4 transition-[filter] group-hover:brightness-0" />
                                        </a>
                                    </Tip>
                                </span>
                            </div>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <p className="text-xs text-muted-foreground">Reviewed by Kebir Çesko and Arianit Tërshnjaku.</p>
                                <p className="font-mono text-[11px] text-muted-foreground">Local-first · stays on this machine.</p>
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
                            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
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
