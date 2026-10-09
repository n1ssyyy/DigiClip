import { useMemo } from 'react';
import { layerClear, layerPatch } from '../../../lib/layerEffective';
import { numSpec, numUi } from '../../../lib/layerSections';
import { useT } from '../../../lib/i18n';
import { panelValue } from './context';
import { useLayerLabels } from './LayerSections';

/** The words of the notice every Scene panel shows on an engine without its ability. */
export const useOlder = () => useT()('This engine is older than these controls. They apply after the next engine update.');

/**
 * The panel value of a Scene layer (camera, effects, layout): its view, the
 * store's writer for its Look section and the drag gesture, so its numbers are
 * `Num` controls like every other layer's.
 *
 * @param {object} def  the layer's map (`sceneSections.js`)
 * @param {object} view  `cameraView` / `effectsView` / `layoutView`
 * @param {Function} setPatch  `look.setCamera` / `setEffects` / `setLayout`
 * @param {{beginGesture: Function, endGesture: Function}} look
 */
export function useScenePanel(def, view, setPatch, { beginGesture, endGesture }) {
    const labels = useLayerLabels();
    const g = useMemo(() => ({ begin: beginGesture, end: endGesture }), [beginGesture, endGesture]);
    return useMemo(() => panelValue({
        view,
        g,
        setPatch,
        patchFor: layerPatch,
        clearFor: layerClear,
        num: (path) => ({ spec: numSpec(def, path), ui: numUi(def, path) }),
        labels,
    }), [def, view, g, setPatch, labels]);
}
