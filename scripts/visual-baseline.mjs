#!/usr/bin/env node
/**
 * PHASE 3 GATE 1 — freeze the Phase 2 visuals.
 *
 *   npm run visual:baseline
 *
 * Renders, from the FROZEN Phase 2 `grid.bin` (not from a fresh render, so the baseline cannot
 * drift), per film:
 *
 *   - 7 full-resolution stills: opening, 25%, 50%, 75%, ending, peak-density, lowest-density
 *   - a contact sheet of those 7 frames, labelled
 *   - four 3-second representative clips (camera, transformation, depth, dissolve)
 *
 * and then a master contact sheet across all four films.
 *
 * WHY THIS EXISTS BEFORE ANY GPU WORK. Phase 3's whole claim is "it now looks like cinema".
 * That claim is unfalsifiable without a before. This directory is the before, and it is
 * produced by the CPU reference renderer that Phase 2 was accepted on, so the comparison is
 * honest.
 *
 * Frame selection is MEASURED, not guessed: peak- and lowest-density frames come from the
 * per-frame lit-cell counts in `frame-telemetry.json` when present, otherwise from a sampled
 * scan of the grid.
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const BENCH = path.join(ROOT, "out", "benchmarks");
const OUT = path.join(ROOT, "out", "visual-baseline");
const FRAMES = path.join(OUT, "_frames");
const FFMPEG = path.join(ROOT, "node_modules", "@remotion", "compositor-darwin-arm64", "ffmpeg");
const FFMPEG_LIB = path.join(ROOT, "node_modules", "@remotion", "compositor-darwin-arm64");

const { decodeGridSequence } = await import(path.join(ROOT, "dist", "src", "render", "gridbin.js"));
const { GLYPH_BY_CODE } = await import(path.join(ROOT, "dist", "src", "glyphs", "atlas.js"));
const { encodePng, blackImage } = await import(path.join(ROOT, "dist", "src", "render", "png.js"));
const { inkToDisplayByte } = await import(path.join(ROOT, "dist", "src", "render", "tone.js"));

const FILMS = ["desire", "forgotten-name", "disappearing-room", "time"];
const FPS = 30;
const W = 1920;
const H = 1080;

function log(m) {
  process.stdout.write(`${m}\n`);
}

async function readJson(f) {
  try {
    return JSON.parse(await readFile(f, "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// rasterisation
// ---------------------------------------------------------------------------

/**
 * Rasterise one grid frame into a frame buffer.
 *
 * The glyph subpixels are drawn as RECTANGLES at the device level rather than as scaled
 * textures, because a 5x9 glyph stretched into an 8x9 cell produces a 1.6x horizontal stretch
 * that reads as venetian blinds. This is the same decision the Phase 1 encoder makes.
 */
function rasterFrame(seq, frameIndex, tileW, tileH, cellScale) {
  const img = blackImage(tileW, tileH);
  const { cols, rows } = seq;
  const cellW = tileW / cols;
  const cellH = tileH / rows;
  const base = frameIndex * cols * rows;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = base + y * cols + x;
      const code = seq.codes[i];
      if (!code || code === 32) continue;
      const glyph = GLYPH_BY_CODE[code];
      if (!glyph) continue;
      const level = inkToDisplayByte(seq.values[i] / 255);
      const px0 = x * cellW;
      const py0 = y * cellH;
      const sw = (cellW / 5) * cellScale;
      const sh = (cellH / 9) * cellScale;
      for (let r = 0; r < 9; r++) {
        const mask = glyph.rows[r];
        if (!mask) continue;
        const py = Math.floor(py0 + r * sh);
        for (let c = 0; c < 5; c++) {
          if ((mask & (1 << (4 - c))) === 0) continue;
          const x0 = Math.floor(px0 + c * sw);
          const x1 = Math.floor(px0 + (c + 1) * sw);
          const y1 = Math.floor(py0 + (r + 1) * sh);
          for (let yy = py; yy < Math.max(py + 1, y1); yy++) {
            if (yy < 0 || yy >= tileH) continue;
            for (let xx = x0; xx < Math.max(x0 + 1, x1); xx++) {
              if (xx < 0 || xx >= tileW) continue;
              const o = (yy * tileW + xx) * 3;
              img.data[o] = level;
              img.data[o + 1] = level;
              img.data[o + 2] = level;
            }
          }
        }
      }
    }
  }
  return img;
}

