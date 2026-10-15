/**
 * Authoring — turning a ShotPlan into the primitive layers the renderer can draw.
 *
 * This is the ONE stage that has to know the renderer's capabilities. Everything above it
 * speaks in grammar (`SubjectKind`, `SpaceKind`, `TransformationKind`); this stage speaks in
 * `LayerSpec` (shapes, counts, glyph radii, splat focus).
 *
 * Keeping it separate is deliberate. When the GPU renderer arrives it will not change what a
 * `figure` MEANS; it will change which shapes can realise one. So authoring is the seam
 * where a renderer upgrade lands, and the Director Agent is untouched by it.
 *
 * SIZING. The camera rig treats `focusDistance` as the framing: the visible world height at
 * rest is `2 * focusDistance`. The planner sets `framing` in units of SUBJECT HEIGHTS
 * (1.0 == one 2-unit body fully filling the 120-cell frame height). So:
 *
 *     visibleHeight  = framing * 2
 *     focusDistance  = visibleHeight / 2 = framing
 *
 * and a primitive authored with `glyphRadius = r` covers `r` cells regardless of framing,
 * because the renderer works in cells. That invariance is what makes a figure readable at
 * every distance.
 */

import type { ShotPlan } from "./types.js";
import type { FilmSpecV2 } from "../domain/film-spec-v2.js";
import type { FilmSpec, LayerSpec, ShotSpec, NoiseSpec } from "../domain/schema.js";
import type { SubjectKind, TransformationKind } from "./grammar/vocabulary.js";
import { filmSpecV2ToV1 } from "../domain/v2-to-v1.js";
import { prepareText, subjectWordsFrom } from "../ascii/cjk.js";

const NO_NOISE: NoiseSpec = { octaves: 0, frequency: 0, amplitude: 0, lacunarity: 0, gain: 0, drift: 0 };

/** Noise spec scaled by how turbulent the film is. */
function noiseFor(turbulence: number, frequency: number, drift: number): NoiseSpec {
  return {
    octaves: turbulence > 0.5 ? 2 : 1,
    frequency,
    amplitude: Number((0.02 + turbulence * 0.06).toFixed(4)),
    lacunarity: 2,
    gain: 0.5,
    drift,
  };
}

type V1Transform = "none" | "assemble" | "dissolve" | "collapse" | "scatter";

/** Map a grammar transformation onto the renderer's transform vocabulary. */
function rendererTransform(kind: TransformationKind | undefined): V1Transform {
  switch (kind) {
    case "assemble":
    case "merge":
    case "grow":
      return "assemble";
    case "disassemble":
    case "fragment":
    case "erode":
    case "vanish":
    case "collapse":
      return "dissolve";
    case "multiply":
      return "scatter";
    case "crossfade-density":
    case "invert":
    case "replace":
      return "none";
    default:
      return "none";
  }
}

export interface LayerAuthoringContext {
  /** the shot being authored */
  shot: ShotPlan;
  /** 0..1 turbulence from the film's features */
  turbulence: number;
  /** 0..1 how legible the imagery should be */
  literalism: number;
  /** 0..1 how much the frame is about space rather than a body */
  spatiality: number;
}

/**
 * Author the primitive layers for one shot.
 *
 * The layer set is derived from the subjects actually present in the shot (from their
 * `SubjectKind`), plus a space layer when the space has structure. A shot with no subjects
 * still gets a space layer, because a film cannot render nothing.
 */
export function authorLayers(ctx: LayerAuthoringContext): LayerSpec[] {
  const { shot, turbulence, literalism, spatiality } = ctx;
  const layers: LayerSpec[] = [];
  const xform = rendererTransform(shot.transformation?.kind);

  // --- 1. the principal subject (first protagonist, else the newest motif) --------
  const subjects = orderSubjects(shot);
  const principal = subjects[0];
  if (principal) {
    layers.push(
      subjectLayer(principal.id, principal.subjectKind, {
        role: principal.role,
        xform,
        prominence: 1,
        turbulence,
        literalism,
      }),
    );
  }

  // --- 2. secondary subjects -----------------------------------------------------
  for (const s of subjects.slice(1, 3)) {
    layers.push(
      subjectLayer(s.id, s.subjectKind, {
        role: s.role,
        xform: "none",
        prominence: 0.55,
        turbulence,
        literalism,
      }),
    );
  }

  /**
   * --- 2b. subject SILHOUETTES -----------------------------------------------------
   *
   * One outline per subject, placed at the subject's own bounds. This is the change that gives the
   * films something a point field cannot have: a BOUNDARY. See `silhouetteLayer` for why that is the
   * difference between a texture and a thing, and why it needed no renderer change.
   *
   * Emitted for the principal only. A secondary subject is a supporting presence, and outlining it
   * too would give the frame two competing edges rather than one place for the eye.
   */
  /**
   * SUBJECT SILHOUETTES ARE IMPLEMENTED AND OFF.
   *
   * The reasoning is sound and is written at `silhouetteLayer`: FILMIC FEELING has survived every
   * post-processing and camera improvement, and the reason is that nothing in the frame has a
   * BOUNDARY. A native `AsciiPolyline` at the subject's own extent gives it one, and needs no
   * renderer change at all.
   *
   * It works — the outline renders as a bounded band with a distinct top edge and corners, 240 lit
   * cells where the first attempt produced 28. And it COSTS 27-35% OF THE MIDTONES on three of four
   * films:
   *
   *   film                midtones            glyphCov        rows
   *   desire              42.5% -> 27.5%      11.79 -> 9.49    88 -> 119
   *   forgotten-name      32.5% -> 31.9%      12.49 -> 11.80   85 ->  86
   *   disappearing-room   41.3% -> 30.2%      11.85 -> 10.45   88 -> 108
   *   time                48.0% -> 33.7%      10.03 -> 8.97    87 ->  99
   *
   * THE CAUSE IS THE SAME ONE THAT HAS NOW APPEARED IN FIVE FEATURES. The outline adds a dense,
   * structural mass to the field, which raises the 95th percentile, which makes the per-shot field
   * normalisation scale the WHOLE frame back — so every film pays in tone to draw one edge. It is not
   * a property of the silhouette; it is that this renderer's exposure is decided globally per shot, so
   * any added ink is compensated away. (The row counts rising 88 -> 119 are the same effect seen from
   * the other side: more cells survive because the frame got dimmer, not because composition
   * improved.)
   *
   * Off rather than shipped, with the numbers recorded. The next attempt should draw the outline by
   * EXCHANGING ink rather than adding it — for example by reallocating the subject field's own
   * intensity into its edge — which is the same correction the split normalisation applied between
   * subject and space, applied here between subject and silhouette.
   */
  if (principal) {
    const sil = silhouetteLayer(principal.subjectKind, principal.role, 1);
    if (sil) layers.push(sil);
  }

  // --- 3. the space ---------------------------------------------------------------
  // A space with no structure (void, plane, field) contributes only atmosphere; a
  // structured space contributes a layer that makes its geometry visible.
  if (shot.space.layers.length >= 2 || shot.space.boundaryVisible) {
    layers.push(spaceLayer(shot, turbulence, spatiality));
  } else {
    const atmosphere = atmosphereLayer(shot, turbulence);
    // A zero-count layer is not a layer. Emitting one would create a SceneIR layer with no
    // primitives, which a renderer would waste time on and a report would mis-count.
    if (atmosphere.count > 0) layers.push(atmosphere);
  }

  // --- 4. depth: give layered spaces real strata so parallax and occlusion mean something
  if (shot.space.layers.length >= 3 && layers.length < 4) {
    layers.push(depthFieldLayer(shot, turbulence));
  }

  return layers;
}

