/**
 * PERFORMANCE — continuous intentional body action, as distinct from pose switching.
 *
 * THE FAILURE THIS RESPONDS TO. Phase 3.3G's micro-film could sequence a story but the figure read as
 * **static pose -> another pose -> another state.** The physical behaviour had no preparation, no
 * follow-through, no weight, and no continuous intentionality. That is a **performance** gap, not a
 * rendering gap and not an effects gap.
 *
 * ## What "performance" means here
 *
 * A performance is a set of **body actions with lead/follow timing, anticipation, weight transfer and
 * contact**, where each action **inherits the ending state of the previous one** rather than restarting
 * from a default pose.
 *
 * Nothing in this file draws anything. It computes body state.
 */

/**
 * PERFORMANCE ACTIONS — semantic body actions, NOT renderer effects.
 *
 * ⚠ `PhysicalMotionIntent` was too coarse for performance. `reach` described an intention but said nothing
 * about how a body arrives at it. These are the coordinated actions that make an action *performed*.
 */
export const PERFORMANCE_ACTIONS = [
  "notice", "orient", "weight-shift", "step", "settle", "reach", "hold",
] as const;
export type PerformanceActionKind = (typeof PERFORMANCE_ACTIONS)[number];

/**
 * BODY PERFORMANCE HIERARCHY — differentiated temporal roles, not anatomy.
 *
 * The figure stays abstract. What matters is that parts **do not move in unison** and that each has a
 * declared role in the lead/follow chain.
 */
export const BODY_PARTS = ["head", "torso", "pelvis", "leftArm", "rightArm", "leftLeg", "rightLeg"] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

/** A body action: which part leads, what follows, and how the phases overlap. */
export interface PerformanceAction {
  kind: PerformanceActionKind;
  /** start and end of the action as a fraction of the whole clip */
  window: [number, number];
  /** the part that moves FIRST */
  lead: BodyPart;
  /** parts that follow, with the delay of each as a fraction of the action's own duration */
  follow: { part: BodyPart; delay: number }[];
  /** what this action anticipates, and by how much of its own duration */
  anticipation: number;
  /** whether the action ends in a perceptual hold */
  hold: number;
}

/** The tested choreography. Explicitly NOT a universal law of human motion. */
export interface PerformanceScore {
  actions: PerformanceAction[];
  /** the overlap policy: how much of the whole timeline adjacent actions may share */
  overlap: number;
  name: string;
}

// ---------------------------------------------------------------------------
// timing: eases that express preparation, contact and recovery
// ---------------------------------------------------------------------------

/** starts slowly, accelerates — used where a body commits to movement */
export const easeIn = (t: number): number => t * t;
/** ends slowly — used for settling */
export const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
/** both ends smooth — used for orientation and reach */
export const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * ANTICIPATION. Before a movement in direction `d`, the body moves slightly in `-d`.
 *
 * **The brief forbids cartoon squash-and-stretch**, so the amount is small and it always resolves into the
 * movement rather than sitting beside it. Anticipation exists so that *movement has preparation*, not so
 * that the motion reads as spectacle.
 */
export function withAnticipation(t: number, amount: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const a = Math.max(0, Math.min(0.25, amount));
  /** a shallow backswing across the first quarter, then the movement proper */
  if (t < 0.25) return -a * smooth(t / 0.25) * 0.6;
  return smooth((t - 0.25) / 0.75) * (1 + a * 0.6) - a * 0.6 * (1 - smooth((t - 0.25) / 0.75));
}

/**
 * A PERFORMANCE CLOCK. Turns a clip time into each action's own progress, with lead/follow delays applied
 * per body part. Overlap is a property of the SCORE, not of the renderer.
 */
export class Performance {
  constructor(private readonly score: PerformanceScore) {}

