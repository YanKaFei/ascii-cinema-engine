#!/usr/bin/env node
/**
 * Engine invariant tests. No test framework: the assertions below are the contract,
 * and several of them encode bugs that actually shipped during development.
 *
 *   node dist/cli/tests.js
 */

import process from "node:process";

import { promptToFilmSpec, parsePrompt, LONELINESS_BEATS } from "../domain/planner.js";
import { validateFilmSpec } from "../domain/schema.js";
import { ASCII_VOCABULARY, GLYPHS, GLYPH_BY_CODE, GLYPH_H, GLYPH_W } from "../glyphs/atlas.js";
import { buildRamp, windowRamp, quantize, assertAsciiRamp } from "../glyphs/ramp.js";
import { compileScene, sceneDigest } from "../scene/scene.js";
import { renderSequence, renderFrameAscii } from "../render/render.js";
import { createDensityWindowCache, shotCoverageWindow } from "../render/frame.js";
import { createCharGrid, resetCharGrid, inkCoverage } from "../render/raster.js";
import { encodeGridSequence, decodeGridSequence, framePlaneDigest } from "../render/gridbin.js";
import { encodePng, blackImage, blitMax, downscale, type RgbImage } from "../render/png.js";
import { inkToDisplayByte, inkToDisplayUnit } from "../render/tone.js";
import { shotRanges, totalFrames, addressFrame } from "../render/timeline.js";
import { createRng, hashString } from "../core/rng.js";
import { valueNoise3 } from "../core/noise.js";
import { project, makeBasis, vec3, clamp01 } from "../core/math.js";
import { solveCamera } from "../camera/rig.js";

let passed = 0;
const failures: string[] = [];
const notes: string[] = [];

function ok(cond: boolean, name: string): void {
  if (cond) passed++;
  else failures.push(name);
}
function eq<T>(actual: T, expected: T, name: string): void {
  if (actual === expected) passed++;
  else failures.push(`${name} (got ${String(actual)}, expected ${String(expected)})`);
}
function near(actual: number, expected: number, tol: number, name: string): void {
  if (Math.abs(actual - expected) <= tol) passed++;
  else failures.push(`${name} (got ${actual}, expected ~${expected} ±${tol})`);
}
function group(name: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    failures.push(`${name}: threw ${err instanceof Error ? err.message : String(err)}`);
  }
}

const FILM_OPTS = {
  durationInSeconds: 20,
  width: 1920,
  height: 1080,
  fps: 30,
  quality: "draft" as const,
  aspect: "16:9",
};

const film = promptToFilmSpec("孤独", FILM_OPTS);

// ---------------------------------------------------------------------------
group("glyph atlas", () => {
  ok(GLYPHS.length > 60, "atlas declares a broad vocabulary");
  for (const g of GLYPHS) {
    const c = g.ch.charCodeAt(0);
    ok(c >= 32 && c <= 126, `glyph ${JSON.stringify(g.ch)} is printable ASCII`);
    eq(g.rows.length, GLYPH_H, `glyph ${g.ch} has ${GLYPH_H} rows`);
  }
  eq(ASCII_VOCABULARY.length, 95, "ASCII vocabulary is 0x20..0x7E");
  // every measured coverage must be bounded by the cell area
  for (const g of GLYPHS) ok(g.coverage <= GLYPH_W * GLYPH_H, `${g.ch} coverage within cell`);
  ok(GLYPH_BY_CODE[32]!.coverage === 0, "space has zero coverage");
  ok(GLYPH_BY_CODE[65]!.ch === "A", "code 65 is A");
});

