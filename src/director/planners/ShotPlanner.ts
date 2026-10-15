/**
 * ShotPlanner — what are the individual SHOTS?
 *
 * The stage where everything above becomes concrete: timing, subject assignment, camera,
 * composition, motion, transformation, and the density arc. It is also the stage that
 * decides shot COUNT and DURATION, because those are consequences of rhythm and
 * dramaturgy rather than independent choices.
 *
 * HOW TIMING IS DERIVED (this is the mechanism that makes two films differ structurally):
 *
 *   tempo            -> average shot length
 *   act weight       -> how many of the film's shots this act gets
 *   rhythm energy    -> how much a given shot is compressed or stretched
 *
 * A `slow` film about duration gets long shots and few of them; an `urgent` film about
 * desire gets short shots and many. That difference is visible in the diversity report as
 * shot count and duration distribution, which is exactly the point.
 */

import type {
  DirectorOptions,
  Dramaturgy,
  PlannedComposition,
  PlannedMotif,
  SemanticFeatures,
  SemanticReading,
  ShotPlan,
  SpatialPlan,
} from "../types.js";
import type { MotionKind, NarrativeFunction, TransformationKind, TransitionKind } from "../grammar/vocabulary.js";
import { averageCurve } from "./RhythmPlanner.js";
import type { RhythmPlanOutput } from "../types.js";
import { createRng, type Rng } from "../../core/rng.js";

/** Average shot length in seconds, by tempo. */
const AVERAGE_SHOT_LENGTH: Record<SemanticFeatures["tempo"], number> = {
  slow: 5.2,
  measured: 3.9,
  urgent: 2.6,
  erratic: 2.0,
};

/**
 * Which motifs are alive in a given shot.
 *
 * Two filters, and both matter:
 *   - TIME: a motif is not active before its `introducedAt`.
 *   - FUNCTION: an `establish` shot shows the film's scale, so it must NOT already contain
 *     the motifs the film is going to introduce. Without this, the opening shot of the
 *     loneliness film carried the assembled body — the destination appeared in the first
 *     frame, and the film had nothing to reveal.
 */
function motifsActive(
  motifs: PlannedMotif[],
  from: number,
  to: number,
  fn: NarrativeFunction,
): PlannedMotif[] {
  const inTime = motifs.filter((m) => m.introducedAt <= to + 1e-6);
  if (fn === "establish") {
    // Only the earliest motif(s) exist yet: those whose introduction the film opens on.
    const earliest = Math.min(...inTime.map((m) => m.introducedAt));
    return inTime.filter((m) => m.introducedAt <= earliest + 1e-6);
  }
  if (fn === "introduce") {
    // An arrival shows what is arriving plus what was already there.
    return inTime;
  }
  return inTime;
}

/**
 * Assign a narrative function to shot `i` of `n` within an act.
 *
 * The act's dominant function is not repeated for every shot; the act is a small movement
 * of its own. This is why an act has a shape rather than a label.
 */
function functionForShotInAct(
  dominant: NarrativeFunction,
  i: number,
  n: number,
): NarrativeFunction {
  const isFirst = i === 0;
  const isLast = i === n - 1;

  switch (dominant) {
    case "establish":
      return isFirst ? "establish" : isLast ? "introduce" : "establish";
    case "introduce":
      return isFirst ? "introduce" : isLast ? "reveal" : "introduce";
    case "pursue":
      return isFirst ? "introduce" : isLast ? "transform" : "pursue";
    case "reveal":
      return isFirst ? "pursue" : isLast ? "reveal" : "reveal";
    case "transform":
      return isFirst ? "reveal" : isLast ? "transform" : "transform";
    case "rupture":
      return isLast ? "collapse" : "rupture";
    case "collapse":
      return isFirst ? "transform" : isLast ? "resolve" : "collapse";
    case "resolve":
      return isLast ? "resolve" : "reveal";
    case "open":
      return isFirst ? "introduce" : "open";
  }
}

/**
 * Shot duration in seconds, from the film's rhythm and tempo.
 *
 * `filmDuration` MUST be passed: `actFrom`/`actTo` are normalised positions 0..1, so an act
 * spanning 0.25 of the film at 20s is 5 SECONDS, not 0.25. Omitting the factor made every
 * shot inside an act identical and made the rhythm curve have no effect on timing at all —
 * the film's cuts were uniform regardless of its shape.
 */
