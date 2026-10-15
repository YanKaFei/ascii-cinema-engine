/**
 * ASCII AS MATERIAL — glyph families, layered depth, and character topology.
 *
 * ⚠ THE V2 DEFECT THIS REPLACES, seen in the rendered frames: the figure was a **uniform solid block of `#`**
 * with no interior structure, every architectural plane was filled edge-to-edge with the same `+`/`*` texture,
 * and the NAME carried no more graphic weight than the wall behind it. **ASCII was a filter applied uniformly to
 * everything, so nothing had identity and nothing had hierarchy.**
 *
 * Three mechanisms fix that:
 *
 *  1. **GLYPH FAMILIES** — architecture, figure, text, atmosphere and accent draw from *different* alphabets, so
 *     a material is recognisable by its characters rather than only by its position.
 *  2. **DEPTH-BUFFERED LAYERS** — a nearer material occludes a farther one, so foreground, middle ground and
 *     background are genuinely separated rather than painted in array order.
 *  3. **CHARACTER TOPOLOGY** — a figure is emitted as a *field* whose glyph is chosen from the local form
 *     (contour, interior, shadow side), so the body has designed internal structure instead of fill.
 */
import { assertFinite } from "../semantic/shot-compiler.js";

// ---------------------------------------------------------------------------
// GLYPH FAMILIES
// ---------------------------------------------------------------------------

/**
 * ⚠ **DISTINCT ALPHABETS, CHOSEN FOR MEANING.** Characters are ordered from lightest to heaviest *within each
 * family*, so a family's density can be modulated without losing its identity.
 */
export const GLYPH_FAMILIES = {
  /** structure: solid, load-bearing. Used for mass and lit planes. */
  architecture: { ramp: " .:-=+*#%@", description: "solid mass and lit architectural planes" },
  /** the figure: **contour and topology**, never fill. */
  figure: { ramp: " '`^\"~:;!", description: "body contour, musculature and shadow side" },
  /** typography: legible letterforms only, drawn from an atlas. */
  text: { ramp: "#", description: "letterforms drawn from the glyph atlas" },
  /** atmosphere: sparse, particulate, never solid. */
  atmosphere: { ramp: " .'`", description: "air, depth haze and particulate" },
  /** accent: a single high-contrast mark for graphic emphasis. */
  accent: { ramp: "/\\|-_", description: "directional accents and graphic emphasis" },
  /** fine detail: edges, hairline structure, convergence lines. */
  detail: { ramp: ".:|", description: "hairlines, edges and convergence lines" },
} as const;
export type GlyphFamily = keyof typeof GLYPH_FAMILIES;

/** pick a glyph from a family at a density t in [0,1] */
export function glyphOf(family: GlyphFamily, t: number): string {
  const ramp = GLYPH_FAMILIES[family].ramp;
  const i = Math.max(0, Math.min(ramp.length - 1, Math.round(t * (ramp.length - 1))));
  return ramp[i]!;
}

// ---------------------------------------------------------------------------
// THE CANVAS — depth-buffered layers
// ---------------------------------------------------------------------------

export interface Cell {
  ch: string;
  family: GlyphFamily;
  /** 0..1 ink, for evaluation and for measuring the frame — NOT used to pick the glyph twice */
  ink: number;
  depth: number;
  /** the material id that last wrote here, so a frame can be audited by material */
  material: string;
}

export interface CanvasOptions { cols: number; rows: number; clearCh?: string }

/**
 * A glyph lattice with a DEPTH BUFFER.
 *
 * `write` accepts only if the incoming depth is nearer than what is already there (or if the layer is declared
 * `overlay`). **This is what makes foreground and background separate materials rather than a paint order.**
 */
