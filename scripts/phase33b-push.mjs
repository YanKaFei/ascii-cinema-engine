/**
 * PHASE 3.3B — SINGLE-VARIABLE CAMERA PUSH.
 *
 * The camera is the ONLY changing semantic input. Human, pose, room, NAME, materials, ExposureIntent and
 * lighting are all frozen. Frame 0 reproduces the Phase 3.3A canonical still exactly.
 *
 *   node scripts/phase33b-push.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33b');
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const M = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'mask.js'));
const A = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'architecture.js'));
const F = await import(path.join(ROOT, 'dist', 'src', 'director', 'grammar', 'forms.js'));
const { makeRoomBox, roomPlanes, camBasis, toCamSpace, clipPlaneToViewport, projectRoom } = G;
const { createMask, disc, capsule, rect, polygon, sampleContourAware, at } = M;
const { createCanvas, canvasToLines, plot, PRIORITY, LINE_GLYPHS } = A;
const { letterformObjects, objectWorldPoints } = F;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, ASPECT = W / H;
const FRAMES = 90, FPS = 30;

/** FROZEN. The room box and every semantic form are built ONCE and never rebuilt. */
const HALF = { x: 1.5, y: 0.9, z: 0.69 };
const CAM_Z0 = 0.9315, CAM_Z1 = 0.5756, FOCAL = 0.9, EYE_Y = 1.05;
const box = makeRoomBox({ centre: { x: 0, y: EYE_Y, z: CAM_Z0 - 0.35 * HALF.z - HALF.z }, half: HALF });
const planesWorld = roomPlanes(box);
const SEM = { floor: 0.95, backWall: 0.50, ceiling: 0.34, leftWall: 0.16, rightWall: 0.16 };
const DIR = { floor: 'vertical', leftWall: 'diagFall', rightWall: 'diagRise', backWall: 'horizontal', ceiling: 'horizontal' };
const VARIANT = 'v4-directional';

const FIG_WORLD = { x: -1.05, feetY: EYE_Y - HALF.y, h: 1.6 };
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

/** --- FIXED world-space person geometry, built ONCE (the mask is in screen space, so it is per-frame) */
const personScreen = (camSpec) => {
  // project the fixed world figure into screen pixels at this camera
  const proj = (p) => { const q = projectRoom(camSpec, p, ASPECT); return { x: q.x * W, y: q.y * H, v: q.visible }; };
  const top = proj({ x: FIG_WORLD.x, y: FIG_WORLD.feetY + FIG_WORLD.h, z: -0.2 });
  const bot = proj({ x: FIG_WORLD.x, y: FIG_WORLD.feetY, z: -0.2 });
  return { cx: (top.x + bot.x) / 2, top: top.y, bot: bot.y, h: Math.abs(bot.y - top.y) };
};

/**
 * ⚠ THE NAME'S DEPTH WAS WRONG, AND ONLY WORLD-SPACE PROJECTION COULD REVEAL IT.
 *
 * It was authored at `z = +1`. **The room's wall is at `z = -0.69` and the eye starts at `z = 0.93`, so
 * `z = +1` is BEHIND THE CAMERA** — the text never projected on any frame, and it took out the three NAME
 * anchors with it (270 invalid anchor projections, exactly 3 x 90).
 *
 * Phase 3.2B authored the name in SCREEN space, so the wrong depth was invisible. **Projecting it in world
 * space surfaced the error immediately** — which is the argument for world-space semantic forms.
 *
 * Correct placement: on the wall surface, just in front of it.
 */
const NAME_Z = -0.69 + 0.05;
const NAME = letterformObjects({ text: 'NAME', role: 'name', position: { x: 0, y: 1.32, z: NAME_Z }, height: 0.62, tracking: 0.9, align: 'centre' });

/**
 * Build the glyph field for a camera. ONLY `bb` varies between frames.
 *
 * ⚠ THE PLANE QUADS ARE THE **PROJECTED** ROOM FACES, so plane texture lives in PLANE/SURFACE space by
 * construction: a mark is placed on the plane and projects with it. There is no independent screen-space
 * phase, which §12 asks to determine — and this is the evidence, not an assumption.
 */
