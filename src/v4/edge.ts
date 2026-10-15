/**
 * EDGE-AWARE GLYPH SELECTION — the mechanism the reference comparison identified as missing.
 *
 * ⚠ THE MEASUREMENT THAT MOTIVATED THIS, and it contradicted the assumption I started with.
 *
 * I expected V3 to be edge-POOR against the reference. Measured on the same instrument:
 *
 *     reference PV   edge density  0.85% .. 25.59%
 *     V3             edge density  2.61% .. 38.85%   mean 8.89%
 *     V3.1           edge density  1.60% .. 23.34%   mean 6.71%
 *
 * **V3 has MORE edge density than the reference and still looks coarser.** So the difference is not how much
 * edge an image contains — it is **whether the characters are chosen to describe the edges that matter.** V3
 * picked a ramp position from ink alone, so a contour and a flat field of the same brightness received the SAME
 * character. The gradient was present in the geometry and absent from the type.
 *
 * This module supplies the missing link: a local Sobel gradient gives a DIRECTION, and the direction selects a
 * glyph from a directional family. A contour leaning 45° gets `/`; a vertical one gets `|`; a flat interior gets
 * a light texture. **The glyph now encodes the shape rather than only the darkness.**
 */
import type { GlyphFamily } from "../design/material.js";

/** Sobel gradient of a scalar field, in cell units. */
export interface Gradient { gx: number; gy: number; magnitude: number; angleDeg: number }

/**
 * DIRECTIONAL GLYPH RAMPS — ordered by the orientation of the stroke they draw.
 *
 * Each entry is the character whose stroke best matches a gradient direction. **This is the table that makes an
 * edge readable**: it is the difference between drawing a silhouette and shading a region.
 */
export const DIRECTIONAL_GLYPHS: { angle: number; glyphs: string[] }[] = [
  { angle: 0, glyphs: ["-", "=", "_"] },        // horizontal edge
  { angle: 45, glyphs: ["/", "\\", "7"] },      // NE-SW diagonal
  { angle: 90, glyphs: ["|", "!", "I"] },       // vertical edge
  { angle: 135, glyphs: ["\\", "/", "L"] },     // NW-SE diagonal
];

/** pick the directional glyph nearest a gradient angle */
export function directionalGlyph(angleDeg: number, weight: number): string {
  const a = ((angleDeg % 180) + 180) % 180;
  let best = DIRECTIONAL_GLYPHS[0]!;
  let bestD = 1e9;
  for (const d of DIRECTIONAL_GLYPHS) {
    const dist = Math.min(Math.abs(a - d.angle), 180 - Math.abs(a - d.angle));
    if (dist < bestD) { bestD = dist; best = d; }
  }
  const ramp = best.glyphs;
  const i = Math.max(0, Math.min(ramp.length - 1, Math.round(weight * (ramp.length - 1))));
  return ramp[i]!;
}

/** Sobel over a Float32 field, returning per-cell gradient and magnitude. */
export function sobel(field: Float32Array, cols: number, rows: number): Gradient[] {
  const out: Gradient[] = new Array(cols * rows);
  const at = (x: number, y: number) => field[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))] ?? 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const tl = at(x - 1, y - 1), tc = at(x, y - 1), tr = at(x + 1, y - 1);
    const ml = at(x - 1, y), mr = at(x + 1, y);
    const bl = at(x - 1, y + 1), bc = at(x, y + 1), br = at(x + 1, y + 1);
    const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
    const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
    const mag = Math.hypot(gx, gy);
    out[y * cols + x] = { gx, gy, magnitude: mag, angleDeg: (Math.atan2(gy, gx) * 180) / Math.PI };
  }
  return out;
}

/**
 * EDGE-AWARE CELL RESOLUTION.
 *
 * Every cell receives a rule: **contour** (high gradient — directional glyph at full weight), **interior**
 * (low gradient — light texture), or **void** (below threshold — nothing). The distinction is what stops a
 * figure reading as a filled block: the silhouette is drawn by DIRECTION, the inside by DENSITY.
 */
export interface EdgeCell {
  kind: "contour" | "interior" | "void";
  glyph: string;
  ink: number;
  angleDeg: number;
  magnitude: number;
}

export interface EdgeOptions {
  /** gradient magnitude above which a cell is a contour */
  contourThreshold: number;
  /** gradient magnitude below which a cell is empty */
  voidThreshold: number;
  /** the family used for contours */
  contourFamily: GlyphFamily;
  /** the family used for interiors */
  interiorFamily: GlyphFamily;
  /** how strongly the interior is thinned */
  interiorGain: number;
}

export const DEFAULT_EDGE: EdgeOptions = {
  contourThreshold: 0.16,
  voidThreshold: 0.015,
  contourFamily: "figure",
  interiorFamily: "atmosphere",
  interiorGain: 0.45,
};

/**
 * Classify a field into contour / interior / void and choose a glyph per cell.
 *
 * @param density a per-cell density in 0..1 (luminance or coverage)
 */
export function edgeClassify(density: Float32Array, cols: number, rows: number, opts: EdgeOptions = DEFAULT_EDGE): EdgeCell[] {
  const grad = sobel(density, cols, rows);
  const out: EdgeCell[] = new Array(cols * rows);
  for (let i = 0; i < density.length; i++) {
    const g = grad[i]!;
    const d = density[i]!;
    if (d <= opts.voidThreshold && g.magnitude < opts.contourThreshold) {
      out[i] = { kind: "void", glyph: " ", ink: 0, angleDeg: g.angleDeg, magnitude: g.magnitude };
    } else if (g.magnitude >= opts.contourThreshold) {
      /** a CONTOUR: the glyph is chosen by the edge direction, at full weight */
      out[i] = { kind: "contour", glyph: directionalGlyph(g.angleDeg, 0.92), ink: 0.92, angleDeg: g.angleDeg, magnitude: g.magnitude };
    } else {
      /** an INTERIOR: thinned, so the inside of a form never reads as a solid block */
      const ink = Math.min(0.5, d * opts.interiorGain);
      out[i] = { kind: "interior", glyph: ink < 0.12 ? " " : (ink < 0.24 ? "." : ink < 0.36 ? ":" : "-"), ink, angleDeg: g.angleDeg, magnitude: g.magnitude };
    }
  }
  return out;
}

/** census, for the consumption ledger */
export function edgeCensus(cells: EdgeCell[]): Record<string, number> {
  const m: Record<string, number> = { contour: 0, interior: 0, void: 0 };
  for (const c of cells) m[c.kind] = (m[c.kind] ?? 0) + 1;
  return m;
}
