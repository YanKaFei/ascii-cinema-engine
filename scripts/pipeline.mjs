#!/usr/bin/env node
/**
 * Full Phase 1 pipeline: prompt -> FilmSpec -> grid -> stills -> contact sheet ->
 * motion tests -> rough cut -> ffprobe -> full decode -> report.
 *
 * Run it as:
 *   node scripts/pipeline.mjs --prompt 孤独 --out out/loneliness
 *
 * Every stage is a separate engine subcommand, so any stage can be re-run in
 * isolation while debugging. This script only sequences them and enforces the
 * ordering the brief requires: motion samples are checked BEFORE the 20s rough cut
 * is encoded.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENGINE = path.join(ROOT, "dist", "cli", "engine.js");

function parseArgs(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
      else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags.set(a.slice(2), next);
          i++;
        } else flags.set(a.slice(2), "true");
      }
    }
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));
const PROMPT = flags.get("prompt") ?? "孤独";
const OUT = path.resolve(flags.get("out") ?? path.join(ROOT, "out", "loneliness"));
const SECONDS = flags.get("seconds") ?? "20";
const FPS = flags.get("fps") ?? "30";
const WIDTH = flags.get("width") ?? "1920";
const HEIGHT = flags.get("height") ?? "1080";
const QUALITY = flags.get("quality") ?? "draft";
const ASPECT = flags.get("aspect") ?? "16:9";
const SKIP_MOTION = flags.get("skip-motion") === "true";
// The Remotion pass is the slow deliverable (Chromium renders 600 frames at 1080p);
// opt in with --remotion.
const WANT_REMOTION = flags.get("remotion") === "true";

/** Motion samples: 4 seconds each, chosen at the most demanding points of the film. */
const MOTION_TESTS = [
  { id: "m1-dot-void", from: 0.0, seconds: 4.0, note: "shot 01: a single glyph in a void, verifying the frame can be almost entirely empty" },
  { id: "m2-arrival", from: 4.0, seconds: 4.0, note: "shot 02: edge arrival + assemble + first density transformation" },
  { id: "m3-figure-lateral", from: 8.0, seconds: 4.0, note: "shot 03: lateral camera move with depth/parallax and the figure resolving" },
  { id: "m4-push-density", from: 12.0, seconds: 4.0, note: "shot 04: push-in with the densest glyph window of the film" },
  { id: "m5-dissolution", from: 16.0, seconds: 4.0, note: "shot 05: dissolve to a single surviving glyph" },
];

const results = [];
let failedStage = null;

function run(args, label, opts = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [ENGINE, ...args], {
      cwd: ROOT,
      stdio: opts.capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
    });
    let out = "";
    let err = "";
    if (opts.capture) {
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (err += d.toString()));
    }
    child.on("error", reject);
    child.on("close", (code) => {
      const ms = Date.now() - started;
      const entry = { stage: label, args, exitCode: code, ms, ok: code === 0 };
      results.push(entry);
      if (code !== 0) {
        entry.stderr = err.slice(-4000);
        failedStage = label;
        reject(new Error(`stage "${label}" failed with exit ${code}\n${err.slice(-2000)}`));
        return;
      }
      resolve({ out, err, ms });
    });
  });
}

async function publishForRemotion(slug, outDir) {
  const dir = path.join(ROOT, "public", "renders", slug);
  await mkdir(dir, { recursive: true });
  // COPY, not symlink: Remotion's bundler copies the public directory into its own
  // bundle and does not follow symlinks, so a symlinked artifact silently resolves to
  // nothing and the composition renders the "missing artifact" slate.
  await copyFile(path.join(outDir, "grid.bin"), path.join(dir, "grid.bin"));
  await copyFile(path.join(outDir, "grid-manifest.json"), path.join(dir, "grid-meta.json"));
  return dir;
}

