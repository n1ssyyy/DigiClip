// What the Health page says, decided from what the engine reports. Pure: the
// page only draws the result. Three kinds of finding:
//   problems  something DigiClip cannot do until it is fixed (shown first, red,
//             each with what to do, some with a button: `action`)
//   notes     it works, with a caveat worth knowing (no GPU: slower)
//   facts     what is installed and where, plain name / value pairs
// `overall` is 'checking' while `health` is null (the engine answers hello at
// once and the first check lands a few seconds later), 'problem' when any
// problem stands, 'setup' while the engine is still downloading something no
// clip can be made without, else 'ok' (notes do not change it).
//
// The engine downloads what it needs by itself (`setup`, see setupView.js):
// while it is at it, a missing ffmpeg or speech model is a note, not a
// problem; when a download failed, the problem says so and offers to try
// again now (`action.kind === 'retry'`). Unknown judges nothing:
// no problems, no notes, no facts, whatever settings and models say.

import { setupItem } from './setupView.js';

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
const plain = (s, vars) => fill(s, vars);

export const DEFAULT_STT = 'base.en';

/** 'windows' | 'macos' | 'linux' from a browser user-agent string, else ''.
 *  The app's webview reports the operating system it runs on. */
export function platformOf(ua) {
    const s = String(ua ?? '');
    if (/Windows/i.test(s)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(s)) return 'macos';
    if (/Linux|X11/i.test(s)) return 'linux';
    return '';
}

// What is said about a missing ffmpeg when the engine tells nothing about
// its downloads (an engine without setup, or one that has not looked yet).
function ffmpegMissing(t) {
    return t("ffmpeg wasn't found, so DigiClip can't cut or render clips. It downloads ffmpeg by itself (about 100 MB, so it needs an internet connection).");
}

/** @param {{health: object|null, conn: string, settings: object|null, models: object, setup?: Array|null, platform?: string}} state
 *  @param {(text: string, vars?: object) => string} [t] */
export function healthView({ health, conn, settings, models, setup = null } = {}, t = plain) {
    const problems = [];
    const notes = [];
    const facts = [];
    const down = conn === 'retry' || conn === 'failed';

    if (down) {
        problems.push({
            id: 'connection',
            text: t("DigiClip can't reach its engine right now. It keeps trying to reconnect."),
        });
    }
    if (!health) {
        return { overall: down ? 'problem' : 'checking', problems, notes, facts };
    }

    const gpu = health.gpu_available === true;
    const stt = settings ? (settings.stt_model || DEFAULT_STT) : null;
    // Speech-to-text is part of the engine itself; the two programs are extras.
    const whisper = !!(health.stt_embedded || health.whisper_cli || health.whisper_vulkan);
    const retry = { kind: 'retry', label: t('Try again') };
    let gettingReady = false;
    const onGpu = !!health.whisper_vulkan && gpu;

    if (health.ffmpeg_ok === false) {
        const own = setupItem(setup, 'ffmpeg');
        if (own && own.state === 'failed') {
            problems.push({
                id: 'ffmpeg',
                text: t("DigiClip couldn't download ffmpeg yet, so it can't cut or render clips. It tries again by itself; check the internet connection."),
                action: retry,
            });
        } else if (own && own.state !== 'ready') {
            gettingReady = true;
            notes.push({ id: 'ffmpeg', text: t('ffmpeg is downloading. DigiClip can cut and render clips as soon as it is here.') });
        } else {
            problems.push({ id: 'ffmpeg', text: ffmpegMissing(t) });
        }
    } else if (health.ffmpeg_ok === true && health.ffmpeg_libass === false) {
        problems.push({
            id: 'libass',
            text: t("This ffmpeg was built without libass, so DigiClip can't burn captions into videos. Install an ffmpeg build that includes libass."),
        });
    }
    if (!whisper && health.whisper_cli != null) {
        problems.push({
            id: 'whisper',
            text: t("The speech-to-text program wasn't found, so DigiClip can't write captions. Reinstalling DigiClip brings it back."),
        });
    }
    if (stt && models && Object.keys(models).length) {
        const m = models[stt];
        const own = m?.downloaded ? null : setupItem(setup, 'stt', stt);
        if (m?.downloading) {
            gettingReady = true;
            notes.push({ id: 'model', text: t('The speech model {model} is still downloading.', { model: stt }) });
        } else if (own && own.state === 'failed') {
            problems.push({
                id: 'model',
                text: t("DigiClip couldn't download the speech model {model} yet, so it can't write captions. It tries again by itself; check the internet connection.", { model: stt }),
                action: retry,
            });
        } else if (own && own.state !== 'ready') {
            gettingReady = true;
            notes.push({ id: 'model', text: t('The speech model {model} downloads by itself in a moment.', { model: stt }) });
        } else if (!m?.downloaded) {
            problems.push({
                id: 'model',
                text: t("The speech model {model} isn't downloaded yet. Pick it in Settings to download it.", { model: stt }),
                action: { kind: 'settings', label: t('Open Settings') },
            });
        }
    }
    if (health.gpu_available === false) {
        const why = String(health.gpu_reason ?? '').trim();
        notes.push({
            id: 'gpu',
            text: why
                ? t('No graphics card is in use, so videos are made on the processor and take longer. ({reason})', { reason: why })
                : t('No graphics card is in use, so videos are made on the processor and take longer.'),
        });
    }

    facts.push({ id: 'engine', label: t('Engine'), value: health.version ? `v${health.version}` : '' });
    if (health.ffmpeg_ok !== false) {
        facts.push({
            id: 'ffmpeg',
            label: 'ffmpeg',
            value: health.ffmpeg_ok && health.ffmpeg_libass === true ? t('with libass') : '',
        });
    }
    if (health.encoder) facts.push({ id: 'encoder', label: t('Encoder'), value: String(health.encoder) });
    if (whisper) {
        const where = onGpu ? t('on the graphics card') : t('on the processor');
        facts.push({ id: 'stt', label: t('Speech to text'), value: stt ? `${stt}, ${where}` : where });
    }
    if (gpu) {
        facts.push({ id: 'gpu', label: t('Graphics card'), value: String(health.gpu_reason || '').trim() || t('available') });
    }
    if (health.jobs_dir) facts.push({ id: 'storage', label: t('Videos are stored in'), value: String(health.jobs_dir) });
    if (!down && conn === 'live') facts.push({ id: 'connection', label: t('Connection'), value: t('live, on this computer') });

    return { overall: problems.length ? 'problem' : gettingReady ? 'setup' : 'ok', problems, notes, facts: facts.filter((f) => f.value !== '') };
}
