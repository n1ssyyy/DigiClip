import { GpuToggle, Stepper, Swatch, TightenSeg } from '../digiclip/controls';
import { CORNER_OPTS, DurSeg, KindSeg, LAYOUT_OPTS, LEVEL_OPTS, LogoSlot, MusicSlot, Seg, SwitchRow, inputCls } from '../digiclip/JobOptions';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import Field from './Field';

const HEX = /^#[0-9a-f]{6}$/i;

/** The controls the Home popover already has for these topics, moved
 *  into the inspector and bound to the same state. */

export function HeadlinePanel({ options, update }) {
    const t = useT();
    return (
        <div className="space-y-3">
            <SwitchRow checked={options.headline} onChange={(v) => update({ headline: v })} title={t('Headline')} hint={t('Title card pinned at the top.')} />
            {options.headline && (
                <Field label={t('Headline text')}>
                    <input
                        type="text"
                        value={options.headline_text ?? ''}
                        onChange={(e) => update({ headline_text: e.target.value })}
                        placeholder={t("Empty = each clip's own title")}
                        aria-label={t('Headline text')}
                        maxLength={80}
                        className={inputCls}
                    />
                </Field>
            )}
        </div>
    );
}

export function BarPanel({ options, update }) {
    const t = useT();
    return (
        <div className="space-y-3">
            <SwitchRow checked={options.progress_bar} onChange={(v) => update({ progress_bar: v })} title={t('Progress bar')} hint={t('Thin bar filling along the bottom.')} />
            {options.progress_bar && (
                <Field label={t('Bar colour')}>
                    <Swatch
                        label={t('Progress bar colour')}
                        value={HEX.test(options.bar_color ?? '') ? options.bar_color : '#FFD400'}
                        fallback="#FFD400"
                        onChange={(v) => update({ bar_color: v })}
                    />
                </Field>
            )}
        </div>
    );
}

export function LogoPanel({ options, update }) {
    const t = useT();
    return (
        <div className="space-y-3">
            <Field label={t('Logo')}>
                <LogoSlot value={options.logo} onChange={(v) => update({ logo: v })} />
            </Field>
            {options.logo && (
                <Field label={t('Logo corner')}>
                    <Seg label={t('Logo corner')} value={options.logo_pos ?? 'tr'} options={CORNER_OPTS} onChange={(v) => update({ logo_pos: v })} />
                </Field>
            )}
        </div>
    );
}

export function MusicPanel({ options, update }) {
    const t = useT();
    return (
        <div className="space-y-3">
            <Field label={t('Music')}>
                <MusicSlot value={options.music} onChange={(v) => update({ music: v })} />
            </Field>
            {options.music && (
                <Field label={t('Music level')} hint={t('Loops to length and ducks under speech.')}>
                    <Seg label={t('Music level')} value={options.music_db ?? -16} options={LEVEL_OPTS} onChange={(v) => update({ music_db: v })} />
                </Field>
            )}
        </div>
    );
}

export function LayoutPanel({ options, update }) {
    const t = useT();
    return (
        <Field label={t('Layout')}>
            <Seg label={t('Layout')} value={options.layout ?? 'single'} options={LAYOUT_OPTS} onChange={(v) => update({ layout: v })} />
        </Field>
    );
}

export function ClipsPanel({ options, update }) {
    const t = useT();
    const set = (k) => (v) => update({ [k]: v });
    return (
        <div className="space-y-4">
            <Field label={t('Picking')}>
                <KindSeg value={options.kind} onChange={set('kind')} />
            </Field>
            <Field label={t('Clips (0 = auto)')}>
                <Stepper label={t('Clips')} value={options.count} min={0} max={10} onChange={set('count')} compact />
            </Field>
            <div className={cn(options.kind === 'timecut' && 'pointer-events-none opacity-50')}>
                <Field label={t('Duration')}>
                    <div className="space-y-1.5">
                        <DurSeg value={options.dur_mode} onChange={set('dur_mode')} />
                        {options.kind === 'timecut' ? (
                            <p className="text-[11px] text-muted-foreground">{t('Timecut slices its own fixed length.')}</p>
                        ) : options.dur_mode === 'exact' ? (
                            <>
                                <Stepper label={t('Exact clip length in seconds')} value={options.dur_exact} min={5} max={300} onChange={set('dur_exact')} compact />
                                <p className="text-[11px] text-muted-foreground">{t('Final videos land exactly on it.')}</p>
                            </>
                        ) : options.dur_mode === 'minmax' ? (
                            <div className="grid grid-cols-2 gap-1.5">
                                <div className="min-w-0 space-y-1">
                                    <p className="text-[10px] text-muted-foreground">{t('Min (s)')}</p>
                                    <Stepper label={t('Minimum clip length in seconds')} value={options.dur_min} min={5} max={300} onChange={(v) => update({ dur_min: v, ...(v > options.dur_max ? { dur_max: v } : {}) })} compact />
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <p className="text-[10px] text-muted-foreground">{t('Max (s)')}</p>
                                    <Stepper label={t('Maximum clip length in seconds')} value={options.dur_max} min={10} max={600} onChange={(v) => update({ dur_max: v, ...(v < options.dur_min ? { dur_min: v } : {}) })} compact />
                                </div>
                            </div>
                        ) : (
                            <p className="text-[11px] text-muted-foreground">{t('Engine default: 15–90s per clip.')}</p>
                        )}
                    </div>
                </Field>
            </div>
            <Field label={t('Tighten')}>
                <TightenSeg value={options.tighten} onChange={set('tighten')} compact />
            </Field>
            <div className="flex items-center gap-2">
                <GpuToggle checked={!!options.punch} disabled={false} onChange={set('punch')} label={t('Emphasis punch-ins')} />
                <div className="min-w-0">
                    <p className="text-[13px] font-medium">{t('Punch-ins')}</p>
                    <p className="text-[11px] text-muted-foreground">{t('Brief zoom on loud words.')}</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <GpuToggle checked={!!options.merge_flash} disabled={false} onChange={set('merge_flash')} label={t('Merge flash joins')} />
                <div className="min-w-0">
                    <p className="text-[13px] font-medium">{t('Merge flashes')}</p>
                    <p className="text-[11px] text-muted-foreground">{t('White dips between compilation parts.')}</p>
                </div>
            </div>
            <Field label={t('Focus')} hint={t('Picks that talk about it rank first.')}>
                <input
                    type="text"
                    value={options.focus ?? ''}
                    onChange={(e) => update({ focus: e.target.value })}
                    placeholder={t('Topic to favour, e.g. pricing')}
                    aria-label={t('Focus topic')}
                    maxLength={120}
                    className={inputCls}
                />
            </Field>
        </div>
    );
}

/** Camera and Effects wait for the engine. */
export function SoonPanel() {
    const t = useT();
    return <p className="text-[12px] text-muted-foreground">{t('Coming with the next engine update.')}</p>;
}
