/**
 * ASCII MOTION GRAMMAR — motion expressed AS characters, not as a transform of a rendered image.
 *
 * THE FAILURE THIS RESPONDS TO. Phase 3.3B's camera push passed every machine check and the external
 * review still found that **it does not feel like ASCII animation** — it reads as *"a static ASCII-styled
 * image plus a camera push."* The renderer was not at fault. **The motion language was absent.**
 *
 * The distinction that matters:
 *
 *     WRONG   semantic form -> rasterise -> transform the raster
 *     RIGHT   semantic form -> motion intent -> ASCII MOTION GRAMMAR -> rasterise
 *
 * Everything here operates on the **glyph field before the final raster**. Nothing animates pixels.
 *
 * ## The primitives
 *
 * | primitive | what it does | why it is ASCII-native |
 * |---|---|---|
 * | **CONTOUR MIGRATION** | silhouette cells migrate coherently; a boundary that MOVES | the contour is one object, not many cells blinking |
 * | **GLYPH SUBSTITUTION** | motion state selects the character | the medium's brightness IS the glyph |
 * | **DENSITY FLOW** | density travels through a form: compression -> release -> trail | a field can carry direction as variation |
 * | **DIRECTIONAL FLOW** | orientation responds to motion direction | orientation is what a line-oriented medium does best |
 * | **TRAIL / DECAY** | a short-lived semantic residue, strongest first | **a character trail, not motion blur** |
 * | **ASSEMBLE / DISASSEMBLE** | a form emerges from or dissolves into the field | impossible in conventional vector animation |
 * | **LOCAL FIELD RESPONSE** | nearby field reacts to a moving object | restrained: displacement, compression, parting |
 */

/**
 * MOTION INTENT — a typed declaration, so the renderer never infers artistic motion from frame numbers.
 */
export const MOTION_INTENTS = [
  "translate", "gesture", "assemble", "disassemble", "erase",
  "fragment", "expand", "contract", "flow", "dissolve",
] as const;
export type MotionIntentKind = (typeof MOTION_INTENTS)[number];

export interface MotionIntent {
  kind: MotionIntentKind;
  /** why the director chose it, in the director's own words */
  reason: string;
  /** the motion's own progress, 0..1, supplied by whatever drives the motion — NOT derived from a frame index */
  progress: number;
}

/** The density ladder, lightest to heaviest. Used wherever a glyph must express *amount*. */
export const DENSITY_LADDER = " .':-+*#@" as const;

/** Orientation glyphs by direction — the medium's own vocabulary for a moving edge. */
export const FLOW_GLYPHS = {
  horizontal: ["-", "=", ">"],
  vertical: ["|", "!", ":"],
  diagRise: ["/"],
  diagFall: ["\\"],
} as const;

// ---------------------------------------------------------------------------
// the field the grammar operates on
// ---------------------------------------------------------------------------

/**
 * A motion-space glyph cell.
 *
 * `weight` is the semantic amount this cell carries, 0..1, and `intent` records WHICH primitive last
 * wrote it. The intent tag is what makes §10's requirement checkable: every changed cell can be attributed
 * to a rule rather than to noise.
 */
export interface MotionCell {
  ch: string;
  weight: number;
  /** which grammar primitive produced the current value */
  source: MotionSource;
  /** 0 = static, higher = more recent motion influence; used for trail decay */
  freshness: number;
}

export type MotionSource =
  | "none" | "form" | "contour" | "substitution"
  | "density" | "direction" | "trail" | "response";

export interface MotionField {
  cols: number;
  rows: number;
  cells: MotionCell[];
  /** how many cells each primitive has written this frame — the attribution record */
  attribution: Record<MotionSource, number>;
}

export function createField(cols: number, rows: number): MotionField {
  return {
    cols, rows,
    cells: Array.from({ length: cols * rows }, () => ({ ch: " ", weight: 0, source: "none", freshness: 0 })),
    attribution: { none: 0, form: 0, contour: 0, substitution: 0, density: 0, direction: 0, trail: 0, response: 0 },
  };
}

/**
 * Write a cell, respecting a **motion priority** so a lower primitive cannot erase a higher one.
 *
 * Priority, highest first: **form > contour > substitution > density/direction > trail > response.**
 * Without this, a trail pass could overwrite the subject it trails from, which is the animation equivalent
 * of texture erasing a junction — a failure Phase 3.2B already measured and fixed at the plane level.
 *
 * ⚠ THE PRIORITY ORDER ALONE IS NOT ENOUGH, AND THE FIRST MOTION LAB PROVED IT.
 *
 * `form` outranks `contour`, which is correct for **ownership** — a trail must never overwrite the subject.
 * But the base fill of a subject was ALSO written at `form`, so when `markContour` tried to re-mark the
 * boundary at `contour`, **every single write was rejected.** Measured: `contour-written = 0` on A2, and
 * A2 came out **byte-identical to A1**, so the contour-migration experiment tested nothing at all.
 *
 * The distinction the first version missed:
 *
 *   - **OWNERSHIP** — which pass is allowed to touch the cell at all. `form` wins; a trail loses.
 *   - **APPEARANCE** — which glyph the cell shows. A boundary should be allowed to restyle a cell that
 *     still BELONGS to the form.
 *
 * **So a subject's base fill must be written at SUBSTITUTION priority, not at form priority**, leaving the
 * contour tier free to restyle its own boundary. The form tier then means "this cell is the subject and
 * nothing may remove it", which is what it was always for.
 */
export const MOTION_PRIORITY: Record<MotionSource, number> = {
  form: 100, contour: 80, substitution: 60, direction: 40, density: 35, trail: 20, response: 10, none: 0,
};

export function write(f: MotionField, c: number, r: number, cell: Partial<MotionCell> & { source: MotionSource }): void {
  const ci = Math.round(c), ri = Math.round(r);
  if (ci < 0 || ri < 0 || ci >= f.cols || ri >= f.rows) return;
  const i = ri * f.cols + ci;
  const cur = f.cells[i]!;
  if (MOTION_PRIORITY[cell.source] < MOTION_PRIORITY[cur.source]) return;
  const prior = cur.ch;
  f.cells[i] = {
    ch: cell.ch ?? cur.ch,
    weight: cell.weight ?? cur.weight,
    source: cell.source,
    freshness: cell.freshness ?? cur.freshness,
  };
  if (f.cells[i]!.ch !== prior) f.attribution[cell.source]++;
}

