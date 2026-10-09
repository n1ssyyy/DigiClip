/**
 * The whole backend, over one WebSocket. Replaces Echo + every fetch +
 * every `router.reload` the old UI used: the server pushes `ev` frames,
 * the client sends `{id, cmd, …}` and awaits a correlated `res`.
 *
 * No polling anywhere in this file: reconnects resync via `hello` →
 * `snapshot`, pages refresh on visibility/focus by re-asking over the
 * same socket, and the `ago` clock is a render tick, not a fetch.
 */
import { useSyncExternalStore } from 'react';
import { t } from './i18n';
import { fontFileUrl } from './fontLibrary';
import { broadcastSettings, isTauri, onSettings, openMain, windowLabel } from './native';

const S = {
    conn: 'boot', // boot | live | retry | failed
    serve: null, // { port, token }
    jobs: [],
    settings: null,
    models: {},
    health: null,
    aiModels: {}, // provider id -> last ai_models reply
    toasts: [],
    flash: null,
    mcp: null, // MCP server: port, token, clients, activity, tools, installed apps
    focus: null, // { job, seq }: an AI app asked to show this project
    caps: [], // engine abilities from `hello` (absent on older engines), e.g. 'look'
    page: 'home', // home | studio | health | mcp | settings
    busy: 0, // PageLine counter: full actions only, never background events
};

let ws = null;
let nextId = 1;
const pending = new Map();
const listeners = new Set();
let toastSeq = 1;
let flashTimer = null;
let retryTimer = null;
let retryMs = 1000;
const RETRY_CAP = 10000;
// Resolves on the first hello snapshot (boot gate waits for real data).
let synced = false;
const syncWaiters = new Set();

export function whenSynced(timeoutMs = 15000) {
    if (synced) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            syncWaiters.delete(entry);
            reject(new Error(t('engine did not answer')));
        }, timeoutMs);
        const entry = { resolve: () => resolve(true), timer };
        syncWaiters.add(entry);
    });
}

function markSynced() {
    synced = true;
    syncWaiters.forEach(({ resolve, timer }) => {
        clearTimeout(timer);
        try {
            resolve();
        } catch {
        }
    });
    syncWaiters.clear();
}

function emit() {
    listeners.forEach((l) => {
        try {
            l();
        } catch {
            // A dead subscriber never breaks the store.
        }
    });
}

function subscribe(l) {
    listeners.add(l);
    return () => listeners.delete(l);
}

function snapshot() {
    return S;
}

export function useStore(sel) {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useSyncExternalStore(subscribe, () => (sel ? sel(snapshot()) : snapshot()));
}

// ---------------------------------------------------------------------------
// connection
// ---------------------------------------------------------------------------

function wsUrl() {
    const { port, token } = S.serve;
    return `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`;
}

/** `rev` busts the webview cache after a clip re-renders in place
 *  (same file name, new bytes). */
export function artUrl(jobId, file, rev) {
    const { port, token } = S.serve;
    const v = rev ? `&v=${rev}` : '';
    return `http://127.0.0.1:${port}/art/${encodeURIComponent(jobId)}/${encodeURIComponent(file)}?token=${encodeURIComponent(token)}${v}`;
}

/** A listed font's file on the engine (`GET /font/<file>`), for the stage's
 *  `FontFace`; null before the engine's address is known. */
export function fontUrl(entry) {
    return fontFileUrl(S.serve, entry);
}

export function srcUrl(jobId) {
    const { port, token } = S.serve;
    return `http://127.0.0.1:${port}/src/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`;
}

export function connect(serve) {
    S.serve = serve;
    openSocket();
}

function openSocket() {
    clearTimeout(retryTimer);
    retryTimer = null;
    try {
        ws?.close();
    } catch {
    }
    ws = null;
    let sock;
    try {
        sock = new WebSocket(wsUrl());
    } catch {
        return scheduleRetry();
    }
    ws = sock;

    sock.onopen = () => {
        retryMs = 1000;
        S.conn = 'live';
        emit();
        // Resync everything over the same socket (no HTTP fetch).
        cmd('hello', {}, { busy: false }).then((data) => {
            if (!data) return;
            S.jobs = data.jobs ?? [];
            S.settings = data.settings ?? null;
            S.models = data.models ?? {};
            S.health = data.health ?? null;
            S.mcp = data.mcp ?? null;
            S.caps = Array.isArray(data.caps) ? data.caps.filter((c) => typeof c === 'string') : [];
            markSynced();
            emit();
        }).catch(() => {});
    };
    sock.onmessage = (e) => {
        let frame;
        try {
            frame = JSON.parse(e.data);
        } catch {
            return;
        }
        if (frame?.type === 'res') {
            const p = pending.get(frame.id);
            if (!p) return;
            pending.delete(frame.id);
            clearTimeout(p.timer);
            if (frame.ok) p.resolve(frame.data ?? null);
            else p.reject(new Error(frame.error || t('command failed')));
            return;
        }
        if (frame?.type === 'ev') apply(frame);
    };
    const down = () => {
        try {
            sock.close();
        } catch {
        }
        if (ws === sock) {
            ws = null;
            S.conn = 'retry';
            emit();
            scheduleRetry();
        }
    };
    sock.onclose = down;
    sock.onerror = down;
}

