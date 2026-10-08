import { useEffect, useMemo, useState } from 'react';
import { artUrl, getTranscript, srcUrl } from '../../lib/socket';

const KEY = 'digiclip.studio.sample';
export const STAND_IN = 'standin';
const WINDOW_S = 12;

/** About fourteen words over six seconds, with a number, power words and
 *  a sentence break so every part of the caption rules has something to
 *  show. */
const STAND_IN_TEXT = ['Stop', 'scrolling.', 'Here', 'are', '3', 'secrets', 'to', 'make', 'your', 'captions', 'look', 'insane,', 'never', 'boring.'];
export const STAND_IN_WORDS = STAND_IN_TEXT.map((w, i) => ({ w, s: Math.round(i * 0.42 * 100) / 100, e: Math.round((i * 0.42 + 0.36) * 100) / 100 }));
export const STAND_IN_LEN = 6;

function stored() {
    try {
        return localStorage.getItem(KEY);
    } catch {
        return null;
    }
}

/** Videos that can serve as a sample: their clips are picked or done. */
export function sampleJobs(jobs) {
    return (jobs ?? []).filter((j) => j.status === 'clips_ready' || j.status === 'done');
}

/** The words of a stretch of the transcript, on the sample's own clock. */
export function windowWords(words, start, len) {
    return (words ?? [])
        .filter((w) => w.e > start && w.s < start + len)
        .map((w) => ({ w: w.w, s: Math.max(0, w.s - start), e: Math.min(len, w.e - start) }));
}

/**
 * What the stage shows: the picked video (or the stand-in), the 12-second
 * window of its transcript, and where that window starts.
 */
export function useSample(jobs) {
    const eligible = useMemo(() => sampleJobs(jobs), [jobs]);
    const [choice, setChoiceState] = useState(stored);
    const job = useMemo(() => {
        if (choice === STAND_IN) return null;
        return eligible.find((j) => j.id === choice) ?? eligible[0] ?? null;
    }, [choice, eligible]);
    const jobId = job?.id ?? null;
    const [transcript, setTranscript] = useState({ id: null, status: 'idle', words: [] });

    function setChoice(id) {
        setChoiceState(id);
        try {
            localStorage.setItem(KEY, id);
        } catch {
        }
    }

    useEffect(() => {
        if (!jobId) return undefined;
        let dead = false;
        setTranscript({ id: jobId, status: 'loading', words: [] });
        getTranscript(jobId)
            .then((d) => { if (!dead) setTranscript({ id: jobId, status: 'ready', words: d?.words ?? [] }); })
            .catch(() => { if (!dead) setTranscript({ id: jobId, status: 'failed', words: [] }); });
        return () => { dead = true; };
    }, [jobId]);

    const start = Math.max(0, job?.clips?.[0]?.start_s ?? 0);
    const duration = job?.duration_s > 0 ? job.duration_s : null;
    const len = job ? Math.max(3, Math.min(WINDOW_S, duration ? duration - start : WINDOW_S)) : STAND_IN_LEN;

    const loaded = job && transcript.id === jobId ? transcript : null;
    const real = useMemo(() => (loaded?.status === 'ready' ? windowWords(loaded.words, start, len) : []), [loaded, start, len]);

    // 'standin' | 'loading' | 'failed' | 'empty' | 'ready'
    let status = 'standin';
    if (job) status = !loaded || loaded.status === 'loading' ? 'loading' : loaded.status === 'failed' ? 'failed' : real.length ? 'ready' : 'empty';
    const words = status === 'ready' ? real : STAND_IN_WORDS;

    return {
        choice: job ? job.id : STAND_IN,
        setChoice,
        eligible,
        job,
        status,
        words,
        start: job ? start : 0,
        // Stand-in words only cover six seconds, so the window shrinks to them.
        len: status === 'ready' ? len : Math.min(len, STAND_IN_LEN),
        src: job && jobId ? safe(() => srcUrl(jobId)) : null,
        poster: job && jobId ? safe(() => artUrl(jobId, 'poster.jpg')) : null,
    };
}

function safe(fn) {
    try {
        return fn();
    } catch {
        return null;
    }
}
