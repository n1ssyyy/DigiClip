import { useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

/** Shared shell of the two confirmations: overlay fades (fade/fade-out), box
 *  pops (pop/pop-out), pinned below the window header with a sidebar-width
 *  left offset so the box centres in the page. Held mounted by the parent's
 *  ExitBeat (ms=200). Escape and a click outside both keep things as they
 *  are; the safe button has focus. */
function Shell({ id, title, leaving, onClose, children, actions }) {
    const keepRef = useRef(null);
    useEffect(() => {
        keepRef.current?.focus();
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div
            className={cn('fixed inset-x-0 bottom-0 top-[var(--chrome)] z-50 flex items-center justify-center bg-black/60 pl-[var(--chrome)] backdrop-blur-sm', leaving ? 'fade-out' : 'fade')}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={`${id}-title`}
                aria-describedby={`${id}-desc`}
                className={cn('w-[min(400px,calc(100vw-3rem))] rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-5 shadow-2xl', leaving ? 'pop-out' : 'pop')}
            >
                <h2 id={`${id}-title`} className="text-[13px] font-semibold">{title}</h2>
                <p id={`${id}-desc`} className="mt-1.5 text-[13px] text-muted-foreground">{children}</p>
                <div className="mt-4 flex justify-end gap-2">{actions(keepRef)}</div>
            </div>
        </div>
    );
}

/** Remove one video. While it is still being worked on this is a cancel. */
export function RemoveDialog({ video, running, onClose, onConfirm, leaving }) {
    const t = useT();
    return (
        <Shell id="remove" leaving={leaving} onClose={onClose} title={running ? t('Cancel and remove?') : t('Remove this video?')}
            actions={(keepRef) => (
                <>
                    <Button ref={keepRef} variant="outline" size="sm" onClick={onClose}>{t('Keep video')}</Button>
                    <Button variant="destructive" size="sm" onClick={onConfirm}>{t('Remove')}</Button>
                </>
            )}
        >
            <span className="font-medium text-foreground [overflow-wrap:anywhere]">{video.name}</span>
            {' '}
            {running
                ? t('stops processing and its clips are deleted. Your source file stays put. This can\'t be undone.')
                : t('and its clips are deleted. Your source file stays put. This can\'t be undone.')}
        </Shell>
    );
}

/** Remove every finished video at once; work in progress is never touched. */
export function ClearDialog({ count, onClose, onConfirm, leaving }) {
    const t = useT();
    return (
        <Shell id="clear" leaving={leaving} onClose={onClose} title={t('Remove finished?')}
            actions={(keepRef) => (
                <>
                    <Button ref={keepRef} variant="outline" size="sm" onClick={onClose}>{t('Keep')}</Button>
                    <Button variant="destructive" size="sm" onClick={onConfirm}>{t('Remove')}</Button>
                </>
            )}
        >
            {count === 1 ? t('{n} video and its clips are deleted.', { n: count }) : t('{n} videos and their clips are deleted.', { n: count })}
            {' '}{t('Videos still being worked on stay put, and source files are never touched. This can\'t be undone.')}
        </Shell>
    );
}
