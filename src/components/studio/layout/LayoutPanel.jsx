import { useMemo } from 'react';
import { CANVASES } from '../../../lib/captionStyles';
import { aspectList } from '../../../lib/look';
import { splitFits } from '../../../lib/layoutLook';
import { layoutView, sceneChanged, sceneReset } from '../../../lib/sceneEffective';
import { LAYOUT_LAYER } from '../../../lib/sceneSections';
import { LAYOUT_LABEL } from '../../../lib/sceneSummary';
import { useT } from '../../../lib/i18n';
import { LAYOUT_OPTS, SwitchRow } from '../../digiclip/fields';
import { CapNotice } from '../Notice';
import { Choice } from '../kit/choices';
import { usePanel } from '../kit/context';
import { Num, Row } from '../kit/inputs';
import LayerSections from '../kit/LayerSections';
import { useOlder, useScenePanel } from '../kit/useScene';
import LayoutDiagram from './LayoutDiagrams';

const def = LAYOUT_LAYER;
const NONE = {};

/** Layout: one camera, two people stacked, or whichever fits the clip. */
function LayoutSection({ update }) {
    const t = useT();
    const { view } = usePanel();
    const set = view.layout !== 'single';
    const tip = LAYOUT_OPTS.find((o) => o.id === view.layout)?.tip;
    return (
        <Row label={t('Layout')} set={set} onReset={() => update({ layout: 'single' })} hint={tip && t(tip)}>
            <Choice
                label={t('Layout')}
                size="tall"
                wrap
                value={view.layout}
                set={set}
                onChange={(v) => update({ layout: v })}
                options={LAYOUT_OPTS.map((o) => ({
                    id: o.id,
                    aria: t(LAYOUT_LABEL[o.id]),
                    label: (
                        <>
                            <LayoutDiagram id={o.id} />
                            <span className="block w-full">{t(LAYOUT_LABEL[o.id])}</span>
                        </>
                    ),
                }))}
            />
        </Row>
    );
}

/** Split: where the seam between the two people sits. */
function SplitSection({ fits }) {
    const t = useT();
    const older = useOlder();
    const { view } = usePanel();
    let hint = t('Used by Split and Auto.');
    if (view.layout === 'split') hint = fits ? t('Drag the seam on the stage.') : t('Split needs a tall shape: 9:16 or 4:5.');
    return (
        <>
            <CapNotice cap="look.layout" text={older} />
            <Num path="split" label={t('Seam position')} disabled={!view.splitLive} hint={hint} />
        </>
    );
}

/** Cuts: the white dip between the parts of a compilation. */
function CutsSection({ options, update }) {
    const t = useT();
    return <SwitchRow checked={options.merge_flash} onChange={(v) => update({ merge_flash: v })} title={t('Merge flashes')} hint={t('White dips between compilation parts.')} />;
}

/** The Layout inspector: Layout, Split and Cuts. The layout choice and the
 *  merge flash are the Home popover's options; the seam is `look.layout`. */
export default function LayoutPanel({ look }) {
    const t = useT();
    const { options, update, edit, setLayout } = look;
    const L = options.look?.layout ?? NONE;
    const view = useMemo(() => layoutView(L, { layout: options.layout }), [L, options.layout]);
    const ctx = useScenePanel(def, view, setLayout, look);
    const fits = splitFits(CANVASES[aspectList(options.aspect)[0]] ?? CANVASES['9:16']);
    const titles = { layout: t('Layout'), split: t('Split'), cuts: t('Cuts') };
    const bodies = {
        layout: <LayoutSection update={update} />,
        split: <SplitSection fits={fits} />,
        cuts: <CutsSection options={options} update={update} />,
    };
    return (
        <LayerSections
            def={def}
            ctx={ctx}
            sections={def.ids.map((id) => [id, titles[id], bodies[id]])}
            changed={(id) => sceneChanged(def, L, options, id)}
            onReset={(id) => {
                const { flat, patch } = sceneReset(def, L, id);
                edit(flat, { layout: patch });
            }}
        />
    );
}
