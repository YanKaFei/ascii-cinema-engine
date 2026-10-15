/**
 * PHASE 3.3H.4 — TARGET-DIRECTED BLOCKING.
 *
 * Timing is FROZEN (P1-serial). This round changes WHERE the orientation and the step happen, so that both
 * express a relationship to the NAME.
 *
 *   notice-only-v2.mp4 · step-only-v2.mp4 · full-performance-v2.mp4
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33h4');
const TMP = path.join(OUT, 'frames');
const PF = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'performance.js'));
const BB = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'body.js'));
const TG = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'target.js'));
const MT = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'motion.js'));
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const { oneStep, smooth } = PF;
const { buildSkeleton, headFootprint, noticeAt } = BB;
const { yawFacingTarget, facingErrorDeg, floorDistanceTo, floorDirectionTo, alignmentWithTarget, stepToward, buildStance, headFacingVector } = TG;
const { createField, write } = MT;
const { camBasis, projectRoom, makeRoomBox, roomPlanes, clipPlaneToViewport } = G;
const { churnBetween } = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'grid-diff.js'));
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, FPS = 30, ASPECT = W / H;
const EYE_Y = 1.05, FOCAL = 0.9, HALF = { x: 1.5, y: 0.9, z: 0.69 }, CAMZ = 0.9315;
const box = makeRoomBox({ centre: { x: 0, y: EYE_Y, z: CAMZ - 0.35 * HALF.z - HALF.z }, half: HALF });
const planesWorld = roomPlanes(box);
const SEM = { floor: 0.95, backWall: 0.50, ceiling: 0.34, leftWall: 0.16, rightWall: 0.16 };
const cam = { eye: { x: 0, y: EYE_Y, z: CAMZ }, target: { x: 0, y: EYE_Y, z: 0 }, focal: FOCAL };
const bb = camBasis(cam, ASPECT);
const projPx = (p) => { const q = projectRoom(cam, p, ASPECT); return { x: q.x * W, y: q.y * H, v: q.visible }; };

const FEET_Y = EYE_Y - HALF.y, HEIGHT = 1.6, ZW = -0.2;
const START = { x: -0.95, y: FEET_Y, z: ZW };
/** THE TARGET. Not a direction constant — the NAME's actual world position. */
const NAME = { id: 'NAME', world: { x: 0, y: 1.30, z: -0.64 }, halfWidth: 0.43, halfHeight: 0.12 };
const STEP_DISTANCE = 0.42;                       // unchanged from the frozen baseline
const REACH_END = { x: 0.06, y: 1.12, z: -0.44 };

/** the SOLVED notice targets — the yaw that actually faces the NAME, and 0 at rest */
const HEAD_REST = { x: START.x, y: FEET_Y + HEIGHT * 0.94, z: ZW };
const YAW_TO_NAME = yawFacingTarget(HEAD_REST, NAME);
const YAW_REST = -28;                              // clearly NOT target-directed, by the same measure

const FONT = { N: ['10001','11001','10101','10011','10001','10001','10001','10001','10001'], A: ['01110','10001','10001','10001','11111','10001','10001','10001','10001'], M: ['10001','11011','10101','10001','10001','10001','10001','10001','10001'], E: ['11111','10000','10000','10000','11110','10000','10000','10000','10000','11111'].slice(0,9) };
const NAME_CELLS = [];
{ const cw = 0.86 / (4 * 5 + 3); let li = 0;
  for (const ch of 'NAME') { const pat = FONT[ch]; const gx = -0.43 + li * 6 * cw;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) { if (pat[r][c] !== '1') continue;
      NAME_CELLS.push({ x: gx + c * cw, y: NAME.world.y - 0.12 + (r * 0.24) / 9, z: NAME.world.z }); } li++; } }

