/**
 * FilmSpec v2 -> FilmSpec v1 adapter.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A HACK.
 * Phase 1's renderer consumes FilmSpec v1 and is pinned by the frozen baseline. Phase 2's
 * Director Agent produces FilmSpec v2. Rather than rewrite the renderer (which would
 * invalidate the baseline and lose the reference implementation), v2 compiles down to v1
 * for the CPU reference renderer.
 *
 * This is the standard IR arrangement: a high-level, meaning-bearing representation
 * compiles to a low-level, executable one. `Scene IR` (src/scene-ir) is the *future*
 * renderer-facing layer; v1 is the *current* one. Introducing Scene IR in gate 2C will
 * insert it between this adapter and the renderer without changing the Director Agent.
 *
 * The adapter is deliberately total and lossless in the render-relevant direction:
 * everything the v1 renderer reads must survive. v2-only fields (intention, reasons,
 * interpretation) are dropped here because the v1 renderer does not read them — they are
 * preserved in `film-spec.json` v2 and in the director materials.
 *
 * NON-REGRESSION GUARANTEE: the loneliness preset is built from the same exported Phase 1
 * beat table, so `lonelinessPresetV2ToV1(buildLonelinessPresetV2(opts))` produces a
 * FilmSpec v1 that encodes to a byte-identical `grid.bin` against the Phase 1 baseline.
 * `npm run regression:phase2` asserts exactly that.
 */

import type { FilmSpec, ShotSpec, CameraMoveSpec, RasterSpec, FilmLookSpec, DerivationRecord } from "./schema.js";
import type { FilmSpecV2 } from "./film-spec-v2.js";
import type { ShotSpecV2 } from "./shot-spec-v2.js";
import { hashString } from "../core/rng.js";

/** Camera moves are stored verbatim on v2 shots, so this is a structural copy. */
function moveOf(shot: ShotSpecV2): CameraMoveSpec {
  return { ...shot.camera.move };
}

function shotV2ToV1(shot: ShotSpecV2): ShotSpec {
  return {
    id: shot.id,
    title: shot.title,
    intent: shot.intention,
    start: shot.start,
    duration: shot.duration,
    background: shot.background,
    camera: moveOf(shot),
    density: {
      coverageMinStart: shot.density.coverageMinStart,
      coverageMinEnd: shot.density.coverageMinEnd,
      coverageMaxStart: shot.density.coverageMaxStart,
      coverageMaxEnd: shot.density.coverageMaxEnd,
    },
    layers: shot.layers,
    raster: shot.raster ?? {},
    // A transition's kind maps directly; v1 only knows cut and dissolve.
    transitionIn: {
      kind: shot.transitionIn && shot.transitionIn.kind === "dissolve" ? "dissolve" : "cut",
      duration: shot.transitionIn?.duration ?? 0,
    },
    techniques: shot.techniques,
  };
}

/**
 * Compile a FilmSpec v2 to the FilmSpec v1 that the CPU reference renderer consumes.
 *
 * The v1 `derivation` record is reconstructed from v2's provenance so that the v1 render
 * report can still explain where the film came from.
 */
export function filmSpecV2ToV1(film: FilmSpecV2): FilmSpec {
  const [width, height] = film.direction.resolution;
  const raster: RasterSpec = { ...film.direction.raster };
  const look: FilmLookSpec = { ...film.direction.look };

  const derivation: DerivationRecord = {
    tokens: tokenize(film.input.raw),
    matchedConcepts: film.interpretation.motifs.map((m) => m.id),
    structure: film.provenance.seedTemplate ?? "director-v2",
    constraints: {
      durationInSeconds: film.direction.duration,
      width,
      height,
      fps: film.direction.fps,
      aspect: look.aspect,
      quality: film.direction.quality,
    },
    defaultsApplied: film.provenance.repairs.map((r) => `${r.path}: ${r.problem} (${r.action})`),
  };

  return {
    version: "1.0.0",
    slug: film.slug,
    title: film.title,
    prompt: film.input.raw,
    logline: film.interpretation.centralIdea,
    width,
    height,
    fps: film.direction.fps,
    durationInSeconds: film.direction.duration,
    aspect: look.aspect,
    quality: film.direction.quality,
    fpsRationale:
      "Derived from the Director Agent's direction plan; the engine samples camera and " +
      "primitive fields analytically at any frame index.",
    look,
    raster,
    shots: film.shots.map(shotV2ToV1),
    seed: film.seed,
    derivation,
  };
}

function tokenize(raw: string): string[] {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const words = normalized.length > 0 ? normalized.split(" ") : [];
  const cjk = Array.from(normalized).filter((c) => /[\u4e00-\u9fff]/.test(c));
  return Array.from(new Set([...words, ...cjk])).filter(Boolean);
}

/**
 * The seed a v2 film must carry in order to reproduce the Phase 1 loneliness grid.
 * Kept here (not in the preset) so the adapter is the single place that knows the
 * derivation rule.
 */
export function legacySeedForWordMode(word: string, duration: number, width: number, height: number, fps: number): number {
  return hashString(`ascii-cinema/${word}/${duration}/${width}x${height}/${fps}`);
}
