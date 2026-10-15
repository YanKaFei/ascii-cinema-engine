#!/usr/bin/env node
/**
 * CLI shim for the backend-independence spike.
 *
 * The renderer itself lives in `src/experiments/spike-renderer.ts` so it is typed, unit
 * tested, and importable. This file only does the file I/O and the PNG rasterisation.
 *
 * NOT a GPU renderer. See README.md in this directory.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

const { field, codesFor } = await import(path.join(ROOT, "dist", "src", "experiments", "spike-renderer.js"));
const { GLYPH_BY_CODE } = await import(path.join(ROOT, "dist", "src", "glyphs", "atlas.js"));
const { encodePng, blackImage } = await import(path.join(ROOT, "dist", "src", "render", "png.js"));
const { inkToDisplayByte } = await import(path.join(ROOT, "dist", "src", "render", "tone.js"));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const irPath = arg("ir");
if (!irPath) {
  process.stderr.write("usage: spike.mjs --ir <scene-ir-shot.json> --out <still.png> [--frame N]\n");
  process.exit(2);
}
const outPath = path.resolve(arg("out", "/tmp/gpu-ascii-spike.png"));
const frame = Number(arg("frame", "0"));

const scene = JSON.parse(await readFile(irPath, "utf8"));
const lum = field(scene, frame);
const { codes, ink } = codesFor(scene, frame, lum);

const img = blackImage(scene.width, scene.height);
let lit = 0;
for (let y = 0; y < scene.rows; y++) {
  for (let x = 0; x < scene.cols; x++) {
    const code = codes[y * scene.cols + x];
    if (!code) continue;
    lit++;
    const glyph = GLYPH_BY_CODE[code];
    const level = inkToDisplayByte(ink[y * scene.cols + x] / 255);
    for (let r = 0; r < 9; r++) {
      const mask = glyph.rows[r];
      if (!mask) continue;
      const py = y * scene.cellH + r;
      for (let c = 0; c < 5; c++) {
        if ((mask & (1 << (4 - c))) === 0) continue;
        const px = Math.floor(x * scene.cellW + c * (scene.cellW / 5));
        const o = (py * scene.width + px) * 3;
        img.data[o] = level;
        img.data[o + 1] = level;
        img.data[o + 2] = level;
      }
    }
  }
}

await mkdir(path.dirname(outPath), { recursive: true });
const png = encodePng(img);
await writeFile(outPath, png);
process.stdout.write(
  `spike ok  shot=${scene.shotId} frame=${frame} litCells=${lit} -> ${outPath} (${(png.length / 1024).toFixed(1)} KB)\n`,
);
process.stdout.write("  renderer: SPIKE (independent CPU rasteriser - NOT GPU)\n");