function durationFor(
  actFrom: number,
  actTo: number,
  shotIndexInAct: number,
  actShotCount: number,
  rhythm: RhythmPlanOutput,
  tempo: SemanticFeatures["tempo"],
  filmDuration: number,
): number {
  const actSeconds = (actTo - actFrom) * filmDuration;
  const base = actSeconds / actShotCount;
  // Sample the energy curve at this shot's centre and let energy compress or stretch it.
  const centre = actFrom + ((shotIndexInAct + 0.5) / actShotCount) * actSeconds;
  const energy = averageCurve(rhythm.energy, centre, centre);
  // High energy -> shorter shot. The 0.5..1.2 band keeps it from becoming degenerate.
  const stretch = 1.35 - energy * 0.7;
  const tempoAdjust = AVERAGE_SHOT_LENGTH[tempo] / AVERAGE_SHOT_LENGTH.measured;
  const d = base * stretch * (0.75 + 0.25 * tempoAdjust);
  return Math.max(0.6, d);
}

/** Density arc: how the glyph vocabulary opens or closes across the shot. */
function densityFor(
  fn: NarrativeFunction,
  features: SemanticFeatures,
  isLastShot: boolean,
): ShotPlan["density"] {
  // An absent subject means the frame is never full: the window stays narrow.
  const openness = features.literalism * 0.6 + (1 - features.spatiality) * 0.4;

  if (isLastShot && features.presence === "absent") {
    // Ends on almost nothing, because the subject was absent all along.
    return { coverageMinStart: 3, coverageMinEnd: 2, coverageMaxStart: 14, coverageMaxEnd: 5 };
  }
  if (fn === "establish") {
    // A narrow band with a real gradient. It must NOT be degenerate: the atlas's lightest
    // inking glyph is coverage 2, so a window like [1,2] contains a single glyph, whose
    // blank floor is 1.0 — which blanks the entire shot, including the one mark it exists to
    // show. Isolation comes from the blank FLOOR, not from a collapsed window.
    const max = Math.max(5, Math.round(3 + openness * 6));
    return { coverageMinStart: 2, coverageMinEnd: 3, coverageMaxStart: 5, coverageMaxEnd: max };
  }
  if (fn === "rupture" || fn === "collapse") {
    return { coverageMinStart: 6, coverageMinEnd: 2, coverageMaxStart: 20, coverageMaxEnd: 4 };
  }
  if (fn === "resolve") {
    const max = Math.round(4 + openness * 8);
    return { coverageMinStart: 4, coverageMinEnd: 2, coverageMaxStart: max, coverageMaxEnd: 3 };
  }
  if (fn === "transform") {
    return { coverageMinStart: 4, coverageMinEnd: 6, coverageMaxStart: 14, coverageMaxEnd: 20 };
  }
  const lo = Math.round(2 + openness * 3);
  const hi = Math.round(6 + openness * 10);
  return { coverageMinStart: lo, coverageMinEnd: lo + 1, coverageMaxStart: hi, coverageMaxEnd: Math.min(20, hi + 4) };
}

/** Motion kinds honest for a motif's role and the film's features. */
function motionFor(
  motif: PlannedMotif | undefined,
  features: SemanticFeatures,
  fn: NarrativeFunction,
): Array<{ kind: MotionKind; subjectId: string; intensity: number; purpose: string }> {
  if (!motif) return [];
  const out: Array<{ kind: MotionKind; subjectId: string; intensity: number; purpose: string }> = [];

  if (motif.staging.includes("converging") || motif.role === "environment") {
    out.push({
      kind: features.reachability === "approached-never-reached" ? "diverge" : "converge",
      subjectId: motif.id,
      intensity: Number((0.4 + features.violence * 0.5).toFixed(4)),
      purpose:
        features.reachability === "approached-never-reached"
          ? "the environment withdraws as the subject advances, which is the film's argument"
          : "the environment closes in, so the subject's position acquires stakes",
    });
  }
  if (features.temporal === "accumulation") {
    out.push({
      kind: "drift",
      subjectId: motif.id,
      intensity: Number((0.2 + features.spatiality * 0.4).toFixed(4)),
      purpose: "deposition is shown as continuous rather than as designed steps",
    });
  }
  if (features.tempo === "erratic") {
    out.push({
      kind: "tremble",
      subjectId: motif.id,
      intensity: Number((0.3 + features.violence * 0.6).toFixed(4)),
      purpose: "instability is the film's state, not an event inside it",
    });
  }
  if (fn === "resolve") {
    out.push({
      kind: "hold",
      subjectId: motif.id,
      intensity: 1,
      purpose: "the ending is a refusal to keep moving, which is how the film stops rather than concludes",
    });
  }
  return out.slice(0, 2);
}

