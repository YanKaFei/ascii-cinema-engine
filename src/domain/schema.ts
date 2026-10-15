/**
 * Domain schema layer.
 *
 * The pipeline is deliberately unidirectional and each stage has a typed contract:
 *
 *   Prompt -> FilmSpec -> ShotSpec[] -> Scene -> ASCII raster -> Camera -> Remotion -> MP4
 *
 * Nothing downstream may invent narrative content. Everything downstream must be
 * derivable from the FilmSpec alone (deterministic, so a given FilmSpec always
 * produces byte-identical frames).
 */

import { GLYPH_BY_CODE } from "../glyphs/atlas.js";

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export type CameraMoveKind =
  | "static"
  | "push-in"
  | "pull-out"
  | "lateral-left"
  | "lateral-right"
  | "crane-up"
  | "crane-down"
  | "orbit"
  | "handheld";

export interface CameraMoveSpec {
  /**
   * ANTICIPATION — how far the camera pulls BACK before it starts its move, as a fraction of the
   * move. 0 is none.
   *
   * WHY THIS IS NOT A DECORATION. A camera that only accelerates and decelerates reads as a machine
   * being driven to a mark. A camera that winds up first reads as an operator who decided to move,
   * and this is the single strongest available cue that motion was intended rather than computed.
   * It cannot be expressed by any easing curve, because it is a departure from the target direction
   * rather than a shape of progress.
   *
   * OPTIONAL, and absent means 0, so the frozen Phase 1 film is untouched.
   */
  anticipation?: number;
  kind: CameraMoveKind;
  /** Easing applied to the whole move. */
  easing: Easing;
  /**
   * Vertical field of view at rest, in degrees. Small because the world is
   * measured in "subject heights": a 2.0-unit-tall subject framed at a distance of
   * ~3.3 units needs roughly 33 degrees. These numbers are authored to match the
   * geometry in planner.ts, they are not arbitrary.
   */
  fovDeg: number;
  /** Distance from the camera to the subject plane at rest, in world units. */
  focusDistance: number;
  /** Camera roll in radians. */
  roll: number;
  /** push-in/pull-out/dolly: total travel as a fraction of the start distance. */
  dollyAmount: number;
  /** lateral/crane: total travel in world units. */
  panAmount: number;
  /** orbit: total yaw in radians. */
  yawAmount: number;
  /** handheld: positional jitter amplitude in world units. */
  jitter: number;
  /** Extra zoom layered on top of the move, a multiplicative factor. */
  zoomBoost: number;
  /**
   * RACK FOCUS — pull focus from one depth to another DURING the shot.
   *
   * `to` is the focus distance reached by `at` (0..1 of the shot). The camera starts focused at
   * `focusDistance` and travels to `to`. Without depth of field a rack focus has no visible effect,
   * so this is only meaningful alongside `look.dof`.
   */
  rackFocus?: { to: number; at?: number };
  /**
   * LENS BREATHING — a real lens changes its effective focal length as it focuses, so a dolly or a
   * pull-in slightly alters the framing on its own.
   *
   * `amount` is the fractional widening at the near end of a push: 0.03 is a subtle but real breath.
   * Applied to the focus distance in proportion to how far the move has travelled, which is where the
   * effect actually occurs on a physical lens.
   */
  lensBreathing?: number;
  /**
   * APERTURE — how much depth of field there is, as an f-number ratio against f/2.8.
   *
   * A larger number is a smaller aperture and therefore MORE depth in focus: 1 means the reference
   * blur, 2 means half of it, 0.5 means double. This is what lets a shot go from a shallow,
   * isolating focus to a deep one without touching the blur amount itself.
   */
  aperture?: number;
}

/**
 * EASING FAMILIES.
 *
 * The first five are the original set and their definitions are UNCHANGED — the frozen Phase 1 film
 * is byte-locked against them.
 *
 * The ones below them are the cinematic families added for the motion language. They exist because
 * the original set can only express "get there" — accelerate, decelerate, or both. Real motion has
 * ANTICIPATION before it moves, OVERSHOOT past its target, and SETTLE on arrival, and a camera that
 * only accelerates and decelerates reads as a machine rather than as an operator.
 *
 * They are pure functions of a 0..1 progress with the SAME contract as the originals: `f(0) = 0`,
 * `f(1) = 1`. That is what lets them be substituted for one another without touching any caller.
 */
export type Easing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "easeOutExpo"
  // cinematic families
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeOutQuint"
  | "easeInQuart"
  | "easeOutBack"
  | "easeInOutBack"
  | "easeOutElastic"
  | "easeOutBounce";

