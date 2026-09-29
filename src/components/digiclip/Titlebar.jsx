import { useCallback, useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dragWindow, isTauri, onMaximized, queryMaximized, sendWindowAction, setCloseToTray, shellPrefs } from '../../lib/native';
import { useT } from '../../lib/i18n';
import { Button } from '../ui/button';
import BrandMark from './BrandMark';
import Modal from './Modal';
import Tip from './Tooltip';

const noDrag = { WebkitAppRegion: 'no-drag' };

const btn = cn(
    'win-btn flex size-8 items-center justify-center rounded-md text-muted-foreground',
    'transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-90',
    'focus-visible:outline-2 focus-visible:outline-ring',
);

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

/** Window maximized state, kept in sync with OS shortcuts and snapping,
 *  plus the toggle. Also squares the shell's rounded corners when
 *  maximized so the window runs edge to edge. */
export function useMaximized() {
    const [maximized, setMaximized] = useState(false);
    useEffect(() => {
        if (!isTauri()) return undefined;
        let off = null;
        queryMaximized().then(setMaximized).catch(() => {});
        onMaximized(setMaximized).then((f) => { off = f; }).catch(() => {});
        return () => { off?.(); };
    }, []);
    useEffect(() => {
        document.documentElement.classList.toggle('window-maximized', maximized);
    }, [maximized]);
    const toggle = useCallback(() => {
        queryMaximized().then((maxed) => {
            sendWindowAction(maxed ? 'unmaximize' : 'maximize');
            setMaximized(!maxed);
        });
    }, []);
    return [maximized, toggle];
}

/** Right-side min / max-restore / close for the frameless window. Only
 *  inside the Tauri shell; plain browser dev has its own chrome. */
export default function WindowControls({ maximized, onToggleMaximize }) {
    const t = useT();
    const [hint, setHint] = useState(false);
    if (!isTauri()) return null;

    function close() {
        shellPrefs().then((p) => {
            if (p?.tray && p.close_to_tray && !p.tray_hint_seen) setHint(true);
            else sendWindowAction('close');
        }).catch(() => sendWindowAction('close'));
    }

    return (
        <div className="flex h-[var(--chrome)] items-center gap-1 pr-1" data-tauri-drag-region="false" data-no-drag style={noDrag}>
            <Tip label={t('Minimize')} side="bottom">
                <button type="button" aria-label={t('Minimize')} className={cn(btn, 'win-min')} onClick={() => sendWindowAction('minimize')}>
                    <Minus className="size-4" aria-hidden />
                </button>
            </Tip>
            <Tip label={maximized ? t('Restore') : t('Maximize')} side="bottom">
                <button type="button" aria-label={maximized ? t('Restore') : t('Maximize')} className={cn(btn, 'win-max')} onClick={onToggleMaximize}>
                    <span key={maximized ? 'r' : 'm'} className="swap-in flex">
                        {maximized ? <Copy className="size-3.5" aria-hidden /> : <Square className="size-3.5" aria-hidden />}
                    </span>
                </button>
            </Tip>
            <Tip label={t('Close')} side="bottom">
                <button
                    type="button"
                    aria-label={t('Close')}
                    className={cn(btn, 'win-close hover:bg-destructive hover:text-destructive-foreground')}
                    onClick={close}
                >
                    <X className="size-4" aria-hidden />
                </button>
            </Tip>
            {hint && <TrayHint onClose={() => setHint(false)} />}
        </div>
    );
}

/**
 * The window's title bar: drag region, double-click to maximize, the
 * brand on the left and the window controls on the right. Shared by the
 * boot splash and the app, so the window can always be moved and closed,
 * even while the engine is still starting. `center` floats in the middle,
 * `actions` sit just left of the window controls.
 */
export function ChromeBar({ onBrand, center, actions, className }) {
    const [maximized, toggleMaximize] = useMaximized();
    const t = useT();
    const interactive = (e) => e.target.closest('button, a, input, [data-no-drag]');
    return (
        <header
            className={cn('sticky top-0 z-10 flex h-[var(--chrome)] shrink-0 items-stretch bg-background/95 pr-0 pl-3 backdrop-blur select-none', className)}
            data-tauri-drag-region
            onMouseDown={(e) => {
                // The attribute above is the native path; the shell drag
                // is the fallback that always works.
                if (!isTauri() || e.button !== 0 || interactive(e)) return;
                dragWindow();
            }}
            onDoubleClick={(e) => {
                if (!isTauri() || interactive(e)) return;
                toggleMaximize();
            }}
        >
            <button
                type="button"
                onClick={onBrand}
                disabled={!onBrand}
                aria-label={onBrand ? t('Home') : undefined}
                data-tauri-drag-region="false"
                data-no-drag
                style={noDrag}
                className="brand-hover group my-auto flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-transparent px-1.5 text-[13px] font-semibold tracking-tight transition-colors hover:bg-accent/60 disabled:cursor-default disabled:hover:bg-transparent"
            >
                <BrandMark className="size-4" />
                <span className="brand-word">DigiClip</span>
            </button>
            <div className="flex-1" aria-hidden />
            {center}
            {actions}
            <WindowControls maximized={maximized} onToggleMaximize={toggleMaximize} />
        </header>
    );
}
