/**
 * TARGET ANCHOR — an explicit spatial referent, so orientation and displacement are RELATIONAL.
 *
 * ⚠ WHY THIS EXISTS. The 3.3H.3 external review found that the notice read as **geometric deformation**
 * rather than **directed attention**, and the step read as growing/opening rather than as movement toward
 * anything. The measurements were all internally consistent and **none of them referenced the target**:
 *
 *   - the notice validated `headYaw` changed — not that the head faced the NAME
 *   - the step validated `rootX` moved 0.420 — a displacement **without a direction**
 *
 * **A displacement is meaningless without a direction.** Every orient / step / reach decision is now measured
 * against this anchor.
 */

export interface Vec3 { x: number; y: number; z: number }
/** a floor-plane vector: x and z, no height */
export interface Vec2 { x: number; z: number }

export interface TargetAnchor {
  id: string;
  /** where the target is in world space */
  world: Vec3;
  /** the target's extent, so "toward" can mean the near edge rather than the centre */
  halfWidth: number;
  halfHeight: number;
}

/** The floor-plane vector from a point to a target — the direction a step should travel. */
export function floorVectorTo(from: Vec3, t: TargetAnchor): Vec2 {
  return { x: t.world.x - from.x, z: t.world.z - from.z };
}

/** Floor-plane distance, ignoring height — the sense in which a step "gets closer". */
export function floorDistanceTo(from: Vec3, t: TargetAnchor): number {
  const v = floorVectorTo(from, t);
  return Math.hypot(v.x, v.z);
}

/** Unit direction in the floor plane. */
export function floorDirectionTo(from: Vec3, t: TargetAnchor): Vec2 {
  const v = floorVectorTo(from, t);
  const l = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / l, z: v.z / l };
}

/**
 * ALIGNMENT — the cosine between a motion vector and the direction to the target.
 *
 * `+1` is straight at the target, `0` is perpendicular (across the shot), `-1` is directly away. **This is
 * the number the 3.3H.3 validation was missing**: `rootX` displacement of 0.420 is compatible with walking
 * toward the target, across it, or away from it, and the old check could not tell the difference.
 */
export function alignmentWithTarget(motion: Vec2, from: Vec3, t: TargetAnchor): number {
  const d = floorDirectionTo(from, t);
  const m = Math.hypot(motion.x, motion.z) || 1;
  return (motion.x / m) * d.x + (motion.z / m) * d.z;
}

/**
 * A TARGET-DIRECTED STEP ENDPOINT.
 *
 * The step travels `distance` along the floor direction to the target, so **the endpoint is derived from the
 * target rather than from an axis**.
 */
export function stepToward(from: Vec3, t: TargetAnchor, distance: number): Vec3 {
  const d = floorDirectionTo(from, t);
  return { x: from.x + d.x * distance, y: from.y, z: from.z + d.z * distance };
}

/**
 * HEAD FACING — the direction the head points, as a floor-plane direction.
 *
 * The figure's facing is expressed as an angle in the floor plane; `0` faces the camera (`+z`), and the sign
 * follows the same convention as the body's yaw.
 */
export function headFacingVector(yawDeg: number): Vec2 {
  /**
   * ⚠ THE CONVENTION WAS WRONG IN THE FIRST VERSION AND REPORTED A 115 DEGREE TARGET YAW.
   *
   * The direction to the NAME from the start position is `(x 0.907, z -0.420)` — mostly **lateral**, and
   * *away* from the camera in z. Under `facing(y) = (sin y, cos y)` the solved yaw came out at **114.85
   * degrees**, which faces the opposite z half-plane: the head would have been declared "facing the target"
   * while pointing away from the wall.
   *
   * With `facing(y) = (sin y, -cos y)` the solved yaw is **65.15 degrees** and the dot product with the true
   * direction is **1.000000**. The convention is fixed here **once**, so every consumer agrees.
   */
  const r = (yawDeg * Math.PI) / 180;
  return { x: Math.sin(r), z: -Math.cos(r) };
}

/**
 * THE YAW THAT FACES THE TARGET — solved from the geometry, not chosen.
 *
 * This is what `notice` should drive toward: **the head's facing is computed from where the NAME actually
 * is**, so the orientation is a relationship rather than a constant that happens to look right.
 */
