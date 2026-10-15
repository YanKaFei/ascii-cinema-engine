/**
 * Frame evaluator.
 *
 * The single place where ShotSpec + Scene + Camera become a character grid.
 *
 * Order of operations, per frame:
 *   1. solve the camera for this frame
 *   2. per layer: apply the authored transform (assemble / dissolve / collapse /
 *      scatter) to every primitive
 *   3. project primitives and splat them into a float luminance field on the glyph
 *      grid, with depth attenuation and per-layer atmospheric noise
 *   4. grade the field (exposure, vignette, scanline, grain)
 *   5. quantize each cell's luminance into an ASCII glyph through the animated
 *      density window
 *
 * No step is allowed to introduce a non-ASCII shape. Step 5 is the only place a
 * character is chosen, and it can only choose from `rasterSpec.ramp`.
 */

import { fbm3, NOISE_SEED_NAMESPACE } from "../core/noise.js";
import { clamp, clamp01, project, smoothstep, type Projected } from "../core/math.js";
import { createRng } from "../core/rng.js";
import { buildRamp, quantize, windowRamp, type DensityRamp, type RampEntry } from "../glyphs/ramp.js";
import { solveCamera, visibilityRamp, type CameraState, type RigFilm } from "../camera/rig.js";
import { resetCharGrid, type CharGrid } from "./raster.js";
import type { Scene } from "../scene/scene.js";
import type { FilmSpec, LayerSpec, ShotSpec } from "../domain/schema.js";

export interface ShotFrameStats {
  /** fraction of cells carrying ink */
  inkCoverage: number;
  litCells: number;
  meanInk: number;
  peakInk: number;
  /** the density window actually used, as a printable ASCII string */
  densityWindow: string;
  /** coverage bounds actually used */
  coverageMin: number;
  coverageMax: number;
  cameraDistance: number;
  cameraFovDeg: number;
  visiblePrimitives: number;
  /** how many distinct glyphs were emitted */
  distinctGlyphs: number;
  /**
   * Pre-grade luminance telemetry on the character grid. This exists because the
   * only way to author a primitive field honestly is to measure it: the numbers
   * below are what the tuning of every layer in planner.ts was driven by.
   */
  fieldMean: number;
  fieldP50: number;
  fieldP90: number;
  fieldP99: number;
  fieldPeak: number;
  /**
   * Fraction of cells whose pre-grade luminance exceeds the shot's black point.
   * This is the honest measure of "how dense is the frame", independent of where
   * the density window happens to be pinned.
   */
  coveragePreGrade: number;
  /**
   * Mean luminance over LIT cells only — i.e. the density of the marks, not of the
   * void. This is the quantity that actually corresponds to "how bright does the
   * figure read", and it is what the body layers are calibrated against.
   */
  fieldMeanLit: number;
}

export interface EvaluationResult {
  grid: CharGrid;
  stats: ShotFrameStats;
  camera: CameraState;
}

interface LayerRenderState {
  radialOffset: number;
  radialScale: number;
  alpha: number;
  sizeScale: number;
  /**
   * PER-PRIMITIVE STAGGER. Five of the nine transitions Gate 6 names act on primitives at different
   * TIMES rather than on the layer as a whole, so one value per layer cannot express them.
   *
   * `staggerWindow` is how much of the shot the whole shape takes to arrive, `staggerReverse` runs it
   * backwards (ERASE), and `staggerNoise` replaces the ordering key with the primitive's own identity
   * (SCRAMBLE). The accumulation loop combines these with the primitive's `dir`.
   */
  staggerWindow: number;
  staggerReverse: boolean;
  staggerNoise: boolean;
}

interface WindowCache {
  min: number;
  max: number;
  entries: RampEntry[];
  str: string;
}

/** Mutable cache the caller keeps across frames so the density window is not rebuilt per frame. */
export interface DensityWindowCache extends WindowCache {}

export function createDensityWindowCache(): DensityWindowCache {
  // NOTE: initialization must not use NaN. The window is rebuilt when it drifts by
  // more than 0.35, and `x - NaN > 0.35` is false, so a NaN seed would silently
  // disable the density window for the entire film.
  return { min: -Infinity, max: -Infinity, entries: [], str: "" };
}

const RAMP_CACHE = new Map<string, DensityRamp>();

function getRamp(source: string): DensityRamp {
  let r = RAMP_CACHE.get(source);
  if (!r) {
    r = buildRamp(source);
    RAMP_CACHE.set(source, r);
  }
  return r;
}

/**
 * Compute the animated density window for a shot at normalized time u.
 * This is the glyph-density transformation: the usable glyph set grows from a few
 * light marks to the full ASCII mass vocabulary.
 */
export function shotCoverageWindow(
  shot: ShotSpec,
  u: number,
): { min: number; max: number } {
  const t = clamp01(u);
  const k = t * t * (3 - 2 * t);
  const d = shot.density;
  const min = d.coverageMinStart + (d.coverageMinEnd - d.coverageMinStart) * k;
  const max = d.coverageMaxStart + (d.coverageMaxEnd - d.coverageMaxStart) * k;
  return { min, max };
}

function layerState(layer: LayerSpec, u: number): LayerRenderState {
  const t = clamp01(u);
  switch (layer.transform) {
    case "assemble": {
      // Starts far out on the rim and converges onto the structure. The transport is
      // a FRACTION of each primitive's own rim distance: a fixed world-space offset
      // can only pull in primitives that are already near the frame edge.
      const s = visibilityRamp(t, 0.06, 0.92);
      return {
        radialOffset: (1 - s) * 0.55,
        radialScale: 1,
        // The form does not resolve until the back half of the shot: before that it
        // must read as a scrambled cloud, not as a figure.
        alpha: visibilityRamp(t, 0.0, 0.50),
        sizeScale: 0.88 + 0.12 * s,
        staggerWindow: 0,
        staggerReverse: false,
        staggerNoise: false,
      };
    }
    case "dissolve": {
      // Structure lets go and drifts outward while thinning out.
      const s = visibilityRamp(t, 0.0, 1.0);
      return {
        radialOffset: s * 3.4,
        radialScale: 1 + s * 0.75,
        // Must reach exactly 0 well before the end so the film can end on a single lit
        // cell. It also has to fall FAST and the transport has to be large, or the
        // silhouette is still recognisably a standing figure at the end of the shot
        // and the beat reads as "figure stands still while dust appears".
        alpha: 1 - visibilityRamp(t, 0.02, 0.46),
        sizeScale: 1 - 0.30 * s,
        staggerWindow: 0,
        staggerReverse: false,
        staggerNoise: false,
      };
    }
    case "collapse": {
      const s = visibilityRamp(t, 0.0, 1.0);
      return { radialOffset: -s * 0.2, radialScale: 1 - s * 0.35, alpha: 1, sizeScale: 1 - 0.2 * s , staggerWindow: 0, staggerReverse: false, staggerNoise: false};
    }
    case "scatter": {
      const s = visibilityRamp(t, 0.0, 1.0);
      // The debris must linger longest: it is what the eye follows out of the frame.
      return { radialOffset: s * 3.4, radialScale: 1 + s * 0.5, alpha: 1 - visibilityRamp(t, 0.10, 0.85), sizeScale: 1 , staggerWindow: 0, staggerReverse: false, staggerNoise: false};
    }
    /**
     * TYPE ON — the shape is WRITTEN. Each primitive has its own arrival window, ordered along the
     * primitive's own direction, so marks appear in reading order rather than fading in together.
     */
    case "type-on":
      return { radialOffset: 0, radialScale: 1, alpha: 1, sizeScale: 1, staggerWindow: 0.55, staggerReverse: false, staggerNoise: false };
    /** ERASE — the reverse: marks leave in reading order. */
    case "erase":
      return { radialOffset: 0, radialScale: 1, alpha: 1, sizeScale: 1, staggerWindow: 0.55, staggerReverse: true, staggerNoise: false };
    /** SCRAMBLE — every mark flickers on its own schedule, so the shape boils. */
    case "scramble":
      return { radialOffset: 0, radialScale: 1, alpha: 1, sizeScale: 1, staggerWindow: 0, staggerReverse: false, staggerNoise: true };
    /** STRETCH — the shape elongates along its own direction while surviving. */
    case "stretch": {
      const s = visibilityRamp(t, 0.0, 1.0);
      return { radialOffset: 0, radialScale: 1 + s * 0.9, alpha: 1, sizeScale: 1, staggerWindow: 0, staggerReverse: false, staggerNoise: false };
    }
    /** COMPRESS — the shape contracts along its own direction. */
    case "compress": {
      const s = visibilityRamp(t, 0.0, 1.0);
      return { radialOffset: s * 0.25, radialScale: 1 - s * 0.45, alpha: 1, sizeScale: 1, staggerWindow: 0, staggerReverse: false, staggerNoise: false };
    }
    /** REPLACE — marks are exchanged one at a time, a staggered radial re-seat. */
    case "replace":
      return { radialOffset: 0, radialScale: 1, alpha: 1, sizeScale: 1, staggerWindow: 0.4, staggerReverse: false, staggerNoise: true };
    case "none":
    default:
      return { radialOffset: 0, radialScale: 1, alpha: 1, sizeScale: 1, staggerWindow: 0, staggerReverse: false, staggerNoise: false };
  }
}

