/**
 * FilmSpec v2 — the DIRECTOR DSL.
 *
 * v1 (`domain/schema.ts`) describes a film as *technical parameters*: resolution, camera
 * moves, layer counts. It can express what a film IS but not what it MEANS, and so
 * nothing downstream can reason about it.
 *
 * v2 separates three concerns that v1 conflated:
 *
 *   input          what the user actually gave us, and in what mode
 *   interpretation what the film is ABOUT   — meaning, arc, motifs, oppositions, metaphor
 *   direction      HOW that becomes a film  — strategies, acts, rhythm
 *
 * `shots[]` carries the realisation. The rule is: **every shot must be derivable from
 * `interpretation` + `direction`**, and every field in `interpretation` must be
 * traceable to the input. If a field cannot be traced, it is invention, and the
 * validator flags it.
 *
 * v1 remains load-bearing: the Phase 1 baseline is a v1 FilmSpec and must keep
 * rendering. v2 is additive; `domain/v2-adapter.ts` bridges them.
 */

import type { Easing, FilmLookSpec, RasterSpec } from "./schema.js";
import type { ShotSpecV2 } from "./shot-spec-v2.js";
import type {
  CompositionKind,
  NarrativeFunction,
  SpaceKind,
  SubjectKind,
  SubjectRole,
  TransformationKind,
  TransitionKind,
} from "../director/grammar/vocabulary.js";

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

export const INPUT_MODES = ["word", "sentence", "script", "director-brief"] as const;
export type InputMode = (typeof INPUT_MODES)[number];

export interface FilmInput {
  /** verbatim user input; never normalised away, it is the provenance */
  raw: string;
  mode: InputMode;
  /**
   * How the mode was decided. Recorded because "we classified this as a sentence" is a
   * decision that must be auditable, not an implicit assumption.
   */
  modeRationale: string;
  /** if the input was a script, the structural units found in it */
  scriptUnits?: ScriptUnit[];
}

export interface ScriptUnit {
  index: number;
  /** scene/shot heading as written, if any */
  heading?: string;
  /** the text of the unit */
  body: string;
  /** who/what this unit is about, extracted */
  subjects: string[];
  /** where it happens, extracted */
  location?: string;
}

// ---------------------------------------------------------------------------
// interpretation — what the film is about
// ---------------------------------------------------------------------------

/** One step of the emotional arc. `at` is normalised film position 0..1. */
export interface EmotionalBeat {
  at: number;
  /** the feeling, in the film's own terms */
  feeling: string;
  /** what causes it, as a visible event */
  cause: string;
  /** 0..1 relative intensity of this beat */
  intensity: number;
}

/**
 * A visual motif: a concrete, repeatable visual idea that carries the film's meaning.
 * Motifs are what make a film feel authored — they return, change, and pay off.
 */
export interface VisualMotif {
  id: string;
  /** what it means */
  meaning: string;
  /** what the audience actually sees */
  visualForm: string;
  subjectKind: SubjectKind;
  /** the role it plays in the drama */
  role: SubjectRole;
  /** where it first appears, 0..1 through the film */
  introducedAt: number;
  /**
   * How the motif changes each time it returns. A motif that never changes is
   * decoration; a motif that transforms is a story.
   */
  development: string[];
}

/**
 * A thematic opposition. The film's drama is the tension between `a` and `b`; shots are
 * expected to stage this, not merely mention it.
 */
export interface Opposition {
  a: string;
  b: string;
  /** which of the two the film's final image leans toward, if either */
  resolvedToward?: "a" | "b" | "neither";
  /** how the film stages the tension spatially or temporally */
  staging: string;
}

export interface Interpretation {
  /** what the input literally says */
  literalMeaning: string;
  /** what the film is actually about, in one sentence */
  centralIdea: string;
  /** the question the film asks and does not fully answer */
  dramaticQuestion?: string;
  /** whether the film is about something present, absent, or both */
  subjectPresence: "present" | "absent" | "both";

  emotionalArc: EmotionalBeat[];

  motifs: VisualMotif[];

  oppositions: Opposition[];

