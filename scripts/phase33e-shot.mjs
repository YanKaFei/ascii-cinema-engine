/**
 * PHASE 3.3E — FIRST COMPOSED CINEMATIC SHOT.
 *
 * CAMERA (supporting) + PHYSICAL ACTION (primary) + ASCII EXPRESSION (secondary) in one shot.
 * One question: do the three coexist without competing?
 *
 *   node scripts/phase33e-shot.mjs
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33e');
const TMP = path.join(OUT, 'frames');
const MT = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'motion.js'));
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const { createField, write, glyphForWeight, CAUSAL_HOLD_RATIO } = MT;
const { camBasis, projectRoom } = G;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, FPS = 30, FRAMES = 130;   // 4.33 s
const ASPECT = W / H;
const EYE_Y = 1.05, FOCAL = 0.9;
const HALF = { x: 1.5, y: 0.9, z: 0.69 };
/** FROZEN 3.3D shot geometry — the room, the figure and the word are unchanged. */
const CAM_START = 0.9315;
/** SOLVED for a 10% projected scale increase: dist1 = dist0 / 1.10. No eyeballing. */
const CAM_END = 0.7841;

const smoothstep = (t) => t * t * (3 - 2 * t);

/** THE REACH — the same physical action frozen in Phase 3.3D. It reaches full extension at 55% and holds. */
const REACH_FULL_AT = 0.55;
function reachProgress(p) { return p < REACH_FULL_AT ? smoothstep(p / REACH_FULL_AT) : 1; }

const PERSON = { x: -0.55, feetY: EYE_Y - HALF.y, h: 1.6, zw: -0.2 };
const HAND_NEUTRAL = { x: PERSON.x + 0.26, y: PERSON.feetY + PERSON.h * 0.44, z: PERSON.zw };
const HAND_REACH = { x: 0.0, y: 1.10, z: -0.45 };
const NAME_Z = -0.69 + 0.05, NAME_Y = 1.30, NAME_WORLD_W = 0.86, NAME_WORLD_H = 0.24;

const camAt = (camZ) => ({ eye: { x: 0, y: EYE_Y, z: camZ }, target: { x: 0, y: EYE_Y, z: 0 }, focal: FOCAL });
const projPx = (cam, p) => { const q = projectRoom(cam, p, ASPECT); return { x: q.x * W, y: q.y * H, v: q.visible }; };

