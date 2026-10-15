/**
 * Scene IR — the renderer-facing intermediate representation.
 *
 * THE PROBLEM THIS SOLVES.
 * In Phase 1, `render/frame.ts` imported `domain/schema.ts` directly. The renderer
 * therefore had an opinion about the director's structure, which is exactly what makes a
 * second backend expensive: a GPU renderer would have had to re-implement the director's
 * assumptions before it could draw a pixel.
 *
 * Scene IR is the *lowest complete description of a frame's inputs* and nothing above it:
 * a camera track, subjects, primitives, transforms, a density track, a glyph strategy and
 * depth policies. Both renderers consume only this, so:
 *
 *   - the Director Agent can change without touching either renderer;
 *   - a GPU renderer can be added without touching the director;
 *   - the CPU renderer stays the deterministic reference implementation.
 *
 * RELATION TO grid.bin.
 * `grid.bin` is the renderer -> Remotion *playback* seam and is retained. Scene IR sits
 * above it: FilmSpec v2 -> ShotSpec v2 -> SceneIR -> renderer -> FrameGrid -> grid.bin.
 *
 * UNITS. Every distance is in world units where 1 unit == 1 glyph cell at the shot's rest
 * plane (`worldToCells`). Footprints are in glyph cells. This is stated here because
 * Phase 1 lost three separate bugs to unit ambiguity.
 */

import type { OcclusionPolicy } from "../director/grammar/vocabulary.js";
import type { Easing, NoiseSpec } from "../domain/schema.js";

// ---------------------------------------------------------------------------
// camera track
// ---------------------------------------------------------------------------

/**
 * A sampled camera keyframe. The track is sampled at frame resolution by the compiler,
 * so the renderer never evaluates easing or framing maths — it only interpolates and
 * projects. That is what keeps two renderers from disagreeing about geometry.
 */
export interface CameraKey {
  /** frame index relative to the shot */
  frame: number;
  position: [number, number, number];
  target: [number, number, number];
  /** vertical field of view in radians, after any zoom */
  fovY: number;
  roll: number;
  /** cells per world unit; constant for a shot unless zooming */
  worldToCells: number;
  /** what the framing is aimed at, in world units above the ground plane */
  subjectLineY: number;
}

export interface CameraTrack {
  /** why this move exists, carried through for the report */
  reason: string;
  keys: CameraKey[];
  /** the pinhole ratio; always 1, asserted by the compiler */
  focal: number;
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

export interface PrimitiveIR {
  /** stable index within its layer */
  i: number;
  /** rest position in world space */
  p: [number, number, number];
  /** unit direction from the layer origin; drives assemble/dissolve transport */
  dir: [number, number, number];
  /** normalised rim distance 0..1; transport is scaled by this */
  rim: number;
  /** per-primitive size multiplier */
  sizeMul: number;
  /** per-primitive intensity multiplier */
  intMul: number;
  /** animation phase */
  phase: number;
  /** depth in world units along the view axis at rest; used by depth policies */
  z: number;
}

/**
 * A layer's authored behaviour. `transform` is a one-way change of state over the shot;
 * `motion` is continuous. Both are declarative so the renderer evaluates rather than
 * decides.
 */
export interface TransformIR {
  kind: "none" | "assemble" | "dissolve" | "collapse" | "scatter";
  /** radial transport as a fraction of each primitive's rim distance */
  radialOffset: number;
  radialScale: number;
  /** alpha at t=0 and t=1, linearly interpolated through the ramp windows below */
  alphaFrom: number;
  alphaTo: number;
  sizeScaleFrom: number;
  sizeScaleTo: number;
}

export interface MotionIR {
  kind: "none" | "drift" | "orbit" | "pulse" | "flicker" | "flow" | "tremble";
  /** 0..1 */
  intensity: number;
  /** cycles per second for oscillatory motion */
  frequency: number;
}

export interface LayerIR {
  id: string;
  /**
   * The layer's own origin in world space.
   *
   * Radial transforms (`radialScale`) expand or contract the population AROUND THIS POINT,
   * not around the world origin. Omitting it from the IR meant a renderer had to guess, and
   * scaling around the world origin drifts the whole cloud away from the camera — which is
   * exactly what happened: an isolated mark moved eight cells sideways and a dissolve
   * emptied a shot. The origin is a quantity the renderer needs, so the IR must carry it.
   */
  origin: [number, number, number];
  /** kept for reporting and for the diversity audit */
  semantics: {
    subjectId?: string;
    role: string;
    shape: string;
    occlusionPolicy: OcclusionPolicy;
    /**
     * WHAT THE MARKS IN THIS LAYER **ARE**, in the audience's vocabulary.
     *
     * Phase 3.1 carries the `SubjectForm` into the IR rather than compiling it away at authoring time,
     * because BOUNDARY ≠ FORM ≠ SUBJECT ≠ MEANINGFUL OBJECT. A layer that compiled a room to polylines
     * before reaching the IR is indistinguishable from a cloud of marks, and then:
     *
     *   - the GPU pass cannot apply form-aware treatment
     *   - the recognition harness cannot report which forms a shot contained
     *   - a director report cannot say "this shot is a room with a person in it"
     *
     * Both renderers read this and produce **semantically equivalent** output — the same form, composed
     * by different machines — which is the requirement, and explicitly not pixel identity.
     */
    forms?: Array<{
      kind: string;
      role: string;
      recognition: string;
      /** named anchors resolved into world space, so other forms can be placed against this one */
      anchors?: Record<string, [number, number, number]>;
    }>;
  };
  /** glyph footprint radius in CELLS, not world units */
  glyphRadius: number;
  /** luminance this layer deposits per cell at a primitive's centre */
  intensity: number;
  /** splat profile hardness */
  focus: number;
  /** how depth attenuates this layer */
  depthResponse: "flat" | "parallax" | "depth-attenuated" | "parallax+attenuated";
  /** 0..1 population variation */
  variation: number;
  transform: TransformIR;
  motion: MotionIR;
  noise: NoiseSpec;
  primitives: PrimitiveIR[];
}

// ---------------------------------------------------------------------------
// density + glyph strategy
// ---------------------------------------------------------------------------

export interface DensityTrack {
  /** coverage window at t=0 */
  from: { coverageMin: number; coverageMax: number };
  /** coverage window at t=1 */
  to: { coverageMin: number; coverageMax: number };
  /** below this post-grade value a cell is left blank */
  inkFloor: number;
  /** human-readable summary of the density arc, for the report */
  strategy: string;
}

export interface GlyphStrategy {
  /** the master ASCII ramp; Scene IR never carries a glyph outside it */
  vocabulary: string;
  /** exposure and black point already applied by the compiler */
  exposure: number;
  blackPoint: number;
  dither: boolean;
}

/**
 * The film-stock grade: grain and vignette.
 *
 * These live in the IR because a renderer CANNOT omit them and still reproduce the reference
 * renderer. They were hardcoded inside the CPU renderer while the IR said nothing about them,
 * so a second renderer built from the IR alone produced different characters on any cell whose
 * graded value sat near a quantiser bin boundary. The IR is defined as the lowest complete
 * description of a frame's inputs; omitting these was a defect in the IR, not a difference of
 * taste, and it was found by exactly the kind of independent-renderer test this file exists to
 * make possible.
 */
export interface FilmStock {
  /** amplitude of the per-cell film grain, in pre-grade luminance */
  grain: number;
  /** 0..1 corner falloff strength */
  vignette: number;
}

// ---------------------------------------------------------------------------
// scene
// ---------------------------------------------------------------------------

export interface SceneIR {
  /** schema version of this IR, independent of the FilmSpec version */
  irVersion: "1";
  shotId: string;
  filmSlug: string;