// ---------------------------------------------------------------------------
// Scene / layer description
// ---------------------------------------------------------------------------

export type LayerKind = "particle-field" | "point-source" | "sdf-shape" | "sdf-shell";

export type ShapeKind =
  | "none"
  | "disc"
  | "ring"
  | "humanoid"
  | "column"
  | "shard"
  | "grid";

/**
 * THE TRANSFORM VOCABULARY.
 *
 * The first five are RADIAL gestures: every primitive moves together, so one value per layer suffices.
 *
 * The rest are STAGGERED — they act on primitives at different times or to different degrees, which is
 * what Gate 6 asks for with *TYPE ON / ASSEMBLE / ERASE / FRAGMENT / REPLACE / SCRAMBLE / DISSOLVE /
 * STRETCH / COMPRESS*. Six of the nine are now implemented; the original set supplied three
 * (assemble, dissolve, plus `collapse`/`scatter` as radial relatives) and `fragment` was already
 * reachable through `scatter`.
 */
export type TransformKind =
  // radial gestures: one value for the whole layer
  | "none"
  | "assemble"
  | "dissolve"
  | "collapse"
  | "scatter"
  // staggered: per-primitive timing or degree
  | "type-on"
  | "erase"
  | "scramble"
  | "stretch"
  | "compress"
  | "replace";

export type DepthBehavior = "flat" | "parallax" | "depth-attenuated" | "parallax+attenuated";

export interface NoiseSpec {
  /** octave count; 0 disables noise entirely */
  octaves: number;
  frequency: number;
  amplitude: number;
  lacunarity: number;
  gain: number;
  /** drift speed applied to the noise field, in field units per second */
  drift: number;
}

export interface LayerSpec {
  id: string;
  kind: LayerKind;
  shape: ShapeKind;
  /**
   * Number of primitives. For sdf-* kinds this is sampled on a shell/surface,
   * for particle-field it is a true particle count.
   */
  count: number;
  /**
   * World-space bounds in which primitives are seeded. For shape "none" this is the
   * absolute spawn point instead of a half-extent.
   */
  bounds: { x: number; y: number; z: number };
  /**
   * Vertical placement of the whole layer in world units. This is the subject's
   * blocking within the frame and is INDEPENDENT of the camera aim: the camera's
   * subject line controls headroom, this controls where the body sits.
   */
  offsetY: number;
  /**
   * Per-primitive footprint, expressed in GLYPH CELLS of radius. Authoring the
   * footprint in cells (rather than world units) is what makes brightness
   * predictable: a primitive with glyphRadius r covers ~pi*r^2 cells, so the
   * luminance it deposits per cell is intensity/(pi*r^2) and does not depend on
   * the camera distance or the world scale.
   */
  glyphRadius: number;
  /**
   * Peak luminance this layer deposits per cell at the centre of a primitive,
   * before the splat profile and before depth attenuation.
   */
  intensity: number;
  /**
   * Concentration of a primitive's energy: the exponent e in the (1-d^2)^e splat
   * profile. Low e => broad soft halo (nebulae, blur). High e => hard bright
   * core with almost no halo (stars, single glyphs).
   */
  focus: number;
  /** Uniform size/brightness variation across the population, 0..1 */
  variation: number;
  /** Signed z placement bias, -1 near .. +1 far */
  depthBias: number;
  depth: DepthBehavior;
  /** Per-layer additive noise */
  noise: NoiseSpec;
  /** Transform applied to this layer over the shot. */
  transform: TransformKind;
  /** Semantic role; used for reporting and for the "last char standing" end state. */
  role: string;
  /**
   * NATIVE ASCII OBJECTS placed in this layer.
   *
   * When present, these produce the layer's primitives INSTEAD of the procedural shape sampler:
   * each object emits its own glyph placements, so a line is made of `-`, a word is made of its
   * own letters, and depth comes from placing one object in front of another. This is the route
   * that can produce a horizon, a wall, a floor or a readable word — none of which are expressible
   * as "a cloud whose brightness varies".
   */
  nativeObjects?: import("../ascii/objects.js").AsciiObject[];
  /**
   * SUBJECT FORMS — what this layer's marks ARE, rather than how they are drawn.
   *
   * THE LAYER ABOVE PRIMITIVES, introduced in Phase 3.1. A `SubjectForm` names a thing in the
   * audience's vocabulary (`human`, `room`, `word`) and carries its own contour, interior structure,
   * anchors and exposure intent. `compileForm` turns it into `AsciiObject`s.
   *
   * WHY IT IS DECLARED HERE AND NOT FOLDED INTO `nativeObjects`. Phase 3's finding was that
   * **BOUNDARY ≠ FORM ≠ SUBJECT ≠ MEANINGFUL OBJECT** — a rectangle around particles is not a room.
   * If forms compiled to objects at authoring time, nothing downstream could tell a room from a cloud,
   * and the GPU pass, the recognition harness and the director's own reports would all be blind to the
   * distinction the whole phase exists to create.
   *
   * So the form is carried INTO the IR and compiled at the scene-compile step, which is what lets the
   * CPU and GPU paths represent the **same semantic form** — semantic equivalence, not pixel identity.
   */
  subjectForms?: import("../director/grammar/subject-form.js").SubjectForm[];
  /**
   * When a native object supplies a glyph, this many ink subpixels it maps to. The object's own
   * character is used regardless; the coverage only sets how heavy it reads.
   */
  nativeCoverage?: number;
}

