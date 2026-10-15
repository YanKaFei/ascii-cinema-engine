/**
 * PHASE 3.3I — MICRO FILM V2. The same story, with validated Human Performance V1 integrated.
 *
 * ⚠ THE ONE RULE THAT MATTERS MOST (§10): **effects must inherit performance.** The character does not
 * freeze into a neutral pose when the NAME begins to fragment. The performance is ONE CONTINUOUS TRACK over
 * the whole film, and the world-state effects are driven separately from it.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33i');
const TMP = path.join(OUT, 'frames');
const PF = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'performance.js'));
const BB = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'body.js'));
const TG = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'target.js'));
const MT = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'motion.js'));
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const { oneStep, smooth } = PF;
/**
 * ⚠ `CAUSAL_HOLD_RATIO` LIVES IN `motion.ts`, NOT IN `performance.ts`, and I destructured it from the wrong
 * module. It was therefore `undefined`, `EFFECT_ONSET` was `NaN`, and the fragmentation gate
 * `reachProgress < NaN` was **false at every frame** — so the NAME began fragmenting on frame 0 and the
 * causal-ordering check reported `false`.
 *
 * **The check caught it and the render did not**, because a broken comparison is silent: `x < undefined` does
 * not throw. This is the sixth inert-mechanism-class defect in this project, and the first one that the
 * machine checks found *during* the round rather than after it.
 */
const { CAUSAL_HOLD_RATIO } = MT;
const { buildSkeleton, headFootprint } = BB;
const { yawFacingTarget, facingErrorDeg, floorDistanceTo, alignmentWithTarget, stepToward, buildStance, floorDirectionTo } = TG;
const { createField, write, glyphForWeight } = MT;
const { camBasis, projectRoom, makeRoomBox, roomPlanes, clipPlaneToViewport } = G;
const { churnBetween } = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'grid-diff.js'));
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, FPS = 30, ASPECT = W / H;
const EYE_Y = 1.05, FOCAL = 0.9, HALF = { x: 1.5, y: 0.9, z: 0.69 }, CAM0 = 0.9315;
const CAM_PUSH = 0.7841;   // the solved 10% scale-increase push from 3.3E
const box = makeRoomBox({ centre: { x: 0, y: EYE_Y, z: CAM0 - 0.35 * HALF.z - HALF.z }, half: HALF });
const planesWorld = roomPlanes(box);
const SEM = { floor: 0.95, backWall: 0.50, ceiling: 0.34, leftWall: 0.16, rightWall: 0.16 };
const DIRV = { floor: 'vertical', leftWall: 'diagFall', rightWall: 'diagRise', backWall: 'horizontal', ceiling: 'horizontal' };
const camAt = (z) => ({ eye: { x: 0, y: EYE_Y, z }, target: { x: 0, y: EYE_Y, z: 0 }, focal: FOCAL });
/** the 3.2B structural-decay ordering */
const DS = { texture: [0.00, 0.30], planeMaterial: [0.30, 0.55], secondaryEdges: [0.55, 0.80], junctions: [0.80, 1.00] };
const stageW = (p, [a, b]) => (p <= a ? 1 : p >= b ? 0 : 1 - smooth((p - a) / (b - a)));

const FEET_Y = EYE_Y - HALF.y, HEIGHT = 1.6;
const START = { x: -0.95, y: FEET_Y, z: -0.2 };
const NAME = { id: 'NAME', world: { x: 0, y: 1.30, z: -0.64 }, halfWidth: 0.43, halfHeight: 0.12 };
const STEP_DISTANCE = 0.42;
const STEP_END = stepToward(START, NAME, STEP_DISTANCE);
const MOVE_DIR = floorDirectionTo(START, NAME);
const STANCE_HALF = 0.115;
const HEAD_REST = { x: START.x, y: FEET_Y + HEIGHT * 0.94, z: START.z };
const YAW_TO_NAME = yawFacingTarget(HEAD_REST, NAME);
const YAW_REST = -28;
const REACH_END = { x: 0.06, y: 1.12, z: -0.44 };

