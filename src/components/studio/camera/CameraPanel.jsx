import { useMemo } from 'react';
import { cameraView, feelPatch, sceneChanged, sceneReset } from '../../../lib/sceneEffective';
import { CAMERA_LAYER } from '../../../lib/sceneSections';
import { FEEL_LABEL } from '../../../lib/sceneSummary';
import { useT } from '../../../lib/i18n';
import { SwitchRow } from '../../digiclip/JobOptions';
import { CapNotice } from '../Notice';
import { Choice } from '../kit/choices';
import { usePanel } from '../kit/context';
import { Num, Row } from '../kit/inputs';
import LayerSections from '../kit/LayerSections';
import { useOlder, useScenePanel } from '../kit/useScene';
import FeelPreview from './FeelPreview';

const def = CAMERA_LAYER;
const NONE = {};

/** Movement: how the camera follows the speaker, with a small preview of it. */
function MovementSection() {
    const t = useT();
    const older = useOlder();
    const { view, setPatch, clear } = usePanel();
    const feel = view.val('feel');
    const hints = {
        locked: t('One framing per shot, held.'),
        steady: t('Moves less, and more gently.'),
        smooth: t('The usual camera.'),
        lively: t('Follows quickly and closely.'),
    };
    return (
        <>
            <CapNotice cap="look.camera" text={older} />
            <FeelPreview feel={feel} />
            <Row label={t('Camera feel')} set={view.isSet('feel')} onReset={() => clear('feel')} hint={hints[feel]}>
                <Choice
                    label={t('Camera feel')}
                    wrap
                    value={feel}
                    set={view.isSet('feel')}
                    onChange={(v) => setPatch(feelPatch(v))}
                    options={def.enums.feel.map((id) => ({ id, label: t(FEEL_LABEL[id]) }))}
                />
            </Row>
        </>
    );
}

/** Zoom: how tight a single face is framed. */
function ZoomSection() {
    const t = useT();
    const older = useOlder();
    return (
        <>
            <CapNotice cap="look.camera" text={older} />
            <Num path="zoom" label={t('How tight')} hint={t('The stage only shows tighter; real zoom follows faces.')} />
        </>
    );
}

/** Punch-ins: the quick zoom on loud words (the switch is the Home popover's too). */
function PunchSection({ options, update }) {
    const t = useT();
    const older = useOlder();
    return (
        <>
            <CapNotice cap="look.camera" text={older} />
            <SwitchRow checked={options.punch} onChange={(v) => update({ punch: v })} title={t('Punch-ins')} hint={t('Brief zoom on loud words.')} />
            <Num path="punch" label={t('Strength')} disabled={!options.punch} hint={t('At 100% a punch-in does nothing.')} />
        </>
    );
}

/** The Camera inspector: Movement, Zoom and Punch-ins over `look.camera`. */
export default function CameraPanel({ look }) {
    const t = useT();
    const { options, update, setCamera } = look;
    const L = options.look?.camera ?? NONE;
    const view = useMemo(() => cameraView(L, { punch: options.punch }), [L, options.punch]);
    const ctx = useScenePanel(def, view, setCamera, look);
    const titles = { movement: t('Movement'), zoom: t('Zoom'), punch: t('Punch-ins') };
    const bodies = { movement: <MovementSection />, zoom: <ZoomSection />, punch: <PunchSection options={options} update={update} /> };
    return (
        <LayerSections
            def={def}
            ctx={ctx}
            sections={def.ids.map((id) => [id, titles[id], bodies[id]])}
            changed={(id) => sceneChanged(def, L, options, id)}
            onReset={(id) => setCamera(sceneReset(def, L, id).patch)}
        />
    );
}