group("density ramps", () => {
  const r = buildRamp(film.raster.ramp);
  ok(r.all.length > 50, "master ramp resolves many glyphs");
  // coverage must be non-decreasing, otherwise the density gradient reverses
  for (let i = 1; i < r.all.length; i++) {
    ok(r.all[i]!.coverage >= r.all[i - 1]!.coverage, "ramp is sorted by coverage");
  }
  const w = windowRamp(r, 2, 6);
  ok(w.length >= 2, "narrow window still yields a gradient");
  // quantize must be monotone in value
  const lo = quantize(0, w);
  const hi = quantize(1, w);
  ok(GLYPH_BY_CODE[lo]!.coverage <= GLYPH_BY_CODE[hi]!.coverage, "quantize is monotone");
  eq(quantize(0.5, []), 32, "empty window quantizes to blank");
  ok(assertAsciiRamp(film.raster.ramp).ok, "master ramp is a legal ASCII ramp");
  ok(!assertAsciiRamp("  ").ok, "a ramp of only spaces is rejected");
  ok(!assertAsciiRamp("abca").ok, "duplicate glyphs are rejected");
});

group("rng and noise determinism", () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 50; i++) eq(a.next(), b.next(), `rng reproduces sample ${i}`);
  eq(hashString("孤独"), hashString("孤独"), "hashString is stable");
  for (let i = 0; i < 20; i++) {
    eq(
      valueNoise3(i * 0.37, i * 1.1, i * 0.5, 7),
      valueNoise3(i * 0.37, i * 1.1, i * 0.5, 7),
      `noise reproduces sample ${i}`,
    );
  }
  ok(valueNoise3(0.5, 0.5, 0.5, 1) >= 0 && valueNoise3(0.5, 0.5, 0.5, 1) <= 1, "noise in range");
});

group("projection", () => {
  // THE bug this guards: negating the forward component put the whole scene behind
  // the camera and rendered a black film with no error.
  const basis = makeBasis(vec3(0, 1, 3), vec3(0, 1, 0), 1, 1, 0);
  const at = project(basis, vec3(0, 1, 0), { visible: false, sx: 0, sy: 0, depth: 0 });
  ok(at.visible, "a point on the subject line is in front of the camera");
  near(at.depth, 3, 1e-9, "depth is the positive distance along forward");
  near(at.sx, 0, 1e-9, "on-axis point projects to screen centre x");
  near(at.sy, 0, 1e-9, "on-axis point projects to screen centre y");
  const behind = project(basis, vec3(0, 1, 5), { visible: false, sx: 0, sy: 0, depth: 0 });
  ok(!behind.visible, "a point behind the camera is rejected");
  const up = project(basis, vec3(0, 2, 0), { visible: false, sx: 0, sy: 0, depth: 0 });
  ok(up.sy > 0, "a point above the axis projects upward");
});

group("camera rig", () => {
  const shot = film.shots[0]!;
  const cam = solveCamera(film, shot, 0, 16 / 9);
  // The pinhole ratio must be exactly 1: the camera distance is the framing control.
  eq(cam.focal, 1, "pinhole focal stays 1.0");
  near(cam.pos.y, 1.05, 1e-6, "camera sits on the subject line");
  near(cam.visibleHeight, 2 * shot.camera.focusDistance, 1e-9, "visible height is 2x focusDistance");
  // a push-in must actually close the distance, monotonically
  const push = film.shots[3]!;
  const camA = solveCamera(film, push, 0, 16 / 9);
  const camB = solveCamera(film, push, push.duration, 16 / 9);
  ok(camB.distance < camA.distance, "push-in closes the camera distance");
  ok(camB.focal === camA.focal, "focal does not change during a dolly");
});

group("film spec", () => {
  const v = validateFilmSpec(film);
  ok(v.ok, `planned spec validates (${v.issues.map((i) => i.message).join("; ")})`);
  eq(film.width, 1920, "width honoured");
  eq(film.height, 1080, "height honoured");
  eq(film.fps, 30, "fps honoured");
  eq(film.durationInSeconds, 20, "duration honoured");
  eq(film.raster.cols * film.raster.cellW, film.width, "cell grid tiles the width exactly");
  eq(film.raster.rows * film.raster.cellH, film.height, "cell grid tiles the height exactly");
  eq(film.shots.length, 5, "five shots");
  eq(film.look.background.toLowerCase(), "#000000", "black background");
  eq(totalFrames(film), 600, "600 frames");
  // shots must tile without gap or overlap
  let cursor = 0;
  for (const s of film.shots) {
    near(s.start, cursor, 1e-9, `shot ${s.id} starts where the previous ended`);
    cursor = s.start + s.duration;
  }
  near(cursor, film.durationInSeconds, 1e-9, "shots cover the whole duration");
  ok(film.derivation.matchedConcepts.includes("loneliness"), "prompt concept matched");
  ok(film.derivation.constraints.durationInSeconds === 20, "prompt constraints recorded");
});