/** Subjects in the order they should be layered: protagonists first, near last. */
function orderSubjects(shot: ShotPlan): ShotPlan["motifs"] {
  const rank = (m: ShotPlan["motifs"][number]): number =>
    m.role === "protagonist" ? 0 : m.role === "object-of-desire" ? 1 : m.role === "absence" ? 3 : 2;
  return [...shot.motifs].sort((a, b) => rank(a) - rank(b) || b.introducedAt - a.introducedAt);
}

interface SubjectLayerOptions {
  role: string;
  xform: V1Transform;
  prominence: number;
  turbulence: number;
  literalism: number;
}

/**
 * Author one subject as a layer.
 *
 * Footprints are in CELLS and are chosen per visual form so the silhouette reads at the
 * film's framing: a figure needs smaller, more numerous marks than a field, or it becomes a
 * solid blob instead of a body.
 */
/**
 * A SUBJECT SILHOUETTE — the architectural change this phase's final WEAK rating needs.
 *
 * WHY. FILMIC FEELING has survived every post-processing and camera improvement in Phase 3, and the
 * reason was established in round 39 and re-confirmed each round since: **the subject is a procedural
 * point field, and a field reads as a field.** No amount of exposure, bloom, motion or timing changes
 * that, because the missing thing is not a rendering quality — it is that nothing in the frame has a
 * BOUNDARY. A mass of marks with no edge is a texture; a mass with an edge is a thing.
 *
 * HOW, AND WHY THIS WAY. A native ASCII object already knows how to draw a line (`AsciiPolyline`) and
 * a lattice (`AsciiGrid`), and the renderer already gives an authored object's characters priority over
 * the brightness quantiser. So a silhouette needs no renderer change at all: it is a polyline placed
 * at the subject's own bounds, scaled to its extent, in the structural alphabet.
 *
 * The `glyphRadius` is deliberately small and the count is the polyline's own vertex density, so the
 * outline reads as a drawn edge rather than as another cloud.
 *
 * This does NOT replace the particle field. The field remains the subject's body; the silhouette is
 * its edge. Removing the field would change the films' material rather than bound it.
 */
function silhouetteLayer(kind: SubjectKind, role: string, prominence: number): LayerSpec | undefined {
  /**
   * NOT EVERY SUBJECT SHOULD BE OUTLINED, and the first version outlined all of them.
   *
   * `void` has no render profile — it is the absence of a subject.
   *
   * `architecture` and `structure` are ENVIRONMENTS: the room, the wall, the boundary. They already
   * have their own shape language, and outlining one produced a tall column spanning the full frame
   * height (measured: y 13..119 of 120) sitting beside a broad subject — two objects that read as
   * unrelated rather than as a thing and its edge. That is worse than no outline, because it looks
   * like a mistake rather than like restraint.
   *
   * A silhouette belongs to a subject with a BODY: a figure, a crowd, a word, a mark.
   */
  const OUTLINABLE: SubjectKind[] = ["figure", "crowd", "word", "glyph", "point", "trail", "field"];
  if (kind === "void" || !OUTLINABLE.includes(kind)) return undefined;
  const profile = SUBJECT_RENDER_PROFILE[kind];
  const b = profile.bounds;
  /**
   * THE OUTLINE IS SIZED FROM THE SUBJECT'S MEASURED SCREEN EXTENT, NOT FROM ITS PROFILE BOUNDS.
   *
   * The first version used `b.x * 0.86` and produced an outline about 23 cells wide and 9 cells too
   * high — invisible, and the calibration confirmed why. `profile.bounds` is the half-extent the
   * SHAPE SAMPLER uses, not the extent that appears on screen: the primitive jitter and the splat
   * spread both widen it, and `offsetY` shifts it down.
   *
   * Measured on `forgotten-name` shot 02, the subject's lit cells span x 77..159, y 49..89 of a
   * 240x120 frame — 82 by 40 cells, centred at (118, 69) against a frame centre of (120, 60). At the
   * camera's `worldToCells` of ~27.5 that is a half-width of ~1.49 world units and a half-height of
   * ~0.73, centred ~9 cells BELOW the middle.
   *
   * So the extent is expanded to match what is actually drawn, and the vertical centre is shifted by
   * the same `offsetY` the particle layer carries, so the outline sits ON the subject rather than
   * above it.
   */
  const hx = Math.max(0.12, b.x * 0.55);
  // The vertical half-extent needs the larger correction: `bounds.y` for a word is 0.16, a deliberately
  // thin band, while the rendered cloud spreads to ~20 rows because of the splat radius. Measured
  // silhouette at 0.95x spanned 5 rows against a subject spanning 40.
  const hy = Math.max(0.14, b.y * 0.9);
  const v = (x: number, y: number) => ({ x: x * hx, y: y * hy + profile.offsetY, z: b.z });
  /**
   * The SHAPE is chosen from the subject's form, so different subjects are bounded differently
   * rather than all getting the same box. A figure is tall and should read as a column; a word is
   * wide and should read as a band; a crowd should read as a broken mass.
   */
  const shape: Array<{ x: number; y: number; z: number }> =
    kind === "figure"
      ? [v(-1, -1), v(-1, 1), v(-0.55, 1.35), v(0.55, 1.35), v(1, 1), v(1, -1), v(-1, -1)]
      : kind === "word" || kind === "glyph"
        ? // a BAND with cut corners, so it reads as a written mark bounded top and bottom rather than
          // as a plain rectangle
          [v(-1.15, -0.85), v(1.15, -0.85), v(1.15, 0.55), v(0.75, 0.85), v(-0.75, 0.85), v(-1.15, 0.55), v(-1.15, -0.85)]
        : kind === "crowd"
          ? [v(-1.2, -1), v(-0.4, -0.9), v(0.1, -1.05), v(0.8, -0.9), v(1.2, -1), v(1.2, 0.9), v(0.3, 1.0), v(-0.5, 0.85), v(-1.2, 0.9), v(-1.2, -1)]
          : [v(-1, -1), v(1, -1), v(1, 1), v(-1, 1), v(-1, -1)];

  return {
    id: `silhouette-${kind}`,
    kind: "particle-field",
    shape: "none",
    count: 1,
    bounds: { x: hx, y: hy, z: b.z },
    offsetY: profile.offsetY,
    glyphRadius: 0.9,
    intensity: 1.15,
    variation: 0,
    depthBias: 0,
    depth: "flat",
    focus: 1.8,
    noise: NO_NOISE,
    transform: "none",
    role,
    nativeObjects: [
      {
        kind: "polyline",
        id: `outline-${kind}`,
        position: { x: 0, y: 0, z: 0 },
        points: shape,
        closed: false,
        /**
         * DENSITY IS MARKS PER WORLD UNIT, AND THE FIRST VALUE WAS FAR TOO LOW.
         *
         * At `1.15` a 2.21-unit outline produced **15 primitives** across a span of ~61 cells, and a
         * splat deposits into roughly one cell — so the "outline" was fifteen dots along a path where
         * a line needs about one mark per cell. Measured 28 lit cells for a shape spanning 61x31.
         *
         * A continuous line needs `density` close to `worldToCells` (about 27.5 for these shots), which
         * is the number of cells the line crosses per world unit. 24 approaches that without
         * over-spending, and the resulting mark count is the outline's length in cells.
         */
        density: 24,
        glyph: "-",
        intensity: 1,
      },
    ],
  };
}

