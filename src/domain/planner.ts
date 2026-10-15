/**
 * Prompt layer: user text -> FilmSpec.
 *
 * Two responsibilities, deliberately separated:
 *   1. parsePrompt  — language understanding. Pure, side-effect free: tokenizes
 *      the prompt, matches an emotional lexicon, and extracts explicit numeric
 *      constraints ("20秒", "1920x1080", "30fps").
 *   2. planFilm     — directing. Turns the parsed intent into shots, in
 *      beats/chapters, choosing camera moves, glyph-density arcs and primitive
 *      layers. It may only emit specs that pass validateFilmSpec.
 *
 * This is the *only* stage allowed to invent content. Everything downstream
 * renders what the FilmSpec says.
 */

import { hashString } from "../core/rng.js";
import type {
  CameraMoveSpec,
  DerivationRecord,
  Easing,
  FilmLookSpec,
  FilmSpec,
  LayerSpec,
  NoiseSpec,
  RasterSpec,
  ShapeKind,
  ShotSpec,
  TransformKind,
  DepthBehavior,
} from "./schema.js";

// ---------------------------------------------------------------------------
// 1. Prompt parsing
// ---------------------------------------------------------------------------

export interface PromptOverrides {
  /** Explicit duration in seconds (wins over anything parsed from the prompt). */
  durationInSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  aspect?: string;
  quality?: "draft" | "standard" | "high";
  seed?: number;
  slug?: string;
  /** Minimum number of shots the plan must contain. */
  minShots?: number;
}

export interface ParsedPrompt {
  raw: string;
  /** lowercase, whitespace-collapsed */
  normalized: string;
  tokens: string[];
  /** concept ids that fired, in match order */
  matchedConcepts: string[];
  /** numbers found verbatim in the prompt */
  extracted: {
    durationInSeconds?: number;
    width?: number;
    height?: number;
    fps?: number;
  };
  /** ready-to-log derivation record */
  derivation: DerivationRecord;
}

interface Concept {
  id: string;
  /** substrings that trigger the concept */
  triggers: string[];
  /** human note used in the derivation record */
  note: string;
}

/**
 * The emotional lexicon. Each concept is a *theme*, and a theme selects a beat
 * template and modulates the visual grammar. Phase 1 implements exactly one beat
 * template ("solitude-dissolution") and one theme ("loneliness"), but the table
 * is the extension point: adding a theme is adding rows, not adding code paths.
 */
const CONCEPTS: Concept[] = [
  { id: "loneliness", triggers: ["孤独", "lonely", "loneliness", "solitude", "solitary", "独处", "寂寞"], note: "isolation of a single subject inside a void" },
  { id: "emptiness", triggers: ["空", "empty", "emptiness", "void", "空白", "虚无"], note: "large negative space as the dominant mass" },
  { id: "emergence", triggers: ["出现", "emerge", "emerge from", "浮现", "生成"], note: "form arriving out of the field" },
  { id: "human-form", triggers: ["人形", "figure", "human", "body", "主体", "身影"], note: "a legible body silhouette as the spatial subject" },
  { id: "approach", triggers: ["推", "push", "approach", "靠近", "逼近"], note: "sustained forward camera pressure" },
  { id: "collapse", triggers: ["解体", "collapse", "disintegrate", "散开", "崩塌", "碎"], note: "structure losing cohesion" },
  { id: "remanence", triggers: ["只剩", "只剩一个", "最后一个", "alone", "remains", "留下"], note: "a single surviving mark at the end" },
];

const CN_DIGITS: Record<string, number> = {
  "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
  "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
};

function parseChineseNumber(s: string): number | undefined {
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  // handles 十, 二十, 二十五, 三
  if (s.length === 1 && CN_DIGITS[s] !== undefined) return CN_DIGITS[s];
  const m = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (m) {
    const tens = m[1] ? CN_DIGITS[m[1]]! : 1;
    const ones = m[2] ? CN_DIGITS[m[2]]! : 0;
    return tens * 10 + ones;
  }
  return undefined;
}

