import { useT } from '../../../lib/i18n';
import { CapNotice } from '../Notice';
import PlaceField from '../PlaceField';
import { Choice } from '../kit/choices';
import { usePanel } from '../kit/context';
import { Num, Row, useDrag } from '../kit/inputs';
import { AlignRow, CaseRow, FontRow } from '../kit/TypeRows';

/** Type: font, size, case, spacing, rows and their breaks, alignment,
 *  rotation, and where the caption sits. */
export default function TypeSection() {
    const t = useT();
    const { view, set, clear, setPatch, g } = usePanel();
    const drag = useDrag(g);
    return (
        <>
            <CapNotice cap="look.captions.type" text={t('This engine is older than these controls. They apply after the next engine update.')} />

            <FontRow layer="captions" unless="look.captions.type" />

            <Num path="size" label={t('Size')} />

            <CaseRow />

            <Num path="spacing" label={t('Letter spacing')} />
            <Num path="line_gap" label={t('Line gap')} />

            <Row label={t('Rows')} set={view.isSet('lines')} onReset={() => clear('lines')} hint={t('One row never wraps.')}>
                <Choice
                    label={t('Rows')}
                    value={view.val('lines')}
                    set={view.isSet('lines')}
                    onChange={(v) => set('lines', v)}
                    options={[{ id: 1, label: '1' }, { id: 2, label: '2' }]}
                />
            </Row>

            <Num path="max_words" label={t('Words per line')} />
            <Num path="max_chars" label={t('Characters per line')} />

            <AlignRow hint={t('Only matters when a caption has two rows.')} />

            <Num path="rotate" label={t('Rotation')} />

            <PlaceField
                center={view.r.center}
                placed={view.r.placed}
                onPlace={(x, y) => setPatch({ x, y })}
                onReset={() => clear('x')}
                onDragStart={drag.begin}
                onDragEnd={drag.end}
            />
        </>
    );
}