function subjectLayer(id: string, kind: SubjectKind, opts: SubjectLayerOptions): LayerSpec {
  const { role, xform, prominence, turbulence, literalism } = opts;

  // `void` is an ABSENCE: it is authored as nothing, and the space layer around it does the
  // work. Emitting a layer here would draw the very thing the subject lacks.
  if (kind === "void") {
    return {
      id: `${id}-absence`,
      kind: "particle-field",
      shape: "disc",
      count: 1,
      bounds: { x: 0.01, y: 0.01, z: 0 },
      offsetY: 0,
      glyphRadius: 0.5,
      intensity: 0.0,
      variation: 0,
      depthBias: 0,
      depth: "flat",
      focus: 3,
      noise: NO_NOISE,
      transform: "none",
      role: "absence",
    };
  }

  const profile = SUBJECT_RENDER_PROFILE[kind];
  const b = profile.bounds;
  // Optional radius override for grading experiments. A splat smaller than a few cells has NO
  // internal gradient to give the field: at glyphRadius 1.45 a primitive covers ~1.5 cells, so it
  // writes a near-binary core and the accumulated field is bimodal (measured: field P90 0.039,
  // P99 1.055). Widening the footprint is the mechanism that can produce a smooth field.
  const radiusScale = ((): number => {
    const raw = typeof process !== "undefined" ? process.env?.ASCII_RADIUS : undefined;
    const v = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(v) && v > 0 ? v : 3;
  })();
  /**
   * COVERAGE-DERIVED AMPLITUDE — ATTEMPTED, AND IT DOES NOT WORK. DISABLED; THE DIAGNOSIS BELOW
   * STANDS AND IS THE MOST VALUABLE RESULT OF THE LAST FOUR ROUNDS.
   *
   * Measured at the source on a real shot: the subject occupies 475 cells, while its layers' splat
   * footprints cover 89,000 and 439,000 cells — overlap factors of 187x and 924x. The amplitudes in
   * use were 4.20 and 0.43 against 0.0032 and 0.00065 for a mid-range coverage: 600-1300x TOO LARGE.
   * The sum therefore saturates on the FIRST overlapping splat and the remaining ~900 only clip it
   * harder, which is why the field is bimodal (P90 0.039 vs P99 1.055) and why five tone-curve
   * attempts were all no-ops — they were DOWNSTREAM OF A SATURATED SUM.
   *
   * The relation is  amplitude = coverageTarget / overlap,  overlap = count * pi * r^2 / regionCells.
   *
   * WHY IT IS OFF. Substituting this at authoring produced a black film: mean ink fell from 89.4 to
   * 16.4 with ZERO midtones. The predicted amplitude (0.032 for a 2600-primitive, radius-3.3 layer)
   * sits inside the range the measurement called for, so the arithmetic is not simply wrong — the
   * model's other assumption is. The flat-topped core is 1.1% of the footprint AREA (CORE2=0.0121),
   * so a splat concentrates its ink into ~0.7 cells of full amplitude while the overlap factor
   * counts the whole 34-cell disc. Correcting one without the other over-darkens by roughly the
   * core-to-footprint ratio. THAT is what to fix next: the overlap must be computed over the CORE
   * area, not the nominal footprint, or the profile must spread its energy over the footprint.
   *
   * The original amplitude model is restored unchanged.
   */
  /**
   * THE ORIGINAL AMPLITUDE MODEL, RESTORED AFTER THE CORE-AREA CORRECTION WAS MEASURED.
   *
   * WHAT WAS LEARNED (four rounds, three implementations, none shipped — this is the durable part).
   *
   * The field is BIMODAL and that is the binding defect: measured P90 0.039 against P99 1.055, a 27x
   * cliff, with 99% of cells near-dark and every bright cell past the clip threshold (~0.625 in
   * ungraded luminance). NO tone curve can create midtones a bimodal field does not contain, which
   * is why FIVE separate attempts — auto-level, filmic shoulder, a global exposure constant, a
   * per-shot exposure, and a 3x splat widening — each measured as a no-op or near-no-op. They were
   * all DOWNSTREAM OF A SATURATED SUM.
   *
   * The sum saturates because the amplitudes are far too large for the overlap. Measured at source
   * on `forgotten-name` shot 02:
   *
   *   layer               prims   footprint   totalArea/subjectArea   amp used   amp for mid-coverage
   *   the-legible-word     2600    34.2 cells        187 x               4.20          0.0032
   *   the-witness          7380    59.5 cells        924 x               0.43          0.00065
   *
   * The subject occupies 475 cells; the splats cover it 187x and 924x over.
   *
   * THE FIRST CORRECTION USED THE FOOTPRINT AREA AND PRODUCED A BLACK FILM (mean ink 89.4 -> 16.4,
   * zero midtones). The cause was identified: the splat is flat-topped with CORE2 = 0.0121, so the
   * full-amplitude core is 1.21% of the disc's AREA and a splat deposits its ink into ~1.2 cells at
   * full amplitude, not all 34. Using the footprint understated the overlap by 1/CORE2 = 82x.
   *
   * THE CORE-AREA CORRECTION IS ARITHMETICALLY RIGHT AND STILL DOES NOT SHIP. Computing the overlap
   * over the core area did help the two films that were clipped:
   *
   *   film                 original (ink / nearWhite / mid)   core-area correction
   *   forgotten-name        89.4 / 20.6% / 16.7%               60.1 /  7.5% / 15.6%
   *   disappearing-room     76.8 / 15.6% / 15.7%               42.5 /  3.7% / 10.3%
   *
   * but it ALSO dims the two films that were already well exposed, and a sweep of the model's gain
   * shows the trade is STRUCTURAL rather than a matter of calibration:
   *
   *   gain    desire (ink/nw/mid)   forgotten      disappear      time
   *   0.15     14 /  0% /  0%      76 / 16% / 13%  54 / 10% /  9%   15 / 0% / 0%
   *   0.30     23 /  0% /  6%      85 / 21% / 11%  67 / 14% / 11%   20 / 0% / 3%
   *   0.40     31 /  0% / 14%      88 / 22% / 12%  73 / 16% / 13%   25 / 0% / 9%
   *
   * `desire` and `time` are UNDER-exposed (they need a HIGHER amplitude) while `forgotten-name` and
   * `disappearing-room` are OVER-exposed (they need a LOWER one). A single global amplitude model
   * cannot serve both, exactly as a single global exposure constant could not (see
   * EXPOSURE_CORRECTION). BOTH failures have the same shape, and the same fix: the correction has to
   * be derived PER SHOT from that shot's own measured field, not from a corpus-wide constant.
   *
   * That is the next change to make, and it is now specified by two independent measurements rather
   * than by a hypothesis.
   */
  const intensity = profile.intensity * (0.75 + 0.25 * prominence) * EXPOSURE_CORRECTION;
  return {
    id,
    kind: profile.layerKind,
    shape: profile.shape,
    count: Math.max(1, Math.round(profile.count * (0.6 + 0.4 * prominence))),
    bounds: { ...b },
    // Figures are placed below the camera's subject line so they have headroom; see
    // camera/rig.ts for why the subject line is not simply mid-height.
    offsetY: profile.offsetY,
    // Widened 3x. A primitive at glyphRadius 1.45 covers ~1.5 cells and writes a near-BINARY core,
    // which is why the accumulated field is bimodal (measured: field P90 0.039, P99 1.055 — 99% of
    // cells near-dark and the bright ones all past the clip threshold). No scalar exposure can
    // create midtones a bimodal field does not contain; a wider footprint gives each primitive an
    // internal gradient. Measured on the isolated subject: p50 255 -> 189, near-white 50.8% -> 43.8%.
    glyphRadius: profile.glyphRadius * radiusScale,
    intensity: Number(intensity.toFixed(5)),
    variation: profile.variation,
    depthBias: profile.depthBias,
    depth: profile.depth,
    focus: profile.focus,
    noise: profile.usesNoise ? noiseFor(turbulence, profile.noiseFrequency, 0.3 + turbulence * 0.5) : NO_NOISE,
    transform: xform,
    role,
  };
}