group("validator rejects bad specs", () => {
  const bad = JSON.parse(JSON.stringify(film));
  bad.raster.cols = 241; // no longer divides the width
  ok(!validateFilmSpec(bad).ok, "non-dividing cell grid is rejected");

  const bad2 = JSON.parse(JSON.stringify(film));
  bad2.shots[0].start = 0.5;
  ok(!validateFilmSpec(bad2).ok, "gapped timeline is rejected");

  const bad3 = JSON.parse(JSON.stringify(film));
  bad3.shots[1].density.coverageMaxEnd = 999;
  ok(!validateFilmSpec(bad3).ok, "out-of-range coverage is rejected");

  const bad4 = JSON.parse(JSON.stringify(film));
  bad4.raster.ramp = " .\u00e9";
  ok(!validateFilmSpec(bad4).ok, "non-ASCII ramp is rejected");

  const bad5 = JSON.parse(JSON.stringify(film));
  bad5.durationInSeconds = 21;
  ok(!validateFilmSpec(bad5).ok, "duration that shots do not tile is rejected");
});

group("prompt parsing", () => {
  const p = parsePrompt("孤独 20秒 1920x1080 30fps", {});
  eq(p.extracted.durationInSeconds, 20, "parses duration from the prompt");
  eq(p.extracted.width, 1920, "parses width");
  eq(p.extracted.height, 1080, "parses height");
  eq(p.extracted.fps, 30, "parses fps");
  ok(p.matchedConcepts.includes("loneliness"), "matches the loneliness concept");
  // explicit overrides must beat parsed values
  const o = parsePrompt("20秒", { durationInSeconds: 8 });
  eq(o.derivation.constraints.durationInSeconds, 8, "override beats the prompt");
  // an unmatched prompt still produces a valid film
  const other = promptToFilmSpec("a stone", FILM_OPTS);
  ok(validateFilmSpec(other).ok, "unmatched prompt still yields a valid film");
  ok(other.derivation.defaultsApplied.length > 0, "unmatched prompt records the default");
});

group("scene compilation", () => {
  const shot = film.shots[2]!;
  const a = compileScene(film, shot);
  const b = compileScene(film, shot);
  eq(sceneDigest(a), sceneDigest(b), "scene compilation is deterministic");
  ok(a.primitiveCount > 1000, "scene has primitives");
  eq(a.primitiveCount, shot.layers.reduce((n, l) => n + l.count, 0), "primitive count matches spec");
  // every primitive must be on screen at least once
  for (const layer of a.layers) {
    eq(
      layer.onScreenFraction,
      1,
      `layer ${layer.spec.id} has no orphan primitives (onScreenFraction)`,
    );
  }
  // a different seed must give a different scene
  const other = compileScene({ ...film, seed: film.seed + 1 }, shot);
  ok(sceneDigest(other) !== sceneDigest(a), "different seed gives a different scene");
});

