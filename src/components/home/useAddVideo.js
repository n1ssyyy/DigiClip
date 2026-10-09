import { useEffect, useRef, useState } from 'react';
import { flashMessage, startJob, startJobUrl, useStore } from '../../lib/socket';
import { isTauri, onDragHover, onFilesDropped, pickVideos, VIDEO_EXT } from '../../lib/native';
import { toEngine, useJobOptions } from '../../lib/look';
import { useT } from '../../lib/i18n';

const VIDEO_RE = new RegExp(`\\.(${VIDEO_EXT.join('|')})$`, 'i');

/** Everything that puts a new video into DigiClip: browse, a drop anywhere on
 *  the page, a pasted link, and the merge of a video's picks (a new job off
 *  the same source). The file never uploads anywhere; the engine reads it off
 *  disk. Failures surface in the banner instead of dying silently. */
export default function useAddVideo() {
    const t = useT();
    const settings = useStore((s) => s.settings);
    const [jobOptions] = useJobOptions(settings);
    const [link, setLink] = useState('');
    const [uploading, setUploading] = useState(null);
    // Two sources say a file is being dragged over: the shell (OS drag
    // channel, real paths) and the page's own DOM events. Kept apart and
    // joined, so neither can switch the other off mid-drag.
    const [osDrag, setOsDrag] = useState(false);
    const [domDrag, setDomDrag] = useState(false);
    const dragging = osDrag || domDrag;
    // Last time the OS-level Tauri drop (real paths) fired. Compared
    // against DOM drops to detect a dead shell event (see onDrop).
    const lastTauriDrop = useRef(0);
    const linkOk = /^https?:\/\/\S+\.\S+/i.test(link.trim());

    /** Shared knobs for a fresh job off this screen. Durations are
     *  sanitized here so stale/corrupt local storage can never send
     *  the engine an inverted window; auto sends nothing (15-90s). */
    function baseOptions() {
        return {
            ...toEngine(jobOptions),
            model: settings?.stt_model,
            gpu: settings?.gpu,
        };
    }

    /** Bare compilation of a video's picks (the anti-repeat path): a new job
     *  off the same source, badged "merged". */
    function merge(job) {
        if (!job) return;
        startJob(job.source, { ...baseOptions(), merge: '' }).catch(() => {});
    }

    function startFromLink() {
        const url = link.trim();
        if (!linkOk) {
            flashMessage(t('Paste a full link, starting with https://'));
            return;
        }
        startJobUrl(url, baseOptions())
            .then(() => setLink(''))
            .catch((e) => flashMessage(t('Couldn\'t start the link: {error}', { error: e?.message ?? e })));
    }

    function startFromPath(path) {
        if (!path) return;
        const name = path.split(/[\\/]/).pop() ?? path;
        setUploading({ name });
        // Banner receipt: proves the OS drop reached us. If this shows
        // but no job appears, the failure is downstream (and the catch
        // below will name it); if even this stays silent, the drop
        // event itself never arrived.
        flashMessage(t('Starting {name}…', { name }));
        startJob(path, baseOptions())
            .catch((e) => flashMessage(t('Couldn\'t start {name}: {error}', { name, error: e?.message ?? e })))
            .finally(() => {
                setTimeout(() => setUploading(null), 800);
            });
    }

    // Several files at once queue one job each; the engine runs them in turn.
    function startFromPaths(paths) {
        const vids = (paths ?? []).filter((p) => VIDEO_RE.test(p));
        vids.forEach((p) => startFromPath(p));
        if (vids.length > 1) flashMessage(t('Queued {n} videos', { n: vids.length }));
    }

    function browse() {
        pickVideos()
            .then(startFromPaths)
            .catch((e) => flashMessage(t('Browse failed: {error}', { error: e?.message ?? e })));
    }

    // Window drops carry real paths (Tauri drag-drop event); the page's
    // own drag handlers are hover paint only.
    useEffect(() => onFilesDropped((paths) => {
        lastTauriDrop.current = Date.now();
        startFromPaths(paths);
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

    // Hover paint rides the OS drag channel (enter/over shows the overlay,
    // leave/drop clears it) - the same channel drops provably arrive on.
    // The page's own DOM handlers stay as backup.
    useEffect(() => onDragHover(setOsDrag), []);

    // A drop landing anywhere must never navigate the webview away to the
    // file (which used to blank the whole app). The OS-level Tauri drop
    // event above still fires - this only stops the browser default. A drag
    // that ends anywhere (dropped, escaped, left the window) clears the paint.
    useEffect(() => {
        const stop = (e) => e.preventDefault();
        const end = () => setDomDrag(false);
        window.addEventListener('dragover', stop);
        window.addEventListener('drop', stop);
        window.addEventListener('drop', end);
        window.addEventListener('dragend', end);
        return () => {
            window.removeEventListener('dragover', stop);
            window.removeEventListener('drop', stop);
            window.removeEventListener('drop', end);
            window.removeEventListener('dragend', end);
        };
    }, []);

    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');

    /** The page's own DOM handlers: spread them on the page's root. Entering
     *  a child fires leave on the one before, so a leave only counts when the
     *  pointer really left the root (relatedTarget is outside it), which keeps
     *  the overlay steady across children. */
    const dropHandlers = {
        onDragEnter: (e) => { if (hasFiles(e)) { e.preventDefault(); setDomDrag(true); } },
        onDragOver: (e) => { e.preventDefault(); if (hasFiles(e)) setDomDrag(true); },
        onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDomDrag(false); },
        onDrop: (e) => {
            e.preventDefault();
            setDomDrag(false);
            // Diagnostic: a DOM drop always fires in a webview. If the
            // OS-level Tauri drop (real paths) doesn't follow within a
            // beat, the shell event is dead - say so instead of failing
            // silently.
            const files = [...(e.dataTransfer?.files ?? [])];
            if (isTauri() && files.length > 0) {
                const names = files.map((f) => f.name).join(', ');
                setTimeout(() => {
                    if (Date.now() - lastTauriDrop.current > 1500) {
                        flashMessage(t('Got “{names}” but no file path arrived — the drop event isn\'t firing. Rebuild the desktop app to pick up the fix.', { names }));
                    }
                }, 1500);
            }
        },
    };

    return { link, setLink, linkOk, startFromLink, browse, merge, uploading, dragging, dropHandlers };
}
