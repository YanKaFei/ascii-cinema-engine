/**
 * SemanticInterpreter — what does the input MEAN?
 *
 * This is the only stage in the pipeline that an LLM may replace, and the boundary is
 * enforced by types rather than by convention:
 *
 *   interface SemanticInterpreter { interpret(raw, classification): SemanticReading }
 *
 * The heuristic implementation below needs no network and is the default. An LLM-backed
 * implementation returns the SAME `SemanticReading`, which `validateFilmSpecV2` then
 * checks. Downstream planners cannot tell the difference, which is what makes the
 * boundary real: everything after this stage is deterministic and cannot be talked out of
 * its behaviour by a model.
 *
 * HOW FEATURES ARE COMBINED — and why this matters for diversity.
 *
 * The interpreter matches CONCEPTS (knowledge.ts), each carrying a full feature vector,
 * and combines them:
 *   - categorical features: highest confidence wins; ties broken by a FIXED precedence
 *     order, never by input order (otherwise "孤独 欲望" and "欲望 孤独" would produce
 *     different films, making behaviour depend on wording rather than meaning);
 *   - scalar features: confidence-weighted mean.
 *
 * The combined vector is the ONLY thing downstream planners read. They never see the raw
 * prompt. That is the structural guarantee against per-benchmark special-casing: after
 * this function returns, the input string is provenance and nothing more.
 *
 * Confidence is derived from how many triggers fired and how long the matched trigger was,
 * so a concept matched by a distinctive long phrase outranks one matched by a common
 * single character.
 */

import {
  CATEGORY_PRECEDENCE,
  CONCEPTS,
  NEUTRAL_FEATURES,
  type Concept,
} from "../knowledge.js";
import type { Classification } from "./PromptClassifier.js";
import type {
  MatchedConcept,
  MotifSeed,
  SemanticFeatures,
  SemanticReading,
} from "../types.js";
import type { ConceptRole } from "../knowledge.js";
import type { EmotionalBeat, Opposition } from "../../domain/film-spec-v2.js";
import type { TransformationKind } from "../grammar/vocabulary.js";
import { parseDirectorBrief } from "../brief.js";

export interface ConceptMatch {
  concept: Concept;
  confidence: number;
  surface: string;
}

/**
 * How much a concept's role multiplies its voting strength.
 *
 * Role dominates trigger length on purpose. Matching a longer string is evidence that the
 * words are present, not that they are the film's subject: `所有人` is a longer match than
 * `忘记` and says far less about what the film is about.
 */
const ROLE_WEIGHT: Record<ConceptRole, number> = {
  theme: 1.0,
  modifier: 0.55,
  setting: 0.35,
};

/**
 * Find every concept whose triggers appear in the input.
 *
 * Confidence combines two independent signals:
 *   - trigger specificity: how long and distinctive the matched surface form is;
 *   - concept role: whether this concept is the film's subject or incidental vocabulary.
 */
export function matchConcepts(raw: string): ConceptMatch[] {
  const normalized = raw.toLowerCase();
  const longestTrigger = Math.max(...CONCEPTS.flatMap((c) => c.triggers.map((t) => t.length)));

  const matches: ConceptMatch[] = [];
  for (const concept of CONCEPTS) {
    let best = "";
    for (const trigger of concept.triggers) {
      if (normalized.includes(trigger) && trigger.length > best.length) best = trigger;
    }
    if (best.length === 0) continue;
    const specificity = 0.35 + 0.65 * (best.length / longestTrigger);
    const confidence = Math.min(1, specificity * ROLE_WEIGHT[concept.role]);
    matches.push({ concept, confidence, surface: best });
  }
  // Sort by confidence, then by role weight, then by id for a total order that never
  // depends on the iteration order of the knowledge base.
  return matches.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      ROLE_WEIGHT[b.concept.role] - ROLE_WEIGHT[a.concept.role] ||
      a.concept.id.localeCompare(b.concept.id),
  );
}

/** The concepts that carry the film's meaning (role === "theme"), strongest first. */
export function themeMatches(matches: ConceptMatch[]): ConceptMatch[] {
  return matches.filter((m) => m.concept.role === "theme");
}

