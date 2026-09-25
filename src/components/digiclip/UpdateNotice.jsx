import { useState } from 'react';
import { ArrowDownToLine, Loader2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { dismissUpdate, runSetup, useUpdates } from '../../lib/updates';

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
    const [notesOpen, setNotesOpen] = useState(false);

    const showBanner = phase === 'available' && available && dismissed !== available.version;
    if (!showBanner) return null;

    return (
        <>
            <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-4 z-[200] flex flex-col gap-2">
                <div
                    role="status"
                    className="rise pointer-events-auto w-80 rounded-md border bg-popover p-3 text-popover-foreground shadow-xl"
                >
                    <div className="flex items-start gap-3">
                        <ArrowDownToLine className="mt-0.5 size-4 shrink-0 text-[var(--viral)]" aria-hidden />
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium">Update available — v{available.version}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {current ? `You have v${current}. DigiClip Setup handles the rest.` : 'DigiClip Setup handles the rest.'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={dismissUpdate}
                            aria-label="Dismiss update"
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <X className="size-3.5" aria-hidden />
                        </button>
                    </div>
                    <div className="mt-2.5 flex items-center justify-end gap-2">
                        {available.notes && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => setNotesOpen(true)}>
                                Notes
                            </Button>
                        )}
                        <Button type="button" size="sm" onClick={runSetup}>
                            Update
                        </Button>
                    </div>
                </div>
            </div>
            {notesOpen && (
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
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                    setNotesOpen(false);
                                    runSetup();
                                }}
                            >
                                Update via Setup
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