export class Canvas {
  readonly cols: number; readonly rows: number;
  readonly cells: Cell[];
  parent?: Canvas;
  /** when set, this canvas is a transparent layer: unwritten cells fall through to `parent` */
  transparent: boolean;
  constructor(o: CanvasOptions & { transparent?: boolean; parent?: Canvas } = { cols: 80, rows: 40 }) {
    this.cols = o.cols; this.rows = o.rows;
    this.transparent = o.transparent ?? false;
    this.parent = o.parent;
    this.cells = new Array(o.cols * o.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = { ch: o.clearCh ?? " ", family: "atmosphere", ink: 0, depth: Infinity, material: "" };
  }
  idx(cx: number, cy: number): number { return cy * this.cols + cx; }
  inside(cx: number, cy: number): boolean { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; }
  /**
   * Write a cell, honouring the depth buffer.
   *
   * @param overlay when true the cell is written regardless of depth — for graphic elements that must sit on
   *   top by design (typography), and which record that they did so.
   */
  write(cx: number, cy: number, ch: string, family: GlyphFamily, ink: number, depth: number, material: string, overlay = false): boolean {
    const x = Math.round(cx), y = Math.round(cy);
    if (!this.inside(x, y)) return false;
    const i = this.idx(x, y);
    const cur = this.cells[i]!;
    if (!overlay && depth >= cur.depth) return false;
    /**
     * ⚠ A NaN INK MUST BE IMPOSSIBLE, NOT MERELY UNLIKELY.
     *
     * During the edge-aware work a `NaN` ink reached a canvas through one code path and poisoned the whole ink
     * field — `inkCoverage()` returned NaN and every downstream metric became meaningless. **A non-finite value
     * that can silently enter the pixel pipeline is a defect class, not an input error**, so the invariant is
     * enforced here: a non-finite ink becomes 0, and a non-finite depth stays at the existing depth.
     */
    if (!Number.isFinite(ink)) return false;
    const safeDepth = Number.isFinite(depth) ? depth : cur.depth;
    this.cells[i] = { ch, family, ink: Math.max(0, Math.min(1, ink)), depth: safeDepth, material };
    return true;
  }
  /** resolve through the parent chain for transparent layers */
  resolved(cx: number, cy: number): Cell {
    const c = this.cells[this.idx(cx, cy)]!;
    if (this.transparent && c.material === "" && this.parent) return this.parent.resolved(cx, cy);
    return c;
  }
  toLines(): string[] {
    const out: string[] = [];
    for (let r = 0; r < this.rows; r++) { let s = ""; for (let c = 0; c < this.cols; c++) s += this.resolved(c, r).ch; out.push(s); }
    return out;
  }
  /** material census, for auditing that materials are actually distinct */
  census(): Record<string, number> {
    const m: Record<string, number> = {};
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) { const cell = this.resolved(c, r); if (cell.ch === " ") continue; m[cell.material] = (m[cell.material] ?? 0) + 1; }
    return m;
  }
  /** distinct glyphs used, and the family census — the evidence that ASCII is acting as material */
  glyphCensus(): { distinct: number; byFamily: Record<string, number> } {
    const g = new Set<string>(); const fam: Record<string, number> = {};
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) { const cell = this.resolved(c, r); if (cell.ch === " ") continue; g.add(cell.ch); fam[cell.family] = (fam[cell.family] ?? 0) + 1; }
    return { distinct: g.size, byFamily: fam };
  }
  /**
   * ⚠ THE RESOLVED INK FIELD, for the rasteriser.
   *
   * `rasterise` scales a cell's contribution by a `weightOf(cx, cy)`, and V3 **never supplied one** — so every
   * glyph was drawn at FULL BRIGHTNESS and the `ink` value only chose which character. That is why a graphic
   * could not fade: the NAME stepped through four glyph substitutions and then lost **all** of its brightness in
   * the single frame where the geometry stopped being drawn, measured as the whole frame dropping from mean
   * brightness 112.7 to 12.0.
   *
   * **An ink value that does not reach the pixels is not an ink value.** This exposes the resolved field so the
   * rasteriser can honour it.
   */
  inkField(): Float32Array {
    const out = new Float32Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const cell = this.resolved(c, r);
      out[r * this.cols + c] = cell.ch === " " ? 0 : cell.ink;
    }
    return out;
  }
  inkCoverage(): number {
    let n = 0; for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.resolved(c, r).ch !== " ") n++;
    return n / (this.cols * this.rows);
  }
}

// ---------------------------------------------------------------------------
// DRAWING PRIMITIVES
// ---------------------------------------------------------------------------

