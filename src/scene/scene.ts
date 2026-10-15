/**
 * Scene compiler.
 *
 * A Scene is the fully-deterministic, render-ready form of a ShotSpec. Compiling
 * is a pure function of (FilmSpec, ShotSpec): the same spec always yields the same
 * primitive cloud, so the whole film is reproducible and diffable.
 *
 * Every visual element in this engine is a *primitive field*. There is no image
 * input anywhere in the pipeline: a scene is a set of point primitives with a
 * radius, an intensity and a transform. The ASCII rasterizer turns point fields
 * into character cells, which is what makes the visual language strictly ASCII.
 *
 * Two invariants are enforced here rather than trusted:
 *
 *  1. NO ORPHAN PRIMITIVES. Every primitive must land inside the frame at some
 *     point during the shot. A primitive that is never on screen is a bug, not a
 *     style choice. This is what makes "characters enter from the edge" verifiable:
 *     the rim field's rest position is off-frame and its assembled position is on
 *     frame, so each primitive is guaranteed to cross the frame edge.
 *
 *  2. RADIAL ANCHORING. For ring/shards, the authored transform offset is applied
 *     *along each primitive's own direction from the layer origin*, so an assemble
 *     is a true convergence and a scatter is a true explosion.
 */

import { createRng } from "../core/rng.js";
import { clamp01, vec3, type Vec3 } from "../core/math.js";
import type { LayerSpec, ShapeKind, ShotSpec } from "../domain/schema.js";
import { project } from "../core/math.js";
import { solveCamera } from "../camera/rig.js";
import { objectAlive, objectInk, rasteriseObject, type AsciiObject } from "../ascii/objects.js";
import { compileForm } from "../director/grammar/forms.js";

export interface Primitive {
  /** index within its layer, used by per-particle transforms */
  i: number;
  /** seeded rest position in world space */
  p: Vec3;
  /** unit direction from the layer origin; drives assemble/dissolve offsets */
  dir: Vec3;
  /** normalized distance from the layer origin (0 centre .. 1 rim) */
  rim: number;
  /** per-primitive size multiplier */
  sizeMul: number;
  /** per-primitive intensity multiplier */
  intMul: number;
  /** phase used for per-primitive flicker/jitter */
  phase: number;
  /** true when this primitive is inside the frame at some point in the shot */
  onScreenAtSomePoint: boolean;
  /**
   * An AUTHORED character for this primitive, from a native ASCII object.
   *
   * When set, the renderer draws this character instead of choosing one from the cell's
   * brightness. That is what makes typography and structure possible: a line is made of `-`
   * because it was authored as `-`, not because `-` happened to be the right density.
   */
  glyphCode?: number;
}

export interface SceneLayer {
  spec: LayerSpec;
  origin: Vec3;
  prims: Primitive[];
  /** fraction of primitives that are on screen at least once */
  onScreenFraction: number;
}

export interface Scene {
  shotId: string;
  seed: number;
  layers: SceneLayer[];
  primitiveCount: number;
}

// ---------------------------------------------------------------------------
// Shape seeding
// ---------------------------------------------------------------------------

interface SeedCtx {
  layer: LayerSpec;
  origin: Vec3;
  seed: number;
}

/**
 * Place one primitive for a given shape. Shapes are volumetric point clouds rather
 * than meshes, because a glyph grid only ever sees point samples anyway.
 *
 * All shapes emit into the box (origin +/- bounds). For ring and shard, the radial
 * extent is set by bounds.x/bounds.z so the shape stays inside its box and the
 * assemble transform has a well-defined convergence target.
 */