const FONT = { N: ['10001','11001','10101','10011','10001','10001','10001','10001','10001'], A: ['01110','10001','10001','10001','11111','10001','10001','10001','10001'], M: ['10001','11011','10101','10001','10001','10001','10001','10001','10001'], E: ['11111','10000','10000','10000','11110','10000','10000','10000','10000','11111'].slice(0,9) };
const NAME_CELLS = [];
{ const cw = 0.86 / (4 * 5 + 3); let li = 0;
  for (const ch of 'NAME') { const pat = FONT[ch]; const gx = -0.43 + li * 6 * cw;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) { if (pat[r][c] !== '1') continue;
      NAME_CELLS.push({ x: gx + c * cw, y: NAME.world.y - 0.12 + (r * 0.24) / 9, z: NAME.world.z, lcx: gx + 2.5 * cw, lcy: NAME.world.y }); } li++; } }

// ---------------------------------------------------------------------------
// THE FILM TIMELINE. The PERFORMANCE is one continuous track; the SHOTS and the WORLD STATE are separate.
// ---------------------------------------------------------------------------
const SHOTS = [
  { id: 'S1-establish', seconds: 3.2, cam: () => CAM0, cutReason: 'the space and the relation are established; the story now needs the person to act' },
  { id: 'S2-performance', seconds: 6.3, cam: () => CAM0, cutReason: 'the reach has completed and the NAME is fragmenting; the consequence now needs its own attention' },
  { id: 'S3-name-lost', seconds: 2.2, cam: () => CAM0, cutReason: 'the name is destroyed and registered; only now does the room respond' },
  { id: 'S4-room-withdraws', seconds: 2.7, cam: (u) => CAM0 + (CAM_PUSH - CAM0) * smooth(Math.max(0, (u - 0.25) / 0.75)), cutReason: 'the room is far enough gone that the person reads as standing in space' },
  { id: 'S5-person-remains', seconds: 1.6, cam: () => CAM0 + (CAM_PUSH - CAM0) * 0.65, cutReason: 'the film ends here; the final state is held' },
];
const TOTAL = SHOTS.reduce((a, s) => a + s.seconds, 0);
const FRAMES = Math.round(TOTAL * FPS);
/** absolute time in seconds for a shot-local fraction */
const shotStart = (() => { const o = {}; let acc = 0; for (const s of SHOTS) { o[s.id] = acc; acc += s.seconds; } return o; })();

/** the CONTINUOUS performance timeline, in absolute seconds — §5 no reset at cuts */
const P = {
  notice: [1.2, 3.4], orient: [2.6, 4.6], step: [4.6, 7.0], settle: [6.6, 8.0], reach: [7.0, 9.4],
};
const NOTICE_HOLD = 0.40;
const REACH_READABLE = 0.3262;                       // measured landmark from 3.3D
const EFFECT_ONSET = REACH_READABLE + (1 - REACH_READABLE) * CAUSAL_HOLD_RATIO;

