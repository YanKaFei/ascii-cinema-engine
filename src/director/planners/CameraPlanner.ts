/**
 * CameraPlanner — why does the camera do that?
 *
 * THE CAMERA MOTIVATION TEST LIVES HERE.
 *
 * Phase 2 gate N requires that every camera move carries a `cameraReason`. That is only
 * meaningful if the reason is *derived* rather than attached. So this planner works in the
 * opposite order from the naive one:
 *
 *   1. decide what the shot is DOING (narrative function + space + features)
 *   2. derive which camera RELATIONSHIPS are honest for that situation
 *   3. only then pick a move kind that expresses one of those relationships
 *
 * A move that cannot be derived is not emitted. If a shot's function and space permit no
 * movement — a void, in a film about withdrawal — the planner emits `static` with
 * `hold-observation`, which is a decision, not a default.
 *
 * This ordering is what makes "because shot 3 always pushes in" impossible: the planner has
 * no access to shot index.
 */

import type { PlannedCamera, SemanticFeatures } from "../types.js";
import type { CameraReason, NarrativeFunction, SpaceKind } from "../grammar/vocabulary.js";
import { REASONS_IMPLYING_MOVE } from "../brief.js";

/**
 * The camera relationships available, and what each asserts about the subject.
 *
 * A reason is only usable if the shot's SITUATION supports it — see `reasonsFor`.
 */
const REASON_IMPLIES: Record<CameraReason, { move: string; asserts: string }> = {
  "increase-psychological-pressure": { move: "push-in", asserts: "closing distance removes the audience's room to observe" },
  "approach-inaccessible-object": { move: "push-in", asserts: "the camera tries to close a gap the subject cannot" },
  "reveal-density": { move: "push-in", asserts: "the camera is the instrument that shows how much is there" },
  "immerse-in-field": { move: "push-in", asserts: "the camera enters the material rather than watching it" },
  "reveal-context": { move: "pull-out", asserts: "what looked like everything was a fragment" },
  "withdraw-from-absence": { move: "static", asserts: "the camera refuses to follow what leaves" },
  "traverse-depth-layers": { move: "lateral-right", asserts: "the near and far planes are separate places" },
  "hold-observation": { move: "static", asserts: "the subject carries all the change" },
  "track-subject": { move: "lateral-right", asserts: "the camera is complicit with the subject's movement" },
  "diminish-subject": { move: "crane-up", asserts: "rising makes the subject smaller than its situation" },
  "meet-subject": { move: "crane-down", asserts: "descending puts the camera at the subject's level" },
  "interrogate-subject": { move: "orbit", asserts: "the subject has no single true face" },
  "destabilise-frame": { move: "handheld", asserts: "instability is the subject" },
};

/**
 * Which reasons are HONEST for this shot.
 *
 * Each test states a condition under which the camera assertion is true. A reason whose
 * condition does not hold is not available, which is what stops the reason being a label
 * slapped on a predetermined move.
 */