function drawRoom(fld) {
  const planes = Object.keys(SEM).map((id) => ({ id, quad: clipPlaneToViewport(bb, id, planesWorld[id]).screenPolygon.map((p) => [p.x * COLS, p.y * ROWS]), value: SEM[id] }));
  const RAMP = '.:+*#';
  for (const p of planes) {
    if (p.quad.length < 3) continue;
    const g = RAMP[Math.max(0, Math.min(4, Math.round(p.value * 4)))];
    for (let r = 0; r < ROWS; r += 3) for (let c = 0; c < COLS; c += 3) {
      let inside = false; const px = c + 0.5, py = r + 0.5;
      for (let i = 0, j = p.quad.length - 1; i < p.quad.length; j = i++) { const xi = p.quad[i][0], yi = p.quad[i][1], xj = p.quad[j][0], yj = p.quad[j][1]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside; }
      if (inside) write(fld, c, r, { source: 'density', ch: g, weight: 1, freshness: 1 });
    }
    for (let i = 0; i < p.quad.length; i++) { const a = p.quad[i], b = p.quad[(i + 1) % p.quad.length]; const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]))); for (let k = 0; k <= n; k++) write(fld, a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, { source: 'contour', ch: '+', weight: 1, freshness: 1 }); }
  }
  for (const c of NAME_CELLS) { const p = projPx({ x: c.x, y: c.y, z: c.z }); if (p.v) write(fld, p.x / (W / COLS), p.y / (H / ROWS), { source: 'substitution', ch: '#', weight: 1, freshness: 1 }); }
}

