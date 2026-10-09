import { Stepper, TightenSeg } from '../digiclip/controls';
import { DurSeg, KindSeg, LEVEL_OPTS, MusicSlot, Seg, inputCls } from '../digiclip/fields';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import Field from './Field';
import ExtraShapes from './ExtraShapes';

/** The music and clips panels of the inspector. (The other layers have
 *  panels of their own in headline/, bar/, logo/, camera/, layout/ and effects/.) */

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
            <Field label={t('Also make')} hint={t('One run then makes each clip in every chosen shape.')}>
                <ExtraShapes aspect={options.aspect} onChange={set('aspect')} />
            </Field>
        </div>
    );
}
