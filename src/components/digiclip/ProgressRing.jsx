import { cn } from '../../lib/utils';

/**
 * Hollow circle that fills with progress — the download affordance for
 * transcription models. Track is the hairline border token, the fill is
 * foreground; a screen-reader percent backs it (never color alone).
 */
export default function ProgressRing({ value = 0, size = 16, label = 'Downloading', className }) {
    const pct = Math.min(100, Math.max(0, Math.round(value ?? 0)));
    const stroke = 2;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;

    return (
        <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`${label} ${pct}%`}
            className={cn('inline-flex shrink-0', className)}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - pct / 100)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-300 motion-safe:ease-out"
                />
            </svg>
            <span className="sr-only">{pct}%</span>
        </span>
    );
}
