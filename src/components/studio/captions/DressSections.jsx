import { boxModePatch, glowPatch, shadowPatch } from '../../../lib/captionEffective';
import { useT } from '../../../lib/i18n';
import { CapNotice } from '../Notice';
import OffsetPad from '../kit/OffsetPad';
import { Choice, ToggleRow } from '../kit/choices';
import { usePanel } from '../kit/context';
import { Colour, Num, Row } from '../kit/inputs';

const fxNote = (t) => t('This engine is older than these controls. They apply after the next engine update.');

/** Fill and stroke: the text colour and the stroke round the letters. */
export function FillSection() {
    const t = useT();
    return (
        <>
            <CapNotice cap="look.captions.fx" text={fxNote(t)} />
            <Colour path="color" label={t('Text colour')} />
            <p className="-mt-1.5 text-[11px] leading-snug text-muted-foreground">{t('Speaking, spoken and keyword colours are under Words.')}</p>
            <Colour path="stroke.color" label={t('Stroke colour')} />
            <Num path="stroke.width" label={t('Stroke width')} />
        </>
    );
}

/** Shadow and glow: each a switch with its own controls underneath. */
export function ShadowSection() {
    const t = useT();
    const { view, setPatch } = usePanel();
    return (
        <>
            <CapNotice cap="look.captions.fx" text={fxNote(t)} />
            <ToggleRow
                label={t('Shadow')}
                checked={view.shadowOn}
                set={view.isSet('shadow')}
                onChange={(on) => setPatch(shadowPatch(view, on))}
                hint={view.shadowIsObject ? t('Replaces the style’s own shadow.') : undefined}
            />
            {view.shadowOn && (
                <div className="space-y-3 border-l border-white/[0.07] pl-3">
                    <Colour path="shadow.color" opacity="shadow.opacity" label={t('Colour')} />
                    <OffsetPad />
                    <Num path="shadow.blur" label={t('Blur')} />
                </div>
            )}
            <ToggleRow label={t('Glow')} checked={view.glowOn} set={view.glowOn} onChange={(on) => setPatch(glowPatch(on))} />
            {view.glowOn && (
                <div className="space-y-3 border-l border-white/[0.07] pl-3">
                    <Colour path="glow.color" label={t('Colour')} />
                    <Num path="glow.size" label={t('Size')} />
                    <Num path="glow.strength" label={t('Strength')} />
                </div>
            )}
        </>
    );
}

/** Box: none, one behind the line, or one behind each word. */
export function BoxSection() {
    const t = useT();
    const { view, setPatch, clear } = usePanel();
    const mode = view.boxMode();
    return (
        <>
            <CapNotice cap="look.captions.fx" text={fxNote(t)} />
            <Row label={t('Box')} set={view.isSet('box')} onReset={() => clear('box', 'box_opacity')}>
                <Choice
                    label={t('Box')}
                    cols={1}
                    value={mode}
                    set={view.isSet('box')}
                    onChange={(m) => {
                        // Picking the box the style already draws would swap it for a drawn one.
                        if (m !== mode || view.isSet('box')) setPatch(boxModePatch(view, m));
                    }}
                    options={[
                        { id: 'off', label: t('Off') },
                        { id: 'line', label: t('Behind the line') },
                        { id: 'word', label: t('Behind each word') },
                    ]}
                />
            </Row>
            {mode !== 'off' && (
                <>
                    <Colour path="box.color" opacity="box.opacity" label={t('Colour')} />
                    <Num path="box.pad_x" label={t('Padding width')} />
                    <Num path="box.pad_y" label={t('Padding height')} />
                    <Num path="box.radius" label={t('Roundness')} />
                </>
            )}
        </>
    );
}