/** Techniques labels, kept in sync with the grammar for the v1 report and baseline. */
function techniquesFor(
  fn: NarrativeFunction,
  space: SpatialPlan,
  cameraKind: string,
  transform: TransformationKind | undefined,
  motion: Array<{ kind: MotionKind }>,
): string[] {
  const out = new Set<string>();
  if (cameraKind === "push-in") out.add("push-in");
  if (cameraKind === "pull-out") out.add("pull-out");
  if (cameraKind.startsWith("lateral")) out.add("lateral-camera-move");
  if (cameraKind.startsWith("crane")) out.add("crane-move");
  if (cameraKind === "orbit") out.add("orbit");
  if (cameraKind === "handheld") out.add("handheld");

  if (space.layers.length >= 2) out.add("depth-parallax");
  out.add("particle-field");
  out.add("glyph-density-transformation");

  if (transform === "assemble") out.add("assemble");
  if (transform === "disassemble" || transform === "fragment") out.add("dissolve");
  if (transform === "vanish") out.add("vanish");
  if (transform === "erode") out.add("erode");
  if (transform === "grow" || transform === "multiply") out.add("accumulate");
  if (transform === "collapse") out.add("collapse");

  for (const m of motion) {
    if (m.kind === "converge") out.add("converge");
    if (m.kind === "diverge") out.add("diverge");
    if (m.kind === "tremble") out.add("tremble");
  }

  if (fn === "resolve") out.add("single-glyph");
  if (fn === "establish" && space.spaceKind === "void") out.add("negative-space");
  return [...out].sort();
}

export interface ShotPlannerInput {
  reading: SemanticReading;
  dramaturgy: Dramaturgy;
  motifs: PlannedMotif[];
  spatial: SpatialPlan;
  rhythm: RhythmPlanOutput;
  options: DirectorOptions;
  seed: number;
  /** callback so the Director can call the Composition/Camera planners without a cycle */
  planComposition: (fn: NarrativeFunction) => PlannedComposition;
  planCamera: (
    fn: NarrativeFunction,
    energy: number,
    motionDensity: number,
    isFinalShot: boolean,
    requiredMove?: string,
  ) => ShotPlan["camera"] & { kind: string };
}

