import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/ui/card';
import { artUrl, srcUrl, removeJob, useStore, clearFocus } from '../lib/socket';
import EditClipDialog from '../components/digiclip/EditClipDialog';
import TranscriptDialog from '../components/digiclip/TranscriptDialog';
import AddVideo from '../components/home/AddVideo';
import ClipGrid from '../components/home/ClipGrid';
import { ClearDialog, RemoveDialog } from '../components/home/ConfirmDialogs';
import DropOverlay from '../components/home/DropOverlay';
import ExitBeat from '../components/home/ExitBeat';
import PlayerDialog from '../components/home/PlayerDialog';
import useAddVideo from '../components/home/useAddVideo';
import VideoHeader from '../components/home/VideoHeader';
import VideoList from '../components/home/VideoList';
import WorkingPanel from '../components/home/WorkingPanel';
import { fmtDur, listModel, neighbour, newcomer, phaseOf } from '../lib/homeList';
import { useT } from '../lib/i18n';

const SEEN_KEY = 'digiclip.seenProjects';

/** Videos whose clips have been on screen (a ready one not yet opened wears a
 *  white dot in the list). Local to this machine, not engine state. */
function useSeen(shownId, shownReady) {
    const [seen, setSeen] = useState(() => {
        try {
            const arr = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
            return new Set(Array.isArray(arr) ? arr : []);
        } catch {
            return new Set();
        }
    });
    useEffect(() => {
        if (!shownId || !shownReady) return;
        setSeen((prev) => {
            if (prev.has(shownId)) return prev;
            const next = new Set(prev).add(shownId);
            try {
                localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-200)));
            } catch {
                // storage may be blocked; the dot just comes back next time
            }
            return next;
        });
    }, [shownId, shownReady]);
    return seen;
}

/** Home is two things: add a video, and your videos. With none yet it is only
 *  the first, and a line on what happens next. */
