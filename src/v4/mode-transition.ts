/**
 * VISUAL MODE TRANSITION INTENT — a semantic object changing REPRESENTATION while keeping its IDENTITY.
 *
 * ⚠ **THE PROBLEM, STATED CONCRETELY.** Before R3 a shot could declare four layers, but nothing could say *"this
 * same object begins as scene text and ends as a glyph field"*. The NAME simply broke: fragmentation pushed its
 * cells outward and the object stopped existing. **Hiding one representation and showing another is not a
 * transition**, and neither is spawning unrelated particles at the moment of change.
 *
 * This contract names the SOURCE OBJECT, the two MODES, the frame window, both anchors, the method, and what
 * continuity is promised — and the compiler validates and preserves it so the runtime consumes a compiled
 * contract rather than the plan's prose.
 */

export const TRANSITION_METHODS = ["TOPOLOGY_CARRIED_FRAGMENTATION"] as const;
export type TransitionMethod = (typeof TRANSITION_METHODS)[number];

/** What continuity the transition PROMISES. Not every property is preserved — only these. */
export const CONTINUITY_POLICIES = ["IDENTITY_AND_TOPOLOGY", "IDENTITY_ONLY", "POSITION_ONLY"] as const;
export type ContinuityPolicy = (typeof CONTINUITY_POLICIES)[number];

export interface VisualModeTransitionIntent {
  transitionId: string;
  /** the SEMANTIC object that persists — the NAME, not "the letters" and not "the particles" */
  sourceObjectId: string;
  sourceMode: "SCENE_ASCII" | "TYPOGRAPHIC_GRAPHIC";
  targetMode: "TYPOGRAPHIC_GRAPHIC" | "GLYPH_FIELD";
  /** SHOT-RELATIVE, half-open [startFrame, endFrame) — the same convention as LayerTiming */
  startFrame: number;
  endFrame: number;
  /** where the source object sits when the transition begins */
  sourceAnchor: { x: number; y: number; z: number };
  /** where the field is heading when the transition completes */
  destinationAnchor: { x: number; y: number; z: number };
  transitionMethod: TransitionMethod;
  continuityPolicy: ContinuityPolicy;
  /** how many fragments the topology should be resolved into, when this transition BIRTHS them */
  fragmentCount: number;
  /**
   * ⚠ WHICH TRANSITION OWNS THE FRAGMENT LIFETIME, and where those fragments go.
   *
   * The R3 defect was that every transition created its own carriers with `deathFrame = endFrame + 1`, so the
   * field died two frames after the S5 window and S6 independently re-fractured the same NAME. **Two mechanisms
   * owned one semantic event, and the identity did not survive the cut.**
   *
   * `continuesTransitionId` names the transition whose carriers this one CONTINUES. When it is set:
   *   - **no new carriers are created** (`resolveFragments` is not called again for this object);
   *   - the existing carriers are **retargeted** to this transition's `destinationAnchor`;
   *   - their lifetime is **extended**, not restarted.
   * `resolveFragments` is therefore called exactly ONCE per semantic object for the whole film.
   */
  continuesTransitionId?: string;
  /**
   * ⚠ WHETHER THIS LINK **MOVES** THE EXISTING CARRIERS, as distinct from merely **inheriting the chain's
   * lifetime**.
   *
   * R3.4 conflated the two. `graphic-to-field` carries `continuesTransitionId`, so the runtime treated it as a
   * continuation, never let it birth its own window, and the carriers stayed clamped to the OLD
   * `[248,288)` interval — measured as `alive 0` from 320 to 338 with `birth 248 death 288` while the fracture was
   * supposedly running. **Inheriting a lifetime is not the same act as retargeting a population.**
   *
   * Default: `true` when `continuesTransitionId` is set, because a plain continuation does move the carriers.
   * A link that OPENS a new representation phase sets it to `false` and so births its own window while still
   * taking the chain's lifetime.
   */
  retargetsCarriers?: boolean;
  /** absolute sequence frame at which the carriers' lifetime ends, if it should outlive the shot */
  carriersUntilAbsoluteFrame?: number;
  /** deterministic seed — a transition that resamples randomly each frame has no continuity */
  seed: number;
}

export class ModeTransitionError extends Error {
  constructor(message: string) { super(message); this.name = "ModeTransitionError"; }
}

/** Every semantic object the film defines. A transition may only reference one of these. */
export const KNOWN_OBJECTS = ["NAME", "PERSON", "ROOM"] as const;

export const VALID_MODES = ["SCENE_ASCII", "EDGE_ASCII", "TYPOGRAPHIC_GRAPHIC", "GLYPH_FIELD", "NEGATIVE_SPACE"] as const;

/**
 * VALIDATE — called by the compiler.
 *
 * The rules refuse exactly the failure modes this order names: a transition to a mode that does not exist, an
 * invalid interval, an unresolvable anchor, a missing source object, and **a transition with no executable
 * runtime consumer** (which is declared by `hasRuntimeConsumer`, supplied by the compiler because only the
 * compiler knows whether the runtime implements the method).
 */