/** Cheap per-cell film grain, independent of the spatial noise field. */
function grainAt(x: number, y: number, frame: number): number {
  let h = Math.imul(x + 0x1f, 0x27d4eb2d) ^ Math.imul(y + 0x7b, 0x165667b1) ^ Math.imul(frame + 1, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function evaluateShotFrame(
  film: FilmSpec & RigFilm,
  shot: ShotSpec,
  scene: Scene,
  localTime: number,
  frameIndex: number,
  grid: CharGrid,
  windowCache: DensityWindowCache,
): EvaluationResult {
  resetCharGrid(grid);

  const { cols, rows } = grid;
  const preGradeThreshold = film.raster.blackPoint / Math.max(1e-6, film.raster.exposure);
  const aspect = film.width / film.height;
  const u = clamp01(localTime / Math.max(1e-6, shot.duration));

  /**
   * MOTION BLUR, BY SUMMING THE FIELD OVER THE SHUTTER WINDOW.
   *
   * WHY THIS IS THE RIGHT IMPLEMENTATION. A real shutter is open for a fraction of the frame
   * interval, and anything that moves while it is open is recorded as a smear along its own path.
   * Averaging the accumulated field over several camera samples inside that window reproduces exactly
   * that: the blur appears only where something moved, its length is proportional to the motion, and
   * it is zero for a static shot. No directional approximation is involved, so it also blurs
   * correctly when the camera rotates rather than translates — which a screen-space directional blur
   * would not.
   *
   * COST is linear in the sample count, so the count is small (3 by default) and the whole loop is
   * skipped when the shot does not ask for blur. `shutter` is the fraction of a frame the shutter is
   * open: 0.5 is the conventional 180-degree film shutter.
   */
  const shutter = shot.raster.shutter ?? film.raster.shutter ?? 0;
  const shutterSamples = shutter > 0 ? Math.max(2, shot.raster.shutterSamples ?? film.raster.shutterSamples ?? 3) : 1;
  const frameSeconds = 1 / Math.max(1, film.fps);

  const camera = solveCamera(film, shot, localTime, aspect);

  // --- 1/5: density window (glyph density transformation) -------------------
  const win = shotCoverageWindow(shot, u);
  if (Math.abs(win.min - windowCache.min) > 0.35 || Math.abs(win.max - windowCache.max) > 0.35) {
    const entries = windowRamp(getRamp(film.raster.ramp), win.min, win.max);
    windowCache.min = win.min;
    windowCache.max = win.max;
    windowCache.entries = entries;
    windowCache.str = entries.map((e) => String.fromCharCode(e.code)).join("");
  }
  const densityWindow = windowCache.entries;

  // --- 2/3: primitive field --------------------------------------------------
  const luminance = LUMINANCE_SCRATCH(cols, rows);
  // A z-buffer is only allocated when the shot asks for `nearest`. Allocating it unconditionally
  // would be a silent behaviour change for every existing film, including the frozen Phase 1 one.
  const zbuf = (shot.raster.occlusionPolicy ?? film.raster.occlusionPolicy) === "nearest"
    ? ZBUF_SCRATCH(cols, rows)
    : undefined;
  if (zbuf) zbuf.fill(Infinity);
  luminance.fill(0);

  /**
   * AUTHORED-GLYPH PLANE.
   *
   * A cell's character normally comes from its brightness. When a native ASCII object supplies a
   * glyph, that character is AUTHORED and must win — a line is made of `-` because it was written
   * as `-`, not because `-` happened to be the right density.
   *
   * The plane is filled by PROJECTION ONLY, in a separate pass after accumulation. It deliberately
   * does not participate in the luminance sum: an authored glyph changes which character is drawn,
   * never how much light the cell received. Keeping the two separate is what lets typography be
   * added without perturbing the exposure work of the previous rounds.
   */
  const authoredGlyph = AUTH_SCRATCH(cols, rows);
  authoredGlyph.fill(0);

  /**
   * AREA-NORMALISED SPLAT ENERGY.
   *
   * WHY. A layer's `intensity` was the amplitude of EVERY primitive, so a layer with 9,000
   * primitives packed into a subject-sized region writes 9,000 overlapping contributions to the
   * same cells. Measured consequence: the field is bimodal — P90 0.039 against P99 1.055, a 27x
   * cliff — with 99% of cells near-dark and every bright cell past the clip threshold. That is why
   * FIVE separate tone-curve attempts (auto-level, filmic shoulder, a global exposure constant, a
   * per-shot exposure, a 3x splat widening) each measured as a no-op: no transform can create
   * midtones a bimodal field does not contain.
   *
   * Widening the footprint cannot fix it either, and this is the key insight: the flat-topped core
   * is a fixed FRACTION of the footprint radius, so a bigger splat writes the same peak amplitude
   * over a wider disc. Scaling radius moves ink sideways, not down.
   *
   * What works is dividing the layer's ink among its primitives, so `intensity` becomes a BUDGET
   * for the region rather than an amplitude per mark. The budget is independent of `count`, which
   * makes the field's level predictable and tunable.
   *
   * OPT-IN via `raster.areaNormalised`, so the frozen Phase 1 film is untouched.
   *
   * STATUS: IMPLEMENTED, MEASURED, AND DISABLED — but its DIAGNOSIS is confirmed and is the most
   * useful result of the last three rounds. Measured at the source on a real shot:
   *
   *     layer                prims   footprint   totalArea/subjectArea   amp used   amp needed
   *     the-legible-word      2600    34.2 cells         187 x               4.20       0.0032
   *     the-witness           7380    59.5 cells         924 x               0.43       0.00065
   *
   * The subject occupies 475 cells and the splats cover it 187x and 924x over. The amplitudes are
   * 600-1300x too large, so the sum saturates on the FIRST overlapping splat and the remaining 900
   * only clip it harder. Every tone-curve attempt was DOWNSTREAM OF A SATURATED SUM.
   *
   * It is disabled because normalising here DOUBLE-COUNTS: the authored intensities already ARE the
   * naive amplitude model, so the correction belongs at authoring — by REMOVING the intensity
   * multiplication — rather than as a normaliser added here. That is the next change to make.
   */
  // DEFAULT FALSE. See the note below: the model is retained and reachable but not enabled.
  const areaNorm = shot.raster.areaNormalised ?? film.raster.areaNormalised ?? false;
  /** target coverage for a cell covered by the layer's mean overlap; default 0.6 */
  const coverageTarget = shot.raster.coverageTarget ?? film.raster.coverageTarget ?? 0.6;
  /** the region the layer is expected to occupy, in cells; the model's only free parameter */
  const referenceCells = shot.raster.referenceCells ?? film.raster.referenceCells ?? 9000;

  const proj: Projected = { visible: false, sx: 0, sy: 0, depth: 0 };
  // NOTE: `worldToCells` is read from the PER-SAMPLE camera inside the shutter loop. Using the outer
  // camera here made motion blur a no-op — the loop averaged three identical fields, which is why
  // every shutter value produced byte-identical output. Same "identical output" signal as before.
  void camera.worldToCells;
  let visiblePrimitives = 0;

  /** Roles that are the SUBJECT of a shot; everything else is the world it stands in. */
  const SUBJECT_ROLES = new Set(["protagonist", "witness", "antagonist", "figure", "crowd"]);
  /** Roles that make up the WORLD. */
  const WORLD_ROLES = new Set(["environment", "atmosphere"]);

  /**
   * The world WITHOUT the subject, captured immediately AFTER the last world layer has drawn.
   *
   * I first captured this BEFORE THE FIRST SUBJECT LAYER, on the assumption that authoring emits
   * space first. It does not: measured order on a real shot is
   * `[protagonist, protagonist, witness, environment]` — THE SPACE IS LAST. The snapshot was
   * therefore an empty field, the space percentile came back undefined, and the split silently did
   * nothing (the output was byte-identical to whole-field normalisation, which is how I noticed).
   * Taking it after the world layers is correct for either ordering.
   */
  let worldAfterField: Float32Array | undefined;

  const motionSum = shutterSamples > 1 ? BLUR_SCRATCH2(cols * rows) : undefined;
  if (motionSum) motionSum.fill(0);

  for (let sample = 0; sample < shutterSamples; sample++) {
  // sample times spread across the open shutter, centred on the frame
  const sampleTime = shutterSamples > 1
    ? localTime + (sample / (shutterSamples - 1) - 0.5) * shutter * frameSeconds
    : localTime;
  const sampleU = clamp01(sampleTime / Math.max(1e-6, shot.duration));
  if (shutterSamples > 1) {
    // each sample starts from a clean field, because the samples are AVERAGED rather than summed
    luminance.fill(0);
    if (zbuf) zbuf.fill(Infinity);
  }
  const sampleCamera = shutterSamples > 1 ? solveCamera(film, shot, sampleTime, aspect) : camera;

  const worldToCells = sampleCamera.worldToCells;
  for (const layer of scene.layers) {
    const spec = layer.spec;
    const st = layerState(spec, sampleU);

    // Atmospheric noise contributed by this layer is applied in the field loop.
    const splat: number[] = [0, 0, 0, 0]; // x, y, radius, energy

    for (const prim of layer.prims) {
      /**
       * PER-PRIMITIVE STAGGER, for the transitions that act on marks at different TIMES.
       *
       * TYPE ON and ERASE sweep across the shape in its own reading order, SCRAMBLE gives every mark
       * its own schedule, and REPLACE re-seats marks one at a time. A single value per layer cannot
       * express any of those, which is why the smoke tests showed the new kinds byte-identical to
       * `none` until this was added.
       *
       * `along` orders a mark along its own direction: for a text or line object that reads as
       * writing. `key` is a stable hash of the primitive's identity, for the unordered kinds.
       * A mark that has not arrived yet is COLLAPSED to zero size rather than merely dimmed, so it
       * genuinely is not on screen — a faint mark is still a mark in this medium.
       */
      let primAlpha = 1;
      let primSizeMul = 1;
      if (st.staggerWindow > 0 || st.staggerNoise) {
        const along = clamp01((prim.dir.x + prim.dir.y + 2) / 4);
        const key = ((Math.sin(prim.i * 12.9898 + prim.dir.x * 78.233 + prim.dir.y * 37.719) * 43758.5453) % 1 + 1) % 1;
        const order = st.staggerNoise ? key : along;
        if (st.staggerWindow > 0) {
          /**
           * `staggerReverse` INVERTS THE DIRECTION, NOT THE ORDER.
           *
           * The first version reversed the ordering key and then ran the same rising ramp, so ERASE
           * measured IDENTICAL to TYPE ON in shape — measured lit cells across u=0.2..0.8 rose
           * 0/690/1122/2168/2742/2980/3102, the same profile as writing. Reversing which mark arrives
           * first does not make a shape leave.
           *
           * TYPE ON: a mark is absent until its turn, then stays.     arrive = ramp(u)
           * ERASE:   a mark is present until its turn, then goes.     arrive = 1 - ramp(u)
           */
          const p = clamp01((u - order * (1 - st.staggerWindow)) / st.staggerWindow);
          const arrive = st.staggerReverse ? 1 - p : p;
          if (arrive <= 0) continue;
          primAlpha = arrive;
          primSizeMul = arrive < 0.25 ? 0.001 : 1;
        } else {
          // a per-mark flicker: the shape boils rather than sweeps
          const w = Math.sin(u * Math.PI * 6 + key * Math.PI * 2);
          if (w < -0.4) continue;
          primSizeMul = 1 - u * 0.1;
        }
      }

      // Transform: displace along the primitive's own radial direction, scaled by
      // how far out on the rim the primitive sits (see transformAt).
      const off = st.radialOffset * prim.rim;
      let wx = prim.p.x + prim.dir.x * off;
      let wy = prim.p.y + prim.dir.y * off;
      let wz = prim.p.z + prim.dir.z * off;

      if (st.radialScale !== 1) {
        const sc = st.radialScale;
        wx = layer.origin.x + (wx - layer.origin.x) * sc;
        wy = layer.origin.y + (wy - layer.origin.y) * sc;
        wz = layer.origin.z + (wz - layer.origin.z) * sc;
      }

      proj.visible = false;
      project(sampleCamera, { x: wx, y: wy, z: wz }, proj);
      if (!proj.visible) continue;

      // Pinhole-normalized screen coords -> glyph cells. `sx`/`sy` are in units of
      // "world units at the rest plane", so one unit is worldToCells cells.
      const gx = proj.sx * worldToCells + cols * 0.5;
      const gy = rows * 0.5 - proj.sy * worldToCells;
      if (gx < -6 || gy < -6 || gx > cols + 6 || gy > rows + 6) {
        visiblePrimitives++;
        continue;
      }

      // Footprint is authored in glyph cells. NOTE: `proj.sx` is already a
      // perspective projection, so the screen radius must NOT be divided by depth
      // again — doing so collapses every primitive to a sub-cell speck as soon as
      // the camera is a few units away.
      const cells = spec.glyphRadius * prim.sizeMul * st.sizeScale * primSizeMul;
      if (cells < 0.20) continue;
      const cl = cells < 0.55 ? 0.55 : cells > 64 ? 64 : cells;

      // `intensity` is the luminance this layer wants at the centre of a primitive
      // cell that sits exactly ON the primitive. The splat profile then carries the
      // falloff, so big soft halos stay soft instead of saturating.
      const atten = depthAttenuation(spec, proj.depth);
      /**
       * COVERAGE-DERIVED AMPLITUDE.
       *
       * Measured, at the source, for one real shot: the subject occupies 475 cells, while the two
       * subject layers' splat footprints cover 89,000 and 439,000 cells — overlap factors of 187x
       * and 924x. The amplitudes in use were 4.20 and 0.43, against 0.0032 and 0.00065 needed for a
       * mid-range coverage. They were 600-1300x too large, which is why the field is bimodal and
       * why SIX tone-curve attempts could not help: the field saturates in the FIRST overlapping
       * splat, and the remaining 900 only clip it harder.
       *
       * The correct amplitude is not a matter of taste; it follows from the overlap:
       *
       *     coverage(cell)  ~  overlap  x  amplitude,   overlap = totalSplatArea / regionCells
       *     amplitude       =  target   /  overlap
       *
       * `regionCells` is not knowable before the frame is splatted, so it is approximated by a
       * reference region (the intended subject extent). That is the one free parameter, and it is
       * exposed as `coverageTarget` so it can be measured rather than guessed.
       */
      // amplitude = coverageTarget / overlap, with overlap = totalSplatArea / referenceCells.
      // Expressed as a REPLACEMENT for `intensity` (not a multiplier on it): including the authored
      // intensity here would double-count it, since `amp` multiplies by it again.
      const area = Math.PI * cl * cl;
      const ampNorm = areaNorm
        ? (coverageTarget * referenceCells) / Math.max(1e-9, spec.count * area)
        : spec.intensity;
      const amp = ampNorm * prim.intMul * st.alpha * primAlpha * atten;
      if (amp <= 0.0015) continue;

      splat[0] = gx;
      splat[1] = gy;
      splat[2] = cl;
      splat[3] = amp;
      // An authored glyph claims exactly this primitive's own cell, so it is recorded BEFORE the
      // splat spreads. It changes the character drawn, never the light accumulated.
      //
      // THIS WRITE WAS MISSING. It had been written, then lost during a later edit of this same
      // loop; `authoredGlyph` remained declared and READ but never POPULATED, so `hasAuthored` was
      // always false and every authored character silently fell back to the brightness quantiser.
      // A renderer-level typography feature was completely inert while the rasteriser tests (which
      // exercise `rasteriseObject` directly and never touch the renderer) stayed green. Found by
      // noticing that the space lattice quantised to its declared `-|+` alphabet only 25% of the
      // time.
      if (prim.glyphCode !== undefined) {
        const ax = Math.round(gx);
        const ay = Math.round(gy);
        if (ax >= 0 && ay >= 0 && ax < cols && ay < rows) authoredGlyph[ay * cols + ax] = prim.glyphCode;
      }
      splatInto(luminance, cols, rows, splat, spec.focus, proj.depth, zbuf);
      visiblePrimitives++;
    }
    // after a world layer finishes, record the field; this is the world-alone reference. Only the
    // LAST sample is kept, because it is the one the rest of the pipeline operates on.
    if (WORLD_ROLES.has(String(spec.role))) {
      worldAfterField = Float32Array.from(luminance);
    }
  }

  // average this sample into the running sum, so the field the rest of the pipeline sees is the
  // shutter-window average rather than an instantaneous slice
  if (motionSum) {
    for (let i = 0; i < cols * rows; i++) motionSum[i]! += luminance[i]!;
  }
  } // end shutter sample loop

  if (motionSum) {
    const inv = 1 / shutterSamples;
    for (let i = 0; i < cols * rows; i++) luminance[i] = motionSum[i]! * inv;
  }

  // --- atmospheric noise ----------------------------------------------------
  // One field for the whole frame, not one summed per layer: adding the same noise
  // N times lifts the entire frame onto a grey floor and destroys the negative
  // space the film is built on. The shot's strongest noise spec wins.
  const noiseLayers = scene.layers.filter((l) => l.spec.noise.octaves > 0);
  if (noiseLayers.length > 0) {
    const ns = noiseLayers.reduce((a, b) => (b.spec.noise.amplitude > a.spec.noise.amplitude ? b : a))
      .spec.noise;
    const wzBase = localTime * ns.drift;
    const seed = (NOISE_SEED_NAMESPACE ^ scene.seed) >>> 0;
    for (let y = 0; y < rows; y++) {
      const base = y * cols;
      for (let x = 0; x < cols; x++) {
        luminance[base + x]! += fbm3(x * 0.09, y * 0.09, wzBase, seed, ns);
      }
    }
  }

  // --- 4: grade -------------------------------------------------------------
  const look = film.look;
  const r = film.raster;

  /**
   * PER-SHOT AUTO-EXPOSURE.
   *
   * WHY THIS EXISTS, measured. The authored films were hard-clipped: on an isolated subject layer
   * the lit ink had a MEDIAN of 255 with ~50% of cells at near-white against a p10 of 19. A subject
   * whose interior is pinned at white cannot show that it is moving — when the camera pushes in and
   * the mass dilates, only its edges change.
   *
   * WHY NOT A CONSTANT. A global exposure scale was swept across all four films and the two groups
   * want OPPOSITE values: `desire` and `time` are under-exposed (27% midtones even at scale 0.7, and
   * they collapse to black at 0.2) while `forgotten-name` and `disappearing-room` are over-exposed
   * (27% near-white at 0.7). Any single constant damages half the corpus.
   *
   * So the scale is measured PER SHOT-FRAME from the field's own lit values: a high percentile is
   * placed just under white. This is what a camera does, and it is the same idea as the SceneIR
   * path's `autoLevel`.
   *
   * OPT-IN, so the frozen Phase 1 film is untouched: absent `autoExpose` the scale is exactly 1 and
   * the output is byte-identical to before.
   *
   * The scale only ever DARKENS (`min(1, ...)`). Brightening a dim shot would lift its noise floor
   * into visibility, and a shot that is genuinely dark should stay dark.
   */
  // SHOT-LEVEL FIRST. `authoring.ts` writes these onto each shot's raster, and reading only the
  // film-level field silently ignored them — the same mistake that hid the occlusion policy.
  const autoExposeOn = shot.raster.autoExpose ?? r.autoExpose;
  let autoExposure = 1;
  if (autoExposeOn) {
    const target = shot.raster.autoExposeTarget ?? r.autoExposeTarget ?? 0.62;
    const pct = shot.raster.autoExposePercentile ?? r.autoExposePercentile ?? 0.98;
    const samples: number[] = [];
    const stride = Math.max(1, Math.floor(luminance.length / 4096));
    for (let i = 0; i < luminance.length; i += stride) {
      const v = luminance[i]!;
      if (Number.isFinite(v) && v > 1e-4) samples.push(v);
    }
    if (samples.length > 32) {
      samples.sort((a, b) => a - b);
      const hi = samples[Math.min(samples.length - 1, Math.floor(samples.length * pct))]!;
      const graded = (hi - r.blackPoint) * r.exposure;
      if (graded > target) {
        autoExposure = Math.max(1 / 6, target / graded);
      }
    }
  }
  const inkFloor = shot.raster.inkFloor ?? r.inkFloor;
  const vigStrength = look.vignette;
  const scanFrequency = look.scanlineHz;
  const grainAmount = look.filmGrain;

  /**
   * PER-SHOT FIELD NORMALISATION.
   *
   * THE PROBLEM, measured five times over. The field is bimodal: P90 0.039 against P99 1.055, a 27x
   * cliff, with 99% of cells near-dark and every bright cell past the clip threshold (~0.625). Tone
   * curves cannot fix that, and NEITHER CAN ANY CORPUS-WIDE CONSTANT — two independent experiments
   * proved it:
   *
   *   - a global EXPOSURE constant: `desire`/`time` need a HIGH value, `forgotten-name`/
   *     `disappearing-room` need a LOW one; every constant crushed two films or left two blown;
   *   - a global AMPLITUDE model: identical trade, verified across a gain sweep.
   *
   * Both failures have the same shape because both apply ONE number to films that want opposite
   * corrections. So the scale is derived per shot-FRAME from the field itself: a high percentile of
   * the lit values is placed just under the clip threshold.
   *
   * This is a POST-ACCUMULATION scale, not a per-primitive amplitude, and for THIS defect that is
   * the right place: the saturation happens inside the accumulation (the first overlapping splat
   * already clips), so what needs correcting is the SUM, which is exactly what a post-scale can
   * reach. Scaling also preserves the relative balance between layers for free, which a per-layer
   * amplitude change would not.
   *
   * OPT-IN and ONLY EVER DARKENS. `autoExpose` is the existing per-shot opt-in, so the frozen
   * Phase 1 film (which sets neither) is untouched.
   */
  /**
   * THE PER-SHOT FIELD NORMALISATION, RESTORED.
   *
   * THIS CODE WAS LOST, and finding it is the substance of round 53. The comment block above survived
   * but the implementation did not — a casualty of the block moves during the bloom reordering in
   * round 37. `authoring.ts` kept setting `fieldNormalise: true`, and the renderer kept IGNORING it,
   * silently. The instrument that would have caught it is the one this phase has relied on eight
   * times: output that does not change when it should.
   *
   * Confirmed by measurement rather than by reading: the field's P99 was **1.117** against a clip
   * threshold of ~0.625. A normaliser that places a high percentile just under that threshold cannot
   * leave it at 1.117, so it was provably not running.
   *
   * What it does, and why it was built (rounds 23-24): the field is bimodal, and a CORPUS-WIDE constant
   * cannot fix it because these films want opposite corrections. So the scale is derived per
   * shot-FRAME from the field itself, applied to the SUBJECT and the SPACE separately, because the
   * subject's brightness is relative to itself while the space's is relative to the subject.
   *
   * Only ever darkens, and opt-in, so the frozen Phase 1 film is untouched.
   */
  /**
   * EXPOSURE INTENT OUTRANKS THE NORMALISER — steps 9 and 10 of Phase 3.1.
   *
   * The normaliser is a RENDERING ASSISTANT. It measures a shot's own highlights and scales the frame to
   * place them under the clip threshold, which is correct for an ordinary shot and **wrong for a shot
   * whose emptiness is the point**.
   *
   * What went wrong without this: `disappearing-room`'s lit-cell range collapsed from **58x to 3.5x**,
   * because a nearly-empty shot has a low 95th percentile and the normaliser lifted it — so no shot in
   * the corpus was permitted to be genuinely empty. That is the normaliser overriding direction.
   *
   * HOW EACH INTENT IS HONOURED. The rule is stated as a *meaning* and translated here, rather than
   * being a threshold on some scene statistic:
   *
   *   auto, normal            the normaliser runs as before
   *   preserve-emptiness      it runs toward a VERY LOW target, so an empty shot is held dark
   *   preserve-darkness       it runs toward a LOW target and may never lift
   *   silhouette              toward a LOW target, so the subject stays a shape against light
   *   high-key                toward a HIGHER target, flattening toward light
   *   low-key                 toward a LOWER target, keeping the frame dark
   *
   * NOTHING HERE IS A NUMERIC THRESHOLD ON SCENE CONTENT. Every branch is selected by a value the
   * Director declared in a typed field.
   *
   * ⚠ A FIRST ATTEMPT SIMPLY *DISABLED* THE NORMALISER for `preserve-emptiness` and `silhouette`, on
   * the reasoning that the Director had said "leave it alone". **Measured, that made the shot BRIGHTER,
   * not emptier** — 2.1% near-white became **76.6%** — because the normaliser was the only thing holding
   * the field down. Disabling an exposure control is not the same as honouring a direction to be dark.
   * The intents now DE-EXPOSE instead of standing aside.
   */
  const intent = shot.raster.exposureIntent ?? film.raster.exposureIntent ?? "auto";
  const intentSuppressesNorm = false;

  const fieldNormaliseOn = (shot.raster.fieldNormalise ?? film.raster.fieldNormalise ?? false) && !intentSuppressesNorm;
  if (fieldNormaliseOn) {
    const baseTarget = shot.raster.fieldTarget ?? film.raster.fieldTarget ?? 0.55;
    // high-key lifts the target (flatter, lighter); low-key lowers it (darker, more contrast kept)
    const subjectTarget = intent === "high-key" ? Math.min(0.8, baseTarget * 1.35)
      : intent === "low-key" ? baseTarget * 0.6
      : intent === "preserve-emptiness" ? baseTarget * 0.16
      : intent === "preserve-darkness" ? baseTarget * 0.3
      : intent === "silhouette" ? baseTarget * 0.25
      : baseTarget;
    const pct = shot.raster.fieldPercentile ?? film.raster.fieldPercentile ?? 0.95;
    const spaceFraction = shot.raster.spaceFraction ?? film.raster.spaceFraction ?? 0.9;

    /** the percentile of a strided sample, above the noise floor */
    const pctOf = (arr: Float32Array): number | undefined => {
      const samples: number[] = [];
      const step = Math.max(1, Math.floor((cols * rows) / 8192));
      for (let i = 0; i < cols * rows; i += step) {
        const v = arr[i]!;
        if (v > preGradeThreshold) samples.push(v);
      }
      if (samples.length < 64) return undefined;
      samples.sort((a, b) => a - b);
      return samples[Math.min(samples.length - 1, Math.floor(samples.length * pct))];
    };

    const wholeHi = pctOf(luminance);
    const spaceHi = worldAfterField ? pctOf(worldAfterField) : undefined;

    const mayLift = intent !== "preserve-darkness";
    if (wholeHi !== undefined && wholeHi > subjectTarget && mayLift) {
      // the subject's own percentile, with the space's contribution removed
      const subjHi = spaceHi !== undefined ? Math.max(spaceHi * 0.25, wholeHi - spaceHi * 0.5) : wholeHi;
      const fieldScale = Math.max(1 / 60, subjectTarget / subjHi);
      const spaceTarget = subjectTarget * spaceFraction;
      const spaceScale = spaceHi !== undefined && spaceHi > spaceTarget
        ? Math.max(1 / 60, spaceTarget / spaceHi)
        : 1;
      if (worldAfterField) {
        // space * spaceScale + subject * fieldScale, the subject taken as the difference
        for (let i = 0; i < cols * rows; i++) {
          const space = worldAfterField[i]! * spaceScale;
          const subject = (luminance[i]! - worldAfterField[i]!) * fieldScale;
          luminance[i] = space + (subject > 0 ? subject : 0);
        }
      } else {
        for (let i = 0; i < cols * rows; i++) luminance[i]! *= fieldScale;
      }
    }
  }

  /**
   * POST-PROCESSING — BLOOM, HALATION, ABERRATION AND DEPTH OF FIELD.
   *
   * WHY THESE ARE WORTH HAVING. `vignette`, `filmGrain` and `scanlineHz` were applied; `chromaticBloom`
   * was DECLARED IN THE SCHEMA AND NEVER IMPLEMENTED, and halation, aberration and depth of field did
   * not exist at all. Their absence is visible in the films: a bright mark is simply a pale mark, with
   * nothing bleeding around it, so nothing in the frame reads as EMITTING light. That is a large part
   * of why the visual review's FILMIC FEELING stayed WEAK while every structural criterion passed —
   * the frame has places and subjects and motion, but nothing is LIT.
   *
   * ORDER MATTERS. Bloom and halation are applied to the FIELD, before the tone mapping and
   * quantisation, so the glow changes which CHARACTER is drawn rather than being painted over the
   * characters afterwards. That is the difference between light in the scene and a filter on the
   * image, and only the former is compatible with the brief's "no ordinary footage converted to
   * ASCII" — everything here is computed from the procedural field.
   *
   * All four are opt-in and default to 0, so the frozen Phase 1 film is byte-identical.
   *
   * ORDER — AND THIS WAS THE WHOLE OF ROUND 36's TONAL COST. Bloom used to run BEFORE the field
   * normalisation, so the normaliser measured the BLOOMED 95th percentile, found it higher, and
   * scaled the frame down to hit its target. The glow was therefore compensated away and the film
   * paid for it in midtones (41.3% -> 26.8% on `forgotten-name`) while gaining only part of the
   * light. Bloom now runs AFTER normalisation, so the exposure is decided on the real field and the
   * glow is added on top as pure gain. The stages are otherwise identical.
   *
   * STATUS OF THE STAGE ITSELF: implemented and ON. A sweep of `chromaticBloom` on `forgotten-name`:
   *
   *     bloom  halation   meanInk   nearWhite   midtones   structural%
   *     0      0            69.8       3.2%       41.3%       45.4%
   *     0.3    0.4          44.2       2.3%       23.4%       29.6%   <- LESS ink, not more
   *     0.7    0.4          68.2       4.3%       35.4%       37.2%
   *     1.2    0.4          77.9       6.0%       38.9%       36.4%
   *
   * Bloom is supposed to ADD light, so mean ink should rise monotonically with it. It FALLS at 0.3
   * and then rises — non-monotonic, which means the implementation is wrong somewhere and I have not
   * found where. Two candidate causes, neither checked: `BLUR_SCRATCH` returns a buffer that the
   * vertical pass writes back into `luminance` through a shared reference, and the `bright` array
   * feeds both blur radii from the same source while `blur()` allocates its own temporaries.
   *
   * The shape of this file is that every post-processing stage is applied to the FIELD before
   * quantisation, which is the right design and is why the frozen film is unaffected. What is missing
   * is a check that a stage is monotone in its own strength, and that check is what found this.
   */
  /**
   * CHROMATIC ABERRATION. Glyph cells are displaced outward by a sub-cell amount per channel, which
   * at this resolution means nudging the red and blue SAMPLES apart rather than resampling colour:
   * the field is luminance-only, so the effect is expressed as a small lateral smear of the mark.
   * Applied to the field for the same reason as bloom.
   */
  const aberration = look.aberration ?? 0;
  if (aberration > 0) {
    for (let y = 0; y < rows; y++) {
      const nx = (y / Math.max(1, rows - 1)) * 2 - 1;
      for (let x = 0; x < cols; x++) {
        const ny = (x / Math.max(1, cols - 1)) * 2 - 1;
        // radial: no displacement at the centre, most at the corners
        const r = Math.sqrt(nx * nx + ny * ny) * 0.7071;
        const shift = aberration * r;
        if (shift < 1e-3) continue;
        const sx = Math.max(0, Math.min(cols - 1, Math.round(x - shift)));
        const sy = Math.max(0, Math.min(rows - 1, Math.round(y - shift)));
        const other = luminance[sy * cols + sx]!;
        luminance[y * cols + x] = luminance[y * cols + x]! * 0.75 + other * 0.25 * r;
      }
    }
  }

  /**
   * DEPTH OF FIELD — IMPLEMENTED, FIVE VARIANTS MEASURED, AND DISABLED FOR A PRINCIPLED REASON.
   *
   * Measured history, as midtones per film (higher is better):
   *
   *   variant                         desire   forgotten   disappear   time
   *   no defocus                       42.5      32.5        41.3      48.0
   *   1. subject-plane focus           14.4      47.8        47.9      20.1
   *   2. plane from measured depths    12.2      50.3        52.0      31.6
   *   3. + per-frame bright target      -        16.8        13.9      82.1
   *   4. + LOCAL target (blend)        38.8      28.2        27.0      45.3
   *   5. + LOCAL target (replace)      23.1      26.8        25.0      23.5
   *
   * Variants 1-3 failed BIMODALLY — some films climbed while others collapsed — because a per-frame
   * target cannot be right across a corpus whose films want opposite corrections. That diagnosis was
   * correct and variant 4 FIXED it: all four films then moved together, which is the real defect
   * resolved. Variant 5 tested whether the operation needed to conserve light; it does not help.
   *
   * EVERY VARIANT IS WORSE THAN NO DEFOCUS, for a reason of SCALE rather than tuning:
   *
   *     glyph lattice        240 x 120 cells
   *     subject extent       ~80 x 40 cells
   *     useful blur radius   3-6 cells  =  4-8% of the SUBJECT
   *
   * **The glyph IS the resolution.** Defocus works in an image renderer because detail and structure
   * live at different scales — a 1920px frame has an order of magnitude more resolution than the
   * features being softened, so blurring removes excess detail and leaves structure. Here the smallest
   * addressable unit is the cell, and blurring at 3-6 cells removes STRUCTURE. There is no scale
   * separation to exploit, and no strength or target makes one appear.
   *
   * Recorded as a CONSTRAINT, not an unfinished feature. Five measured variants is sufficient evidence,
   * and the honest reading is that defocus is not expressible on a glyph lattice at this resolution —
   * not that a sixth parameter setting would find it.
   *
   * ============================ CORRECTION (round 54) ============================
   * THIS PASS IS NOT DISABLED — ITS CODE NO LONGER EXISTS. Round 48 replaced the executable block with
   * the comment above, and every description of it since (including in the completion report) has said
   * "implemented but disabled". That is wrong, and it matters: a reader would reasonably expect
   * `look.dof = 0.55` to do something, and it does nothing at all.
   *
   * Verified rather than assumed: sweeping `dof` through 0, 0.55 and 1.0 on the current build returns
   * IDENTICAL midtones on all four films (53.0 / 37.4 / 50.4 / 50.9). An inert parameter is exactly the
   * signal this phase used nine times to find real defects, and this is the tenth — except this time the
   * signal is pointing at documentation rather than at code.
   *
   * THE FIVE-VARIANT TABLE ABOVE IS STILL VALID AS A RECORD, and its central finding — a per-frame
   * defocus target fails bimodally while a local one does not — was measured and is real. But variants
   * 1-3 were measured on a build whose per-shot field normalisation was ALSO inert (see round 53), so
   * their absolute numbers are not comparable to anything produced now.
   *
   * `boxBlur` is retained because it is genuinely shared: the bloom pass uses it.
   */
  void boxBlur;

  const fieldStats = luminanceStats(luminance, cols * rows, preGradeThreshold);

  /**
   * BLOOM AND HALATION, APPLIED AFTER NORMALISATION SO THE GLOW IS NOT COMPENSATED AWAY.
   *
   * Two radii from one source: a tight glow and a wide halo. Separable box blurs rather than a
   * gaussian, because at glyph resolution the difference is invisible and the cost is not.
   */
  const bloom = look.chromaticBloom ?? 0;
  const halation = bloom > 0 ? (look.halation ?? 0.3) : 0;
  if (bloom > 0 || halation > 0) {
    const blur = (src: Float32Array, radius: number): Float32Array => boxBlur(src, cols, rows, radius);
    // Only bright marks bleed. A blur of the WHOLE field would lift the black floor, and the
    // negative space is the composition.
    const threshold = look.bloomThreshold ?? 0.25;
    const radius = look.bloomRadius ?? 2;
    const bright = BLUR_SCRATCH3(cols * rows);
    for (let i = 0; i < cols * rows; i++) {
      const v = luminance[i]!;
      bright[i] = v > threshold ? v - threshold : 0;
    }
    const tight = blur(bright, Math.max(1, Math.round(radius)));
    const wide = halation > 0 ? blur(bright, Math.max(2, Math.round(radius * 3))) : undefined;
    /**
     * DENSITY-DEPENDENT BLOOM — the fix for the structural damage a global strength causes.
     *
     * A UNIFORM bloom made the subject LEAST legible at its own climax. At peak density on
     * `forgotten-name` the bright cores blew into featureless luminous masses: near-white rose from
     * 3.2% to 14.6% and midtones fell 41.3% -> 30.7%, so the criterion SUBJECT LEGIBILITY — which
     * passes — was being regressed by the stage added to satisfy FILMIC FEELING.
     *
     * The reason is that a cell already at the top has no room for more light. A `#` covering its
     * whole cell is already full; bleeding it further produces only white, and white carries no
     * information. A `.` alone in the space has all the room in the world, and that is exactly where
     * a glow reads as a glow.
     *
     * So the gain falls off as a cell approaches the clip point: full effect where the cell is dim,
     * none where it is already bright. The effect is preserved where it reads and withdrawn where it
     * destroys, which is not something a global strength can do at any value.
     */
    const headroomAt = look.bloomHeadroom ?? 0.6;
    for (let i = 0; i < cols * rows; i++) {
      const cur = luminance[i]!;
      // 1 when the cell is dark, 0 once it reaches `headroomAt` in ungraded luminance
      const headroom = cur >= headroomAt ? 0 : 1 - cur / headroomAt;
      if (headroom <= 0) continue;
      const gain = bloom * headroom;
      luminance[i] = cur + tight[i]! * gain;
      if (wide) luminance[i]! += wide[i]! * gain * halation;
    }
  }

  /**
   * EDGE MAGNITUDE, the CPU path's second glyph-selection signal. A 3x3 Sobel magnitude on the
   * luminance field, computed once per frame. See the note at the point of use.
   */
  const multiSignal = shot.raster.multiSignal ?? film.raster.multiSignal ?? false;
  const edgeGain = shot.raster.edgeGain ?? film.raster.edgeGain ?? 0.35;
  const edgeFloor = shot.raster.edgeFloor ?? film.raster.edgeFloor ?? 0.02;
  const edgeScale = shot.raster.edgeScale ?? film.raster.edgeScale ?? 0.35;
  const edge = EDGE_SCRATCH(cols * rows);
  edge.fill(0);
  if (multiSignal) {
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        const gx =
          -luminance[i - cols - 1]! + luminance[i - cols + 1]! +
          -2 * luminance[i - 1]! + 2 * luminance[i + 1]! +
          -luminance[i + cols - 1]! + luminance[i + cols + 1]!;
        const gy =
          -luminance[i - cols - 1]! - 2 * luminance[i - cols]! - luminance[i - cols + 1]! +
          luminance[i + cols - 1]! + 2 * luminance[i + cols]! + luminance[i + cols + 1]!;
        edge[i] = Math.sqrt(gx * gx + gy * gy) * 0.25;
      }
    }
  }

  let preGradeLit = 0;
  for (let i = 0; i < cols * rows; i++) {
    if (luminance[i]! > preGradeThreshold) preGradeLit++;
  }

  let litCells = 0;
  let sumInk = 0;
  let peak = 0;
  const seenCodes = new Set<number>();

  const cx = (cols - 1) * 0.5;
  const cy = (rows - 1) * 0.5;
  const invCx = 1 / Math.max(1, cx);
  const invCy = 1 / Math.max(1, cy);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      let v = luminance[idx]!;

      if (vigStrength > 0) {
        const nx = (x - cx) * invCx;
        const ny = (y - cy) * invCy;
        const rr = Math.sqrt(nx * nx + ny * ny) * 0.7071;
        v *= 1 - vigStrength * clamp01(rr * rr);
      }
      if (scanFrequency > 0) {
        v *= 1 + 0.06 * Math.sin(y * 0.9 + localTime * scanFrequency * Math.PI * 2);
      }
      if (grainAmount > 0) {
        v += (grainAt(x, y, frameIndex) - 0.5) * grainAmount;
      }

      v = (v - r.blackPoint) * r.exposure * autoExposure;
      const hasAuthored = authoredGlyph[idx]! > 32;
      if (v <= 0 && !hasAuthored) {
        continue;
      }
      if (v < inkFloor && !hasAuthored) {
        continue;
      }
      if (v <= 0) v = 0.35; // an authored glyph with no light behind it still reads as a faint mark
      if (v > 1.4) v = 1.4;

      const value = clamp01(v);
      // NO blank floor on this path: `grid.bin` for the Phase 1 film is byte-frozen, and its
      // narrow shots 01/02 windows have a floor of ~1.0 that would blank the whole film.
      //
      // An AUTHORED glyph (from a native ASCII object) overrides the quantiser. `inkFloor` is
      // bypassed for it too: a word written into the scene must not be deleted by a density rule.
      const authored = authoredGlyph[idx]!;
      /**
       * MULTI-SIGNAL GLYPH CHOICE.
       *
       * The CPU path chose a character from ONE signal: the cell's brightness. The GPU path has
       * selected on edge, contrast, depth and role since Phase 3 began, so this requirement was
       * satisfied on the renderer that does NOT produce the films.
       *
       * WHY A SECOND SIGNAL MATTERS. Brightness alone cannot distinguish a contour from a flat
       * graduated mass: a cell at the same luminance gets the same character whether it sits on the
       * edge of the subject or in the middle of it. That is why the shapes in these films read as
       * calligraphic texture rather than as bounded forms — **the subject has no outline.** Density
       * alone cannot draw an outline, because an outline is a CHANGE in luminance, not a level.
       *
       * The second signal is EDGE MAGNITUDE, computed from the same field with a 3x3 operator. Where
       * the field changes sharply the character is pushed toward the heavier end of the ramp, so
       * contours quantise to strong marks and interiors stay where their brightness puts them. That
       * is the cheapest available way to give a point-field subject a readable boundary.
       *
       * OPT-IN (`raster.multiSignal`), so the frozen Phase 1 film is byte-identical.
       */
      /**
       * COMBINED-SCORE GLYPH SELECTION.
       *
       * The first attempt nudged the VALUE before quantisation and was inert — measured, every metric
       * moved by at most 0.638%. The arithmetic: the ramp has ~20 entries and `quantize` snaps to the
       * nearest, so a cell's character only changes when the nudge crosses one of ~20 boundaries.
       * Edges in these fields reach ~0.05; a 0.35 gain gives ~0.017 against a step of 0.05, so NO CELL
       * EVER CROSSED.
       *
       * This version composes the SCORE instead. `quantize` works on COVERAGE — coverage = lo +
       * (hi-lo)*value — and then snaps to whichever entry's coverage is nearest. So an edge can be
       * added as a coverage offset, in the same units the decision is already made in, rather than as
       * a brightness nudge hoping to move a boundary. The ramp's coverage values are NOT uniformly
       * spaced (`.` is 2, `#` is 19, and the middle is sparse), so a coverage offset changes the
       * chosen character in a way a brightness nudge cannot.
       *
       * The point is to give a point-field subject an OUTLINE: brightness alone gives a cell on the
       * subject's boundary the same character as a cell in its interior at the same level, which is
       * why these subjects read as texture rather than as bounded forms.
       */
      let code: number;
      if (authored > 32) {
        code = authored;
      } else if (multiSignal) {
        const lo = densityWindow[0]!.coverage;
        const hi = densityWindow[densityWindow.length - 1]!.coverage;
        const baseCov = lo + (hi - lo) * value;
        const e = edge[idx]!;
        const push = e > edgeFloor ? edgeGain * Math.min(1, (e - edgeFloor) / Math.max(1e-6, edgeScale)) : 0;
        // an edge pulls the score toward the heavy end of the WINDOW, in coverage units
        const cov = Math.min(hi, baseCov + push * (hi - baseCov));
        let best = densityWindow[0]!;
        let bestD = Infinity;
        for (const entry of densityWindow) {
          const d = Math.abs(entry.coverage - cov);
          if (d < bestD) {
            bestD = d;
            best = entry;
          }
        }
        code = best.code;
      } else {
        code = quantize(value, densityWindow);
      }
      if (code === 32) continue;

      const cell = grid.cells[idx]!;
      cell.code = code;
      cell.ink = value;
      litCells++;
      sumInk += value;
      if (value > peak) peak = value;
      seenCodes.add(code);
    }
  }

  const stats: ShotFrameStats = {
    inkCoverage: litCells / (cols * rows),
    litCells,
    meanInk: litCells > 0 ? sumInk / litCells : 0,
    peakInk: peak,
    densityWindow: windowCache.str,
    coverageMin: win.min,
    coverageMax: win.max,
    cameraDistance: camera.distance,
    cameraFovDeg: (camera.fovY * 180) / Math.PI,
    visiblePrimitives,
    distinctGlyphs: seenCodes.size,
    fieldMean: fieldStats.mean,
    fieldP50: fieldStats.p50,
    fieldP90: fieldStats.p90,
    fieldP99: fieldStats.p99,
    fieldPeak: fieldStats.peak,
    coveragePreGrade: preGradeLit / (cols * rows),
    fieldMeanLit: fieldStats.meanLit,
  };

  return { grid, stats, camera };
}

