import { removalEdit } from '../../lib/fontLibrary';
import { lookStore } from '../../lib/look';
import { isTauri, pickFont } from '../../lib/native';
import { flashMessage } from '../../lib/socket';
import { fontPreview, forgetFamily, library } from './useFonts';

/**
 * "Add a font…": the system file dialog (.ttf / .otf), then the engine copies
 * the file into its fonts folder. Resolves the new entry, or null (cancelled,
 * or the engine's own sentence was shown as a toast). In a plain browser
 * there is no dialog: a toast says the app is needed, nothing else happens.
 */
export async function addFontFromDialog(t) {
    if (!isTauri()) {
        flashMessage(t('Adding a font needs the DigiClip app.'));
        return null;
    }
    let path;
    try {
        path = await pickFont();
    } catch {
        return null;
    }
    if (!path) return null;
    try {
        return await library.add(path);
    } catch (e) {
        flashMessage(e?.message || t('Couldn’t add that font.'));
        return null;
    }
}

/**
 * Remove one of the creator's fonts. A layer of the Look that used it goes
 * back to its default font in ONE undo step, and a toast says so. Resolves
 * whether the engine removed it (its sentence is a toast when it did not).
 */
export async function removeFont(family, t) {
    fontPreview.clear();
    try {
        await library.remove(family);
    } catch (e) {
        flashMessage(e?.message || t('Couldn’t remove that font.'));
        return false;
    }
    forgetFamily(family);
    const edit = removalEdit(lookStore.get().options.look, family);
    if (edit) {
        lookStore.edit(null, edit.sections);
        const both = edit.layers.length === 2;
        const text = both
            ? t('Removed {font}. The captions and the headline are back on their default fonts.', { font: family })
            : edit.layers[0] === 'captions'
                ? t('Removed {font}. The captions are back on their default font.', { font: family })
                : t('Removed {font}. The headline is back on its default font.', { font: family });
        flashMessage(text);
    }
    return true;
}