/** progress of a window at absolute time */
const win = (arr, t) => Math.max(0, Math.min(1, (t - arr[0]) / Math.max(1e-6, arr[1] - arr[0])));
function performanceAt(t) {
  const n = BB.noticeAt(win([0, P.orient[1] - 0], t), [P.notice[0] / (P.orient[1]), 1], NOTICE_HOLD);
  /** reach is the primary performance driver for the causal landmark */
  const reachProgress = smooth(win(P.reach, t));
  const stepProgress = smooth(win(P.step, t));
  const settleProgress = smooth(win(P.settle, t));
  const s = oneStep(stepProgress);
  const bodyFloor = { x: START.x + (STEP_END.x - START.x) * s.bodyCentre, y: FEET_Y, z: START.z + (STEP_END.z - START.z) * s.bodyCentre };
  const stance = buildStance(START, STEP_END, MOVE_DIR, s.movingFootTravel, STANCE_HALF, s.movingFootLift, 'right');
  /** the arm is gated on the settle so the reach INHERITS the step's result (§10 narrative memory) */
  const arm = Math.max(0, Math.min(1, (s.bodyCentre - 0.15) / 0.55)) * reachProgress;
  const headYaw = YAW_REST + (YAW_TO_NAME - YAW_REST) * n.headTurn;
  /** the head continues to hold the target while the body steps, and tracks it as the body moves (§10) */
  const sk = buildSkeleton(bodyFloor.x, FEET_Y, HEIGHT, { torsoYaw: YAW_TO_NAME * 0.35 * n.torsoTurn, headYaw, torsoLean: 0 }, bodyFloor.z);
  const solvedNow = yawFacingTarget({ x: sk.head.x, y: sk.head.y, z: sk.head.z }, NAME);
  return { bodyFloor, stance, arm, headYaw, torsoYaw: YAW_TO_NAME * 0.35 * n.torsoTurn, pelvisShift: s.pelvisShift,
    stepPhase: s.phase, movingFootLift: s.movingFootLift, reachProgress, stepProgress, settleProgress,
    noticeTurn: n.headTurn, noticeHold: n.holding, solvedYawNow: solvedNow, sk };
}
/** the NAME's fragmentation, gated on the reach's own legibility (the 3.3D causal result) */
function nameFragmentAt(t) {
  const reachProgress = smooth(win(P.reach, t));
  return reachProgress < EFFECT_ONSET ? 0 : Math.min(1, ((reachProgress - EFFECT_ONSET) / (1 - EFFECT_ONSET)) * 1.35);
}
/**
 * THE ROOM's structural decay — sequential dramatic consequence, no new causal constant.
 *
 * ⚠ THE FIRST WINDOW STARTED AFTER THE S4 CUT AND THE DECAY JUMPED AT THE BOUNDARY.
 *
 * It ran from `P.reach[1] + 0.9` to `TOTAL - 0.3`, but S4 begins earlier than that, so decay was still 0 on
 * the S4 start frame while the previous shot ended at 0 as well — and then jumped once the window opened.
 * The edit-continuity report caught it: `S3-name-lost -> S4-room-withdraws  room NO`.
 *
 * **The decay is now SHOT-RELATIVE**, declared per shot, with S4 ending at 0.88 and S5 continuing from 0.88 —
 * so the state is cumulative and **no cut in the film changes it discontinuously.**
 */
function roomDecayAt(t) {
  let acc = 0;
  for (const s of SHOTS) {
    if (t < acc + s.seconds) {
      const u = (t - acc) / s.seconds;
      if (s.id === 'S4-room-withdraws') return 0.88 * smooth(Math.max(0, (u - 0.15) / 0.85));
      if (s.id === 'S5-person-remains') return 0.88 + 0.12 * smooth(u);
      return 0;
    }
    acc += s.seconds;
  }
  return 1;
}

