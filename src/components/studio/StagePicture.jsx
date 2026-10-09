import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { vignetteBackground } from '../../lib/effectsLook';
import { splitPanels } from '../../lib/layoutLook';
import GradeDefs, { gradeFilter } from './GradeDefs';

/** The source the stage assumes until a video says otherwise. */
const SOURCE = { w: 1920, h: 1080 };

/** A soft dark backdrop with a plain abstract figure: what the stage
 *  shows when there is no video to borrow a frame from. */
function StandIn() {
    return (
        <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
            <defs>
                <linearGradient id="stand-in-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#222226" />
                    <stop offset="1" stopColor="#0c0c0e" />
                </linearGradient>
                <radialGradient id="stand-in-glow" cx="0.5" cy="0.38" r="0.55">
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0.07" />
                    <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
            </defs>
            <rect width="100" height="100" fill="url(#stand-in-bg)" />
            <rect width="100" height="100" fill="url(#stand-in-glow)" />
            <circle cx="50" cy="38" r="10" fill="#34343a" />
            <path d="M26 100 C26 70 36 55 50 55 C64 55 74 70 74 100 Z" fill="#2c2c32" />
        </svg>
    );
}

/** The stand-in as a wide shot with two people, where the engine's still
 *  assumes them (27% and 73% of the width): what a split crops from. */
function PairStandIn({ style }) {
    const person = (cx) => (
        <g key={cx}>
            <circle cx={cx} cy="34.2" r="8.6" fill="#34343a" />
            <path d={`M${cx - 19} 90 C${cx - 19} 62 ${cx - 10} 49 ${cx} 49 C${cx + 10} 49 ${cx + 19} 62 ${cx + 19} 90 Z`} fill="#2c2c32" />
        </g>
    );
    return (
        <svg aria-hidden viewBox="0 0 160 90" preserveAspectRatio="none" className="absolute max-w-none" style={style}>
            <rect width="160" height="90" fill="#17171a" />
            {[43.2, 116.8].map(person)}
        </svg>
    );
}

/** A copy of the video's current frame: the bottom panel of a split shows the
 *  same stream as the top one, which the video element itself cannot do twice. */
function Mirror({ videoRef, w, h, style }) {
    const ref = useRef(null);
    useEffect(() => {
        const cv = ref.current;
        const ctx = cv?.getContext('2d');
        if (!ctx) return undefined;
        let raf = 0;
        let seen = '';
        const paint = () => {
            const v = videoRef.current;
            const key = v ? `${v.currentSrc}|${v.currentTime}|${cv.width}x${cv.height}` : '';
            if (v && v.readyState >= 2 && key !== seen) {
                try {
                    ctx.drawImage(v, 0, 0, cv.width, cv.height);
                    seen = key;
                } catch {
                }
            }
            raf = requestAnimationFrame(paint);
        };
        raf = requestAnimationFrame(paint);
        return () => cancelAnimationFrame(raf);
    }, [videoRef]);
    return <canvas ref={ref} width={w} height={h} aria-hidden className="absolute max-w-none" style={style} />;
}

/**
 * The picture of the stage: the sample video (or its poster, or the
 * stand-in), and what the Look does to the picture and only to it. Layers
 * sit above this in `Stage`.
 *
 * The grade is a filter on the whole picture and the vignette a dark overlay
 * over it (the engine grades, then vignettes, before any layer is drawn);
 * zoom scales the picture about its centre. A split draws two panels, each
 * the part of the source the engine's still would show.
 */
export default function StagePicture({ canvas, scene, sample, hasVideo, videoFailed, videoRef, onVideoError, onLoadedMetadata }) {
    const uid = `dc-st-${useId().replace(/:/g, '')}`;
    const [size, setSize] = useState(null);
    const src = hasVideo && size ? size : SOURCE;
    const panels = useMemo(
        () => (scene.splitOn ? splitPanels(src.w, src.h, canvas, scene.split) : null),
        [scene.splitOn, scene.split, src.w, src.h, canvas],
    );
    const loaded = (e) => {
        const { videoWidth: w, videoHeight: h } = e.currentTarget;
        if (w && h) setSize((p) => (p && p.w === w && p.h === h ? p : { w, h }));
        onLoadedMetadata?.(e);
    };
    // Where the whole source sits so that `crop` fills a panel as wide as the canvas.
    const place = (p) => {
        if (!p) return undefined;
        const k = canvas.w / p.crop.w;
        return { left: -p.crop.x * k, top: -p.crop.y * k, width: src.w * k, height: src.h * k };
    };
    const poster = sample.job && sample.poster && videoFailed;
    const posterCls = (st) => (st ? 'absolute max-w-none' : 'absolute inset-0 size-full object-cover');
    const vig = vignetteBackground(scene.vignette);
    const mirrorW = Math.min(src.w, 1280);

    return (
        <>
            {scene.grade && <GradeDefs prefix={uid} />}
            <div className="absolute inset-0" style={{ filter: gradeFilter(uid, scene.grade) }}>
                <div className="absolute inset-0" style={scene.zoom !== 1 ? { transform: `scale(${scene.zoom})`, transformOrigin: '50% 50%' } : undefined}>
                    <div
                        className={panels ? 'absolute overflow-hidden' : 'absolute inset-0'}
                        style={panels ? { left: 0, top: 0, width: canvas.w, height: panels[0].h } : undefined}
                    >
                        {panels ? <PairStandIn style={place(panels[0])} /> : <StandIn />}
                        {poster && <img src={sample.poster} alt="" className={posterCls(panels)} style={place(panels?.[0])} draggable={false} />}
                        {hasVideo && (
                            <video
                                key={sample.job.id}
                                ref={videoRef}
                                src={sample.src}
                                poster={sample.poster ?? undefined}
                                muted
                                playsInline
                                preload="metadata"
                                onError={onVideoError}
                                onLoadedMetadata={loaded}
                                className={panels ? 'absolute max-w-none' : 'absolute inset-0 size-full object-cover'}
                                style={panels ? { ...place(panels[0]), objectFit: 'fill' } : undefined}
                            />
                        )}
                    </div>
                    {panels && (
                        <div className="absolute overflow-hidden" style={{ left: 0, top: panels[1].y, width: canvas.w, height: panels[1].h }}>
                            <PairStandIn style={place(panels[1])} />
                            {poster && <img src={sample.poster} alt="" className={posterCls(panels)} style={place(panels[1])} draggable={false} />}
                            {hasVideo && <Mirror videoRef={videoRef} w={mirrorW} h={Math.round((mirrorW * src.h) / src.w)} style={place(panels[1])} />}
                        </div>
                    )}
                </div>
            </div>
            {vig && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: vig }} />}
        </>
    );
}