// ---------------------------------------------------------------------------
// Glyph / raster configuration
// ---------------------------------------------------------------------------

export interface RasterSpec {
  /**
   * EXPOSURE INTENT — DIRECTION, AND IT OUTRANKS THE NORMALISER.
   *
   * Phase 3 built a per-shot field normaliser and it worked, then quietly acquired **dramatic
   * authority it should not have had**. `disappearing-room` is about a room that vanishes, and its
   * lit-cell range collapsed from **58x to 3.5x**: because the normaliser exposes every shot against
   * its own measured highlights, a shot authored to be nearly empty gets lifted until it is not.
   *
   * The rule this field enforces:
   *
   *     DIRECTOR INTENT  >  EXPOSURE NORMALISER
   *
   * **Typed, never numeric.** `if (negativeSpace > 0.8) disable()` is forbidden, because it puts a
   * rendering heuristic in charge of a narrative decision. The Director declares a *meaning* and the
   * renderer decides how to honour it. See `SubjectForm["exposure"]` for the vocabulary.
   */
  exposureIntent?:
    | "auto"
    | "normal"
    | "preserve-darkness"
    | "preserve-emptiness"
    | "high-key"
    | "low-key"
    | "silhouette";

  /** Character-grid width in glyph cells. */
  cols: number;
  /** Character-grid height in glyph cells. */
  rows: number;
  /** Device pixels per glyph cell. */
  cellW: number;
  cellH: number;
  /**
   * The master density ramp, ASCII-only. Ordered light -> heavy. Every glyph the
   * film can emit is a member of this string; nothing else may ever be drawn.
   */
  ramp: string;
  /**
   * The glyph-density transformation window, expressed as ink-coverage bounds in
   * subpixels (0..45). A luminance of 0 maps to the lightest glyph whose coverage
   * is >= coverageMin, a luminance of 1 maps to the heaviest glyph whose coverage
   * is <= coverageMax. Animating these two numbers over a shot *is* the
   * "glyph density transformation" technique.
   */
  coverageMin: number;
  coverageMax: number;
  /** Global exposure multiplier */
  exposure: number;
  /** Black point; luminance below this is clipped to blank */
  blackPoint: number;
  /** If true, faint cells dither between glyph and space by luminance. */
  dither: boolean;
  /**
   * Cells whose post-grade value is below this are left blank. Zero for every normal
   * shot.
   *
   * The one place this is needed is an isolated mark: the flat-topped splat has a
   * shoulder, so a single dot lights its nearest cell fully and the neighbouring cell
   * faintly. With a two-glyph density window that faint neighbour still rounds to a
   * character, and "one glyph in a void" becomes two. A floor is the honest way to
   * say "this shot may only carry one mark".
   */
  inkFloor: number;
  /**
   * How overlapping primitives combine.
   *
   * ABSENT OR "additive" IS THE PHASE 1 BEHAVIOUR AND MUST STAY THE DEFAULT: the frozen Phase 1
   * `grid.bin` was produced by summing, so any other default changes `grid.bin` byte-for-byte and
   * the regression gate correctly fails.
   *
   * "nearest" replaces a fainter far contribution with a nearer one instead of summing it. That is
   * the difference between a tonally graded image and a saturated white mass: measured on the same
   * shot, `nearest` gives mean ink 87 with 62% midtones and 0.1% near-white, while `additive`
   * gives mean ink 210 with 21% midtones and 67% near-white — and additive PLATEAUS there, holding
   * ~174 mean ink and ~48% near-white even at 8% of the authored intensity, because ~18,000
   * overlapping primitives cannot be exposed into a range by scaling them down.
   */
  occlusionPolicy?: "additive" | "nearest";
  /**
   * Expose each shot against its OWN measured highlight rather than an absolute constant.
   *
   * OPT-IN, AND THAT IS LOAD-BEARING: absent this the scale is exactly 1 and the frozen Phase 1
   * `grid.bin` is byte-identical. The authored v2 path sets it.
   *
   * Only ever darkens. Brightening a dim shot would lift its noise floor into visibility, and a shot
   * that is genuinely dark should stay dark.
   */
  autoExpose?: boolean;
  /** where the chosen percentile lands after grading; default 0.62 (just under clipping) */
  autoExposeTarget?: number;
  /**
   * Select the glyph using a SECOND signal (local edge magnitude) as well as brightness, so contours
   * quantise to stronger marks than interiors at the same luminance. Without it a point-field subject
   * has no readable outline. Opt-in, so the frozen Phase 1 film is byte-identical.
   */
  multiSignal?: boolean;
  /** how far toward the heavy end of the ramp an edge pushes a cell; default 0.35 */
  edgeGain?: number;
  /** edge magnitude below which nothing is pushed; default 0.02 */
  edgeFloor?: number;
  /** edge magnitude at which the push reaches `edgeGain`; default 0.35 */
  edgeScale?: number;
  /**
   * SHUTTER ANGLE as a fraction of the frame interval, for motion blur. 0 disables (the default, and
   * the frozen Phase 1 behaviour); 0.5 is the conventional 180-degree film shutter.
   *
   * The field is accumulated once per sample across the open shutter and averaged, so the blur appears
   * only where something moved and is absent on a static shot.
   */
  shutter?: number;
  /** how many sub-frame camera samples the shutter window is divided into; default 3 */
  shutterSamples?: number;
  /** which percentile of the lit field is placed at the target; default 0.98 */
  autoExposePercentile?: number;
  /**
   * Treat `intensity` as a region INK BUDGET divided among the layer's primitives, rather than as
   * the amplitude of each one. Without this a 9,000-primitive layer sums to a clipped field.
   * Opt-in, so the frozen Phase 1 film is untouched.
   */
  areaNormalised?: boolean;
  /** total ink the layer's region should carry; default 0.75 */
  inkBudget?: number;
  /** target coverage for a cell under the layer's mean overlap; default 0.6 */
  coverageTarget?: number;
  /** the region the layer is expected to occupy, in cells; default 9000 */
  referenceCells?: number;
  /**
   * Normalise each shot-frame's accumulated field so a high percentile of its lit values sits just
   * under the clip threshold. Derived PER SHOT from the field itself, because both a global exposure
   * constant and a global amplitude model were measured to fail: the films want opposite corrections.
   * Opt-in, and only ever darkens.
   */
  fieldNormalise?: boolean;
  /** where the chosen percentile lands, in ungraded luminance; default 0.55 (clip is ~0.625) */
  fieldTarget?: number;
  /** which percentile of the lit field is placed at the target; default 0.95 */
  fieldPercentile?: number;
  /**
   * The space's brightness as a FRACTION of the subject's, used by the split normalisation. This is
   * what sets the visual hierarchy: a backdrop is defined by being dimmer than what stands in front
   * of it. Default 0.5, which a sweep found to be the balance point (a brighter space raises
   * near-white far faster than it adds visible structure).
   */
  spaceFraction?: number;
}

