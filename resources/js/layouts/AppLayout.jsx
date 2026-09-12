import { Link, usePage } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard } from 'lucide-react';
import Sidebar from '../components/digiclip/Sidebar';
import PageLine from '../components/digiclip/PageLine';
import WindowControls, { isNativeWindow, sendWindowAction } from '../components/digiclip/Titlebar';

const noDrag = { WebkitAppRegion: 'no-drag' };

// Sidebar order top to bottom: travel direction follows it, so going
// Home -> Health -> Settings the new page rises from below, and going
// back up it drops from above.
const PAGE_ORDER = { Home: 0, Health: 1, Settings: 2 };
function orderOf(component) {
    return PAGE_ORDER[component] ?? 99;
}

export default function AppLayout({ children }) {
    const { props, component } = usePage();
    const flash = props.flash;
    const [maximized, setMaximized] = useState(false);
    // Page handoff: the outgoing page fades out first, then the incoming
    // one fades in from the travel direction. Same-component prop
    // refreshes (queue polling) swap children with no animation.
    const childrenRef = useRef(children);
    childrenRef.current = children;
    const [stage, setStage] = useState({ component, children, dir: 0, leaving: false });

    useEffect(() => {
        if (component === stage.component) return;
        const dir = Math.sign(orderOf(component) - orderOf(stage.component)) || 1;
        setStage((s) => ({ ...s, dir, leaving: true }));
        const t = setTimeout(() => {
            setStage({ component, children: childrenRef.current, dir, leaving: false });
        }, 160);
        return () => clearTimeout(t);
    }, [component, stage.component]);
    const kids = component === stage.component ? children : stage.children;
    const motionCls = stage.leaving
        ? (stage.dir >= 0 ? 'page-leave-down' : 'page-leave-up')
        : (stage.dir >= 0 ? 'page-enter-down' : 'page-enter-up');

    const toggleMaximize = useCallback(() => {
        setMaximized((prev) => {
            sendWindowAction(prev ? 'unmaximize' : 'maximize');
            return !prev;
        });
    }, []);

    // Rounded shell: drop the radius when maximized so the window is edge-to-edge.
    useEffect(() => {
        document.documentElement.classList.toggle('window-maximized', maximized);
    }, [maximized]);

    // Stay in sync when the window is maximized via OS shortcuts.
    useEffect(() => {
        if (!isNativeWindow() || !window.Native?.on) return;
        try {
            window.Native.on('Native\\Desktop\\Events\\Windows\\WindowMaximized', () => setMaximized(true));
            window.Native.on('Native\\Desktop\\Events\\Windows\\WindowUnmaximized', () => setMaximized(false));
        } catch {
            // Older shell without the event bridge, local toggle state is enough.
        }
    }, []);

    // External links (target _blank) leave the app via the OS browser
    // instead of spawning an app child window. Plain browsers keep tabs.
    useEffect(() => {
        if (!isNativeWindow()) return;
        const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
        const onClick = (e) => {
            const a = e.target.closest?.('a[href^="http"]');
            if (!a || a.target !== '_blank') return;
            e.preventDefault();
            fetch('/api/open-external', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': token,
                    'X-Requested-With': 'XMLHttpRequest',
                    Accept: 'application/json',
                },
                body: JSON.stringify({ url: a.href }),
            }).catch(() => window.open(a.href, '_blank', 'noopener'));
        };
        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, []);

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
            <PageLine />
            {/* Custom window chrome: frameless shell, this header is the drag region. */}
            <header
                className="sticky top-0 z-10 flex h-[53px] items-stretch border-b bg-background/95 pr-0 pl-4 backdrop-blur select-none"
                style={{ WebkitAppRegion: 'drag' }}
                onDoubleClick={(e) => {
                    if (!isNativeWindow()) return;
                    if (e.target.closest('button, a, [data-no-drag]')) return;
                    toggleMaximize();
                }}
            >
                <Link
                    href="/"
                    data-no-drag
                    style={noDrag}
                    className="flex items-center gap-2 text-sm font-semibold tracking-tight"
                >
                    <Clapperboard className="size-4" aria-hidden />
                    DigiClip
                </Link>
                <div className="flex-1" aria-hidden />
                <WindowControls maximized={maximized} onToggleMaximize={toggleMaximize} />
            </header>
            <div className="flex flex-1 items-start">
                <Sidebar />
                <div className="min-w-0 flex-1">
                    {flash && (
                        <div className="px-4 pt-4 md:px-6">
                            <p role="status" className="rise rounded-md border bg-card px-4 py-2 text-sm">{flash}</p>
                        </div>
                    )}
                    <main className="px-4 py-4 md:px-6 md:py-6">
                        <div key={stage.component} className={motionCls}>
                            {kids}
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
