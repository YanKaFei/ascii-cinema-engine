/**
 * ShotSpec v2 — a shot that knows WHY IT EXISTS.
 *
 * v1 ShotSpec is camera + layers + a density arc. It describes a shot but cannot
 * explain it, so a director report can only restate the parameters.
 *
 * v2's three load-bearing fields are:
 *
 *   intention     what this shot is doing to the audience, in one sentence
 *   visualReason  why this image serves the intention (not what it contains)
 *   cameraReason  why the camera behaves this way, from the closed reason vocabulary
 *
 * A shot without all three cannot be validated. That is deliberate: it forces the
 * planner to justify, and it makes "shot 3 always pushes in" impossible to express.
 *
 * The rendering-relevant fields (`layers`, `raster`, `transitionIn`) still exist here
 * because Scene IR is compiled *from* them — see `src/scene-ir/`.
 */

import type { CameraMoveSpec, LayerSpec, RasterSpec } from "./schema.js";
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
} from "../director/grammar/vocabulary.js";

// ---------------------------------------------------------------------------
// subject
// ---------------------------------------------------------------------------

/**
 * A subject is the *semantic* description of what is on screen. `visualForm` is the
 * physical kind that will realise it, which is how a semantic subject like "a forgotten
 * name" becomes a concrete `word` made of glyphs.
 */
export interface SubjectSpec {
  id: string;
  /** what it is in the drama, e.g. "the name that was erased" */
  description: string;
  /** the visual kind that realises it */
  visualForm: SubjectKind;
  /** its dramatic role */
  role: SubjectRole;
  /**
   * For `word`/`glyph` subjects: the literal text. ASCII-only, enforced.
   */
  text?: string;
  /** the motif this subject instantiates, if any */
  motifId?: string;
  /** how prominent it is, 0..1; drives ink budget, not just size */
  prominence: number;
}

// ---------------------------------------------------------------------------
// space
// ---------------------------------------------------------------------------

export interface SpaceSpec {
  kind: SpaceKind;
  /** one sentence: what the space is and why it is that */
  description: string;
  /** which grammar depth policy the space implies */
  occlusionPolicy: OcclusionPolicy;
  /** explicit near/mid/far strata when the space is layered */
  layers?: Array<{ id: string; name: string; depthBias: number }>;
  /** the horizon or vanishing behaviour, if the space has one */
  horizon?: "none" | "centered" | "low" | "high" | "off-frame";
  /** true when the space is meant to read as unbounded */
  unbounded?: boolean;
  /** whether we ever see the boundary of the space within the film */
  boundaryVisible: boolean;
}

// ---------------------------------------------------------------------------
// composition
// ---------------------------------------------------------------------------

export interface CompositionSpec {
  primary: CompositionKind;
  /** any additional compositional ideas in play, ordered by importance */
  secondary?: CompositionKind[];
  /** where the subject sits, as a normalised frame position */
  subjectPlacement: { x: number; y: number };
  /** 0..1: how much of the frame is deliberately left empty */
  negativeSpaceRatio: number;
  /** why this arrangement serves the shot's intention */
  reason: string;
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

export interface CameraSpec {
  /** reuse the v1 move description verbatim so the rig needs no new maths */
  move: CameraMoveSpec;
  /** REQUIRED: why the camera does this */
  reason: CameraReason;
  /** one sentence making the reason specific to this shot */
  reasonDetail: string;
  /** how the camera's behaviour relates to the film's rhythm curve at this moment */
  rhythmCoupling: "follows-curve" | "against-curve" | "independent";
}

// ---------------------------------------------------------------------------
// motion (continuous behaviour, distinct from one-way transformation)
// ---------------------------------------------------------------------------

export interface MotionSpec {
  kind: MotionKind;
  /** which subject it applies to */
  subjectId: string;
  /** 0..1 strength relative to the shot's energy */
  intensity: number;
  /** what this motion communicates */
  purpose: string;
}

// ---------------------------------------------------------------------------
// transformation
// ---------------------------------------------------------------------------

export interface TransformationSpec {
  kind: TransformationKind;
  /** the subject that changes */
  subjectId: string;
  /** what it becomes, in the film's terms */
  becomes: string;
  /** normalised start and end of the change within the shot */
  from: number;
  to: number;
  /** why this change, at this moment, means what the film means */
  dramaticPurpose: string;
  /**
   * What the change is a consequence of. This is what makes camera and transformation
   * causally linked rather than independently authored.
   */
  causedBy: "camera" | "subject" | "environment" | "time" | "external";
}

// ---------------------------------------------------------------------------
// transitions
// ---------------------------------------------------------------------------

export interface TransitionSpecV2 {
  kind: TransitionKind;
  /** seconds of overlap; 0 for a hard cut */
  duration: number;
  /** why the shots are joined this way */
  reason: string;
}

// ---------------------------------------------------------------------------
// rhythm (per shot, sampled from the film-level curves)
// ---------------------------------------------------------------------------

export interface ShotRhythm {
  /** 0..1 */
  energy: number;
  /** 0..1 */
  tension: number;
  /** 0..1 */
  informationDensity: number;
  /** 0..1 */
  motionDensity: number;
  /**
   * Where these values came from. `curve` means they were sampled from the film-level
   * rhythm plan; `override` means this shot deliberately departs from it and says why.
   */
  source: "curve" | "override";
  overrideReason?: string;
}

// ---------------------------------------------------------------------------
// shot
// ---------------------------------------------------------------------------

export interface ShotSpecV2 {
  id: string;
  title: string;

  /** why this shot exists in the film */
  narrativeFunction: NarrativeFunction;
  /** what this shot is doing to the audience, one sentence */
  intention: string;

  start: number;
  duration: number;
  background: number;

  subjects: SubjectSpec[];
  space: SpaceSpec;
  composition: CompositionSpec;
  camera: CameraSpec;
  motion: MotionSpec[];
  transformation?: TransformationSpec;

  transitionIn?: TransitionSpecV2;
  transitionOut?: TransitionSpecV2;

  /** rhythm values sampled from the film-level curves */
  rhythm: ShotRhythm;

  /** why this image serves the intention — not what it contains */
  visualReason: string;
  /** why the camera behaves this way, made specific */
  cameraReason: string;

  /**
   * The realisation: primitive layers authored to satisfy everything above.
   * This is what the renderer actually consumes (via Scene IR).
   */
  layers: LayerSpec[];
  /** per-shot raster overrides */
  raster?: Partial<RasterSpec>;
  /**
   * Backwards-compatible technique labels. v1's report and the Phase 1 baseline read
   * these; v2 shots keep them in sync with the transformation/motion/space they use.
   */
  techniques: string[];

  /** the glyph density arc: coverage window at first and last frame */
  density: {
    coverageMinStart: number;
    coverageMinEnd: number;
    coverageMaxStart: number;
    coverageMaxEnd: number;
  };
}

// ---------------------------------------------------------------------------
// derived helpers
// ---------------------------------------------------------------------------

/** Does this shot contain a one-way change of state? */
export function hasTransformation(shot: ShotSpecV2): boolean {
  return shot.transformation !== undefined;
}

/** The subject a transformation acts on, if any. */
export function transformationSubject(shot: ShotSpecV2): SubjectSpec | undefined {
  const t = shot.transformation;
  if (!t) return undefined;
  return shot.subjects.find((s) => s.id === t.subjectId);
}

/** Reason strings for the report: every camera move, with its justification. */
export function cameraJustification(shot: ShotSpecV2): string {
  return `${shot.camera.move.kind}: ${shot.camera.reason} — ${shot.camera.reasonDetail}`;
}
