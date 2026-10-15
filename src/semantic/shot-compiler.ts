/**
 * SHOT COMPILER — the Director plan is the authoritative source of film execution.
 *
 * ⚠ WHY THIS EXISTS. Phase 3.3's closeout identified the highest-priority architectural debt:
 *
 * > **THE PLANNING MODEL IS NOT ACTUALLY ENFORCED BY THE FILM RENDER PATH.**
 *
 * A film could contain a bare `cam:(u)=>...`, manual effect onset and manual timing **without passing through
 * `ShotIntent`, `CameraIntent`, `CausalTimingGrammar` or `CameraMotivation` validation.** The audit confirmed
 * it: S4's camera existed only as a function, `validateCameraIntent` **was never called**, and the label was
 * wrong. The Director system could describe correct rules while the renderer silently bypassed them.
 *
 * **Seven scripts independently reconstructed `EFFECT_ONSET` from `REACH_READABLE_PROGRESS x
 * CAUSAL_HOLD_RATIO`.** That duplication is precisely how the `NaN` causal-timing defect reached a film: one
 * of those seven sites destructured the constant from the wrong module, `EFFECT_ONSET` became `NaN`, and
 * `x < NaN` is **false at every frame** — silently.
 *
 * ## The contract
 *
 * ```
 * ShotIntent -> validateShotIntent -> compileShotIntent -> CompiledShotSpec -> renderShot
 * ```
 *
 * **A render does not start from an unvalidated partial object. If compilation fails, the render fails.**
 * No default is silently inserted, because a silently inserted default changes directorial meaning.
 */

import {
  type ShotIntent, type CameraIntent, type CompositionRelation,
  type PhysicalMotionKind, type AsciiExpressionKind, type CameraMoveKind, type CameraMotivationKind,
  type MotionComposition, validateShotIntent, explainShot, type DirectorDecisionRecord,
} from "./motion.js";
import { validateVisualIntent, validateLayerTiming, type VisualLayerIntent } from "../v4/layers.js";
import { validateModeTransition, TRANSITION_METHODS, KNOWN_OBJECTS, type VisualModeTransitionIntent, type TransitionMethod } from "../v4/mode-transition.js";
import { validateTypographyComposition, type TypographyCompositionIntent } from "../v4/typography-composition.js";

// ---------------------------------------------------------------------------
// world state
// ---------------------------------------------------------------------------

/**
 * WORLD STATE — cumulative, and **owned by the sequence compiler, not by each shot.**
 *
 * The 3.3G continuity defects were both of this kind: `frag` ran backwards at a cut (the NAME un-broke) and
 * `decay` ran backwards (the ROOM partially returned). Neither was visible in any per-shot validator, because
 * each shot was individually legal. **A shot may not recreate world state from defaults.**
 */
export interface WorldState {
  personState: string;
  nameState: string;
  roomState: string;
  /** numeric world progress, so continuity is checkable and not merely described */
  nameProgress: number;
  roomProgress: number;
}

/** A sequence declares its shots in order, each with the state it ENTERS carrying. */
export interface PlannedShot {
  id: string;
  intent: ShotIntent;
  frameStart: number;
  frameEnd: number;
  /** the state this shot must enter in — asserted against the previous shot's exit */
  entersIn: WorldState;
  /** the state this shot leaves */
  exitsIn: WorldState;
  /** the world-state progression this shot is responsible for, as shot progress */
  worldAdvance?: { nameTo?: number; roomTo?: number };
  /** resolved causal timing, if this shot carries a causal pair */
  causal?: CausalPair;
  /** an explicit, justified exception to continuity — any use must be recorded */
  continuityException?: string;
}

/** A causal pair: the cause's landmark and the derived effect onset. **One owner.** */
export interface CausalPair {
  /** the cause event's name — scoped, because the hold ratio is only validated for one pair */
  cause: string;
  effect: string;
  causeStart: number;
  causeReadable: number;
  holdRatio: number;
  effectOnset: number;
  /** the ratio's scope, carried so a consumer cannot mistake it for a universal constant */
  validationScope: string;
  /**
   * ⚠ THE TIMEBASE. **Required**, because inferring it implicitly is what produced the 3.3J disagreement.
   *
   * A causal relation's progress is measured over the CAUSE — `action-local(REACH)`. A shot span contains
   * unrelated dead time and therefore is NOT a valid basis for causal progress.
   */
  domain: TimingDomain;
}

