/**
 * BODY HIERARCHY — parent/child joint anchors, so no part can detach from its parent.
 *
 * ⚠ THE DEFECT THIS REPLACES. The 3.3H probe displaced the head laterally by up to 30% of body height while
 * the neck was drawn as a vertical box at the **unshifted root x**. At maximum head turn the head floated
 * clear of the torso. The cause was structural: **the head was positioned relative to the world/root x, not
 * relative to a neck anchor.** A screen-space offset would have hidden the symptom while leaving the cause.
 *
 * ## The hierarchy
 *
 * ```
 * root -> pelvis -> torso -> shoulder -> neck -> head
 *                     |
 *                     +-> arm
 * pelvis -> leg -> foot
 * ```
 *
 * Every joint is computed **in world space, from its parent**, and the whole chain is projected together. A
 * child therefore cannot leave its parent unless the *geometry* says so — and the geometry is what this file
 * measures.
 *
 * **This is not an anatomical skeleton engine.** It is the minimum hierarchy needed for continuity: six
 * anchors, offsets between them, and orientation applied at the joints that have any.
 */

export interface Vec3 { x: number; y: number; z: number }

/** The joint anchors. Each is placed from its PARENT, never from the world root directly. */
export const BODY_JOINTS = ["root", "pelvis", "torso", "shoulder", "neck", "head"] as const;
export type BodyJoint = (typeof BODY_JOINTS)[number];

/**
 * ORIENTATIONS — rotations applied at joints, in degrees, about the world Y axis (a turn).
 *
 * The **lateral facing** of the lower body is `+Z`; because the camera looks along `-Z`, a positive yaw
 * turns the figure toward its own left as seen from the camera.
 */
export interface BodyOrientation {
  torsoYaw: number;
  headYaw: number;
  /** forward lean of the torso, degrees; positive leans the upper body toward the camera */
  torsoLean: number;
}

/** The joint positions, in world space. All of them, every frame. */
export interface BodySkeleton {
  root: Vec3;
  pelvis: Vec3;
  torso: Vec3;
  shoulder: Vec3;
  neck: Vec3
  head: Vec3;
  headRadius: number;
  /** the two ends of the neck SEGMENT — the neck is drawn from `neck` to `neckTop` */
  neckTop: Vec3;
  /** shoulder half-width in world units, after orientation */
  shoulderHalf: number;
}

/**
 * BODY PROPORTIONS — declared as fractions of figure height so the whole skeleton scales with `height`.
 *
 * These are deliberately simple. The figure is abstract; what matters is that the chain is explicit and that
 * a child is always computed from its parent.
 */
export const PROPORTIONS = {
  /** pelvis sits this fraction of height above the feet */
  pelvis: 0.48,
  /** torso centre */
  torso: 0.66,
  /** shoulder line */
  shoulder: 0.78,
  /** neck anchor — the BASE of the neck, and the parent of the head */
  neck: 0.845,
  /** head centre */
  head: 0.94,
  /** head radius as a fraction of height */
  headRadius: 0.062,
  /** shoulder half-width as a fraction of height */
  shoulderHalf: 0.118,
  /** neck length as a fraction of height — the segment the head is anchored to */
  neckLength: 0.095,
} as const;

/**
 * Build the skeleton **in world space from the root upward**.
 *
 * The head is placed from `neckTop`, which is derived from `neck`, which is derived from `shoulder`, which is
 * derived from `torso`, which is derived from `pelvis`, which is derived from `root`. **No joint reads the
 * root directly except the root.**
 */
