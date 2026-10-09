// What the watch folder's choice in Settings lists: the person's Looks by
// name, and which one the saved watch options are (matched by value, so a
// renamed Look is still found). Pure: no React.
import { stripOptionsAlpha } from './alpha.js';
import { isPreset } from './lookLibrary.js';

/** `''` is the defaults, `'__custom'` options that no Look holds (any more). */
export const CUSTOM = '__custom';

/** A saved Look's options as the watch folder takes them: without the engine's
 *  `look.alpha` no colour opacity and no new element opacity goes over. */
export const watchOptions = (options, alpha = true) => (alpha ? options : stripOptionsAlpha(options));

/**
 * @param {object|null|undefined} options  the saved `watch_options`
 * @param {object[]|undefined} presets  `settings.presets`
 * @param {{alpha?: boolean}} [engine]  `alpha: false` (an engine without `look.alpha`):
 *        the saved options were handed over stripped, so a Look is matched as it
 *        is handed over, `watchOptions(p.options, alpha)`
 * @returns {{value: string, names: string[], custom: boolean}}
 */
export function watchChoice(options, presets, { alpha = true } = {}) {
    const looks = (presets ?? []).filter(isPreset);
    const cur = JSON.stringify(options ?? {});
    const hit = looks.find((p) => JSON.stringify(watchOptions(p.options, alpha)) === cur);
    const unset = Object.values(options ?? {}).every((v) => v == null);
    const value = hit ? hit.name : unset ? '' : CUSTOM;
    const names = [...new Set(looks.map((p) => p.name))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0));
    return { value, names, custom: value === CUSTOM };
}