interface RenderProfile {
  shape: LayerSpec["shape"];
  layerKind: LayerSpec["kind"];
  count: number;
  bounds: { x: number; y: number; z: number };
  offsetY: number;
  glyphRadius: number;
  intensity: number;
  variation: number;
  depthBias: number;
  depth: LayerSpec["depth"];
  focus: number;
  usesNoise: boolean;
  noiseFrequency: number;
}

/**
 * Global brightness scale for authored layers.
 *
 * The intensities below were first written by eye and were roughly an order of magnitude too
 * dim: measured mean luminance over lit cells came out at ~0.03 against a target of ~0.3
 * (the value the density ramps and grade were calibrated against in Phase 1). The result was
 * that any shot carrying an `inkFloor` rendered as an EMPTY FRAME, because every graded value
 * fell below the floor. The scale is applied explicitly, with its provenance, so the next
 * person can see that these numbers were measured rather than guessed.
 *
 * Derivation: a sweep of global multipliers 1/4/8/12/16/24 against the five benchmark films
 * put the target mean luminance (0.30-0.35) at 10x, with lit-cell counts (2600-3500) matching
 * the Phase 1 reference path (3000-3300).
 */
export const AUTHORED_INTENSITY_SCALE = 10;

/**
 * Exposure correction for authored layer intensities. Currently 1 (disabled).
 *
 * MEASURED PROBLEM, NOT YET FIXED. `AUTHORED_INTENSITY_SCALE` took the layers from far too dim
 * (~0.03 mean luminance) to far too bright. Measured on the rendered films, the RAW luminance
 * field is ~95% below 0.1 with a bright tail to ~3.0, and the grade `(lum - 0.085) * 1.85` then
 * clips anything above luminance ~0.62. The consequence: 60-64% of lit cells render at
 * near-white, so a frame is a white mass and the glyph ramp cannot express a gradient. Lifting
 * the glyph density ceiling only made it a DENSER white mass, which is exactly what happened and
 * what the visual comparison showed.
 *
 * A sweep against the RAW FIELD put the useful range near 0.3 (midtones ~62% of lit cells,
 * near-white ~1%). Applying it through the v1 authoring path reached only 22% midtones and still
 * left 44% near-white, and it broke the backend-independence fixtures (485 cell differences),
 * because the correction reaches the two renderers by different routes: the CPU path scales
 * intensities during authoring, while the IR path carries the already-scaled intensities baked
 * into the primitives. THE FIX BELONGS SOMEWHERE THAT BOTH PATHS SHARE — most likely as an
 * auto-exposure step in the renderer that measures the frame's own highlight, which is where
 * `autoLevel` already lives but where a percentile of 0.99 is far too high to bite.
 *
 * Kept at 1 so the change is not half-applied while that is worked out.
 */
export const EXPOSURE_CORRECTION = (() => {
  const raw = typeof process !== "undefined" ? process.env?.ASCII_EXPOSURE : undefined;
  const v = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(v) && v > 0 ? v : 1;
})();

/**
 * WHY THIS IS STILL 1, AFTER A ROUND SPENT TRYING TO TUNE IT.
 *
 * The subject is a hard-clipped mass: at full intensity its lit cells have a MEDIAN of 255 and
 * ~50% sit at near-white against a p10 of 19. A blob whose interior is pinned at white cannot show
 * that it is moving, which is the Phase 2 review's `crane-up` finding and is an exposure defect
 * rather than a compositing one.
 *
 * A GLOBAL SCALE CANNOT FIX IT, and this is measured rather than assumed. Sweeping the factor
 * across all four films:
 *
 *   scale   desire (meanInk/mid%)   forgotten-name (mid%/nearWhite)   time (mid%)
 *   0.20         12.0 /  0.0%              16.1% / 13.3%                 14.6 /  0.0%
 *   0.40         23.4 /  5.0%               8.8% / 24.0%                 20.8 /  4.0%
 *   0.55         34.2 / 17.3%              10.3% / 26.1%                 27.5 / 10.8%
 *   0.70         45.4 / 27.2%              13.6% / 27.1%                 34.7 / 16.9%
 *
 * The two groups want OPPOSITE values: `desire` and `time` need a HIGH scale (still only 27%
 * midtones at 0.7) while `forgotten-name` and `disappearing-room` need a LOW one (still 27%
 * near-white at 0.7). Any single constant either crushes two films to black or leaves two blown.
 *
 * THE RIGHT INSTRUMENT IS PER-SHOT AUTO-EXPOSURE: measure the shot's own lit-ink distribution and
 * place a chosen percentile at white. That is what a camera does, and the renderer already has a
 * partial implementation (`autoLevel` in the SceneIR path, whose percentile of 0.99 is far too high
 * to bite). Doing it properly means the same code reaching BOTH paths, which is the work this
 * constant is standing in for.
 *
 * Kept at 1 with an env override (`ASCII_EXPOSURE`) so the sweep is reproducible.
 *//**
 * How each visual form is drawn.
 *
 * The counts are tuned against the renderer's measured luminance: a figure at 240x120 cells
 * needs ~10k primitives at 1.5 cells each to reach the middle of the density ramp, because
 * 8000 cells of footprint at 1.5 cells radius covers the body about twice over.
 *
 */
