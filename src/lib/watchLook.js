// What the watch folder's choice in Settings lists: the person's Looks by
// name, and which one the saved watch options are (matched by value, so a
// renamed Look is still found). Pure: no React.
import { isPreset } from './lookLibrary.js';

/** `''` is the defaults, `'__custom'` options that no Look holds (any more). */
export const CUSTOM = '__custom';

/**
 * @param {object|null|undefined} options  the saved `watch_options`
 * @param {object[]|undefined} presets  `settings.presets`
 * @returns {{value: string, names: string[], custom: boolean}}
 */
export function watchChoice(options, presets) {
    const looks = (presets ?? []).filter(isPreset);
    const cur = JSON.stringify(options ?? {});
    const hit = looks.find((p) => JSON.stringify(p.options) === cur);
    const unset = Object.values(options ?? {}).every((v) => v == null);
    const value = hit ? hit.name : unset ? '' : CUSTOM;
    const names = [...new Set(looks.map((p) => p.name))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0));
    return { value, names, custom: value === CUSTOM };
}
