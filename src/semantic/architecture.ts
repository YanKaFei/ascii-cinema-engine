/**
 * ARCHITECTURAL ASCII RENDERER — a room drawn as STRUCTURE, not as interior fill.
 *
 * THE MEASURED FAILURE THIS REPLACES. An external blind review of the Phase 3.2A prototypes returned:
 *
 *   "the environment does NOT read naturally as a room. It reads more like a figure in front of a
 *    rectangular grid / screen / stage with a perspective ground plane."
 *   "the environment still reads as a large rectangular character field rather than an architectural
 *    interior."
 *
 * The cause is that the room's planes were SAMPLED LIKE A SUBJECT — every surface filled with a uniform
 * density ramp, so the largest plane (the back wall) became a **character field**. That is the same class
 * of error as sampling a silhouette with a luminance ramp: **the representation was chosen for the wrong
 * kind of structure.**
 *
 * A room is not recognised by its fill. It is recognised by:
 *
 *   - **junctions** — wall/floor, wall/ceiling, wall/wall. These are the recognition-critical features.
 *   - **convergence** — lines that AGREE on a vanishing structure, which is what says "depth"
 *   - **plane segmentation** — different surfaces carrying visibly different material, so the eye reads
 *     separate planes rather than one panel
 *
 * So this renderer draws architecture with **line-oriented glyphs chosen by ORIENTATION**, never by
 * luminance, and it treats **junctions as higher priority than texture** — a junction is never allowed to
 * be sampled away.
 */

export const LINE_GLYPHS = {
  horizontal: "-",
  vertical: "|",
  diagRise: "/",
  diagFall: "\\",
  junction: "+",
  /** corners, approximated with printable ASCII as the brief permits */
  cornerTL: ",", cornerTR: ".", cornerBL: "`", cornerBR: "'",
} as const;

export type PlaneId = "ceiling" | "floor" | "leftWall" | "rightWall" | "backWall";

/**
 * A plane of the room in SCREEN SPACE, as a quadrilateral, plus how its interior should be materialised.
 *
 * `fill` is the important field and it is a STRATEGY, not a density:
 *
 *   "none"        edges only — nothing inside
 *   "sparse"      widely spaced marks, so a surface is present but not filled
 *   "directional" strokes aligned to a direction, which is how a floor or a wall states its plane
 */
export interface Plane {
  id: PlaneId;
  /**
   * THE SEMANTIC VALUE OF THIS PLANE, 0..1 — carried into the ASCII MATERIAL.
   *
   * ⚠ ADDED BECAUSE THE ASCII PATH DID NOT RECEIVE IT, and the ownership audit proved that plane VALUE is
   * what makes the planes separable. `drawRoom` previously selected material from `id`, `variant` and
   * `dir` only, so **two planes with the same strategy rendered as the same glyph field even when the
   * semantic oracle separated them by a factor of six.** The ASCII representation is meant to *represent*
   * the semantic image, so it has to see the same distinction the semantic image does.
   *
   * The value selects the plane's INTERIOR glyph from the density ramp, so a bright plane carries denser
   * marks than a dark one. It does **not** change edge or junction priority, which stay categorical.
   */
  value?: number;
  /** screen-space corners, in order */
  quad: Array<[number, number]>;
  fill: "none" | "sparse" | "directional";
  /** for directional fill: the direction strokes run */
  dir?: "horizontal" | "vertical" | "diagRise" | "diagFall";
  /** marks per 100 cells of stroke; low values keep a plane readable without filling it */
  density?: number;
}

export interface RoomGeometry {
  planes: Plane[];
  /** where the perspective converges — every directional stroke is aimed at or away from this */
  vanishingPoint: [number, number];
  /** pairwise junctions that must survive sampling, as screen-space segments */
  junctions: Array<{ a: PlaneId | "frame"; b: PlaneId | "frame"; from: [number, number]; to: [number, number] }>;
}