// ---------------------------------------------------------------------------
// the compiled spec
// ---------------------------------------------------------------------------

export interface CompiledShotSpec {
  shotId: string;
  frameStart: number;
  frameEnd: number;
  semanticEvent: string;
  dramaticIntention: string;
  expectedAudienceReading: string;
  primaryAttention: string;
  /** SEMANTIC PROVENANCE — `ORIENT_TOWARD(NAME)`, not merely a resolved yaw */
  target: { id: string; relations: string[]; world?: { x: number; y: number; z: number } };
  performance: { physical: PhysicalMotionKind; semantic: string[] };
  compositionRelation: CompositionRelation;
  expression: { kind: AsciiExpressionKind; semantic: string };
  causalTiming?: { cause: string; effect: string; causeReadableFrame: number; effectOnsetFrame: number; holdRatio: number; validationScope: string; domain: string };
  camera: { move: CameraMoveKind; motivation: CameraMotivationKind; event?: string; beginsAtFrame?: number; reason: string };
  startWorldState: WorldState;
  endWorldState: WorldState;
  continuityRequirements: string[];
  decisionRecord: DirectorDecisionRecord;
  /**
   * THE COMPILED LAYER CONTRACT.
   *
   * ⚠ This is what makes the representation intent **reach the runtime**: the compositor consumes
   * `spec.layers`, not the plan's prose. Each layer carries its validated mode, material, priority, visibility
   * and mask, so a layer can be traced from the Director Plan to the final pixel.
   */
  layers?: import("../v4/layers.js").VisualLayerIntent[];
  /**
   * THE COMPILED VISUAL MODE TRANSITIONS.
   *
   * ⚠ This is what makes a representation change reach the runtime: the renderer consumes `spec.modeTransitions`,
   * **so the render script cannot invent transition timing.**
   */
  modeTransitions?: VisualModeTransitionIntent[];
  /**
   * THE COMPILED TYPOGRAPHY COMPOSITION CONTRACT — what the runtime consumes for word placement and scale.
   */
  typographyComposition?: TypographyCompositionIntent;
  /** the composite's graphic intention, carried through for review */
  compositionNote?: string;
}

/**
 * CONSUMPTION LEDGER — did an intent actually reach a consumer?
 *
 * ⚠ THIS TARGETS THE PROJECT'S MOST TRANSFERABLE FAILURE CLASS: **six defects where a value was written but
 * never reached its consumer, while the code read as though it did.**
 *
 * The ledger is deliberately **not a generic framework.** It records, for the four critical semantic paths,
 * whether the runtime reported consuming what the compiler produced. **A value written and never consumed
 * becomes detectable instead of invisible.**
 */
export interface ConsumptionLedger {
  cameraIntent: { compiled: boolean; consumer?: string; consumed: boolean };
  causalTiming: { compiled: boolean; consumer?: string; consumed: boolean };
  targetAnchor: { compiled: boolean; consumer?: string; consumed: boolean };
  asciiExpression: { compiled: boolean; consumer?: string; consumed: boolean };
}

export function emptyLedger(): ConsumptionLedger {
  return {
    cameraIntent: { compiled: false, consumed: false },
    causalTiming: { compiled: false, consumed: false },
    targetAnchor: { compiled: false, consumed: false },
    asciiExpression: { compiled: false, consumed: false },
  };
}

/** Record that a consumer reported using a compiled intent. */
export function recordConsumption(l: ConsumptionLedger, k: keyof ConsumptionLedger, consumer: string): void {
  l[k].consumer = consumer;
  l[k].consumed = true;
}

/** Paths that were compiled but never consumed. **Non-empty means an inert mechanism.** */
export function inertPaths(l: ConsumptionLedger): string[] {
  return (Object.keys(l) as (keyof ConsumptionLedger)[]).filter((k) => l[k].compiled && !l[k].consumed);
}

// ---------------------------------------------------------------------------
// finite assertions
// ---------------------------------------------------------------------------

export class CompileError extends Error {
  constructor(message: string, public readonly context: Record<string, unknown> = {}) {
    super(message);
    this.name = "CompileError";
  }
}

/**
 * ASSERT EVERY EXECUTABLE NUMBER IS FINITE.
 *
 * The `x < NaN` failure must become impossible to silently execute. **`NaN` does not throw; it propagates**,
 * and a comparison against it is silently `false`. So a non-finite executable value is a **hard failure with
 * its path named**, not a warning.
 */
