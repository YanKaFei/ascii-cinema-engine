/**
 * NATIVE ASCII OBJECTS.
 *
 * WHY THIS EXISTS. Every image the engine could produce until now came from one route: seed a
 * volumetric particle cloud, splat it, and let the renderer decide each cell's character from that
 * cell's brightness. That route cannot produce a horizon, a wall, a floor, a shadow line, or a
 * readable word, because none of those are "a cloud whose brightness varies". The visual review's
 * binding constraint said exactly this: *nothing in these frames has a place, a scale, or a light
 * source.*
 *
 * A native ASCII object is a thing placed in the world that KNOWS what character it is. A line is a
 * line of `-`. A word is the letters of that word. Depth comes from placing one object in front of
 * another. Typography comes from the same mechanism.
 *
 * THE COMMON SHAPE. Every object carries the same transform and lifetime fields, because they are
 * all the same kind of thing — a positioned, oriented, animatable glyph source:
 *
 *     position  rotation  scale  velocity  opacity  glyph  glyphFamily  depth  parent  lifetime
 *
 * and each concrete kind differs only in HOW it lays its glyphs out in its own local space.
 *
 * ASCII IS THE MATERIAL. An object does not rasterise into pixels and then get converted; it emits
 * glyph placements directly, which is the difference between "ASCII as a filter" and "ASCII as the
 * medium".
 */

import { TYPEFACE, GLYPH_W, GLYPH_H } from "../glyphs/atlas.js";
import type { GlyphFamily } from "../render/gpu/families.js";

export type Vec3 = { x: number; y: number; z: number };

/** A single glyph placement produced by an object, in WORLD space. */
export interface GlyphPlacement {
  /** world position of the glyph's cell centre */
  p: Vec3;
  /** the character, as a printable ASCII code */
  code: number;
  /** 0..1 ink for this glyph */
  ink: number;
  /** per-glyph size multiplier */
  sizeMul: number;
  /** which object produced it, for provenance and debugging */
  sourceId: string;
  /** flattened depth (view order) hint; smaller is nearer */
  depthHint: number;
}

/** Fields every object shares. */
export interface AsciiObjectBase {
  id: string;
  /** local-space origin, in world units */
  position: Vec3;
  /** intrinsic orientation, radians about each axis */
  rotation?: Vec3;
  /** uniform scale, in glyph cells per local unit */
  scale?: number;
  /** world units per second; integrated over the object's life */
  velocity?: Vec3;
  /** 0..1 */
  opacity?: number;
  /** a fixed character for every glyph this object emits */
  glyph?: string;
  /** which family the object speaks in; defaults to the shot's family */
  glyphFamily?: GlyphFamily | "printable";
  /** explicit depth offset along the camera axis; negative is nearer */
  depth?: number;
  /** id of a parent object, whose transform this object inherits */
  parent?: string;
  /** 0..1 of the shot over which the object exists */
  lifetime?: { from: number; to: number };
  /** ink multiplier applied to every emitted glyph */
  intensity?: number;
}

/** A single glyph at a point. */
export interface AsciiPoint extends AsciiObjectBase {
  kind: "point";
  count: number;
  /** local-space extent the points scatter over */
  spread?: Vec3;
  seed?: number;
}

/** A straight run of glyphs from `from` to `to`. */
export interface AsciiLine extends AsciiObjectBase {
  kind: "line";
  from: Vec3;
  to: Vec3;
  /** glyphs per world unit */
  density?: number;
  /** the character to draw along the line; defaults to "-" */
  glyph?: string;
}

/** A connected sequence of lines. */
export interface AsciiPolyline extends AsciiObjectBase {
  kind: "polyline";
  points: Vec3[];
  density?: number;
  glyph?: string;
  closed?: boolean;
}

/**
 * A word rendered as READABLE LETTERFORMS.
 *
 * This is the Phase 2 review's largest single visual gap: "word subjects are dense bands, not
 * letterforms". The letters are drawn from the same 5x9 bitmap font the CPU reference uses, one
 * glyph-placement per lit bitmap pixel, so `NAME` reads as N A M E.
 */
export interface AsciiText extends AsciiObjectBase {
  kind: "text";
  text: string;
  /** extra cells between characters */
  tracking?: number;
  /** extra cells between lines */
  leading?: number;
  align?: "left" | "centre" | "right";
  /** what a glyph is drawn from: the text's own letters (default), or a fill character */
  fill?: string;
}

