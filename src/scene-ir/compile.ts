/**
 * SceneIR compiler: ShotSpec v2 -> SceneIR.
 *
 * WHY THIS LAYER EXISTS.
 * In Phase 1 the renderer imported `domain/schema.ts` directly, so it had an opinion about
 * the director's structure. SceneIR is the lowest complete description of a frame's inputs
 * and nothing above it, which is what lets a second renderer be added without touching the
 * Director Agent.
 *
 * WHERE GEOMETRY LIVES.
 * This compiler is the ONLY place that converts world units to cells, and the only place
 * that samples camera easing. The renderer therefore interpolates and projects but never
 * re-derives framing. That is a direct response to Phase 1's three unit bugs: geometry
 * re-derived in several places with different units.
 *
 * THE INVARIANT. The camera's pinhole ratio is `focal = 1` (see ARCHITECTURE.md). The
 * framing control is `focusDistance`, which IS the visible world height / 2. SceneIR carries
 * the derived `worldToCells = rows / (2 * focusDistance)` so a renderer never has to know
 * that rule.
 */

import type { CameraKey, CameraTrack, LayerIR, PrimitiveIR, SceneIR, TransformIR, MotionIR } from "./types.js";
import type { FilmSpecV2 } from "../domain/film-spec-v2.js";
import type { ShotSpecV2 } from "../domain/shot-spec-v2.js";
import type { LayerSpec } from "../domain/schema.js";
import { compileScene, type Scene } from "../scene/scene.js";
import { compileForm } from "../director/grammar/forms.js";
import { sampleCamera, SUBJECT } from "../camera/rig.js";
import { makeBasis, project } from "../core/math.js";
import type { OcclusionPolicy } from "../director/grammar/vocabulary.js";

/** Minimal film shape the compiler needs. */
export interface CompilerFilm {
  seed: number;
  width: number;
  height: number;
  raster: { cols: number; rows: number; cellW: number; cellH: number; ramp: string; exposure: number; blackPoint: number; dither: boolean; inkFloor: number };
  look: { filmGrain: number; vignette: number; chromaticBloom: number; scanlineHz: number };
  slug: string;
}

/**
 * A NaN or Infinity anywhere in the geometry is an engine bug, not a rendering artefact.
 * It is caught at COMPILE time so it can never reach a frame.
 */
function assertFinite(value: number, where: string): number {
  if (!Number.isFinite(value)) throw new Error(`SceneIR compile: non-finite value at ${where}`);
  return value;
}

/**
 * Sample the camera track at frame resolution.
 *
 * Sampling here (rather than letting the renderer evaluate easing) is what makes two
 * renderers agree about geometry by construction.
 */
export function compileCameraTrack(shot: ShotSpecV2, cols: number, rows: number, aspect: number): CameraTrack {
  const rigShot = { duration: shot.duration, camera: shot.camera.move };
  const frameCount = Math.max(1, Math.round(shot.duration * 30));
  const focusDistance = Math.max(0.05, shot.camera.move.focusDistance);
  const worldToCells = rows / (2 * focusDistance);
  const keys: CameraKey[] = [];

  // One key per frame is exact but wasteful for long shots; 2-frame resolution with linear
  // interpolation is indistinguishable at 30fps and halves the IR size. Motion tests and the
  // film share this path, so the sample rate must not depend on the requested range.
  const step = shot.duration <= 4 ? 1 : 2;

  for (let f = 0; f < frameCount; f += step) {
    const t = f / 30;
    const s = sampleCamera(rigShot, t, rows);
    keys.push({
      frame: f,
      position: [assertFinite(s.pos.x, "camera.x"), assertFinite(s.pos.y, "camera.y"), assertFinite(s.pos.z, "camera.z")],
      target: [SUBJECT.x, SUBJECT.y, SUBJECT.z],
      fovY: 2 * Math.atan(1),
      roll: s.roll,
      worldToCells: assertFinite(worldToCells, "worldToCells"),
      subjectLineY: SUBJECT.y,
    });
  }
  // always include the final frame so the track spans the whole shot
  if (keys[keys.length - 1]!.frame !== frameCount - 1) {
    const t = (frameCount - 1) / 30;
    const s = sampleCamera(rigShot, t, rows);
    keys.push({
      frame: frameCount - 1,
      position: [s.pos.x, s.pos.y, s.pos.z],
      target: [SUBJECT.x, SUBJECT.y, SUBJECT.z],
      fovY: 2 * Math.atan(1),
      roll: s.roll,
      worldToCells,
      subjectLineY: SUBJECT.y,
    });
  }

  void cols;
  void aspect;
  return { reason: shot.camera.reasonDetail, keys, focal: 1 };
}

