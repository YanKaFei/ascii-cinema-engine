/**
 * Director — the orchestrator.
 *
 * Runs the chain and nothing else. It holds NO directorial knowledge: every decision lives
 * in a planner, so a wrong film can be traced to the stage that got it wrong, and every
 * stage can be tested in isolation.
 *
 *   classify -> interpret -> motifs -> dramaturgy -> space -> rhythm -> shots -> FilmSpec v2
 *
 * DETERMINISM. Every planner takes a seed and uses only seeded RNG, so the same
 * (input, options) always produces a byte-identical FilmSpec. That is what lets a film be
 * re-rendered and audited without re-invoking an interpreter, which is the whole reason the
 * LLM boundary can be drawn where it is.
 *
 * The Director does NOT author primitive layers — that is `authoring.ts`, because layer
 * authoring is the one stage that has to know about the renderer's capabilities.
 */

import type { FilmSpecV2, ActSpec } from "../domain/film-spec-v2.js";
import type {
  DirectorOptions,
  DirectorResult,
  PlannedCamera,
  PlannedComposition,
  ShotPlan,
} from "./types.js";
import type { NarrativeFunction } from "./grammar/vocabulary.js";
import { classifyPrompt, heuristicClassifier, type PromptClassifier } from "./planners/PromptClassifier.js";
import { heuristicInterpreter, type SemanticInterpreter } from "./planners/SemanticInterpreter.js";
import { planMotifs, summariseMotifs } from "./planners/MotifPlanner.js";
import { planDramaturgy } from "./planners/DramaturgyPlanner.js";
import { planSpace } from "./planners/SpatialPlanner.js";
import { planComposition } from "./planners/CompositionPlanner.js";
import { planCamera } from "./planners/CameraPlanner.js";
import { planRhythm } from "./planners/RhythmPlanner.js";
import { planShots } from "./planners/ShotPlanner.js";
import { hashString } from "../core/rng.js";
import type { RasterSpec, FilmLookSpec } from "../domain/schema.js";

const MASTER_RAMP =
  " .'-_,^:;\"~i!|/\\()[]{}<>+=*?ltfrj1vcxunzoahksdybwmpqg" +
  "234567890LJCEFIVXYTZAHKNSURMDBWQGO#&$%@";

export interface DirectorDeps {
  classifier?: PromptClassifier;
  interpreter?: SemanticInterpreter;
}

/**
 * Run the whole director pipeline.
 *
 * `deps` exists so an LLM-backed interpreter can be injected without changing any planner.
 * The default is entirely offline and deterministic.
 */