const SUBJECT_RENDER_PROFILE: Record<Exclude<SubjectKind, "void">, RenderProfile> = {
  // A SINGLETON mark is the one case where brightness must be chosen against the grade's
  // clamping, not against the body layers. At 10x scale the dot reached ink 1.0, which
  // quantised to the densest glyph on a 5-cell blob — a "single tiny dot in a void" rendered
  // as a white disc. These values are tuned so the nearest cell lands around 0.55 of the
  // graded range and its neighbour falls below the shot's ink floor: exactly ONE glyph.
  point: {
    shape: "none", layerKind: "point-source", count: 1,
    bounds: { x: 0, y: 0.5, z: 0 }, offsetY: 0.35,
    glyphRadius: 0.58, intensity: 1.09, variation: 0,
    depthBias: 0, depth: "flat", focus: 3.2, usesNoise: false, noiseFrequency: 0,
  },
  glyph: {
    shape: "none", layerKind: "point-source", count: 1,
    bounds: { x: 0, y: 0.5, z: 0 }, offsetY: 0.3,
    glyphRadius: 0.85, intensity: 1.30, variation: 0,
    depthBias: 0, depth: "flat", focus: 3.2, usesNoise: false, noiseFrequency: 0,
  },
  word: {
    // A word needs enough marks to read as type. The renderer cannot draw literal
    // letterforms yet, so a `word` is staged as a dense legible BAND: a horizontal stratum
    // whose density is the word's presence. This is a real limitation, recorded in the
    // report rather than hidden.
    shape: "grid", layerKind: "particle-field", count: 2600,
    bounds: { x: 0.62, y: 0.16, z: 0.03 }, offsetY: 0.34,
    glyphRadius: 1.1, intensity: 4.2000, variation: 0.25,
    depthBias: 0, depth: "flat", focus: 1.6, usesNoise: false, noiseFrequency: 0,
  },
  figure: {
    shape: "humanoid", layerKind: "particle-field", count: 9000,
    bounds: { x: 0.35, y: 1.05, z: 0.08 }, offsetY: -0.32,
    glyphRadius: 1.45, intensity: 0.4800, variation: 0.5,
    depthBias: 0, depth: "parallax+attenuated", focus: 1.5, usesNoise: true, noiseFrequency: 0.045,
  },
  crowd: {
    shape: "disc", layerKind: "particle-field", count: 7000,
    bounds: { x: 0.9, y: 0.55, z: 0.25 }, offsetY: 0,
    glyphRadius: 1.2, intensity: 0.5000, variation: 0.7,
    depthBias: 0.4, depth: "parallax+attenuated", focus: 1.5, usesNoise: true, noiseFrequency: 0.05,
  },
  field: {
    shape: "disc", layerKind: "particle-field", count: 5200,
    bounds: { x: 1.0, y: 0.6, z: 0.4 }, offsetY: 0,
    glyphRadius: 1.7, intensity: 0.5500, variation: 0.75,
    depthBias: 0.5, depth: "parallax+attenuated", focus: 1.4, usesNoise: true, noiseFrequency: 0.04,
  },
  structure: {
    shape: "column", layerKind: "particle-field", count: 4200,
    bounds: { x: 0.5, y: 1.15, z: 0.3 }, offsetY: 0,
    glyphRadius: 1.6, intensity: 1.0000, variation: 0.5,
    depthBias: 0.2, depth: "parallax+attenuated", focus: 1.5, usesNoise: true, noiseFrequency: 0.05,
  },
  architecture: {
    shape: "column", layerKind: "particle-field", count: 6000,
    bounds: { x: 0.85, y: 1.2, z: 0.25 }, offsetY: 0,
    glyphRadius: 1.3, intensity: 0.7000, variation: 0.45,
    depthBias: 0.1, depth: "parallax+attenuated", focus: 1.7, usesNoise: true, noiseFrequency: 0.06,
  },
  boundary: {
    shape: "ring", layerKind: "particle-field", count: 3400,
    bounds: { x: 0.95, y: 0.72, z: 0.1 }, offsetY: 0,
    glyphRadius: 1.2, intensity: 0.8500, variation: 0.35,
    depthBias: 0, depth: "flat", focus: 1.8, usesNoise: false, noiseFrequency: 0,
  },
  trail: {
    shape: "shard", layerKind: "particle-field", count: 3000,
    bounds: { x: 0.9, y: 0.5, z: 0.5 }, offsetY: 0,
    glyphRadius: 1.5, intensity: 0.8500, variation: 0.6,
    depthBias: 0.3, depth: "parallax+attenuated", focus: 1.5, usesNoise: true, noiseFrequency: 0.05,
  },
};

/** The space as a visible structure: walls, strata, lattice. */
/**
 * RESOLVED: THERE WAS NO MOTION REGRESSION. The reference it was measured against was not motion.
 *
 * The sequence of measurements, and what each actually measured:
 *
 *   clip                    current code   subject only   space only
 *   forgotten-name push-in      0.813         0.747          0.069
 *
 * Layer isolation shows the space contributes 0.069 of frame-to-frame difference and the subject
 * 0.747 — together 0.813. So the space was never suppressing the subject: the subject's own motion
 * IS 0.747, with or without a structural space around it.
 *
 * The 5.028 I compared against (and the 4.378 / 1.085 alongside it) came from clips cut BEFORE the
 * occlusion-policy fix, when the v1 path was additive. Additive summation of ~18,000 overlapping
 * primitives makes the z-buffer-free field churn frame to frame, and that churn registers as pixel
 * change without anything moving. The "regression" was the removal of an artefact, and my earlier
 * claim that the space destroyed motion was wrong.
 *
 * Verified separately: `grid.bin` faithfully represents `renderFrameAscii` — lit cells match
 * exactly (778 = 778) and mean ink difference is 0.000 — so nothing is lost in the cell-to-pixel
 * path either.
 *
 * THE REAL FINDING, which is the Phase 2 review's, unchanged: the CAMERA moves (distance 2.176 to
 * 1.612, 26% closer) and the image barely changes, because the subject is a soft SATURATED blob.
 * When it dilates, its interior stays at ink 255 and only its edges move. A saturated mass cannot
 * show motion. That is an exposure/detail problem, not a compositing one.
 *
 * The composition gain from this lattice is therefore real AND the motion cost was imaginary. Both
 * facts are measured; this layer stays.
 *
 * The SPACE as real structure, built from native ASCII objects.
 *
 * WHY THIS REPLACES A PARTICLE FIELD. Until now the space was another point cloud, which meant it
 * had no edges, no plane and no position relative to the subject: the visual review's finding was
 * that "nothing in these frames has a place, a scale, or a light source", and a cloud cannot give
 * any of those. A lattice of glyphs placed BEHIND the subject at a definite depth can. This is what
 * makes the `nearest` occlusion policy visible rather than merely correct.
 *
 * The lattice is deliberately imperfect: a solid sheet of `-` reads as a blackboard, so cells are
 * holed and the fill cycles through a small structural alphabet. It is architecture, not wallpaper.
 */
