import { useLayoutEffect, useRef, useState } from 'react';
import ClipTile from './ClipTile';
import { clipShape, gridPlan } from '../../lib/clipGrid';
import { useT } from '../../lib/i18n';

const GAP = 8;

/** The width of an element's content box, kept current as the window or the
 *  list beside it resizes. */
function useWidth(ref) {
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const read = () => {
            const cs = getComputedStyle(el);
            setWidth(Math.round(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
        };
        read();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(read);
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return width;
}

/** A video's clips, each tile in its clip's own shape. The grid takes as many
 *  columns as fit for that shape (many narrow tall tiles, few wide ones) and
 *  scrolls; there are no pages. */
export default function ClipGrid({ job, onPlay }) {
    const t = useT();
    const box = useRef(null);
    const width = useWidth(box);
    const clips = job.clips ?? [];
    const { cols, tileW } = gridPlan(width, clipShape(clips[0], job), GAP);

    return (
        <div ref={box} className="digi-scroll min-h-0 flex-1 overflow-y-auto p-2.5 [scrollbar-gutter:stable]">
            {clips.length === 0 ? (
                <p className="px-2 py-10 text-center text-[13px] text-muted-foreground">{t('No clips were picked from this video.')}</p>
            ) : (
                <div
                    role="list"
                    aria-label={t('Clips')}
                    className="grid items-start"
                    style={{ gridTemplateColumns: `repeat(${cols}, ${tileW}px)`, gap: GAP }}
                >
                    {clips.map((c) => (
                        <div role="listitem" key={c.rank} className="min-w-0">
                            <ClipTile job={job} clip={c} width={tileW} onPlay={onPlay} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