  /** output geometry */
  width: number;
  height: number;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;

  /** shot duration in seconds and frames */
  duration: number;
  frameCount: number;

  /** why this shot exists, carried through so the renderer can report it */
  narrativeFunction: string;
  intention: string;
  visualReason: string;
  cameraReason: string;

  /** global rhythm sampled over this shot, at its start and end */
  rhythm: { from: number; to: number };

  camera: CameraTrack;
  layers: LayerIR[];
  density: DensityTrack;
  glyph: GlyphStrategy;
  stock: FilmStock;

  background: number;
  /**
   * Expose against the shot's own measured highlight rather than an absolute constant.
   *
   * With the authored constants the field clipped: 60-64% of lit cells graded to near-white, so
   * the image was a white mass regardless of which glyphs were reachable. Auto-levelling gives
   * the glyph ramp and the tone curve an actual range to work in. Default on; set false to
   * reproduce the absolute exposure exactly.
   */
  autoLevel?: boolean;
  /** which percentile of the lit field becomes white; default 0.99 */
  autoLevelPercentile?: number;
  /** apply the filmic highlight shoulder; default true */
  filmic?: boolean;
  /** where the shoulder starts rolling off; default 0.55 */
  shoulderKnee?: number;
  /** total primitive count, for reporting */
  primitiveCount: number;
}

/** What a renderer returns for one frame. */
export interface AsciiFrame {
  /** frame index relative to the shot */
  frame: number;
  cols: number;
  rows: number;
  /** ASCII code per cell, 32 for blank; length cols*rows */
  codes: Uint8Array;
  /** ink 0..255 per cell; length cols*rows */
  ink: Uint8Array;
  /** telemetry the QA gates read */
  stats: {
    litCells: number;
    coverage: number;
    peakInk: number;
    distinctGlyphs: number;
    visiblePrimitives: number;
    /** true when any field or camera value was not finite; must always be false */
    hadNaN: boolean;
  };
}

/**
 * The renderer interface. Two backends are planned:
 *
 *   cpu — `CPU_REFERENCE_RENDERER`, deterministic, dependency-free, CI-friendly.
 *         The reference implementation and what the Phase 1 baseline pins.
 *   gpu — `GPU_PRODUCTION_RENDERER`, Three.js + GLSL, future high-fidelity path.
 *
 * A renderer must be a pure function of (SceneIR, frame): same inputs, same frame.
 */
export interface AsciiRenderer {
  readonly id: "cpu" | "gpu";
  /** human-readable description for the report */
  readonly description: string;
  renderFrame(scene: SceneIR, frame: number): Promise<AsciiFrame>;
  /** render a whole shot; backends may parallelise internally */
  renderShot(scene: SceneIR, onProgress?: (done: number, total: number) => void): Promise<AsciiFrame[]>;
}

export type { Easing };
