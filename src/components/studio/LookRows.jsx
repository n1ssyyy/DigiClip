import { useId } from 'react';
import { Check } from 'lucide-react';
import { lookSummary } from '../../lib/lookSummary';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';

// The list of Looks that both pickers show (the title of Studio, and the
// line under the upload box on Home): the person's looks, then the starter
// looks, one row each with the name and a short summary, the current one
// checked. The menus around it differ; the rows and the keys do not.

/** The enabled items of an open menu, in order. */
export const lookItems = (panel) => [...(panel?.querySelectorAll('[data-look-item]:not(:disabled)') ?? [])];

/** Put focus on the look that is current, else the first item. */
export function focusCurrent(panel) {
    (panel?.querySelector('[data-current]') ?? lookItems(panel)[0])?.focus();
}

/** Arrow keys, Home and End move between the items. True when the key was one of them. */
export function moveInList(e, panel) {
    const keys = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' };
    if (!(e.key in keys)) return false;
    e.preventDefault();
    const list = lookItems(panel);
    if (!list.length) return true;
    const i = list.indexOf(document.activeElement);
    const step = keys[e.key];
    const next = step === 'first' ? 0 : step === 'last' ? list.length - 1 : (i + step + list.length) % list.length;
    list[next].focus();
    return true;
}

function Group({ label, children }) {
    const id = useId();
    return (
        <div role="group" aria-labelledby={id}>
            <p id={id} className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            {children}
        </div>
    );
}

function LookRow({ on, summary, name, onPick }) {
    return (
        <button
            type="button"
            role="menuitemradio"
            aria-checked={on}
            data-look-item=""
            data-current={on ? '' : undefined}
            onClick={onPick}
            className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent', on && 'bg-accent/60')}
        >
            <span className="min-w-0 flex-1">
                <span className="block break-words text-[12px]">{name}</span>
                <span className="block break-words font-mono text-[10px] text-muted-foreground">{summary}</span>
            </span>
            <Check className={cn('size-3.5 shrink-0', !on && 'opacity-0')} aria-hidden />
        </button>
    );
}

/**
 * @param {{list: {mine: object[], starters: object[]}, current: {kind: string, name: string}}} looks  `useLooks()`
 * @param {(entry: object) => void} onPick
 */
export default function LookRows({ looks, onPick }) {
    const t = useT();
    const { current } = looks;
    const row = (entry) => (
        <LookRow
            key={`${entry.kind}:${entry.name}`}
            on={entry.kind === current.kind && entry.name === current.name}
            name={entry.kind === 'mine' ? entry.name : t(entry.name)}
            summary={entry.kind === 'mine' ? lookSummary(entry.options, t) : t(entry.blurb)}
            onPick={() => onPick(entry)}
        />
    );
    return (
        <>
            {looks.list.mine.length > 0 && <Group label={t('Your looks')}>{looks.list.mine.map(row)}</Group>}
            <Group label={t('Starter looks')}>{looks.list.starters.map(row)}</Group>
        </>
    );
}
