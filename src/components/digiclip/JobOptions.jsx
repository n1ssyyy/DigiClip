import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight, ImagePlus, Music, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import Tip from './Tooltip';
import CaptionPicker from './CaptionPicker';
import { GpuToggle, Stepper, TightenSeg } from './controls';
import { usePanelBeat } from './usePanelBeat';
import { useFloatingPanel } from './useFloatingPanel';
import { pickAudio, pickImage } from '../../lib/native';

const STORE_KEY = 'digiclip.jobOptions';

function defaults(settings) {
    return {
        kind: 'smart',
        count: settings?.clips_count ?? 3,
        dur_mode: 'auto',
        dur_exact: 30,
        dur_min: 15,
        dur_max: 60,
        style: settings?.caption_default ?? 'karaoke',
        tighten: settings?.tighten ?? 'light',
        punch: settings?.punch ?? true,
        merge_flash: false,
        // Look: output shape and brand overlays.
        aspect: '9:16',
        headline: false,
        headline_text: '',
        progress_bar: false,
        bar_color: '#FFD400',
        logo: '',
        logo_pos: 'tr',
        music: '',
        music_db: -16,
        focus: '',
    };
}

export const ASPECTS = ['9:16', '4:5', '1:1', '16:9'];

/** The engine options for the Look knobs: only what's switched on is
 *  sent, so an untouched panel renders exactly as before. */
export function lookOptions(o) {
    const out = {};
    if (ASPECTS.includes(o.aspect) && o.aspect !== '9:16') out.aspect = o.aspect;
    // Empty headline = the clip's own title.
    if (o.headline) out.headline = (o.headline_text ?? '').trim();
    if (o.progress_bar) out.progress_bar = /^#[0-9a-f]{6}$/i.test(o.bar_color ?? '') ? o.bar_color : '';
    if (o.logo) {
        out.logo = o.logo;
        out.logo_pos = o.logo_pos || 'tr';
    }
    if (o.music) {
        out.music = o.music;
        out.music_db = Number.isFinite(+o.music_db) ? +o.music_db : -16;
    }
    const focus = (o.focus ?? '').trim();
    if (focus) out.focus = focus;
    return out;
}

/** Per-job knobs for the next upload. Persisted locally; seeded from
 *  saved settings on first sight (count, style, tighten, punch). */
export function useJobOptions(settings) {
    const [options, setOptions] = useState(() => {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) return { ...defaults(settings), ...JSON.parse(raw) };
        } catch {
        }
        return defaults(settings);
    });
    function update(patch) {
        setOptions((prev) => {
            const next = { ...prev, ...patch };
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(next));
            } catch {
            }
            return next;
        });
    }
    return [options, update];
}

function Kicker({ children }) {
    return (
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{children}</p>
    );
}

function KindSeg({ value, onChange }) {
    const opts = [
        { id: 'smart', label: 'Smart', tip: 'Scored highlights — hook, retention, value.' },
        { id: 'complete', label: 'Complete', tip: 'Finished thoughts, flexible length.' },
        { id: 'moments', label: 'Moments', tip: 'Random windows — fast, unscored.' },
        { id: 'timecut', label: 'Timecut', tip: 'Even slices of fixed length.' },
    ];
    return (
        <div className="flex h-8 w-full overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]" role="radiogroup" aria-label="Picking">
            {opts.map((o) => (
                <Tip key={o.id} label={o.tip} side="top" className="min-w-0 flex-1">
                    <button
                        type="button"
                        role="radio"
                        aria-checked={value === o.id}
                        onClick={() => onChange(o.id)}
                        className={cn(
                            'flex min-w-0 flex-1 items-center justify-center truncate text-[11px] transition-colors hover:bg-accent hover:text-foreground',
                            value === o.id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground',
                        )}
                    >
                        {o.label}
                    </button>
                </Tip>
            ))}
        </div>
    );
}

/** Duration mode picker: same segmented language as picking —
 *  one choice, three verbs, no dropdown. */
