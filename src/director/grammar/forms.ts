/**
 * THE FORM GRAMMAR — what each SubjectForm is made of.
 *
 * WHY THIS FILE IS THE POINT OF PHASE 3.1. Phase 3 could draw a boundary around anything; its visual
 * review's last WEAK rating says the marks never resolve into *recognisable things*. The gap is not
 * rendering quality. It is that nothing in the pipeline ever said **"this is a person"** — only "this is
 * a dense region about 1.4 units wide".
 *
 * So each form here declares what a viewer must be able to name, and what parts produce that reading.
 * The parts are deliberately FEW and SCHEMATIC. A person is a head, shoulders, a spine, a pelvis and
 * four limbs — not anatomy. **Recognition through abstraction**, which is what an ASCII cinema can
 * actually do well, and what the brief asks for.
 *
 * NO ANATOMICAL TABLES, NO IMPORTED ARTWORK. Everything below is arithmetic on points.
 */

import type {
  SubjectForm,
  SubjectFormKind,
  CompiledForm,
  RecognitionPriority,
} from "./subject-form.js";
import type { AsciiObject } from "../../ascii/objects.js";
import { GLYPH_W, GLYPH_H, TYPEFACE } from "../../glyphs/atlas.js";

// ---------------------------------------------------------------------------
// form definitions
// ---------------------------------------------------------------------------

/** What each form guarantees a viewer can see, and how much it matters. */
export interface FormDefinition {
  kind: SubjectFormKind;
  /** the one-line statement a recognition review can be written against */
  expectation: string;
  recognition: RecognitionPriority;
  /** what it compiles to, named so a report can state it without inspecting primitives */
  components: string[];
  /** whether it can host a diegetic word on one of its anchors */
  hostSurface?: string;
}

export const FORM_DEFINITIONS: Record<SubjectFormKind, FormDefinition> = {
  human: {
    kind: "human",
    expectation: "a standing or moving FIGURE: a head above shoulders, a trunk, two legs",
    recognition: "essential",
    components: ["head", "shoulders", "spine", "pelvis", "arms", "legs"],
    hostSurface: "writing-surface",
  },
  room: {
    kind: "room",
    expectation: "an INTERIOR: a floor line, a back wall, two side boundaries converging",
    recognition: "essential",
    components: ["floor", "back-wall", "left-boundary", "right-boundary"],
    hostSurface: "back-wall",
  },
  door: {
    kind: "door",
    expectation: "an OPENING in a surface: a tall rectangle interrupting a boundary",
    recognition: "context",
    components: ["frame", "threshold"],
  },
  wall: {
    kind: "wall",
    expectation: "a SURFACE: a broad rectangle facing the camera",
    recognition: "context",
    components: ["face", "base-line"],
    hostSurface: "face",
  },
  corridor: {
    kind: "corridor",
    expectation: "RECESSION: boundaries converging toward a distant vanishing region",
    recognition: "context",
    components: ["left-wall", "right-wall", "ceiling", "floor", "vanishing"],
  },
  window: {
    kind: "window",
    expectation: "a BRIGHT OPENING in a surface, crossing-mullioned",
    recognition: "context",
    components: ["frame", "mullion"],
  },
  word: {
    kind: "word",
    expectation: "READABLE LETTERFORMS occupying a definite place",
    recognition: "essential",
    components: ["letterforms"],
  },
  symbol: {
    kind: "symbol",
    expectation: "a single large MARK, readable as one sign rather than as texture",
    recognition: "context",
    components: ["mark"],
  },
  object: {
    kind: "object",
    expectation: "a BOUNDED THING with a silhouette distinct from its surroundings",
    recognition: "context",
    components: ["contour", "body"],
  },
  circle: {
    kind: "circle",
    expectation: "a closed RING",
    recognition: "context",
    components: ["ring"],
  },
  void: {
    kind: "void",
    expectation: "EMPTINESS: the absence of marks where marks are expected",
    recognition: "essential",
    components: [],
  },
  landscape: {
    kind: "landscape",
    expectation: "HORIZON: a low horizontal division with mass below and space above",
    recognition: "context",
    components: ["horizon", "ground"],
  },
  machine: {
    kind: "machine",
    expectation: "STRUCTURE: repeated rigid members in a right-angled arrangement",
    recognition: "context",
    components: ["frame", "members"],
  },
  unknown: {
    kind: "unknown",
    expectation: "an unattributed mass",
    recognition: "texture",
    components: ["body"],
  },
};

// ---------------------------------------------------------------------------
// the human grammar
// ---------------------------------------------------------------------------

/**
 * THE HUMAN PROPORTIONS USED HERE, and why they are these numbers.
 *
 * A recognisable standing figure needs the proportions a viewer already carries, and those are
 * conventional rather than realistic: roughly **seven to eight head-heights**, shoulders about two
 * head-widths, legs about half the total height. Getting these wrong is the difference between "a
 * person" and "a blob with a bump", so they are stated as named constants rather than inlined.
 *
 * Units are form units; `SubjectForm.scale` converts to glyph cells. The figure is built with its FEET
 * at y = 0 so that placing it on a floor line is a position, not an offset calculation.
 *
 * ⚠ THE UNIT CONTRACT, learned by measuring. `rasteriseObject` lays marks at **one glyph cell per local
 * unit** — a line from x=0 to x=4 at density 1 emits five placements, one per cell. So a figure whose
 * proportions are expressed in 0..1 FORM UNITS IS ONE CELL TALL, and at scale 1 its shoulder line
 * (0.28 units) emitted **three marks**. The first rendering of this grammar produced a five-cell
 * smudge that read as nothing at all.
 *
 * The proportions below stay normalised, because ratios are easier to reason about than cell counts.
 * `HUMAN_CELL_HEIGHT` converts them, and the compiler multiplies by `form.scale` on top — so a form's
 * `scale` is a MULTIPLIER on a sensible default, which is what a director expects, rather than a
 * magic number that has to be guessed.
 */
export const HUMAN_PROPORTIONS = {
  /** total standing height, in form units */
  height: 1.0,
  /** head diameter */
  head: 0.125,
  /** shoulder half-width */
  shoulderHalf: 0.14,
  /** hip half-width */
  hipHalf: 0.1,
  /** centre of the head, measured up from the feet */
  headCentreY: 1.0 - 0.0625,
  /** shoulder line */
  shoulderY: 0.78,
  /** hip line */
  hipY: 0.48,
  /** knee line */
  kneeY: 0.24,
  /** elbow line */
  elbowY: 0.6,
  /** hand line, hanging */
  handY: 0.44,
  /** lateral distance of a hanging hand from the centre */
  handX: 0.17,
} as const;

