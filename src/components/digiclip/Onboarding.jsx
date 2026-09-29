import { Fragment, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { navigate } from '../../lib/socket';
import { useT } from '../../lib/i18n';

/** Fill `{name}` slots in a translated sentence with JSX (links, bold
 *  words) so the word order stays the translation's own. */
function rich(text, parts) {
    return text.split(/(\{\w+\})/).map((seg, i) => {
        const m = /^\{(\w+)\}$/.exec(seg);
        return m && m[1] in parts ? <Fragment key={i}>{parts[m[1]]}</Fragment> : seg;
    });
}

const STORE_KEY = 'digiclip.onboardingDone';

export function shouldShowOnboarding() {
    try {
        if (window.__DIGICLIP_NO_TOUR) return false;
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
        body: ({ name, t }) => (
            <>
                <p>
                    {name ? (
                        rich(t('Hey {name} — welcome to DigiClip.'), { name: <span className="font-semibold text-foreground">{name}</span> })
                    ) : (
                        <>{t('Welcome to DigiClip.')}</>
                    )}
                </p>
                <p className="mt-2">
                    {t('Turn long videos into TikTok-ready vertical clips: offline transcription, AI clip picking, captioned 9:16 renders. This tour takes 30 seconds.')}
                </p>
            </>
        ),
    },
    {
        key: 'upload',
        title: '1 · Drop a video',
        body: ({ t }) => (
            <p>
                {rich(t('Start on {home} — drop a video into the upload box, top left. MP4, MOV, MKV or WebM, straight off your disk. It lands in the {queue} right below.'), {
                    home: <span className="font-medium text-foreground">{t('Home')}</span>,
                    queue: <span className="font-medium text-foreground">{t('Queue')}</span>,
                })}
            </p>
        ),
    },
    {
        key: 'queue',
        title: '2 · Watch the queue',
        body: ({ t }) => (
            <p>
                {rich(t('Each queue row walks the pipeline: {steps}. Retry or cancel anytime — the row tells you what is happening.'), {
                    steps: <span className="font-mono text-[11px]">{t('Upload → Audio → Script → Clips')}</span>,
                })}
            </p>
        ),
    },
    {
        key: 'apikey',
        title: '3 · API key (for smart clips)',
        body: ({ t }) => (
            <>
                <p>
                    {rich(t('For AI-picked highlights, grab a free key at {link}, then paste it in {where}.'), {
                        link: (
                            <a
                                href="https://openrouter.ai/keys"
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-foreground underline underline-offset-2"
                            >
                                openrouter.ai/keys
                            </a>
                        ),
                        where: <span className="font-medium text-foreground">{t('Settings → Connection')}</span>,
                    })}
                </p>
                <p className="mt-2">
                    {t('No key? Clips fall back to heuristics. Transcription itself is always offline.')}
                </p>
            </>
        ),
        action: { label: 'Open Settings', href: '/settings' },
    },
    {
        key: 'clips',
        title: '4 · Play and share',
        body: ({ t }) => (
            <>
                <p>
                    {t('Finished projects show their clips on the right — click a tile to play it (vertical 9:16), download icon to save the file.')}
                </p>
                <p className="mt-2">
                    {rich(t('{health} shows ffmpeg, whisper and GPU status if anything ever looks off.'), {
                        health: <span className="font-medium text-foreground">{t('Health')}</span>,
                    })}
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
    const t = useT();
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
        navigate('settings');
    }

    return (
        <div
            className={cn('fixed inset-x-0 bottom-0 top-[var(--chrome)] z-50 flex items-center justify-center bg-black/60 pl-[var(--chrome)] backdrop-blur-sm', leaving ? 'fade-out' : 'fade')}
            onMouseDown={(e) => { if (e.target === e.currentTarget) finish(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t('Onboarding: {title}', { title: t(s.title) })}
                className={cn('w-[min(440px,calc(100vw-3rem))] rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-5 shadow-2xl', leaving ? 'pop-out' : 'pop')}
            >
                <div className="flex items-center gap-2">
                    <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                        {t(s.title)}
                    </p>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {step + 1}/{STEPS.length}
                    </span>
                    <button
                        type="button" aria-label={t('Skip tour')} onClick={finish}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="size-4" aria-hidden />
                    </button>
                </div>
                <div className="mt-2 min-h-[96px] text-[13px] text-muted-foreground">
                    {s.body({ name, t })}
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
                            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                            {t('Skip tour')}
                        </button>
                    <div className="flex items-center gap-2">
                        {step > 0 && (
                            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                                <ArrowLeft className="size-3.5" aria-hidden /> {t('Back')}
                            </Button>
                        )}
                        {s.action && (
                            <Button variant="outline" size="sm" onClick={goSettings}>
                                {t(s.action.label)}
                            </Button>
                        )}
                        {!last ? (
                            <Button size="sm" onClick={() => setStep(step + 1)}>
                                {t('Next')} <ArrowRight className="size-3.5" aria-hidden />
                            </Button>
                        ) : (
                            <Button size="sm" onClick={finish}>
                                {t('Get started')}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