// ---------------------------------------------------------------------------
// Shot
// ---------------------------------------------------------------------------

export interface ShotSpec {
  /** 1-based shot number, "01".."99" as a zero-padded string id. */
  id: string;
  /** Beat title, e.g. "DOT / VOID". */
  title: string;
  /** The director's intent for this shot, verbatim from the beat sheet. */
  intent: string;
  /** Start time in seconds on the film timeline. */
  start: number;
  /** Duration in seconds. */
  duration: number;
  /** Background luminance 0..1 (0 = pure black). */
  background: number;
  camera: CameraMoveSpec;
  /**
   * The glyph-density transformation authored for this shot: the ink-coverage
   * window at the first frame and at the last frame.
   */
  density: {
    coverageMinStart: number;
    coverageMinEnd: number;
    coverageMaxStart: number;
    coverageMaxEnd: number;
  };
  layers: LayerSpec[];
  raster: Partial<RasterSpec>;
  /** Transition from the previous shot: how many seconds of overlap-blend. */
  transitionIn: { kind: "cut" | "dissolve"; duration: number };
  /** Human-readable techniques this shot exercises, for the report. */
  techniques: string[];
}

// ---------------------------------------------------------------------------
// Film
// ---------------------------------------------------------------------------

export interface FilmLookSpec {
  background: string;
  foreground: string;
  aspect: string;
  filmGrain: number;
  vignette: number;
  /** halation/bloom strength: 0 disables. Bright marks bleed light into their neighbours. */
  chromaticBloom: number;
  /**
   * HALATION — the warm, wider bleed around the brightest marks, as a fraction of the bloom.
   *
   * Bloom is the tight glow of a bright element; halation is the wide halo it casts, and in a film it
   * is what makes a bright thing read as EMITTING rather than merely being pale. In an ASCII frame
   * the two differ only in radius, which is why this is a ratio rather than a separate amount.
   */
  halation?: number;
  /** chromatic aberration: how far the red and blue channels separate at the frame edge, in cells */
  aberration?: number;
  /** blur radius in cells for the tight bloom pass; default 2 */
  bloomRadius?: number;
  /** field level above which a mark bleeds light; default 0.25 */
  bloomThreshold?: number;
  /**
   * The field level at which a cell has NO room left for more light, so bloom withdraws entirely.
   * Default 0.6. Full bloom below it, linearly falling to none at it — a cell already at the top
   * cannot show a glow, and forcing one there only destroys the glyph drawn in it.
   */
  bloomHeadroom?: number;
  /** depth of field: 0 disables. Requires `dofFocus` and `dofRange`. */
  dof?: number;
  /** the depth that stays sharp, in the camera's own depth units */
  dofFocus?: number;
  /** how quickly sharpness falls off either side of `dofFocus` */
  dofRange?: number;
  /** which percentile of the MEASURED mark depths becomes the focus plane; default 0.5 (median) */
  dofFocusPercentile?: number;
  /** shift the calibrated plane toward the near end; default 0 */
  dofFocusBias?: number;
  /** the focus range as a FRACTION of the measured depth spread; default 0.6 */
  dofRangeFraction?: number;
  /**
   * The radius, in cells, of the LOCAL neighbourhood a defocused cell is blended toward. Default 4.
   *
   * The target is the field blurred at this radius rather than any per-frame number, because a
   * per-frame target cannot be right across films that want opposite corrections — three attempts
   * established that. Scaled by `camera.aperture`.
   */
  dofBlurRadius?: number;

