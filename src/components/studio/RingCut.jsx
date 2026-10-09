import { ringId, ringMatrix } from '../../lib/strokeCut';

/** CSS `filter` value that turns a stroke copy painted in the marker colours
 *  (see `lib/strokeCut.js`) into the ring alone, in the colour `rgb`. */
export const ringFilter = (rgb) => `url(#${ringId(rgb)})`;

/**
 * The filters `ringFilter` names, one per stroke colour: the glyph and its
 * ring painted red and black become the ring only (alpha = alpha - red) in
 * the stroke's colour. The region reaches well past the element so a thick
 * ring is not clipped; the filter works in sRGB so no colour or opacity is
 * touched by a colour-space conversion.
 *
 * @param {{colours: number[][]}} props  stroke colours (`[r, g, b]`), repeats welcome
 */
export function RingFilters({ colours }) {
    const byId = new Map();
    for (const c of colours) byId.set(ringId(c), c);
    if (!byId.size) return null;
    return (
        <svg aria-hidden width="0" height="0" style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
            <defs>
                {[...byId].map(([id, c]) => (
                    <filter key={id} id={id} x="-50%" y="-100%" width="200%" height="300%" colorInterpolationFilters="sRGB">
                        <feColorMatrix type="matrix" values={ringMatrix(c)} />
                    </filter>
                ))}
            </defs>
        </svg>
    );
}
