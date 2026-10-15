/**
 * DramaturgyPlanner — how does the film MOVE?
 *
 * Consumes only the feature vector. Produces act structure, a refined arc consistent with
 * those acts, and the position of the film's turn.
 *
 * The act count is DERIVED, not fixed. A plateau film about a state does not need a
 * three-act structure; a collapse film needs a distinct point of failure. Deriving this
 * from `arcShape` is what stops every film having the same shape — the most likely way for
 * a "director" to turn out to be a template.
 */

import type { Dramaturgy, PlannedAct, SemanticReading, SemanticFeatures } from "../types.js";
import type { EmotionalBeat } from "../../domain/film-spec-v2.js";
import type { CompositionKind, NarrativeFunction, SpaceKind } from "../grammar/vocabulary.js";

/**
 * Act templates by arc shape. Each entry is a list of proportionate act lengths; the
 * planner scales them to the film's duration. The narrative functions and spaces are
 * SUGGESTIONS that the SpatialPlanner and ShotPlanner confirm against their own logic.
 */
interface ActTemplate {
  title: string;
  function: string;
  dominantFunction: NarrativeFunction;
  /** proportional length; entries are normalised */
  weight: number;
  /** the act's dominant composition family */
  composition: CompositionKind;
}

const ACT_TEMPLATES: Record<SemanticFeatures["arcShape"], ActTemplate[]> = {
  rise: [
    { title: "The unremarked state", function: "Establish the world at its lowest energy so the change is measurable.", dominantFunction: "establish", weight: 0.25, composition: "negative-space" },
    { title: "Gathering", function: "Let accumulation become visible without naming it.", dominantFunction: "introduce", weight: 0.3, composition: "centered" },
    { title: "Pressure", function: "Close the frame so the accumulation has consequences.", dominantFunction: "transform", weight: 0.3, composition: "compression" },
    { title: "Release", function: "Spend what was accumulated.", dominantFunction: "resolve", weight: 0.15, composition: "expansion" },
  ],
  fall: [
    { title: "The whole state", function: "Show the subject at its most complete so the loss has a scale.", dominantFunction: "establish", weight: 0.3, composition: "centered" },
    { title: "First loss", function: "Remove one thing and show that nothing replaces it.", dominantFunction: "reveal", weight: 0.25, composition: "asymmetrical" },
    { title: "Generalised loss", function: "Let the removal become the film's rule rather than an event.", dominantFunction: "collapse", weight: 0.25, composition: "negative-space" },
    { title: "Thinness", function: "Arrive at the minimum the film can still be.", dominantFunction: "resolve", weight: 0.2, composition: "isolated" },
  ],
  wave: [
    { title: "The want", function: "State the desire and its object in the same frame so their relation is legible.", dominantFunction: "establish", weight: 0.22, composition: "deep-axis" },
    { title: "Nearness", function: "Let the approach appear to work.", dominantFunction: "pursue", weight: 0.26, composition: "compression" },
    { title: "Withdrawal", function: "Take the object away by exactly the distance gained.", dominantFunction: "reveal", weight: 0.26, composition: "deep-axis" },
    { title: "Mid-approach", function: "End inside the cycle rather than after it.", dominantFunction: "open", weight: 0.26, composition: "asymmetrical" },
  ],
  plateau: [
    { title: "The condition", function: "State the condition flatly, with no implied direction.", dominantFunction: "establish", weight: 0.28, composition: "centered" },
    { title: "The condition examined", function: "Change the frame's arrangement without changing its content.", dominantFunction: "reveal", weight: 0.36, composition: "symmetrical" },
    { title: "The condition held", function: "Refuse resolution; let the audience notice their own expectation.", dominantFunction: "resolve", weight: 0.36, composition: "negative-space" },
  ],
  collapse: [
    { title: "The arrangement", function: "Establish a structure complete enough that its failure is information.", dominantFunction: "establish", weight: 0.28, composition: "symmetrical" },
    { title: "Stress", function: "Show the structure being asked to hold more than it can.", dominantFunction: "reveal", weight: 0.28, composition: "compression" },
    { title: "Failure", function: "Break the structure at a single identifiable moment.", dominantFunction: "rupture", weight: 0.26, composition: "expansion" },
    { title: "Aftermath", function: "Show what the failure left, and let it be less than before.", dominantFunction: "resolve", weight: 0.18, composition: "negative-space" },
  ],
  spiral: [
    { title: "A situation", function: "State the situation once, plainly, as a baseline.", dominantFunction: "establish", weight: 0.22, composition: "centered" },
    { title: "Again", function: "Repeat the situation with one difference.", dominantFunction: "reveal", weight: 0.26, composition: "asymmetrical" },
    { title: "Accumulating difference", function: "Let the difference become the subject.", dominantFunction: "transform", weight: 0.3, composition: "deep-axis" },
    { title: "Recognition", function: "Arrive where the first frame was and make it unrecognisable.", dominantFunction: "resolve", weight: 0.22, composition: "negative-space" },
  ],
};