// ---------- the frozen human recognition grammar (silhouette + negative space) ----------
function personPixels(cam, reach) {
  const m = new Uint8Array(W * H);
  const put = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) return; m[yi * W + xi] = 1; };
  const top = projPx(cam, { x: PERSON.x, y: PERSON.feetY + PERSON.h, z: PERSON.zw });
  const bot = projPx(cam, { x: PERSON.x, y: PERSON.feetY, z: PERSON.zw });
  const height = Math.abs(bot.y - top.y), uu = height / 1000, cx = top.x, feet = bot.y;
  const headR = 62 * uu, shoulderY = feet - height + headR * 2.6, hipY = feet - height * 0.48;
  const sh = 118 * uu, hh = 86 * uu, limb = 34 * uu;
  const disc = (x, y, r) => { for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (Math.hypot(dx, dy) <= r) put(x + dx, y + dy); };
  const cap = (x0, y0, x1, y1, r) => { const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2)); for (let i = 0; i <= n; i++) disc(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r); };
  const box = (x0, y0, x1, y1) => { for (let y = Math.round(Math.min(y0, y1)); y <= Math.max(y0, y1); y++) for (let x = Math.round(Math.min(x0, x1)); x <= Math.max(x0, x1); x++) put(x, y); };
  disc(cx, feet - height + headR, headR);
  box(cx - 26 * uu, feet - height + headR * 1.7, cx + 26 * uu, shoulderY + 6 * uu);
  for (let y = Math.round(shoulderY); y <= Math.round(hipY); y++) {
    const t = (y - shoulderY) / Math.max(1e-6, hipY - shoulderY), hw = sh + (hh - sh) * t;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) put(x, y);
  }
  const hand = { x: HAND_NEUTRAL.x + (HAND_REACH.x - HAND_NEUTRAL.x) * reach, y: HAND_NEUTRAL.y + (HAND_REACH.y - HAND_NEUTRAL.y) * reach, z: HAND_NEUTRAL.z + (HAND_REACH.z - HAND_NEUTRAL.z) * reach };
  for (const sgn of [-1, 1]) {
    if (sgn === 1) {
      const sx = PERSON.x + 0.19, sy = PERSON.feetY + PERSON.h * 0.78;
      const mid = { x: sx + (hand.x - sx) * 0.5, y: sy + (hand.y - sy) * 0.5 - 0.10, z: HAND_NEUTRAL.z + (hand.z - HAND_NEUTRAL.z) * 0.5 };
      const A = projPx(cam, { x: sx, y: sy, z: PERSON.zw }), B = projPx(cam, mid), C = projPx(cam, hand);
      cap(A.x, A.y, B.x, B.y, limb); cap(B.x, B.y, C.x, C.y, limb * 0.86); disc(C.x, C.y, limb * 0.95);
    } else {
      const ex = cx - (sh + 46 * uu), ey = (shoulderY + hipY) / 2;
      cap(cx - (sh - 10 * uu), shoulderY + 14 * uu, ex, ey, limb);
      cap(ex, ey, ex - 10 * uu, hipY + 96 * uu, limb * 0.86);
      disc(ex - 10 * uu, hipY + 104 * uu, limb * 0.95);
    }
  }
  for (const sgn of [-1, 1]) {
    const kx = cx + sgn * (hh + 34 * uu), fx = cx + sgn * (hh + 52 * uu);
    cap(cx + sgn * hh * 0.8, hipY, kx, hipY + (feet - hipY) * 0.52, limb * 1.05);
    cap(kx, hipY + (feet - hipY) * 0.52, fx, feet - 18 * uu, limb * 0.85);
    box(fx - 46 * uu, feet - 20 * uu, fx + 46 * uu, feet, limb * 0.9);
  }
  return m;
}

// ---------- NAME letter cells, in WORLD space, rebuilt per camera (world-space aware) ----------
const FONT = {
  N: ['10001','11001','10101','10011','10001','10001','10001','10001','10001'],
  A: ['01110','10001','10001','10001','11111','10001','10001','10001','10001'],
  M: ['10001','11011','10101','10001','10001','10001','10001','10001','10001'],
  E: ['11111','10000','10000','10000','11110','10000','10000','10000','10000','11111'].slice(0,9),
};
/** Every NAME cell as a WORLD point plus its letter-local centre, so fragmentation is camera-independent. */
const NAME_WORLD_CELLS = [];
{
  const n = 4, cellW = NAME_WORLD_W / (n * 5 + (n - 1));
  let li = 0;
  for (const ch of 'NAME') {
    const pat = FONT[ch];
    const gx = -NAME_WORLD_W / 2 + li * (5 + 1) * cellW;
    const lcx = gx + 2.5 * cellW;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) {
      if (pat[r][c] !== '1') continue;
      NAME_WORLD_CELLS.push({ x: gx + c * cellW, y: NAME_Y - NAME_WORLD_H / 2 + (r * NAME_WORLD_H) / 9, z: NAME_Z, lcx, lcy: NAME_Y, w: cellW, h: NAME_WORLD_H / 9 });
    }
    li++;
  }
}
function nameCellsScreen(cam) {
  return NAME_WORLD_CELLS.map((c) => {
    const p = projPx(cam, { x: c.x, y: c.y, z: c.z }), lc = projPx(cam, { x: c.lcx, y: c.lcy, z: c.z });
    return { ...c, sx: p.x, sy: p.y, lcx: lc.x, lcy: lc.y, v: p.v };
  });
}
function nameBoundsScreen(cam) {
  const a = projPx(cam, { x: -NAME_WORLD_W / 2, y: NAME_Y - NAME_WORLD_H / 2, z: NAME_Z });
  const b = projPx(cam, { x: NAME_WORLD_W / 2, y: NAME_Y + NAME_WORLD_H / 2, z: NAME_Z });
  return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
}