function seedShape(shape: ShapeKind, ctx: SeedCtx): { p: Vec3; dir: Vec3; rim: number } {
  const rng = createRng(ctx.seed);
  const b = ctx.layer.bounds;
  const o = ctx.origin;
  const g = (): number => rng.gauss();

  switch (shape) {
    case "none": {
      // For a single-point layer, `bounds` IS the spawn offset — it is not a
      // half-extent to jitter within. The jitter must therefore stay tiny: with a
      // full-bounds gaussian here, the lone dot at the subject line (bounds.y = 1)
      // gets scattered up to 3 units off screen.
      const JITTER = 0.01;
      const p = vec3(
        o.x + b.x + g() * b.x * JITTER,
        o.y + b.y + g() * b.y * JITTER,
        o.z + b.z + g() * b.z * JITTER,
      );
      const d = vec3(p.x - o.x, p.y - o.y, p.z - o.z);
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      const span = Math.max(b.x, b.y, b.z, 1e-3);
      return { p, dir: vec3(d.x / len, d.y / len, d.z / len), rim: clamp01(len / span) };
    }
    case "disc": {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next());
      const p = vec3(o.x + Math.cos(a) * r * b.x, o.y + Math.sin(a) * r * b.y, o.z + g() * b.z * 0.5);
      return { p, dir: vec3(Math.cos(a), Math.sin(a), 0), rim: r };
    }
    case "ring": {
      const a = rng.next() * Math.PI * 2;
      // a thin annulus at the very rim of the layer's bounds
      const r = 0.90 + rng.next() * 0.10;
      const p = vec3(o.x + Math.cos(a) * r * b.x, o.y + Math.sin(a) * r * b.y, o.z + g() * b.z * 0.6);
      return { p, dir: vec3(Math.cos(a), Math.sin(a), 0), rim: r };
    }
    case "column": {
      const t = clamp01((g() + 3) / 6);
      const wid = 1 - t * 0.45;
      const p = vec3(o.x + g() * b.x * wid, o.y + (t - 0.5) * b.y * 2, o.z + g() * b.z * wid);
      const d = vec3(p.x - o.x, 0, p.z - o.z);
      const len = Math.hypot(d.x, d.z) || 1;
      return { p, dir: vec3(d.x / len, (t - 0.5) * 0.6, d.z / len), rim: t };
    }
    case "shard": {
      // Long thin splinters radiating out of the origin, biased outward. The radial
      // extent is bounds.x (not the offset origin), so scatter has room to travel.
      const a = rng.next() * Math.PI * 2;
      const elev = (rng.next() - 0.5) * 1.0;
      const r = 0.30 + Math.pow(rng.next(), 0.55) * 0.70;
      const jitter = Math.min(b.z, b.x) * 0.16;
      const p = vec3(
        o.x + Math.cos(a) * r * b.x + g() * jitter,
        o.y + Math.sin(elev) * r * b.y + g() * jitter,
        o.z + Math.sin(a) * r * b.z + g() * jitter,
      );
      const d = vec3(p.x - o.x, p.y - o.y, p.z - o.z);
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      return { p, dir: vec3(d.x / len, d.y / len, d.z / len), rim: clamp01(r) };
    }
    case "grid": {
      const gx = Math.round(g() * 3);
      const gy = Math.round(g() * 3);
      const gz = Math.round(g() * 2);
      const p = vec3(
        o.x + gx * (b.x / 3) + (rng.next() - 0.5) * 0.10,
        o.y + gy * (b.y / 3) + (rng.next() - 0.5) * 0.10,
        o.z + gz * (b.z / 3) + (rng.next() - 0.5) * 0.10,
      );
      const d = vec3(p.x - o.x, p.y - o.y, p.z - o.z);
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      return { p, dir: vec3(d.x / len, d.y / len, d.z / len), rim: clamp01(len / 3) };
    }
    case "humanoid":
    default: {
      // Head + neck + tapered torso + two arms + two legs, sampled by region
      // weight. Body spans y = 0..2.01 with the feet at y=0, matching the canonical
      // 2-unit subject height the camera rig is calibrated against.
      //
      // Two geometry notes that matter at 240x120 cells:
      //  - the head is an ELLIPSOID, not a sphere: cells are 8x9 px, so a round head
      //    already reads tall, and a sphere on top of a box reads as a gourd;
      //  - shoulders are the widest part of the torso (0.26 half-width), which is
      //    what makes the silhouette legible as a person rather than a post.
      const region = rng.next();
      let px = 0;
      let py = 0;
      let pz = 0;

      if (region < 0.145) {
        // head: 0.20 wide x 0.24 tall x 0.18 deep, centred at y=1.88
        const a = rng.next() * Math.PI * 2;
        const e = Math.acos(1 - 2 * rng.next());
        const rr = Math.cbrt(rng.next());
        px = Math.sin(e) * Math.cos(a) * 0.20 * rr;
        py = 1.88 + Math.cos(e) * 0.24 * rr;
        pz = Math.sin(e) * Math.sin(a) * 0.18 * rr;
      } else if (region < 0.20) {
        // neck
        px = g() * 0.085;
        py = 1.55 + rng.next() * 0.11;
        pz = g() * 0.065;
      } else if (region < 0.60) {
        // torso: tapered box, widest at the shoulders (y ~ 1.44)
        const t = rng.next();
        const shoulder = 0.52 * (1 - 0.40 * t);
        px = g() * shoulder * 0.5;
        py = 1.44 - t * 0.60;
        pz = g() * 0.115;
      } else if (region < 0.80) {
        // arms: from the shoulder out and down, slightly splayed
        const side = rng.next() < 0.5 ? -1 : 1;
        const t = rng.next();
        px = side * (0.23 + t * 0.10 + g() * 0.045);
        py = 1.38 - t * 0.80;
        pz = g() * 0.075;
      } else {
        // legs: from the hips down, slightly apart
        const side = rng.next() < 0.5 ? -1 : 1;
        const t = rng.next();
        px = side * (0.085 + t * 0.055 + g() * 0.033);
        py = 0.86 - t * 0.86;
        pz = g() * 0.075;
      }

      const d = vec3(px, py - 0.95, pz);
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      return { p: vec3(px, py, pz), dir: vec3(d.x / len, d.y / len, d.z / len), rim: clamp01(len / 1.1) };
    }
  }
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

