import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePanelBeat } from './usePanelBeat';
import { useFloatingPanel } from './useFloatingPanel';

export const CAPTION_STYLES = ['tiktok', 'karaoke', 'hormozi', 'minimal', 'beast', 'neon', 'highlight', 'ghost'];

// ASS &HAABBGGRR → CSS hex (alpha dropped; boxes use the solid tone).
const ass = (c) => `#${c.slice(8, 10)}${c.slice(6, 8)}${c.slice(4, 6)}`;

// Approximate each burned-in preset for the dropdown preview: face,
// case, upcoming base (ASS secondary) + sung sweep (ASS primary),
// outline, optional opaque box.
const PREVIEWS = {
    tiktok: { font: "'Archivo Black', sans-serif", caps: true, color: ass('&H00FFFFFF'), active: ass('&H00FFFFFF'), chroma: true, box: null },
    karaoke: { font: "'Archivo Black', sans-serif", caps: true, color: ass('&H00FFFFFF'), active: ass('&H0035E1FF'), edge: '#000', box: null },
    hormozi: { font: "'Anton', sans-serif", caps: true, color: ass('&H00FFFFFF'), active: ass('&H00FFFFFF'), edge: null, box: ass('&H00000000') },
    minimal: { font: "'Inter', sans-serif", caps: false, color: ass('&H00FFFFFF'), active: ass('&H00FFFFFF'), edge: null, box: null, soft: true },
    beast: { font: "'Archivo Black', sans-serif", caps: true, color: ass('&H00FFFFFF'), active: ass('&H0000FFFF'), edge: '#000', thick: true, box: null },
    neon: { font: "'Anton', sans-serif", caps: true, color: ass('&H00FFFFFF'), active: ass('&H00FFFF00'), edge: '#000', glow: ass('&H00FFFF00'), box: null },
    highlight: { font: "'Anton', sans-serif", caps: true, color: ass('&H00000000'), active: ass('&H00000000'), edge: null, box: ass('&H0035E6A3') },
    ghost: { font: "'Inter', sans-serif", caps: false, color: ass('&H00FFFFFF'), active: ass('&H00FFFFFF'), edge: null, box: null, soft: true, dim: true },
};

function previewStyle(p) {
    // TikTok chromatic aberration: cyan split left, magenta split right.
    if (p.chroma) {
        return {
            fontFamily: p.font,
            textTransform: 'uppercase',
            color: p.color,
            background: 'transparent',
            textShadow: '-2px 0 0 #25F4EE, 2px 0 0 #FE2C55',
        };
    }

    const edge = p.thick
        ? '-1.5px 0 0 #000, 1.5px 0 0 #000, 0 -1.5px 0 #000, 0 1.5px 0 #000, -1px -1px 0 #000, 1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000'
        : p.edge
            ? '-1px 0 0 #000, 1px 0 0 #000, 0 -1px 0 #000, 0 1px 0 #000'
            : null;
    const shadows = [
        edge,
        p.glow ? `0 0 8px ${p.glow}` : null,
        p.soft ? '0 1px 3px rgba(0,0,0,.8)' : null,
    ].filter(Boolean);
    return {
        fontFamily: p.font,
        textTransform: p.caps ? 'uppercase' : 'none',
        color: p.dim ? 'rgba(255,255,255,.75)' : p.color,
        background: p.box ?? 'transparent',
        textShadow: shadows.length ? shadows.join(', ') : 'none',
    };
}

const inputCls = 'flex h-9 w-full rounded-md border border-x-white/10 border-b-black/60 border-t-white/20 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-3 py-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Caption style picker, same trigger + popover language as ModelPicker,
 * minus the catalog machinery (fixed style set with live previews).
 */
export default function CaptionPicker({ value, onChange, compact = false }) {
    const [open, setOpen] = useState(false);
    const { show: panelShow, leaving: panelLeaving } = usePanelBeat(open);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const panelPos = useFloatingPanel(panelShow, rootRef);

    useEffect(() => {
        const onDown = (e) => {
            if (e.key === 'Escape') setOpen(false);
            if (rootRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onDown);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onDown);
        };
    }, []);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={cn(inputCls, 'cursor-pointer items-center justify-between text-left', compact && 'h-8')}
            >
                <span className="truncate font-mono text-xs">{value || 'Select a style…'}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>

            {panelShow && panelPos && createPortal(
                <div ref={panelRef} style={panelPos} className={cn('digi-menu fixed z-[100] rounded-md border bg-popover text-popover-foreground shadow-md', panelLeaving ? 'menu-out' : 'pop')}>
                    <ul role="listbox" aria-label="Caption styles" className="digi-scroll max-h-72 overflow-y-auto p-1">
                        {CAPTION_STYLES.map((s) => (
                            <li key={s} role="option" aria-selected={s === value}>
                                <button
                                    type="button"
                                    onClick={() => { onChange(s); setOpen(false); }}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-accent',
                                        s === value && 'bg-accent',
                                    )}
                                >
                                    <span className="shrink-0 font-mono text-[11px]">{s}</span>
                                    {s === value && <Check className="size-4 shrink-0" aria-hidden />}
                                    <span className="flex min-w-0 flex-1 justify-end">
                                        <span
                                            aria-hidden
                                            className={cn(
                                                'w-auto min-w-0 truncate rounded text-right text-[13px] leading-snug',
                                                PREVIEWS[s].box ? 'px-3 py-1' : 'p-1',
                                            )}
                                            style={previewStyle(PREVIEWS[s])}
                                        >
                                            This <span style={{ color: PREVIEWS[s].active }}>is</span> the vibe
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>, document.body,
            )}
        </div>
    );
}