/** Draw a short label with the 5x9 bitmap font at an integer scale. */
function drawLabel(img, text, x0, y0, scale) {
  let cursor = x0;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPH_BY_CODE[ch.charCodeAt(0)] ?? GLYPH_BY_CODE[63];
    if (glyph) {
      for (let r = 0; r < 9; r++) {
        const mask = glyph.rows[r];
        if (!mask) continue;
        for (let c = 0; c < 5; c++) {
          if ((mask & (1 << (4 - c))) === 0) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = cursor + c * scale + sx;
              const py = y0 + r * scale + sy;
              if (px < 0 || px >= img.width || py < 0 || py >= img.height) continue;
              const o = (py * img.width + px) * 3;
              // label in a dim grey so it never competes with the frame
              img.data[o] = 190;
              img.data[o + 1] = 190;
              img.data[o + 2] = 190;
            }
          }
        }
      }
    }
    cursor += 6 * scale;
  }
  return cursor;
}

// ---------------------------------------------------------------------------
// frame selection
// ---------------------------------------------------------------------------

/** Lit-cell count per frame, decoded from the grid. */
function litCounts(seq) {
  const counts = new Int32Array(seq.frameCount);
  const cells = seq.cols * seq.rows;
  for (let f = 0; f < seq.frameCount; f++) {
    const base = f * cells;
    let n = 0;
    for (let i = 0; i < cells; i++) if (seq.codes[base + i] > 32) n++;
    counts[f] = n;
  }
  return counts;
}

/** The seven frames the review will look at. */
function selectFrames(seq, counts) {
  const last = seq.frameCount - 1;
  let peak = 0;
  let low = 0;
  for (let f = 0; f < seq.frameCount; f++) {
    if (counts[f] > counts[peak]) peak = f;
    if (counts[f] < counts[low]) low = f;
  }
  const picks = [
    { role: "opening", frame: 0 },
    { role: "25%", frame: Math.round(last * 0.25) },
    { role: "50%", frame: Math.round(last * 0.5) },
    { role: "75%", frame: Math.round(last * 0.75) },
    { role: "ending", frame: last },
    { role: "peak-density", frame: peak },
    { role: "lowest-density", frame: low },
  ];
  return picks.map((p) => ({ ...p, lit: counts[p.frame] }));
}

// ---------------------------------------------------------------------------
// contact sheets
// ---------------------------------------------------------------------------

/**
 * Build a contact sheet.
 *
 * Layout: a header row per film, then the tiles. Tiles are rendered at a size that keeps the
 * glyph lattice legible (the point of a contact sheet is to judge the ASCII, not the framing),
 * with a caption strip under each tile.
 */
function buildSheet(tiles, opts) {
  const { tileW, tileH, columns, captionH, titleH, pad, title } = opts;
  const rows = Math.ceil(tiles.length / columns);
  const sheetW = pad + columns * (tileW + pad);
  const sheetH = titleH + rows * (tileH + captionH + pad) + pad;
  const sheet = blackImage(sheetW, sheetH);

  if (title) drawLabel(sheet, title.slice(0, Math.floor((sheetW - 2 * pad) / 12)), pad, Math.floor(titleH / 3), 3);

  tiles.forEach((tile, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x0 = pad + col * (tileW + pad);
    const y0 = titleH + row * (tileH + captionH + pad);
    // blit the tile
    for (let y = 0; y < tileH; y++) {
      const src = y * tileW * 3;
      const dstBase = ((y0 + y) * sheetW + x0) * 3;
      for (let x = 0; x < tileW * 3; x++) sheet.data[dstBase + x] = tile.img.data[src + x];
    }
    drawLabel(sheet, tile.caption, x0, y0 + tileH + Math.floor(captionH / 4), 2);
  });

  return sheet;
}

