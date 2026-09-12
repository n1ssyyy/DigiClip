import { Link, usePage } from '@inertiajs/react';
import { useCallback, useEffect, useState } from 'react';
import { Clapperboard } from 'lucide-react';
import Sidebar from '../components/digiclip/Sidebar';
import WindowControls, { isNativeWindow, sendWindowAction } from '../components/digiclip/Titlebar';

const noDrag = { WebkitAppRegion: 'no-drag' };

export default function AppLayout({ children }) {
    const { props } = usePage();
    const flash = props.flash;
    const [maximized, setMaximized] = useState(false);

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

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
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
                            <p role="status" className="rounded-md border bg-card px-4 py-2 text-sm">{flash}</p>
                        </div>
                    )}
                    <main className="px-4 py-4 md:px-6 md:py-6">{children}</main>
                </div>
            </div>
        </div>
    );
}
