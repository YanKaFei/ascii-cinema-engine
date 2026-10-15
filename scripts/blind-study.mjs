/**
 * BLIND RECOGNITION STUDY — the artefact a SECOND INSPECTOR needs.
 *
 * WHY THIS EXISTS. Phase 3.1's central claim is that a viewer can understand what is physically present
 * without reading the JSON. **Every CLEAR rating in this phase was given by the agent that wrote the
 * forms.** That is not a verification, and no amount of further rendering can fix it — it needs a
 * different person.
 *
 * So this script builds everything that person needs and nothing that biases them:
 *
 *   - every still at FULL RESOLUTION, never rescaled, because a glyph subpixel must be >= 1 screen pixel
 *     or thin contours dissolve (this cost rounds 21-23 to establish)
 *   - a shuffled filename order, so the sequence does not give the answer away
 *   - NO labels, NO titles, NO captions on the images
 *   - the expected answers in a SEPARATE FILE the inspector must not open first
 *
 *   node scripts/blind-study.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'out', 'phase31');
const BLIND = path.join(SRC, 'blind');

/** Each item: a still, and the one-line answer a viewer should produce unprompted. */
const ITEMS = [
  ['fn-1-person',        'a PERSON, alone'],
  ['fn-2-name',          'a ROOM with a NAME written on its wall'],
  ['fn-3-name-subject',  'a ROOM, a NAME, and a PERSON standing in front of the name'],
  ['fn-4-erasure',       'a ROOM and a PERSON, with the name ERASED'],
  ['fn-5-loss',          'a PERSON alone, with the environment gone'],
  ['arc-1-room',         'a ROOM, empty'],
  ['arc-4-erasure',      'a ROOM and a PERSON, with the name ERASED'],
  ['arc-6-absence',      'virtually NOTHING -- an intentional void'],
];

// --- minimal PNG decode/encode, so this script has no dependencies -------------
function decode(buf) {
  let pos = 8, idat = Buffer.alloc(0), w = 0, h = 0, ct = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat = Buffer.concat([idat, data]);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(idat);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let i = 0, prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[i++]; const line = Buffer.from(raw.subarray(i, i + stride)); i += stride;
    if (ft === 1) for (let x = ch; x < stride; x++) line[x] = (line[x] + line[x - ch]) & 255;
    else if (ft === 2) for (let x = 0; x < stride; x++) line[x] = (line[x] + prev[x]) & 255;
    else if (ft === 3) for (let x = 0; x < stride; x++) line[x] = (line[x] + (((x >= ch ? line[x - ch] : 0) + prev[x]) >> 1)) & 255;
    else if (ft === 4) for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    line.copy(out, y * stride); prev = line;
  }
  return { w, h, ch, px: out };
}
function encode(w, h, rgb) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 3)] = 0; rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3); }
  const comp = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', comp), chunk('IEND', Buffer.alloc(0))]);
}

/** A deterministic shuffle, so the order is reproducible but not the source order. */
function shuffled(n) {
  const a = [...Array(n).keys()];
  let s = 20260101;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

await mkdir(BLIND, { recursive: true });
const order = shuffled(ITEMS.length);
const key = [];
for (let n = 0; n < order.length; n++) {
  const [stem, expect] = ITEMS[order[n]];
  const { w, h, ch, px } = decode(await readFile(path.join(SRC, `${stem}.png`)));
  // FULL RESOLUTION, no rescaling of any kind
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0, o = 0; i < w * h; i++, o += 3) { rgb[o] = px[i * ch]; rgb[o + 1] = px[i * ch + 1]; rgb[o + 2] = px[i * ch + 2]; }
  const name = `still-${String(n + 1).padStart(2, '0')}.png`;
  await writeFile(path.join(BLIND, name), encode(w, h, rgb));
  key.push({ still: name, source: stem, expected: expect, width: w, height: h, glyphSubpixel: `${(w / 240 / 5).toFixed(2)} x ${(h / 120 / 9).toFixed(2)} px` });
}
await writeFile(path.join(BLIND, 'ANSWER-KEY.json'), JSON.stringify(key, null, 2));

console.log(`wrote ${key.length} stills at FULL resolution to out/phase31/blind/`);
for (const k of key) console.log(`  ${k.still}  ${k.width}x${k.height}  subpixel ${k.glyphSubpixel}`);
console.log('\nthe answer key is out/phase31/blind/ANSWER-KEY.json — an inspector must NOT open it first');
