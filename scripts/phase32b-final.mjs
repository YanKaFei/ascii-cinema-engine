/**
 * PHASE 3.2B FINAL — five ASCII architecture variants on the FROZEN geometry, and the external gate.
 *
 * Frozen: roomGeometry, camera framing, projection, near+viewport clipping, rasteriser, compositing,
 * human, NAME, collision logic, junction priorities. This script changes NO geometry.
 *
 *   node scripts/phase32b-final.mjs
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase32b');
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const M = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'mask.js'));
const A = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'architecture.js'));
const { makeRoomBox, roomPlanes, camBasis, clipPlaneToViewport } = G;
const { createMask, disc, capsule, rect, polygon, sampleContourAware, writeMaskPng } = M;
const { createCanvas, canvasToLines, plot, PRIORITY } = A;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, ASPECT = W / H;

/** THE FROZEN CAMERA AND ROOM — unchanged from the accepted framing solution. */
const cam = { eye: { x: 0, y: 1.05, z: 0.9315 }, target: { x: 0, y: 1.05, z: 0 }, focal: 0.9 };
const box = makeRoomBox({ centre: { x: 0, y: 1.05, z: 0.9315 - 1.863 / 2 }, half: { x: 1.5, y: 0.9, z: 0.69 } });
const planesWorld = roomPlanes(box);
const bb = camBasis(cam, ASPECT);

/** THE CANONICAL SEMANTIC ORACLE VALUES — the room readability benchmark, not global lighting. */
const SEM = { floor: 0.95, backWall: 0.50, ceiling: 0.34, leftWall: 0.16, rightWall: 0.16 };
const DIR = { floor: 'vertical', leftWall: 'diagFall', rightWall: 'diagRise', backWall: 'horizontal', ceiling: 'horizontal' };

/** The person — unchanged from the representation the external review passed. */
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

const VARIANTS = ['v1-edge-only', 'v2-edge-sparse', 'v3-depth-density', 'v4-directional', 'v5-hybrid'];
await mkdir(path.join(OUT, 'variants'), { recursive: true });
await mkdir(path.join(OUT, 'blind-final'), { recursive: true });

const FIG = { cx: Math.round(COLS * 0.30), feet: Math.round(ROWS * 0.93), h: Math.round(ROWS * 0.62) };
const metrics = {};

for (const variant of VARIANTS) {
  // ---- semantic preview (traceability only) ---------------------------------
  const mask = createMask(W, H);
  const S = W / COLS;
  for (const [id, val] of Object.entries(SEM)) {
    const poly = clipPlaneToViewport(bb, id, planesWorld[id]).screenPolygon.map((p) => [p.x * W, p.y * H]);
    if (poly.length >= 3) polygon(mask, poly, val);
  }
  drawPerson(mask, FIG.cx * S, FIG.feet * (H / ROWS), FIG.h * (H / ROWS));
  await writeMaskPng(mask, path.join(OUT, 'variants', `${variant}-semantic.png`));

  // ---- ASCII: same geometry, variant material, PLANE VALUE CARRIED -----------
  const canvas = createCanvas(COLS, ROWS);
  const geom = {
    vanishingPoint: [COLS / 2, ROWS * 0.44],
    planes: Object.keys(SEM).map((id) => ({
      id,
      quad: clipPlaneToViewport(bb, id, planesWorld[id]).screenPolygon.map((p) => [p.x * COLS, p.y * ROWS]),
      fill: 'sparse',
      dir: DIR[id],
      /** the semantic value, so plane contrast survives into the glyph field */
      value: SEM[id],
    })),
    junctions: [],
  };
  // junctions from the semantic polygon edges, at the highest priority
  for (const p of geom.planes) {
    for (let i = 0; i < p.quad.length; i++) {
      const a = p.quad[i], b = p.quad[(i + 1) % p.quad.length];
      A.line(canvas, a[0], a[1], b[0], b[1], PRIORITY.junction);
    }
  }
  A.drawRoom(canvas, geom, variant, { x0: FIG.cx - 14, y0: FIG.feet - FIG.h - 2, x1: FIG.cx + 14, y1: FIG.feet + 2 });

  // ---- the person at contour priority, so texture never erases it ------------
  const pm = createMask(W, H);
  drawPerson(pm, FIG.cx * S, FIG.feet * (H / ROWS), FIG.h * (H / ROWS));
  const cells = sampleContourAware(pm, COLS, ROWS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = cells[r][c];
    if (cell.ch === ' ') continue;
    plot(canvas, c, r, cell.ch, cell.edge ? PRIORITY.contour : PRIORITY.contour - 5);
  }

  const lines = canvasToLines(canvas);
  const png = encodePng(rasterLines(lines, W, H));
  await writeFile(path.join(OUT, 'variants', `${variant}.png`), png);

  // ---- mechanical metrics (diagnostic only) ---------------------------------
  let structural = 0, junction = 0, texture = 0;
  const perPlane = {};
  for (const id of Object.keys(SEM)) perPlane[id] = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = lines[r][c];
    if (ch === ' ') continue;
    const pr = canvas.priority[r * COLS + c];
    if (pr >= PRIORITY.junction) junction++;
    else if (pr >= PRIORITY.planeEdge) structural++;
    else if (pr >= PRIORITY.planeTexture) texture++;
    for (const p of geom.planes) {
      let inside = false;
      const px = c + 0.5, py = r + 0.5;
      for (let i = 0, j = p.quad.length - 1; i < p.quad.length; j = i++) {
        const xi = p.quad[i][0], yi = p.quad[i][1], xj = p.quad[j][0], yj = p.quad[j][1];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) perPlane[p.id]++;
    }
  }
  // rear-wall fill ratio: textured cells inside the back wall / its total cells
  const backCells = perPlane.backWall || 1;
  let backTexture = 0;
  const backQuad = geom.planes.find((p) => p.id === 'backWall').quad;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (lines[r][c] === ' ') continue;
    let inside = false;
    const px = c + 0.5, py = r + 0.5;
    for (let i = 0, j = backQuad.length - 1; i < backQuad.length; j = i++) {
      const xi = backQuad[i][0], yi = backQuad[i][1], xj = backQuad[j][0], yj = backQuad[j][1];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside && canvas.priority[r * COLS + c] < PRIORITY.planeEdge) backTexture++;
  }
  // connected components of the structural skeleton (4-connectivity on junction+edge cells)
  {
    const seen = new Uint8Array(COLS * ROWS);
    let comps = 0;
    const isStruct = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS && canvas.priority[r * COLS + c] >= PRIORITY.planeEdge;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (seen[r * COLS + c] || !isStruct(r, c)) continue;
      comps++;
      const stack = [[r, c]]; seen[r * COLS + c] = 1;
      while (stack.length) {
        const [y, x] = stack.pop();
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ny = y + dy, nx = x + dx;
          if (!isStruct(ny, nx) || seen[ny * COLS + nx]) continue;
          seen[ny * COLS + nx] = 1; stack.push([ny, nx]);
        }
      }
    }
    metrics[variant] = {
      structuralEdgeCells: structural, junctionCells: junction, textureCells: texture,
      perPlaneCells: perPlane,
      rearWallFillRatio: +(backTexture / backCells).toFixed(4),
      skeletonComponents: comps,
      personCells: FIG.h,
      /** plane contrast WITHIN the glyph field: distinct interior glyphs per plane */
      planeInteriorGlyphs: Object.fromEntries(Object.keys(SEM).map((id) => {
        const ramp = '.:+*#';
        return [id, ramp[Math.round(SEM[id] * (ramp.length - 1))]];
      })),
    };
  }
}