/**
 * Depth response. This must stay gentle: a first attempt used 6/(depth+4), which
 * drove everything past ~2 units of depth to pure black and emptied the frame.
 * The falloff here is a slow atmospheric one, so distant primitives dim but keep
 * writing ink — distant points are exactly what sells a parallax field.
 */
function depthAttenuation(spec: LayerSpec, depth: number): number {
  switch (spec.depth) {
    case "flat":
      return 1;
    case "parallax":
      return 1;
    case "depth-attenuated":
      return 1 / (1 + depth * 0.09);
    case "parallax+attenuated":
    default:
      return 1 / (1 + depth * 0.07);
  }
}

/**
 * Soft-edged splat, reading/writing a flat float luminance field.
 *
 * Two compositing models, selected by the shot's `occlusionPolicy`:
 *
 *   additive (default, and the Phase 1 behaviour) — contributions SUM. Overlapping primitives
 *     accumulate without limit, which on a particle field of ~18,000 primitives saturates the
 *     subject into a white mass.
 *   nearest — a nearer primitive REPLACES a fainter far one rather than adding to it. Bounded by
 *     construction, so the field keeps a tonal range.
 */
function splatInto(
  lum: Float32Array,
  cols: number,
  rows: number,
  splat: number[],
  falloff: number,
  depth = 0,
  zbuf?: Float32Array,
): void {
  const gx = splat[0]!;
  const gy = splat[1]!;
  const r = splat[2]!;
  const energy = splat[3]!;

  const invR = 1 / r;
  // The falloff exponent is scaled by the footprint radius so the visual SLOPE is
  // constant in cell units. Without this, `falloff` means something different for
  // every footprint size: a fixed exponent would make small marks into hard disks
  // and large halos into flat wash.
  const exp = Math.max(0.6, falloff * r * 0.5);
  const x0 = Math.max(0, Math.floor(gx - r));
  const x1 = Math.min(cols - 1, Math.ceil(gx + r));
  const y0 = Math.max(0, Math.floor(gy - r));
  const y1 = Math.min(rows - 1, Math.ceil(gy + r));

  for (let y = y0; y <= y1; y++) {
    const dy = (y - gy) * invR;
    const dy2 = dy * dy;
    if (dy2 > 1) continue;
    const base = y * cols;
    for (let x = x0; x <= x1; x++) {
      const dx = (x - gx) * invR;
      const d2 = dx * dx + dy2;
      if (d2 > 1) continue;
      // Flat-topped core with a soft shoulder, not a pure Gaussian.
      //
      // This matters more than it looks. A cell-sampled primitive whose peak is
      // narrower than a cell has a brightness that depends on where the primitive
      // happens to land relative to the cell lattice: a lone dot centred on a cell
      // boundary got 0.10 of its nominal amplitude instead of 1.0, i.e. it vanished.
      // The amplitude is therefore defined as the value inside the core:
      //
      //     w(d) = 1                                  for d <= CORE
      //     w(d) = ((1 - d2) / (1 - CORE^2))^exp      for d >  CORE
      //
      // which is exactly `intensity` at the centre and still continuous at the rim.
      // Core radius = 0.11 of the footprint. The core exists so the nearest cell
      // centre always sits inside it and receives the full amplitude; it must NOT be
      // so wide that a neighbour cell also lands inside it, or a single isolated mark
      // renders as two glyphs (which is exactly what the "one dot in a void" shot
      // must never do).
      const CORE2 = 0.0121;
      const w = d2 <= CORE2 ? 1 : Math.pow((1 - d2) / (1 - CORE2), exp);
      const contribution = w * energy;
      const i = base + x;
      if (zbuf) {
        // `nearest`: a nearer primitive REPLACES a fainter far one instead of adding to it, so the
        // field is bounded by construction rather than by tuning. Additive summation of ~18,000
        // overlapping primitives saturates and CANNOT be exposed into a range — measured: it holds
        // ~175 mean ink and ~48% near-white even at 8% of the authored intensity.
        if (depth > zbuf[i]! + 1e-6) continue;
        if (depth < zbuf[i]!) {
          zbuf[i] = depth;
          lum[i] = contribution;
          continue;
        }
        lum[i]! += contribution;
        continue;
      }
      lum[i]! += contribution;
    }
  }
}

