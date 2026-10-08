import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { aspectList, useLook } from '../lib/look';
import { CANVASES, captionLines, resolveCaptions } from '../lib/captionStyles';
import { useStore } from '../lib/socket';
import { useT } from '../lib/i18n';
import TopBar from '../components/studio/TopBar';
import Layers from '../components/studio/Layers';
import Stage from '../components/studio/Stage';
import Inspector from '../components/studio/Inspector';
import Transport from '../components/studio/Transport';
import { prefersReducedMotion } from '../components/studio/CaptionLayer';
import { useSample } from '../components/studio/useSample';
import { usePlayer } from '../components/studio/usePlayer';

// Below this page width the Layers pane shrinks to icons.
const NARROW = 1000;

/** Typing somewhere: the page's own keys stay out of the way. */
function inTextField(el) {
    if (!el || !el.closest) return false;
    return !!el.closest('textarea, select, [contenteditable=""], [contenteditable="true"], input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="button"])');
}

/** Space plays unless the key already means something to the focused
 *  control. */
function spaceIsFree(el) {
    if (!el || el === document.body || !el.closest) return true;
    if (el.getAttribute('role') === 'slider') return true;
    return !el.closest('button, a, summary, [role="radio"], [role="switch"], [role="option"], [role="checkbox"], [role="tab"], [role="menuitem"]');
}

/**
 * Studio: an interactive stage for designing how clips look. It edits the
 * Look, the same state the options popover on Home edits. This is the
 * shell: layers, the captions inspector, a stage that draws captions the
 * way the engine burns them, and a transport. Direct manipulation on the
 * stage and saved looks come later.
 */
export default function Studio() {
    const t = useT();
    const settings = useStore((s) => s.settings);
    const jobs = useStore((s) => s.jobs);
    const { options, update, setCaptions, undo, redo, canUndo, canRedo, reset } = useLook(settings);

    const [selected, setSelected] = useState('captions');
    const [loop, setLoop] = useState(true);
    const [safe, setSafe] = useState(false);
    const [videoFailed, setVideoFailed] = useState(false);
    const [narrow, setNarrow] = useState(false);
    const rootRef = useRef(null);
    const videoRef = useRef(null);
    const reduced = useMemo(prefersReducedMotion, []);

    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < NARROW));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const sample = useSample(jobs);
    useEffect(() => { setVideoFailed(false); }, [sample.job?.id]);

    const player = usePlayer({
        len: sample.len,
        start: sample.start,
        videoRef,
        hasVideo: !!sample.job && !!sample.src && !videoFailed,
        loop,
        resetKey: `${sample.job?.id ?? 'standin'}`,
    });

    const shape = aspectList(options.aspect)[0];
    const canvas = CANVASES[shape] ?? CANVASES['9:16'];
    const resolved = useMemo(
        () => resolveCaptions(options.style, shape, options.look?.captions, { anim: options.caption_anim }),
        [options.style, shape, options.look, options.caption_anim],
    );
    // Grouping depends on words, the words-per-line budget and whether the
    // motion is a moving one, not on colours or position.
    const lines = useMemo(
        () => captionLines(sample.words, resolved),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sample.words, resolved.maxWords, resolved.maxChars, resolved.wordCap, resolved.caps, resolved.anim === 'none'],
    );

    const notice = sample.status === 'loading' ? t('Loading the transcript…')
        : sample.status === 'failed' ? t("Couldn't load this transcript; showing stand-in words.")
            : sample.status === 'empty' ? t('No words in this stretch of the video; showing stand-in words.')
                : null;

    const toggle = player.toggle;
    const onKey = useCallback((e) => {
        if (e.defaultPrevented || e.altKey) return;
        const el = e.target;
        if ((e.ctrlKey || e.metaKey) && !inTextField(el)) {
            const k = e.key.toLowerCase();
            if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
            return;
        }
        if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !inTextField(el) && spaceIsFree(el)) {
            e.preventDefault();
            toggle();
        }
    }, [undo, redo, toggle]);
    useEffect(() => {
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onKey]);

    return (
        <div ref={rootRef} className="studio-root flex h-full min-h-0 flex-col gap-[5px] overflow-hidden">
            <TopBar options={options} update={update} sample={sample} history={{ canUndo, canRedo, undo, redo }} />
            <div className="flex min-h-0 flex-1 gap-[5px]">
                <Layers options={options} selected={selected} onSelect={setSelected} update={update} setCaptions={setCaptions} narrow={narrow} />
                <Stage
                    canvas={canvas}
                    resolved={resolved}
                    lines={lines}
                    clock={player.clock}
                    reduced={reduced}
                    sample={sample}
                    videoRef={videoRef}
                    videoFailed={videoFailed}
                    onVideoError={() => setVideoFailed(true)}
                    onLoadedMetadata={player.onLoadedMetadata}
                    safe={safe}
                    notice={notice}
                />
                <Inspector selected={selected} options={options} update={update} setCaptions={setCaptions} reset={reset} />
            </div>
            <Transport player={player} len={sample.len} words={sample.words} loop={loop} onLoop={setLoop} safe={safe} onSafe={setSafe} />
        </div>
    );
}
