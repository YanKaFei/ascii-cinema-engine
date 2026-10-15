/**
 * PHASE 3.2B — FIVE ARCHITECTURE VARIANTS.
 *
 * MAKE A ROOM READ AS A ROOM. The external review found the human reads and the room does not: it became
 * "a large rectangular character field rather than an architectural interior". The semantic geometry is
 * IDENTICAL across all five variants — only the ASCII material strategy changes, which isolates the
 * architecture renderer and nothing else.
 *
 *   node scripts/phase32b.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase32b');
const M = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'mask.js'));
const A = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'architecture.js'));
const { createMask, disc, capsule, rect, polygon, maskStats, writeMaskPng, sampleContourAware, at } = M;
const { createCanvas, drawRoom, canvasToLines, plot, line, PRIORITY } = A;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120;

/** The person, drawn as masses — unchanged from Phase 3.2A, which the external review passed. */
function drawHuman(m, cx, feetY, height) {
  const u = height / 1000;
  const headR = 62 * u;
  const shoulderY = feetY - height + headR * 2.6;
  const hipY = feetY - height * 0.48;
  const shoulderHalf = 118 * u, hipHalf = 86 * u, limb = 34 * u;
  disc(m, cx, feetY - height + headR, headR);
  rect(m, cx - 26 * u, feetY - height + headR * 1.7, cx + 26 * u, shoulderY + 6 * u);
  polygon(m, [[cx - shoulderHalf, shoulderY], [cx + shoulderHalf, shoulderY], [cx + hipHalf, hipY], [cx - hipHalf, hipY]]);
  for (const s of [-1, 1]) {
    const ex = cx + s * (shoulderHalf + 46 * u), ey = (shoulderY + hipY) / 2;
    capsule(m, cx + s * (shoulderHalf - 10 * u), shoulderY + 14 * u, ex, ey, limb);
    capsule(m, ex, ey, ex + s * 10 * u, hipY + 96 * u, limb * 0.86);
    disc(m, ex + s * 10 * u, hipY + 104 * u, limb * 0.95);
  }
  for (const s of [-1, 1]) {
    const kx = cx + s * (hipHalf + 34 * u), fx = cx + s * (hipHalf + 52 * u);
    capsule(m, cx + s * hipHalf * 0.8, hipY, kx, hipY + (feetY - hipY) * 0.52, limb * 1.05);
    capsule(m, kx, hipY + (feetY - hipY) * 0.52, fx, feetY - 18 * u, limb * 0.85);
    rect(m, fx - 46 * u, feetY - 20 * u, fx + 46 * u, feetY, limb * 0.9);
  }
}

/**
 * The room, as SCREEN-SPACE geometry. ONE definition, shared by all five variants and by the semantic
 * preview, so that any difference between variants is attributable to the material strategy alone.
 */
function roomGeometry() {
  const vp = [W * 0.52, H * 0.44];
  const bw = { x0: W * 0.30, y0: H * 0.32, x1: W * 0.74, y1: H * 0.72 };
  const backWall = [[bw.x0, bw.y0], [bw.x1, bw.y0], [bw.x1, bw.y1], [bw.x0, bw.y1]];
  const ceiling = [[bw.x0, bw.y0], [bw.x1, bw.y0], [W, 0], [0, 0]];
  const floor = [[bw.x0, bw.y1], [bw.x1, bw.y1], [W, H], [0, H]];
  const leftWall = [[bw.x0, bw.y0], [bw.x0, bw.y1], [0, H], [0, 0]];
  const rightWall = [[bw.x1, bw.y0], [bw.x1, bw.y1], [W, H], [W, 0]];
  return {
    vanishingPoint: vp,
    planes: [
      { id: "backWall", quad: backWall, fill: "sparse", density: 0.05 },
      { id: "floor", quad: floor, fill: "directional", dir: "vertical" },
      { id: "leftWall", quad: leftWall, fill: "directional", dir: "diagFall" },
      { id: "rightWall", quad: rightWall, fill: "directional", dir: "diagRise" },
      { id: "ceiling", quad: ceiling, fill: "none" },
    ],
    /**
     * JUNCTIONS — the recognition-critical features, at the top of the priority order. Each is a real
     * wall/wall or wall/floor intersection, drawn as a continuous line so sampling cannot erase it.
     */
    junctions: [
      { a: "backWall", b: "ceiling", from: [bw.x0, bw.y0], to: [bw.x1, bw.y0] },
      { a: "backWall", b: "floor", from: [bw.x0, bw.y1], to: [bw.x1, bw.y1] },
      { a: "leftWall", b: "backWall", from: [bw.x0, bw.y0], to: [bw.x0, bw.y1] },
      { a: "rightWall", b: "backWall", from: [bw.x1, bw.y0], to: [bw.x1, bw.y1] },
    ],
  };
}

