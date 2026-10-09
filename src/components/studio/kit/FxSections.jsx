import { glowPatch } from '../../../lib/captionEffective';
import { shadowFxPatch } from '../../../lib/layerEffective';
import { useT } from '../../../lib/i18n';
import OffsetPad from './OffsetPad';
import { ToggleRow } from './choices';
import { usePanel } from './context';
import { Colour, Num } from './inputs';

/** A shadow, as a switch with its own controls under it: the colour, where
 *  it falls (the offset pad), how soft and how strong. Off is no shadow. */
export function ShadowFields() {
    const t = useT();
    const { view, setPatch } = usePanel();
    return (
        <>
            <ToggleRow label={t('Shadow')} checked={view.shadowOn} set={view.shadowOn} onChange={(on) => setPatch(shadowFxPatch(on))} />
            {view.shadowOn && (
                <div className="space-y-3 border-l border-white/[0.07] pl-3">
                    <Colour path="shadow.color" label={t('Colour')} />
                    <OffsetPad />
                    <Num path="shadow.blur" label={t('Blur')} />
                    <Num path="shadow.opacity" label={t('Opacity')} />
                </div>
            )}
        </>
    );
}

/** A glow: a switch with its colour, size and strength under it. */
export function GlowFields() {
    const t = useT();
    const { view, setPatch } = usePanel();
    return (
        <>
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