function scheduleRetry() {
    if (retryTimer) return;
    const ms = retryMs;
    retryMs = Math.min(RETRY_CAP, retryMs * 2);
    retryTimer = setTimeout(() => {
        retryTimer = null;
        openSocket();
    }, ms);
}

/** One command round-trip. `busy` drives PageLine (full actions only). */
export function cmd(name, params = {}, { busy = false, timeoutMs = 60000 } = {}) {
    return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            reject(new Error(t('not connected')));
            return;
        }
        const id = nextId++;
        const timer = setTimeout(() => {
            pending.delete(id);
            if (busy) {
                S.busy = Math.max(0, S.busy - 1);
                emit();
            }
            reject(new Error(t('timed out')));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        if (busy) {
            S.busy += 1;
            emit();
        }
        const done = () => {
            if (busy) {
                S.busy = Math.max(0, S.busy - 1);
                emit();
            }
        };
        const p = pending.get(id);
        const origResolve = p.resolve;
        const origReject = p.reject;
        p.resolve = (v) => { done(); origResolve(v); };
        p.reject = (e) => { done(); origReject(e); };
        try {
            // Frame id and cmd go last so a param can never overwrite them.
            ws.send(JSON.stringify({ ...params, id, cmd: name }));
        } catch (e) {
            pending.delete(id);
            clearTimeout(timer);
            done();
            reject(e);
        }
    });
}

// ---------------------------------------------------------------------------
// events -> state (every mutation the old `router.reload` used to fetch)
// ---------------------------------------------------------------------------

// Immutable updates throughout: useSyncExternalStore compares selector
// results by reference, so mutating a job (or the jobs array) in place
// never re-renders — the UI only caught up on the next unrelated click.
// Every branch below swaps in fresh objects/arrays instead.
function upsertJob(job) {
    const i = S.jobs.findIndex((j) => j.id === job.id);
    if (i >= 0) S.jobs = S.jobs.map((j, k) => (k === i ? job : j));
    else S.jobs = [...S.jobs, job].sort((a, b) => (b.created_ms ?? 0) - (a.created_ms ?? 0));
}

function pushToast(type, title, body) {
    S.toasts = [...S.toasts.slice(-3), { id: toastSeq++, type, title, body }];
}

export const FLASH_MS = 6000;

function flash(text) {
    S.flash = text;
    emit();
    armFlash();
}

function armFlash() {
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
        S.flash = null;
        emit();
    }, FLASH_MS);
}

/** Hold the toast open while the pointer is on it; leaving gives it a
 *  fresh full life again. */
export function holdFlash(on) {
    if (!S.flash) return;
    if (on) {
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = null;
    } else {
        armFlash();
    }
}