// ---------------------------------------------------------------------------
// glyph-level drawing on the glyph lattice (not the pixel mask)
// ---------------------------------------------------------------------------

export interface GlyphCanvas {
  cols: number;
  rows: number;
  ch: string[];        // cols*rows
  priority: number[];  // cols*rows — higher wins; junctions outrank texture
}

export const PRIORITY = {
  junction: 100,
  contour: 60,
  planeEdge: 50,
  planeTexture: 20,
  atmosphere: 5,
} as const;

export function createCanvas(cols: number, rows: number): GlyphCanvas {
  return { cols, rows, ch: new Array(cols * rows).fill(" "), priority: new Array(cols * rows).fill(0) };
}

/**
 * Plot a glyph, but ONLY if it does not overwrite something more important.
 *
 * THIS IS THE BRIEF'S PRIORITY HIERARCHY, and it exists because a sampler that writes in raster order
 * lets plane texture erase a junction. Junctions must outrank texture, so a lower-priority plot simply
 * loses.
 */
export function plot(c: GlyphCanvas, x: number, y: number, ch: string, priority: number): void {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= c.cols || yi >= c.rows) return;
  const i = yi * c.cols + xi;
  if (priority < c.priority[i]!) return;
  c.ch[i] = ch;
  c.priority[i] = priority;
}

/** Bresenham, so a junction is continuous rather than dotted. */
export function line(c: GlyphCanvas, x0: number, y0: number, x1: number, y1: number, priority: number, orient = true): void {
  let ax = Math.round(x0), ay = Math.round(y0);
  const bx = Math.round(x1), by = Math.round(y1);
  const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < 10000; guard++) {
    plot(c, ax, ay, orient ? glyphFor(ax, ay, bx, by) : "-", priority);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; ax += sx; }
    if (e2 < dx) { err += dx; ay += sy; }
  }
}

/** Orientation from the segment's overall direction. */
function glyphFor(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return LINE_GLYPHS.horizontal;
  const slope = Math.abs(dy) / Math.max(1, Math.abs(dx));
  if (slope < 0.35) return LINE_GLYPHS.horizontal;
  if (slope > 2.2) return LINE_GLYPHS.vertical;
  return (dx > 0) === (dy > 0) ? LINE_GLYPHS.diagFall : LINE_GLYPHS.diagRise;
}

export function canvasToLines(c: GlyphCanvas): string[] {
  const out: string[] = [];
  for (let y = 0; y < c.rows; y++) out.push(c.ch.slice(y * c.cols, (y + 1) * c.cols).join(""));
  return out;
}

// ---------------------------------------------------------------------------
// the five material strategies
// ---------------------------------------------------------------------------

export type RoomVariant = "v1-edge-only" | "v2-edge-sparse" | "v3-depth-density" | "v4-directional" | "v5-hybrid";

/**
 * Draw a room from its geometry using one of the five material strategies.
 *
 * `personBox` is the region the subject occupies. **Plane texture is suppressed there**, because a wall's
 * interior marks drawn across the figure are exactly the "character field" the external review rejected —
 * and this is where the brief's priority order (subject above plane texture) is applied.
 */