export async function direct(raw: string, options: DirectorOptions, deps: DirectorDeps = {}): Promise<DirectorResult> {
  const classifier = deps.classifier ?? heuristicClassifier;
  const interpreter = deps.interpreter ?? heuristicInterpreter;

  const seed = options.seed ?? hashString(`ascii-cinema/v2/${raw}/${options.duration}/${options.width}x${options.height}/${options.fps}`);

  // ---- 1. classify ---------------------------------------------------------
  const classification = await classifier.classify(raw);
  const mode = options.forceMode ?? classification.mode;

  // ---- 2. interpret (the only LLM-eligible stage) --------------------------
  const reading = await interpreter.interpret(raw, { ...classification, mode });
  if (mode !== classification.mode) {
    reading.mode = mode;
    reading.modeRationale = `${classification.rationale} (mode forced to "${mode}" by the caller)`;
  }

  // ---- 3. motifs -----------------------------------------------------------
  const motifs = planMotifs(reading);

  // ---- 4. dramaturgy -------------------------------------------------------
  // A brief that declares every shot's duration determines the film's length. Honouring the
  // brief is the point of the mode, so the declared total wins over the requested duration.
  const effectiveDuration = reading.brief?.declaredTotalDuration ?? options.duration;
  const dramaturgy = planDramaturgy(reading.features, effectiveDuration);

  // ---- 5. spatial ----------------------------------------------------------
  const spatial = planSpace(reading.features, reading.spatialMetaphor, {
    conceptIds: reading.concepts.map((c) => c.id),
    transformationKind: reading.transformationLogic?.kind,
  });

  // ---- 6. rhythm -----------------------------------------------------------
  const rhythm = planRhythm(reading.features, effectiveDuration);

  // ---- 7. shots ------------------------------------------------------------
  const shots = planShots({
    reading,
    dramaturgy,
    motifs,
    spatial,
    rhythm,
    options,
    seed,
    planComposition: (fn: NarrativeFunction): PlannedComposition => {
      const c = planComposition(spatial.spaceKind, fn, reading.features);
      return { ...c, secondary: c.secondary ?? [] };
    },
    planCamera: (
      fn: NarrativeFunction,
      energy: number,
      motionDensity: number,
      isFinalShot: boolean,
      requiredMove?: string,
    ): PlannedCamera =>
      planCamera({
        fn,
        space: spatial.spaceKind,
        features: reading.features,
        isFinalShot,
        energy,
        motionDensity,
        requiredMove,
      }),
  });

  return {
    reading,
    dramaturgy,
    motifs,
    spatial,
    rhythm,
    shots,
    planners: [
      {
        id: `classifier:${classifier === heuristicClassifier ? "heuristic" : "custom"}`,
        summary: `mode="${classification.mode}" because ${classification.rationale}`,
      },
      {
        id: `interpreter:${interpreter.id}`,
        summary:
          `${reading.concepts.length} concept(s) matched (${reading.concepts.map((c) => c.id).join(", ") || "none"}); ` +
          `features arc=${reading.features.arcShape} presence=${reading.features.presence} reachability=${reading.features.reachability}`,
      },
      { id: "motifs", summary: summariseMotifs(motifs) },
      {
        id: "dramaturgy",
        summary: `${dramaturgy.acts.length} acts, turn at ${(dramaturgy.turnAt * 100).toFixed(0)}%: ${dramaturgy.rationale}`,
      },
      { id: "spatial", summary: `space=${spatial.spaceKind} occlusion=${spatial.occlusionPolicy}: ${spatial.rationale}` },
      {
        id: "rhythm",
        summary: `4 curves at 24 keyframes: ${rhythm.rationale}`,
      },
      {
        id: "shots",
        summary:
          `${shots.length} shots over ${options.duration}s ` +
          `(lengths ${shots.map((s) => s.duration.toFixed(1)).join("/")}); ` +
          `cameras ${[...new Set(shots.map((s) => s.camera.kind))].join(", ")}`,
      },
    ],
    seed,
  };
}