export function parsePrompt(raw: string, overrides: PromptOverrides = {}): ParsedPrompt {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const tokens = normalized.length > 0 ? normalized.split(" ") : [];
  // Chinese prompts often have no spaces; also tokenize CJK runs into characters
  const cjkChars = Array.from(normalized).filter((c) => /[\u4e00-\u9fff]/.test(c));
  const allTokens = Array.from(new Set([...tokens, ...cjkChars])).filter(Boolean);

  const matchedConcepts: string[] = [];
  for (const c of CONCEPTS) {
    if (c.triggers.some((t) => normalized.includes(t))) matchedConcepts.push(c.id);
  }

  const extracted: ParsedPrompt["extracted"] = {};

  // duration: "20秒", "20s", "20 seconds", "20 秒"
  const durMatch =
    /(\d+(?:\.\d+)?)\s*(?:秒|s\b|sec(?:ond)?s?)/.exec(normalized) ??
    /(?:时长|duration)\D{0,6}(\d+(?:\.\d+)?)/.exec(normalized);
  if (durMatch) extracted.durationInSeconds = Number(durMatch[1]);
  if (extracted.durationInSeconds === undefined) {
    const cn = /([一二两三四五六七八九十]+)\s*秒/.exec(normalized);
    if (cn) {
      const v = parseChineseNumber(cn[1]!);
      if (v !== undefined) extracted.durationInSeconds = v;
    }
  }

  // resolution: "1920x1080", "1920×1080"
  const resMatch = /(\d{3,5})\s*[x×]\s*(\d{3,5})/.exec(normalized);
  if (resMatch) {
    extracted.width = Number(resMatch[1]);
    extracted.height = Number(resMatch[2]);
  }

  // fps: "30fps", "30 fps", "30帧"
  const fpsMatch = /(\d+(?:\.\d+)?)\s*(?:fps|帧)/.exec(normalized);
  if (fpsMatch) extracted.fps = Number(fpsMatch[1]);

  // Merge: explicit overrides beat parsed values beat defaults.
  const finalDuration = overrides.durationInSeconds ?? extracted.durationInSeconds;
  const finalWidth = overrides.width ?? extracted.width;
  const finalHeight = overrides.height ?? extracted.height;
  const finalFps = overrides.fps ?? extracted.fps;

  const constraints: Record<string, number | string> = {};
  if (finalDuration !== undefined) constraints.durationInSeconds = finalDuration;
  if (finalWidth !== undefined) constraints.width = finalWidth;
  if (finalHeight !== undefined) constraints.height = finalHeight;
  if (finalFps !== undefined) constraints.fps = finalFps;
  if (overrides.aspect) constraints.aspect = overrides.aspect;
  if (overrides.quality) constraints.quality = overrides.quality;

  const defaultsApplied: string[] = [];
  if (finalDuration === undefined) defaultsApplied.push("durationInSeconds:20 (from brief)");
  if (finalFps === undefined) defaultsApplied.push("fps:30 (from brief)");
  if (finalWidth === undefined || finalHeight === undefined) {
    defaultsApplied.push("resolution:1920x1080 (from brief)");
  }
  if (matchedConcepts.length === 0) {
    defaultsApplied.push("no lexicon match; falling back to the solitude-dissolution template unchanged");
  }

  const derivation: DerivationRecord = {
    tokens: allTokens,
    matchedConcepts,
    structure: "solitude-dissolution",
    constraints,
    defaultsApplied,
  };

  return { raw, normalized, tokens: allTokens, matchedConcepts, extracted, derivation };
}

// ---------------------------------------------------------------------------
// 2. Directing
// ---------------------------------------------------------------------------

const SHOT_COUNT = 5;

/**
 * The master density ramp: every glyph the film is allowed to emit, ordered
 * light -> heavy. Duplicates are MEANINGLESS (the quantizer works on measured ink
 * coverage, not on position in the string) and dangerous, because a duplicate makes
 * `assertAsciiRamp` fail and hides real content errors. Asserted by the test suite.
 */
const MASTER_RAMP =
  " .'-_,^:;\"~i!|/\\()[]{}<>+=*?ltfrj1vcxunzoahksdybwmpqg" +
  "234567890LJCEFIVXYTZAHKNSURMDBWQGO#&$%@";