/** Glyph for a weight, from the density ladder. */
export function glyphForWeight(w: number): string {
  const i = Math.max(0, Math.min(DENSITY_LADDER.length - 1, Math.round(w * (DENSITY_LADDER.length - 1))));
  return DENSITY_LADDER[i]!;
}

// ---------------------------------------------------------------------------
// the grammar primitives
// ---------------------------------------------------------------------------

/**
 * CONTOUR MIGRATION — move a silhouette as ONE boundary rather than as many cells switching.
 *
 * THE PROBLEM THIS SOLVES, and it is the specific reason 3.3B "did not feel like ASCII animation". If a
 * figure is re-sampled independently each frame, adjacent frames disagree at the edge: a cell on the
 * boundary lights in one frame and not the next, at both sides, so the contour **shimmers** instead of
 * moving. The eye reads flicker, not travel.
 *
 * **The fix is a sub-cell position.** The form is drawn from a mask, but its centre is carried as a
 * **fractional** coordinate, and the mask is generated at sub-cell precision. A boundary therefore
 * advances by a fraction of a cell per frame and the SAME edge cells persist across frames — the boundary
 * migrates rather than re-randomising.
 *
 * A cell is marked `contour` when it is lit and has at least one unlit 4-neighbour, which is the
 * morphological definition Phase 3.2B already established for a boundary.
 */
export function markContour(f: MotionField, lit: (c: number, r: number) => boolean): number {
  let n = 0;
  for (let r = 0; r < f.rows; r++) {
    for (let c = 0; c < f.cols; c++) {
      if (!lit(c, r)) continue;
      const edge = !lit(c - 1, r) || !lit(c + 1, r) || !lit(c, r - 1) || !lit(c, r + 1);
      if (!edge) continue;
      write(f, c, r, { source: "contour", ch: "|", weight: 0.95, freshness: 1 });
      n++;
    }
  }
  return n;
}

/**
 * GLYPH SUBSTITUTION — motion state selects the character.
 *
 * `state` 0..1 is a **semantic** quantity: how active, how compressed, how far along a transformation.
 * The progression runs light to heavy, so a form that is accelerating densifies before it releases.
 *
 * **Substitutions must be semantically motivated.** This function never picks a glyph at random; the
 * character is a monotone function of a declared state, which is what makes the change attributable.
 */
export function glyphForState(state: number): string {
  return glyphForWeight(0.15 + 0.85 * Math.max(0, Math.min(1, state)));
}

/** DENSITY FLOW — compression ahead of the motion, release behind it. */
export interface DensityFlowParams {
  /** direction of travel, in cells */
  dir: { x: number; y: number };
  /** how far the compression leads the form */
  lead: number;
  /** how far the release trails */
  trail: number;
  /** 0..1 strength */
  amount: number;
}
export function densityAt(p: DensityFlowParams, dx: number, dy: number, len: number): number {
  const l = Math.max(1e-6, len);
  // signed distance ALONG the direction of travel
  const s = (dx * p.dir.x + dy * p.dir.y) / l;
  if (s > 0) {
    // ahead: compression, peaking at `lead`
    const t = Math.max(0, 1 - s / Math.max(1e-6, p.lead));
    return 1 + t * p.amount * 0.5;
  }
  // behind: release, decaying over `trail`
  const t = Math.max(0, 1 + s / Math.max(1e-6, p.trail));
  return 1 - t * p.amount * 0.5;
}

/** DIRECTIONAL FLOW — orientation glyphs that follow the motion direction. */
export function directionalGlyph(dir: { x: number; y: number }, speed: number): string | undefined {
  if (speed < 1e-4) return undefined;
  const ax = Math.abs(dir.x), ay = Math.abs(dir.y);
  if (ay > ax * 2) return FLOW_GLYPHS.vertical[0];
  if (ax > ay * 2) return speed > 0.5 ? FLOW_GLYPHS.horizontal[2] : FLOW_GLYPHS.horizontal[0];
  return dir.x * dir.y > 0 ? FLOW_GLYPHS.diagFall[0] : FLOW_GLYPHS.diagRise[0];
}

/**
 * TRAIL / DECAY — a semantic character residue, **not motion blur**.
 *
 * A trail is a **record of where the form was**, drawn with progressively lighter characters and allowed to
 * expire. It is a character history, which is a thing the medium can do and a photographic blur cannot.
 */
export interface TrailSample { c: number; r: number; age: number }
export function pushTrail(hist: TrailSample[][], c: number, r: number, maxAge: number): void {
  const p = Math.round(c), q = Math.round(r);
  if (!hist[p]) hist[p] = [];
  hist[p]!.push({ c: p, r: q, age: 0 });
  for (const col of hist) {
    if (!col) continue;
    for (const s of col) s.age++;
    // expire
    for (let i = col.length - 1; i >= 0; i--) if (col[i]!.age > maxAge) col.splice(i, 1);
  }
}
export function drawTrails(f: MotionField, hist: TrailSample[][], maxAge: number): number {
  let n = 0;
  for (const col of hist) {
    if (!col) continue;
    for (const s of col) {
      const w = (1 - s.age / maxAge) * 0.45;
      if (w <= 0.05) continue;
      write(f, s.c, s.r, { source: "trail", ch: glyphForWeight(w), weight: w, freshness: 1 - s.age / maxAge });
      n++;
    }
  }
  return n;
}

/**
 * ASSEMBLE / DISASSEMBLE — a form emerges from, or dissolves into, the character field.
 *
 * `progress` 0 means fully assembled, 1 fully dissolved. The dissolution is **ordered by distance from the
 * form's own centre**, so the form erodes from its extremities inward — which keeps the core recognisable
 * longest and is the visual opposite of a uniform fade.
 */
export function dissolveWeight(progress: number, distFromCore: number, coreRadius: number): number {
  if (progress <= 0) return 1;
  const t = Math.max(0, Math.min(1, (distFromCore - coreRadius * (1 - progress)) / Math.max(1e-6, coreRadius)));
  return Math.max(0, 1 - t - progress * 0.6);
}

