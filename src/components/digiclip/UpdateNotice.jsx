import { useState } from 'react';
import { ArrowDownToLine, Loader2, RotateCcw, X } from 'lucide-react';
import { Button } from '../ui/button';
import ProgressRing from './ProgressRing';
import { dismissUpdate, downloadAndInstall, restartToUpdate, updateProgress, useUpdates } from '../../lib/updates';

/**
 * Update affordance, bottom-left (toasts own bottom-right). Same voice as
 * the room: popover surface, hairline border, JetBrains Mono, one status
 * glyph, plain-verb copy. Banner for available/downloading/ready, with a
 * release-notes dialog one click away.
 */
export default function UpdateNotice() {
    const phase = useUpdates((s) => s.phase);
    const available = useUpdates((s) => s.available);
    const current = useUpdates((s) => s.current);
    const dismissed = useUpdates((s) => s.dismissed);
    const error = useUpdates((s) => s.error);
    const [notesOpen, setNotesOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const showBanner =
        (phase === 'available' && available && dismissed !== available.version) ||
        phase === 'downloading' ||
        phase === 'installing' ||
        phase === 'ready';
    if (!showBanner) return null;

    const pct = updateProgress();

    async function onUpdate() {
        if (busy) return;
        setBusy(true);
        try {
            await downloadAndInstall();
        } catch {
            // Error copy lives in the store (and the Settings row).
        } finally {
            setBusy(false);
        }
    }

    async function onRestart() {
        try {
            await restartToUpdate();
        } catch {
        }
    }

    return (
        <>
            <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-4 z-[200] flex flex-col gap-2">
                <div
                    role="status"
                    className="rise pointer-events-auto w-80 rounded-md border bg-popover p-3 text-popover-foreground shadow-xl"
                >
                    <div className="flex items-start gap-3">
                        {phase === 'downloading' || phase === 'installing' ? (
                            pct !== null ? (
                                <ProgressRing value={pct} size={18} label="Update download" className="mt-0.5" />
                            ) : (
                                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                            )
                        ) : (
                            <ArrowDownToLine className="mt-0.5 size-4 shrink-0 text-[var(--viral)]" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium">
                                {phase === 'ready' && 'Update ready'}
                                {phase === 'installing' && 'Installing…'}
                                {phase === 'downloading' && `Downloading v${available?.version ?? ''}…`}
                                {phase === 'available' && `Update available — v${available?.version ?? ''}`}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {phase === 'ready' && 'Restart DigiClip to finish.'}
                                {phase === 'installing' && 'Hang tight.'}
                                {phase === 'downloading' && (pct !== null ? `${pct}% — keeps going in the background.` : 'Starting…')}
                                {phase === 'available' && (current ? `You have v${current}.` : 'A newer build is out.')}
                            </p>
                            {phase === 'available' && error && (
                                <p className="mt-0.5 text-[11px] text-destructive">{error}</p>
                            )}
                        </div>
                        {phase === 'available' && (
                            <button
                                type="button"
                                onClick={dismissUpdate}
                                aria-label="Dismiss update"
                                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                                <X className="size-3.5" aria-hidden />
                            </button>
                        )}
                    </div>
                    <div className="mt-2.5 flex items-center justify-end gap-2">
                        {(phase === 'available' || phase === 'ready') && available?.notes && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => setNotesOpen(true)}>
                                Notes
                            </Button>
                        )}
                        {phase === 'available' && (
                            <Button type="button" size="sm" disabled={busy} onClick={onUpdate}>
                                {busy ? 'Starting…' : 'Update'}
                            </Button>
                        )}
                        {phase === 'ready' && (
                            <Button type="button" size="sm" onClick={onRestart}>
                                <RotateCcw className="size-3.5" aria-hidden />
                                Restart
                            </Button>
                        )}
                    </div>
                </div>
            </div>
            {notesOpen && available && (
                <div
                    className="fade fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-6"
                    onClick={() => setNotesOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Release notes for v${available.version}`}
                        className="pop w-[min(480px,calc(100vw-3rem))] rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-5 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-[13px] font-semibold">What&apos;s new in v{available.version}</h2>
                        {available.date && (
                            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{available.date.slice(0, 10)}</p>
                        )}
                        <pre className="digi-scroll mt-3 max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
                            {available.notes || 'No notes published for this build.'}
                        </pre>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setNotesOpen(false)}>
                                Close
                            </Button>
                            {phase === 'available' && (
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => {
                                        setNotesOpen(false);
                                        onUpdate();
                                    }}
                                >
                                    Download &amp; install
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
