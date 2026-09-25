#!/usr/bin/env node
/**
 * Embed an app payload into DigiClip Setup (see src-tauri/src/payload.rs).
 *
 *   node scripts/pack.mjs <base|-> <payload> <version> <out>
 *
 * Writes <out> = <base bytes> + <payload> + trailer. Pass `-` as base to
 * write a standalone payload file (macOS: Contents/Resources/payload.bin).
 *
 * Trailer: [version UTF-8][u32 LE version length][u64 LE payload length]["DGCSETUP"]
 */
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const [base, payload, version, out] = process.argv.slice(2);
if (!base || !payload || !version || !out) {
    console.error('usage: pack.mjs <base|-> <payload> <version> <out>');
    process.exit(64);
}
const ver = Buffer.from(version.replace(/^[vV]/, ''), 'utf8');
if (ver.length === 0 || ver.length > 64) {
    console.error(`bad version: ${JSON.stringify(version)}`);
    process.exit(64);
}
const payloadLen = statSync(payload).size;

const sink = createWriteStream(out);
const append = (file) => pipeline(createReadStream(file), sink, { end: false });
if (base !== '-') await append(base);
await append(payload);
const trailer = Buffer.alloc(ver.length + 4 + 8 + 8);
ver.copy(trailer, 0);
trailer.writeUInt32LE(ver.length, ver.length);
trailer.writeBigUInt64LE(BigInt(payloadLen), ver.length + 4);
trailer.write('DGCSETUP', ver.length + 12, 'latin1');
await new Promise((resolve, reject) => sink.end(trailer, (e) => (e ? reject(e) : resolve())));
console.log(`${out}: +${payloadLen} payload bytes, v${ver.toString()} (${statSync(out).size} bytes total)`);
