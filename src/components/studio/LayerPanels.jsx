import { GpuToggle, Segmented, Slider, Stepper, Swatch, TightenSeg } from '../digiclip/controls';
import { CORNER_OPTS, DurSeg, KindSeg, LAYOUT_OPTS, LEVEL_OPTS, LogoSlot, MusicSlot, Seg, SwitchRow, inputCls } from '../digiclip/JobOptions';
import { aspectList } from '../../lib/look';
import { resolveHeadline, resolveLogo, stageHeadline } from '../../lib/layers';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import Field, { ResetButton } from './Field';
import PlaceField from './PlaceField';
import { CapNotice } from './Notice';

const HEX = /^#[0-9a-f]{6}$/i;

/** The controls the Home popover already has for these topics, moved
 *  into the inspector and bound to the same state. */

const pct = (v) => `${Math.round(v * 100)}%`;
const hasKeys = (o) => Object.keys(o ?? {}).length > 0;

const HEADLINE_ANIM_OPTS = [
    { id: 'pop', label: 'Pop' },
    { id: 'fade', label: 'Fade' },
    { id: 'none', label: 'None' },
];
const SCREEN_OPTS = [
    { id: 'whole', label: 'Whole clip' },
    { id: 'seconds', label: 'Seconds' },
];
const BAR_POS_OPTS = [
    { id: 'bottom', label: 'Bottom' },
    { id: 'top', label: 'Top' },
];

/** The Headline inspector: the title card's text, place, size, colours,
 *  entrance and time on screen. */
export function HeadlinePanel({ options, update, setHeadline, reset }) {
    const t = useT();
    const L = options.look?.headline ?? {};
    const canvas = aspectList(options.aspect)[0];
    const text = stageHeadline(options.headline_text);
    const r = resolveHeadline(text, canvas, L);
    const has = (k) => L[k] !== undefined;
    const clear = (...keys) => () => setHeadline(Object.fromEntries(keys.map((k) => [k, undefined])));
    const inkFallback = resolveHeadline(text, canvas, { ...L, ink: undefined }).ink;
    const accentFallback = resolveHeadline(text, canvas, { ...L, accent: undefined }).accent;
    const cardOn = !r.noCard;
    const timed = L.seconds > 0;
    return (
        <div className="space-y-4">
            <CapNotice cap="look.headline" text={t('This engine is older than Studio. Placement, size and colours apply after the next engine update.')} />
            <SwitchRow checked={options.headline} onChange={(v) => update({ headline: v })} title={t('Headline')} hint={t('Title card pinned at the top.')} />
            {options.headline && (
                <>
                    <Field label={t('Headline text')} hint={t('The stage shows a sample title while this is empty; each clip uses its own title.')}>
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

                    <PlaceField
                        center={r.center}
                        placed={r.placed}
                        onPlace={(x, y) => setHeadline({ x, y })}
                        onReset={clear('x', 'y')}
                    />

                    <Field label={t('Size')} set={has('size')} onReset={clear('size')}>
                        <Slider
                            label={t('Headline size')}
                            value={L.size ?? 1}
                            min={0.5}
                            max={2}
                            step={0.05}
                            bigStep={0.25}
                            format={pct}
                            dim={!has('size')}
                            defaultValue={1}
                            onReset={clear('size')}
                            onChange={(v) => setHeadline({ size: v })}
                        />
                    </Field>

                    <Field label={t('Colours')}>
                        <div className="space-y-1.5">
                            {[
                                ['ink', t('Ink'), inkFallback],
                                ['accent', t('Accent'), accentFallback],
                            ].map(([k, name, fallback]) => (
                                <div key={k} className="grid grid-cols-[64px_1fr] items-center gap-2">
                                    <span className="truncate text-[11px] text-muted-foreground">{name}</span>
                                    <Swatch
                                        label={name}
                                        resetLabel={t('Reset {name}', { name })}
                                        value={L[k]}
                                        fallback={fallback}
                                        onChange={(v) => setHeadline({ [k]: v })}
                                        onReset={clear(k)}
                                    />
                                </div>
                            ))}
                        </div>
                    </Field>

                    <Field label={t('Card')} set={has('card')} onReset={clear('card')} hint={cardOn ? undefined : t('Without a card the type gets an outline.')}>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <GpuToggle checked={cardOn} disabled={false} onChange={(on) => setHeadline({ card: on ? undefined : 'none' })} label={t('Card behind the text')} />
                                <span className="text-[11px] text-muted-foreground">{cardOn ? t('Card behind the text') : t('No card')}</span>
                            </div>
                            {cardOn && (
                                <Swatch
                                    label={t('Card colour')}
                                    resetLabel={t('Reset {name}', { name: t('Card colour') })}
                                    value={L.card && L.card !== 'none' ? L.card : undefined}
                                    fallback="#FFFFFF"
                                    onChange={(v) => setHeadline({ card: v })}
                                    onReset={clear('card')}
                                />
                            )}
                        </div>
                    </Field>

                    <Field label={t('Entrance')} set={has('anim')} onReset={clear('anim')}>
                        <Segmented label={t('Headline entrance')} size="sm" value={r.anim} options={HEADLINE_ANIM_OPTS} dim={!has('anim')} onChange={(v) => setHeadline({ anim: v })} />
                    </Field>

                    <Field label={t('On screen')} set={has('seconds')} onReset={clear('seconds')}>
                        <div className="space-y-1.5">
                            <Segmented label={t('Time on screen')} size="sm" value={timed ? 'seconds' : 'whole'} options={SCREEN_OPTS} dim={!has('seconds')} onChange={(v) => setHeadline({ seconds: v === 'whole' ? undefined : (timed ? L.seconds : 3) })} />
                            {timed && (
                                <Stepper label={t('Seconds on screen')} value={L.seconds} min={1} max={600} onChange={(v) => setHeadline({ seconds: v })} compact />
                            )}
                        </div>
                    </Field>

                    <ResetButton disabled={!hasKeys(L)} onClick={() => reset('headline')}>{t('Reset headline')}</ResetButton>
                </>
            )}
        </div>
    );
}

