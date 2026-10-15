/**
 * THE VISUAL GRAMMAR — vocabulary.
 *
 * This file is the closed set of things the Director Agent is allowed to say. A
 * director plan is not free-form: it is a composition of these terms, and every term
 * has a defined meaning for the compiler.
 *
 * Why a closed vocabulary rather than "let the planner write whatever":
 *   1. it makes the planner's output *checkable* — an unknown term is a schema error,
 *      not a silently ignored field;
 *   2. it makes structural diversity *measurable* — two films differ if their term
 *      distributions differ (see the diversity report);
 *   3. it keeps the vocabulary of cinematography separate from the implementation of
 *      it, so a new renderer (GPU) does not need a new grammar.
 *
 * These are NOT effects. They are directorial choices. `assemble` is not "a particle
 * animation"; it is the decision that a form should be seen to come together, and it
 * constrains which shots can use it and what the audience learns from them.
 */

// ---------------------------------------------------------------------------
// SUBJECT — what the film is about, as a visible thing
// ---------------------------------------------------------------------------

export const SUBJECT_KINDS = [
  /** a single mark. the atomic unit of the medium. */
  "point",
  /** a mark with semantic weight: one character chosen for what it is. */
  "glyph",
  /** legible text as an object; the film's most explicit representational mode. */
  "word",
  /** a body silhouette. */
  "figure",
  /** many bodies: the subject is a collective, not an individual. */
  "crowd",
  /** a population, not countable; the subject is a condition. */
  "field",
  /** made out of parts; something built. */
  "structure",
  /** built space: walls, floors, rooms, columns. */
  "architecture",
  /** the subject is the absence of subject. */
  "void",
  /** an edge, threshold, frame or horizon; the subject is a limit. */
  "boundary",
  /** a path left behind by something; the subject is evidence of movement. */
  "trail",
] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

/** The semantic role a subject plays in the drama, independent of its visual kind. */
export const SUBJECT_ROLES = [
  "protagonist",
  "antagonist",
  "object-of-desire",
  "obstacle",
  "environment",
  "witness",
  "memory",
  "absence",
  "survivor",
  "evidence",
] as const;
export type SubjectRole = (typeof SUBJECT_ROLES)[number];

// ---------------------------------------------------------------------------
// SPACE — the spatial logic the film thinks in
// ---------------------------------------------------------------------------

export const SPACE_KINDS = [
  /** nothing but the subject. no ground, no walls. */
  "void",
  /** a flat stage the subject sits on; depth is implied, not built. */
  "plane",
  /** movement is constrained to one axis, usually toward or away. */
  "corridor",
  /** an enclosing axis that closes behind the subject. */
  "tunnel",
  /** a room: enclosing, with a boundary. */
  "room",
  /** open expanse; subject is small in it. */
  "field",
  /** explicit near/mid/far strata; parallax is the point. */
  "layered-depth",
  /** space organised around a centre; movement is in/out. */
  "radial-space",
  /** organised vertically; up/down carries meaning. */
  "vertical-space",
  /** repeating structure with no horizon; space as system. */
  "infinite-grid",
] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];

// ---------------------------------------------------------------------------
// COMPOSITION — how the frame is arranged
// ---------------------------------------------------------------------------

export const COMPOSITION_KINDS = [
  "centered",
  "isolated",
  "symmetrical",
  "asymmetrical",
  "edge-weighted",
  "negative-space",
  "compression",
  "expansion",
  "foreground-obstruction",
  "deep-axis",
] as const;
export type CompositionKind = (typeof COMPOSITION_KINDS)[number];

// ---------------------------------------------------------------------------
// MOTION — continuous behaviour, as opposed to a one-way transformation
// ---------------------------------------------------------------------------

export const MOTION_KINDS = [
  "drift",
  "orbit",
  "converge",
  "diverge",
  "pulse",
  "flicker",
  "fall",
  "rise",
  "flow",
  "tremble",
  "hold",
] as const;
export type MotionKind = (typeof MOTION_KINDS)[number];

// ---------------------------------------------------------------------------
// TRANSFORMATION — a one-way change of state over the course of a shot
// ---------------------------------------------------------------------------

export const TRANSFORMATION_KINDS = [
  "assemble",
  "disassemble",
  "fragment",
  "merge",
  "replace",
  "erode",
  "grow",
  "collapse",
  "multiply",
  "vanish",
  "invert",
  "crossfade-density",
] as const;
export type TransformationKind = (typeof TRANSFORMATION_KINDS)[number];

// ---------------------------------------------------------------------------
// CAMERA — movement, and the reason for it
// ---------------------------------------------------------------------------

export const CAMERA_KINDS = [
  "static",
  "push-in",
  "pull-out",
  "lateral-left",
  "lateral-right",
  "crane-up",
  "crane-down",
  "orbit",
  "handheld",
] as const;

/**
 * Every camera move must declare WHY. The valid reasons are not decorative — each one
 * implies a different relationship between camera and subject, and the CameraPlanner
 * may only emit a move whose reason it can actually justify from the shot's intention.
 *
 * "because shot 3 always pushes in" is not on this list, and that is the point.
 */
