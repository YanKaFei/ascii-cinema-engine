/**
 * PHASE 3.2A — three paired prototypes, and a measurement of WHERE RECOGNITION IS LOST.
 *
 * Each test renders twice:
 *   semantic-preview.png   a monochrome mask, no glyphs, no particles, no noise, no post
 *   ascii-render.png       the same mask sampled into the glyph lattice
 *
 * Comparing them separates two failures that Phase 3.1 could not tell apart:
 *   mask unreadable                -> FORM FAILURE
 *   mask readable, ASCII unreadable -> ASCII REPRESENTATION FAILURE
 *
 *   node scripts/phase32a.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase32');
const M = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'mask.js'));
const { createMask, disc, capsule, rect, polygon, blockText, textWidthPx, maskStats, writeMaskPng, sampleContourAware, at } = M;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080;

// ---------------------------------------------------------------------------
// SEMANTIC FORMS — drawn as real structure, at real size
// ---------------------------------------------------------------------------

/**
 * A STANDING PERSON, drawn as masses rather than as a contour.
 *
 * THE PROPORTIONS ARE CHOSEN FOR READABILITY AT DISTANCE, not for anatomy: the shoulders are wide, the
 * limbs are thick, and the two leg-gaps and two arm-gaps are large. A silhouette reads because of the
 * SPACE AROUND IT, so the gaps are the subject of this drawing as much as the body is.
 */
function drawHuman(m, cx, feetY, height, opts = {}) {
  const u = height / 1000;                       // one unit = 1/1000 of figure height
  const headR = 62 * u;
  const shoulderY = feetY - height + headR * 2.6;
  const hipY = feetY - height * 0.48;
  const shoulderHalf = 118 * u;
  const hipHalf = 86 * u;
  const limb = 34 * u;

  // head — a disc, not a bump, so it reads as a head at distance
  disc(m, cx, feetY - height + headR, headR);
  // neck
  rect(m, cx - 26 * u, feetY - height + headR * 1.7, cx + 26 * u, shoulderY + 6 * u);
  // shoulders and torso: a trapezoid, wide at the shoulders and narrowing to the waist,
  // so the silhouette has the SHAPE of a person rather than the shape of a box
  polygon(m, [
    [cx - shoulderHalf, shoulderY],
    [cx + shoulderHalf, shoulderY],
    [cx + hipHalf, hipY],
    [cx - hipHalf, hipY],
  ]);
  // arms, held clear of the torso — the gap between arm and body is the strongest single cue
  for (const s of [-1, 1]) {
    const ex = cx + s * (shoulderHalf + 46 * u);
    const ey = (shoulderY + hipY) / 2;
    capsule(m, cx + s * (shoulderHalf - 10 * u), shoulderY + 14 * u, ex, ey, limb);
    capsule(m, ex, ey, ex + s * 10 * u, hipY + 96 * u, limb * 0.86);
    disc(m, ex + s * 10 * u, hipY + 104 * u, limb * 0.95);   // hand
  }
  // legs, apart — the gap between them is the second strongest cue
  for (const s of [-1, 1]) {
    const kx = cx + s * (hipHalf + 34 * u);
    const fx = cx + s * (hipHalf + 52 * u);
    capsule(m, cx + s * hipHalf * 0.8, hipY, kx, hipY + (feetY - hipY) * 0.52, limb * 1.05);
    capsule(m, kx, hipY + (feetY - hipY) * 0.52, fx, feetY - 18 * u, limb * 0.85);
    rect(m, fx - 46 * u, feetY - 20 * u, fx + 46 * u, feetY, limb * 0.9);   // foot
  }
  void opts;
}

/**
 * A ROOM in one-point perspective, drawn as PLANES rather than as lines.
 *
 * A line drawing of a room is a wireframe; the planes are what make it an interior. The back wall is a
 * filled surface, the side walls and ceiling are filled trapezoids receding to the frame edge, and the
 * floor is a filled trapezoid — so the mask reads as an enclosed volume before any ASCII exists.
 */