/**
 * THE UNIT CONTRACT, AND THE TWO WRONG ANSWERS THAT LED TO IT.
 *
 * **Everything in this file is in WORLD UNITS, not glyph cells.** Object *positions* are world-space and
 * are projected by the camera before becoming cells; only each object's own local `spacing` and
 * `glyphRadius` are in cells.
 *
 * That took two measured failures to establish:
 *
 *   1. With proportions in **0..1 form units**, a figure at scale 1 was ONE CELL TALL — its shoulder
 *      line (0.28 units) emitted three marks, and the whole figure was a five-cell smudge.
 *   2. Multiplying by 35 to get "cells" made the figure **35 WORLD UNITS** tall. The camera at
 *      `focusDistance` 120 sees a visible height of `rows / worldToCells` = 2.4 world units, so the
 *      figure overfilled the frame and the entire three-prototype render produced **4 lit cells**.
 *
 * So a form's natural size is stated in WORLD UNITS, derived from what the camera actually shows. The
 * scale is then a plain multiplier on a sensible default, which is what a director expects.
 *
 * **The frame is TWO world units tall** for a typical shot (`focusDistance` ≈ 30, `worldToCells` = 60),
 * and 4.0 wide at 16:9. Figures below are chosen against that.
 */
/**
 * ⚠ THE CONVERSION RULE, MEASURED — this supersedes every guess above, including two of mine.
 *
 * A rendered ruler of known world length, at known `focusDistance`, measured from the output grid:
 *
 *     focusDistance   ruler length   cells spanned   cells per world unit
 *     2.40            1.0            11              11.0
 *     2.40            2.0            23              11.5
 *     2.18            1.0            15              15.0
 *     2.18            2.0            27              13.5
 *     10.00           1.0             1               1.0
 *     10.00           2.0             3               1.5
 *
 * The counts are low because a sparse line ends inclusive; the underlying rule is exact and comes from
 * `worldToCells = rows / visibleHeight` with `visibleHeight = 2 * focusDistance`:
 *
 *     cells per world unit  =  rows / (2 * focusDistance)  =  60 / focusDistance
 *
 * | `focusDistance` | cells per world unit |
 * |---|---|
 * | 2.4 | 25 |
 * | 2.18 | 27.5 |
 * | 10 | 6 |
 *
 * **The corpus frames at `focusDistance` 2.2–2.7, so a form is seen at 22–27 cells per world unit.**
 *
 * This is the fact two rounds of form work failed on, twice in opposite directions:
 *   - proportions in 0..1 units → a figure **1 cell** tall, a five-cell smudge;
 *   - multiplied to "cells" → a figure **35 world units**, when the camera sees 4.36, giving **4 lit
 *     cells** for an entire three-prototype render.
 *
 * The mistake both times was scaling against an absolute unit instead of against **what the camera
 * actually sees**. The numbers below are therefore derived from `60 / focusDistance`, not chosen.
 */
export const CELLS_PER_WORLD_UNIT_AT = (focusDistance: number): number => 60 / focusDistance;

/**
 * ⚠ THE ANALYTIC RULE IS WRONG BY ~2.4x, AND MEASUREMENT WINS.
 *
 * `60 / focusDistance` is what the source implies (`worldToCells = rows / (2 * baseDist)`), and it
 * predicts 25 cells per world unit at `focusDistance` 2.4. **Two independent measurements on that
 * camera both disagree:**
 *
 *   - a rendered ruler of known world length spanned **11 cells per unit** (11.0 at length 1.0, 11.5 at
 *     length 2.0)
 *   - isolated joint markers spanning a predicted **32.8 cells** vertically measured **15**
 *
 * Both land near **10.5**, and both agree with each other, so the discrepancy is in my reading of the
 * source rather than in the measurements. **The empirical value is used, the analytic one is kept for
 * the record, and the disagreement is left visible rather than papered over** — a number I derived from
 * source that two measurements contradict is exactly the sort of claim this project has learned not to
 * trust.
 *
 * The residual is NOT chased further, because it cannot change what the forms must do: a form's size
 * has to come from what the camera actually renders, and the remedy below is calibrated on rendered
 * output in both directions.
 */
export const MEASURED_CELLS_PER_UNIT = 10.5;

/**
 * Convert a target CELL height into the world height that actually produces it.
 *
 * Calibrated at both ends rather than extrapolated from one point:
 *   - `HUMAN_WORLD_HEIGHT` 1.4 measured 15 cells against a target of ~35
 *   - the markers confirmed the same ~10.5 cells-per-unit rate in an independent scene
 *
 * so the correction is a plain ratio, applied once and stated here.
 */
export const CELL_CALIBRATION = 35 / 15;

/** What the camera sees at the corpus framing, in world units. */
export const CORPUS_FRAME_WORLD = { height: 4.8, width: 8.53 } as const;

/** A person at roughly 29% of frame height — 35 cells tall, which is where "a person" reads. */
export const HUMAN_WORLD_HEIGHT = 1.4 * CELL_CALIBRATION;

/** A room spanning most of the visible width, so its convergence is legible. */
export const ROOM_WORLD_EXTENT = { width: 7.2, height: 3.6, depth: 3.2 } as const;

/** The poses a figure can hold. Schematic is the point; readability is the requirement. */
export const HUMAN_POSES = ["stand", "walk", "turn", "reach", "collapse"] as const;
export type HumanPose = (typeof HUMAN_POSES)[number];

/**
 * POSE MODIFIERS.
 *
 * Each pose moves joints by a small, stated amount. `stand` is the reference — the neutral figure the
 * proportions above describe — and every other pose is expressed as a delta from it, so the figure
 * stays the same person across a shot rather than being redrawn per pose.
 *
 * These are deliberately crude. A `walk` is one leg forward and one back; a `reach` is one arm raised to
 * a point; a `collapse` is the whole figure compressed toward the floor with the head dropped. At glyph
 * resolution that is enough — and adding anatomical degrees of freedom would produce detail the lattice
 * cannot show, which is the same mistake as drawing an outline around every subject in Phase 3.
 */
export interface PoseModifier {
  /** added to the head centre */
  headDy: number;
  /** how far the arms swing forward/back, in form units */
  armSwing: number;
  /** extra lateral splay of the legs, for a stride */
  strideX: number;
  /** 0..1 vertical compression, applied toward the feet — 1 is full height */
  compress: number;
}

export const POSE_MODIFIERS: Record<HumanPose, PoseModifier> = {
  stand: { headDy: 0, armSwing: 0, strideX: 0, compress: 1 },
  walk: { headDy: -0.01, armSwing: 0.06, strideX: 0.05, compress: 1 },
  turn: { headDy: 0, armSwing: 0, strideX: 0.02, compress: 0.99 },
  reach: { headDy: 0.01, armSwing: 0.22, strideX: 0, compress: 1 },
  collapse: { headDy: -0.12, armSwing: 0.1, strideX: 0.12, compress: 0.45 },
};

/**
 * Build the joint positions of a human figure in local space, feet at y = 0.
 *
 * Returns named joints so the compiler — and any form that needs to place something against a hand —
 * works from the same skeleton rather than re-deriving it.
 */
