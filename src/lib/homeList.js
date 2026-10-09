// What Home knows about its videos: which are being worked on, which failed,
// which are ready, in what order, and what each says about itself in plain
// words. `tr` is the app's `t`, so the text follows the language. Pure: no React.

/** The four stages a video goes through, as the steps shown while it is worked on. */
export const STEPS = ['Upload', 'Audio', 'Script', 'Clips'];

const READY = ['clips_ready', 'done'];

/** A finished video: its clips are picked (they may still be rendering). */
export const isReady = (job) => READY.includes(job?.status);

/** A clip whose file is still on its way. */
const clipMaking = (c) => c.render_status !== 'done' && c.render_status !== 'failed';

/** How many clips of a video are still being made. */
export const makingCount = (job) => (job?.clips ?? []).filter(clipMaking).length;

/** Where a video stands: 'working' (before its clips exist), 'making' (clips
 *  picked, some still rendering), 'ready', 'failed' or 'cancelled'. */
export function phaseOf(job) {
    if (job?.status === 'failed') return 'failed';
    if (job?.status === 'cancelled') return 'cancelled';
    if (!isReady(job)) return 'working';
    return makingCount(job) > 0 ? 'making' : 'ready';
}

/** The step a status is on (0..3), for a video still being worked on. */
export function stepOf(status) {
    switch (status) {
        case 'queued':
        case 'extracting':
            return 1;
        case 'transcribing':
            return 2;
        case 'analyzing':
            return 3;
        default:
            return 0; // downloading, and anything not known yet
    }
}

/** What the engine is doing, as a title, a short line for the list and a
 *  sentence of what it means. */
export function stageText(status, tr = (s) => s) {
    switch (status) {
        case 'queued':
            return { title: tr('Waiting for its turn'), short: tr('Waiting…'), hint: tr('It starts as soon as the engine is free.') };
        case 'extracting':
            return { title: tr('Getting the audio'), short: tr('Getting audio…'), hint: tr('Pulling the sound out of the video.') };
        case 'transcribing':
            return { title: tr('Writing out what is said'), short: tr('Transcribing…'), hint: tr('Turning the speech into text. A long video takes a few minutes.') };
        case 'analyzing':
            return { title: tr('Choosing the best moments'), short: tr('Finding moments…'), hint: tr('Reading the text for the stretches worth a clip.') };
        default:
            return { title: tr('Downloading the video'), short: tr('Downloading…'), hint: tr('Fetching the video from the link.') };
    }
}

/** "1 clip", "6 clips", "No clips". */
export function clipCountText(n, tr = (s) => s) {
    if (n === 0) return tr('No clips');
    if (n === 1) return tr('1 clip');
    return tr('{n} clips', { n });
}

/** The line under a video's name in the list: its words, the tone it wears
 *  ('work' orange, 'bad' red, 'ok' quiet) and how far along it is (0..1) when
 *  that is known. */
export function rowStatus(job, tr = (s) => s) {
    const phase = phaseOf(job);
    const clips = job?.clips ?? [];
    if (phase === 'failed') return { phase, text: tr('Failed'), tone: 'bad', progress: null };
    if (phase === 'cancelled') return { phase, text: tr('Cancelled'), tone: 'bad', progress: null };
    if (phase === 'working') {
        return { phase, text: stageText(job?.status, tr).short, tone: 'work', progress: (stepOf(job?.status) + 0.5) / STEPS.length };
    }
    if (phase === 'making') {
        const left = makingCount(job);
        return {
            phase,
            text: tr('Making clips {done}/{total}', { done: clips.length - left, total: clips.length }),
            tone: 'work',
            progress: (clips.length - left) / clips.length,
        };
    }
    return { phase, text: clipCountText(clips.length, tr), tone: 'ok', progress: null };
}

/** Newest first; the order the engine sent breaks a tie. */
export function sortJobs(jobs) {
    return (jobs ?? [])
        .map((job, i) => ({ job, i }))
        .sort((a, b) => (b.job.created_ms ?? 0) - (a.job.created_ms ?? 0) || a.i - b.i)
        .map((x) => x.job);
}

/** The whole list: every video newest first with its phase, how many are in
 *  each state, and the ids a "remove finished" would take (never one that is
 *  still being worked on). */
export function listModel(jobs) {
    const rows = sortJobs(jobs).map((job) => ({ job, phase: phaseOf(job) }));
    const count = (...p) => rows.filter((r) => p.includes(r.phase)).length;
    return {
        rows,
        ids: rows.map((r) => r.job.id),
        working: count('working', 'making'),
        failed: count('failed', 'cancelled'),
        ready: count('ready'),
        finishedIds: rows.filter((r) => ['done', 'failed', 'cancelled'].includes(r.job.status)).map((r) => r.job.id),
    };
}

/** A video that just appeared and was started from this app (not by the
 *  watch folder or an AI app) is the one to bring up. `known` holds the ids
 *  seen before; only a job created moments ago counts, so loading the list
 *  never jumps to a video. */
export function newcomer(known, jobs, now, windowMs = 20000) {
    const fresh = sortJobs(jobs).find((j) => !known.has(j.id)
        && j.created_ms != null && now - j.created_ms >= -5000 && now - j.created_ms <= windowMs
        && j.origin !== 'watch' && !String(j.origin ?? '').startsWith('mcp:'));
    return fresh ? fresh.id : null;
}

/** The video to show when the shown one leaves: the one that was below it,
 *  else the one above, else nothing. */
export function neighbour(ids, id) {
    const at = ids.indexOf(id);
    if (at < 0) return ids[0] ?? null;
    return ids[at + 1] ?? ids[at - 1] ?? null;
}

/** Short tags for a job: who started it when it wasn't you (an AI app over
 *  MCP, the watch folder), its shape when not the default 9:16, and the focus
 *  topic it was ranked for. */
export function jobTags(job, tr = (s) => s) {
    const tags = [];
    const options = job?.options;
    if (options?.merge != null) tags.push(tr('merged'));
    if (job?.origin === 'watch') tags.push(tr('watch folder'));
    else if (job?.origin?.startsWith('mcp:')) tags.push(tr('via {app}', { app: job.origin.slice(4) || 'AI' }));
    if (options?.aspect && options.aspect !== '9:16') tags.push(options.aspect);
    if (options?.focus) tags.push(tr('focus: {topic}', { topic: options.focus }));
    return tags;
}

/** 83 -> "1:23". */
export function fmtDur(s) {
    if (s == null) return null;
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** "0:42 → 1:30". */
export function fmtRange(a, b) {
    if (a == null || b == null) return null;
    return `${fmtDur(a)} → ${fmtDur(b)}`;
}
