/**
 * GLYPH RASTERISER.
 *
 * ⚠ **WHY THIS IS NOT V2's RASTERISER.** V2 mapped a glyph to a grey value and filled its whole cell, so every
 * character was the same MARK at a different BRIGHTNESS. That destroys the visual identity of the character set:
 * `#` and `@` render identically at different greys, and a figure built from `#` reads as a filled block.
 *
 * Here a cell is filled from the **actual glyph atlas bitmap**, so the character's SHAPE is what appears on
 * screen. Density is expressed by choosing a character whose coverage matches, not by dimming one character.
 *
 * Line weight can be modulated by drawing the glyph's mask with a **dilation** so heavier families read heavier
 * at the same nominal ink — a letterpress-like behaviour that gives the material system real contrast.
 */
import { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } from "../glyphs/atlas.js";

export interface Rgb { r: number; g: number; b: number }
export interface RasterOptions {
  width: number;
  height: number;
  cols: number;
  rows: number;
  background: Rgb;
  ink: Rgb;
  accent: Rgb;
  /** glyphs in this set are drawn in the accent colour */
  accentChars?: Set<string>;
  /** per-cell weight multiplier, from an ink value; 1 = full */
  weightOf?: (cx: number, cy: number) => number;
  /** horizontal dilation in subpixels, for line weight */
  dilate?: (cx: number, cy: number) => number;
}

export function rasterise(lines: string[], o: RasterOptions): { width: number; height: number; data: Buffer } {
  const img = { width: o.width, height: o.height, data: Buffer.alloc(o.width * o.height * 3) };
  const cw = o.width / o.cols, chh = o.height / o.rows;
  /** background */
  for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) {
    const i = (y * o.width + x) * 3;
    img.data[i] = o.background.r; img.data[i + 1] = o.background.g; img.data[i + 2] = o.background.b;
  }
  for (let cy = 0; cy < o.rows; cy++) {
    const line = lines[cy] ?? "";
    for (let cx = 0; cx < o.cols; cx++) {
      const ch = line[cx];
      if (!ch || ch === " ") continue;
      const g = GLYPH_BY_CODE[ch.charCodeAt(0)];
      if (!g) continue;
      const accent = o.accentChars?.has(ch) ?? false;
      const col = accent ? o.accent : o.ink;
      const w = Math.max(0, Math.min(1, o.weightOf ? o.weightOf(cx, cy) : 1));
      const dil = Math.max(0, o.dilate ? o.dilate(cx, cy) : 0);
      for (let py = 0; py < GLYPH_H; py++) {
        const mask = g.rows[py];
        if (!mask) continue;
        for (let px = 0; px < GLYPH_W; px++) {
          if (!(mask & (1 << (GLYPH_W - 1 - px)))) continue;
          /** the glyph's subpixel expands to its share of the cell */
          const x0f = cx * cw + (px * cw) / GLYPH_W - (dil * cw) / GLYPH_W;
          const x1f = cx * cw + ((px + 1) * cw) / GLYPH_W + (dil * cw) / GLYPH_W;
          const y0f = cy * chh + (py * chh) / GLYPH_H;
          const y1f = cy * chh + ((py + 1) * chh) / GLYPH_H;
          const x0 = Math.round(x0f), x1 = Math.round(x1f), y0 = Math.round(y0f), y1 = Math.round(y1f);
          for (let y = y0; y < y1; y++) {
            if (y < 0 || y >= o.height) continue;
            for (let x = x0; x < x1; x++) {
              if (x < 0 || x >= o.width) continue;
              const i = (y * o.width + x) * 3;
              const br = o.background, cr = col;
              img.data[i] = Math.round(br.r + (cr.r - br.r) * w);
              img.data[i + 1] = Math.round(br.g + (cr.g - br.g) * w);
              img.data[i + 2] = Math.round(br.b + (cr.b - br.b) * w);
            }
          }
        }
      }
    }
  }
  return img;
}