/** The Progress bar inspector: colour, which edge, thickness. */
export function BarPanel({ options, update, setBar, reset }) {
    const t = useT();
    const L = options.look?.bar ?? {};
    const has = (k) => L[k] !== undefined;
    const clear = (...keys) => () => setBar(Object.fromEntries(keys.map((k) => [k, undefined])));
    return (
        <div className="space-y-4">
            <CapNotice cap="look.bar" text={t('This engine is older than Studio. Placement and thickness apply after the next engine update.')} />
            <SwitchRow checked={options.progress_bar} onChange={(v) => update({ progress_bar: v })} title={t('Progress bar')} hint={t('Thin bar filling along the bottom.')} />
            {options.progress_bar && (
                <>
                    <Field label={t('Bar colour')}>
                        <Swatch
                            label={t('Progress bar colour')}
                            value={HEX.test(options.bar_color ?? '') ? options.bar_color : '#FFD400'}
                            fallback="#FFD400"
                            onChange={(v) => update({ bar_color: v })}
                        />
                    </Field>

                    <Field label={t('Place')} set={has('pos')} onReset={clear('pos')} hint={t('Drag the bar on the stage past the middle to flip it.')}>
                        <Segmented label={t('Bar place')} size="sm" value={L.pos === 'top' ? 'top' : 'bottom'} options={BAR_POS_OPTS} dim={!has('pos')} onChange={(v) => setBar({ pos: v === 'top' ? 'top' : undefined })} />
                    </Field>

                    <Field label={t('Thickness')} set={has('height')} onReset={clear('height')}>
                        <Slider
                            label={t('Bar thickness')}
                            value={L.height ?? 1}
                            min={0.5}
                            max={3}
                            step={0.05}
                            bigStep={0.25}
                            format={pct}
                            dim={!has('height')}
                            defaultValue={1}
                            onReset={clear('height')}
                            onChange={(v) => setBar({ height: v })}
                        />
                    </Field>

                    <ResetButton disabled={!hasKeys(L)} onClick={() => reset('bar')}>{t('Reset progress bar')}</ResetButton>
                </>
            )}
        </div>
    );
}

/** The Logo inspector: the file, a corner or a free place, size, opacity. */
export function LogoPanel({ options, update, setLogo, edit, reset }) {
    const t = useT();
    const L = options.look?.logo ?? {};
    const canvas = aspectList(options.aspect)[0];
    const file = !!options.logo;
    const r = resolveLogo(canvas, options.logo_pos, L, null);
    const has = (k) => L[k] !== undefined;
    const clear = (...keys) => () => setLogo(Object.fromEntries(keys.map((k) => [k, undefined])));
    return (
        <div className="space-y-4">
            <CapNotice cap="look.logo" text={t('This engine is older than Studio. Placement, size and opacity apply after the next engine update.')} />
            <Field label={t('Logo')} hint={file ? undefined : t('Add a logo to place and size it.')}>
                <LogoSlot value={options.logo} onChange={(v) => update({ logo: v })} />
            </Field>

            <div className={cn('space-y-4', !file && 'pointer-events-none opacity-50')} aria-disabled={!file || undefined}>
                <Field label={t('Logo corner')}>
                    <Seg
                        label={t('Logo corner')}
                        value={r.free ? null : (options.logo_pos ?? 'tr')}
                        options={CORNER_OPTS}
                        onChange={(v) => edit({ logo_pos: v }, { logo: { x: undefined, y: undefined } })}
                    />
                </Field>

                <PlaceField
                    center={r.center}
                    placed={r.free}
                    grid={false}
                    disabled={!file}
                    onPlace={(x, y) => setLogo({ x, y })}
                    onReset={clear('x', 'y')}
                />

                <Field label={t('Size')} set={has('size')} onReset={clear('size')}>
                    <Slider
                        label={t('Logo size')}
                        value={L.size ?? 1}
                        min={0.4}
                        max={2.5}
                        step={0.05}
                        bigStep={0.25}
                        format={pct}
                        dim={!has('size')}
                        disabled={!file}
                        defaultValue={1}
                        onReset={clear('size')}
                        onChange={(v) => setLogo({ size: v })}
                    />
                </Field>

                <Field label={t('Opacity')} set={has('opacity')} onReset={clear('opacity')}>
                    <Slider
                        label={t('Logo opacity')}
                        value={L.opacity ?? 0.9}
                        min={0}
                        max={1}
                        step={0.05}
                        bigStep={0.25}
                        format={pct}
                        dim={!has('opacity')}
                        disabled={!file}
                        onReset={clear('opacity')}
                        onChange={(v) => setLogo({ opacity: v })}
                    />
                </Field>
            </div>

            <ResetButton disabled={!hasKeys(L)} onClick={() => reset('logo')}>{t('Reset logo')}</ResetButton>
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