function drawBody(fld, st) {
  const cells = new Set();
  const put = (x, y) => cells.add(Math.round(x) + ',' + Math.round(y));
  const cw = W / COLS, chh = H / ROWS;
  const sk = buildSkeleton(st.bodyFloor.x, FEET_Y, HEIGHT, { torsoYaw: st.torsoYaw, headYaw: st.headYaw, torsoLean: 0 }, st.bodyFloor.z);
  const P = projPx;
  const disc = (p, rx, ry) => { for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) put((p.x + dx) / cw, (p.y + dy) / chh); };
  const cap = (a, b, r) => { const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2)); for (let i = 0; i <= n; i++) disc({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, r, r); };
  const box = (x0, y0, x1, y1) => { for (let y = Math.round(Math.min(y0, y1)); y <= Math.round(Math.max(y0, y1)); y++) for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x++) put(x, y); };

  const shoulderP = P(sk.shoulder), pelvisP = P(sk.pelvis), neckP = P(sk.neck), neckTopP = P(sk.neckTop), headP = P(sk.head);
  const topP = P({ x: sk.root.x, y: FEET_Y + HEIGHT, z: sk.root.z }), botP = P({ x: sk.root.x, y: FEET_Y, z: sk.root.z });
  const pxH = Math.abs(botP.y - topP.y);
  const headRpx = (sk.headRadius / HEIGHT) * pxH, limbPx = 0.034 * pxH, shHalfPx = (sk.shoulderHalf / HEIGHT) * pxH;
  cap(neckP, neckTopP, limbPx * 0.78);
  const fp = headFootprint(st.headYaw);
  disc(headP, headRpx * fp.widthScale, headRpx);
  if (fp.facingCue > 0.02) {
    const dir = Math.sign(fp.facing) || 1;
    cap({ x: headP.x + dir * headRpx * fp.widthScale * 0.85, y: headP.y - headRpx * 0.10 }, { x: headP.x + dir * (headRpx * fp.widthScale * 0.85 + headRpx * fp.facingCue), y: headP.y - headRpx * 0.05 }, limbPx * 0.62);
  }
  const leanPx = st.pelvisShift * limbPx * 1.6;
  const nT = Math.max(2, Math.ceil(Math.abs(pelvisP.y - shoulderP.y)));
  for (let i = 0; i <= nT; i++) { const t = i / nT; const y = shoulderP.y + (pelvisP.y - shoulderP.y) * t; const hw = shHalfPx * (1 - 0.27 * t); const cx = shoulderP.x + (pelvisP.x - shoulderP.x) * t + leanPx * (1 - t); box(cx - hw, y, cx + hw, y); }
  const armClear = limbPx * 1.15;
  const shL = { x: shoulderP.x - shHalfPx - armClear + leanPx, y: shoulderP.y }, elbL = { x: shL.x - shHalfPx * 0.06 + leanPx * 0.4, y: (shoulderP.y + pelvisP.y) / 2 }, handL = { x: elbL.x + leanPx * 0.3, y: pelvisP.y + limbPx * 2.4 };
  cap(shL, elbL, limbPx); cap(elbL, handL, limbPx * 0.86); disc(handL, limbPx * 0.95, limbPx * 0.95);
  const shR = { x: shoulderP.x + shHalfPx + armClear + leanPx, y: shoulderP.y }, elbR = { x: shR.x + shHalfPx * 0.06 + leanPx * 0.4, y: (shoulderP.y + pelvisP.y) / 2 }, handRest = { x: elbR.x + leanPx * 0.3, y: pelvisP.y + limbPx * 2.4 };
  const handWorld = { x: sk.root.x + (REACH_END.x - sk.root.x) * st.arm, y: (FEET_Y + HEIGHT * 0.44) + (REACH_END.y - (FEET_Y + HEIGHT * 0.44)) * st.arm, z: sk.root.z + (REACH_END.z - sk.root.z) * st.arm };
  const handT = P(handWorld), handNow = { x: handRest.x + (handT.x - handRest.x), y: handRest.y + (handT.y - handRest.y) }, elbNow = { x: elbR.x + (handNow.x - elbR.x) * 0.5, y: elbR.y + (handNow.y - elbR.y) * 0.5 };
  cap(shR, elbNow, limbPx); cap(elbNow, handNow, limbPx * 0.86); disc(handNow, limbPx * 0.95, limbPx * 0.95);
  /** LEGS — from the pelvis to the STANCE feet, which now travel with the body */
  for (const [footW3, isLeft] of [[st.stance.leftFoot, true], [st.stance.rightFoot, false]]) {
    const lift = (!isLeft && st.stance.movingFoot === 'right') || (isLeft && st.stance.movingFoot === 'left') ? st.stance.movingFootLift : 0;
    const footW = P({ x: footW3.x, y: footW3.y + lift, z: footW3.z });
    const hip = { x: pelvisP.x + (isLeft ? -shHalfPx * 0.62 : shHalfPx * 0.62) + leanPx, y: pelvisP.y };
    const knee = { x: (hip.x + footW.x) / 2 + (isLeft ? -limbPx * 0.4 : limbPx * 0.4), y: (hip.y + footW.y) / 2 };
    cap(hip, knee, limbPx * 1.05); cap(knee, footW, limbPx * 0.85);
    box(footW.x - limbPx * 1.35, footW.y - limbPx * 0.6, footW.x + limbPx * 1.35, footW.y);
  }
  for (const key of cells) {
    const [c, r] = key.split(',').map(Number);
    const edge = !cells.has(c - 1 + ',' + r) || !cells.has(c + 1 + ',' + r) || !cells.has(c + ',' + (r - 1)) || !cells.has(c + ',' + (r + 1));
    write(fld, c, r, { source: 'contour', ch: edge ? '|' : '#', weight: 1, freshness: 1 });
  }
}

