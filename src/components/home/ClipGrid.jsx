import { useRef } from 'react';
import ClipTile from './ClipTile';
import useBox from './useBox';
import { clipShape, gridPlan } from '../../lib/clipGrid';
import { useT } from '../../lib/i18n';

const GAP = 8;
const PAD = 10; // the grid's p-2.5

/** A video's clips, each tile in its clip's own shape. The grid takes the
 *  column count that gives the largest tile with every clip in view; when the
 *  clips cannot all fit at a readable size, tiles take a comfortable width and
 *  the grid scrolls (a partly visible row is fine then). There are no pages. */
export default function ClipGrid({ job, onPlay }) {
    const t = useT();
    const box = useRef(null);
    const area = useBox(box);
    const clips = job.clips ?? [];
    const { cols, tileW } = gridPlan(area, clipShape(clips[0], job), clips.length, GAP, PAD);

    return (
        <div ref={box} className="digi-scroll min-h-0 flex-1 overflow-y-auto p-2.5 [scrollbar-gutter:stable]">
            {clips.length === 0 ? (
                <p className="px-2 py-10 text-center text-[13px] text-muted-foreground">{t('No clips were picked from this video.')}</p>
            ) : (
                <div
                    role="list"
                    aria-label={t('Clips')}
                    className="grid"
                    style={{ gridTemplateColumns: `repeat(${cols}, ${tileW}px)`, gap: GAP }}
                >
                    {clips.map((c) => (
                        <div role="listitem" key={c.rank} className="flex min-w-0">
                            <ClipTile job={job} clip={c} width={tileW} onPlay={onPlay} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
