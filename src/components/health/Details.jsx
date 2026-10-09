import { useT } from '../../lib/i18n';

/** What is installed and where: plain name / value pairs, nothing marked.
 *  Values wrap rather than cut, since a path is something people copy. */
export default function Details({ facts }) {
    const t = useT();
    if (!facts.length) return null;
    return (
        <section aria-label={t('Details')}>
            <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2.5">
                {facts.map((f) => (
                    <div key={f.id} className="contents">
                        <dt className="font-mono text-[11px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{f.label}</dt>
                        <dd className="font-mono text-[12px] leading-snug [overflow-wrap:anywhere]">{f.value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
