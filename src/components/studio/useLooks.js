import { useCallback, useMemo, useRef, useState } from 'react';
import { toEngine } from '../../lib/look';
import {
    deleteLook, duplicateLook, isEdited, loaded, lookList, renameLook, reservedNames, resolveCurrent, saveLook,
} from '../../lib/lookLibrary';
import { chooseName } from '../../lib/lookNames';
import { STARTERS } from '../../lib/starterLooks';
import { flashMessage, saveSettings } from '../../lib/socket';
import { useT } from '../../lib/i18n';

/**
 * The saved Looks, for the picker and the keys: the list, which look the
 * working copy is, whether it has been edited, and the actions. A Look is a
 * preset (`settings.presets`), written with `saveSettings` (the watch folder
 * and the CLI read the same list). An action that cannot be saved says so in the toast
 * and changes nothing.
 *
 * Home reads the list and loads a look too (`undoHint: false`: its toast does
 * not promise an undo key the page does not have).
 *
 * @param {{options: object, current: string|null, load: Function, setCurrent: Function}} look  `useLook()`
 */
export function useLooks({ look, settings, undoHint = true }) {
    const t = useT();
    const presets = settings?.presets;
    const { options, current: name } = look;
    const list = useMemo(() => lookList(presets), [presets]);
    const current = useMemo(() => resolveCurrent(list, name), [list, name]);
    const edited = useMemo(() => isEdited(options, current, settings), [options, current, settings]);
    const own = useMemo(() => list.mine.map((m) => m.name), [list]);
    const reserved = reservedNames(STARTERS, t);
    const [saving, setSaving] = useState(false);
    const busy = useRef(false);
    // The latest of these for the actions below, which run after an await.
    const live = useRef({});
    live.current = { options, presets, own, reserved, current, settings };

    const persist = useCallback(async (next) => {
        if (busy.current) return false;
        busy.current = true;
        setSaving(true);
        try {
            await saveSettings({ presets: next });
            return true;
        } catch (e) {
            flashMessage(t("Couldn't save the look: {error}", { error: e?.message ?? e }));
            return false;
        } finally {
            busy.current = false;
            setSaving(false);
        }
    }, [t]);

    /** Load a look from the list: one undo step, and a toast that says so. */
    const load = useCallback((entry) => {
        const { options: now, settings: s } = live.current;
        const next = loaded(entry, now, s);
        const same = JSON.stringify(next) === JSON.stringify(now);
        look.load(next, entry.name);
        // Only the app's own names are translated; a name the person typed is theirs.
        const shown = entry.kind === 'starter' ? t(entry.name) : entry.name;
        flashMessage(same || !undoHint ? t('Loaded “{name}”.', { name: shown }) : t('Loaded “{name}”. Ctrl+Z goes back.', { name: shown }));
    }, [look, t, undoHint]);

    /** Save the working copy over the current look (the person's own). */
    const save = useCallback(async () => {
        const { options: now, presets: p, current: c } = live.current;
        if (c.kind !== 'mine') return false;
        const ok = await persist(saveLook(p, c.name, toEngine(now)));
        if (ok) flashMessage(t('Saved “{name}”.', { name: c.name }));
        return ok;
    }, [persist, t]);

    /** Save the working copy as a look called `raw` (a clash takes the next
     *  free name; the exact name of an own look replaces it). */
    const saveAs = useCallback(async (raw) => {
        const { options: now, presets: p, own: names, reserved: res } = live.current;
        const pick = chooseName(raw, names, { reserved: res, allowReplace: true });
        if (!pick) return false;
        const ok = await persist(saveLook(p, pick.name, toEngine(now)));
        if (!ok) return false;
        look.setCurrent(pick.name);
        flashMessage(t('Saved “{name}”.', { name: pick.name }));
        return true;
    }, [look, persist, t]);

    const rename = useCallback(async (raw) => {
        const { presets: p, own: names, reserved: res, current: c } = live.current;
        if (c.kind !== 'mine') return false;
        const pick = chooseName(raw, names, { reserved: res, except: c.name });
        if (!pick) return false;
        if (pick.name === c.name) return true;
        const ok = await persist(renameLook(p, c.name, pick.name));
        if (!ok) return false;
        look.setCurrent(pick.name);
        flashMessage(t('Renamed to “{name}”.', { name: pick.name }));
        return true;
    }, [look, persist, t]);

    /** A copy of the working copy under the next free name of the current look
     *  (a saved one or a starter; an unsaved Untitled is Save as new). */
    const duplicate = useCallback(async () => {
        const { options: now, presets: p, reserved: res, current: c } = live.current;
        if (c.kind === 'untitled') return false;
        const made = duplicateLook(p, c.kind === 'mine' ? c.name : t(c.name), toEngine(now), res);
        const ok = await persist(made.presets);
        if (!ok) return false;
        look.setCurrent(made.name);
        flashMessage(t('Saved “{name}”.', { name: made.name }));
        return true;
    }, [look, persist, t]);

    const remove = useCallback(async () => {
        const { presets: p, current: c } = live.current;
        if (c.kind !== 'mine') return false;
        const ok = await persist(deleteLook(p, c.name));
        if (!ok) return false;
        look.setCurrent(null);
        flashMessage(t('Deleted “{name}”.', { name: c.name }));
        return true;
    }, [look, persist, t]);

    return { list, current, edited, own, reserved, saving, load, save, saveAs, rename, duplicate, remove };
}
