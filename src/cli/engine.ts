#!/usr/bin/env node
/**
 * Engine CLI.
 *
 *   engine plan        prompt -> film-spec.json + shot-list.json
 *   engine render      film-spec.json -> grid.bin (the exact character decisions)
 *   engine stills      representative stills + contact sheet
 *   engine spool       raw RGB24 spool for a frame range (input to ffmpeg)
 *   engine encode      spool -> MP4
 *   engine probe       ffprobe metadata
 *   engine verify      ffprobe + full decode gate
 *   engine report      assemble render-report.json from the artifacts on disk
 *
 * Every subcommand is idempotent and writes into --out. Nothing here re-derives
 * cinematography: `render` is the only step that runs the engine, and everything
 * downstream consumes its output.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { promptToFilmSpec, parsePrompt } from "../domain/planner.js";
import { direct, assembleFilmSpecV2 } from "../director/Director.js";
import { authorFilm, compileToV1 } from "../director/authoring.js";
import { validateFilmSpecV2, applySafeRepairs } from "../domain/validate-v2.js";
import { compileFilmToSceneIR } from "../scene-ir/compile.js";
import { cpuRenderer } from "../render/cpu-renderer.js";
import type { DirectorOptions } from "../director/types.js";
import { validateFilmSpec, type FilmSpec } from "../domain/schema.js";
import { renderSequence, renderFrameAscii } from "../render/render.js";
import { encodeGridSequence, gridbinSummary, type GridSequence } from "../render/gridbin.js";
import {
  ensureDir,
  writeStill,
  writeContactSheet,
  writeRawRgbSpool,
  pngFrameStream,
  removeQuietly,
  fileSize,
  type ContactSheetEntry,
} from "../render/encode.js";
import { representativeFrames, shotRanges, totalFrames } from "../render/timeline.js";
import { resolveToolchain } from "../util/toolchain.js";
import { hashString } from "../core/rng.js";
import { encodeRawRgbToMp4, encodeRgbStreamToMp4, ffprobeJson, fullDecodeCheck } from "../util/ffmpeg.js";

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------

interface Args {
  command: string;
  flags: Map<string, string | boolean>;
  positional: string[];
}

function parseArgs(argv: string[]): Args {
  const [command = "", ...rest] = argv;
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
      } else {
        const next = rest[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags.set(a.slice(2), next);
          i++;
        } else {
          flags.set(a.slice(2), true);
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { command, flags, positional };
}

function str(args: Args, name: string, fallback?: string): string | undefined {
  const v = args.flags.get(name);
  if (typeof v === "string") return v;
  if (v === true) return "true";
  return fallback;
}

function num(args: Args, name: string, fallback?: number): number | undefined {
  const v = str(args, name);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(args: Args, name: string, fallback = false): boolean {
  const v = args.flags.get(name);
  if (v === undefined) return fallback;
  if (typeof v === "boolean") return v;
  return v !== "false" && v !== "0";
}

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, "utf8")) as T;
}

/** Load film-spec.json, validating it, so no subcommand can run on a broken spec. */
async function loadFilm(specPath: string): Promise<FilmSpec> {
  const film = await readJson<FilmSpec>(specPath);
  const v = validateFilmSpec(film);
  if (!v.ok) {
    const errs = v.issues.filter((i) => i.level === "error").map((i) => `  ${i.path}: ${i.message}`);
    throw new Error(`film-spec failed validation:\n${errs.join("\n")}`);
  }
  return film;
}

function specPaths(outDir: string) {
  return {
    spec: path.join(outDir, "film-spec.json"),
    shots: path.join(outDir, "shot-list.json"),
    grid: path.join(outDir, "grid.bin"),
    gridJson: path.join(outDir, "grid-manifest.json"),
    report: path.join(outDir, "render-report.json"),
    stills: path.join(outDir, "stills"),
    contact: path.join(outDir, "contact-sheet.png"),
    motion: path.join(outDir, "motion-tests"),
    roughCut: path.join(outDir, "rough-cut.mp4"),
    spool: path.join(outDir, `.spool-rough.rgb`),
  };
}

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