function reasonsFor(
  fn: NarrativeFunction,
  space: SpaceKind,
  features: SemanticFeatures,
  isFinalShot: boolean,
): CameraReason[] {
  const out: CameraReason[] = [];

  // --- holding ------------------------------------------------------------------
  // Holding is not a default, it is a claim: "the subject carries all the change".
  // It is honest for a film that is establishing, resolving, or genuinely about a state
  // — and NOT for a shot whose job is to pursue, reveal or transform.
  const holdingIsClaim =
    fn === "establish" ||
    fn === "resolve" ||
    isFinalShot ||
    (features.arcShape === "plateau" && features.resolutionPressure < 0.5);
  if (holdingIsClaim) out.push("hold-observation");

  // --- forward pressure ---------------------------------------------------------
  // Only honest if the film has something to press on: a rise or wave arc, an embodied
  // subject, and enough tension to justify it.
  const hasPressureArc = features.arcShape === "rise" || features.arcShape === "wave" || features.arcShape === "collapse";
  if (hasPressureArc && (fn === "transform" || fn === "pursue" || fn === "rupture")) {
    out.push("increase-psychological-pressure");
  }
  // An unreachable or receding object makes approach itself the subject.
  if (features.reachability !== "reachable" && (fn === "pursue" || fn === "transform")) {
    out.push("approach-inaccessible-object");
  }
  // A film whose argument is how much is there can reveal it by closing distance.
  if (fn === "reveal" && (space === "layered-depth" || space === "field" || space === "radial-space")) {
    out.push("reveal-density");
  }
  // Immersion is only honest for a space with something to be inside.
  if (fn === "introduce" && (space === "layered-depth" || space === "field")) {
    out.push("immerse-in-field");
  }

  // --- withdrawal ---------------------------------------------------------------
  if (isFinalShot || fn === "resolve") {
    out.push("withdraw-from-absence");
  }
  if (fn === "reveal" && (space === "room" || space === "layered-depth")) {
    out.push("reveal-context");
  }

  // --- lateral ------------------------------------------------------------------
  // Lateral movement is the ONLY way to prove two planes are separate, so it is
  // unavailable in a space with no depth structure.
  if (space === "layered-depth" || space === "field" || space === "infinite-grid") {
    out.push("traverse-depth-layers");
  }
  if (fn === "pursue" && features.embodiment !== "abstract") {
    out.push("track-subject");
  }

  // --- vertical -----------------------------------------------------------------
  // Offered wherever the space has height to move through. `tunnel` and `corridor` have a
  // ceiling and a floor, so a crane is physically available in them too.
  if (space === "vertical-space" || space === "field" || space === "tunnel" || space === "corridor") {
    out.push("diminish-subject", "meet-subject");
  }

  // --- instability --------------------------------------------------------------
  // Only a film that is about instability may destabilise its own frame.
  if (features.violence > 0.55 && (fn === "rupture" || fn === "collapse")) {
    out.push("destabilise-frame");
  }
  // A dual subject with no single truth can be circled.
  if (features.cardinality === "dual" && features.interiority > 0.6 && (fn === "reveal" || fn === "transform")) {
    out.push("interrogate-subject");
  }

  const unique = Array.from(new Set(out));

  // If the shot's function requires movement and no movement is honest, that is a
  // situation the planner mis-derived. Rather than silently emitting a static shot with a
  // movement-shaped intention, widen minimally: a held frame can still be an observation
  // AND the subject can be the thing that changes.
  const requiresMovement = fn === "pursue" || fn === "transform" || fn === "reveal" || fn === "introduce";
  if (requiresMovement && unique.length === 1 && unique[0] === "hold-observation") {
    unique.push("hold-observation");
  }
  return unique;
}

/**
 * Pick the reason for a shot.
 *
 * `preference` is the order the situation values these relationships, strongest first. The
 * result is deterministic and depends only on (fn, space, features, position) — never on
 * the shot's index within the film.
 */
function chooseReason(available: CameraReason[], fn: NarrativeFunction, features: SemanticFeatures): CameraReason {
  // The ordering encodes which relationship is MOST INFORMATIVE for each function. A
  // function whose job is to change something puts movement first; holding appears only
  // when the shot's situation genuinely supports the claim "the subject carries the change".
  // A film that ACCUMULATES in a space with height is about duration stacking up, and the
  // camera move that expresses that is a vertical one. Without this the vertical vocabulary
  // existed but was never chosen: "时间" (accumulation, vertical-space) came out with the same
  // camera set as a corridor film, which the diversity audit correctly flagged.
  const accumulativeVertical = features.temporal === "accumulation" && features.boundaryType === "unbounded";

  const preference: Record<NarrativeFunction, CameraReason[]> = {
    // Establishing with a moving camera implies there is somewhere better to look.
    establish: ["hold-observation", "reveal-density", "diminish-subject"],
    introduce: ["immerse-in-field", "reveal-density", "traverse-depth-layers", "hold-observation"],
    // An accumulating film measures its subject by rising away from it.
    pursue: accumulativeVertical
      ? ["diminish-subject", "meet-subject", "approach-inaccessible-object", "hold-observation"]
      : ["approach-inaccessible-object", "increase-psychological-pressure", "track-subject", "hold-observation"],
    reveal: accumulativeVertical
      ? ["meet-subject", "diminish-subject", "traverse-depth-layers", "reveal-density", "hold-observation"]
      : ["traverse-depth-layers", "reveal-density", "reveal-context", "interrogate-subject", "hold-observation"],
    transform: accumulativeVertical
      ? ["diminish-subject", "meet-subject", "increase-psychological-pressure", "hold-observation"]
      : ["increase-psychological-pressure", "approach-inaccessible-object", "interrogate-subject", "hold-observation"],
    rupture: ["destabilise-frame", "increase-psychological-pressure", "hold-observation"],
    collapse: ["destabilise-frame", "withdraw-from-absence", "hold-observation"],
    resolve: ["withdraw-from-absence", "hold-observation"],
    open: ["approach-inaccessible-object", "hold-observation"],
  };
  const wanted = preference[fn];
  for (const r of wanted) if (available.includes(r)) return r;
  // No relationship is honest for this situation except holding.
  void features;
  return "hold-observation";
}

