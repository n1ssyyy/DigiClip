import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Film, Redo2, Undo2 } from 'lucide-react';
import { Card } from '../ui/card';
import Tip from '../digiclip/Tooltip';
import { Segmented } from '../digiclip/controls';
import { ASPECT_OPTS } from '../digiclip/fields';
import { usePanelBeat } from '../digiclip/usePanelBeat';
import { useFloatingPanel } from '../digiclip/useFloatingPanel';
import { mainShape, setMainShape } from '../../lib/shapes';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { STAND_IN } from './useSample';
import LookPicker from './LookPicker';
import ExactButton from './ExactButton';

const fmtLen = (s) => {
    if (!(s > 0)) return '';
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
};

/** The sample picker: a `digi-menu` popover listing the videos whose clips
 *  are picked, plus the stand-in. */
function SampleMenu({ sample }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const { show, leaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const pos = useFloatingPanel(show, rootRef, 6, 'right');

    useEffect(() => {
        const onDown = (e) => {
            if (e.key === 'Escape') setOpen(false);
            if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onDown);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onDown);
        };
    }, []);

    const current = sample.job ? sample.job.name : t('Stand-in');
    const items = [{ id: STAND_IN, name: t('Stand-in'), sub: t('Built-in words, no video') }, ...sample.eligible.map((j) => ({ id: j.id, name: j.name, sub: fmtLen(j.duration_s) }))];

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`${t('Sample')}: ${current}`}
                onClick={() => setOpen((o) => !o)}
                className="flex h-8 w-52 shrink-0 items-center gap-2 rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-2.5 text-left text-[12px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Film className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{current}</span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
            {show && pos && createPortal(
                <div
                    ref={panelRef}
                    style={{ ...pos, width: 288 }}
                    className={cn('digi-menu fixed z-[100] rounded-md border bg-popover text-popover-foreground shadow-md', leaving ? 'menu-out' : 'pop')}
                >
                    <ul role="listbox" aria-label={t('Sample video')} className="digi-scroll max-h-72 overflow-y-auto p-1">
                        {items.map((it) => {
                            const on = it.id === sample.choice;
                            return (
                                <li key={it.id} role="option" aria-selected={on}>
                                    <button
                                        type="button"
                                        onClick={() => { sample.setChoice(it.id); setOpen(false); }}
                                        className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-accent', on && 'bg-accent')}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{it.name}</span>
                                        {it.sub && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{it.sub}</span>}
                                        <Check className={cn('size-3.5 shrink-0', !on && 'opacity-0')} aria-hidden />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>, document.body,
            )}
        </div>
    );
}

function HistoryButton({ icon: Icon, label, shortcut, disabled, onClick }) {
    return (
        <Tip label={`${label} · ${shortcut}`} side="bottom">
            <button
                type="button"
                aria-label={label}
                aria-disabled={disabled || undefined}
                onClick={() => { if (!disabled) onClick(); }}
                className={cn(
                    'flex size-8 items-center justify-center rounded-md transition-[background-color,color,transform] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    disabled ? 'cursor-not-allowed text-muted-foreground/40' : 'text-muted-foreground hover:bg-accent hover:text-foreground active:scale-90',
                )}
            >
                <Icon className="size-4" aria-hidden />
            </button>
        </Tip>
    );
}

/** The Look picker (the page's title), the stage's shape, the sample, the exact frame and undo/redo. */
export default function TopBar({ options, update, sample, history, looks, lookUi, setLookUi, exact, narrow }) {
    const t = useT();
    // One shape is on the stage: the main one. Picking another replaces it
    // and keeps any extra shapes the run will also make.
    const pick = (a) => update({ aspect: setMainShape(options.aspect, a) });
    return (
        <Card className="stagger-1 relative shrink-0">
            <div className="flex h-10 items-center gap-3 px-4">
                <div role="heading" aria-level={1} className="min-w-0 shrink"><LookPicker looks={looks} ui={lookUi} setUi={setLookUi} /></div>
                <Segmented label={t('Stage shape')} size="sm" value={mainShape(options.aspect)} options={ASPECT_OPTS} onChange={pick} className="w-52 shrink-0" />
                <div className="min-w-0 flex-1" />
                <SampleMenu sample={sample} />
                <ExactButton exact={exact} narrow={narrow} />
                <div className="flex shrink-0 items-center">
                    <HistoryButton icon={Undo2} label={t('Undo')} shortcut="Ctrl+Z" disabled={!history.canUndo} onClick={history.undo} />
                    <HistoryButton icon={Redo2} label={t('Redo')} shortcut="Ctrl+Y" disabled={!history.canRedo} onClick={history.redo} />
                </div>
            </div>
        </Card>
    );
}