// ---------------------------------------------------------------------------
// video clips
// ---------------------------------------------------------------------------

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, {
      cwd: ROOT,
      env: { ...process.env, DYLD_LIBRARY_PATH: FFMPEG_LIB },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stdout.on("data", () => {});
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}\n${err.slice(-1200)}`))));
  });
}

/** Write frames as PNGs into a directory, then encode them into an mp4. */
async function writeClip(name, seq, from, to, sheetScale) {
  const dir = path.join(FRAMES, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const tileW = Math.round(W * sheetScale);
  const tileH = Math.round(H * sheetScale);
  for (let f = from; f <= to; f++) {
    const img = rasterFrame(seq, f, tileW, tileH, 1);
    await writeFile(path.join(dir, `f${String(f - from).padStart(4, "0")}.png`), encodePng(img));
  }
  const mp4 = path.join(OUT, `${name}.mp4`);
  await ffmpeg([
    "-hide_banner", "-loglevel", "error",
    "-framerate", String(FPS),
    "-i", path.join(dir, "f%04d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", "18",
    "-movflags", "+faststart",
    "-y", mp4,
  ]);
  const bytes = (await readFile(mp4)).length;
  return { mp4, frames: to - from + 1, bytes };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

await rm(OUT, { recursive: true, force: true });
await mkdir(FRAMES, { recursive: true });

const perFilm = {};
const allTiles = [];

for (const dir of FILMS) {
  const gridPath = path.join(BENCH, dir, "grid.bin");
  const buf = new Uint8Array(await readFile(gridPath));
  const seq = decodeGridSequence(buf);
  const counts = litCounts(seq);
  const picks = selectFrames(seq, counts);

  log(`\n${dir}  ${seq.cols}x${seq.rows} cells, ${seq.frameCount} frames, ${seq.glyphs.length} glyphs in window`);

  const filmDir = path.join(OUT, dir);
  await mkdir(filmDir, { recursive: true });

  // full-resolution stills
  const tiles = [];
  for (const p of picks) {
    const img = rasterFrame(seq, p.frame, W, H, 1);
    const file = path.join(filmDir, `${String(p.frame).padStart(5, "0")}-${p.role}.png`);
    await writeFile(file, encodePng(img));
    // contact-sheet tile: 1/5 scale keeps the lattice readable while fitting four across
    tiles.push({
      img: rasterFrame(seq, p.frame, Math.round(W / 5), Math.round(H / 5), 1),
      caption: `${p.role}  f${p.frame}  lit ${p.lit}`,
    });
  }

  const sheet = buildSheet(tiles, {
    tileW: Math.round(W / 5),
    tileH: Math.round(H / 5),
    columns: 4,
    captionH: 22,
    titleH: 34,
    pad: 6,
    title: `${dir}  phase 2 cpu reference`,
  });
  const sheetPath = path.join(OUT, `${dir}-contact-sheet.png`);
  await writeFile(sheetPath, encodePng(sheet));
  log(`  contact sheet ${path.relative(ROOT, sheetPath)}  (${picks.map((p) => p.role).join(", ")})`);

  allTiles.push({ dir, sheet, w: sheet.width, h: sheet.height });

  // representative clips: the middle of the film for camera/depth, and the shot that carries
  // the film's transformation or its dissolve
  const filmV2 = await readJson(path.join(BENCH, dir, "film-spec-v2.json"));
  const clips = [];

  const cameraShot = filmV2?.shots?.find((s) => s.camera?.move?.kind && s.camera.move.kind !== "static");
  clips.push({
    name: `${dir}-camera`,
    why: cameraShot ? `shot ${cameraShot.id} camera "${cameraShot.camera.move.kind}"` : "no moving camera; mid-film window",
    from: cameraShot ? Math.round(cameraShot.start * FPS) : Math.round(seq.frameCount * 0.3),
  });

  const transformShot = filmV2?.shots?.find((s) => s.transformation);
  if (transformShot) {
    clips.push({
      name: `${dir}-transformation`,
      why: `shot ${transformShot.id} transformation "${transformShot.transformation.kind}"`,
      from: Math.round(transformShot.start * FPS) + 6,
    });
  }

  const depthShot = filmV2?.shots?.find((s) => s.space?.occlusionPolicy === "nearest");
  clips.push({
    name: `${dir}-depth`,
    why: depthShot ? `shot ${depthShot.id} occlusion "${depthShot.space.occlusionPolicy}"` : "additive space",
    from: depthShot ? Math.round(depthShot.start * FPS) + 10 : Math.round(seq.frameCount * 0.5),
  });

  const dissolveShot = filmV2?.shots?.find((s) => s.transitionIn?.kind === "dissolve");
  clips.push({
    name: `${dir}-dissolve`,
    why: dissolveShot ? `shot ${dissolveShot.id} transitionIn "dissolve"` : "no dissolve; nearest transition",
    from: dissolveShot ? Math.max(0, Math.round(dissolveShot.start * FPS) - 45) : Math.round(seq.frameCount * 0.6),
  });

  const clipMeta = [];
  for (const c of clips) {
    const from = Math.max(0, Math.min(seq.frameCount - 91, c.from));
    const r = await writeClip(c.name, seq, from, from + 89, 0.6667);
    clipMeta.push({ name: c.name, why: c.why, fromFrame: from, frames: r.frames, bytes: r.bytes, file: `${c.name}.mp4` });
    log(`  clip ${c.name}.mp4  frames ${from}-${from + 89}  ${(r.bytes / 1024).toFixed(0)} KB  (${c.why})`);
  }

  perFilm[dir] = {
    grid: path.relative(ROOT, gridPath),
    cols: seq.cols,
    rows: seq.rows,
    frameCount: seq.frameCount,
    glyphWindowSize: seq.glyphs.length,
    litCellStats: {
      min: Math.min(...counts),
      max: Math.max(...counts),
      mean: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length),
    },
    frames: picks.map((p) => ({ role: p.role, frame: p.frame, litCells: p.lit, file: `${String(p.frame).padStart(5, "0")}-${p.role}.png` })),
    contactSheet: `${dir}-contact-sheet.png`,
    clips: clipMeta,
  };
}

// master sheet: one representative frame per film, plus each film's own sheet is already written
{
  const tiles = allTiles.map((t) => ({ img: t.sheet, caption: `${t.dir} — 7 frames (opening / 25 / 50 / 75 / ending / peak / lowest)` }));
  const maxW = Math.max(...allTiles.map((t) => t.w));
  const maxH = Math.max(...allTiles.map((t) => t.h));
  const master = buildSheet(tiles, {
    tileW: maxW,
    tileH: maxH,
    columns: 1,
    captionH: 22,
    titleH: 40,
    pad: 8,
    title: "phase 2 visual baseline — master contact sheet",
  });
  const masterPath = path.join(OUT, "master-contact-sheet.png");
  await writeFile(masterPath, encodePng(master));
  log(`\nmaster contact sheet ${path.relative(ROOT, masterPath)}  (${master.width}x${master.height})`);
}

await writeFile(
  path.join(OUT, "visual-baseline.json"),
  JSON.stringify(
    {
      generatedFor: "phase-3 gate 1 — freeze the Phase 2 visual baseline",
      renderer: "CPU_REFERENCE_RENDERER",
      format: { width: W, height: H, fps: FPS },
      note:
        "Frames are decoded from the frozen Phase 2 grid.bin, not re-rendered, so this baseline cannot drift. " +
        "Neither the selection nor the review may be revised once the GPU renderer exists — it is the BEFORE.",
      films: perFilm,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

log("\nVISUAL BASELINE = WRITTEN");