function rasterLines(lines, outW = W, outH = H) {
  const img = { width: outW, height: outH, data: Buffer.alloc(outW * outH * 3) };
  const cw = outW / COLS, chh = outH / ROWS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = lines[r][c]; if (ch === ' ') continue;
    const g = GLYPH_BY_CODE[ch.charCodeAt(0)]; if (!g) continue;
    const v = Math.round(50 + (' .\':-+*#@'.indexOf(ch) / 9) * 205);
    for (let py = 0; py < GLYPH_H; py++) { const mr = g.rows[py]; if (!mr) continue;
      for (let pxx = 0; pxx < GLYPH_W; pxx++) { if (!(mr & (1 << (GLYPH_W - 1 - pxx)))) continue;
        const x0 = Math.round(c * cw + (pxx * cw) / GLYPH_W), x1 = Math.round(c * cw + ((pxx + 1) * cw) / GLYPH_W);
        const y0 = Math.round(r * chh + (py * chh) / GLYPH_H), y1 = Math.round(r * chh + ((py + 1) * chh) / GLYPH_H);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (x < 0 || y < 0 || x >= outW || y >= outH) continue; const o = (y * outW + x) * 3; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; }
      }
    }
  }
  return img;
}
const fieldToLines = (f) => { const o = []; for (let r = 0; r < f.rows; r++) { let s = ''; for (let c = 0; c < f.cols; c++) s += f.cells[r * f.cols + c].ch; o.push(s); } return o; };

const FFMPEG = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg');
const LIB = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64');
async function encode(name, pngs) {
  const dir = path.join(TMP, name);
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  for (let i = 0; i < pngs.length; i++) await writeFile(path.join(dir, `f${String(i).padStart(4, '0')}.png`), pngs[i]);
  await new Promise((res, rej) => {
    const c = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(OUT, `${name}.mp4`)], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } });
    let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(e))));
  });
  await rm(dir, { recursive: true, force: true });
}

// ================= §6 CAUSALITY IN WORLD SPACE =================
/**
 * `reachReadablePoint` is measured ONCE, in **action-progress space**, from the static camera.
 *
 * ⚠ The Phase 3.3D landmark was a FRAME, and a frame landmark cannot survive camera motion: the push
 * changes screen scale, so a screen-displacement threshold would fire at a different action progress on
 * every version. **Action progress is camera-independent, so the landmark is recorded as a progress value
 * and the shot's camera never touches it.**
 */
const REACH_READABLE_PROGRESS = 0.3262;    // measured in 3.3D: hand displacement / full >= 0.35
const CAUSE_LEGIBLE_UNTIL = 1.0;
const EFFECT_ONSET_PROGRESS = REACH_READABLE_PROGRESS + (CAUSE_LEGIBLE_UNTIL - REACH_READABLE_PROGRESS) * CAUSAL_HOLD_RATIO;

const VERSIONS = [
  { name: 'static-camera-control', camera: 'none' },
  { name: 'version-A', camera: 'anticipate' },   // push begins slightly BEFORE the reach
  { name: 'version-B', camera: 'respond' },      // push begins when the reach becomes readable
];

await mkdir(OUT, { recursive: true }); await mkdir(TMP, { recursive: true });
const traces = {};

