/**
 * V3 GLYPH FIELD — characters as ANIMATED PARTICLES, not samples on a moving surface.
 *
 * ⚠ THE V1 LIMITATION THIS FIXES. In the V1 studies the glyphs were **sampled from a geometry each frame**:
 * position came from the shape, so a glyph had no existence between frames and `identity` was cosmetic. The
 * brief asks for **position, velocity, direction, identity and continuity**, which means the particle must
 * PERSIST — its own state must be integrated, and a shape can only attract or release it.
 *
 * So a particle here carries:
 *
 *   `id`        a stable index, so its glyph never changes arbitrarily
 *   `ch`        its character, fixed for its lifetime except at a designed substitution moment
 *   `p`, `v`    position and velocity, integrated per frame — **the source of visual continuity**
 *   `target`    where it currently wants to be (a letterform stroke, a wall, a drifting field)
 *   `age`       for staggered release and fade
 *
 * A shape is therefore an **attractor**: it sets `target` and the particle travels there. Breaking a shape
 * does not require regenerating anything — the attractor is removed and momentum carries the particles.
 */
import type { Vec3 } from "../design/geometry.js";
import { v3, add, scale, sub, length, norm } from "../design/geometry.js";

export interface Particle {
  id: number;
  ch: string;
  p: Vec3;
  v: Vec3;
  target: Vec3;
  /** 0..1 weight toward the target; how strongly the attractor holds it */
  hold: number;
  age: number;
  /** the material this particle currently belongs to, for the census and for takeover */
  material: string;
}

export interface FieldOptions {
  count: number;
  /** characters available to the field, in order of identity */
  alphabet: string;
  /** integration damping per frame; below 1 the field settles, above 1 it accelerates */
  damping: number;
  /** how strongly a target is pursued */
  attract: number;
  seed?: number;
}

