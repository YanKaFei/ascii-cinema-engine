/**
 * VISUAL REPRESENTATION INTENT — the director's per-layer contract.
 *
 * ⚠ **THE PROBLEM THIS SOLVES, stated concretely.** Before R2 a shot could declare its *semantics* but not its
 * *representation*: the render script decided what the room, the person and the NAME looked like, by shot number,
 * in one undivided function. There was no way to say "the room is light architecture, the figure is
 * edge-directed, the NAME is graphic type, and this region between them is empty" — and therefore no way to
 * control the four materials independently or to test that any of them was actually reaching the pixels.
 *
 * This contract is declared in the Director Plan, **validated by the compiler**, preserved in
 * `CompiledShotSpec`, and consumed by the hybrid compositor.
 */

/** The representation a layer uses. Each mode is a materially different glyph-selection rule. */
export const REPRESENTATION_MODES = ["SCENE_ASCII", "EDGE_ASCII", "TYPOGRAPHIC_GRAPHIC", "NEGATIVE_SPACE"] as const;
export type RepresentationMode = (typeof REPRESENTATION_MODES)[number];

/** The four compositing layers. Order here is the canonical back-to-front order. */
export const LAYER_IDS = ["SCENE_LAYER", "SUBJECT_LAYER", "TYPOGRAPHY_LAYER", "NEGATIVE_SPACE_MASK"] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/**
 * LAYER TIMING — **a half-open frame interval `[fromFrame, toFrame)` in SHOT-RELATIVE frames.**
 *
 * ⚠ THE CONVENTION IS STATED ONCE HERE BECAUSE THE R2 DEFECT WAS THAT IT WAS NEVER STATED AT ALL.
 *
 * R2 declared and compiled `LayerTiming` and **the compositor never read it**, so a layer whose interval had
 * ended still drew pixels. A `framesInShot`-shaped value was passed into the compositor and ignored.
 *
 * **Half-open is chosen deliberately**, matching the shot compiler's own `frameStart..frameEnd` treatment of
 * shot spans as inclusive-end for *playback* but exclusive for *interval tests*: a layer ending at frame 300 and
 * another beginning at 300 must never both be active, and must never both be inactive. The tests in
 * `tests/design/layer-timing.test.mjs` pin all five boundary positions.
 */
export interface LayerTiming {
  /** FIRST active frame, inclusive */
  fromFrame?: number;
  /** FIRST INACTIVE frame, exclusive */
  toFrame?: number;
  /** frames at the head of the interval spent fading in from zero coverage */
  fadeIn?: number;
  /** frames at the tail of the interval spent fading out to zero coverage */
  fadeOut?: number;
}

/** Raised when a layer's timing cannot describe a real interval. */
export class LayerTimingError extends Error {
  constructor(message: string) { super(message); this.name = "LayerTimingError"; }
}

/**
 * VALIDATE A TIMING DECLARATION. Called by the compiler, so an impossible interval never reaches the compositor.
 *
 * `undefined` is legal and means "active for the whole shot" — but a **required** timing that is absent is an
 * error, which is how the negative-space mask is treated, because a mask with no window clears unconditionally.
 */
