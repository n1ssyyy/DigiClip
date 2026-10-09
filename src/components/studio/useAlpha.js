import { ALPHA_CAP } from '../../lib/alpha';
import { useStore } from '../../lib/socket';

/** Does the engine take opacity in colours and the new element opacities
 *  (`look.alpha`)? Without it Studio hides those controls. */
export const useAlpha = () => useStore((s) => s.caps.includes(ALPHA_CAP));