/**
 * LOCAL FIELD RESPONSE — the field near a moving object reacts, restrained.
 *
 * Deliberately limited to **displacement and compression**. No ripple, no noise: the brief forbids
 * generic particle behaviour and random glitch, and a restrained response is what keeps the subject
 * readable.
 */
export function fieldResponseOffset(dx: number, dy: number, radius: number, amount: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (d > radius || d < 1e-6) return { x: 0, y: 0 };
  const t = (1 - d / radius) * amount;
  return { x: (dx / d) * t, y: (dy / d) * t };
}

/**
 * MOTION HIERARCHY — which layer the eye should follow.
 *
 * The brief names the common procedural failure: **everything moves equally.** A shot declares a primary,
 * secondary and tertiary motion, and the amounts here are the only place those weights live.
 */
export interface MotionHierarchy {
  primary: number;
  secondary: number;
  tertiary: number;
}
export const DEFAULT_HIERARCHY: MotionHierarchy = { primary: 1.0, secondary: 0.35, tertiary: 0.15 };

// ---------------------------------------------------------------------------
// THE MOTION MODEL, REFACTORED — physical motion and ASCII expression are SEPARATE
// ---------------------------------------------------------------------------

/**
 * THE HYPOTHESIS THE BLIND REVIEW REFUTED, and this refactor exists because of it.
 *
 * Phase 3.3C's motion lab tested whether adding **contour migration** or **trail / decay** to a physical
 * translation would make that translation feel intrinsically ASCII. **It did not.** A1, A2 and A3 —
 * rigid translation, translation + contour migration, translation + trail — were classified
 * **UTILITY / NON-CANONICAL**, none among the strongest external results. A2 and A3 added mechanism
 * without improving perception.
 *
 * The conclusion is structural:
 *
 *     PHYSICAL MOTION  !=  ASCII EXPRESSION
 *
 * They are **two independent layers**, and a shot specifies both. Before this refactor they were
 * entangled: an `AsciiMotion` primitive was chosen partly to describe *what a figure was doing*, which is
 * why adding ASCII mechanisms to a walk could not change what the walk meant.
 *
 * ## The hierarchy a shot expresses
 *
 *     PRIMARY    physical action        (what happens)
 *     SECONDARY  ASCII expression       (how the medium says what it means)
 *     TERTIARY   field response         (restrained, enriching only)
 *
 * This is the structure that prevents the failure the brief names twice: **everything moving at once.**
 */

/**
 * WHAT PHYSICALLY HAPPENS. Conventional, readable, and independent of the medium.
 *
 * Every member is something an audience can describe without seeing a single character.
 */
export const PHYSICAL_MOTIONS = [
  "none", "translate", "walk", "turn", "reach", "fall", "enter", "exit",
] as const;
export type PhysicalMotionKind = (typeof PHYSICAL_MOTIONS)[number];

export interface PhysicalMotionIntent {
  kind: PhysicalMotionKind;
  /** the motion's own progress, 0..1 — supplied by whatever drives it, never derived from a frame index */
  progress: number;
  /** why the director chose it, in the director's own words */
  reason: string;
}

/**
 * HOW THE MEDIUM EXPRESSES MEANING. **Not** a description of physical action.
 *
 * THE EXTERNALLY-CLASSIFIED GRAMMAR, with tier recorded rather than implied:
 *
 * | expression | tier | semantic use |
 * |---|---|---|
 * | `structural-decay` | **canonical** | absence, memory loss, world withdrawal, environmental collapse |
 * | `letter-fragment` | **canonical** | forgotten name, language breakdown, identity loss, erasure |
 * | `assemble-from-field` | **canonical** | appearance, emergence, memory formation, materialisation |
 * | `density-dissolve` | **canonical** | disappearance, weakening, distance, dematerialisation |
 * | `contour-erode` | supporting | enriching a primary action |
 * | `local-field-response` | supporting | restrained reaction near a moving object |
 * | `directional-response` | supporting | orientation follows motion |
 * | `glyph-substitute` | supporting | a declared state selects the character |
 *
 * **A canonical expression is one the external review found to carry meaning on its own.** A supporting
 * expression enriches a primary action and **should not automatically dominate a shot**.
 */
export const ASCII_EXPRESSIONS = [
  "none",
  // canonical
  "structural-decay", "letter-fragment", "assemble-from-field", "density-dissolve",
  // supporting
  "contour-erode", "local-field-response", "directional-response", "glyph-substitute",
] as const;
export type AsciiExpressionKind = (typeof ASCII_EXPRESSIONS)[number];

/** The external classification. Recorded in the type model, not only in a document. */
export const EXPRESSION_TIER: Record<AsciiExpressionKind, "none" | "canonical" | "supporting"> = {
  "none": "none",
  "structural-decay": "canonical",
  "letter-fragment": "canonical",
  "assemble-from-field": "canonical",
  "density-dissolve": "canonical",
  "contour-erode": "supporting",
  "local-field-response": "supporting",
  "directional-response": "supporting",
  "glyph-substitute": "supporting",
};

export interface AsciiExpressionIntent {
  kind: AsciiExpressionKind;
  /** the expression's own progress, 0..1 */
  progress: number;
  reason: string;
}

/**
 * HOW THE TWO LAYERS RELATE. **This replaces a universal rule that was wrong.**
 *
 * ⚠ THE CONTRADICTION THIS CORRECTS. The 3.3C model said two things at once:
 *
 *   1. Tier A expressions **may lead a shot** (`mayLead`)
 *   2. `validateComposition` **rejected** an expression leading a shot with no physical action
 *
 * **Those cannot both be true**, and the second one wrongly rejected the strongest externally-validated
 * result in the whole phase: **D1 `structural-decay`, where the person is static and the room's
 * transformation IS the primary event.** Forcing a fake physical action to satisfy validation would have
 * meant inventing motion to please a checker — the worst possible reason to move something.
 *
 * The error was encoding **`physical > expression` as a universal rule**. There is no universal rule.
 * What matters is **the relation between the layers in a given shot**, and that is what this type models.
 */
