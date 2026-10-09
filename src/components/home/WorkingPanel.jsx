import { RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { retryJob } from '../../lib/socket';
import { STEPS, stageText, stepOf } from '../../lib/homeList';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

/** Four steps joined by bars: done ones lit, the live one pulsing. */
function Steps({ active }) {
    const t = useT();
    return (
        <ol className="grid w-full grid-cols-4 gap-1.5" aria-label={t('Step {n} of {total}', { n: active + 1, total: STEPS.length })}>
            {STEPS.map((s, i) => (
                <li key={s} className="min-w-0">
                    <span className="block h-1 overflow-hidden rounded-full bg-border">
                        <span
                            className={cn(
                                'block h-full rounded-full bg-orange-500 motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out',
                                i < active ? 'scale-x-100' : i === active ? 'animate-pulse scale-x-100' : 'scale-x-0',
                            )}
                            style={{ transformOrigin: 'left' }}
                        />
                    </span>
                    <span className={cn('mt-1.5 block font-mono text-[10px]', i <= active ? 'text-foreground' : 'text-muted-foreground')}>{t(s)}</span>
                </li>
            ))}
        </ol>
    );
}

/** What stands in for the clips while a video has none: for one being worked
 *  on, the step it is at in plain words with a cancel button; for one that
 *  failed or was cancelled, why, with retry and remove. When it finishes the
 *  clips take this place. */
export default function WorkingPanel({ job, phase, onRemove }) {
    const t = useT();
    const failed = phase === 'failed';
    const stopped = failed || phase === 'cancelled';
    const stage = stageText(job.status, t);

    return (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
            <div className="fade flex w-[min(380px,100%)] flex-col items-center gap-4 text-center" role="status" aria-live="polite">
                {stopped ? (
                    <>
                        <div>
                            <p className={cn('text-[13px] font-semibold', failed && 'text-red-500')}>
                                {failed ? t('This video didn\'t finish') : t('Cancelled')}
                            </p>
                            {failed && job.error && (
                                <p className="digi-scroll mt-1.5 max-h-24 overflow-y-auto font-mono text-[11px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{job.error}</p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => retryJob(job.id)}>
                                <RotateCcw aria-hidden /> {t('Retry')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={onRemove}>
                                <Trash2 aria-hidden /> {t('Remove')}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <p className="text-[13px] font-semibold">{stage.title}</p>
                            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{stage.hint}</p>
                        </div>
                        <Steps active={stepOf(job.status)} />
                        <Button size="sm" variant="outline" onClick={onRemove}>
                            <X aria-hidden /> {t('Cancel and remove')}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
