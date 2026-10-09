// The camera-feel preview's model: a dot that wanders, fidgets, walks and
// changes shot, and a camera frame that follows it with a feel's tuning.
// The tuning is the engine's: digiclip-rs `camera.rs` `CamCfg::default` and
// `CamCfg::for_feel` (dead bands, safe bands, response times, handoff glides
// scaled per feel; `locked` holds one framing per shot). The follow itself is
// a drawing, not the planner: a dead band round the framing that costs
// nothing, a lag that grows with the response time, a limit on how far the
// camera may trail, and a cut on every new shot. Pure; the clock is the
// caller's.

export const FEEL_IDS = ['locked', 'steady', 'smooth', 'lively'];

/** `CamCfg::default`, the values the feels scale. */
export const CAM_BASE = {
    bandX: 0.05, bandY: 0.04, bandZ: 0.06, safeX: 0.2, safeY: 0.14, panS: 1.3, tiltS: 1.8, zoomS: 2.6,
    glideBase: 0.5, glidePer: 0.6, glideMin: 0.6, glideMax: 1.2,
};
/** Per feel: dead bands, safe bands, response, glides (`for_feel`). */
const SCALES = { steady: [1.8, 1.25, 1.5, 1.3], lively: [0.5, 0.8, 0.5, 0.7] };

/** The tuning of a feel, the engine's numbers. Locked and smooth keep the
 *  defaults (locked also holds). */
export function feelParams(feel) {
    const [band, safe, resp, glide] = SCALES[feel] ?? [1, 1, 1, 1];
    const b = CAM_BASE;
    return {
        feel: FEEL_IDS.includes(feel) ? feel : 'smooth',
        hold: feel === 'locked',
        bandX: b.bandX * band,
        bandY: b.bandY * band,
        bandZ: b.bandZ * band,
        safeX: b.safeX * safe,
        safeY: b.safeY * safe,
        panS: b.panS * resp,
        tiltS: b.tiltS * resp,
        zoomS: b.zoomS * resp,
        glideBase: b.glideBase * glide,
        glidePer: b.glidePer * glide,
        glideMin: b.glideMin * glide,
        glideMax: b.glideMax * glide,
    };
}

/** The picture the preview draws in (px), the camera's frame, and how long
 *  the loop and each shot run (s). */
export const BOX = { w: 240, h: 96 };
export const FRAME = { w: 44, h: 78 };
export const LOOP_S = 9;
export const SHOT_S = 4.5;
/** Seconds of lag per second of response time (the drawing's follow). */
const LAG = 0.4;

/** Where the dot is `t` seconds into the loop (px in `BOX`) and which shot
 *  it is in. A slow wander, a fidget, and in the first shot a walk. */
export function dotAt(t) {
    const u = ((t % LOOP_S) + LOOP_S) % LOOP_S;
    const shot = u < SHOT_S ? 0 : 1;
    const s = u - shot * SHOT_S;
    const base = shot === 0 ? [70, 46] : [168, 52];
    // The walk: 1.6 s across 70 px, eased, in the first shot only.
    const walk = shot === 0 ? 70 * smooth((s - 1.4) / 1.6) : 0;
    const x = base[0] + walk + 9 * Math.sin(s * 1.1 + shot) + 2.6 * Math.sin(s * 7.3) + 1.4 * Math.sin(s * 11.9 + 1);
    const y = base[1] + 7 * Math.sin(s * 0.8 + 2 * shot) + 1.8 * Math.sin(s * 6.1 + 0.5);
    return { x, y, shot };
}

function smooth(x) {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
}

/** The framing a locked camera picks for a shot: the middle of where the dot
 *  goes in it. */
export function shotFraming(shot) {
    let x = 0;
    let y = 0;
    const n = 90;
    for (let i = 0; i < n; i += 1) {
        const d = dotAt(shot * SHOT_S + ((i + 0.5) / n) * SHOT_S);
        x += d.x;
        y += d.y;
    }
    return { x: x / n, y: y / n };
}

/** A camera at rest on the first shot. */
export const startCam = (p) => (p.hold ? shotFraming(0) : { x: dotAt(0).x, y: dotAt(0).y });

/**
 * One step of the camera (`cam`, the centre of its frame) after `dt`
 * seconds, following the dot `d` (from `dotAt`) with the tuning `p`. A new
 * shot cuts. Locked holds. Otherwise the dot may roam inside the dead band
 * (a fraction of the frame) without moving the camera; outside it the camera
 * eases toward the band's edge with a lag proportional to the response time,
 * and may never trail by more than the safe band.
 */
export function stepCam(cam, d, dt, p, cut = false) {
    if (cut) return p.hold ? shotFraming(d.shot) : { x: d.x, y: d.y };
    if (p.hold) return cam;
    const axis = (c, target, frame, band, safe, resp) => {
        const gap = target - c;
        const room = band * frame;
        const want = Math.abs(gap) <= room ? c : target - Math.sign(gap) * room;
        const next = c + (want - c) * (1 - Math.exp(-dt / (resp * LAG)));
        const lim = safe * frame;
        return Math.min(target + lim, Math.max(target - lim, next));
    };
    return {
        x: axis(cam.x, d.x, FRAME.w, p.bandX, p.safeX, p.panS),
        y: axis(cam.y, d.y, FRAME.h, p.bandY, p.safeY, p.tiltS),
    };
}

/** The whole loop, stepped at `dt`: `{t, dot, cam}` per step. */
export function simulate(feel, seconds = LOOP_S, dt = 1 / 30) {
    const p = feelParams(feel);
    let cam = startCam(p);
    let prev = dotAt(0);
    const out = [{ t: 0, dot: prev, cam }];
    for (let t = dt; t <= seconds + 1e-9; t += dt) {
        const dot = dotAt(t);
        cam = stepCam(cam, dot, dt, p, dot.shot !== prev.shot);
        out.push({ t, dot, cam });
        prev = dot;
    }
    return out;
}

/** The frame's top-left corner for a camera centre, kept inside the picture. */
export const frameOrigin = (cam) => ({
    x: Math.min(BOX.w - FRAME.w, Math.max(0, cam.x - FRAME.w / 2)),
    y: Math.min(BOX.h - FRAME.h, Math.max(0, cam.y - FRAME.h / 2)),
});

/** A moment where the feels differ (the camera has been left behind by the
 *  walk): what a preview shows when it does not move. */
export const STILL_AT = 2.9;
