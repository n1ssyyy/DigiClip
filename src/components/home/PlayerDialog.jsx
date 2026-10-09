import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, Pencil, X } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import ClipInsights from '../digiclip/ClipInsights';
import { artUrl, downloadArt, downloadText, fetchKit, flashMessage } from '../../lib/socket';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

/** In-app video player: same overlay language as the confirmations
 *  (overlay fade/fade-out, box pop/pop-out; pinned below the header,
 *  centered in the content page). The <video> element is mounted once and
 *  only its src/poster swap per selection: remounting mid-load restarted
 *  buffering from byte zero, which read as a flash/cutout. State also resets
 *  only when the src actually changes, so background store updates can't yank
 *  a playing video back to its skeleton. For a clip, the clip's title leads
 *  (it wraps, never cut) and the video's name sits under it. */
export default function PlayerDialog({ title, sub, src, poster, shape, download, kit, clip, jobId, onEdit, onClose, leaving }) {
    const t = useT();
    const videoRef = useRef(null);
    const [waiting, setWaiting] = useState(true);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [kitText, setKitText] = useState(null);
    const srcRef = useRef(src);

    // New selection: show the loader behind the incoming video, keep the
    // old frame visible underneath until the new one can play.
    if (srcRef.current !== src) {
        srcRef.current = src;
        setWaiting(true);
        setFailed(false);
        setKitText(null);
    }

    useEffect(() => {
        if (!kit) return;
        let dead = false;
        fetchKit(kit.job, kit.rank).then((text) => { if (!dead) setKitText(text); }).catch(() => {});
        return () => { dead = true; };
    }, [kit]);

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        if (el.getAttribute('src') !== src) el.setAttribute('src', src);
        el.load();
    }, [src]);

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        if (poster != null) el.setAttribute('poster', poster);
        else el.removeAttribute('poster');
    }, [poster]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className={cn('fixed inset-x-0 bottom-0 top-[var(--chrome)] z-50 flex items-center justify-center bg-black/70 p-4 pl-[calc(var(--chrome)_+_1rem)] backdrop-blur-sm', leaving ? 'fade-out' : 'fade')}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={cn(
                    'rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] p-3 shadow-2xl',
                    leaving ? 'pop-out' : 'pop',
                )}
                // Generated clips size the box to their own shape (a 9:16
                // clip gets the same 340px portrait box as always, 1:1 and
                // 4:5 grow wider) so the video lands without bars. Source
                // playback stays a wide landscape box.
                // Clips carry a 272px insights column beside the video.
                style={{ width: shape ? `min(${Math.min(760, Math.round(562 * shape.w / shape.h) + 24) + (clip ? 272 : 0)}px, 100%)` : 'min(760px, 100%)' }}
            >
                <div className="flex items-start gap-2 pb-2">
                    <div className="min-w-0 flex-1 py-1">
                        <p className="text-[13px] leading-snug font-semibold [overflow-wrap:anywhere]">{title}</p>
                        {sub && <p className="mt-0.5 font-mono text-[10px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{sub}</p>}
                    </div>
                    {clip && onEdit && (
                        <Tip label={t('Edit and re-render')} side="top">
                            <button
                                type="button" aria-label={t('Edit clip')}
                                onClick={onEdit}
                                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <Pencil className="size-4" aria-hidden />
                            </button>
                        </Tip>
                    )}
                    {kitText && kit && (
                        <Tip label={t('Upload kit (title + hashtags)')} side="top">
                            <button
                                type="button" aria-label={t('Download upload kit')}
                                onClick={() => downloadText(kitText, kit.filename ?? 'upload-kit.txt').catch((e) => flashMessage(t('Couldn\'t save kit: {error}', { error: e?.message ?? e })))}
                                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <FileText className="size-4" aria-hidden />
                            </button>
                        </Tip>
                    )}
                    {download && (
                        <Tip label={t('Download video')} side="top">
                            <button
                                type="button" aria-label={t('Download video')}
                                onClick={() => downloadArt(download.url, download.filename).catch((e) => flashMessage(t('Couldn\'t save video: {error}', { error: e?.message ?? e })))}
                                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <Download className="size-4" aria-hidden />
                            </button>
                        </Tip>
                    )}
                    <button
                        type="button" aria-label={t('Close player')} autoFocus
                        onClick={onClose}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="size-4" aria-hidden />
                    </button>
                </div>
                <div className={cn(clip && 'flex items-start gap-3')}>
                <div className={cn('relative', clip && 'min-w-0 flex-1')}>
                    {!ready && <span aria-hidden className="skel absolute inset-0 rounded-md" />}
                    {waiting && !failed && (
                        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </span>
                    )}
                    {failed && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-md bg-black/60 p-4 text-center">
                            <p className="text-[13px] font-medium text-white">{t('Couldn\'t load this video')}</p>
                            <button
                                type="button"
                                onClick={() => { setFailed(false); setWaiting(true); videoRef.current?.load(); }}
                                className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-white/20"
                            >
                                {t('Retry')}
                            </button>
                        </div>
                    )}
                    <div
                        className={cn(
                            'overflow-hidden rounded bg-black',
                            // The frame owns the shape: clips get a full-width
                            // box at their own aspect so the video fills the
                            // dialog edge to edge; the source keeps 16:9.
                            shape ? 'mx-auto max-h-[72dvh] w-full' : 'aspect-video w-full',
                        )}
                        style={shape ? { aspectRatio: `${shape.w} / ${shape.h}` } : undefined}
                    >
                    <video
                        ref={videoRef}
                        className={cn(
                            'h-full w-full object-contain motion-safe:transition-opacity motion-safe:duration-300',
                            ready ? 'opacity-100' : 'opacity-0',
                        )}
                        controls
                        controlsList="nodownload"
                        playsInline
                        preload="auto"
                        onCanPlay={() => { setWaiting(false); setFailed(false); setReady(true); }}
                        onPlaying={() => { setWaiting(false); setFailed(false); setReady(true); }}
                        onWaiting={() => { if (!failed) setWaiting(true); }}
                        onStalled={() => { if (!ready && !failed) setWaiting(true); }}
                        onError={() => { setWaiting(false); setFailed(true); }}
                    />
                    </div>
                </div>
                {clip && (
                    <div className="digi-scroll max-h-[72dvh] w-[260px] shrink-0 space-y-3 overflow-y-auto">
                        <ClipInsights clip={clip} />
                        {clip.variants?.length > 0 && (
                            <div className="space-y-1">
                                <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{t('Other shapes')}</p>
                                <div className="flex flex-wrap gap-1">
                                    {clip.variants.map((v) => (
                                        <button
                                            key={v.aspect}
                                            type="button"
                                            onClick={() => downloadArt(artUrl(jobId, v.mp4, clip.rev), `digiclip-clip${clip.rank}-${v.aspect}.mp4`).catch((e) => flashMessage(t('Couldn\'t save video: {error}', { error: e?.message ?? e })))}
                                            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 font-mono text-[11px] hover:bg-accent"
                                        >
                                            <Download className="size-3" aria-hidden />
                                            {v.aspect.replace('x', ':')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                </div>
            </div>
        </div>
    );
}
