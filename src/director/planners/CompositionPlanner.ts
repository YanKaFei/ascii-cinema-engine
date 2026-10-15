/**
 * CompositionPlanner — how is the frame ARRANGED?
 *
 * Composition is the difference between a film that has a space and a film that has an
 * image. It is decided per shot from (a) the space, (b) the shot's narrative function, and
 * (c) the feature vector — never from the shot index.
 *
 * The key derived quantity is `negativeSpaceRatio`: how much of the frame is deliberately
 * left empty. It is one of the strongest structural signatures in the diversity report,
 * because it changes what the film looks like more than almost anything else.
 */

import type { CompositionSpec } from "../../domain/shot-spec-v2.js";
import type { CompositionKind, NarrativeFunction, SpaceKind } from "../grammar/vocabulary.js";
import type { SemanticFeatures } from "../types.js";

/**
 * Negative-space budget by space kind.
 *
 * A void is almost entirely empty by definition; a room has walls; an infinite grid has no
 * emptiness at all because the lattice is everywhere.
 */
const BASE_NEGATIVE_SPACE: Record<SpaceKind, number> = {
  void: 0.965,
  plane: 0.7,
  corridor: 0.55,
  tunnel: 0.35,
  room: 0.5,
  field: 0.85,
  "layered-depth": 0.72,
  "radial-space": 0.8,
  "vertical-space": 0.6,
  "infinite-grid": 0.2,
};

/** How a shot's function shifts how full the frame should be. */
const FUNCTION_FILL: Record<NarrativeFunction, number> = {
  establish: -0.12,
  introduce: 0.05,
  pursue: 0.18,
  reveal: 0.1,
  transform: 0.22,
  rupture: 0.3,
  collapse: 0.15,
  resolve: -0.08,
  open: -0.05,
};

/**
 * The primary composition for a shot, from its space and function.
 *
 * Each space has a default arrangement that its geometry implies; the function then
 * overrides when the shot is doing something the default cannot express.
 */
function choosePrimary(
  space: SpaceKind,
  fn: NarrativeFunction,
  features: SemanticFeatures,
): CompositionKind {
  // A rupture is always an expansion of the frame's contents, whatever the space is.
  if (fn === "rupture") return "expansion";
  if (fn === "collapse" && space === "room") return "expansion";

  switch (space) {
    case "void":
      return fn === "establish" ? "negative-space" : "isolated";
    case "plane":
      return fn === "pursue" ? "deep-axis" : "centered";
    case "corridor":
      return fn === "pursue" ? "compression" : "deep-axis";
    case "tunnel":
      return "compression";
    case "room":
      return features.presence === "absent" ? "asymmetrical" : "symmetrical";
    case "field":
      return features.cardinality === "multiplicitous" ? "asymmetrical" : "centered";
    case "layered-depth":
      return fn === "reveal" || fn === "pursue" ? "deep-axis" : "foreground-obstruction";
    case "radial-space":
      return fn === "introduce" ? "expansion" : "centered";
    case "vertical-space":
      return "negative-space";
    case "infinite-grid":
      return "symmetrical";
  }
}

function secondaryFor(primary: CompositionKind, space: SpaceKind, fn: NarrativeFunction): CompositionKind[] {
  const out: CompositionKind[] = [];
  if (primary !== "asymmetrical" && space !== "infinite-grid" && space !== "tunnel") out.push("asymmetrical");
  if (primary !== "centered" && (fn === "establish" || fn === "resolve")) out.push("centered");
  if (spaceHasEdgeWeight(space) && primary !== "edge-weighted") out.push("edge-weighted");
  return out.slice(0, 2);
}

/** A bounded space can put weight on its edges; an unbounded one has no edges to weight. */
function spaceHasEdgeWeight(space: SpaceKind): boolean {
  return space === "room" || space === "tunnel" || space === "corridor" || space === "vertical-space";
}

/** Where the subject sits in the frame, as normalised coordinates. */
function subjectPlacement(
  space: SpaceKind,
  fn: NarrativeFunction,
  features: SemanticFeatures,
): { x: number; y: number } {
  // Vertical placement carries meaning: low = weight/pressure, high = distance/reverence.
  const y = (() => {
    if (fn === "establish") return 0.58;
    if (fn === "collapse" || fn === "rupture") return 0.5;
    if (features.presence === "absent") return 0.46;
    if (space === "vertical-space") return 0.62;
    return 0.52;
  })();

  // Horizontal placement: a centred subject is being studied, an off-centre one is being
  // looked past.
  const x = (() => {
    if (features.cardinality === "dual") return 0.42;
    if (fn === "reveal") return 0.56;
    if (space === "room" && features.presence === "absent") return 0.34;
    return 0.5;
  })();

  return { x, y };
}

export function planComposition(
  space: SpaceKind,
  fn: NarrativeFunction,
  features: SemanticFeatures,
): CompositionSpec {
  const primary = choosePrimary(space, fn, features);

  // Negative space: base by space, shifted by function, then tilted by the feature vector.
  const fill = FUNCTION_FILL[fn];
  // A film that is emphatically about space keeps its emptiness even when busy.
  const spaceBias = (features.spatiality - 0.5) * 0.12;
  // A literal film needs room to read; a literal frame is a fuller frame.
  const literalBias = (features.literalism - 0.5) * 0.1;
  const ratio = clamp01(BASE_NEGATIVE_SPACE[space] - fill + spaceBias - literalBias);

  return {
    primary,
    secondary: secondaryFor(primary, space, fn),
    subjectPlacement: subjectPlacement(space, fn, features),
    negativeSpaceRatio: Number(ratio.toFixed(4)),
    reason: describeComposition(primary, space, fn, ratio),
  };
}

function describeComposition(
  primary: CompositionKind,
  space: SpaceKind,
  fn: NarrativeFunction,
  ratio: number,
): string {
  const pct = (ratio * 100).toFixed(0);
  const byPrimary: Record<CompositionKind, string> = {
    centered: "The subject is held at the frame's centre so the film studies it rather than following it.",
    isolated: "The subject is the only thing in the frame, so its isolation is a quantity the audience can measure.",
    symmetrical: "Symmetry makes the space assert a rule that the shot can later break.",
    asymmetrical: "An off-centre subject leaves the frame with somewhere else it could have been looking.",
    "edge-weighted": "Weight on the edges makes the boundary do the work of describing the space.",
    "negative-space": "Empty frame area is the film's primary material, not leftover space.",
    compression: "The frame is deliberately over-filled so the subject has no room to be looked at from a distance.",
    expansion: "The frame's contents are thrown outward so the space reads as newly larger.",
    "foreground-obstruction": "Something near the lens partially blocks the subject, so the audience is placed behind something.",
    "deep-axis": "The frame is organised along its depth so near and far can mean different things at once.",
  };
  return `${byPrimary[primary]} Chosen for a ${fn} shot in a ${space}: ${pct}% of the frame is deliberately left empty.`;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export { BASE_NEGATIVE_SPACE, FUNCTION_FILL };