export function assertFinite(values: Record<string, unknown>, where: string): void {
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === "number" && !Number.isFinite(v)) {
      throw new CompileError(`${where}: '${k}' is not finite (${v}) — a non-finite executable value cannot be rendered`, { where, field: k, value: v });
    }
    if (v === undefined) {
      throw new CompileError(`${where}: '${k}' is undefined — a required executable value was never resolved`, { where, field: k });
    }
  }
}

/** Recursively find every number in an object, so nothing executable escapes the finite check. */
export function collectNumbers(o: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (typeof o === "number" || o === undefined || o === null) { if (prefix) out[prefix] = o; return out; }
  if (Array.isArray(o)) { o.forEach((v, i) => collectNumbers(v, `${prefix}[${i}]`, out)); return out; }
  if (typeof o === "object") { for (const [k, v] of Object.entries(o as Record<string, unknown>)) collectNumbers(v, prefix ? `${prefix}.${k}` : k, out); return out; }
  return out;
}

// ---------------------------------------------------------------------------
// the compiler
// ---------------------------------------------------------------------------

/**
 * Compile ONE shot. **Throws on invalid input — there is no partial success.**
 *
 * The order matters: the shot is validated *as a shot*, then the camera *against its referenced event*, then
 * the causal pair is **resolved once**, then every executable number is checked.
 */