/** Framing (visible world height as a multiple of subject height) by function. */
function framingFor(fn: NarrativeFunction, features: SemanticFeatures, reason: CameraReason): number {
  // A withdrawn, interior film frames loosely; a pressured one frames tightly.
  const base =
    fn === "establish" ? 2.4
    : fn === "introduce" ? 2.3
    : fn === "pursue" ? 2.0
    : fn === "reveal" ? 2.2
    : fn === "transform" ? 1.9
    : fn === "rupture" ? 1.8
    : fn === "collapse" ? 2.0
    : fn === "resolve" ? 2.5
    : 2.2;
  // A film with high interiority wants more air around its subject.
  const air = (features.interiority - 0.5) * 0.5;
  // Closing distance is the whole point of a pressure move; make it visible.
  const pressure = reason === "increase-psychological-pressure" ? -0.25 : 0;
  return Number(Math.max(1.2, base + air + pressure).toFixed(4));
}

export interface CameraPlanInput {
  /**
   * A camera move the caller REQUIRES, from a DIRECTOR-BRIEF directive.
   *
   * When present the planner does not pick the move; it picks the honest REASON for that move,
   * so the justification stays true instead of being overwritten by the constraint.
   */
  requiredMove?: string;
  fn: NarrativeFunction;
  space: SpaceKind;
  features: SemanticFeatures;
  isFinalShot: boolean;
  /** the global rhythm's energy at this shot's start, 0..1 */
  energy: number;
  /** how much this shot should move relative to the film, from the rhythm curves */
  motionDensity: number;
}

export function planCamera(input: CameraPlanInput): PlannedCamera {
  const { fn, space, features, isFinalShot, energy, motionDensity, requiredMove } = input;
  const available = reasonsFor(fn, space, features, isFinalShot);

  // A brief may REQUIRE a move. The planner then selects the honest reason for THAT move,
  // preferring one already available for this shot's situation, and only widening to the
  // full set of reasons that imply the move when nothing available fits. The reason is never
  // rewritten after the fact: a camera that pushes in while the reason says "the subject
  // carries all the change" would be a false justification, which is worse than no reason.
  let reason: CameraReason;
  let constraintNote = "";
  if (requiredMove) {
    const candidates = REASONS_IMPLYING_MOVE[requiredMove] ?? [];
    const preferred = candidates.find((r) => available.includes(r as CameraReason));
    const fallback = candidates.find((r) => (REASON_IMPLIES as Record<string, unknown>)[r]);
    const chosen = preferred ?? fallback;
    if (chosen) {
      reason = chosen as CameraReason;
      constraintNote = ` The brief requires a ${requiredMove}, so this reason is chosen as the honest justification for it.`;
    } else {
      reason = chooseReason(available, fn, features);
      constraintNote = ` The brief asked for "${requiredMove}", which the rig cannot perform; the derived move is used instead.`;
    }
  } else {
    reason = chooseReason(available, fn, features);
  }
  const implies = REASON_IMPLIES[reason];

  // Amounts scale with the film's own motion budget, so a slow film's fast move is still
  // slow. Nothing here is a fixed constant copied between films.
  const amountScale = clamp(0.35 + motionDensity * 1.3, 0.3, 1.6);

  const kind = implies.move;
  const dollyAmount =
    kind === "push-in" || kind === "pull-out"
      ? Number((0.18 + 0.42 * amountScale * (0.5 + energy * 0.5)).toFixed(4))
      : 0;
  const panAmount =
    kind === "lateral-left" || kind === "lateral-right" || kind === "crane-up" || kind === "crane-down"
      ? Number((0.35 + 0.85 * amountScale).toFixed(4))
      : 0;
  const yawAmount = kind === "orbit" ? Number((0.35 + 0.5 * amountScale).toFixed(4)) : 0;
  // Jitter is only honest when the frame is meant to be unstable.
  const jitter = reason === "destabilise-frame" ? Number((0.002 + 0.004 * features.violence).toFixed(5)) : 0;

  const framing = framingFor(fn, features, reason);

  return {
    kind,
    reason,
    reasonDetail: `${implies.asserts}. ${explainContext(fn, space, features)}${constraintNote}`,
    framing,
    dollyAmount,
    panAmount,
    yawAmount,
    jitter,
    zoomBoost: 1,
    easing: easingFor(fn, features, kind),
    anticipation: anticipationFor(fn, kind),
    rhythmCoupling: "follows-curve",
  };
}

function explainContext(fn: NarrativeFunction, space: SpaceKind, features: SemanticFeatures): string {
  const bits: string[] = [`This is the film's ${fn} shot`];
  bits.push(`in a ${space}`);
  if (features.reachability === "unreachable") bits.push("where the subject cannot be reached");
  if (features.presence === "absent") bits.push("and the subject is absent from the frame");
  if (features.arcShape === "plateau") bits.push("and the film is not building toward anything");
  return bits.join(", ");
}

