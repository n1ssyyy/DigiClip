// The one-line live summaries the Layers list shows for Camera, Layout and
// Effects. `t` translates (the English words are the keys). Pure.
import { cleanCamera, cleanEffects, cleanLayout, SPLIT_EVEN } from './sceneFields.js';

export const FEEL_LABEL = { locked: 'Locked', steady: 'Steady', smooth: 'Smooth', lively: 'Lively' };
export const LAYOUT_LABEL = { single: 'Single', split: 'Split', auto: 'Auto' };
export const GRADE_LABEL = { none: 'None', warm: 'Warm', cool: 'Cool', mono: 'Mono', punchy: 'Punchy' };

const pct = (v) => Math.round(v * 100);

/** `Smooth · 100%`, `Split · 60%`, `Warm · Vignette 40%`. Camera shows the
 *  feel and zoom, layout the choice and (when it splits) the seam, effects
 *  what is on. */
export function sceneSummary(id, o, t) {
    const L = o.look ?? {};
    switch (id) {
        case 'camera': {
            const c = cleanCamera(L.camera);
            return `${t(FEEL_LABEL[c.feel ?? 'smooth'])} · ${pct(c.zoom ?? 1)}%`;
        }
        case 'layout': {
            const name = t(LAYOUT_LABEL[o.layout] ?? 'Single');
            if (!o.layout || o.layout === 'single') return name;
            return `${name} · ${pct(cleanLayout(L.layout).split ?? SPLIT_EVEN)}%`;
        }
        case 'effects': {
            const e = cleanEffects(L.effects);
            const parts = [];
            if (e.grade && e.grade !== 'none') parts.push(t(GRADE_LABEL[e.grade]));
            if (e.vignette > 0) parts.push(t('Vignette {n}%', { n: pct(e.vignette) }));
            if (e.fill_dim !== undefined) parts.push(t('Fill {n}%', { n: pct(e.fill_dim) }));
            return parts.length ? parts.join(' · ') : t('None');
        }
        default: return '';
    }
}