/** Reuse the passed Phase 3.2A contour-aware sampler for the SUBJECT only. */
function personCells(mask, box) {
  const cells = sampleContourAware(mask, COLS, ROWS);
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = cells[r][c];
    if (cell.ch === " ") continue;
    const px = c * (W / COLS), py = r * (H / ROWS);
    if (px < box.x0 - 20 || px > box.x1 + 20 || py < box.y0 - 20 || py > box.y1 + 20) continue;
    out.push({ r, c, ch: cell.ch, edge: cell.edge, value: cell.value });
  }
  return out;
}

function rasterLines(lines, outW, outH) {
  const img = { width: outW, height: outH, data: Buffer.alloc(outW * outH * 3) };
  const cellW = outW / COLS, cellH = outH / ROWS;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = lines[r][c];
      if (ch === " ") continue;
      const g = GLYPH_BY_CODE[ch.charCodeAt(0)];
      if (!g) continue;
      const isEdge = "+-|/\\`,'.".includes(ch) && ch !== ".";
      const v = isEdge ? 255 : 150;
      for (let py = 0; py < GLYPH_H; py++) {
        const mr = g.rows[py]; if (!mr) continue;
        for (let px = 0; px < GLYPH_W; px++) {
          if (!(mr & (1 << (GLYPH_W - 1 - px)))) continue;
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
  return img;
}

await mkdir(OUT, { recursive: true });
const VARIANTS = ["v1-edge-only", "v2-edge-sparse", "v3-depth-density", "v4-directional", "v5-hybrid"];
const geom = roomGeometry();
const report = [];

for (const variant of VARIANTS) {
  // ---- SEMANTIC PREVIEW: identical geometry for every variant -----------------
  const mask = createMask(W, H);
  for (const p of geom.planes) {
    const v = p.id === "ceiling" ? 0.16 : p.id === "floor" ? 0.34 : p.id === "backWall" ? 0.5 : 0.24;
    polygon(mask, p.quad, v);
  }
  const FIG = { cx: W * 0.26, feet: H * 0.90, h: H * 0.58 };
  drawHuman(mask, FIG.cx, FIG.feet, FIG.h);
  const st = maskStats(mask);
  await writeMaskPng(mask, path.join(OUT, `room-${variant}-semantic.png`));

  // ---- ASCII: same geometry, variant-specific MATERIAL -----------------------
  const canvas = createCanvas(COLS, ROWS);
  const sx = COLS / W, sy = ROWS / H;
  const g2 = {
    vanishingPoint: [geom.vanishingPoint[0] * sx, geom.vanishingPoint[1] * sy],
    planes: geom.planes.map((p) => ({ ...p, quad: p.quad.map(([x, y]) => [x * sx, y * sy]) })),
    junctions: geom.junctions.map((j) => ({
      ...j, from: [j.from[0] * sx, j.from[1] * sy], to: [j.to[0] * sx, j.to[1] * sy],
    })),
  };
  const boxPx = { x0: FIG.cx - H * 0.18, y0: H - (FIG.feet - FIG.h) - H * 0.02, x1: FIG.cx + H * 0.18, y1: FIG.feet + H * 0.02 };
  const boxCells = { x0: boxPx.x0 * sx, y0: boxPx.y0 * sy, x1: boxPx.x1 * sx, y1: boxPx.y1 * sy };
  const stats = drawRoom(canvas, g2, variant, boxCells);

  // the SUBJECT is drawn last at contour priority, so it is never erased by plane texture
  for (const cell of personCells(mask, boxPx)) {
    plot(canvas, cell.c, cell.r, cell.ch, cell.edge ? PRIORITY.contour : PRIORITY.contour - 5);
  }

  const lines = canvasToLines(canvas);
  await writeFile(path.join(OUT, `room-${variant}-ascii.png`), encodePng(rasterLines(lines, W, H)));

  const backFill = stats.planeFillRatio.backWall ?? 0;
  report.push({
    variant,
    semantic: `out/phase32b/room-${variant}-semantic.png`,
    ascii: `out/phase32b/room-${variant}-ascii.png`,
    junctionsDrawn: stats.junctionsDrawn,
    textureCells: stats.textureCells,
    rearWallFillRatio: +backFill.toFixed(4),
    subjectHeightFrac: +st.heightFrac.toFixed(3),
  });
}

await writeFile(path.join(OUT, 'phase32b-report.json'), JSON.stringify({ resolution: `${W}x${H}`, lattice: `${COLS}x${ROWS}`, note: 'identical semantic geometry across all five; only the ASCII material strategy differs', variants: report }, null, 2));

console.log('PHASE 3.2B — five architecture variants, identical geometry\n');
console.log('variant             junctions  texture cells  REAR-WALL FILL  subject height');
for (const r of report) {
  console.log(`  ${r.variant.padEnd(18)} ${String(r.junctionsDrawn).padStart(3)}      ${String(r.textureCells).padStart(6)}         ${(r.rearWallFillRatio * 100).toFixed(1).padStart(5)}%          ${(r.subjectHeightFrac * 100).toFixed(0)}%`);
}
console.log('\nthe variant that reads most strongly as a WALL rather than a SCREEN is the one to keep.');
console.log('rear-wall fill ratio is the measured quantity the brief asks for (item 8).');
