/**
 * Director pipeline contracts.
 *
 * The pipeline is a chain of PURE planners, each consuming the previous stage's typed
 * output. The point of the chain is not ceremony — it is that each stage makes exactly
 * one kind of decision, so a wrong film can be traced to the stage that got it wrong:
 *
 *   classify      what KIND of input is this?
 *   interpret     what does it MEAN?          (the only LLM-eligible stage)
 *   motif         what do we SEE?
 *   dramaturgy    how does it MOVE?
 *   spatial       WHERE are we?
 *   rhythm        what is the film's SHAPE OVER TIME?
 *   shot          what are the individual SHOTS?
 *
 * Every stage takes (reading, options, seed) and returns data. No stage reads a clock, a
 * random source other than the seeded RNG, or the environment.
 *
 * THE LLM BOUNDARY LIVES AT `interpret`. Everything before and after is deterministic.
 * `SemanticInterpreter` has two implementations: a heuristic one (default, no network)
 * and — in future — an LLM-backed one returning the SAME `SemanticReading` type, which
 * `validate-v2` then validates. The planners cannot tell which produced the reading,
 * which is what keeps the boundary honest.
 */

import type {
  CameraReason,
  CompositionKind,
  MotionKind,
  NarrativeFunction,
  OcclusionPolicy,
  SpaceKind,
  SubjectKind,
  SubjectRole,
  TransformationKind,
  TransitionKind,
} from "./grammar/vocabulary.js";
import type { Curve, EmotionalBeat, InputMode, Opposition, VisualMotif } from "../domain/film-spec-v2.js";

export type { Curve };

// ---------------------------------------------------------------------------
// semantic features — the bridge from meaning to structure
// ---------------------------------------------------------------------------

/**
 * The shape of the film's change.
 *  - rise        pressure builds to a release
 *  - fall        something is lost progressively
 *  - wave        cycles of approach and withdrawal
 *  - plateau     a state is examined without resolution
 *  - collapse    a structure holds, then fails
 *  - spiral      the same situation recurs with accumulating difference
 */
export type ArcShape = "rise" | "fall" | "wave" | "plateau" | "collapse" | "spiral";

/** How the film's central thing relates to the audience across time. */
export type BidiTemporal = "accumulation" | "erosion" | "repetition" | "single-event";

/**
 * Whether the subject of the film is present in the image, absent from it, or present
 * only as a trace. This single feature is one of the strongest drivers of space choice.
 */
export type Presence = "present" | "absent" | "trace";

/** Whether the film's subject can be reached at all. */
export type Reachability = "reachable" | "approached-never-reached" | "unreachable";

/** Whether a body is the film's subject. */
export type Embodiment = "bodily" | "abstract" | "collective";

/** Whether the film is about one thing, two things in tension, or a field. */
export type Cardinality = "singular" | "dual" | "multiplicitous";

export type Tempo = "slow" | "measured" | "urgent" | "erratic";

/**
 * What kind of boundary the film's space has. This is a CATEGORY, not a scalar, because a
 * single "how enclosed is it" number cannot separate two structurally different spaces:
 * being INSIDE a room and MOVING ALONG a corridor are both "enclosed", and a film about a
 * room it can lose is not the same film as one about a distance it cannot close.
 *
 *   open        no boundary at all; the frame is unbounded
 *   passage     a boundary that defines a direction of travel
 *   container   a boundary that defines an inside
 *   unbounded   structure with no enclosure: recurring, extending, systematic
 */
export type BoundaryType = "open" | "passage" | "container" | "unbounded";

/**
 * The measurable semantic reading. Every field here is DERIVED from the input by the
 * interpreter, and every downstream planner reads only these features — never the raw
 * prompt. That is the mechanism that prevents per-benchmark special-casing: after
 * `interpret`, the original string is provenance, not an input.
 */
export interface BriefShot {
  /** 1-based index as written in the brief */
  index: number;
  /** declared duration in seconds, if stated */
  duration?: number;
  /** declared camera move, if stated */
  cameraKind?: string;
  /** declared transition into this shot, if stated */
  transition?: string;
  /** the raw text of the directive */
  raw: string;
}

