/**
 * SUBJECTFORM — WHAT A THING *IS*, AS OPPOSED TO HOW IT IS DRAWN.
 *
 * THE DISTINCTION THIS LAYER EXISTS TO MAKE, and the one Phase 3 could not express:
 *
 *     BOUNDARY  ≠  FORM  ≠  SUBJECT  ≠  MEANINGFUL OBJECT
 *
 * A rectangle around particles is not a room. A contour around a cluster is not a person. A dense band
 * of marks is not a written name. Phase 3 produced **boundaries** — it learned to contain a subject, to
 * fill a frame, to render a word as its own letters — and the visual review's last WEAK rating says
 * plainly what a boundary is not: **the marks do not resolve into recognisable things.**
 *
 * WHY THIS IS NOT ANOTHER OBJECT KIND. `AsciiObject` is a REPRESENTATION vocabulary: how marks are laid
 * out. A `SubjectForm` is a SEMANTIC vocabulary: what the marks ARE. Adding `shape` to the object list
 * would put a meaning into a representation enum, and the Director would then be choosing primitives
 * instead of choosing meaning. See `docs/ADR-SUBJECT-REPRESENTATION.md`.
 *
 * So a form sits ABOVE primitive type and compiles DOWN to one:
 *
 *     SubjectForm  ──compile──▶  AsciiObject[]  ──▶  SceneIR  ──▶  renderer
 *
 * The Director names a form. The compiler decides it is a polyline plus a dense band plus a few
 * anchors. Neither the Director nor the audience ever sees the primitives.
 */

import type { GlyphFamily } from "../../render/gpu/families.js";
import type { AsciiObject } from "../../ascii/objects.js";

/**
 * WHAT A THING IS VISUALLY.
 *
 * Deliberately small and closed. Every member must be something a viewer could name from a still
 * without being told — that is the test this phase is judged by, so the vocabulary is the audience's,
 * not the renderer's.
 */
export const SUBJECT_FORMS = [
  "human",
  "room",
  "door",
  "wall",
  "corridor",
  "window",
  "word",
  "symbol",
  "object",
  "circle",
  "void",
  "landscape",
  "machine",
  "unknown",
] as const;
export type SubjectFormKind = (typeof SUBJECT_FORMS)[number];

/**
 * HOW IMPORTANT THIS FORM IS TO READING THE FRAME.
 *
 * `essential` forms are the ones a viewer MUST identify for the film to communicate — Phase 3.1's
 * recognition review rates these CLEAR / AMBIGUOUS / UNREADABLE and the phase is PARTIAL if any
 * essential form is not CLEAR. `context` and `texture` forms may be ambiguous without failing.
 */
export type RecognitionPriority = "essential" | "context" | "texture";

/** A named point in the form's own local space, for placing and animating other things against it. */
export interface FormAnchor {
  /** stable id, e.g. "head", "left-hand", "doorway", "writing-surface" */
  id: string;
  /** local position, in form units */
  p: { x: number; y: number; z: number };
}

/**
 * DEPTH STRATEGY — how the form occupies the z axis.
 *
 * `flat`     everything on one plane; correct for a word written on a surface
 * `layered`  a small number of distinct planes; correct for architecture
 * `volume`   marks distributed through a region; correct for a cloud or a crowd
 * `recede`   marks whose depth increases with distance from an anchor; correct for a corridor
 */
export type DepthStrategy = "flat" | "layered" | "volume" | "recede";

/** A request from the Director about exposure. See `ExposureIntent` below for the authority rule. */
export const EXPOSURE_INTENTS = [
  "auto",
  "normal",
  "preserve-darkness",
  "preserve-emptiness",
  "high-key",
  "low-key",
  "silhouette",
] as const;
export type ExposureIntentKind = (typeof EXPOSURE_INTENTS)[number];

/**
 * EXPOSURE INTENT — DIRECTION, NOT A RENDERING SETTING.
 *
 * THE PROBLEM THIS FIXES, measured. `disappearing-room` is about a room that vanishes, and its lit-cell
 * range collapsed from **58× to 3.5×** across Phase 3. The cause is not a bug: the per-shot field
 * normaliser exposes every shot against *its own* measured highlights, so a shot that is authored to be
 * nearly empty gets lifted until it is not. **The normaliser acquired dramatic authority it should never
 * have had.**
 *
 * The brief's rule, and this ADR's decision:
 *
 *     DIRECTOR INTENT  >  EXPOSURE NORMALISER
 *
 * NOT the reverse. So intent is **typed**, declared by the Director on the ShotSpec, and the normaliser
 * must respect it. Explicitly **no numeric thresholds** — `if (negativeSpace > 0.8) disable()` is
 * forbidden, because it puts a rendering heuristic in charge of a narrative decision.
 *
 * Each intent names a *meaning*, and the renderer decides how to honour it:
 *
 *   auto                 no direction given; the normaliser may do whatever it measures
 *   normal               expose conventionally
 *   preserve-darkness    the shot is meant to be dark; do not lift it toward the midtones
 *   preserve-emptiness   the shot is meant to be almost empty; do not raise dim cells into visibility
 *   high-key             deliberately bright and low-contrast
 *   low-key              deliberately dark and high-contrast, with the subject still readable
 *   silhouette           the subject is a SHAPE against light; interior detail is not wanted
 *
 * The last is the one Phase 3.1 most needs: a person read as a silhouette is a form, whereas a person
 * read as a lit particle field is a texture.
 */
export interface ExposureIntent {
  kind: ExposureIntentKind;
  /** why the Director chose it, in the Director's own words; required, and surfaced in reports */
  reason: string;
}

