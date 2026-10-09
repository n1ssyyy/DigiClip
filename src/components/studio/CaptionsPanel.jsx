import { useMemo } from 'react';
import { aspectList } from '../../lib/look';
import { captionView, clearPatch, editPatch } from '../../lib/captionEffective';
import { numSpec, numUi, sectionHasOverrides, sectionResetPatch } from '../../lib/captionSections';
import { useT } from '../../lib/i18n';
import Section from './kit/Section';
import StyleSection from './captions/StyleSection';
import TypeSection from './captions/TypeSection';
import { BoxSection, FillSection, ShadowSection } from './captions/DressSections';
import WordsSection from './captions/WordsSection';
import MotionSection from './captions/MotionSection';
import { PanelContext, panelValue } from './kit/context';

/**
 * The Captions inspector: a stack of collapsible sections (Style, Type, Fill
 * and stroke, Shadow and glow, Box, Words, Motion) over the Look's captions.
 * Every control shows the effective value, the style's own until the Look
 * sets it; `captions/` holds the controls, `captionSections.js` the map of
 * which section owns which field.
 */
export default function CaptionsPanel({ options, update, setCaptions, reset, gesture }) {
    const t = useT();
    const L = options.look?.captions ?? {};
    const canvas = aspectList(options.aspect)[0];
    const view = useMemo(
        () => captionView(options.style, canvas, L, { anim: options.caption_anim }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [options.style, canvas, L, options.caption_anim],
    );
    const ctx = useMemo(() => panelValue({
        view,
        g: gesture,
        setPatch: setCaptions,
        patchFor: (path, value) => editPatch(view, path, value),
        clearFor: clearPatch,
        num: (path) => ({ spec: numSpec(path), ui: numUi(path) }),
    }), [view, gesture, setCaptions]);

    const sections = [
        ['style', t('Style'), <StyleSection key="style" options={options} update={update} onResetAll={() => reset('captions')} />],
        ['type', t('Type'), <TypeSection key="type" />],
        ['fill', t('Fill and stroke'), <FillSection key="fill" />],
        ['shadow', t('Shadow and glow'), <ShadowSection key="shadow" />],
        ['box', t('Box'), <BoxSection key="box" />],
        ['words', t('Words'), <WordsSection key="words" />],
        ['motion', t('Motion'), <MotionSection key="motion" />],
    ];
    return (
        <PanelContext.Provider value={ctx}>
            <div className="-mx-1">
                {sections.map(([id, title, body]) => (
                    <Section
                        key={id}
                        id={id}
                        title={title}
                        firstOpen={id === 'style'}
                        changed={sectionHasOverrides(L, id)}
                        onReset={() => setCaptions(sectionResetPatch(L, id))}
                    >
                        {body}
                    </Section>
                ))}
            </div>
        </PanelContext.Provider>
    );
}