export function validateModeTransition(t: VisualModeTransitionIntent, opts: { hasRuntimeConsumer: (m: TransitionMethod) => boolean; objectExists: (id: string) => boolean }): string[] {
  const p: string[] = [];
  if (!t.transitionId) p.push("a visual mode transition declares no transitionId, so its pixels could not be traced");
  if (!t.sourceObjectId) p.push("a visual mode transition declares no sourceObjectId");
  else if (!opts.objectExists(t.sourceObjectId)) p.push(`transition '${t.transitionId}' references source object '${t.sourceObjectId}', which the film does not define`);
  if (!VALID_MODES.includes(t.sourceMode)) p.push(`transition '${t.transitionId}' has unknown sourceMode '${t.sourceMode}'`);
  if (!VALID_MODES.includes(t.targetMode)) p.push(`transition '${t.transitionId}' has unknown targetMode '${t.targetMode}'`);
  /**
   * Identical modes are refused UNLESS this transition is a CONTINUATION. A continuation deliberately keeps the
   * representation (`GLYPH_FIELD` into `GLYPH_FIELD`) because **the object is not changing representation across
   * the cut — it is the same field continuing**; only its carrier lifetime and destination change.
   */
  if (t.sourceMode === t.targetMode && !t.continuesTransitionId) {
    p.push(`transition '${t.transitionId}' has identical source and target mode '${t.sourceMode}' — that is not a representation change`);
  }
  if (!TRANSITION_METHODS.includes(t.transitionMethod)) p.push(`transition '${t.transitionId}' has unknown method '${t.transitionMethod}'`);
  if (!CONTINUITY_POLICIES.includes(t.continuityPolicy)) p.push(`transition '${t.transitionId}' has unknown continuityPolicy '${t.continuityPolicy}'`);
  for (const [name, v] of [["startFrame", t.startFrame], ["endFrame", t.endFrame], ["fragmentCount", t.fragmentCount], ["seed", t.seed]] as const) {
    if (!Number.isFinite(v)) p.push(`transition '${t.transitionId}' ${name} is not a finite number (${String(v)})`);
  }
  if (Number.isFinite(t.startFrame) && Number.isFinite(t.endFrame)) {
    if (!Number.isInteger(t.startFrame) || !Number.isInteger(t.endFrame)) p.push(`transition '${t.transitionId}' frames must be integers`);
    if (t.endFrame <= t.startFrame) p.push(`transition '${t.transitionId}' interval [${t.startFrame}, ${t.endFrame}) is empty or inverted`);
    /** a one-frame transition cannot be perceived as a transformation */
    if (t.endFrame - t.startFrame < 2) p.push(`transition '${t.transitionId}' interval is ${t.endFrame - t.startFrame} frame(s); a representation change needs at least 2 to be a transformation rather than a cut`);
  }
  if (Number.isFinite(t.fragmentCount) && (t.fragmentCount < 1 || !Number.isInteger(t.fragmentCount))) p.push(`transition '${t.transitionId}' fragmentCount must be a positive integer`);
  if (t.continuesTransitionId !== undefined) {
    if (!t.continuesTransitionId) p.push(`transition '${t.transitionId}' declares an empty continuesTransitionId`);
    /** a transition cannot continue itself */
    if (t.continuesTransitionId === t.transitionId) p.push(`transition '${t.transitionId}' continues ITSELF, which would make its lifetime circular`);
  }
  if (t.carriersUntilAbsoluteFrame !== undefined && !Number.isFinite(t.carriersUntilAbsoluteFrame)) {
    p.push(`transition '${t.transitionId}' carriersUntilAbsoluteFrame is not finite (${String(t.carriersUntilAbsoluteFrame)})`);
  }
  /** anchors must be resolvable finite world points */
  for (const [name, a] of [["sourceAnchor", t.sourceAnchor], ["destinationAnchor", t.destinationAnchor]] as const) {
    if (!a) { p.push(`transition '${t.transitionId}' has no ${name}`); continue; }
    for (const k of ["x", "y", "z"] as const) {
      if (!Number.isFinite(a[k])) p.push(`transition '${t.transitionId}' ${name}.${k} is not finite (${String(a[k])})`);
    }
  }
  /** ⚠ THE INERT-MECHANISM RULE: a transition the runtime cannot execute must not compile. */
  if (!opts.hasRuntimeConsumer(t.transitionMethod)) {
    p.push(`transition '${t.transitionId}' uses method '${t.transitionMethod}' which has NO executable runtime consumer — a declared transition that nothing performs would be inert`);
  }
  return p;
}

/** linear progress through a transition for a SHOT-RELATIVE frame, clamped, with an explicit end state */
export interface TransitionProgress { phase: "before" | "running" | "after"; t: number; frameInShot: number }
export function transitionProgressAt(t: VisualModeTransitionIntent, frameInShot: number): TransitionProgress {
  if (!Number.isFinite(frameInShot)) throw new ModeTransitionError(`transition '${t.transitionId}' asked for a non-finite frame (${String(frameInShot)})`);
  if (frameInShot < t.startFrame) return { phase: "before", t: 0, frameInShot };
  if (frameInShot >= t.endFrame) return { phase: "after", t: 1, frameInShot };
  return { phase: "running", t: (frameInShot - t.startFrame) / (t.endFrame - t.startFrame), frameInShot };
}