export function compileShotIntent(s: PlannedShot, opts: { fps: number } = { fps: 30 }): CompiledShotSpec {
  const problems = validateShotIntent(s.intent);
  if (problems.length) {
    throw new CompileError(`shot '${s.id}' failed validation: ${problems.join("; ")}`, { shot: s.id, problems });
  }
  if (s.frameEnd <= s.frameStart) throw new CompileError(`shot '${s.id}' has frameEnd <= frameStart`, { shot: s.id });
  /**
   * ⚠ THE FIRST VERSION OF THIS CHECK REPORTED "non-integer frame bounds" FOR AN **UNDEFINED** BOUND.
   *
   * A caller passed `{start, end}` where the contract requires `{frameStart, frameEnd}`. `Number.isInteger(undefined)`
   * is `false`, so the error fired — **naming the wrong cause**, which sent the investigation looking for a
   * rounding bug in frame arithmetic instead of a key mismatch at the call site.
   *
   * A diagnostic that names the wrong cause is worse than no diagnostic. Absence and non-integrality are
   * different failures and are now reported as such.
   */
  for (const [k, v] of [["frameStart", s.frameStart], ["frameEnd", s.frameEnd]] as const) {
    if (v === undefined || v === null) throw new CompileError(`shot '${s.id}' has no '${k}' — the shot declares its bounds under a different key`, { shot: s.id, missing: k, supplied: Object.keys(s) });
    if (typeof v !== "number" || !Number.isFinite(v)) throw new CompileError(`shot '${s.id}': '${k}' is not a finite number (${v})`, { shot: s.id, field: k, value: v });
    if (!Number.isInteger(v)) throw new CompileError(`shot '${s.id}': '${k}' is not an integer (${v})`, { shot: s.id, field: k, value: v });
  }

  /** the camera: if it moves, an intent must exist and must name its event */
  if (s.intent.camera.move !== "none" && !s.intent.camera.respondsTo) {
    throw new CompileError(`shot '${s.id}' moves the camera with no referenced event — a moving camera must declare CameraIntent.respondsTo`, { shot: s.id });
  }

  const span = s.frameEnd - s.frameStart;
  /** resolve the causal pair ONCE — the renderer consumes these frames and never re-derives them */
  let causalTiming: CompiledShotSpec["causalTiming"];
  if (s.causal) {
    const c = s.causal;
    /**
     * ⚠ A MISSING TIMING DOMAIN MUST BE A NAMED COMPILE ERROR, NOT A `TypeError`.
     *
     * The first version passed `undefined` into `resolveFrame`, which threw
     * `TypeError: Cannot read properties of undefined (reading 'kind')` — a crash that names neither the shot
     * nor the missing field. **The domain is the thing whose absence caused the 3.3J disagreement, so its
     * absence must be reported as exactly that.**
     */
    if (!c.domain || typeof c.domain.kind !== "string") {
      throw new CompileError(`shot '${s.id}': the causal pair declares no timing domain — causal progress must be expressed over the CAUSE (e.g. action-local(REACH)), never over the shot span`, { shot: s.id, cause: c.cause });
    }
    assertFinite({ causeStart: c.causeStart, causeReadable: c.causeReadable, holdRatio: c.holdRatio, effectOnset: c.effectOnset }, `shot '${s.id}' causal`);
    if (!(c.effectOnset >= c.causeReadable)) {
      throw new CompileError(`shot '${s.id}': effect onset ${c.effectOnset} precedes the cause's readable landmark ${c.causeReadable}`, { shot: s.id });
    }
    /**
     * ⚠ RESOLVED THROUGH THE DECLARED DOMAIN, NOT THE SHOT SPAN.
     *
     * The first version used `s.frameStart + Math.round(progress * span)` unconditionally, which is the
     * `shot-local` basis — and that is what disagreed with the frozen film by 57 frames. The domain is now
     * required on the pair so the basis cannot be inferred wrongly.
     */
    const rctx = { frameStart: s.frameStart, frameEnd: s.frameEnd };
    causalTiming = {
      cause: c.cause, effect: c.effect,
      causeReadableFrame: resolveFrame(c.domain, c.causeReadable, rctx),
      effectOnsetFrame: resolveFrame(c.domain, c.effectOnset, rctx),
      holdRatio: c.holdRatio,
      validationScope: c.validationScope,
      domain: describeDomain(c.domain),
    };
  }

  const cameraBeginsAtFrame = s.intent.camera.beginsAt !== undefined
    ? s.frameStart + Math.round(s.intent.camera.beginsAt * span)
    : undefined;

  /** SEMANTIC PROVENANCE — the relation survives compilation, so an audit can prove WHY a value exists */
  const targetId = s.intent.primaryAttention?.from === "expression" || s.intent.secondaryAttention?.from === "expression"
    ? (s.intent.secondaryAttention?.target ?? "target") : (s.intent.primaryAttention?.target ?? "target");
  const relations: string[] = [];
  if (s.intent.motion.primary.kind !== "none") relations.push(`${String(s.intent.motion.primary.kind).toUpperCase()}_TOWARD(${targetId})`);

  const spec: CompiledShotSpec = {
    shotId: s.id,
    frameStart: s.frameStart,
    frameEnd: s.frameEnd,
    semanticEvent: s.intent.semanticEvent,
    dramaticIntention: s.intent.dramaticIntention,
    expectedAudienceReading: s.intent.expectedAudienceReading,
    primaryAttention: s.intent.primaryAttention?.target ?? "(none)",
    target: { id: targetId, relations },
    performance: { physical: s.intent.motion.primary.kind, semantic: relations },
    compositionRelation: s.intent.relation,
    expression: { kind: s.intent.motion.secondary.kind, semantic: s.intent.motion.secondary.reason },
    causalTiming,
    camera: {
      move: s.intent.camera.move,
      motivation: s.intent.camera.motivation,
      event: s.intent.camera.respondsTo?.event,
      beginsAtFrame: cameraBeginsAtFrame,
      reason: s.intent.camera.reason,
    },
    startWorldState: s.entersIn,
    endWorldState: s.exitsIn,
    continuityRequirements: [],
    decisionRecord: explainShot(s.intent),
  };

  /**
   * ⚠ THE COMPILER CONSUMES THE REPRESENTATION INTENT.
   *
   * A declared-but-invalid layer set is REFUSED here rather than reaching the compositor, so an inert mask — one
   * that names no subject, or names a subject no layer draws — can never be rendered. When no intent is declared
   * the legacy single-material path is used exactly as before.
   */
  if (s.intent.visual) {
    const problems = validateVisualIntent(s.intent.visual);
    /**
     * ⚠ TIMING IS VALIDATED HERE, so an impossible interval can never reach the compositor.
     *
     * A NEGATIVE_SPACE_MASK **requires** timing: a mask with no window would clear unconditionally for the whole
     * shot, which is exactly the unconditioned behaviour this round removes.
     */
    for (const l of s.intent.visual.layers) {
      problems.push(...validateLayerTiming(l.timing, { layerId: l.layerId, required: l.layerId === "NEGATIVE_SPACE_MASK" }));
    }
    if (problems.length) {
      throw new CompileError(`shot '${s.id}' visual representation intent is invalid: ${problems.join("; ")}`, { shot: s.id, problems });
    }
    const layers: VisualLayerIntent[] = s.intent.visual.layers.map((l) => ({
      ...l,
      clearsSubjects: l.clearsSubjects ? [...l.clearsSubjects] : undefined,
    }));
    /** the compiled contract is what the compositor consumes — not the plan prose */
    spec.layers = layers;
    spec.compositionNote = s.intent.visual.compositionNote;
  }

  /**
   * ⚠ THE COMPILER VALIDATES AND PRESERVES VISUAL MODE TRANSITIONS.
   *
   * The runtime consumer is declared HERE, by the compiler, because only the compiler knows which methods the
   * runtime actually implements. **A transition whose method has no consumer is refused**, which is the
   * inert-mechanism rule applied to representation changes.
   */
  const declared = s.intent.modeTransitions ?? [];
  /**
   * ⚠ A CONTINUATION MUST NAME A TRANSITION THAT EXISTS. A dangling `continuesTransitionId` would silently
   * create a second fragment population, which is exactly the defect this field exists to prevent.
   */
  if (declared.length) {
    const hasConsumer = (m: TransitionMethod) => (TRANSITION_METHODS as readonly string[]).includes(m);
    const objectExists = (id: string) => (KNOWN_OBJECTS as readonly string[]).includes(id) || id === s.id;
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const t of declared) {
      if (seen.has(t.transitionId)) problems.push(`visual mode transition '${t.transitionId}' is declared more than once in shot '${s.id}'`);
      seen.add(t.transitionId);
      problems.push(...validateModeTransition(t, { hasRuntimeConsumer: hasConsumer, objectExists }));
      /** the transition must fit inside its own shot, or the runtime could never reach its end */
      const span = s.frameEnd - s.frameStart + 1;
      if (Number.isFinite(t.endFrame) && t.endFrame > span) {
        problems.push(`transition '${t.transitionId}' ends at shot frame ${t.endFrame} but shot '${s.id}' is only ${span} frames long, so its end could never be reached`);
      }
    }
    if (problems.length) {
      throw new CompileError(`shot '${s.id}' visual mode transition is invalid: ${problems.join("; ")}`, { shot: s.id, problems });
    }
    spec.modeTransitions = declared.map((t) => ({ ...t, sourceAnchor: { ...t.sourceAnchor }, destinationAnchor: { ...t.destinationAnchor } }));
  }

  /**
   * ⚠ THE COMPILER VALIDATES AND PRESERVES THE TYPOGRAPHY COMPOSITION.
   *
   * The anchor resolver is supplied BY THE COMPILER because only it knows which anchors the performance can
   * produce; a plan cannot protect an anchor that the runtime could never resolve. **A declared composition that
   * the runtime cannot execute is refused here rather than silently ignored.**
   */
  if (s.intent.typographyComposition) {
    const c = s.intent.typographyComposition;
    const span = s.frameEnd - s.frameStart + 1;
    /** anchors the performance actually produces in this shot */
    const available = new Set<string>(["head", "torso", "hand", "leftFoot", "rightFoot", "floor"]);
    const problems = validateTypographyComposition(c, {
      objectExists: (id) => (KNOWN_OBJECTS as readonly string[]).includes(id) || id === s.id,
      shotSpan: span,
      anchorResolvable: (subjectId, anchorId) => available.has(anchorId) && subjectId === "PERSON",
    });
    if (problems.length) {
      throw new CompileError(`shot '${s.id}' typography composition is invalid: ${problems.join("; ")}`, { shot: s.id, problems });
    }
    spec.typographyComposition = {
      ...c,
      screenRegion: { ...c.screenRegion },
      readabilityInterval: { ...c.readabilityInterval, occupancy: { ...c.readabilityInterval.occupancy } },
      protectedSubjectAnchors: c.protectedSubjectAnchors.map((a) => ({ ...a })),
    };
  }

  /** FINITE GATE — every executable number, including nested ones, before the renderer sees it */
  const nums = collectNumbers({
    frameStart: spec.frameStart, frameEnd: spec.frameEnd,
    cameraBeginsAtFrame: spec.camera.beginsAtFrame,
    causeReadableFrame: spec.causalTiming?.causeReadableFrame,
    effectOnsetFrame: spec.causalTiming?.effectOnsetFrame,
    nameProgressStart: s.entersIn.nameProgress, nameProgressEnd: s.exitsIn.nameProgress,
    roomProgressStart: s.entersIn.roomProgress, roomProgressEnd: s.exitsIn.roomProgress,
    targetX: s.intent.motion.primary.progress, secondaryProgress: s.intent.motion.secondary.progress,
  }, `shot '${s.id}'`);
  for (const [k, v] of Object.entries(nums)) {
    if (typeof v === "number" && !Number.isFinite(v)) {
      throw new CompileError(`shot '${s.id}': executable value '${k}' is not finite (${v})`, { shot: s.id, field: k });
    }
  }
  return spec;
}

