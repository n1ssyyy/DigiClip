import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowRight, Bot, Check, ChevronDown, Download, Eye, EyeOff, FolderOpen, Info, KeyRound,
    Loader2, Mic, RefreshCw, Search, SlidersHorizontal, Sparkles, Trash2, X,
} from 'lucide-react';
import shkollaIcon from '../assets/shkolla-icon.png';
import githubMark from '../assets/github.svg';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import ModelPicker from '../components/digiclip/ModelPicker';
import ProviderPicker from '../components/digiclip/ProviderPicker';
import SttModelPicker from '../components/digiclip/SttModelPicker';
import { GpuToggle, Reveal, Segmented } from '../components/digiclip/controls';
import Tip from '../components/digiclip/Tooltip';
import { cn } from '../lib/utils';
import { isTauri, onShellPrefs, pickFolder, setAutostart, setCloseToTray, shellPrefs } from '../lib/native';
import { LANGUAGES, setLang, useLang, useT } from '../lib/i18n';
import { deleteModel, downloadModel, navigate, saveSettings, useStore } from '../lib/socket';
import { checkForUpdates, ensureAppVersion, runSetup, setAutoUpdate, useUpdates } from '../lib/updates';
import { idleIconsEnabled, setIdleIcons } from '../lib/iconMotion';
import { ALPHA_CAP } from '../lib/alpha';
import { CUSTOM, watchChoice, watchOptions } from '../lib/watchLook';

const inputCls = 'flex h-9 w-full rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-3 py-1 text-[13px] outline-none transition-[box-shadow,background-color] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

/** The page's table of contents, top to bottom. */
const CATS = [
    { id: 'general', icon: SlidersHorizontal, label: 'General', desc: 'Language, background and how the app feels.' },
    { id: 'transcription', icon: Mic, label: 'Transcription', desc: 'How speech becomes text.' },
    { id: 'clips', icon: Sparkles, label: 'Clip AI', desc: 'Which provider and model pick the clips, and who double-checks them.' },
    { id: 'watch', icon: FolderOpen, label: 'Watch folder', desc: 'Clip new videos the moment they land.' },
    { id: 'ai', icon: Bot, label: 'AI apps', desc: 'Let Claude, Codex, Cursor and friends drive DigiClip.' },
    { id: 'updates', icon: RefreshCw, label: 'Updates', desc: 'New versions of DigiClip.' },
    { id: 'about', icon: Info, label: 'About', desc: 'Who made this.' },
];
const NAV_PITCH = 34; // nav item height (32) + gap (2): the pill slides in these steps

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

const DECIDERS = [
    { id: 'auto', label: 'Auto', hint: 'Jev when a key is set, else Laya when downloaded and the talk is English, else off.' },
    { id: 'jev', label: 'Jev', hint: 'TypeSafe’s hosted Jev re-judges every pick. Needs a Jev key.' },
    { id: 'laya', label: 'Laya', hint: 'Local Laya on the CPU, English talks only. Downloads ~1.6 GB on first use.' },
    { id: 'off', label: 'Off', hint: 'Keep the clip model’s picks as they are.' },
];

/**
 * Every change saves the moment it is made (no Save button to forget).
 * The control shows the new value at once (optimistic), the engine
 * confirms, and the header reports Saving… / Saved / Couldn't save.
 * Returns `[overrides, status, patch]`; `patch` resolves true on success.
 */
function useAutoSave() {
    const [opt, setOpt] = useState({});
    const [status, setStatus] = useState({ phase: 'idle', seq: 0, error: null });
    const inflight = useRef(0);
    const idleTimer = useRef(null);
    useEffect(() => () => clearTimeout(idleTimer.current), []);
    const patch = useCallback((p) => {
        setOpt((o) => ({ ...o, ...p }));
        inflight.current += 1;
        clearTimeout(idleTimer.current);
        setStatus((s) => ({ ...s, phase: 'saving', error: null }));
        // Drop the override once the engine has spoken, unless a newer
        // change to the same field is already on its way.
        const settle = () => setOpt((o) => {
            const n = { ...o };
            for (const [k, v] of Object.entries(p)) if (Object.is(n[k], v)) delete n[k];
            return n;
        });
        return saveSettings(p).then(() => {
            settle();
            return true;
        }, (e) => {
            settle();
            setStatus((s) => ({ phase: 'error', seq: s.seq + 1, error: e?.message ?? String(e) }));
            return false;
        }).finally(() => {
            inflight.current -= 1;
            if (inflight.current) return;
            setStatus((s) => (s.phase === 'error' ? s : { phase: 'saved', seq: s.seq + 1, error: null }));
            idleTimer.current = setTimeout(() => setStatus((s) => (s.phase === 'saved' ? { ...s, phase: 'idle' } : s)), 2600);
        });
    }, []);
    return [opt, status, patch];
}

