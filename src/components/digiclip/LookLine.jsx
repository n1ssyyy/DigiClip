import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ChevronDown, Clapperboard } from 'lucide-react';
import { Kicker } from './fields';
import InlinePick from './InlinePick';
import { usePanelBeat } from './usePanelBeat';
import { useFloatingPanel } from './useFloatingPanel';
import LookRows, { focusCurrent, moveInList } from '../studio/LookRows';
import { useLooks } from '../studio/useLooks';
import { ASPECTS, useLook } from '../../lib/look';
import { setMainShape } from '../../lib/shapes';
import { KINDS, clipsText, countChoices, homePieces, kindText } from '../../lib/homeLine';
import { navigate, useStore } from '../../lib/socket';
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
            <button
                ref={btnRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`${t('Look')}: ${shown}${edited ? `, ${t('edited')}` : ''}`}
                onClick={() => setOpen((o) => !o)}
                className="flex min-h-7 max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-[12px] font-semibold outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span className="min-w-0 break-words">{shown}</span>
                {edited && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-foreground/80" />}
                <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
            </button>
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
 * Under the upload box: what the next video will look like. The Look in use
 * (with the same "edited" mark Studio shows) opening the list of looks, a way
 * into Studio, and the three things people change per video, each editable
 * where it stands: how clips are picked, how many, the shape. Everything else
 * about how clips look is Studio's. `dim` greys the line while a file is
 * dragged over the card, so the drop target is the one thing that reads.
 */
export default function LookLine({ dim = false }) {
    const t = useT();
    const settings = useStore((s) => s.settings);
    const look = useLook(settings);
    const looks = useLooks({ look, settings, undoHint: false });
    const { options, update } = look;
    const p = homePieces(options, t);

    return (
        <div className={cn('shrink-0 pt-1.5 transition-opacity duration-150 motion-reduce:transition-none', dim && 'opacity-40')}>
            <div className="flex min-h-7 items-center gap-2">
                <Kicker>{t('Look')}</Kicker>
                <LookMenu looks={looks} />
                <div className="min-w-2 flex-1" />
                <button
                    type="button"
                    onClick={() => navigate('studio')}
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Clapperboard className="size-3.5" aria-hidden />
                    {t('Open Studio')}
                    <ArrowRight className="size-3" aria-hidden />
                </button>
            </div>
            <div className="flex min-h-7 flex-wrap items-center">
                <InlinePick
                    label={t('Picking')}
                    value={p.kind.value}
                    text={p.kind.text}
                    options={KINDS.map((k) => ({ value: k, text: kindText(k, t) }))}
                    onChange={(v) => update({ kind: v })}
                />
                <span aria-hidden className="text-muted-foreground">·</span>
                <InlinePick
                    label={t('Clips (0 = auto)')}
                    value={p.count.value}
                    text={p.count.text}
                    options={countChoices(options.count).map((n) => ({ value: n, text: clipsText(n, t) }))}
                    onChange={(v) => update({ count: Number(v) })}
                />
                <span aria-hidden className="text-muted-foreground">·</span>
                <InlinePick
                    label={t('Shape')}
                    value={p.shape.value}
                    text={p.shape.text}
                    options={ASPECTS.map((a) => ({ value: a, text: a }))}
                    onChange={(v) => update({ aspect: setMainShape(options.aspect, v) })}
                />
            </div>
        </div>
    );
}
