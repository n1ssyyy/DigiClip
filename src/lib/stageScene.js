// What the stage's picture does for the Look's camera, effects and layout:
// the numbers `StagePicture` draws from. Pure.
import { cleanCamera, cleanEffects, cleanLayout } from './sceneFields.js';
import { seamCaptionY, splitFits } from './layoutLook.js';
import { stageZoom } from './effectsLook.js';

/**
 * @param {object} options  the panel state (`layout` is the flat choice; `look` the Look)
 * @param {{w: number, h: number}} canvas  the stage's canvas
 * @returns {{zoom: number, grade: string|null, vignette: number, splitOn: boolean,
 *            split: number|undefined, seam: number|undefined}}
 *   `zoom` the scale of the picture (1 = as it was), `grade` / `vignette` the
 *   picture effects, `splitOn` whether the stage draws two panels (the layout
 *   is Split and the canvas is tall), `split` the Look's seam, `seam` where the
 *   captions sit while split (a fraction of the height; undefined otherwise)
 */
export function stageScene(options, canvas) {
    const L = options.look ?? {};
    const cam = cleanCamera(L.camera);
    const fx = cleanEffects(L.effects);
    const split = cleanLayout(L.layout).split;
    const splitOn = options.layout === 'split' && splitFits(canvas);
    return {
        // The engine's zoom does not apply to the two crops of a split.
        zoom: splitOn ? 1 : stageZoom(cam.zoom ?? 1),
        grade: fx.grade && fx.grade !== 'none' ? fx.grade : null,
        vignette: fx.vignette ?? 0,
        splitOn,
        split,
        seam: splitOn ? seamCaptionY(canvas.h, split) : undefined,
    };
}
