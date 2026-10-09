import { useId, useMemo } from 'react';
import { ImagePlus } from 'lucide-react';
import { cssColour, rgbOf } from '../../lib/alpha';
import { barParts } from '../../lib/layers';
import { baseName } from '../../lib/utils';
import { useClock } from './usePlayer';

const rnd = (v, d = 100) => Math.round(v * d) / d;
/** `rgb(r, g, b)` of a Look colour (its opacity is the part's own number). */
const rgbText = (colour) => `rgb(${rgbOf(colour).join(',')})`;

/**
 * The progress bar, drawn as the engine draws it: a true group. The bar is
 * painted exactly as it is at full opacity, bottom to top the picture, the
 * track, the glow, the fill (the plain bar is a dimmed track with the fill
 * up to the playhead's place in the sample; a shaped bar, one where the Look
 * sets a track, an inset, a radius or a glow, has its rounded track, its
 * halo and its fill ending where the playhead is and not on a two-pixel
 * step), and that result is blended with the picture by `bar.opacity`. An
 * SVG `<g opacity>` is that group; inside it each part has only its own
 * opacity (`barParts`: the fill's colour opacity, the track's colour opacity
 * x `track_opacity`, the glow's colour opacity x its strength). When the
 * fill's colour is see-through, the track and the glow are left out where the
 * fill is (a mask in the shape of the fill), so the picture shows through the
 * fill and not the track or the glow's body; the glow still shows outside the
 * fill's shape.
 */
export function BarLayer({ r, clock, len }) {
    const time = useClock(clock);
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
    const p = useMemo(() => barParts(r), [r]);
    const end = r.fill(len > 0 ? time / len : 0);
    const x0 = r.shaped ? r.x0 : 0;
    const trackW = r.shaped ? r.x1 - r.x0 : r.w;
    const fillW = Math.max(end - x0, 0);
    const radius = Math.min(r.radius, trackW / 2, r.thickness / 2);
    const fillRadius = Math.min(r.radius, fillW / 2, r.thickness / 2);
    const g = r.glow;
    const live = fillW > 0.5;
    const cut = p.cut && live;
    const maskId = `dc-bar-cut-${uid}`;
    const blurId = `dc-bar-glow-${uid}`;
    const glowOn = g && p.glow && live;
    const sigma = g ? g.sigma : 0;
    const blur = glowOn && sigma > 0.05;
    const gx = x0 - (g ? g.grow : 0);
    const gy = r.y - (g ? g.grow : 0);
    const gw = fillW + 2 * (g ? g.grow : 0);
    const gh = r.thickness + 2 * (g ? g.grow : 0);
    const reach = 4 * sigma;
    return (
        <svg aria-hidden width={r.w} height={r.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
                {cut && (
                    <mask id={maskId} maskUnits="userSpaceOnUse" x={-reach} y={-reach} width={r.w + 2 * reach} height={r.h + 2 * reach}>
                        <rect x={-reach} y={-reach} width={r.w + 2 * reach} height={r.h + 2 * reach} fill="#fff" />
                        <rect x={x0} y={r.y} width={fillW} height={r.thickness} rx={fillRadius} fill="#000" />
                    </mask>
                )}
                {blur && (
                    <filter id={blurId} filterUnits="userSpaceOnUse" x={gx - reach} y={gy - reach} width={gw + 2 * reach} height={gh + 2 * reach} colorInterpolationFilters="sRGB">
                        <feGaussianBlur stdDeviation={rnd(sigma)} />
                    </filter>
                )}
            </defs>
            <g opacity={rnd(p.group, 1000)}>
                <rect
                    x={x0}
                    y={r.y}
                    width={trackW}
                    height={r.thickness}
                    rx={radius}
                    fill={rgbText(p.track.color)}
                    fillOpacity={rnd(p.track.a, 1000)}
                    mask={cut ? `url(#${maskId})` : undefined}
                />
                {glowOn && (
                    <rect
                        x={gx}
                        y={gy}
                        width={gw}
                        height={gh}
                        rx={fillRadius + g.grow}
                        fill={rgbText(p.glow.color)}
                        fillOpacity={rnd(p.glow.a, 1000)}
                        filter={blur ? `url(#${blurId})` : undefined}
                        mask={cut ? `url(#${maskId})` : undefined}
                    />
                )}
                {live && <rect x={x0} y={r.y} width={fillW} height={r.thickness} rx={fillRadius} fill={rgbText(r.color)} fillOpacity={rnd(p.fill, 1000)} />}
            </g>
        </svg>
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
