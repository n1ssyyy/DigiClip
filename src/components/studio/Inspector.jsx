import { Card } from '../ui/card';
import { useStore } from '../../lib/socket';
import { useT } from '../../lib/i18n';
import { LAYER_GROUPS } from './Layers';
import CaptionsPanel from './CaptionsPanel';
import { BarPanel, ClipsPanel, HeadlinePanel, LayoutPanel, LogoPanel, MusicPanel, SoonPanel } from './LayerPanels';

const NAMES = Object.fromEntries(LAYER_GROUPS.flatMap((g) => g.rows.map((r) => [r.id, r.name])));

/** Right pane: the controls of the picked layer. */
export default function Inspector({ selected, options, update, setCaptions, reset }) {
    const t = useT();
    const caps = useStore((s) => s.caps);
    const old = !caps.includes('look');
    return (
        <Card className="stagger-2 flex min-h-0 w-[300px] shrink-0 flex-col overflow-hidden">
            <div className="flex h-10 shrink-0 items-center border-b border-white/[0.06] px-4">
                <h2 className="truncate text-[13px] font-semibold">{t(NAMES[selected] ?? 'Captions')}</h2>
            </div>
            <div className="digi-scroll min-h-0 flex-1 overflow-y-auto p-3">
                {old && (
                    <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
                        {t('This engine is older than Studio. Position, size, colour and the new motions apply after the next engine update.')}
                    </p>
                )}
                {/* Remount per layer so each arrival replays the page's rise. */}
                <div key={selected} className="rise">
                    {selected === 'captions' && <CaptionsPanel options={options} update={update} setCaptions={setCaptions} reset={reset} />}
                    {selected === 'headline' && <HeadlinePanel options={options} update={update} />}
                    {selected === 'bar' && <BarPanel options={options} update={update} />}
                    {selected === 'logo' && <LogoPanel options={options} update={update} />}
                    {selected === 'music' && <MusicPanel options={options} update={update} />}
                    {selected === 'layout' && <LayoutPanel options={options} update={update} />}
                    {selected === 'clips' && <ClipsPanel options={options} update={update} />}
                    {(selected === 'camera' || selected === 'effects') && <SoonPanel />}
                </div>
            </div>
        </Card>
    );
}