  /** If non-zero, a scanline-modulated brightness ripple, per-second frequency. */
  scanlineHz: number;
  /** Characters per second of "type-in" for title cards. 0 disables. */
  textTypeIn: number;
}

export interface FilmSpec {
  version: string;
  slug: string;
  title: string;
  /** The user prompt this film was derived from. */
  prompt: string;
  /** The single emotional through-line that every shot must serve. */
  logline: string;
  width: number;
  height: number;
  fps: number;
  durationInSeconds: number;
  aspect: string;
  quality: "draft" | "standard" | "high";
  fpsRationale: string;
  look: FilmLookSpec;
  raster: RasterSpec;
  shots: ShotSpec[];
  /** Deterministic seed for every stochastic process in the film. */
  seed: number;
  /** Prompt -> FilmSpec provenance, so the derivation is auditable. */
  derivation: DerivationRecord;
}

export interface DerivationRecord {
  /** Normalized tokens extracted from the prompt. */
  tokens: string[];
  /** Lexicon entries that fired. */
  matchedConcepts: string[];
  /** Beat template chosen. */
  structure: string;
  /** Numeric constraints taken verbatim from the user request. */
  constraints: Record<string, number | string>;
  /** Anything the engine could not derive and therefore defaulted. */
  defaultsApplied: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  level: "error" | "warning";
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export function maxCoverageOf(ramp: string): number {
  let max = 0;
  for (const ch of ramp) {
    const g = GLYPH_BY_CODE[ch.charCodeAt(0)];
    if (g && g.ch === ch && g.coverage > max) max = g.coverage;
  }
  return max;
}

export function validateFilmSpec(spec: FilmSpec): ValidationResult {
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: string) => issues.push({ level: "error", path, message });
  const warn = (path: string, message: string) => issues.push({ level: "warning", path, message });