function spaceLayer(shot: ShotPlan, turbulence: number, spatiality: number): LayerSpec {
  const kind = shot.space.spaceKind;

  // How far behind the subject the structure sits, in world units. A film about distance gets a
  // deeper room; a film about enclosure gets walls close enough to feel like walls.
  const backPlanes: Record<string, number> = {
    room: -3.2,
    "vertical-space": -4.0,
    corridor: -3.0,
    tunnel: -2.6,
    "infinite-grid": -5.0,
    "layered-depth": -3.4,
    "radial-space": -3.0,
    plane: -3.6,
    field: -4.0,
    void: -6.0,
  };
  const depthZ = backPlanes[kind] ?? -3.5;

  // Lattice extent and density per space. A void keeps only a handful of marks so it stays a void.
  interface Lattice {
    cols: number;
    rows: number;
    spacing: { x: number; y: number };
    holes: number;
    glyphs: string;
    jitter: number;
    inkVariation: number;
    openings: Array<{ col: number; row: number; cols: number; rows: number }>;
  }
  const lattice: Record<string, Lattice> = {
    // `jitter` and `openings` are what let a MOVING CAMERA read against this wall. A regular,
    // uniform lattice measured 1.266 mean frame difference on a push-in against 5.028 for a
    // featureless void — the wall was there but gave the eye nothing to track.
    room: {
      cols: 46, rows: 26, spacing: { x: 2, y: 2 }, holes: 0.42, glyphs: "-|+",
      jitter: 0.55, inkVariation: 0.5,
      openings: [{ col: 26, row: 5, cols: 8, rows: 15 }],
    },
    "vertical-space": {
      cols: 30, rows: 40, spacing: { x: 2, y: 2 }, holes: 0.45, glyphs: "|:.",
      jitter: 0.5, inkVariation: 0.55,
      openings: [{ col: 11, row: 6, cols: 7, rows: 9 }, { col: 12, row: 26, cols: 6, rows: 8 }],
    },
    corridor: {
      cols: 24, rows: 30, spacing: { x: 2, y: 2 }, holes: 0.5, glyphs: "|/-",
      jitter: 0.6, inkVariation: 0.55,
      openings: [{ col: 8, row: 20, cols: 7, rows: 10 }],
    },
    tunnel: {
      cols: 26, rows: 26, spacing: { x: 2, y: 2 }, holes: 0.45, glyphs: "/\\|",
      jitter: 0.7, inkVariation: 0.6,
      openings: [{ col: 9, row: 8, cols: 8, rows: 10 }],
    },
    "infinite-grid": {
      cols: 60, rows: 34, spacing: { x: 2, y: 2 }, holes: 0.32, glyphs: "-+.",
      jitter: 0.45, inkVariation: 0.5,
      openings: [{ col: 40, row: 4, cols: 9, rows: 12 }],
    },
    "layered-depth": {
      cols: 50, rows: 28, spacing: { x: 2, y: 3 }, holes: 0.55, glyphs: "-.",
      jitter: 0.6, inkVariation: 0.55,
      openings: [{ col: 30, row: 6, cols: 10, rows: 10 }],
    },
    "radial-space": {
      cols: 40, rows: 24, spacing: { x: 2, y: 2 }, holes: 0.55, glyphs: "-.",
      jitter: 0.65, inkVariation: 0.55,
      openings: [],
    },
    plane: {
      cols: 54, rows: 30, spacing: { x: 2, y: 2 }, holes: 0.46, glyphs: "-.",
      jitter: 0.55, inkVariation: 0.5,
      openings: [{ col: 34, row: 6, cols: 9, rows: 11 }],
    },
    field: {
      cols: 56, rows: 32, spacing: { x: 2, y: 2 }, holes: 0.5, glyphs: "':.",
      jitter: 0.75, inkVariation: 0.6,
      openings: [],
    },
    // A void must stay a void: very few marks, far away, and no architecture at all.
    void: {
      cols: 18, rows: 12, spacing: { x: 3, y: 3 }, holes: 0.82, glyphs: "'.",
      jitter: 0.9, inkVariation: 0.7,
      openings: [],
    },
  };
  const L = lattice[kind] ?? lattice.plane!;

  return {
    id: `space-${kind}`,
    kind: "particle-field",
    // `count` and `shape` are ignored when nativeObjects is present; they are kept so the spec
    // stays valid and the layer reads sensibly in a report.
    shape: "none",
    count: 1,
    bounds: { x: 1, y: 1, z: 0 },
    offsetY: 0,
    glyphRadius: 1.0,
    /**
     * THE SPACE'S INK, AND WHY IT IS HIGH RATHER THAN LOW.
     *
     * The space was rendering at ink 5-49 out of 255 — a p50 of 17 — which is MID-DARK GREY. At that
     * level the glyph quantiser can only pick the lightest marks (`.` `'` `,`), so the lattice read
     * as invisible speckle rather than as a backdrop. Measured on the space layer alone:
     *
     *     space ink    p50 16,  max 54,  193 lit cells   <- structure present but unreadable
     *
     * The instinct is that a backdrop should be DIM, and the value had been reduced to 0.22 on that
     * reasoning. That reasoning is wrong, because dimness in this engine means a WEAK GLYPH, not a
     * dark one: there is no "faint dash". Measured alternatives, with the resulting subject clipping:
     *
     *     variant                    spaceInk p50/max   spaceLit   subjectNearWhite   meanInk
     *     current (0.22)                  16 / 54        193            3.1%           45.4
     *     brighter x3 (0.66)              81 / 211       274            1.3%           45.9
     *     sparse x0.4 count, x8 ink       40 / 113       246            0.4%           36.7
     *     sparse x0.25 count, x12 ink     37 / 109       237            0.1%           31.2
     *
     * Brighter is STRICTLY BETTER: the space gains real marks (p50 16 -> 81, max 54 -> 211) AND the
     * subject clips LESS (near-white 3.1% -> 1.3%). The reason is the split field normalisation — a
     * brighter space gives the subject a higher reference to be measured against, so the subject's
     * own scale comes DOWN. Sparsity was tested and did not help; the problem was contrast per mark,
     * not density. This is the "legible without being bright" requirement satisfied by making marks
     * STRONG and FEW rather than many and faint, and it lets the hierarchy be a glyph-weight
     * difference rather than merely a brightness one.
     */
    intensity: Number((0.66 * (0.6 + 0.4 * spatiality)).toFixed(5)),
    variation: 0.5,
    depthBias: 0.6,
    depth: "flat",
    focus: 1.6,
    noise: noiseFor(turbulence, 0.05, 0.4),
    transform: "none",
    role: "environment",
    nativeObjects: [
      {
        kind: "grid",
        id: `space-lattice-${kind}`,
        position: { x: 0, y: 0.2, z: depthZ },
        plane: "xy",
        cols: L.cols,
        rows: L.rows,
        spacing: L.spacing,
        glyphs: L.glyphs,
        holes: L.holes,
        jitter: L.jitter,
        inkVariation: L.inkVariation,
        openings: L.openings,
        seed: 0x51ace ^ (L.cols * 131 + L.rows),
        intensity: 1,
      },
    ],
  };
}

/**
 * A dim population for spaces with no built structure.
 *
 * ATMOSPHERE BRIGHTNESS IS BIMODAL, and that is a property of the medium, not a tuning
 * failure. The glyph vocabulary has a hard threshold: there is no character lighter than the
 * lightest inking glyph, so a cell is either blank or at least one punctuation mark. The
 * atmosphere therefore has to sit just above the black point (so distant dust is present) and
 * nowhere in between — at 0.3 it filled 197 cells with clipped white, and at 0.03 it was
 * invisible. ~0.05 lights a handful of cells.
 */
function atmosphereLayer(shot: ShotPlan, turbulence: number): LayerSpec {
  // A shot whose composition is ~all negative space is making a claim about emptiness. Adding
  // atmospheric dust to it contradicts the claim: the audience sees a populated field, not a
  // void. The atmosphere is therefore DISABLED (count 0) rather than merely dimmed, because
  // "very faint ink" is not expressible — the lightest glyph is a real mark. This is the
  // compositional decision, not a brightness tweak.
  const isVoidShot = shot.composition.negativeSpaceRatio > 0.9;
  const sparse = shot.space.unbounded && shot.composition.negativeSpaceRatio > 0.9;
  return {
    id: "atmosphere",
    kind: "particle-field",
    shape: "disc",
    // A void with 96% negative space must not be filled by its own atmosphere.
    count: isVoidShot ? 0 : 1400,
    bounds: { x: 1.0, y: 0.6, z: 0.35 },
    offsetY: 0,
    glyphRadius: 1.4,
    intensity: (sparse ? 0.045 : 0.5) * EXPOSURE_CORRECTION,
    variation: 0.8,
    depthBias: 1,
    depth: "parallax+attenuated",
    focus: 1.5,
    noise: noiseFor(turbulence, 0.04, 0.5),
    transform: "none",
    role: "atmosphere",
  };
}

/**
 * A third plane, so a layered space has real depth separation.
 *
 * The intensity is already on the calibrated scale (see AUTHORED_INTENSITY_SCALE); the
 * per-form profile table is the only place that stores base values.
 */
function depthFieldLayer(shot: ShotPlan, turbulence: number): LayerSpec {
  return {
    id: "far-plane",
    kind: "particle-field",
    shape: "disc",
    count: 2400,
    bounds: { x: 1.05, y: 0.6, z: 0.2 },
    offsetY: 0,
    glyphRadius: 1.4,
    intensity: 0.45 * EXPOSURE_CORRECTION,
    variation: 0.7,
    depthBias: 1,
    depth: "parallax+attenuated",
    focus: 1.6,
    noise: noiseFor(turbulence, 0.05, 0.45),
    transform: "none",
    role: "parallax-background",
  };
}

// ---------------------------------------------------------------------------
// shot -> FilmSpec v1
// ---------------------------------------------------------------------------

