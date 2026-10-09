import { createContext, useContext } from 'react';
import { mergePatch } from '../../../lib/captionEffective';

/** What every inspector control reads and writes: the view of the Look (the
 *  effective value and whether the Look sets it), the edits as store
 *  patches, the drag gesture that makes a drag one undo step, and how a
 *  number of this layer reads. */
export const PanelContext = createContext(null);

export function usePanel() {
    const v = useContext(PanelContext);
    if (!v) throw new Error('inspector controls need their panel');
    return v;
}

/** Whether the section holding the control is open (the preview strip rests
 *  while it is closed). */
export const OpenContext = createContext(true);
export const useSectionOpen = () => useContext(OpenContext);

/**
 * The value a panel provides.
 *
 * @param {object} p
 * @param {object} p.view  `val(path)` / `isSet(path)` and the layer's extras
 * @param {{begin: Function, end: Function}} p.g  the drag gesture
 * @param {(patch: object) => void} p.setPatch  writes a patch of the layer's Look section
 * @param {(path: string, value: any) => object} p.patchFor  the patch for one control change
 * @param {(path: string) => object} p.clearFor  the patch that clears one control
 * @param {(path: string) => {spec: object, ui: object}} p.num  a number field's range and display
 * @param {{value: string, section: string, changed: string}} [p.labels]  the words of the
 *        reset buttons when "the style's own" is not what a layer goes back to
 */
export function panelValue({ view, g, setPatch, patchFor, clearFor, num, labels }) {
    return {
        view,
        g,
        setPatch,
        patchFor,
        set: (path, value) => setPatch(patchFor(path, value)),
        clear: (...paths) => setPatch(paths.reduce((patch, p) => mergePatch(patch, clearFor(p)), {})),
        num,
        labels,
    };
}