export function compileScene(
  film: { seed: number; width: number; height: number; raster: { cols: number; rows: number } },
  shot: ShotSpec,
): Scene {
  const layers: SceneLayer[] = [];
  let primitiveCount = 0;
  const aspect = film.width / film.height;

  shot.layers.forEach((spec, li) => {
    const layerSeed =
      (film.seed ^
        Math.imul(shotIndex(shot.id) + 1, 0x9e3779b1) ^
        Math.imul(li + 1, 0x85ebca6b) ^
        hashLayerId(spec.id)) >>>
      0;

    const originRng = createRng(layerSeed ^ 0x5f356495);
    const origin = vec3(
      originRng.signed() * Math.max(0, spec.bounds.x * 0.03),
      originRng.signed() * Math.max(0, spec.bounds.y * 0.03),
      originRng.signed() * Math.max(0, spec.bounds.z * 0.03),
    );

    const baseRng = createRng(layerSeed);

    // NATIVE ASCII OBJECTS take precedence over the procedural shape sampler. Each object emits
    // its own glyph placements, so the layer's characters are AUTHORED rather than inferred from
    // brightness. A layer with native objects ignores `count` and `shape`.
    /**
     * SUBJECT FORMS COMPILE HERE, at the scene-compile step, so that the form — not just the marks it
     * produced — is what travels through the pipeline. A form's objects are appended to any authored
     * native objects, so a layer may carry both.
     */
    const compiledFromForms: AsciiObject[] = [];
    if (spec.subjectForms && spec.subjectForms.length > 0) {
      for (const form of spec.subjectForms) {
        const compiled = compileForm(form);
        compiledFromForms.push(...compiled.objects);
      }
    }
    const native = spec.nativeObjects && spec.nativeObjects.length > 0
      ? [...compiledFromForms, ...spec.nativeObjects]
      : compiledFromForms.length > 0
        ? compiledFromForms
        : spec.nativeObjects;
    if (native && native.length > 0) {
      const placements: { p: Vec3; code: number; ink: number; sizeMul: number }[] = [];
      for (const obj of native) {
        /**
         * `objectInk` CARRIES PER-OBJECT OPACITY AND LIFETIME, AND IT WAS NOT BEING CALLED HERE.
         *
         * The whole native-object path used `pl.ink` alone, which is the rasteriser's per-placement
         * coverage — so **`opacity` did nothing on a native object.** `objectAlive` was called and its
         * result immediately `void`ed, and `objectInk` was imported for the procedural path only.
         *
         * This is the tenth inert field found in this project, and it was found by trying to USE it:
         * the `disappearing-room` rebuild expresses the name's erasure as a fade on the `name` form,
         * which is an opacity change, and the first thing checked was whether opacity reaches the
         * renderer at all.
         *
         * Ink is now the product of the rasteriser's coverage and the object's own opacity/velocity
         * ink at this shot time, so a form can be faded, and a placement can be given a lifetime.
         */
        /**
         * ⚠ LIMITATION, STATED RATHER THAN HIDDEN: this is applied ONCE, at compile time.
         *
         * `compileScene` builds a static primitive list — there is no per-frame time here — so an
         * object's opacity is folded into its ink now, and an object dead at `u = 0` emits nothing for
         * the whole shot. **A form therefore cannot fade in or out over a shot through `opacity`
         * alone.** Animating it needs the renderer to evaluate `objectInk` per frame, which is a change
         * to `frame.ts` and is NOT made here.
         *
         * What this DOES fix: `opacity` was previously ignored entirely on the native path, so setting
         * it had no effect at all. It now takes effect, uniformly across the shot, which is exactly
         * what the `disappearing-room` rebuild needs to build **erasure states** — a form authored
         * partially or fully erased.
         */
        const alive = objectAlive(obj, 0);
        const objInk = objectInk(obj, 0, 0);
        for (const g of rasteriseObject(obj)) {
          // a dead object emits nothing at all; a live one emits coverage x its own opacity
          const ink = alive ? g.ink * objInk : 0;
          placements.push({ p: g.p, code: g.code, ink, sizeMul: g.sizeMul });
        }
      }
      const n = placements.length;
      const prims: Primitive[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const pl = placements[i]!;
        const d = vec3(pl.p.x - origin.x, pl.p.y - origin.y, pl.p.z - origin.z);
        const len = Math.hypot(d.x, d.y, d.z) || 1;
        const span = Math.max(spec.bounds.x, spec.bounds.y, spec.bounds.z, 1e-3);
        prims[i] = {
          i,
          p: pl.p,
          dir: vec3(d.x / len, d.y / len, d.z / len),
          rim: clamp01(len / span),
          sizeMul: pl.sizeMul,
          // the object's own ink becomes the primitive's intensity multiplier
          intMul: Math.max(0, pl.ink),
          phase: baseRng.next() * Math.PI * 2,
          onScreenAtSomePoint: false,
          // the AUTHORED character for this primitive
          glyphCode: pl.code,
        } as Primitive;
      }
      layers.push({ spec, origin, prims, onScreenFraction: 1 });
      primitiveCount += n;
      return;
    }

    const prims: Primitive[] = new Array(spec.count);
    for (let i = 0; i < spec.count; i++) {
      const shape = seedShape(spec.shape, {
        layer: spec,
        origin,
        seed: (layerSeed + Math.imul(i + 1, 0x27d4eb2d)) >>> 0,
      });
      const v = clamp01(spec.variation);
      prims[i] = {
        i,
        p: shape.p,
        dir: shape.dir,
        rim: shape.rim,
        sizeMul: 1 + baseRng.signed() * v,
        intMul: Math.max(0, 1 + baseRng.signed() * v * 0.8),
        phase: baseRng.next() * Math.PI * 2,
        onScreenAtSomePoint: false,
      };
    }

    if (spec.depthBias !== 0) {
      const shift = spec.depthBias * spec.bounds.z * 0.5;
      for (const prim of prims) prim.p.z += shift;
    }

    // Blocking: shift the whole population vertically. Applied after seeding so the
    // shape's own geometry is unaffected.
    if (spec.offsetY !== 0) {
      for (const prim of prims) prim.p.y += spec.offsetY;
    }

    annotateVisibility(film, shot, spec, origin, prims, aspect);
    const onScreen = prims.reduce((n, p) => n + (p.onScreenAtSomePoint ? 1 : 0), 0);

    layers.push({ spec, origin, prims, onScreenFraction: prims.length > 0 ? onScreen / prims.length : 0 });
    primitiveCount += prims.length;
  });

  return { shotId: shot.id, seed: film.seed, layers, primitiveCount };
}