async function cmdPlan(args: Args): Promise<number> {
  const prompt = args.positional[0] ?? str(args, "prompt") ?? "孤独";
  const outDir = path.resolve(str(args, "out") ?? "out/loneliness");
  const duration = num(args, "seconds");
  const width = num(args, "width");
  const height = num(args, "height");
  const fps = num(args, "fps");
  const seed = num(args, "seed");
  const quality = str(args, "quality") as FilmSpec["quality"] | undefined;
  const aspect = str(args, "aspect");
  const slug = str(args, "slug");

  const parsed = parsePrompt(prompt, {
    durationInSeconds: duration,
    width,
    height,
    fps,
    seed,
    quality,
    aspect,
    slug,
  });
  const film = promptToFilmSpec(prompt, {
    durationInSeconds: duration,
    width,
    height,
    fps,
    seed,
    quality,
    aspect,
    slug,
  });

  const v = validateFilmSpec(film);
  if (!v.ok) {
    const errs = v.issues.filter((i) => i.level === "error").map((i) => `  ${i.path}: ${i.message}`);
    throw new Error(`planned FilmSpec is invalid (engine bug):\n${errs.join("\n")}`);
  }

  await ensureDir(outDir);
  const p = specPaths(outDir);
  await writeFile(p.spec, JSON.stringify(film, null, 2) + "\n", "utf8");

  const ranges = shotRanges(film);
  const shotList = {
    slug: film.slug,
    title: film.title,
    prompt: film.prompt,
    fps: film.fps,
    width: film.width,
    height: film.height,
    durationInSeconds: film.durationInSeconds,
    totalFrames: totalFrames(film),
    grid: { cols: film.raster.cols, rows: film.raster.rows, cellW: film.raster.cellW, cellH: film.raster.cellH },
    rampVocabulary: film.raster.ramp,
    seed: film.seed,
    derivation: parsed.derivation,
    techniquesCovered: Array.from(new Set(film.shots.flatMap((s) => s.techniques))).sort(),
    shots: film.shots.map((s, i) => ({
      id: s.id,
      title: s.title,
      intent: s.intent,
      start: s.start,
      duration: s.duration,
      firstFrame: ranges[i]!.firstFrame,
      endFrame: ranges[i]!.endFrame,
      frameCount: ranges[i]!.frameCount,
      camera: s.camera,
      density: s.density,
      techniques: s.techniques,
      transitionIn: s.transitionIn,
      layers: s.layers.map((l) => ({
        id: l.id,
        kind: l.kind,
        shape: l.shape,
        role: l.role,
        count: l.count,
        glyphRadius: l.glyphRadius,
        intensity: l.intensity,
        focus: l.focus,
        depth: l.depth,
        transform: l.transform,
        bounds: l.bounds,
        noise: l.noise,
      })),
    })),
  };
  await writeFile(p.shots, JSON.stringify(shotList, null, 2) + "\n", "utf8");

  log(`plan ok  slug=${film.slug}  ${film.width}x${film.height} @ ${film.fps}fps  ${film.durationInSeconds}s (${totalFrames(film)} frames)`);
  log(`         grid ${film.raster.cols}x${film.raster.rows} glyph cells  seed=${film.seed}`);
  log(`         shots ${film.shots.length}: ${film.shots.map((s) => s.id).join(", ")}`);
  log(`         ${p.spec}`);
  log(`         ${p.shots}`);
  return 0;
}


// ---------------------------------------------------------------------------
// direct — the Phase 2 Director Agent path
// ---------------------------------------------------------------------------

/**
 * `engine direct <prompt>` — run the Director Agent, validate the resulting FilmSpec v2,
 * compile it to the v1 spec the CPU reference renderer consumes, and write it out.
 *
 * This is a SEPARATE command from `plan`, deliberately. `plan` is the Phase 1 v1 planner
 * whose output is pinned by the frozen baseline; `direct` is the Phase 2 path. Keeping them
 * distinct means a regression in one cannot be masked by the other, and the Phase 1
 * benchmark never routes through the director unless explicitly asked.
 */
