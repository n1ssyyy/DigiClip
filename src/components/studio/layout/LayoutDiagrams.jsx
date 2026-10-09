const FRAME = { x: 3, y: 1.5, w: 18, h: 21, rx: 2 };

/** Tiny pictures of the three layouts on a tall frame: one camera, two
 *  people stacked with a seam, and the seam only when it fits. */
export default function LayoutDiagram({ id }) {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
            <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} rx={FRAME.rx} />
            {id === 'single' && <circle cx="12" cy="10" r="3" fill="currentColor" stroke="none" />}
            {id !== 'single' && (
                <>
                    <path d="M3 12 H21" strokeDasharray={id === 'auto' ? '2 2' : undefined} />
                    <circle cx="9" cy="7" r="2.2" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="17" r="2.2" fill="currentColor" stroke="none" />
                </>
            )}
        </svg>
    );
}