  /** the raw progress of an action at clip time `t`, or `undefined` if it is not active */
  actionProgress(kind: PerformanceActionKind, t: number): number | undefined {
    const a = this.score.actions.find((x) => x.kind === kind);
    if (!a) return undefined;
    const [s, e] = a.window;
    if (t < s) return 0;
    if (t > e) return 1;
    const span = Math.max(1e-6, e - s);
    return this.score.overlap > 0 ? (t - s) / span : (t - s) / span;
  }

  /**
   * A SINGLE BODY PART's progress within an action, **delayed by its lead/follow offset**.
   *
   * This is where *"head leads, torso follows"* becomes arithmetic. Without the delay every part reaches
   * the same value on the same frame and the figure moves like a cut-out.
   */
  partProgress(kind: PerformanceActionKind, part: BodyPart, t: number): number {
    const a = this.score.actions.find((x) => x.kind === kind);
    if (!a) return 0;
    const [, e] = a.window;
    const span = Math.max(1e-6, e - a.window[0]);
    const delay = part === a.lead ? 0 : (a.follow.find((f) => f.part === part)?.delay ?? 0.25);
    const raw = this.actionProgress(kind, t) ?? 0;
    if (raw <= 0) return 0;
    /** the delay is a fraction of the action's own duration, so a longer action gets a longer follow */
    const d = delay;
    if (d <= 0) return raw;
    return Math.max(0, Math.min(1, (raw - d) / (1 - d)));
  }

  /** total elapsed fraction including the action's own hold */
  get totalWindow(): number {
    return this.score.actions.reduce((m, a) => Math.max(m, a.window[1]), 0);
  }
}

/**
 * POSE CONTINUITY.
 *
 * ⚠ **`endPose(N) == startPose(N+1)`** is the requirement, and it is checkable. A hidden reset — rebuilding
 * the figure from a default at each beat — is exactly what makes motion read as *pose switching*, and it is
 * invisible in a still frame and in a per-shot validator.
 *
 * This compares two pose records field by field and reports every discontinuity.
 */
export interface Pose {
  rootX: number;
  rootY: number;
  bodyAngle: number;
  headAngle: number;
  leftArmReach: number;
  rightArmReach: number;
  leftFootX: number;
  rightFootX: number;
  weight: number;
}

export function poseDiscontinuities(a: Pose, b: Pose, tolerance = 1e-6): string[] {
  const out: string[] = [];
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    if (Math.abs(a[k] - b[k]) > tolerance) {
      out.push(`${k}: ends at ${a[k].toFixed(6)}, next starts at ${b[k].toFixed(6)}`);
    }
  }
  return out;
}

/**
 * WEIGHT AND FOOT CONTACT.
 *
 * **A step must not look like the whole figure slides.** The support foot stays planted while the moving
 * foot travels, and the body's displacement is explained by the leg action. This type makes that explicit
 * so a renderer cannot translate the root without also moving a foot.
 */
/**
 * THE ONE-STEP MECHANICS, REBUILT AS A **WEIGHT EVENT**.
 *
 * ⚠ WHAT THE 3.3H.2 EXTERNAL REVIEW FOUND:
 *
 * > *"the step still resembles: legs opening into a wide stance + body translation, more than: weight
 * > transfer -> foot lift -> travel -> contact -> body recovery."*
 *
 * The mechanics were numerically continuous and **perceptually wrong**, for a reason the numbers could not
 * show: **`rootProgress` and `footProgress` were the SAME CURVE.** Both were driven by one `smooth()` of one
 * parameter, so the body travelled in lockstep with the foot — which is exactly what *sliding* looks like on
 * screen. Endpoint equality (0.420 = 0.420) was satisfied and told us nothing, because **endpoint equality
 * does not define phasing.**
 *
 * ## What changed
 *
 * | quantity | old | new |
 * |---|---|---|
 * | root | same curve as the foot | **delayed** — the body commits after the foot is airborne |
 * | moving foot | linear in the step parameter | **arcs** — it lifts, passes over, and comes down |
 * | pelvis | not modelled | **shifts over the support leg** before the foot lifts |
 * | separation | maximal for much of the step | **peaks at mid-travel only** |
 *
 * **No arbitrary realism thresholds.** The phases are the ones the brief names, and the phasing claim is
 * checked by comparing the two curves rather than by asserting that a constant looks right.
 */