async function cmdDirect(args: Args): Promise<number> {
  const prompt = args.positional[0] ?? str(args, "prompt");
  if (!prompt) throw new Error("direct requires a prompt (positional or --prompt)");
  const outDir = path.resolve(str(args, "out") ?? `out/direct/${slugHint(prompt)}`);

  const options: DirectorOptions = {
    duration: num(args, "seconds", 20)!,
    fps: num(args, "fps", 30)!,
    width: num(args, "width", 1920)!,
    height: num(args, "height", 1080)!,
    quality: (str(args, "quality", "draft") as DirectorOptions["quality"]) ?? "draft",
    seed: num(args, "seed"),
    forceMode: str(args, "mode") as DirectorOptions["forceMode"],
  };

  const result = await direct(prompt, options);
  let film = assembleFilmSpecV2(result, options);
  // The user's OWN prompt is passed through, because it is the only place their words exist. The
  // motif ids and meanings are English slugs from the concept knowledge base, and using one as a
  // subject's displayed word is what produced `THE LEGIBLE WORD` in a Chinese-prompted film.
  film = authorFilm(film, result.shots, prompt);

  const validation = validateFilmSpecV2(film);
  if (!validation.ok) {
    const errs = validation.issues.filter((i) => i.level === "error").map((i) => `  ${i.path}: ${i.message}`);
    throw new Error(`Director produced an invalid FilmSpec v2 (engine bug, not a prompt problem):\n${errs.join("\n")}`);
  }
  const repairs = applySafeRepairs(film, validation);

  const v1 = compileToV1(film);
  const v1v = validateFilmSpec(v1);
  if (!v1v.ok) {
    const errs = v1v.issues.filter((i) => i.level === "error").map((i) => `  ${i.path}: ${i.message}`);
    throw new Error(`v2 -> v1 compilation produced an invalid spec:\n${errs.join("\n")}`);
  }

  await ensureDir(outDir);
  await writeFile(path.join(outDir, "film-spec-v2.json"), JSON.stringify(film, null, 2) + "\n", "utf8");
  await writeFile(path.join(outDir, "film-spec.json"), JSON.stringify(v1, null, 2) + "\n", "utf8");

  const shotList = {
    slug: film.slug,
    title: film.title,
    input: film.input,
    interpretation: film.interpretation,
    direction: { ...film.direction, rhythm: film.direction.rhythm },
    acts: film.acts,
    shots: film.shots.map((s) => ({
      id: s.id,
      title: s.title,
      narrativeFunction: s.narrativeFunction,
      intention: s.intention,
      start: s.start,
      duration: s.duration,
      space: s.space,
      composition: s.composition,
      camera: { ...s.camera, move: s.camera.move },
      motion: s.motion,
      transformation: s.transformation,
      transitionIn: s.transitionIn,
      rhythm: s.rhythm,
      subjects: s.subjects,
      visualReason: s.visualReason,
      cameraReason: s.cameraReason,
      techniques: s.techniques,
      density: s.density,
    })),
    provenance: film.provenance,
    seed: film.seed,
  };
  await writeFile(path.join(outDir, "shot-list.json"), JSON.stringify(shotList, null, 2) + "\n", "utf8");

  // Scene IR is written alongside the specs: it is the renderer-facing layer, and having it
  // on disk is what lets a second renderer (or the GPU spike) work from the same input.
  const sceneIR = compileFilmToSceneIR(v1, film);
  await writeFile(
    path.join(outDir, "scene-ir.json"),
    JSON.stringify(
      {
        irVersion: "1",
        slug: film.slug,
        note: "SceneIR: the lowest complete description of each frame's inputs. Both renderers consume only this.",
        shots: sceneIR.map((s) => ({ ...s, layers: s.layers.map((l) => ({ ...l, primitives: l.primitives.slice(0, 0) })) })),
        primitiveCounts: Object.fromEntries(sceneIR.map((s) => [s.shotId, s.primitiveCount])),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  // A representative single-shot IR with its primitives, for the backend spike and for
  // renderer tests. The full IR above omits primitives because a 20s film's geometry is
  // tens of megabytes; this file is the one to hand to a renderer.
  const firstShot = sceneIR[0];
  if (firstShot) {
    await writeFile(path.join(outDir, "scene-ir-shot.json"), JSON.stringify(firstShot, null, 2) + "\n", "utf8");
  }

  log(`direct ok  slug=${film.slug}  mode=${film.input.mode}  ${film.shots.length} shots  ${options.duration}s`);
  log(`           concepts  ${result.reading.concepts.map((c) => c.id).join(", ") || "(none)"}`);
  log(`           features  arc=${result.reading.features.arcShape} boundary=${result.reading.features.boundaryType} presence=${result.reading.features.presence} reachability=${result.reading.features.reachability} tempo=${result.reading.features.tempo}`);
  log(`           space     ${film.shots[0]?.space.kind} (occlusion ${film.shots[0]?.space.occlusionPolicy})`);
  if (repairs.applied > 0) log(`           repairs   ${repairs.applied} (recorded in provenance.repairs)`);
  for (const s of film.shots) {
    log(`           shot ${s.id} ${s.duration.toFixed(2)}s ${s.narrativeFunction.padEnd(10)} cam=${s.camera.move.kind.padEnd(14)} reason=${s.camera.reason}`);
  }
  log(`           ${path.join(outDir, "film-spec-v2.json")}`);
  log(`           ${path.join(outDir, "film-spec.json")}`);
  return 0;
}

function slugHint(prompt: string): string {
  const ascii = Array.from(prompt.trim()).filter((c) => /[a-z0-9]/i.test(c)).join("").toLowerCase();
  return ascii.length >= 3 ? ascii.slice(0, 24) : `film-${hashString(prompt).toString(36)}`;
}

// ---------------------------------------------------------------------------
// render (engine pass -> grid.bin)
// ---------------------------------------------------------------------------

async function cmdRender(args: Args): Promise<number> {
  const outDir = path.resolve(str(args, "out") ?? "out/loneliness");
  const p = specPaths(outDir);
  const film = await loadFilm(str(args, "film") ?? p.spec);

  const startFrame = num(args, "start-frame", 0)!;
  const endFrame = num(args, "end-frame", totalFrames(film))!;
  const quiet = bool(args, "quiet");

  const res = renderSequence(film, {
    startFrame,
    endFrame,
    onProgress: quiet
      ? undefined
      : (done, total, addr) => {
          if (done === total || done % 30 === 0) {
            process.stdout.write(`\r  rendering ${done}/${total} (shot ${addr.shot.id})   `);
          }
        },
  });
  if (!quiet) process.stdout.write("\n");

  const encoded = encodeGridSequence(res.sequence);
  await ensureDir(outDir);
  await writeFile(p.grid, encoded);

  const summary = gridbinSummary(res.sequence);
  const scenes = res.sceneStats;
  const perShot = film.shots.map((s) => {
    const recs = res.records.filter((r) => r.shotId === s.id);
    const cov = recs.map((r) => r.stats.coveragePreGrade);
    const lit = recs.map((r) => r.stats.litCells);
    const glyphs = recs.map((r) => r.stats.distinctGlyphs);
    return {
      id: s.id,
      title: s.title,
      frames: recs.length,
      firstFrame: recs.length ? recs[0]!.frame : null,
      endFrame: recs.length ? recs[recs.length - 1]!.frame + 1 : null,
      coveragePreGradeMin: Math.min(...cov),
      coveragePreGradeMax: Math.max(...cov),
      litCellsMin: Math.min(...lit),
      litCellsMax: Math.max(...lit),
      distinctGlyphsMin: Math.min(...glyphs),
      distinctGlyphsMax: Math.max(...glyphs),
      densityWindowFirst: recs.length ? recs[0]!.stats.densityWindow : "",
      densityWindowLast: recs.length ? recs[recs.length - 1]!.stats.densityWindow : "",
      cameraDistanceFirst: recs.length ? recs[0]!.stats.cameraDistance : null,
      cameraDistanceLast: recs.length ? recs[recs.length - 1]!.stats.cameraDistance : null,
      sceneDigest: res.sceneDigests[s.id],
      scene: scenes[s.id],
      frameDigests: recs.map((r) => ({ frame: r.frame, digest: r.digest })),
    };
  });

  const manifest = {
    generatedBy: "ascii-cinema engine render",
    slug: film.slug,
    prompt: film.prompt,
    fps: film.fps,
    width: film.width,
    height: film.height,
    durationInSeconds: film.durationInSeconds,
    cellW: film.raster.cellW,
    cellH: film.raster.cellH,
    gridStartFrame: startFrame,
    gridEndFrame: endFrame,
    gridFrameCount: res.frameCount,
    totalFilmFrames: totalFrames(film),
    gridbin: {
      file: path.basename(p.grid),
      ...summary,
      format: "ACGR v1: header, glyph palette, ASCII codes plane, ink plane",
    },
    ramp: film.raster.ramp,
    // The look block travels with the grid so Remotion never needs a second file.
    look: {
      filmGrain: film.look.filmGrain,
      vignette: film.look.vignette,
      chromaticBloom: film.look.chromaticBloom,
      scanlineHz: film.look.scanlineHz,
    },
    elapsedMs: res.elapsedMs,
    perShot,
  };
  await writeFile(p.gridJson, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await writeFile(
    path.join(outDir, "frame-telemetry.json"),
    JSON.stringify(
      {
        slug: film.slug,
        note: "Per-frame engine telemetry. Source of the numbers in render-report.json.",
        frames: res.records.map((r) => ({
          frame: r.frame,
          t: Number(r.timeSeconds.toFixed(4)),
          shot: r.shotId,
          coveragePreGrade: Number(r.stats.coveragePreGrade.toFixed(5)),
          litCells: r.stats.litCells,
          glyphs: r.stats.distinctGlyphs,
          peakInk: Number(r.stats.peakInk.toFixed(4)),
          meanLit: Number(r.stats.fieldMeanLit.toFixed(4)),
          densityWindow: r.stats.densityWindow,
          cameraDistance: Number(r.stats.cameraDistance.toFixed(4)),
          visiblePrimitives: r.stats.visiblePrimitives,
          digest: r.digest,
        })),
      },
      null,
      1,
    ) + "\n",
    "utf8",
  );

  log(`render ok  ${res.frameCount} frames in ${(res.elapsedMs / 1000).toFixed(2)}s`);
  log(`           ${p.grid}  (${(encoded.length / 1e6).toFixed(2)} MB, ${summary.nonBlankCells} non-blank cells)`);
  log(`           ${p.gridJson}`);
  for (const s of perShot) {
    log(
      `           shot ${s.id} ${s.frames}f  coverage ${(s.coveragePreGradeMin * 100).toFixed(2)}%..${(s.coveragePreGradeMax * 100).toFixed(2)}%  glyphs ${s.distinctGlyphsMin}..${s.distinctGlyphsMax}  window "${s.densityWindowFirst}" -> "${s.densityWindowLast}"`,
    );
  }
  return 0;
}

async function loadGrid(p: string): Promise<GridSequence> {
  const buf = await readFile(p);
  const { decodeGridSequence } = await import("../render/gridbin.js");
  return decodeGridSequence(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
}

// ---------------------------------------------------------------------------
// stills + contact sheet
// ---------------------------------------------------------------------------

async function cmdStills(args: Args): Promise<number> {
  const outDir = path.resolve(str(args, "out") ?? "out/loneliness");
  const p = specPaths(outDir);
  const film = await loadFilm(str(args, "film") ?? p.spec);
  const seq = await loadGrid(str(args, "grid") ?? p.grid);

  const cols = num(args, "columns", 4)!;
  const thumbWidth = num(args, "thumb-width", 640)!;
  const thumbHeight = num(args, "thumb-height", 360)!;

  const picks = representativeFrames(film);
  const written: Array<{ file: string; frame: number; label: string; shotId: string; reason: string; bytes: number }> = [];
  const sheetEntries: ContactSheetEntry[] = [];
  await ensureDir(p.stills);

  for (const pick of picks) {
    if (pick.frame < 0 || pick.frame >= seq.frameCount) continue;
    const file = path.join(p.stills, `${pick.label}-f${String(pick.frame).padStart(4, "0")}.png`);
    const bytes = await writeStill(seq, film, pick.frame, file);
    const info = renderFrameAscii(film, pick.frame);
    written.push({
      file: path.relative(outDir, file),
      frame: pick.frame,
      label: pick.label,
      shotId: pick.shot.id,
      reason: pick.reason,
      bytes,
    });
    sheetEntries.push({
      frame: pick.frame,
      label: pick.label,
      shotId: pick.shot.id,
      reason: pick.reason,
      coverage: info.stats.coveragePreGrade,
    });
  }

  const sheet = await writeContactSheet(seq, sheetEntries, p.contact, {
    columns: cols,
    thumbWidth,
    thumbHeight,
    gutter: 10,
    border: 48,
  });

  const manifest = {
    slug: film.slug,
    grid: path.relative(outDir, p.grid),
    contactSheet: path.relative(outDir, p.contact),
    contactSheetLayout: { columns: cols, thumbWidth, thumbHeight, gutter: 10, ...sheet },
    stills: written,
    note: "Frame indices are film-global; the grid.bin offset is added when indexing.",
  };
  await writeFile(path.join(outDir, "stills-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  log(`stills ok  ${written.length} stills -> ${path.relative(process.cwd(), p.stills)}`);
  for (const w of written) log(`           ${w.file}  f=${w.frame} shot=${w.shotId} (${(w.bytes / 1024).toFixed(0)} KB)`);
  log(`contact sheet ok  ${sheet.width}x${sheet.height}  ${(sheet.bytes / 1024).toFixed(0)} KB  -> ${path.relative(process.cwd(), p.contact)}`);
  return 0;
}

// ---------------------------------------------------------------------------
// spool + encode
// ---------------------------------------------------------------------------

async function cmdSpool(args: Args): Promise<number> {
  const outDir = path.resolve(str(args, "out") ?? "out/loneliness");
  const p = specPaths(outDir);
  const film = await loadFilm(str(args, "film") ?? p.spec);
  const seq = await loadGrid(str(args, "grid") ?? p.grid);

  const startFrame = num(args, "start-frame", 0)!;
  const endFrame = num(args, "end-frame", seq.frameCount)!;
  const spoolPath = path.resolve(str(args, "spool") ?? p.spool);

  const res = await writeRawRgbSpool(seq, film, startFrame, endFrame, spoolPath, (done, total) => {
    if (done === total || done % 60 === 0) process.stdout.write(`\r  spooling ${done}/${total}   `);
  });
  process.stdout.write("\n");
  log(`spool ok  ${res.frames} frames  ${(res.bytes / 1e6).toFixed(1)} MB  -> ${path.relative(process.cwd(), res.path)}`);
  return 0;
}

async function cmdEncode(args: Args): Promise<number> {
  const outDir = path.resolve(str(args, "out") ?? "out/loneliness");
  const p = specPaths(outDir);
  const film = await loadFilm(str(args, "film") ?? p.spec);

  const spoolPath = str(args, "spool");
  const outputPath = path.resolve(str(args, "output") ?? p.roughCut);
  const startFrame = num(args, "start-frame", 0)!;
  const endFrame = num(args, "end-frame", totalFrames(film))!;
  const crf = num(args, "crf", 20)!;
  const preset = str(args, "preset", "slow")!;
  const fps = num(args, "fps", film.fps)!;

  await ensureDir(path.dirname(outputPath));

  const { ffmpeg, source, ffmpegVersion, env: toolEnv } = resolveToolchain();
  log(`encoder  ${ffmpeg}`);
  log(`         source=${source}  ${ffmpegVersion.slice(0, 56)}`);

  if (spoolPath) {
    // Explicit spool path: encode the file on disk (kept for debugging a fixed
    // frame range that was already materialised).
    const resolved = path.resolve(spoolPath);
    const spoolSize = await fileSize(resolved);
    const frameBytes = film.width * film.height * 3;
    const spoolFrames = Math.floor(spoolSize / frameBytes);
    if (spoolFrames <= 0) throw new Error(`spool ${resolved} contains no complete frames (size ${spoolSize})`);
    const res = await encodeRawRgbToMp4({
      ffmpeg,
      inputPath: resolved,
      outputPath,
      width: film.width,
      height: film.height,
      fps,
      crf,
      preset,
      inputFrameCount: spoolFrames,
      env: toolEnv,
    });
    if (!bool(args, "keep-spool")) await removeQuietly(resolved);
    const size = await fileSize(outputPath);
    log(`encode ok  ${path.relative(process.cwd(), outputPath)}  ${(size / 1e6).toFixed(2)} MB  ${spoolFrames} frames`);
    void res;
    return 0;
  }

  // Default path: stream frames straight from the engine into ffmpeg. No temp file,
  // flat memory, and the encoder sees exactly `endFrame - startFrame` frames.
  const seq = await loadGrid(str(args, "grid") ?? p.grid);
  if (endFrame > seq.frameCount) {
    throw new Error(`requested end-frame ${endFrame} exceeds grid frames ${seq.frameCount}`);
  }
  const expected = endFrame - startFrame;
  if (expected <= 0) throw new Error(`empty frame range ${startFrame}..${endFrame}`);

  const stream = pngFrameStream(seq, film, startFrame, endFrame);
  const res = await encodeRgbStreamToMp4({
    ffmpeg,
    input: stream,
    outputPath,
    width: film.width,
    height: film.height,
    fps,
    crf,
    preset,
    expectedFrames: expected,
    inputFormat: "png",
    env: toolEnv,
  });
  const size = await fileSize(outputPath);
  log(`encode ok  ${path.relative(process.cwd(), outputPath)}  ${(size / 1e6).toFixed(2)} MB  ${res.frames} frames  crf=${crf} preset=${preset}`);
  return 0;
}

// ---------------------------------------------------------------------------
// probe + verify
// ---------------------------------------------------------------------------

async function cmdProbe(args: Args): Promise<number> {
  const outDir = path.resolve(str(args, "out") ?? "out/loneliness");
  const p = specPaths(outDir);
  const file = path.resolve(str(args, "file") ?? p.roughCut);
  const { ffprobe, env: toolEnv } = resolveToolchain();

  const data = await ffprobeJson(ffprobe, file, toolEnv);
  const stream = data.streams?.[0] ?? {};
  const format = data.format ?? {};
  const frames = data.frames ?? [];

  const summary = {
    file: path.relative(process.cwd(), file),
    bytes: Number(format.size ?? 0),
    durationSeconds: Number(format.duration ?? 0),
    bitrate: Number(format.bit_rate ?? 0),
    codecName: stream.codec_name,
    codecLongName: stream.codec_long_name,
    profile: stream.profile,
    level: stream.level,
    pixFmt: stream.pix_fmt,
    width: stream.width,
    height: stream.height,
    rFrameRate: stream.r_frame_rate,
    avgFrameRate: stream.avg_frame_rate,
    nbFramesFromProbe: stream.nb_frames ? Number(stream.nb_frames) : null,
    probedFrameCount: frames.length,
    firstPts: frames.length ? frames[0].pts_time : null,
    lastPts: frames.length ? frames[frames.length - 1].pts_time : null,
    keyFrames: frames.filter((f: any) => f.key_frame === 1).length,
  };
  const outPath = path.join(outDir, "probe.json");
  await writeFile(outPath, JSON.stringify({ summary, full: data }, null, 2) + "\n", "utf8");

  log(`probe ok  ${summary.file}`);
  log(
    `          ${summary.codecName} ${summary.profile} L${summary.level}  ${summary.width}x${summary.height}  ${summary.pixFmt}  ${summary.rFrameRate} fps`,
  );
  log(
    `          frames=${summary.probedFrameCount}  keyframes=${summary.keyFrames}  duration=${summary.durationSeconds.toFixed(3)}s  ${(summary.bytes / 1e6).toFixed(2)} MB`,
  );
  log(`          ${path.relative(process.cwd(), outPath)}`);
  return 0;
}

interface VerifyResult {
  file: string;
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  decodedFrames: number;
  decodedSeconds: number;
  corruptFrames: number;
}

async function verifyFile(film: FilmSpec, file: string, expectedFramesOverride?: number): Promise<VerifyResult> {
  const { ffprobe, ffmpeg, env: toolEnv } = resolveToolchain();
  const checks: VerifyResult["checks"] = [];

  const data = await ffprobeJson(ffprobe, file, toolEnv);
  const stream = data.streams?.[0] ?? {};
  const format = data.format ?? {};
  const frames: any[] = data.frames ?? [];
  const expectedFrames = expectedFramesOverride ?? Math.round(film.durationInSeconds * film.fps);

  const push = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  push("container readable", Boolean(format.format_name), String(format.format_name ?? "?"));
  push("video stream present", Boolean(stream.codec_name), String(stream.codec_name ?? "none"));
  push("codec is h264", stream.codec_name === "h264", String(stream.codec_name));
  push("pixel format yuv420p", stream.pix_fmt === "yuv420p", String(stream.pix_fmt));
  push("width matches spec", stream.width === film.width, `${stream.width} vs ${film.width}`);
  push("height matches spec", stream.height === film.height, `${stream.height} vs ${film.height}`);
  push("frame rate matches spec", stream.r_frame_rate === `${film.fps}/1`, `${stream.r_frame_rate} vs ${film.fps}/1`);
  push(
    "frame count matches spec",
    frames.length === expectedFrames,
    `${frames.length} vs ${expectedFrames}`,
  );
  const dur = Number(format.duration ?? 0);
  const expectedDuration = expectedFrames / film.fps;
  push(
    "duration matches frame count",
    Math.abs(dur - expectedDuration) < 0.5,
    `${dur.toFixed(3)}s vs ${expectedDuration.toFixed(3)}s`,
  );
  push("has keyframes", frames.some((f) => f.key_frame === 1), `${frames.filter((f) => f.key_frame === 1).length} keyframes`);
  push("starts at t=0", frames.length > 0 && Number(frames[0].pts_time) < 0.02, `first pts ${frames[0]?.pts_time}`);
  push(
    "audio absent (visual-only film)",
    !(data.streams ?? []).some((s: any) => s.codec_type === "audio"),
    "no audio stream",
  );

  // The decisive gate: decode every frame's bitstream to raw pixels and discard.
  const decode = await fullDecodeCheck({
    ffmpeg,
    file,
    expectedWidth: film.width,
    expectedHeight: film.height,
    expectedFps: film.fps,
    env: toolEnv,
  });
  push(
    "full decode (every frame)",
    decode.ok,
    `${decode.decodedFrames} frames, ${decode.decodedSeconds.toFixed(3)}s, ${decode.corruptFrames} corrupt reports`,
  );
  push(
    "decoded frame count equals encoded",
    decode.decodedFrames === expectedFrames,
    `${decode.decodedFrames} vs ${expectedFrames}`,
  );

  const ok = checks.every((c) => c.ok);
  return {
    file,
    ok,
    checks,
    decodedFrames: decode.decodedFrames,
    decodedSeconds: decode.decodedSeconds,
    corruptFrames: decode.corruptFrames,
  };
}

async function cmdVerify(args: Args): Promise<number> {
  const outDir = path.resolve(str(args, "out") ?? "out/loneliness");
  const p = specPaths(outDir);
  const film = await loadFilm(str(args, "film") ?? p.spec);
  const file = path.resolve(str(args, "file") ?? p.roughCut);

  const expectedFrames = num(args, "expected-frames");
  const res = await verifyFile(film, file, expectedFrames);
  await ensureDir(outDir);
  await writeFile(
    path.join(outDir, "verify.json"),
    JSON.stringify({ ...res, file: path.relative(outDir, file) }, null, 2) + "\n",
    "utf8",
  );

  log(`verify  ${path.relative(process.cwd(), file)}`);
  for (const c of res.checks) log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(34)} ${c.detail}`);
  log(`  => ${res.ok ? "PASS" : "FAIL"}`);
  return res.ok ? 0 : 1;
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

async function cmdReport(args: Args): Promise<number> {
  const outDir = path.resolve(str(args, "out") ?? "out/loneliness");
  const p = specPaths(outDir);
  const film = await loadFilm(str(args, "film") ?? p.spec);

  const readIf = async <T>(f: string): Promise<T | null> => {
    try {
      return await readJson<T>(f);
    } catch {
      return null;
    }
  };

  const gridManifest = await readIf<any>(p.gridJson);
  const stillsManifest = await readIf<any>(path.join(outDir, "stills-manifest.json"));
  const probe = await readIf<any>(path.join(outDir, "probe.json"));
  const verify = await readIf<any>(path.join(outDir, "verify.json"));
  const motionVerify = await readIf<any>(path.join(p.motion, "verify.json"));
  const motionProbe = await readIf<any>(path.join(p.motion, "probe.json"));
  const remotionFile = path.join(outDir, "remotion-rough-cut.mp4");
  const remotionSize = await fileSize(remotionFile);
  let remotionInfo: any = null;
  if (remotionSize > 0) {
    try {
      const { ffprobe: probeBin, env: probeEnv } = resolveToolchain();
      const d = await ffprobeJson(probeBin, remotionFile, probeEnv);
      const v = d.streams?.[0] ?? {};
      remotionInfo = {
        file: "remotion-rough-cut.mp4",
        bytes: remotionSize,
        codecName: v.codec_name,
        width: v.width,
        height: v.height,
        pixFmt: v.pix_fmt,
        rFrameRate: v.r_frame_rate,
        durationSeconds: Number(d.format?.duration ?? 0),
        probedFrameCount: (d.frames ?? []).length,
      };
    } catch {
      remotionInfo = { file: "remotion-rough-cut.mp4", bytes: remotionSize, error: "probe failed" };
    }
  }

  const { ffmpeg, ffprobe, source, ffmpegVersion, ffprobeVersion } = resolveToolchain();

  const range = shotRanges(film);
  const techniquesRequired = [
    "push-in",
    "lateral-camera-move",
    "depth-parallax",
    "particle-field",
    "glyph-density-transformation",
    "assemble",
    "dissolve",
  ];
  const covered = new Set(film.shots.flatMap((s) => s.techniques));
  const techniqueAudit = techniquesRequired.map((t) => ({
    technique: t,
    covered: covered.has(t),
    shots: film.shots.filter((s) => s.techniques.includes(t)).map((s) => s.id),
  }));

  const stills = stillsManifest?.stills ?? [];
  const report = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    engine: {
      name: "ascii-cinema",
      version: film.version,
      pipeline: ["Prompt", "FilmSpec", "ShotSpec", "Scene", "ASCII render", "Camera", "Remotion", "MP4"],
    },
    input: {
      prompt: film.prompt,
      tokens: film.derivation.tokens,
      matchedConcepts: film.derivation.matchedConcepts,
      structure: film.derivation.structure,
      constraints: film.derivation.constraints,
      defaultsApplied: film.derivation.defaultsApplied,
    },
    outputSpec: {
      width: film.width,
      height: film.height,
      fps: film.fps,
      durationInSeconds: film.durationInSeconds,
      aspect: film.aspect,
      quality: film.quality,
      totalFrames: totalFrames(film),
      background: film.look.background,
      foreground: film.look.foreground,
      visualLanguage: "ASCII only (printable ASCII 0x20-0x7E)",
    },
    raster: {
      cols: film.raster.cols,
      rows: film.raster.rows,
      cellW: film.raster.cellW,
      cellH: film.raster.cellH,
      glyphVocabulary: film.raster.ramp,
      glyphVocabularySize: new Set(film.raster.ramp).size,
    },
    seed: film.seed,
    determinism: {
      note: "Every stochastic process is seeded from the FilmSpec seed; a re-render must reproduce these digests exactly.",
      sceneDigests: Object.fromEntries((gridManifest?.perShot ?? []).map((s: any) => [s.id, s.sceneDigest])),
      frameDigestSamples: (gridManifest?.perShot ?? []).flatMap((s: any) =>
        (s.frameDigests ?? []).filter((_: any, i: number) => i % 30 === 0).map((f: any) => ({ shot: s.id, ...f })),
      ),
    },
    techniqueAudit,
    techniqueAuditPass: techniqueAudit.every((t) => t.covered),
    shots: (gridManifest?.perShot ?? []).map((s: any) => {
      const spec = film.shots.find((x) => x.id === s.id)!;
      const r = range.find((x) => x.shot.id === s.id)!;
      return {
        id: s.id,
        title: spec.title,
        intent: spec.intent,
        timeRange: { start: spec.start, end: spec.start + spec.duration },
        frameRange: { first: r.firstFrame, end: r.endFrame },
        camera: spec.camera,
        cameraDistance: { first: s.cameraDistanceFirst, last: s.cameraDistanceLast },
        density: spec.density,
        densityWindow: { first: s.densityWindowFirst, last: s.densityWindowLast },
        techniques: spec.techniques,
        coveragePreGrade: { min: s.coveragePreGradeMin, max: s.coveragePreGradeMax },
        litCells: { min: s.litCellsMin, max: s.litCellsMax },
        distinctGlyphs: { min: s.distinctGlyphsMin, max: s.distinctGlyphsMax },
        scene: s.scene,
        sceneDigest: s.sceneDigest,
      };
    }),
    stills: { count: stills.length, contactSheet: stillsManifest?.contactSheet ?? null, files: stills.map((s: any) => s.file) },
    remotionPath: remotionInfo,
    motionTests: motionProbe
      ? {
          files: [motionProbe.summary?.file].filter(Boolean),
          probe: motionProbe.summary,
          verify: motionVerify ?? null,
        }
      : null,
    artifacts: {
      filmSpec: "film-spec.json",
      shotList: "shot-list.json",
      gridBin: "grid.bin",
      gridManifest: "grid-manifest.json",
      frameTelemetry: "frame-telemetry.json",
      stillsDir: "stills/",
      contactSheet: stillsManifest?.contactSheet ?? "contact-sheet.png",
      motionTestsDir: "motion-tests/",
      roughCut: "rough-cut.mp4",
      remotionRoughCut: remotionInfo ? "remotion-rough-cut.mp4" : null,
      probe: probe ? "probe.json" : null,
      verify: verify ? "verify.json" : null,
      report: "render-report.json",
    },
    roughCut: probe
      ? {
          file: "rough-cut.mp4",
          bytes: await fileSize(p.roughCut),
          probe: probe.summary,
          verify: verify
            ? {
                ok: verify.ok,
                checks: verify.checks,
                decodedFrames: verify.decodedFrames,
                decodedSeconds: verify.decodedSeconds,
                corruptFrames: verify.corruptFrames,
              }
            : null,
        }
      : null,
    tools: {
      ffmpeg: { path: ffmpeg, source, version: ffmpegVersion },
      ffprobe: { path: ffprobe, version: ffprobeVersion },
      remotion: "4.0.532",
    },
    gates: {
      typecheck: bool(args, "typecheck-ok", false) ? "PASS" : "NOT_RECORDED",
      build: bool(args, "build-ok", false) ? "PASS" : "NOT_RECORDED",
      stillsRendered: stills.length > 0,
      contactSheetRendered: Boolean(stillsManifest?.contactSheet),
      motionTestsRendered: Boolean(motionVerify?.ok),
      roughCutEncoded: Boolean(probe),
      roughCutProbed: Boolean(probe?.summary),
      roughCutFullyDecoded: Boolean(verify?.ok),
      remotionRendered: Boolean(remotionInfo && !remotionInfo.error),
    },
  };

  // The single most important line in the report: a rough cut only passes when it
  // decodes end to end.
  (report.gates as any).phase1 = verify?.ok ? "PASS" : probe ? "PARTIAL" : "FAIL";

  await writeFile(p.report, JSON.stringify(report, null, 2) + "\n", "utf8");
  log(`report ok  ${path.relative(process.cwd(), p.report)}`);
  log(`           technique audit: ${report.techniqueAuditPass ? "all present" : "MISSING " + techniqueAudit.filter((t) => !t.covered).map((t) => t.technique).join(", ")}`);
  log(`           rough cut decode: ${verify?.ok ? "PASS" : "NOT VERIFIED"}`);
  log(`           PHASE 1 = ${(report.gates as any).phase1}`);
  return 0;
}

// ---------------------------------------------------------------------------
// entry
// ---------------------------------------------------------------------------

const USAGE = `ascii-cinema engine

  direct      prompt -> FilmSpec v2 (Director Agent), then compile to v1
                <prompt> --out DIR [--seconds N] [--fps N] [--mode word|sentence|script|director-brief]
  plan        prompt -> film-spec.json + shot-list.json  (Phase 1 v1 planner)
                --prompt <text> [--seconds N] [--width N] [--height N] [--fps N]
                [--seed N] [--quality draft|standard|high] [--aspect 16:9] [--out DIR]
  render      film-spec.json -> grid.bin + grid-manifest.json + frame-telemetry.json
                --film <spec> --out DIR [--start-frame N] [--end-frame N]
  stills      representative stills + contact-sheet.png
                --film <spec> --grid <bin> --out DIR [--columns N]
  spool       raw RGB24 spool for a frame range
                --film <spec> --grid <bin> --out DIR [--start-frame N] [--end-frame N] [--spool FILE]
  encode      spool -> MP4
                --film <spec> --spool FILE --output FILE [--crf N] [--preset NAME] [--keep-spool]
  probe       ffprobe metadata for a file
                --file <mp4> --out DIR
  verify      ffprobe + full decode gate
                --film <spec> --file <mp4> --out DIR
  report      assemble render-report.json
                --film <spec> --out DIR [--typecheck-ok] [--build-ok]
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "direct":
      return cmdDirect(args);
    case "plan":
      return cmdPlan(args);
    case "render":
      return cmdRender(args);
    case "stills":
      return cmdStills(args);
    case "spool":
      return cmdSpool(args);
    case "encode":
      return cmdEncode(args);
    case "probe":
      return cmdProbe(args);
    case "verify":
      return cmdVerify(args);
    case "report":
      return cmdReport(args);
    case "":
    case "help":
    case "--help":
      process.stdout.write(USAGE);
      return 0;
    default:
      process.stderr.write(`unknown command: ${args.command}\n\n${USAGE}`);
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`\nERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    if (err instanceof Error && err.stack && process.env.ASCII_DEBUG) {
      process.stderr.write(err.stack + "\n");
    }
    process.exit(1);
  });