export function planShots(input: ShotPlannerInput): ShotPlan[] {
  const { reading, dramaturgy, motifs, spatial, rhythm, options, seed } = input;
  const features = reading.features;
  const rng: Rng = createRng(seed ^ 0x5eed1a7e);

  // --- 1. total shot count from tempo, then distribute across acts by weight -----
  // A DIRECTOR-BRIEF that declares its shots also declares HOW MANY there are. That is a
  // structural constraint, not a hint: honouring the durations while inventing four extra
  // shots would be honouring the letter of the brief and ignoring its shape.
  const brief = reading.brief;
  const targetTotal = brief && brief.shots.length > 0
    ? brief.shots.length
    : Math.max(
        dramaturgy.acts.length,
        Math.round(options.duration / AVERAGE_SHOT_LENGTH[features.tempo]),
      );
  const actShotCounts = allocateShots(dramaturgy.acts, targetTotal);

  // --- 2. per-act shot durations -------------------------------------------------
  interface Slot {
    actIndex: number;
    fn: NarrativeFunction;
    duration: number;
    actFrom: number;
    actTo: number;
  }
  const slots: Slot[] = [];
  dramaturgy.acts.forEach((act, actIndex) => {
    const n = actShotCounts[actIndex]!;
    for (let i = 0; i < n; i++) {
      const fn = functionForShotInAct(act.dominantFunction, i, n);
      slots.push({
        actIndex,
        fn,
        duration: durationFor(act.from, act.to, i, n, rhythm, features.tempo, options.duration),
        actFrom: act.from,
        actTo: act.to,
      });
    }
  });

  // --- 3. brief overrides, then rescale so the film exactly fills its duration ----
  // A DIRECTOR-BRIEF states per-shot durations. Those are CONSTRAINTS, so they replace the
  // rhythm-derived value rather than being blended with it. The film's total is the brief's
  // declared total when the brief states every shot, because honouring the brief is the whole
  // point of the mode.
  const effectiveDuration = brief?.declaredTotalDuration ?? options.duration;
  if (brief) {
    brief.shots.forEach((d, i) => {
      if (i < slots.length && d.duration !== undefined) slots[i]!.duration = d.duration;
    });
  }

  // Rescale only when the durations do NOT already sum to the film's length. A brief that
  // declares every shot already sums correctly, and rescaling it would silently undo the
  // constraint it just stated (5+6+9 became 3.6+4.4+6.5 before this guard existed).
  const totalDuration = slots.reduce((s, x) => s + x.duration, 0);
  const scale = Math.abs(totalDuration - effectiveDuration) < 1e-9 ? 1 : effectiveDuration / totalDuration;
  for (const s of slots) s.duration *= scale;

  // --- 4. materialise each shot --------------------------------------------------
  const shots: ShotPlan[] = [];
  let cursor = 0;

  slots.forEach((slot, index) => {
    const isLast = index === slots.length - 1;
    const globalFrom = cursor / effectiveDuration;
    const globalTo = (cursor + slot.duration) / effectiveDuration;

    const energy = averageCurve(rhythm.energy, globalFrom, globalTo);
    const tension = averageCurve(rhythm.tension, globalFrom, globalTo);
    const informationDensity = averageCurve(rhythm.informationDensity, globalFrom, globalTo);
    const motionDensity = averageCurve(rhythm.motionDensity, globalFrom, globalTo);

    // A brief's declared camera move for this shot, if it stated one.
    const requiredMove = reading.brief?.shots[index]?.cameraKind;
    const camera = input.planCamera(slot.fn, energy, motionDensity, isLast, requiredMove);
    const composition = input.planComposition(slot.fn);
    const active = motifsActive(motifs, globalFrom, Math.max(globalTo, 1), slot.fn);
    // The subject of a shot: prefer a protagonist, then whichever motif is newest.
    const principal =
      [...active].reverse().find((m) => m.role === "protagonist") ??
      active[active.length - 1] ??
      motifs[0];

    // The transformation is placed on the shot that CARRIES the film's turn, not on every
    // shot. A film whose turn is at 72% should not transform in shot 1.
    const isTurn = globalFrom <= dramaturgy.turnAt && globalTo > dramaturgy.turnAt;
    const transformation =
      reading.transformationLogic && (isTurn || slot.fn === "transform" || slot.fn === "collapse")
        ? {
            kind: reading.transformationLogic.kind,
            subjectId: principal?.id ?? "subject",
            becomes: reading.transformationLogic.becomes,
            from: 0.08,
            to: slot.fn === "collapse" ? 0.55 : 0.85,
            dramaticPurpose: reading.transformationLogic.because,
            causedBy: (slot.fn === "transform" ? "camera" : "time") as "camera" | "time",
          }
        : undefined;

    const motion = motionFor(principal, features, slot.fn);
    const transitionIn: ShotPlan["transitionIn"] =
      index === 0
        ? undefined
        : (() => {
            // A declared transition is a constraint and wins over the derived one.
            const declared = reading.brief?.shots[index]?.transition;
            const kind = (declared as TransitionKind | undefined) ?? transitionKindFor(slot.fn, features, dramaturgy);
            return {
              kind,
              duration: transitionDurationFor(kind, features, slot.duration),
              reason:
                declared !== undefined && declared !== transitionKindFor(slot.fn, features, dramaturgy)
                  ? `the brief declares a ${declared} here, so it is honoured rather than derived`
                  : transitionReasonFor(slot.fn, features),
            };
          })();

    const density = densityFor(slot.fn, features, isLast);

    shots.push({
      id: String(index + 1).padStart(2, "0"),
      title: titleFor(slot.fn, principal, spatial.spaceKind, features),
      narrativeFunction: slot.fn,
      intention: intentionFor(slot.fn, principal, reading),
      start: cursor,
      duration: slot.duration,
      actId: dramaturgy.acts[slot.actIndex]!.id,
      motifs: active,
      space: spatial,
      composition,
      camera: {
        anticipation: camera.anticipation,
        kind: camera.kind,
        reason: camera.reason,
        reasonDetail: camera.reasonDetail,
        framing: camera.framing,
        dollyAmount: camera.dollyAmount,
        panAmount: camera.panAmount,
        yawAmount: camera.yawAmount,
        jitter: camera.jitter,
        zoomBoost: camera.zoomBoost,
        easing: camera.easing,
        rhythmCoupling: camera.rhythmCoupling,
      },
      motion,
      transformation,
      transitionIn,
      rhythm: {
        energy: Number(energy.toFixed(4)),
        tension: Number(tension.toFixed(4)),
        informationDensity: Number(informationDensity.toFixed(4)),
        motionDensity: Number(motionDensity.toFixed(4)),
        source: "curve",
      },
      visualReason: visualReasonFor(slot.fn, principal, spatial, composition, features),
      cameraReason: camera.reasonDetail,
      techniques: techniquesFor(slot.fn, spatial, camera.kind, transformation?.kind, motion),
      density,
    });

    cursor += slot.duration;
  });

  // Correct any accumulated float drift so the final shot ends exactly on the duration.
  const end = shots.reduce((s, x) => s + x.duration, 0);
  if (shots.length > 0 && Math.abs(end - effectiveDuration) > 1e-9) {
    const lastShot = shots[shots.length - 1]!;
    lastShot.duration += effectiveDuration - end;
    lastShot.duration = Math.max(0.4, lastShot.duration);
  }

  void rng;
  return shots;
}