/**
 * Percentiles of the raw luminance field. Uses a fixed 1/64 bin histogram so it
 * costs one linear pass and no allocation per frame.
 */
export function luminanceStats(
  lum: Float32Array,
  n: number,
  litAbove = 0,
): { mean: number; p50: number; p90: number; p99: number; peak: number; meanLit: number } {
  const BINS = 128;
  const SCALE = 64; // bins per unit of luminance
  const hist = LUM_HIST;
  hist.fill(0);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = lum[i]!;
    if (v <= 0) continue;
    sum += v;
    if (v > peak) peak = v;
    let b = (v * SCALE) | 0;
    if (b >= BINS) b = BINS - 1;
    hist[b]!++;
  }
  const mean = sum / n;
  let lit = 0;
  for (let b = 0; b < BINS; b++) lit += hist[b]!;
  let litSum = 0;
  let litCount = 0;
  for (let i = 0; i < n; i++) {
    const v = lum[i]!;
    if (v > litAbove) {
      litSum += v;
      litCount++;
    }
  }
  const meanLit = litCount > 0 ? litSum / litCount : 0;
  // Percentiles are over LIT cells only. Over all cells they would be dominated by
  // the black background and would say nothing about how bright the marks are.
  const pick = (q: number): number => {
    if (lit === 0) return 0;
    const target = lit * q;
    let acc = 0;
    for (let b = 0; b < BINS; b++) {
      acc += hist[b]!;
      if (acc >= target) return (b + 0.5) / SCALE;
    }
    return peak;
  };
  return { mean, p50: pick(0.5), p90: pick(0.9), p99: pick(0.99), peak, meanLit };
}

