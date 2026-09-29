import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

const DIMS = [
    { key: 'hook', label: 'Hook', tip: 'How hard the opening grabs.' },
    { key: 'retention', label: 'Retention', tip: 'Stands alone and lands a finished thought.' },
    { key: 'value', label: 'Value', tip: 'Payoff for the viewer.' },
    { key: 'share', label: 'Share', tip: 'Pull to send it to someone.' },
];

/** Per-dimension scores on one 0–100 scale. LLM picks score 1–10;
 *  System One judges (Jev, Laya) and blends already write 0–100. */
export function normScores(clip) {
    const s = clip?.scores;
    if (!s) return null;
    const vals = DIMS.map((d) => +s[d.key] || 0);
    const judged = /(^|\+)(jev|laya)\b/.test(clip.source ?? '');
    const scale = !judged && Math.max(...vals) <= 10 ? 10 : 1;
    const out = {};
    DIMS.forEach((d, i) => { out[d.key] = Math.max(0, Math.min(100, Math.round(vals[i] * scale))); });
    return out;
}

/** One number for a tile badge: the mean of the four dimensions. */
export function overall(clip) {
    const n = normScores(clip);
    if (!n) return null;
    return Math.round(DIMS.reduce((a, d) => a + n[d.key], 0) / DIMS.length);
}

export function scoreTone(v) {
    if (v >= 70) return 'bg-emerald-500';
    if (v >= 45) return 'bg-orange-500';
    return 'bg-red-500';
}

/** Who picked the clip, in words. */
function pickedBy(source, t) {
    if (!source) return null;
    const parts = source.split('+');
    const names = parts.map((p) => {
        if (p.startsWith('llm:')) return p.slice(4).split('/').pop();
        if (p.startsWith('jev:')) return 'Jev';
        if (p === 'laya') return 'Laya';
        if (p === 'heuristic') return t('offline scorer');
        if (p === 'custom') return t('you');
        return p;
    });
    return names.join(' + ');
}

/** "Why this clip": score bars, the picker's reasoning, hashtags. */
export default function ClipInsights({ clip, className }) {
    const t = useT();
    const n = normScores(clip);
    const by = pickedBy(clip.source, t);
    // The judge's name already sits in the footer.
    const why = (clip.why ?? '').replace(/\s*Judged by [^.]+\.?\s*$/, '');
    return (
        <div className={cn('space-y-3 text-[12px]', className)}>
            {n ? (
                <div className="space-y-1.5" aria-label={t('Virality scores')}>
                    {DIMS.map((d) => (
                        <div key={d.key} title={t(d.tip)} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-2">
                            <span className="text-muted-foreground">{t(d.label)}</span>
                            <span className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                <span
                                    className={cn('block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500', scoreTone(n[d.key]))}
                                    style={{ width: `${n[d.key]}%` }}
                                />
                            </span>
                            <span className="text-right font-mono text-[11px] tabular-nums">{n[d.key]}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-muted-foreground">{t('No scores for this clip.')}</p>
            )}
            {why && (
                <div className="space-y-1">
                    <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{t('Why this clip')}</p>
                    <p className="leading-relaxed">{why}</p>
                </div>
            )}
            {clip.hashtags?.length > 0 && (
                <p className="flex flex-wrap gap-1">
                    {clip.hashtags.map((h) => (
                        <span key={h} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">
                            {h.startsWith('#') ? h : `#${h}`}
                        </span>
                    ))}
                </p>
            )}
            {by && <p className="font-mono text-[10px] text-muted-foreground">{t('Picked by {by}', { by })}</p>}
        </div>
    );
}