/**
 * A beat template is the authoring unit for a preset: one shot's worth of camera,
 * density arc, techniques and layers, with no timing.
 *
 * Exported so that the Phase 2 v2 preset builder can reuse the AUTHORITATIVE layer
 * specifications instead of restating them. Duplicating them would let the Phase 1
 * baseline and the v2 preset drift apart, which is precisely what the baseline exists
 * to prevent.
 */
export interface BeatTemplate {
  id: string;
  title: string;
  intent: string;
  camera: CameraMoveSpec;
  density: ShotSpec["density"];
  /** per-shot raster overrides (only inkFloor is used today) */
  raster?: Partial<RasterSpec>;
  techniques: string[];
  layers: Array<Omit<LayerSpec, "noise"> & { noise?: Partial<NoiseSpec> }>;
  background: number;
}

/** Noise disabled: used by single-point layers and by the key light. */
const NO_NOISE: NoiseSpec = {
  octaves: 0,
  frequency: 0,
  amplitude: 0,
  lacunarity: 0,
  gain: 0,
  drift: 0,
};

const DEFAULT_NOISE: NoiseSpec = {
  octaves: 1,
  frequency: 0.02,
  amplitude: 0.040,
  lacunarity: 2.0,
  gain: 0.5,
  drift: 0.35,
};

/** Ramp entry: how many subpixels of ink a primitive is worth at rest. */
const CAM = (
  p: Partial<CameraMoveSpec>,
): CameraMoveSpec => ({
  kind: "static",
  easing: "linear",
  fovDeg: 34,
  focusDistance: 1.50,
  roll: 0,
  dollyAmount: 0,
  panAmount: 0,
  yawAmount: 0,
  jitter: 0,
  zoomBoost: 1,
  ...p,
});

export function layer(spec: Partial<LayerSpec> & { id: string; bounds: LayerSpec["bounds"] }): LayerSpec {
  return {
    kind: "particle-field",
    shape: "disc",
    count: 100,
    glyphRadius: 2,
    intensity: 0.25,
    variation: 0.4,
    offsetY: 0,
    depthBias: 0,
    depth: "parallax+attenuated" as DepthBehavior,
    focus: 1.6,
    noise: { ...DEFAULT_NOISE },
    transform: "none" as TransformKind,
    role: "field",
    ...spec,
  };
}

/**
 * The five required beats of the benchmark, in the order the brief fixes.
 *
 * World scale is deliberately canonical: the subject is 2.0 units tall, standing
 * on y=0, and the camera's focal length is pinned so that 1 world unit == 1 glyph
 * cell at the rest distance. That is why the radii below are in the 0.02..0.06
 * range: 0.035 world units is a 3.5-cell-wide mark, which is the right weight for
 * a single glyph on a 240x120 grid.
 *
 * Coverage bounds are in subpixels of a 5x9 (45-subpixel) glyph cell. The atlas's
 * measured maximum is 20 (`W` and `M` are the densest glyphs), which is why no
 * window may exceed 20. `validateFilmSpec` enforces this.
 */
/**
 * The cinematic minimum: a single lit glyph at a fixed point, tuned so its exposure
 * lands the cell just past the lightest inking glyph. Used for the opening speck
 * and for the surviving character at the end of the film.
 */
function dot(
  id: string,
  at: { x: number; y: number; z: number },
  intensity: number,
  role = "protagonist",
  offsetY = 0,
): LayerSpec {
  return layer({
    id,
    kind: "point-source",
    shape: "none",
    count: 1,
    // `bounds` doubles as the absolute spawn point for shape "none"
    bounds: at,
    offsetY,
    // 0.85 cells (not smaller): the nearest cell centre to any spawn point is at
    // most 0.707 cells away, so a footprint this size guarantees the core always
    // covers a whole cell and the dot's brightness is position-independent.
    glyphRadius: 0.85,
    intensity,
    variation: 0,
    depthBias: 0,
    depth: "flat",
    focus: 3.2,
    noise: NO_NOISE,
    transform: "none",
    role,
  });
}