for (const V of VERSIONS) {
  const pngs = []; const trace = [];
  for (let f = 0; f < FRAMES; f++) {
    const p = f / (FRAMES - 1);
    const reach = reachProgress(p);

    // ---- CAMERA: the supporting layer. Two timings only, both ending with the reach's own curve shape.
    let camEase = 0;
    if (V.camera === 'anticipate') camEase = smoothstep(p / 0.85);
    else if (V.camera === 'respond') {
      const t = p <= REACH_READABLE_PROGRESS ? 0 : (p - REACH_READABLE_PROGRESS) / (1 - REACH_READABLE_PROGRESS);
      camEase = smoothstep(t);
    }
    const camZ = CAM_START + (CAM_END - CAM_START) * camEase;
    const cam = camAt(camZ);

    const fld = createField(COLS, ROWS);
    // ---- PRIMARY: the physical action
    const pm = personPixels(cam, reach);
    let humanCells = 0;
    for (let y = 0; y < H; y += 18) for (let x = 0; x < W; x += 18) {
      if (!pm[y * W + x]) continue;
      let edge = false;
      for (const [dy, dx] of [[-18, 0], [18, 0], [0, -18], [0, 18]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || !pm[ny * W + nx]) { edge = true; break; } }
      write(fld, x / (W / COLS), y / (H / ROWS), { source: 'contour', ch: edge ? '|' : '#', weight: 1, freshness: 1 });
      humanCells++;
    }
    // ---- SECONDARY: the expression, gated on ACTION PROGRESS, not on a frame
    const ep = reach < EFFECT_ONSET_PROGRESS ? 0 : Math.min(1, (reach - EFFECT_ONSET_PROGRESS) / (1 - EFFECT_ONSET_PROGRESS) * 1.8);
    const cells = nameCellsScreen(cam);
    let fragCells = 0, nameDrawn = 0, nameIdentifiable = 0;
    if (ep > 0) {
      const loosen = ep < 0.40 ? smoothstep(ep / 0.40) : 1;
      const separate = ep > 0.40 ? smoothstep((ep - 0.40) / 0.35) : 0;
      const erase = ep > 0.80 ? smoothstep((ep - 0.80) / 0.20) : 0;
      for (const c of cells) {
        const dx = c.sx - c.lcx, dy = c.sy - c.lcy, d = Math.hypot(dx, dy) || 1;
        const push = separate * 8;
        const w = Math.max(0, 1 - loosen * 0.25 - erase * Math.min(1, d / 65) * 0.75);
        if (w <= 0.06) continue;
        write(fld, (c.sx + (dx / d) * push) / (W / COLS), (c.sy + (dy / d) * push) / (H / ROWS), { source: 'substitution', ch: glyphForWeight(w), weight: w, freshness: 1 });
        fragCells++; nameDrawn++;
        if (separate < 0.35 && erase < 0.3) nameIdentifiable++;
      }
    } else {
      for (const c of cells) { write(fld, c.sx / (W / COLS), c.sy / (H / ROWS), { source: 'substitution', ch: '#', weight: 1, freshness: 1 }); nameDrawn++; nameIdentifiable++; }
    }
    const lines = fieldToLines(fld);
    pngs.push(encodePng(rasterLines(lines)));

    const hand = { x: HAND_NEUTRAL.x + (HAND_REACH.x - HAND_NEUTRAL.x) * reach, y: HAND_NEUTRAL.y + (HAND_REACH.y - HAND_NEUTRAL.y) * reach, z: HAND_NEUTRAL.z + (HAND_REACH.z - HAND_NEUTRAL.z) * reach };
    const hp = projPx(cam, hand), nb = nameBoundsScreen(cam);
    trace.push({
      frame: f, camZ: +camZ.toFixed(5), cameraEase: +camEase.toFixed(4),
      physicalProgress: +reach.toFixed(4),
      handWorld: { x: +hand.x.toFixed(4), y: +hand.y.toFixed(4), z: +hand.z.toFixed(4) },
      handPosition: { x: +hp.x.toFixed(1), y: +hp.y.toFixed(1) },
      handToNameDistance: +Math.hypot(hp.x - (nb.x0 + nb.x1) / 2, hp.y - (nb.y0 + nb.y1) / 2).toFixed(1),
      reachReadable: reach >= REACH_READABLE_PROGRESS,
      expressionProgress: +ep.toFixed(4),
      nameReadable: ep < 0.45,
      nameCellsDrawn: nameDrawn,
      nameFragmentedCells: fragCells,
      nameIdentifiableCells: nameIdentifiable,
      humanCells, backWallScale: +((CAM_START - (-0.69)) / (camZ - (-0.69))).toFixed(4),
    });
  }
  await encode(V.name, pngs);
  traces[V.name] = trace;
}

