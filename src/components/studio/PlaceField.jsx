import { Slider } from '../digiclip/controls';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import Field from './Field';

// Quick-place points: left/middle/right by top/middle/bottom thirds.
const GRID_X = [0.28, 0.5, 0.72];
const GRID_Y = [0.14, 0.5, 0.82];

const near = (a, b) => Math.abs(a - b) < 0.02;
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * The Position field shared by the layers that can be placed freely: X and
 * Y sliders (dimmed until a position is set) and, optionally, the nine-point
 * quick-place grid. `center` is where the layer is now (fractions of the
 * frame); `placed` says the Look sets it. Moving one axis pins both, so the
 * other stays where it is shown.
 */
export default function PlaceField({ center, placed, onPlace, onReset, grid = true, disabled = false, hint, onDragStart, onDragEnd }) {
    const t = useT();
    const places = [
        [t('Top left'), t('Top centre'), t('Top right')],
        [t('Middle left'), t('Centre'), t('Middle right')],
        [t('Bottom left'), t('Bottom centre'), t('Bottom right')],
    ];
    const moveTo = (x, y) => onPlace(r3(x), r3(y));
    return (
        <Field label={t('Position')} set={placed} onReset={onReset} hint={hint}>
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 shrink-0 font-mono text-[10px] text-muted-foreground" aria-hidden>X</span>
                        <Slider
                            label={t('Horizontal position')}
                            value={Math.round(center.x * 100)}
                            min={0}
                            max={100}
                            step={1}
                            bigStep={10}
                            format={(v) => `${Math.round(v)}%`}
                            dim={!placed}
                            disabled={disabled}
                            onReset={onReset}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            onChange={(v) => moveTo(v / 100, center.y)}
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 shrink-0 font-mono text-[10px] text-muted-foreground" aria-hidden>Y</span>
                        <Slider
                            label={t('Vertical position')}
                            value={Math.round(center.y * 100)}
                            min={0}
                            max={100}
                            step={1}
                            bigStep={10}
                            format={(v) => `${Math.round(v)}%`}
                            dim={!placed}
                            disabled={disabled}
                            onReset={onReset}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            onChange={(v) => moveTo(center.x, v / 100)}
                        />
                    </div>
                </div>
                {grid && (
                    <div role="group" aria-label={t('Quick place')} className="grid size-[72px] shrink-0 grid-cols-3 grid-rows-3 gap-px overflow-hidden rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-white/[0.06]">
                        {GRID_Y.flatMap((gy) => GRID_X.map((gx) => {
                            const on = placed && near(center.x, gx) && near(center.y, gy);
                            const name = places[GRID_Y.indexOf(gy)][GRID_X.indexOf(gx)];
                            return (
                                <button
                                    key={`${gx}-${gy}`}
                                    type="button"
                                    aria-label={name}
                                    aria-pressed={on}
                                    onClick={() => moveTo(gx, gy)}
                                    className="group/q flex items-center justify-center bg-[color-mix(in_srgb,var(--card)_78%,black)] outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                                >
                                    <span className={cn('size-1.5 rounded-full transition-[background-color,scale] duration-150', on ? 'scale-125 bg-foreground' : 'bg-muted-foreground/60 group-hover/q:bg-foreground')} />
                                </button>
                            );
                        }))}
                    </div>
                )}
            </div>
        </Field>
    );
}
