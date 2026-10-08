import { useId, useState } from 'react';
import { activeExtraPatch, keywordGlowPatch } from '../../../lib/captionEffective';
import { useT } from '../../../lib/i18n';
import { CapNotice } from '../Notice';
import { Choice, Tabs, ToggleRow } from './choices';
import { useCap } from './context';
import CurveRow from './CurvePicker';
import { Colour, Num, Row, SubHead } from './inputs';
import StickyStrip from './StickyStrip';
import WordPreview from './WordPreview';

/** Controls that sit under a switch, indented under a hairline. */
const Nest = ({ children }) => <div className="space-y-3 border-l border-white/[0.07] pl-3">{children}</div>;

function Upcoming() {
    const t = useT();
    return (
        <>
            <Colour path="words.upcoming.color" label={t('Colour')} />
            <Num path="words.upcoming.opacity" label={t('Opacity')} />
            <Num path="words.upcoming.scale" label={t('Size')} />
            <Num path="words.upcoming.blur" label={t('Blur')} />
        </>
    );
}

function Speaking() {
    const t = useT();
    const { view, setPatch } = useCap();
    const a = view.c.words?.active ?? {};
    return (
        <>
            <Colour path="words.active.color" label={t('Colour')} />
            <Num path="words.active.opacity" label={t('Opacity')} />
            <Num path="words.active.scale" label={t('Size')} />
            <Num path="words.active.lift" label={t('Lift')} />
            <Num path="words.active.rotate" label={t('Tilt')} />
            <ToggleRow label={t('Own stroke')} checked={!!a.stroke} set={!!a.stroke} onChange={(on) => setPatch(activeExtraPatch(view, 'stroke', on))} />
            {a.stroke && (
                <Nest>
                    <Colour path="words.active.stroke.color" label={t('Colour')} />
                    <Num path="words.active.stroke.width" label={t('Width')} />
                </Nest>
            )}
            <ToggleRow label={t('Own glow')} checked={!!a.glow} set={!!a.glow} onChange={(on) => setPatch(activeExtraPatch(view, 'glow', on))} />
            {a.glow && (
                <Nest>
                    <Colour path="words.active.glow.color" label={t('Colour')} />
                    <Num path="words.active.glow.size" label={t('Size')} />
                    <Num path="words.active.glow.strength" label={t('Strength')} />
                </Nest>
            )}
            <ToggleRow label={t('Own box')} checked={!!a.box} set={!!a.box} onChange={(on) => setPatch(activeExtraPatch(view, 'box', on))} />
            {a.box && (
                <Nest>
                    <Colour path="words.active.box.color" label={t('Colour')} />
                    <Num path="words.active.box.opacity" label={t('Opacity')} />
                    <Num path="words.active.box.radius" label={t('Roundness')} />
                </Nest>
            )}
        </>
    );
}

function Spoken() {
    const t = useT();
    return (
        <>
            <Colour path="words.spoken.color" label={t('Colour')} />
            <Num path="words.spoken.opacity" label={t('Opacity')} />
            <Num path="words.spoken.scale" label={t('Size')} />
            <Num path="words.spoken.blur" label={t('Blur')} />
        </>
    );
}

function Keyword() {
    const t = useT();
    const { view, setPatch } = useCap();
    const on = !!view.c.words?.keyword?.glow;
    return (
        <>
            <Colour path="words.keyword.color" label={t('Colour')} />
            <p className="-mt-1.5 text-[11px] leading-snug text-muted-foreground">{t('Replaces the Speaking colour on emphasis words.')}</p>
            <Num path="words.keyword.scale" label={t('Size')} />
            <ToggleRow label={t('Glow')} checked={on} set={on} onChange={(v) => setPatch(keywordGlowPatch(v))} />
            {on && (
                <Nest>
                    <Colour path="words.keyword.glow.color" label={t('Colour')} />
                    <Num path="words.keyword.glow.size" label={t('Size')} />
                    <Num path="words.keyword.glow.strength" label={t('Strength')} />
                </Nest>
            )}
        </>
    );
}

const STATES = { upcoming: Upcoming, active: Speaking, spoken: Spoken, keyword: Keyword };

/** Words: how a line reveals, what each state of a word looks like, and how
 *  a word moves from one state to the next, with a loop to watch it. */
export default function WordsSection() {
    const t = useT();
    const { view, set, clear } = useCap();
    const [which, setWhich] = useState('active');
    const uid = useId();
    const w = view.c.words ?? {};
    const tabs = [
        { id: 'upcoming', label: t('Upcoming') },
        { id: 'active', label: t('Speaking') },
        { id: 'spoken', label: t('Spoken') },
        { id: 'keyword', label: t('Keyword') },
    ];
    const marked = [
        w.upcoming && 'upcoming',
        (w.active || view.c.active !== undefined) && 'active',
        w.spoken && 'spoken',
        (w.keyword || view.c.accent !== undefined) && 'keyword',
    ].filter(Boolean);
    const State = STATES[which];
    const sweep = view.val('words.fill') === 'sweep';
    return (
        <>
            <CapNotice cap="look.captions.words" text={t('This engine is older than these controls. They apply after the next engine update.')} />

            <Row label={t('Reveal')} set={view.isSet('words.mode')} onReset={() => clear('words.mode')}>
                <Choice
                    label={t('Reveal')}
                    wrap
                    value={view.val('words.mode')}
                    set={view.isSet('words.mode')}
                    onChange={(v) => set('words.mode', v)}
                    options={[
                        { id: 'all', label: t('Whole line') },
                        { id: 'build', label: t('Build up') },
                        { id: 'single', label: t('One word') },
                    ]}
                />
            </Row>

            <Tabs label={t('Word state')} idBase={uid} cols={2} value={which} options={tabs} marked={marked} onChange={setWhich} />
            <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${which}`} className="space-y-3">
                <State />
            </div>

            {/* One block: the strip sticks inside it and leaves with its end. */}
            <div className="space-y-3">
                <SubHead>{t('Transition')}</SubHead>
                <StickyStrip>
                    <WordPreview />
                </StickyStrip>
                <Row
                    label={t('Fill')}
                    set={view.isSet('words.fill')}
                    onReset={() => clear('words.fill')}
                    hint={t('Sweep paints a word as it is said. It needs a Speaking colour that differs from Upcoming.')}
                >
                    <Choice
                        label={t('Fill')}
                        value={view.val('words.fill')}
                        set={view.isSet('words.fill')}
                        onChange={(v) => set('words.fill', v)}
                        options={[{ id: 'snap', label: t('Instant') }, { id: 'sweep', label: t('Sweep') }]}
                    />
                </Row>
                <Num path="words.attack_ms" label={t('Light up')} hint={sweep ? t('Sweep ignores this.') : undefined} />
                <CurveRow path="words.attack_ease" label={t('Light up curve')} />
                <Num path="words.hold_ms" label={t('Hold')} />
                <Num path="words.release_ms" label={t('Fade back')} hint={t('How long a word takes to settle after it is said')} />
                <CurveRow path="words.release_ease" label={t('Fade back curve')} />
            </div>
        </>
    );
}
