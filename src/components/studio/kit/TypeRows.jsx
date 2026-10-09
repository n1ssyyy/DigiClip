import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import { useT } from '../../../lib/i18n';
import { CapNotice } from '../Notice';
import { useFaceStatus } from '../useFonts';
import { Choice } from './choices';
import FontPicker from './FontPicker';
import { usePanel } from './context';
import { Row } from './inputs';

const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight };
const ALIGNS = ['left', 'center', 'right'];

/** The font: a picker over every font the engine has, each in its own face.
 *  `layer` is the stage layer a hover previews on; `unless` names the ability
 *  whose own "older engine" note already covers this section. */
export function FontRow({ layer, unless }) {
    const t = useT();
    const { view, set, clear } = usePanel();
    const value = view.val('font');
    const status = useFaceStatus(value);
    return (
        <Row label={t('Font')} set={view.isSet('font')} onReset={() => clear('font')}>
            <CapNotice cap="look.fonts" unless={unless} text={t('This engine only has the four built-in fonts. The rest apply after the next engine update.')} />
            <FontPicker
                label={t('Font')}
                layer={layer}
                value={value}
                def={view.defaultFont}
                onPick={(f) => (f === undefined ? clear('font') : set('font', f))}
            />
            {status === 'failed' && <p className="text-[11px] leading-snug text-muted-foreground">{t('This font could not be loaded. The default is shown.')}</p>}
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
