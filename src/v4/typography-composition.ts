/**
 * TYPOGRAPHY COMPOSITION INTENT — the director's contract for how a word is composed on screen.
 *
 * ⚠ **WHY THIS EXISTS.** R3.5's composition parameters lived as a constant inside the render script
 * (`TYPO_SCREEN_BOUNDS = { widthFraction: 0.62, heightFraction: 0.44 }`). That is **not a director-controlled
 * capability**: it cannot be authored per shot, it cannot be validated, and it cannot be traced from the plan to
 * the pixels. It was also the measurable cause of the unreadability — at 44 % height the letter strokes resolved to
 * **1.8 output cells**, and a directional glyph cannot describe a stroke that is thinner than about three cells.
 *
 * Every field here has a **real runtime consumer**. Fields with no consumer were removed rather than declared.
 */

/** Layout policies. Only `FIT` is implemented; the others are declared so the compiler can REFUSE them. */
export const LAYOUT_POLICIES = ["FIT", "WRAP", "AUTHOR_APPROVED_CROP"] as const;
export type LayoutPolicy = (typeof LAYOUT_POLICIES)[number];
/** policies this runtime can actually execute */
export const IMPLEMENTED_LAYOUT_POLICIES: readonly LayoutPolicy[] = ["FIT"];

export const VISUAL_PRIORITIES = ["PRIMARY", "SECONDARY", "TERTIARY"] as const;
export type VisualPriority = (typeof VISUAL_PRIORITIES)[number];

export const OCCLUSION_POLICIES = ["PROTECT_SUBJECTS", "ALLOW_OVERLAP"] as const;
export type OcclusionPolicy = (typeof OCCLUSION_POLICIES)[number];

/** Normalised screen rectangle, origin top-left, 0..1. */
export interface ScreenRegion { x0: number; y0: number; x1: number; y1: number }

/**
 * The window in which the word MUST be readable, and the FRACTION OF THE FRAME it may occupy there.
 *
 * ⚠ `readabilityInterval.occupancy` is the field that fixes the readability defect: outside the interval the word
 * is composed as part of the environment at `screenRegion`; inside it the word may take `occupancy` of the frame,
 * which is what gives a letter stroke enough output cells to be described by ASCII material.
 */
export interface ReadabilityInterval {
  /** SHOT-RELATIVE, half-open [fromFrame, toFrame) — the same convention as LayerTiming */
  fromFrame: number;
  toFrame: number;
  /** 0..1 of canvas width/height the word may occupy INSIDE the interval */
  occupancy: { width: number; height: number };
}

/** An anchor on a protected subject that the composition must not erase. */
export interface ProtectedSubjectAnchor {
  /** the semantic object, e.g. PERSON */
  subjectId: string;
  /** the anchor's name, e.g. 'hand', 'head', 'torso' — resolved by the runtime against the performance */
  anchorId: string;
}

export interface TypographyCompositionIntent {
  /** the semantic object being composed */
  sourceObjectId: string;
  layoutPolicy: LayoutPolicy;
  /** the region the word occupies OUTSIDE its readability interval */
  screenRegion: ScreenRegion;
  readabilityInterval: ReadabilityInterval;
  visualPriority: VisualPriority;
  protectedSubjectAnchors: ProtectedSubjectAnchor[];
  occlusionPolicy: OcclusionPolicy;
}

export class CompositionError extends Error {
  constructor(message: string) { super(message); this.name = "CompositionError"; }
}

/**
 * VALIDATE — called by the compiler. Refuses everything the order names, and **never invents a default that would
 * alter direction**: a missing field is an error, not a silent artistic choice.
 */