export function line(cv: Canvas, x0: number, y0: number, x1: number, y1: number, o: { family: GlyphFamily; ink?: number; depth: number; material: string; overlay?: boolean; density?: number }): void {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  const d = o.density ?? 1;
  for (let i = 0; i <= n; i++) {
    if (d < 1 && (i % Math.max(1, Math.round(1 / Math.max(1e-6, d)))) !== 0 && i !== 0 && i !== n) continue;
    const t = i / n;
    cv.write(x0 + dx * t, y0 + dy * t, glyphOf(o.family, o.ink ?? 0.7), o.family, o.ink ?? 0.7, o.depth, o.material, o.overlay);
  }
}

export function disc(cv: Canvas, cx: number, cy: number, rx: number, ry: number, o: { family: GlyphFamily; ink?: number; depth: number; material: string; overlay?: boolean; ring?: boolean }): void {
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
    const q = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (q > 1) continue;
    if (o.ring && q < (1 - 1 / Math.max(rx, ry)) ** 2) continue;
    cv.write(cx + x, cy + y, glyphOf(o.family, o.ink ?? 0.8), o.family, o.ink ?? 0.8, o.depth, o.material, o.overlay);
  }
}

/**
 * CAPSULE — the limb primitive.
 *
 * ⚠ **`hollow` is what stops a body reading as a filled block.** A limb is drawn as its CONTOUR plus a lightly
 * shaded interior, so the local form determines the glyph rather than one repeated character.
 */
export function capsule(cv: Canvas, ax: number, ay: number, bx: number, by: number, r: number, o: { family: GlyphFamily; ink?: number; depth: number; material: string; hollow?: boolean; shade?: number }): void {
  const axx = Math.round(ax), ayy = Math.round(ay), bxx = Math.round(bx), byy = Math.round(by);
  const minX = Math.min(axx, bxx) - Math.ceil(r) - 1, maxX = Math.max(axx, bxx) + Math.ceil(r) + 1;
  const minY = Math.min(ayy, byy) - Math.ceil(r) - 1, maxY = Math.max(ayy, byy) + Math.ceil(r) + 1;
  const vx = bxx - axx, vy = byy - ayy;
  const len2 = vx * vx + vy * vy || 1;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const t = Math.max(0, Math.min(1, ((x - axx) * vx + (y - ayy) * vy) / len2));
    const px = axx + vx * t, py = ayy + vy * t;
    const d = Math.hypot(x - px, y - py);
    if (d > r) continue;
    if (o.hollow) {
      /** the rim gets the darkest mark; the interior is graded toward a shadow side */
      const rim = d > r - 1.05;
      if (rim) { cv.write(x, y, glyphOf(o.family, 0.9), o.family, 0.9, o.depth, o.material); continue; }
      /** interior: graded perpendicular to the limb axis, so a cylinder reads as round */
      const nx = -vy / Math.sqrt(len2), ny = vx / Math.sqrt(len2);
      const side = (x - px) * nx + (y - py) * ny;
      const t2 = 0.25 + 0.5 * (0.5 + side / Math.max(1e-6, r)) * (o.shade ?? 1);
      cv.write(x, y, glyphOf(o.family, t2), o.family, t2 * 0.7, o.depth, o.material);
    } else {
      cv.write(x, y, glyphOf(o.family, o.ink ?? 0.7), o.family, o.ink ?? 0.7, o.depth, o.material);
    }
  }
}

/** an axis-aligned glyph box, with an optional per-cell density function for gradients */
export function box(cv: Canvas, x0: number, y0: number, x1: number, y1: number, o: { family: GlyphFamily; ink?: number | ((u: number, v: number) => number); depth: number | ((u: number, v: number) => number); material: string; overlay?: boolean }): void {
  const a = Math.round(Math.min(x0, x1)), b = Math.round(Math.max(x0, x1));
  const c = Math.round(Math.min(y0, y1)), d = Math.round(Math.max(y0, y1));
  const fx = o.ink, fd = o.depth;
  for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) {
    const u = (x - a) / Math.max(1, b - a), v = (y - c) / Math.max(1, d - c);
    const ink = typeof fx === "function" ? fx(u, v) : (fx ?? 0.6);
    const dep = typeof fd === "function" ? fd(u, v) : fd;
    cv.write(x, y, glyphOf(o.family, ink), o.family, ink, dep, o.material, o.overlay);
  }
}