/** Map a v1 transform kind onto the IR's transform, with its ramp windows. */
function transformIR(kind: LayerSpec["transform"]): TransformIR {
  switch (kind) {
    case "assemble":
      return { kind: "assemble", radialOffset: 0.55, radialScale: 1, alphaFrom: 0, alphaTo: 1, sizeScaleFrom: 0.88, sizeScaleTo: 1 };
    case "dissolve":
      return { kind: "dissolve", radialOffset: 3.4, radialScale: 1.75, alphaFrom: 1, alphaTo: 0, sizeScaleFrom: 1, sizeScaleTo: 0.7 };
    case "collapse":
      return { kind: "collapse", radialOffset: -0.2, radialScale: 0.65, alphaFrom: 1, alphaTo: 1, sizeScaleFrom: 1, sizeScaleTo: 0.8 };
    case "scatter":
      return { kind: "scatter", radialOffset: 3.4, radialScale: 1.5, alphaFrom: 1, alphaTo: 0, sizeScaleFrom: 1, sizeScaleTo: 1 };
    case "none":
    default:
      return { kind: "none", radialOffset: 0, radialScale: 1, alphaFrom: 1, alphaTo: 1, sizeScaleFrom: 1, sizeScaleTo: 1 };
  }
}

/** The IR's motion, derived from the shot plan's motion list for this layer's subject. */
function motionIR(shot: ShotSpecV2, layerId: string): MotionIR {
  const declared = shot.motion.find((m) => m.subjectId === layerId);
  if (!declared) return { kind: "none", intensity: 0, frequency: 0 };
  const map: Record<string, MotionIR["kind"]> = {
    drift: "drift",
    orbit: "orbit",
    converge: "drift",
    diverge: "drift",
    pulse: "pulse",
    flicker: "flicker",
    fall: "none",
    rise: "none",
    flow: "flow",
    tremble: "tremble",
    hold: "none",
  };
  return {
    kind: map[declared.kind] ?? "none",
    intensity: declared.intensity,
    frequency: declared.kind === "tremble" ? 6 : declared.kind === "pulse" ? 0.8 : 0.25,
  };
}

/**
 * Compile one layer's primitives into IR, computing each primitive's REST-POSE view depth.
 *
 * `z` is world units in front of the camera at the shot's first frame. It is a property of
 * the primitive, not of the frame, so the depth policy has something stable to sort on
 * before any per-frame projection happens.
 */
function compilePrimitives(
  prims: Scene["layers"][number]["prims"],
  camera0: { right: [number, number, number]; up: [number, number, number]; fwd: [number, number, number]; pos: [number, number, number] },
  layerId: string,
): PrimitiveIR[] {
  const out: PrimitiveIR[] = new Array(prims.length);
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i]!;
    const dx = p.p.x - camera0.pos[0];
    const dy = p.p.y - camera0.pos[1];
    const dz = p.p.z - camera0.pos[2];
    // view depth along the camera's forward axis; the camera looks AT the subject, so this
    // is positive for anything in front of it
    const z = dx * camera0.fwd[0] + dy * camera0.fwd[1] + dz * camera0.fwd[2];
    if (!Number.isFinite(z)) throw new Error(`SceneIR compile: non-finite depth in layer ${layerId}`);
    out[i] = {
      i: p.i,
      p: [assertFinite(p.p.x, `${layerId}.x`), assertFinite(p.p.y, `${layerId}.y`), assertFinite(p.p.z, `${layerId}.z`)],
      dir: [p.dir.x, p.dir.y, p.dir.z],
      rim: assertFinite(p.rim, `${layerId}.rim`),
      sizeMul: assertFinite(p.sizeMul, `${layerId}.sizeMul`),
      intMul: assertFinite(p.intMul, `${layerId}.intMul`),
      phase: assertFinite(p.phase, `${layerId}.phase`),
      z,
    };
  }
  return out;
}

export interface CompileSceneIROptions {
  /** the occlusion policy the space implies; overrides per-layer defaults when set */
  occlusionPolicy?: OcclusionPolicy;
}

/**
 * Compile a v2 shot into SceneIR.
 *
 * Pure: the same (film, shot, options) always produce a byte-identical IR.
 */
