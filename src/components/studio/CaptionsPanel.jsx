import { Stepper, GpuToggle, Segmented, Slider, Swatch } from '../digiclip/controls';
import { SUBS_LANGS, aspectList, captionsSet } from '../../lib/look';
import { BOX_PAD, CAPTION_STYLES, FONTS, STYLES, fontBox, outlineRing, resolveCaptions, rgba, validStyle } from '../../lib/captionStyles';
import { Select, SwitchRow } from '../digiclip/JobOptions';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import Field from './Field';
import PlaceField from './PlaceField';
import { CapNotice } from './Notice';

const pct = (v) => `${Math.round(v * 100)}%`;
const px1 = (v) => `${Math.round(v * 10) / 10}px`;

const FONT_LABEL = { 'Anton': 'Anton', 'Archivo Black': 'Archivo Black', 'Inter Medium': 'Inter', 'JetBrains Mono': 'JetBrains Mono' };

const MOTION_ROWS = [
    { id: 'pop', label: 'Pop', tip: 'Lines pop in, keywords bump as they are spoken.' },
    { id: 'words', label: 'Word by word', tip: 'Pop, and each word appears as it is spoken.' },
    { id: 'none', label: 'Static', tip: 'No motion: lines cut in and out.' },
    { id: 'fade', label: 'Fade', tip: 'Lines fade in and out, with no pop.' },
    { id: 'slide', label: 'Slide', tip: 'Lines rise a little into place as they fade in.' },
    { id: 'bounce', label: 'Bounce', tip: 'A bigger pop with a second small settle.' },
];

const CASE_OPTS = [
    { id: 'upper', label: 'ABC', tip: 'All capitals.' },
    { id: 'asis', label: 'Abc', tip: 'The words as they were spoken.' },
];

/** One style drawn in its own look: a small caption sample. */
function StyleTile({ id, on, onPick }) {
    const r = resolveCaptions(id, '9:16', {});
    const scale = 0.17;
    const fb = fontBox(r.font, r.fontPx * scale);
    const ring = r.outline && r.outline.width > 0 ? outlineRing(Math.max(0.6, r.outline.width * scale * 1.5), r.outline.color) : undefined;
    const word = (text, color) => ({ text: r.caps ? text.toUpperCase() : text, color });
    const words = [word('Never', r.accent), word('stop', r.active), word('now', r.color)];
    const shadow = r.shadow > 0 ? `drop-shadow(1px 1px 0 ${rgba(r.shadowColor, r.shadowOpacity)})` : undefined;
    return (
        <button
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={id}
            onClick={onPick}
            className={cn(
                'group flex min-w-0 flex-col items-stretch gap-1 rounded-md border p-1 text-left transition-[background-color,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                on ? 'border-white/40 bg-accent' : 'border-white/[0.07] hover:bg-white/[0.04]',
            )}
        >
            <span className="flex h-11 items-center justify-center overflow-hidden rounded bg-[#0d0d0f]" aria-hidden>
                <span
                    style={{
                        fontFamily: `'${r.font}', sans-serif`,
                        fontSize: fb.em,
                        lineHeight: `${fb.lineH}px`,
                        whiteSpace: 'nowrap',
                        filter: shadow,
                        ...(r.box ? { backgroundColor: r.box.color, padding: '1px 5px' } : {}),
                    }}
                >
                    {words.map((w, i) => (
                        <span key={i} style={{ color: w.color, textShadow: ring }}>{i > 0 ? ' ' : ''}{w.text}</span>
                    ))}
                </span>
            </span>
            <span className={cn('truncate px-0.5 font-mono text-[10px]', on ? 'text-foreground' : 'text-muted-foreground')}>{id}</span>
        </button>
    );
}