/**
 * Mark which primitives are ever inside the frame.
 *
 * The transform offset is recomputed exactly as the renderer does it, sampling the
 * shot at several points so a primitive that only enters mid-shot is still counted.
 */
function annotateVisibility(
  film: { width: number; height: number; raster: { cols: number; rows: number } },
  shot: ShotSpec,
  spec: LayerSpec,
  origin: Vec3,
  prims: Primitive[],
  aspect: number,
): void {
  const SAMPLE_TIMES = 13;
  const cols = film.raster.cols;
  const rows = film.raster.rows;
  const margin = 1.06; // allow a primitive to sit just off the edge and still "be seen"

  for (let s = 0; s < SAMPLE_TIMES; s++) {
    const u = s / (SAMPLE_TIMES - 1);
    const t = u * shot.duration;
    const camera = solveCamera(film, shot, t, aspect);
    const st = transformAt(spec, u);

    for (const prim of prims) {
      if (prim.onScreenAtSomePoint) continue;
      // the staggered kinds add their own per-primitive displacement and scale; for the radial kinds
      // this contributes nothing, so the existing behaviour is unchanged
      const stp = transformAtPrimitive(spec, u, prim.dir, prim.rim, prim.i);
      const off = st.radialOffset * prim.rim + stp.extraOffset;
      let wx = prim.p.x + prim.dir.x * off;
      let wy = prim.p.y + prim.dir.y * off;
      let wz = prim.p.z + prim.dir.z * off;
      const effectiveScale = st.radialScale * stp.scaleMul;
      if (effectiveScale !== 1) {
        const sc = effectiveScale;
        wx = origin.x + (wx - origin.x) * sc;
        wy = origin.y + (wy - origin.y) * sc;
        wz = origin.z + (wz - origin.z) * sc;
      }
      const pr = project(camera, { x: wx, y: wy, z: wz }, { visible: false, sx: 0, sy: 0, depth: 0 });
      if (!pr.visible) continue;
      const gx = pr.sx * camera.worldToCells + cols * 0.5;
      const gy = rows * 0.5 - pr.sy * camera.worldToCells;
      const limitX = cols * 0.5 * margin;
      const limitY = rows * 0.5 * margin;
      if (Math.abs(gx - cols * 0.5) <= limitX && Math.abs(gy - rows * 0.5) <= limitY) {
        prim.onScreenAtSomePoint = true;
      }
    }
  }
}