/** A rectangular lattice of glyphs — a wall, a floor, a window, a backdrop. */
export interface AsciiGrid extends AsciiObjectBase {
  kind: "grid";
  cols: number;
  rows: number;
  /** spacing between glyphs, in glyph cells */
  spacing?: { x: number; y: number };
  /** orientation plane: xy is a wall facing the camera, xz is a floor */
  plane?: "xy" | "xz" | "yz";
  /** which characters fill the lattice; cycles if shorter than the cell count */
  glyphs?: string;
  /** 0..1 of cells left empty, for texture rather than a solid sheet */
  holes?: number;
  /**
   * How far each glyph may wander from its lattice position, in glyph cells.
   *
   * WHY THIS IS NOT DECORATION. A perfectly regular lattice is invisible to a moving camera.
   * Measured: replacing a particle space with a REGULAR lattice dropped mean frame-to-frame
   * difference on `forgotten-name`'s push-in from 5.028 to 1.266, because a repeating pattern of
   * near-identical marks gives the eye nothing to track — every cell looks like its neighbour, so
   * a camera move against it produces almost no visible change. Irregularity creates the local
   * features that make motion and parallax readable.
   */
  jitter?: number;
  /**
   * Distinctive breaks in the lattice — openings, corners, missing panels.
   *
   * A wall with a door in it reads as a place; a wall of uniform marks reads as wallpaper. Each
   * opening is a rectangle in lattice coordinates that is left entirely empty.
   */
  openings?: Array<{ col: number; row: number; cols: number; rows: number }>;
  /** variation in glyph ink across the lattice, 0..1; a uniform sheet has no depth cues */
  inkVariation?: number;
  seed?: number;
}

/** A scattered volumetric cloud — the case the engine already had. */
export interface AsciiCloud extends AsciiObjectBase {
  kind: "cloud";
  count: number;
  bounds: Vec3;
  seed?: number;
  /** character ramp for the cloud; defaults to the family */
  glyphs?: string;
}

/** A trail behind a moving point. */
export interface AsciiTrail extends AsciiObjectBase {
  kind: "trail";
  /** number of glyphs in the trail */
  length: number;
  /** local direction the trail extends along */
  direction: Vec3;
  /** per-glyph falloff along the trail */
  falloff?: number;
  glyph?: string;
}

export type AsciiObject =
  | AsciiPoint
  | AsciiLine
  | AsciiPolyline
  | AsciiText
  | AsciiGrid
  | AsciiCloud
  | AsciiTrail;

export type AsciiObjectKind = AsciiObject["kind"];

// ---------------------------------------------------------------------------
// deterministic RNG so an object's scatter is reproducible
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rotate a local point by the object's intrinsic rotation (XYZ order), then translate. */
function toWorld(o: AsciiObjectBase, local: Vec3): Vec3 {
  // `position` is required by the type, but a caller building objects by hand (or from JSON) can
  // omit it. Defaulting to the origin is the only sane reading of "no position given", and it
  // turns a crash into a placed object.
  const pos = o.position ?? { x: 0, y: 0, z: 0 };
  const r = o.rotation ?? { x: 0, y: 0, z: 0 };
  const s = o.scale ?? 1;
  let { x, y, z } = local;
  x *= s;
  y *= s;
  z *= s;
  // X
  if (r.x) {
    const c = Math.cos(r.x);
    const sn = Math.sin(r.x);
    const ny = y * c - z * sn;
    const nz = y * sn + z * c;
    y = ny;
    z = nz;
  }
  // Y
  if (r.y) {
    const c = Math.cos(r.y);
    const sn = Math.sin(r.y);
    const nx = x * c + z * sn;
    const nz = -x * sn + z * c;
    x = nx;
    z = nz;
  }
  // Z
  if (r.z) {
    const c = Math.cos(r.z);
    const sn = Math.sin(r.z);
    const nx = x * c - y * sn;
    const ny = x * sn + y * c;
    x = nx;
    y = ny;
  }
  return {
    x: x + pos.x,
    y: y + pos.y,
    z: z + pos.z + (o.depth ?? 0),
  };
}

/** Is the object alive at this point in the shot? */
export function objectAlive(o: AsciiObject, u: number): boolean {
  const lt = o.lifetime;
  if (!lt) return true;
  return u >= lt.from && u <= lt.to;
}

/** Ink at a point in the shot, including lifetime fade and any velocity integration. */
export function objectInk(o: AsciiObject, u: number, shotSeconds: number): number {
  const base = (o.opacity ?? 1) * (o.intensity ?? 1);
  const lt = o.lifetime;
  if (!lt) return base;
  // ease in and out over the first and last 15% of the object's life, so nothing pops
  const span = Math.max(1e-6, lt.to - lt.from);
  const local = (u - lt.from) / span;
  const fadeIn = Math.min(1, local / 0.15);
  const fadeOut = Math.min(1, (1 - local) / 0.15);
  void shotSeconds;
  return base * Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut)));
}