/** Assemble the final FilmSpec v2 from a director result. */
export function assembleFilmSpecV2(result: DirectorResult, options: DirectorOptions): FilmSpecV2 {
  const { reading, shots, dramaturgy, spatial, rhythm } = result;
  const [width, height] = [options.width, options.height];
  // A brief that declares every shot's duration determines the film's length. Recomputed here
  // rather than carried on the result, so the two cannot drift apart.
  const effectiveDuration = reading.brief?.declaredTotalDuration ?? options.duration;

  const raster: RasterSpec = {
    cols: width / 8,
    rows: height / 9,
    cellW: 8,
    cellH: 9,
    ramp: MASTER_RAMP,
    coverageMin: 1,
    coverageMax: 20,
    exposure: 1.85,
    blackPoint: 0.085,
    dither: true,
    inkFloor: 0,
  };
  if (!Number.isInteger(raster.cols) || !Number.isInteger(raster.rows)) {
    throw new Error(`${width}x${height} is not divisible by the 8x9 glyph cell`);
  }

  /**
   * THE FILM'S LOOK. `chromaticBloom` was 0 AND THE RENDERER IGNORED IT ENTIRELY, so every film in
   * this project has had NO LIGHT IN IT: a bright mark was a pale mark, with nothing bleeding around
   * it and nothing reading as emitting. That is the mechanical cause of the visual review's FILMIC
   * FEELING staying WEAK while every structural criterion passed.
   *
   * Bloom (a tight glow) plus halation (a wider halo) are now implemented as a stage on the FIELD
   * before quantisation, so the glow changes WHICH CHARACTER is drawn rather than being painted over
   * the characters afterwards. Light in the scene, not a filter on an image.
   *
   * THE STRENGTHS ARE MEASURED. Total lit ink must rise with bloom, and it does:
   *
   *     bloom   total lit ink   lit cells   mean per lit cell
   *     0          26,503,944     379,445          69.8
   *     0.3        32,074,039     469,675          68.3
   *     0.7        38,068,097     513,502          74.1
   *     2.0        61,005,839   1,389,373          43.9
   *
   * NOTE the mean per lit cell FALLS at 0.3 while total ink RISES. That is not a defect and it is
   * worth understanding before reading any future bloom measurement: added light lifts dim cells
   * INTO the lit population, and those new cells are dimmer than the existing average. A mean over a
   * growing population cannot be compared across runs. **Pair it with the lit-cell count or use a
   * total.** I read the mean alone in round 35 and concluded the implementation was broken.
   */
  const look: FilmLookSpec = {
    background: "#000000",
    foreground: "#ffffff",
    aspect: "16:9",
    filmGrain: 0.03,
    vignette: 0.3,
    // a tight glow and a wider halo; halation is a fraction of the bloom
    chromaticBloom: 0.45,
    halation: 0.3,
    bloomRadius: 2,
    bloomThreshold: 0.25,
    /**
     * DEPTH OF FIELD IS OFF. It is implemented (see `render/frame.ts`) and the focus plane now reads
     * the camera's real `focusDistance`, but ENABLING IT REGRESSED TWO OF FOUR FILMS:
     *
     *   film                midtones        heavy glyphs
     *   desire              42.8% -> 14.4%   23.7% ->  3.0%
     *   time                48.8% -> 20.1%   15.2% ->  2.1%
     *   forgotten-name      32.5% -> 47.8%   34.8% -> 30.3%   improved
     *   disappearing-room   41.4% -> 47.9%   27.2% -> 33.3%   improved
     *
     * Two improved and two collapsed, which means the focus plane is systematically WRONG for the
     * films that suffered rather than the strength being mistuned — a strength sweep cannot fix a
     * focus plane placed at the wrong depth. The likely cause is that `focusDistance` is the distance
     * to the SUBJECT PLANE, while the field's marks sit at depths either side of it, so the subject
     * itself falls outside `dofRange` for the films whose space is deep.
     *
     * Off rather than shipped, and recorded rather than tuned. The next step is to calibrate the
     * focus plane against each shot's MEASURED mark depths (the z-buffer already holds them) instead
     * of assuming the subject plane.
     */
    /**
     * DEPTH OF FIELD IS OFF, AFTER THREE ATTEMPTS THAT ALL FAILED IN MEASURED WAYS.
     *
     *   attempt                         desire mid / heavy    forgotten-name    disappearing-room   time mid
     *   subject-plane focus (r42)       42.8 -> 14.4 / 3.0%    32.5 -> 47.8%      41.4 -> 47.9%      48.8 -> 20.1%
     *   plane from measured depths      42.8 -> 12.2 / 4.5%    32.5 -> 50.3%      41.4 -> 52.0%      48.8 -> 31.6%
     *   + highlight-biased target       42.8 ->  ?             32.5 -> 16.8%      41.4 -> 13.9%      48.8 -> 82.1%
     *
     * The pattern is consistent and instructive: every attempt IMPROVES the two films that start with
     * blown highlights and DAMAGES the two that start correctly exposed. `desire` collapsed under all
     * three.
     *
     * The first two failures were a focus plane in the wrong place, and calibrating it from the
     * MEASURED mark depths in the z-buffer halved the damage (20.1% -> 31.6% on `time`) but did not
     * remove it. The third identified the real mechanism: the defocus pass blends a cell toward a
     * target level, and WHATEVER that target is, it is wrong for half the corpus — the mean destroys
     * highlights, the peak blows the frame up.
     *
     * The conclusion is that a GLOBAL target cannot work here for the same reason a global exposure
     * constant could not (see `EXPOSURE_CORRECTION`): these films want opposite corrections, and the
     * blur pass collapses a per-cell quantity into a per-frame one. What defocus actually needs is a
     * LOCAL target — the brightness of the cell's own neighbourhood, blurred — so a defocused
     * highlight stays the brightness of its own region rather than of the frame.
     *
     * Off, with all three measurement tables recorded in `render/frame.ts`. The infrastructure is
     * kept and is exercised: `CameraState.focusDistance`, rack focus, lens breathing and aperture all
     * work and are verified.
     */
    dof: 0,
    scanlineHz: 0,
    textTypeIn: 0,
  };

  // Acts, with their shot ids taken from the shot plans.
  const acts: ActSpec[] = dramaturgy.acts.map((a) => ({
    id: a.id,
    title: a.title,
    function: a.function,
    shotIds: shots.filter((s) => s.actId === a.id).map((s) => s.id),
    from: Number(a.from.toFixed(6)),
    to: Number(a.to.toFixed(6)),
    dominantFunction: a.dominantFunction,
    dominantSpace: a.dominantSpace,
    dominantComposition: a.dominantComposition,
  }));

  // A shot must belong to an act; if a rounding artefact orphaned one, attach it.
  const owned = new Set(acts.flatMap((a) => a.shotIds));
  for (const s of shots) {
    if (!owned.has(s.id)) acts[acts.length - 1]!.shotIds.push(s.id);
  }

  const slug = slugify(reading.raw);
  const title = titleFor(reading);

  return {
    version: "2",
    slug,
    title,
    input: {
      raw: reading.raw,
      mode: reading.mode,
      modeRationale: reading.modeRationale,
      scriptUnits: reading.mode === "script" ? scriptUnitsFallback(reading.raw) : undefined,
    },
    interpretation: {
      literalMeaning: reading.literalMeaning,
      centralIdea: reading.centralIdea,
      dramaticQuestion: reading.dramaticQuestion,
      // A "trace" is presence-by-absence: the film shows both the place and the thing that
      // is not in it, so it maps onto the DSL's "both" rather than losing the distinction.
      subjectPresence:
        reading.subjectPresence === "trace"
          ? "both"
          : reading.subjectPresence === "absent"
            ? "absent"
            : "present",
      emotionalArc: reading.emotionalArc,
      motifs: result.motifs.map((m) => ({
        id: m.id,
        meaning: m.meaning,
        visualForm: m.visualForm,
        subjectKind: m.subjectKind,
        role: m.role,
        introducedAt: m.introducedAt,
        development: m.development,
      })),
      oppositions: reading.oppositions,
      spatialMetaphor: reading.spatialMetaphor,
      spaceKind: spatial.spaceKind,
      transformationLogic: reading.transformationLogic,
      constraints: reading.constraints,
    },
    direction: {
      // The brief may have determined the length; report what the film actually is.
      duration: effectiveDuration,
      fps: options.fps,
      resolution: [width, height],
      quality: options.quality,
      visualStrategy: visualStrategyFor(reading),
      densityStrategy: densityStrategyFor(shots),
      cameraStrategy: cameraStrategyFor(shots),
      editingStrategy: editingStrategyFor(shots, reading),
      rhythmStrategy: rhythm.rationale,
      negativeSpaceStrategy: negativeSpaceStrategyFor(shots, spatial),
      openingImage: openingImageFor(shots),
      closingImage: closingImageFor(shots, reading),
      rhythm,
      look,
      raster,
    },
    acts,
    shots: [], // filled by authoring.ts, which knows the renderer
    seed: result.seed,
    provenance: {
      interpreter: result.planners[1]?.id === "interpreter:llm" ? "llm" : "deterministic",
      planners: result.planners,
      repairs: [],
    },
  };
}

