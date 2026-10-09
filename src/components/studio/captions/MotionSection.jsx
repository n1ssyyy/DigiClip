import { ENUM_ORDER } from '../../../lib/captionSections';
import { useT } from '../../../lib/i18n';
import { CapNotice } from '../Notice';
import MotionFields from '../kit/MotionFields';

/** How a line comes in and goes out. */
export default function MotionSection() {
    const t = useT();
    return (
        <>
            <CapNotice cap="look.captions.motion" text={t('This engine is older than these controls. They apply after the next engine update.')} />
            <MotionFields
                inLabel={t('Line in')}
                outLabel={t('Line out')}
                enterKinds={ENUM_ORDER['enter.kind']}
                exitKinds={ENUM_ORDER['exit.kind']}
            />
        </>
    );
}