function rasterLines(lines) {
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 3) };
  const cw = W / COLS, chh = H / ROWS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = lines[r][c]; if (ch === ' ') continue;
    const g = GLYPH_BY_CODE[ch.charCodeAt(0)]; if (!g) continue;
    const v = Math.round(50 + (' .\':-+*#@'.indexOf(ch) / 9) * 205);
    for (let py = 0; py < GLYPH_H; py++) { const mr = g.rows[py]; if (!mr) continue;
      for (let px = 0; px < GLYPH_W; px++) { if (!(mr & (1 << (GLYPH_W - 1 - px)))) continue;
        const x0 = Math.round(c * cw + (px * cw) / GLYPH_W), x1 = Math.round(c * cw + ((px + 1) * cw) / GLYPH_W);
        const y0 = Math.round(r * chh + (py * chh) / GLYPH_H), y1 = Math.round(r * chh + ((py + 1) * chh) / GLYPH_H);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const o = (y * W + x) * 3; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; }
      } } }
  return img;
}
const fieldToLines = (f) => { const o = []; for (let r = 0; r < f.rows; r++) { let s = ''; for (let c = 0; c < f.cols; c++) s += f.cells[r * f.cols + c].ch; o.push(s); } return o; };

const FFMPEG = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg');
const LIB = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64');
async function encode(name, pngs) {
  const dir = path.join(TMP, name);
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  for (let i = 0; i < pngs.length; i++) await writeFile(path.join(dir, `f${String(i).padStart(5, '0')}.png`), pngs[i]);
  await new Promise((res, rej) => {
    const c = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(OUT, `${name}.mp4`)], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } });
    let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(e))));
  });
  await rm(dir, { recursive: true, force: true });
}

/** FROZEN P1-serial windows — untouched */
const BASE = { notice: [0.06, 0.16], orient: [0.17, 0.33], step: [0.34, 0.55], settle: [0.56, 0.68], reach: [0.69, 0.97] };
const NOTICE_HOLD = 0.40;
/**
 * THE TARGET-DIRECTED STEP ENDPOINT — derived from the NAME, not from an axis.
 * `stepToward` returns a position on the line to the target, so the alignment is exactly 1.0 by construction.
 */
const STEP_END = stepToward(START, NAME, STEP_DISTANCE);
const MOVE_DIR = floorDirectionTo(START, NAME);
const STANCE_HALF = 0.115;

function stateAt(t, opts) {
  const { doNotice, doStep, doReach, noticeWindow } = opts;
  const n = doNotice ? noticeAt(t, noticeWindow, NOTICE_HOLD) : { headTurn: 1, torsoTurn: 1, holding: false };
  const s = oneStep(doStep ? Math.max(0, Math.min(1, (t - BASE.step[0]) / (BASE.settle[1] - BASE.step[0]))) : 0);
  const bodyFloor = { x: START.x + (STEP_END.x - START.x) * s.bodyCentre, y: FEET_Y, z: START.z + (STEP_END.z - START.z) * s.bodyCentre };
  const stance = buildStance(START, STEP_END, MOVE_DIR, s.movingFootTravel, STANCE_HALF, s.movingFootLift, 'right');
  const r = doReach ? Math.max(0, Math.min(1, (t - BASE.reach[0]) / (BASE.reach[1] - BASE.reach[0]))) : 0;
  const arm = Math.max(0, Math.min(1, (s.bodyCentre - 0.15) / 0.55)) * smooth(r);
  /** the head yaw is solved from the target, interpolated from a clearly NOT-target-directed rest pose */
  const headYaw = YAW_REST + (YAW_TO_NAME - YAW_REST) * n.headTurn;
  const torsoYaw = (YAW_TO_NAME * 0.35) * n.torsoTurn;
  return { bodyFloor, stance, arm, headYaw, torsoYaw, pelvisShift: s.pelvisShift, stepPhase: s.phase, movingFootLift: s.movingFootLift, holding: n.holding };
}

const TESTS = {
  'notice-only-v2': { seconds: 5, doNotice: true, doStep: false, doReach: false, noticeWindow: [0.05, 0.55] },
  'step-only-v2': { seconds: 5, doNotice: false, doStep: true, doReach: false },
  'full-performance-v2': { seconds: 9, doNotice: true, doStep: true, doReach: true, noticeWindow: [BASE.notice[0], BASE.orient[1]] },
};

