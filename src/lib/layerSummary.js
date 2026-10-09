// The one-line summaries of the Layers list, shortened by a rule instead of
// being cut by CSS. Pure: no React.
import { withFont } from './lookSummary.js';

/** The headline row: `Your text · Hello big · 120%` for a typed headline
 *  (the label, then as many whole words of it as fit in `max` characters,
 *  then the size when it is set), or `The clip's own title` while the text is
 *  empty. The size is left out when it would not fit beside the label, and a
 *  font that is not the default follows only when there is room. */
export function headlineSummary({ text, size, font = null, max, tr = (s) => s }) {
    const typed = String(text ?? '').trim();
    const label = typed ? tr('Your text') : tr("The clip's own title");
    const sized = size !== undefined ? ` · ${Math.round(size * 100)}%` : '';
    const tail = `${label}${sized}`.length <= max ? sized : '';
    let words = '';
    if (typed) {
        for (const w of typed.split(/\s+/)) {
            const next = words ? `${words} ${w}` : w;
            if (`${label} · ${next}${tail}`.length > max) break;
            words = next;
        }
    }
    return withFont(`${label}${words ? ` · ${words}` : ''}${tail}`, font, max);
}

/** The logo and music rows: the file's name when it fits in `max`
 *  characters (with the size, when that fits too), else `fallback` ("Your
 *  logo"), so a long name is never cut mid-word by the pane. */
export function fileSummary({ file, size, max, fallback }) {
    const name = String(file ?? '').split(/[\\/]/).pop();
    const sized = size !== undefined ? ` · ${Math.round(size * 100)}%` : '';
    if (`${name}${sized}`.length <= max) return `${name}${sized}`;
    if (name.length <= max) return name;
    return `${fallback}${`${fallback}${sized}`.length <= max ? sized : ''}`;
}
