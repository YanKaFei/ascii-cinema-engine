#!/usr/bin/env node
/**
 * Phase 2 benchmark gate.
 *
 *   npm run benchmarks
 *
 * Renders the four Phase 2 benchmarks end to end and asserts that each one survives the
 * whole chain:
 *
 *   prompt -> director (mode-specific) -> FilmSpec v2 -> validate -> SceneIR -> grid.bin
 *          -> mp4 -> ffprobe -> FULL DECODE
 *
 * WHY THE DECODE IS THE DECISIVE GATE: every earlier stage can claim success while producing
 * a film nobody can play. Phase 1 learned this the hard way (the `startFrame` bug made all
 * five motion samples byte-identical while every unit test passed). A film is only finished
 * when every frame decodes with zero corrupt reports and the decoded count matches the
 * encoded count.
 *
 * The four benchmarks are deliberately different INPUT MODES, because the claim under test is
 * that the system generalises across modes rather than across four hand-tuned prompts:
 *
 *   desire              WORD           a single concept, no events
 *   forgotten-name      SENTENCE       one proposition with an event
 *   disappearing-room   SCRIPT         several events, a sequence
 *   time                ABSTRACT WORD  a concept with no body at all
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENGINE = path.join(ROOT, "dist", "src", "cli", "engine.js");
const OUT = path.join(ROOT, "out", "benchmarks");

const DURATION = 20;
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

/** The four rendered benchmarks. `dir` is fixed so paths are stable across runs. */
export const BENCHMARKS = [
  { dir: "desire", mode: "word", label: "欲望", prompt: "欲望" },
  {
    dir: "forgotten-name",
    mode: "sentence",
    label: "forgotten name",
    prompt: "我醒来以后，发现所有人都忘记了我的名字。",
  },
  {
    dir: "disappearing-room",
    mode: "script",
    label: "disappearing room",
    prompt: "一个男人走进空房间，发现墙上写着自己的名字。他伸手擦掉名字，整个房间也随之消失。",
  },
  { dir: "time", mode: "word", label: "时间", prompt: "时间" },
];

/**
 * A DIRECTOR BRIEF: explicit production language rather than a story.
 *
 * This is the fourth input MODE and it is validated rather than rendered: its point is that
 * production constraints are honoured as constraints, not interpreted as content. Rendering it
 * would not test anything the other four do not already test, so it is checked at the
 * classification and specification level and reported in the diversity report.
 */
export const DIRECTOR_BRIEF = {
  dir: "brief-lockdown",
  mode: "director-brief",
  label: "director brief",
  prompt:
    "shot 1: 5 seconds, 1920x1080, 30fps, no dialogue, must be silent, no camera movement. " +
    "shot 2: 6 seconds, slow push-in. shot 3: 9 seconds, dissolve to black.",
};

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

async function run(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENGINE, ...args], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`stage "${label}" exited ${code}\n${out}\n${err}`));
        return;
      }
      resolve({ out, err });
    });
  });
}

