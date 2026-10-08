import { RotateCcw } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import { Kicker } from '../digiclip/JobOptions';
import { useT } from '../../lib/i18n';

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
                {set && onReset && (
                    <Tip label={t('Back to the style’s own value')} side="left">
                        <button
                            type="button"
                            aria-label={t('Reset {name}', { name: label })}
                            onClick={onReset}
                            className="fade -mr-1 flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <RotateCcw className="size-3" aria-hidden />
                        </button>
                    </Tip>
                )}
            </div>
            {children}
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    );
}
