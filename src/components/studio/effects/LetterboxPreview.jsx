import { fillFilter } from '../../../lib/effectsLook';

/** Colour bars with a lit stripe: a stand-in picture with a bit of everything. */
export const SCENE_BG = 'radial-gradient(circle at 50% 46%, #ecd2b2 0 17%, transparent 18%), linear-gradient(to bottom, rgb(255 255 255 / 0.25), transparent 45%, rgb(0 0 0 / 0.4)), linear-gradient(90deg, #c98a64 0 22%, #e9d8bd 22% 44%, #5d9a6c 44% 66%, #4a78b8 66% 84%, #8a8a90 84%)';

/**
 * A miniature of a tall frame holding a wide shot: the sharp picture across
 * the middle and the blurred, dimmed copy of it filling the rest. The fill's
 * darkness follows the control the way the engine's does (`fillFilter`): the
 * stage never letterboxes, so this is where the setting can be seen.
 */
export default function LetterboxPreview({ dim }) {
    return (
        <div aria-hidden className="relative mx-auto h-[112px] w-[63px] overflow-hidden rounded-[3px] bg-black ring-1 ring-white/10">
            <div className="absolute -inset-3" style={{ backgroundImage: SCENE_BG, backgroundSize: '100% 100%', filter: `blur(7px) ${fillFilter(dim)}` }} />
            <div className="absolute inset-x-0" style={{ top: '34.2%', height: '31.6%', backgroundImage: SCENE_BG, backgroundSize: '100% 100%' }} />
        </div>
    );
}
