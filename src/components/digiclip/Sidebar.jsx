import { useLayoutEffect, useRef, useState } from 'react';
import { Activity, Bot, House as HouseIcon, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { navigate, useStore } from '../../lib/socket';
import { useT } from '../../lib/i18n';

const noDrag = { WebkitAppRegion: 'no-drag' };

function SideLink({ page, label, active, dot, children }) {
    return (
        <button
            type="button"
            onClick={() => navigate(page)}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            data-page={page}
            data-tauri-drag-region="false"
            data-no-drag
            style={noDrag}
            className={cn(
                // Collapsed: 32px rounded square, 5px breathing room on
                // every side — the same rhythm as the header buttons.
                'side-link group relative ml-[5px] flex h-8 w-8 cursor-pointer items-center overflow-hidden rounded-md whitespace-nowrap',
                'bg-transparent text-muted-foreground',
                'motion-safe:transition-[width,background-color,color,box-shadow,transform] motion-safe:duration-200 motion-safe:ease-out',
                // Hover: anchored left, grows to a fixed 160px pill with a solid
                // background so the label stays readable over page content;
                // label centers in the space between icon box and right edge.
                'hover:w-40 hover:bg-accent hover:text-foreground hover:shadow-xl hover:ring-1 hover:ring-border',
                'active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-ring',
                active && 'bg-accent/60 text-foreground',
            )}
        >
            <span className="relative flex size-8 shrink-0 items-center justify-center">
                {children}
                {dot && (
                    <span className="absolute top-1.5 right-1.5 flex size-1.5" aria-hidden>
                        <span className="absolute inset-0 animate-ping rounded-full bg-orange-500/70" />
                        <span className="relative size-1.5 rounded-full bg-orange-500" />
                    </span>
                )}
            </span>
            <span
                aria-hidden
                className={cn(
                    'flex-1 -translate-x-1 px-2 text-center text-[13px] font-medium opacity-0',
                    'motion-safe:transition-all motion-safe:delay-75 motion-safe:duration-200',
                    // Rest 5px left of box-center: compensates the icon box's
                    // trailing dead space so the text looks centered vs the glyph.
                    'group-hover:translate-x-[-5px] group-hover:opacity-100',
                )}
            >
                {label}
            </span>
        </button>
    );
}

/** The active-page marker: a short bar on the rail's left edge that
 *  glides to whichever link is current, stretching on the way like a
 *  drop of light (the travel is split into a stretch and a settle). */
function useIndicator(railRef, page) {
    const [pos, setPos] = useState(null);
    useLayoutEffect(() => {
        const rail = railRef.current;
        if (!rail) return undefined;
        const place = () => {
            const el = rail.querySelector(`[data-page="${page}"]`);
            if (!el) return setPos(null);
            setPos({ top: el.offsetTop + 8, height: el.offsetHeight - 16 });
        };
        place();
        const ro = new ResizeObserver(place);
        ro.observe(rail);
        return () => ro.disconnect();
    }, [railRef, page]);
    return pos;
}

/**
 * Icon-only rail (same thickness as the header). Buttons are small rounded
 * squares floating with padding around them; hovering grows just that button
 * rightward out of the rail to reveal its label, rail and siblings stay put.
 * Where you work sits at the top; the machine's state and its settings
 * share the foot of the rail.
 */
export default function Sidebar() {
    const page = useStore((s) => s.page);
    // An AI app is mid-call: the MCP icon pulses.
    const aiBusy = useStore((s) => !!s.mcp?.activity?.some((a) => a.state === 'running'));
    const t = useT();
    const rail = useRef(null);
    const pos = useIndicator(rail, page);

    return (
        <aside
            ref={rail}
            className="shell-left sticky top-[var(--chrome)] z-20 flex h-[calc(100vh_-_var(--chrome))] w-[var(--chrome)] shrink-0 flex-col gap-1 bg-background py-[5px] select-none"
        >
            {pos && (
                <span
                    aria-hidden
                    className="side-ind pointer-events-none absolute left-0 flex w-[3px]"
                    style={{ transform: `translateY(${pos.top}px)`, height: pos.height }}
                >
                    {/* Remounts per page, so each arrival replays the landing squash. */}
                    <span key={page} className="side-ind-land flex-1 rounded-r-full bg-foreground shadow-[0_0_8px_rgb(255_255_255/0.35)]" />
                </span>
            )}
            <nav aria-label={t('Primary')} className="flex flex-col gap-1">
                <SideLink page="home" label={t('Home')} active={page === 'home'}>
                    <HouseIcon className="size-4" aria-hidden />
                </SideLink>
                <SideLink page="mcp" label={t('AI apps')} active={page === 'mcp'} dot={aiBusy}>
                    <Bot className="size-4" aria-hidden />
                </SideLink>
            </nav>
            <nav aria-label={t('System')} className="mt-auto flex flex-col gap-1">
                <SideLink page="health" label={t('Health')} active={page === 'health'}>
                    <Activity className="size-4" aria-hidden />
                </SideLink>
                <SideLink page="settings" label={t('Settings')} active={page === 'settings'}>
                    <SettingsIcon className="size-4" aria-hidden />
                </SideLink>
            </nav>
        </aside>
    );
}