function SaveState({ status }) {
    const t = useT();
    if (status.phase === 'saving') {
        return (
            <span className="swap-in flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                {t('Saving…')}
            </span>
        );
    }
    if (status.phase === 'saved') {
        return (
            <span key={status.seq} className="swap-in flex items-center gap-1.5 text-[11px] font-medium text-[var(--viral)]" role="status">
                <Check className="draw size-3.5" aria-hidden />
                {t('Saved')}
            </span>
        );
    }
    if (status.phase === 'error') {
        return (
            <Tip label={status.error} side="bottom">
                <span key={status.seq} className="shake-in flex items-center gap-1.5 text-[11px] font-medium text-red-400" role="alert">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    {t('Couldn’t save')}
                </span>
            </Tip>
        );
    }
    return <span className="fade text-[11px] text-muted-foreground">{t('Changes save as you go')}</span>;
}

/** One setting: what it is and what it does on the left, its control on
 *  the right. `stack` puts a wide control under the text instead;
 *  `inline` keeps a small control (a switch) beside the text at every
 *  width. `search` adds words the filter should match. */
function Row({ title, badge, desc, children, stack = false, inline = false, search = '', className }) {
    const words = `${title} ${typeof desc === 'string' ? desc : ''} ${search}`.toLowerCase();
    return (
        <div
            data-row
            data-search={words}
            className={cn(
                'set-row flex gap-x-6 gap-y-2.5 px-4 py-3.5 transition-colors duration-200 first:rounded-t-md last:rounded-b-md hover:bg-white/[0.018]',
                inline ? 'flex-row items-center' : stack ? 'flex-col' : 'flex-col @xl:flex-row @xl:items-center',
                className,
            )}
        >
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                    {title}
                    {badge}
                </p>
                {desc && <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{desc}</div>}
            </div>
            {children && (
                <div className={cn('min-w-0', inline ? 'shrink-0' : !stack && '@xl:w-[min(320px,48%)] @xl:shrink-0')}>
                    {children}
                </div>
            )}
        </div>
    );
}

function Section({ cat, note, children }) {
    const t = useT();
    const Icon = cat.icon;
    return (
        <section data-section={cat.id} data-title={t(cat.label).toLowerCase()} aria-labelledby={`set-${cat.id}`} className="set-section">
            <header className="mb-2.5 flex items-center gap-3 px-1">
                <span className="set-section-icon flex size-8 shrink-0 items-center justify-center rounded-md border border-x-white/10 border-t-white/20 border-b-black/60 bg-accent/60 text-foreground">
                    <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                    <h2 id={`set-${cat.id}`} className="text-[13px] font-semibold tracking-tight">{t(cat.label)}</h2>
                    <p className="truncate text-[11px] text-muted-foreground">{t(cat.desc)}</p>
                </div>
            </header>
            {note && <div className="mb-2 px-1">{note}</div>}
            {/* No overflow clip: pickers inside float their panels out. */}
            <div className="divide-y divide-white/[0.05] rounded-md border border-x-white/[0.07] border-t-white/[0.12] border-b-black/50 bg-black/[0.16]">
                {children}
            </div>
        </section>
    );
}

function Select({ value, onChange, label, children }) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                aria-label={label}
                className={cn(inputCls, 'cursor-pointer appearance-none pr-9 [color-scheme:dark] hover:bg-accent/60')}
            >
                {children}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        </div>
    );
}

function KeyBadge({ set, optional = false }) {
    const t = useT();
    return set ? (
        <span key="on" className="swap-in inline-flex items-center gap-1 rounded-full bg-[var(--viral)]/15 px-2 py-px text-[10px] font-medium text-[var(--viral)]">
            <span className="size-1.5 rounded-full bg-[var(--viral)]" aria-hidden />
            {t('set')}
        </span>
    ) : (
        <span key="off" className="swap-in inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-px text-[10px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/60" aria-hidden />
            {optional ? t('optional') : t('not set')}
        </span>
    );
}

/** Two-step destructive button: the first click arms it (and says so),
 *  a second within 3s does it. */
function ConfirmIcon({ label, confirmLabel, onConfirm }) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return undefined;
        const tm = setTimeout(() => setArmed(false), 3000);
        return () => clearTimeout(tm);
    }, [armed]);
    return (
        <Tip label={armed ? null : label} side="top">
            <button
                type="button"
                aria-label={armed ? confirmLabel : label}
                onClick={() => {
                    if (!armed) return setArmed(true);
                    setArmed(false);
                    onConfirm();
                }}
                className={cn(
                    'flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] transition-[background-color,color,width] duration-200 active:scale-95',
                    armed ? 'bg-destructive/90 text-destructive-foreground' : 'text-muted-foreground hover:bg-destructive/15 hover:text-red-400',
                )}
            >
                <Trash2 className="size-4" aria-hidden />
                {armed && <span className="swap-in whitespace-nowrap">{confirmLabel}</span>}
            </button>
        </Tip>
    );
}

/** A secret the engine keeps: typed here, saved with Enter or the Save
 *  button that appears, then wiped from the field. Never shown back. */
