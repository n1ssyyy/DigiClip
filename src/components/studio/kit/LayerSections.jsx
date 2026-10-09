import { useMemo } from 'react';
import { useT } from '../../../lib/i18n';
import Section from './Section';
import { PanelContext } from './context';

/** The words of the reset buttons for a layer (it goes back to its defaults,
 *  not to a caption style's own values). */
export function useLayerLabels() {
    const t = useT();
    return useMemo(() => ({
        value: t('Back to the default'),
        section: t('Back to the defaults'),
        changed: t('Changed from the default'),
    }), [t]);
}

/**
 * A layer's inspector: a stack of collapsible sections over its Look section.
 * `def` is the layer's map (`layerSections.js`), `sections` the
 * `[id, title, body]` list in panel order, `changed(id)` whether a section
 * holds anything the layer's defaults do not, and `onReset(id)` puts it back.
 * The first section starts open; open or closed is remembered per layer and
 * section.
 */
export default function LayerSections({ def, ctx, sections, changed, onReset }) {
    return (
        <PanelContext.Provider value={ctx}>
            <div className="-mx-1">
                {sections.map(([id, title, body]) => (
                    <Section
                        key={id}
                        id={`${def.id}.${id}`}
                        title={title}
                        firstOpen={id === def.ids[0]}
                        changed={changed(id)}
                        onReset={() => onReset(id)}
                    >
                        {body}
                    </Section>
                ))}
            </div>
        </PanelContext.Provider>
    );
}
