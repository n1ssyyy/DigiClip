import { useMemo } from 'react';
import { aspectList } from '../../../lib/look';
import { BAR_DEFAULT_COLOR, resolveBar } from '../../../lib/layers';
import { barView, layerClear, layerPatch } from '../../../lib/layerEffective';
import { BAR_LAYER, numSpec, numUi, sectionHasOverrides, sectionResetPatch } from '../../../lib/layerSections';
import { useT } from '../../../lib/i18n';
import { SwitchRow } from '../../digiclip/fields';
import { ResetButton } from '../Field';
import { CapNotice } from '../Notice';
import { Choice } from '../kit/choices';
import { panelValue, usePanel } from '../kit/context';
import { Colour, Num, Row } from '../kit/inputs';
import { GlowFields } from '../kit/FxSections';
import LayerSections, { useLayerLabels } from '../kit/LayerSections';

const def = BAR_LAYER;
const NONE = {};
const HEX = /^#[0-9a-f]{6}$/i;
const v2Note = (t) => t('This engine is older than these controls. They apply after the next engine update.');

/** Bar: on or off, which edge, how thick, what colour. The colour is the
 *  flat one (the Look's own replaces it). */
function BarSection({ options, update, edit, onResetAll, anySet }) {
    const t = useT();
    const { view, set, clear } = usePanel();
    return (
        <>
            <CapNotice cap="look.bar" text={t('This engine is older than Studio. Placement and thickness apply after the next engine update.')} />
            <SwitchRow checked={options.progress_bar} onChange={(v) => update({ progress_bar: v })} title={t('Progress bar')} hint={t('Thin bar filling along the bottom.')} />
            {options.progress_bar && (
                <>
                    <Row label={t('Place')} set={view.isSet('pos')} onReset={() => clear('pos')} hint={t('Drag the bar on the stage past the middle to flip it.')}>
                        <Choice
                            label={t('Bar place')}
                            value={view.val('pos')}
                            set={view.isSet('pos')}
                            onChange={(v) => set('pos', v === 'top' ? 'top' : undefined)}
                            options={def.enums.pos.map((id) => ({ id, label: id === 'top' ? t('Top') : t('Bottom') }))}
                        />
                    </Row>
                    <Num path="height" label={t('Thickness')} />
                    <Colour
                        path="color"
                        label={t('Bar colour')}
                        onPick={(v) => update({ bar_color: v })}
                        onBack={() => edit({ bar_color: BAR_DEFAULT_COLOR }, { bar: { color: undefined } })}
                    />
                    <ResetButton disabled={!anySet} onClick={onResetAll}>{t('Reset progress bar')}</ResetButton>
                </>
            )}
        </>
    );
}

/** Track: the part not yet filled. Nothing set keeps the plain dimming. */
function TrackSection() {
    const t = useT();
    return (
        <>
            <CapNotice cap="look.bar.v2" text={v2Note(t)} />
            <Colour path="track" label={t('Colour')} />
            <Num path="track_opacity" label={t('Opacity')} />
        </>
    );
}

/** Shape: the margin round the bar and how round its ends are. */
function ShapeSection() {
    const t = useT();
    return (
        <>
            <CapNotice cap="look.bar.v2" text={v2Note(t)} />
            <Num path="inset" label={t('Margin')} />
            <Num path="radius" label={t('Roundness')} />
        </>
    );
}

function GlowSection() {
    const t = useT();
    return (
        <>
            <CapNotice cap="look.bar.v2" text={v2Note(t)} />
            <GlowFields />
        </>
    );
}

/**
 * The Progress bar inspector: sections (Bar, Track, Shape, Glow) over the
 * Look's bar section, with the flat colour option.
 */
export default function BarPanel({ look }) {
    const t = useT();
    const labels = useLayerLabels();
    const { options, update, setBar, edit, beginGesture, endGesture } = look;
    const L = options.look?.bar ?? NONE;
    const canvas = aspectList(options.aspect)[0];
    const flat = HEX.test(options.bar_color ?? '') ? options.bar_color : BAR_DEFAULT_COLOR;
    const flatSet = flat.toUpperCase() !== BAR_DEFAULT_COLOR;
    const view = useMemo(() => barView(resolveBar(canvas, flat, L), L, flatSet), [canvas, flat, L, flatSet]);
    const g = useMemo(() => ({ begin: beginGesture, end: endGesture }), [beginGesture, endGesture]);
    const ctx = useMemo(() => panelValue({
        view,
        g,
        setPatch: setBar,
        patchFor: layerPatch,
        clearFor: layerClear,
        num: (path) => ({ spec: numSpec(def, path), ui: numUi(def, path) }),
        labels,
    }), [view, g, setBar, labels]);

    const sections = [
        ['bar', t('Bar'), <BarSection key="bar" options={options} update={update} edit={edit} anySet={Object.keys(L).length > 0 || flatSet} onResetAll={() => edit(flatSet ? { bar_color: BAR_DEFAULT_COLOR } : undefined, { bar: Object.assign({}, ...def.ids.map((id) => sectionResetPatch(def, L, id))) })} />],
    ];
    // The rest waits for the bar to be on.
    if (options.progress_bar) {
        sections.push(
            ['track', t('Track'), <TrackSection key="track" />],
            ['shape', t('Shape'), <ShapeSection key="shape" />],
            ['glow', t('Glow'), <GlowSection key="glow" />],
        );
    }
    return (
        <LayerSections
            def={def}
            ctx={ctx}
            sections={sections}
            changed={(id) => sectionHasOverrides(def, L, id) || (id === 'bar' && flatSet)}
            onReset={(id) => edit(id === 'bar' ? { bar_color: BAR_DEFAULT_COLOR } : undefined, { bar: sectionResetPatch(def, L, id) })}
        />
    );
}
