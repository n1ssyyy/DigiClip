import { Camera, Captions, Columns2, Eye, EyeOff, Gauge, Heading, ImagePlus, Music, Scissors, Sparkles } from 'lucide-react';
import { Card } from '../ui/card';
import Tip from '../digiclip/Tooltip';
import { Kicker, baseName } from '../digiclip/JobOptions';
import { sceneSummary } from '../../lib/sceneSummary';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';

const KIND_LABEL = { smart: 'Smart', complete: 'Complete', moments: 'Moments', timecut: 'Timecut' };

/** The rows of the Layers pane, grouped. `eye` rows have an on/off
 *  state of their own; `file` rows are on once a file is chosen. */
export const LAYER_GROUPS = [
    { label: 'Layers', rows: [
        { id: 'captions', name: 'Captions', icon: Captions, eye: 'captions' },
        { id: 'headline', name: 'Headline', icon: Heading, eye: 'flag' },
        { id: 'bar', name: 'Progress bar', icon: Gauge, eye: 'flag' },
        { id: 'logo', name: 'Logo', icon: ImagePlus, eye: 'file' },
        { id: 'music', name: 'Music', icon: Music, eye: 'file' },
    ] },
    { label: 'Scene', rows: [
        { id: 'camera', name: 'Camera', icon: Camera },
        { id: 'layout', name: 'Layout', icon: Columns2 },
        { id: 'effects', name: 'Effects', icon: Sparkles },
    ] },
    { label: 'Cut', rows: [
        { id: 'clips', name: 'Clips', icon: Scissors },
    ] },
];

/** The layers' on/off state, as the existing options keep it. */
export function layerOn(id, o) {
    switch (id) {
        case 'captions': return o.look?.captions?.show !== false;
        case 'headline': return !!o.headline;
        case 'bar': return !!o.progress_bar;
        case 'logo': return !!o.logo;
        case 'music': return !!o.music;
        default: return false;
    }
}

function summary(id, o, t) {
    switch (id) {
        case 'captions': {
            if (o.look?.captions?.show === false) return t('Hidden');
            return `${o.style} · ${Math.round((o.look?.captions?.size ?? 1) * 100)}%`;
        }
        case 'headline': {
            if (!o.headline) return t('Off');
            const size = o.look?.headline?.size;
            return `${(o.headline_text ?? '').trim() || t("The clip's own title")}${size !== undefined ? ` · ${Math.round(size * 100)}%` : ''}`;
        }
        case 'bar': {
            if (!o.progress_bar) return t('Off');
            const b = o.look?.bar;
            return `${t(b?.pos === 'top' ? 'Top' : 'Bottom')} · ${Math.round((b?.height ?? 1) * 100)}%`;
        }
        case 'logo': {
            if (!o.logo) return t('No file');
            const size = o.look?.logo?.size;
            return `${baseName(o.logo)}${size !== undefined ? ` · ${Math.round(size * 100)}%` : ''}`;
        }
        case 'music': return o.music ? baseName(o.music) : t('No file');
        case 'camera': case 'layout': case 'effects': return sceneSummary(id, o, t);
        case 'clips': return `${o.count > 0 ? t('{n} clips', { n: o.count }) : t('Auto')} · ${t(KIND_LABEL[o.kind] ?? 'Smart')}`;
        default: return '';
    }
}

function EyeButton({ row, options, update, setCaptions }) {
    const t = useT();
    const on = layerOn(row.id, options);
    const fixed = row.eye === 'file';
    let label;
    if (fixed) label = on ? t('Remove the file in the inspector to switch it off.') : t('Add a file in the inspector first.');
    else label = on ? t('Hide {name}', { name: t(row.name) }) : t('Show {name}', { name: t(row.name) });
    function toggle() {
        if (fixed) return;
        if (row.id === 'captions') setCaptions({ show: on ? false : undefined });
        else if (row.id === 'headline') update({ headline: !on });
        else if (row.id === 'bar') update({ progress_bar: !on });
    }
    const Icon = on ? Eye : EyeOff;
    return (
        <Tip label={label} side="left">
            <button
                type="button"
                aria-label={label}
                aria-pressed={fixed ? undefined : on}
                aria-disabled={fixed || undefined}
                onClick={toggle}
                className={cn(
                    'mr-1 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    fixed ? 'cursor-not-allowed text-muted-foreground/50' : on ? 'text-foreground hover:bg-white/[0.08]' : 'text-muted-foreground hover:bg-white/[0.08] hover:text-foreground',
                )}
            >
                <Icon className="size-3.5" aria-hidden />
            </button>
        </Tip>
    );
}

/** Left pane: what the Look is made of. Picking a row picks what the
 *  inspector edits. Under 1000px it shrinks to icons. */
export default function Layers({ options, selected, onSelect, update, setCaptions, narrow }) {
    const t = useT();
    return (
        <Card className={cn('digi-scroll stagger-1 min-h-0 shrink-0 overflow-y-auto', narrow ? 'w-[52px] p-1.5' : 'w-[232px] p-2')}>
            <nav aria-label={t('Layers')} className="flex flex-col gap-3">
                {LAYER_GROUPS.map((g) => (
                    <div key={g.label} className="flex flex-col gap-0.5">
                        {narrow
                            ? <span aria-hidden className="mx-1 mb-0.5 h-px bg-white/[0.08]" />
                            : <div className="px-2 pb-1"><Kicker>{t(g.label)}</Kicker></div>}
                        {g.rows.map((row) => {
                            const on = row.id === selected;
                            const Icon = row.icon;
                            const sum = summary(row.id, options, t);
                            const main = (
                                <button
                                    type="button"
                                    onClick={() => onSelect(row.id)}
                                    aria-current={on ? 'true' : undefined}
                                    aria-label={narrow ? `${t(row.name)}, ${sum}` : undefined}
                                    className={cn(
                                        'flex h-10 min-w-0 flex-1 items-center rounded-md text-left transition-[color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                        narrow ? 'justify-center' : 'gap-2.5 px-2.5',
                                        on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    <Icon className="size-3.5 shrink-0" aria-hidden />
                                    {!narrow && (
                                        <span className="min-w-0 flex-1">
                                            <span className={cn('block truncate text-[12px] leading-tight', on && 'font-medium')}>{t(row.name)}</span>
                                            <span className="block truncate text-[10px] leading-tight text-muted-foreground">{sum}</span>
                                        </span>
                                    )}
                                </button>
                            );
                            return (
                                <div
                                    key={row.id}
                                    className={cn(
                                        'flex items-center rounded-md transition-[color,background-color] duration-150',
                                        on ? 'border-t border-white/10 bg-accent shadow-[0_1px_3px_rgb(0_0_0/0.4)]' : 'hover:bg-white/[0.04]',
                                    )}
                                >
                                    {narrow ? <Tip label={`${t(row.name)} · ${sum}`} side="right" className="flex-1">{main}</Tip> : main}
                                    {!narrow && row.eye && <EyeButton row={row} options={options} update={update} setCaptions={setCaptions} />}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </nav>
        </Card>
    );
}
