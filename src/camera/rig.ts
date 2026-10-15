/**
 * Camera rig.
 *
 * The camera is a real perspective camera in the same world as the primitive
 * fields, which is what makes parallax, push-in and lateral moves physical rather
 * than a post-effect. The rig is a pure function of (ShotSpec, local time), so it
 * is frame-accurate, deterministic, and can be sampled at any fps.
 *
 * There are two distinct quantities here and conflating them is a trap:
 *
 *   basis.focal : the perspective ratio in `s = focal * v / depth`. This is the
 *                 classic pinhole term and MUST stay 1.0, because the camera
 *                 distance itself is the framing control. Anything else
 *                 double-counts the distance.
 *   worldToCells: cells per world unit, constant for the whole shot, derived from
 *                 the framing at rest: worldToCells = rows / visibleHeight where
 *                 visibleHeight = 2 * focusDistance.
 *
 * So `focusDistance` IS the framing: the visible world height at the rest plane is
 * exactly 2 * focusDistance. A focusDistance of 1.4 frames a 2.8-unit-tall window,
 * which holds the 2.0-unit-tall subject with generous headroom. (An earlier revision
 * folded focusDistance into `focal` and derived it from the grid WIDTH; that error
 * scaled every screen-space measurement by the aspect ratio times the distance.)
 */

import { ease } from "../core/easing.js";
import { clamp, makeBasis, vec3, type CameraBasis, type Vec3 } from "../core/math.js";
import type { CameraMoveSpec, ShotSpec } from "../domain/schema.js";

/**
 * World-space point the framing is derived from.
 *
 * Aiming at 1.05 (slightly above the 2.0-unit subject's mid-height) leaves headroom
 * above the crown, which matters because the densest shot pushes in to a 50% shorter
 * visible height. A subject line of 0.88 wasted the lower third and clipped the head
 * once the push-in resolved.
 */
export const SUBJECT: Vec3 = vec3(0, 1.05, 0);

export interface CameraState extends CameraBasis {
  /** normalized one-way progress of the authored move, 0..1 */
  progress: number;
  /** distance from camera to subject */
  distance: number;
  /** the shot's fov, already including zoom boost */
  fovY: number;
  /** visible world height at the rest plane */
  visibleHeight: number;
  /** cells per world unit; constant for a shot, includes the zoom boost */
  worldToCells: number;
  /**
   * The depth the lens is focused at, AFTER rack focus and lens breathing. Different from `distance`
   * as soon as a rack focus is running: `distance` is where the camera is, this is where it is
   * looking sharply. Depth of field compares a cell's z against THIS.
   */
  focusDistance: number;
}

export interface CameraSamples {
  pos: Vec3;
  /** cells per world unit at the rest plane */
  worldToCells: number;
  roll: number;
  /**
   * The depth the lens is focused at, after rack focus and lens breathing. Compared against a cell's
   * z to decide how far out of focus it is; `solveCamera`'s `distance` is where the camera IS, which
   * is a different quantity once a rack focus is running.
   */
  focusDistance: number;
}

/**
 * Sample the authored move at normalized shot progress `u`.
 * Exported separately from `solveCamera` so the render report can plot the move.
 */
/**
 * Everything the rig needs to know about a camera move.
 *
 * Narrowed from a whole v1 `ShotSpec` so that FilmSpec v2 shots and SceneIR keys can drive
 * the same rig without either version being coupled to the other. Geometry must have one
 * implementation, not one per spec version.
 */
export interface RigShot {
  duration: number;
  camera: CameraMoveSpec;
}