export function humanJoints(pose: HumanPose = "stand"): Record<string, { x: number; y: number; z: number }> {
  const P = HUMAN_PROPOSALS_GUARD();
  const m = POSE_MODIFIERS[pose];
  const s = m.compress;
  // normalised proportions -> world units
  const U = HUMAN_WORLD_HEIGHT;
  const y = (v: number) => v * s * U;
  const arm = m.armSwing;
  const str = m.strideX;
  return {
    head: { x: 0, y: y(P.headCentreY + m.headDy), z: 0 },
    neck: { x: 0, y: y(P.shoulderY + 0.03), z: 0 },
    "shoulder-left": { x: -P.shoulderHalf * U, y: y(P.shoulderY), z: 0 },
    "shoulder-right": { x: P.shoulderHalf * U, y: y(P.shoulderY), z: 0 },
    pelvis: { x: 0, y: y(P.hipY), z: 0 },
    "hip-left": { x: -P.hipHalf * U, y: y(P.hipY), z: 0 },
    "hip-right": { x: P.hipHalf * U, y: y(P.hipY), z: 0 },
    "elbow-left": { x: (-P.shoulderHalf - 0.02) * U, y: y(P.elbowY) + arm * U, z: 0 },
    "elbow-right": { x: (P.shoulderHalf + 0.02) * U, y: y(P.elbowY) - arm * U, z: 0 },
    "hand-left": { x: -P.handX * U, y: y(P.handY) + arm * 1.8 * U, z: 0 },
    "hand-right": { x: P.handX * U, y: y(P.handY) - arm * 1.8 * U, z: 0 },
    "knee-left": { x: -str * U, y: y(P.kneeY), z: 0 },
    "knee-right": { x: str * U, y: y(P.kneeY), z: 0 },
    "foot-left": { x: (-str - 0.02) * U, y: 0, z: 0 },
    "foot-right": { x: (str + 0.02) * U, y: 0, z: 0 },
  };
}

/** Keeps the proportions table immutable at the call site while reading naturally above. */
function HUMAN_PROPOSALS_GUARD() {
  return HUMAN_PROPORTIONS;
}

// ---------------------------------------------------------------------------
// compilation: a form becomes primitives
// ---------------------------------------------------------------------------

/**
 * Compile a `SubjectForm` into ASCII objects.
 *
 * This is the one place that knows how a meaning becomes marks. Everything downstream — SceneIR, the
 * CPU renderer, the GPU renderer — sees only the objects, which is what lets the two renderers produce
 * **semantically equivalent** output without being pixel-identical: they agree on the form, and differ
 * only in how they composite it.
 */
export function compileForm(form: SubjectForm): CompiledForm {
  const objects: AsciiObject[] = [];
  const anchors: Record<string, { x: number; y: number; z: number }> = {};
  const base = form.position;
  /**
   * PROMINENCE IS APPLIED TO EVERY OBJECT THE FORM EMITS, at one place, so no form has to remember it.
   *
   * It multiplies the object's `opacity`, which the native-object path now honours (Appendix H). A form
   * with `prominence: 2` deposits twice the ink of the same form at 1, and a form at `0.3` recedes into
   * context — which is how a shot declares what it is ABOUT.
   */
  const prom = Math.max(0, form.prominence ?? 1);

  /**
   * PROMINENCE WALKS THE GLYPH, NOT ONLY THE INK — and Appendix I is why.
   *
   * `prominence` was first implemented as an opacity multiplier, and measured it was **weak in the
   * image**: with near-fully-covered characters the deposited ink barely changes displayed brightness,
   * so weighting a form 2.0 bought far less contrast than the number implied. The same saturation limit
   * was found independently for `erase` (Appendix I): the display pipeline derives brightness from a
   * glyph's OWN coverage, so ink alone cannot brighten or dim a form that is already drawn with `#`.
   *
   * So a form's prominence selects the **character ladder** it draws with. This is the ASCII-native
   * lever: the medium's brightness IS the glyph, so hierarchy belongs in the character set.
   *
   *   prominence >= 2.0   '#'  heaviest
   *   1.5 .. 2.0          '%'
   *   1.0 .. 1.5          '+'  (and anything above 1 also keeps its full ink)
   *   0.6 .. 1.0          the form's OWN glyph, unchanged — the default must not alter existing output
   *   0.3 .. 0.6          ':'
   *   < 0.3               '.'
   *
   * The band from 0.6 to 1.0 deliberately returns the form's own glyph, so **every default form renders
   * byte-identically to before** and only a deliberately receding or emphasised form changes.
   */
  const promGlyph = (own: string): string => {
    if (prom >= 2) return "#";
    if (prom >= 1.5) return "%";
    if (prom > 1) return "+";
    if (prom >= 0.6) return own;
    if (prom >= 0.3) return ":";
    return ".";
  };
  const at = (p: { x: number; y: number; z: number }) => ({
    x: base.x + p.x * form.scale,
    y: base.y + p.y * form.scale,
    z: base.z + p.z * form.scale,
  });

  // the primary contour, closed, in the form's own orientation
  if (form.contour.points.length >= 2) {
    objects.push({
      kind: "polyline",
      id: `${form.role}-${form.kind}-contour`,
      position: base,
      rotation: form.rotation,
      scale: form.scale,
      points: form.contour.points,
      closed: true,
      density: form.contour.density ?? 12,
      glyph: promGlyph(form.contour.glyph ?? "-"),
      glyphFamily: form.glyphFamily ?? "architectural",
      intensity: 1,
      opacity: Math.min(1, prom),
    } as AsciiObject);
  }

  // internal structure: the rules and lattices that stop an outline being a diagram
  const interior = form.interior;
  if (interior?.rules) {
    interior.rules.forEach((r, i) => {
      objects.push({
        kind: "line",
        id: `${form.role}-${form.kind}-rule-${i}`,
        position: base,
        rotation: form.rotation,
        scale: form.scale,
        from: r.from,
        to: r.to,
        density: r.density ?? 10,
        glyph: promGlyph(r.glyph ?? "-"),
        glyphFamily: form.glyphFamily ?? "architectural",
        intensity: 1,
        opacity: Math.min(1, prom),
      } as AsciiObject);
    });
  }
  if (interior?.lattice) {
    objects.push({
      kind: "grid",
      id: `${form.role}-${form.kind}-interior`,
      position: base,
      rotation: form.rotation,
      scale: form.scale,
      plane: "xy",
      cols: interior.lattice.cols,
      rows: interior.lattice.rows,
      spacing: interior.lattice.spacing ?? { x: 2, y: 2 },
      glyphs: interior.lattice.glyphs ?? ".:'",
      holes: interior.lattice.holes ?? 0.75,
      intensity: 1,
      opacity: Math.min(1, prom),
    } as AsciiObject);
  }
  if (interior?.cloud) {
    objects.push({
      kind: "cloud",
      id: `${form.role}-${form.kind}-body`,
      position: base,
      rotation: form.rotation,
      scale: form.scale,
      count: interior.cloud.count,
      bounds: interior.cloud.bounds,
      glyphs: interior.cloud.glyphs ?? ".:'",
      intensity: 1,
      opacity: prom,
    } as AsciiObject);
  }

  /**
   * LETTERFORMS, WHEN THE FORM IS A WORD. See `SubjectForm["text"]` — a word form previously compiled to
   * ZERO objects because `letterformObjects` was never called here, which made the word invisible to the
   * collision audit and left the authoring scripts drawing letters outside the form system.
   */
  if (form.text) {
    objects.push(...letterformObjects({
      text: form.text,
      role: form.role,
      position: base,
      height: 0.62 * (form.scale ?? 1),
      tracking: 0.9,
      align: "centre",
      erase: (form as { erase?: number }).erase ?? 0,
      glyphFamily: form.glyphFamily ?? "printable",
    }));
  }

  // anchors resolve into world space so other forms can be placed against them
  for (const a of form.anchors) anchors[a.id] = at(a.p);

  return {
    objects,
    anchors,
    expectation: { kind: form.kind, recognition: form.recognition },
  };
}