// ---------------------------------------------------------------------------
// sequence compilation
// ---------------------------------------------------------------------------

export interface CompiledSequence {
  shots: CompiledShotSpec[];
  cameraIntent: ConsumptionLedger;
  fps: number;
  totalFrames: number;
}

/**
 * Compile a SEQUENCE. **World-state continuity is checked here, not per shot.**
 *
 * `endWorldState(Sn)` must equal `startWorldState(Sn+1)` — with an explicit, recorded exception being the only
 * way past. This is the check that would have caught both 3.3G continuity defects, which were invisible to
 * every per-shot validator because each shot was individually legal.
 */
export function compileSequence(planned: PlannedShot[], opts: { fps: number } = { fps: 30 }): CompiledSequence {
  const shots: CompiledShotSpec[] = [];
  const ledger = emptyLedger();
  /**
   * ⚠ CONTINUATIONS ARE A SEQUENCE-LEVEL PROPERTY, so they are validated HERE rather than inside a shot.
   *
   * A continuation names a transition that lives in an EARLIER shot, which a single shot cannot know about. The
   * first version put the check inside `compileShotIntent` and it refused every legitimate continuation. **The
   * rule belongs to whoever can see both ends.**
   *
   * The audit enforces two things: every `continuesTransitionId` resolves to a transition that exists somewhere
   * in the sequence, and **no semantic object is fragmented twice** — a second `resolveFragments` for the same
   * object would create a parallel population and break carrier identity.
   */
  const declaredIds = new Map<string, { shotId: string; obj: string; resolvesFragments: boolean }>();
  for (const ps of planned) {
    for (const t of ps.intent.modeTransitions ?? []) {
      declaredIds.set(t.transitionId, { shotId: ps.id, obj: t.sourceObjectId, resolvesFragments: !t.continuesTransitionId });
    }
  }
  for (const ps of planned) {
    for (const t of ps.intent.modeTransitions ?? []) {
      if (!t.continuesTransitionId) continue;
      const origin = declaredIds.get(t.continuesTransitionId);
      if (!origin) {
        throw new CompileError(`shot '${ps.id}': transition '${t.transitionId}' continues '${t.continuesTransitionId}', which no shot in the sequence declares`, { shot: ps.id, transition: t.transitionId });
      }
      if (origin.obj !== t.sourceObjectId) {
        throw new CompileError(`shot '${ps.id}': transition '${t.transitionId}' continues a transition of object '${origin.obj}' but claims source object '${t.sourceObjectId}'`, { shot: ps.id });
      }
    }
  }
  /**
   * ⚠ ONE AUTHORITATIVE CHAIN PER OBJECT — and a CHAIN is not the same as one transition.
   *
   * `NAME` legitimately changes representation twice: `SCENE_ASCII -> TYPOGRAPHIC_GRAPHIC -> GLYPH_FIELD`. The
   * first version of this audit counted transitions and refused that, which was wrong: **two links that are
   * explicitly chained through `continuesTransitionId` are one event, and two links that are not are two
   * competing mechanisms.**
   *
   * A transition is a chain HEAD when nothing continues it, and is CONTINUING when it names a predecessor. The
   * object is fragmented twice only if it has more than one head — and only heads birth carriers.
   */
  const headsByObject = new Map<string, string[]>();
  const continuedIds = new Set<string>();
  for (const [, info] of declaredIds) {
    if (!info.resolvesFragments) continue;
    /** it births carriers; is it continued by anyone? */
  }
  for (const ps of planned) {
    for (const t of ps.intent.modeTransitions ?? []) {
      if (t.continuesTransitionId) continuedIds.add(t.continuesTransitionId);
    }
  }
  for (const [id, info] of declaredIds) {
    if (!info.resolvesFragments) continue;
    if (continuedIds.has(id)) continue;   // it is continued: part of a chain, not a competing head
    const list = headsByObject.get(info.obj) ?? [];
    list.push(id);
    headsByObject.set(info.obj, list);
  }
  for (const [obj, ids] of headsByObject) {
    if (ids.length > 1) {
      throw new CompileError(`semantic object '${obj}' has ${ids.length} INDEPENDENT fragmentation chains (${ids.join(", ")}) — the object must have exactly one authoritative chain`, { object: obj, chains: ids });
    }
  }


  /**
   * ⚠ THE SHOT COMPILATION LOOP, AND THE CONTINUITY GATE IT CARRIES.
   *
   * Every shot is compiled through `compileShotIntent`, which is the ONLY producer of a `CompiledShotSpec`, so the
   * plan cannot bypass validation. Between shots, the WORLD STATE is checked: a shot must enter in the state the
   * previous shot left, unless the plan records an explicit `continuityException` — the rule that exists because a
   * defect once let the NAME run BACKWARDS across a cut (an intact word appearing after a broken one).
   */
  for (let i = 0; i < planned.length; i++) {
    const s = planned[i]!;
    if (i > 0) {
      const prev = planned[i - 1]!;
      /**
       * A declared `continuityException` bypasses EVERY continuity check, including the numeric progression ones.
       * An exception that only half applies is worse than none, because the plan says the break is intentional.
       */
      if (!s.continuityException) {
        for (const k of ["personState", "nameState", "roomState"] as const) {
          if (prev.exitsIn[k] !== s.entersIn[k]) {
            throw new CompileError(
              `cut ${prev.id} -> ${s.id}: ${k} changes across the cut without a motivation (leaves as '${prev.exitsIn[k]}', enters as '${s.entersIn[k]}')`,
              { shot: s.id, field: k },
            );
          }
        }
        /** MONOTONIC PROGRESSION — the NAME and the ROOM may not un-break or re-fill across a cut */
        if (s.entersIn.nameProgress < prev.exitsIn.nameProgress) {
          throw new CompileError(
            `cut ${prev.id} -> ${s.id}: nameProgress runs BACKWARDS (${prev.exitsIn.nameProgress} -> ${s.entersIn.nameProgress}); the word would re-assemble`,
            { shot: s.id, field: "nameProgress" },
          );
        }
        if (s.entersIn.roomProgress < prev.exitsIn.roomProgress) {
          throw new CompileError(
            `cut ${prev.id} -> ${s.id}: roomProgress runs BACKWARDS (${prev.exitsIn.roomProgress} -> ${s.entersIn.roomProgress})`,
            { shot: s.id, field: "roomProgress" },
          );
        }
        if (s.frameStart !== prev.frameEnd + 1) {
          throw new CompileError(
            `cut ${prev.id} -> ${s.id}: frames are not contiguous (previous ends at ${prev.frameEnd}, this begins at ${s.frameStart})`,
            { shot: s.id, field: "frameStart" },
          );
        }
      }
    }
    const spec = compileShotIntent(s, opts);
    shots.push(spec);
  }

  {
    const endById = new Map<string, number>();
    const allT: VisualModeTransitionIntent[] = [];
    for (const sp of shots) for (const t of sp.modeTransitions ?? []) { endById.set(t.transitionId, sp.frameStart + t.endFrame); allT.push(t); }

    /**
     * ⚠ THE LIFETIME IS RESOLVED BY EACH LINK'S OWN **SUCCESSORS**, NOT BY WALKING DOWN FROM A HEAD.
     *
     * The first version built a `children` map keyed by `continuesTransitionId` and walked from each head. It
     * produced chains of ONE link and left `graphic-to-field` — **the link that actually births the carriers** —
     * with no lifetime at all. The cause is a modelling detail that is easy to miss: `scene-to-graphic` does not
     * declare a continuation, so it is a head, but `graphic-to-field` declares none either and therefore has **no
     * inbound continuation edge**; the graph is joined only in the FORWARD direction.
     *
     * So the chain is walked FORWARD from whichever link we are asking about: follow `continuesTransitionId`
     * links until none remain, and take the furthest end frame. That gives every link the same chain lifetime —
     * including the middle one — which is what closes the 285..290 hole.
     */
    const childrenOf = new Map<string, string[]>();
    for (const t of allT) {
      if (!t.continuesTransitionId) continue;
      const list = childrenOf.get(t.continuesTransitionId) ?? [];
      list.push(t.transitionId);
      childrenOf.set(t.continuesTransitionId, list);
    }
    const resolved = new Map<string, number>();
    const walk = (id: string, seen: Set<string>): number => {
      const memo = resolved.get(id);
      if (memo !== undefined) return memo;
      if (seen.has(id)) return endById.get(id) ?? -Infinity;
      seen.add(id);
      let end = endById.get(id) ?? -Infinity;
      for (const kid of childrenOf.get(id) ?? []) end = Math.max(end, walk(kid, seen));
      resolved.set(id, end);
      return end;
    };
    for (const t of allT) {
      const end = walk(t.transitionId, new Set());
      if (Number.isFinite(end)) t.carriersUntilAbsoluteFrame = end;
    }
  }

  const totalFrames = shots.length ? shots[shots.length - 1]!.frameEnd + 1 : 0;
  return { shots, cameraIntent: ledger, fps: opts.fps, totalFrames };
}

