/**
 * Rasterizer: turns a character grid into a raw RGB framebuffer.
 *
 * This is the only place that turns glyphs into pixels. It knows nothing about
 * scenes, cameras or time, which keeps the "ASCII -> pixels" step independently
 * testable and keeps Remotion free of any per-frame compute.
 *
 * Output is 3 bytes per pixel (RGB) because the visual language is monochrome on
 * black; the Remotion layer owns colour and grade.
 */

import { GLYPH_BY_CODE, GLYPH_H, GLYPH_W } from "../glyphs/atlas.js";

export interface FrameBuffer {
  width: number;
  height: number;
  /** RGB8, row-major, tightly packed */
  data: Uint8Array;
}

export function createFrameBuffer(width: number, height: number): FrameBuffer {
  return { width, height, data: new Uint8Array(width * height * 3) };
}

export function clearFrameBuffer(fb: FrameBuffer, r: number, g: number, b: number): void {
  const { data } = fb;
  for (let i = 0; i < data.length; i += 3) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/** A cell of the character grid: which glyph, and how brightly it burns. */
export interface Cell {
  /** ASCII code point, always within 0x20..0x7E */
  code: number;
  /** ink intensity, 0..1 — scales the glyph's colour */
  ink: number;
}

export interface CharGrid {
  cols: number;
  rows: number;
  cells: Cell[];
}

export function createCharGrid(cols: number, rows: number): CharGrid {
  const cells: Cell[] = new Array(cols * rows);
  for (let i = 0; i < cells.length; i++) cells[i] = { code: 32, ink: 0 };
  return { cols, rows, cells };
}

export function resetCharGrid(grid: CharGrid): void {
  for (let i = 0; i < grid.cells.length; i++) {
    const c = grid.cells[i]!;
    c.code = 32;
    c.ink = 0;
  }
}

/**
 * Draw one glyph into the framebuffer at cell coordinates.
 * `value` is the final 0..1 luminance for this cell (already exposed/curved).
 */
export function blitGlyph(
  fb: FrameBuffer,
  grid: CharGrid,
  cellW: number,
  cellH: number,
  cx: number,
  cy: number,
  code: number,
  value: number,
): void {
  if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) return;
  if (value <= 0) return;
  if (code <= 32) return;

  const glyph = GLYPH_BY_CODE[code];
  if (!glyph || glyph.ch.charCodeAt(0) !== code) return;

  const level = value >= 1 ? 255 : Math.round(value * 255);
  const px0 = cx * cellW;
  const py0 = cy * cellH;
  const { data, width, height } = fb;

  for (let r = 0; r < GLYPH_H; r++) {
    const mask = glyph.rows[r]!;
    if (mask === 0) continue;
    const py = py0 + r;
    if (py < 0 || py >= height) continue;
    const rowBase = py * width * 3;
    for (let c = 0; c < GLYPH_W; c++) {
      if ((mask & (1 << (GLYPH_W - 1 - c))) === 0) continue;
      const px = px0 + c;
      if (px < 0 || px >= width) continue;
      const o = rowBase + px * 3;
      data[o] = level;
      data[o + 1] = level;
      data[o + 2] = level;
    }
  }
}

/** Blit the whole grid in one pass. */
export function rasterize(
  fb: FrameBuffer,
  grid: CharGrid,
  cellW: number,
  cellH: number,
  background: number,
  dither: boolean,
): void {
  const bg = Math.round(Math.max(0, Math.min(1, background)) * 255);
  clearFrameBuffer(fb, bg, bg, bg);

  // 4x4 ordered Bayer matrix; used only for the 1-bit-ish dithering path that
  // sells "single lit character in a void".
  const bayer = BAYER4;

  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = grid.cells[y * grid.cols + x]!;
      if (cell.code <= 32 || cell.ink <= 0) continue;
      let v = cell.ink;
      if (dither) {
        const t = (bayer[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
        // only dither the very faint tail; solid ink must stay solid
        if (v < 0.5) v = v > t ? v : 0;
      }
      if (v <= 0) continue;
      blitGlyph(fb, grid, cellW, cellH, x, y, cell.code, v);
    }
  }
}

export const BAYER4: number[] = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

/**
 * Debug helper: render the grid back to text. Used by unit tests and by the
 * contact-sheet manifest so the report can quote what was actually on screen.
 */
export function gridToText(grid: CharGrid, inkThreshold = 0.08): string {
  const lines: string[] = [];
  for (let y = 0; y < grid.rows; y++) {
    let line = "";
    for (let x = 0; x < grid.cols; x++) {
      const cell = grid.cells[y * grid.cols + x]!;
      line += cell.ink >= inkThreshold && cell.code > 32 ? String.fromCharCode(cell.code) : " ";
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines.join("\n");
}

/** Fraction of cells carrying ink above the threshold. */
export function inkCoverage(grid: CharGrid, threshold = 0.08): number {
  let lit = 0;
  for (const cell of grid.cells) if (cell.ink >= threshold && cell.code > 32) lit++;
  return lit / (grid.cols * grid.rows);
}