group("frame evaluation", () => {
  const grid = createCharGrid(film.raster.cols, film.raster.rows);
  const shot = film.shots[3]!;
  const scene = compileScene(film, shot);

  // Shot 01 is the one-glyph-in-a-void shot and must stay that way.
  const dotShot = film.shots[0]!;
  const dotScene = compileScene(film, dotShot);
  const dotGrid = createCharGrid(film.raster.cols, film.raster.rows);
  resetCharGrid(dotGrid);
  const { evaluateShotFrame } = { evaluateShotFrame: undefined } as never;
  void evaluateShotFrame;

  const dot = renderFrameAscii(film, 60);
  eq(dot.stats.litCells, 1, "shot 01 renders exactly one lit cell");

  // ASCII-only: nothing outside the declared ramp may ever be emitted.
  const allowed = new Set(film.raster.ramp.split("").map((c) => c.charCodeAt(0)));
  allowed.add(32);
  for (const f of [0, 60, 130, 240, 355, 460, 500, 590, 599]) {
    const frame = renderFrameAscii(film, f);
    let illegal = 0;
    for (const cell of frame.grid.cells) if (!allowed.has(cell.code)) illegal++;
    eq(illegal, 0, `frame ${f} emits only ramp glyphs`);
    for (const cell of frame.grid.cells) {
      ok(cell.code >= 32 && cell.code <= 126, `frame ${f} cell is printable ASCII`);
      ok(cell.ink >= 0 && cell.ink <= 1, `frame ${f} ink is normalized`);
    }
  }

  // The film must actually end on the brief's stated final state, and the dissolve
  // must genuinely collapse rather than merely quietening down.
  const last = renderFrameAscii(film, totalFrames(film) - 1);
  eq(last.stats.litCells, 1, "the last frame is a single character");
  const dissolveSamples = [482, 500, 520, 540, 560, 580, 599].map((f) => renderFrameAscii(film, f).stats.litCells);
  ok(dissolveSamples[0]! > dissolveSamples[dissolveSamples.length - 1]!, "shot 05 loses ink over time");
  ok(
    dissolveSamples.slice(0, 3).every((n) => n > 100),
    "shot 05 still has structure in its first half",
  );
  ok(
    dissolveSamples.slice(-3).every((n) => n <= 2),
    "shot 05 resolves to a single mark before the end",
  );

  // Density must be able to be non-trivial in the middle of the film.
  const mid = renderFrameAscii(film, 458);
  ok(mid.stats.litCells > 500, "shot 04 carries real density");

  // The density window must actually open over the film (glyph-density transform).
  const winFirst = shotCoverageWindow(film.shots[4]!, 0);
  const winLast = shotCoverageWindow(film.shots[4]!, 1);
  ok(winLast.max < winFirst.max, "shot 05 closes its glyph window");
  const win4 = shotCoverageWindow(film.shots[3]!, 1);
  ok(win4.max > shotCoverageWindow(film.shots[3]!, 0).max, "shot 04 opens its glyph window");

  // Sanity on the raster grid helper.
  const cov = inkCoverage(grid, 1);
  eq(cov, 0, "a reset grid has zero ink coverage");
  void scene;
});

group("timeline", () => {
  const ranges = shotRanges(film);
  eq(ranges.length, 5, "five shot ranges");
  for (let i = 1; i < ranges.length; i++) {
    eq(ranges[i]!.firstFrame, ranges[i - 1]!.endFrame, "shot ranges tile without gap");
  }
  eq(ranges[0]!.firstFrame, 0, "first shot starts at frame 0");
  eq(ranges[ranges.length - 1]!.endFrame, totalFrames(film), "last shot ends at the last frame");
  const a = addressFrame(film, 0);
  eq(a.shot.id, "01", "frame 0 is shot 01");
  const b = addressFrame(film, 599);
  eq(b.shot.id, "05", "the last frame is shot 05");
  ok(addressFrame(film, 9999).frame === 599, "out-of-range frames clamp");
});

