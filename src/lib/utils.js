import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

/** The hover lift for panels that read as a pair (header + body): a
 *  brighter top and side edge. Every page uses this one recipe. */
export const HOT_EDGE = 'border-t-white/25 border-x-white/[0.13]';


/** The file name at the end of a path (either kind of slash). */
export const baseName = (p) => (p ? p.split(/[\/]/).pop() : '');
