import { Card } from '../ui/card';
import { useT } from '../../lib/i18n';
import { LAYER_GROUPS } from './Layers';
import CaptionsPanel from './CaptionsPanel';
import { BarPanel, ClipsPanel, HeadlinePanel, LayoutPanel, LogoPanel, MusicPanel, SoonPanel } from './LayerPanels';

const NAMES = Object.fromEntries(LAYER_GROUPS.flatMap((g) => g.rows.map((r) => [r.id, r.name])));

/** Right pane: the controls of the picked layer. Each panel shows its own
 *  "engine is older" note, only when the engine lacks what it needs. */
export default function Inspector({ selected, look, job }) {
    const t = useT();
    const { options, update, setCaptions, setHeadline, setBar, setLogo, edit, reset, beginGesture, endGesture } = look;
    return (
        <Card className="stagger-2 flex min-h-0 w-[300px] shrink-0 flex-col overflow-hidden">
            <div className="flex h-10 shrink-0 items-center border-b border-white/[0.06] px-4">
                <h2 className="truncate text-[13px] font-semibold">{selected ? t(NAMES[selected] ?? 'Captions') : t('Nothing selected')}</h2>
            </div>
            <div className="digi-scroll min-h-0 flex-1 overflow-y-auto p-3">
                {/* Remount per layer so each arrival replays the page's rise. */}
                <div key={selected ?? 'none'} className="rise">
                    {!selected && <p className="text-[12px] text-muted-foreground">{t('Pick a layer on the stage or in the list to edit it.')}</p>}
                    {selected === 'captions' && <CaptionsPanel options={options} update={update} setCaptions={setCaptions} reset={reset} gesture={{ begin: beginGesture, end: endGesture }} />}
                    {selected === 'headline' && <HeadlinePanel options={options} update={update} setHeadline={setHeadline} reset={reset} job={job} />}
                    {selected === 'bar' && <BarPanel options={options} update={update} setBar={setBar} reset={reset} />}
                    {selected === 'logo' && <LogoPanel options={options} update={update} setLogo={setLogo} edit={edit} reset={reset} />}
                    {selected === 'music' && <MusicPanel options={options} update={update} />}
                    {selected === 'layout' && <LayoutPanel options={options} update={update} />}
                    {selected === 'clips' && <ClipsPanel options={options} update={update} />}
                    {(selected === 'camera' || selected === 'effects') && <SoonPanel />}
                </div>
            </div>
        </Card>
    );
}