export const LONELINESS_BEATS: BeatTemplate[] = [
  {
    id: "01",
    title: "DOT / VOID",
    intent: "极小的点存在于巨大空白中。",
    camera: CAM({ kind: "static", fovDeg: 33, focusDistance: 1.55 }),
    // A single glyph and nothing else: the window is pinned at the two lightest
    // marks in the atlas, so the frame is incapable of carrying more ink than one
    // speck no matter how the field below is tuned.
    density: { coverageMinStart: 1, coverageMinEnd: 1, coverageMaxStart: 2, coverageMaxEnd: 2 },
    // The Phase 1 film is byte-frozen WITH this floor. Removing it here changed the frozen grid
    // and the regression gate caught it, which is why the v2 path overrides it in authoring.ts
    // instead of this shared planner being edited.
    raster: { inkFloor: 0.72 },
    techniques: ["point-source", "negative-space", "single-glyph"],
    background: 0,
    layers: [
      dot("the-dot", { x: 0, y: 0.72, z: 0 }, 1.03065),
    ],
  },
  {
    id: "02",
    title: "ARRIVAL FROM THE EDGES",
    intent: "字符开始从画面边缘缓慢出现。",
    camera: CAM({ kind: "static", fovDeg: 34, focusDistance: 1.50, panAmount: 0.24, jitter: 0.0016 }),
    density: { coverageMinStart: 2, coverageMinEnd: 3, coverageMaxStart: 3, coverageMaxEnd: 6 },
    techniques: ["assemble", "edge-entry", "glyph-density-transformation", "particle-field"],
    background: 0,
    layers: [
      // The rim field spawns out near the frame edge and converges inward, so each
      // primitive crosses the frame boundary during the shot. "Characters appear
      // from the edges" is therefore literal, and the scene compiler proves it.
      layer({
        id: "rim-field",
        kind: "particle-field",
        shape: "ring",
        count: 4200,
        bounds: { x: 1.02, y: 1.0, z: 0.8 },
        glyphRadius: 2.2,
        intensity: 0.19488,
        variation: 0.55,
        depthBias: 0,
        depth: "parallax+attenuated",
        focus: 1.4,
        noise: { octaves: 1, frequency: 0.03, amplitude: 0.040, lacunarity: 2, gain: 0.5, drift: 0.25 },
        transform: "assemble",
        role: "arriving-glyphs",
      }),
      layer({
        id: "far-dust",
        kind: "particle-field",
        shape: "disc",
        count: 1200,
        bounds: { x: 0.95, y: 1.0, z: 0.3 },
        glyphRadius: 1.5,
        intensity: 0.11360,
        variation: 0.7,
        depthBias: 1.0,
        depth: "parallax+attenuated",
        focus: 1.6,
        noise: { octaves: 1, frequency: 0.05, amplitude: 0.030, lacunarity: 2, gain: 0.5, drift: 0.4 },
        transform: "none",
        role: "atmosphere",
      }),
      dot("the-dot", { x: 0, y: 0.72, z: 0 }, 1.03065),
    ],
  },
  {
    id: "03",
    title: "THE FIGURE",
    intent: "字符形成一个模糊的人形或空间主体。",
    camera: CAM({
      kind: "lateral-right",
      easing: "easeInOut",
      fovDeg: 35,
      focusDistance: 2.05,
      panAmount: 0.55,
      jitter: 0.0018,
    }),
    density: { coverageMinStart: 3, coverageMinEnd: 4, coverageMaxStart: 8, coverageMaxEnd: 16 },
    techniques: ["lateral-camera-move", "depth-parallax", "assemble", "human-form", "glyph-density-transformation"],
    background: 0,
    layers: [
      layer({
        id: "figure",
        kind: "particle-field",
        shape: "humanoid",
        count: 20000,
        // narrow depth slab: the subject plane the camera slides across
        bounds: { x: 0.35, y: 1.05, z: 0.08 },
        offsetY: -0.32,
        glyphRadius: 1.45,
        intensity: 0.03483,
        variation: 0.5,
        depthBias: 0,
        depth: "parallax+attenuated",
        focus: 1.5,
        noise: { octaves: 1, frequency: 0.045, amplitude: 0.050, lacunarity: 2, gain: 0.5, drift: 0.3 },
        transform: "assemble",
        role: "subject",
      }),
      // Deep background: the same lateral move shifts it far less on screen, which
      // is the depth/parallax read.
      layer({
        id: "deep-space",
        kind: "particle-field",
        shape: "disc",
        count: 3000,
        bounds: { x: 0.95, y: 1.0, z: 0.2 },
        glyphRadius: 1.5,
        intensity: 0.01443,
        variation: 0.75,
        depthBias: 1.0,
        depth: "parallax+attenuated",
        focus: 1.6,
        noise: { octaves: 1, frequency: 0.04, amplitude: 0.035, lacunarity: 2, gain: 0.5, drift: 0.45 },
        transform: "none",
        role: "parallax-background",
      }),
      // A point-source key light deep behind the figure gives the depth cue a
      // second, unambiguous read: it barely moves while the figure slides past it.
      layer({
        id: "key-light",
        kind: "point-source",
        shape: "disc",
        count: 45,
        bounds: { x: 0.16, y: 1.0, z: 0.02 },
        glyphRadius: 8.0,
        intensity: 0.55216,
        variation: 0.25,
        depthBias: 1.0,
        depth: "depth-attenuated",
        focus: 1.0,
        noise: NO_NOISE,
        transform: "none",
        role: "key-light",
      }),
    ],
  },
  {
    id: "04",
    title: "PUSH / DENSITY",
    intent: "摄像机持续 push-in，同时字符密度提高。",
    camera: CAM({
      kind: "push-in",
      easing: "easeOut",
      fovDeg: 35,
      // start wide enough that the end of the 55% push-in still holds the whole
      // figure: visible height goes 2*1.85 -> 2*1.85*0.45 = 1.67 units
      focusDistance: 2.25,
      dollyAmount: 0.50,
      jitter: 0.0016,
    }),
    density: { coverageMinStart: 4, coverageMinEnd: 6, coverageMaxStart: 16, coverageMaxEnd: 20 },
    techniques: ["push-in", "glyph-density-transformation", "depth-parallax", "particle-field"],
    background: 0,
    layers: [
      layer({
        id: "structure",
        kind: "particle-field",
        shape: "humanoid",
        count: 22000,
        bounds: { x: 0.35, y: 1.05, z: 0.08 },
        offsetY: -0.32,
        glyphRadius: 1.55,
        intensity: 0.00532,
        variation: 0.45,
        depthBias: 0,
        depth: "parallax+attenuated",
        focus: 1.5,
        noise: { octaves: 2, frequency: 0.05, amplitude: 0.055, lacunarity: 2, gain: 0.5, drift: 0.5 },
        transform: "none",
        role: "subject",
      }),
      // Mid-ground filaments. These are what read as "density increasing": the
      // push-in swells their footprint while the glyph window opens up.
      layer({
        id: "filament-field",
        kind: "particle-field",
        shape: "shard",
        count: 7000,
        bounds: { x: 1.15, y: 1.0, z: 0.78 },
        glyphRadius: 1.9,
        intensity: 0.02919,
        variation: 0.8,
        depthBias: 0,
        depth: "parallax+attenuated",
        focus: 1.4,
        noise: { octaves: 2, frequency: 0.06, amplitude: 0.040, lacunarity: 2, gain: 0.5, drift: 0.7 },
        transform: "none",
        role: "density",
      }),
      layer({
        id: "key-light",
        kind: "point-source",
        shape: "disc",
        count: 70,
        bounds: { x: 0.24, y: 1.0, z: 0.03 },
        glyphRadius: 12.0,
        intensity: 0.55216,
        variation: 0.3,
        depthBias: 1.0,
        depth: "depth-attenuated",
        focus: 1.0,
        noise: NO_NOISE,
        transform: "none",
        role: "key-light",
      }),
    ],
  },
  {
    id: "05",
    title: "DISSOLUTION / ONE GLYPH",
    intent: "结构突然解体，字符向远处散开，最后只剩一个字符。",
    camera: CAM({
      kind: "push-in",
      easing: "easeIn",
      fovDeg: 34.5,
      focusDistance: 2.05,
      dollyAmount: 0.05,
      jitter: 0.0015,
    }),
    // Ends pinned on the two lightest marks, so the final frame can only be one
    // speck of ink however bright the field behind it was.
    density: { coverageMinStart: 4, coverageMinEnd: 1, coverageMaxStart: 20, coverageMaxEnd: 2 },
    // the last shot must be able to end on exactly one mark
    // The Phase 1 film is byte-frozen WITH this floor. Removing it here changed the frozen grid
    // and the regression gate caught it, which is why the v2 path overrides it in authoring.ts
    // instead of this shared planner being edited.
    raster: { inkFloor: 0.72 },
    techniques: ["dissolve", "scatter", "particle-field", "single-glyph", "depth-parallax"],
    background: 0,
    layers: [
      layer({
        id: "disintegrating-structure",
        kind: "particle-field",
        shape: "humanoid",
        count: 9000,
        bounds: { x: 0.35, y: 1.05, z: 0.08 },
        offsetY: -0.32,
        glyphRadius: 1.5,
        intensity: 0.00874,
        variation: 0.5,
        depthBias: 0,
        depth: "parallax+attenuated",
        focus: 1.5,
        noise: { octaves: 2, frequency: 0.05, amplitude: 0.040, lacunarity: 2, gain: 0.5, drift: 0.6 },
        transform: "dissolve",
        role: "subject",
      }),
      layer({
        id: "scattering-shards",
        kind: "particle-field",
        shape: "shard",
        count: 7000,
        bounds: { x: 1.25, y: 1.0, z: 1.05 },
        glyphRadius: 1.7,
        intensity: 0.05280,
        variation: 0.75,
        depthBias: 1.0,
        depth: "parallax+attenuated",
        focus: 1.4,
        noise: { octaves: 2, frequency: 0.06, amplitude: 0.035, lacunarity: 2, gain: 0.5, drift: 0.85 },
        transform: "scatter",
        role: "debris",
      }),
      // The survivor. It fades up as the structure fades out, so the film's last
      // frame is exactly one lit character cell.
      dot("last-glyph", { x: 0, y: 0.72, z: 0 }, 0.77049, "survivor"),
    ],
  },
];