export function drawRoom(
  canvas: GlyphCanvas,
  geom: RoomGeometry,
  variant: RoomVariant,
  personBox?: { x0: number; y0: number; x1: number; y1: number },
): { junctionsDrawn: number; textureCells: number; planeFillRatio: { [k: string]: number } } {
  let junctionsDrawn = 0, textureCells = 0;
  const planeFillRatio: { [k: string]: number } = {};

  const insidePerson = (x: number, y: number): boolean =>
    !!personBox && x >= personBox.x0 && x <= personBox.x1 && y >= personBox.y0 && y <= personBox.y1;

  // ---- 1. PLANE EDGES and JUNCTIONS, at the highest priority -----------------
  for (const j of geom.junctions) {
    line(canvas, j.from[0], j.from[1], j.to[0], j.to[1], PRIORITY.junction);
    junctionsDrawn++;
  }
  // corner markers: turn the four frame corners and the back-wall corners into a `+` so the eye reads a
  // junction rather than an intersection of two lines
  for (const p of geom.planes) {
    for (const [x, y] of p.quad) plot(canvas, x, y, LINE_GLYPHS.junction, PRIORITY.junction);
  }

  // ---- 2. PLANE MATERIAL ----------------------------------------------------
  for (const p of geom.planes) {
    const xs = p.quad.map((q) => q[0]), ys = p.quad.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    let filled = 0, total = 0;

    const strategy: Plane["fill"] =
      variant === "v1-edge-only" ? "none"
      : variant === "v2-edge-sparse" ? (p.id === "ceiling" ? "none" : "sparse")
      : variant === "v3-depth-density" ? "sparse"
      : variant === "v4-directional" ? "directional"
      : /* v5-hybrid */ p.id === "floor" ? "directional" : p.id === "ceiling" ? "none" : "sparse";

    for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) {
      for (let x = Math.ceil(x0); x <= Math.floor(x1); x++) {
        if (!pointInQuad(x, y, p.quad)) continue;
        total++;
        if (insidePerson(x, y)) continue;
        if (strategy === "none") { continue; }
        /**
         * DEPTH-DEPENDENT SPACING, which is the brief's item 5. The spacing widens as the point recedes
         * toward the vanishing point, so a receding plane thins out and the perspective is reinforced by
         * the mark density itself rather than only by the outline.
         */
        const vpDepth = variant === "v3-depth-density"
          ? Math.hypot(x - geom.vanishingPoint[0], y - geom.vanishingPoint[1]) / Math.hypot(canvas.cols, canvas.rows)
          : 0;
        const baseStep = strategy === "directional" ? 3 : 5;
        const step = Math.max(2, Math.round(baseStep + vpDepth * 9));

        /**
         * THE INTERIOR GLYPH COMES FROM THE PLANE'S SEMANTIC VALUE, so plane contrast survives into ASCII.
         * A dark plane carries light marks and a bright plane carries dense ones, which is the ASCII
         * equivalent of the semantic image's tonal separation.
         */
        const PLANE_RAMP = ".:+*#";
        const pv = Math.max(0, Math.min(1, p.value ?? 0.5));
        const interiorGlyph = PLANE_RAMP[Math.max(0, Math.min(PLANE_RAMP.length - 1, Math.round(pv * (PLANE_RAMP.length - 1))))]!;

        if (strategy === "sparse") {
          if (x % step !== 0 && y % step !== 0) continue;
          plot(canvas, x, y, interiorGlyph, PRIORITY.planeTexture);
          filled++; textureCells++;
        } else {
          /**
           * DIRECTIONAL MATERIAL. A floor is drawn with strokes along its own recession, aimed at the
           * vanishing point, so the floor's marks and the wall's marks disagree in direction — which is
           * what makes the eye read two planes rather than one panel.
           */
          const dir = p.dir ?? "horizontal";
          const t = ((dir === "horizontal" ? x : y) + (x + y)) % step;
          if (t !== 0) continue;
          const g = dir === "horizontal" ? LINE_GLYPHS.horizontal
            : dir === "vertical" ? LINE_GLYPHS.vertical
            : dir === "diagRise" ? LINE_GLYPHS.diagRise : LINE_GLYPHS.diagFall;
          plot(canvas, x, y, g, PRIORITY.planeTexture);
          filled++; textureCells++;
        }
      }
    }
    planeFillRatio[p.id] = total ? filled / total : 0;
  }

  return { junctionsDrawn, textureCells, planeFillRatio };
}

function pointInQuad(px: number, py: number, quad: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    const xi = quad[i]![0], yi = quad[i]![1], xj = quad[j]![0], yj = quad[j]![1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
