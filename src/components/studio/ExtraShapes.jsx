import { ASPECT_OPTS } from '../digiclip/fields';
import Tip from '../digiclip/Tooltip';
import { mainShape, toggleExtra, extraShapes } from '../../lib/shapes';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';

/**
 * "Also make": the shapes besides the main one that the same run makes each
 * clip in. The main shape is the stage's (the switch in the top bar), so it
 * is not offered here; picking it there moves it out of this list.
 */
export default function ExtraShapes({ aspect, onChange }) {
    const t = useT();
    const main = mainShape(aspect);
    const on = extraShapes(aspect);
    return (
        <div
            role="group"
            aria-label={t('Also make')}
            className="flex h-8 w-full overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)]"
        >
            {ASPECT_OPTS.filter((o) => o.id !== main).map((o) => {
                const pressed = on.includes(o.id);
                return (
                    <Tip key={o.id} label={t(o.tip)} side="top" className="flex min-w-0 flex-1">
                        <button
                            type="button"
                            aria-pressed={pressed}
                            onClick={() => onChange(toggleExtra(aspect, o.id))}
                            className={cn(
                                'flex min-w-0 flex-1 items-center justify-center text-[11px] outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                                pressed ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground',
                            )}
                        >
                            {o.label}
                        </button>
                    </Tip>
                );
            })}
        </div>
    );
}