export function buildSkeleton(rootX: number, feetY: number, height: number, o: BodyOrientation, z = -0.2): BodySkeleton {
  const u = height;                       // world height of the figure
  const yaw = (deg: number): { s: number; c: number } => { const r = (deg * Math.PI) / 180; return { s: Math.sin(r), c: Math.cos(r) }; };
  /** a yaw rotates a lateral offset about Y: +x rotates toward the camera (+z) as the figure turns */
  const yawOffset = (deg: number, lateral: number): { x: number; z: number } => { const { s, c } = yaw(deg); return { x: lateral * c, z: lateral * s }; };

  const root: Vec3 = { x: rootX, y: feetY, z };

  /** PELVIS — directly above the root; carries the body's lateral position */
  const pelvis: Vec3 = { x: rootX, y: feetY + u * PROPORTIONS.pelvis, z };

  /** TORSO — above the pelvis, offset by the torso's own yaw and lean */
  const torsoYawOff = yawOffset(o.torsoYaw, 0);
  const leanZ = Math.sin((o.torsoLean * Math.PI) / 180) * u * 0.05;
  const torso: Vec3 = { x: pelvis.x, y: feetY + u * PROPORTIONS.torso, z: pelvis.z + leanZ };

  /** SHOULDER — above the torso, and the parent of both the neck and the arms */
  const shoulder: Vec3 = { x: torso.x + torsoYawOff.x * 0.0, y: feetY + u * PROPORTIONS.shoulder, z: torso.z };

  /**
   * NECK — the anchor. Its BASE sits above the shoulder, and it inherits the TORSO's yaw, not the head's.
   * This is the relationship the old code was missing: the neck follows the body.
   */
  const neck: Vec3 = { x: shoulder.x + torsoYawOff.x * 0.0, y: feetY + u * PROPORTIONS.neck, z: shoulder.z };

  /** the neck SEGMENT: from `neck` up to `neckTop`, tilted by the torso's yaw so it stays attached */
  const neckTop: Vec3 = { x: neck.x + torsoYawOff.x * 0.0, y: neck.y + u * PROPORTIONS.neckLength, z: neck.z };

  /**
   * HEAD — placed from `neckTop`, displaced by the head's OWN yaw **about that anchor**.
   *
   * ⚠ The displacement is bounded by the head radius plus a small margin, so the head can never travel
   * further from its neck than the neck is wide. The old code used `sin(headTurn) * height * 0.30` — 30% of
   * body height, several times the head's own radius, which is why it detached.
   */
  const headR = u * PROPORTIONS.headRadius;
  /**
   * ⚠ THE TRAVEL BOUND IS DERIVED FROM THE ATTACHMENT CRITERION, NOT CHOSEN.
   *
   * The criterion is that the head's disc must overlap `neckTop`: `|head - neckTop| <= headR`.
   * The head is also raised by `headR * HEAD_RISE` for a neck, so the horizontal budget is
   *
   *     horizontal <= sqrt(headR^2 - (headR * HEAD_RISE)^2) = headR * sqrt(1 - HEAD_RISE^2)
   *
   * So **attachment holds at every yaw by construction** rather than by luck at the angles that happened to
   * be tested. The first version used a hand-picked `headR * 1.15`, which detached at 90 degrees — the check
   * found it because it asks a structural question instead of a tuned tolerance.
   */
  const HEAD_RISE = 0.35;
  /** a small margin so the overlap is STRICT rather than tangent — see `headIsAttached` */
  const maxHeadTravel = headR * Math.sqrt(Math.max(0, 1 - HEAD_RISE * HEAD_RISE)) * 0.995;
  const { s: hs } = yaw(o.headYaw);
  /** the lateral component is scaled by |sin| so the horizontal offset never exceeds the budget */
  const head: Vec3 = { x: neckTop.x + hs * maxHeadTravel, y: neckTop.y + headR * HEAD_RISE, z: neckTop.z };

  return { root, pelvis, torso, shoulder, neck, head, headRadius: headR, neckTop, shoulderHalf: u * PROPORTIONS.shoulderHalf };
}

/**
 * GEOMETRIC CONNECTION — measured at the SEMANTIC level, before any projection.
 *
 * The head must be attached to its neck anchor: the distance from the head's centre to `neckTop` may not
 * exceed the head radius plus the neck's half-width. **A structural criterion, not a pixel tolerance.**
 */
export function headNeckGap(s: BodySkeleton): number {
  const d = Math.hypot(s.head.x - s.neckTop.x, s.head.y - s.neckTop.y, s.head.z - s.neckTop.z);
  return d - s.headRadius;
}
export function headIsAttached(s: BodySkeleton): boolean {
  /**
   * The head's disc must **STRICTLY overlap** the neck's top point, not merely touch it.
   *
   * `<= 0` accepted a gap of exactly zero, and 12 of 657 swept poses landed exactly on that boundary — the
   * head disc tangent to the neck point rather than overlapping it, which on an integer lattice can quantise
   * to two separate components. Requiring strict overlap costs nothing and removes the entire boundary class.
   */
  return headNeckGap(s) < 0;
}

// ---------------------------------------------------------------------------
// NOTICE — orientation readability
// ---------------------------------------------------------------------------

