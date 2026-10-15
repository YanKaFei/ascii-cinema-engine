/**
 * V3 CINEMATIC GEOMETRY — a camera that can actually be somewhere and point at something.
 *
 * ⚠ THE V2 DEFECT THIS REPLACES, measured: every one of V2's five shots used `x=0`,
 * `target=(0, EYE_Y, 0)`, `focal=0.9`, and `camZ` within 0.15. **There was no camera angle, no lateral
 * position and no framing change available to the director**, so five shots could only differ by what stood in
 * front of one fixed viewpoint. That is why they read as one continuous shot.
 *
 * This module provides a real camera: position, look-at target, and **field of view**, from which a true
 * view basis is built. It also provides the shot-scale vocabulary the brief requires, expressed as a
 * measurable property (subject height as a fraction of frame height) rather than as a label.
 */
import { assertFinite } from "../semantic/shot-compiler.js";

export interface Vec3 { x: number; y: number; z: number }
export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const norm = (a: Vec3): Vec3 => { const l = length(a); return l < 1e-12 ? v3(0, 0, 0) : scale(a, 1 / l); };
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

/**
 * THE CAMERA. `fovDegrees` replaces V2's opaque `focal` constant with a real viewing angle, so a "wide" and a
 * "long" lens are materially different projections rather than a scale factor.
 */
export interface Camera {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fovDegrees: number;
  /** roll in degrees about the view axis — a genuine compositional tool */
  rollDegrees: number;
  aspect: number;
  /** distance to the near plane, in world units */
  near: number;
}

export interface CamBasis { right: Vec3; up: Vec3; forward: Vec3; pos: Vec3; tanHalfFov: number; aspect: number; near: number }

/** build an orthonormal view basis */
export function camBasis(c: Camera): CamBasis {
  assertFinite({ px: c.position.x, py: c.position.y, pz: c.position.z, fov: c.fovDegrees, roll: c.rollDegrees, aspect: c.aspect }, "camBasis");
  if (c.fovDegrees <= 0 || c.fovDegrees >= 179) throw new Error(`camBasis: fov ${c.fovDegrees} out of range`);
  const forward = norm(sub(c.target, c.position));
  let up = norm(c.up);
  let right = norm(cross(forward, up));
  if (length(right) < 1e-9) { up = v3(0, 0, 1); right = norm(cross(forward, up)); }
  up = norm(cross(right, forward));
  /** roll is applied about the forward axis, so the horizon can be deliberately tilted */
  if (Math.abs(c.rollDegrees) > 1e-9) {
    const a = (c.rollDegrees * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const r2 = add(scale(right, ca), scale(up, sa));
    const u2 = add(scale(up, ca), scale(right, -sa));
    right = r2; up = u2;
  }
  return { right, up, forward, pos: c.position, tanHalfFov: Math.tan((c.fovDegrees * Math.PI) / 360), aspect: c.aspect, near: c.near };
}

export interface CamPoint { x: number; y: number; depth: number; visible: boolean }

/**
 * PROJECT a world point to normalised screen space.
 *
 * `x` and `y` are in [-1, 1] with y UP; the caller maps them to the glyph lattice. **Points behind the near
 * plane are marked `visible: false` rather than projected**, which is the discipline V2's legacy paths lacked.
 */
export function project(b: CamBasis, p: Vec3): CamPoint {
  const d = sub(p, b.pos);
  const z = dot(d, b.forward);
  if (z <= b.near) return { x: 0, y: 0, depth: z, visible: false };
  const x = dot(d, b.right) / (z * b.tanHalfFov * b.aspect);
  const y = dot(d, b.up) / (z * b.tanHalfFov);
  return { x, y, depth: z, visible: true };
}

/** clip a segment against the near plane, returning the visible portion or null */
export function clipSegment(b: CamBasis, a: Vec3, c: Vec3): [Vec3, Vec3] | null {
  const da = dot(sub(a, b.pos), b.forward), dc = dot(sub(c, b.pos), b.forward);
  if (da <= b.near && dc <= b.near) return null;
  if (da > b.near && dc > b.near) return [a, c];
  const t = (b.near - da) / (dc - da);
  const hit = lerp3(a, c, t);
  return da > b.near ? [a, hit] : [hit, c];
}

/**
 * SHOT SCALE — expressed as **subject height as a fraction of frame height**, so "close-up" is a measurement
 * rather than a label the code asserts about itself.
 */
export const SHOT_SCALE = {
  extremeCloseUp: 0.85,
  closeUp: 0.55,
  medium: 0.30,
  wide: 0.16,
  extremeWide: 0.08,
} as const;
export type ShotScaleName = keyof typeof SHOT_SCALE;

/** how tall a world-space subject appears, as a fraction of frame height */
export function subjectHeightFraction(b: CamBasis, feet: Vec3, head: Vec3): number {
  const f = project(b, feet), h = project(b, head);
  if (!f.visible && !h.visible) return 0;
  return Math.abs(h.y - f.y) / 2;   // y is in [-1,1], so the full frame spans 2
}
export function classifyScale(fraction: number): ShotScaleName {
  const es = Object.entries(SHOT_SCALE) as [ShotScaleName, number][];
  for (const [name, min] of es.sort((a, b) => b[1] - a[1])) if (fraction >= min) return name;
  return "extremeWide";
}

/**
 * A camera SOLVED to produce a requested shot scale, given a subject.
 *
 * This makes the shot-scale vocabulary **usable by a director**: ask for a close-up and the camera moves to the
 * distance that produces one. V2 had no such relationship, so scale could not be chosen at all.
 */
export function solveCameraForScale(args: { subjectBase: Vec3; subjectTop: Vec3; direction: Vec3; target?: Vec3; fovDegrees: number; aspect: number; desiredFraction: number; near?: number }): Camera {
  const { subjectBase, subjectTop, direction, fovDegrees, aspect, desiredFraction } = args;
  const dir = norm(direction);
  const target = args.target ?? lerp3(subjectBase, subjectTop, 0.55);
  /** binary search the distance that yields the requested fraction */
  let lo = 0.2, hi = 60;
  const camAt = (d: number): Camera => ({ position: add(target, scale(dir, d)), target, up: v3(0, 1, 0), fovDegrees, rollDegrees: 0, aspect, near: args.near ?? 0.05 });
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const fr = subjectHeightFraction(camBasis(camAt(mid)), subjectBase, subjectTop);
    if (fr > desiredFraction) lo = mid; else hi = mid;
  }
  return camAt((lo + hi) / 2);
}
