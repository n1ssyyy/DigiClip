import { cn } from '../../lib/utils';

/**
 * The DigiClip clapperboard, drawn by hand so its clapper arm can move:
 * the arm group hinges on the board's top-left corner (3, 11). `mode`
 * picks the motion: `idle` claps now and then, `loop` claps on a steady
 * beat (boot splash), `still` never moves. Hovering a parent `.brand-hover`
 * claps once. All motion is off under reduced motion.
 */
export default function BrandMark({ className, mode = 'idle', strokeWidth = 2 }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={cn('brand-mark', `brand-${mode}`, className)}
        >
            <g className="brand-arm">
                <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
                <path d="m6.2 5.3 3.1 3.9" />
                <path d="m12.4 3.4 3.1 4" />
            </g>
            <path className="brand-board" d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
    );
}