function buildFrame(bb, camSpec) {
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
  for (const p of geom.planes) for (let i = 0; i < p.quad.length; i++) {
    const a = p.quad[i], b = p.quad[(i + 1) % p.quad.length];
    A.line(canvas, a[0], a[1], b[0], b[1], PRIORITY.junction);
  }
  A.drawRoom(canvas, geom, VARIANT, { x0: 0, y0: 0, x1: -1, y1: -1 });
  // human: fixed WORLD geometry, projected, then silhouette-sampled at contour priority
  const ps = personScreen(camSpec);
  const pm = createMask(W, H);
  drawPerson(pm, ps.cx, ps.bot, ps.h);
  const cells = sampleContourAware(pm, COLS, ROWS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = cells[r][c];
    if (cell.ch === ' ') continue;
    plot(canvas, c, r, cell.ch, cell.edge ? PRIORITY.contour : PRIORITY.contour - 5);
  }
  // NAME: fixed WORLD geometry on the wall, projected
  const pts = objectWorldPoints(NAME);
  const proj = (p) => { const q = projectRoom(camSpec, p, ASPECT); return { x: q.x * COLS, y: q.y * ROWS, v: q.visible }; };
  for (const g of NAME) {
    for (const p of (g.points || [])) {
      const a = proj({ x: g.position.x + p.x, y: g.position.y + p.y, z: g.position.z + p.z });
      if (a.v) plot(canvas, a.x, a.y, '#', PRIORITY.contour);
    }
  }
  void pts;
  return { canvas, geom, personScreen: ps };
}