/** a small deterministic PRNG, so the field is reproducible */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class GlyphField {
  readonly particles: Particle[] = [];
  private rnd: () => number;
  private opts: FieldOptions;
  constructor(o: FieldOptions) {
    this.opts = o;
    this.rnd = mulberry(o.seed ?? 12345);
    for (let i = 0; i < o.count; i++) {
      this.particles.push({
        id: i, ch: o.alphabet[i % o.alphabet.length]!,
        p: v3(0, 0, 0), v: v3(0, 0, 0), target: v3(0, 0, 0), hold: 0, age: 0,
        material: "field",
      });
    }
  }
  /** seed the field scattered through a box, with a little initial velocity */
  scatter(half: Vec3, spread = 0.02): void {
    for (const pt of this.particles) {
      pt.p = v3((this.rnd() * 2 - 1) * half.x, (this.rnd() * 2 - 1) * half.y, (this.rnd() * 2 - 1) * half.z);
      pt.v = v3((this.rnd() * 2 - 1) * spread, (this.rnd() * 2 - 1) * spread, (this.rnd() * 2 - 1) * spread);
      pt.hold = 0;
    }
  }
  /** assign targets from a list of positions, evenly; `hold` is how strongly they are gripped */
  attractTo(targets: Vec3[], hold = 1, material = "field", startIndex = 0): void {
    const n = targets.length;
    if (!n) return;
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i]!;
      pt.target = targets[(startIndex + i) % n]!;
      pt.hold = hold;
      pt.material = material;
    }
  }
  /** release every particle: momentum carries it, with an optional outward burst */
  release(burst = 0, material = "debris"): void {
    for (const pt of this.particles) {
      const d = length(pt.p) > 1e-6 ? norm(pt.p) : v3(0, 1, 0);
      pt.v = add(pt.v, scale(d, burst));
      pt.hold = 0;
      pt.material = material;
    }
  }
  /**
   * INTEGRATE. This is what gives the field `position, velocity, direction` and therefore continuity: an
   * outside force may steer it, but the particle's own velocity is never discarded.
   */
  step(dt: number, extras?: (pt: Particle, t: number) => Vec3 | undefined): void {
    const { attract, damping } = this.opts;
    for (const pt of this.particles) {
      pt.age += dt;
      /** spring toward the target, scaled by how strongly the attractor holds it */
      if (pt.hold > 0) {
        const toT = sub(pt.target, pt.p);
        pt.v = add(pt.v, scale(toT, attract * pt.hold * dt));
        /** damping only applies while held, so a released field keeps its momentum */
        pt.v = scale(pt.v, Math.pow(damping, dt * 60));
      }
      const ex = extras?.(pt, pt.age);
      if (ex) pt.v = add(pt.v, scale(ex, dt));
      pt.p = add(pt.p, scale(pt.v, dt));
    }
  }
  /**
   * ⚠ BIRTH AND RESERVATION — the repair for the field's silent pool reseating.
   *
   * The V3 defect: at the S6 cut the WHOLE 900-particle field was re-targeted from the room to the NAME, so
   * **900 glyphs crossed the frame in about three frames** (measured mean adjacent-frame difference 40.66/255).
   * The field did not evolve; it teleported.
   *
   * The repair has two parts:
   *
   *   `reserve(n)`     marks a contiguous block as OWNED BY ONE MATERIAL for the shot's life, so the room field
   *                    is never reseated.
   *   `birthFrom(pts)` gives a reserved block its own origin — the NAME's letterform points — so the debris is
   *                    **born where the letters were and inherits their identity**, rather than being a second
   *                    cloud that happens to appear.
   */
  reserve(from: number, count: number, material: string): void {
    for (let i = from; i < Math.min(this.particles.length, from + count); i++) {
      const pt = this.particles[i]!;
      pt.material = material;
      pt.hold = 0;
    }
  }
  /** give a reserved block a birth position, so its identity has a spatial origin */
  birthFrom(from: number, count: number, points: Vec3[], jitter = 0.004): void {
    for (let k = 0; k < count; k++) {
      const i = from + k;
      if (i >= this.particles.length) break;
      const pt = this.particles[i]!;
      const p = points[k % Math.max(1, points.length)] ?? v3(0, 0, 0);
      pt.p = v3(p.x + (this.rnd() * 2 - 1) * jitter, p.y + (this.rnd() * 2 - 1) * jitter, p.z + (this.rnd() * 2 - 1) * jitter);
      pt.v = v3(0, 0, 0);
      pt.age = 0;
    }
  }
  /**
   * SEAT a block onto targets for this frame only.
   *
   * ⚠ This is the crucial difference from `attractTo`: **it never touches a block the caller did not name.**
   * `attractTo` applies to every particle, which is what made the room and the debris impossible to hold
   * simultaneously and produced the state switch.
   */
  seat(from: number, count: number, targets: Vec3[], hold: number): void {
    if (!targets.length) return;
    for (let k = 0; k < count; k++) {
      const i = from + k;
      if (i >= this.particles.length) break;
      const pt = this.particles[i]!;
      pt.target = targets[k % targets.length]!;
      pt.hold = hold;
    }
  }
  /** replace a fraction of characters — a designed SUBSTITUTION, keeping position and identity */
  substitute(fraction: number, alphabet: string, pick: (i: number) => number): void {
    for (let i = 0; i < this.particles.length; i++) {
      if (pick(i) / 65536 >= fraction) continue;
      const pt = this.particles[i]!;
      pt.ch = alphabet[(pt.id * 7 + Math.floor(pt.age * 6)) % alphabet.length]!;
    }
  }
  /** how many particles are within a radius of a point — used to measure aggregation */
  countNear(centre: Vec3, radius: number): number {
    let n = 0;
    for (const pt of this.particles) if (length(sub(pt.p, centre)) <= radius) n++;
    return n;
  }
  /** the field's mean speed — the measured quantity behind "the characters are moving" */
  meanSpeed(): number {
    if (!this.particles.length) return 0;
    let s = 0; for (const pt of this.particles) s += length(pt.v);
    return s / this.particles.length;
  }
  census(): Record<string, number> {
    const m: Record<string, number> = {};
    for (const pt of this.particles) m[pt.material] = (m[pt.material] ?? 0) + 1;
    return m;
  }
}

/**
 * LETTERFORM TARGETS — a word rasterised to a list of world-space attractor points.
 *
 * The word is expressed in WORLD units and then converted to per-particle targets, so the same letterform can
 * live on a wall, be held in front of the camera, or be broken apart.
 */
export function letterTargets(word: string, font: Record<string, string[]>, args: { centre: Vec3; width: number; height: number; depth?: number; plane?: "xy" | "xz" }): Vec3[] {
  const out: Vec3[] = [];
  const cols = word.length * 6 - 1;
  const cw = args.width / cols, chh = args.height / 9;
  for (let li = 0; li < word.length; li++) {
    const pat = font[word[li]!]!;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) {
      if (pat[r]![c] !== "1") continue;
      const u = (li * 6 + c) * cw - args.width / 2 + cw / 2;
      const v = args.height / 2 - (r + 0.5) * chh;
      if (args.plane === "xz") out.push(v3(args.centre.x + u, args.centre.y, args.centre.z + v));
      else out.push(v3(args.centre.x + u, args.centre.y + v, args.centre.z + (args.depth ?? 0)));
    }
  }
  return out;
}

/** the NAME letterform, shared by every shot that needs it */
export const NAME_FONT: Record<string, string[]> = {
  N: ["10001","11001","10101","10011","10001","10001","10001","10001","10001"],
  A: ["01110","10001","10001","10001","11111","10001","10001","10001","10001"],
  M: ["10001","11011","10101","10001","10001","10001","10001","10001","10001"],
  E: ["11111","10000","10000","10000","11110","10000","10000","10000","10000","11111"],
};
