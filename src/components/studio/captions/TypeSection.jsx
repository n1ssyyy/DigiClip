import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import { FONTS } from '../../../lib/captionStyles';
import { ENUM_ORDER } from '../../../lib/captionSections';
import { useT } from '../../../lib/i18n';
import { CapNotice } from '../Notice';
import PlaceField from '../PlaceField';
import { Choice } from './choices';
import { useCap } from './context';
import { Num, Row, useDrag } from './inputs';

const FONT_LABEL = { 'Anton': 'Anton', 'Archivo Black': 'Archivo Black', 'Inter Medium': 'Inter', 'JetBrains Mono': 'JetBrains Mono' };
const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight };

/** Type: font, size, case, spacing, rows and their breaks, alignment,
 *  rotation, and where the caption sits. */
export default function TypeSection() {
    const t = useT();
    const { view, set, clear, setPatch, g } = useCap();
    const drag = useDrag(g);
    const alignName = { left: t('Align left'), center: t('Align centre'), right: t('Align right') };
    return (
        <>
            <CapNotice cap="look.captions.type" text={t('This engine is older than these controls. They apply after the next engine update.')} />

            <Row label={t('Font')} set={view.isSet('font')} onReset={() => clear('font')}>
                <Choice
                    label={t('Font')}
                    size="lg"
                    cols={2}
                    value={view.val('font')}
                    set={view.isSet('font')}
                    onChange={(v) => set('font', v)}
                    options={FONTS.map((f) => ({ id: f, label: FONT_LABEL[f], style: { fontFamily: `'${f}', sans-serif` } }))}
                />
            </Row>

            <Num path="size" label={t('Size')} />

            <Row label={t('Case')} set={view.isSet('case')} onReset={() => clear('case')}>
                <Choice
                    label={t('Case')}
                    value={view.val('case')}
                    set={view.isSet('case')}
                    onChange={(v) => set('case', v)}
                    options={[
                        { id: 'upper', label: t('ABC'), aria: t('All capitals.') },
                        { id: 'asis', label: t('Abc'), aria: t('The words as they were spoken.') },
                    ]}
                />
            </Row>

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

            <Row label={t('Alignment')} set={view.isSet('align')} onReset={() => clear('align')} hint={t('Only matters when a caption has two rows.')}>
                <Choice
                    label={t('Alignment')}
                    value={view.val('align')}
                    set={view.isSet('align')}
                    onChange={(v) => set('align', v)}
                    options={ENUM_ORDER.align.map((id) => {
                        const Icon = ALIGN_ICON[id];
                        return { id, aria: alignName[id], label: <Icon className="size-4" aria-hidden /> };
                    })}
                />
            </Row>

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