function drawRoom(fld, camera, decay) {
  const bb2 = camBasis(camera, ASPECT);
  const planes = Object.keys(SEM).map((id) => ({ id, quad: clipPlaneToViewport(bb2, id, planesWorld[id]).screenPolygon.map((p) => [p.x * COLS, p.y * ROWS]), value: SEM[id] }));
  const texW = stageW(decay, DS.texture), matW = stageW(decay, DS.planeMaterial), edgeW = stageW(decay, DS.secondaryEdges), juncW = Math.max(0.18, stageW(decay, DS.junctions));
  const RAMP = '.:+*#';
  for (const p of planes) {
    if (p.quad.length < 3) continue;
    if (texW > 0.05) {
      const g = RAMP[Math.max(0, Math.min(4, Math.round(p.value * 4)))];
      for (let r = 0; r < ROWS; r += 3) for (let c = 0; c < COLS; c += 3) {
        let inside = false; const px = c + 0.5, py = r + 0.5;
        for (let i = 0, j = p.quad.length - 1; i < p.quad.length; j = i++) { const xi = p.quad[i][0], yi = p.quad[i][1], xj = p.quad[j][0], yj = p.quad[j][1]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside; }
        if (inside) write(fld, c, r, { source: 'density', ch: g, weight: texW, freshness: 1 });
      }
    }
    if (matW > 0.05 || edgeW > 0.05) {
      for (let i = 0; i < p.quad.length; i++) {
        const a = p.quad[i], b = p.quad[(i + 1) % p.quad.length];
        const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
        for (let k = 0; k <= n; k++) write(fld, a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, { source: 'contour', ch: '+', weight: Math.max(matW, edgeW), freshness: 1 });
      }
    }
  }
  for (const corner of [box.backTL, box.backTR, box.backBR, box.backBL]) {
    const q = projectRoom(camera, { x: corner.x, y: corner.y, z: corner.z }, ASPECT);
    if (q.visible) write(fld, q.x * COLS, q.y * ROWS, { source: 'contour', ch: '+', weight: juncW, freshness: 1 });
  }
}
function drawName(fld, camera, frag) {
  const cells = NAME_CELLS.map((c) => {
    const p = projectRoom(camera, { x: c.x, y: c.y, z: c.z }, ASPECT), lc = projectRoom(camera, { x: c.lcx, y: c.lcy, z: c.z }, ASPECT);
    return { x: p.x * COLS, y: p.y * ROWS, lcx: lc.x * COLS, lcy: lc.y * ROWS, v: p.visible };
  });
  if (frag <= 0) { for (const c of cells) if (c.v) write(fld, c.x, c.y, { source: 'substitution', ch: '#', weight: 1, freshness: 1 }); return; }
  const loosen = frag < 0.40 ? smooth(frag / 0.40) : 1, separate = frag > 0.40 ? smooth(Math.min(1, (frag - 0.40) / 0.35)) : 0, erase = frag > 0.80 ? smooth((frag - 0.80) / 0.20) : 0;
  if (erase >= 0.98) return;
  for (const c of cells) {
    if (!c.v) continue;
    const dx = c.x - c.lcx, dy = c.y - c.lcy, d = Math.hypot(dx, dy) || 1, push = separate * (COLS / 240) * 8;
    const w = Math.max(0, 1 - loosen * 0.25 - erase * Math.min(1, d / 6.5) * 0.75);
    if (w <= 0.06) continue;
    write(fld, c.x + (dx / d) * push, c.y + (dy / d) * push, { source: 'substitution', ch: glyphForWeight(w), weight: w, freshness: 1 });
  }
}
function drawBody(fld, camera, st) {
  const cells = new Set();
  const put = (x, y) => cells.add(Math.round(x) + ',' + Math.round(y));
  const proj = (p) => { const q = projectRoom(camera, p, ASPECT); return { x: q.x * COLS, y: q.y * ROWS, v: q.visible }; };
  const sk = st.sk;
  const shoulderP = proj(sk.shoulder), pelvisP = proj(sk.pelvis), neckP = proj(sk.neck), neckTopP = proj(sk.neckTop), headP = proj(sk.head);
  const topP = proj({ x: sk.root.x, y: FEET_Y + HEIGHT, z: sk.root.z }), botP = proj({ x: sk.root.x, y: FEET_Y, z: sk.root.z });
  const pxH = Math.abs(botP.y - topP.y), pxW = pxH * (COLS / ROWS) * (H / W) * (W / COLS) / (H / ROWS);
  void pxW;
  const scale = pxH;   // cell-space height
  const headRc = (sk.headRadius / HEIGHT) * scale, limbC = 0.034 * scale, shHalfC = (sk.shoulderHalf / HEIGHT) * scale;
  const disc = (p, rx, ry) => { for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) put(p.x + dx, p.y + dy); };
  const cap = (a, b, r) => { const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2)); for (let i = 0; i <= n; i++) disc({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, r, r); };
  const box = (x0, y0, x1, y1) => { for (let y = Math.round(Math.min(y0, y1)); y <= Math.round(Math.max(y0, y1)); y++) for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x++) put(x, y); };
  cap(neckP, neckTopP, limbC * 0.78);
  const fp = headFootprint(st.headYaw);
  disc(headP, headRc * fp.widthScale, headRc);
  if (fp.facingCue > 0.02) { const dir = Math.sign(fp.facing) || 1; cap({ x: headP.x + dir * headRc * fp.widthScale * 0.85, y: headP.y - headRc * 0.10 }, { x: headP.x + dir * (headRc * fp.widthScale * 0.85 + headRc * fp.facingCue), y: headP.y - headRc * 0.05 }, limbC * 0.62); }
  const leanC = st.pelvisShift * limbC * 1.6;
  const nT = Math.max(2, Math.ceil(Math.abs(pelvisP.y - shoulderP.y)));
  for (let i = 0; i <= nT; i++) { const t = i / nT; const y = shoulderP.y + (pelvisP.y - shoulderP.y) * t; const hw = shHalfC * (1 - 0.27 * t); const cx = shoulderP.x + (pelvisP.x - shoulderP.x) * t + leanC * (1 - t); box(cx - hw, y, cx + hw, y); }
  const armClear = limbC * 1.15;
  const shL = { x: shoulderP.x - shHalfC - armClear + leanC, y: shoulderP.y }, elbL = { x: shL.x - shHalfC * 0.06 + leanC * 0.4, y: (shoulderP.y + pelvisP.y) / 2 }, handL = { x: elbL.x + leanC * 0.3, y: pelvisP.y + limbC * 2.4 };
  cap(shL, elbL, limbC); cap(elbL, handL, limbC * 0.86); disc(handL, limbC * 0.95, limbC * 0.95);
  const shR = { x: shoulderP.x + shHalfC + armClear + leanC, y: shoulderP.y }, elbR = { x: shR.x + shHalfC * 0.06 + leanC * 0.4, y: (shoulderP.y + pelvisP.y) / 2 }, handRest = { x: elbR.x + leanC * 0.3, y: pelvisP.y + limbC * 2.4 };
  const handWorld = { x: sk.root.x + (REACH_END.x - sk.root.x) * st.arm, y: (FEET_Y + HEIGHT * 0.44) + (REACH_END.y - (FEET_Y + HEIGHT * 0.44)) * st.arm, z: sk.root.z + (REACH_END.z - sk.root.z) * st.arm };
  const handT = proj(handWorld), handNow = { x: handRest.x + (handT.x - handRest.x), y: handRest.y + (handT.y - handRest.y) }, elbNow = { x: elbR.x + (handNow.x - elbR.x) * 0.5, y: elbR.y + (handNow.y - elbR.y) * 0.5 };
  cap(shR, elbNow, limbC); cap(elbNow, handNow, limbC * 0.86); disc(handNow, limbC * 0.95, limbC * 0.95);
  for (const [footW3, isLeft] of [[st.stance.leftFoot, true], [st.stance.rightFoot, false]]) {
    const lift = ((!isLeft && st.stance.movingFoot === 'right') || (isLeft && st.stance.movingFoot === 'left')) ? st.stance.movingFootLift : 0;
    const footW = proj({ x: footW3.x, y: footW3.y + lift, z: footW3.z });
    const hip = { x: pelvisP.x + (isLeft ? -shHalfC * 0.62 : shHalfC * 0.62) + leanC, y: pelvisP.y };
    const knee = { x: (hip.x + footW.x) / 2 + (isLeft ? -limbC * 0.4 : limbC * 0.4), y: (hip.y + footW.y) / 2 };
    cap(hip, knee, limbC * 1.05); cap(knee, footW, limbC * 0.85);
    box(footW.x - limbC * 1.35, footW.y - limbC * 0.6, footW.x + limbC * 1.35, footW.y);
  }
  for (const key of cells) {
    const [c, r] = key.split(',').map(Number);
    const edge = !cells.has(c - 1 + ',' + r) || !cells.has(c + 1 + ',' + r) || !cells.has(c + ',' + (r - 1)) || !cells.has(c + ',' + (r + 1));
    write(fld, c, r, { source: 'contour', ch: edge ? '|' : '#', weight: 1, freshness: 1 });
  }
  return handT;
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

