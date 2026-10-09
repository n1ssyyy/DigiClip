import { CircleAlert, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { navigate } from '../../lib/socket';

/** What is wrong, in plain words with what to do, then what merely is worth
 *  knowing. A problem may carry a button that goes where it is fixed. */
export default function Findings({ problems, notes }) {
    if (!problems.length && !notes.length) return null;
    return (
        <ul className="flex flex-col gap-3">
            {problems.map((p) => (
                <li key={p.id} className="rise flex items-start gap-2.5">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                        <p className="min-w-0 flex-1 basis-64 text-[13px] leading-snug [overflow-wrap:anywhere]">{p.text}</p>
                        {p.action?.kind === 'settings' && (
                            <Button size="sm" variant="secondary" onClick={() => navigate('settings')}>{p.action.label}</Button>
                        )}
                    </div>
                </li>
            ))}
            {notes.map((n) => (
                <li key={n.id} className="rise flex items-start gap-2.5">
                    <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{n.text}</p>
                </li>
            ))}
        </ul>
    );
}
