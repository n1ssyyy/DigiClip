import { cardPatch } from '../../../lib/layerEffective';
import { HEADLINE_LAYER } from '../../../lib/layerSections';
import { useT } from '../../../lib/i18n';
import { SwitchRow, inputCls } from '../../digiclip/fields';
import Field, { ResetButton } from '../Field';
import { CapNotice } from '../Notice';
import PlaceField from '../PlaceField';
import { Choice } from '../kit/choices';
import { usePanel } from '../kit/context';
import { Colour, ElementOpacity, Num, Row, useDrag } from '../kit/inputs';
import MotionFields from '../kit/MotionFields';
import { ShadowFields, GlowFields } from '../kit/FxSections';
import { AlignRow, CaseRow, FontRow } from '../kit/TypeRows';

const ENUMS = HEADLINE_LAYER.enums;
const v2Note = (t) => t('This engine is older than these controls. They apply after the next engine update.');

/** Headline: on or off, the text, and which word takes the accent. */
export function HeadlineSection({ options, update, onResetAll, anySet }) {
    const t = useT();
    const { view, set, clear } = usePanel();
    const name = { auto: t('Auto'), none: t('None'), first: t('First'), last: t('Last') };
    return (
        <>
            <CapNotice cap="look.headline" text={t('This engine is older than Studio. Placement, size and colours apply after the next engine update.')} />
            <CapNotice cap="look.headline.v2" unless="look.headline" text={v2Note(t)} />
            <SwitchRow checked={options.headline} onChange={(v) => update({ headline: v })} title={t('Headline')} hint={t('A title card shown over the clip.')} />
            {options.headline && (
                <>
                    <ElementOpacity />
                    <Field label={t('Headline text')} hint={t('The stage shows a sample title while this is empty; each clip uses its own title.')}>
                        <input
                            type="text"
                            value={options.headline_text ?? ''}
                            onChange={(e) => update({ headline_text: e.target.value })}
                            placeholder={t("Empty = each clip's own title")}
                            aria-label={t('Headline text')}
                            maxLength={80}
                            className={inputCls}
                        />
                    </Field>
                    <Row label={t('Accent word')} set={view.isSet('accent_word')} onReset={() => clear('accent_word')} hint={t('Auto picks the strongest word.')}>
                        <Choice
                            label={t('Accent word')}
                            value={view.val('accent_word')}
                            set={view.isSet('accent_word')}
                            onChange={(v) => set('accent_word', v)}
                            options={ENUMS.accent_word.map((id) => ({ id, label: name[id] }))}
                        />
                    </Row>
                    <ResetButton disabled={!anySet} onClick={onResetAll}>{t('Reset headline')}</ResetButton>
                </>
            )}
        </>
    );
}

/** Type: font, size, case, spacing, rows, alignment, the width of the block
 *  and where the headline sits. */
export function TypeSection() {
    const t = useT();
    const { view, set, clear, setPatch, g } = usePanel();
    const drag = useDrag(g);
    return (
        <>
            <CapNotice cap="look.headline.v2" text={v2Note(t)} />
            <FontRow layer="headline" unless="look.headline.v2" />
            <Num path="size" label={t('Size')} />
            <CaseRow />
            <Num path="spacing" label={t('Letter spacing')} />
            <Row label={t('Most rows')} set={view.isSet('max_lines')} onReset={() => clear('max_lines')} hint={t('One row never wraps.')}>
                <Choice
                    label={t('Most rows')}
                    value={view.val('max_lines')}
                    set={view.isSet('max_lines')}
                    onChange={(v) => set('max_lines', v)}
                    options={[{ id: 1, label: '1' }, { id: 2, label: '2' }, { id: 3, label: '3' }]}
                />
            </Row>
            <AlignRow />
            <Num path="width" label={t('Width')} />
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

/** Fill and stroke: the ink, the accent word's colour, the stroke round the letters. */
export function FillSection() {
    const t = useT();
    const { view } = usePanel();
    return (
        <>
            <CapNotice cap="look.headline.v2" text={v2Note(t)} />
            <Colour path="ink" label={t('Ink')} />
            <Colour path="accent" label={t('Accent')} />
            <Colour path="stroke.color" label={t('Stroke colour')} />
            <Num path="stroke.width" label={t('Stroke width')} hint={view.cardOn ? undefined : t('Without a card the type gets an outline.')} />
        </>
    );
}

/** Shadow and glow under the letters (and the card). */
export function ShadowSection() {
    const t = useT();
    return (
        <>
            <CapNotice cap="look.headline.v2" text={v2Note(t)} />
            <ShadowFields />
            <GlowFields />
        </>
    );
}

/** Card: off, or one card round every row. */
export function CardSection() {
    const t = useT();
    const { view, setPatch, clear } = usePanel();
    return (
        <>
            <CapNotice cap="look.headline.v2" text={v2Note(t)} />
            <Row label={t('Card')} set={view.isSet('card')} onReset={() => clear('card')}>
                <Choice
                    label={t('Card')}
                    cols={2}
                    value={view.cardOn ? 'on' : 'off'}
                    set={view.isSet('card')}
                    onChange={(m) => setPatch(cardPatch(m === 'on'))}
                    options={[{ id: 'off', label: t('Off') }, { id: 'on', label: t('On') }]}
                />
            </Row>
            {view.cardOn && (
                <>
                    <Colour path="card.color" opacity="card.opacity" label={t('Colour')} />
                    <Num path="card.pad" label={t('Padding')} />
                    <Num path="card.radius" label={t('Roundness')} />
                </>
            )}
        </>
    );
}

/** Motion: how it comes in and goes out, when it starts and how long it stays. */
export function MotionSection() {
    const t = useT();
    const { view, set, clear } = usePanel();
    const timed = view.val('seconds') > 0;
    return (
        <>
            <CapNotice cap="look.headline.v2" text={v2Note(t)} />
            <MotionFields inLabel={t('Comes in')} outLabel={t('Goes out')} enterKinds={ENUMS['enter.kind']} exitKinds={ENUMS['exit.kind']} />
            <Num path="delay_s" label={t('Starts after')} />
            <Row label={t('Stays for')} set={view.isSet('seconds')} onReset={() => clear('seconds')} hint={t('Counted from when it comes in.')}>
                <Choice
                    label={t('Stays for')}
                    cols={2}
                    value={timed ? 'seconds' : 'whole'}
                    set={view.isSet('seconds')}
                    onChange={(m) => set('seconds', m === 'whole' ? undefined : (timed ? view.val('seconds') : 3))}
                    options={[{ id: 'whole', label: t('Whole clip') }, { id: 'seconds', label: t('Seconds') }]}
                />
            </Row>
            {timed && <Num path="seconds" label={t('Seconds')} />}
        </>
    );
}