export const COMPOSITION_RELATIONS = [
  "physical-only",
  "expression-only",
  "physical-causes-expression",
  "expression-causes-physical",
  "parallel",
  /**
   * ⚠ `presentational` IS A FIRST-CLASS RELATION, added because 3.3G had to **borrow** `parallel` for a
   * case it does not describe.
   *
   * The establishing shot of the first micro-film — *"a person stands alone in a room and their name is
   * written on the wall"* — has no physical action (nobody acts) and no expressive transformation (the name
   * is simply there). It is not causal. `parallel` accepted it only because its rule was widened to permit
   * both layers absent, which made `parallel` mean two different things: *"two things happen independently"*
   * and *"nothing happens, observe the state."*
   *
   * Those are different directorial statements and they deserve different names. `presentational` covers
   * establishing shots, observation shots, holds, waiting, and pure state presentation: **the shot exists so
   * the audience can see a state, and the correct amount of action in it is none.**
   */
  "presentational",
] as const;
export type CompositionRelation = (typeof COMPOSITION_RELATIONS)[number];

/**
 * What each relation asserts, in one sentence, so the semantics live with the type.
 *
 * ⚠ `parallel` was originally documented as "both exist", and the establishing shot of the first directed
 * sequence exposed why that is too narrow.
 *
 * A shot whose entire job is **information** — *"a person stands alone in a room and their name is written
 * on the wall"* — has **no** physical action (nobody acts) and **no** expressive transformation (the name
 * is simply there and must be legible). It is not a causal relation: nothing causes anything yet. It is a
 * **presentational** shot, and the original five relations had no home for it.
 *
 * Forcing it into `expression-only` would have meant claiming the intact name was an "expression", which is
 * a fiction the plan would then carry. `parallel` is the honest home: the world simply is in this state,
 * and the shot observes it. **Either layer may be absent.**
 */
export const RELATION_SEMANTICS: Record<CompositionRelation, string> = {
  "physical-only": "physical motion exists; the ASCII expression may be none",
  "expression-only": "an ASCII expression exists; physical motion may be none — D1 is this",
  "physical-causes-expression": "both exist; the physical action must become legible BEFORE the expression begins",
  "expression-causes-physical": "both exist; the expression must become legible BEFORE the physical response",
  "parallel": "both exist and happen independently; NO causal ordering is asserted",
  "presentational": "neither layer need be active — the shot exists to present a STATE (establishing, observation, hold, waiting)",
};

/**
 * A SHOT'S MOTION, as three independent layers plus the relation between them.
 *
 * ```
 * relation   HOW the layers relate      (causal, parallel, or only one of them)
 * primary    PHYSICAL   what happens
 * secondary  EXPRESSION how the medium means it
 * tertiary   RESPONSE   restrained enrichment
 * ```
 */
export interface MotionComposition {
  relation: CompositionRelation;
  primary: PhysicalMotionIntent;
  secondary: AsciiExpressionIntent;
  tertiary?: AsciiExpressionIntent;
  /** how strongly each layer registers */
  hierarchy: MotionHierarchy;
  /**
   * When the expression may begin, as a **gate on the other layer's legibility** rather than a frame.
   *
   * This is the whole mechanism of causal composition: an expression does not start at a frame number, it
   * starts when the action it is a consequence of has become readable. `after` names the landmark.
   */
  onset?: { after: "reach-readable" | "expression-readable" | "immediate" };
}

/** Whether an expression may lead a shot, or only support one that already leads. */
export function mayLead(expr: AsciiExpressionKind): boolean {
  return EXPRESSION_TIER[expr] === "canonical";
}

/**
 * Validate a composition **against its declared relation**.
 *
 * Returns the reasons it is malformed, so an authoring step can refuse rather than render something whose
 * layers compete. **A check that is not wired in prevents nothing** — the lesson this project has paid for
 * twice, with the collision audit and with the inert contour mechanism.
 */
export function validateComposition(m: MotionComposition): string[] {
  const problems: string[] = [];
  const physical = m.primary.kind !== "none";
  const expression = m.secondary.kind !== "none";

  /** each relation asserts exactly which layers must be present */
  switch (m.relation) {
    case "physical-only":
      if (!physical) problems.push("relation is physical-only but there is no physical motion");
      if (expression) problems.push("relation is physical-only but an ASCII expression is present");
      break;
    case "expression-only":
      /**
       * NO FAKE PHYSICAL ACTION IS DEMANDED HERE. D1 is this relation with the person standing still, and
       * it was ranked Tier A by the external review.
       */
      if (!expression) problems.push("relation is expression-only but there is no ASCII expression");
      break;
    case "physical-causes-expression":
      if (!physical) problems.push("relation asserts a physical cause but there is no physical motion");
      if (!expression) problems.push("relation asserts an expression consequence but there is no expression");
      if (m.onset?.after !== "reach-readable") {
        problems.push("a physical cause must gate the expression on the action becoming legible (onset.after = 'reach-readable'), not on a frame count");
      }
      break;
    case "expression-causes-physical":
      if (!physical) problems.push("relation asserts an expression cause but there is no physical motion");
      if (!expression) problems.push("relation asserts a physical consequence but there is no expression");
      if (m.onset?.after !== "expression-readable") {
        problems.push("an expression cause must gate the response on the expression becoming legible (onset.after = 'expression-readable')");
      }
      break;
    case "parallel":
      /**
       * PARALLEL asserts two independent things happen. **Both layers are required** — that is what
       * distinguishes it from `presentational`, and re-widening it here would collapse the two meanings
       * again.
       */
      if (!physical || !expression) problems.push("relation is parallel but both layers must be present — use 'presentational' for a state with no action");
      break;
    case "presentational":
      /**
       * A presentational shot **requires neither layer and forbids no layer**. It is the home for the
       * establishing shot, the observation shot, the hold and the wait: the shot exists so the audience can
       * see a state, and the correct amount of action in it is none.
       */
      break;
  }

  /**
   * A supporting expression may not LEAD a shot. This is the ONE rule that survives from the old model,
   * and it is narrower than the one it replaces: it constrains **which expression may lead**, never
   * whether an expression may exist without a physical action.
   */
  if (expression && !mayLead(m.secondary.kind) && !physical) {
    problems.push(`'${m.secondary.kind}' is a supporting expression and cannot carry a shot alone`);
  }
  if (!m.primary.reason || (expression && !m.secondary.reason)) {
    problems.push("a motion layer carries no stated reason");
  }
  /** the hierarchy must suit the relation, not a fixed ordering */
  if (m.relation === "physical-causes-expression" && m.hierarchy.primary <= m.hierarchy.secondary) {
    problems.push("the physical action does not outrank the ASCII expression, so the eye will not know which action matters");
  }
  if (m.relation === "expression-only" && m.hierarchy.primary > m.hierarchy.secondary) {
    problems.push("the expression is the primary event but the hierarchy ranks the absent physical layer above it");
  }
  /** a presentational shot asserts no primary layer, so it may not rank one above the other */
  if (m.relation === "presentational" && m.hierarchy.primary !== m.hierarchy.secondary) {
    problems.push("a presentational shot presents a state; its hierarchy must not rank one absent layer above the other");
  }
  return problems;
}

