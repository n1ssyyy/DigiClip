import { RotateCcw } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import { Kicker } from '../digiclip/fields';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';

/** The small "back to the style's own value" button of a control. */
export function ResetBtn({ label, tip, onClick, className }) {
    const t = useT();
    return (
        <Tip label={tip ?? t('Back to the style’s own value')} side="left">
            <button
                type="button"
                aria-label={t('Reset {name}', { name: label })}
                onClick={onClick}
                className={cn('fade flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', className)}
            >
                <RotateCcw className="size-3" aria-hidden />
            </button>
        </Tip>
    );
}

/**
 * A labelled inspector control. `set` says the Look overrides the style's
 * own value; only then does the small reset appear, so an untouched control
 * reads as "the style's default" and a touched one can be put back.
 */
export default function Field({ label, set = false, onReset, hint, children }) {
    const t = useT();
    return (
        <div className="space-y-1.5">
            <div className="flex h-5 items-center justify-between">
                <Kicker>{label}</Kicker>
                {set && onReset && <ResetBtn label={label} onClick={onReset} className="-mr-1" />}
            </div>
            {children}
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    );
}

/** The full-width "reset this layer" button at the foot of a panel. */
export function ResetButton({ disabled, onClick, children }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="h-8 w-full rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] text-[12px] transition-[background-color,opacity] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[color-mix(in_srgb,var(--card)_78%,black)]"
        >
            {children}
        </button>
    );
}