/**
 * Below this a concept's `drives` weight means it does not vote at all.
 *
 * It is not enough to REDUCE a weak influence — several weak votes add up. In an early
 * revision the "a man erases his name and the room disappears" benchmark came out as a
 * RISE, because `discovery`, `a-person` and `enclosure` each contributed a fraction to
 * `arcShape` and collectively outweighed `vanishing`'s strong collapse claim. A feature a
 * concept is not entitled to drive must be a veto, not a discount.
 */
const VOTE_THRESHOLD = 0.5;

/**
 * Combine matched concepts into one feature vector.
 *
 * Each concept's vote on a feature is scaled by (a) its confidence and (b) its `drives`
 * weight for that feature, and is discarded entirely below `VOTE_THRESHOLD`. That is what
 * stops incidental vocabulary from outvoting the film's actual theme: a room does not
 * decide whether the film collapses, and "a person" does not decide whether the subject is
 * present.
 */
export function combineFeatures(matches: ConceptMatch[]): SemanticFeatures {
  if (matches.length === 0) return { ...NEUTRAL_FEATURES };

  const driveWeight = (concept: Concept, key: keyof SemanticFeatures): number => {
    const drives = concept.drives;
    if (!drives) return 1;
    const v = drives[key as keyof typeof drives];
    if (v === undefined) return 1;
    return v < VOTE_THRESHOLD ? 0 : v;
  };

  const weightFor = (m: ConceptMatch, key: keyof SemanticFeatures): number =>
    m.confidence * driveWeight(m.concept, key);

  // highest-weight value per categorical feature, ties by fixed precedence
  const pick = <K extends keyof SemanticFeatures>(key: K): SemanticFeatures[K] => {
    const scores = new Map<SemanticFeatures[K], number>();
    for (const m of matches) {
      const w = weightFor(m, key);
      if (w <= 0) continue;
      const v = m.concept.features[key];
      scores.set(v, (scores.get(v) ?? 0) + w);
    }
    // if every concept declined to vote on this feature, fall back to the neutral value
    if (scores.size === 0) return NEUTRAL_FEATURES[key];
    const scale = precedenceFor(key);
    let bestValue: SemanticFeatures[K] | undefined;
    let bestScore = -1;
    for (const [value, score] of scores) {
      if (score > bestScore + 1e-9) {
        bestValue = value;
        bestScore = score;
      } else if (Math.abs(score - bestScore) <= 1e-9 && scale) {
        // exact tie: fixed precedence, never input order
        const a = scale.indexOf(value as never);
        const b = scale.indexOf(bestValue as never);
        const rankA = a === -1 ? Number.MAX_SAFE_INTEGER : a;
        const rankB = b === -1 ? Number.MAX_SAFE_INTEGER : b;
        if (rankA < rankB) bestValue = value;
      }
    }
    return bestValue as SemanticFeatures[K];
  };

  const scalar = (key: keyof SemanticFeatures): number => {
    let sum = 0;
    let wsum = 0;
    for (const m of matches) {
      const w = weightFor(m, key);
      if (w <= 0) continue;
      sum += (m.concept.features[key] as number) * w;
      wsum += w;
    }
    return wsum > 0 ? sum / wsum : (NEUTRAL_FEATURES[key] as number);
  };

  return {
    arcShape: pick("arcShape"),
    temporal: pick("temporal"),
    presence: pick("presence"),
    reachability: pick("reachability"),
    embodiment: pick("embodiment"),
    cardinality: pick("cardinality"),
    tempo: pick("tempo"),
    spatiality: scalar("spatiality"),
    interiority: scalar("interiority"),
    violence: scalar("violence"),
    resolutionPressure: scalar("resolutionPressure"),
    literalism: scalar("literalism"),
    enclosureAffinity: scalar("enclosureAffinity"),
    boundaryType: pick("boundaryType"),
    boundarySalience: scalar("boundarySalience"),
  };
}

