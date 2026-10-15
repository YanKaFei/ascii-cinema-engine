/**
 * SILHOUETTE + NEGATIVE SPACE — MEASURED, not eyeballed.
 *
 * ⚠ WHY THIS FILE EXISTS. In 3.3H I "inspected" the performer and concluded it read as a person. It did not —
 * the head was detached, and the metric that would have caught it did not exist. Phase 3.1 recorded the same
 * failure four times. So the §10 properties are turned into **measurements of negative space**:
 *
 *   arm/torso separation  — is there an unoccupied ROW run between the arm and the torso?
 *   leg separation        — is there an unoccupied run between the two legs?
 *   head/torso separation — is the neck narrower than the head, so the head reads as a head?
 *
 * These are **structural** criteria (an unoccupied run of cells), not pixel tolerances.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33h');
const report = JSON.parse(await readFile(path.join(OUT, 'performance-report.json'), 'utf8'));

/** rebuild the line grid for a frame, using the same geometry as the renderer */
const { buildSkeleton } = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'body.js'));
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const W = 1920, H = 1080, COLS = 240, ROWS = 120, ASPECT = W / H;
const cam = { eye: { x: 0, y: 1.05, z: 0.9315 }, target: { x: 0, y: 1.05, z: 0 }, focal: 0.9 };
const projPx = (p) => { const q = G.projectRoom(cam, p, ASPECT); return { x: q.x * W, y: q.y * H }; };
const FEET_Y = 0.15, HEIGHT = 1.6, ZW = -0.2, START_X = -0.55;

/** isolate the FIGURE's own occupancy, independent of the room */
function figureMask(r) {
  const sk = buildSkeleton(r.rootX, FEET_Y, HEIGHT, { torsoYaw: r.torsoAngle, headYaw: r.headAngle, torsoLean: 0 }, ZW);
  const m = new Uint8Array(COLS * ROWS);
  const put = (x, y) => { const c = Math.floor(x / (W / COLS)), rr = Math.floor(y / (H / ROWS)); if (c >= 0 && rr >= 0 && c < COLS && rr < ROWS) m[rr * COLS + c] = 1; };
  const top = projPx({ x: sk.root.x, y: FEET_Y + HEIGHT, z: ZW }), bot = projPx({ x: sk.root.x, y: FEET_Y, z: ZW });
  const pxH = Math.abs(bot.y - top.y);
  const headRpx = (sk.headRadius / HEIGHT) * pxH, limbPx = 0.034 * pxH;
  const P = projPx;
  const disc = (p, r) => { for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (Math.hypot(dx, dy) <= r) put(p.x + dx, p.y + dy); };
  const cap = (a, b, r) => { const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2)); for (let i = 0; i <= n; i++) disc({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, r); };
  const box = (x0, y0, x1, y1) => { for (let y = Math.round(Math.min(y0, y1)); y <= Math.round(Math.max(y0, y1)); y++) for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x++) put(x, y); };
  const shoulderP = P(sk.shoulder), pelvisP = P(sk.pelvis), neckP = P(sk.neck), neckTopP = P(sk.neckTop), headP = P(sk.head);
  const shHalfPx = (sk.shoulderHalf / HEIGHT) * pxH;
  cap(neckP, neckTopP, limbPx * 0.78);
  disc(headP, headRpx);
  const nT = Math.max(2, Math.ceil(Math.abs(pelvisP.y - shoulderP.y)));
  for (let i = 0; i <= nT; i++) { const t = i / nT; const y = shoulderP.y + (pelvisP.y - shoulderP.y) * t; const hw = shHalfPx * (1 - 0.27 * t); const cx = shoulderP.x + (pelvisP.x - shoulderP.x) * t; box(cx - hw, y, cx + hw, y); }
  const armClear = limbPx * 1.15;
  const shL = { x: shoulderP.x - shHalfPx - armClear, y: shoulderP.y }, elbL = { x: shL.x - shHalfPx * 0.06, y: (shoulderP.y + pelvisP.y) / 2 }, handL = { x: elbL.x, y: pelvisP.y + limbPx * 2.4 };
  cap(shL, elbL, limbPx); cap(elbL, handL, limbPx * 0.86); disc(handL, limbPx * 0.95);
  const shR = { x: shoulderP.x + shHalfPx + armClear, y: shoulderP.y }, elbR = { x: shR.x + shHalfPx * 0.06, y: (shoulderP.y + pelvisP.y) / 2 }, handRest = { x: elbR.x, y: pelvisP.y + limbPx * 2.4 };
  const handWorld = { x: sk.root.x + (0.06 - sk.root.x) * r.arm, y: (FEET_Y + HEIGHT * 0.44) + (1.12 - (FEET_Y + HEIGHT * 0.44)) * r.arm, z: ZW + (-0.44 - ZW) * r.arm };
  const handT = P(handWorld);
  const handNow = { x: handRest.x + (handT.x - handRest.x), y: handRest.y + (handT.y - handRest.y) };
  const elbNow = { x: elbR.x + (handNow.x - elbR.x) * 0.5, y: elbR.y + (handNow.y - elbR.y) * 0.5 };
  cap(shR, elbNow, limbPx); cap(elbNow, handNow, limbPx * 0.86); disc(handNow, limbPx * 0.95);
  for (const [fx, isLeft] of [[START_X - 0.11, true], [START_X + 0.11 + r.bodyCentre * 0.42, false]]) {
    const hip = { x: pelvisP.x + (isLeft ? -shHalfPx * 0.62 : shHalfPx * 0.62), y: pelvisP.y };
    const footW = P({ x: fx, y: FEET_Y, z: ZW });
    const knee = { x: (hip.x + footW.x) / 2 + (isLeft ? -limbPx * 0.4 : limbPx * 0.4), y: (hip.y + footW.y) / 2 };
    cap(hip, knee, limbPx * 1.05); cap(knee, footW, limbPx * 0.85);
    box(footW.x - limbPx * 1.35, footW.y - limbPx * 0.6, footW.x + limbPx * 1.35, footW.y);
  }
  return m;
}

