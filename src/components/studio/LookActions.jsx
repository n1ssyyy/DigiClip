import { Fragment, useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Copy, Pencil, Save, Trash2, X } from 'lucide-react';
import { inputCls } from '../digiclip/fields';
import Tip from '../digiclip/Tooltip';
import { checkName, nameStep, nextFreeName } from '../../lib/lookNames';
import { lookActions } from '../../lib/lookLibrary';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';

const ROW = 'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:opacity-50';

/** The plain rows at the bottom of the menu, for the look the stage is on. */
export function ActionRows({ looks, setMode, run }) {
    const t = useT();
    const own = looks.current.kind === 'mine';
    const row = (Icon, label, onClick, extra) => (
        <button type="button" role="menuitem" data-look-item="" disabled={looks.saving} onClick={onClick} className={ROW}>
            <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 break-words">{label}</span>
            {extra}
        </button>
    );
    const kbd = <kbd className="font-mono text-[10px] text-muted-foreground">Ctrl+S</kbd>;
    const ROWS = {
        save: () => row(Save, t('Save'), () => run(looks.save), kbd),
        saveas: () => row(BookmarkPlus, t('Save as new…'), () => setMode({ mode: 'saveas' }), !own && kbd),
        rename: () => row(Pencil, t('Rename…'), () => setMode({ mode: 'rename' })),
        duplicate: () => row(Copy, t('Duplicate'), () => run(looks.duplicate)),
        delete: () => row(Trash2, t('Delete'), () => setMode({ mode: 'delete' })),
    };
    return lookActions(looks.current.kind, looks.edited).map((id) => <Fragment key={id}>{ROWS[id]()}</Fragment>);
}

/** An inline question with Yes and No; focus starts on No. */
export function Confirm({ label, onYes, onNo, busy }) {
    const t = useT();
    const no = useRef(null);
    useEffect(() => { no.current?.focus(); }, []);
    const btn = 'shrink-0 rounded-sm border border-x-white/10 border-b-black/60 border-t-white/20 px-2.5 py-1 text-[11px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
    return (
        <div role="group" aria-label={label} className="flex items-center gap-2 px-2 py-1">
            <span className="min-w-0 flex-1 break-words text-[12px]">{label}</span>
            <button type="button" role="menuitem" data-look-item="" disabled={busy} onClick={onYes} className={btn}>{t('Yes')}</button>
            <button ref={no} type="button" role="menuitem" data-look-item="" onClick={onNo} className={btn}>{t('No')}</button>
        </div>
    );
}

/** The inline name field of Save as new and Rename. Enter confirms. A name
 *  that is taken (an own look's, when renaming; a starter's, always) does not
 *  save: the field takes the next free name, selected, with one line saying
 *  so, and the next Enter saves that. The exact name of another own look
 *  asks before replacing it (Save as new). Escape cancels. */
export function NameField({ kind, looks, onDone, onCancel, onReplace }) {
    const t = useT();
    const c = looks.current;
    const rename = kind === 'rename';
    const initial = rename ? c.name : (c.kind === 'untitled' ? '' : nextFreeName(c.kind === 'mine' ? c.name : t(c.name), [...looks.own, ...looks.reserved]));
    const [value, setValue] = useState(initial);
    // The name that was refused, while its suggestion sits in the field.
    const [refused, setRefused] = useState(null);
    // Counts the times the field was filled for the person: focus and select again.
    const [filled, setFilled] = useState(0);
    const ref = useRef(null);
    useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, [filled]);
    const opts = { reserved: looks.reserved, allowReplace: !rename, except: rename ? c.name : null };
    const check = checkName(value, looks.own, opts);
    const label = rename ? t('Rename') : t('Save');

    function submit() {
        if (check.kind === 'invalid' || looks.saving) return;
        const step = nameStep(value, looks.own, opts);
        if (step.kind === 'taken') {
            setRefused(step.name);
            setValue(step.suggest);
            setFilled((n) => n + 1);
            return;
        }
        if (step.kind === 'replace') {
            onReplace(step.name);
            return;
        }
        (rename ? looks.rename : looks.saveAs)(step.name).then((ok) => { if (ok) onDone(); });
    }

    return (
        <div className="flex flex-col gap-1 px-1 py-1">
            <div className="flex h-8 items-stretch gap-1">
                <input
                    ref={ref}
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setRefused(null); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); submit(); }
                        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
                    }}
                    placeholder={t('Name, e.g. Podcast')}
                    aria-label={rename ? t('New name') : t('Name of the new look')}
                    maxLength={40}
                    spellCheck={false}
                    className={inputCls}
                />
                <button
                    type="button"
                    onClick={submit}
                    disabled={check.kind === 'invalid' || looks.saving}
                    className="shrink-0 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 px-2.5 text-[11px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                    {label}
                </button>
                <Tip label={t('Cancel')} side="top">
                    <button type="button" aria-label={t('Cancel')} onClick={onCancel} className={cn('shrink-0 rounded-md px-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring')}>
                        <X className="size-3.5" aria-hidden />
                    </button>
                </Tip>
            </div>
            <p aria-live="polite" className="min-h-[14px] px-1 text-[11px] leading-snug text-muted-foreground">
                {refused !== null && check.kind === 'ok'
                    ? t('“{name}” is taken. Press Enter again to use this one.', { name: refused })
                    : check.kind === 'replace' ? t('Same name as a saved look. Enter asks before replacing it.') : ''}
            </p>
        </div>
    );
}