/**
 * Build a human form.
 *
 * A convenience over `compileForm` because a human is the one form whose *parts* carry the meaning: an
 * outline of a person is a diagram, and it is the limb forking and the head separated from the shoulders
 * that make a viewer say "person". The joints come from `humanJoints`, so the same skeleton drives
 * `stand`, `walk`, `reach` and `collapse`.
 */
export function humanForm(opts: {
  role: string;
  position: { x: number; y: number; z: number };
  scale: number;
  pose?: HumanPose;
  recognition?: RecognitionPriority;
  exposure?: SubjectForm["exposure"];
  /** how much ink this figure is entitled to relative to the shot's other forms */
  prominence?: number;
  /**
   * LATERAL WIDENING.
   *
   * The recognition review rated the human UNREADABLE and identified the cause as **proportion, not
   * construction**: the skeleton is right, the contour trace is right, but the figure renders at about
   * a quarter of the frame width to a third of its height, so the arm and leg gaps that carry the
   * entire reading are one or two cells wide and vanish into the glyph grid.
   *
   * A person at this aspect is closer to a post. A 1.9 bias is stated here rather than hidden in the
   * proportions table so it is obvious that the figure is deliberately WIDE — the audience reads
   * silhouette, not anatomy, and this engine cannot afford anatomical slenderness.
   */
  widthBias?: number;
}): SubjectForm {
  const j0 = humanJoints(opts.pose ?? "stand");
  const P = HUMAN_PROPORTIONS;
  const WB = opts.widthBias ?? 1.0;
  // widen every lateral joint coordinate; vertical stays untouched so the figure keeps its height
  const j: typeof j0 = Object.fromEntries(
    Object.entries(j0).map(([k, v]) => [k, { x: v.x * WB, y: v.y, z: v.z }]),
  ) as typeof j0;
  const line = (a: string, b: string) => ({ from: j[a]!, to: j[b]! });

  return {
    kind: "human",
    role: opts.role,
    position: opts.position,
    scale: opts.scale,
    depth: "flat",
    glyphFamily: "organic",
    recognition: opts.recognition ?? "essential",
    prominence: opts.prominence,
    exposure: opts.exposure,
    /**
     * THE CONTOUR IS A SILHOUETTE TRACE, NOT A HULL, and the difference is the whole form.
     *
     * A convex hull around a stick figure is a CAPSULE. Rendered, it produced a uniform-width column
     * with rounded corners — measured at ~1/4 width-to-height where a person is ~1/3.5, and visually a
     * rounded post rather than a figure. The hull is every joint's bounding shape, so it cannot contain
     * the one thing that makes a person read at glyph resolution: **negative space.**
     *
     * What makes a person recognisable in a few dozen marks is not the mass. It is:
     *
     *   - **the gap between the arms and the torso** — this is the single strongest cue, and a hull
     *     removes it entirely by definition
     *   - **the gap between the two legs**, which starts at the crotch and widens to the feet
     *   - **square shoulders** above a narrower neck, giving the head a place to sit
     *
     * So the contour now TRACES the figure: down one side, out along an arm, back in, past the hip, out
     * along a leg, and up the other side. It is longer than a hull and it is the correct shape.
     *
     * ORDER MATTERS. The trace runs clockwise from the left shoulder and closes, so the polyline does
     * not cross itself — a self-crossing trace fills the arm gap back in and undoes the entire point.
     */
    contour: {
      points: [
        // head: a small box, so there is a head rather than a bump
        { x: -P.head * 0.55 * HUMAN_WORLD_HEIGHT, y: j["head"]!.y + P.head * 0.75 * HUMAN_WORLD_HEIGHT, z: 0 },
        { x: P.head * 0.55 * HUMAN_WORLD_HEIGHT, y: j["head"]!.y + P.head * 0.75 * HUMAN_WORLD_HEIGHT, z: 0 },
        // down the right of the neck, then SQUARE out to the shoulder point
        { x: P.head * 0.4 * HUMAN_WORLD_HEIGHT, y: j["neck"]!.y, z: 0 },
        { x: j["shoulder-right"]!.x, y: j["shoulder-right"]!.y, z: 0 },
        // the right arm, held CLEAR of the torso: out and down along its own line
        { x: j["elbow-right"]!.x, y: j["elbow-right"]!.y, z: 0 },
        { x: j["hand-right"]!.x, y: j["hand-right"]!.y, z: 0 },
        // back up the inside of the arm to the armpit, then down the flank to the hip
        { x: j["shoulder-right"]!.x * 0.62, y: j["elbow-right"]!.y, z: 0 },
        { x: j["hip-right"]!.x, y: j["hip-right"]!.y, z: 0 },
        // the right leg: out to the knee, out to the foot
        { x: j["knee-right"]!.x + P.hipHalf * 0.35 * HUMAN_WORLD_HEIGHT, y: j["knee-right"]!.y, z: 0 },
        { x: j["foot-right"]!.x, y: 0, z: 0 },
        // the gap between the feet — the second strongest cue
        { x: j["foot-left"]!.x, y: 0, z: 0 },
        { x: j["knee-left"]!.x - P.hipHalf * 0.35 * HUMAN_WORLD_HEIGHT, y: j["knee-left"]!.y, z: 0 },
        { x: j["hip-left"]!.x, y: j["hip-left"]!.y, z: 0 },
        // up the left flank, inside the left arm
        { x: j["shoulder-left"]!.x * 0.62, y: j["elbow-left"]!.y, z: 0 },
        { x: j["hand-left"]!.x, y: j["hand-left"]!.y, z: 0 },
        { x: j["elbow-left"]!.x, y: j["elbow-left"]!.y, z: 0 },
        { x: j["shoulder-left"]!.x, y: j["shoulder-left"]!.y, z: 0 },
        { x: -P.head * 0.4 * HUMAN_WORLD_HEIGHT, y: j["neck"]!.y, z: 0 },
      ],
      glyph: "|",
      density: 10,
    },
    interior: {
      rules: [
        // the trunk: spine and pelvis, so the figure is not hollow
        line("neck", "pelvis"),
        // shoulders: the single most person-making line in the whole grammar
        line("shoulder-left", "shoulder-right"),
        // hips
        line("hip-left", "hip-right"),
        // arms
        line("shoulder-left", "elbow-left"),
        line("elbow-left", "hand-left"),
        line("shoulder-right", "elbow-right"),
        line("elbow-right", "hand-right"),
        // legs
        line("hip-left", "knee-left"),
        line("knee-left", "foot-left"),
        line("hip-right", "knee-right"),
        line("knee-right", "foot-right"),
      ].map((r) => ({ ...r, glyph: "|", density: 8 })),
      // a sparse body so the figure reads as solid rather than as a wire diagram
      cloud: {
        count: 90,
        bounds: { x: P.shoulderHalf * HUMAN_WORLD_HEIGHT, y: P.height * 0.5 * HUMAN_WORLD_HEIGHT, z: 0.5 },
        glyphs: ".:'",
      },
    },
    anchors: [
      { id: "head", p: j["head"]! },
      { id: "hand-left", p: j["hand-left"]! },
      { id: "hand-right", p: j["hand-right"]! },
      { id: "feet", p: { x: 0, y: 0, z: 0 } },
      // the surface a person could write on or touch: at head height, in front of the figure
      { id: "writing-surface", p: { x: 0, y: j["shoulder-right"]!.y, z: -8 } },
    ],
  };
}

