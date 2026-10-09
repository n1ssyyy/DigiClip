import { useT } from '../../../lib/i18n';
import { Choice } from './choices';
import { usePanel } from './context';
import CurveRow from './CurvePicker';
import { Num, Row } from './inputs';

/** The names of the entrance and exit kinds, in plain words. */
export function kindNames(t) {
    return {
        none: t('None'), pop: t('Pop'), fade: t('Fade'), slide_up: t('Slide up'), slide_down: t('Slide down'), slide_left: t('Slide left'),
        slide_right: t('Slide right'), zoom: t('Zoom'), bounce: t('Bounce'), blur: t('Blur'), drop: t('Drop'),
    };
}

/**
 * How a thing comes in and goes out: the kind, its time and its curve, then
 * the kind and time of the way out. `inLabel` / `outLabel` name the two
 * kinds; `enterKinds` / `exitKinds` list what each offers.
 */
export default function MotionFields({ inLabel, outLabel, enterKinds, exitKinds }) {
    const t = useT();
    const { view, set, clear } = usePanel();
    const name = kindNames(t);
    const enterKind = view.val('enter.kind');
    const none = enterKind === 'none';
    const outNone = view.val('exit.kind') === 'none';
    return (
        <>
            <Row label={inLabel} set={view.isSet('enter.kind')} onReset={() => clear('enter.kind')}>
                <Choice
                    label={inLabel}
                    cols={3}
                    wrap
                    value={enterKind}
                    set={view.isSet('enter.kind')}
                    onChange={(v) => set('enter.kind', v)}
                    options={enterKinds.map((id) => ({ id, label: name[id] }))}
                />
            </Row>
            <Num path="enter.ms" label={t('In time')} disabled={none} />
            <CurveRow
                path="enter.ease"
                label={t('In curve')}
                disabled={none || enterKind === 'bounce'}
                hint={enterKind === 'bounce' ? t('Bounce keeps its own curve.') : undefined}
            />

            <Row label={outLabel} set={view.isSet('exit.kind')} onReset={() => clear('exit.kind')}>
                <Choice
                    label={outLabel}
                    cols={3}
                    wrap
                    value={view.val('exit.kind')}
                    set={view.isSet('exit.kind')}
                    onChange={(v) => set('exit.kind', v)}
                    options={exitKinds.map((id) => ({ id, label: name[id] }))}
                />
            </Row>
            <Num path="exit.ms" label={t('Out time')} disabled={outNone} />
        </>
    );
}
