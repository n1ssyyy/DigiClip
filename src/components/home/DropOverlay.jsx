import { UploadCloud } from 'lucide-react';
import { useT } from '../../lib/i18n';

/** One veil over Home's page area while a file is dragged over the page. It
 *  takes no pointer events, so the drag keeps crossing the page's own
 *  elements underneath (their enter / leave never reach it) and the veil
 *  cannot flicker; it is gone the moment the drag leaves, drops or ends. */
export default function DropOverlay({ show }) {
    const t = useT();
    if (!show) return null;
    return (
        <div
            role="status"
            className="fade pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-md border-2 border-dashed border-white/40 bg-background/85 backdrop-blur-[2px]"
        >
            <div className="flex flex-col items-center gap-2 text-center">
                <UploadCloud className="size-8 text-foreground" aria-hidden />
                <p className="text-[15px] font-semibold">{t('Drop to add')}</p>
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">MP4 · MOV · MKV · WEBM</p>
            </div>
        </div>
    );
}
