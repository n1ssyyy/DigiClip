import { useLayoutEffect, useState } from 'react';

/** The visible box of an element ({ w, h }: client width and height, so a
 *  scrollbar's room is already out), kept current as the window, or whatever
 *  sits beside it, resizes. */
export default function useBox(ref) {
    const [box, setBox] = useState({ w: 0, h: 0 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const read = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
        read();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(read);
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return box;
}