// ---------------------------------------------------------------------------
// derived prose — the words a director would use
// ---------------------------------------------------------------------------

function titleFor(reading: DirectorResult["reading"]): string {
  const primary = reading.motifSeeds.length > 0 ? reading.motifSeeds[0]!.id.replace(/-/g, " ") : "untitled";
  return `${reading.raw} / ${primary}`;
}

function slugify(raw: string): string {
  const trimmed = raw.trim().slice(0, 24);
  const ascii = Array.from(trimmed)
    .map((c) => (c.charCodeAt(0) < 128 && /[a-z0-9]/i.test(c) ? c.toLowerCase() : ""))
    .join("");
  if (ascii.length >= 3) return ascii;
  // CJK has no ascii slug; use a stable hash suffix so paths stay filesystem-safe.
  return `film-${hashString(trimmed).toString(36)}`;
}

function visualStrategyFor(reading: DirectorResult["reading"]): string {
  return (
    `Space is ${reading.features.spatiality > 0.7 ? "the film's primary material" : "a container for the subject"}; ` +
    `the frame is built from procedurally seeded point fields sampled on a fixed glyph lattice, ` +
    `so every mark is a printable ASCII character and every empty cell is a decision. ` +
    `Presence is ${reading.features.presence}, so the composition's job is to make ` +
    `${reading.features.presence === "absent" ? "an absence legible as a shape" : "the subject's relation to the space readable"}.`
  );
}