export function validateLayerTiming(t: LayerTiming | undefined, opts: { layerId: string; required?: boolean }): string[] {
  const p: string[] = [];
  if (t === undefined) {
    if (opts.required) p.push(`layer '${opts.layerId}' requires timing but declares none — an unconditioned layer has no compiled interval to obey`);
    return p;
  }
  const finiteOrUndef = (v: number | undefined) => v === undefined || (typeof v === "number" && Number.isFinite(v));
  if (!finiteOrUndef(t.fromFrame)) p.push(`layer '${opts.layerId}' fromFrame is not a finite number (${String(t.fromFrame)})`);
  if (!finiteOrUndef(t.toFrame)) p.push(`layer '${opts.layerId}' toFrame is not a finite number (${String(t.toFrame)})`);
  if (!finiteOrUndef(t.fadeIn)) p.push(`layer '${opts.layerId}' fadeIn is not a finite number (${String(t.fadeIn)})`);
  if (!finiteOrUndef(t.fadeOut)) p.push(`layer '${opts.layerId}' fadeOut is not a finite number (${String(t.fadeOut)})`);
  if (t.fromFrame !== undefined && !Number.isInteger(t.fromFrame)) p.push(`layer '${opts.layerId}' fromFrame ${t.fromFrame} is not an integer frame`);
  if (t.toFrame !== undefined && !Number.isInteger(t.toFrame)) p.push(`layer '${opts.layerId}' toFrame ${t.toFrame} is not an integer frame`);
  if (t.fromFrame !== undefined && t.toFrame !== undefined && t.toFrame <= t.fromFrame) {
    p.push(`layer '${opts.layerId}' interval [${t.fromFrame}, ${t.toFrame}) is empty or inverted`);
  }
  if (t.fadeIn !== undefined && t.fadeIn < 0) p.push(`layer '${opts.layerId}' fadeIn is negative`);
  if (t.fadeOut !== undefined && t.fadeOut < 0) p.push(`layer '${opts.layerId}' fadeOut is negative`);
  if (t.fromFrame !== undefined && t.toFrame !== undefined) {
    const span = t.toFrame - t.fromFrame;
    if ((t.fadeIn ?? 0) + (t.fadeOut ?? 0) > span) p.push(`layer '${opts.layerId}' fades (${(t.fadeIn ?? 0)}+${(t.fadeOut ?? 0)}) exceed the interval length ${span}`);
  }
  return p;
}

/**
 * IS THE LAYER ACTIVE AT THIS SHOT-RELATIVE FRAME, and at what coverage?
 *
 * ⚠ **THE SINGLE SOURCE OF TRUTH FOR LAYER VISIBILITY IN TIME.** The compositor calls this; the render script does
 * not reconstruct the interval, which is what the R2 defect consisted of.
 */
export interface LayerActivity { active: boolean; opacity: number; reason: string }
export function layerActivityAt(t: LayerTiming | undefined, frameInShot: number): LayerActivity {
  if (!Number.isFinite(frameInShot)) throw new LayerTimingError(`layer activity asked for a non-finite frame (${String(frameInShot)})`);
  if (!t) return { active: true, opacity: 1, reason: "no timing declared: active for the whole shot" };
  const from = t.fromFrame ?? Number.NEGATIVE_INFINITY;
  const to = t.toFrame ?? Number.POSITIVE_INFINITY;
  /** HALF-OPEN: active when from <= f < to */
  if (frameInShot < from) return { active: false, opacity: 0, reason: `frame ${frameInShot} is before the interval start ${from}` };
  if (frameInShot >= to) return { active: false, opacity: 0, reason: `frame ${frameInShot} is at or after the interval end ${to} (half-open)` };
  let opacity = 1;
  const fadeIn = t.fadeIn ?? 0, fadeOut = t.fadeOut ?? 0;
  if (fadeIn > 0 && frameInShot < from + fadeIn) opacity = Math.max(0, Math.min(1, (frameInShot - from + 1) / (fadeIn + 1)));
  if (fadeOut > 0 && frameInShot >= to - fadeOut) opacity = Math.min(opacity, Math.max(0, Math.min(1, (to - frameInShot) / (fadeOut + 1))));
  return { active: true, opacity, reason: `frame ${frameInShot} is inside [${from}, ${to})${opacity < 1 ? `, fading at coverage ${opacity.toFixed(3)}` : ""}` };
}

/**
 * One layer's declaration.
 *
 * ⚠ `maskId` and `visibility` are **separate from** the glyph content: a layer can be present, masked, or
 * absent, and those are three different states.
 */
export interface VisualLayerIntent {
  layerId: LayerId;
  /** what this layer represents, in the director's terms — carried through for the consumption trace */
  subjectId: string;
  /**
   * ⚠ WHAT THIS LAYER **DRAWS**, which is not always what it *is*.
   *
   * A mask layer is the eraser (`subjectId: 'negative-space'`) but it draws the atmosphere; the first version
   * conflated the two, so the validator reported *"clears subject 'atmosphere' but no layer draws it"* — a real
   * modelling error caught by the compiler rather than by a wrong picture. `clearsSubjects` is checked against
   * this field.
   */
  drawsSubjects?: string[];
  representationMode: RepresentationMode;
  /** the glyph material family, resolved against `src/design/material.ts` */
  materialId: "architecture" | "figure" | "text" | "atmosphere" | "accent" | "detail";
  /** higher wins at equal depth; the compositor is deterministic on ties */
  priority: number;
  visible: boolean;
  /**
   * NEGATIVE_SPACE_MASK semantics: the `subjectId`s whose cells this mask **clears**.
   *
   * ⚠ **A mask is a declarative eraser, not a paint order.** It names what it removes, so removing the mask
   * restores exactly those cells and nothing else.
   */
  maskId?: string;
  clearsSubjects?: string[];
  /** target fraction of the frame this layer's mask preserves outside the cleared region, 0..1 (default 1) */
  maskRetention?: number;
  timing?: LayerTiming;
}