/** The Captions inspector: every caption control of the Look. */
export default function CaptionsPanel({ options, update, setCaptions, reset }) {
    const t = useT();
    const L = options.look?.captions ?? {};
    const styleId = validStyle(options.style);
    const st = STYLES[styleId];
    const canvas = aspectList(options.aspect)[0];
    const flat = { anim: options.caption_anim };
    const r = resolveCaptions(styleId, canvas, L, flat);
    const base = resolveCaptions(styleId, canvas, {}, flat);
    const has = (k) => L[k] !== undefined;
    const clear = (...keys) => () => setCaptions(Object.fromEntries(keys.map((k) => [k, undefined])));

    const spokenFallback = resolveCaptions(styleId, canvas, { ...L, active: undefined }, flat).active;
    const outlineFallback = resolveCaptions(styleId, canvas, { ...L, box: 'none', outline: undefined }, flat).outline.color;
    const boxFallback = r.box?.color ?? '#000000';

    // Outline width in the Look's units (px at a 1080-wide frame).
    const outlineDefault = r.box ? (st.border === 3 ? st.outlineW : BOX_PAD) : st.outlineW;
    const outlineShown = L.outline_w ?? outlineDefault;
    const shadowShown = L.shadow ?? st.shadow;

    function toggleBox(on) {
        if (on) {
            // Back to the style's own box, or a new black one.
            if (base.box) setCaptions({ box: undefined, box_opacity: undefined });
            else setCaptions({ box: '#000000', box_opacity: 0.6 });
        } else if (base.box) {
            setCaptions({ box: 'none', box_opacity: undefined });
        } else {
            setCaptions({ box: undefined, box_opacity: undefined });
        }
    }

    return (
        <div className="space-y-4">
            <CapNotice cap="look.captions" text={t('This engine is older than Studio. Position, size, colour and the new motions apply after the next engine update.')} />
            <SwitchRow
                checked={r.show}
                onChange={(v) => setCaptions({ show: v ? undefined : false })}
                title={t('Show captions')}
                hint={t('Turn off for a clip without captions.')}
            />

            <Field label={t('Style')}>
                <div role="radiogroup" aria-label={t('Caption style')} className="grid grid-cols-2 gap-1.5">
                    {CAPTION_STYLES.map((id) => (
                        <StyleTile key={id} id={id} on={id === styleId} onPick={() => update({ style: id })} />
                    ))}
                </div>
            </Field>

            <Field label={t('Font')} set={has('font')} onReset={clear('font')}>
                <div role="radiogroup" aria-label={t('Font')} className="grid grid-cols-2 gap-1.5">
                    {FONTS.map((f) => {
                        const on = f === r.font;
                        return (
                            <button
                                key={f}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => setCaptions({ font: f })}
                                style={{ fontFamily: `'${f}', sans-serif` }}
                                className={cn(
                                    'flex h-9 min-w-0 items-center justify-center truncate rounded-md border px-2 text-[14px] transition-[background-color,border-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                    on
                                        ? (has('font') ? 'border-white/40 bg-accent text-foreground' : 'border-white/[0.14] bg-accent/60 text-muted-foreground')
                                        : 'border-white/[0.07] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                                )}
                            >
                                {FONT_LABEL[f]}
                            </button>
                        );
                    })}
                </div>
            </Field>

            <Field label={t('Size')} set={has('size')} onReset={clear('size')}>
                <Slider
                    label={t('Caption size')}
                    value={L.size ?? 1}
                    min={0.5}
                    max={2}
                    step={0.05}
                    bigStep={0.25}
                    format={pct}
                    dim={!has('size')}
                    defaultValue={1}
                    onReset={clear('size')}
                    onChange={(v) => setCaptions({ size: v })}
                />
            </Field>

            <Field label={t('Case')} set={has('case')} onReset={clear('case')}>
                <Segmented label={t('Case')} size="sm" value={r.caps ? 'upper' : 'asis'} options={CASE_OPTS} dim={!has('case')} onChange={(v) => setCaptions({ case: v })} />
            </Field>

            <Field label={t('Colours')}>
                <div className="space-y-1.5">
                    {[
                        ['color', t('Text'), base.color],
                        ['active', t('Spoken'), spokenFallback],
                        ['accent', t('Keyword'), base.accent],
                    ].map(([k, name, fallback]) => (
                        <div key={k} className="grid grid-cols-[64px_1fr] items-center gap-2">
                            <span className="truncate text-[11px] text-muted-foreground">{name}</span>
                            <Swatch
                                label={name}
                                resetLabel={t('Reset {name}', { name })}
                                value={L[k]}
                                fallback={fallback}
                                onChange={(v) => setCaptions({ [k]: v })}
                                onReset={clear(k)}
                            />
                        </div>
                    ))}
                </div>
            </Field>

            <Field label={t('Box')} set={has('box') || has('box_opacity')} onReset={clear('box', 'box_opacity')}>
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <GpuToggle checked={!!r.box} disabled={false} onChange={toggleBox} label={t('Box behind the text')} />
                        <span className="text-[11px] text-muted-foreground">{r.box ? t('Box behind the text') : t('No box')}</span>
                    </div>
                    {r.box && (
                        <>
                            <Swatch
                                label={t('Box colour')}
                                resetLabel={t('Reset {name}', { name: t('Box colour') })}
                                value={L.box && L.box !== 'none' ? L.box : undefined}
                                fallback={boxFallback}
                                onChange={(v) => setCaptions({ box: v })}
                                onReset={clear('box')}
                            />
                            <Slider
                                label={t('Box opacity')}
                                value={r.box.opacity}
                                min={0}
                                max={1}
                                step={0.05}
                                bigStep={0.25}
                                format={pct}
                                dim={!has('box_opacity')}
                                onReset={clear('box_opacity')}
                                onChange={(v) => setCaptions({ box_opacity: v })}
                            />
                        </>
                    )}
                </div>
            </Field>

            <Field
                label={r.box ? t('Padding') : t('Outline')}
                set={has('outline') || has('outline_w')}
                onReset={clear('outline', 'outline_w')}
                hint={r.box ? t('With a box on, the outline gives way to it and the width is the box padding.') : undefined}
            >
                <div className="space-y-1.5">
                    <Swatch
                        label={t('Outline colour')}
                        resetLabel={t('Reset {name}', { name: t('Outline colour') })}
                        value={L.outline}
                        fallback={outlineFallback}
                        disabled={!!r.box}
                        onChange={(v) => setCaptions({ outline: v })}
                        onReset={clear('outline')}
                    />
                    <Slider
                        label={r.box ? t('Box padding') : t('Outline width')}
                        value={outlineShown}
                        min={0}
                        max={8}
                        step={0.5}
                        bigStep={2}
                        format={px1}
                        dim={!has('outline_w')}
                        onReset={clear('outline_w')}
                        onChange={(v) => setCaptions({ outline_w: v })}
                    />
                </div>
            </Field>

            <Field label={t('Shadow')} set={has('shadow')} onReset={clear('shadow')}>
                <Slider
                    label={t('Shadow depth')}
                    value={shadowShown}
                    min={0}
                    max={6}
                    step={0.5}
                    bigStep={2}
                    format={px1}
                    dim={!has('shadow')}
                    onReset={clear('shadow')}
                    onChange={(v) => setCaptions({ shadow: v })}
                />
            </Field>

            <Field label={t('Motion')} set={has('anim')} onReset={clear('anim')}>
                <div role="radiogroup" aria-label={t('Caption motion')} className="flex flex-col gap-1">
                    {MOTION_ROWS.map((m) => {
                        const on = m.id === r.anim;
                        return (
                            <button
                                key={m.id}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => setCaptions({ anim: m.id })}
                                className={cn(
                                    'flex min-w-0 flex-col rounded-md border px-2.5 py-1.5 text-left transition-[background-color,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                    on ? (has('anim') ? 'border-white/40 bg-accent' : 'border-white/[0.14] bg-accent/60') : 'border-white/[0.07] hover:bg-white/[0.04]',
                                )}
                            >
                                <span className={cn('text-[12px]', on && has('anim') ? 'font-medium text-foreground' : on ? 'text-muted-foreground' : 'text-foreground')}>{t(m.label)}</span>
                                <span className="text-[11px] leading-snug text-muted-foreground">{t(m.tip)}</span>
                            </button>
                        );
                    })}
                </div>
            </Field>

            <PlaceField
                center={r.center}
                placed={r.placed}
                onPlace={(x, y) => setCaptions({ x, y })}
                onReset={clear('x', 'y')}
            />

            <Field
                label={t('Words per line')}
                set={has('max_words')}
                onReset={clear('max_words')}
                hint={has('max_words') ? undefined : t('Style default: {n}', { n: base.maxWords })}
            >
                <div className={cn(!has('max_words') && '[&_input]:text-muted-foreground')}>
                    <Stepper label={t('Words per line')} value={r.maxWords} min={1} max={8} onChange={(v) => setCaptions({ max_words: v })} compact />
                </div>
            </Field>

            <Field label={t('Caption language')} hint={options.subs_lang && options.subs_lang !== 'off' ? t('Translated by your Clip AI provider; without one, captions stay as spoken.') : undefined}>
                <Select label={t('Caption language')} value={options.subs_lang ?? 'off'} options={SUBS_LANGS} onChange={(v) => update({ subs_lang: v })} />
            </Field>

            <button
                type="button"
                disabled={!captionsSet(options.look).length}
                onClick={() => reset('captions')}
                className="h-8 w-full rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] text-[12px] transition-[background-color,opacity] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[color-mix(in_srgb,var(--card)_78%,black)]"
            >
                {t('Reset captions')}
            </button>
        </div>
    );
}