// ---------------------------------------------------------------------------
// architecture: the room
// ---------------------------------------------------------------------------

/**
 * HOW BIG A ROOM IS, IN GLYPH CELLS.
 *
 * The lattice is 240 x 120. A room that fills the frame with margins is about **170 cells wide and 95
 * tall**, which leaves room for a camera to move inside it. Stated here for the same reason as
 * `HUMAN_CELL_HEIGHT`: every form declares its own natural size in the medium's own unit.
 */


/**
 * A ROOM, IN ONE-POINT PERSPECTIVE.
 *
 * WHAT MAKES A ROOM READ AS A ROOM, and it is not a rectangle. A rectangle is a boundary. Three things
 * turn it into an interior, and this form is built from exactly those:
 *
 *   1. a BACK WALL — a surface facing the camera, smaller than the frame
 *   2. SIDE BOUNDARIES that CONVERGE toward it — the convergence IS the depth, and without it the four
 *      lines are a picture frame
 *   3. a FLOOR and CEILING line, so the eye reads a ground plane and a ceiling rather than a box
 *
 * A single opening (a door or window) is included by default because **a room with a way out reads as a
 * place**, and a sealed box reads as a diagram. That is a compositional claim, not a technical one, and
 * it is worth stating because it is the kind of thing a later form should be able to override.
 */
export function roomForm(opts: {
  role: string;
  /** where the back wall's centre sits */
  position: { x: number; y: number; z: number };
  scale?: number;
  /** how much the side boundaries converge: 0 is a flat wall, 0.5 is a deep room */
  convergence?: number;
  /** an opening in the back wall, as a fraction of its width and height */
  opening?: { atX: number; width: number; height: number } | null;
  recognition?: RecognitionPriority;
  exposure?: SubjectForm["exposure"];
  /** how much ink this room is entitled to relative to the shot's other forms */
  prominence?: number;
}): SubjectForm {
  const E = ROOM_WORLD_EXTENT;
  const s = opts.scale ?? 1;
  const conv = opts.convergence ?? 0.42;
  const bw = (E.width / 2) * s;        // back-wall half-width
  const bh = (E.height / 2) * s;       // back-wall half-height
  // the front of the room is larger than the back by the convergence factor: that difference is depth
  const fw = bw / Math.max(0.2, 1 - conv);
  const fh = bh / Math.max(0.2, 1 - conv);
  const zBack = 0;
  const zFront = E.depth * s;

  const corners = {
    "back-tl": { x: -bw, y: bh, z: zBack },
    "back-tr": { x: bw, y: bh, z: zBack },
    "back-br": { x: bw, y: -bh, z: zBack },
    "back-bl": { x: -bw, y: -bh, z: zBack },
    "front-tl": { x: -fw, y: fh, z: zFront },
    "front-tr": { x: fw, y: fh, z: zFront },
    "front-br": { x: fw, y: -fh, z: zFront },
    "front-bl": { x: -fw, y: -fh, z: zFront },
  };

  /**
   * ⚠ DENSITY IS MARKS PER WORLD UNIT, AND 1.2 IS ONE MARK EVERY ~8 CELLS.
   *
   * The first room render drew every edge as a row of DISCONNECTED DOTS — corners marked, nothing
   * joined — because these rules used `density` 1.2 while the corpus framing shows ~10.5 cells per
   * world unit. A line needs about one mark per cell, so a wall edge needs `density` near 10, not 1.2.
   *
   * This is the same unit trap that cost rounds on the human's size, in a different field: `density`
   * is per world unit, while `spacing` on a lattice is per CELL. The room's edges are world-space
   * lines, so they take the world-unit value.
   */
  const WALL_DENSITY = 11;
  const wallRules: Array<{ from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number }; glyph?: string; density?: number }> = [
    // the back wall itself: the primary reading surface, and where a name would be written
    { from: corners["back-tl"], to: corners["back-tr"], glyph: "-", density: WALL_DENSITY },
    { from: corners["back-tr"], to: corners["back-br"], glyph: "|", density: WALL_DENSITY },
    { from: corners["back-br"], to: corners["back-bl"], glyph: "-", density: WALL_DENSITY },
    { from: corners["back-bl"], to: corners["back-tl"], glyph: "|", density: WALL_DENSITY },
    // convergence: the four lines that create depth
    { from: corners["back-tl"], to: corners["front-tl"], glyph: "/", density: WALL_DENSITY * 0.8 },
    { from: corners["back-tr"], to: corners["front-tr"], glyph: "\\", density: WALL_DENSITY * 0.8 },
    { from: corners["back-br"], to: corners["front-br"], glyph: "\\", density: WALL_DENSITY * 0.8 },
    { from: corners["back-bl"], to: corners["front-bl"], glyph: "/", density: WALL_DENSITY * 0.8 },
    // floor and ceiling, so the eye reads a ground plane
    { from: corners["front-bl"], to: corners["front-br"], glyph: "-", density: WALL_DENSITY },
    { from: corners["front-tl"], to: corners["front-tr"], glyph: "-", density: WALL_DENSITY * 0.6 },
  ];

  // a floor, drawn as receding courses rather than a filled plane: at glyph resolution a filled plane
  // is a wall of marks, while courses read as a surface going away from the camera
  const floorRules: typeof wallRules = [];
  const COURSES = 7;
  for (let i = 1; i <= COURSES; i++) {
    const f = i / (COURSES + 1);
    const y = -bh - (fh - bh) * f;
    const hw = bw + (fw - bw) * f;
    floorRules.push({ from: { x: -hw, y, z: zBack + (zFront - zBack) * f }, to: { x: hw, y, z: zBack + (zFront - zBack) * f }, glyph: ".", density: WALL_DENSITY * 0.7 });
  }

  // the opening, if any: a gap in the back wall, drawn as its own frame
  const openingRules: typeof wallRules = [];
  if (opts.opening) {
    const o = opts.opening;
    const ox = o.atX * bw;
    const ow = (o.width / 2) * bw;
    const oh = (o.height / 2) * bh;
    openingRules.push(
      { from: { x: ox - ow, y: oh, z: zBack }, to: { x: ox + ow, y: oh, z: zBack }, glyph: "=", density: WALL_DENSITY },
      { from: { x: ox - ow, y: oh, z: zBack }, to: { x: ox - ow, y: -oh, z: zBack }, glyph: "|", density: WALL_DENSITY },
      { from: { x: ox + ow, y: oh, z: zBack }, to: { x: ox + ow, y: -oh, z: zBack }, glyph: "|", density: WALL_DENSITY },
    );
  }

  return {
    kind: "room",
    role: opts.role,
    position: opts.position,
    scale: 1,
    depth: "recede",
    glyphFamily: "architectural",
    recognition: opts.recognition ?? "essential",
    exposure: opts.exposure,
    prominence: opts.prominence,
    /**
     * No single primary contour: a room's identity is its CONVERGENCE, and a flat outline would make it
     * a picture frame. The back wall is supplied as the contour so the shape is still bounded — which is
     * what a host surface needs — but the reading comes from the `rules` below.
     */
    contour: {
      points: [corners["back-tl"], corners["back-tr"], corners["back-br"], corners["back-bl"]],
      glyph: "-",
      density: WALL_DENSITY,
    },
    interior: {
      rules: [...wallRules, ...floorRules, ...openingRules],
      // A faint interior so the room is a volume rather than four lines. NOTE the spacing is in CELLS
      // (object-local) while everything above is world units — 12x12 cells apart, heavily holed, so
      // this reads as depth cues rather than as a wall of marks.
      lattice: { cols: 30, rows: 16, spacing: { x: 12, y: 12 }, glyphs: ".:'", holes: 0.92 },
    },
    anchors: [
      { id: "back-wall", p: { x: 0, y: 0, z: zBack } },
      { id: "floor", p: { x: 0, y: -bh, z: zBack + (zFront - zBack) * 0.5 } },
      { id: "ceiling", p: { x: 0, y: bh, z: zBack } },
      { id: "doorway", p: { x: opts.opening ? opts.opening.atX * bw : bw * 0.5, y: 0, z: zBack } },
      // the surface a name would be written on: the back wall, at reading height
      { id: "writing-surface", p: { x: 0, y: bh * 0.15, z: zBack + 1 } },
    ],
  };
}

