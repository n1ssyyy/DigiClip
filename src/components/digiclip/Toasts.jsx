import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

const ICONS = {
    success: { Icon: CheckCircle2, cls: 'text-[var(--viral)]' },
    error: { Icon: XCircle, cls: 'text-destructive' },
    info: { Icon: Info, cls: 'text-muted-foreground' },
};

const LIFE_MS = 5000;
const EXIT_MS = 220;

/**
 * Background-task toasts, bottom-right. Same voice as the rest of the
 * room: popover surface, hairline border, JetBrains Mono, one status
 * glyph, plain-verb copy. Each springs up from below, shows a thin line
 * of the time it has left, and slides out and fades when it goes.
 * Auto-dismiss in 5s, pausing (line included) while hovered or
 * keyboard-focused; reduced motion gets instant cuts and no line.
 */
export function Toast({ toast, onDismiss }) {
    const { Icon, cls } = ICONS[toast.type] ?? ICONS.info;
    const timer = useRef(null);
    const [leaving, setLeaving] = useState(false);
    const [paused, setPaused] = useState(false);
    const [round, setRound] = useState(0);
    const t = useT();

    const clear = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    };
    const dismiss = () => {
        clear();
        setLeaving(true);
        timer.current = setTimeout(() => onDismiss(toast.id), EXIT_MS);
    };
    const arm = () => {
        clear();
        setPaused(false);
        setRound((n) => n + 1);
        timer.current = setTimeout(dismiss, LIFE_MS);
    };
    const hold = () => {
        if (leaving) return;
        clear();
        setPaused(true);
    };

    useEffect(() => {
        arm();
        return clear;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toast.id]);

    return (
        <div
            role="status"
            onMouseEnter={hold}
            onMouseLeave={() => !leaving && arm()}
            onFocus={hold}
            onBlur={() => !leaving && arm()}
            className={cn(
                'pointer-events-auto relative flex w-80 items-start gap-3 overflow-hidden rounded-md border bg-popover p-3 text-popover-foreground shadow-xl',
                leaving ? 'toast-out' : 'toast-in',
            )}
        >
            <Icon className={cn('mt-0.5 size-4 shrink-0', cls)} aria-hidden />
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{toast.title}</p>
                {toast.body && <p className="mt-0.5 text-[11px] text-muted-foreground">{toast.body}</p>}
            </div>
            <button
                type="button"
                onClick={dismiss}
                aria-label={t('Dismiss: {title}', { title: toast.title })}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
                <X className="size-3.5" aria-hidden />
            </button>
            <span
                key={round}
                aria-hidden
                data-paused={paused}
                className="life-line absolute inset-x-0 bottom-0 h-px origin-left bg-foreground/30"
                style={{ animationDuration: `${LIFE_MS}ms` }}
            />
        </div>
    );
}

export default function Toasts({ toasts, onDismiss }) {
    if (toasts.length === 0) return null;

    return (
        <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[200] flex flex-col gap-2">
            {toasts.map((t) => (
                <Toast key={t.id} toast={t} onDismiss={onDismiss} />
            ))}
        </div>
    );
}
