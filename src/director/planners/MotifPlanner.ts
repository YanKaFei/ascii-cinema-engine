/**
 * MotifPlanner — what do we SEE?
 *
 * Turns each motif SEED (meaning + role + a visual hint) into a concrete `PlannedMotif`
 * with a `SubjectKind` from the closed grammar and a list of developments.
 *
 * The form is chosen from the SEMANTIC FEATURES, not from the motif's id. That is the
 * mechanism that lets an unseen prompt produce a sensible motif: the interpreter supplies
 * a meaning and a role, and the planner asks "what kind of visible thing carries this
 * meaning in this kind of film?".
 *
 * The development list is what makes a motif a motif rather than decoration: a thing that
 * returns unchanged is set dressing, a thing that returns different is a story.
 */

import type { PlannedMotif, SemanticFeatures, MotifSeed, SemanticReading } from "../types.js";
import type { SubjectKind, SubjectRole } from "../grammar/vocabulary.js";

/** Keywords in a visual hint that indicate a specific visual family. */
const HINT_FORMS: Array<{ pattern: RegExp; kind: SubjectKind }> = [
  { pattern: /legible|word|text|type|ascii word/i, kind: "word" },
  { pattern: /humanoid|body|silhouette|figure|extended/i, kind: "figure" },
  { pattern: /ring|converging|inward/i, kind: "field" },
  { pattern: /field of|dense even|stratum|strata|deposit/i, kind: "field" },
  { pattern: /boundary|frame of marks|rectangular|box|walls?/i, kind: "architecture" },
  { pattern: /corridor|receding lines|converging to a point/i, kind: "structure" },
  { pattern: /column|vertical/i, kind: "structure" },
  { pattern: /single|one |mark|cell|point/i, kind: "point" },
  { pattern: /absent|unpopulated|vacated|unmarked|blank/i, kind: "void" },
  { pattern: /edge|threshold|horizon/i, kind: "boundary" },
  { pattern: /trail|left behind|record/i, kind: "trail" },
  { pattern: /mass|other people|crowd/i, kind: "crowd" },
];

/**
 * Choose the visual form for a motif.
 *
 * Ordering of authority:
 *   1. an explicit visual family named in the hint (the concepts know what they mean);
 *   2. the motif's dramatic role (an absence is a void whatever the hint says);
 *   3. the feature vector (a bodily film wants figures; an abstract one wants fields).
 */
export function chooseSubjectKind(seed: MotifSeed, features: SemanticFeatures): SubjectKind {
  for (const h of HINT_FORMS) {
    if (h.pattern.test(seed.visualHint)) {
      // Role overrides: an "absence" motif must be a void even if the hint mentions a body.
      if (seed.role === "absence") return "void";
      if (seed.role === "environment" && h.kind === "point") return "field";
      return h.kind;
    }
  }

  if (seed.role === "absence") return "void";
  if (seed.role === "environment") return features.spatiality > 0.7 ? "architecture" : "field";
  if (seed.role === "evidence") return features.literalism > 0.6 ? "word" : "trail";
  if (seed.role === "witness") return "figure";
  if (seed.role === "survivor") return "glyph";

  // protagonist / object-of-desire / memory / obstacle
  if (features.embodiment === "bodily") return "figure";
  if (features.embodiment === "collective") return "crowd";
  if (features.literalism > 0.6) return "word";
  return features.cardinality === "singular" ? "point" : "field";
}

/**
 * The motif's developments, derived from the arc and the transformation.
 *
 * These are the motif's own story, phrased in its own terms, and they are what a
 * director-notes document is built from.
 */
function developmentsFor(seed: MotifSeed, reading: SemanticFeatures, transformKind?: string): string[] {
  const n = developmentCount(reading);
  const stages: string[] = [];

  const arcVerbs: Record<SemanticFeatures["arcShape"], string[]> = {
    rise: ["appears at minimum", "gathers without being named", "acquires consequence", "is spent"],
    fall: ["appears complete", "loses one part", "loses the rule that held it", "arrives at its minimum"],
    wave: ["appears in a state of wanting", "appears to be answered", "is withdrawn by exactly the distance gained", "appears again unchanged"],
    plateau: ["is stated flatly", "is rearranged without new content", "is seen from a second side", "is held"],
    collapse: ["appears structural", "is asked to hold more", "fails at one identifiable moment", "is what is left"],
    spiral: ["appears once", "appears again with one difference", "the difference accumulates", "is unrecognisable as the original"],
  };

  const verbs = arcVerbs[reading.arcShape];
  for (let i = 0; i < n; i++) {
    const base = verbs[Math.min(i, verbs.length - 1)]!;
    stages.push(base);
  }

  if (transformKind) {
    stages.push(`its final state: ${transformKind}`);
  }

  // An absent motif cannot be described as appearing; make the language honest.
  if (reading.presence === "absent" && stages.length > 0) {
    stages[0] = `its position is marked but ${stages[0]}`;
  }
  return stages;
}

function developmentCount(reading: SemanticFeatures): number {
  if (reading.arcShape === "plateau") return 4;
  if (reading.arcShape === "wave") return 4;
  return 3;
}

export function planMotifs(reading: SemanticReading): PlannedMotif[] {
  const features = reading.features;
  const transformKind = reading.transformationLogic?.kind;

  return reading.motifSeeds.map((seed) => {
    const subjectKind = chooseSubjectKind(seed, features);
    return {
      id: seed.id,
      meaning: seed.meaning,
      visualForm: seed.visualHint,
      subjectKind,
      role: seed.role as SubjectRole,
      introducedAt: seed.introducedAt,
      development: developmentsFor(seed, features, transformKind),
      staging: stagingFor(seed, subjectKind, features),
    };
  });
}

/** How this motif should be arranged in the frame when it appears. */
function stagingFor(seed: MotifSeed, kind: SubjectKind, features: SemanticFeatures): string {
  if (seed.role === "absence") {
    return "Held as unpopulated frame area, bounded by marks so it reads as a shape rather than as the film running out.";
  }
  if (kind === "word") {
    return "Set as legible ASCII at the frame's optical centre, with the surrounding field suppressed so the word is the only reading.";
  }
  if (kind === "figure") {
    return `A soft silhouette at ${
      features.presence === "absent" ? "less than full density, so it reads as remembered" : "full density, occupying the middle distance"
    }.`;
  }
  if (kind === "crowd" || kind === "field") {
    return "Spread as an even population so the eye cannot individuate any one mark.";
  }
  if (kind === "architecture" || kind === "structure") {
    return "Built from marks along the frame's edges so the boundary is legible without filling the frame.";
  }
  if (kind === "void") {
    return "Authored as the absence of marks inside a bounded region.";
  }
  if (kind === "trail") {
    return "A residue along a path the subject is no longer on.";
  }
  return "A single dense mark, placed off-centre so its position carries meaning.";
}

export function summariseMotifs(motifs: PlannedMotif[]): string {
  return motifs.map((m) => `${m.id}(${m.subjectKind}/${m.role})`).join(" ");
}