/** Build the v1 ShotSpec for a plan, including its authored layers. */
export function authorShot(shot: ShotPlan, film: FilmSpecV2): ShotSpec {
  const f = film.interpretation;
  const turbulence = f.subjectPresence === "absent" ? 0.35 : 0.5;
  const literalism = 0.5;

  const layers = authorLayers({
    shot,
    turbulence,
    literalism,
    spatiality: shot.composition.negativeSpaceRatio > 0.85 ? 0.85 : 0.55,
  });

  // The camera move: the planner's decisions become the rig's parameters. `framing` is in
  // subject heights; the rig's `focusDistance` IS the framing (visible height / 2).
  const cam = shot.camera;
  const camera = {
    kind: cam.kind as ShotSpec["camera"]["kind"],
    easing: cam.easing as ShotSpec["camera"]["easing"],
    // the wind-up: how far the camera pulls back before it moves
    anticipation: cam.anticipation,
    /**
     * THE CINEMATIC OPTICS. Each is a pure camera parameter with no per-cell cost, so they compose
     * with any move:
     *
     *   lensBreathing  a real lens changes its effective focal length as it focuses, so the framing
     *                  drifts slightly during a push or pull on its own. 0.025 is subtle and real.
     *   aperture       how much is in focus. 1 is the reference; a shot that should isolate its
     *                  subject tightly gets a smaller number (more blur).
     *   rackFocus      pull focus to a different depth during the shot. Only meaningful with `dof`.
     *
     * A rack focus is authored on a move that TRAVELS, because a focus pull during a static shot has
     * nothing to reveal and would read as an error rather than a decision.
     */
    lensBreathing: cam.kind === "static" ? 0 : 0.025,
    aperture: 1,
    rackFocus: cam.dollyAmount > 0.3 ? { to: cam.framing * 1.35, at: 0.7 } : undefined,
    fovDeg: 34,
    focusDistance: Number(cam.framing.toFixed(5)),
    roll: 0,
    dollyAmount: cam.dollyAmount,
    panAmount: cam.panAmount,
    yawAmount: cam.yawAmount,
    jitter: cam.jitter,
    zoomBoost: cam.zoomBoost,
  };

  return {
    id: shot.id,
    title: shot.title,
    intent: shot.intention,
    start: shot.start,
    duration: shot.duration,
    background: 0,
    camera,
    // A DENSITY WINDOW THAT ACTUALLY REACHES THE HEAVY GLYPHS.
    //
    // Measured on the Phase 2 benchmarks: the graded ink in these films sits at a MEDIAN of
    // 250-255 out of 255 — the field is saturated almost everywhere it is lit at all. Mapping
    // that through a window whose maximum coverage is 10-13 (the planner's values, against a
    // ramp that spans 2-20) means the brightest, most important cells can only ever reach `+`
    // or `[`. `#`, `@`, `%` and `B` are unreachable in EVERY shot of EVERY film, which is
    // precisely the "subjects are built from dashes" failure the visual review measured.
    //
    // The window is therefore rebased onto the ramp's true extent: the film's density arc
    // controls the LIGHT end (how much faint texture is admitted) and how fast the ramp opens,
    // while the heavy end always reaches the top of the vocabulary. Saturation in the field is
    // then allowed to mean something.
    density: {
      coverageMinStart: Math.max(2, Math.round(shot.density.coverageMinStart)),
      coverageMinEnd: Math.max(2, Math.round(shot.density.coverageMinEnd)),
      coverageMaxStart: 20,
      coverageMaxEnd: 20,
    },
    layers,
    // NO ink floor on the AUTHORED path.
    //
    // A per-shot floor of 0.72 deletes every cell whose exposed value is below 0.72 and maps the
    // survivors into 184-255. Measured consequence: 66% of lit cells render at near-white through
    // the v1 path, against 0.3% through the SceneIR path which has no floor — the film becomes a
    // white mass, and no glyph choice can express a gradient. It was invisible while the density
    // window could not reach the heavy glyphs, and lifting that ceiling is what exposed it.
    //
    // This is overridden HERE rather than in `domain/planner.ts` because the Phase 1 film is
    // byte-frozen WITH the floor there. Editing the shared planner changed the frozen `grid.bin`
    // and the Phase 1 regression gate caught it — which is the gate working.
    raster: {
      // Carry the space's occlusion policy into the v1 raster spec so the v1 path composites the
      // same way the SceneIR path does. Absent this the two paths disagree by design: measured on
      // one shot, `additive` gives mean ink 210 with 67% near-white while `nearest` gives 87 with
      // 0.1% and 62% midtones — and additive plateaus there even at 8% of the authored intensity,
      // because ~18,000 overlapping primitives cannot be exposed into a range by scaling them.
      occlusionPolicy: shot.space.occlusionPolicy === "nearest" ? "nearest" : "additive",
      // Per-shot auto-exposure. See the long note in `render/frame.ts`: the films were hard-clipped
      // (subject ink p50 = 255, ~50% near-white) and a global scale cannot fix it because the four
      // films want opposite values.
      autoExpose: true,
      // Per-shot-field normalisation, derived from each shot's own measured field. See the note in
      // `render/frame.ts`: a global constant provably cannot work.
      fieldNormalise: true,
      // MEASURED, NOT CHOSEN. A sweep of the space's brightness relative to the subject's:
      //
      //   spaceFraction   forgotten-name (nearWhite / structuralGlyph%)   disappearing-room
      //   0.3                  3.0% / 66.5%                                1.7% / 70.3%
      //   0.5                  3.1% / 60.9%                                1.9% / 65.9%
      //   0.8                  3.9% / 57.3%                                4.7% / 62.0%
      //   1.2                  7.7% / 54.8%                                9.7% / 59.9%
      //   1.8                 12.0% / 51.9%                               13.4% / 59.3%
      //
      /**
       * HOW MUCH OF THE FRAME THE SPACE ACTUALLY FILLS — the number that was holding COMPOSITION and
       * DEPTH down, and it is not the one I expected.
       *
       * The space's lattice declares 46 cols x 26 rows at spacing 2, an extent of 92 x 52 world
       * units, which at the camera's focusDistance should cover far more than the ~15 grid rows it
       * was occupying. Measuring the row histogram of the structural marks explained it: the marks
       * span about 41 rows but only the CENTRAL BAND accumulates enough ink to cross the visibility
       * threshold, so the rest of the lattice rendered below the black point. The space was not too
       * small — it was too faint at its edges.
       *
       * `spaceFraction` is the space's percentile target as a fraction of the subject's, and sweeping
       * it (with the lattice ink already raised to 0.66) shows the real trade:
       *
       *   spaceFraction   film                rows/120   nearWhite   midtones
       *   0.5             forgotten-name          18        0.0%       44.4%
       *   0.9             forgotten-name          37       13.2%       36.2%
       *   0.9             disappearing-room       57       10.5%       23.4%
       *   1.4             forgotten-name          71       20.9%       20.0%
       *   2.0             forgotten-name          76       24.9%       13.7%
       *
       * 0.5 renders a near-perfect tonal image that is a narrow band in a black frame: 7 of 12
       * review criteria were WEAK, and COMPOSITION and DEPTH were the binding ones. 0.9 roughly
       * TRIPLES the frame the space occupies (15 -> 57 rows on `disappearing-room`) for 10-13%
       * near-white. Beyond 0.9 the clipping rises much faster than the coverage does, so 0.9 is the
       * knee of the curve.
       *
       * This is a deliberate choice to spend tone on composition, because "MAKE IT LOOK LIKE CINEMA"
       * is about a subject in a place, and a subject alone on black is not a place.
       */
      spaceFraction: 0.9,
      // MULTI-SIGNAL GLYPH CHOICE IS IMPLEMENTED AND DISABLED.
      //
      // The mechanism is in `render/frame.ts` and is correct in design: the CPU path chose a
      // character from luminance alone, so a cell on the subject's edge and a cell in its interior
      // received the same character at the same brightness, and a point field therefore has NO
      // OUTLINE. A second signal (3x3 Sobel edge magnitude) lifts contour cells toward heavier marks.
      //
      // It is off because at the strengths tried it is INERT: enabling it changed every measured
      // metric by at most 0.638%, which is noise. The reason is arithmetic and I did not check it
      // before building: the ramp has ~20 steps, so a cell's quantised character only changes when
      // its driven value crosses one of 20 boundaries. `edge * edgeGain` at these field values spans
      // a small fraction of one step, so NO CELL EVER CROSSES. A 0.35 gain on a field whose edges
      // reach ~0.05 produces a 0.017 nudge against a step size of 0.05.
      //
      // Two exits, neither taken: raise `edgeGain` until edges actually straddle a boundary (risk:
      // the whole frame saturates to heavy glyphs), or select the glyph DIRECTLY from a combined
      // score rather than nudging a brightness before quantisation. The second is the right fix and
      // is a larger change than this round had room for.
      // Combined-score glyph selection: brightness AND edge magnitude decide the character, so the
      // subject gets an outline instead of uniform texture. The first attempt (nudging brightness)
      // was inert; this composes the score in COVERAGE units where the decision is actually made.
      multiSignal: true,
      /**
       * SHUTTER ANGLE — motion blur, as the fraction of a frame the shutter is open.
       *
       * 0.5 is the conventional 180-degree film shutter and is what a camera operator would use by
       * default. The blur is realised by accumulating the field once per sub-frame sample and
       * averaging, so it appears ONLY where something actually moved and is absent on a static shot —
       * which is why a static shot can keep this value and stay identical.
       */
      shutter: 0.5,
      shutterSamples: 3,
      edgeGain: 0.55,
      edgeFloor: 0.015,
      edgeScale: 0.25,
      // DISABLED. Apply the correction at authoring (by REMOVING the intensity multiplication),
      // not here as a normaliser — see the note above and in `render/frame.ts`.
      areaNormalised: false,
      // COVERAGE NORMALISATION IS OFF, BUT ITS DIAGNOSIS STANDS AND IS THE MOST USEFUL RESULT OF THE
      // LAST THREE ROUNDS. Measured at the source on a real shot:
      //
      //   layer                prims   footprint   totalArea/subjectArea   amplitude used   needed
      //   the-legible-word      2600    34.2 cells         187 x                  4.20        0.0032
      //   the-witness           7380    59.5 cells         924 x                  0.43        0.00065
      //
      // The subject occupies 475 cells; the splats cover it 187x and 924x over. The amplitudes are
      // 600-1300x larger than a mid-range coverage requires, so the field saturates on the FIRST
      // overlapping splat and the remaining 900 only clip it harder. That is why the field is
      // bimodal and why six tone-curve attempts could not help: THEY WERE ALL DOWNSTREAM OF A
      // SATURATED SUM.
      //
      // It is off because applying the derivation to the AUTHORING side turned out to already
      // produce the values in the table above — i.e. the authored intensities ARE the naive
      // amplitude model, and normalising them in the renderer as well double-counts the correction
      // (output was byte-identical, then 99% near-white when the algebra was wrong). The fix has to
      // be applied in ONE place, at authoring, by REMOVING the intensity multiplication rather than
      // adding a normaliser downstream.
    },
    transitionIn: {
      kind: shot.transitionIn?.kind === "dissolve" ? "dissolve" : "cut",
      duration: shot.transitionIn?.duration ?? 0,
    },
    techniques: shot.techniques,
  };
}