function precedenceFor(key: keyof SemanticFeatures): readonly string[] | undefined {
  const map: Partial<Record<keyof SemanticFeatures, readonly string[]>> = {
    arcShape: CATEGORY_PRECEDENCE.arcShape,
    presence: CATEGORY_PRECEDENCE.presence,
    reachability: CATEGORY_PRECEDENCE.reachability,
    embodiment: CATEGORY_PRECEDENCE.embodiment,
    cardinality: CATEGORY_PRECEDENCE.cardinality,
    tempo: CATEGORY_PRECEDENCE.tempo,
    // A film that is inside something wins over one that is merely passing through,
    // which wins over one with no boundary at all. A bounded reading is the stronger
    // commitment, so it should survive an ambiguous prompt.
    boundaryType: ["container", "passage", "unbounded", "open"],
  };
  return map[key];
}

/**
 * Build the emotional arc from the feature vector.
 *
 * The arc SHAPE is a feature, so the arc is derived rather than authored per prompt. Each
 * shape has a canonical intensity profile; the beats themselves are named from the
 * concepts that fired, so the arc's language still comes from the input.
 */
export function buildArc(features: SemanticFeatures, matches: ConceptMatch[]): EmotionalBeat[] {
  const profiles: Record<SemanticFeatures["arcShape"], Array<[number, number]>> = {
    rise: [[0, 0.15], [0.3, 0.35], [0.55, 0.6], [0.8, 0.9], [1, 0.35]],
    fall: [[0, 0.8], [0.3, 0.65], [0.55, 0.45], [0.8, 0.25], [1, 0.1]],
    wave: [[0, 0.3], [0.2, 0.7], [0.4, 0.25], [0.6, 0.8], [0.8, 0.3], [1, 0.55]],
    plateau: [[0, 0.4], [0.3, 0.45], [0.6, 0.5], [0.85, 0.42], [1, 0.45]],
    collapse: [[0, 0.35], [0.25, 0.55], [0.5, 0.75], [0.7, 0.9], [0.82, 0.3], [1, 0.12]],
    spiral: [[0, 0.25], [0.2, 0.45], [0.4, 0.5], [0.6, 0.7], [0.8, 0.75], [1, 0.6]],
  };

  const profile = profiles[features.arcShape];

  // Beat language comes from the concepts: the film describes its own feelings using the
  // vocabulary of what it is about.
  const feelings = arcFeelings(features, matches);

  return profile.map(([at, intensity], i) => ({
    at,
    feeling: feelings[Math.min(i, feelings.length - 1)] ?? `beat ${i + 1}`,
    cause: arcCauses(features, i, profile.length),
    intensity,
  }));
}

function arcFeelings(features: SemanticFeatures, matches: ConceptMatch[]): string[] {
  const primary = matches[0]?.concept.centralIdea ?? "the film's subject";
  const byArc: Record<SemanticFeatures["arcShape"], string[]> = {
    rise: ["an unremarked state", "something gathering", "the gathering made visible", "pressure", "release"],
    fall: ["a whole state", "the first loss", "the loss generalises", "thinness", "almost nothing"],
    wave: ["a want", "nearness", "withdrawal", "nearness again", "withdrawal again", "mid-approach"],
    plateau: ["a condition", "the condition examined", "the condition from another side", "the condition held", "the condition held"],
    collapse: ["an arrangement", "the arrangement is stressed", "the arrangement is legible", "the arrangement fails", "the failure", "aftermath"],
    spiral: ["a situation", "the situation again", "the situation with the first difference", "the difference accumulates", "the situation is not the same", "recognition"],
  };
  const base = byArc[features.arcShape];
  // Let the dominant concept colour the first beat so the arc names the film's own subject.
  return [base[0]!, ...base.slice(1)].map((f, i) => (i === 0 ? `${f} — ${primary}` : f));
}

function arcCauses(features: SemanticFeatures, i: number, n: number): string {
  const t = n <= 1 ? 0 : i / (n - 1);
  if (features.presence === "absent") return `an absence becomes measurable (t=${t.toFixed(2)})`;
  if (features.reachability === "unreachable") return `distance is confirmed rather than closed (t=${t.toFixed(2)})`;
  if (features.arcShape === "collapse") return `structure is stressed past its limit (t=${t.toFixed(2)})`;
  if (features.arcShape === "plateau") return `the same frame yields a different reading (t=${t.toFixed(2)})`;
  return `accumulation passes a threshold (t=${t.toFixed(2)})`;
}

