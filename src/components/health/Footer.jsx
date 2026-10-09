import { useState } from 'react';
import { FileDown, Loader2, RefreshCw } from 'lucide-react';
import Tip from '../digiclip/Tooltip';
import { exportDiagnostics, flashMessage } from '../../lib/socket';
import { isTauri, reveal } from '../../lib/native';
import { useT } from '../../lib/i18n';

const LINK = 'inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60';

/** One report to attach to a bug: versions, health, settings without
 *  keys, recent jobs and logs. Written by the engine, then shown in the
 *  file manager. */
function DiagnosticsButton() {
    const [busy, setBusy] = useState(false);
    const t = useT();
    function run() {
        if (busy) return;
        setBusy(true);
        exportDiagnostics()
            .then((d) => {
                if (!d?.path) return;
                if (isTauri()) reveal(d.path);
                flashMessage(t('Diagnostics saved to {path}', { path: d.path }));
            })
            .catch((e) => flashMessage(t("Couldn't export diagnostics: {error}", { error: e?.message ?? e })))
            .finally(() => setBusy(false));
    }
    return (
        <Tip label={t('Save a report (no keys) to attach to a bug')} side="top">
            <button type="button" onClick={run} disabled={busy} className={LINK}>
                {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <FileDown className="size-3" aria-hidden />}
                {t('Export diagnostics')}
            </button>
        </Tip>
    );
}

/** The quiet links at the foot of the page. A fresh check can take several
 *  seconds: its link shows it is working and cannot be pressed twice. */
export default function Footer({ checking = false, onCheck }) {
    const t = useT();
    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4">
            <button type="button" onClick={() => !checking && onCheck?.()} disabled={checking} aria-busy={checking} className={LINK}>
                {checking ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <RefreshCw className="size-3" aria-hidden />}
                {checking ? t('Checking…') : t('Check again')}
            </button>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('digiclip:tour'))} className={LINK}>
                {t('Take the tour again')}
            </button>
            <DiagnosticsButton />
        </div>
    );
}
