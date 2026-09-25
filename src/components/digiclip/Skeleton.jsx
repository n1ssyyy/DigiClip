import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * Shimmer placeholder block. Each instance is dumb; the fade choreography
 * lives in FadeImg/Swap so every loader runs independently.
 */
export function Skeleton({ className }) {
    return <span aria-hidden className={cn('skel block', className)} />;
}

/**
 * Image over its own skeleton: the shimmer shows underneath while the
 * file loads, then fades out as the image fades in. Independent per
 * instance via local state.
 *
 * A failed load retries with backoff before giving up: posters are
 * written by the engine a moment *after* their tile appears (a fresh
 * job's source poster lands ~2s in), so the first request can 404 while
 * the file is still on its way. Only after the retries run out does the
 * whole thing unmount so the fallback behind shows through.
 */
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 8000, 8000, 8000, 8000, 8000];

export function FadeImg({ src, alt = '', eager = false, className, imgClassName }) {
    const [loaded, setLoaded] = useState(false);
    const [skelGone, setSkelGone] = useState(false);
    const [gone, setGone] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [prevSrc, setPrevSrc] = useState(src);
    const retryTimer = useRef(null);

    // A new src starts over (fresh retries, skeleton back). Reset during
    // render, not in an effect: an effect also runs on mount, and WebKit
    // fires `load` for a cached image before passive effects flush — the
    // reset would then hide an image that already arrived.
    if (src !== prevSrc) {
        setPrevSrc(src);
        setLoaded(false);
        setSkelGone(false);
        setGone(false);
        setAttempt(0);
    }
    useEffect(() => () => clearTimeout(retryTimer.current), [src]);

    // Backstop for a load that completed before React was listening.
    const imgRef = useCallback((el) => {
        if (el?.complete && el.naturalWidth > 0) setLoaded(true);
    }, []);

    useEffect(() => {
        if (!loaded) return;
        const t = setTimeout(() => setSkelGone(true), 350);
        return () => clearTimeout(t);
    }, [loaded]);

    if (!src || gone) return null;

    // Retries bust the cache so a remembered 404 isn't reused.
    const url = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}`;

    return (
        <span className={cn('absolute inset-0 block overflow-hidden', className)} aria-hidden={alt === ''}>
            {!skelGone && (
                <span
                    aria-hidden
                    className={cn(
                        'skel absolute inset-0 block motion-safe:transition-opacity motion-safe:duration-300',
                        loaded && 'opacity-0',
                    )}
                />
            )}
            <img
                ref={imgRef}
                src={url}
                alt={alt}
                loading={eager ? 'eager' : 'lazy'}
                draggable={false}
                onLoad={() => setLoaded(true)}
                onError={() => {
                    if (attempt >= RETRY_DELAYS.length) {
                        setGone(true);
                        return;
                    }
                    clearTimeout(retryTimer.current);
                    retryTimer.current = setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAYS[attempt]);
                }}
                className={cn(
                    imgClassName ?? 'h-full w-full object-cover',
                    'motion-safe:transition-opacity motion-safe:duration-300',
                    loaded ? 'opacity-100' : 'opacity-0',
                )}
            />
        </span>
    );
}

/**
 * Content over its own skeleton: renders `skeleton` until `ready` flips,
 * then crossfades (skeleton out, children in over 300ms) and unmounts
 * the skeleton after the beat. Each instance runs its own timers, and
 * dropping back to `ready === false` resets to skeleton.
 */
export function Swap({ ready, skeleton, children, className }) {
    // skel -> swap -> real. During swap the children overlay the
    // fading skeleton in the same box, then take over the flow.
    const [phase, setPhase] = useState(ready ? 'real' : 'skel');
    const timer = useRef(null);

    useEffect(() => {
        if (!ready) setPhase('skel');
        else setPhase((p) => (p === 'skel' ? 'swap' : p));
    }, [ready]);

    useEffect(() => {
        if (phase !== 'swap') return;
        timer.current = setTimeout(() => setPhase('real'), 350);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [phase]);

    return (
        <span className={cn('relative block', className)}>
            {phase !== 'real' && (
                <span
                    aria-hidden
                    className={cn(
                        'block motion-safe:transition-opacity motion-safe:duration-300',
                        phase === 'swap' && 'opacity-0',
                    )}
                >
                    {skeleton}
                </span>
            )}
            {phase !== 'skel' && (
                <span className={cn('skel-fade-in block', phase === 'swap' && 'absolute inset-0')}>
                    {children}
                </span>
            )}
        </span>
    );
}