group("gridbin codec", () => {
  const res = renderSequence(film, { startFrame: 0, endFrame: 12 });
  const enc = encodeGridSequence(res.sequence);
  const dec = decodeGridSequence(enc);
  eq(dec.cols, res.sequence.cols, "cols survive the round trip");
  eq(dec.rows, res.sequence.rows, "rows survive the round trip");
  eq(dec.frameCount, res.sequence.frameCount, "frame count survives");
  eq(dec.glyphs.length, res.sequence.glyphs.length, "palette survives");
  let diff = 0;
  for (let i = 0; i < dec.codes.length; i++) {
    if (dec.codes[i] !== res.sequence.codes[i]) diff++;
    if (dec.values[i] !== res.sequence.values[i]) diff++;
  }
  eq(diff, 0, "planes survive the round trip byte for byte");
  // a corrupted header must be rejected, not silently accepted
  const truncated = enc.slice(0, enc.length - 10);
  let threw = false;
  try {
    decodeGridSequence(truncated);
  } catch {
    threw = true;
  }
  ok(threw, "a truncated gridbin is rejected");
  const badMagic = Uint8Array.from(enc);
  badMagic[0] = 0x58;
  threw = false;
  try {
    decodeGridSequence(badMagic);
  } catch {
    threw = true;
  }
  ok(threw, "a bad magic number is rejected");
  // digests must be stable across two encodings of the same sequence
  const res2 = renderSequence(film, { startFrame: 0, endFrame: 12 });
  eq(
    framePlaneDigest(res.sequence, 5),
    framePlaneDigest(res2.sequence, 5),
    "frame digest is reproducible",
  );
});

group("determinism (whole film)", () => {
  const a = renderSequence(film, { startFrame: 0, endFrame: 90 });
  const b = renderSequence(film, { startFrame: 0, endFrame: 90 });
  let diff = 0;
  for (let i = 0; i < a.sequence.codes.length; i++) {
    if (a.sequence.codes[i] !== b.sequence.codes[i] || a.sequence.values[i] !== b.sequence.values[i]) diff++;
  }
  eq(diff, 0, "two renders of the same spec are byte-identical");
  eq(
    JSON.stringify(a.sceneDigests),
    JSON.stringify(b.sceneDigests),
    "scene digests are reproducible",
  );
  // ...and a different seed must change the film
  const other = renderSequence({ ...film, seed: film.seed ^ 0x5a5a }, { startFrame: 0, endFrame: 90 });
  let same = 0;
  for (let i = 0; i < a.sequence.codes.length; i++) {
    if (a.sequence.codes[i] === other.sequence.codes[i]) same++;
  }
  ok(same < a.sequence.codes.length, "a different seed changes the output");
});

group("tone curve", () => {
  eq(inkToDisplayByte(0), 0, "ink 0 maps to black");
  eq(inkToDisplayByte(1), 255, "ink 1 maps to white");
  // must be strictly increasing and NOT clip mid-range (the old curve clipped at 0.55)
  let monotone = true;
  for (let i = 1; i <= 100; i++) {
    if (inkToDisplayByte(i / 100) < inkToDisplayByte((i - 1) / 100)) monotone = false;
  }
  ok(monotone, "tone curve is monotone");
  ok(inkToDisplayByte(0.6) < 255, "a faint mark is not clipped to white");
  ok(inkToDisplayByte(0.2) > 0, "a very faint mark is still visible");
  near(inkToDisplayUnit(0.5), Math.pow(0.5, 1 / 1.85), 1e-12, "unit and byte curves agree");
});

group("png encoder", () => {
  const img = blackImage(4, 3);
  img.data[0] = 255;
  img.data[1] = 128;
  img.data[2] = 64;
  const png = encodePng(img);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) eq(png[i], sig[i], `png signature byte ${i}`);
  eq(String.fromCharCode(...png.slice(12, 16)), "IHDR", "png has an IHDR chunk");
  eq(String.fromCharCode(...png.slice(png.length - 8, png.length - 4)), "IEND", "png ends with IEND");
  // a wrong-sized buffer must be rejected rather than producing a broken file
  let threw = false;
  try {
    encodePng({ width: 4, height: 3, data: new Uint8Array(5) });
  } catch {
    threw = true;
  }
  ok(threw, "png encoder rejects a mis-sized buffer");

  const dst = blackImage(4, 4);
  const src = blackImage(2, 2);
  src.data.fill(200);
  blitMax(dst, src, 1, 1);
  eq(dst.data[(1 * 4 + 1) * 3], 200, "blitMax writes into the destination");
  eq(dst.data[0], 0, "blitMax leaves untouched pixels alone");
  const scaled = downscale(dst, 2, 2);
  eq(scaled.width, 2, "downscale output width");
  eq(scaled.height, 2, "downscale output height");
  const big: RgbImage = downscale(dst, 8, 8);
  eq(big.data.length, 8 * 8 * 3, "upscale-by-nearest produces a full buffer");
});

