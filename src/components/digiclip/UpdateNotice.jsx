import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Loader2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { dismissUpdate, runSetup, useUpdates } from '../../lib/updates';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';
import { usePanelBeat } from './usePanelBeat';

// Exit beat: matches the banner-out keyframes. Zero when motion is reduced,
// so the banner simply goes.
const LEAVE_MS = 260;
const reducedMotion = () => {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
};

/**
 * Update affordance, bottom-left (toasts own bottom-right). Same voice as
 * the room: popover surface, hairline border, JetBrains Mono, one status
 * glyph, plain-verb copy. The action hands off to DigiClip Setup, which
 * owns download + replacement in its own UI.
 */
export default function UpdateNotice() {
    const phase = useUpdates((s) => s.phase);
    const available = useUpdates((s) => s.available);
    const current = useUpdates((s) => s.current);
    const dismissed = useUpdates((s) => s.dismissed);
    const pct = useUpdates((s) => s.pct);
    const [notesOpen, setNotesOpen] = useState(false);
    const [notesLeaving, setNotesLeaving] = useState(false);
    const leaveTimer = useRef(null);
    const t = useT();
    useEffect(() => () => clearTimeout(leaveTimer.current), []);
    // Fade the notes out before unmounting them (180ms, like every dialog).
    const closeNotes = () => {
        setNotesLeaving(true);
        clearTimeout(leaveTimer.current);
        leaveTimer.current = setTimeout(() => {
            setNotesOpen(false);
            setNotesLeaving(false);
        }, 190);
    };

    const busy = phase === 'downloading' || phase === 'handing-off';
    const showBanner = (phase === 'available' || busy) && available && dismissed !== available.version;
    // Hold the last release while the banner leaves: `available` can already
    // be gone by then, and the copy must not change mid-exit.
    const held = useRef(null);
    if (showBanner) held.current = { available, current, phase, pct };
    const { show, leaving } = usePanelBeat(!!showBanner, reducedMotion() ? 0 : LEAVE_MS);
    if (!showBanner && !show) return null;
    const v = showBanner ? { available, current, phase, pct } : held.current;
    if (!v) return null;
    const { available: av, current: cur, phase: ph, pct: pc } = v;

    return (
        <>
            <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-4 z-[200] flex flex-col gap-2">
                <div className={leaving ? 'banner-out' : undefined}>
                <div className={leaving ? 'min-h-0 overflow-hidden' : undefined}>
                <div
                    role="status"
                    className="rise pointer-events-auto w-80 rounded-md border bg-popover p-3 text-popover-foreground shadow-xl"
                >
                    <div className="flex items-start gap-3">
                        <ArrowDownToLine className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium">{t('Update available — v{version}', { version: av.version })}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {cur ? t('You have v{version}. DigiClip Setup handles the rest.', { version: cur }) : t('DigiClip Setup handles the rest.')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={dismissUpdate}
                            aria-label={t('Dismiss update')}
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <X className="size-3.5" aria-hidden />
                        </button>
                    </div>
                    <div className="mt-2.5 flex items-center justify-end gap-2">
                        {av.notes && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => setNotesOpen(true)}>
                                {t('Notes')}
                            </Button>
                        )}
                        <Button type="button" size="sm" disabled={busy} onClick={runSetup}>
                            {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                            {ph === 'downloading' ? t('Downloading… {pct}%', { pct: pc ?? 0 }) : ph === 'handing-off' ? t('Opening Setup…') : t('Update')}
                        </Button>
                    </div>
                </div>
                </div>
                </div>
            </div>
            {notesOpen && (
                <div
                    className={cn('fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-6', notesLeaving ? 'fade-out' : 'fade')}
                    onClick={closeNotes}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={t('Release notes for v{version}', { version: av.version })}
                        className={cn('w-[min(480px,calc(100vw-3rem))] rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-5 shadow-2xl', notesLeaving ? 'pop-out' : 'pop')}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-[13px] font-semibold">{t("What's new in v{version}", { version: av.version })}</h2>
                        {av.date && (
                            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{av.date.slice(0, 10)}</p>
                        )}
                        <pre className="digi-scroll mt-3 max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
                            {av.notes || t('No notes published for this build.')}
                        </pre>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={closeNotes}>
                                {t('Close')}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                    closeNotes();
                                    runSetup();
                                }}
                            >
                                {t('Update via Setup')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
