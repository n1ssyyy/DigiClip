import { Link, usePage } from '@inertiajs/react';
import { Activity, House as HouseIcon, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

const noDrag = { WebkitAppRegion: 'no-drag' };

function SideLink({ href, label, active, children }) {
    return (
        <Link
            href={href}
            title={label}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            data-no-drag
            style={noDrag}
            className={cn(
                // Collapsed: 40px rounded square, centered in the 53px rail.
                'group relative ml-[6.5px] flex h-10 w-10 items-center overflow-hidden rounded-md whitespace-nowrap',
                'text-muted-foreground',
                'motion-safe:transition-[width,background-color,color,box-shadow] motion-safe:duration-200 motion-safe:ease-out',
                // Hover: anchored left, grows to a fixed 160px pill; label centers
                // in the space between the icon box and the pill's right edge.
                'hover:w-40 hover:bg-accent hover:text-foreground hover:shadow-xl hover:ring-1 hover:ring-border',
                'focus-visible:outline-2 focus-visible:outline-ring',
                active && 'bg-accent/60 text-foreground',
            )}
        >
            <span className="flex size-10 shrink-0 items-center justify-center">{children}</span>
            <span
                aria-hidden
                className={cn(
                    'flex-1 -translate-x-1 px-2 text-center text-sm font-medium opacity-0',
                    'motion-safe:transition-all motion-safe:delay-75 motion-safe:duration-200',
                    // Rest 5px left of box-center: compensates the icon box's
                    // trailing dead space so the text looks centered vs the glyph.
                    'group-hover:translate-x-[-5px] group-hover:opacity-100',
                )}
            >
                {label}
            </span>
        </Link>
    );
}

/**
 * Icon-only rail (w-11, same as the header height). Buttons are small rounded
 * squares floating with padding around them; hovering grows just that button
 * rightward out of the rail to reveal its label, rail and siblings stay put.
 */
export default function Sidebar() {
    const { url } = usePage();

    return (
        <aside className="sticky top-[53px] z-20 flex h-[calc(100vh_-_53px)] w-[53px] shrink-0 flex-col gap-2 border-r bg-background py-2 select-none">
            <nav aria-label="Primary" className="flex flex-col gap-2">
                <SideLink href="/" label="Home" active={url === '/'}>
                    <HouseIcon className="size-4" aria-hidden />
                </SideLink>
                <SideLink href="/health" label="Health" active={url.startsWith('/health')}>
                    <Activity className="size-4" aria-hidden />
                </SideLink>
            </nav>
            <div className="mt-auto">
                <SideLink href="/settings" label="Settings" active={url.startsWith('/settings')}>
                    <SettingsIcon className="size-4" aria-hidden />
                </SideLink>
            </div>
        </aside>
    );
}
