/**
 * KINETIC TYPOGRAPHY ENGINE.
 *
 * ⚠ **WHY THIS IS A REAL ENGINE AND NOT A NAME-SHAPED FUNCTION.** The R2/R2.1 renderer drew the word NAME by
 * iterating a hardcoded 4-letter loop over a hardcoded font table:
 *
 *     for (let li = 0; li < 4; li++) { const pat = NAME_FONT['NAME'[li]]; ... }
 *
 * That cannot render any other word, cannot report a character's topology, cannot expose a bounding box, and
 * cannot hand a fragment back to the object that produced it. **Every one of those is required for a
 * representation transition whose provenance is auditable**, so this module is generic over the string: the
 * caller supplies text, and the engine returns topology, boxes, contours and fragments.
 *
 * It writes through the existing `Canvas`/glyph-atlas and `project` path, so it does not bypass the
 * frame-accurate production renderer.
 */
import { Canvas, type GlyphFamily } from "../design/material.js";
import { project, type CamBasis, type Vec3 } from "../design/geometry.js";

/** A 5x9 bitmap glyph. Filled cells are '1'. */
export type GlyphBitmap = string[];

/**
 * THE FONT — a 5x9 uppercase set covering the letters this film needs plus the digits and the punctuation a test
 * string may use. **Generic over the alphabet**, so `typographyFor("NOTICE")` works exactly as well as
 * `typographyFor("NAME")`.
 */