function rasterLines(lines, outW, outH) {
  const img = { width: outW, height: outH, data: Buffer.alloc(outW * outH * 3) };
  const cellW = outW / COLS, cellH = outH / ROWS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = lines[r][c]; if (ch === ' ') continue;
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

const smoothstep = (t) => t * t * (3 - 2 * t);

/** DETERMINISTIC world probes: 25 per plane, from a fixed seed. */
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry(20260101);
const PROBES = [];
for (const id of Object.keys(SEM)) {
  const quad = planesWorld[id];
  for (let i = 0; i < 25; i++) {
    const u = 0.15 + rnd() * 0.7, v = 0.15 + rnd() * 0.7;
    // bilinear inside the world quad
    const a = quad[0], b = quad[1], c2 = quad[2], d = quad[3];
    const top = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
    const bot = { x: d.x + (c2.x - d.x) * u, y: d.y + (c2.y - d.y) * u, z: d.z + (c2.z - d.z) * u };
    PROBES.push({ id, p: { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v, z: top.z + (bot.z - top.z) * v } });
  }
}

await mkdir(OUT, { recursive: true });
const frames = [];
const churn = [];
const anchors = [];
const clip = [];
const probeTrace = [];
const humanMetrics = [];
const textMetrics = [];

const ANCHOR_WORLD = {
  'backWall.TL': box.backTL, 'backWall.TR': box.backTR, 'backWall.BL': box.backBL, 'backWall.BR': box.backBR,
  'ceiling.backLeft': box.backTL, 'floor.backLeft': box.backBL,
  head: { x: FIG_WORLD.x, y: FIG_WORLD.feetY + FIG_WORLD.h * 0.94, z: -0.2 },
  'shoulder.L': { x: FIG_WORLD.x - 0.19, y: FIG_WORLD.feetY + FIG_WORLD.h * 0.78, z: -0.2 },
  'shoulder.R': { x: FIG_WORLD.x + 0.19, y: FIG_WORLD.feetY + FIG_WORLD.h * 0.78, z: -0.2 },
  pelvis: { x: FIG_WORLD.x, y: FIG_WORLD.feetY + FIG_WORLD.h * 0.48, z: -0.2 },
  'foot.L': { x: FIG_WORLD.x - 0.11, y: FIG_WORLD.feetY, z: -0.2 },
  'foot.R': { x: FIG_WORLD.x + 0.11, y: FIG_WORLD.feetY, z: -0.2 },
  'NAME.centre': { x: 0, y: 1.32, z: NAME_Z },
  'NAME.left': { x: -0.53, y: 1.32, z: NAME_Z },
  'NAME.right': { x: 0.53, y: 1.32, z: NAME_Z },
};

let prevLines = null, prevImg = null, prevCamZ = null;
for (let f = 0; f < FRAMES; f++) {
  const u = FRAMES === 1 ? 0 : f / (FRAMES - 1);
  const e = smoothstep(u);
  const camZ = CAM_Z0 + (CAM_Z1 - CAM_Z0) * e;          // THE ONLY CHANGING INPUT
  const camSpec = { eye: { x: 0, y: EYE_Y, z: camZ }, target: { x: 0, y: EYE_Y, z: 0 }, focal: FOCAL };
  const bb = camBasis(camSpec, ASPECT);
  const { canvas, personScreen: ps } = buildFrame(bb, camSpec);
  const lines = canvasToLines(canvas);
  const img = rasterLines(lines, W, H);
  const png = encodePng(img);
  frames.push({ f, png, hash: createHash('sha256').update(png).digest('hex'), img, lines, camZ });

  // anchors
  const row = { frame: f, camZ: +camZ.toFixed(4), anchors: {} };
  for (const [k, wp] of Object.entries(ANCHOR_WORLD)) {
    const q = projectRoom(camSpec, wp, ASPECT);
    row.anchors[k] = { wx: +wp.x.toFixed(4), wy: +wp.y.toFixed(4), wz: +wp.z.toFixed(4), px: q.visible ? +(q.x * W).toFixed(2) : null, py: q.visible ? +(q.y * H).toFixed(2) : null, valid: q.visible };
  }
  anchors.push(row);

  // clipping per plane
  const crow = { frame: f, planes: {} };
  for (const id of Object.keys(SEM)) {
    const c = clipPlaneToViewport(bb, id, planesWorld[id]);
    crow.planes[id] = { world: c.worldVertices, cam: c.camClippedVertices, viewport: c.viewportClippedVertices, area: +c.area.toFixed(5), finite: c.screenPolygon.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) };
  }
  clip.push(crow);

  // world probes: material identity at a FIXED world point
  const prow = { frame: f, results: {} };
  for (const id of Object.keys(SEM)) prow.results[id] = { total: 0, samePlane: 0, glyphs: {} };
  for (const pr of PROBES) {
    const q = projectRoom(camSpec, pr.p, ASPECT);
    if (!q.visible) continue;
    const c = Math.floor(q.x * COLS), r = Math.floor(q.y * ROWS);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
    const g = lines[r][c];
    prow.results[pr.id].total++;
    if (g !== ' ') prow.results[pr.id].glyphs[g] = (prow.results[pr.id].glyphs[g] ?? 0) + 1;
  }
  probeTrace.push(prow);

  // human metrics
  const pm = createMask(W, H);
  drawPerson(pm, ps.cx, ps.bot, ps.h);
  const stats = M.maskStats(pm);
  humanMetrics.push({ frame: f, projectedHeightPx: +ps.h.toFixed(1), heightFrac: +(ps.h / H).toFixed(4), bbox: stats.bbox, top: +ps.top.toFixed(1), bottom: +ps.bot.toFixed(1) });

  // text metrics
  {
    const pts = [];
    for (const g of NAME) for (const p of (g.points || [])) {
      const q = projectRoom(camSpec, { x: g.position.x + p.x, y: g.position.y + p.y, z: g.position.z + p.z }, ASPECT);
      if (q.visible) pts.push({ x: q.x * W, y: q.y * H });
    }
    if (pts.length) {
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      textMetrics.push({ frame: f, widthPx: +(Math.max(...xs) - Math.min(...xs)).toFixed(1), heightPx: +(Math.max(...ys) - Math.min(...ys)).toFixed(1) });
    } else textMetrics.push({ frame: f, widthPx: 0, heightPx: 0 });
  }

  // churn
  if (f > 0) {
    let changedGlyph = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (lines[r][c] !== prevLines[r][c]) changedGlyph++;
    let changedPix = 0, sum = 0;
    const a = prevImg.data, b = img.data;
    for (let p = 0; p < a.length; p += 3) if (a[p] !== b[p]) { changedPix++; sum += Math.abs(a[p] - b[p]); }
    let lit = 0, ink = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const ch = lines[r][c]; if (ch === ' ') continue; lit++; ink += '+-|/\\`,\''.includes(ch) || ch === '#' ? 1 : 0.5; }
    churn.push({
      from: f - 1, to: f,
      cameraSpeed: +Math.abs(camZ - prevCamZ).toFixed(6),
      changedGlyphCells: changedGlyph,
      glyphChurnRate: +(changedGlyph / (COLS * ROWS)).toFixed(5),
      changedPixels: changedPix,
      meanPixelDifference: changedPix ? +(sum / changedPix).toFixed(3) : 0,
      litCells: lit, totalInk: +ink.toFixed(1),
    });
  }
  prevLines = lines; prevImg = img; prevCamZ = camZ;
}

// ---- monotonicity of the back wall ----
const backWall = clip.map((c) => c.planes.backWall.area);
const bwMin = Math.min(...clip.map((c) => c.planes.backWall.viewport));
let reversals = 0;
for (let i = 1; i < backWall.length; i++) if (backWall[i] < backWall[i - 1] - 1e-6) reversals++;