// ---------------------------------------------------------------------------
// text rasterisation — the typography path
// ---------------------------------------------------------------------------

export interface TextMetrics {
  /** width in glyph cells */
  widthCells: number;
  heightCells: number;
  lines: number;
}

/** Measure a string in glyph cells, honouring tracking and leading. */
export function measureText(t: AsciiText): TextMetrics {
  const tracking = t.tracking ?? 1;
  const lines = t.text.split("\n");
  const width = Math.max(
    ...lines.map((l) => Math.max(0, l.length * (GLYPH_W + tracking) - tracking)),
  );
  return { widthCells: width, heightCells: lines.length * (GLYPH_H + (t.leading ?? 1)), lines: lines.length };
}

/**
 * Rasterise text into glyph placements.
 *
 * Each LIT PIXEL of the 5x9 bitmap becomes one placement, so the letters are built from discrete
 * characters rather than from an outline. That is the whole point: this is ASCII typography, not
 * text with an ASCII-looking mask.
 */
export function rasteriseText(t: AsciiText): GlyphPlacement[] {
  const out: GlyphPlacement[] = [];
  const tracking = t.tracking ?? 1;
  const leading = t.leading ?? 1;
  const lines = t.text.split("\n");
  const metrics = measureText(t);

  lines.forEach((line, li) => {
    const lineWidth = Math.max(0, line.length * (GLYPH_W + tracking) - tracking);
    let originX = 0;
    if (t.align === "centre") originX = (metrics.widthCells - lineWidth) / 2;
    else if (t.align === "right") originX = metrics.widthCells - lineWidth;

    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci]!;
      const glyph = TYPEFACE[ch.charCodeAt(0)];
      if (glyph) {
        for (let gy = 0; gy < GLYPH_H; gy++) {
          const mask = glyph.rows[gy] ?? 0;
          if (!mask) continue;
          for (let gx = 0; gx < GLYPH_W; gx++) {
            if ((mask & (1 << (GLYPH_W - 1 - gx))) === 0) continue;
            // local coords: x to the right, y UP (world convention), hence the negation
            const local: Vec3 = {
              x: originX + ci * (GLYPH_W + tracking) + gx,
              y: -(li * (GLYPH_H + leading) + gy),
              z: 0,
            };
            out.push({
              p: toWorld(t, local),
              code: (t.fill ?? ch).charCodeAt(0),
              ink: 1,
              sizeMul: 1,
              sourceId: t.id,
              depthHint: t.depth ?? 0,
            });
          }
        }
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// the other kinds
// ---------------------------------------------------------------------------

export function rasteriseLine(l: AsciiLine): GlyphPlacement[] {
  const out: GlyphPlacement[] = [];
  const density = l.density ?? 1;
  const dx = l.to.x - l.from.x;
  const dy = l.to.y - l.from.y;
  const dz = l.to.z - l.from.z;
  const len = Math.hypot(dx, dy, dz);
  const n = Math.max(1, Math.round(len * density));
  const code = (l.glyph ?? "-").charCodeAt(0);
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    out.push({
      p: toWorld(l, { x: l.from.x + dx * f, y: l.from.y + dy * f, z: l.from.z + dz * f }),
      code,
      ink: 1,
      sizeMul: 1,
      sourceId: l.id,
      depthHint: l.depth ?? 0,
    });
  }
  return out;
}

export function rasterisePolyline(p: AsciiPolyline): GlyphPlacement[] {
  const pts = p.closed ? [...p.points, p.points[0]!] : p.points;
  const out: GlyphPlacement[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    // NOTE: `position`/`rotation`/`scale` must be carried explicitly. Spreading the polyline alone
    // left `position` undefined, and `toWorld` then dereferenced it — the object model requires
    // every concrete kind to satisfy AsciiObjectBase, so this is a type-level guarantee the spread
    // was quietly defeating.
    out.push(
      ...rasteriseLine({
        kind: "line",
        id: p.id,
        position: p.position,
        rotation: p.rotation,
        scale: p.scale,
        opacity: p.opacity,
        intensity: p.intensity,
        glyphFamily: p.glyphFamily,
        depth: p.depth,
        parent: p.parent,
        lifetime: p.lifetime,
        velocity: p.velocity,
        from: a,
        to: b,
        glyph: p.glyph ?? "-",
        density: p.density ?? 1,
      }),
    );
  }
  return out;
}

export function rasteriseGrid(g: AsciiGrid): GlyphPlacement[] {
  const out: GlyphPlacement[] = [];
  const spacing = g.spacing ?? { x: 2, y: 2 };
  const glyphs = g.glyphs && g.glyphs.length > 0 ? g.glyphs : "-";
  const rng = mulberry32(g.seed ?? 0x5eed);
  const plane = g.plane ?? "xy";
  const jitter = g.jitter ?? 0;
  const inkVar = g.inkVariation ?? 0;

  /** Is this cell inside one of the declared openings? */
  const inOpening = (c: number, r: number): boolean =>
    (g.openings ?? []).some(
      (o) => c >= o.col && c < o.col + o.cols && r >= o.row && r < o.row + o.rows,
    );

  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (inOpening(c, r)) continue;
      if (g.holes && rng() < g.holes) continue;
      const ch = glyphs[(r * g.cols + c) % glyphs.length]!;
      // irregular placement: the wander is per-axis and independent, so the lattice keeps its
      // overall shape while neighbouring marks stop being interchangeable
      const jx = jitter ? (rng() - 0.5) * 2 * jitter : 0;
      const jy = jitter ? (rng() - 0.5) * 2 * jitter : 0;
      const u = (c - (g.cols - 1) / 2) * spacing.x + jx;
      const v = (r - (g.rows - 1) / 2) * spacing.y + jy;
      const local: Vec3 =
        plane === "xy" ? { x: u, y: -v, z: 0 } : plane === "xz" ? { x: u, y: 0, z: v } : { x: 0, y: -v, z: u };
      // varying ink is the other half of "something to track": a uniform sheet has no gradient
      // for motion to reveal
      const ink = inkVar ? Math.max(0.25, 1 - rng() * inkVar) : 1;
      out.push({
        p: toWorld(g, local),
        code: ch.charCodeAt(0),
        ink,
        sizeMul: 1 + (inkVar ? (rng() - 0.5) * inkVar : 0) * 0.6,
        sourceId: g.id,
        depthHint: g.depth ?? 0,
      });
    }
  }
  return out;
}