/** The transform response, duplicated here so seeding and rendering agree exactly. */
function transformAt(spec: LayerSpec, u: number): { radialOffset: number; radialScale: number } {
  const t = clamp01(u);
  const smooth = (a: number, b: number): number => {
    if (b <= a) return t >= b ? 1 : 0;
    const x = clamp01((t - a) / (b - a));
    return x * x * (3 - 2 * x);
  };
  switch (spec.transform) {
    case "assemble":
      return { radialOffset: (1 - smooth(0.0, 0.85)) * 0.55, radialScale: 1 };
    case "dissolve":
      return { radialOffset: smooth(0.0, 1.0) * 2.7, radialScale: 1 + smooth(0, 1) * 0.55 };
    case "collapse":
      return { radialOffset: -smooth(0, 1) * 0.2, radialScale: 1 - smooth(0, 1) * 0.35 };
    case "scatter":
      return { radialOffset: smooth(0, 1) * 3.4, radialScale: 1 + smooth(0, 1) * 0.4 };
    case "none":
    default:
      return { radialOffset: 0, radialScale: 1 };
  }
}

/**
 * PER-PRIMITIVE TRANSFORMS, for the kinds that are inherently STAGGERED.
 *
 * `transformAt` above returns one value for the whole layer, which is right for a radial gesture —
 * assemble, dissolve, collapse, scatter all move every primitive together. Five of the nine
 * transitions Gate 6 names are not like that: TYPE ON, ERASE, SCRAMBLE, STRETCH and COMPRESS act on
 * primitives AT DIFFERENT TIMES or TO DIFFERENT DEGREES, so they need the primitive's own identity.
 *
 * `dir` is used as the ordering key for the staggered kinds. For a text or line object it points
 * along the shape, so a sweep across it reads as writing; for a grid it varies per mark, which reads
 * as noise. Both are useful and the object decides which it gets.
 */
