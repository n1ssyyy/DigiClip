import { useSyncExternalStore } from 'react';
import dicts from '../i18n';

/** UI languages, in their own names. English is the source text: every
 *  string is written in English in the code and looked up here, so a
 *  missing translation shows English instead of a key. */
export const LANGUAGES = [
    ['en', 'English'], ['sq', 'Shqip'], ['de', 'Deutsch'], ['fr', 'Français'],
    ['es', 'Español'], ['it', 'Italiano'], ['tr', 'Türkçe'],
];

const STORE_KEY = 'digiclip.lang';
const valid = (l) => LANGUAGES.some(([id]) => id === l);

function initial() {
    try {
        const v = localStorage.getItem(STORE_KEY);
        if (valid(v)) return v;
    } catch {
    }
    const nav = String(globalThis.navigator?.language ?? 'en').slice(0, 2).toLowerCase();
    return valid(nav) ? nav : 'en';
}

let lang = initial();
const subs = new Set();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export function getLang() {
    return lang;
}

export function setLang(next) {
    if (!valid(next) || next === lang) return;
    lang = next;
    try {
        localStorage.setItem(STORE_KEY, next);
    } catch {
    }
    document.documentElement.lang = next;
    subs.forEach((f) => f());
}

/** Pick up a language chosen in another window (the tray menu and the
 *  app share this origin's storage). */
export function syncLang() {
    try {
        const v = localStorage.getItem(STORE_KEY);
        if (valid(v) && v !== lang) {
            lang = v;
            document.documentElement.lang = v;
            subs.forEach((f) => f());
        }
    } catch {
    }
}
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) syncLang(); });

/** Translate `text` (the English source) into the current language.
 *  `{name}` placeholders are filled from `vars`. Works outside React too
 *  (toasts from the socket), reading the language at call time. A
 *  `|context` suffix (`'Ready|count'`) keeps one English word apart when
 *  other languages need two; it is dropped from the English fallback. */
export function t(text, vars) {
    let out = (lang !== 'en' && dicts[lang]?.[text]) || text.replace(/\|\w+$/, '');
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return out;
}

function subscribe(cb) {
    subs.add(cb);
    return () => subs.delete(cb);
}

/** The current language; re-renders the caller when it changes. */
export function useLang() {
    return useSyncExternalStore(subscribe, getLang, getLang);
}

/** `t`, plus a re-render when the language changes. Call it in every
 *  component that renders text. */
export function useT() {
    useLang();
    return t;
}
