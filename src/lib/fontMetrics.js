// The vertical metrics of a font file, read the way the engine does
// (digiclip-rs `src/captions/metrics.rs`): head.unitsPerEm, OS/2 winAscent and
// winDescent (hhea when the OS/2 table has none) and hhea ascender / descender.
// The stage sizes type from them (`fontBox`), so a font the app does not ship
// draws at the size libass would give it. Pure: takes bytes, no DOM.

const u16 = (v, o) => (o >= 0 && o + 2 <= v.byteLength ? v.getUint16(o) : null);
const i16 = (v, o) => (o >= 0 && o + 2 <= v.byteLength ? v.getInt16(o) : null);

/** Offset and length of table `tag` in an sfnt, or null. */
function table(v, tag) {
    const n = u16(v, 4) ?? 0;
    for (let i = 0; i < n; i++) {
        const r = 12 + i * 16;
        if (r + 16 > v.byteLength) return null;
        let name = '';
        for (let k = 0; k < 4; k++) name += String.fromCharCode(v.getUint8(r + k));
        if (name === tag) return { o: v.getUint32(r + 8), l: v.getUint32(r + 12) };
    }
    return null;
}

/**
 * `{ upm, winA, winD, hheaA, hheaD }` of a .ttf / .otf given as an
 * ArrayBuffer or a typed array; null when it is not a font this can read.
 */
export function parseFontMetrics(bytes) {
    let v;
    try {
        v = bytes instanceof DataView ? bytes
            : ArrayBuffer.isView(bytes) ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
                : new DataView(bytes);
    } catch {
        return null;
    }
    const magic = v.byteLength >= 4 ? v.getUint32(0) : 0;
    if (magic !== 0x00010000 && magic !== 0x4f54544f && magic !== 0x74727565) return null;
    const head = table(v, 'head');
    const hhea = table(v, 'hhea');
    if (!head || head.l < 54 || !hhea || hhea.l < 36) return null;
    const upm = u16(v, head.o + 18);
    if (!upm || upm < 16 || upm > 16384) return null;
    const hheaA = Math.max(0, i16(v, hhea.o + 4) ?? 0);
    const hheaD = Math.abs(i16(v, hhea.o + 6) ?? 0);
    const os2 = table(v, 'OS/2');
    let winA = os2 && os2.l >= 78 ? u16(v, os2.o + 74) ?? 0 : 0;
    let winD = os2 && os2.l >= 78 ? u16(v, os2.o + 76) ?? 0 : 0;
    if (winA + winD <= 0) {
        winA = hheaA;
        winD = hheaD;
    }
    if (winA + winD <= 0) return null;
    return { upm, winA, winD, hheaA, hheaD };
}
