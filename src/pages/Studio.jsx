import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { aspectList, useLook } from '../lib/look';
import { CANVASES, captionLines, clamp, resolveCaptions } from '../lib/captionStyles';
import { captionBlocks } from '../lib/captionMotion';
import { parkTime } from '../lib/stageTime';
import { stageScene } from '../lib/stageScene';
import { splitPatch } from '../lib/sceneEffective';
import { withFontPreview } from '../lib/fontPreview';
import { logoClear, resolveBar, resolveHeadline, resolveLogo, stageHeadline } from '../lib/layers';
import { flashMessage, useStore } from '../lib/socket';
import { useT } from '../lib/i18n';
import TopBar from '../components/studio/TopBar';
import Layers from '../components/studio/Layers';
import Stage from '../components/studio/Stage';
import Inspector from '../components/studio/Inspector';
import Transport from '../components/studio/Transport';
import { prefersReducedMotion } from '../components/studio/CaptionLayer';
import { useSample } from '../components/studio/useSample';
import { useMeasure } from '../components/studio/useMeasure';
import { useFaces, useFontPreview, useFontSync, useFontVersion } from '../components/studio/useFonts';
import { usePlayer } from '../components/studio/usePlayer';
import { useLooks } from '../components/studio/useLooks';
import { useExactFrame } from '../components/studio/useExactFrame';
import { CLOSED } from '../components/studio/LookPicker';

// Below this page width the Layers pane shrinks to icons.
const NARROW = 1000;
/** The layers that live on the stage and can be picked there (the Layout too, while the stage draws a split). */
const STAGE_LAYERS = ['captions', 'headline', 'bar', 'logo'];

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
    return !el.closest('button, a, summary, [role="radio"], [role="menuitemradio"], [role="switch"], [role="option"], [role="checkbox"], [role="tab"], [role="menuitem"]');
}