/**
 * Build a FilmSpec from a parsed prompt.
 *
 * Phase 1 supports exactly one structure. If the lexicon matched nothing we still
 * produce the same structure, and the derivation record says so explicitly.
 */
export function planFilm(parsed: PromptOverrides | ParsedPrompt, overrides: PromptOverrides = {}): FilmSpec {
  const p: ParsedPrompt = isParsed(parsed) ? parsed : parsePrompt("", parsed as PromptOverrides);
  const merged: PromptOverrides = { ...overrides };
  const c = p.derivation.constraints;

  const duration = numberOr(merged.durationInSeconds, numberOr(c.durationInSeconds as number, 20));
  const width = numberOr(merged.width, numberOr(c.width as number, 1920));
  const height = numberOr(merged.height, numberOr(c.height as number, 1080));
  const fps = numberOr(merged.fps, numberOr(c.fps as number, 30));
  const quality = merged.quality ?? ((c.quality as FilmSpec["quality"]) || "draft");
  const aspect = merged.aspect ?? ((c.aspect as string) || "16:9");

  // Raster geometry is derived from the output resolution: 8x9 px cells give a
  // 240x120 glyph grid at 1920x1080 with no remainder.
  const raster: RasterSpec = {
    cols: width / 8,
    rows: height / 9,
    cellW: 8,
    cellH: 9,
    ramp: MASTER_RAMP,
    coverageMin: 2,
    coverageMax: 20,
    exposure: 1.85,
    blackPoint: 0.085,
    dither: true,
    inkFloor: 0,
  };

  if (!Number.isInteger(raster.cols) || !Number.isInteger(raster.rows)) {
    throw new Error(
      `resolution ${width}x${height} is not divisible by the 8x9 glyph cell; ` +
        `use a resolution whose width%8==0 and height%9==0`,
    );
  }

  const look: FilmLookSpec = {
    background: "#000000",
    foreground: "#ffffff",
    aspect,
    filmGrain: 0.030,
    vignette: 0.30,
    chromaticBloom: 0.0,
    scanlineHz: 0.0,
    textTypeIn: 0,
  };

  const beats = LONELINESS_BEATS.slice(0, Math.max(SHOT_COUNT, merged.minShots ?? 0));
  const perShot = duration / beats.length;

  const shots: ShotSpec[] = beats.map((beat, i) => {
    const shot = materializeBeat(beat, i, perShot, raster);
    return shot;
  });

  // Retime so the shots tile exactly onto the requested duration even when the
  // duration does not divide evenly.
  let cursor = 0;
  shots.forEach((s, i) => {
    const start = i === 0 ? 0 : cursor;
    s.start = start;
    s.duration = i === shots.length - 1 ? duration - start : perShot;
    cursor = start + s.duration;
  });

  const seed = merged.seed ?? hashString(`ascii-cinema/${p.raw}/${duration}/${width}x${height}/${fps}`);

  const spec: FilmSpec = {
    version: "1.0.0",
    slug: merged.slug ?? "loneliness",
    title: `孤独 / ${filmTitleFor(p)}`,
    prompt: p.raw,
    logline: loglineFor(p),
    width,
    height,
    fps,
    durationInSeconds: duration,
    aspect,
    quality,
    fpsRationale:
      "30fps draft: the benchmark asks for a 30fps draft, and the engine samples the camera " +
      "and the primitive fields analytically at any frame index, so this can be raised to " +
      "60fps without re-authoring anything.",
    look,
    raster,
    shots,
    seed,
    derivation: p.derivation,
  };

  return spec;
}

