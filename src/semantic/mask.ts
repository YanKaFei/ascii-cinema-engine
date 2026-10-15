/**
 * SEMANTIC PREVIEW RENDERER — a monochrome mask of what the shot IS, before any ASCII exists.
 *
 * WHY THIS LAYER EXISTS, and it is a measured failure rather than a theory.
 *
 * Phase 3.1 ended with an external blind review reading **"难以理解"** — unintelligible. The pipeline was
 * correct and verified; the image did not communicate. The architectural conclusion is that **ASCII
 * conversion happens too early**:
 *
 *     OLD   semantic object -> low-level ASCII geometry -> glyph field -> hope recognition survives
 *     NEW   semantic object -> RECOGNISABLE FORM -> composition -> high-res mask -> ASCII represents it
 *
 * ASCII must be the *representation* of a readable image. It must not be asked to *invent* the image.
 *
 * This file draws the readable image. It produces a plain high-resolution coverage mask — **no glyphs, no
 * particles, no noise, no post** — so that readability can be judged **before** any ASCII exists:
 *
 *     if the mask is unreadable   -> FORM FAILURE, and ASCII must not run
 *     if the mask reads, ASCII does not -> ASCII REPRESENTATION FAILURE
 *
 * That distinction is the whole point, and it is the one Phase 3.1 could not make.
 */

export interface Mask {
  width: number;
  height: number;
  /** 0..1 coverage per pixel, row-major */
  data: Float32Array;
}

export function createMask(width: number, height: number): Mask {
  return { width, height, data: new Float32Array(width * height) };
}

/** Coverage at a pixel, 0 outside the image. */
export function at(m: Mask, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return 0;
  return m.data[y * m.width + x]!;
}

/** Fill with max — shapes accumulate without double-darkening overlaps. */
function put(m: Mask, x: number, y: number, v: number): void {
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return;
  const i = y * m.width + x;
  if (v > m.data[i]!) m.data[i] = v;
}

/**
 * A filled disc, with a 1-pixel antialiased edge.
 *
 * Discs and capsules are the whole vocabulary here, and that is deliberate: **a person at 1920x1080 is
 * about 300 pixels tall, so a limb is 20-40 pixels wide.** At that size a capsule reads as a limb the way
 * a run of glyphs never could, and the mask costs nothing to compute.
 */
export function disc(m: Mask, cx: number, cy: number, r: number, v = 1): void {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(m.width - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(m.height - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) put(m, x, y, v);
      else if (d2 <= (r + 1) * (r + 1)) {
        const d = Math.sqrt(d2);
        put(m, x, y, v * Math.max(0, 1 - (d - r)));
      }
    }
  }
}

/** A capsule between two points — the limb primitive. */
export function capsule(m: Mask, x0: number, y0: number, x1: number, y1: number, r: number, v = 1): void {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.ceil(len));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(m, x0 + dx * t, y0 + dy * t, r, v);
  }
}

/** An axis-aligned filled rectangle. */
export function rect(m: Mask, x0: number, y0: number, x1: number, y1: number, v = 1): void {
  const ax = Math.max(0, Math.floor(Math.min(x0, x1))), bx = Math.min(m.width - 1, Math.ceil(Math.max(x0, x1)));
  const ay = Math.max(0, Math.floor(Math.min(y0, y1))), by = Math.min(m.height - 1, Math.ceil(Math.max(y0, y1)));
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) put(m, x, y, v);
}