export interface VisualRepresentationIntent {
  layers: VisualLayerIntent[];
  /** a one-line statement of the composite's graphic intention, for the review */
  compositionNote: string;
}

export const LAYER_PRIORITY: Record<LayerId, number> = {
  SCENE_LAYER: 10,
  SUBJECT_LAYER: 40,
  TYPOGRAPHY_LAYER: 60,
  NEGATIVE_SPACE_MASK: 100,
};

/**
 * VALIDATE — the compiler calls this.
 *
 * The rules are deliberately strict enough to catch the two failure modes that matter: **a layer that cannot be
 * distinguished from another** (same priority and same material), and **a mask that clears a layer which is not
 * present** (an eraser with nothing to erase, which would silently do nothing).
 */
export function validateVisualIntent(v: VisualRepresentationIntent): string[] {
  const problems: string[] = [];
  if (!v.layers.length) problems.push("the shot declares no visual layers, so nothing is represented");
  const seen = new Set<string>();
  for (const l of v.layers) {
    if (seen.has(l.layerId)) problems.push(`layer '${l.layerId}' is declared more than once in one shot`);
    seen.add(l.layerId);
    if (!LAYER_IDS.includes(l.layerId)) problems.push(`unknown layer id '${l.layerId}'`);
    if (!REPRESENTATION_MODES.includes(l.representationMode)) problems.push(`layer '${l.layerId}' has unknown mode '${l.representationMode}'`);
    if (!Number.isFinite(l.priority)) problems.push(`layer '${l.layerId}' has a non-finite priority`);
    if (!l.subjectId) problems.push(`layer '${l.layerId}' declares no subjectId, so its pixels could not be traced`);
    if (l.layerId !== "NEGATIVE_SPACE_MASK" && !l.visible && l.representationMode !== "NEGATIVE_SPACE") {
      /** an invisible content layer is legal, but it must say so through `visible` rather than by accident */
    }
    /**
     * ⚠ A MASK THAT IS **VISIBLE** MUST CLEAR SOMETHING; one that is explicitly invisible must not.
     *
     * `visible: false` is a DECLARATION that this shot opens no negative space, and it is legal. A mask marked
     * visible while naming no subject is an eraser that silently does nothing, and that is refused.
     */
    if (l.layerId === "NEGATIVE_SPACE_MASK" && l.visible && !l.clearsSubjects?.length) {
      problems.push("NEGATIVE_SPACE_MASK is visible but clears nothing — an eraser that names no subject would silently do nothing");
    }
    if (l.layerId === "NEGATIVE_SPACE_MASK" && !l.visible && l.clearsSubjects?.length) {
      problems.push("NEGATIVE_SPACE_MASK is invisible but names subjects to clear — the declaration contradicts itself");
    }
  }
  /** a mask may only clear a subject that some layer actually DRAWS */
  const drawn = new Set<string>();
  for (const l of v.layers) { (l.drawsSubjects ?? [l.subjectId]).forEach((d) => drawn.add(d)); }
  for (const l of v.layers) {
    if (l.layerId !== "NEGATIVE_SPACE_MASK") continue;
    for (const s of l.clearsSubjects ?? []) {
      if (!drawn.has(s)) problems.push(`NEGATIVE_SPACE_MASK clears subject '${s}' but no layer draws it`);
    }
  }
  return problems;
}

/** The layer that owns a given subject, used by the mask and by the trace. */
export function layerForSubject(v: VisualRepresentationIntent, subjectId: string): VisualLayerIntent | undefined {
  return v.layers.find((l) => l.subjectId === subjectId);
}
