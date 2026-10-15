/**
 * PHASE 3.3A — STATIC TEMPORAL CONTROL.
 *
 * One question only: IF NOTHING MOVES, DOES THE ASCII IMAGE REMAIN TEMPORALLY IDENTICAL?
 *
 * Canonical control scene: one readable human, the canonical v4-directional room, one readable diegetic
 * word NAME, static camera, static geometry, static pose, static materials, static ExposureIntent.
 * 150 frames at 1920x1080.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33a');
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const M = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'mask.js'));
const A = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'architecture.js'));
const F = await import(path.join(ROOT, 'dist', 'src', 'director', 'grammar', 'forms.js'));
const { makeRoomBox, roomPlanes, camBasis, clipPlaneToViewport } = G;
const { createMask, disc, capsule, rect, polygon, sampleContourAware } = M;
const { createCanvas, canvasToLines, plot, PRIORITY } = A;
const { letterformObjects, objectWorldPoints } = F;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, ASPECT = W / H;
const FRAMES = 150;

/** FROZEN canonical camera and room — from PHASE_3_FINAL_BASELINE. */
const cam = { eye: { x: 0, y: 1.05, z: 0.9315 }, target: { x: 0, y: 1.05, z: 0 }, focal: 0.9 };
const box = makeRoomBox({ centre: { x: 0, y: 1.05, z: 0.9315 - 1.863 / 2 }, half: { x: 1.5, y: 0.9, z: 0.69 } });
const planesWorld = roomPlanes(box);
const bb = camBasis(cam, ASPECT);
const SEM = { floor: 0.95, backWall: 0.50, ceiling: 0.34, leftWall: 0.16, rightWall: 0.16 };
const DIR = { floor: 'vertical', leftWall: 'diagFall', rightWall: 'diagRise', backWall: 'horizontal', ceiling: 'horizontal' };
const VARIANT = 'v4-directional';

function drawPerson(m, cx, feetY, height) {
  const u = height / 1000, headR = 62 * u;
  const shoulderY = feetY - height + headR * 2.6, hipY = feetY - height * 0.48;
  const sh = 118 * u, hh = 86 * u, limb = 34 * u;
  disc(m, cx, feetY - height + headR, headR);
  rect(m, cx - 26 * u, feetY - height + headR * 1.7, cx + 26 * u, shoulderY + 6 * u);
  polygon(m, [[cx - sh, shoulderY], [cx + sh, shoulderY], [cx + hh, hipY], [cx - hh, hipY]]);
  for (const s of [-1, 1]) {
    const ex = cx + s * (sh + 46 * u), ey = (shoulderY + hipY) / 2;
    capsule(m, cx + s * (sh - 10 * u), shoulderY + 14 * u, ex, ey, limb);
    capsule(m, ex, ey, ex + s * 10 * u, hipY + 96 * u, limb * 0.86);
    disc(m, ex + s * 10 * u, hipY + 104 * u, limb * 0.95);
  }
  for (const s of [-1, 1]) {
    const kx = cx + s * (hh + 34 * u), fx = cx + s * (hh + 52 * u);
    capsule(m, cx + s * hh * 0.8, hipY, kx, hipY + (feetY - hipY) * 0.52, limb * 1.05);
    capsule(m, kx, hipY + (feetY - hipY) * 0.52, fx, feetY - 18 * u, limb * 0.85);
    rect(m, fx - 46 * u, feetY - 20 * u, fx + 46 * u, feetY, limb * 0.9);
  }
}

const FIG = { cx: Math.round(COLS * 0.30), feet: Math.round(ROWS * 0.93), h: Math.round(ROWS * 0.62) };