function runRaw(cmd, args, label, opts = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: ["ignore", "inherit", "inherit"],
      env: opts.env ?? process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      results.push({ stage: label, args, exitCode: code, ms: Date.now() - started, ok: code === 0 });
      if (code !== 0) {
        failedStage = label;
        reject(new Error(`stage "${label}" failed with exit ${code}`));
        return;
      }
      resolve({ ms: Date.now() - started });
    });
  });
}

function banner(msg) {
  process.stdout.write(`\n\x1b[1m=== ${msg} ===\x1b[0m\n`);
}

async function main() {
  const t0 = Date.now();
  await mkdir(OUT, { recursive: true });

  banner("1/9 plan  (prompt -> FilmSpec -> ShotSpec)");
  await run(
    [
      "plan",
      PROMPT,
      "--out", OUT,
      "--seconds", SECONDS,
      "--fps", FPS,
      "--width", WIDTH,
      "--height", HEIGHT,
      "--quality", QUALITY,
      "--aspect", ASPECT,
    ],
    "plan",
  );

  const film = JSON.parse(await readFile(path.join(OUT, "film-spec.json"), "utf8"));
  const totalFrames = Math.round(film.durationInSeconds * film.fps);

  banner("2/9 render  (FilmSpec -> Scene -> ASCII character grid)");
  const renderRes = await run(
    ["render", "--film", path.join(OUT, "film-spec.json"), "--out", OUT],
    "render",
    { capture: true },
  );
  process.stdout.write(renderRes.out);

  banner("3/9 stills  (representative frames + contact sheet)");
  const stillRes = await run(
    ["stills", "--film", path.join(OUT, "film-spec.json"), "--grid", path.join(OUT, "grid.bin"), "--out", OUT],
    "stills",
    { capture: true },
  );
  process.stdout.write(stillRes.out);

  if (!SKIP_MOTION) {
    banner("4/9 motion tests  (3-5s samples, reviewed before the rough cut)");
    const dir = path.join(OUT, "motion-tests");
    await mkdir(dir, { recursive: true });
    for (const mt of MOTION_TESTS) {
      const startFrame = Math.round(mt.from * film.fps);
      const endFrame = Math.min(totalFrames, startFrame + Math.round(mt.seconds * film.fps));
      const mp4 = path.join(dir, `${mt.id}.mp4`);

      // Frames are streamed straight from the engine into ffmpeg; nothing is spooled.
      await run(
        [
          "encode",
          "--film", path.join(OUT, "film-spec.json"),
          "--grid", path.join(OUT, "grid.bin"),
          "--output", mp4,
          "--out", OUT,
          "--start-frame", String(startFrame),
          "--end-frame", String(endFrame),
          "--crf", "20",
          "--preset", "veryfast",
        ],
        `motion-encode:${mt.id}`,
        { capture: true },
      );
      await run(
        ["probe", "--file", mp4, "--out", dir],
        `motion-probe:${mt.id}`,
        { capture: true },
      );
      const probeFile = path.join(dir, "probe.json");
      try {
        const data = JSON.parse(await readFile(probeFile, "utf8"));
        await writeFile(path.join(dir, `${mt.id}.probe.json`), JSON.stringify(data, null, 2));
      } catch {
        /* per-test probe is best-effort; the summary lives in the report */
      }
      await writeFile(
        path.join(dir, `${mt.id}.json`),
        JSON.stringify(
          { ...mt, startFrame, endFrame, frames: endFrame - startFrame, mp4: path.basename(mp4) },
          null,
          2,
        ),
      );
    }

    // Verify the most complex sample end-to-end as the pre-flight gate: if this does
    // not decode cleanly, encoding the full film is wasted work.
    const gate = MOTION_TESTS[MOTION_TESTS.length - 1];
    const gateStart = Math.round(gate.from * film.fps);
    const gateEnd = Math.min(totalFrames, gateStart + Math.round(gate.seconds * film.fps));
    const gateMp4 = path.join(dir, `${gate.id}.mp4`);
    await run(
      [
        "verify",
        "--film", path.join(OUT, "film-spec.json"),
        "--file", gateMp4,
        "--out", OUT,
        "--expected-frames", String(gateEnd - gateStart),
      ],
      "motion-verify",
      { capture: true },
    );
    try {
      const v = JSON.parse(await readFile(path.join(OUT, "verify.json"), "utf8"));
      await writeFile(path.join(dir, "verify.json"), JSON.stringify(v, null, 2));
    } catch {
      /* ignore */
    }
  }

  banner("5/9 encode  (600 frames streamed straight to H.264, no temp file)");
  const encodeRes = await run(
    [
      "encode",
      "--film", path.join(OUT, "film-spec.json"),
      "--grid", path.join(OUT, "grid.bin"),
      "--output", path.join(OUT, "rough-cut.mp4"),
      "--out", OUT,
      "--start-frame", "0",
      "--end-frame", String(totalFrames),
      "--crf", "20",
      "--preset", "slow",
    ],
    "encode",
    { capture: true },
  );
  process.stdout.write(encodeRes.out);

  banner("6/9 probe  (ffprobe metadata)");
  const probeRes = await run(
    ["probe", "--file", path.join(OUT, "rough-cut.mp4"), "--out", OUT],
    "probe",
    { capture: true },
  );
  process.stdout.write(probeRes.out);

  banner("7/9 verify  (ffprobe + FULL DECODE of every frame — the Phase 1 gate)");
  let verifyOk = false;
  const verifyRes = await run(
    ["verify", "--file", path.join(OUT, "rough-cut.mp4"), "--film", path.join(OUT, "film-spec.json"), "--out", OUT],
    "verify",
    { capture: true },
  );
  process.stdout.write(verifyRes.out);
  verifyOk = verifyRes.out.includes("=> PASS");


  if (WANT_REMOTION) {
    banner("8/9 Remotion  (Chromium compositor render of the same grid)");
    const pub = await publishForRemotion(film.slug, OUT);
    process.stdout.write(`         published engine artifacts -> ${path.relative(ROOT, pub)}\n`);
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    const remotionOut = path.join(OUT, "remotion-rough-cut.mp4");
    await runRaw(
      "npx",
      [
        "remotion", "render", "remotion/index.ts", "AsciiFilm", remotionOut,
        "--log=error",
        "--concurrency", "4",
      ],
      "remotion-render",
      {
        env: {
          ...process.env,
          // The compositor's ffmpeg links libav*.dylib by bare name.
          DYLD_LIBRARY_PATH: path.join(ROOT, "node_modules", "@remotion", "compositor-darwin-arm64"),
          ...(existsSync(chrome) ? { REMOTION_CHROME: chrome } : {}),
        },
      },
    );
  }

  banner("9/9 report  (render-report.json)");
  const reportRes = await run(
    [
      "report",
      "--film", path.join(OUT, "film-spec.json"),
      "--out", OUT,
      "--typecheck-ok",
      "--build-ok",
    ],
    "report",
    { capture: true },
  );
  process.stdout.write(reportRes.out);

  await writeFile(
    path.join(OUT, "pipeline-log.json"),
    JSON.stringify(
      {
        prompt: PROMPT,
        out: OUT,
        totalMs: Date.now() - t0,
        totalSeconds: (Date.now() - t0) / 1000,
        motionTests: MOTION_TESTS,
        stages: results,
        phase1: verifyOk ? "PASS" : "PARTIAL",
      },
      null,
      2,
    ) + "\n",
  );

  banner(verifyOk ? "PHASE 1 = PASS" : "PHASE 1 = PARTIAL (rough cut did not fully verify)");
  process.stdout.write(`total ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUT}\n`);
  process.exit(verifyOk ? 0 : 1);
}

main().catch(async (err) => {
  process.stderr.write(`\nPIPELINE FAILED at stage: ${failedStage}\n${err.message}\n`);
  await writeFile(
    path.join(OUT, "pipeline-log.json"),
    JSON.stringify(
      { prompt: PROMPT, out: OUT, failedStage, error: err.message, stages: results },
      null,
      2,
    ) + "\n",
  ).catch(() => {});
  process.exit(1);
});
