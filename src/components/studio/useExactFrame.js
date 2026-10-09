import { useCallback, useEffect, useRef, useState } from 'react';
import { ALPHA_CAP } from '../../lib/alpha';
import { frameAvailability, frameKey, frameRequest } from '../../lib/exactFrame';
import { artUrl, cmd, flashMessage, useStore } from '../../lib/socket';
import { useT } from '../../lib/i18n';

const IDLE = { phase: 'idle' };

function preload(url, fail) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(fail));
        img.src = url;
    });
}

/**
 * The exact frame: a real rendered still of the working copy at the playhead.
 * `phase` is idle, pending (asked, nothing back yet) or shown. A second
 * request while one is pending is ignored; any change to the look, the
 * shape, the sample or the playhead dismisses what is pending or shown, and a
 * reply that arrives after that is dropped.
 *
 * @returns {{phase: string, ok: boolean, reason: string|null, url?: string, data?: object, request: Function, dismiss: Function}}
 */
export function useExactFrame({ options, sample, hasVideo, player }) {
    const t = useT();
    const caps = useStore((s) => s.caps);
    const avail = frameAvailability(caps, hasVideo);
    const alpha = caps.includes(ALPHA_CAP);
    const [st, setSt] = useState(IDLE);
    const seq = useRef(0);
    const phase = useRef('idle');
    phase.current = st.phase;
    const live = useRef({});
    live.current = { options, sample, ok: avail.ok, alpha };
    const { clock, pause } = player;

    const dismiss = useCallback(() => {
        seq.current += 1;
        phase.current = 'idle';
        setSt(IDLE);
    }, []);

    const request = useCallback(() => {
        const { options: o, sample: s, ok, alpha: a } = live.current;
        if (!ok || phase.current === 'pending') return;
        if (phase.current === 'shown') {
            dismiss();
            return;
        }
        pause();
        const at = clock.get();
        const params = frameRequest(o, s, at, { alpha: a });
        if (!params) return;
        const key = frameKey(o, s, at, { alpha: a });
        const id = seq.current + 1;
        seq.current = id;
        phase.current = 'pending';
        setSt({ phase: 'pending', key });
        cmd('preview_frame', params, { timeoutMs: 45000 })
            .then(async (data) => {
                if (id !== seq.current) return;
                if (!data?.file) throw new Error(t('no picture came back'));
                const url = artUrl(data.job ?? params.job, data.file, data.rev);
                await preload(url, t("the picture couldn't be loaded"));
                if (id !== seq.current) return;
                phase.current = 'shown';
                setSt({ phase: 'shown', key, url, data });
            })
            .catch((e) => {
                if (id !== seq.current) return;
                phase.current = 'idle';
                setSt(IDLE);
                flashMessage(t("Couldn't render the exact frame: {error}", { error: e?.message ?? e }));
            });
    }, [clock, pause, dismiss, t]);

    // Anything that changes the picture (or moves the playhead) makes it stale.
    useEffect(() => {
        if (st.phase === 'idle') return undefined;
        const check = () => {
            const { options: o, sample: s, ok, alpha: a } = live.current;
            if (!ok || frameKey(o, s, clock.get(), { alpha: a }) !== st.key) dismiss();
        };
        check();
        return clock.subscribe(check);
    }, [st.phase, st.key, options, sample.job?.id, sample.start, sample.len, avail.ok, alpha, clock, dismiss]);

    useEffect(() => () => { seq.current += 1; }, []);

    return { phase: st.phase, ok: avail.ok, reason: avail.reason, url: st.url, data: st.data, request, dismiss };
}
