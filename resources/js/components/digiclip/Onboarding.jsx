import { useEffect, useState } from 'react';
import { router } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const STORE_KEY = 'digiclip.onboardingDone';

export function shouldShowOnboarding() {
    try {
        return localStorage.getItem(STORE_KEY) !== '1';
    } catch {
        return true;
    }
}

export function markOnboardingDone() {
    try {
        localStorage.setItem(STORE_KEY, '1');
    } catch {
    }
}

export function resetOnboarding() {
    try {
        localStorage.removeItem(STORE_KEY);
    } catch {
    }
}

function displayName(username) {
    if (!username) return null;
    return username.charAt(0).toUpperCase() + username.slice(1);
}

const STEPS = [
    {
        key: 'welcome',
        title: 'Welcome',
        body: ({ name }) => (
            <>
                <p>
                    {name ? (
                        <>Hey <span className="font-semibold text-foreground">{name}</span> — welcome to DigiClip.</>
                    ) : (
                        <>Welcome to DigiClip.</>
                    )}
                </p>
                <p className="mt-2">
                    Turn long videos into TikTok-ready vertical clips: offline transcription,
                    AI clip picking, captioned 9:16 renders. This tour takes 30 seconds.
                </p>
            </>
        ),
    },
    {
        key: 'upload',
        title: '1 · Drop a video',
        body: () => (
            <p>
                Start on <span className="font-medium text-foreground">Home</span> — drop a video
                into the upload box, top left. MP4, MOV, MKV or WebM, up to 500 MB.
                It lands in the <span className="font-medium text-foreground">Queue</span> right below.
            </p>
        ),
    },
    {
        key: 'queue',
        title: '2 · Watch the queue',
        body: () => (
            <p>
                Each queue row walks the pipeline:{' '}
                <span className="font-mono text-xs">Upload → Audio → Script → Clips</span>.
                Pause, resume, retry or cancel anytime — the row tells you what is happening.
            </p>
        ),
    },
    {
        key: 'apikey',
        title: '3 · API key (for smart clips)',
        body: () => (
            <>
                <p>
                    For AI-picked highlights, grab a free key at{' '}
                    <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-foreground underline underline-offset-2"
                    >
                        openrouter.ai/keys
                    </a>
                    , then paste it in <span className="font-medium text-foreground">Settings → Connection</span>.
                </p>
                <p className="mt-2">
                    No key? Clips fall back to heuristics. Transcription itself is always offline.
                </p>
            </>
        ),
        action: { label: 'Open Settings', href: '/settings' },
    },
    {
        key: 'clips',
        title: '4 · Play and share',
        body: () => (
            <>
                <p>
                    Finished projects show their clips on the right — click a tile to play it
                    (vertical 9:16), download icon to save the file.
                </p>
                <p className="mt-2">
                    <span className="font-medium text-foreground">Health</span> shows ffmpeg,
                    whisper and GPU status if anything ever looks off.
                </p>
            </>
        ),
    },
];

/**
 * First-run tour: welcome by device username + 4-step walkthrough
 * (upload, queue, API key, clips). Same overlay language as the app
 * dialogs (fade/pop in, dedicated fade-out/pop-out out; pinned below
 * the window header, centered in the content page). Persists via
 * localStorage; replay from the header Tour button or Health/Settings.
 */
export default function Onboarding({ username, open, leaving, onClose }) {
    const [step, setStep] = useState(0);
    const name = displayName(username);
    const last = step === STEPS.length - 1;

    // Fresh tour from the start every time it opens.
    useEffect(() => {
        if (open) setStep(0);
    }, [open ]);

    if (!open) return null;
    const s = STEPS[step];

    function finish() {
        markOnboardingDone();
        onClose();
    }

    function goSettings() {
        markOnboardingDone();
        onClose();
        router.visit('/settings');
    }

    return (
        <div
            className={cn('fixed inset-x-0 bottom-0 top-[53px] z-50 flex items-center justify-center bg-black/60 pl-[53px] backdrop-blur-sm', leaving ? 'fade-out' : 'fade')}
            onMouseDown={(e) => { if (e.target === e.currentTarget) finish(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`Onboarding: ${s.title}`}
                className={cn('w-[min(440px,calc(100vw-3rem))] rounded-lg border bg-card p-5 shadow-2xl', leaving ? 'pop-out' : 'pop')}
            >
                <div className="flex items-center gap-2">
                    <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                        {s.title}
                    </p>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        {step + 1}/{STEPS.length}
                    </span>
                    <button
                        type="button" aria-label="Skip tour" onClick={finish}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="size-4" aria-hidden />
                    </button>
                </div>
                <div className="mt-2 min-h-[96px] text-sm text-muted-foreground">
                    {s.body({ name })}
                </div>
                {/* Step dots */}
                <div className="mt-3 flex items-center gap-1.5" aria-hidden>
                    {STEPS.map((t, i) => (
                        <span
                            key={t.key}
                            className={cn(
                                'h-1.5 rounded-full motion-safe:transition-all motion-safe:duration-300',
                                i === step ? 'w-5 bg-foreground' : 'w-1.5 bg-border',
                            )}
                        />
                    ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                    <button
                        type="button" onClick={finish}
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                        Skip tour
                    </button>
                    <div className="flex items-center gap-2">
                        {step > 0 && (
                            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                                <ArrowLeft className="size-3.5" aria-hidden /> Back
                            </Button>
                        )}
                        {s.action && (
                            <Button variant="outline" size="sm" onClick={goSettings}>
                                {s.action.label}
                            </Button>
                        )}
                        {!last ? (
                            <Button size="sm" onClick={() => setStep(step + 1)}>
                                Next <ArrowRight className="size-3.5" aria-hidden />
                            </Button>
                        ) : (
                            <Button size="sm" onClick={finish}>
                                Get started
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
