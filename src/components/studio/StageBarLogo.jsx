import { ImagePlus } from 'lucide-react';
import { cssColour } from '../../lib/alpha';
import { baseName } from '../../lib/utils';
import { useClock } from './usePlayer';

const rnd = (v, d = 100) => Math.round(v * d) / d;
/** The plain bar's dimmed track. */
const PLAIN_TRACK = 0.55;

/**
 * The progress bar. The plain bar is the engine's dimmed track with the fill
 * up to the playhead's place in the sample, as it always was. A shaped bar
 * (the Look sets a track, an inset, a radius or a glow) is drawn in the
 * engine's order: the track, the glow, the fill, the fill ending where the
 * playhead is and not on a two-pixel step.
 *
 * Each part is laid over the picture with its own opacity (straight alpha, no
 * group): the fill's colour opacity x `bar.opacity`, the track's colour
 * opacity x `track_opacity` x `bar.opacity`, the glow's colour opacity x
 * its strength x `bar.opacity`.
 */
export function BarLayer({ r, clock, len }) {
    const time = useClock(clock);
    const end = r.fill(len > 0 ? time / len : 0);
    const el = r.opacity;
    if (!r.shaped) {
        return (
            <div aria-hidden style={{ position: 'absolute', left: 0, top: r.y, width: r.w, height: r.thickness, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', inset: 0, background: `rgb(0 0 0 / ${Math.round(PLAIN_TRACK * el * 1000) / 1000})` }} />
                <div style={{ position: 'absolute', left: 0, top: 0, width: end, height: '100%', background: cssColour(r.color, el) }} />
            </div>
        );
    }
    const trackW = r.x1 - r.x0;
    const fillW = Math.max(end - r.x0, 0);
    const radius = Math.min(r.radius, trackW / 2, r.thickness / 2);
    const fillRadius = Math.min(r.radius, fillW / 2, r.thickness / 2);
    const g = r.glow;
    return (
        <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: r.w, height: r.h, pointerEvents: 'none' }}>
            <div
                style={{
                    position: 'absolute',
                    left: r.x0,
                    top: r.y,
                    width: trackW,
                    height: r.thickness,
                    borderRadius: radius,
                    background: r.track ? cssColour(r.track.color, r.track.opacity, el) : `rgb(0 0 0 / ${Math.round(PLAIN_TRACK * el * 1000) / 1000})`,
                }}
            />
            {g && fillW > 0.5 && (
                <div
                    style={{
                        position: 'absolute',
                        left: r.x0 - g.grow,
                        top: r.y - g.grow,
                        width: fillW + 2 * g.grow,
                        height: r.thickness + 2 * g.grow,
                        borderRadius: fillRadius + g.grow,
                        background: cssColour(g.color, Math.min(g.strength, 1), el),
                        filter: g.sigma > 0.05 ? `blur(${rnd(g.sigma)}px)` : undefined,
                    }}
                />
            )}
            {fillW > 0.5 && (
                <div style={{ position: 'absolute', left: r.x0, top: r.y, width: fillW, height: r.thickness, borderRadius: fillRadius, background: cssColour(r.color, el) }} />
            )}
        </div>
    );
}

/**
 * The logo. The image itself cannot be read here (the app has no
 * permission to load a local file into the page), so a neutral box of the
 * engine's size stands in, with the file's name. A turned logo turns the
 * stand-in about its centre; a shadow and a glow are copies of the box under
 * it (the shadow moved on the screen, not in the logo's own turn; the glow
 * grown and blurred), and the opacity is the whole stack's (a group: the one
 * place where that is right). The shadow's own opacity is its colour's x
 * `shadow.opacity`, the glow's its colour's x its strength.
 */
export function LogoLayer({ r, file }) {
    const { w, h } = r.box;
    const unit = Math.min(w, h);
    const turn = r.rotate ? `rotate(${r.rotate}deg)` : '';
    const copy = { position: 'absolute', inset: 0 };
    const { shadow: sh, glow: gl } = r;
    return (
        <div
            aria-hidden
            style={{
                position: 'absolute',
                left: r.x,
                top: r.y,
                width: w,
                height: h,
                opacity: r.opacity,
                pointerEvents: 'none',
                userSelect: 'none',
            }}
        >
            {sh && (
                <div
                    style={{
                        ...copy,
                        background: cssColour(sh.color, sh.opacity),
                        filter: sh.blur > 0.05 ? `blur(${rnd(sh.blur)}px)` : undefined,
                        transform: `translate(${rnd(sh.x)}px, ${rnd(sh.y)}px) ${turn}`.trim(),
                    }}
                />
            )}
            {gl && (
                <div
                    style={{
                        ...copy,
                        inset: -gl.grow,
                        background: cssColour(gl.color, Math.min(gl.strength, 1)),
                        filter: gl.sigma > 0.05 ? `blur(${rnd(gl.sigma)}px)` : undefined,
                        transform: turn || undefined,
                    }}
                />
            )}
            <div
                style={{
                    ...copy,
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: unit * 0.06,
                    padding: unit * 0.06,
                    border: `${Math.max(2, unit * 0.02)}px dashed rgb(255 255 255 / 0.5)`,
                    background: 'rgb(255 255 255 / 0.12)',
                    color: 'rgb(255 255 255 / 0.8)',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: Math.max(10, unit * 0.1),
                    lineHeight: 1.2,
                    transform: turn || undefined,
                }}
            >
                <ImagePlus size={Math.max(12, unit * 0.28)} strokeWidth={1.5} />
                <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{baseName(file)}</span>
            </div>
        </div>
    );
}