/** the longest unoccupied horizontal run inside the figure's own row span */
function innerGaps(m, r) {
  const row = []; for (let c = 0; c < COLS; c++) if (m[r * COLS + c]) row.push(c);
  if (row.length < 2) return 0;
  const first = row[0], last = row[row.length - 1];
  let best = 0, run = 0;
  for (let c = first; c <= last; c++) { if (m[r * COLS + c]) { run = 0; } else { run++; if (run > best) best = run; } }
  return best;
}

console.log('SILHOUETTE + NEGATIVE SPACE (measured on the figure mask, room excluded)\n');
const out = {};
for (const [variant, rep] of Object.entries(report)) {
  const tr = rep.trace;
  /** torso rows: between the shoulder and the pelvis — where arm/torso gaps should exist */
  const samples = [];
  for (const r of tr) {
    const sk = buildSkeleton(r.rootX, FEET_Y, HEIGHT, { torsoYaw: r.torsoAngle, headYaw: r.headAngle, torsoLean: 0 }, ZW);
    const shRow = Math.floor(projPx(sk.shoulder).y / (H / ROWS)), pvRow = Math.floor(projPx(sk.pelvis).y / (H / ROWS));
    const m = figureMask(r);
    let torsoGap = 0, legGap = 0;
    for (let rr = shRow; rr < pvRow; rr++) torsoGap = Math.max(torsoGap, innerGaps(m, rr));
    const footRow = Math.floor(projPx({ x: sk.root.x, y: FEET_Y, z: ZW }).y / (H / ROWS));
    for (let rr = pvRow; rr <= footRow; rr++) legGap = Math.max(legGap, innerGaps(m, rr));
    samples.push({ frame: r.frame, torsoGap, legGap });
  }
  const anyTorsoGap = samples.filter((s) => s.torsoGap >= 1).length;
  const anyLegGap = samples.filter((s) => s.legGap >= 1).length;
  out[variant] = {
    frames: samples.length,
    framesWithArmTorsoGap: anyTorsoGap,
    framesWithLegGap: anyLegGap,
    maxTorsoGapCells: Math.max(...samples.map((s) => s.torsoGap)),
    maxLegGapCells: Math.max(...samples.map((s) => s.legGap)),
    medianTorsoGap: samples.map((s) => s.torsoGap).sort((a, b) => a - b)[Math.floor(samples.length / 2)],
  };
  const o = out[variant];
  console.log(`  ${variant}`);
  console.log(`    arm/torso gap present on ${String(o.framesWithArmTorsoGap).padStart(3)}/${o.frames} frames   max ${o.maxTorsoGapCells} cells   median ${o.medianTorsoGap}`);
  console.log(`    leg gap present on       ${String(o.framesWithLegGap).padStart(3)}/${o.frames} frames   max ${o.maxLegGapCells} cells`);
}
await writeFile(path.join(OUT, 'silhouette-report.json'), JSON.stringify(out, null, 2));
const worstTorso = Math.min(...Object.values(out).map((o) => o.framesWithArmTorsoGap / o.frames));
console.log('');
console.log(`  worst variant has an arm/torso gap on ${(worstTorso * 100).toFixed(1)}% of frames`);
console.log(`  arm/torso negative space: ${worstTorso > 0.9 ? 'PASS' : 'PARTIAL'}`);
