/**
 * SpatialPlanner — WHERE are we?
 *
 * Chooses the film's space from the feature vector. This is the highest-leverage decision
 * in the whole pipeline for structural diversity: space determines what camera moves are
 * even *possible*, and therefore what the shots can be.
 *
 *   void            -> the camera mostly holds; movement would imply somewhere else to look
 *   corridor        -> axial movement is the only meaningful move
 *   room            -> the boundary is the subject; the camera reveals or removes it
 *   vertical-space  -> accumulation is read up and down, not toward
 *   layered-depth   -> lateral movement is the only way to show the layers are separate
 *
 * A space chosen for the wrong reason produces a film whose camera cannot be justified.
 * That is why the space is decided BEFORE the shots and passed down, rather than each shot
 * choosing its own.
 */

import type { SemanticFeatures, SpatialPlan } from "../types.js";
import type { OcclusionPolicy, SpaceKind, TransformationKind } from "../grammar/vocabulary.js";

interface SpaceProfile {
  description: string;
  occlusionPolicy: OcclusionPolicy;
  boundaryVisible: boolean;
  unbounded: boolean;
  horizon: SpatialPlan["horizon"];
  layers: Array<{ id: string; name: string; depthBias: number }>;
  /** why this space serves this kind of film */
  rationale: string;
}

const SPACE_PROFILES: Record<SpaceKind, SpaceProfile> = {
  void: {
    description: "An unbounded field with no ground, horizon or scale reference.",
    occlusionPolicy: "additive",
    boundaryVisible: false,
    unbounded: true,
    horizon: "none",
    layers: [],
    rationale:
      "A void makes every mark a decision: with no ground or horizon, the audience can count what is there and that count is the film's argument.",
  },
  plane: {
    description: "A flat stage the subject sits on; depth is implied rather than built.",
    occlusionPolicy: "additive",
    boundaryVisible: false,
    unbounded: false,
    horizon: "centered",
    layers: [{ id: "stage", name: "the stage plane", depthBias: 0 }],
    rationale:
      "A plane keeps the subject's relation to the ground legible without committing to an interior.",
  },
  corridor: {
    description: "A single axis of travel; everything is arranged along it.",
    occlusionPolicy: "nearest",
    boundaryVisible: true,
    unbounded: false,
    horizon: "off-frame",
    layers: [
      { id: "near", name: "the near end", depthBias: -1 },
      { id: "far", name: "the far end", depthBias: 1 },
    ],
    rationale:
      "A corridor reduces space to one dimension, so approach and recession become the only two things that can happen.",
  },
  tunnel: {
    description: "An enclosing axis that closes behind the subject.",
    occlusionPolicy: "nearest",
    boundaryVisible: true,
    unbounded: false,
    horizon: "off-frame",
    layers: [
      { id: "walls", name: "the walls", depthBias: 0 },
      { id: "vanishing", name: "the vanishing point", depthBias: 1 },
    ],
    rationale: "A tunnel makes the axis inescapable, so the film cannot change direction.",
  },
  room: {
    description: "An enclosed space whose walls are the only scale reference.",
    occlusionPolicy: "nearest",
    boundaryVisible: true,
    unbounded: false,
    horizon: "off-frame",
    layers: [
      { id: "walls", name: "the boundary", depthBias: 0 },
      { id: "interior", name: "the interior", depthBias: -0.5 },
    ],
    rationale:
      "A room defines its inside by excluding something, which is the cheapest way to make an absence legible.",
  },
  field: {
    description: "An open expanse in which the subject is small.",
    occlusionPolicy: "additive",
    boundaryVisible: false,
    unbounded: true,
    horizon: "low",
    layers: [{ id: "expanse", name: "the expanse", depthBias: 0 }],
    rationale: "A field makes scale the subject, so the film is about proportion rather than event.",
  },
  "layered-depth": {
    description: "Explicit near, mid and far planes, separated by parallax.",
    occlusionPolicy: "nearest",
    boundaryVisible: false,
    unbounded: false,
    horizon: "centered",
    layers: [
      { id: "near", name: "the near plane", depthBias: -1 },
      { id: "mid", name: "the subject plane", depthBias: 0 },
      { id: "far", name: "the far plane", depthBias: 1 },
    ],
    rationale:
      "Separated planes give the film two simultaneous times: what is happening, and what is merely there.",
  },
  "radial-space": {
    description: "Space organised around a centre; movement is inward or outward.",
    occlusionPolicy: "additive",
    boundaryVisible: false,
    unbounded: true,
    horizon: "none",
    layers: [{ id: "centre", name: "the centre", depthBias: 0 }],
    rationale:
      "A radial space turns every movement into a statement about the centre, which is how a film about attention works.",
  },
  "vertical-space": {
    description: "Space organised up and down; accumulation is read as strata.",
    occlusionPolicy: "nearest",
    boundaryVisible: true,
    unbounded: false,
    horizon: "low",
    layers: [
      { id: "strata", name: "the accumulated strata", depthBias: 0 },
      { id: "present", name: "the present line", depthBias: -0.5 },
    ],
    rationale:
      "A vertical space can hold many moments at once without replacing any of them, which is the only honest way to film duration.",
  },
  "infinite-grid": {
    description: "Repeating structure with no horizon; space as a system.",
    occlusionPolicy: "additive",
    boundaryVisible: false,
    unbounded: true,
    horizon: "none",
    layers: [{ id: "lattice", name: "the lattice", depthBias: 0 }],
    rationale:
      "A grid denies the frame any privileged position, so the film becomes about the rule rather than a place.",
  },
};