/** Turn one authored beat into a ShotSpec with concrete timing. */
export function materializeBeat(
  beat: BeatTemplate,
  index: number,
  duration: number,
  raster: RasterSpec,
): ShotSpec {
  return {
    id: beat.id,
    title: beat.title,
    intent: beat.intent,
    start: 0,
    duration,
    background: beat.background,
    camera: { ...beat.camera },
    density: { ...beat.density },
    layers: beat.layers.map((l) => layer(withFullNoise(l))),
    raster: {
      exposure: raster.exposure,
      blackPoint: raster.blackPoint,
      dither: raster.dither,
      inkFloor: beat.raster?.inkFloor ?? raster.inkFloor,
    },
    transitionIn: { kind: index === 0 ? "cut" : index >= 4 ? "cut" : "dissolve", duration: index === 0 ? 0 : 0.0 },
    techniques: [...beat.techniques],
  };
}

function withFullNoise(
  l: Omit<LayerSpec, "noise"> & { noise?: Partial<NoiseSpec> },
): Omit<LayerSpec, "noise"> & { noise: NoiseSpec } {
  return { ...l, noise: { ...DEFAULT_NOISE, ...(l.noise ?? {}) } };
}

function isParsed(x: unknown): x is ParsedPrompt {
  return typeof x === "object" && x !== null && "derivation" in (x as Record<string, unknown>);
}