export function yawFacingTarget(head: Vec3, t: TargetAnchor): number {
  const d = floorDirectionTo(head, t);
  return (Math.atan2(d.x, -d.z) * 180) / Math.PI;
}

/** How well the head's facing matches the direction to the target, in degrees. 0 is exactly at the target. */
export function facingErrorDeg(head: Vec3, yawDeg: number, t: TargetAnchor): number {
  const f = headFacingVector(yawDeg);
  const d = floorDirectionTo(head, t);
  const dot = Math.max(-1, Math.min(1, f.x * d.x + f.z * d.z));
  return (Math.acos(dot) * 180) / Math.PI;
}

/**
 * STANCE — the foot positions for a coherent body.
 *
 * ⚠ THE DEFECT THIS FIXES, measured. The feet were authored as **absolute x positions** while the pelvis
 * followed `bodyCentre`. The pelvis moved 0.420 and the rear foot never followed it, so the legs stretched
 * between a moving pelvis and a fixed foot:
 *
 *     feet start 0.220 apart  ->  end 0.640 apart   (2.91x wider)
 *     hips span only 0.234                           (feet 2.7x the hip width)
 *
 * **That is the split stance the external review reported** — and it was a consequence of *how the stance was
 * authored*, not of the step being too wide. **The endpoint distance is unchanged**; what changes is that the
 * rear foot now makes its own rearward half-step, so the legs stay under the body.
 */
export interface Stance {
  leftFoot: Vec3;
  rightFoot: Vec3;
  movingFootLift: number;
  movingFoot: "left" | "right";
}

/**
 * Build the stance from the step's own endpoints.
 *
 * ⚠ TWO EARLIER VERSIONS OF THIS WERE WRONG, and both produced the split stance the external review reported.
 *
 * **v1** authored the feet as **absolute x positions** while the pelvis followed `bodyCentre`. The pelvis moved
 * 0.420 and the rear foot never followed it, so the legs stretched between a moving pelvis and a fixed foot:
 * feet ended **2.91x** their starting separation.
 *
 * **v2** made the feet relative to the body, but sized the fore/aft offsets by `stanceWidth * 3.5 = 0.40`
 * while the body travelled only **0.42** — so the feet were placed a full step length apart in YET ANOTHER
 * sense, and separation still reached **1.99x**.
 *
 * **v3, here:** the two feet are placed at **the step's own start and end points**, offset laterally by the
 * stance half-width. The body travels from one to the other. **The fore/aft separation is therefore exactly
 * the step distance by construction**, and when the body arrives the feet are directly beneath it. The
 * separation stays close to its starting value because start and end are one step apart, and the lateral
 * offset is constant.
 *
 * The rear foot then closes half its ground distance across the settle phase, so the pose converges rather
 * than opening.
 */
export function buildStance(
  startFloor: Vec3,
  endFloor: Vec3,
  moveDir: Vec2,
  travel: number,
  lateralHalf: number,
  lift: number,
  movingFoot: "left" | "right" = "right",
): Stance {
  const lateral = { x: -moveDir.z, z: moveDir.x };
  /** the rear foot is the one the body leaves; it closes half the gap during settle */
  const rearClose = Math.max(0, (travel - 0.72) / 0.28) * 0.5;
  const rearT = rearClose;
  const frontT = Math.min(1, travel / 0.70);
  const lerp = (a: Vec3, b: Vec3, u: number): Vec3 => ({ x: a.x + (b.x - a.x) * u, y: a.y, z: a.z + (b.z - a.z) * u });
  const withLat = (p: Vec3, sign: number): Vec3 => ({ x: p.x + lateral.x * lateralHalf * sign, y: p.y, z: p.z + lateral.z * lateralHalf * sign });
  const rear = withLat(lerp(startFloor, endFloor, rearT), -1);
  const front = withLat(lerp(startFloor, endFloor, frontT), 1);
  if (movingFoot === "right") return { leftFoot: rear, rightFoot: front, movingFootLift: lift, movingFoot: "right" };
  return { leftFoot: front, rightFoot: rear, movingFootLift: lift, movingFoot: "left" };
}