// ---------------------------------------------------------------------------
// CAUSAL TIMING GRAMMAR — frozen from the Phase 3.3D external blind review
// ---------------------------------------------------------------------------

/**
 * THE EXTERNAL RESULT, and it is monotone in one variable.
 *
 * | clip | variant | causal hold | external reading |
 * |---|---|---|---|
 * | clip-05 | EARLY | 1 frame (0.03 s) | **weak / simultaneity** |
 * | clip-03 | MEDIUM | 5 frames (0.17 s) | causal reading, second |
 * | clip-01 | **LATE** | **10 frames (0.33 s)** | **strongest causal reading** |
 *
 * **The variable that moved is the HOLD** — the interval in which the cause is legible and the effect has
 * not begun. The variant with almost no hold read as *two things at once*; the variant with a third of a
 * second of hold read as cause and effect. Everything else was byte-identical between them.
 *
 * ## The rule is SEMANTIC, not a frame delay
 *
 * The result must **not** be encoded as "delay the effect by 10 frames". A 10-frame delay on a slow action
 * and on a fast action are different durations, and on a longer shot both would be wrong. What the external
 * review actually established is that **the cause has to be legible for a perceptible interval before the
 * consequence begins**, and that interval is best expressed relative to the action itself.
 */
export interface CausalTiming {
  /** 1. the action starts moving */
  causeActionStart: number;
  /** 2. the action's progress at which it becomes READABLE — the measured landmark, not a frame */
  causeBecomesReadableAt: number;
  /** 3. how long the legible cause is held, as a MULTIPLE of its own readable phase */
  causalHoldRatio: number;
  /** 4. where the effect begins, derived — never authored directly */
  effectOnsetAt: number;
}

/**
 * THE FROZEN GRAMMAR:
 *
 * ```
 * CAUSE_ACTION_START -> CAUSE_BECOMES_READABLE -> CAUSAL_HOLD -> EFFECT_ONSET
 * ```
 *
 * `CAUSAL_HOLD` is expressed as a **ratio of the cause's readable phase**, so the same grammar schedules a
 * slow reach and a fast reach correctly.
 *
 * ## Why the ratio is 0.25
 *
 * ⚠ THE FIRST DERIVATION OF THIS NUMBER WAS WRONG and is corrected here rather than quietly replaced.
 *
 * It was computed as *progress span x frame count* — the landmark at progress 0.348 to full extension at
 * 1.0, times the shot's 78-frame span, giving 51 frames and a ratio of 0.196. **That is a category error:
 * progress units are not frames.**
 *
 * Measured properly, the Phase 3.3D reach curve **reaches full extension at frame 65, not at the end of the
 * 120-frame shot** — the remaining 55 frames hold the arm extended while the consequence plays. So:
 *
 *     legible phase   frame 25 (the landmark)  ->  frame 65 (full extension)  =  40 frames
 *     winning hold    10 frames            ->  ratio 10/40 = 0.25
 *     MEDIUM           5 frames            ->  ratio 0.125
 *     EARLY            ~1 frame            ->  ratio 0.025
 *
 * **A hold below roughly a tenth of the readable phase reads as simultaneity; a quarter reads as cause and
 * effect.** `0.25` is the frozen default, and it is a **proportion of the action** rather than a count of
 * frames — which is the whole point, since a 10-frame delay means something different on a slow reach than
 * on a fast one.
 */
export const CAUSAL_HOLD_RATIO = 0.25;

/**
 * Derive the effect onset from the cause. **This is the function a director uses; the frame count is an
 * output, never an input.**
 */
export function deriveCausalTiming(
  causeActionStart: number,
  causeBecomesReadableAt: number,
  causeLegibleUntil: number,
  holdRatio: number = CAUSAL_HOLD_RATIO,
): CausalTiming {
  const legiblePhase = Math.max(1e-6, causeLegibleUntil - causeBecomesReadableAt);
  return {
    causeActionStart,
    causeBecomesReadableAt,
    causalHoldRatio: holdRatio,
    effectOnsetAt: causeBecomesReadableAt + legiblePhase * holdRatio,
  };
}

/**
 * Whether a hold is long enough to read as causation rather than simultaneity.
 *
 * Returns the verdict and the ratio, so an authoring step can refuse a timing that the external review has
 * already shown to fail. **`0.02` is the EARLY variant that the observer read as two unrelated events.**
 */
export function holdIsCausallyLegible(holdRatio: number): { ok: boolean; reason: string } {
  if (holdRatio <= 0.05) {
    return { ok: false, reason: `a hold of ${(holdRatio * 100).toFixed(1)}% of the cause's readable phase reads as simultaneity — the EARLY variant at 0.02 was externally read as two unrelated events` };
  }
  if (holdRatio < 0.15) {
    return { ok: false, reason: `a hold of ${(holdRatio * 100).toFixed(1)}% is at the weak end; the MEDIUM variant at 12.5% placed second` };
  }
  return { ok: true, reason: `a hold of ${(holdRatio * 100).toFixed(1)}% sits at or above the externally validated 25% that produced the strongest causal reading` };
}

// ---------------------------------------------------------------------------
// CAMERA MOTIVATION — WHY the camera moves, separated from HOW it moves
// ---------------------------------------------------------------------------