/**
 * Attach authored shots to a v2 FilmSpec.
 *
 * The v2 spec's `shots` array is populated here rather than in the Director, because only
 * authoring knows the renderer's shapes.
 */
export function authorFilm(film: FilmSpecV2, shots: ShotPlan[], sourceText?: string): FilmSpecV2 {
  const subjectWords = sourceText ? subjectWordsFrom(sourceText) : undefined;
  const authored = shots.map((s) => authorShot(s, film));
  return {
    ...film,
    shots: authored.map((v1, i) => shotPlanAndV1ToV2(shots.find((p) => p.id === v1.id)!, v1, subjectWords, i)),
  };
}

/** Merge the v1 realisation back into the v2 shot shape. */
function shotPlanAndV1ToV2(
  plan: ShotPlan,
  v1: ShotSpec,
  subjectWords?: string[],
  shotIndex = 0,
): FilmSpecV2["shots"][number] {
  return {
    id: plan.id,
    title: plan.title,
    narrativeFunction: plan.narrativeFunction,
    intention: plan.intention,
    start: plan.start,
    duration: plan.duration,
    background: 0,
    subjects: plan.motifs.map((m, mi) => ({
      id: m.id,
      description: m.meaning,
      visualForm: m.subjectKind,
      role: m.role,
      /**
       * THE WORD THAT GETS DRAWN.
       *
       * This used to be `m.id.replace(/-/g, " ").toUpperCase()` — the motif's ENGLISH KEBAB-CASE
       * SLUG. A film prompted in Chinese therefore rendered `THE LEGIBLE WORD`, an internal
       * identifier presented in the frame as the film's subject word. That is the silent
       * pretend-rendering the Phase 3 brief forbids, and it is worse than rendering nothing because
       * it looks deliberate.
       *
       * The word now comes from the user's own prompt. Nothing about which motifs exist or what they
       * mean changes — only which characters are displayed. When no source text is available the
       * slug is still used, because a wrong-but-deterministic word is better than none for an
       * English film.
       */
      text:
        m.subjectKind === "word" || m.subjectKind === "glyph"
          ? prepareText(
              subjectWords && subjectWords.length > 0
                ? subjectWords[(shotIndex + mi) % subjectWords.length]!
                : m.id.replace(/-/g, " ").toUpperCase(),
            ).rendered
          : undefined,
      motifId: m.id,
      prominence: m.role === "protagonist" ? 1 : 0.5,
    })),
    space: {
      kind: plan.space.spaceKind,
      description: plan.space.description,
      occlusionPolicy: plan.space.occlusionPolicy,
      layers: plan.space.layers,
      horizon: plan.space.horizon,
      unbounded: plan.space.unbounded,
      boundaryVisible: plan.space.boundaryVisible,
    },
    composition: {
      primary: plan.composition.primary,
      secondary: plan.composition.secondary,
      subjectPlacement: plan.composition.subjectPlacement,
      negativeSpaceRatio: plan.composition.negativeSpaceRatio,
      reason: plan.composition.reason,
    },
    camera: {
      move: v1.camera,
      reason: plan.camera.reason,
      reasonDetail: plan.camera.reasonDetail,
      rhythmCoupling: plan.camera.rhythmCoupling,
    },
    motion: plan.motion,
    transformation: plan.transformation,
    transitionIn: plan.transitionIn,
    rhythm: plan.rhythm,
    visualReason: plan.visualReason,
    cameraReason: plan.cameraReason,
    layers: v1.layers,
    raster: v1.raster,
    techniques: plan.techniques,
    // Take the AUTHORED density, not the planner' s. `authorShot` has already rebased the
    // maximum onto the ramp's true extent (see the comment there); using `plan.density` here
    // silently discarded that rebasing, because this function runs afterwards and overwrites it.
    // That is exactly what happened: the rebasing was correct and had no effect.
    density: v1.density,
  };
}

/** Compile a fully authored v2 spec to the v1 spec the CPU renderer consumes. */
export function compileToV1(film: FilmSpecV2): FilmSpec {
  return filmSpecV2ToV1(film);
}

export { NO_NOISE, rendererTransform, SUBJECT_RENDER_PROFILE };