function KeyField({ label, isSet, placeholder, onSave, onRemove }) {
    const t = useT();
    const [val, setVal] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const dirty = val.trim().length > 0;
    function save() {
        if (!dirty || busy) return;
        setBusy(true);
        onSave(val.trim()).then((ok) => {
            if (!ok) return;
            setVal('');
            setShow(false);
        }).finally(() => setBusy(false));
    }
    return (
        <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
                <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                    type={show ? 'text' : 'password'}
                    aria-label={label}
                    autoComplete="off"
                    spellCheck={false}
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            save();
                        } else if (e.key === 'Escape' && val) {
                            e.stopPropagation();
                            setVal('');
                        }
                    }}
                    placeholder={isSet ? t('Saved — type to replace') : placeholder}
                    className={cn(inputCls, 'pr-9 pl-9 font-mono')}
                />
                {dirty && (
                    <button
                        type="button"
                        onClick={() => setShow((s) => !s)}
                        aria-label={show ? t('Hide key') : t('Show key')}
                        className="fade absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        {show ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                    </button>
                )}
            </div>
            {dirty ? (
                <Button type="button" size="sm" className="pop h-9" disabled={busy} onClick={save}>
                    {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                    {t('Save')}
                </Button>
            ) : isSet && onRemove ? (
                <ConfirmIcon label={t('Remove key')} confirmLabel={t('Remove?')} onConfirm={onRemove} />
            ) : null}
        </div>
    );
}

/** GPU transcription copy: the device list comes from the backend
 *  detector (best first); with several GPUs the strongest transcribes. */
function gpuHint(t, gpu, checked) {
    // No answer yet from the health check: say nothing alarming.
    if (!gpu) return t('Checking for a compatible graphics card…');
    if (!gpu.available) return gpu.reason ?? t('No compatible GPU detected — CPU transcription only');
    const best = gpu.best;
    const count = gpu.devices?.length ?? 0;
    const mem = best?.memory_mb ? ` · ${best.memory_mb >= 1024 ? `${(best.memory_mb / 1024).toFixed(0)}GB` : `${best.memory_mb}MB`}` : '';
    if (!checked) return t('Using CPU. Turn on for faster transcription.');
    return count > 1
        ? t('Using {name}{mem} — fastest of {count} GPUs. Turn off for CPU.', { name: best?.name ?? 'GPU', mem, count })
        : t('Using {name}{mem}. Turn off for CPU.', { name: best?.name ?? 'GPU', mem });
}