/**
 * A SUBJECT FORM.
 *
 * Everything here is declarative: a form says what it is, where it is, how big, what is essential, and
 * where its anchors are. It does NOT contain glyphs, primitives or drawing calls — that is the
 * compiler's job, and keeping the split is what stops the Director from thinking in primitives.
 */
export interface SubjectForm {
  /** what this thing IS, in the audience's vocabulary */
  kind: SubjectFormKind;
  /** semantic role in the shot: protagonist, witness, environment, evidence, absence… */
  role: string;
  /** local origin, in world units */
  position: { x: number; y: number; z: number };
  /** intrinsic orientation, radians */
  rotation?: { x: number; y: number; z: number };
  /** uniform scale, in glyph cells per form unit */
  scale: number;

  /**
   * PRIMARY CONTOUR — the outline that makes this form recognisable at a glance.
   *
   * This is the single most important field. Phase 3's silhouettes proved that a contour is what turns
   * a texture into a thing; the difference here is that the contour is *of a form*, not of a bound.
   */
  contour: {
    /** closed outline in local space; the recognisable shape */
    points: Array<{ x: number; y: number; z: number }>;
    /** the character the contour is drawn with; "-" for architecture, "|" for uprights */
    glyph?: string;
    /** marks per form unit along the contour */
    density?: number;
  };

  /**
   * INTERNAL STRUCTURE — what fills the contour, so the form is not a hollow outline.
   *
   * An outline alone reads as a diagram. It is the interior that makes a room *enclosed* and a person
   * *solid*, and the reason this is a separate field from `contour` is that the two carry different
   * meanings and are often drawn in different glyph families.
   */
  interior?: {
    /** filled lattice inside the contour */
    lattice?: { cols: number; rows: number; spacing?: { x: number; y: number }; glyphs?: string; holes?: number };
    /** scattered marks inside the contour, for body, mass or crowd */
    cloud?: { count: number; bounds: { x: number; y: number; z: number }; glyphs?: string };
    /** lines drawn across the interior: floor lines, wall courses, ribs */
    rules?: Array<{ from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number }; glyph?: string; density?: number }>;
  };

  /**
   * PROMINENCE — HOW MUCH INK THIS FORM IS ENTITLED TO, RELATIVE TO THE OTHERS IN THE SHOT.
   *
   * THE PROBLEM THIS SOLVES, measured on the six-beat arc. Total ink across the beats was
   * **271 (ROOM) -> 292 (NAME ON WALL) -> 386 (PERSON)**, which means the NAME contributed **+21 ink
   * against a frame holding ~290 — about 7%.** So the name's erasure was nearly invisible in aggregate
   * (beats 4 and 5 differed by 8 ink units) even though every beat was individually correct.
   *
   * **The name is the subject of its shot and nothing weighted it as such.** Every form competed
   * equally for the frame, so the environment always won on total ink.
   *
   * This is the same structural pattern Phase 3 found six times — a per-shot quantity small relative to
   * a frame-wide constant — and the fix is the same shape as `ExposureIntent`: **let the Director
   * declare a hierarchy rather than have the renderer impose one.**
   *
   * - `1.0` (default) the form renders at full strength
   * - `> 1` the form is given more ink; the Director is saying "this shot is ABOUT this"
   * - `< 1` the form recedes, becoming context rather than subject
   * - `0` the form is present but contributes nothing (equivalent to `erase`)
   *
   * Deliberately NOT a per-form brightness constant in the renderer: it is declared per form per shot,
   * so the same room can be a full subject in one beat and a fading environment in the next.
   */
  prominence?: number;
  /** how the form occupies depth */
  depth: DepthStrategy;
  /** which glyph family the form speaks in */
  glyphFamily?: GlyphFamily | "printable";
  /** how important this form is to reading the frame */
  recognition: RecognitionPriority;
  /** named points other things can be placed against — a hand reaching, a wall to write on */
  anchors: FormAnchor[];
  /** exposure direction attached to this form, if it carries one */
  exposure?: ExposureIntent;

  /**
   * AN OBJECT THIS FORM PLACES. Used for a word on a wall, a door in a boundary — a form that contains
   * another form at one of its own anchors. Kept as a reference so the compiler resolves it, and so a
   * form never has to know how its child is drawn.
   */
  hosts?: Array<{ formKind: SubjectFormKind; atAnchor: string; word?: string }>;

  /**
   * THE TEXT THIS FORM IS, for `kind: "word"` and `kind: "symbol"`.
   *
   * ⚠ ADDED BECAUSE THE FORM WAS INVISIBLE TO EVERY CHECK. `compileForm` emits a contour, an interior
   * lattice, clouds and rules — and **a word form has none of those.** `letterformObjects` is what
   * actually draws the letters, and `wordForm` never called it, so a `word` form compiled to **zero
   * objects**. Measured: the audit run reported `name: objects 0, world x Infinity..-Infinity`.
   *
   * That had two consequences, both bad:
   *   - the form-collision audit **could not see the word at all**, so it reported every composition clear
   *   - the only reason the name ever rendered in `forgotten-name` is that the authoring script called
   *     `letterformObjects` **separately**, outside the form system entirely
   *
   * So the letters were never part of the form. `text` closes that gap: `compileForm` now emits the
   * letterforms itself, which means the form's own extent, its collision box and the SceneIR route all
   * include them.
   */
  text?: string;
}

/** The result of compiling a form: the primitives it becomes, plus what it reported. */
export interface CompiledForm {
  objects: AsciiObject[];
  /** anchor positions resolved into world space, so callers can place things against them */
  anchors: Record<string, { x: number; y: number; z: number }>;
  /** what a recognition review should be able to see; carried into reports */
  expectation: { kind: SubjectFormKind; recognition: RecognitionPriority };
}
