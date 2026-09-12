import { useState } from 'react';
import { router } from '@inertiajs/react';
import { KeyRound } from 'lucide-react';
import shkollaLogo from '../assets/shkolla.png';
import githubMark from '../assets/github.svg';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import ModelPicker from '../components/digiclip/ModelPicker';
import SttModelPicker from '../components/digiclip/SttModelPicker';
import CaptionPicker from '../components/digiclip/CaptionPicker';
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

function Section({ title, children }) {
    return (
        <section className="space-y-3">
            <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">{title}</p>
            {children}
        </section>
    );
}

const inputCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export default function Settings({ settings, model_presets }) {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        openrouter_key: '',
        openrouter_model: settings.openrouter_model,
        stt_model: settings.stt_model,
        clips_count: settings.clips_count,
        caption_default: settings.caption_default,
    });
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });

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
            <Card className="flex h-full flex-col overflow-hidden">
                <CardHeader className="shrink-0 px-4 py-3">
                    <CardTitle className="text-sm">Settings</CardTitle>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-4 pt-1 pb-4">
                    <div className="mx-auto my-auto w-full max-w-3xl space-y-8">
                    <form id="settings-form" className="space-y-8" onSubmit={save}>
                        <Section title="Connection">
                            <Field
                                label="OpenRouter API key"
                                aside={settings.openrouter_key_set
                                    ? <Badge variant="success" className="text-[10px]">set</Badge>
                                    : <Badge variant="secondary" className="text-[10px]">not set</Badge>}
                                hint={settings.openrouter_key_set ? 'Saved. Blank keeps it.' : 'No key — clips use heuristics.'}
                            >
                                <div className="relative">
                                    <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                    <input type="password" name="openrouter_key" autoComplete="off" placeholder={settings.openrouter_key_set ? '•••••••• (unchanged)' : 'sk-or-…'}
                                        value={form.openrouter_key} onChange={set('openrouter_key')} className={cn(inputCls, 'pl-9')} />
                                </div>
                            </Field>
                        </Section>
                        <Section title="Models">
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Clip model">
                                    <ModelPicker
                                        value={form.openrouter_model}
                                        onChange={(id) => setForm({ ...form, openrouter_model: id })}
                                    />
                                </Field>
                                <Field label="Transcription model">
                                    <SttModelPicker
                                        value={form.stt_model}
                                        onChange={(id) => setForm({ ...form, stt_model: id })}
                                        options={settings.stt_models}
                                    />
                                </Field>
                            </div>
                        </Section>
                        <Section title="Output">
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Clips per video" hint="1–10">
                                    <input type="number" name="clips_count" min={1} max={10} value={form.clips_count} onChange={set('clips_count')} className={inputCls} />
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
                    <Section title="About">
                        <div className="space-y-2.5 rounded-lg border bg-muted/40 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <span className="text-sm text-muted-foreground">
                                    Developed by{' '}
                                    <a
                                        href="https://github.com/n1ssyyy"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-semibold text-foreground hover:underline"
                                    >
                                        n1ssyyy
                                    </a>
                                </span>
                                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                    in collaboration with
                                    <a
                                        href="https://shkolladigjitale.com/"
                                        target="_blank"
                                        rel="noreferrer"
                                        title="Shkolla Digjitale Prizren"
                                        aria-label="Shkolla Digjitale Prizren"
                                        className="inline-flex h-8 items-center rounded-md bg-white px-2 hover:brightness-110"
                                    >
                                        <img src={shkollaLogo} alt="" className="h-5 w-auto" />
                                    </a>
                                </span>
                                <a
                                    href="https://github.com/n1ssyyy/DigiClip"
                                    target="_blank"
                                    rel="noreferrer"
                                    title="DigiClip on GitHub"
                                    aria-label="DigiClip on GitHub"
                                    className="ml-auto inline-flex size-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent"
                                >
                                    <img src={githubMark} alt="" className="size-4" />
                                </a>
                            </div>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <p className="text-xs text-muted-foreground">Reviewed by Kebir Cesko and Arianit Tershnjaku.</p>
                                <p className="font-mono text-[11px] text-muted-foreground">Local-first · stays on this machine.</p>
                            </div>
                        </div>
                    </Section>
                    </div>
                </CardContent>
                <div className="flex shrink-0 items-center justify-end border-t px-4 py-3">
                    <Button type="submit" form="settings-form" disabled={saving}>
                        {saving ? 'Saving…' : 'Save settings'}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