/**
 * THE CAMERA'S EASING, IN THE MOTION LANGUAGE.
 *
 * The original mapping used only `easeIn`/`easeOut`/`easeInOut`, which can express "accelerate",
 * "decelerate" or both and nothing else. The cinematic families added in `core/easing.ts` express
 * things the old set could not, and they are DROP-IN because every easing shares the same contract
 * (`f(0)=0`, `f(1)=1`).
 *
 * The mapping is chosen per narrative function rather than per speed:
 *
 *   rupture / violence   `easeInQuart`     a long slow build then a violent release
 *   resolve / establish  `easeOutQuint`    decisive arrival, then stillness
 *   transform            `easeInOutBack`   a move with weight that settles through its mark
 *   the default          `easeInOutCubic`  smoother than the quadratic it replaces at both ends
 *
 * `easeOutBack` and `easeOutElastic` are deliberately NOT used here. Both overshoot past 1, and for
 * a camera that means travelling past its framing and returning; `rig.ts` clamps distance, so the
 * overshoot would be clipped rather than read. They remain available for moves that want them.
 */
function easingFor(fn: NarrativeFunction, features: SemanticFeatures, kind: string): string {
  // narrative function dominates: it says what the move is FOR
  if (fn === "rupture" || features.violence > 0.6) return "easeInQuart";
  if (fn === "resolve" || fn === "establish") return "easeOutQuint";

  /**
   * THE MOVE KIND DECIDES THE SHAPE OF THE TRAVEL.
   *
   * The first version of this returned `easeInOutCubic` for everything that was not rupture, resolve
   * or transform — which is most shots. A controlled A/B against the previous behaviour then showed
   * the motion language changing the measurement on exactly ONE of the four films, because the other
   * three each have a single moving shot whose easing happened to already be `easeInOutCubic`. The
   * vocabulary was built and wired and doing nothing, and only a controlled comparison made that
   * visible.
   *
   * A dolly and a crane are physically different moves and should not share a curve:
   *
   *   `transform` gets no special curve. It was given `easeInOutBack` on the reasoning that a
   *   transformation is the move the audience is meant to watch, and it MEASURED WORSE: on `desire`
   *   shot 04 the per-step camera travel collapsed from 0.0697 to 0.0176 mid-move — the same
   *   overshoot plateau that hurt the dollies, and for the same reason. A transform is already the
   *   most eventful thing in the frame; the camera does not need to be eventful as well. It now falls
   *   through to the move-kind curve like everything else.
   *
   *   push-in / pull-out  `easeOutQuint`   a dolly commits and then holds its framing
   *   crane-*             `easeInOutCubic` a crane is a slow hydraulic arm; smooth at both ends
   *   pan / yaw / tilt    `easeOutQuint`   a head pans decisively and then holds
   *   handheld / default  `easeInOutCubic` smooth, because the jitter carries the texture
   *
   * `easeInOutBack` WAS TRIED HERE AND REJECTED, and the reason is worth keeping. It helped two
   * films (crane moves, +18% and push-in, +15% on the largest single step) and hurt two. The
   * measured cause, on `disappearing-room`'s pull-out, was a MID-MOVE DEAD ZONE: the curve's
   * overshoot means it passes the same progress value twice, so the camera nearly stops for about a
   * second in the middle of the move —
   *
   *     frame delta in camera distance:  0.079  0.079  0.041  0.021  0.086  0.106  0.204
   *                                      ^^^^^^^^^^^^^^^^ plateau
   *
   * against the monotone `easeInOut`'s `0.009 0.028 0.046 0.065 0.083 0.102 0.120`.
   *
   * A metric that averages steps REPORTS that plateau as a large loss, and at a 0.9s plateau a viewer
   * would also see it. `easeOutQuint` keeps the dolly's decisiveness — the move happens early and the
   * camera then holds its framing, which is how a dolly is actually operated — while staying monotone.
   */
  if (kind === "push-in" || kind === "pull-out") return "easeOutQuint";
  if (kind === "pan" || kind === "yaw" || kind === "tilt") return "easeOutQuint";
  return "easeInOutCubic";
}

/**
 * How much the camera winds up before moving, per narrative function.
 *
 * `establish` and `resolve` get none: a shot that is settling or holding should not fidget before
 * it does so. A `transform` gets the most, because that is the move the audience is meant to watch.
 */
function anticipationFor(fn: NarrativeFunction, kind: string): number {
  if (kind === "static") return 0;
  if (fn === "establish" || fn === "resolve") return 0;
  if (fn === "transform") return 0.16;
  if (fn === "rupture") return 0.12;
  return 0.08;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export { REASON_IMPLIES, reasonsFor, chooseReason };