/** A filled convex polygon, by even-odd scanline at 4x vertical supersampling. */
export function polygon(m: Mask, pts: Array<[number, number]>, v = 1): void {
  if (pts.length < 3) return;
  let ymin = Infinity, ymax = -Infinity;
  for (const [, y] of pts) { if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  const y0 = Math.max(0, Math.floor(ymin)), y1 = Math.min(m.height - 1, Math.ceil(ymax));
  const SUB = 4;
  for (let y = y0; y <= y1; y++) {
    for (let s = 0; s < SUB; s++) {
      const sy = y + (s + 0.5) / SUB;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.floor(xs[k]!)), xb = Math.min(m.width - 1, Math.ceil(xs[k + 1]!));
        for (let x = xa; x <= xb; x++) put(m, x, y, v / SUB);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// glyphs for the MASK, drawn as filled rectangles — not the ASCII font
// ---------------------------------------------------------------------------

/**
 * A 5x9 uppercase bitmap alphabet, drawn into the mask as blocks.
 *
 * ⚠ THIS IS NOT THE ASCII GLYPH FONT and must not be confused with it. The ASCII typeface draws a
 * character *as* a glyph one cell wide. Here the same 5x9 pattern is used as a **shape descriptor** to
 * paint a large, solid, readable word into a high-resolution mask — the word occupies hundreds of pixels
 * because it is painted at that scale, not because a glyph was magnified.
 */
const MASK_FONT: Record<string, string[]> = {
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001", "10001", "10001"],
  A: ["01110", "10001", "10001", "10001", "11111", "10001", "10001", "10001", "10001"],
  M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "10000", "11110", "10000", "10000", "10000", "11111"],
};

export function textWidthPx(text: string, pxPerCell: number, trackingCells = 1): number {
  const n = text.length;
  return (n * 5 + (n - 1) * trackingCells) * pxPerCell;
}

/** Paint `text` centred on (cx, cy), each font pixel `pxPerCell` across. */
export function blockText(
  m: Mask, text: string, cx: number, cy: number, pxPerCell: number, trackingCells = 1, v = 1,
): void {
  const total = textWidthPx(text, pxPerCell, trackingCells);
  let x = cx - total / 2;
  const h = 9 * pxPerCell;
  const top = cy - h / 2;
  for (const ch of text.toUpperCase()) {
    const pat = MASK_FONT[ch];
    if (pat) {
      for (let r = 0; r < 9; r++) {
        const row = pat[r]!;
        for (let c = 0; c < 5; c++) {
          if (row[c] === "1") rect(m, x + c * pxPerCell, top + r * pxPerCell, x + (c + 1) * pxPerCell, top + (r + 1) * pxPerCell, v);
        }
      }
    }
    x += (5 + trackingCells) * pxPerCell;
  }
}

/** Coverage statistics, for a programmatic legibility floor before anyone looks at the image. */
export function maskStats(m: Mask): { coverage: number; bbox: { x0: number; y0: number; x1: number; y1: number }; heightFrac: number; widthFrac: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sum = 0;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const v = m.data[y * m.width + x]!;
      if (v > 0.5) {
        sum += v;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (!Number.isFinite(x0)) return { coverage: 0, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, heightFrac: 0, widthFrac: 0 };
  return {
    coverage: sum / (m.width * m.height),
    bbox: { x0, y0, x1, y1 },
    heightFrac: (y1 - y0 + 1) / m.height,
    widthFrac: (x1 - x0 + 1) / m.width,
  };
}

/** Write a mask as a greyscale PNG. */
export async function writeMaskPng(m: Mask, file: string): Promise<void> {
  const { encodePng } = await import('../render/png.js');
  const img = { width: m.width, height: m.height, data: Buffer.alloc(m.width * m.height * 3) };
  for (let i = 0; i < m.width * m.height; i++) {
    const v = Math.max(0, Math.min(255, Math.round(m.data[i]! * 255)));
    img.data[i * 3] = v; img.data[i * 3 + 1] = v; img.data[i * 3 + 2] = v;
  }
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, encodePng(img));
}


// ---------------------------------------------------------------------------
// CONTOUR-AWARE ASCII SAMPLING
// ---------------------------------------------------------------------------

/**
 * WHY THIS REPLACES THE LUMINANCE RAMP, and it is a measured failure.
 *
 * The first Phase 3.2A sampler averaged each 8x9 cell to one value and picked a character from a 9-step
 * density ramp. The external blind review read the result as **"难以理解"**.
 *
 * Measuring why: the torso is one contiguous block spanning **rows 27..62 of the lattice — 35 rows of
 * near-identical characters.** The render was a correct *density map* and a **poor shape**. A density
 * ramp carries no information about a silhouette's EDGE, and **the edge is the shape** — that is the
 * whole lesson of the Phase 3.1 silhouette work, which found that recognition lives in the concavities.
 *
 * So the sampler now reads the mask's STRUCTURE rather than its brightness:
 *
 *   - a cell containing a **boundary** is drawn with the glyph matching the edge's **orientation**
 *     (`-` horizontal, `|` vertical, `/` and `\` diagonal) — so a wall edge looks like a wall edge and a
 *     shoulder line looks like a shoulder line
 *   - a cell **inside** the form is drawn from the density ramp, which is the *correct* use of a ramp:
 *     it describes interior material, not shape
 *   - an empty cell is a space
 *
 * This is the brief's items 11 and 12 — contour-following glyphs and semantic glyph families — reduced to
 * the one mechanism that the measurement actually calls for.
 */
export const EDGE_GLYPHS = { horizontal: "-", vertical: "|", diagDown: "\\", diagUp: "/" } as const;
export const INTERIOR_RAMP = " .:-=+*#%@";

export interface SampledCell {
  /** the character to draw */
  ch: string;
  /** true when the cell lies on the form's boundary */
  edge: boolean;
  /** mean coverage in the cell */
  value: number;
}

/**
 * Sample a mask into glyph cells, choosing EDGE glyphs on boundaries and RAMP glyphs inside.
 *
 * `edgeFloor` is the coverage gradient above which a cell counts as an edge. It is stated rather than
 * tuned silently, and the default was chosen by measuring the fraction of cells it marks on the test
 * masks rather than by eye.
 */
export function sampleContourAware(
  m: Mask, cols: number, rows: number, edgeFloor = 0.16,
): SampledCell[][] {
  const cw = m.width / cols, ch = m.height / rows;

  /**
   * ⚠ THE FIRST VERSION OF THIS USED A GRADIENT HEURISTIC AND MARKED ALMOST EVERY CELL AS AN EDGE.
   *
   * It compared a cell's coverage against its neighbours and called anything in-between an edge — which,
   * on a mask whose limb is four cells wide, is **the whole limb.** Measured on TEST A it produced edge
   * glyphs across the entire figure, so the render read as texture rather than as a silhouette: the
   * opposite of the intent, and worse than the density ramp it replaced.
   *
   * What an edge actually is: **a lit cell with at least one unlit 4-neighbour.** That is a statement
   * about the FORM's boundary and it needs no threshold. Everything else lit is interior, and gets the
   * density ramp — which is the ramp's correct job.
   */
  const value: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: number[] = [];
    for (let c = 0; c < cols; c++) {
      let sum = 0, n = 0;
      for (let y = Math.floor(r * ch); y < Math.floor((r + 1) * ch); y++) {
        for (let x = Math.floor(c * cw); x < Math.floor((c + 1) * cw); x++) { sum += at(m, x, y); n++; }
      }
      line.push(n ? sum / n : 0);
    }
    value.push(line);
  }
  const lit = (r: number, c: number): boolean => (value[r]?.[c] ?? 0) > edgeFloor;
  void edgeFloor;

  const out: SampledCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: SampledCell[] = [];
    for (let c = 0; c < cols; c++) {
      const v = value[r]![c]!;
      if (v <= 0.08) { line.push({ ch: " ", edge: false, value: v }); continue; }

      /** BOUNDARY = lit, with at least one unlit 4-neighbour. */
      const isEdge = !lit(r - 1, c) || !lit(r + 1, c) || !lit(r, c - 1) || !lit(r, c + 1);
      if (isEdge) {
        /**
         * ORIENTATION from where the form CONTINUES. A boundary whose lit neighbours lie above and below
         * runs vertically, so it is drawn `|`; one whose neighbours lie left and right runs horizontally
         * and is drawn `-`. Diagonals use the two corner neighbours.
         */
        const up = lit(r - 1, c), dn = lit(r + 1, c), lf = lit(r, c - 1), rt = lit(r, c + 1);
        let ch: string;
        if (up && dn) ch = EDGE_GLYPHS.vertical;
        else if (lf && rt) ch = EDGE_GLYPHS.horizontal;
        else if ((up && rt) || (dn && lf)) ch = EDGE_GLYPHS.diagUp;
        else if ((up && lf) || (dn && rt)) ch = EDGE_GLYPHS.diagDown;
        else if (up || dn) ch = EDGE_GLYPHS.vertical;
        else if (lf || rt) ch = EDGE_GLYPHS.horizontal;
        else ch = EDGE_GLYPHS.diagUp;
        line.push({ ch, edge: true, value: v });
      } else {
        const idx = Math.max(1, Math.min(INTERIOR_RAMP.length - 1, Math.round(v * (INTERIOR_RAMP.length - 1))));
        line.push({ ch: INTERIOR_RAMP[idx]!, edge: false, value: v });
      }
    }
    out.push(line);
  }
  return out;
}