/** Distribute a total shot count across acts proportionally to their weight. */
function allocateShots(acts: Dramaturgy["acts"], total: number): number[] {
  const weights = acts.map((a) => Math.max(0.01, a.to - a.from));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (w / weightSum) * total);
  const counts = raw.map((r) => Math.max(1, Math.floor(r)));
  // hand out the remainder to the largest fractional parts
  let assigned = counts.reduce((s, c) => s + c, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (assigned < total && order.length > 0) {
    counts[order[k % order.length]!.i]!++;
    assigned++;
    k++;
  }
  return counts;
}

function transitionKindFor(fn: NarrativeFunction, features: SemanticFeatures, dramaturgy: Dramaturgy): TransitionKind {
  // A collapse benefits from an overlap into its aftermath; a plateau film cuts, because
  // softening would imply the film is going somewhere.
  if (fn === "resolve" && features.arcShape === "collapse") return "dissolve";
  if (features.arcShape === "plateau") return "cut";
  if (fn === "resolve") return "dissolve";
  if (fn === "rupture") return "cut";
  void dramaturgy;
  return "cut";
}

/**
 * The duration of a transition, DERIVED FROM ITS KIND.
 *
 * A cut has no duration by definition, and computing kind and duration independently let
 * them disagree (a resolve shot chose `cut` for a plateau film but still returned a
 * duration, which validation correctly rejected). Deriving duration from the kind makes
 * that disagreement unrepresentable.
 */
function transitionDurationFor(
  kind: TransitionKind,
  features: SemanticFeatures,
  shotDuration: number,
): number {
  if (kind === "cut" || kind === "match-cut") return 0;
  /**
   * A DISSOLVE HAS A PERCEPTUAL DURATION, NOT A PROPORTIONAL ONE.
   *
   * The first version scaled the duration by the shot's length (`shotDuration * 0.1`, capped at 0.5).
   * Measured on the corpus that produced 0.15s and 0.27s dissolves — five to eight frames at 30fps,
   * which reads as a soft CUT rather than as a transition, and the visual review rated TRANSITION
   * QUALITY WEAK for exactly that reason.
   *
   * The error is treating a dissolve as a fraction of what it joins. It is not: an audience perceives
   * a cross-fade as a duration, and roughly 0.6-1.0s is the range that reads as one at 30fps
   * regardless of how long the surrounding shots are. A 2.7s shot and a 9s shot both want a ~0.7s
   * dissolve.
   *
   * The cap is kept and is the one genuine constraint: a dissolve may not outlast the shot it leads
   * into, and 35% of that shot is the point at which it stops being a transition and becomes the
   * shot.
   */
  const cap = Math.max(0, shotDuration * 0.35);
  const base = features.arcShape === "collapse" ? 0.8 : 0.7;
  return Number(Math.min(base, cap).toFixed(4));
}