/** Laya's local bundle: size, live download progress, fetch or remove. */
function LayaCard({ model }) {
    const t = useT();
    const size = model?.size_mb ? `${(model.size_mb / 1024).toFixed(1)} GB` : '~1.6 GB';
    const state = !model ? 'missing'
        : model.downloaded ? 'ready'
            : model.downloading ? 'downloading'
                : model.error ? 'failed' : 'missing';
    const text = state === 'ready'
        ? t('On disk ({size}), ready to judge.', { size })
        : state === 'downloading'
            ? t('Downloading… {pct}% — keeps going in the background.', { pct: model.progress ?? 0 })
            : state === 'failed'
                ? t('Download failed: {error}', { error: model.error })
                : t('Not on disk. {size}, downloaded once.', { size });
    return (
        <div className="flex items-center gap-3 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-muted/30 px-3 py-2">
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[12px] font-medium">
                    {t('Laya model')}
                    {state === 'ready' && <Check className="size-3.5 text-[var(--viral)]" aria-hidden />}
                </p>
                <p className="truncate text-[11px] text-muted-foreground" title={text}>{text}</p>
                {state === 'downloading' && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${model.progress ?? 0}%` }} />
                    </div>
                )}
            </div>
            {state === 'ready' ? (
                <ConfirmIcon label={t('Remove')} confirmLabel={t('Remove?')} onConfirm={() => deleteModel('laya')} />
            ) : (
                <Button type="button" variant="secondary" size="sm" disabled={state === 'downloading'} onClick={() => downloadModel('laya')}>
                    {state === 'downloading' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
                    {state === 'failed' ? t('Retry') : t('Download')}
                </Button>
            )}
        </div>
    );
}

/** Tray + sign-in: shell prefs, applied the moment they flip (they live
 *  in the desktop shell, not the engine's settings). */
function BackgroundRows() {
    const t = useT();
    const [prefs, setPrefs] = useState(null);
    useEffect(() => {
        const refresh = () => shellPrefs().then(setPrefs).catch(() => {});
        refresh();
        const off = onShellPrefs(refresh);
        return () => {
            off.then((f) => f()).catch(() => {});
        };
    }, []);
    if (!prefs) return null;
    const flip = (fn, key) => (v) => {
        setPrefs((p) => ({ ...p, [key]: v }));
        fn(v).then(setPrefs).catch(() => shellPrefs().then(setPrefs).catch(() => {}));
    };
    return (
        <>
            <Row
                inline
                title={t('Keep running in the tray')}
                search="background close minimize"
                desc={!prefs.tray
                    ? t('No tray on this desktop — closing the window quits.')
                    : prefs.close_to_tray
                        ? t('Closing the window keeps jobs and the watch folder going. Quit from the tray icon.')
                        : t('Closing the window quits DigiClip.')}
            >
                <GpuToggle checked={!!(prefs.tray && prefs.close_to_tray)} disabled={!prefs.tray} onChange={flip(setCloseToTray, 'close_to_tray')} label={t('Keep running in the tray')} />
            </Row>
            <Row
                inline
                title={t('Start when I sign in')}
                search="autostart boot login startup"
                desc={prefs.autostart ? t('Starts quietly in the tray, so the watch folder is always on.') : t('Start DigiClip yourself.')}
            >
                <GpuToggle checked={!!prefs.autostart} onChange={flip(setAutostart, 'autostart')} label={t('Start when I sign in')} />
            </Row>
        </>
    );
}

function UpdateRows() {
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
            // The updater store carries the error line.
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
        <>
            <Row
                inline
                title={t('Check for updates on launch')}
                search="auto update version"
                desc={auto ? t('Checked on launch, installed on your call.') : t('Automatic checks off — check by hand.')}
            >
                <GpuToggle checked={auto} onChange={setAutoUpdate} label={t('Check for updates on launch')} />
            </Row>
            <Row
                inline
                title={t('App updates')}
                badge={current && <Badge variant="secondary" className="font-mono text-[10px] text-muted-foreground">v{current}</Badge>}
                search="version download install"
                desc={<span key={status} className="fade block truncate" title={status}>{status}</span>}
            >
                {phase === 'available' ? (
                    <Button type="button" size="sm" className="pop" disabled={working} onClick={() => run(runSetup)}>
                        <Download className="size-3.5" aria-hidden />
                        {working ? t('Starting…') : t('Update to v{version}', { version: available?.version ?? '' })}
                    </Button>
                ) : (phase === 'idle' || phase === 'uptodate' || phase === 'error' || phase === 'checking') ? (
                    <Button type="button" variant="secondary" size="sm" disabled={working || phase === 'checking'} onClick={() => run(() => checkForUpdates())}>
                        <RefreshCw className={cn('size-3.5', (working || phase === 'checking') && 'animate-spin')} aria-hidden />
                        {working || phase === 'checking' ? t('Checking…') : t('Check now')}
                    </Button>
                ) : null}
            </Row>
        </>
    );
}

/** Words the finder matches on every Clip AI row. */
const AI_SEARCH = 'provider openai anthropic claude gemini google ollama groq mistral deepseek grok xai together fireworks cerebras lm studio custom base url';

/** What a key looks like, per provider (a hint in the empty field). */
const KEY_HINTS = { openrouter: 'sk-or-…', openai: 'sk-…', anthropic: 'sk-ant-…', gemini: 'AIza…', groq: 'gsk_…', xai: 'xai-…' };

const isHttpUrl = (u) => /^https?:\/\/[^\s/]+/i.test(u);

/** A provider's address: saved on Enter or blur, checked first. Empty
 *  goes back to the built-in one. */
function BaseUrlField({ label, value, placeholder, onSave }) {
    const t = useT();
    const [val, setVal] = useState(value);
    const [bad, setBad] = useState(0);
    useEffect(() => setVal(value), [value]);
    function commit() {
        const u = val.trim().replace(/\/+$/, '');
        if (u === value) {
            setVal(value);
            setBad(0);
            return;
        }
        if (u && !isHttpUrl(u)) {
            setBad((n) => n + 1);
            return;
        }
        setBad(0);
        onSave(u || null);
    }
    return (
        <div>
            <input
                type="text"
                inputMode="url"
                aria-label={label}
                aria-invalid={bad > 0}
                autoComplete="off"
                spellCheck={false}
                value={val}
                placeholder={placeholder}
                onChange={(e) => {
                    setVal(e.target.value);
                    if (bad) setBad(0);
                }}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commit();
                    } else if (e.key === 'Escape' && val !== value) {
                        e.stopPropagation();
                        setVal(value);
                        setBad(0);
                    }
                }}
                className={cn(inputCls, 'font-mono text-[12px]', bad > 0 && 'border-red-500/60')}
            />
            {bad > 0 && (
                <p key={bad} className="shake-in mt-1.5 flex items-center gap-1.5 text-[11px] text-red-400" role="alert">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                    {t('Start with http:// or https://')}
                </p>
            )}
        </div>
    );
}

/** Where Clip AI stands, in one line. */
function AiStatus({ label, needsKey, hasKey, model }) {
    const t = useT();
    const noKey = needsKey === 'required' && !hasKey;
    const state = noKey ? 'key' : !model ? 'model' : 'ready';
    const text = state === 'key'
        ? t('{provider} needs a key. Until then clips use heuristics.', { provider: label })
        : state === 'model'
            ? t('Pick a model to use {provider}', { provider: label })
            : t('Ready: {provider} · {model}', { provider: label, model });
    return (
        <p key={state + label} className="swap-in flex items-center gap-2 text-[11px] text-muted-foreground" role="status">
            <span className={cn('size-1.5 shrink-0 rounded-full', state === 'ready' ? 'bg-[var(--viral)]' : 'bg-orange-400')} aria-hidden />
            <span className="min-w-0 truncate" title={text}>{text}</span>
        </p>
    );
}

/** Scrollspy: the category whose section heading last passed the top
 *  of the scroller (or the last one, once scrolled to the bottom).
 *  `lock` holds it still while a nav click is smooth-scrolling. */
function useScrollSpy(scrollerRef, lock) {
    const [active, setActive] = useState(CATS[0].id);
    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return undefined;
        const spy = () => {
            if (lock.current) return;
            const shown = [...el.querySelectorAll('[data-section]')].filter((s) => !s.hidden);
            if (!shown.length) return;
            let cur = shown[0].dataset.section;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
                cur = shown[shown.length - 1].dataset.section;
            } else {
                const top = el.getBoundingClientRect().top;
                for (const s of shown) if (s.getBoundingClientRect().top - top <= 96) cur = s.dataset.section;
            }
            setActive(cur);
        };
        spy();
        el.addEventListener('scroll', spy, { passive: true });
        return () => el.removeEventListener('scroll', spy);
    }, [scrollerRef, lock]);
    return [active, setActive];
}

export default function Settings() {
    const settings = useStore((s) => s.settings);
    const health = useStore((s) => s.health);
    const liveModels = useStore((s) => s.models);
    const mcpInstalled = useStore((s) => s.mcp?.installed);
    // An engine without `look.alpha` is handed a Look's options without opacity.
    const alpha = useStore((s) => s.caps.includes(ALPHA_CAP));
    const appVersion = useUpdates((s) => s.appVersion);
    const lang = useLang();
    const t = useT();
    const [opt, status, patch] = useAutoSave();
    const [idleIcons, setIdle] = useState(idleIconsEnabled);
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState(null);
    const scroller = useRef(null);
    const searchRef = useRef(null);
    const lock = useRef(false);
    const lockTimer = useRef(null);
    const [active, setActive] = useScrollSpy(scroller, lock);

    // Header badge is the APP version (shell), never the engine version
    // from health: the two diverge.
    useEffect(() => {
        ensureAppVersion().catch(() => {});
    }, []);
    useEffect(() => () => clearTimeout(lockTimer.current), []);

    // Ctrl+F (or /) finds a setting.
    useEffect(() => {
        const onKey = (e) => {
            const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
            if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') || (e.key === '/' && !typing)) {
                e.preventDefault();
                searchRef.current?.focus();
                searchRef.current?.select();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // The filter works on the rendered rows: each row carries its own
    // words, a section with no matching rows hides, and the nav dims
    // categories with nothing to show. Runs after every render so rows
    // that re-mount keep the verdict.
    useLayoutEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const q = query.trim().toLowerCase();
        const next = {};
        el.querySelectorAll('[data-section]').forEach((sec) => {
            const title = q && sec.dataset.title.includes(q);
            let n = 0;
            sec.querySelectorAll('[data-row]').forEach((r) => {
                const ok = !q || title || r.dataset.search.includes(q);
                r.hidden = !ok;
                if (ok) n += 1;
            });
            sec.hidden = n === 0;
            next[sec.dataset.section] = n;
        });
        const key = JSON.stringify(next);
        setHits((prev) => (JSON.stringify(prev) === key ? prev : next));
    });

    if (!settings) return null;
    // What the controls show: saved settings with in-flight changes on top.
    const v = { ...settings, ...opt };

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
    const sttLive = modelStatus[v.stt_model];
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

    const sttLang = v.stt_lang ?? 'en';
    const langName = t(LANGS.find(([id]) => id === sttLang)?.[1] ?? sttLang);
    const langHint = v.stt_model?.endsWith('.en') && sttLang !== 'en'
        ? (sttLang === 'auto'
            ? t('{model} is English-only — pick a large-v3 model to transcribe other languages.', { model: v.stt_model })
            : t('{model} is English-only — pick a large-v3 model to transcribe {lang}.', { model: v.stt_model, lang: langName }))
        : sttLang === 'auto'
            ? t('Detected per video. Pin it when you know it: faster, never guesses wrong.')
            : t('Videos are transcribed as {lang}.', { lang: langName });

    // null while the health check has not answered: neither blocked nor warned.
    const gpu = health ? { available: health.gpu_available, reason: health.gpu_reason } : null;
    const decider = v.decider ?? 'auto';
    const jevMissing = decider === 'jev' && !settings.jev_key_set;
    const presets = settings.presets ?? [];
    const watchDir = v.watch_dir ?? '';
    const watch = watchChoice(v.watch_options, presets, { alpha });
    const connected = Object.values(mcpInstalled ?? {}).filter((c) => c?.added).length;

    // Clip AI: the provider in use and what is saved for it. Maps merge the
    // in-flight change over the saved ones (a patch carries one entry).
    const providers = settings.ai_providers ?? [];
    const aiId = v.ai_provider ?? 'openrouter';
    const prov = providers.find((p) => p.id === aiId) ?? providers[0] ?? { id: aiId, label: aiId, needs_key: 'required' };
    const keysSet = settings.ai_keys_set ?? [];
    const hasKey = keysSet.includes(aiId);
    const aiModel = ({ ...(settings.ai_models ?? {}), ...(opt.ai_models ?? {}) })[aiId] ?? '';
    const aiBase = ({ ...(settings.ai_base_urls ?? {}), ...(opt.ai_base_urls ?? {}) })[aiId] ?? '';

    function browseWatch() {
        pickFolder().then((d) => {
            if (d) patch({ watch_dir: d });
        }).catch(() => {});
    }

    function jump(id) {
        const el = scroller.current;
        const sec = el?.querySelector(`[data-section="${id}"]`);
        if (!sec) return;
        setActive(id);
        lock.current = true;
        clearTimeout(lockTimer.current);
        lockTimer.current = setTimeout(() => {
            lock.current = false;
        }, 700);
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollTo({ top: sec.offsetTop - 20, behavior: reduce ? 'auto' : 'smooth' });
        // A short glint on the heading says "you are here".
        sec.classList.remove('section-glint');
        void sec.offsetWidth;
        sec.classList.add('section-glint');
    }

    const activeIdx = Math.max(0, CATS.findIndex((c) => c.id === active));
    const q = query.trim();
    const nothing = q && hits && Object.values(hits).every((n) => n === 0);

    return (
        <div className="flex h-full min-h-[480px] flex-col gap-[5px]">
            <Card className="relative shrink-0">
                <div className="flex h-10 items-center gap-3 px-4">
                    <h1 className="text-[13px] font-semibold">{t('Settings')}</h1>
                    <div className="flex-1" />
                    <SaveState status={status} />
                    {appVersion && (
                        <Badge variant="secondary" className="font-mono text-[10px] text-muted-foreground">
                            v{appVersion}
                        </Badge>
                    )}
                </div>
            </Card>
            <Card className="stagger-1 flex min-h-0 flex-1 overflow-hidden">
                {/* Table of contents + finder. */}
                <nav aria-label={t('Settings sections')} className="flex w-52 shrink-0 flex-col gap-3 border-r border-white/[0.06] p-3">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <input
                            ref={searchRef}
                            type="search"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                scroller.current?.scrollTo({ top: 0 });
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape' && query) {
                                    e.stopPropagation();
                                    setQuery('');
                                }
                            }}
                            placeholder={t('Find a setting')}
                            aria-label={t('Find a setting')}
                            className={cn(inputCls, 'h-8 pr-7 pl-8 text-[12px] [&::-webkit-search-cancel-button]:hidden')}
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => {
                                    setQuery('');
                                    searchRef.current?.focus();
                                }}
                                aria-label={t('Clear search')}
                                className="fade absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <X className="size-3.5" aria-hidden />
                            </button>
                        )}
                    </label>
                    <div className="relative flex flex-col gap-0.5">
                        <span
                            aria-hidden
                            className="nav-pill pointer-events-none absolute inset-x-0 top-0 h-8 rounded-md border-t border-white/10 bg-accent shadow-[0_1px_3px_rgb(0_0_0/0.4)]"
                            style={{ transform: `translateY(${activeIdx * NAV_PITCH}px)` }}
                        />
                        {CATS.map((c) => {
                            const Icon = c.icon;
                            const on = c.id === active;
                            const empty = q && hits && !hits[c.id];
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => jump(c.id)}
                                    disabled={!!empty}
                                    aria-current={on ? 'true' : undefined}
                                    className={cn(
                                        'relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-[12px] transition-[color,opacity,background-color] duration-200',
                                        on ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                                        empty && 'opacity-35',
                                    )}
                                >
                                    <Icon className="size-3.5 shrink-0" aria-hidden />
                                    <span className="truncate">{t(c.label)}</span>
                                    {q && hits?.[c.id] > 0 && (
                                        <span className="pop ml-auto rounded-full bg-white/10 px-1.5 font-mono text-[10px] text-muted-foreground">{hits[c.id]}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-auto space-y-1 border-t border-white/[0.06] pt-3">
                        <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('digiclip:tour'))}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
                        >
                            <Sparkles className="size-3.5" aria-hidden />
                            {t('Take the tour again')}
                        </button>
                    </div>
                </nav>

                <div ref={scroller} className="digi-scroll relative min-w-0 flex-1 overflow-y-auto @container">
                    <div className="mx-auto w-full max-w-3xl space-y-8 px-6 pt-5 pb-10">
                        {nothing && (
                            <div className="fade flex flex-col items-center gap-2 py-16 text-center">
                                <Search className="size-6 text-muted-foreground" aria-hidden />
                                <p className="text-[13px] font-medium">{t('No settings match “{query}”', { query: q })}</p>
                                <button type="button" onClick={() => setQuery('')} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                                    {t('Clear search')}
                                </button>
                            </div>
                        )}

                        <Section cat={CATS[0]}>
                            <Row title={t('App language')} desc={t('Menus and messages. Applies right away.')} search="language ui translate">
                                <Select value={lang} onChange={setLang} label={t('App language')}>
                                    {LANGUAGES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                                </Select>
                            </Row>
                            {isTauri() && <BackgroundRows />}
                            <Row
                                inline
                                title={t('Living icons')}
                                search="animation motion idle"
                                desc={idleIcons
                                    ? t('Icons play a small gesture now and then. Hover always animates them.')
                                    : t('Icons stay still until you hover them.')}
                            >
                                <GpuToggle
                                    checked={idleIcons}
                                    onChange={(on) => {
                                        setIdle(on);
                                        setIdleIcons(on);
                                    }}
                                    label={t('Living icons')}
                                />
                            </Row>
                        </Section>

                        <Section cat={CATS[1]}>
                            <Row title={t('Transcription model')} desc={sttHint} search="whisper stt speech">
                                <SttModelPicker
                                    value={v.stt_model}
                                    onChange={(id) => patch({ stt_model: id })}
                                    options={modelOptions}
                                    downloaded={modelDownloaded}
                                    status={modelStatus}
                                    onDownload={downloadModel}
                                    onDelete={deleteModel}
                                />
                            </Row>
                            <Row title={t('Spoken language')} desc={langHint} search="language speech">
                                <Select value={sttLang} onChange={(id) => patch({ stt_lang: id })} label={t('Spoken language')}>
                                    {LANGS.map(([id, name]) => <option key={id} value={id}>{t(name)}</option>)}
                                </Select>
                            </Row>
                            <Row inline title={t('GPU transcription')} desc={gpuHint(t, gpu, !!v.gpu)} search="cuda nvidia graphics speed">
                                <Tip label={!gpu || gpu.available ? null : gpuHint(t, gpu, false)}>
                                    <GpuToggle checked={!!v.gpu && (!gpu || !!gpu.available)} disabled={!!gpu && !gpu.available} onChange={(on) => patch({ gpu: on })} label={t('GPU transcription')} />
                                </Tip>
                            </Row>
                        </Section>

                        <Section
                            cat={CATS[2]}
                            note={providers.length > 0 && <AiStatus label={prov.label} needsKey={prov.needs_key} hasKey={hasKey} model={aiModel} />}
                        >
                            {providers.length > 0 && (
                                <Row
                                    title={t('Provider')}
                                    desc={t('Who runs the model that picks your clips.')}
                                    search={'clip ai llm model ' + AI_SEARCH}
                                >
                                    <ProviderPicker value={aiId} providers={providers} keysSet={keysSet} onChange={(id) => patch({ ai_provider: id })} />
                                </Row>
                            )}
                            {prov.needs_key !== 'none' && (
                                <Row
                                    key={'key-' + aiId}
                                    className="rise"
                                    title={t('{provider} API key', { provider: prov.label })}
                                    badge={<KeyBadge set={hasKey} optional={prov.needs_key === 'optional'} />}
                                    desc={(
                                        <>
                                            {hasKey ? t('Stays on this machine.') : prov.needs_key === 'optional' ? t('Only if your server asks for one.') : t('No key, clips use heuristics.')}
                                            {prov.key_url && (
                                                <>
                                                    {' '}
                                                    <a href={prov.key_url} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">
                                                        {t('Get a key')}
                                                    </a>
                                                </>
                                            )}
                                        </>
                                    )}
                                    search={'api key token ' + AI_SEARCH}
                                >
                                    <KeyField
                                        label={t('{provider} API key', { provider: prov.label })}
                                        isSet={hasKey}
                                        placeholder={KEY_HINTS[aiId] ?? '…'}
                                        onSave={(key) => patch({ ai_keys: { [aiId]: key } })}
                                        onRemove={() => patch({ ai_keys: { [aiId]: null } })}
                                    />
                                </Row>
                            )}
                            {prov.base_editable && (
                                <Row
                                    key={'base-' + aiId}
                                    className="rise"
                                    title={t('Address')}
                                    desc={prov.local ? t('Where it runs. Leave empty for the usual address.') : t('The OpenAI-compatible address, ending in /v1.')}
                                    search={'address endpoint host ' + AI_SEARCH}
                                >
                                    <BaseUrlField
                                        label={t('Address')}
                                        value={aiBase}
                                        placeholder={prov.default_base || 'https://…/v1'}
                                        onSave={(u) => patch({ ai_base_urls: { [aiId]: u } })}
                                    />
                                </Row>
                            )}
                            <Row title={t('Clip model')} desc={t('Reads the transcript and picks the clips.')} search={'llm model ' + AI_SEARCH}>
                                <ModelPicker
                                    provider={aiId}
                                    value={aiModel}
                                    refetchKey={(hasKey ? 'key' : 'nokey') + '|' + aiBase}
                                    onChange={(id) => patch({ ai_models: { [aiId]: id } })}
                                />
                            </Row>
                            <Row
                                stack
                                title={t('Clip judge (System One)')}
                                search="jev laya decider judge key api"
                                desc={<span key={decider} className="fade block">{jevMissing ? t('Jev needs a key below; without one picks stay as they are.') : t(DECIDERS.find((d) => d.id === decider)?.hint ?? '')}</span>}
                            >
                                <Segmented label={t('Clip judge')} value={decider} options={DECIDERS} onChange={(id) => patch({ decider: id })} />
                                <Reveal open={decider === 'auto' || decider === 'jev'}>
                                    <div className="pt-3">
                                        <p className="mb-1.5 flex items-center gap-2 text-[12px] font-medium">
                                            {t('Jev API key')}
                                            <KeyBadge set={!!settings.jev_key_set} />
                                        </p>
                                        <KeyField
                                            label={t('Jev API key')}
                                            isSet={!!settings.jev_key_set}
                                            placeholder="jev-…"
                                            onSave={(key) => patch({ jev_key: key })}
                                            onRemove={() => patch({ jev_key: null })}
                                        />
                                        {!settings.jev_key_set && <p className="mt-1.5 text-[11px] text-muted-foreground">{t('From TypeSafe. Only needed for Jev.')}</p>}
                                    </div>
                                </Reveal>
                                <Reveal open={decider === 'auto' || decider === 'laya'}>
                                    <div className="pt-3">
                                        <LayaCard model={liveModels?.laya} />
                                    </div>
                                </Reveal>
                            </Row>
                        </Section>

                        <Section cat={CATS[3]}>
                            <Row
                                inline
                                title={t('Clip new videos automatically')}
                                search="watch folder auto"
                                desc={!watchDir.trim()
                                    ? t('Pick a folder first.')
                                    : v.watch_on
                                        ? t('Videos that land in the folder start a job once they finish copying. Files already there stay put.')
                                        : t('Off. Turn on to start a job for every new video in the folder.')}
                            >
                                <GpuToggle checked={!!v.watch_on} disabled={!watchDir.trim()} onChange={(on) => patch({ watch_on: on })} label={t('Watch a folder')} />
                            </Row>
                            <Row title={t('Folder')} desc={t('DigiClip keeps an eye on this folder.')} search="watch directory path">
                                <div className="flex h-9 items-stretch gap-1">
                                    <button
                                        type="button"
                                        onClick={browseWatch}
                                        disabled={!isTauri()}
                                        title={watchDir || undefined}
                                        className={cn(inputCls, 'min-w-0 items-center gap-2 text-left hover:bg-accent/60')}
                                    >
                                        <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                        <span className={cn('truncate', !watchDir && 'text-muted-foreground')} dir={watchDir ? 'rtl' : undefined}>
                                            {watchDir || t('Choose a folder…')}
                                        </span>
                                    </button>
                                    {watchDir && (
                                        <Tip label={t('Stop watching this folder')} side="top">
                                            <button
                                                type="button"
                                                aria-label={t('Clear folder')}
                                                onClick={() => patch({ watch_dir: null, watch_on: false })}
                                                className="shrink-0 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                            >
                                                <X className="size-4" aria-hidden />
                                            </button>
                                        </Tip>
                                    )}
                                </div>
                            </Row>
                            <Row
                                title={t('Look')}
                                desc={watch.names.length ? t('Design and save Looks in Studio.') : t('No Looks yet: design one in Studio and save it.')}
                                search="look preset watch options studio"
                            >
                                <Select
                                    value={watch.value}
                                    label={t('Look')}
                                    onChange={(name) => {
                                        const p = presets.find((x) => x?.name === name);
                                        // Defaults = every field unset, shaped like the saved value.
                                        const none = Object.fromEntries(Object.keys(settings.watch_options ?? {}).map((k) => [k, null]));
                                        patch({ watch_options: p ? watchOptions(p.options, alpha) : none });
                                    }}
                                >
                                    <option value="">{t('Defaults (from these settings)')}</option>
                                    {watch.names.map((name) => <option key={name} value={name}>{t('Look: {name}', { name })}</option>)}
                                    {watch.custom && <option value={CUSTOM} disabled>{t('Custom (look since changed)')}</option>}
                                </Select>
                            </Row>
                        </Section>

                        <Section cat={CATS[4]}>
                            <Row
                                inline
                                title={t('Connect an AI app')}
                                search="mcp claude codex cursor opencode hermes gemini vscode"
                                desc={connected
                                    ? t('{count} added. Manage them, or add another, on the AI apps page.', { count: connected })
                                    : t('Claude, Codex, Cursor, VS Code, Gemini and more can make and edit clips for you.')}
                            >
                                <Button type="button" variant="secondary" size="sm" onClick={() => navigate('mcp')}>
                                    {t('Open AI apps')}
                                    <ArrowRight className="size-3.5" aria-hidden />
                                </Button>
                            </Row>
                        </Section>

                        <Section cat={CATS[5]}>
                            <UpdateRows />
                        </Section>

                        <Section cat={CATS[6]}>
                            <Row inline title="DigiClip" search="about credits github shkolla" desc={t('Local-first · stays on this machine.')}>
                                <span className="flex items-center gap-2">
                                    <Tip label="Shkolla Digjitale Prizren" side="top">
                                        <a
                                            href="https://shkolladigjitale.com/"
                                            target="_blank"
                                            rel="noreferrer"
                                            aria-label="Shkolla Digjitale Prizren"
                                            className="group inline-flex size-8 items-center justify-center rounded-md border border-x-white/10 border-t-white/20 border-b-black/60 bg-[color-mix(in_srgb,var(--card)_78%,black)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-white active:scale-95"
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
                                            className="group inline-flex size-8 items-center justify-center rounded-md border border-x-white/10 border-t-white/20 border-b-black/60 bg-[color-mix(in_srgb,var(--card)_78%,black)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-white active:scale-95"
                                        >
                                            <img src={githubMark} alt="" className="size-4 transition-[filter] group-hover:brightness-0" />
                                        </a>
                                    </Tip>
                                </span>
                            </Row>
                            <Row
                                title={t('Credits')}
                                search="developer reviewed"
                                desc={(
                                    <>
                                        {t('Developed by')}{' '}
                                        <a href="https://github.com/n1ssyyy" target="_blank" rel="noreferrer" className="font-semibold text-foreground underline-offset-2 hover:underline">n1ssyyy</a>
                                        {' '}{t('in collaboration with')}{' '}
                                        <a href="https://shkolladigjitale.com/" target="_blank" rel="noreferrer" className="font-semibold text-foreground underline-offset-2 hover:underline">Shkolla Digjitale</a>
                                        . {t('Reviewed by Kebir Çesko and Arianit Tërshnjaku.')}
                                    </>
                                )}
                            />
                        </Section>
                    </div>
                </div>
            </Card>
        </div>
    );
}
