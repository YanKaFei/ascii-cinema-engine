/**
 * Shared contract between the engine and the Remotion composition.
 *
 * The engine writes `grid.bin` next to a manifest that describes it. Remotion reads
 * both out of the public directory and never recomputes cinematography: it only
 * rasterizes glyphs, applies the grade, and lets Chromium encode.
 */

export const GRIDBIN_MAGIC = "ACGR";
export const GRIDBIN_VERSION = 1;
export const GRIDBIN_HEADER_BYTES = 30;

/** Must match src/render/tone.ts. The two stages share one tone curve. */
export const INK_GAMMA = 1 / 1.85;

export interface GlyphEntry {
  code: number;
  rows: number[];
}

export interface GridSequence {
  cols: number;
  rows: number;
  frameCount: number;
  glyphs: GlyphEntry[];
  /** ASCII code -> glyph, for O(1) lookup in the per-cell hot loop */
  glyphByCode: Map<number, GlyphEntry>;
  /** frameCount * cols * rows, ASCII code per cell (32 = blank) */
  codes: Uint8Array;
  /** frameCount * cols * rows, ink 0..255 */
  values: Uint8Array;
}

export function decodeGridbin(buf: Uint8Array): GridSequence {
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
  const glyphByCode = new Map<number, GlyphEntry>();
  for (const g of glyphs) glyphByCode.set(g.code, g);
  return { cols, rows, frameCount, glyphs, glyphByCode, codes, values };
}

export function inkToDisplayUnit(ink: number): number {
  if (ink <= 0) return 0;
  if (ink >= 1) return 1;
  return Math.pow(ink, INK_GAMMA);
}

export interface GridMeta {
  slug: string;
  fps: number;
  width: number;
  height: number;
  durationInSeconds: number;
  cellW: number;
  cellH: number;
  gridFrameCount: number;
  gridStartFrame: number;
  totalFilmFrames: number;
}

export interface LookMeta {
  background: string;
  foreground: string;
  filmGrain: number;
  vignette: number;
  chromaticBloom: number;
  scanlineHz: number;
}