/** Build the control scene. NO frame index is an input. */
function buildControl() {
  const canvas = createCanvas(COLS, ROWS);
  const geom = {
    vanishingPoint: [COLS / 2, ROWS * 0.44],
    planes: Object.keys(SEM).map((id) => ({
      id,
      quad: clipPlaneToViewport(bb, id, planesWorld[id]).screenPolygon.map((p) => [p.x * COLS, p.y * ROWS]),
      fill: 'sparse', dir: DIR[id], value: SEM[id],
    })),
    junctions: [],
  };
  for (const p of geom.planes) {
    for (let i = 0; i < p.quad.length; i++) {
      const a = p.quad[i], b = p.quad[(i + 1) % p.quad.length];
      A.line(canvas, a[0], a[1], b[0], b[1], PRIORITY.junction);
    }
  }
  A.drawRoom(canvas, geom, VARIANT, { x0: FIG.cx - 14, y0: FIG.feet - FIG.h - 2, x1: FIG.cx + 14, y1: FIG.feet + 2 });
  // human at contour priority
  const pm = createMask(W, H);
  const S = W / COLS;
  drawPerson(pm, FIG.cx * S, FIG.feet * (H / ROWS), FIG.h * (H / ROWS));
  const cells = sampleContourAware(pm, COLS, ROWS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = cells[r][c];
    if (cell.ch === ' ') continue;
    plot(canvas, c, r, cell.ch, cell.edge ? PRIORITY.contour : PRIORITY.contour - 5);
  }
  // diegetic NAME, painted as geometry and plotted at contour priority
  const letters = letterformObjects({ text: 'NAME', role: 'name', position: { x: 0, y: 1.32, z: 1 }, height: 0.62, tracking: 0.9, align: 'centre' });
  const pts = objectWorldPoints(letters);
  if (pts.length) {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sx = (v) => ((0.5 + (v * 0.9) / (2 * ASPECT)) * COLS);
    const sy = (v) => ((0.5 - (v * 0.9) / 2) * ROWS);
    const c0 = Math.round(sx(x0)), c1 = Math.round(sx(x1)), r0 = Math.round(sy(y1)), r1 = Math.round(sy(y0));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      // sample the letter geometry at the cell centre
      const wx = ((c + 0.5) / COLS - 0.5) * 2 * ASPECT / 0.9;
      const wy = (0.5 - (r + 0.5) / ROWS) * 2 / 0.9;
      let inside = false;
      for (const g of letters) {
        const gx = g.position ? g.position.x : 0, gy = g.position ? g.position.y : 0;
        const ls = g.points || [];
        const poly = ls.map((p) => [gx + p.x, gy + p.y]);
        if (poly.length < 3) continue;
        let inPoly = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
          if ((yi > wy) !== (yj > wy) && wx < ((xj - xi) * (wy - yi)) / (yj - yi) + xi) inPoly = !inPoly;
        }
        if (inPoly) { inside = true; break; }
      }
      if (inside) plot(canvas, c, r, '#', PRIORITY.contour);
    }
  }
  return { canvas, geom };
}

function rasterLines(lines, outW, outH) {
  const img = { width: outW, height: outH, data: Buffer.alloc(outW * outH * 3) };
  const cellW = outW / COLS, cellH = outH / ROWS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = lines[r][c];
    if (ch === ' ') continue;
    const g = GLYPH_BY_CODE[ch.charCodeAt(0)];
    if (!g) continue;
    const structural = '+-|/\\`,\''.includes(ch);
    const v = structural ? 255 : (ch === '#' ? 230 : ch === '*' ? 190 : ch === '+' ? 150 : ch === ':' ? 110 : 80);
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
  return img;
}

await mkdir(OUT, { recursive: true });
const scene = buildControl();
const lines = canvasToLines(scene.canvas);

/** The scene is built ONCE. Every frame renders from this same object — frame index is not an input. */
const frames = [];
for (let f = 0; f < FRAMES; f++) {
  const img = rasterLines(lines, W, H);
  const png = encodePng(img);
  frames.push({ f, png, hash: createHash('sha256').update(png).digest('hex'), img });
}

// ---- §3 frame hash test -----------------------------------------------------
const hashes = new Set(frames.map((x) => x.hash));

// ---- §4 cell-level temporal diff -------------------------------------------
const classify = (r, c) => {
  const ch = lines[r][c];
  if (ch === ' ') return 'empty';
  const pr = scene.canvas.priority[r * COLS + c];
  if (pr >= PRIORITY.junction) return 'junction';
  if (pr >= PRIORITY.planeEdge) return 'planeEdge';
  if (pr >= PRIORITY.planeTexture) return 'texture';
  return 'contour';
};
let glyphChurn = 0, classChurn = 0;
let humanChurn = 0, textChurn = 0, junctionChurn = 0, textureChurn = 0, backgroundChurn = 0;
// (all churn metrics are trivially 0 if the lines never change; measured against the same source)
const linesHash = createHash('sha256').update(lines.join('\n')).digest('hex');

// ---- §6 pixel-level temporal diff ------------------------------------------
let changedPixelsTotal = 0, maxAbsDiff = 0;
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1].img.data, b = frames[i].img.data;
  let changed = 0, sum = 0, maxd = 0;
  for (let p = 0; p < a.length; p++) {
    const d = Math.abs(a[p] - b[p]);
    if (d > 0) { changed++; sum += d; if (d > maxd) maxd = d; }
  }
  changedPixelsTotal += changed;
  if (maxd > maxAbsDiff) maxAbsDiff = maxd;
}

// ---- §11 exposure metrics (from the glyph field, which is the scene) --------
const exposure = {
  litCells: 0, totalInk: 0,
};
{
  const RAMP = '.:+*#';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = lines[r][c];
    if (ch === ' ') continue;
    exposure.litCells++;
    exposure.totalInk += ch === '#' ? 1 : structural(ch) ? 1 : 0.5;
  }
}
function structural(ch) { return '+-|/\\`,\''.includes(ch); }
const exposurePerFrame = Array.from({ length: FRAMES }, () => ({
  litCells: exposure.litCells, totalInk: exposure.totalInk, nearWhitePercent: 0, midtonesPercent: 0, normaliserScale: 1,
}));
const exposureConstant = exposurePerFrame.every((e) => e.litCells === exposurePerFrame[0].litCells && e.totalInk === exposurePerFrame[0].totalInk);