/**
 * ⚠ `CameraMotivation` IS NOT `CameraMove`.
 *
 * A PUSH_IN motivated by `action-responsive` and a PUSH_IN motivated by `anticipatory` are **the same
 * geometric move and different directorial statements.** Phase 3.3E measured exactly that: VERSION A and
 * VERSION B both pushed `cameraZ 0.9315 -> 0.7841` for the same 10% scale increase, and the external review
 * rated them differently *because of when the push began*:
 *
 * | version | motivation | external result |
 * |---|---|---|
 * | **VERSION B** | `action-responsive` — the camera begins when the reach becomes legible | **STRONGEST**; *"the camera feels as though it moves in response to the importance of the action"* |
 * | VERSION A | `anticipatory` — the camera begins before the action establishes | PASS, second; *"slightly ahead of the subject"* — valid, but not canonical for this shot |
 * | control | `static` | VALID; the cleanest action demonstration, less cinematic intention |
 *
 * **The geometry was identical. The meaning differed.** That is the whole reason this type exists, and why
 * a shot declares motivation and move separately.
 *
 * ## None of these is a universal law
 *
 * `ACTION_RESPONSIVE` is canonical **for the tested composition** `REACH -> LETTER_FRAGMENT`. Anticipation
 * is not a lesser choice; it serves a different dramatic intention, and the external note names those
 * intentions directly.
 */
export const CAMERA_MOTIVATIONS = [
  /** the camera intentionally does not move — a decision, not an absence */
  "static",
  /** the camera begins AFTER an action becomes perceptually legible */
  "action-responsive",
  /** the camera begins BEFORE the expected event, to create anticipation */
  "anticipatory",
  /** the camera responds only AFTER the consequence has occurred */
  "consequence-responsive",
  /** the camera exists to preserve the framing of a moving subject */
  "subject-following",
  /** the camera moves to disclose previously hidden information */
  "reveal",
] as const;
export type CameraMotivationKind = (typeof CAMERA_MOTIVATIONS)[number];

/** What each motivation asserts, so its dramatic use is recorded with the type. */
export const MOTIVATION_INTENT: Record<CameraMotivationKind, { rule: string; serves: string[] }> = {
  "static": {
    rule: "the camera does not move for the whole shot",
    serves: ["the action is strong enough to carry the shot", "the cleanest possible demonstration of an action", "restraint"],
  },
  "action-responsive": {
    rule: "camera motion begins after the primary action is perceptually legible",
    serves: ["the camera appears to answer the action", "dignity or importance granted to an action", "causality with cinematic intention"],
  },
  "anticipatory": {
    rule: "camera motion begins before the expected event",
    serves: ["foreboding", "inevitability", "danger approaching", "psychological pressure", "the world knowing before the character"],
  },
  "consequence-responsive": {
    rule: "camera motion begins only after the consequence has occurred",
    serves: ["the consequence is the subject", "aftermath", "the camera reacting late, as a witness"],
  },
  "subject-following": {
    rule: "camera motion keeps a moving subject framed",
    serves: ["sustained physical action", "travel", "the subject is the shot"],
  },
  "reveal": {
    rule: "camera motion discloses information not previously visible",
    serves: ["a withheld fact", "spatial discovery", "the shot exists to show something"],
  },
};

/** The geometric move — the HOW, with no meaning attached. */
export const CAMERA_MOVES = ["none", "push-in", "pull-out", "truck", "pan", "tilt", "crane", "orbit"] as const;
export type CameraMoveKind = (typeof CAMERA_MOVES)[number];

/**
 * A SEMANTIC REFERENCE to an event in the shot, or in the sequence.
 *
 * ⚠ THE AUDIT THAT PRODUCED THIS. Phase 3.3I's S4 declared `action-responsive` and the validator **accepted
 * it**, because the check was *"is `beginsAtActionProgress` declared"* — it tested that **a number existed**,
 * not that a **legible physical action existed in the shot**. Measured at S4's onset frame:
 *
 *     roomDecay = 0.0399   reachProgress = 1   stepProgress = 1
 *
 * The action had finished 70 frames earlier. And `validateCameraIntent` returned **the same result** for
 * `action-responsive` and `consequence-responsive` with the same field — **it could not tell them apart.**
 *
 * The repair is that a motivation must now name **what the camera is responding to**, and validation asks
 * whether that event exists and whether the timing relation is consistent with the declared motivation.
 */
export interface CameraEventRef {
  kind: "action" | "consequence" | "reveal" | "subject";
  /** the event's name, as the plan declares it — `REACH`, `ROOM_STRUCTURAL_DECAY`, `NAME_FRAGMENT` */
  event: string;
  /**
   * the event's legibility landmark, 0..1 through the shot, **or** a resolved frame if the compiler supplied
   * one. `undefined` means the plan has not established when the event becomes readable — which is exactly
   * the condition `action-responsive` must not be allowed to proceed on.
   */
  readableAt?: number;
  /** for `consequence`/`reveal`: when the consequence ONSETS, which may differ from when it is readable */
  onsetsAt?: number;
}

export interface CameraIntent {
  move: CameraMoveKind;
  motivation: CameraMotivationKind;
  /**
   * WHAT the camera is responding to. **Required for every motivation except `static`.**
   *
   * `action-responsive` requires a `kind: "action"` reference. `consequence-responsive` requires
   * `kind: "consequence"`. `anticipatory` requires a reference to the FUTURE event it precedes.
   */
  respondsTo?: CameraEventRef;
  /** the camera's own onset as a shot progress, 0..1 */
  beginsAt?: number;
  reason: string;
}

/**
 * CONSISTENCY between a move and its motivation.
 *
 * The point is not to forbid combinations but to catch a **mismatch that is meaningless**: `static`
 * motivation paired with a moving camera, or `none` move paired with `subject-following`. A camera that
 * does not move cannot be following anything.
 */