  /**
   * The spatial idea that stands in for the abstract idea. This is the single most
   * important field for structural diversity: different metaphors produce different
   * space, and different space produces different shots.
   */
  spatialMetaphor: string;
  /** which grammar space this metaphor implies */
  spaceKind: SpaceKind;

  /**
   * How the film's central thing changes over the film — the transformation logic.
   * `undefined` means the film is about a state, not a change.
   */
  transformationLogic?: {
    /** what transforms */
    subject: string;
    kind: TransformationKind;
    /** what it becomes */
    becomes: string;
    /** why that change means what the film means */
    because: string;
  };

  /** things the film must NOT do, derived from the meaning (e.g. "no resolution") */
  constraints?: string[];
}

// ---------------------------------------------------------------------------
// direction — how the interpretation becomes a film
// ---------------------------------------------------------------------------

/**
 * A global rhythm curve. This is what makes rhythm a film-level layer instead of a
 * per-shot easing choice: shots are cut to fit the curve, not the other way round.
 *
 * Keyframes are (at 0..1, value 0..1), sorted. The compiler interpolates.
 */
export type Curve = Array<[number, number]>;

export interface RhythmPlan {
  /** overall intensity of the film */
  energy: Curve;
  /** unresolved pressure; drives shot length and camera velocity */
  tension: Curve;
  /** how much the audience is being asked to read; drives glyph density */
  informationDensity: Curve;
  /** how much is moving on screen */
  motionDensity: Curve;
  /** rationale for the shape of the curves */
  rationale: string;
}

export interface DirectionPlan {
  duration: number;
  fps: number;
  resolution: [number, number];
  quality: "draft" | "standard" | "high";

  visualStrategy: string;
  densityStrategy: string;
  cameraStrategy: string;
  editingStrategy: string;
  rhythmStrategy: string;
  negativeSpaceStrategy?: string;

  /** how the film begins, in one sentence */
  openingImage: string;
  /** the final image, and what it means relative to the opening */
  closingImage: string;

  rhythm: RhythmPlan;

  look: FilmLookSpec;
  raster: RasterSpec;
}

// ---------------------------------------------------------------------------
// acts
// ---------------------------------------------------------------------------

export interface ActSpec {
  id: string;
  title: string;
  /** why this act exists — its function in the drama */
  function: string;
  /** shot ids that belong to this act */
  shotIds: string[];
  /** normalised start/end of the act */
  from: number;
  to: number;
  /** the act's dominant narrative function */
  dominantFunction: NarrativeFunction;
  /** the act's dominant space, if it changes between acts */
  dominantSpace?: SpaceKind;
  /** the act's dominant composition */
  dominantComposition?: CompositionKind;
}

// ---------------------------------------------------------------------------
// film
// ---------------------------------------------------------------------------

export interface FilmSpecV2 {
  version: "2";
  slug: string;
  title: string;

  input: FilmInput;
  interpretation: Interpretation;
  direction: DirectionPlan;

  acts: ActSpec[];
  shots: ShotSpecV2[];

  /** deterministic seed for every stochastic process */
  seed: number;

  /**
   * How this spec was produced. This is the audit trail that makes the LLM boundary
   * checkable: which planner produced which field, and whether an LLM was involved.
   */
  provenance: DirectorProvenance;
}

export interface DirectorProvenance {
  /** "deterministic" for the heuristic planner, "llm" when a model produced it */
  interpreter: "deterministic" | "llm" | "preset";
  /** model identifier if interpreter is "llm" */
  model?: string;
  /** planner id -> one-line description of what it produced */
  planners: Array<{ id: string; summary: string }>;
  /**
   * Fields that validation had to repair or default, with the reason. Empty is the
   * healthy case; a silent ignore is a bug, so anything repaired is listed here.
   */
  repairs: Array<{ path: string; problem: string; action: "repaired" | "defaulted" | "dropped" }>;
  /** the v1/preset template this film was seeded from, if any */
  seedTemplate?: string;
}

/** Look up a shot by id. */
export function findShotV2(film: FilmSpecV2, id: string): ShotSpecV2 | undefined {
  return film.shots.find((s) => s.id === id);
}

export type { Easing, TransitionKind };
