import { useMemo } from 'react';
import { aspectList } from '../../../lib/look';
import { resolveLogo } from '../../../lib/layers';
import { layerClear, layerPatch, logoView } from '../../../lib/layerEffective';
import { LOGO_LAYER, numSpec, numUi, sectionHasOverrides, sectionResetPatch } from '../../../lib/layerSections';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/utils';
import { CORNER_OPTS, LogoSlot, Seg } from '../../digiclip/fields';
import Field, { ResetButton } from '../Field';
import PlaceField from '../PlaceField';
import { CapNotice } from '../Notice';
import { panelValue, usePanel } from '../kit/context';
import { ElementOpacity, Num, useDrag } from '../kit/inputs';
import { GlowFields, ShadowFields } from '../kit/FxSections';
import LayerSections, { useLayerLabels } from '../kit/LayerSections';

const def = LOGO_LAYER;
const NONE = {};
const v2Note = (t) => t('This engine is older than these controls. They apply after the next engine update.');

/** The controls that need a logo file look off until there is one. */
function Needs({ file, children }) {
    return (
        <div className={cn('space-y-3', !file && 'pointer-events-none opacity-50')} aria-disabled={!file || undefined}>
            {children}
        </div>
    );
}

/** Logo: the file, a corner or a free place, size and opacity. */
function LogoSection({ options, update, edit, onResetAll, anySet }) {
    const t = useT();
    const { view, setPatch, clear, g } = usePanel();
    const drag = useDrag(g);
    const file = !!options.logo;
    const r = view.r;
    return (
        <>
            <CapNotice cap="look.logo" text={t('This engine is older than Studio. Placement, size and opacity apply after the next engine update.')} />
            <Field label={t('Logo')} hint={file ? undefined : t('Add a logo to place and size it.')}>
                <LogoSlot value={options.logo} onChange={(v) => update({ logo: v })} />
            </Field>
            <Needs file={file}>
                <ElementOpacity always disabled={!file} />
                <Field label={t('Logo corner')}>
                    <Seg
                        label={t('Logo corner')}
                        value={r.free ? null : (options.logo_pos ?? 'tr')}
                        options={CORNER_OPTS}
                        onChange={(v) => edit({ logo_pos: v }, { logo: { x: undefined, y: undefined } })}
                    />
                </Field>
                <PlaceField
                    center={r.center}
                    placed={r.free}
                    grid={false}
                    disabled={!file}
                    onPlace={(x, y) => setPatch({ x, y })}
                    onReset={() => clear('x')}
                    onDragStart={drag.begin}
                    onDragEnd={drag.end}
                />
                <Num path="size" label={t('Size')} disabled={!file} />
            </Needs>
            <ResetButton disabled={!anySet} onClick={onResetAll}>{t('Reset logo')}</ResetButton>
        </>
    );
}

/** Rotation: a slight turn about the logo's centre. */
function RotationSection({ file }) {
    const t = useT();
    return (
        <>
            <CapNotice cap="look.logo.v2" text={v2Note(t)} />
            <Needs file={file}>
                <Num path="rotate" label={t('Angle')} disabled={!file} />
            </Needs>
        </>
    );
}

/** Shadow and glow behind the logo. */
function ShadowSection({ file }) {
    const t = useT();
    return (
        <>
            <CapNotice cap="look.logo.v2" text={v2Note(t)} />
            <Needs file={file}>
                <ShadowFields />
                <GlowFields />
            </Needs>
        </>
    );
}

/**
 * The Logo inspector: sections (Logo, Rotation, Shadow and glow) over the
 * Look's logo section; without a file the controls wait, as they always did.
 */
export default function LogoPanel({ look }) {
    const t = useT();
    const labels = useLayerLabels();
    const { options, update, setLogo, edit, beginGesture, endGesture } = look;
    const L = options.look?.logo ?? NONE;
    const canvas = aspectList(options.aspect)[0];
    const file = !!options.logo;
    const view = useMemo(() => logoView(resolveLogo(canvas, options.logo_pos, L, null), L), [canvas, options.logo_pos, L]);
    const g = useMemo(() => ({ begin: beginGesture, end: endGesture }), [beginGesture, endGesture]);
    const ctx = useMemo(() => panelValue({
        view,
        g,
        setPatch: setLogo,
        patchFor: layerPatch,
        clearFor: layerClear,
        num: (path) => ({ spec: numSpec(def, path), ui: numUi(def, path) }),
        labels,
    }), [view, g, setLogo, labels]);

    const resetAll = () => edit(undefined, { logo: Object.assign({}, ...def.ids.map((id) => sectionResetPatch(def, L, id))) });
    const sections = [
        ['logo', t('Logo'), <LogoSection key="logo" options={options} update={update} edit={edit} anySet={Object.keys(L).length > 0} onResetAll={resetAll} />],
        ['rotation', t('Rotation'), <RotationSection key="rotation" file={file} />],
        ['shadow', t('Shadow and glow'), <ShadowSection key="shadow" file={file} />],
    ];
    return (
        <LayerSections
            def={def}
            ctx={ctx}
            sections={sections}
            changed={(id) => sectionHasOverrides(def, L, id)}
            onReset={(id) => setLogo(sectionResetPatch(def, L, id))}
        />
    );
}
