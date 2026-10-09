import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import CaptionLayer from './CaptionLayer';
import { CaptionProbe, HeadlineLayer } from './StageLayers';
import { BarLayer, LogoLayer } from './StageBarLogo';
import WordCaption from './WordCaption';
import StageOverlay from './StageOverlay';
import StagePicture from './StagePicture';
import StageSeam from './StageSeam';

const PAD = 24; // breathing room around the frame
const NOTE = 36; // the line under the frame

/** The usual interface zones of vertical video, as faint hatched bands. */
function SafeAreas({ unit }) {
    const hatch = 'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.12) 0 6px, transparent 6px 16px)';
    const line = `${unit}px solid rgb(255 255 255 / 0.35)`;
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0" style={{ height: '13%', backgroundImage: hatch, borderBottom: line }} />
            <div className="absolute inset-x-0 bottom-0" style={{ height: '20%', backgroundImage: hatch, borderTop: line }} />
        </div>
    );
}

const sameSize = (p, n) => p && p.w === n.w && p.h === n.h && p.bh === n.bh;

/**
 * The stage: a sunk well holding the frame in the chosen canvas. The frame
 * is a box of the canvas's real pixel size scaled down as a whole, so
 * everything inside is laid out in engine pixels. Over it sits the pointer
 * layer (select, move, resize), drawn in screen pixels.
 *
 * `layers` holds the resolved headline, bar and logo (each `null` while it
 * is off); `scene` what the Look does to the picture (`stageScene`); `edit`
 * the actions the pointer layer takes.
 */
export default function Stage({ canvas, scene, resolved, lines, measure, layers, selected, edit, sizes, logoFile, clock, reduced, sample, videoRef, videoFailed, onVideoError, onLoadedMetadata, safe, notice }) {
    const t = useT();
    const wellRef = useRef(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    const [capSize, setCapSize] = useState(null);
    const [headSize, setHeadSize] = useState(null);
    const onCapSize = useCallback((n) => setCapSize((p) => (sameSize(p, n) ? p : n)), []);
    const onHeadSize = useCallback((n) => setHeadSize((p) => (sameSize(p, n) ? p : n)), []);

    useLayoutEffect(() => {
        const el = wellRef.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const { w: cw, h: ch } = canvas;
    const s = Math.max(0.02, Math.min((box.w - PAD * 2) / cw, (box.h - PAD * 2 - NOTE) / ch));
    const tall = cw / ch < 0.6;
    const hasVideo = !!sample.job && !!sample.src && !videoFailed;
    const { headline, bar, logo } = layers;

    // Each layer's box in engine pixels and its centre as a fraction of the
    // frame: what the pointer layer draws around and moves.
    const { rects, centres } = useMemo(() => {
        const rects = {};
        const centres = {};
        if (resolved.show) {
            const a = resolved.anchor;
            const w = Math.max(capSize?.w ?? resolved.wrapW * 0.5, 24);
            const h = Math.max(capSize?.h ?? resolved.lineH, resolved.lineH);
            // A bottom-anchored block sits on its anchor by its rows (bh); the
            // box around it may be taller (padding, tilt).
            const bh = Math.max(capSize?.bh ?? h, resolved.lineH);
            rects.captions = { x: a.x - w / 2, y: a.mode === 'bottom' ? a.y - (bh + h) / 2 : a.y - h / 2, w, h };
            centres.captions = resolved.center;
        }
        if (headline?.positioned) {
            rects.headline = headline.rect;
            centres.headline = headline.center;
        } else if (headline) {
            const e = headline.noCard ? 2 * headline.edgeW : 0;
            const w = (headSize?.w ?? headline.wrapW * 0.6) + e;
            const h = (headSize?.h ?? headline.block + 2 * (headline.card?.pad ?? 0)) + e;
            rects.headline = { x: headline.cx - w / 2, y: headline.cy - h / 2, w, h };
            centres.headline = headline.center;
        }
        if (logo) {
            // A turned logo keeps an upright box: the one round the turned logo
            // (effects excluded), so the handles stay square to the frame.
            rects.logo = { ...logo.bounds };
            centres.logo = logo.center;
        }
        if (bar) {
            rects.bar = { ...bar.rect };
            centres.bar = bar.center;
        }
        return { rects, centres };
    }, [resolved, capSize, headline, bar, logo, headSize]);

    return (
        <div
            ref={wellRef}
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border border-x-white/[0.06] border-t-black/50 border-b-white/10 bg-[color-mix(in_srgb,var(--background)_55%,black)] shadow-[inset_0_2px_10px_rgb(0_0_0/0.45)]"
            onPointerDown={() => edit.select(null)}
        >
            {notice && (
                <p role="status" className="fade absolute inset-x-0 top-2 z-10 px-4 text-center text-[11px] text-muted-foreground">{notice}</p>
            )}
            <div className="absolute inset-x-0 top-0 flex items-center justify-center" style={{ bottom: NOTE }}>
                {box.w > 0 && (
                    <div className="relative shrink-0" style={{ width: cw * s, height: ch * s }}>
                        <div className="absolute inset-0 overflow-hidden rounded-[4px] bg-black shadow-[0_10px_34px_rgb(0_0_0/0.55)] ring-1 ring-white/10">
                            <div className="absolute top-0 left-0" style={{ width: cw, height: ch, transform: `scale(${s})`, transformOrigin: '0 0' }}>
                                <StagePicture
                                    canvas={canvas}
                                    scene={scene}
                                    sample={sample}
                                    hasVideo={hasVideo}
                                    videoFailed={videoFailed}
                                    videoRef={videoRef}
                                    onVideoError={onVideoError}
                                    onLoadedMetadata={onLoadedMetadata}
                                />
                                {bar && <BarLayer r={bar} clock={clock} len={sample.len} />}
                                {logo && <LogoLayer r={logo} file={logoFile} />}
                                <CaptionLayer r={resolved} lines={lines} clock={clock} reduced={reduced} measure={measure} />
                                {resolved.show && <CaptionProbe r={resolved} lines={lines} clock={clock} measure={measure} onSize={onCapSize} />}
                                {headline?.positioned && <WordCaption r={headline.cap} lines={headline.lines} clock={clock} reduced={reduced} measure={measure} />}
                                {headline && !headline.positioned && <HeadlineLayer r={headline} clock={clock} len={sample.len} reduced={reduced} onSize={onHeadSize} />}
                                {safe && tall && <SafeAreas unit={1 / s} />}
                            </div>
                        </div>
                        {scene.splitOn && (
                            <StageSeam
                                s={s}
                                cw={cw}
                                ch={ch}
                                split={scene.split}
                                selected={selected === 'layout'}
                                onSelect={edit.select}
                                onSplit={edit.seam}
                                onReset={() => edit.reset('layout')}
                                onBegin={edit.begin}
                                onEnd={edit.end}
                            />
                        )}
                        <StageOverlay
                            s={s}
                            cw={cw}
                            ch={ch}
                            rects={rects}
                            centres={centres}
                            sizes={sizes}
                            selected={selected}
                            onSelect={edit.select}
                            onMove={edit.move}
                            onResize={edit.resize}
                            onFlipBar={edit.flipBar}
                            onReset={edit.reset}
                            onBegin={edit.begin}
                            onEnd={edit.end}
                        />
                    </div>
                )}
            </div>
            <p className="absolute inset-x-0 bottom-0 flex items-center justify-center px-6 text-center text-[11px] leading-snug text-muted-foreground" style={{ height: NOTE }}>
                {t('The camera follows faces when the clip is made; the stage shows the centre of the frame.')}
            </p>
        </div>
    );
}
