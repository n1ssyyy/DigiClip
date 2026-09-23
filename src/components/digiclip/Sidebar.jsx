import { Activity, House as HouseIcon, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { navigate, useStore } from '../../lib/socket';

const noDrag = { WebkitAppRegion: 'no-drag' };

function SideLink({ page, label, active, children }) {
    return (
        <button
            type="button"
            onClick={() => navigate(page)}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            data-tauri-drag-region="false"
            data-no-drag
            style={noDrag}
            className={cn(
                // Collapsed: 32px rounded square, 5px breathing room on
                // every side — the same rhythm as the header buttons.
                'group relative ml-[5px] flex h-8 w-8 cursor-pointer items-center overflow-hidden rounded-md whitespace-nowrap',
                'bg-transparent text-muted-foreground',
                'motion-safe:transition-[width,background-color,color,box-shadow] motion-safe:duration-200 motion-safe:ease-out',
                // Hover: anchored left, grows to a fixed 160px pill with a solid
                // background so the label stays readable over page content;
                // label centers in the space between icon box and right edge.
                'hover:w-40 hover:bg-accent hover:text-foreground hover:shadow-xl hover:ring-1 hover:ring-border',
                'focus-visible:outline-2 focus-visible:outline-ring',
                active && 'bg-accent/60 text-foreground',
            )}
        >
            <span className="flex size-8 shrink-0 items-center justify-center">{children}</span>
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

/**
 * Icon-only rail (same thickness as the header). Buttons are small rounded
 * squares floating with padding around them; hovering grows just that button
 * rightward out of the rail to reveal its label, rail and siblings stay put.
 */
export default function Sidebar() {
    const page = useStore((s) => s.page);

    return (
        <aside className="sticky top-[var(--chrome)] z-20 flex h-[calc(100vh_-_var(--chrome))] w-[var(--chrome)] shrink-0 flex-col gap-1 bg-background py-[5px] select-none">
            <nav aria-label="Primary" className="flex flex-col gap-1">
                <SideLink page="home" label="Home" active={page === 'home'}>
                    <HouseIcon className="size-4" aria-hidden />
                </SideLink>
                <SideLink page="health" label="Health" active={page === 'health'}>
                    <Activity className="size-4" aria-hidden />
                </SideLink>
            </nav>
            <div className="mt-auto">
                <SideLink page="settings" label="Settings" active={page === 'settings'}>
                    <SettingsIcon className="size-4" aria-hidden />
                </SideLink>
            </div>
        </aside>
    );
}