function apply(frame) {
    const ev = frame;
    switch (ev.kind) {
        case 'snapshot':
            S.jobs = ev.jobs ?? [];
            S.settings = ev.settings ?? S.settings;
            S.models = ev.models ?? S.models;
            S.health = ev.health ?? S.health;
            break;
        case 'job_created':
            upsertJob(ev.job);
            flash(ev.job.status === 'downloading' ? t('Fetching {name}…', { name: ev.job.name }) : t('Stored {name}, transcription queued.', { name: ev.job.name }));
            break;
        case 'job_updated':
            upsertJob(ev.job);
            break;
        case 'job_removed':
            S.jobs = S.jobs.filter((j) => j.id !== ev.id);
            transcripts.delete(ev.id);
            break;
        case 'stage': {
            const ji = S.jobs.findIndex((x) => x.id === ev.job);
            if (ji >= 0) {
                const cur = S.jobs[ji].status;
                const map = {
                    download: 'downloading', provision: 'queued', audio: 'extracting', transcribe: 'transcribing',
                    pick: 'analyzing', track: 'analyzing', render: cur, merge: cur, kit: cur, done: cur,
                };
                const next = map[ev.stage] ?? cur;
                if (next !== cur) S.jobs = S.jobs.map((x, i) => (i === ji ? { ...x, status: next } : x));
            }
            break;
        }
        case 'clips_picked': {
            const ji = S.jobs.findIndex((x) => x.id === ev.job);
            if (ji >= 0) {
                S.jobs = S.jobs.map((x, i) => (i === ji ? { ...x, status: 'clips_ready', clips: ev.clips } : x));
            }
            break;
        }
        case 'clip_track': {
            const ji = S.jobs.findIndex((x) => x.id === ev.job);
            if (ji >= 0) {
                const clips = (S.jobs[ji].clips ?? []).map((c) => (c.rank === ev.rank
                    ? { ...c, track_pct: ev.pct, render_status: c.render_status === 'pending' ? 'rendering' : c.render_status }
                    : c));
                S.jobs = S.jobs.map((x, i) => (i === ji ? { ...x, clips } : x));
            }
            break;
        }
        case 'clip_render': {
            const ji = S.jobs.findIndex((x) => x.id === ev.job);
            if (ji >= 0) {
                const clips = (S.jobs[ji].clips ?? []).map((c) => (c.rank === ev.rank
                    ? { ...c, render_pct: ev.pct, render_status: c.render_status === 'pending' ? 'rendering' : c.render_status }
                    : c));
                S.jobs = S.jobs.map((x, i) => (i === ji ? { ...x, clips } : x));
            }
            break;
        }
        case 'clip_done': {
            const ji = S.jobs.findIndex((x) => x.id === ev.job);
            if (ji >= 0) {
                const prev = S.jobs[ji].clips ?? [];
                const at = prev.findIndex((x) => x.rank === ev.clip.rank);
                const clips = at >= 0 ? prev.map((x, i) => (i === at ? ev.clip : x)) : [...prev, ev.clip];
                S.jobs = S.jobs.map((x, i) => (i === ji ? { ...x, clips } : x));
            }
            break;
        }
        case 'models_progress': {
            const m = S.models[ev.id];
            if (m) {
                const pct = ev.total > 0 ? Math.round((ev.done / ev.total) * 100) : 0;
                S.models = { ...S.models, [ev.id]: { ...m, downloading: true, progress: pct } };
            }
            break;
        }
        case 'models_state':
            S.models = ev.models ?? S.models;
            break;
        case 'health':
            S.health = ev.health;
            break;
        case 'mcp':
            S.mcp = ev.mcp ?? S.mcp;
            break;
        case 'settings':
            // Saved by the engine itself (a model was picked after a fetch).
            S.settings = ev.settings ?? S.settings;
            break;
        case 'mcp_focus':
            // Only the main window follows; the tray menu has its own socket.
            if (windowLabel() === 'tray') return;
            if (ev.job) S.focus = { job: ev.job, seq: (S.focus?.seq ?? 0) + 1 };
            S.page = ev.page ?? (ev.job ? 'home' : S.page);
            if (isTauri()) openMain();
            break;
        case 'toast':
            pushToast(ev.tone === 'error' ? 'error' : ev.tone === 'success' ? 'success' : 'info', ev.title, ev.body);
            break;
        default:
            return;
    }
    emit();
}

// ---------------------------------------------------------------------------
// actions (what the old router.post / fetch calls did)
// ---------------------------------------------------------------------------

/** Show the app's floating toast (the flash message). Lets UI
 *  actions surface errors that would otherwise fail silently. */
export function flashMessage(text) {
    flash(text);
}

/** Close the toast early (its own dismiss button). */
export function dismissFlash() {
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = null;
    S.flash = null;
    emit();
}

export function navigate(page) {
    if (S.page !== page) {
        S.page = page;
        emit();
    }
}

/** The project an AI app asked to show has been shown. */
export function clearFocus() {
    if (S.focus) {
        S.focus = null;
        emit();
    }
}

export function startJob(source, options) {
    return cmd('job_start', { source, options });
}

/** Start a job from a link (YouTube and anything yt-dlp reads): the
 *  engine downloads it first, status `downloading`. */
export function startJobUrl(url, options) {
    return cmd('job_start_url', { url, options });
}

/** Write a diagnostics report (versions, health, recent logs, no keys)
 *  and resolve its path. */
export function exportDiagnostics() {
    return cmd('diagnostics', {}, { busy: true });
}

export function cancelJob(id) {
    return cmd('job_cancel', { job: id }).catch(() => {});
}

export function removeJob(id) {
    return cmd('job_remove', { job: id }).catch(() => {});
}

export function retryJob(id) {
    return cmd('job_retry', { job: id }).catch(() => {});
}