function densityStrategyFor(shots: ShotPlan[]): string {
  const first = shots[0]?.density;
  const last = shots[shots.length - 1]?.density;
  return (
    `The glyph vocabulary is a coverage window that opens from "${first?.coverageMaxStart ?? 3}" to ` +
    `"${Math.max(...shots.map((s) => s.density.coverageMaxEnd))}" ink subpixels and closes to ` +
    `"${last?.coverageMaxEnd ?? 2}" by the final shot. ` +
    `Density is spent rather than sustained, so the film's fullest frame is a specific moment rather than a plateau.`
  );
}

function cameraStrategyFor(shots: ShotPlan[]): string {
  const kinds = [...new Set(shots.map((s) => s.camera.kind))];
  const reasons = [...new Set(shots.map((s) => s.camera.reason))];
  const moving = shots.filter((s) => s.camera.kind !== "static").length;
  return (
    `${shots.length} shots use ${kinds.length} camera behaviour(s) (${kinds.join(", ")}); ` +
    `${moving} of ${shots.length} move. Every move carries a derived reason ` +
    `(${reasons.join(", ")}), and no move is used because the film needed something to happen.`
  );
}

function editingStrategyFor(shots: ShotPlan[], reading: DirectorResult["reading"]): string {
  const dissolves = shots.filter((s) => s.transitionIn?.kind === "dissolve").length;
  const cuts = shots.filter((s) => s.transitionIn?.kind === "cut").length;
  return (
    `${cuts} hard cut(s) and ${dissolves} overlap(s). ` +
    (reading.features.arcShape === "plateau"
      ? "Because the film is about a condition rather than an event, cuts refuse to imply that one frame led to the next."
      : "Cuts fall on the beat so the film's time is honest; overlaps are reserved for the transition into the final image.")
  );
}

function negativeSpaceStrategyFor(shots: ShotPlan[], spatial: DirectorResult["spatial"]): string {
  const ratios = shots.map((s) => s.composition.negativeSpaceRatio);
  const max = Math.max(...ratios);
  const min = Math.min(...ratios);
  return (
    `Negative space runs from ${(min * 100).toFixed(0)}% to ${(max * 100).toFixed(0)}% of the frame. ` +
    `In a ${spatial.spaceKind} the emptiness is not leftover area: it is the quantity the audience is asked to measure.`
  );
}

function openingImageFor(shots: ShotPlan[]): string {
  const s = shots[0];
  if (!s) return "An empty frame.";
  return (
    `A ${s.composition.primary} frame in a ${s.space.spaceKind}, ` +
    `${(s.composition.negativeSpaceRatio * 100).toFixed(0)}% empty, holding ${s.motifs.map((m) => m.id).join(" and ") || "nothing"} ` +
    `with the camera ${s.camera.kind}.`
  );
}

function closingImageFor(shots: ShotPlan[], reading: DirectorResult["reading"]): string {
  const s = shots[shots.length - 1];
  if (!s) return "The frame empties.";
  return (
    `${s.intention} The camera is ${s.camera.kind} (${s.camera.reason}), and the film stops rather than concludes: ` +
    `${reading.transformationLogic ? reading.transformationLogic.because : "the state it examined is left intact."}`
  );
}

/** Minimal script units for script mode when the interpreter did not supply them. */
function scriptUnitsFallback(raw: string) {
  const sentences = raw.split(/(?<=[。！？!?;；])\s*|(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);
  return sentences.map((body, index) => ({ index, body, subjects: [] as string[] }));
}

export { MASTER_RAMP, slugify };
export { classifyPrompt };
