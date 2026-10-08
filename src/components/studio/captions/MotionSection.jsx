import { ENUM_ORDER } from '../../../lib/captionSections';
import { useT } from '../../../lib/i18n';
import { CapNotice } from '../Notice';
import { Choice } from './choices';
import { useCap } from './context';
import { Num, Row } from './inputs';
import { easeOptions } from './WordsSection';

/** How a line comes in and goes out. */
export default function MotionSection() {
    const t = useT();
    const { view, set, clear } = useCap();
    const inName = {
        none: t('None'), pop: t('Pop'), fade: t('Fade'), slide_up: t('Slide up'), slide_down: t('Slide down'), slide_left: t('Slide left'),
        slide_right: t('Slide right'), zoom: t('Zoom'), bounce: t('Bounce'), blur: t('Blur'), drop: t('Drop'),
    };
    const kindOptions = (path) => ENUM_ORDER[path].map((id) => ({ id, label: inName[id] }));
    const enterKind = view.val('enter.kind');
    const none = enterKind === 'none';
    const outNone = view.val('exit.kind') === 'none';
    return (
        <>
            <CapNotice cap="look.captions.motion" text={t('This engine is older than these controls. They apply after the next engine update.')} />

            <Row label={t('Line in')} set={view.isSet('enter.kind')} onReset={() => clear('enter.kind')}>
                <Choice
                    label={t('Line in')}
                    cols={3}
                    wrap
                    value={enterKind}
                    set={view.isSet('enter.kind')}
                    onChange={(v) => set('enter.kind', v)}
                    options={kindOptions('enter.kind')}
                />
            </Row>
            <Num path="enter.ms" label={t('In time')} disabled={none} />
            <Row
                label={t('In curve')}
                set={view.isSet('enter.ease')}
                onReset={() => clear('enter.ease')}
                hint={enterKind === 'bounce' ? t('Bounce keeps its own curve.') : undefined}
            >
                <Choice
                    label={t('In curve')}
                    cols={2}
                    wrap
                    value={view.val('enter.ease')}
                    set={view.isSet('enter.ease')}
                    disabled={none || enterKind === 'bounce'}
                    onChange={(v) => set('enter.ease', v)}
                    options={easeOptions(t)}
                />
            </Row>

            <Row label={t('Line out')} set={view.isSet('exit.kind')} onReset={() => clear('exit.kind')}>
                <Choice
                    label={t('Line out')}
                    cols={3}
                    wrap
                    value={view.val('exit.kind')}
                    set={view.isSet('exit.kind')}
                    onChange={(v) => set('exit.kind', v)}
                    options={kindOptions('exit.kind')}
                />
            </Row>
            <Num path="exit.ms" label={t('Out time')} disabled={outNone} />
        </>
    );
}