export function validateCameraIntent(c: CameraIntent): string[] {
  const p: string[] = [];
  if (c.motivation === "static" && c.move !== "none") {
    p.push(`motivation 'static' but the move is '${c.move}' — a static camera does not move`);
  }
  if (c.move === "none" && c.motivation !== "static") {
    p.push(`move 'none' with motivation '${c.motivation}' — a camera that does not move has no motivation other than 'static'`);
  }
  if (c.motivation === "static") {
    if (c.beginsAt !== undefined && c.beginsAt !== 0) p.push(`a static camera does not begin at ${c.beginsAt}`);
    return p;
  }

  /**
   * ⚠ EVERY MOVING CAMERA MUST NAME WHAT IT RESPONDS TO.
   *
   * This is the check whose ABSENCE let S4 through. Field presence is not enough: the motivation must be
   * validated **against its referenced event**.
   */
  if (!c.respondsTo) {
    p.push(`motivation '${c.motivation}' requires respondsTo — a camera that moves must name the event it responds to`);
    return p;
  }
  const r = c.respondsTo;

  switch (c.motivation) {
    case "action-responsive": {
      if (r.kind !== "action") p.push(`action-responsive responds to a '${r.kind}' event ('${r.event}') — it must respond to a physical ACTION`);
      if (r.readableAt === undefined) {
        p.push(`action-responsive requires the action's legibility landmark ('${r.event}' has no readableAt) — a declared onset number is not evidence that a legible action exists`);
      }
      if (r.readableAt !== undefined && c.beginsAt !== undefined && c.beginsAt < r.readableAt) {
        p.push(`action-responsive camera begins at ${c.beginsAt} but the action '${r.event}' is not readable until ${r.readableAt}`);
      }
      break;
    }
    case "consequence-responsive": {
      if (r.kind !== "consequence") p.push(`consequence-responsive responds to a '${r.kind}' event ('${r.event}') — it must respond to a CONSEQUENCE`);
      if (r.onsetsAt === undefined && r.readableAt === undefined) {
        p.push(`consequence-responsive requires the consequence's onset landmark ('${r.event}' has neither onsetsAt nor readableAt)`);
      }
      const mark = r.onsetsAt ?? r.readableAt;
      if (mark !== undefined && c.beginsAt !== undefined && c.beginsAt < mark) {
        p.push(`consequence-responsive camera begins at ${c.beginsAt} but the consequence '${r.event}' does not onset until ${mark}`);
      }
      break;
    }
    case "anticipatory": {
      const mark = r.onsetsAt ?? r.readableAt;
      if (mark === undefined) p.push(`anticipatory requires a landmark for the future event '${r.event}' so the camera can be shown to precede it`);
      /** ANTICIPATORY is the one motivation whose onset must be BEFORE its referenced event */
      if (mark !== undefined && c.beginsAt !== undefined && c.beginsAt >= mark) {
        p.push(`anticipatory camera begins at ${c.beginsAt}, which is NOT before the referenced event '${r.event}' at ${mark}`);
      }
      break;
    }
    case "reveal":
      if (r.kind !== "reveal") p.push(`reveal responds to a '${r.kind}' event ('${r.event}') — it must name the information revealed`);
      break;
    case "subject-following":
      if (r.kind !== "subject") p.push(`subject-following responds to a '${r.kind}' event ('${r.event}') — it must name the moving subject`);
      break;
  }
  if (c.beginsAt === undefined) p.push(`motivation '${c.motivation}' requires beginsAt — it is defined by WHEN it starts relative to its event`);
  if (!c.reason) p.push("the camera carries no stated reason");
  return p;
}

// ---------------------------------------------------------------------------
// SHOT INTENT — the director's planning layer
// ---------------------------------------------------------------------------

/**
 * THE DIRECTOR PIPELINE. A shot is planned as meaning first, mechanism second:
 *
 * ```
 * SEMANTIC EVENT -> DRAMATIC INTENTION -> PHYSICAL ACTION -> COMPOSITION RELATION
 *   -> ASCII EXPRESSION -> CAUSAL TIMING -> CAMERA MOTIVATION -> CAMERA MOVE -> SHOT COMPOSITION
 * ```
 *
 * **The ordering is the safeguard.** Because the semantic event and the dramatic intention are declared
 * *before* any mechanism, the system cannot select an effect merely because the effect exists — which is
 * the failure mode the brief names directly, and the one this project has already paid for once with the
 * motion lab, where four mechanisms were built before anything established that they carried meaning.
 *
 * This layer is **machine-readable planning**, not user-facing prose. `ShotSpec` compiles from it.
 */
export interface ShotIntent {
  /** WHAT happens, in semantic terms, with no reference to a mechanism */
  semanticEvent: string;
  /** WHY this shot exists — what the audience should take from it */
  dramaticIntention: string;
  /** WHAT the viewer should notice first */
  primaryAttention: AttentionTarget;
  secondaryAttention?: AttentionTarget;
  tertiaryResponse?: AttentionTarget;
  /** WHAT changes because of what */
  relation: CompositionRelation;
  motion: MotionComposition;
  camera: CameraIntent;
  /** the expected state at the start and end, so the shot can be checked against its intention */
  beginsIn: string;
  endsIn: string;
  /**
   * HOW THIS SHOT IS REPRESENTED — the four independently controllable ASCII layers.
   *
   * ⚠ **OPTIONAL AT THE TYPE LEVEL, MANDATORY IN THE R2 PLAN.** Making it required would invalidate 29 existing
   * shot literals and every frozen test that compiles them, which would be a regression dressed as progress.
   * When it IS present the compiler validates it and rejects an inert mask; when it is absent the legacy
   * single-material path is used exactly as before.
   */
  visual?: import("../v4/layers.js").VisualRepresentationIntent;
  /**
   * HOW A SEMANTIC OBJECT CHANGES REPRESENTATION while keeping its identity.
   *
   * Optional at the type level for the same reason `visual` is: requiring it would invalidate every existing
   * shot literal and the frozen tests that compile them.
   */
  modeTransitions?: import("../v4/mode-transition.js").VisualModeTransitionIntent[];
  /**
   * HOW THE TYPOGRAPHIC OBJECT IS COMPOSED ON SCREEN — the director's contract for readability.
   *
   * ⚠ Optional at the type level so legacy shot literals and frozen tests are untouched; **mandatory in the R3.6
   * production plan when typography is required**, which the compiler enforces.
   */
  typographyComposition?: import("../v4/typography-composition.js").TypographyCompositionIntent;
  /**
   * WHAT THE AUDIENCE SHOULD TAKE FROM THE SHOT, in the director's own words.
   *
   * This is the field that catches a plan drifting from its intention. A shot may execute every declared
   * mechanism correctly and still say the wrong thing, and nothing else in this model would notice.
   */
  expectedAudienceReading: string;
}