function DurSeg({ value, onChange }) {
    const opts = [
        { id: 'auto', label: 'Auto', tip: 'Engine default window, 15–90s per clip.' },
        { id: 'exact', label: 'Exact', tip: 'One length for every clip.' },
        { id: 'minmax', label: 'Min–Max', tip: 'Grow short picks, trim long ones.' },
    ];
    return (
        <div className="flex h-8 w-full overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]" role="radiogroup" aria-label="Duration">
            {opts.map((o) => (
                <Tip key={o.id} label={o.tip} side="top" className="min-w-0 flex-1">
                    <button
                        type="button"
                        role="radio"
                        aria-checked={value === o.id}
                        onClick={() => onChange(o.id)}
                        className={cn(
                            'flex min-w-0 flex-1 items-center justify-center truncate text-[11px] transition-colors hover:bg-accent hover:text-foreground',
                            value === o.id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground',
                        )}
                    >
                        {o.label}
                    </button>
                </Tip>
            ))}
        </div>
    );
}
/** Generic segmented control in the same language as the two above. */
function Seg({ label, value, options, onChange }) {
    return (
        <div className="flex h-8 w-full overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]" role="radiogroup" aria-label={label}>
            {options.map((o) => (
                <Tip key={o.id} label={o.tip} side="top" className="min-w-0 flex-1">
                    <button
                        type="button"
                        role="radio"
                        aria-checked={value === o.id}
                        aria-label={typeof o.label === 'string' ? undefined : o.tip}
                        onClick={() => onChange(o.id)}
                        className={cn(
                            'flex min-w-0 flex-1 items-center justify-center truncate text-[11px] transition-colors hover:bg-accent hover:text-foreground',
                            value === o.id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground',
                        )}
                    >
                        {o.label}
                    </button>
                </Tip>
            ))}
        </div>
    );
}

const ASPECT_OPTS = [
    { id: '9:16', label: '9:16', tip: 'Vertical: TikTok, Reels, Shorts.' },
    { id: '4:5', label: '4:5', tip: 'Portrait: Instagram and LinkedIn feeds.' },
    { id: '1:1', label: '1:1', tip: 'Square: any feed.' },
    { id: '16:9', label: '16:9', tip: 'Landscape: YouTube and X.' },
];

const CORNER_OPTS = [
    { id: 'tl', label: <ArrowUpLeft className="size-3.5" />, tip: 'Top-left corner.' },
    { id: 'tr', label: <ArrowUpRight className="size-3.5" />, tip: 'Top-right corner.' },
    { id: 'bl', label: <ArrowDownLeft className="size-3.5" />, tip: 'Bottom-left corner.' },
    { id: 'br', label: <ArrowDownRight className="size-3.5" />, tip: 'Bottom-right corner.' },
];

const LEVEL_OPTS = [
    { id: -22, label: 'Soft', tip: 'Barely there under the voice.' },
    { id: -16, label: 'Medium', tip: 'A clear bed that ducks under speech.' },
    { id: -10, label: 'Loud', tip: 'Up front; still ducks when someone talks.' },
];

const inputCls = 'flex h-8 w-full min-w-0 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-2.5 text-[12px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring';

const baseName = (p) => (p ? p.split(/[\\/]/).pop() : '');

/** One on/off row: switch, title, one-line hint. */
function SwitchRow({ checked, onChange, title, hint }) {
    return (
        <div className="flex items-center gap-2">
            <GpuToggle checked={!!checked} disabled={false} onChange={onChange} label={title} />
            <div className="min-w-0">
                <p className="text-[13px] font-medium">{title}</p>
                <p className="text-[11px] text-muted-foreground">{hint}</p>
            </div>
        </div>
    );
}

