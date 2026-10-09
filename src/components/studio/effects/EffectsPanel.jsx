import { useMemo } from 'react';
import { effectsView, sceneChanged, sceneReset } from '../../../lib/sceneEffective';
import { EFFECTS_LAYER } from '../../../lib/sceneSections';
import { useT } from '../../../lib/i18n';
import { CapNotice } from '../Notice';
import { usePanel } from '../kit/context';
import { Num } from '../kit/inputs';
import LayerSections from '../kit/LayerSections';
import { useOlder, useScenePanel } from '../kit/useScene';
import GradeChoice from './GradeChoice';
import LetterboxPreview from './LetterboxPreview';

const def = EFFECTS_LAYER;
const NONE = {};

/** Vignette: the corners darker, the middle untouched. */
function VignetteSection() {
    const t = useT();
    const older = useOlder();
    return (
        <>
            <CapNotice cap="look.effects" text={older} />
            <Num path="vignette" label={t('Corner darkness')} />
        </>
    );
}

/** Colour: one grade over the picture. */
function ColourSection() {
    const older = useOlder();
    return (
        <>
            <CapNotice cap="look.effects" text={older} />
            <GradeChoice />
        </>
    );
}

/** Blurred fill: how dark the soft backdrop behind a wide shot is. */
function FillSection() {
    const t = useT();
    const older = useOlder();
    const { view } = usePanel();
    return (
        <>
            <CapNotice cap="look.effects" text={older} />
            <LetterboxPreview dim={view.val('fill_dim')} />
            <Num path="fill_dim" label={t('Darkness')} hint={t('Behind video that does not fill the frame.')} />
        </>
    );
}

/** The Effects inspector: Vignette, Colour and Blurred fill over `look.effects`. */
export default function EffectsPanel({ look }) {
    const t = useT();
    const { options, setEffects } = look;
    const L = options.look?.effects ?? NONE;
    const view = useMemo(() => effectsView(L), [L]);
    const ctx = useScenePanel(def, view, setEffects, look);
    const titles = { vignette: t('Vignette'), colour: t('Colour'), fill: t('Blurred fill') };
    const bodies = { vignette: <VignetteSection />, colour: <ColourSection />, fill: <FillSection /> };
    return (
        <LayerSections
            def={def}
            ctx={ctx}
            sections={def.ids.map((id) => [id, titles[id], bodies[id]])}
            changed={(id) => sceneChanged(def, L, options, id)}
            onReset={(id) => setEffects(sceneReset(def, L, id).patch)}
        />
    );
}