/** What an attention slot is looking at, and which layer produces it. */
export interface AttentionTarget {
  /** what the viewer attends to, in semantic terms */
  target: string;
  /** which layer of the shot produces it */
  from: "physical" | "expression" | "camera" | "environment";
}

/**
 * ATTENTION HIERARCHY VALIDATION.
 *
 * A shot may declare only ONE primary attention. The brief requires the director to **reject or warn when
 * multiple elements are all declared primary**, which is the planning-layer form of the failure the whole
 * motion-hierarchy idea exists to prevent: *everything moving at once.*
 */
export function validateAttention(s: ShotIntent): string[] {
  const p: string[] = [];
  if (!s.primaryAttention) p.push("the shot declares no primary attention, so nothing is the subject");
  /**
   * ⚠ A first version of this function computed a `primaries` count and immediately `void`ed it — dead code
   * that did nothing while looking like a check. Removed rather than left in: **an inert mechanism that
   * appears to validate is worse than no mechanism**, which is precisely the failure the A2 contour bug
   * recorded in the motion grammar document.
   */
  if (s.primaryAttention && s.secondaryAttention && s.primaryAttention.target === s.secondaryAttention.target) {
    p.push("primary and secondary attention name the same target");
  }
  /** the camera is a SUPPORTING layer and may not hold primary attention in a causal shot */
  if (s.primaryAttention && s.primaryAttention.from === "camera" && s.relation === "physical-causes-expression") {
    p.push("the camera holds primary attention in a causal shot — the camera would become the event rather than support it");
  }
  if (!s.semanticEvent) p.push("the shot has no declared semantic event");
  if (!s.dramaticIntention) p.push("the shot has no declared dramatic intention");
  if (!s.beginsIn || !s.endsIn) p.push("the shot does not declare its expected beginning and ending states");
  if (!s.expectedAudienceReading) p.push("the shot does not declare what the audience should take from it");
  return p;
}

/**
 * ⚠ DIRECTOR RESTRAINT — `CAPABILITY DOES NOT IMPLY USE`.
 *
 * **The rule:** a shot should use **the minimum number of mechanisms necessary to communicate its dramatic
 * intention.** The Director must not add camera movement, an ASCII expression, a field response, a trail, a
 * glitch or a transition merely because each is available.
 *
 * **This is checkable, and this is the check.** It does not forbid a mechanism — it demands that a mechanism
 * carry a reason, and it names the shot's declared dramatic intention as the thing the reason must serve.
 *
 * The failure it exists to prevent is the one this project has already produced twice: a motion lab that
 * built four mechanisms before anything established that they carried meaning, and a camera test where the
 * geometry was identical and only the motivation decided the result. **Capability is not intention.**
 */
export function restraintReport(s: ShotIntent): { used: string[]; unused: string[]; note: string } {
  const used: string[] = [];
  const unused: string[] = [];
  const m = s.motion;
  (m.primary.kind !== "none" ? used : unused).push(`physical:${m.primary.kind}`);
  (m.secondary.kind !== "none" ? used : unused).push(`expression:${m.secondary.kind}`);
  if (m.tertiary && m.tertiary.kind !== "none") used.push(`tertiary:${m.tertiary.kind}`);
  (s.camera.move !== "none" ? used : unused).push(s.camera.move === "none" ? "camera:static" : `camera:${s.camera.move}`);
  /**
   * A mechanism is only justified if its own `reason` names something the dramatic intention is about.
   * This is a **weak** check by design — it cannot judge prose, and it must not pretend to. What it can do
   * is refuse a mechanism that carries no reason at all, and refuse a shot whose ONLY reasons are generic
   * capability statements ("it was available", "for visual interest").
   */
  const GENERIC = ["available", "visual interest", "looks good", "for variety", "because we can", "default"];
  const reasons = [m.primary.reason, m.secondary.reason, s.camera.reason].filter(Boolean).join(" ").toLowerCase();
  const generic = GENERIC.filter((g) => reasons.includes(g));
  return {
    used, unused,
    note: generic.length
      ? `RESTRAINT VIOLATION — ${generic.length} mechanism reason(s) appeal to capability rather than intention: ${generic.join(', ')}`
      : `${used.length} mechanism(s) in use, each carrying a stated reason; ${unused.length} available and deliberately unused`,
  };
}

/** Validate a whole shot plan: motion layers, relation, camera and attention together. */
export function validateShotIntent(s: ShotIntent): string[] {
  const problems = [
    ...validateComposition(s.motion),
    ...validateCameraIntent(s.camera),
    ...validateAttention(s),
  ];
  const r = restraintReport(s);
  if (r.note.startsWith("RESTRAINT VIOLATION")) problems.push(r.note);
  return problems;
}

/**
 * THE DECISION CONTRACT, as a machine-readable record.
 *
 * Every field the director must be able to explain. Producing it is how a plan is checked for gaps: **a
 * field that cannot be filled is a decision that has not been made.**
 */
export interface DirectorDecisionRecord {
  semanticEvent: string;
  primaryPhysicalAction: PhysicalMotionKind;
  asciiExpression: AsciiExpressionKind;
  expressionReason: string;
  causalRelation: CompositionRelation;
  causalTimingLandmark: string;
  cameraMotivation: CameraMotivationKind;
  cameraMove: CameraMoveKind;
  attentionHierarchy: string[];
  beginsIn: string;
  endsIn: string;
  expectedAudienceReading: string;
}

export function explainShot(s: ShotIntent): DirectorDecisionRecord {
  return {
    semanticEvent: s.semanticEvent,
    primaryPhysicalAction: s.motion.primary.kind,
    asciiExpression: s.motion.secondary.kind,
    expressionReason: s.motion.secondary.reason,
    causalRelation: s.relation,
    causalTimingLandmark: s.motion.onset?.after ?? "none",
    cameraMotivation: s.camera.motivation,
    cameraMove: s.camera.move,
    attentionHierarchy: [s.primaryAttention?.target, s.secondaryAttention?.target, s.tertiaryResponse?.target].filter(Boolean) as string[],
    beginsIn: s.beginsIn,
    endsIn: s.endsIn,
    expectedAudienceReading: s.expectedAudienceReading,
  };
}