export interface DirectorBrief {
  shots: BriefShot[];
  /** global constraints stated by the brief */
  globalConstraints: string[];
  /** total duration the brief declares, when every shot states one */
  declaredTotalDuration?: number;
}

export interface SemanticFeatures {
  arcShape: ArcShape;
  temporal: BidiTemporal;
  presence: Presence;
  reachability: Reachability;
  embodiment: Embodiment;
  cardinality: Cardinality;
  tempo: Tempo;
  /** how much the film is about space/enclosure rather than a body (0..1) */
  spatiality: number;
  /** how much the film is about interior states rather than events (0..1) */
  interiority: number;
  /**
   * How much the film is ABOUT a bounded space, as opposed to merely set in one (0..1).
   *
   * Distinct from `spatiality`, which only says how much space matters. A film can be
   * intensely spatial and still unbounded (a void), or nominally interior and not about the
   * enclosure at all. Without this, "a man erases his name and the room disappears" was
   * given the same space as "loneliness" — the enclosure and emptiness concepts cancelled
   * each other out and the film lost the boundary that its whole ending depends on.
   */
  enclosureAffinity: number;
  /** what kind of boundary the space has; drives the space choice categorically */
  boundaryType: BoundaryType;
  /**
   * How central the boundary ITSELF is to the film's meaning (0..1).
   *
   * Distinct from `enclosureAffinity` (how enclosed the space is) and from `spatiality`
   * (how much space matters). A film can be entirely unbounded and still be ABOUT its
   * boundary disappearing: "the room vanishes" needs walls to lose. Without this feature
   * that film was given the same void as a film about having no boundary at all, and lost
   * the structure its whole ending depends on.
   */
  boundarySalience: number;
  /** how violent the film's transitions between states are (0..1) */
  violence: number;
  /** how strongly the film asks for resolution (0..1) */
  resolutionPressure: number;
  /** how legible/literal the imagery should be (0..1) */
  literalism: number;
}

// ---------------------------------------------------------------------------
// interpretation output
// ---------------------------------------------------------------------------

/** A concept the interpreter recognised in the input. */
export interface MatchedConcept {
  id: string;
  /** the surface form that triggered it */
  surface: string;
  /** the concept's own feature vector, before combination */
  features: SemanticFeatures;
  /** what it contributes to the reading */
  note: string;
}

/**
 * The interpreter's full output. This is the ONLY stage an LLM may replace, and an LLM
 * must return exactly this shape for validation to accept it.
 */
export interface SemanticReading {
  /** verbatim input, kept for provenance */
  raw: string;
  mode: InputMode;
  modeRationale: string;

  literalMeaning: string;
  centralIdea: string;
  dramaticQuestion?: string;
  subjectPresence: Presence;

  /** the concepts that fired, with their contributions */
  concepts: MatchedConcept[];

  /** the combined feature vector every planner reads */
  features: SemanticFeatures;

  /** the film's dramatic oppositions */
  oppositions: Opposition[];

  /** the spatial idea, before it is turned into a SpaceSpec */
  spatialMetaphor: string;

  /** how the central thing changes, if it changes */
  transformationLogic?: {
    subject: string;
    kind: TransformationKind;
    becomes: string;
    because: string;
  };

  /** what the film must not do */
  constraints: string[];
  /**
   * Explicit production directives parsed from a DIRECTOR-BRIEF input.
   *
   * A brief is not a story: it is a set of constraints, and the honest response to one is to
   * HONOUR it rather than to interpret it as content. Without this the brief mode was a label
   * that changed nothing — "shot 2: 6 seconds, slow push-in" produced neither 6 seconds nor a
   * push-in, which made the mode's whole claim false.
   */
  brief?: DirectorBrief;

  /** the arc, as interpreted (dramaturgy refines the timings) */
  emotionalArc: EmotionalBeat[];

  /** motif seeds: meaning + visual idea, before concrete subject forms are chosen */
  motifSeeds: MotifSeed[];
}

/** A motif before the MotifPlanner picks its concrete visual form. */
export interface MotifSeed {
  id: string;
  meaning: string;
  /** the role it plays */
  role: SubjectRole;
  /** a hint at the visual family; the MotifPlanner chooses the exact `SubjectKind` */
  visualHint: string;
  introducedAt: number;
}

