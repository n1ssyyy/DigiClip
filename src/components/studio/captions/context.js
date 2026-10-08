import { createContext, useContext } from 'react';

/** What every caption control reads and writes: the view of the Look over
 *  the style (`captionView`), the edits as store patches, and the drag
 *  gesture that makes a drag one undo step. */
export const CapContext = createContext(null);

export function useCap() {
    const v = useContext(CapContext);
    if (!v) throw new Error('caption controls need their panel');
    return v;
}

/** Whether the section holding the control is open (the preview strip rests
 *  while it is closed). */
export const OpenContext = createContext(true);
export const useSectionOpen = () => useContext(OpenContext);
