import { useMemo } from 'react';
import { Pause, Play } from 'lucide-react';
import { Card } from '../ui/card';
import Tip from '../digiclip/Tooltip';
import { GpuToggle, Slider } from '../digiclip/controls';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { useClock } from './usePlayer';

/** `0:03.2` */
export function fmtTime(s) {
    const n = Math.max(0, s);
    const m = Math.floor(n / 60);
    const r = n - m * 60;
    return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}

/** `0:12` */
const fmtLength = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function Switch({ checked, onChange, label }) {
    return (
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground select-none">
            <GpuToggle checked={checked} disabled={false} onChange={onChange} label={label} />
            <span className="hidden whitespace-nowrap min-[900px]:inline">{label}</span>
        </label>
    );
}

/** The scrubber's playhead readout and slider: its own component so only
 *  this part re-renders on every frame. */
function Playhead({ clock, len, words, seek }) {
    const t = useT();
    const time = useClock(clock);
    const marks = useMemo(() => words.map((w) => w.s / len), [words, len]);
    return (
        <>
            <span className="w-28 shrink-0 font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums" aria-hidden>
                <span className="text-foreground">{fmtTime(time)}</span> / {fmtLength(len)}
            </span>
            <Slider
                label={t('Position in the sample')}
                value={time}
                min={0}
                max={len}
                step={0.01}
                bigStep={1}
                marks={marks}
                format={fmtTime}
                showValue={false}
                onChange={seek}
                className="min-w-0 flex-1"
            />
        </>
    );
}

/** Play/pause, the scrubber (ticks at each word start), loop and safe
 *  areas. */
export default function Transport({ player, len, words, loop, onLoop, safe, onSafe }) {
    const t = useT();
    const label = player.playing ? t('Pause') : t('Play');
    return (
        <Card className="stagger-3 shrink-0">
            <div className="flex h-10 items-center gap-3 px-3">
                <Tip label={`${label} · ${t('Space')}`} side="top">
                    <button
                        type="button"
                        aria-label={label}
                        onClick={player.toggle}
                        className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-90',
                        )}
                    >
                        {player.playing ? <Pause className="size-3.5 fill-current" aria-hidden /> : <Play className="size-3.5 fill-current" aria-hidden />}
                    </button>
                </Tip>
                <Playhead clock={player.clock} len={len} words={words} seek={player.seek} />
                <Switch checked={safe} onChange={onSafe} label={t('Safe areas')} />
                <Switch checked={loop} onChange={onLoop} label={t('Loop')} />
            </div>
        </Card>
    );
}