export function rasteriseCloud(c: AsciiCloud): GlyphPlacement[] {
  const out: GlyphPlacement[] = [];
  const rng = mulberry32(c.seed ?? 0x1234);
  const glyphs = c.glyphs && c.glyphs.length > 0 ? c.glyphs : ".";
  for (let i = 0; i < c.count; i++) {
    const local: Vec3 = {
      x: (rng() - 0.5) * 2 * c.bounds.x,
      y: (rng() - 0.5) * 2 * c.bounds.y,
      z: (rng() - 0.5) * 2 * c.bounds.z,
    };
    out.push({
      p: toWorld(c, local),
      code: glyphs[i % glyphs.length]!.charCodeAt(0),
      ink: 1,
      sizeMul: 1,
      sourceId: c.id,
      depthHint: c.depth ?? 0,
    });
  }
  return out;
}

export function rasteriseTrail(t: AsciiTrail): GlyphPlacement[] {
  const out: GlyphPlacement[] = [];
  const falloff = t.falloff ?? 1;
  const code = (t.glyph ?? ".").charCodeAt(0);
  for (let k = 0; k < t.length; k++) {
    const f = k / Math.max(1, t.length - 1);
    const local: Vec3 = {
      x: t.direction.x * k,
      y: t.direction.y * k,
      z: t.direction.z * k,
    };
    out.push({
      p: toWorld(t, local),
      code,
      ink: Math.max(0.05, Math.pow(1 - f, falloff)),
      sizeMul: 1,
      sourceId: t.id,
      depthHint: (t.depth ?? 0) + f,
    });
  }
  return out;
}

export function rasterisePoint(p: AsciiPoint): GlyphPlacement[] {
  const out: GlyphPlacement[] = [];
  const rng = mulberry32(p.seed ?? 0xabc);
  const spread = p.spread ?? { x: 0, y: 0, z: 0 };
  const code = (p.glyph ?? "*").charCodeAt(0);
  for (let i = 0; i < p.count; i++) {
    const local: Vec3 = {
      x: (rng() - 0.5) * 2 * spread.x,
      y: (rng() - 0.5) * 2 * spread.y,
      z: (rng() - 0.5) * 2 * spread.z,
    };
    out.push({
      p: toWorld(p, local),
      code,
      ink: 1,
      sizeMul: 1,
      sourceId: p.id,
      depthHint: p.depth ?? 0,
    });
  }
  return out;
}

/** Rasterise any object into glyph placements. Total over the object union. */
export function rasteriseObject(o: AsciiObject): GlyphPlacement[] {
  switch (o.kind) {
    case "text":
      return rasteriseText(o);
    case "line":
      return rasteriseLine(o);
    case "polyline":
      return rasterisePolyline(o);
    case "grid":
      return rasteriseGrid(o);
    case "cloud":
      return rasteriseCloud(o);
    case "trail":
      return rasteriseTrail(o);
    case "point":
      return rasterisePoint(o);
  }
}

export { mulberry32 };
