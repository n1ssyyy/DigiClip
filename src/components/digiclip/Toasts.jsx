import { useEffect, useRef } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

const ICONS = {
    success: { Icon: CheckCircle2, cls: 'text-[var(--viral)]' },
    error: { Icon: XCircle, cls: 'text-destructive' },
    info: { Icon: Info, cls: 'text-muted-foreground' },
};

/**
 * Background-task toasts, bottom-right. Same voice as the rest of the
 * room: popover surface, hairline border, JetBrains Mono, one status
 * glyph, plain-verb copy. Auto-dismiss in 5s, pausing while hovered or
 * keyboard-focused; reduced motion gets instant cuts (via .rise).
 */
export function Toast({ toast, onDismiss }) {
    const { Icon, cls } = ICONS[toast.type] ?? ICONS.info;
    const timer = useRef(null);

    const clear = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    };
    const arm = () => {
        clear();
        timer.current = setTimeout(() => onDismiss(toast.id), 5000);
    };

    useEffect(() => {
        arm();
        return clear;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toast.id]);

    return (
        <div
            role="status"
            onMouseEnter={clear}
            onMouseLeave={arm}
            onFocus={clear}
            onBlur={arm}
            className="rise pointer-events-auto flex w-80 items-start gap-3 rounded-md border bg-popover p-3 text-popover-foreground shadow-xl"
        >
            <Icon className={cn('mt-0.5 size-4 shrink-0', cls)} aria-hidden />
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{toast.title}</p>
                {toast.body && <p className="mt-0.5 text-[11px] text-muted-foreground">{toast.body}</p>}
            </div>
            <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label={`Dismiss: ${toast.title}`}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
                <X className="size-3.5" aria-hidden />
            </button>
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
