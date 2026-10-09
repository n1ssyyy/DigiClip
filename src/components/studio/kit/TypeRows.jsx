import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import { FONTS } from '../../../lib/captionStyles';
import { useT } from '../../../lib/i18n';
import { Choice } from './choices';
import { usePanel } from './context';
import { Row } from './inputs';

const FONT_LABEL = { 'Anton': 'Anton', 'Archivo Black': 'Archivo Black', 'Inter Medium': 'Inter', 'JetBrains Mono': 'JetBrains Mono' };
const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight };
const ALIGNS = ['left', 'center', 'right'];

/** The four fonts, each set in its own face. */
export function FontRow() {
    const t = useT();
    const { view, set, clear } = usePanel();
    return (
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
    );
}

/** Capitals or the words as they are. */
export function CaseRow() {
    const t = useT();
    const { view, set, clear } = usePanel();
    return (
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
    );
}

/** Left, centre or right inside the block. */
export function AlignRow({ hint }) {
    const t = useT();
    const { view, set, clear } = usePanel();
    const name = { left: t('Align left'), center: t('Align centre'), right: t('Align right') };
    return (
        <Row label={t('Alignment')} set={view.isSet('align')} onReset={() => clear('align')} hint={hint}>
            <Choice
                label={t('Alignment')}
                value={view.val('align')}
                set={view.isSet('align')}
                onChange={(v) => set('align', v)}
                options={ALIGNS.map((id) => {
                    const Icon = ALIGN_ICON[id];
                    return { id, aria: name[id], label: <Icon className="size-4" aria-hidden /> };
                })}
            />
        </Row>
    );
}