/** Which spaces suit which arc shapes. Used only when the interpretation is silent. */
const ARC_SPACE_AFFINITY: Record<SemanticFeatures["arcShape"], SpaceKind[]> = {
  rise: ["radial-space", "void", "layered-depth"],
  fall: ["layered-depth", "void", "field"],
  wave: ["corridor", "radial-space", "layered-depth"],
  plateau: ["vertical-space", "plane", "infinite-grid"],
  collapse: ["room", "layered-depth", "radial-space"],
  spiral: ["infinite-grid", "vertical-space", "layered-depth"],
};

/**
 * How many shots an act should contain, from its weight and the film's tempo.
 *
 * A faster tempo means shorter shots, so more of them. This is the mechanism by which
 * rhythm reaches shot COUNT, which is one of the strongest structural signals in the
 * diversity report.
 */
function shotsForAct(weight: number, tempo: SemanticFeatures["tempo"], duration: number): number {
  const averageShotLength: Record<SemanticFeatures["tempo"], number> = {
    slow: 5.0,
    measured: 3.6,
    urgent: 2.4,
    erratic: 1.8,
  };
  const actSeconds = weight * duration;
  const n = Math.round(actSeconds / averageShotLength[tempo]);
  return Math.max(1, n);
}

export function planDramaturgy(reading: SemanticFeatures, duration: number): Dramaturgy {
  const templates = ACT_TEMPLATES[reading.arcShape];
  const totalWeight = templates.reduce((n, t) => n + t.weight, 0);

  let cursor = 0;
  const acts: PlannedAct[] = templates.map((t, i) => {
    const w = t.weight / totalWeight;
    const from = cursor;
    cursor = i === templates.length - 1 ? 1 : cursor + w;
    const affinity = ARC_SPACE_AFFINITY[reading.arcShape];
    const space = affinity[Math.min(i, affinity.length - 1)]!;
    return {
      id: `act-${i + 1}`,
      title: t.title,
      function: t.function,
      from,
      to: cursor,
      dominantFunction: t.dominantFunction,
      dominantSpace: space,
      dominantComposition: t.composition,
      shotCount: shotsForAct(w, reading.tempo, duration),
    };
  });

  // Rescale act boundaries so the last one ends exactly at 1.
  const last = acts[acts.length - 1]!;
  last.to = 1;

  const turnAt = computeTurn(reading, acts);

  const rationale =
    `Arc shape "${reading.arcShape}" with ${reading.tempo} tempo gives ${acts.length} acts over ` +
    `${duration.toFixed(0)}s; ` +
    (reading.arcShape === "plateau"
      ? "a film about a state is not given a climax it does not have."
      : `the turn sits at ${(turnAt * 100).toFixed(0)}% of the film, where ${describeTurn(reading)}.`);

  return {
    acts,
    arc: refineArc(reading, acts),
    turnAt,
    rationale,
  };
}