// ---- blind set: five shuffled ASCII PNGs, no answers inside -------------------
const order = [3, 0, 4, 1, 2];   // shuffled
const key = [];
for (let i = 0; i < order.length; i++) {
  const variant = VARIANTS[order[i]];
  const buf = await readFile(path.join(OUT, 'variants', `${variant}.png`));
  const name = `still-${String(i + 1).padStart(2, '0')}.png`;
  await writeFile(path.join(OUT, 'blind-final', name), buf);
  key.push({ still: name, variant, sha256: createHash('sha256').update(buf).digest('hex'), width: W, height: H });
}
await writeFile(path.join(OUT, 'ANSWER-KEY.json'), JSON.stringify({ note: 'Do not open before rating. External question: "What do you see?"', key }, null, 2));
await writeFile(path.join(OUT, 'architecture-metrics.json'), JSON.stringify({ resolution: `${W}x${H}`, semanticValues: SEM, variants: metrics }, null, 2));

// ---- report ------------------------------------------------------------------
console.log('PHASE 3.2B — five ASCII architecture variants, frozen geometry\n');
const ramp = '.:+*#';
console.log('PLANE IDENTITY CARRIED INTO ASCII');
console.log('  plane      semantic value   interior glyph');
for (const id of Object.keys(SEM)) console.log(`  ${id.padEnd(10)} ${SEM[id].toFixed(2).padStart(8)}        ${ramp[Math.round(SEM[id] * (ramp.length - 1))]}`);
console.log('');
console.log('MECHANICAL METRICS (diagnostic only)');
console.log('  variant            struct  junction  texture   rearFill  skeletonComps');
for (const v of VARIANTS) {
  const m = metrics[v];
  console.log(`  ${v.padEnd(18)} ${String(m.structuralEdgeCells).padStart(6)} ${String(m.junctionCells).padStart(9)} ${String(m.textureCells).padStart(8)} ${(m.rearWallFillRatio * 100).toFixed(1).padStart(9)}%  ${String(m.skeletonComponents).padStart(13)}`);
}
console.log('\nBLIND SET (shuffled, unlabelled, no answers inside)');
for (const k of key) console.log(`  out/phase32b/blind-final/${k.still}  <- ${k.variant}  sha256 ${k.sha256.slice(0, 16)}...`);
console.log('\nkey: out/phase32b/ANSWER-KEY.json (outside the blind folder)');
console.log('traceability: out/phase32b/variants/*.png');