// ---------------------------------------------------------------------------
// the diegetic word
// ---------------------------------------------------------------------------

/**
 * A WORD AS A WORLD OBJECT — not a subtitle.
 *
 * THE DISTINCTION THIS ENCODES, and it is the one the brief says will matter in Phase 4:
 *
 *   DIEGETIC TEXT   exists IN the film world. It has a position, a surface it is written on, a size
 *                   relative to the things around it, and it can be touched, erased and destroyed. A
 *                   name written on a wall is diegetic. When the room is erased, the name goes with it.
 *   SUBTITLE TEXT   exists in the AUDIENCE's space, overlaid on the image, unaffected by anything that
 *                   happens in it. It cannot be erased by a character.
 *
 * Phase 3 rendered words as marks in the field — physically in the frame, but with no surface, no
 * anchor, and no relationship to anything else, so they read as neither. `wordForm` fixes the first half
 * of that: it declares the SURFACE the word is written on, at one of the host form's anchors, so the
 * word has a place in the world that can be reasoned about.
 *
 * The second half — the word being *touched, erased, fragmented* — is the transform vocabulary's job,
 * and it already exists (`erase`, `fragment`, `displace`, `dissolve` are all reachable).
 */
export function wordForm(opts: {
  text: string;
  role: string;
  /** where the word sits — normally a host form's `writing-surface` anchor, in world units */
  position: { x: number; y: number; z: number };
  /** glyph-cell size of the letterforms */
  scale?: number;
  tracking?: number;
  /** the surface this word is written on, named for reports and for erasure logic */
  surface?: string;
  recognition?: RecognitionPriority;
}): SubjectForm {
  /**
   * ⚠ THE FOOTPRINT CONTOUR IS GONE, AND IT WAS DESTROYING THE COLLISION AUDIT.
   *
   * `wordForm` used to emit a band the size of the text's PLACEMENT footprint — `halfW` computed from
   * `metrics * 6 * scale`, which at the default scale of 6 is **wider than the wall it sits on.** That is
   * not the word's extent; it is a layout box.
   *
   * Once `compileForm` began emitting real letterforms (`SubjectForm["text"]`), the audit measured the
   * union of that enormous footprint and the letters — so **every figure position collided at 100%**,
   * including the composition that renders legibly. A box that covers everything cannot discriminate.
   *
   * **A word form's geometry is its letters.** The footprint was only ever needed so a word had *some*
   * `contour` for the compiler to draw; now that the letters are real geometry, the footprint is noise
   * and is removed.
   */
  return {
    kind: "word",
    role: opts.role,
    position: opts.position,
    scale: 1,
    depth: "flat",
    glyphFamily: "printable",
    text: opts.text,
    recognition: "essential",
    /** no contour: the letterforms ARE this form's outline */
    contour: { points: [], glyph: ".", density: 0.25 },
    interior: { rules: [] },
    anchors: [
      { id: "centre", p: { x: 0, y: 0, z: 0 } },
    ],
    hosts: [],
  };
}


/**
 * Compile a word form's LETTERFORMS, which `compileForm` cannot do because text is drawn from the font
 * rather than from a contour or a rule. Kept separate and explicit so the font is used in exactly one
 * place.
 */
export function wordLetterforms(opts: {
  text: string;
  role: string;
  position: { x: number; y: number; z: number };
  scale?: number;
  tracking?: number;
}): AsciiObject {
  return {
    kind: "text",
    id: `${opts.role}-word-letterforms`,
    position: opts.position,
    tracking: (opts.tracking ?? 1) * (opts.scale ?? 6),
    scale: opts.scale ?? 6,
    text: opts.text,
    align: "centre",
    glyphFamily: "printable",
    intensity: 1,
  } as AsciiObject;
}

// ---------------------------------------------------------------------------
// LETTERFORMS AS NATIVE OBJECTS — the only way a word scales sharply
// ---------------------------------------------------------------------------

/**
 * WHY THIS EXISTS, AND WHY IT IS NOT A BIGGER FONT.
 *
 * Round 7 measured the word's real constraint and it is severe: `rasteriseText` lays each font glyph out
 * at its native **5 x 9** and multiplies by `scale`. **The only scale that stays sharp is 1**, because
 * every other value lands glyph pixels on fractional cells. At scale 1 a four-letter word is **four
 * cells wide against a 240-cell frame** — about 1.7% of the image, invisible as language.
 *
 * **So a readable diegetic word is impossible by configuration.** It needs letterforms built from
 * geometry rather than sampled from a bitmap, and this function provides them without new font data:
 * it reads the existing typeface, run-length encodes each glyph row into strips, and emits each strip as
 * a closed polyline. Because the output is geometry, it renders sharply at ANY size.
 *
 * It is still ASCII-native: every strip is drawn with a printable character through the same polyline
 * path every other form uses. Nothing here is a texture, an image or a glyph bitmap pasted into the
 * field — the bitmap is used only as a **shape to be re-drawn**, at whatever resolution the lattice has.
 *
 * The strips are axis-aligned run-length rectangles rather than stroke skeletons deliberately: a skeleton
 * needs per-letter anatomy and would render as hairlines, while run-length strips reproduce the actual
 * letterform's weight and stay legible when a glyph is only a few cells tall.
 */