export function validateTypographyComposition(
  c: TypographyCompositionIntent,
  ctx: { objectExists: (id: string) => boolean; shotSpan: number; anchorResolvable: (subjectId: string, anchorId: string) => boolean },
): string[] {
  const p: string[] = [];
  if (!c.sourceObjectId) p.push("TypographyCompositionIntent declares no sourceObjectId");
  else if (!ctx.objectExists(c.sourceObjectId)) p.push(`TypographyCompositionIntent references object '${c.sourceObjectId}', which the film does not define`);

  if (!LAYOUT_POLICIES.includes(c.layoutPolicy)) p.push(`unknown layoutPolicy '${c.layoutPolicy}'`);
  else if (!IMPLEMENTED_LAYOUT_POLICIES.includes(c.layoutPolicy)) {
    /**
     * ⚠ AN UNIMPLEMENTED POLICY IS REFUSED, NOT IGNORED.
     *
     * `WRAP` and `AUTHOR_APPROVED_CROP` are declared so a plan can NAME them and be **rejected**. Accepting them
     * would silently crop or overflow a string, which is the failure the order forbids.
     */
    p.push(`layoutPolicy '${c.layoutPolicy}' is not implemented by this runtime; only ${IMPLEMENTED_LAYOUT_POLICIES.join(", ")} can be executed`);
  }

  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  for (const [name, r] of [["screenRegion", c.screenRegion]] as const) {
    if (!r) { p.push(`${name} is missing`); continue; }
    for (const k of ["x0", "y0", "x1", "y1"] as const) if (!finite(r[k])) p.push(`${name}.${k} is not finite (${String(r[k])})`);
    if (finite(r.x0) && finite(r.x1) && r.x1 <= r.x0) p.push(`${name} has a non-positive width (x0 ${r.x0} >= x1 ${r.x1})`);
    if (finite(r.y0) && finite(r.y1) && r.y1 <= r.y0) p.push(`${name} has a non-positive height (y0 ${r.y0} >= y1 ${r.y1})`);
    if (finite(r.x0) && finite(r.y0) && finite(r.x1) && finite(r.y1) && (r.x0 < 0 || r.y0 < 0 || r.x1 > 1 || r.y1 > 1)) {
      p.push(`${name} lies outside the screen (must be within 0..1)`);
    }
  }

  const ri = c.readabilityInterval;
  if (!ri) p.push("readabilityInterval is missing — a word with no authored readable window has no composition");
  else {
    if (!finite(ri.fromFrame) || !finite(ri.toFrame)) p.push("readabilityInterval frames are not finite");
    else {
      if (!Number.isInteger(ri.fromFrame) || !Number.isInteger(ri.toFrame)) p.push("readabilityInterval frames must be integers");
      if (ri.toFrame <= ri.fromFrame) p.push(`readabilityInterval [${ri.fromFrame}, ${ri.toFrame}) is empty or inverted`);
      if (ri.toFrame > ctx.shotSpan) p.push(`readabilityInterval ends at shot frame ${ri.toFrame} but the shot is only ${ctx.shotSpan} frames long`);
    }
    if (!ri.occupancy) p.push("readabilityInterval.occupancy is missing");
    else for (const k of ["width", "height"] as const) {
      if (!finite(ri.occupancy[k])) p.push(`readabilityInterval.occupancy.${k} is not finite (${String(ri.occupancy[k])})`);
      else if (ri.occupancy[k] <= 0 || ri.occupancy[k] > 1) p.push(`readabilityInterval.occupancy.${k} ${ri.occupancy[k]} is outside (0, 1]`);
    }
  }

  if (!VISUAL_PRIORITIES.includes(c.visualPriority)) p.push(`unknown visualPriority '${c.visualPriority}'`);
  if (!OCCLUSION_POLICIES.includes(c.occlusionPolicy)) p.push(`unknown occlusionPolicy '${c.occlusionPolicy}'`);

  if (!Array.isArray(c.protectedSubjectAnchors)) p.push("protectedSubjectAnchors must be an array");
  else if (c.occlusionPolicy === "PROTECT_SUBJECTS" && c.protectedSubjectAnchors.length === 0) {
    p.push("occlusionPolicy is PROTECT_SUBJECTS but no protectedSubjectAnchors are declared — nothing would be protected");
  } else for (const a of c.protectedSubjectAnchors) {
    if (!a.subjectId || !a.anchorId) { p.push("a protectedSubjectAnchor is missing subjectId or anchorId"); continue; }
    if (!ctx.anchorResolvable(a.subjectId, a.anchorId)) {
      p.push(`protectedSubjectAnchor '${a.subjectId}.${a.anchorId}' cannot be resolved — nothing would be protected at render time`);
    }
  }
  return p;
}

/**
 * ⚠ `visualPriority` MUST HAVE AN EXECUTION CONSEQUENCE OR NOT EXIST.
 *
 * The compiler accepted `PRIMARY` for three rounds while nothing read it, which is an **inert control** — the exact
 * failure class this project has recorded repeatedly. It now maps to an explicit compositing depth, so a declared
 * priority changes where the word sits relative to the architecture and the figure. The mapping is deliberately
 * narrow: it orders the word against the scene, and it does **not** licence placing anything at an extreme depth.
 */
export const PRIORITY_DEPTH: Record<VisualPriority, number> = {
  /** in front of the subject and the architecture, but not at an artificial extreme */
  PRIMARY: -0.60,
  /** beside the subject: readable, but not dominant */
  SECONDARY: 0.30,
  /** behind the architecture, part of the environment */
  TERTIARY: 7.50,
};
export function depthForPriority(p: VisualPriority): number {
  return PRIORITY_DEPTH[p];
}

/** Is this SHOT-RELATIVE frame inside the authored readable window? */
export function inReadabilityInterval(c: TypographyCompositionIntent, frameInShot: number): boolean {
  if (!Number.isFinite(frameInShot)) throw new CompositionError(`readability asked for a non-finite frame (${String(frameInShot)})`);
  return frameInShot >= c.readabilityInterval.fromFrame && frameInShot < c.readabilityInterval.toFrame;
}

/**
 * THE COMPOSITION RESOLVED FOR ONE FRAME — the value the runtime actually consumes.
 *
 * Outside the readable window the word is composed inside `screenRegion`. Inside it the word is composed inside
 * `occupancy`, which is larger, and that is what gives the letterforms enough output cells to be described.
 */
export interface ResolvedComposition {
  widthFraction: number; heightFraction: number;
  inReadableWindow: boolean;
  visualPriority: VisualPriority;
  occlusionPolicy: OcclusionPolicy;
  protectedSubjectAnchors: ProtectedSubjectAnchor[];
}
export function resolveComposition(c: TypographyCompositionIntent, frameInShot: number): ResolvedComposition {
  const readable = inReadabilityInterval(c, frameInShot);
  const r = c.screenRegion;
  return {
    widthFraction: readable ? c.readabilityInterval.occupancy.width : r.x1 - r.x0,
    heightFraction: readable ? c.readabilityInterval.occupancy.height : r.y1 - r.y0,
    inReadableWindow: readable,
    visualPriority: c.visualPriority,
    occlusionPolicy: c.occlusionPolicy,
    protectedSubjectAnchors: c.protectedSubjectAnchors.map((a) => ({ ...a })),
  };
}
