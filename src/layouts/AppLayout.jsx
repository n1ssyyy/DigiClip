import { useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard, HelpCircle, X } from 'lucide-react';
import { Card } from '../components/ui/card';
import Sidebar from '../components/digiclip/Sidebar';
import PageLine from '../components/digiclip/PageLine';
import Toasts from '../components/digiclip/Toasts';
import UpdateNotice from '../components/digiclip/UpdateNotice';
import Onboarding, { shouldShowOnboarding } from '../components/digiclip/Onboarding';
import WindowControls from '../components/digiclip/Titlebar';
import { dismissFlash, dismissToast, navigate, useStore } from '../lib/socket';
import { cn } from '../lib/utils';
import { dragWindow, isTauri, onMaximized, openExternal, queryMaximized, sendWindowAction } from '../lib/native';

const noDrag = { WebkitAppRegion: 'no-drag' };

// Sidebar order top to bottom: travel direction follows it, so going
// Home -> Health -> Settings the new page rises from below, and going
// back up it drops from above.
const PAGE_ORDER = { home: 0, health: 1, settings: 2 };
function orderOf(page) {
    return PAGE_ORDER[page] ?? 99;
}

/** Status banner under the header, in the panel language: a Card row the
 *  height of the panel headers, dismissable like the other panel controls.
 *  Its slot opens and closes by animating grid rows 0fr <-> 1fr, and the
 *  5px panel gap lives inside the slot, so the page below (which fills the
 *  remaining height) glides down to make room and back up after — no
 *  jump. The last text stays rendered while the slot closes. */