/** Controls that own the arrow keys and Delete themselves. */
function ownsArrows(el) {
    if (!el || !el.closest) return false;
    return !!el.closest('[role="slider"], [role="listbox"], [role="menu"], [role="radiogroup"], [role="tablist"], select');
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Studio: an interactive stage for designing how clips look. It edits the
 * Look, the same state the options popover on Home edits. Layers are drawn
 * the way the engine burns them and can be picked, moved and resized on the
 * stage itself; the inspector holds the same numbers as sliders. The top bar
 * holds the Look picker (named, saved looks are presets) and the exact frame
 * (the engine's own render of the stage).
 */
export default function Studio() {
    const t = useT();
    const settings = useStore((s) => s.settings);
    const jobs = useStore((s) => s.jobs);
    const look = useLook(settings);
    const { options, update, setCaptions, setHeadline, setBar, setLogo, setLayout, undo, redo, canUndo, canRedo, reset, beginGesture, endGesture } = look;

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
    const looks = useLooks({ look, settings });
    const [lookUi, setLookUi] = useState(CLOSED);

    const player = usePlayer({
        len: sample.len,
        start: sample.start,
        videoRef,
        hasVideo: !!sample.job && !!sample.src && !videoFailed,
        loop,
        resetKey: `${sample.job?.id ?? 'standin'}`,
    });

    const exact = useExactFrame({ options, sample, hasVideo: !!sample.job && !!sample.src && !videoFailed, player });

    const shape = aspectList(options.aspect)[0];
    const canvas = CANVASES[shape] ?? CANVASES['9:16'];
    const L = options.look ?? {};
    // Fonts: the engine's list, the faces of the fonts in use, and the font a
    // hover in the picker previews (laid over the Look for the stage only).
    useFontSync();
    const fontPreview = useFontPreview();
    const faces = useFontVersion();
    useFaces([L.captions?.font, L.headline?.font, fontPreview?.font]);
    const LS = useMemo(() => withFontPreview(L, fontPreview), [L, fontPreview]);
    // What the Look does to the picture, and where a split puts the seam.
    const scene = useMemo(
        () => stageScene(options, canvas),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [options.layout, L.camera, L.effects, L.layout, canvas],
    );
    const resolved = useMemo(
        () => resolveCaptions(options.style, shape, LS.captions, { anim: options.caption_anim, seam: scene.seam }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [options.style, shape, LS.captions, options.caption_anim, scene.seam, faces],
    );
    // Grouping depends on words, the words-per-line budget and whether the
    // motion is a moving one, not on colours or position.
    // The word-level model also groups by characters and rows, which depend on
    // how wide the type is, so it follows the whole style and the text measure.
    const measure = useMeasure();
    const lines = useMemo(
        () => (resolved.wordLevel ? captionBlocks(sample.words, resolved, measure) : captionLines(sample.words, resolved)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sample.words, resolved.maxWords, resolved.maxChars, resolved.wordCap, resolved.caps, resolved.anim === 'none', resolved.wordLevel ? resolved : null, resolved.wordLevel ? measure : null],
    );

    // The other layers, as the engine would draw them. The headline is the
    // typed text, or a sample title while that is empty (clips use their own).
    const logo = useMemo(
        () => (options.logo ? resolveLogo(shape, options.logo_pos, L.logo, null) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [options.logo, options.logo_pos, shape, L.logo],
    );
    const headline = useMemo(
        () => (options.headline ? resolveHeadline(stageHeadline(options.headline_text, sample.job), shape, LS.headline, { clear: logoClear(logo), measure, len: sample.len }) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [options.headline, options.headline_text, sample.job, shape, LS.headline, logo, measure, sample.len, faces],
    );
    const bar = useMemo(
        () => (options.progress_bar ? resolveBar(shape, options.bar_color, L.bar) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [options.progress_bar, options.bar_color, shape, L.bar],
    );
    const sizes = useMemo(
        () => ({ captions: L.captions?.size ?? 1, headline: L.headline?.size ?? 1, logo: L.logo?.size ?? 1 }),
        [L.captions?.size, L.headline?.size, L.logo?.size],
    );

    // Opening Studio (or picking another sample) parks the playhead where a
    // caption line is up and settled, instead of at 0:00 where nothing is on
    // screen yet. It waits for the transcript, and leaves a playhead the
    // person has already moved (or started) alone.
    const parked = useRef(null);
    const parkKey = sample.status === 'loading' ? null : (sample.job?.id ?? 'standin');
    useEffect(() => {
        if (parkKey === null || parked.current === parkKey) return;
        parked.current = parkKey;
        if (player.clock.get() > 0 || player.playing) return;
        const at = parkTime(lines, { len: sample.len, captions: resolved.show, clean: resolved.clean, anim: resolved.anim, headline });
        if (at > 0) player.seek(at);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parkKey]);

    // What the pointer and the keys do to the stage's layers.
    const edit = useMemo(() => {
        const place = (id, x, y) => {
            if (id === 'captions') setCaptions({ x, y });
            else if (id === 'headline') setHeadline({ x, y });
            else if (id === 'logo') setLogo({ x, y });
        };
        return {
            select: setSelected,
            move: place,
            resize(id, size) {
                // Back at 100% is the default, not an override.
                const v = Math.abs(size - 1) < 0.005 ? undefined : size;
                if (id === 'captions') setCaptions({ size: v });
                else if (id === 'headline') setHeadline({ size: v });
                else if (id === 'logo') setLogo({ size: v });
            },
            flipBar: (pos) => setBar({ pos: pos === 'top' ? 'top' : undefined }),
            seam: (v) => setLayout(splitPatch(v)),
            reset(id) {
                const none = { x: undefined, y: undefined };
                if (id === 'captions') setCaptions(none);
                else if (id === 'headline') setHeadline(none);
                else if (id === 'logo') setLogo(none);
                else if (id === 'bar') setBar({ pos: undefined });
                else if (id === 'layout') setLayout({ split: undefined });
            },
            // Same as the layer's eye; the logo has none, so its file goes.
            off(id) {
                if (id === 'captions') setCaptions({ show: false });
                else if (id === 'headline') update({ headline: false });
                else if (id === 'bar') update({ progress_bar: false });
                else if (id === 'logo') update({ logo: '' });
            },
            place,
            begin: beginGesture,
            end: endGesture,
        };
    }, [setCaptions, setHeadline, setBar, setLogo, setLayout, update, beginGesture, endGesture]);

    // While the engine's still covers the stage nothing on it can be picked or moved.
    const stillOn = exact.phase === 'shown';
    const onStage = !stillOn && (STAGE_LAYERS.includes(selected) || (selected === 'layout' && scene.splitOn)) ? selected : null;
    const centres = {
        captions: resolved.show ? resolved.center : null,
        headline: headline?.center ?? null,
        logo: logo?.center ?? null,
        bar: bar?.center ?? null,
    };
    // Ctrl+S: save over the person's own look, else ask for a name.
    const save = () => {
        if (looks.current.kind !== 'mine') setLookUi({ open: true, mode: 'saveas' });
        else if (looks.edited) looks.save();
        else flashMessage(t('“{name}” has no changes to save.', { name: looks.current.name }));
    };

    // The key handler reads the latest of these without re-binding.
    const liveRef = useRef({});
    liveRef.current = { onStage, centres, edit, split: L.layout?.split ?? 0.5, save };

    const notice = sample.status === 'loading' ? t('Loading the transcript…')
        : sample.status === 'failed' ? t("Couldn't load this transcript; showing stand-in words.")
            : sample.status === 'empty' ? t('No words in this stretch of the video; showing stand-in words.')
                : null;

    const toggle = player.toggle;
    const onKey = useCallback((e) => {
        if (e.defaultPrevented || e.altKey) return;
        const el = e.target;
        // Ctrl+S saves the look (from anywhere but the menu's own name field, which has Enter).
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (!el?.closest?.('[data-look-menu]')) liveRef.current.save();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !inTextField(el)) {
            const k = e.key.toLowerCase();
            if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
            return;
        }
        if (e.ctrlKey || e.metaKey) return;
        // Keys for the layer picked on the stage.
        const { onStage: id, centres: c, edit: act, split } = liveRef.current;
        if (id && !inTextField(el) && !ownsArrows(el)) {
            const step = e.shiftKey ? 0.05 : 0.01;
            const arrow = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
            if (arrow) {
                e.preventDefault();
                if (id === 'layout') {
                    if (arrow[1]) act.seam(r2(clamp(split + arrow[1], 0.3, 0.7)));
                } else if (id === 'bar') {
                    if (arrow[1]) act.flipBar(arrow[1] < 0 ? 'top' : 'bottom');
                } else if (c[id]) {
                    act.place(id, r3(clamp(c[id].x + arrow[0], 0, 1)), r3(clamp(c[id].y + arrow[1], 0, 1)));
                }
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setSelected(null);
                return;
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && id !== 'layout') {
                e.preventDefault();
                act.off(id);
                return;
            }
        }
        if (e.key === ' ' && !inTextField(el) && spaceIsFree(el)) {
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
            <TopBar options={options} update={update} sample={sample} history={{ canUndo, canRedo, undo, redo }} looks={looks} lookUi={lookUi} setLookUi={setLookUi} exact={exact} narrow={narrow} />
            <div className="flex min-h-0 flex-1 gap-[5px]">
                <Layers options={options} selected={selected} onSelect={setSelected} update={update} setCaptions={setCaptions} narrow={narrow} />
                <Stage
                    canvas={canvas}
                    scene={scene}
                    resolved={resolved}
                    lines={lines}
                    measure={measure}
                    layers={{ headline, bar, logo }}
                    selected={onStage}
                    edit={edit}
                    sizes={sizes}
                    logoFile={options.logo}
                    clock={player.clock}
                    reduced={reduced}
                    sample={sample}
                    videoRef={videoRef}
                    videoFailed={videoFailed}
                    onVideoError={() => setVideoFailed(true)}
                    onLoadedMetadata={player.onLoadedMetadata}
                    safe={safe}
                    notice={notice}
                    exact={exact}
                />
                <Inspector selected={selected} look={look} job={sample.job} measure={measure} len={sample.len} />
            </div>
            <Transport player={player} len={sample.len} words={sample.words} loop={loop} onLoop={setLoop} safe={safe} onSafe={setSafe} />
        </div>
    );
}
