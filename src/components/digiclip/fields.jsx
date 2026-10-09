import { ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight, ChevronDown, ImagePlus, Music, X } from 'lucide-react';
import { cn, baseName } from '../../lib/utils';
import Tip from './Tooltip';
import Dropdown from './Dropdown';
import { GpuToggle, Segmented } from './controls';
import { pickAudio, pickImage } from '../../lib/native';
import { useT } from '../../lib/i18n';

// The small controls Studio's panels are made of: labels, segmented choices,
// switches, file slots and the dropdown, in the panel input look.

export function Kicker({ children }) {
    return (
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{children}</p>
    );
}

export function KindSeg({ value, onChange }) {
    const t = useT();
    return (
        <Segmented
            label={t('Picking')}
            size="sm"
            value={value}
            onChange={onChange}
            options={[
                { id: 'smart', label: 'Smart', tip: 'Scored highlights — hook, retention, value.' },
                { id: 'complete', label: 'Complete', tip: 'Finished thoughts, flexible length.' },
                { id: 'moments', label: 'Moments', tip: 'Random windows — fast, unscored.' },
                { id: 'timecut', label: 'Timecut', tip: 'Even slices of fixed length.' },
            ]}
        />
    );
}

/** Duration mode picker: same segmented language as picking —
 *  one choice, three verbs, no dropdown. */
export function DurSeg({ value, onChange }) {
    const t = useT();
    return (
        <Segmented
            label={t('Duration')}
            size="sm"
            value={value}
            onChange={onChange}
            options={[
                { id: 'auto', label: 'Auto', tip: 'Engine default window, 15–90s per clip.' },
                { id: 'exact', label: 'Exact', tip: 'One length for every clip.' },
                { id: 'minmax', label: 'Min–Max', tip: 'Grow short picks, trim long ones.' },
            ]}
        />
    );
}

/** Generic segmented control in the same language as the two above. */
export function Seg({ label, value, options, onChange }) {
    return <Segmented label={label} size="sm" value={value} options={options} onChange={onChange} />;
}

export const ASPECT_OPTS = [
    { id: '9:16', label: '9:16', tip: 'Vertical: TikTok, Reels, Shorts.' },
    { id: '4:5', label: '4:5', tip: 'Portrait: Instagram and LinkedIn feeds.' },
    { id: '1:1', label: '1:1', tip: 'Square: any feed.' },
    { id: '16:9', label: '16:9', tip: 'Landscape: YouTube and X.' },
];

export const CORNER_OPTS = [
    { id: 'tl', label: <ArrowUpLeft className="size-3.5" />, tip: 'Top-left corner.' },
    { id: 'tr', label: <ArrowUpRight className="size-3.5" />, tip: 'Top-right corner.' },
    { id: 'bl', label: <ArrowDownLeft className="size-3.5" />, tip: 'Bottom-left corner.' },
    { id: 'br', label: <ArrowDownRight className="size-3.5" />, tip: 'Bottom-right corner.' },
];

export const LEVEL_OPTS = [
    { id: -22, label: 'Soft', tip: 'Barely there under the voice.' },
    { id: -16, label: 'Medium', tip: 'A clear bed that ducks under speech.' },
    { id: -10, label: 'Loud', tip: 'Up front; still ducks when someone talks.' },
];

export const LAYOUT_OPTS = [
    { id: 'single', label: 'Single', tip: 'Follow one speaker.' },
    { id: 'split', label: 'Split', tip: 'Two people stacked, captions on the seam.' },
    { id: 'auto', label: 'Auto', tip: 'Split when two people share the frame.' },
];

export const inputCls = 'flex h-8 w-full min-w-0 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-2.5 text-[12px] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring';

/** One on/off row: switch, title, one-line hint. */
export function SwitchRow({ checked, onChange, title, hint }) {
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
export function FileSlot({ icon: Icon, value, empty, pick, onChange }) {
    const t = useT();
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
                <Tip label={t('Remove')} side="top">
                    <button
                        type="button"
                        aria-label={t('Remove')}
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

/** The logo and music slots of the Studio inspector. */
export function LogoSlot({ value, onChange }) {
    const t = useT();
    return <FileSlot icon={ImagePlus} value={value} empty={t('Add a PNG or JPG…')} pick={pickImage} onChange={onChange} />;
}

export function MusicSlot({ value, onChange }) {
    const t = useT();
    return <FileSlot icon={Music} value={value} empty={t('Add a music bed…')} pick={pickAudio} onChange={onChange} />;
}

/** A single choice in the panel's input look, opening the app's dropdown list.
 *  `options`: `[id, name]` pairs, the name translated here. */
export function Select({ label, value, options, onChange }) {
    const t = useT();
    return (
        <Dropdown
            label={label}
            value={value}
            options={options.map(([id, name]) => ({ value: id, text: t(name) }))}
            onChange={onChange}
            className={cn(inputCls, 'items-center justify-between gap-2 text-left hover:bg-accent/60')}
        >
            {({ open, current }) => (
                <>
                    <span className="min-w-0 truncate">{current?.text}</span>
                    <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
                </>
            )}
        </Dropdown>
    );
}