/** A file slot: pick button showing the chosen name, plus clear. */
function FileSlot({ icon: Icon, value, empty, pick, onChange }) {
    function browse() {
        pick().then((p) => { if (p) onChange(p); }).catch(() => {});
    }
    return (
        <div className="flex h-8 items-stretch gap-1">
            <button
                type="button"
                onClick={browse}
                title={value || undefined}
                className={cn(inputCls, 'items-center gap-1.5 text-left hover:bg-accent')}
            >
                <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className={cn('truncate', !value && 'text-muted-foreground')}>{value ? baseName(value) : empty}</span>
            </button>
            {value && (
                <Tip label="Remove" side="top">
                    <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => onChange('')}
                        className="shrink-0 rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="size-3.5" aria-hidden />
                    </button>
                </Tip>
            )}
        </div>
    );
}

/** Options popover for the upload card: same trigger/popover language
 *  as the pickers (digi-menu, pop/menu-out, floating panel). */
export default function OptionsButton({ options, onChange }) {
    const [open, setOpen] = useState(false);
    const { show: panelShow, leaving: panelLeaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const panelPos = useFloatingPanel(panelShow, rootRef, 6, 'right');

    useEffectClose(rootRef, panelRef, setOpen);
    const set = (k) => (v) => onChange({ [k]: v });

    return (
        <div ref={rootRef} className="relative">
            <Tip label="Job options" side="top">
                <button
                    type="button"
                    aria-label="Job options"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    onClick={() => setOpen((o) => !o)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <SlidersHorizontal className="size-4" aria-hidden />
                </button>
            </Tip>
            {panelShow && panelPos && createPortal(
                // Fixed width: the trigger is a small icon button, so the
                // hook's trigger-matched width would crush the panel into
                // a strip. Same digi-menu/pop language as the pickers.
                <div ref={panelRef} style={{ ...panelPos, width: 320 }} className={cn('digi-menu fixed z-[100] rounded-md border bg-popover p-2 text-popover-foreground shadow-md', panelLeaving ? 'menu-out' : 'pop')}>
                    <div className="digi-scroll max-h-[70dvh] space-y-2 overflow-y-auto pr-0.5">
                        <div className="space-y-1">
                            <Kicker>Picking</Kicker>
                            <KindSeg value={options.kind} onChange={set('kind')} />
                        </div>
                        <div className="space-y-1">
                            <Kicker>Clips (0 = auto)</Kicker>
                            <Stepper label="Clips" value={options.count} min={0} max={10} onChange={set('count')} compact />
                        </div>
                        <div className={cn('space-y-1', options.kind === 'timecut' && 'pointer-events-none opacity-50')}>
                            <Kicker>Duration</Kicker>
                            <DurSeg value={options.dur_mode} onChange={set('dur_mode')} />
                            {options.kind === 'timecut' ? (
                                <p className="text-[11px] text-muted-foreground">Timecut slices its own fixed length.</p>
                            ) : options.dur_mode === 'exact' ? (
                                <>
                                    <Stepper label="Exact clip length in seconds" value={options.dur_exact} min={5} max={300} onChange={set('dur_exact')} compact />
                                    <p className="text-[11px] text-muted-foreground">Final videos land exactly on it.</p>
                                </>
                            ) : options.dur_mode === 'minmax' ? (
                                <div className="grid grid-cols-2 gap-1.5">
                                    <div className="min-w-0 space-y-1">
                                        <p className="text-[10px] text-muted-foreground">Min (s)</p>
                                        <Stepper label="Minimum clip length in seconds" value={options.dur_min} min={5} max={300} onChange={(v) => onChange({ dur_min: v, ...(v > options.dur_max ? { dur_max: v } : {}) })} compact />
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                        <p className="text-[10px] text-muted-foreground">Max (s)</p>
                                        <Stepper label="Maximum clip length in seconds" value={options.dur_max} min={10} max={600} onChange={(v) => onChange({ dur_max: v, ...(v < options.dur_min ? { dur_min: v } : {}) })} compact />
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[11px] text-muted-foreground">Engine default: 15–90s per clip.</p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Kicker>Caption style</Kicker>
                            <CaptionPicker value={options.style} onChange={set('style')} compact />
                        </div>
                        <div className="space-y-1">
                            <Kicker>Tighten</Kicker>
                            <TightenSeg value={options.tighten} onChange={set('tighten')} compact />
                        </div>
                        <div className="flex items-center gap-2">
                            <GpuToggle checked={!!options.punch} disabled={false} onChange={set('punch')} label="Emphasis punch-ins" />
                            <div className="min-w-0">
                                <p className="text-[13px] font-medium">Punch-ins</p>
                                <p className="text-[11px] text-muted-foreground">Brief zoom on loud words.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <GpuToggle checked={!!options.merge_flash} disabled={false} onChange={set('merge_flash')} label="Merge flash joins" />
                            <div className="min-w-0">
                                <p className="text-[13px] font-medium">Merge flashes</p>
                                <p className="text-[11px] text-muted-foreground">White dips between compilation parts.</p>
                            </div>
                        </div>
                        <div className="space-y-1 border-t border-white/10 pt-2">
                            <Kicker>Focus</Kicker>
                            <input
                                type="text"
                                value={options.focus ?? ''}
                                onChange={(e) => onChange({ focus: e.target.value })}
                                placeholder="Topic to favour, e.g. pricing"
                                aria-label="Focus topic"
                                maxLength={120}
                                className={inputCls}
                            />
                            <p className="text-[11px] text-muted-foreground">Picks that talk about it rank first.</p>
                        </div>
                        <div className="space-y-1">
                            <Kicker>Aspect</Kicker>
                            <Seg label="Aspect" value={options.aspect ?? '9:16'} options={ASPECT_OPTS} onChange={set('aspect')} />
                        </div>
                        <div className="space-y-1.5">
                            <SwitchRow checked={options.headline} onChange={set('headline')} title="Headline" hint="Title card pinned at the top." />
                            {options.headline && (
                                <input
                                    type="text"
                                    value={options.headline_text ?? ''}
                                    onChange={(e) => onChange({ headline_text: e.target.value })}
                                    placeholder="Empty = each clip's own title"
                                    aria-label="Headline text"
                                    maxLength={80}
                                    className={inputCls}
                                />
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                                <SwitchRow checked={options.progress_bar} onChange={set('progress_bar')} title="Progress bar" hint="Thin bar filling along the bottom." />
                            </div>
                            {options.progress_bar && (
                                <Tip label="Bar colour" side="top">
                                    <input
                                        type="color"
                                        value={/^#[0-9a-f]{6}$/i.test(options.bar_color ?? '') ? options.bar_color : '#FFD400'}
                                        onChange={(e) => onChange({ bar_color: e.target.value.toUpperCase() })}
                                        aria-label="Progress bar colour"
                                        className="h-7 w-9 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent p-0.5"
                                    />
                                </Tip>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Kicker>Logo</Kicker>
                            <FileSlot icon={ImagePlus} value={options.logo} empty="Add a PNG or JPG…" pick={pickImage} onChange={set('logo')} />
                            {options.logo && (
                                <Seg label="Logo corner" value={options.logo_pos ?? 'tr'} options={CORNER_OPTS} onChange={set('logo_pos')} />
                            )}
                        </div>
                        <div className="space-y-1">
                            <Kicker>Music</Kicker>
                            <FileSlot icon={Music} value={options.music} empty="Add a music bed…" pick={pickAudio} onChange={set('music')} />
                            {options.music && (
                                <>
                                    <Seg label="Music level" value={options.music_db ?? -16} options={LEVEL_OPTS} onChange={set('music_db')} />
                                    <p className="text-[11px] text-muted-foreground">Loops to length and ducks under speech.</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>, document.body,
            )}
        </div>
    );
}

function useEffectClose(rootRef, panelRef, setOpen) {
    // Shared closer: Escape or outside-click shuts the panel.
    useEffect(() => {
        const onDown = (e) => {
            if (e.key === 'Escape') setOpen(false);
            if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onDown);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onDown);
        };
    }, [rootRef, panelRef, setOpen]);
}
