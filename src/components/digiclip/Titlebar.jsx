import { useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { isTauri, sendWindowAction, setCloseToTray, shellPrefs } from '../../lib/native';
import { useT } from '../../lib/i18n';
import { Button } from '../ui/button';
import Modal from './Modal';
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
/** First close, once: closing now keeps DigiClip in the tray. Say so,
 *  and let the user pick quitting instead (Settings can flip it later). */
function TrayHint({ onClose }) {
    const t = useT();
    function pick(keep) {
        setCloseToTray(keep).catch(() => {}).finally(() => {
            onClose();
            sendWindowAction('close');
        });
    }
    return (
        <Modal
            title={t('Keep DigiClip running?')}
            width={420}
            onClose={onClose}
            labelId="tray-hint-title"
            footer={(
                <>
                    <Button type="button" variant="secondary" size="sm" onClick={() => pick(false)}>{t('Quit when closed')}</Button>
                    <Button type="button" size="sm" onClick={() => pick(true)}>{t('Keep in tray')}</Button>
                </>
            )}
        >
            <p className="text-[12px] text-muted-foreground">
                {t('Closing the window keeps DigiClip in the tray, so running jobs and the watch folder keep going. Right-click the tray icon for the menu and Quit.')}
            </p>
        </Modal>
    );
}

export default function WindowControls({ maximized, onToggleMaximize }) {
    const t = useT();
    const [hint, setHint] = useState(false);
    if (!isTauri()) return null;

    function close() {
        shellPrefs().then((p) => {
            if (p?.tray && p.close_to_tray && !p.tray_hint_seen) setHint(true);
            else sendWindowAction('close');
        });
    }

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
                    onClick={close}
                >
                    <X className="size-4" aria-hidden />
                </button>
            </Tip>
            {hint && <TrayHint onClose={() => setHint(false)} />}
        </div>
    );
}