  if (!spec.slug) err("slug", "slug is required");
  if (!spec.prompt) err("prompt", "prompt is required (provenance)");
  if (!(spec.width > 0) || !Number.isInteger(spec.width)) err("width", "width must be a positive integer");
  if (!(spec.height > 0) || !Number.isInteger(spec.height)) err("height", "height must be a positive integer");
  if (!(spec.fps > 0) || !Number.isInteger(spec.fps)) err("fps", "fps must be a positive integer");
  if (!(spec.durationInSeconds > 0)) err("durationInSeconds", "duration must be > 0");

  const r = spec.raster;
  if (r.cols * r.cellW !== spec.width) {
    err("raster.cols", `cols*cellW (${r.cols * r.cellW}) must equal width (${spec.width})`);
  }
  if (r.rows * r.cellH !== spec.height) {
    err("raster.rows", `rows*cellH (${r.rows * r.cellH}) must equal height (${spec.height})`);
  }
  for (const [name, ramp] of [["ramp", r.ramp]] as const) {
    if (!ramp || ramp.length < 2) err(`raster.${name}`, "ramp must have >= 2 glyphs");
    for (const ch of ramp) {
      const c = ch.charCodeAt(0);
      if (c < 32 || c > 126) err(`raster.${name}`, `ramp contains non-ASCII-printable char ${JSON.stringify(ch)}`);
    }
  }
  if (r.coverageMin >= r.coverageMax) {
    err("raster", `coverageMin (${r.coverageMin}) must be < coverageMax (${r.coverageMax})`);
  }

  const windowKeys: Array<keyof ShotSpec["density"]> = [
    "coverageMinStart",
    "coverageMinEnd",
    "coverageMaxStart",
    "coverageMaxEnd",
  ];
  const maxGlyphCoverage = maxCoverageOf(r.ramp);
  spec.shots.forEach((s, i) => {
    for (const k of windowKeys) {
      const v = s.density[k];
      if (!Number.isFinite(v) || v < 0 || v > maxGlyphCoverage + 1e-6) {
        err(`shots[${i}].density.${k}`, `coverage ${v} outside 0..${maxGlyphCoverage}`);
      }
    }
    if (s.density.coverageMinStart >= s.density.coverageMaxStart) {
      err(`shots[${i}].density`, "first-frame coverageMin must be < coverageMax");
    }
    if (s.density.coverageMinEnd >= s.density.coverageMaxEnd) {
      err(`shots[${i}].density`, "last-frame coverageMin must be < coverageMax");
    }
  });

  if (spec.shots.length === 0) err("shots", "at least one shot is required");

  let cursor = 0;
  const seenIds = new Set<string>();
  spec.shots.forEach((s, i) => {
    const p = `shots[${i}]`;
    if (seenIds.has(s.id)) err(`${p}.id`, `duplicate shot id ${s.id}`);
    seenIds.add(s.id);
    if (s.duration <= 0) err(`${p}.duration`, "duration must be > 0");
    if (Math.abs(s.start - cursor) > 1e-6) {
      err(`${p}.start`, `shot starts at ${s.start} but timeline cursor is ${cursor} (shots must tile contiguously)`);
    }
    cursor = s.start + s.duration;
    if (s.layers.length === 0) err(`${p}.layers`, "shot must have at least one layer");
    s.layers.forEach((l, li) => {
      const lp = `${p}.layers[${li}]`;
      if (l.count <= 0) err(`${lp}.count`, "count must be > 0");
      if (l.glyphRadius <= 0) err(`${lp}.glyphRadius`, "glyphRadius must be > 0");
      if (l.intensity < 0) err(`${lp}.intensity`, "intensity must be >= 0");
      if (l.focus < 0.1) err(`${lp}.focus`, "focus must be >= 0.1");
    });
    if (s.background < 0 || s.background > 1) err(`${p}.background`, "background must be within 0..1");
    for (const t of s.techniques) {
      // techniques are free-form labels, no constraint beyond being non-empty
      if (!t) err(`${p}.techniques`, "empty technique label");
    }
  });

  const total = cursor;
  if (Math.abs(total - spec.durationInSeconds) > 1e-6) {
    err("durationInSeconds", `shots tile to ${total}s but film duration is ${spec.durationInSeconds}s`);
  }
  const frames = Math.round(spec.durationInSeconds * spec.fps);
  if (frames <= 0) err("durationInSeconds", "film must contain at least one frame");

  if (spec.look.background.toLowerCase() !== "#000000") {
    warn("look.background", `background is ${spec.look.background}; the brief calls for black background`);
  }

  return { ok: !issues.some((i) => i.level === "error"), issues };
}
