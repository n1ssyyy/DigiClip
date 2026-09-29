import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useT } from '../../lib/i18n';

/** Overlay + box in the same language as the cancel dialog (overlay
 *  fade/fade-out, box pop/pop-out, pinned below the title bar and
 *  centered in the page). The parent's ExitBeat holds it for `leaving`.
 *  Portalled to <body>: a parent with a backdrop blur (the title bar)
 *  would otherwise pin the "fixed" overlay to itself. */
export default function Modal({ title, sub, width = 560, onClose, leaving, children, footer, labelId = 'modal-title' }) {
    const t = useT();
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return createPortal(
        <div
            className={cn('fixed inset-x-0 bottom-0 top-[var(--chrome)] z-50 flex items-center justify-center bg-black/60 p-4 pl-[calc(var(--chrome)_+_1rem)] backdrop-blur-sm', leaving ? 'fade-out' : 'fade')}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelId}
                style={{ width: `min(${width}px, 100%)` }}
                className={cn(
                    'flex max-h-[calc(100dvh-var(--chrome)-2rem)] flex-col rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] shadow-2xl',
                    leaving ? 'pop-out' : 'pop',
                )}
            >
                <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                    <h2 id={labelId} className="min-w-0 flex-1 truncate text-[13px] font-semibold">{title}</h2>
                    {sub && <p className="shrink-0 font-mono text-[10px] text-muted-foreground">{sub}</p>}
                    <button
                        type="button" aria-label={t('Close')}
                        onClick={onClose}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="size-4" aria-hidden />
                    </button>
                </div>
                <div className="digi-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-3">{children}</div>
                {footer && <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}

/** `m:ss.s` for editors (tenths matter when trimming a word edge). */
export function fmtTime(s) {
    if (!Number.isFinite(s)) return '–';
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}

/** Parse `m:ss.s`, `ss.s` or `h:mm:ss`; null when unreadable. */
export function parseTime(text) {
    const parts = String(text).trim().split(':').map((p) => p.trim());
    if (parts.length === 0 || parts.length > 3 || parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null;
    return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
}
