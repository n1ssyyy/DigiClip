import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { navigate, useStore } from '../../lib/socket';
import { useT } from '../../lib/i18n';
import { placeCard } from '../../lib/tourGeometry';
import { tourSteps } from '../../lib/tourSteps';
import useTourTarget from './useTourTarget';

/** Fill `{name}` slots in a translated sentence with bold words, so the word
 *  order stays the translation's own. */
function rich(text, slots) {
    return text.split(/(\{\w+\})/).map((seg, i) => {
        const m = /^\{(\w+)\}$/.exec(seg);
        return m && m[1] in slots
            ? <span key={i} className="font-medium text-foreground">{slots[m[1]]}</span>
            : <Fragment key={i}>{seg}</Fragment>;
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

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * First-run tour: a short welcome, then each step highlights the real thing
 * it talks about (the rest of the window dimmed, the target left clear and
 * outlined) with a small card beside it that never covers it. The targets
 * carry `data-tour` attributes; a step whose target is missing or not on
 * screen shows its card in the middle instead. It starts on Home so its
 * targets exist. Same overlay language as the app dialogs; persists via
 * localStorage; replayed from the header, Health and Settings. Modal for
 * assistive tech: focus moves into the card, Tab stays in it, Escape closes,
 * and focus goes back to where it was.
 */
export default function Onboarding({ username, open, leaving, onClose }) {
    const t = useT();
    const hasVideos = useStore((s) => (s.jobs?.length ?? 0) > 0);
    const name = displayName(username);
    const steps = useMemo(() => tourSteps(t, { hasVideos, name }), [t, hasVideos, name]);
    const [step, setStep] = useState(0);
    const [size, setSize] = useState({ w: 380, h: 200 });
    const overlay = useRef(null);
    const card = useRef(null);
    const primary = useRef(null);
    const origin = useRef(null);
    const s = steps[Math.min(step, steps.length - 1)];
    const last = step === steps.length - 1;
    const { win, rect } = useTourTarget(overlay, open ? s.target : null, [step, hasVideos, open]);
    const place = win ? placeCard({ win, rect, card: size }) : null;

    // A fresh tour from the start every time it opens, on Home where its
    // targets are; focus is remembered to be given back.
    useEffect(() => {
        if (!open) return;
        const here = document.activeElement;
        if (!origin.current && !card.current?.contains(here)) origin.current = here;
        setStep(0);
        navigate('home');
    }, [open]);

    // The card's own size decides which side has room for it.
    useLayoutEffect(() => {
        const el = card.current;
        if (!el) return undefined;
        const read = () => setSize((p) => (p.w === el.offsetWidth && p.h === el.offsetHeight ? p : { w: el.offsetWidth, h: el.offsetHeight }));
        read();
        const ro = new ResizeObserver(read);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Focus lives in the card: on open, and again when a step swaps the button
    // that had it.
    useEffect(() => {
        if (card.current && !card.current.contains(document.activeElement)) primary.current?.focus({ preventScroll: true });
    }, [step, open]);

    function giveFocusBack() {
        const el = origin.current;
        origin.current = null;
        if (el && el.isConnected && typeof el.focus === 'function') el.focus({ preventScroll: true });
    }
    function finish() {
        markOnboardingDone();
        onClose();
        giveFocusBack();
    }
    function goTo(page) {
        markOnboardingDone();
        onClose();
        navigate(page);
    }

    // Escape closes; Tab goes round inside the card, even when focus got out.
    const finishRef = useRef(finish);
    finishRef.current = finish;
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finishRef.current();
            } else if (e.key === 'Tab' && card.current) {
                const items = [...card.current.querySelectorAll(FOCUSABLE)];
                if (!items.length) return;
                const i = items.indexOf(document.activeElement);
                const edge = e.shiftKey ? i <= 0 : i === items.length - 1;
                if (i === -1 || edge) {
                    e.preventDefault();
                    items[e.shiftKey ? items.length - 1 : 0].focus();
                }
            }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [open]);

    if (!open) return null;
    const hole = place?.hole;

    return (
        <div
            ref={overlay}
            className={cn(
                'fixed inset-x-0 bottom-0 top-[var(--chrome)] z-50 overflow-hidden motion-safe:transition-colors motion-safe:duration-200',
                !hole && 'bg-black/60 backdrop-blur-sm',
                leaving ? 'fade-out' : 'fade',
            )}
            onMouseDown={(e) => { if (e.target === e.currentTarget) finish(); }}
        >
            {hole && (
                <div
                    key={s.key}
                    aria-hidden
                    className="fade pointer-events-none absolute rounded-md border-2 border-foreground/90"
                    style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.6)' }}
                />
            )}
            <div
                ref={card}
                role="dialog"
                aria-modal="true"
                aria-label={t('Onboarding: {title}', { title: s.title })}
                className={cn(
                    'absolute max-h-[calc(100%-24px)] w-[min(380px,calc(100%-24px))] overflow-y-auto rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-5 shadow-2xl',
                    leaving ? 'pop-out' : 'pop',
                )}
                style={place ? { left: place.left, top: place.top } : { visibility: 'hidden' }}
            >
                <div className="flex items-center gap-2">
                    <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{s.title}</p>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{step + 1}/{steps.length}</span>
                    <button
                        type="button" aria-label={t('Skip tour')} onClick={finish}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <X className="size-4" aria-hidden />
                    </button>
                </div>
                <div key={s.key} className="fade mt-2 space-y-2 text-[13px] leading-snug text-muted-foreground" aria-live="polite">
                    {s.body.map((line, i) => <p key={i}>{rich(line, s.slots)}</p>)}
                </div>
                <div className="mt-3 flex items-center gap-1.5" aria-hidden>
                    {steps.map((x, i) => (
                        <span
                            key={x.key}
                            className={cn('h-1.5 rounded-full motion-safe:transition-all motion-safe:duration-300', i === step ? 'w-5 bg-foreground' : 'w-1.5 bg-border')}
                        />
                    ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <button
                        type="button" onClick={finish}
                        className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        {t('Skip tour')}
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                        {step > 0 && (
                            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                                <ArrowLeft className="size-3.5" aria-hidden /> {t('Back')}
                            </Button>
                        )}
                        {s.action && (
                            <Button variant="outline" size="sm" onClick={() => goTo(s.action.page)}>
                                {s.action.label}
                            </Button>
                        )}
                        {!last ? (
                            <Button ref={primary} size="sm" onClick={() => setStep(step + 1)}>
                                {t('Next')} <ArrowRight className="size-3.5" aria-hidden />
                            </Button>
                        ) : (
                            <Button ref={primary} size="sm" onClick={finish}>
                                {t('Get started')}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