/** Collect the oppositions the matched concepts imply, deduplicated. */
export function collectOppositions(matches: ConceptMatch[]): Opposition[] {
  const seen = new Map<string, Opposition>();
  for (const m of matches) {
    for (const o of m.concept.oppositions) {
      const key = `${o.a}|${o.b}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        a: o.a,
        b: o.b,
        staging: o.staging,
        resolvedToward: o.resolvedToward ?? "neither",
      });
    }
  }
  // A film with no opposition has no drama; fall back to the neutral one.
  if (seen.size === 0) {
    seen.set("subject|world", {
      a: "the subject",
      b: "the world",
      staging: "The subject is placed against a space it did not make.",
      resolvedToward: "neither",
    });
  }
  return [...seen.values()];
}

/** Collect motif seeds from the matched concepts. */
export function collectMotifSeeds(matches: ConceptMatch[]): MotifSeed[] {
  const seen = new Map<string, MotifSeed>();
  for (const m of matches) {
    for (const motif of m.concept.motifs) {
      if (seen.has(motif.id)) continue;
      seen.set(motif.id, {
        id: motif.id,
        meaning: motif.meaning,
        role: motif.role,
        visualHint: motif.visualHint,
        introducedAt: motif.introducedAt,
      });
    }
  }
  if (seen.size === 0) {
    seen.set("the-subject", {
      id: "the-subject",
      meaning: "the thing the film is about",
      role: "protagonist",
      visualHint: "a mark whose density carries the film",
      introducedAt: 0,
    });
  }
  return [...seen.values()].sort((a, b) => a.introducedAt - b.introducedAt);
}

/** Pick the transformation logic, preferring the dominant concept's own. */
export function pickTransformationLogic(
  features: SemanticFeatures,
  matches: ConceptMatch[],
): SemanticReading["transformationLogic"] {
  // A plateau film about a state does not turn; forcing a turn would invent a false climax.
  if (features.arcShape === "plateau" && features.resolutionPressure < 0.3) return undefined;

  // A theme's own transformation outranks a modifier's, regardless of match order.
  for (const m of [...themeMatches(matches), ...matches]) {
    const t = m.concept.transformation;
    if (t) return { ...t };
  }

  // No concept supplied one: derive from the feature vector.
  const derived: Record<SemanticFeatures["arcShape"], { kind: TransformationKind; becomes: string; because: string }> = {
    rise: { kind: "assemble", becomes: "a legible whole", because: "Accumulation without assembly is just noise." },
    fall: { kind: "erode", becomes: "less than it began as", because: "The film's shape is loss." },
    wave: { kind: "crossfade-density", becomes: "the same thing at a different density", because: "A cycle is not a change of kind." },
    plateau: { kind: "grow", becomes: "more densely itself", because: "A state examined long enough thickens." },
    collapse: { kind: "disassemble", becomes: "its own material", because: "What holds a structure together can stop." },
    spiral: { kind: "multiply", becomes: "more numerous and less distinguishable", because: "Recurrence without difference is multiplication." },
  };
  const d = derived[features.arcShape];
  return {
    subject: "the film's central thing",
    kind: d.kind,
    becomes: d.becomes,
    because: d.because,
  };
}

/** Build the spatial metaphor sentence from the features and the dominant concept. */
export function buildSpatialMetaphor(features: SemanticFeatures, matches: ConceptMatch[]): string {
  // Prefer a theme's metaphor, then a setting's (a room knows what space it is), then the
  // strongest match's.
  const dominant =
    themeMatches(matches)[0]?.concept ??
    matches.find((m) => m.concept.role === "setting")?.concept ??
    matches[0]?.concept;
  if (dominant && dominant.features.spatiality >= features.spatiality - 0.05) {
    return dominant.spatialMetaphor;
  }
  const byPresence: Record<SemanticFeatures["presence"], string> = {
    present: "A space that holds its contents in plain view.",
    absent: "A space with a position in it where something should be.",
    trace: "A space whose contents have to be inferred from what they left.",
  };
  return byPresence[features.presence];
}

export function buildLiteralMeaning(matches: ConceptMatch[], raw: string): string {
  if (matches.length === 0) return `The input "${raw}" read as a title rather than a statement.`;
  const glosses = matches.slice(0, 3).map((m) => m.concept.literalMeaning.replace(/\.$/, ""));
  return glosses.length === 1 ? `${glosses[0]}.` : `${glosses.join("; ")}.`;
}

export function buildCentralIdea(features: SemanticFeatures, matches: ConceptMatch[]): string {
  if (matches.length === 0) {
    return "A condition is examined until the frame itself becomes the subject.";
  }
  const themes = themeMatches(matches);
  const primary = (themes[0] ?? matches[0]!).concept.centralIdea;
  if (matches.length === 1) return primary;

  // With several concepts, state how they interact rather than concatenating glosses.
  const secondaryMatch = themes[1] ?? matches.find((m) => m.concept.centralIdea !== primary);
  if (!secondaryMatch) return primary;
  const secondary = secondaryMatch.concept.centralIdea.replace(/\.$/, "");
  const relation =
    features.cardinality === "dual"
      ? "held against"
      : features.temporal === "accumulation"
        ? "deposited into"
        : "interleaved with";
  const lower = secondary.charAt(0).toLowerCase() + secondary.slice(1);
  return `${primary.replace(/\.$/, "")}, ${relation} ${lower}.`;
}

export function buildDramaticQuestion(features: SemanticFeatures, matches: ConceptMatch[]): string {
  if (matches.length > 0) {
    const themes = themeMatches(matches);
    const q = (themes[0] ?? matches[0]!).concept.dramaticQuestion;
    const second = themes[1];
    if (!second) return q;
    return `${q.replace(/\?$/, "")} And: ${second.concept.dramaticQuestion}`;
  }
  return "What is the frame failing to account for?";
}

/** The heuristic interpreter. Deterministic, offline, and the pipeline default. */
export function interpretHeuristically(raw: string, classification: Classification): SemanticReading {
  const matches = matchConcepts(raw);
  const features = combineFeatures(matches);
  const concepts: MatchedConcept[] = matches.map((m) => ({
    id: m.concept.id,
    surface: m.surface,
    features: m.concept.features,
    note: m.concept.centralIdea,
  }));

  const conceptConstraints = Array.from(new Set(matches.flatMap((m) => m.concept.constraints)));

  // A DIRECTOR-BRIEF is a set of constraints, not a story. Its directives are parsed into
  // facts the planners must honour, and its global constraints are carried into the spec so
  // they are auditable rather than merely acknowledged in a log line.
  const brief = classification.mode === "director-brief" ? parseDirectorBrief(raw) : undefined;
  const constraints = brief
    ? Array.from(new Set([...conceptConstraints, ...brief.globalConstraints]))
    : conceptConstraints;

  return {
    raw,
    mode: classification.mode,
    modeRationale: classification.rationale,
    literalMeaning: buildLiteralMeaning(matches, raw),
    centralIdea: buildCentralIdea(features, matches),
    dramaticQuestion: buildDramaticQuestion(features, matches),
    subjectPresence: features.presence,
    concepts,
    features,
    oppositions: collectOppositions(matches),
    spatialMetaphor: buildSpatialMetaphor(features, matches),
    transformationLogic: pickTransformationLogic(features, matches),
    constraints,
    emotionalArc: buildArc(features, matches),
    motifSeeds: collectMotifSeeds(matches),
    brief,
  };
}

/**
 * The LLM boundary as a type. An LLM-backed interpreter implements this, returns the same
 * `SemanticReading`, and is validated identically. `id` is recorded in provenance so a
 * report can always say whether a model was involved.
 */
export interface SemanticInterpreter {
  readonly id: "heuristic" | "llm";
  readonly model?: string;
  interpret(raw: string, classification: Classification): SemanticReading | Promise<SemanticReading>;
}

export const heuristicInterpreter: SemanticInterpreter = {
  id: "heuristic",
  interpret: (raw, classification) => interpretHeuristically(raw, classification),
};
