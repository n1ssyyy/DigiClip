// What the Health page says, decided from what the engine reports. Pure: the
// page only draws the result. Three kinds of finding:
//   problems  something DigiClip cannot do until it is fixed (shown first, red,
//             each with what to do, some with a button: `action`)
//   notes     it works, with a caveat worth knowing (no GPU: slower)
//   facts     what is installed and where, plain name / value pairs
// `overall` is 'checking' until the engine has answered, 'problem' when any
// problem stands, else 'ok' (notes do not change it).

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
const plain = (s, vars) => fill(s, vars);

export const DEFAULT_STT = 'base.en';

/** @param {{health: object|null, conn: string, settings: object|null, models: object}} state
 *  @param {(text: string, vars?: object) => string} [t] */
export function healthView({ health, conn, settings, models } = {}, t = plain) {
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
    const whisper = !!(health.whisper_cli || health.whisper_vulkan);
    const onGpu = !!health.whisper_vulkan && gpu;

    if (health.ffmpeg_ok === false) {
        problems.push({
            id: 'ffmpeg',
            text: t("ffmpeg wasn't found, so DigiClip can't cut or render clips. Reinstalling DigiClip brings it back."),
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
        if (m?.downloading) {
            notes.push({ id: 'model', text: t('The speech model {model} is still downloading.', { model: stt }) });
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
            value: health.ffmpeg_ok == null ? '' : health.ffmpeg_libass ? t('with libass') : t('without libass'),
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

    return { overall: problems.length ? 'problem' : 'ok', problems, notes, facts: facts.filter((f) => f.value !== '') };
}