await writeFile(path.join(OUT, 'causal-trace.json'), JSON.stringify({
  cameraSolve: { relation: 'backWallScale = dist0/dist', scaleIncrease: +(((CAM_START + 0.69) / (CAM_END + 0.69) - 1) * 100).toFixed(2) + '%', camZStart: CAM_START, camZEnd: CAM_END },
  causalTiming: { rule: 'CAUSE_ACTION_START -> CAUSE_BECOMES_READABLE -> CAUSAL_HOLD -> EFFECT_ONSET', holdRatio: CAUSAL_HOLD_RATIO, reachReadableProgress: REACH_READABLE_PROGRESS, effectOnsetProgress: +EFFECT_ONSET_PROGRESS.toFixed(4) },
  versions: traces,
}, null, 2));

// ---------------- report ----------------
const T = (n) => traces[n];
console.log('PHASE 3.3E — COMPOSED CINEMATIC SHOT\n');
console.log(`  ${FRAMES} frames (${(FRAMES / FPS).toFixed(2)} s)  ${W}x${H}  ${FPS} fps`);
console.log(`  camera solved: camZ ${CAM_START} -> ${CAM_END}  =  ${(((CAM_START + 0.69) / (CAM_END + 0.69) - 1) * 100).toFixed(1)}% projected scale increase`);
console.log(`  causal timing: readable at progress ${REACH_READABLE_PROGRESS}, hold ratio ${CAUSAL_HOLD_RATIO}, effect onset at progress ${EFFECT_ONSET_PROGRESS.toFixed(4)}\n`);
const onsetFrame = (tr) => tr.findIndex((r) => r.expressionProgress > 0) - 1;
for (const V of VERSIONS) {
  const tr = T(V.name), on = onsetFrame(tr);
  console.log(`  ${V.name.padEnd(22)} effect onset f${String(on).padStart(3)}   reach readable f${tr.findIndex((r) => r.reachReadable)}   final camZ ${tr[FRAMES - 1].camZ}`);
}
console.log('\n  §8 RECOGNITION:');
for (const V of VERSIONS) {
  const tr = T(V.name);
  const noName = tr.filter((r) => r.nameCellsDrawn === 0).length;
  const noHuman = tr.filter((r) => r.humanCells === 0).length;
  const lostIdent = tr.filter((r) => r.expressionProgress > 0 && r.expressionProgress < 0.45 && r.nameIdentifiableCells < 40).length;
  console.log(`    ${V.name.padEnd(22)} frames with NAME absent ${noName}, human absent ${noHuman}, NAME identity lost mid-fragment ${lostIdent}`);
}
console.log('\n  §7 ATTENTION / DOMINANCE — camera-induced screen motion vs subject action motion:');
for (const V of VERSIONS) {
  const tr = T(V.name);
  const camMotion = Math.abs(tr[FRAMES - 1].backWallScale - tr[0].backWallScale);
  const handTravel = Math.abs(tr[0].handToNameDistance - tr[FRAMES - 1].handToNameDistance);
  console.log(`    ${V.name.padEnd(22)} back-wall scale +${(camMotion * 100).toFixed(1)}%   hand-to-NAME travel ${handTravel.toFixed(0)} px   ratio ${camMotion > 0 ? ((camMotion * 100) / handTravel * 100).toFixed(2) : '0'}%/px`);
}
const allFinite = Object.values(traces).every((tr) => tr.every((r) => Number.isFinite(r.handToNameDistance) && Number.isFinite(r.expressionProgress) && Number.isFinite(r.camZ)));
console.log(`\n  NaN / non-finite: ${allFinite ? 'none (PASS)' : 'FOUND (FAIL)'}`);