function FlashBar({ text }) {
    const [shown, setShown] = useState(text);
    useEffect(() => {
        if (text) setShown(text);
    }, [text]);
    const open = !!text;
    return (
        <div
            className={cn(
                'grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
            aria-hidden={!open}
        >
            <div className="min-h-0 overflow-hidden">
                <div className="pr-[5px] pb-[5px]">
                    <Card role="status" aria-live="polite" className="flex h-10 items-center gap-2 pr-1.5 pl-4">
                        <p key={shown} className="fade min-w-0 flex-1 truncate text-[13px]" title={shown ?? ''}>
                            {shown}
                        </p>
                        <button
                            type="button"
                            onClick={dismissFlash}
                            tabIndex={open ? 0 : -1}
                            aria-label="Dismiss"
                            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <X className="size-3.5" aria-hidden />
                        </button>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function AppLayout({ children }) {
    const page = useStore((s) => s.page);
    const flash = useStore((s) => s.flash);
    const toasts = useStore((s) => s.toasts);
    const [maximized, setMaximized] = useState(false);
    // Page handoff: the outgoing page fades out first, then the incoming
    // one fades in from the travel direction.
    const childrenRef = useRef(children);
    childrenRef.current = children;
    const [stage, setStage] = useState({ page, children, dir: 0, leaving: false });

    useEffect(() => {
        if (page === stage.page) return;
        const dir = Math.sign(orderOf(page) - orderOf(stage.page)) || 1;
        setStage((s) => ({ ...s, dir, leaving: true }));
        const t = setTimeout(() => {
            setStage({ page, children: childrenRef.current, dir, leaving: false });
        }, 160);
        return () => clearTimeout(t);
    }, [page, stage.page]);
    const kids = page === stage.page ? children : stage.children;
    const motionCls = stage.leaving
        ? (stage.dir >= 0 ? 'page-leave-down' : 'page-leave-up')
        : (stage.dir >= 0 ? 'page-enter-down' : 'page-enter-up');

    // First-run onboarding: welcome + 4-step tour. useState initializer
    // (not an effect) so the first paint already knows — no flash of the
    // tour on repeat visits, no late pop-in.
    const [tourOpen, setTourOpen] = useState(() => shouldShowOnboarding());
    const [tourLeaving, setTourLeaving] = useState(false);
    const tourTimer = useRef(null);
    useEffect(() => () => { if (tourTimer.current) clearTimeout(tourTimer.current); }, []);
    const openTour = useCallback(() => {
        if (tourTimer.current) clearTimeout(tourTimer.current);
        setTourLeaving(false);
        setTourOpen(true);
    }, []);
    const closeTour = useCallback(() => {
        setTourLeaving(true);
        if (tourTimer.current) clearTimeout(tourTimer.current);
        // Must cover the fade-out/pop-out exit (180ms).
        tourTimer.current = setTimeout(() => {
            setTourOpen(false);
            setTourLeaving(false);
        }, 200);
    }, []);

    // Replay hooks: header Tour button uses openTour directly; Settings
    // and Health fire a window event (they live below this layout).
    useEffect(() => {
        const replay = () => {
            try {
                localStorage.removeItem('digiclip.onboardingDone');
            } catch {
            }
            openTour();
        };
        window.addEventListener('digiclip:tour', replay);
        return () => window.removeEventListener('digiclip:tour', replay);
    }, [openTour]);

    const toggleMaximize = useCallback(() => {
        queryMaximized().then((maxed) => {
            sendWindowAction(maxed ? 'unmaximize' : 'maximize');
            setMaximized(!maxed);
        });
    }, []);

    // Rounded shell: drop the radius when maximized so the window is edge-to-edge.
    useEffect(() => {
        document.documentElement.classList.toggle('window-maximized', maximized);
    }, [maximized]);

    // Stay in sync when the window is maximized via OS shortcuts.
    useEffect(() => {
        if (!isTauri()) return;
        let off = null;
        queryMaximized().then(setMaximized).catch(() => {});
        onMaximized(setMaximized).then((f) => { off = f; }).catch(() => {});
        return () => { off?.(); };
    }, []);

    // External links (target _blank) leave the app via the OS browser
    // instead of spawning an app child window.
    useEffect(() => {
        if (!isTauri()) return;
        const onClick = (e) => {
            const a = e.target.closest?.('a[href^="http"]');
            if (!a || a.target !== '_blank') return;
            e.preventDefault();
            openExternal(a.href);
        };
        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, []);

    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
            <PageLine />
            {/* Custom window chrome: frameless shell, this header is the drag region. */}
            <header
                className="sticky top-0 z-10 flex h-[var(--chrome)] items-stretch bg-background/95 pr-0 pl-4 backdrop-blur select-none"
                data-tauri-drag-region
                onMouseDown={(e) => {
                    // Belt and suspenders: the attribute above is the
                    // native path; the shell drag is the fallback that
                    // always works. Interactive children opt out.
                    if (!isTauri() || e.button !== 0) return;
                    if (e.target.closest('button, a, [data-no-drag]')) return;
                    dragWindow();
                }}
                onDoubleClick={(e) => {
                    if (!isTauri()) return;
                    if (e.target.closest('button, a, [data-no-drag]')) return;
                    toggleMaximize();
                }}
            >
                <button
                    type="button"
                    onClick={() => navigate('home')}
                    data-tauri-drag-region="false"
                    data-no-drag
                    style={noDrag}
                    className="flex cursor-pointer items-center gap-1.5 bg-transparent text-[13px] font-semibold tracking-tight"
                >
                    <Clapperboard className="size-3.5" aria-hidden />
                    DigiClip
                </button>
                <div className="flex-1" aria-hidden />
                <button
                    type="button"
                    aria-label="Take the tour"
                    title="Take the tour"
                    data-tauri-drag-region="false"
                    data-no-drag
                    style={noDrag}
                    onClick={openTour}
                    className="mr-0.5 flex items-center justify-center self-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                    <HelpCircle className="size-3.5" aria-hidden />
                </button>
                <WindowControls maximized={maximized} onToggleMaximize={toggleMaximize} />
            </header>
            <div className="flex flex-1 items-start">
                <Sidebar />
                {/* Fixed-height column: the banner slot takes what it needs and
                    the page fills the rest, so pages shrink instead of
                    spilling past the window. */}
                <div className="flex h-[calc(100dvh_-_var(--chrome))] min-w-0 flex-1 flex-col">
                    <FlashBar text={flash} />
                    <main className="min-h-0 flex-1 pt-0 pr-[5px] pb-[5px] pl-0">
                        <div key={stage.page} className={cn('h-full', motionCls)}>
                            {kids}
                        </div>
                    </main>
                </div>
            </div>
            <Toasts toasts={toasts} onDismiss={dismissToast} />
            <UpdateNotice />
            {tourOpen && (
                <Onboarding
                    username={null}
                    open={tourOpen}
                    leaving={tourLeaving}
                    onClose={closeTour}
                />
            )}
        </div>
    );
}