await mkdir(OUT, { recursive: true }); await mkdir(TMP, { recursive: true });
const pngs = []; const trace = []; let prev = null, posChurn = 0, glyphChurn = 0;
for (let f = 0; f < FRAMES; f++) {
  const t = f / FPS;
  /** which shot are we in */
  let acc = 0, shot = SHOTS[0], local = 0;
  for (const s of SHOTS) { if (t < acc + s.seconds) { shot = s; local = (t - acc) / s.seconds; break; } acc += s.seconds; }
  const camera = camAt(shot.cam(local));
  const st = performanceAt(t);
  const frag = nameFragmentAt(t), decay = roomDecayAt(t);
  const fld = createField(COLS, ROWS);
  drawRoom(fld, camera, decay);
  drawName(fld, camera, frag);
  const handPx = drawBody(fld, camera, st);
  const lines = fieldToLines(fld);
  if (prev) { const c = churnBetween(prev, lines); posChurn += c.positionChurn; glyphChurn += c.glyphChurn; }
  prev = lines;
  pngs.push(encodePng(rasterLines(lines)));
  const nameNames = NAME_CELLS.map((c) => { const q = projectRoom(camera, { x: c.x, y: c.y, z: c.z }, ASPECT); return q.visible ? q : null; }).filter(Boolean);
  const nameCx = nameNames.reduce((a, q) => a + q.x, 0) / Math.max(1, nameNames.length) * COLS;
  const nameCy = nameNames.reduce((a, q) => a + q.y, 0) / Math.max(1, nameNames.length) * ROWS;
  trace.push({
    frame: f, t: +t.toFixed(3), shot: shot.id, camZ: +camera.eye.z.toFixed(5),
    bodyFloor: { x: +st.bodyFloor.x.toFixed(4), z: +st.bodyFloor.z.toFixed(4) },
    headYaw: +st.headYaw.toFixed(3), torsoYaw: +st.torsoYaw.toFixed(3),
    facingErrorDeg: +facingErrorDeg({ x: st.sk.head.x, y: st.sk.head.y, z: st.sk.head.z }, st.headYaw, NAME).toFixed(3),
    floorDistanceToName: +floorDistanceTo(st.bodyFloor, NAME).toFixed(4),
    stepAlignment: alignmentWithTarget({ x: MOVE_DIR.x, z: MOVE_DIR.z }, st.bodyFloor, NAME),
    reachProgress: +st.reachProgress.toFixed(4), stepProgress: +st.stepProgress.toFixed(4),
    noticeTurn: +st.noticeTurn.toFixed(4), noticeHold: st.noticeHold,
    stepPhase: st.stepPhase, movingFootLift: +st.movingFootLift.toFixed(4),
    nameFragment: +frag.toFixed(4), roomDecay: +decay.toFixed(4),
    handToNamePx: +Math.hypot(handPx.x - nameCx, handPx.y - nameCy).toFixed(2),
    headAttached: BB.headIsAttached(st.sk),
  });
}
const name = 'micro-film-v2';
await encode(name, pngs);
const bounds = []; { let a = 0; for (const s of SHOTS) { bounds.push({ shot: s.id, startFrame: Math.round(a * FPS), endFrame: Math.round((a + s.seconds) * FPS) - 1, seconds: s.seconds, reason: s.cutReason }); a += s.seconds; } }
await writeFile(path.join(OUT, 'causal-trace.json'), JSON.stringify({ totalSeconds: +TOTAL.toFixed(2), frames: FRAMES, shots: bounds, performance: P, effectOnsetReachProgress: EFFECT_ONSET, causalHoldRatio: CAUSAL_HOLD_RATIO, target: NAME, trace }, null, 2));
console.log('PHASE 3.3I — MICRO FILM V2\n');
console.log(`  ${FRAMES} frames  ${TOTAL.toFixed(2)} s  ${W}x${H}  ${FPS} fps`);
console.log(`  shots ${SHOTS.length}: ${SHOTS.map((s) => s.id + ' ' + s.seconds + 's').join(' | ')}`);
console.log(`  unique frame hashes: ${new Set(pngs.map((p) => createHash('sha256').update(p).digest('hex'))).size}/${FRAMES}`);
console.log(`  position churn ${posChurn}  glyph churn ${glyphChurn}`);
console.log(`  head attached every frame: ${trace.every((r) => r.headAttached)}`);
console.log(`  reach -> fragment causal order: ${(() => { const firstReach = trace.findIndex((r) => r.reachProgress > 0.01); const firstFrag = trace.findIndex((r) => r.nameFragment > 0); return firstReach >= 0 && firstFrag > firstReach; })()}`);
console.log(`  name state cumulative: ${(() => { let up = true; for (let i = 1; i < trace.length; i++) if (trace[i].nameFragment < trace[i - 1].nameFragment - 1e-9) up = false; return up; })()}`);
console.log(`  room state cumulative: ${(() => { let up = true; for (let i = 1; i < trace.length; i++) if (trace[i].roomDecay < trace[i - 1].roomDecay - 1e-9) up = false; return up; })()}`);
console.log(`  facing error: start ${trace[0].facingErrorDeg} -> min ${Math.min(...trace.map((r) => r.facingErrorDeg))}`);
console.log(`  distance to NAME: ${trace[0].floorDistanceToName} -> ${trace[FRAMES - 1].floorDistanceToName}`);