export function sampleCamera(shot: RigShot, secondsIntoShot: number, rows: number): CameraSamples {
  const d = Math.max(1e-6, shot.duration);
  const raw = clamp(secondsIntoShot / d, 0, 1);
  const cam = shot.camera;
  /**
   * ANTICIPATION. The camera pulls back before it moves, then goes.
   *
   * Applied to the EASED progress rather than to the distance, so it composes with any easing curve
   * and any move kind: the wind-up is a reduction of progress below the curve's own start, and it
   * decays to nothing before the move proper begins. `f(0)=0` and `f(1)=1` are preserved, so a move
   * with anticipation still starts and ends exactly where it would without it.
   *
   * Absent is 0, so a shot that does not ask for it is byte-identical to before.
   */
  const anticipation = cam.anticipation ?? 0;
  const u = ease(cam.easing, raw) - (anticipation > 0 ? anticipation * Math.sin(Math.PI * Math.min(1, raw / 0.3)) : 0);

  const baseDist = Math.max(0.05, cam.focusDistance);
  let distance = baseDist;
  /**
   * LENS BREATHING. A real lens changes its effective focal length as it focuses, so a push or a
   * pull alters the framing slightly on its own, in proportion to how far the move has travelled.
   *
   * Applied to the FOCUS DISTANCE rather than as a separate zoom, so it composes with `zoomBoost` and
   * with whatever move kind is running: at u=0 the framing is exact, and it widens as the move
   * progresses, which is the direction a lens actually breathes when focusing nearer.
   */
  const breathing = cam.lensBreathing ?? 0;
  let lateral = 0;
  let vertical = 0;
  let yaw = 0;
  let jitterAmt = cam.jitter;

  // Signed travel for two-sided moves (they cross through the start framing).
  const motion = u - 0.5;
  switch (cam.kind) {
    case "static":
      break;
    case "push-in":
      distance = baseDist * (1 - cam.dollyAmount * u);
      break;
    case "pull-out":
      distance = baseDist * (1 + cam.dollyAmount * u);
      break;
    case "lateral-left":
      lateral = -cam.panAmount * motion;
      break;
    case "lateral-right":
      lateral = cam.panAmount * motion;
      break;
    case "crane-up":
      vertical = cam.panAmount * motion;
      break;
    case "crane-down":
      vertical = -cam.panAmount * motion;
      break;
    case "orbit":
      yaw = cam.yawAmount * motion;
      distance = baseDist * (1 - cam.dollyAmount * 0.5 * u);
      break;
    case "handheld":
      jitterAmt = Math.max(jitterAmt, 0.02);
      lateral = cam.panAmount * motion;
      break;
  }

  distance = Math.max(0.15, distance);

  // Handheld jitter: a sum of incommensurate sines driven by shot-relative time, so
  // it never depends on when the render was started.
  let jx = 0;
  let jy = 0;
  let jz = 0;
  if (jitterAmt > 0) {
    const t = secondsIntoShot;
    const a = jitterAmt * distance;
    jx = a * (Math.sin(t * 2.31 + 0.7) * 0.6 + Math.sin(t * 5.13 + 2.1) * 0.4);
    jy = a * 0.7 * (Math.sin(t * 1.77 + 1.3) * 0.6 + Math.sin(t * 4.29 + 0.4) * 0.4);
    jz = a * 0.5 * Math.sin(t * 3.11 + 3.0);
  }

  // Framing: the rest plane is 2 * baseDist world units tall, mapped onto `rows`
  // glyph cells. The zoom boost multiplies cells-per-unit, i.e. it magnifies.
  const worldToCells = (rows / (2 * baseDist)) * Math.max(0.05, cam.zoomBoost);

  const dirX = Math.sin(yaw);
  const dirZ = Math.cos(yaw);
  const pos = vec3(
    SUBJECT.x + dirX * distance + lateral + jx,
    SUBJECT.y + vertical + jy,
    SUBJECT.z + dirZ * distance + jz,
  );

  /**
   * RACK FOCUS and LENS BREATHING, computed here because this is where the move's own progress and
   * distance are known.
   *
   * RACK FOCUS travels the focus plane from `focusDistance` to `rackFocus.to` over the shot, so the
   * sharp plane moves without the camera moving — which is the whole point of the effect.
   * LENS BREATHING widens the framing slightly as the move progresses, which is what a real lens does
   * when it focuses nearer; it is applied to the FOCUS distance so it composes with any move kind.
   */
  let focusDistance = distance;
  const rack = cam.rackFocus;
  if (rack !== undefined) {
    const at = Math.max(1e-3, rack.at ?? 1);
    focusDistance += (rack.to - cam.focusDistance) * Math.min(1, raw / at);
  }
  if (breathing !== 0) focusDistance *= 1 + breathing * u;

  return { pos, worldToCells, roll: cam.roll, focusDistance };
}

/** Minimal film shape the rig needs; keeps this module free of the domain types. */
export interface RigFilm {
  raster: { cols: number; rows: number };
}

export function solveCamera(
  film: RigFilm,
  shot: ShotSpec,
  secondsIntoShot: number,
  aspect: number,
): CameraState {
  const rows = film.raster.rows;
  const s = sampleCamera(shot, secondsIntoShot, rows);
  // A pinhole ratio of 1 means "s is measured in the same units as v/depth", which
  // is what the camera-distance-driven framing needs.
  const basis = makeBasis(s.pos, SUBJECT, 2 * Math.atan(1), aspect, s.roll);
  const dx = s.pos.x - SUBJECT.x;
  const dy = s.pos.y - SUBJECT.y;
  const dz = s.pos.z - SUBJECT.z;
  const distance = Math.hypot(dx, dy, dz);
  return {
    ...basis,
    focal: 1,
    progress: clamp(secondsIntoShot / Math.max(1e-6, shot.duration), 0, 1),
    distance,
    fovY: basis.fovY,
    visibleHeight: rows / s.worldToCells,
    worldToCells: s.worldToCells,
    focusDistance: s.focusDistance,
  };
}

/** Smooth 0..1 visibility ramp used by assemble/dissolve. */
export function visibilityRamp(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0;
  const x = clamp((t - start) / (end - start), 0, 1);
  return x * x * (3 - 2 * x);
}