/**
 * RENDER GUARD — the renderer must call this before drawing.
 *
 * **A production render must not start from a bare object.** If a caller has an un-compiled shot, this
 * refuses it, which is the difference between *"the Director system describes rules"* and *"the rules are
 * enforced."*
 */
export function guardRenderable(x: unknown): asserts x is CompiledShotSpec {
  if (!x || typeof x !== "object") throw new CompileError("render refused: no compiled shot was supplied");
  const s = x as Partial<CompiledShotSpec>;
  if (typeof s.shotId !== "string" || !s.decisionRecord || !s.camera || !s.startWorldState) {
    throw new CompileError("render refused: the supplied object is not a CompiledShotSpec — production renders must consume a compiled, validated plan");
  }
  if (s.causalTiming) {
    assertFinite({ causeReadableFrame: s.causalTiming.causeReadableFrame, effectOnsetFrame: s.causalTiming.effectOnsetFrame }, `shot '${s.shotId}' causal at render`);
  }
  if (s.camera.move !== "none") {
    assertFinite({ beginsAtFrame: s.camera.beginsAtFrame, motivation: 1 }, `shot '${s.shotId}' camera at render`);
    if (!s.camera.event) throw new CompileError(`render refused: shot '${s.shotId}' moves the camera but names no event`);
  }
}

