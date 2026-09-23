import { clsx } from 'clsx';

/** Primary/ghost buttons in the room's voice (white primary, hairlines). */
export function Button({ variant = 'default', size = 'md', className, ...props }) {
    return (
        <button
            type="button"
            className={clsx(
                'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md text-[13px] font-medium outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring',
                size === 'sm' ? 'h-8 px-3' : 'h-10 px-5',
                variant === 'default' && 'bg-primary text-primary-foreground hover:bg-primary/90',
                variant === 'secondary' && 'border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] hover:bg-accent',
                variant === 'ghost' && 'text-muted-foreground hover:bg-accent hover:text-foreground',
                variant === 'danger' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                className,
            )}
            {...props}
        />
    );
}

/** Hollow progress ring — the download affordance, same as the main app. */
export function ProgressRing({ value = 0, size = 40, label = 'Progress' }) {
    const pct = Math.min(100, Math.max(0, Math.round(value ?? 0)));
    const stroke = 3;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;

    return (
        <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`${label} ${pct}%`}
            className="inline-flex shrink-0"
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