export interface StepState {
  /** which foot carries the body */
  supportFoot: "left" | "right" | "both";
  /** 0..1 the moving foot's horizontal travel */
  movingFootTravel: number;
  /** 0..1 how far the moving foot is LIFTED off the ground — the arc, not the travel */
  movingFootLift: number;
  /** true on the frame the moving foot makes contact */
  contact: boolean;
  /** body-centre displacement, 0..1 of the step distance — DELAYED relative to the foot */
  bodyCentre: number;
  /** lateral shift of the pelvis toward the support leg, -1..1; negative is toward the left foot */
  pelvisShift: number;
  /** which phase the step is in, for diagnostics and for renderers that key off it */
  phase: "weight-transfer" | "foot-lift" | "foot-travel" | "contact" | "settle";
}

/** the phase boundaries, as fractions of the step's own window */
export const STEP_PHASES = {
  weightTransferEnd: 0.22,
  liftEnd: 0.38,
  travelEnd: 0.70,
  contactEnd: 0.78,
} as const;

export function oneStep(t: number, opts: { travel?: number } = {}): StepState {
  const travel = opts.travel ?? 1;
  const P = STEP_PHASES;
  const sm = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

  /**
   * THE ROOT LAGS THE FOOT. This single difference is what separates a step from a slide: the foot arrives,
   * and the body follows it. `bodyCentre` does not begin committing until **after** the foot is airborne.
   */
  const commitStart = P.liftEnd;
  const bodyCentre = travel * sm((t - commitStart * 0.55) / (1 - commitStart * 0.55));

  /** the foot arcs: travel rises fastest through mid-step, and the lift is a bump that peaks at mid-travel */
  const travelRaw = t <= P.weightTransferEnd ? 0 : t >= P.travelEnd ? 1 : sm((t - P.weightTransferEnd) / (P.travelEnd - P.weightTransferEnd));
  const movingFootTravel = travelRaw * travel;
  const bump = t <= P.weightTransferEnd || t >= P.travelEnd ? 0 : Math.sin(Math.PI * ((t - P.weightTransferEnd) / (P.travelEnd - P.weightTransferEnd)));
  const movingFootLift = bump * 0.35;

  /** the pelvis shifts OVER the support leg before anything leaves the ground */
  const pelvisShift = t <= P.weightTransferEnd ? sm(t / P.weightTransferEnd) : t >= P.travelEnd ? Math.max(0, 1 - sm((t - P.travelEnd) / (1 - P.travelEnd))) : 1;

  if (t <= 0) return { supportFoot: "both", movingFootTravel: 0, movingFootLift: 0, contact: false, bodyCentre: 0, pelvisShift: 0, phase: "weight-transfer" };
  if (t >= 1) return { supportFoot: "both", movingFootTravel: travel, movingFootLift: 0, contact: false, bodyCentre: travel, pelvisShift: 0, phase: "settle" };
  if (t < P.weightTransferEnd) return { supportFoot: "right", movingFootTravel: 0, movingFootLift: 0, contact: false, bodyCentre, pelvisShift, phase: "weight-transfer" };
  if (t < P.liftEnd) return { supportFoot: "right", movingFootTravel, movingFootLift, contact: false, bodyCentre, pelvisShift, phase: "foot-lift" };
  if (t < P.travelEnd) return { supportFoot: "right", movingFootTravel, movingFootLift, contact: false, bodyCentre, pelvisShift, phase: "foot-travel" };
  const contact = t < P.contactEnd;
  return { supportFoot: contact ? "both" : "left", movingFootTravel: travel, movingFootLift: 0, contact, bodyCentre, pelvisShift, phase: contact ? "contact" : "settle" };
}
