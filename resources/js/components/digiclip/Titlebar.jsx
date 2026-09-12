import { Copy, Minus, Square, X } from 'lucide-react';
import { cn } from '../../lib/utils';

/** True when rendered inside the NativePHP Electron shell. */
export function isNativeWindow() {
    if (typeof window === 'undefined') return false;
    return window.Native !== undefined || navigator.userAgent.includes('Electron');
}

function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
}

/** Drive the Electron window via the backend (see WindowController). */
export async function sendWindowAction(action) {
    try {
        await fetch(`/native/window/${action}`, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': csrfToken(),
                'X-Requested-With': 'XMLHttpRequest',
                Accept: 'application/json',
            },
        });
    } catch {
        // Plain browser dev with no backend — window controls are inert.
    }
}

const btn = cn(
    'flex size-10 items-center justify-center rounded-md text-muted-foreground',
    'transition-colors hover:bg-accent hover:text-foreground',
    'focus-visible:outline-2 focus-visible:outline-ring',
);

/**
 * Right-side min / max-restore / close buttons for the frameless window.
 * Rendered only inside the native shell; hidden in plain browser dev.
 */
export default function WindowControls({ maximized, onToggleMaximize }) {
    if (!isNativeWindow()) return null;

    return (
        <div className="flex h-[53px] items-center gap-2 pr-2" style={{ WebkitAppRegion: 'no-drag' }}>
            <button
                type="button"
                aria-label="Minimize"
                title="Minimize"
                className={btn}
                onClick={() => sendWindowAction('minimize')}
            >
                <Minus className="size-4" aria-hidden />
            </button>
            <button
                type="button"
                aria-label={maximized ? 'Restore' : 'Maximize'}
                title={maximized ? 'Restore' : 'Maximize'}
                className={btn}
                onClick={onToggleMaximize}
            >
                {maximized ? <Copy className="size-3.5" aria-hidden /> : <Square className="size-3.5" aria-hidden />}
            </button>
            <button
                type="button"
                aria-label="Close"
                title="Close"
                className={cn(btn, 'hover:bg-destructive hover:text-destructive-foreground')}
                onClick={() => sendWindowAction('close')}
            >
                <X className="size-4" aria-hidden />
            </button>
        </div>
    );
}