export const CAMERA_REASONS = [
  /** closing distance raises the stakes without changing what is visible. */
  "increase-psychological-pressure",
  /** the subject is receding; the camera tries to close a gap it cannot close. */
  "approach-inaccessible-object",
  /** the camera is the instrument that reveals how much is there. */
  "reveal-density",
  /** the camera is inside the event rather than observing it. */
  "immerse-in-field",
  /** pulling back to show that what looked like everything was a fragment. */
  "reveal-context",
  /** the subject is lost; the frame widens around the absence. */
  "withdraw-from-absence",
  /** sliding across strata so the audience sees that depth is populated. */
  "traverse-depth-layers",
  /** refusing to move; the subject must carry all the change. */
  "hold-observation",
  /** the subject is moving and the camera follows; complicity. */
  "track-subject",
  /** rising to make the subject small. */
  "diminish-subject",
  /** descending to meet the subject at its own level. */
  "meet-subject",
  /** the camera circles because the subject has no single true face. */
  "interrogate-subject",
  /** instability is the subject. */
  "destabilise-frame",
] as const;
export type CameraReason = (typeof CAMERA_REASONS)[number];

// ---------------------------------------------------------------------------
// NARRATIVE FUNCTION — why this shot exists in the film
// ---------------------------------------------------------------------------

export const NARRATIVE_FUNCTIONS = [
  /** establishes the world and its rules. */
  "establish",
  /** brings a subject into the film for the first time. */
  "introduce",
  /** active pursuit; the film has a want. */
  "pursue",
  /** shows the audience something the subject does not know. */
  "reveal",
  /** a state change; the film turns. */
  "transform",
  /** the turn is violent or irreversible. */
  "rupture",
  /** the structure that held the film together fails. */
  "collapse",
  /** the aftermath; the film settles onto its final image. */
  "resolve",
  /** begins something the film does not close. */
  "open",
] as const;
export type NarrativeFunction = (typeof NARRATIVE_FUNCTIONS)[number];

// ---------------------------------------------------------------------------
// EDITING — how shots meet
// ---------------------------------------------------------------------------

export const TRANSITION_KINDS = [
  /** hard cut. the default, and a choice. */
  "cut",
  /** a soft overlap; time is continuous. */
  "dissolve",
  /** the incoming image replaces the outgoing one in place; a spatial jump. */
  "match-cut",
  /** the frame loses its subject before the next arrives; an ellipsis. */
  "fade-through-void",
] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

// ---------------------------------------------------------------------------
// OCCLUSION — how depth resolves (Scene IR level)
// ---------------------------------------------------------------------------

export const OCCLUSION_POLICIES = [
  /** Phase 1 behaviour: splats sum. nothing hides anything. */
  "additive",
  /** nearest primitive's contribution wins per cell; a basic z-buffer. */
  "nearest",
  /** front-to-back compositing with per-primitive alpha. */
  "alpha",
  /** this layer writes a coverage mask that others are clipped by. */
  "mask",
] as const;
export type OcclusionPolicy = (typeof OCCLUSION_POLICIES)[number];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Every term in the grammar, by category. Used by validators and the diversity report. */
export const GRAMMAR = {
  subjectKind: SUBJECT_KINDS,
  subjectRole: SUBJECT_ROLES,
  space: SPACE_KINDS,
  composition: COMPOSITION_KINDS,
  motion: MOTION_KINDS,
  transformation: TRANSFORMATION_KINDS,
  cameraReason: CAMERA_REASONS,
  narrativeFunction: NARRATIVE_FUNCTIONS,
  transition: TRANSITION_KINDS,
  occlusion: OCCLUSION_POLICIES,
} as const;

export type GrammarCategory = keyof typeof GRAMMAR;

export function isSubjectKind(v: string): v is SubjectKind {
  return (SUBJECT_KINDS as readonly string[]).includes(v);
}
export function isSubjectRole(v: string): v is SubjectRole {
  return (SUBJECT_ROLES as readonly string[]).includes(v);
}
export function isSpaceKind(v: string): v is SpaceKind {
  return (SPACE_KINDS as readonly string[]).includes(v);
}
export function isCompositionKind(v: string): v is CompositionKind {
  return (COMPOSITION_KINDS as readonly string[]).includes(v);
}
export function isMotionKind(v: string): v is MotionKind {
  return (MOTION_KINDS as readonly string[]).includes(v);
}
export function isTransformationKind(v: string): v is TransformationKind {
  return (TRANSFORMATION_KINDS as readonly string[]).includes(v);
}
export function isCameraReason(v: string): v is CameraReason {
  return (CAMERA_REASONS as readonly string[]).includes(v);
}
export function isNarrativeFunction(v: string): v is NarrativeFunction {
  return (NARRATIVE_FUNCTIONS as readonly string[]).includes(v);
}
export function isTransitionKind(v: string): v is TransitionKind {
  return (TRANSITION_KINDS as readonly string[]).includes(v);
}
export function isOcclusionPolicy(v: string): v is OcclusionPolicy {
  return (OCCLUSION_POLICIES as readonly string[]).includes(v);
}