function transitionReasonFor(fn: NarrativeFunction, features: SemanticFeatures): string {
  if (fn === "resolve" && features.arcShape === "collapse") {
    return "an overlap lets the aftermath begin before the failure has finished, which is how collapse actually feels";
  }
  if (fn === "resolve") return "softening into the last image keeps the film from ending on an accent";
  if (features.arcShape === "plateau") return "a hard cut refuses to imply that the previous frame led anywhere";
  if (fn === "rupture") return "cutting on the break withholds the transition itself";
  return "a hard cut on the beat keeps the film's time honest";
}

function titleFor(fn: NarrativeFunction, motif: PlannedMotif | undefined, space: string, features: SemanticFeatures): string {
  const subject = motif ? motif.id.replace(/-/g, " ").toUpperCase() : "THE SUBJECT";
  const byFn: Partial<Record<NarrativeFunction, string>> = {
    establish: `${subject} / ${space.toUpperCase()}`,
    introduce: `${subject} ARRIVES`,
    pursue: "APPROACH",
    reveal: "THE SHAPE OF IT",
    transform: "PRESSURE",
    rupture: "BREAK",
    collapse: `${space.toUpperCase()} FAILS`,
    resolve: "WHAT IS LEFT",
    open: "MID-APPROACH",
  };
  const base = byFn[fn] ?? subject;
  return features.presence === "absent" ? `${base} (UNOCCUPIED)` : base;
}

function intentionFor(fn: NarrativeFunction, motif: PlannedMotif | undefined, reading: SemanticReading): string {
  // Motif ids in this project are often already noun phrases beginning with "the" ("the-mark",
  // "the-boundary"), so blindly prefixing an article produced "the the boundary".
  const noun = motif ? motif.id.replace(/-/g, " ") : "film's subject";
  const thing = /^the\b/i.test(noun) ? noun : `the ${noun}`;
  const byFn: Record<NarrativeFunction, string> = {
    establish: `Establish the film's scale by showing ${thing} as the only thing that can be counted.`,
    introduce: `Bring ${thing} into the film so the audience learns it was always there.`,
    pursue: `Make the audience want ${thing}, and make the wanting visible as movement.`,
    reveal: `Show that ${thing} has a shape the audience had not assembled yet.`,
    transform: `Change what ${thing} is, so the film's pressure has a consequence.`,
    rupture: `Break ${thing} at one identifiable moment rather than letting it fade.`,
    collapse: `Let the arrangement that held ${thing} fail, and show that nothing replaces it.`,
    resolve: `Arrive at the image the film began with, so the audience re-reads it.`,
    open: `End inside the situation rather than after it, refusing the relief of a conclusion.`,
  };
  return `${byFn[fn]} (${reading.centralIdea.split(/[,.]/)[0]})`;
}

function visualReasonFor(
  fn: NarrativeFunction,
  motif: PlannedMotif | undefined,
  space: SpatialPlan,
  composition: PlannedComposition,
  features: SemanticFeatures,
): string {
  const subject = motif ? motif.id : "the subject";
  const empty = (composition.negativeSpaceRatio * 100).toFixed(0);
  return (
    `A ${fn} shot in a ${space.spaceKind}: ${subject} is staged as ${composition.primary}, ` +
    `with ${empty}% of the frame deliberately empty. ` +
    (features.presence === "absent"
      ? "Because the subject is absent, the composition's job is to make the absence a shape rather than a gap."
      : features.reachability === "approached-never-reached"
        ? "Because the object recedes, the frame keeps the axis open so the distance stays visible."
        : "The arrangement serves the shot's function rather than decorating it.")
  );
}

export { AVERAGE_SHOT_LENGTH, allocateShots, functionForShotInAct };
