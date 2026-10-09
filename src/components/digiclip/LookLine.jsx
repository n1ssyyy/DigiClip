import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Tip from './Tooltip';
import InlinePick, { PickerFace, pickerBox } from './InlinePick';
import { usePanelBeat } from './usePanelBeat';
import { useFloatingPanel } from './useFloatingPanel';
import LookRows, { focusCurrent, moveInList } from '../studio/LookRows';
import { useLooks } from '../studio/useLooks';
import { ASPECTS, useLook } from '../../lib/look';
import { setMainShape } from '../../lib/shapes';
import { KINDS, clipsText, countChoices, countFace, homePieces, kindText } from '../../lib/homeLine';
import { useStore } from '../../lib/socket';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';

/** The Look in use, as a button that opens the list of looks. Picking one
 *  loads it (the same list and the same loading as Studio's picker). */
function LookMenu({ looks }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const { show, leaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const btnRef = useRef(null);
    const pos = useFloatingPanel(show, rootRef, 6, 'left');
    const placed = !!pos;
    const { current, edited } = looks;
    const shown = current.kind === 'mine' ? current.name : t(current.name);

    const close = (refocus = true) => {
        setOpen(false);
        if (refocus) btnRef.current?.focus();
    };

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    // Opening the list puts focus on the look that is current.
    useEffect(() => {
        if (open && show && !leaving) focusCurrent(panelRef.current);
    }, [open, show, leaving, placed]);

    function onKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            close();
        } else {
            moveInList(e, panelRef.current);
        }
    }

    return (
        <div ref={rootRef} className="relative min-w-0">
            <Tip label={`${t('Look')}: ${shown}`} side="bottom" className="w-full">
                <button
                    ref={btnRef}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-label={`${t('Look')}: ${shown}${edited ? `, ${t('edited')}` : ''}`}
                    onClick={() => setOpen((o) => !o)}
                    className={cn(pickerBox, 'cursor-pointer outline-none')}
                >
                    <PickerFace label={t('Look')} text={shown} mark={edited} open={open} />
                </button>
            </Tip>
            {show && pos && createPortal(
                <div
                    ref={panelRef}
                    role="menu"
                    aria-label={t('Looks')}
                    onKeyDown={onKeyDown}
                    style={{ ...pos, width: 340, maxWidth: 'calc(100vw - 16px)' }}
                    className={cn('digi-menu fixed z-[100] rounded-md border bg-popover text-popover-foreground shadow-md', leaving ? 'menu-out' : 'pop')}
                >
                    <div className="digi-scroll max-h-80 overflow-y-auto p-1">
                        <LookRows looks={looks} onPick={(entry) => { looks.load(entry); close(); }} />
                    </div>
                </div>, document.body,
            )}
        </div>
    );
}

/**
 * What the next video will look like, as four pickers of one width: the Look
 * in use (with the same "edited" mark Studio shows) opening the list of looks,
 * and the three things people change per video, each a select: how clips are
 * picked, how many, the shape. Everything else about how clips look is
 * Studio's. Renders the four as siblings so the add bar's grid lays them out.
 */
export default function LookLine() {
    const t = useT();
    const settings = useStore((s) => s.settings);
    const look = useLook(settings);
    const looks = useLooks({ look, settings, undoHint: false });
    const { options, update } = look;
    const p = homePieces(options, t);

    return (
        <>
            <LookMenu looks={looks} />
            <InlinePick
                label={t('Picking')}
                value={p.kind.value}
                text={p.kind.text}
                options={KINDS.map((k) => ({ value: k, text: kindText(k, t) }))}
                onChange={(v) => update({ kind: v })}
            />
            <InlinePick
                label={t('Clips')}
                value={p.count.value}
                text={p.count.text}
                face={countFace(p.count.value, t)}
                options={countChoices(options.count).map((n) => ({ value: n, text: clipsText(n, t) }))}
                onChange={(v) => update({ count: Number(v) })}
            />
            <InlinePick
                label={t('Shape')}
                value={p.shape.value}
                text={p.shape.text}
                options={ASPECTS.map((a) => ({ value: a, text: a }))}
                onChange={(v) => update({ aspect: setMainShape(options.aspect, v) })}
            />
        </>
    );
}