// ---- orientation stability (v4 glyph class per plane) ----
const ORIENT = { vertical: '|', horizontal: '-', diagRise: '/', diagFall: '\\' };
const archStability = Object.fromEntries(Object.keys(SEM).map((id) => [id, { dir: DIR[id], glyph: ORIENT[DIR[id]], flips: 0 }]));

// ---- frame hashes ----
const uniqueHashes = new Set(frames.map((x) => x.hash)).size;

// ---- write probe frames + mp4 ----
const PROBES_F = [0, 15, 30, 45, 60, 75, 89];
for (const f of PROBES_F) await writeFile(path.join(OUT, `frame-${String(f).padStart(3, '0')}.png`), frames[f].png);
const FR = path.join(OUT, 'frames');
await mkdir(FR, { recursive: true });
for (const fr of frames) await writeFile(path.join(FR, `f${String(fr.f).padStart(4, '0')}.png`), fr.png);

const FFMPEG = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg');
const LIB = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64');
await new Promise((res, rej) => {
  const c = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(FR, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(OUT, 'camera-push.mp4')], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } });
  let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(e))));
});

// ---- external review package ----
const REV = path.join(OUT, 'review');
await mkdir(REV, { recursive: true });
await writeFile(path.join(REV, 'camera-push.mp4'), await (await import('node:fs/promises')).readFile(path.join(OUT, 'camera-push.mp4')));
for (const f of PROBES_F) await writeFile(path.join(REV, `frame-${String(f).padStart(3, '0')}.png`), frames[f].png);

const report = {
  phase: '3.3B', resolution: `${W}x${H}`, frameCount: FRAMES, fps: FPS,
  cameraPath: { easing: 'smoothstep', camZ0: CAM_Z0, camZ1: CAM_Z1, focal: FOCAL, orientationFixed: true, translationOnly: true },
  backWallHeightStart: 0.50, backWallHeightEnd: 0.64,
  uniqueFrameHashes: uniqueHashes,
  frame0Hash: frames[0].hash,
  churnVsCamera: churn,
  anchors, clip, probeTrace, humanMetrics, textMetrics,
  backWallAreaMonotonic: reversals === 0, backWallAreaReversals: reversals,
  architectureStability: archStability,
};
await writeFile(path.join(OUT, 'churn-vs-camera.json'), JSON.stringify({ cameraPath: report.cameraPath, churn }, null, 2));
await writeFile(path.join(OUT, 'phase33b-report.json'), JSON.stringify(report, null, 2));

console.log('PHASE 3.3B — SINGLE-VARIABLE CAMERA PUSH\n');
console.log(`  frames ${FRAMES}  ${W}x${H}  ${FPS} fps  3 s`);
console.log(`  cameraZ  ${CAM_Z0} -> ${CAM_Z1}  (smoothstep, translation only, orientation fixed)`);
console.log(`  back-wall height  50.0% -> 64.0%`);
console.log(`  frame 0 hash      ${frames[0].hash.slice(0, 32)}...`);
console.log(`  unique hashes     ${uniqueHashes}  (motion expected)`);
console.log(`  back-wall area monotonic: ${reversals === 0}  (reversals ${reversals})`);
console.log('');
console.log('  frame  camZ    camVel   changedGlyph  churn%   changedPx   lit  ink');
for (const c of churn.filter((_, i) => i % 10 === 0 || i === churn.length - 1)) {
  console.log(`  ${String(c.to).padStart(5)}  ${frames[c.to].camZ.toFixed(4)}  ${c.cameraSpeed.toFixed(5)}  ${String(c.changedGlyphCells).padStart(12)}  ${(c.glyphChurnRate * 100).toFixed(2).padStart(6)}  ${String(c.changedPixels).padStart(9)}  ${String(c.litCells).padStart(5)} ${String(c.totalInk).padStart(7)}`);
}
console.log('');
const clipIssues = clip.flatMap((c) => Object.entries(c.planes).filter(([, v]) => !v.finite || v.viewport < 3));
console.log(`  clipping issues across all frames: ${clipIssues.length}  (${clipIssues.length === 0 ? 'PASS' : 'FAIL'})`);
const anchorInvalid = anchors.flatMap((a) => Object.entries(a.anchors).filter(([, v]) => !v.valid));
console.log(`  invalid anchor projections: ${anchorInvalid.length}  (${anchorInvalid.length === 0 ? 'PASS' : 'FAIL'})`);
const missingParts = humanMetrics.filter((h) => h.projectedHeightPx <= 0);
console.log(`  frames with the human absent: ${missingParts.length}`);
const lostText = textMetrics.filter((t) => t.widthPx <= 0);
console.log(`  frames with NAME absent: ${lostText.length}`);
