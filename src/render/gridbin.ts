/**
 * Character-grid interchange format ("gridbin").
 *
 * This is the seam between the engine and Remotion. The engine is a pure Node
 * program that decides, for every character cell of every frame, which ASCII glyph
 * is drawn and how brightly. It serialises that decision here. Remotion then does
 * what a video renderer should do: composite, grade and encode — without
 * recomputing any cinematography, and without ever touching a bitmap.
 *
 * Layout (little-endian):
 *   magic    : 4 bytes  "ACGR"
 *   version  : uint32
 *   cols     : uint32      glyph columns
 *   rows     : uint32      glyph rows
 *   frameN   : uint32
 *   glyphN   : uint32      palette size
 *   reserved : uint32
 *   glyphs   : glyphN * 6 bytes { code:u8, rows[5]:u8 }   rows are 5-bit masks, 9 rows
 *   codes    : frameN * cols * rows bytes   ASCII code per cell (32 = blank)
 *   values   : frameN * cols * rows bytes   ink per cell, 0..255
 *
 * Deliberately dependency-free and byte-exact, so the same `.bin` renders the same
 * pixels in Node, in Chromium, and on any other machine.
 */

import { GLYPH_BY_CODE } from "../glyphs/atlas.js";

export const GRIDBIN_MAGIC = "ACGR";
export const GRIDBIN_VERSION = 1;
export const GRIDBIN_HEADER_BYTES = 30;
export const GLYPH_ROWS = 9;
export const GLYPH_COLS = 5;

export interface GlyphEntry {
  code: number;
  /** 9 row masks, low 5 bits each. Serialised as 5 bytes: rows 5..8 are always 0 for this atlas. */
  rows: number[];
}

export interface GridSequence {
  cols: number;
  rows: number;
  frameCount: number;
  glyphs: GlyphEntry[];
  codes: Uint8Array;
  values: Uint8Array;
}

function blankRows(): number[] {
  return [0, 0, 0, 0, 0, 0, 0, 0, 0];
}

/**
 * Build a glyph palette covering the master ramp. Index is by ASCII code, so the
 * "codes" plane can be a plain byte array with no indirection.
 */
export function buildGlyphPalette(ramp: string): GlyphEntry[] {
  const glyphs: GlyphEntry[] = [{ code: 32, rows: blankRows() }];
  const seen = new Set<number>([32]);
  for (const ch of ramp) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) continue;
    if (seen.has(code)) continue;
    const g = GLYPH_BY_CODE[code];
    if (!g || g.ch.charCodeAt(0) !== code) continue;
    seen.add(code);
    glyphs.push({ code, rows: [...g.rows] });
  }
  glyphs.sort((a, b) => a.code - b.code);
  if (glyphs.length > 255) throw new Error(`glyph palette too large: ${glyphs.length} (max 255)`);
  return glyphs;
}

export function encodeGridSequence(seq: GridSequence): Uint8Array {
  const { cols, rows, frameCount, glyphs, codes, values } = seq;
  const cellsPerFrame = cols * rows;
  const expected = frameCount * cellsPerFrame;
  if (codes.length !== expected) throw new Error(`codes length ${codes.length} != ${expected}`);
  if (values.length !== expected) throw new Error(`values length ${values.length} != ${expected}`);
  if (glyphs.length === 0 || glyphs.length > 255) throw new Error(`invalid glyph count ${glyphs.length}`);

  const out = new Uint8Array(GRIDBIN_HEADER_BYTES + glyphs.length * 6 + expected * 2);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) out[i] = GRIDBIN_MAGIC.charCodeAt(i);
  dv.setUint32(4, GRIDBIN_VERSION, true);
  dv.setUint32(8, cols, true);
  dv.setUint32(12, rows, true);
  dv.setUint32(16, frameCount, true);
  dv.setUint32(20, glyphs.length, true);
  dv.setUint32(24, 0, true);
  dv.setUint32(26, 0, true);

  let o = GRIDBIN_HEADER_BYTES;
  for (const g of glyphs) {
    out[o++] = g.code & 0xff;
    for (let r = 0; r < 5; r++) out[o++] = (g.rows[r] ?? 0) & 0xff;
  }
  out.set(codes, o);
  o += expected;
  out.set(values, o);
  return out;
}

export function decodeGridSequence(buf: Uint8Array): GridSequence {
  if (buf.length < GRIDBIN_HEADER_BYTES) throw new Error("gridbin: truncated header");
  const magic = String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!);
  if (magic !== GRIDBIN_MAGIC) throw new Error(`gridbin: bad magic ${JSON.stringify(magic)}`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = dv.getUint32(4, true);
  if (version !== GRIDBIN_VERSION) throw new Error(`gridbin: unsupported version ${version}`);
  const cols = dv.getUint32(8, true);
  const rows = dv.getUint32(12, true);
  const frameCount = dv.getUint32(16, true);
  const glyphN = dv.getUint32(20, true);

  const expected = GRIDBIN_HEADER_BYTES + glyphN * 6 + frameCount * cols * rows * 2;
  if (buf.length !== expected) throw new Error(`gridbin: length ${buf.length} != expected ${expected}`);

  const glyphs: GlyphEntry[] = [];
  let o = GRIDBIN_HEADER_BYTES;
  for (let i = 0; i < glyphN; i++) {
    const code = buf[o++]!;
    const packed: number[] = [];
    for (let r = 0; r < 5; r++) packed.push(buf[o++]!);
    glyphs.push({ code, rows: [packed[0]!, packed[1]!, packed[2]!, packed[3]!, packed[4]!, 0, 0, 0, 0] });
  }
  const cells = frameCount * cols * rows;
  const codes = buf.subarray(o, o + cells);
  o += cells;
  const values = buf.subarray(o, o + cells);
  return { cols, rows, frameCount, glyphs, codes, values };
}

export function gridbinSummary(seq: GridSequence): {
  cols: number;
  rows: number;
  frameCount: number;
  glyphCount: number;
  bytes: number;
  nonBlankCells: number;
} {
  let nonBlank = 0;
  for (let i = 0; i < seq.codes.length; i++) if (seq.codes[i] !== 32) nonBlank++;
  return {
    cols: seq.cols,
    rows: seq.rows,
    frameCount: seq.frameCount,
    glyphCount: seq.glyphs.length,
    bytes: GRIDBIN_HEADER_BYTES + seq.glyphs.length * 6 + seq.codes.length * 2,
    nonBlankCells: nonBlank,
  };
}

/** CRC32 over the frame planes, used as the determinism witness in the report. */
export function framePlaneDigest(seq: GridSequence, frameIndex: number): number {
  const cells = seq.cols * seq.rows;
  const o = frameIndex * cells;
  let crc = 0xffffffff;
  for (let i = 0; i < cells; i++) {
    crc = crc32Step(crc, seq.codes[o + i]!);
    crc = crc32Step(crc, seq.values[o + i]!);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32Step(crc: number, byte: number): number {
  return (CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
}