function drawRoom(m, opts = {}) {
  const vpY = H * 0.46;
  const backHalfW = W * 0.20, backHalfH = H * 0.20;
  const bx0 = W / 2 - backHalfW, bx1 = W / 2 + backHalfW;
  const by0 = vpY - backHalfH, by1 = vpY + backHalfH;

  // back wall — a bright filled surface, the wall a name can be written on
  rect(m, bx0, by0, bx1, by1, 0.55);
  // ceiling: from the back wall's top edge out to the frame's top corners
  polygon(m, [[bx0, by0], [bx1, by0], [W, 0], [0, 0]], 0.30);
  // floor
  polygon(m, [[bx0, by1], [bx1, by1], [W, H], [0, H]], 0.42);
  // left wall and right wall
  polygon(m, [[bx0, by0], [bx0, by1], [0, H], [0, 0]], 0.20);
  polygon(m, [[bx1, by0], [bx1, by1], [W, H], [W, 0]], 0.20);
  // the back wall's edge, drawn darker so the wall is bounded
  const edge = 7;
  rect(m, bx0 - edge, by0 - edge, bx0 + edge, by1 + edge, 0.0);
  rect(m, bx1 - edge, by0 - edge, bx1 + edge, by1 + edge, 0.0);
  rect(m, bx0 - edge, by0 - edge, bx1 + edge, by0 + edge, 0.0);
  rect(m, bx0 - edge, by1 - edge, bx1 + edge, by1 + edge, 0.0);
  return { backWall: { x0: bx0, y0: by0, x1: bx1, y1: by1 } };
}

// ---------------------------------------------------------------------------
// ASCII REPRESENTATION of a mask — the step that loses information
// ---------------------------------------------------------------------------

/** Darkest-to-lightest ramp — used for INTERIOR material only; edges take orientation glyphs. */
const RAMP = " .:-=+*#%@";

/**
 * Sample a mask into the glyph lattice and render it with the engine's own atlas.
 *
 * THE ORDER IS THE POINT: the mask exists first and is readable on its own; this step only *represents*
 * it. And the representation is CONTOUR-AWARE — a cell on a boundary is drawn with the glyph matching the
 * edge's orientation, because measuring the first version showed the torso rendering as 35 rows of
 * near-identical characters, which is a density map and not a shape.
 */
function asciiFromMask(mask, cols, rows, outW, outH) {
  const cells = sampleContourAware(mask, cols, rows);
  const grid = cells.map((line) => line.map((c) => c.ch).join(""));
  const img = { width: outW, height: outH, data: Buffer.alloc(outW * outH * 3) };
  const cellW = outW / cols, cellH = outH / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (cell.ch === " ") continue;
      const g = GLYPH_BY_CODE[cell.ch.charCodeAt(0)];
      if (!g) continue;
      /**
       * EDGES ARE BRIGHT, INTERIORS ARE DIM. On a mask the boundary is where the form ENDS, so drawing
       * it at full brightness is what makes the silhouette visible; the interior stays a density ramp.
       */
      const v = cell.edge ? 255 : Math.round((0.35 + 0.65 * cell.value) * 255);
      for (let py = 0; py < GLYPH_H; py++) {
        const maskRow = g.rows[py]; if (!maskRow) continue;
        for (let px = 0; px < GLYPH_W; px++) {
          if (!(maskRow & (1 << (GLYPH_W - 1 - px)))) continue;
          const x0 = Math.round(c * cellW + (px * cellW) / GLYPH_W), x1 = Math.round(c * cellW + ((px + 1) * cellW) / GLYPH_W);
          const y0 = Math.round(r * cellH + (py * cellH) / GLYPH_H), y1 = Math.round(r * cellH + ((py + 1) * cellH) / GLYPH_H);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            if (x < 0 || y < 0 || x >= outW || y >= outH) continue;
            const o = (y * outW + x) * 3; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v;
          }
        }
      }
    }
  }
  return { img, grid };
}

// ---------------------------------------------------------------------------
// the three tests
// ---------------------------------------------------------------------------

await mkdir(OUT, { recursive: true });
const COLS = 240, ROWS = 120;
const report = [];

function runTest(id, label, build) {
  const mask = createMask(W, H);
  const extra = build(mask) ?? {};
  const st = maskStats(mask);
  const { img, grid } = asciiFromMask(mask, COLS, ROWS, W, H);
  return { id, label, mask, st, img, grid, extra };
}

