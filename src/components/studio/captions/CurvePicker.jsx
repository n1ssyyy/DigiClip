import { useT } from '../../../lib/i18n';
import { Choice } from './choices';
import { useCap } from './context';
import { Row } from './inputs';

/** The four ease curves, in plain words. */
export function easeOptions(t) {
    return [
        { id: 'linear', label: t('Even') },
        { id: 'out', label: t('Soft end') },
        { id: 'in', label: t('Soft start') },
        { id: 'back', label: t('Overshoot') },
    ];
}

// Each ease drawn from bottom left (start) to top right (arrival)
// on a 24 x 16 frame.
const PATHS = {
    linear: 'M3 14 L21 5',
    out: 'M3 14 C5 7 10 5 21 5',
    in: 'M3 14 C14 14 19 12 21 5',
    back: 'M3 14 C6 7 10 1.5 14 2 S18 5 21 5',
};

function Glyph({ id }) {
    return (
        <svg viewBox="0 0 24 16" className="h-4 w-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={PATHS[id]} />
        </svg>
    );
}

/**
 * An ease picked from one row of four small buttons, each drawn as its own
 * curve. A radiogroup like the panel's other choices (one tab stop, arrows
 * pick); the name is the button's accessible name and tooltip, and the
 * picked one is also written beside the row's label.
 */
export default function CurveRow({ path, label, disabled = false, hint }) {
    const t = useT();
    const { view, set, clear } = useCap();
    const value = view.val(path);
    const opts = easeOptions(t);
    const picked = opts.find((o) => o.id === value);
    return (
        <Row label={label} detail={picked?.label} set={view.isSet(path)} onReset={() => clear(path)} hint={hint}>
            <Choice
                label={label}
                size="sm"
                value={value}
                set={view.isSet(path)}
                disabled={disabled}
                onChange={(v) => set(path, v)}
                options={opts.map((o) => ({ id: o.id, label: <Glyph id={o.id} />, aria: o.label, tip: o.label }))}
            />
        </Row>
    );
}