export function letterformObjects(opts: {
  text: string;
  role: string;
  position: { x: number; y: number; z: number };
  /** total height of a capital letter, in WORLD units */
  height: number;
  /** space between glyphs, as a fraction of a glyph's width */
  tracking?: number;
  align?: "left" | "centre" | "right";
  glyphFamily?: SubjectForm["glyphFamily"];
  /**
   * ERASURE, 0..1 — and it walks the GLYPH, not only the ink.
   *
   * `opacity` alone was measured and it is not enough: with a heavy character like `#`, a cell's
   * displayed brightness **saturates**, so an opacity of 0.15 produced a mean ink of 205.4 against
   * 213.8 at full strength — the name did not appear to fade, it only lost coverage.
   *
   * So erasure thins the letterform's own character as well: full `#`, then `%`, `+`, `:`, `.`, and at
   * 0 the strips are not emitted at all. **Reading a fade through the character is the ASCII-native way
   * to do it** — the medium's ink is a glyph, so a form that is disappearing should be drawn with
   * lighter glyphs rather than with fewer of the same one.
   */
  erase?: number;
}): AsciiObject[] {
  /**
   * THE ERASURE LADDER, heaviest to lightest.
   *
   * Ordered by actual coverage in this font, so the fade is monotone in what a viewer sees rather than
   * in an abstract number. At `erase >= 1` the form emits nothing at all.
   */
  const ERASE_LADDER = ["#", "%", "+", ":", ".", "'"];
  /**
   * How many marks are placed along each edge of a letterform strip.
   *
   * A strip edge is one font pixel long — about **0.058 world units** at a 0.52-unit capital — so a
   * density expressed per world unit has to be divided by that length to become "marks per edge", which
   * is the quantity that decides whether a letter is a solid stroke or a dotted outline.
   */
  const MARKS_PER_LETTERFORM_EDGE = 10;
  const erase = Math.max(0, Math.min(1, opts.erase ?? 0));
  if (erase >= 1) return [];
  const eraseGlyph = ERASE_LADDER[Math.min(ERASE_LADDER.length - 1, Math.floor(erase * ERASE_LADDER.length))]!;
  const GG = glyphLookup();
  const tracking = opts.tracking ?? 0.25;
  const cell = opts.height / GLYPH_H;             // one font pixel, in world units
  const glyphW = GLYPH_W * cell;
  const stepX = glyphW + tracking * glyphW;
  const lineW = Math.max(0, opts.text.length * stepX - tracking * glyphW);
  const originX = opts.align === "right" ? -lineW : opts.align === "centre" ? -lineW / 2 : 0;

  const out: AsciiObject[] = [];
  let idx = 0;
  for (let ci = 0; ci < opts.text.length; ci++) {
    const def = GG[opts.text.charCodeAt(ci)];
    if (!def) continue;
    const gx0 = originX + ci * stepX;
    for (let gy = 0; gy < GLYPH_H; gy++) {
      const mask = def.rows[gy] ?? 0;
      if (!mask) continue;
      // one font row is one strip of height `cell`, measured UP from the text baseline
      const yLo = (GLYPH_H - 1 - gy) * cell;
      const yHi = yLo + cell;
      // run-length encode the 5-bit row into contiguous lit spans
      let runStart = -1;
      for (let px = 0; px <= GLYPH_W; px++) {
        const on = px < GLYPH_W && (mask & (1 << (GLYPH_W - 1 - px))) !== 0;
        if (on && runStart < 0) runStart = px;
        else if (!on && runStart >= 0) {
          const xa = gx0 + runStart * cell;
          const xb = gx0 + px * cell;
          out.push({
            kind: "polyline",
            id: `${opts.role}-glyph-${ci}-${gy}-${idx++}`,
            position: opts.position,
            points: [
              { x: xa, y: yLo, z: 0 },
              { x: xb, y: yLo, z: 0 },
              { x: xb, y: yHi, z: 0 },
              { x: xa, y: yHi, z: 0 },
            ],
            closed: true,
            /**
             * DENSITY IS MARKS PER WORLD UNIT, AND `1 / cell` WAS A NON-FIX.
             *
             * `1 / cell` places **one mark per cell-length**, which sounds right and is useless: a strip
             * edge is exactly `cell` long, so `n = len * density = cell * (1/cell) = 1` and the edge gets
             * **two marks, its two endpoints — in EVERY letter at EVERY size.** The letterforms were
             * therefore **hollow outlines**, which is why the word looked dotted, and why thinning a
             * letter by one glyph-weight step broke it: there was no fill to lose.
             *
             * The correct quantity is **marks PER EDGE**, which is what a reader's eye needs, and the
             * conversion is `density = marksPerEdge / cell`. It is stated as an explicit constant so the
             * next person can reason about it directly rather than rediscovering that `1 / cell` is the
             * identity that produces two marks.
             */
            density: MARKS_PER_LETTERFORM_EDGE / cell,
            glyph: eraseGlyph,
            glyphFamily: opts.glyphFamily ?? "printable",
            /**
             * Ink also falls with erasure, so a partially erased form is genuinely fainter and not
             * merely drawn in a lighter character. Both channels move together because either alone
             * was measured to be insufficient.
             */
            intensity: 1 - erase * 0.35,
            opacity: 1 - erase * 0.45,
          } as AsciiObject);
          runStart = -1;
        }
      }
    }
  }
  return out;
}

/** Reads the frozen typeface by character code. `TYPEFACE` is the complete set native objects may use. */
function glyphLookup(): Record<number, { rows: number[] }> {
  const table: Record<number, { rows: number[] }> = {};
  for (const g of TYPEFACE) table[g.ch.charCodeAt(0)] = g;
  return table;
}

// ---------------------------------------------------------------------------
// FORM COLLISION — measured in PROJECTED SCREEN SPACE, not in guessed world extents
// ---------------------------------------------------------------------------

/**
 * WHY THIS EXISTS. The `forgotten-name` composition put the name **directly behind the figure**. Nothing
 * warned. It rendered, the aggregate numbers looked plausible, and it was **unreadable** — caught only
 * when a human rated a blind still NOT CLEAR.
 *
 * ⚠ FOUR ATTEMPTS FAILED, AND THIS IS THE FIFTH. The first four compared **guessed world extents** and
 * agreed with each other while disagreeing with every rendered image:
 *
 *   attempt 1  flag any overlapping pair              -> flagged a room with its own subjects
 *   attempt 2  essential forms only                   -> CLEAR for the composition measured unreadable
 *   attempt 3  add a depth term                       -> same
 *   attempt 4  measured x/y extents, invented z        -> same
 *
 * Printing the generated objects' real bounds showed the guesses were **up to 5x wrong** (a human is
 * 3.37 world units tall, not 0.7), and that the `z` column was **entirely invented** — which decided the
 * verdict. **A check whose answer comes from a fabricated constant is not a check.**
 *
 * So this version measures the only thing that actually matters: **the box each form occupies on the
 * lattice, after projection.** Depth needs no separate term because `project` already divides by it —
 * two forms at different depths project to different screen boxes automatically, and two forms at the
 * same depth with overlapping boxes are **drawn through each other**, which is the failure.
 */