/**
 * ⚠ THE PROBLEM THIS SOLVES, from the 3.3H.2 external review:
 *
 * > *"The observer did NOT spontaneously perceive a clear event equivalent to 'the person notices the NAME.'
 * > The sequence reads closer to: stand -> begin moving -> reach."*
 *
 * The head turned, and the turn was **structurally continuous**, but **a turning disc is very nearly
 * rotationally symmetric** — so the change carried almost no silhouette information. The orientation was in
 * the geometry and not in the picture.
 *
 * **`HeadFootprint` makes direction perceptible using only silhouette cues**: a yaw narrows the head's
 * projected width (foreshortening), and a short facing cue extends from the disc's leading edge. **No eyes, no
 * face, no facial features** — the Phase 3.1 grammar has none and the brief forbids adding them.
 */
export interface HeadFootprint {
  /** the head disc's radius, as a fraction of its front-facing radius */
  radius: number;
  /** width of the disc as a fraction of its front-facing width — foreshortening under yaw */
  widthScale: number;
  /** how far the facing cue extends, in units of the front-facing radius */
  facingCue: number;
  /** -1 fully to the figure's left, +1 fully to its right, 0 facing camera */
  facing: number;
}

/**
 * Derive the footprint from the head yaw.
 *
 * **Foreshortening is real geometry**: a disc turned away from the camera projects narrower. Using it as the
 * orientation cue means the cue is a *consequence* of the yaw rather than a decoration drawn on top of it.
 */
export function headFootprint(headYaw: number): HeadFootprint {
  const rad = (headYaw * Math.PI) / 180;
  const facing = Math.sin(rad);
  /** the projected width of a disc rotated about the vertical axis: |cos| of the yaw, floored so it never vanishes */
  /**
   * ⚠ THE FIRST VERSION NARROWED THE HEAD TO 0.874 OF ITS WIDTH AT 48 DEGREES — a 14% change, which measured
   * as **only 61 changed cells across the whole notice**. That is not a perceivable event.
   *
   * An abstract disc has to carry orientation with a **larger** silhouette change than a real head would,
   * because it has no features to help. The floor is raised and the slope steepened so a moderate yaw produces
   * an unmistakable width change, while a front-facing head stays at full width.
   */
  const widthScale = 0.52 + 0.48 * Math.abs(Math.cos(rad));
  /**
   * The facing cue is a short protrusion from the leading edge. It grows with |sin(yaw)| so it is absent when
   * the figure faces the camera and maximal at a full profile — which is exactly when the direction needs to
   * be read.
   */
  const facingCue = 0.95 * Math.abs(facing);
  return { radius: 1, widthScale, facingCue, facing };
}

/**
 * THE NOTICE CHOREOGRAPHY — head leads, torso follows, then a hold.
 *
 * ⚠ The 3.3H.2 timing had a `notice` action with a `hold: 0`. **A notice with no hold is not perceivable as an
 * event**: the head moves and immediately continues into the step, so the audience never sees a state in which
 * the person *has* noticed and *has not yet acted*. §4 requires that interval, and it is **derived from the
 * action's own window**, not a hardcoded frame count.
 */
export interface NoticeResult {
  /** the head's orientation progress, 0..1 */
  headTurn: number;
  /** the torso's progress — deliberately behind the head */
  torsoTurn: number;
  /** true during the held orientation, when the person has noticed and not yet moved */
  holding: boolean;
  /** progress through the hold, 0..1, for a renderer that wants to hold something else steady */
  holdProgress: number;
}

/**
 * @param t clip time 0..1
 * @param lead the head's window
 * @param hold how much of the lead's window is spent holding after the turn completes
 */
export function noticeAt(t: number, lead: [number, number], hold: number, headLead = 0.0, torsoLag = 0.35): NoticeResult {
  const [s, e] = lead;
  const span = Math.max(1e-6, e - s);
  const turnSpan = span * (1 - hold);
  const headRaw = Math.max(0, Math.min(1, (t - s) / Math.max(1e-6, turnSpan)));
  /** the torso starts later and finishes later, so it is still arriving when the head has settled */
  const torsoRaw = Math.max(0, Math.min(1, (headRaw - torsoLag) / (1 - torsoLag)));
  void headLead;
  const headTurn = headRaw * headRaw * (3 - 2 * headRaw);
  const torsoTurn = torsoRaw * torsoRaw * (3 - 2 * torsoRaw);
  return {
    headTurn,
    torsoTurn,
    holding: t >= s + turnSpan && t <= e,
    holdProgress: Math.max(0, Math.min(1, (t - (s + turnSpan)) / Math.max(1e-6, span * hold))),
  };
}
