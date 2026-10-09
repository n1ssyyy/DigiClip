import { useMemo } from 'react';
import { aspectList } from '../../../lib/look';
import { HEADLINE_SAMPLE, headlineRoom, logoClear, resolveHeadline, resolveLogo, stageHeadline } from '../../../lib/layers';
import { headlineEdit, headlineView, layerClear } from '../../../lib/layerEffective';
import {
    HEADLINE_LAYER, numSpec, numUi, sectionHasOverrides, sectionResetPatch,
} from '../../../lib/layerSections';
import { useT } from '../../../lib/i18n';
import LayerSections, { useLayerLabels } from '../kit/LayerSections';
import { panelValue } from '../kit/context';
import {
    CardSection, FillSection, HeadlineSection, MotionSection, ShadowSection, TypeSection,
} from './HeadlineSections';

const def = HEADLINE_LAYER;
const NONE = {};

/**
 * The Headline inspector: sections (Headline, Type, Fill and stroke, Shadow
 * and glow, Card, Motion) over the Look's headline section. Every control
 * shows the value the engine uses until the Look sets it. `measure` is the
 * stage's text measure and `len` the sample's length, for the layout the
 * controls read their position and timing from.
 */
export default function HeadlinePanel({ look, job, measure, len }) {
    const t = useT();
    const labels = useLayerLabels();
    const { options, update, setHeadline, reset, beginGesture, endGesture } = look;
    const L = options.look?.headline ?? NONE;
    const canvas = aspectList(options.aspect)[0];
    const logoLook = options.look?.logo;
    const clear = useMemo(
        () => logoClear(options.logo ? resolveLogo(canvas, options.logo_pos, logoLook, null) : null),
        [options.logo, options.logo_pos, canvas, logoLook],
    );
    const text = stageHeadline(options.headline_text, job);
    const view = useMemo(() => {
        const o = { clear, measure, len };
        const r = resolveHeadline(text, canvas, L, o) ?? resolveHeadline(HEADLINE_SAMPLE, canvas, L, o);
        return headlineView(r, L, { len, room: headlineRoom(canvas, clear, L.x !== undefined) });
    }, [text, canvas, L, clear, measure, len]);
    const g = useMemo(() => ({ begin: beginGesture, end: endGesture }), [beginGesture, endGesture]);
    const ctx = useMemo(() => panelValue({
        view,
        g,
        setPatch: setHeadline,
        patchFor: (path, value) => headlineEdit(view, path, value),
        clearFor: layerClear,
        num: (path) => ({ spec: numSpec(def, path), ui: numUi(def, path) }),
        labels,
    }), [view, g, setHeadline, labels]);

    const anySet = Object.keys(L).length > 0;
    const sections = [
        ['headline', t('Headline'), <HeadlineSection key="headline" options={options} update={update} anySet={anySet} onResetAll={() => reset('headline')} />],
    ];
    // The rest waits for the headline to be on.
    if (options.headline) {
        sections.push(
            ['type', t('Type'), <TypeSection key="type" />],
            ['fill', t('Fill and stroke'), <FillSection key="fill" />],
            ['shadow', t('Shadow and glow'), <ShadowSection key="shadow" />],
            ['card', t('Card'), <CardSection key="card" />],
            ['motion', t('Motion'), <MotionSection key="motion" />],
        );
    }
    return (
        <LayerSections
            def={def}
            ctx={ctx}
            sections={sections}
            changed={(id) => sectionHasOverrides(def, L, id)}
            onReset={(id) => setHeadline(sectionResetPatch(def, L, id))}
        />
    );
}