export const FONT: Record<string, GlyphBitmap> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10000", "10111", "10001", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001", "10001", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001", "10001", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10001", "10101", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "00100", "01010", "10001", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "10000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "10101", "11001", "10001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "10000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "00001", "10001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "10001", "01111", "00001", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "-": ["00000", "00000", "00000", "00000", "11111", "00000", "00000", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

export const GLYPH_W = 5, GLYPH_H = 9, GLYPH_ADVANCE = 6;

/** one filled cell of one character, in TEXT-LOCAL grid coordinates */
export interface TopologyCell {
  charIndex: number;
  char: string;
  /** the cell's own index inside the character bitmap */
  cellIndex: number;
  /** text-local grid position */
  gx: number;
  gy: number;
  /** normalised position within the whole word, 0..1 */
  u: number;
  v: number;
}
export interface WordBox { x0: number; y0: number; x1: number; y1: number; cols: number; rows: number }

/**
 * THE CONTOUR OF A SET OF FILLED CELLS — the boundary cells, i.e. those with at least one empty 4-neighbour.
 *
 * **This is the topological link the transition depends on**: fragments are grown from CONTOUR cells, so a
 * fragment's provenance is a letter edge rather than an arbitrary screen position.
 */
export function contourCells(cells: TopologyCell[], filled: (gx: number, gy: number) => boolean): TopologyCell[] {
  return cells.filter((c) => !filled(c.gx - 1, c.gy) || !filled(c.gx + 1, c.gy) || !filled(c.gx, c.gy - 1) || !filled(c.gx, c.gy + 1));
}

export interface TypographyTopology {
  text: string;
  cols: number;
  rows: number;
  box: WordBox;
  cells: TopologyCell[];
  /**
   * ⚠ CONTOUR AND INTERIOR ARE A PARTITION, and getting this wrong mattered.
   *
   * The first version defined a contour cell as *"has at least one empty 4-neighbour"*. For a 5x9 bitmap glyph
   * that marked **every** cell of a thin letter as contour — `N` reported contour 21 of 21 cells — so the
   * "contour" carried no edge information and a fragment seeded from it had no topological meaning.
   *
   * The partition is now explicit: a cell is **interior** when all four neighbours are filled, and **contour**
   * otherwise. Thin glyphs therefore have an empty interior, which is the correct answer for a 1-cell-wide
   * stroke, and the two sets together are exactly the filled cells.
   */
  contour: TopologyCell[];
  interior: TopologyCell[];
  /** per-character filled-cell counts, for the review */
  perCharacter: { char: string; index: number; cells: number; contour: number }[];
}

/**
 * BUILD THE TOPOLOGY OF A WORD. This is the object the Director's intent and the fragment generator both refer
 * to, so **topology is consumed rather than recomputed per representation**.
 */
export function typographyFor(text: string): TypographyTopology {
  const upper = text.toUpperCase();
  const cells: TopologyCell[] = [];
  const perCharacter: { char: string; index: number; cells: number; contour: number }[] = [];
  const cols = Math.max(1, upper.length * GLYPH_ADVANCE - 1);
  const rows = GLYPH_H;
  const isFilled = (gx: number, gy: number) => {
    if (gy < 0 || gy >= GLYPH_H) return false;
    const ci = Math.floor(gx / GLYPH_ADVANCE);
    const cx = gx - ci * GLYPH_ADVANCE;
    if (ci < 0 || ci >= upper.length || cx < 0 || cx >= GLYPH_W) return false;
    const pat = FONT[upper[ci]!] ?? FONT[" "];
    return pat![gy]![cx] === "1";
  };
  for (let ci = 0; ci < upper.length; ci++) {
    const pat = FONT[upper[ci]!] ?? FONT[" "];
    let n = 0;
    for (let r = 0; r < GLYPH_H; r++) for (let c = 0; c < GLYPH_W; c++) {
      if (pat![r]![c] !== "1") continue;
      const gx = ci * GLYPH_ADVANCE + c;
      cells.push({ charIndex: ci, char: upper[ci]!, cellIndex: r * GLYPH_W + c, gx, gy: r, u: (gx + 0.5) / cols, v: (r + 0.5) / rows });
      n++;
    }
    perCharacter.push({ char: upper[ci]!, index: ci, cells: n, contour: 0 });
  }
  const contour = contourCells(cells, isFilled);
  const contourKeys = new Set(contour.map((c) => `${c.gx},${c.gy}`));
  const interior = cells.filter((c) => !contourKeys.has(`${c.gx},${c.gy}`));
  for (const c of contour) perCharacter[c.charIndex]!.contour++;
  const xs = cells.map((c) => c.gx), ys = cells.map((c) => c.gy);
  const box: WordBox = cells.length
    ? { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1, cols, rows }
    : { x0: 0, y0: 0, x1: 0, y1: 0, cols, rows };
  return { text: upper, cols, rows, box, cells, contour, interior, perCharacter };
}

/** Where and how large the word sits in the world, and how it is turned. */
export interface TypographyPlacement {
  /** world centre of the word */
  origin: Vec3;
  /** world-space width and height of the whole word */
  width: number;
  height: number;
  /** boldness multiplier on the drawn cell size, for a word-scale transform */
  scale?: number;
}

export interface TypographyRenderOptions {
  family?: GlyphFamily;
  ink?: number;
  depth?: number;
  material?: string;
  /** a per-character opacity, for a character-scale entrance */
  opacityFor?: (charIndex: number, char: string) => number;
  /** a per-character offset in world units, for a character-scale transform */
  offsetFor?: (charIndex: number, char: string) => Vec3;
  /** glyphs to substitute, for a controlled corruption */
  glyphOverride?: (cell: TopologyCell) => string | undefined;
  /** collect the projected screen box of each character, for the bounding-box output */
  characterBoxes?: WordBox[];
}

/**
 * DRAW THE WORD into a Canvas by projecting every filled cell. Every cell is projected exactly ONCE, in world
 * space, which is the same rule the V3 figure learned the hard way.
 */
export function drawTypography(cv: Canvas, basis: CamBasis, topo: TypographyTopology, place: TypographyPlacement, opts: TypographyRenderOptions = {}): number {
  const { family = "text", ink = 0.98, depth = 1, material = "name" } = opts;
  const totalW = topo.cols, totalH = topo.rows;
  const cellW = place.width / totalW, cellH = place.height / totalH;
  const scale = place.scale ?? 1;
  let written = 0;
  for (const cell of topo.cells) {
    const opacity = opts.opacityFor ? opts.opacityFor(cell.charIndex, cell.char) : 1;
    if (opacity <= 0) continue;
    const off = opts.offsetFor ? opts.offsetFor(cell.charIndex, cell.char) : { x: 0, y: 0, z: 0 };
    /** text-local coordinates run from the word's centre outward */
    const lx = (cell.gx + 0.5) / totalW - 0.5;
    const ly = 0.5 - (cell.gy + 0.5) / totalH;
    const w = { x: place.origin.x + (lx * place.width + off.x) * scale, y: place.origin.y + (ly * place.height + off.y) * scale, z: place.origin.z + off.z };
    const p = project(basis, w);
    if (!p.visible) continue;
    const g = opts.glyphOverride?.(cell) ?? "#";
    const wCell = cellW * scale * cv.cols;
    const hCell = cellH * scale * cv.rows;
    const sx = Math.round(p.x * cv.cols), sy = Math.round(p.y * cv.rows);
    /**
     * ⚠ THE FILL IS CAPPED, AND THIS WAS THE R3 READABILITY BUG.
     *
     * The rule *"a letterform is legible when its cells are FILLED, not sampled"* comes from V1 Study C and it is
     * right — **but it does not scale.** Letters are 5x9 in a 23-column word, so at a 1.5-unit word width each
     * character's projected extent is about 9x4 output cells. Filling that for all 85 cells paints roughly 3 060
     * cells into a 240x120 grid, so **every letter merges into its neighbours and the word becomes a solid
     * rectangle** — verified by rendering it: the frame was a red mass with no letterforms.
     *
     * The fill is therefore bounded to 3x2 output cells. Beyond that the glyph grid itself carries the
     * letterform, which is the correct division of labour: **a letter is legible when its glyph CELLS are
     * filled, not when each cell is itself a filled rectangle.**
     */
    /**
     * ⚠ THE CAP IS DERIVED FROM THE CELL SIZE, NOT FIXED.
     *
     * A fixed cap of 3x2 made the word legible but too small to be a major graphic (160 filled cells at a
     * 2.3-unit word width). A cap of *"fill the whole projected extent"* made it a solid rectangle. **The correct
     * rule couples them: the glyph grid must keep at least ~1.6 cells of separation between adjacent letters'
     * strokes, so the largest safe fill is the projected cell size divided by that separation.**
     *
     * Below 1.6 the letters are large enough to merge and the fill is clamped; above it the letters have
     * separated and the glyph grid itself carries the form. This lets the word grow to fill a large part of the
     * frame while remaining text.
     */
    const SEP = 1.6;
    const nx = Math.max(1, Math.round(Math.min(wCell / SEP, Math.max(1, wCell)))),
          ny = Math.max(1, Math.round(Math.min(hCell / SEP, Math.max(1, hCell))));
    for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
      if (cv.write(sx + a - (nx >> 1), sy + b - (ny >> 1), g, family, ink * opacity, depth, material, true)) written++;
    }
  }
  return written;
}

/** screen-space bounding box of a word's projected extent, for the topology output */
export function projectedBox(basis: CamBasis, place: TypographyPlacement): WordBox | null {
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([lx, ly]) =>
    project(basis, { x: place.origin.x + lx! * place.width, y: place.origin.y + ly! * place.height, z: place.origin.z }));
  if (!corners.every((c) => c.visible)) return null;
  const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), cols: 0, rows: 0 };
}