function transformAtPrimitive(
  spec: LayerSpec,
  u: number,
  dir: { x: number; y: number },
  rim: number,
  index: number,
): { extraOffset: number; scaleMul: number } {
  const t = clamp01(u);
  const smooth = (a: number, b: number): number => {
    if (b <= a) return t >= b ? 1 : 0;
    const x = clamp01((t - a) / (b - a));
    return x * x * (3 - 2 * x);
  };
  /** a stable 0..1 key from the primitive's own identity, for the noisy kinds */
  const key = ((Math.sin(index * 12.9898 + dir.x * 78.233 + dir.y * 37.719) * 43758.5453) % 1 + 1) % 1;
  /** 0..1 ordering along the primitive's own direction, for the sweeping kinds */
  const along = clamp01((dir.x + dir.y + 2) / 4);

  switch (spec.transform) {
    /**
     * TYPE ON — marks appear one after another, in the object's own reading order. Each primitive has
     * its own arrival window, so the shape is written rather than faded in.
     */
    case "type-on": {
      const start = along * 0.6;
      const p = smooth(start, start + 0.4);
      return { extraOffset: (1 - p) * 0.7, scaleMul: p < 0.02 ? 0.001 : 1 };
    }
    /** ERASE — the reverse of type-on: marks leave in reading order. */
    case "erase": {
      const start = (1 - along) * 0.6;
      const p = smooth(start, start + 0.4);
      return { extraOffset: p * 0.9, scaleMul: p > 0.98 ? 0.001 : 1 };
    }
    /** SCRAMBLE — every mark flickers on and off on its own schedule, so the shape boils. */
    case "scramble": {
      const w = Math.sin(t * Math.PI * 6 + key * Math.PI * 2);
      return { extraOffset: (1 - t) * 0.3 + key * 0.25, scaleMul: w < -0.4 ? 0.001 : 1 - t * 0.1 };
    }
    /** STRETCH — the shape elongates along its own direction while surviving. */
    case "stretch":
      return { extraOffset: 0, scaleMul: 1 + smooth(0, 1) * 0.9 };
    /** COMPRESS — the shape contracts along its own direction. */
    case "compress":
      return { extraOffset: smooth(0, 1) * 0.25, scaleMul: 1 - smooth(0, 1) * 0.45 };
    /** REPLACE — marks are exchanged one at a time; expressed as a staggered radial re-seat. */
    case "replace": {
      const p = smooth(key * 0.7, key * 0.7 + 0.3);
      return { extraOffset: (1 - p) * 0.5 + p * 0.15, scaleMul: 1 };
    }
    default:
      return { extraOffset: 0, scaleMul: 1 };
  }
}

function shotIndex(id: string): number {
  const n = Number.parseInt(id, 10);
  return Number.isFinite(n) ? n : 0;
}

function hashLayerId(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function sceneStats(scene: Scene): {
  layers: Array<{
    id: string;
    kind: string;
    shape: string;
    count: number;
    transform: string;
    depth: string;
    role: string;
    onScreenFraction: number;
  }>;
  primitiveCount: number;
  minOnScreenFraction: number;
} {
  const layers = scene.layers.map((l) => ({
    id: l.spec.id,
    kind: l.spec.kind,
    shape: l.spec.shape,
    count: l.prims.length,
    transform: l.spec.transform,
    depth: l.spec.depth,
    role: l.spec.role,
    onScreenFraction: Number(l.onScreenFraction.toFixed(4)),
  }));
  return {
    primitiveCount: scene.primitiveCount,
    layers,
    minOnScreenFraction: layers.length ? Math.min(...layers.map((l) => l.onScreenFraction)) : 1,
  };
}

/** Exposed for tests: deterministic digest of a compiled scene. */
export function sceneDigest(scene: Scene): string {
  let h = 2166136261 >>> 0;
  for (const layer of scene.layers) {
    for (const p of layer.prims) {
      const vals = [p.p.x, p.p.y, p.p.z, p.sizeMul, p.intMul, p.phase];
      for (const v of vals) {
        const q = Math.round(v * 1e5);
        h ^= q & 0xff;
        h = Math.imul(h, 16777619) >>> 0;
        h ^= (q >>> 8) & 0xff;
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
  }
  return h.toString(16).padStart(8, "0");
}
