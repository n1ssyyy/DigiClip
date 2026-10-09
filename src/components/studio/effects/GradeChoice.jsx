import { useId } from 'react';
import { GRADES } from '../../../lib/sceneFields';
import { GRADE_LABEL } from '../../../lib/sceneSummary';
import { gradePatch } from '../../../lib/sceneEffective';
import { useT } from '../../../lib/i18n';
import GradeDefs, { gradeFilter } from '../GradeDefs';
import { Choice } from '../kit/choices';
import { usePanel } from '../kit/context';
import { Row } from '../kit/inputs';

/** The five colour bars each grade is shown on (content, so they carry colour). */
const BARS = 'linear-gradient(to bottom, rgb(255 255 255 / 0.28), transparent 45%, rgb(0 0 0 / 0.4)), linear-gradient(90deg, #c98a64 0 22%, #e9d8bd 22% 44%, #5d9a6c 44% 66%, #4a78b8 66% 84%, #8a8a90 84%)';

/** The colour grade as five swatches, each a tiny sample with the grade on it. */
export default function GradeChoice() {
    const t = useT();
    const prefix = `dc-sw-${useId().replace(/:/g, '')}`;
    const { view, setPatch, clear } = usePanel();
    return (
        <Row label={t('Colour grade')} set={view.isSet('grade')} onReset={() => clear('grade')} hint={t('Text and graphics keep their colours.')}>
            <GradeDefs prefix={prefix} />
            <Choice
                label={t('Colour grade')}
                size="tall"
                wrap
                value={view.val('grade')}
                set={view.isSet('grade')}
                onChange={(v) => setPatch(gradePatch(v))}
                options={GRADES.map((id) => ({
                    id,
                    aria: t(GRADE_LABEL[id]),
                    label: (
                        <>
                            <span aria-hidden className="block h-5 w-full rounded-[3px]" style={{ backgroundImage: BARS, filter: gradeFilter(prefix, id) }} />
                            <span className="block w-full">{t(GRADE_LABEL[id])}</span>
                        </>
                    ),
                }))}
            />
        </Row>
    );
}