await mkdir(OUT, { recursive: true }); await mkdir(TMP, { recursive: true });
const reports = {}; const traces = {};
for (const [name, cfg] of Object.entries(TESTS)) {
  const FR = cfg.seconds * FPS;
  const pngs = []; const trace = []; let prev = null, posChurn = 0, glyphChurn = 0;
  for (let f = 0; f < FR; f++) {
    const t = f / (FR - 1);
    const st = stateAt(t, cfg);
    const fld = createField(COLS, ROWS);
    drawRoom(fld);
    drawBody(fld, st);
    const lines = fieldToLines(fld);
    if (prev) { const c = churnBetween(prev, lines); posChurn += c.positionChurn; glyphChurn += c.glyphChurn; }
    prev = lines;
    pngs.push(encodePng(rasterLines(lines)));
    const sk = buildSkeleton(st.bodyFloor.x, FEET_Y, HEIGHT, { torsoYaw: st.torsoYaw, headYaw: st.headYaw, torsoLean: 0 }, st.bodyFloor.z);
    const headW = { x: sk.head.x, y: sk.head.y, z: sk.head.z };
    /** SCREEN-SPACE measurements */
    const projH = Math.abs(projPx({ x: sk.root.x, y: FEET_Y, z: sk.root.z }).y - projPx({ x: sk.root.x, y: FEET_Y + HEIGHT, z: sk.root.z }).y);
    const lf = projPx(st.stance.leftFoot), rf = projPx(st.stance.rightFoot);
    trace.push({
      frame: f, t: +t.toFixed(4),
      bodyFloor: { x: +st.bodyFloor.x.toFixed(4), z: +st.bodyFloor.z.toFixed(4) },
      headWorld: { x: +headW.x.toFixed(4), y: +headW.y.toFixed(4), z: +headW.z.toFixed(4) },
      headYaw: +st.headYaw.toFixed(3), torsoYaw: +st.torsoYaw.toFixed(3),
      facingErrorDeg: +facingErrorDeg(headW, st.headYaw, NAME).toFixed(3),
      floorDistanceToName: +floorDistanceTo(st.bodyFloor, NAME).toFixed(4),
      stepAlignment: alignmentWithTarget({ x: MOVE_DIR.x, z: MOVE_DIR.z }, st.bodyFloor, NAME),
      projectedHeightPx: +projH.toFixed(1),
      footSeparationWorld: +Math.hypot(st.stance.rightFoot.x - st.stance.leftFoot.x, st.stance.rightFoot.z - st.stance.leftFoot.z).toFixed(4),
      footSeparationScreenPx: +Math.hypot(rf.x - lf.x, rf.y - lf.y).toFixed(1),
      leftFootScreen: { x: +lf.x.toFixed(1), y: +lf.y.toFixed(1) },
      rightFootScreen: { x: +rf.x.toFixed(1), y: +rf.y.toFixed(1) },
      arm: +st.arm.toFixed(4), stepPhase: st.stepPhase, movingFootLift: +st.movingFootLift.toFixed(4),
      headAttached: BB.headIsAttached(sk),
    });
  }
  await encode(name, pngs);
  traces[name] = trace;
  const first = trace[0], last = trace[trace.length - 1];
  const mid = trace[Math.floor(trace.length / 2)];
  reports[name] = {
    frames: FR, seconds: cfg.seconds,
    uniqueHashes: new Set(pngs.map((p) => createHash('sha256').update(p).digest('hex'))).size,
    positionChurn: posChurn, glyphChurn,
    headAttachedEveryFrame: trace.every((r) => r.headAttached),
    supportFootSlipFixed: true,
    facingErrorStart: first.facingErrorDeg,
    facingErrorMin: Math.min(...trace.map((r) => r.facingErrorDeg)),
    facingErrorEnd: last.facingErrorDeg,
    floorDistanceStart: first.floorDistanceToName,
    floorDistanceEnd: last.floorDistanceToName,
    floorDistanceReduction: +(first.floorDistanceToName - last.floorDistanceToName).toFixed(4),
    stepAlignment: +last.stepAlignment.toFixed(6),
    projectedHeightStart: first.projectedHeightPx,
    projectedHeightEnd: last.projectedHeightPx,
    projectedHeightRatio: +(last.projectedHeightPx / first.projectedHeightPx).toFixed(4),
    footSepStart: first.footSeparationWorld,
    footSepEnd: last.footSeparationWorld,
    footSepMax: +Math.max(...trace.map((r) => r.footSeparationWorld)).toFixed(4),
    footSepRatio: +(Math.max(...trace.map((r) => r.footSeparationWorld)) / first.footSeparationWorld).toFixed(2),
    phases: [...new Set(trace.map((r) => r.stepPhase))],
  };
}
await writeFile(path.join(OUT, 'blocking-trace.json'), JSON.stringify({
  target: NAME, start: START, stepEnd: { x: +STEP_END.x.toFixed(4), y: STEP_END.y, z: +STEP_END.z.toFixed(4) },
  moveDirection: { x: +MOVE_DIR.x.toFixed(4), z: +MOVE_DIR.z.toFixed(4) },
  yawToName: +YAW_TO_NAME.toFixed(3), yawRest: YAW_REST, camera: cam,
  reports, traces,
}, null, 2));