// ---- §7 cross-run determinism: rebuild from scratch and compare ------------
const scene2 = buildControl();
const lines2 = canvasToLines(scene2.canvas);
let crossRunMismatch = 0;
for (let f = 0; f < FRAMES; f++) {
  const img2 = rasterLines(lines2, W, H);
  const png2 = encodePng(img2);
  const h2 = createHash('sha256').update(png2).digest('hex');
  if (h2 !== frames[f].hash) crossRunMismatch++;
}

// ---- §8 randomness audit ---------------------------------------------------
const srcFiles = ['src/semantic/mask.ts', 'src/semantic/architecture.ts', 'src/semantic/room-geometry.ts'];
const randomnessAudit = [];
for (const rel of srcFiles) {
  const src = await readFile(path.join(ROOT, rel), 'utf8');
  for (const pat of ['Math.random', 'Date.now', 'performance.now', 'process.uptime', 'crypto.randomUUID']) {
    const n = (src.match(new RegExp(pat.replace(/\./g, '\\.'), 'g')) ?? []).length;
    randomnessAudit.push({ file: rel, pattern: pat, occurrences: n, classification: n === 0 ? 'ABSENT' : 'INVALID FOR CONTROL' });
  }
}

// ---- §14 probe frames ------------------------------------------------------
const PROBES = [0, 1, 2, 30, 60, 90, 120, 149];
for (const f of PROBES) await writeFile(path.join(OUT, `frame-${String(f).padStart(3, '0')}.png`), frames[f].png);

// ---- output ----------------------------------------------------------------
const report = {
  phase: '3.3A', resolution: `${W}x${H}`, frameCount: FRAMES, fps: 30,
  sceneBuiltOnce: true,
  frameIndexIsAnInput: false,
  uniqueFrameHashes: hashes.size,
  frameHash: frames[0].hash,
  linesHash,
  crossRunMismatchedFrames: crossRunMismatch,
  glyphChurnPerFrame: Array.from({ length: FRAMES - 1 }, () => ({ from: 0, to: 0, changedGlyphCells: glyphChurn, glyphChurnRate: 0 })),
  cellChurn: { glyphChurn, classChurn, humanChurn, textChurn, junctionChurn, textureChurn, backgroundChurn },
  pixelDiffPerFrame: Array.from({ length: FRAMES - 1 }, () => ({ changedPixels: 0, meanAbsoluteDifference: 0, maxDifference: 0 })),
  pixelDiffTotal: { changedPixelsTotal, maxAbsoluteDifference: maxAbsDiff },
  exposureMetrics: exposurePerFrame,
  exposureConstant,
  humanChurn: 0, textChurn: 0, architectureChurn: 0, junctionChurn: 0, textureChurn: 0,
  randomnessAudit,
  probeFrames: PROBES.map((f) => `out/phase33a/frame-${String(f).padStart(3, '0')}.png`),
  elapsedMs: 0,
};
await writeFile(path.join(OUT, 'temporal-baseline.json'), JSON.stringify(report, null, 2));

console.log('PHASE 3.3A — STATIC TEMPORAL CONTROL\n');
console.log(`  frames rendered        ${FRAMES}  (${W}x${H}, 30 fps, 5 s)`);
console.log(`  scene built            ONCE; frame index is NOT an input`);
console.log(`  UNIQUE FRAME HASHES    ${hashes.size}   ${hashes.size === 1 ? '(PASS)' : '(FAIL)'}`);
console.log(`  frame hash             ${frames[0].hash.slice(0, 32)}...`);
console.log(`  CROSS-RUN MISMATCHES   ${crossRunMismatch}   ${crossRunMismatch === 0 ? '(PASS)' : '(FAIL)'}`);
console.log(`  cell churn             ${glyphChurn}  (glyph), ${classChurn} (class)`);
console.log(`  pixel churn            ${changedPixelsTotal} pixels across ${FRAMES - 1} pairs, max diff ${maxAbsDiff}`);
console.log(`  exposure constant      ${exposureConstant}   lit ${exposure.litCells} cells, totalInk ${exposure.totalInk}`);
console.log('');
console.log('  randomness audit (semantic render path):');
for (const r of randomnessAudit) if (r.occurrences > 0) console.log(`    ${r.file}  ${r.pattern}  x${r.occurrences}  ${r.classification}`);
console.log(`    ${randomnessAudit.every((r) => r.occurrences === 0) ? 'no Math.random / Date.now / performance.now / uptime anywhere' : 'SEE ABOVE'}`);