const tests = [];

// TEST A — a standing person, no environment
tests.push(runTest('a', 'a standing person, no environment', (m) => {
  drawHuman(m, W / 2, H * 0.94, H * 0.86);
}));

// TEST B — a person standing inside a room
tests.push(runTest('b', 'a person standing inside a room', (m) => {
  drawRoom(m);
  drawHuman(m, W * 0.34, H * 0.86, H * 0.52);
}));

// TEST C — a person in a room with NAME on the wall, spatially separate
tests.push(runTest('c', 'a person in a room, NAME on the wall', (m) => {
  const r = drawRoom(m);
  drawHuman(m, W * 0.28, H * 0.86, H * 0.50);
  // the word is painted at a size that makes it a readable object, on the back wall, clear of the figure
  const target = W * 0.22;                       // ~22% of frame width
  const perCell = target / (4 * 5 + 3);          // 4 glyphs, 5 cells each, 3 tracking
  const cx = (r.backWall.x0 + r.backWall.x1) / 2;
  const cy = (r.backWall.y0 + r.backWall.y1) / 2;
  blockText(m, 'NAME', cx, cy, perCell, 1, 1.0);
  return { wordWidthFrac: textWidthPx('NAME', perCell, 1) / W, wordCentre: { x: cx, y: cy } };
}));

for (const t of tests) {
  await writeMaskPng(t.mask, path.join(OUT, `test-${t.id}-semantic.png`));
  await writeFile(path.join(OUT, `test-${t.id}-ascii.png`), encodePng(t.img));
  report.push({
    test: t.id, label: t.label,
    mask: `out/phase32/test-${t.id}-semantic.png`,
    ascii: `out/phase32/test-${t.id}-ascii.png`,
    coverage: +t.st.coverage.toFixed(4),
    maskHeightFrac: +t.st.heightFrac.toFixed(3),
    maskWidthFrac: +t.st.widthFrac.toFixed(3),
    ...t.extra,
  });
}

await writeFile(path.join(OUT, 'phase32a-report.json'), JSON.stringify({ resolution: `${W}x${H}`, lattice: `${COLS}x${ROWS}`, tests: report }, null, 2));

// ---------------------------------------------------------------------------
// WHERE RECOGNITION IS LOST
// ---------------------------------------------------------------------------
console.log('PHASE 3.2A — three paired prototypes\n');
for (const t of tests) {
  const cellsTall = Math.round(t.st.heightFrac * ROWS);
  console.log(`TEST ${t.id.toUpperCase()}  ${t.label}`);
  console.log(`   semantic mask  coverage ${(t.st.coverage * 100).toFixed(1)}%  subject height ${(t.st.heightFrac * 100).toFixed(0)}% of frame = ${cellsTall} glyph cells tall`);
  console.log(`     -> out/phase32/test-${t.id}-semantic.png`);
  console.log(`     -> out/phase32/test-${t.id}-ascii.png`);
  if (t.extra.wordWidthFrac) console.log(`   diegetic word  width ${(t.extra.wordWidthFrac * 100).toFixed(1)}% of frame (floor is 15%)`);
  console.log('');
}
console.log('MEASUREMENT SPLIT — where information is lost:');
console.log('   FORM            judged on test-*-semantic.png alone. If unreadable, nothing downstream matters.');
console.log('   ASCII SAMPLING  judged by comparing the pair. One glyph cell covers');
console.log(`                   ${(W / COLS).toFixed(0)}x${(H / ROWS).toFixed(0)} px = ${((W / COLS) * (H / ROWS)).toFixed(0)} px, so the sampler averages that area to one character.`);
console.log(`   GLYPH SELECTION a cell is one character from a ${RAMP.length - 1}-step ramp; a person 300 px tall is`);
console.log(`                   only ${Math.round((H * 0.86) / (H / ROWS))} cells and a limb ${Math.round(34 * 0.86 * (H / 1000) / (W / COLS))} cells wide.`);
console.log('   RESOLUTION      the lattice is fixed at 240x120; the mask is 1920x1080.');