export function saveSettings(patch) {
    return cmd('settings_set', { patch }, { busy: true }).then((data) => {
        if (data) {
            S.settings = data;
            emit();
            broadcastSettings(data);
        }
        return data;
    });
}

// The other window (app or tray menu) saved settings.
if (isTauri()) {
    onSettings((settings) => {
        if (!settings) return;
        S.settings = settings;
        emit();
    }).catch(() => {});
}

export function refreshMcp() {
    return cmd('mcp_state').then((data) => {
        if (data) {
            S.mcp = data;
            emit();
        }
        return data;
    }).catch(() => null);
}

/** New token: HTTP clients need the new one (the bridge reads it itself). */
export function rotateMcpToken() {
    return cmd('mcp_rotate_token', {}, { busy: true }).then((data) => {
        if (data) {
            S.mcp = data;
            emit();
        }
        return data;
    });
}

/** Add DigiClip to (or take it out of) an AI app's MCP config:
 *  `claude_desktop`, `claude_code` or `cursor`. Resolves `{ path }`. */
export function installMcp(client, remove = false) {
    return cmd('mcp_install', { client, remove }, { busy: true, timeoutMs: 90000 });
}

export function downloadModel(id) {
    return cmd('models_download', { model: id }).catch((e) => flash(t("Couldn't download {model}: {error}", { model: id, error: e?.message ?? e })));
}

export function deleteModel(id) {
    return cmd('models_delete', { model: id }).catch((e) => flash(t("Couldn't delete {model}: {error}", { model: id, error: e?.message ?? e })));
}

export function refreshHealth() {
    return cmd('health_get', {}, { busy: false }).then((data) => {
        if (data) {
            S.health = data;
            emit();
        }
        return data;
    }).catch(() => null);
}

/** Model list of a Clip AI provider. Reply: `{provider, models, fetched_ms,
 *  picked}`; `picked` is the model the engine just saved for you. */
export function loadAiModels(provider, refresh = false) {
    return cmd('ai_models', { provider, refresh }, { busy: false, timeoutMs: 90000 }).then((data) => {
        if (data) {
            S.aiModels = { ...S.aiModels, [data.provider ?? provider]: data };
            emit();
        }
        return data;
    });
}

export function loadOrModels(refresh = false) {
    return loadAiModels('openrouter', refresh);
}

// Word-timed transcripts per job: they never change once a job has
// clips, so one fetch serves every editor open.
const transcripts = new Map();

/** `{ words: [{w, s, e}], language }` for a finished job. */
export function getTranscript(job) {
    if (transcripts.has(job)) return transcripts.get(job);
    const p = cmd('transcript_get', { job }, { busy: false, timeoutMs: 30000 });
    transcripts.set(job, p);
    p.catch(() => transcripts.delete(job));
    return p;
}

/** Re-render one clip: new range, title, style or word fixes
 *  (`[{s, w}]`: the word starting at `s` becomes `w`). */
export function editClip(job, rank, patch) {
    return cmd('clip_edit', { job, rank, ...patch }, { busy: true });
}

/** Render a new clip from a transcript range. Resolves `{ rank }`. */
export function addClip(job, start_s, end_s, extra = {}) {
    return cmd('clip_add', { job, start_s, end_s, ...extra }, { busy: true });
}

export function fetchKit(job, rank) {
    return cmd('clip_kit', { job, rank }, { busy: false }).then((d) => d?.text ?? null);
}

/** Save an artifact to disk: fetch the token-gated bytes (CORS is open
 *  on the loopback daemon) and put up the native save picker — the
 *  user chooses where the copy lands. Plain <a download> never fires
 *  inside the webview, so everything goes through the shell. Resolves
 *  the saved path, or null on cancel. */
export async function downloadArt(url, filename) {
    const { saveFile } = await import('./native.js');
    const res = await fetch(url);
    if (!res.ok) throw new Error(t('download failed: {status}', { status: res.status }));
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = (filename.split('.').pop() ?? 'mp4').toLowerCase();
    const dest = await saveFile(bytes, { filename, filters: [{ name: t('Video'), extensions: [ext] }] });
    if (dest) flashMessage(t('Saved {file}', { file: filename }));
    return dest;
}

export async function downloadText(text, filename) {
    const { saveFile } = await import('./native.js');
    const dest = await saveFile(new TextEncoder().encode(text), { filename, filters: [{ name: t('Text'), extensions: ['txt'] }] });
    if (dest) flashMessage(t('Saved {file}', { file: filename }));
    return dest;
}

export function dismissToast(id) {
    S.toasts = S.toasts.filter((t) => t.id !== id);
    emit();
}