/**
 * EXPOSURE INTENT OUTRANKS THE NORMALISER — Phase 3.1 steps 9 and 10.
 *
 * THE DEFECT THESE LOCK DOWN. Phase 3's per-shot normaliser exposed every shot against its own measured
 * highlights. Correct for an ordinary shot, **wrong for a shot whose emptiness is the point**:
 * `disappearing-room` is about a room that vanishes, and its lit-cell range collapsed from **58x to
 * 3.5x** because a nearly-empty shot has a low 95th percentile and the normaliser lifted it.
 *
 *     DIRECTOR INTENT  >  EXPOSURE NORMALISER
 *
 * NOTE ON THE DENSITIES. The normaliser strides every 28th cell and needs **64+** above-floor samples
 * before it acts, so a very small or dim shot bypasses it and every intent returns IDENTICAL output. An
 * earlier version of this test used 84 lit cells, the sampling never reached its floor, and all six
 * cases agreed — which is how the floor was found.
 */
group("exposure intent — director intent outranks the normaliser", () => {
  const NO_NOISE = { octaves: 0, frequency: 0, amplitude: 0, lacunarity: 0, gain: 0, drift: 0 };
  const intentBase = promptToFilmSpec("intent test", {
    durationInSeconds: 20, fps: 30, width: 1920, height: 1080, quality: "draft",
  });
  const intentFilm = (count: number, intensity: number, intent: string) => ({
    ...intentBase,
    shots: [{
      ...intentBase.shots[0]!, id: "01", start: 0, duration: 3,
      density: { coverageMinStart: 2, coverageMinEnd: 2, coverageMaxStart: 20, coverageMaxEnd: 20 },
      raster: { fieldNormalise: true, spaceFraction: 0.9, exposureIntent: intent as never },
      transitionIn: { kind: "cut" as const, duration: 0 },
      camera: { ...intentBase.shots[0]!.camera, kind: "static" as const, focusDistance: 2.4,
        dollyAmount: 0, panAmount: 0, yawAmount: 0, jitter: 0 },
      layers: [{
        id: "s", kind: "particle-field" as const, shape: "cloud" as const, count,
        bounds: { x: 1.6, y: 1.6, z: 0.3 }, offsetY: 0.2, glyphRadius: 1.4, intensity, variation: 0.25,
        depthBias: 0, depth: "flat" as const, focus: 1.8, noise: NO_NOISE, transform: "none" as const,
        role: "protagonist",
      }],
    }],
    durationInSeconds: 3,
  } as never);
  const intentMeasure = (f: ReturnType<typeof renderFrameAscii>) => {
    let lit = 0, nearWhite = 0;
    for (const c of f.grid.cells) if (c.code > 32) { lit++; if (c.ink * 255 >= 240) nearWhite++; }
    return { lit, nearWhiteShare: lit ? nearWhite / lit : 0 };
  };

  // (A) an authored empty shot remains empty
  const emptyAuto = intentMeasure(renderFrameAscii(intentFilm(1200, 0.12, "auto"), 0));
  const emptyIntent = intentMeasure(renderFrameAscii(intentFilm(1200, 0.12, "preserve-emptiness"), 0));
  ok(emptyIntent.lit < emptyAuto.lit * 0.5, "A: preserve-emptiness is far emptier than auto");
  ok(emptyIntent.nearWhiteShare < 0.05, "A: and is not blown out");
  /**
   * AND IT IS NOT ACHIEVED BY DISABLING THE NORMALISER. The first implementation suppressed it for this
   * intent; measured, that made the shot BRIGHTER — near-white went 2.1% -> 76.6% — because the
   * normaliser was the only thing holding the field down.
   */
  ok(emptyIntent.nearWhiteShare < emptyAuto.nearWhiteShare + 0.01, "A: and is not brighter than auto");

  // (B) an ordinary underexposed shot is still recovered
  const dimAuto = intentMeasure(renderFrameAscii(intentFilm(3000, 0.1, "auto"), 0));
  ok(dimAuto.lit > 60, "B: an underlit shot is still exposed under auto");
  ok(dimAuto.nearWhiteShare < 0.2, "B: and is not blown out");
  const dimIntent = intentMeasure(renderFrameAscii(intentFilm(3000, 0.1, "preserve-emptiness"), 0));
  ok(dimIntent.lit <= dimAuto.lit, "B: preserve-emptiness holds it darker when chosen");

  // (C) a high-density shot does not clip under an ordinary intent
  const denseAuto = intentMeasure(renderFrameAscii(intentFilm(3000, 9, "auto"), 0));
  const denseNormal = intentMeasure(renderFrameAscii(intentFilm(3000, 9, "normal"), 0));
  eq(denseAuto.lit, denseNormal.lit, "C: auto and normal agree on lit cells");
  near(denseAuto.nearWhiteShare, denseNormal.nearWhiteShare, 1e-6, "C: auto and normal agree on near-white");

  /**
   * The branch is on the DECLARATION, never on a content threshold.
   *
   * The first version of this assertion demanded four DIFFERENT values from four intents and failed —
   * `auto` and `low-key` can legitimately coincide when a shot is already dark enough that the lower
   * target changes nothing. The property that actually matters is that the DECLARED intent moves the
   * exposure at all, and specifically that the emptiness intent does, so that is what is asserted.
   */
  const byIntent = Object.fromEntries(
    ["auto", "preserve-emptiness", "high-key"].map(
      // intensity 0.5: ABOVE the normaliser's activation floor but BELOW clipping. At 1.2 and above the
      // field clips on its own, the normaliser has nothing to scale, and every intent returns the same
      // number -- measured across 0.5 / 1.2 / 2.5 / 5.
      (i) => [i, intentMeasure(renderFrameAscii(intentFilm(1500, 0.5, i), 0)).lit],
    ),
  ) as Record<string, number>;
  ok(
    byIntent["preserve-emptiness"]! < byIntent["auto"]!,
    "declaring preserve-emptiness changes the exposure (it is not a no-op)",
  );
  ok(
    byIntent["high-key"]! >= byIntent["preserve-emptiness"]!,
    "and high-key is not darker than it",
  );
});

group("benchmark beats", () => {
  const ids = LONELINESS_BEATS.map((b) => b.id);
  eq(JSON.stringify(ids), JSON.stringify(["01", "02", "03", "04", "05"]), "the five beats in order");
  const required = [
    "push-in",
    "lateral-camera-move",
    "depth-parallax",
    "particle-field",
    "glyph-density-transformation",
    "assemble",
    "dissolve",
  ];
  const covered = new Set(film.shots.flatMap((s) => s.techniques));
  for (const t of required) ok(covered.has(t), `technique present: ${t}`);
  ok(clamp01(2) === 1, "clamp01 saturates");
});

// ---------------------------------------------------------------------------
const total = passed + failures.length;
process.stdout.write(`\n${passed}/${total} assertions passed\n`);
if (notes.length) process.stdout.write(notes.map((n) => `  note: ${n}\n`).join(""));
if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} FAILURES:\n`);
  for (const f of failures.slice(0, 60)) process.stdout.write(`  FAIL  ${f}\n`);
  if (failures.length > 60) process.stdout.write(`  ... and ${failures.length - 60} more\n`);
  process.exit(1);
}
process.stdout.write("all engine invariant tests passed\n");
process.exit(0);