const results = [];
function gate(name, ok, detail) {
  results.push({ name, ok, detail });
  process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(48)} ${detail}\n`);
}

/** Render one benchmark through the whole chain. */
async function renderBenchmark(bench) {
  const dir = path.join(OUT, bench.dir);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  log(`\n=== ${bench.dir}  [${bench.mode}]  "${bench.prompt.slice(0, 46)}"`);

  // ---- 1. direct ---------------------------------------------------------------
  await run(
    ["direct", bench.prompt, "--out", dir, "--seconds", String(DURATION), "--fps", String(FPS), "--width", String(WIDTH), "--height", String(HEIGHT)],
    "direct",
  );

  const filmV2 = JSON.parse(await readFile(path.join(dir, "film-spec-v2.json"), "utf8"));
  const filmV1 = JSON.parse(await readFile(path.join(dir, "film-spec.json"), "utf8"));
  const shotList = JSON.parse(await readFile(path.join(dir, "shot-list.json"), "utf8"));

  gate(`${bench.dir}: mode is ${bench.mode}`, filmV2.input.mode === bench.mode, filmV2.input.mode);
  gate(`${bench.dir}: produces a valid v2 spec`, filmV2.version === "2" && Array.isArray(filmV2.shots) && filmV2.shots.length > 0, `${filmV2.shots.length} shots`);

  // Every shot must justify itself. This is gate N/O enforced on real output.
  const noReason = filmV2.shots.filter((s) => !s.camera?.reasonDetail || String(s.camera.reasonDetail).trim().length < 20);
  gate(`${bench.dir}: every camera move has a reason`, noReason.length === 0, `${filmV2.shots.length - noReason.length}/${filmV2.shots.length}`);
  const noFunction = filmV2.shots.filter((s) => !s.narrativeFunction);
  gate(`${bench.dir}: every shot has a narrativeFunction`, noFunction.length === 0, `${filmV2.shots.length - noFunction.length}/${filmV2.shots.length}`);
  const noIntention = filmV2.shots.filter((s) => !s.intention || String(s.intention).trim().length < 20);
  gate(`${bench.dir}: every shot states an intention`, noIntention.length === 0, `${filmV2.shots.length - noIntention.length}/${filmV2.shots.length}`);

  // ---- 2. render (the engine pass) ---------------------------------------------
  await run(["render", "--film", path.join(dir, "film-spec.json"), "--out", dir, "--quiet"], "render");

  // ---- 3. encode ---------------------------------------------------------------
  const mp4 = path.join(dir, "rough-cut.mp4");
  const totalFrames = filmV1.totalFrames ?? Math.round(DURATION * FPS);
  await run(
    [
      "encode",
      "--film", path.join(dir, "film-spec.json"),
      "--grid", path.join(dir, "grid.bin"),
      "--output", mp4,
      "--out", dir,
      "--start-frame", "0",
      "--end-frame", String(totalFrames),
      "--crf", "18",
      "--preset", "slow",
    ],
    "encode",
  );

  // ---- 4. probe -----------------------------------------------------------------
  await run(["probe", "--file", mp4, "--out", dir], "probe");
  const probe = JSON.parse(await readFile(path.join(dir, "probe.json"), "utf8")).summary;

  gate(`${bench.dir}: container is h264`, probe.codecName === "h264", String(probe.codecName));
  gate(`${bench.dir}: resolution is 1920x1080`, probe.width === WIDTH && probe.height === HEIGHT, `${probe.width}x${probe.height}`);
  gate(`${bench.dir}: frame rate is 30/1`, probe.rFrameRate === "30/1", String(probe.rFrameRate));
  gate(`${bench.dir}: frame count is ${totalFrames}`, probe.probedFrameCount === totalFrames, String(probe.probedFrameCount));
  gate(
    `${bench.dir}: duration is ${DURATION}.000s`,
    Math.abs(probe.durationSeconds - DURATION) < 1e-6,
    `${probe.durationSeconds}s`,
  );

  // ---- 5. THE DECISIVE GATE: full decode ---------------------------------------
  await run(
    [
      "verify",
      "--film", path.join(dir, "film-spec.json"),
      "--file", mp4,
      "--out", dir,
      "--expected-frames", String(totalFrames),
    ],
    "verify",
  );
  const verify = JSON.parse(await readFile(path.join(dir, "verify.json"), "utf8"));
  gate(`${bench.dir}: EVERY FRAME DECODES`, verify.ok === true, `${verify.decodedFrames} frames, ${verify.corruptFrames} corrupt`);
  gate(`${bench.dir}: decoded count equals encoded`, verify.decodedFrames === totalFrames, `${verify.decodedFrames} == ${totalFrames}`);

  return { bench, filmV2, filmV1, shotList, probe, verify };
}

/** The DIRECTOR-BRIEF mode: validated for constraint handling, not rendered. */
async function checkDirectorBrief() {
  const dir = path.join(OUT, DIRECTOR_BRIEF.dir);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  log(`\n=== ${DIRECTOR_BRIEF.dir}  [${DIRECTOR_BRIEF.mode}]  (validated, not rendered)`);
  await run(
    ["direct", DIRECTOR_BRIEF.prompt, "--out", dir, "--seconds", "20", "--fps", "30", "--width", "1920", "--height", "1080"],
    "direct(brief)",
  );
  const filmV2 = JSON.parse(await readFile(path.join(dir, "film-spec-v2.json"), "utf8"));
  gate(
    `${DIRECTOR_BRIEF.dir}: mode is director-brief`,
    filmV2.input.mode === DIRECTOR_BRIEF.mode,
    filmV2.input.mode,
  );
  gate(
    `${DIRECTOR_BRIEF.dir}: produces a valid v2 spec`,
    filmV2.version === "2" && filmV2.shots.length > 0,
    `${filmV2.shots.length} shots`,
  );
  return { bench: DIRECTOR_BRIEF, filmV2 };
}

async function main() {
  log("PHASE 2 BENCHMARKS");
  log(`  out=${path.relative(ROOT, OUT)}  ${WIDTH}x${HEIGHT} ${FPS}fps ${DURATION}s draft`);

  const rendered = [];
  for (const b of BENCHMARKS) rendered.push(await renderBenchmark(b));
  const brief = await checkDirectorBrief();

  // ---- no benchmark-specific conditional anywhere in the director ---------------
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const offenders = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const full = path.join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".ts")) {
        if (full.endsWith("knowledge.ts") || full.endsWith("preset-loneliness-v2.ts")) continue;
        const src = readFileSync(full, "utf8");
        for (const m of src.matchAll(/\b(?:prompt|raw|input|text)\s*===\s*["'`]/g)) offenders.push(`${path.relative(ROOT, full)}: ${m[0]}`);
      }
    }
  };
  walk(path.join(ROOT, "src", "director"));
  walk(path.join(ROOT, "src", "domain"));
  gate("no benchmark-specific conditional exists", offenders.length === 0, offenders.length ? offenders.join("; ") : "0 found in src/director + src/domain");

  // ---- structural diversity across the rendered films ---------------------------
  const signatures = rendered.map(({ bench, filmV2 }) => ({
    dir: bench.dir,
    mode: bench.mode,
    shots: filmV2.shots.length,
    space: filmV2.shots[0]?.space?.kind,
    boundary: filmV2.interpretation?.spaceKind,
    arc: filmV2.interpretation?.emotionalArc,
    cameras: [...new Set(filmV2.shots.map((s) => s.camera.move.kind))],
    compositions: [...new Set(filmV2.shots.map((s) => s.composition.primary))],
    transformations: [...new Set(filmV2.shots.filter((s) => s.transformation).map((s) => s.transformation.kind))],
  }));
  const uniqueSigs = new Set(signatures.map((s) => JSON.stringify({ space: s.space, shots: s.shots, cameras: s.cameras, comps: s.compositions })));
  gate("four films have four distinct structural signatures", uniqueSigs.size === 4, `${uniqueSigs.size}/4 distinct`);
  const spaces = new Set(signatures.map((s) => s.space));
  gate("films differ in space kind", spaces.size >= 3, [...spaces].join(", "));
  const shotCounts = new Set(signatures.map((s) => s.shots));
  gate("films differ in shot count", shotCounts.size >= 2, [...shotCounts].join(", "));

  const total = results.length;
  const failed = results.filter((r) => !r.ok);
  log(`\n${total - failed.length}/${total} gates passed`);

  await writeFile(
    path.join(OUT, "benchmark-report.json"),
    JSON.stringify(
      {
        generatedFor: "phase-2 gate 2D",
        format: { width: WIDTH, height: HEIGHT, fps: FPS, duration: DURATION, quality: "draft" },
        benchmarks: rendered.map(({ bench, filmV2, shotList, probe, verify }) => ({
          dir: bench.dir,
          mode: bench.mode,
          prompt: bench.prompt,
          slug: filmV2.slug,
          shots: filmV2.shots.length,
          shotIds: filmV2.shots.map((s) => s.id),
          durations: filmV2.shots.map((s) => Number(s.duration.toFixed(3))),
          spaceKind: filmV2.shots[0]?.space?.kind,
          cameras: shotList.shots.map((s) => ({ id: s.id, kind: s.camera.move.kind, reason: s.camera.reason })),
          techniques: [...new Set(filmV2.shots.flatMap((s) => s.techniques ?? []))].sort(),
          probe: { codec: probe.codecName, frames: probe.probedFrameCount, duration: probe.durationSeconds, bytes: probe.bytes ?? null },
          decode: { ok: verify.ok, decodedFrames: verify.decodedFrames, corruptFrames: verify.corruptFrames },
        })),
        directorBrief: { dir: brief.bench.dir, mode: brief.bench.mode, shots: brief.filmV2.shots.length, rendered: false, why: "the brief's claim is constraint handling, not imagery" },
        gates: results,
        pass: failed.length === 0,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  log(`  ${path.relative(ROOT, path.join(OUT, "benchmark-report.json"))}`);

  if (failed.length > 0) {
    log("\nFAILURES:");
    for (const f of failed) log(`  [${f.name}] ${f.detail}`);
    process.exit(1);
  }
  log("\nPHASE 2 BENCHMARKS = PASS");
}

// Only run the gate when invoked directly, so `diversity-report.mjs` can import BENCHMARKS.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]).endsWith("benchmarks.mjs");
if (invokedDirectly) {
  main().catch((e) => {
    process.stderr.write(`${e.stack ?? e}\n`);
    process.exit(1);
  });
}