// ---------------------------------------------------------------------------
// TIMING DOMAINS — an explicit timebase for progress values
// ---------------------------------------------------------------------------

/**
 * ⚠ THE ROOT CAUSE OF THE 3.3J COMPATIBILITY DISAGREEMENT.
 *
 * The compiler resolved a causal landmark as `frameStart + progress * SHOT_SPAN`. The frozen V2 film resolved
 * it against the **REACH action's own window**. For S2 those gave **157/189** and **238/246** — a 57-frame
 * disagreement derived from the same declared pair.
 *
 * Traced to the exact frame:
 *
 * | basis | cause readable | effect onset |
 * |---|---|---|
 * | **shot span** (189 frames) | 158 | 189 |
 * | **action window** (72 frames) | 233 | **246** |
 * | **what the film actually did** | 238 | **246** |
 *
 * **The film was semantically right and the compiler was wrong.** A shot span contains **unrelated dead time**
 * — 117 frames in S2 during which no part of the causal pair is active — so progress measured over it is not
 * progress through the cause. The reach's own progress curve makes 238 and 246 the frames at which the smooth
 * curve crosses 0.3262 and 0.4946.
 *
 * **A causal relation's progress must be expressed over the CAUSE.**
 */
export type TimingDomain =
  | { kind: "shot-local" }
  | { kind: "action-local"; action: string; startFrame: number; endFrame: number }
  | { kind: "expression-local"; expression: string; startFrame: number; endFrame: number }
  | { kind: "sequence-local" };