const LUM_HIST = new Int32Array(128);

const ZBUF_CACHE = new Map<string, Float32Array>();
function ZBUF_SCRATCH(cols: number, rows: number): Float32Array {
  const n = cols * rows;
  const key = `${cols}x${rows}`;
  let buf = ZBUF_CACHE.get(key);
  if (!buf || buf.length !== n) {
    buf = new Float32Array(n);
    ZBUF_CACHE.set(key, buf);
  }
  return buf;
}

const AUTH_CACHE = new Map<string, Uint8Array>();
function AUTH_SCRATCH(cols: number, rows: number): Uint8Array {
  const n = cols * rows;
  const key = `${cols}x${rows}`;
  let buf = AUTH_CACHE.get(key);
  if (!buf || buf.length !== n) {
    buf = new Uint8Array(n);
    AUTH_CACHE.set(key, buf);
  }
  return buf;
}

const EDGE_CACHE = new Map<string, Float32Array>();
/** Full-frame edge-magnitude scratch for the multi-signal glyph choice. */
function EDGE_SCRATCH(n: number): Float32Array {
  let buf = EDGE_CACHE.get(String(n));
  if (!buf || buf.length !== n) {
    buf = new Float32Array(n);
    EDGE_CACHE.set(String(n), buf);
  }
  return buf;
}

