// Where the first-run tour puts things. Pure: the tour measures the window,
// the target and its own card, and this decides the rest. All numbers are in
// pixels, in one coordinate space (the tour's overlay): a rect is
// { left, top, width, height }, a window is { w, h }, a card is { w, h }.

export const PAD = 8; // clear space the cut-out leaves around the target
export const GAP = 14; // between the cut-out and the card
export const MARGIN = 12; // the card never comes closer than this to a window edge

/** Order the sides are tried in; the first with room for the card wins. */
export const SIDES = ['right', 'left', 'bottom', 'top'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
const num = (v) => (Number.isFinite(v) ? v : 0);

/** The part of `rect` inside the window, or null when none of it is. */
export function clipToWindow(rect, win) {
    if (!rect || !win) return null;
    const left = Math.max(0, num(rect.left));
    const top = Math.max(0, num(rect.top));
    const right = Math.min(win.w, num(rect.left) + num(rect.width));
    const bottom = Math.min(win.h, num(rect.top) + num(rect.height));
    return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

/** Can the target be pointed at? It must have a size and be mostly inside the
 *  window (a target scrolled away, collapsed or hidden is not). */
export function isPointable(rect, win) {
    if (!rect || !win || !(win.w > 0) || !(win.h > 0)) return false;
    if (!(rect.width >= 1) || !(rect.height >= 1)) return false;
    const seen = clipToWindow(rect, win);
    return !!seen && seen.width * seen.height >= 0.5 * rect.width * rect.height;
}

/** The clear window cut into the dimming: the target plus `pad`, clamped to
 *  the window so it never reaches past an edge. */
export function cutOut(rect, win, pad = PAD) {
    const left = Math.floor(clamp(num(rect.left) - pad, 0, win.w));
    const top = Math.floor(clamp(num(rect.top) - pad, 0, win.h));
    const right = Math.ceil(clamp(num(rect.left) + num(rect.width) + pad, 0, win.w));
    const bottom = Math.ceil(clamp(num(rect.top) + num(rect.height) + pad, 0, win.h));
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Does `card` (at its left / top) overlap `hole`? Touching is not overlap. */
export function overlaps(a, b) {
    return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

/**
 * Where the card goes.
 * @param {{win: {w:number,h:number}, rect: object|null, card: {w:number,h:number},
 *          pad?: number, gap?: number, margin?: number}} a
 * @returns {{side: 'right'|'left'|'bottom'|'top'|'center', left: number, top: number,
 *            w: number, h: number, hole: object|null}}
 *  `hole` is the cut-out (null when nothing is pointed at). The card is as
 *  large as asked, but never larger than the window less its margins. With
 *  a target it sits on the first side that has room for it, centred on the
 *  target along that side and pushed back inside the window; with none, or
 *  when the target cannot be pointed at, or no side has room (a target as big
 *  as the window), it is centred in the window and nothing is highlighted:
 *  the card is never placed over what it points at.
 */
export function placeCard({ win, rect, card, pad = PAD, gap = GAP, margin = MARGIN }) {
    const w = Math.max(0, Math.min(num(card.w), win.w - 2 * margin));
    const h = Math.max(0, Math.min(num(card.h), win.h - 2 * margin));
    const at = (side, left, top, hole) => ({ side, left: Math.round(left), top: Math.round(top), w, h, hole });
    const centred = () => at('center', Math.max(margin, (win.w - w) / 2), Math.max(margin, (win.h - h) / 2), null);
    if (!isPointable(rect, win)) return centred();

    const hole = cutOut(rect, win, pad);
    const cx = hole.left + hole.width / 2;
    const cy = hole.top + hole.height / 2;
    const alongX = clamp(cx - w / 2, margin, win.w - margin - w);
    const alongY = clamp(cy - h / 2, margin, win.h - margin - h);
    const room = {
        right: win.w - margin - (hole.left + hole.width + gap),
        left: hole.left - gap - margin,
        bottom: win.h - margin - (hole.top + hole.height + gap),
        top: hole.top - gap - margin,
    };
    for (const side of SIDES) {
        const need = side === 'right' || side === 'left' ? w : h;
        if (room[side] < need) continue;
        if (side === 'right') return at(side, hole.left + hole.width + gap, alongY, hole);
        if (side === 'left') return at(side, Math.floor(hole.left - gap - w), alongY, hole);
        if (side === 'bottom') return at(side, alongX, hole.top + hole.height + gap, hole);
        return at(side, alongX, Math.floor(hole.top - gap - h), hole);
    }
    return centred();
}