function numberOr(a: number | undefined, b: number): number {
  return typeof a === "number" && Number.isFinite(a) ? a : b;
}

function filmTitleFor(p: ParsedPrompt): string {
  if (p.matchedConcepts.includes("loneliness")) return "A single glyph in a void";
  return "Untitled ASCII study";
}

function loglineFor(p: ParsedPrompt): string {
  const notes = p.matchedConcepts
    .map((id) => CONCEPTS.find((c) => c.id === id)?.note)
    .filter((x): x is string => Boolean(x));
  if (notes.length === 0) return "A structure assembles out of nothing and then lets go.";
  return `A structure assembles out of nothing and then lets go: ${notes.join("; ")}.`;
}

export const SUPPORTED_STRUCTURES = ["solitude-dissolution"] as const;
export type StructureId = (typeof SUPPORTED_STRUCTURES)[number];

/** Re-export for callers that only want the pipeline entry point. */
export function promptToFilmSpec(prompt: string, overrides: PromptOverrides = {}): FilmSpec {
  const parsed = parsePrompt(prompt, overrides);
  return planFilm(parsed, overrides);
}

export const EASING_CHOICES: Easing[] = ["linear", "easeIn", "easeOut", "easeInOut", "easeOutExpo"];
export const SHAPE_CHOICES: ShapeKind[] = ["none", "disc", "ring", "humanoid", "column", "shard", "grid"];