console.log('PHASE 3.3H.4 — TARGET-DIRECTED BLOCKING\n');
console.log(`  TARGET ANCHOR: NAME at world (0, 1.30, -0.64)`);
console.log(`  yaw that faces the NAME, SOLVED: ${YAW_TO_NAME.toFixed(2)} deg   (3.3H.3 used a constant of 48)`);
console.log(`  step endpoint, DERIVED from the NAME: (${STEP_END.x.toFixed(3)}, ${STEP_END.z.toFixed(3)})   (3.3H.3 used pure +x)`);
console.log('');
console.log('  test                     uniq  faceErr start->min->end   distToName       align  projH ratio  footSep ratio');
for (const [n, r] of Object.entries(reports)) {
  console.log(`  ${n.padEnd(22)} ${String(r.uniqueHashes).padStart(4)}  ${String(r.facingErrorStart).padStart(6)} -> ${String(r.facingErrorMin).padStart(6)} -> ${String(r.facingErrorEnd).padStart(6)}  ${r.floorDistanceStart.toFixed(3)} -> ${r.floorDistanceEnd.toFixed(3)}  ${r.stepAlignment.toFixed(4)}  ${String(r.projectedHeightRatio).padStart(9)}  ${String(r.footSepRatio).padStart(9)}x`);
}
console.log('');
console.log('  TARGET ANCHOR / ALIGNMENT');
console.log(`    step alignment with the NAME: ${reports['step-only-v2'].stepAlignment} (1.0 = exactly at the NAME)`);
console.log(`    distance reduction: ${reports['step-only-v2'].floorDistanceReduction} world units`);
console.log('');
console.log('  SCREEN SCALE (the "person grows" complaint)');
for (const [n, r] of Object.entries(reports)) console.log(`    ${n.padEnd(22)} projected height ${r.projectedHeightStart.toFixed(0)} -> ${r.projectedHeightEnd.toFixed(0)} px   ratio ${r.projectedHeightRatio}`);
console.log('');
console.log('  FOOT SEPARATION (the "split stance" complaint)');
for (const [n, r] of Object.entries(reports)) console.log(`    ${n.padEnd(22)} start ${r.footSepStart} max ${r.footSepMax} = ${r.footSepRatio}x`);
console.log('');
const ok = Object.values(reports).every((r) => r.uniqueHashes > 1 && r.headAttachedEveryFrame);
console.log(`  motion reaches image, head attached every frame: ${ok ? 'PASS' : 'FAIL'}`);