// ---------------------------------------------------------------------------
// planner outputs
// ---------------------------------------------------------------------------

/** A motif with a concrete visual form and subject kind, ready to be put in a shot. */
export interface PlannedMotif extends VisualMotif {
  /** how it should be staged when it appears */
  staging: string;
  /** the subject ids that will realise it */
  subjectKind: SubjectKind;
}

export interface PlannedAct {
  id: string;
  title: string;
  function: string;
  from: number;
  to: number;
  dominantFunction: NarrativeFunction;
  dominantSpace: SpaceKind;
  dominantComposition: CompositionKind;
  /** how many shots this act should contain */
  shotCount: number;
}

export interface Dramaturgy {
  acts: PlannedAct[];
  /** the refined emotional arc, consistent with the acts */
  arc: EmotionalBeat[];
  /** the film's turn, expressed as the position it happens at */
  turnAt: number;
  /** rationale for the act structure */
  rationale: string;
}

export interface SpatialPlan {
  spaceKind: SpaceKind;
  description: string;
  occlusionPolicy: OcclusionPolicy;
  boundaryVisible: boolean;
  unbounded: boolean;
  horizon: "none" | "centered" | "low" | "high" | "off-frame";
  /** named depth strata for layered spaces */
  layers: Array<{ id: string; name: string; depthBias: number }>;
  /** rationale */
  rationale: string;
}

/** A camera decision for one shot, with its justification already attached. */
export interface PlannedCamera {
  kind: string;
  reason: CameraReason;
  reasonDetail: string;
  /** framing: the visible world height at rest, as a multiple of the subject height */
  framing: number;
  dollyAmount: number;
  panAmount: number;
  yawAmount: number;
  jitter: number;
  zoomBoost: number;
  easing: string;
  /** how far the camera pulls BACK before it starts its move, as a fraction of the move; see
   * `CameraMoveSpec.anticipation`. */
  anticipation: number;
  rhythmCoupling: "follows-curve" | "against-curve" | "independent";
}

export interface PlannedComposition {
  primary: CompositionKind;
  secondary: CompositionKind[];
  subjectPlacement: { x: number; y: number };
  negativeSpaceRatio: number;
  reason: string;
}

/** A shot before its primitive layers are authored. */
export interface ShotPlan {
  id: string;
  title: string;
  narrativeFunction: NarrativeFunction;
  intention: string;
  start: number;
  duration: number;
  actId: string;

  motifs: PlannedMotif[];
  space: SpatialPlan;
  composition: PlannedComposition;
  camera: PlannedCamera;
  motion: Array<{ kind: MotionKind; subjectId: string; intensity: number; purpose: string }>;
  transformation?: {
    kind: TransformationKind;
    subjectId: string;
    becomes: string;
    from: number;
    to: number;
    dramaticPurpose: string;
    causedBy: "camera" | "subject" | "environment" | "time" | "external";
  };
  transitionIn?: { kind: TransitionKind; duration: number; reason: string };

  rhythm: {
    energy: number;
    tension: number;
    informationDensity: number;
    motionDensity: number;
    source: "curve" | "override";
    overrideReason?: string;
  };

  visualReason: string;
  cameraReason: string;

  techniques: string[];
  density: {
    coverageMinStart: number;
    coverageMinEnd: number;
    coverageMaxStart: number;
    coverageMaxEnd: number;
  };
}

export interface RhythmPlanOutput {
  energy: Curve;
  tension: Curve;
  informationDensity: Curve;
  motionDensity: Curve;
  rationale: string;
}

// ---------------------------------------------------------------------------
// pipeline options
// ---------------------------------------------------------------------------

export interface DirectorOptions {
  duration: number;
  fps: number;
  width: number;
  height: number;
  quality: "draft" | "standard" | "high";
  seed?: number;
  /** force a mode instead of classifying */
  forceMode?: InputMode;
}

export interface DirectorResult {
  reading: SemanticReading;
  dramaturgy: Dramaturgy;
  motifs: PlannedMotif[];
  spatial: SpatialPlan;
  rhythm: RhythmPlanOutput;
  shots: ShotPlan[];
  /** per-planner attribution for provenance */
  planners: Array<{ id: string; summary: string }>;
  seed: number;
}