export function compileShotToSceneIR(
  film: CompilerFilm,
  shot: ShotSpecV2,
  options: CompileSceneIROptions = {},
): SceneIR {
  const cols = film.raster.cols;
  const rows = film.raster.rows;
  const aspect = film.width / film.height;
  const frameCount = Math.max(1, Math.round(shot.duration * 30));

  // The primitive cloud comes from the existing scene compiler, which is already proven
  // deterministic and whose seeding guarantees no orphan primitives.
  const scene = compileScene(film as never, shot as never);

  const cameraTrack = compileCameraTrack(shot, cols, rows, aspect);
  const k0 = cameraTrack.keys[0]!;
  const basis0 = makeBasis(
    { x: k0.position[0], y: k0.position[1], z: k0.position[2] },
    { x: k0.target[0], y: k0.target[1], z: k0.target[2] },
    k0.fovY,
    aspect,
    k0.roll,
  );
  const camera0 = {
    right: [basis0.right.x, basis0.right.y, basis0.right.z] as [number, number, number],
    up: [basis0.up.x, basis0.up.y, basis0.up.z] as [number, number, number],
    fwd: [basis0.fwd.x, basis0.fwd.y, basis0.fwd.z] as [number, number, number],
    pos: [basis0.pos.x, basis0.pos.y, basis0.pos.z] as [number, number, number],
  };

  const spacePolicy: OcclusionPolicy = shot.space.occlusionPolicy;

  const layers: LayerIR[] = scene.layers.map((sl) => {
    const spec = sl.spec;
    // A layer's occlusion policy comes from the space, unless the layer is a pure
    // atmosphere/background wash, which must never occlude the subject.
    const isBackground = spec.role === "atmosphere" || spec.role === "parallax-background";
    const policy: OcclusionPolicy = isBackground ? "additive" : (options.occlusionPolicy ?? spacePolicy);

    return {
      id: spec.id,
      origin: [assertFinite(sl.origin.x, `${spec.id}.originX`), assertFinite(sl.origin.y, `${spec.id}.originY`), assertFinite(sl.origin.z, `${spec.id}.originZ`)],
      semantics: {
        subjectId: shot.subjects.find((s) => s.id === spec.id)?.id,
        role: spec.role,
        shape: spec.shape,
        occlusionPolicy: policy,
        // the form the layer represents, carried so BOTH renderers see the same semantic object
        forms: spec.subjectForms?.length
          ? spec.subjectForms.map((f) => {
              const compiled = compileForm(f);
              const anchors: Record<string, [number, number, number]> = {};
              for (const [k, v] of Object.entries(compiled.anchors) as Array<[string, { x: number; y: number; z: number }]>) {
                anchors[k] = [
                  assertFinite(v.x, `${spec.id}.anchor.${k}.x`),
                  assertFinite(v.y, `${spec.id}.anchor.${k}.y`),
                  assertFinite(v.z, `${spec.id}.anchor.${k}.z`),
                ];
              }
              return { kind: f.kind, role: f.role, recognition: f.recognition, anchors };
            })
          : undefined,
      },
      glyphRadius: assertFinite(spec.glyphRadius, `${spec.id}.glyphRadius`),
      intensity: assertFinite(spec.intensity, `${spec.id}.intensity`),
      focus: assertFinite(spec.focus, `${spec.id}.focus`),
      depthResponse: spec.depth,
      variation: spec.variation,
      transform: transformIR(spec.transform),
      motion: motionIR(shot, spec.id),
      noise: { ...spec.noise },
      primitives: compilePrimitives(sl.prims, camera0, spec.id),
    };
  });

  const density = {
    from: { coverageMin: shot.density.coverageMinStart, coverageMax: shot.density.coverageMaxStart },
    to: { coverageMin: shot.density.coverageMinEnd, coverageMax: shot.density.coverageMaxEnd },
    inkFloor: shot.raster?.inkFloor ?? film.raster.inkFloor,
    strategy: `${shot.density.coverageMaxStart} -> ${shot.density.coverageMaxEnd} max coverage subpixels`,
  };

  // Rhythm for the shot: taken from the plan, which sampled the film's global curves.
  return {
    irVersion: "1",
    shotId: shot.id,
    filmSlug: film.slug,
    width: film.width,
    height: film.height,
    cols,
    rows,
    cellW: film.raster.cellW,
    cellH: film.raster.cellH,
    duration: shot.duration,
    frameCount,
    narrativeFunction: shot.narrativeFunction,
    intention: shot.intention,
    visualReason: shot.visualReason,
    cameraReason: shot.cameraReason,
    rhythm: { from: shot.rhythm.energy, to: shot.rhythm.energy },
    camera: cameraTrack,
    layers,
    density,
    glyph: {
      vocabulary: film.raster.ramp,
      exposure: film.raster.exposure,
      blackPoint: film.raster.blackPoint,
      dither: film.raster.dither,
    },
    stock: {
      grain: film.look.filmGrain,
      vignette: film.look.vignette,
    },
    background: shot.background,
    primitiveCount: layers.reduce((n, l) => n + l.primitives.length, 0),
  };
}

/** Compile every shot of a v2 film. */
export function compileFilmToSceneIR(film: CompilerFilm, v2: FilmSpecV2): SceneIR[] {
  return v2.shots.map((s) => compileShotToSceneIR(film, s));
}

export { project };
