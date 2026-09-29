import { Copy, Minus, Square, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { isTauri, sendWindowAction } from '../../lib/native';
import { useT } from '../../lib/i18n';
import Tip from './Tooltip';

const btn = cn(
    'flex size-8 items-center justify-center rounded-md text-muted-foreground',
    'transition-colors hover:bg-accent hover:text-foreground',
    'focus-visible:outline-2 focus-visible:outline-ring',
);

/**
 * Right-side min / max-restore / close buttons for the frameless window.
 * Rendered only inside the Tauri shell; hidden in plain browser dev.
 */
export default function WindowControls({ maximized, onToggleMaximize }) {
    const t = useT();
    if (!isTauri()) return null;

    return (
        <div className="flex h-[var(--chrome)] items-center gap-1 pr-1" data-tauri-drag-region="false" style={{ WebkitAppRegion: 'no-drag' }}>
            <Tip label={t('Minimize')} side="bottom">
                <button
                    type="button"
                    aria-label={t('Minimize')}
                    className={btn}
                    onClick={() => sendWindowAction('minimize')}
                >
                    <Minus className="size-4" aria-hidden />
                </button>
            </Tip>
            <Tip label={maximized ? t('Restore') : t('Maximize')} side="bottom">
                <button
                    type="button"
                    aria-label={maximized ? t('Restore') : t('Maximize')}
                    className={btn}
                    onClick={onToggleMaximize}
                >
                    {maximized ? <Copy className="size-3.5" aria-hidden /> : <Square className="size-3.5" aria-hidden />}
                </button>
            </Tip>
            <Tip label={t('Close')} side="bottom">
                <button
                    type="button"
                    aria-label={t('Close')}
                    className={cn(btn, 'hover:bg-destructive hover:text-destructive-foreground')}
                    onClick={() => sendWindowAction('close')}
                >
                    <X className="size-4" aria-hidden />
                </button>
            </Tip>
        </div>
    );
}