export interface ScreenBox {
  role: string;
  kind: SubjectFormKind;
  /** lattice cell bounds, inclusive */
  x0: number; x1: number; y0: number; y1: number;
  /** cells the box occupies */
  cells: number;
}

/**
 * A form's projected box.
 *
 * ⚠ THE FIRST VERSION OF THIS DISCARDED THE OBJECT POSITION. `AsciiObject` carries **local** geometry
 * plus a separate `position`, so collecting `o.points` alone returns local coordinates and every form
 * projects to a box centred on the origin — which made all three compositions report a **93% overlap**,
 * the two that failed and the one that works. Reading the object's `position` field showed the figure's
 * world x was `position.x + point.x` and the points never changed with it.
 *
 * Local geometry is therefore transformed by the object's own position and scale before projecting.
 *
 * `worldToCells` is supplied by the caller rather than re-derived, because round 23 established that this
 * project's *analytic* derivation of it disagreed with two independent measurements. **It is passed in,
 * never guessed.**
 */
export function projectedBox(
  form: SubjectForm,
  worldPoints: Array<{ x: number; y: number; z: number }>,
  opts: { cols: number; rows: number; worldToCells: number },
): ScreenBox {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const cx = opts.cols / 2, cy = opts.rows / 2;
  for (const p of worldPoints) {
    const sx = cx + p.x * opts.worldToCells;
    const sy = cy - p.y * opts.worldToCells;   // lattice rows increase downward
    if (sx < x0) x0 = sx;
    if (sx > x1) x1 = sx;
    if (sy < y0) y0 = sy;
    if (sy > y1) y1 = sy;
  }
  if (!Number.isFinite(x0)) return { role: form.role, kind: form.kind, x0: 0, x1: 0, y0: 0, y1: 0, cells: 0 };
  return {
    role: form.role, kind: form.kind,
    x0: Math.floor(x0), x1: Math.ceil(x1), y0: Math.floor(y0), y1: Math.ceil(y1),
    cells: Math.max(0, Math.ceil(x1) - Math.floor(x0)) * Math.max(0, Math.ceil(y1) - Math.floor(y0)),
  };
}

/** Local object geometry -> world points. `AsciiObject` keeps these separate, which cost a round. */
export function objectWorldPoints(objects: AsciiObject[]): Array<{ x: number; y: number; z: number }> {
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (const o of objects) {
    const pos = (o as { position?: { x: number; y: number; z: number } }).position ?? { x: 0, y: 0, z: 0 };
    const s = (o as { scale?: number }).scale ?? 1;
    const pts = (o as { points?: Array<{ x: number; y: number; z: number }> }).points
      ?? ((o as { from?: { x: number; y: number; z: number }; to?: { x: number; y: number; z: number } }).from
        ? [(o as unknown as { from: { x: number; y: number; z: number } }).from, (o as unknown as { to: { x: number; y: number; z: number } }).to]
        : []);
    for (const p of pts) out.push({ x: pos.x + p.x * s, y: pos.y + p.y * s, z: pos.z + p.z * s });
  }
  return out;
}

export interface FormOverlap {
  a: string;
  b: string;
  /** cells shared by the two projected boxes */
  sharedCells: number;
  /** the smaller box's cells */
  smallerCells: number;
  /** shared / smaller — 1.0 means the smaller form is entirely inside the other */
  fraction: number;
  /** true when the smaller form is substantially drawn through the larger */
  collides: boolean;
}

/**
 * Compare projected boxes.
 *
 * **Containment is not collision.** A room contains a person; a wall holds a word. What destroys
 * readability is the smaller form having a large share of its own cells covered by another form **that is
 * not its host**. So environments are excluded as `a`, and the threshold is stated rather than tuned
 * silently: a form loses its identity when **more than 35%** of its box is shared with a non-host form.
 */
export const FORM_OVERLAP_THRESHOLD = 0.35;

export function findFormOverlaps(boxes: ScreenBox[]): FormOverlap[] {
  const out: FormOverlap[] = [];
  const ENVIRONMENT = new Set(["room", "corridor", "wall", "landscape"]);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i]!, B = boxes[j]!;
      const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
      const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
      const shared = ox > 0 && oy > 0 ? ox * oy : 0;
      const smaller = Math.min(A.cells, B.cells) || 1;
      const fraction = shared / smaller;
      // an environment covering a subject is composition, not a collision
      const isContainment = ENVIRONMENT.has(A.kind) || ENVIRONMENT.has(B.kind);
      out.push({
        a: A.role, b: B.role, sharedCells: shared, smallerCells: smaller, fraction,
        collides: !isContainment && fraction > FORM_OVERLAP_THRESHOLD,
      });
    }
  }
  return out;
}


// ---------------------------------------------------------------------------
// THE CHECK, WIRED IN
// ---------------------------------------------------------------------------

/**
 * Check a shot's forms for collisions, using the SAME projection the renderer uses.
 *
 * ⚠ WIRING IS THE POINT. `findFormOverlaps` existed as an API and the `forgotten-name` composition was
 * still assembled with the name behind the figure, because **nothing called it.** A check that is not in
 * the authoring path does not prevent anything — which is the same failure this project has recorded
 * twelve times for fields that were declared and never read. A COLLISION CHECK NOBODY CALLS IS A
 * DECLARED FIELD.
 *
 * `worldToCells` is passed in by the caller. It is never derived here, because round 23 showed this
 * project's analytic derivation of it disagreed with two independent measurements, and round 29 supplied
 * the empirical value (11.5 at the corpus framing).
 */
export function auditFormComposition(opts: {
  forms: SubjectForm[];
  cols: number;
  rows: number;
  worldToCells: number;
}): {
  boxes: ScreenBox[];
  overlaps: FormOverlap[];
  collisions: FormOverlap[];
  /** a form leaves the frame when any of its box falls outside the lattice */
  offscreen: Array<{ role: string; box: ScreenBox; outBy: { left: number; right: number; top: number; bottom: number } }>;
} {
  const boxes: ScreenBox[] = [];
  for (const form of opts.forms) {
    const compiled = compileForm(form);
    const pts = objectWorldPoints(compiled.objects);
    boxes.push(projectedBox(form, pts, { cols: opts.cols, rows: opts.rows, worldToCells: opts.worldToCells }));
  }
  const overlaps = findFormOverlaps(boxes);
  const collisions = overlaps.filter((o) => o.collides);
  const offscreen = boxes
    .map((box) => ({
      role: box.role, box,
      outBy: {
        left: Math.max(0, -box.x0),
        right: Math.max(0, box.x1 - (opts.cols - 1)),
        top: Math.max(0, -box.y0),
        bottom: Math.max(0, box.y1 - (opts.rows - 1)),
      },
    }))
    .filter((e) => e.outBy.left + e.outBy.right + e.outBy.top + e.outBy.bottom > 0);
  return { boxes, overlaps, collisions, offscreen };
}
