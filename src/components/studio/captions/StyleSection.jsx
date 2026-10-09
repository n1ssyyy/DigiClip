import { SUBS_LANGS, captionsSet } from '../../../lib/look';
import { cssFont } from '../../../lib/fontNames';
import { CAPTION_STYLES, fontBox, outlineRing, resolveCaptions, rgba } from '../../../lib/captionStyles';
import { Select, SwitchRow } from '../../digiclip/fields';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/utils';
import Field, { ResetButton } from '../Field';
import { CapNotice } from '../Notice';
import { useRoving } from '../kit/choices';
import { ElementOpacity } from '../kit/inputs';
import { usePanel } from '../kit/context';

/** One style drawn in its own look: a small caption sample. */
function StyleTile({ id, on, stop, rove, index, onPick }) {
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
            tabIndex={stop ? 0 : -1}
            ref={rove.ref(index)}
            onKeyDown={(e) => rove.onKey(e, index)}
            onClick={onPick}
            className={cn(
                'group flex min-w-0 flex-col items-stretch gap-1 rounded-md border p-1 text-left transition-[background-color,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                on ? 'border-white/40 bg-accent' : 'border-white/[0.07] hover:bg-white/[0.04]',
            )}
        >
            <span className="flex h-11 items-center justify-center overflow-hidden rounded bg-[#0d0d0f]" aria-hidden>
                <span
                    style={{
                        fontFamily: `${cssFont(r.font)}, sans-serif`,
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

/** Style: whether captions show, the starting style (it keeps the Look's
 *  own changes), the caption language, and the way back to the style. */
export default function StyleSection({ options, update, onResetAll }) {
    const t = useT();
    const { view, setPatch } = usePanel();
    const rove = useRoving(CAPTION_STYLES.length, (j) => update({ style: CAPTION_STYLES[j] }));
    const current = Math.max(0, CAPTION_STYLES.indexOf(view.r.style));
    return (
        <>
            <CapNotice cap="look.captions" text={t('This engine is older than Studio. Position, size, colour and the new motions apply after the next engine update.')} />
            <ElementOpacity />
            <SwitchRow
                checked={view.r.show}
                onChange={(v) => setPatch({ show: v ? undefined : false })}
                title={t('Show captions')}
                hint={t('Turn off for a clip without captions.')}
            />
            <Field label={t('Style')}>
                <div role="radiogroup" aria-label={t('Caption style')} className="grid grid-cols-2 gap-1.5">
                    {CAPTION_STYLES.map((id, i) => (
                        <StyleTile key={id} id={id} index={i} rove={rove} stop={i === current} on={i === current} onPick={() => update({ style: id })} />
                    ))}
                </div>
            </Field>
            <Field label={t('Caption language')} hint={options.subs_lang && options.subs_lang !== 'off' ? t('Translated by your Clip AI provider; without one, captions stay as spoken.') : undefined}>
                <Select label={t('Caption language')} value={options.subs_lang ?? 'off'} options={SUBS_LANGS} onChange={(v) => update({ subs_lang: v })} />
            </Field>
            <ResetButton disabled={!captionsSet(options.look).length} onClick={onResetAll}>{t('Reset to this style')}</ResetButton>
        </>
    );
}
