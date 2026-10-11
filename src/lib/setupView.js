// What first-run setup is doing, decided from the engine's `setup` list. Pure:
// the pages only draw the result.
//
// The engine fetches what DigiClip needs by itself once it is up (ffmpeg, the
// speech model, the face model, the link downloader, Laya) and carries on
// where it stopped when the connection drops. Each item of the list is
//   { id, model?, size_mb, state, pct?, why? }
// with `state` one of 'ready', 'downloading', 'waiting' (downloading, and
// waiting for the connection to try again), 'failed' (the engine tries again
// later by itself) and 'missing' (its turn has not come yet). `setup` is null
// until the engine has looked at the disk, and on an engine without setup.

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
const plain = (s, vars) => fill(s, vars);

/** Without these no clip can be made. */
const NEEDED = ['ffmpeg', 'stt'];

const sizeText = (mb) => (mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

/** An item's name, in words. */
export function setupLabel(item, t = plain) {
    switch (item?.id) {
        case 'ffmpeg':
            return 'ffmpeg';
        case 'stt':
            return t('Speech model {model}', { model: item.model ?? '' });
        case 'face':
            return t('Face model');
        case 'yt-dlp':
            return t('Link downloader');
        case 'laya':
            return t('Laya clip judge');
        default:
            return String(item?.id ?? '');
    }
}

function lineOf(item, t) {
    switch (item.state) {
        case 'ready':
            return t('Ready');
        case 'downloading':
            return item.pct != null ? t('Downloading… {pct}%', { pct: item.pct }) : t('Downloading…');
        case 'waiting':
            return t('Waiting for the connection. It carries on by itself.');
        case 'failed':
            return t("Couldn't download it yet. DigiClip tries again by itself.");
        default:
            return t('Next in line');
    }
}

/** The engine's item for `id` (and, for the speech model, that `model`). */
export function setupItem(setup, id, model) {
    if (!Array.isArray(setup)) return null;
    return setup.find((it) => it?.id === id && (model == null || it.model === model)) ?? null;
}

/** @param {Array|null} setup the engine's list
 *  @param {(text: string, vars?: object) => string} [t]
 *  @returns {{known: boolean, items: object[], open: object[],
 *    phase: 'idle'|'working'|'stuck', needed: boolean, banner: object|null}}
 *  `phase`: 'idle' nothing left to fetch (or nothing known), 'working'
 *  something is downloading or about to, 'stuck' only failed items are left
 *  (the engine retries them later). `needed`: something a clip cannot be made
 *  without is still missing. `banner`: what Home says about it, or null. */
export function setupView(setup, t = plain) {
    const list = Array.isArray(setup) ? setup.filter((it) => it && typeof it.id === 'string') : [];
    const items = list.map((it) => {
        const busy = it.state === 'downloading' || it.state === 'waiting';
        return {
            id: it.id,
            label: setupLabel(it, t),
            size: sizeText(it.size_mb ?? 0),
            state: it.state,
            pct: busy && it.pct != null ? Math.max(0, Math.min(100, it.pct)) : null,
            line: lineOf(it, t),
            why: it.state === 'failed' || it.state === 'waiting' ? String(it.why ?? '') : '',
        };
    });
    const open = items.filter((i) => i.state !== 'ready');
    const active = open.find((i) => i.state === 'downloading' || i.state === 'waiting') ?? open.find((i) => i.state === 'missing') ?? null;
    const failed = open.filter((i) => i.state === 'failed');
    const phase = !open.length ? 'idle' : active ? 'working' : 'stuck';
    const needed = open.some((i) => NEEDED.includes(i.id));

    let banner = null;
    if (phase === 'working') {
        banner = {
            tone: 'work',
            title: needed ? t('Getting DigiClip ready') : t('Finishing setup in the background'),
            text: active.state === 'waiting'
                ? t('{name}: waiting for the connection…', { name: active.label })
                : active.pct != null
                    ? t('Downloading {name}… {pct}%', { name: active.label, pct: active.pct })
                    : t('Downloading {name}…', { name: active.label }),
            count: t('{done} of {total} ready', { done: items.length - open.length, total: items.length }),
            pct: active.state === 'downloading' ? active.pct : null,
            retry: false,
        };
    } else if (phase === 'stuck') {
        banner = {
            tone: 'bad',
            title: t("DigiClip couldn't download everything it needs"),
            text: t('{names}: not downloaded yet. It tries again by itself; check the internet connection.', { names: failed.map((i) => i.label).join(', ') }),
            count: '',
            pct: null,
            retry: true,
        };
    }
    return { known: Array.isArray(setup), items, open, phase, needed, banner };
}