/** Where the film's irreversible change happens, as a normalised position. */
function computeTurn(reading: SemanticFeatures, acts: PlannedAct[]): number {
  switch (reading.arcShape) {
    case "rise":
      return acts.find((a) => a.dominantFunction === "transform")?.from ?? 0.6;
    case "fall":
      return acts.find((a) => a.dominantFunction === "reveal")?.from ?? 0.3;
    case "wave":
      // A cycle has no single turn; the second withdrawal is the closest thing to one.
      return 0.5;
    case "plateau":
      // Explicitly no turn. The value is reported so the report can say so.
      return 0.5;
    case "collapse":
      return acts.find((a) => a.dominantFunction === "rupture")?.from ?? 0.72;
    case "spiral":
      return 0.55;
  }
}

function describeTurn(reading: SemanticFeatures): string {
  switch (reading.arcShape) {
    case "rise":
      return "accumulation becomes consequence";
    case "fall":
      return "the first removal proves nothing replaces it";
    case "wave":
      return "the cycle repeats rather than resolves";
    case "plateau":
      return "the frame changes arrangement without changing content";
    case "collapse":
      return "the structure is asked to hold more than it can";
    case "spiral":
      return "the difference becomes the subject";
  }
}

/**
 * Put the emotional beats onto the act boundaries.
 *
 * The beats keep their own words (they came from the concepts) but their TIMING is
 * re-derived from the acts, so the arc and the structure cannot disagree.
 */
function refineArc(reading: SemanticFeatures, acts: PlannedAct[]): EmotionalBeat[] {
  const templates = ACT_TEMPLATES[reading.arcShape];
  const beats: EmotionalBeat[] = acts.map((act, i) => {
    const t = templates[i]!;
    // Intensity follows the act's position in the shape, normalised over the arc.
    const centre = (act.from + act.to) / 2;
    return {
      at: Number(centre.toFixed(4)),
      feeling: t.title,
      cause: t.function,
      intensity: arcIntensityAt(reading.arcShape, act.from),
    };
  });
  // Always include the opening beat at exactly 0 so the film states where it begins.
  if (beats.length === 0 || beats[0]!.at > 0) {
    beats.unshift({
      at: 0,
      feeling: templates[0]!.title,
      cause: templates[0]!.function,
      intensity: arcIntensityAt(reading.arcShape, 0),
    });
  }
  return beats;
}

/** The canonical intensity profile of an arc shape, sampled at t. */
export function arcIntensityAt(shape: SemanticFeatures["arcShape"], t: number): number {
  const profiles: Record<SemanticFeatures["arcShape"], Array<[number, number]>> = {
    rise: [[0, 0.15], [0.3, 0.35], [0.55, 0.6], [0.8, 0.9], [1, 0.35]],
    fall: [[0, 0.8], [0.3, 0.65], [0.55, 0.45], [0.8, 0.25], [1, 0.1]],
    wave: [[0, 0.3], [0.2, 0.7], [0.4, 0.25], [0.6, 0.8], [0.8, 0.3], [1, 0.55]],
    plateau: [[0, 0.4], [0.3, 0.45], [0.6, 0.5], [0.85, 0.42], [1, 0.45]],
    collapse: [[0, 0.35], [0.25, 0.55], [0.5, 0.75], [0.7, 0.9], [0.82, 0.3], [1, 0.12]],
    spiral: [[0, 0.25], [0.2, 0.45], [0.4, 0.5], [0.6, 0.7], [0.8, 0.75], [1, 0.6]],
  };
  const p = profiles[shape];
  if (t <= p[0]![0]) return p[0]![1];
  if (t >= p[p.length - 1]![0]) return p[p.length - 1]![1];
  for (let i = 0; i < p.length - 1; i++) {
    const [a, av] = p[i]!;
    const [b, bv] = p[i + 1]!;
    if (t >= a && t <= b) {
      const u = (t - a) / Math.max(1e-9, b - a);
      const e = u * u * (3 - 2 * u);
      return av + (bv - av) * e;
    }
  }
  return p[p.length - 1]![1];
}

export { ACT_TEMPLATES, ARC_SPACE_AFFINITY };