/** Resolve a 0..1 progress to an absolute frame **within the declared domain**. */
export function resolveFrame(domain: TimingDomain, progress: number, ctx: { frameStart: number; frameEnd: number; sequenceFrameStart?: number }): number {
  assertFinite({ progress }, "resolveFrame");
  const spanOf = (a: number, b: number) => Math.max(0, b - a);
  switch (domain.kind) {
    case "shot-local": {
      const span = spanOf(ctx.frameStart, ctx.frameEnd);
      return ctx.frameStart + Math.round(progress * span);
    }
    case "action-local":
    case "expression-local": {
      const span = spanOf(domain.startFrame, domain.endFrame);
      return domain.startFrame + Math.round(progress * span);
    }
    case "sequence-local":
      return (ctx.sequenceFrameStart ?? 0) + Math.round(progress * spanOf(ctx.frameStart, ctx.frameEnd));
  }
}

/** Describe a domain, for the trace. */
export function describeDomain(d: TimingDomain): string {
  switch (d.kind) {
    case "shot-local": return "shot-local";
    case "sequence-local": return "sequence-local";
    case "action-local": return `action-local(${d.action} ${d.startFrame}..${d.endFrame})`;
    case "expression-local": return `expression-local(${d.expression} ${d.startFrame}..${d.endFrame})`;
  }
}