/**
 * Structural context for the space decision.
 *
 * The space choice cannot be made from the feature vector alone. A scalar cannot express
 * "the film's central event is the DISAPPEARANCE of a boundary", because that is a
 * conjunction of two facts: a boundary is named, AND it is what changes. Both are available
 * above this stage, so they are passed down rather than squashed into one number.
 */
export interface SpaceContext {
  /** concept ids that matched the input */
  conceptIds: string[];
  /** the kind of change the film's central thing undergoes, if any */
  transformationKind?: TransformationKind;
}

/**
 * True when the film's structure is a boundary that the film then removes.
 *
 * This is the difference between "a room disappears" and "there is no room". The first needs
 * walls to lose and must therefore HAVE them; the second must never have any.
 */
export function isBoundaryLossFilm(ctx: SpaceContext): boolean {
  const namesABoundary = ctx.conceptIds.includes("enclosure") || ctx.conceptIds.includes("the-name");
  const removesIt =
    ctx.transformationKind === "vanish" ||
    ctx.transformationKind === "collapse" ||
    ctx.transformationKind === "disassemble" ||
    ctx.transformationKind === "erode";
  return namesABoundary && removesIt;
}

/**
 * Choose the space kind from the feature vector.
 *
 * The order of these tests is the decision procedure: each one is a stronger claim than
 * the next, so the most specific reading wins.
 */
export function chooseSpaceKind(features: SemanticFeatures, ctx?: SpaceContext): SpaceKind {
  // 1. THE BOUNDARY DECIDES FIRST.
  //    What a space IS comes before how it is used, and a scalar enclosure score cannot
  //    make this call: being inside a room and moving along a corridor are both "enclosed".
  //    (An earlier revision keyed on an enclosure scalar and gave "desire" a room, because
  //    a corridor is a boundary too.)
  // 0. A film whose central event is the removal of a boundary must HAVE a boundary,
  //    whatever its other concepts say. Decided from structure (a boundary is named AND it
  //    is what changes), not from a threshold on a score.
  if (ctx && isBoundaryLossFilm(ctx)) {
    // ...unless the film reads its interior up and down, in which case the "boundary" is
    // really stratification.
    if (features.temporal === "accumulation" && features.spatiality > 0.85) return "vertical-space";
    return "room";
  }

  switch (features.boundaryType) {
    case "container":
      // A container read up and down is strata, not walls.
      if (features.temporal === "accumulation" && features.spatiality > 0.85) return "vertical-space";
      // A container the film travels down is a tunnel rather than a room.
      if (features.reachability === "approached-never-reached") return "tunnel";
      return "room";
    case "passage":
      return "corridor";
    case "unbounded":
      if (features.temporal === "accumulation") {
        return features.spatiality > 0.6 ? "vertical-space" : "infinite-grid";
      }
      return features.embodiment === "collective" ? "field" : "infinite-grid";
    case "open":
      break; // refined below
  }

  // 2. An open film about a distance it cannot close is still axial.
  if (features.reachability === "approached-never-reached") return "corridor";

  // 3. A bodily subject that cannot be reached wants an unbounded place that frames the distance.
  if (features.embodiment === "bodily" && features.reachability === "unreachable" && features.spatiality > 0.8) {
    return "void";
  }

  // 4. A collective subject wants a field of identical marks.
  if (features.embodiment === "collective") return "field";

  // 5. High spatiality with a trace presence: the space remembers what is gone.
  if (features.spatiality > 0.85) return "void";
  if (features.presence === "trace" && features.spatiality > 0.6) return "layered-depth";

  // 6. Otherwise a soft default by interiority.
  return features.interiority > 0.6 ? "layered-depth" : "plane";
}

export function planSpace(features: SemanticFeatures, metaphor: string, ctx?: SpaceContext): SpatialPlan {
  const kind = chooseSpaceKind(features, ctx);
  const profile = SPACE_PROFILES[kind];

  // An occlusion policy is a property of the space's MEANING, not a renderer switch: a
  // space with real near/far separation must be able to hide things, or the layers are a
  // lie. A void has nothing to occlude.
  return {
    spaceKind: kind,
    description: profile.description,
    occlusionPolicy: profile.occlusionPolicy,
    boundaryVisible: profile.boundaryVisible,
    unbounded: profile.unbounded,
    horizon: profile.horizon,
    layers: profile.layers.map((l) => ({ ...l })),
    rationale: `${profile.rationale} Chosen because ${explainSpaceChoice(features, kind, ctx)}. The film's spatial metaphor — "${metaphor}" — is realised as this space.`,
  };
}

function explainSpaceChoice(features: SemanticFeatures, kind: SpaceKind, ctx?: SpaceContext): string {
  const reasons: string[] = [];
  if (kind === "room") {
    reasons.push(
      ctx && isBoundaryLossFilm(ctx)
        ? "the film's central event is the removal of a boundary, so the boundary must exist to be removed"
        : `boundary salience is ${features.boundarySalience.toFixed(2)}, so the film's structure is a boundary`,
    );
  }
  if (kind === "corridor") reasons.push("the subject's central problem is that its object recedes");
  if (kind === "void") reasons.push("spatiality is high and the subject is unreachable");
  if (kind === "vertical-space") reasons.push("the film accumulates rather than replaces");
  if (kind === "field") reasons.push("the subject is a collective, so scale is the argument");

  if (kind === "layered-depth") reasons.push("the film needs two simultaneous times");
  if (kind === "plane") reasons.push("the film is interior rather than spatial");
  if (kind === "tunnel") reasons.push("the film's axis is inescapable");
  if (kind === "infinite-grid") reasons.push("the film is about a rule rather than a place");
  reasons.push(
    `reachability is ${features.reachability}, presence is ${features.presence}, ` +
      `embodiment is ${features.embodiment}, arc is ${features.arcShape}`,
  );
  return reasons.join("; ");
}

export { SPACE_PROFILES };
