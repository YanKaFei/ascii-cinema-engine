#!/usr/bin/env node
/** Bake the GPU glyph atlas to public/gpu/. */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const { bakeAtlas, GLYPH_FAMILIES, validateFamilies, FAMILY_NAMES } = await import(
  path.join(ROOT, "dist", "src", "render", "gpu", "glyph-atlas.js")
);

const problems = validateFamilies();
if (problems.length) {
  process.stderr.write(`atlas: font is missing family characters:\n  ${problems.join("\n  ")}\n`);
  process.exit(1);
}

const OUT = path.join(ROOT, "public", "gpu");
await mkdir(OUT, { recursive: true });

const bundle = bakeAtlas(8);
await writeFile(path.join(OUT, "ascii-atlas.png"), bundle.png);
await writeFile(path.join(OUT, "ascii-atlas.json"), JSON.stringify(bundle.meta, null, 2) + "\n");

const fams = FAMILY_NAMES.map((n) => `${n}(${GLYPH_FAMILIES[n].length})`).join(" ");
process.stdout.write(
  `atlas ok  ${bundle.meta.width}x${bundle.meta.height}  ${bundle.meta.cols}x${bundle.meta.rows} cells  ` +
    `cell ${bundle.meta.cellW}x${bundle.meta.cellH}  ${bundle.png.length} bytes\n`,
);
process.stdout.write(`  families: ${fams}\n`);
process.stdout.write(`  printable run: ${bundle.meta.printableRun.length} slots\n`);
process.stdout.write(`  coverage range: ${Math.min(...bundle.meta.slotCoverage)}..${Math.max(...bundle.meta.slotCoverage)}\n`);
