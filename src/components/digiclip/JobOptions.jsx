import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';
import Tip from './Tooltip';
import CaptionPicker from './CaptionPicker';
import { GpuToggle, Stepper, TightenSeg } from './controls';
import { usePanelBeat } from './usePanelBeat';
import { useFloatingPanel } from './useFloatingPanel';

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
    };
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
                            'flex-1 text-[11px] transition-colors hover:bg-accent hover:text-foreground',
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
                            'flex-1 text-[11px] transition-colors hover:bg-accent hover:text-foreground',
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