export default function Home() {
    const t = useT();
    const jobs = useStore((s) => s.jobs);
    const focus = useStore((s) => s.focus);
    const add = useAddVideo();
    const model = useMemo(() => listModel(jobs), [jobs]);
    const idsKey = model.ids.join(',');

    const [activeId, setActiveId] = useState(null);
    const [removeTarget, setRemoveTarget] = useState(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const [player, setPlayer] = useState(null);
    const [editTarget, setEditTarget] = useState(null); // { job, rank }
    const [transcriptJob, setTranscriptJob] = useState(null);

    const shown = model.rows.find((r) => r.job.id === activeId)?.job ?? model.rows[0]?.job ?? null;
    const shownPhase = shown ? phaseOf(shown) : null;
    const shownReady = shownPhase === 'ready' || shownPhase === 'making';
    const seen = useSeen(shown?.id, shownReady);

    // Player and editor follow the live clip, so a re-render lands in
    // an open dialog (new rev, new scores) without reopening it.
    const liveClip = (ref) => (ref ? jobs.find((j) => j.id === ref.job)?.clips?.find((c) => c.rank === ref.rank) ?? null : null);
    const playerClip = liveClip(player?.clipRef);
    const editJob = editTarget ? jobs.find((j) => j.id === editTarget.job) ?? null : null;
    const editClipLive = liveClip(editTarget);
    const transcriptTarget = transcriptJob ? jobs.find((j) => j.id === transcriptJob) ?? null : null;

    // A video started from this app comes up on its own, so its progress is
    // what you see; loading the list never moves you.
    const known = useRef(new Set());
    useEffect(() => {
        const fresh = newcomer(known.current, jobs, Date.now());
        known.current = new Set(model.ids);
        if (fresh) setActiveId(fresh);
    }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // An AI app asked (show_in_app) for this video: bring it up once.
    useEffect(() => {
        if (!focus?.job || !model.ids.includes(focus.job)) return;
        clearFocus();
        setActiveId(focus.job);
    }, [focus?.seq, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

    function removeShown(job) {
        if (job.id === shown?.id) setActiveId(neighbour(model.ids, job.id));
        removeJob(job.id);
        setRemoveTarget(null);
    }
    function clearFinished() {
        model.finishedIds.forEach((id) => removeJob(id));
        if (model.finishedIds.includes(shown?.id)) setActiveId(null);
        setConfirmClear(false);
    }
    const playSource = () => setPlayer({
        title: shown.name,
        sub: t('Source') + (fmtDur(shown.duration_s) ? ` · ${fmtDur(shown.duration_s)}` : ''),
        src: srcUrl(shown.id),
        poster: artUrl(shown.id, 'poster.jpg'),
        download: { url: srcUrl(shown.id), filename: `${shown.name}.mp4` },
        kit: null,
    });

    const dialogs = (
        <>
            <ExitBeat open={removeTarget != null} ms={200}>
                {removeTarget && (
                    <RemoveDialog
                        video={removeTarget}
                        running={phaseOf(removeTarget) === 'working'}
                        onClose={() => setRemoveTarget(null)}
                        onConfirm={() => removeShown(removeTarget)}
                    />
                )}
            </ExitBeat>
            <ExitBeat open={confirmClear} ms={200}>
                {confirmClear && (
                    <ClearDialog count={model.finishedIds.length} onClose={() => setConfirmClear(false)} onConfirm={clearFinished} />
                )}
            </ExitBeat>
            <ExitBeat open={player != null} ms={200}>
                {player && (
                    <PlayerDialog
                        {...player}
                        clip={playerClip}
                        jobId={player.clipRef?.job}
                        onEdit={playerClip ? () => { setEditTarget(player.clipRef); setPlayer(null); } : undefined}
                        onClose={() => setPlayer(null)}
                    />
                )}
            </ExitBeat>
            <ExitBeat open={editJob != null && editClipLive != null} ms={200}>
                {editJob && editClipLive && (
                    <EditClipDialog job={editJob} clip={editClipLive} onClose={() => setEditTarget(null)} />
                )}
            </ExitBeat>
            <ExitBeat open={transcriptTarget != null} ms={200}>
                {transcriptTarget && (
                    <TranscriptDialog job={transcriptTarget} onClose={() => setTranscriptJob(null)} />
                )}
            </ExitBeat>
        </>
    );

    if (!shown) {
        return (
            <div className="relative flex h-full min-h-[420px] flex-col items-center justify-center gap-4 px-6" {...add.dropHandlers}>
                <div className="w-[min(560px,100%)]">
                    <AddVideo add={add} roomy />
                </div>
                <p className="max-w-[460px] text-center text-[12px] leading-snug text-muted-foreground">
                    {t('Then DigiClip picks the best moments and cuts them into captioned clips. They appear here.')}
                </p>
                {dialogs}
                <DropOverlay show={add.dragging} />
            </div>
        );
    }

    return (
        <div className="relative flex h-full min-h-[420px] flex-col gap-[5px]" {...add.dropHandlers}>
            <AddVideo add={add} />
            <Card className="stagger-2 flex min-h-0 flex-1 overflow-hidden">
                <VideoList
                    rows={model.rows}
                    activeId={shown.id}
                    seen={seen}
                    finishedCount={model.finishedIds.length}
                    onPick={setActiveId}
                    onRemove={setRemoveTarget}
                    onClear={() => setConfirmClear(true)}
                />
                <div key={shown.id} className="fade flex min-h-0 min-w-0 flex-1 flex-col">
                    <VideoHeader
                        job={shown}
                        ready={shownReady}
                        onPlaySource={playSource}
                        onTranscript={() => setTranscriptJob(shown.id)}
                        onMerge={() => add.merge(shown)}
                        onRemove={() => setRemoveTarget(shown)}
                    />
                    {shownReady
                        ? <ClipGrid job={shown} onPlay={setPlayer} />
                        : <WorkingPanel job={shown} phase={shownPhase} onRemove={() => setRemoveTarget(shown)} />}
                </div>
            </Card>
            {dialogs}
            <DropOverlay show={add.dragging} />
        </div>
    );
}
