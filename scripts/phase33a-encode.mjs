/** Encode the static control to mp4. Frames are written first, then encoded with the bundled ffmpeg. */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33a');
const FR = path.join(OUT, 'frames');
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
const W = 1920, H = 1080, COLS = 240, ROWS = 120, ASPECT = W / H, FRAMES = 150;
const cam = { eye: { x: 0, y: 1.05, z: 0.9315 }, target: { x: 0, y: 1.05, z: 0 }, focal: 0.9 };
const box = makeRoomBox({ centre: { x: 0, y: 1.05, z: 0.9315 - 1.863 / 2 }, half: { x: 1.5, y: 0.9, z: 0.69 } });
const planesWorld = roomPlanes(box), bb = camBasis(cam, ASPECT);
const SEM = { floor: 0.95, backWall: 0.50, ceiling: 0.34, leftWall: 0.16, rightWall: 0.16 };
const DIR = { floor: 'vertical', leftWall: 'diagFall', rightWall: 'diagRise', backWall: 'horizontal', ceiling: 'horizontal' };
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
const canvas = createCanvas(COLS, ROWS);
const geom = { vanishingPoint: [COLS / 2, ROWS * 0.44], planes: Object.keys(SEM).map((id) => ({ id, quad: clipPlaneToViewport(bb, id, planesWorld[id]).screenPolygon.map((p) => [p.x * COLS, p.y * ROWS]), fill: 'sparse', dir: DIR[id], value: SEM[id] })), junctions: [] };
for (const p of geom.planes) for (let i = 0; i < p.quad.length; i++) { const a = p.quad[i], b = p.quad[(i + 1) % p.quad.length]; A.line(canvas, a[0], a[1], b[0], b[1], PRIORITY.junction); }
A.drawRoom(canvas, geom, 'v4-directional', { x0: FIG.cx - 14, y0: FIG.feet - FIG.h - 2, x1: FIG.cx + 14, y1: FIG.feet + 2 });
{
  const pm = createMask(W, H), S = W / COLS;
  drawPerson(pm, FIG.cx * S, FIG.feet * (H / ROWS), FIG.h * (H / ROWS));
  const cells = sampleContourAware(pm, COLS, ROWS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const cell = cells[r][c]; if (cell.ch === ' ') continue; plot(canvas, c, r, cell.ch, cell.edge ? PRIORITY.contour : PRIORITY.contour - 5); }
}
{
  const letters = letterformObjects({ text: 'NAME', role: 'name', position: { x: 0, y: 1.32, z: 1 }, height: 0.62, tracking: 0.9, align: 'centre' });
  const pts = objectWorldPoints(letters);
  if (pts.length) {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const sx = (v) => (0.5 + (v * 0.9) / (2 * ASPECT)) * COLS, sy = (v) => (0.5 - (v * 0.9) / 2) * ROWS;
    for (let r = Math.round(sy(Math.max(...ys))); r <= Math.round(sy(Math.min(...ys))); r++) {
      for (let c = Math.round(sx(Math.min(...xs))); c <= Math.round(sx(Math.max(...xs))); c++) {
        const wx = ((c + 0.5) / COLS - 0.5) * 2 * ASPECT / 0.9, wy = (0.5 - (r + 0.5) / ROWS) * 2 / 0.9;
        let inside = false;
        for (const g of letters) {
          const ls = (g.points || []).map((p) => [g.position.x + p.x, g.position.y + p.y]);
          if (ls.length < 3) continue;
          let ip = false;
          for (let i = 0, j = ls.length - 1; i < ls.length; j = i++) {
            const xi = ls[i][0], yi = ls[i][1], xj = ls[j][0], yj = ls[j][1];
            if ((yi > wy) !== (yj > wy) && wx < ((xj - xi) * (wy - yi)) / (yj - yi) + xi) ip = !ip;
          }
          if (ip) { inside = true; break; }
        }
        if (inside) plot(canvas, c, r, '#', PRIORITY.contour);
      }
    }
  }
}
const lines = canvasToLines(canvas);
function rasterLines(l, outW, outH) {
  const img = { width: outW, height: outH, data: Buffer.alloc(outW * outH * 3) };
  const cellW = outW / COLS, cellH = outH / ROWS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = l[r][c]; if (ch === ' ') continue;
    const g = GLYPH_BY_CODE[ch.charCodeAt(0)]; if (!g) continue;
    const structural = '+-|/\\`,\''.includes(ch);
    const v = structural ? 255 : (ch === '#' ? 230 : ch === '*' ? 190 : ch === '+' ? 150 : ch === ':' ? 110 : 80);
    for (let py = 0; py < GLYPH_H; py++) { const mr = g.rows[py]; if (!mr) continue;
      for (let px = 0; px < GLYPH_W; px++) { if (!(mr & (1 << (GLYPH_W - 1 - px)))) continue;
        const x0 = Math.round(c * cellW + (px * cellW) / GLYPH_W), x1 = Math.round(c * cellW + ((px + 1) * cellW) / GLYPH_W);
        const y0 = Math.round(r * cellH + (py * cellH) / GLYPH_H), y1 = Math.round(r * cellH + ((py + 1) * cellH) / GLYPH_H);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (x < 0 || y < 0 || x >= outW || y >= outH) continue; const o = (y * outW + x) * 3; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; }
      }
    }
  }
  return img;
}
await rm(FR, { recursive: true, force: true });
await mkdir(FR, { recursive: true });
const png = encodePng(rasterLines(lines, W, H));
for (let f = 0; f < FRAMES; f++) await writeFile(path.join(FR, `f${String(f).padStart(4, '0')}.png`), png);
const FFMPEG = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg');
const LIB = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64');
await new Promise((res, rej) => {
  const c = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', '30', '-i', path.join(FR, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(OUT, 'control-static.mp4')], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } });
  let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(e))));
});
console.log('wrote out/phase33a/control-static.mp4 (150 frames, 1920x1080, 30 fps, 5 s)');