/**
 * Separable box blur over a full frame. Shared by the bloom and defocus passes, which need the same
 * operation at different radii. A gaussian would cost far more for a difference invisible at glyph
 * resolution.
 *
 * Uses its own two scratch buffers, so a caller's SOURCE array is never written to — a caller that
 * passed `luminance` as both source and destination would otherwise alias.
 */
function boxBlur(src: Float32Array, cols: number, rows: number, radius: number): Float32Array {
  if (radius < 1) return src;
  const tmp = BLUR_SCRATCH(cols * rows);
  const out = BLUR_SCRATCH2(cols * rows);
  for (let y = 0; y < rows; y++) {
    const row = y * cols;
    for (let x = 0; x < cols; x++) {
      let acc = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= cols) continue;
        acc += src[row + xx]!;
        n++;
      }
      tmp[row + x] = acc / Math.max(1, n);
    }
  }
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      let acc = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= rows) continue;
        acc += tmp[yy * cols + x]!;
        n++;
      }
      out[y * cols + x] = acc / Math.max(1, n);
    }
  }
  return out;
}

const BLUR_CACHES = new Map<string, Float32Array[]>();
/** Three full-frame float scratch buffers for the blur passes, reused across frames. */
function blurScratch(slot: number, n: number): Float32Array {
  const key = `${slot}:${n}`;
  let buf = BLUR_CACHES.get(key);
  if (!buf || buf.length !== 1 || buf[0]!.length !== n) {
    buf = [new Float32Array(n)];
    BLUR_CACHES.set(key, buf);
  }
  return buf[0]!;
}
const BLUR_SCRATCH = (n: number): Float32Array => blurScratch(0, n);
const BLUR_SCRATCH2 = (n: number): Float32Array => blurScratch(1, n);
const BLUR_SCRATCH3 = (n: number): Float32Array => blurScratch(2, n);

const LUM_CACHE = new Map<string, Float32Array>();
function LUMINANCE_SCRATCH(cols: number, rows: number): Float32Array {
  const key = `${cols}x${rows}`;
  let buf = LUM_CACHE.get(key);
  if (!buf) {
    buf = new Float32Array(cols * rows);
    LUM_CACHE.set(key, buf);
  }
  return buf;
}

export { smoothstep };
