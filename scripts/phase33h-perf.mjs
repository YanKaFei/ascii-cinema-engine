/**
 * PHASE 3.3H — PERFORMANCE: can an ASCII human perform a continuous intentional action?
 *
 * One action, three timings. Same room, NAME, start pose, end pose, camera, duration, step distance,
 * reach distance. ONLY performance timing differs.
 *
 *   node scripts/phase33h-perf.mjs
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33h');
const TMP = path.join(OUT, 'frames');
const PF = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'performance.js'));
const BODY = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'body.js'));
const { buildSkeleton, headNeckGap, headIsAttached } = BODY;
const MT = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'motion.js'));
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const { Performance, oneStep, smooth, easeOut, contactFrame, poseDiscontinuities } = PF;
const { createField, write } = MT;
const { churnBetween } = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'grid-diff.js'));
const { camBasis, projectRoom, makeRoomBox, roomPlanes, clipPlaneToViewport } = G;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, FPS = 30, ASPECT = W / H;
const SECONDS = 9, FRAMES = SECONDS * FPS;
const EYE_Y = 1.05, FOCAL = 0.9, HALF = { x: 1.5, y: 0.9, z: 0.69 }, CAMZ = 0.9315;
const box = makeRoomBox({ centre: { x: 0, y: EYE_Y, z: CAMZ - 0.35 * HALF.z - HALF.z }, half: HALF });
const planesWorld = roomPlanes(box);
const SEM = { floor: 0.95, backWall: 0.50, ceiling: 0.34, leftWall: 0.16, rightWall: 0.16 };
const DIRV = { floor: 'vertical', leftWall: 'diagFall', rightWall: 'diagRise', backWall: 'horizontal', ceiling: 'horizontal' };
const cam = { eye: { x: 0, y: EYE_Y, z: CAMZ }, target: { x: 0, y: EYE_Y, z: 0 }, focal: FOCAL };
const bb = camBasis(cam, ASPECT);
const projPx = (p) => { const q = projectRoom(cam, p, ASPECT); return { x: q.x * W, y: q.y * H, v: q.visible }; };

/** IDENTICAL SPATIAL BLOCKING for all three variants — the experiment is timing, not blocking. */
const START_X = -0.95, STEP_DX = 0.42, FEET_Y = EYE_Y - HALF.y, HEIGHT = 1.6, ZW = -0.2;
const NAME_X = 0.0, NAME_Z = -0.64, NAME_Y = 1.30, NAME_W = 0.86, NAME_H = 0.24;
const HAND_END = { x: 0.06, y: 1.12, z: -0.44 };

const FONT = { N: ['10001','11001','10101','10011','10001','10001','10001','10001','10001'], A: ['01110','10001','10001','10001','11111','10001','10001','10001','10001'], M: ['10001','11011','10101','10001','10001','10001','10001','10001','10001'], E: ['11111','10000','10000','10000','11110','10000','10000','10000','10000','11111'].slice(0,9) };
const NAME_CELLS = [];
{ const cellW = NAME_W / (4 * 5 + 3); let li = 0;
  for (const ch of 'NAME') { const pat = FONT[ch]; const gx = -NAME_W / 2 + li * (5 + 1) * cellW, lcx = gx + 2.5 * cellW;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) { if (pat[r][c] !== '1') continue;
      NAME_CELLS.push({ x: gx + c * cellW, y: NAME_Y - NAME_H / 2 + (r * NAME_H) / 9, z: NAME_Z, lcx, lcy: NAME_Y }); } li++; } }

// ---------------------------------------------------------------------------
// THE THREE SCORES — identical action content, different timing
// ---------------------------------------------------------------------------
/**
 * P1 SERIAL — the control. Actions occur mostly sequentially, with minimal overlap.
 * It is NOT made deliberately bad; it is the straightforward pose-to-pose baseline.
 */
const P1 = {
  name: 'P1-serial',
  overlap: 0,
  actions: [
    { kind: 'notice',   window: [0.06, 0.16], lead: 'head', follow: [{ part: 'torso', delay: 0.30 }], anticipation: 0, hold: 0 },
    { kind: 'orient',   window: [0.17, 0.33], lead: 'head', follow: [{ part: 'torso', delay: 0.20 }, { part: 'pelvis', delay: 0.40 }], anticipation: 0.05, hold: 0 },
    { kind: 'step',     window: [0.34, 0.55], lead: 'pelvis', follow: [{ part: 'leftLeg', delay: 0.10 }, { part: 'rightLeg', delay: 0.30 }, { part: 'torso', delay: 0.35 }], anticipation: 0.08, hold: 0 },
    { kind: 'settle',   window: [0.56, 0.68], lead: 'pelvis', follow: [{ part: 'torso', delay: 0.25 }], anticipation: 0, hold: 0 },
    { kind: 'reach',    window: [0.69, 0.97], lead: 'rightArm', follow: [{ part: 'torso', delay: 0.22 }, { part: 'head', delay: 0.30 }], anticipation: 0.07, hold: 0 },
  ],
};
/**
 * P2 LEAD/FOLLOW — controlled overlaps.
 *   head leads the torso; the weight shift anticipates the step; the torso settles while the reach begins.
 */
const P2 = {
  name: 'P2-lead-follow',
  overlap: 0.10,
  actions: [
    { kind: 'notice',   window: [0.05, 0.15], lead: 'head', follow: [{ part: 'torso', delay: 0.35 }], anticipation: 0, hold: 0 },
    { kind: 'orient',   window: [0.12, 0.30], lead: 'head', follow: [{ part: 'torso', delay: 0.22 }, { part: 'pelvis', delay: 0.44 }], anticipation: 0.05, hold: 0 },
    { kind: 'step',     window: [0.26, 0.52], lead: 'pelvis', follow: [{ part: 'leftLeg', delay: 0.12 }, { part: 'rightLeg', delay: 0.32 }, { part: 'torso', delay: 0.40 }], anticipation: 0.10, hold: 0 },
    { kind: 'settle',   window: [0.50, 0.66], lead: 'pelvis', follow: [{ part: 'torso', delay: 0.28 }], anticipation: 0, hold: 0 },
    { kind: 'reach',    window: [0.60, 0.95], lead: 'rightArm', follow: [{ part: 'torso', delay: 0.25 }, { part: 'head', delay: 0.32 }], anticipation: 0.08, hold: 0 },
  ],
};
/**
 * P3 — P2's logic PLUS restrained perceptual holds after noticing, after foot contact, and at full reach.
 * **Time is REDISTRIBUTED, not extended** — the clip length is identical.
 */
const P3 = {
  name: 'P3-lead-follow-holds',
  overlap: 0.10,
  actions: [
    { kind: 'hold',     window: [0.15, 0.23], lead: 'head', follow: [], anticipation: 0, hold: 0.08 },
    { kind: 'orient',   window: [0.20, 0.34], lead: 'head', follow: [{ part: 'torso', delay: 0.22 }, { part: 'pelvis', delay: 0.44 }], anticipation: 0.05, hold: 0 },
    { kind: 'step',     window: [0.30, 0.55], lead: 'pelvis', follow: [{ part: 'leftLeg', delay: 0.12 }, { part: 'rightLeg', delay: 0.32 }, { part: 'torso', delay: 0.40 }], anticipation: 0.10, hold: 0 },
    { kind: 'hold',     window: [0.56, 0.64], lead: 'pelvis', follow: [], anticipation: 0, hold: 0.08 },
    { kind: 'settle',   window: [0.55, 0.68], lead: 'pelvis', follow: [{ part: 'torso', delay: 0.28 }], anticipation: 0, hold: 0 },
    { kind: 'reach',    window: [0.66, 0.94], lead: 'rightArm', follow: [{ part: 'torso', delay: 0.25 }, { part: 'head', delay: 0.32 }], anticipation: 0.08, hold: 0.06 },
  ],
};
const SCORES = [P1, P2, P3];

// ---------------------------------------------------------------------------
// BODY — an abstract figure whose parts have DIFFERENTIATED TIMING, not anatomy
// ---------------------------------------------------------------------------
/**
 * The figure is drawn from body state. **Nothing here translates the whole silhouette**: `rootX` follows the
 * step's `bodyCentre`, and the LEGS are drawn to the feet's own positions, so the displacement is explained
 * by the leg action rather than pretending to be walking.
 */
function bodyState(perf, t) {
  const at = (k) => perf.actionProgress(k, t) ?? 0;
  const o = at('orient'), s = at('step'), se = at('settle'), r = at('reach');
  const headTurn = perf.partProgress('orient', 'head', t) * 34 + perf.partProgress('notice', 'head', t) * 14;
  const torsoTurn = perf.partProgress('orient', 'torso', t) * 18;
  const st = oneStep(s);
  const rootX = START_X + STEP_DX * st.bodyCentre;
  const reachAmt = perf.partProgress('reach', 'rightArm', t);
  /** the arm's beginning is gated on the settle having begun, so the reach inherits the step's result */
  const armReady = Math.max(0, Math.min(1, (se - 0.15) / 0.55));
  const arm = reachAmt * Math.max(0.25, armReady);
  const { movingFootTravel } = st;
  /** feet: the support foot stays planted; the moving foot travels */
  const leftFootX = START_X - 0.11;
  const rightFootX = START_X + 0.11 + movingFootTravel * STEP_DX;
  /** pelvis lags the head, torso lags further — the lead/follow chain made visible */
  const pelvisTurn = perf.partProgress('orient', 'pelvis', t) * 9;
  return { rootX, headTurn, torsoTurn, pelvisTurn, arm, leftFootX, rightFootX, support: st.supportFoot, contact: st.contact, bodyCentre: st.bodyCentre, stepProgress: s, orientProgress: o, settleProgress: se, reachProgress: r };
}

/**
 * DRAW THE BODY FROM ITS SKELETON.
 *
 * ⚠ THE HEAD IS NO LONGER PLACED FROM THE WORLD ROOT X. Every joint comes from `buildSkeleton`, which places
 * each one **from its parent**: root -> pelvis -> torso -> shoulder -> neck -> head. The old code displaced
 * the head by `sin(headTurn) * height * 0.30` while the neck stayed at the unshifted root x, so at maximum
 * turn the head left the body. That is now structurally impossible: the head's travel is bounded by the
 * attachment criterion, and it is applied about `neckTop`.
 *
 * Every joint is projected **after** the hierarchy is built, so the chain cannot be broken by projection.
 */
function drawBody(fld, bs) {
  const put = (x, y, ch) => write(fld, x, y, { source: 'contour', ch: ch ?? '#', weight: 1, freshness: 1 });
  const cw = W / COLS, chh = H / ROWS;
  const sk = buildSkeleton(bs.rootX, FEET_Y, HEIGHT, { torsoYaw: bs.torsoTurn, headYaw: bs.headTurn, torsoLean: 0 }, ZW);
  const P = (v) => projPx(v);
  const discC = (p, r) => { for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (Math.hypot(dx, dy) <= r) put((p.x + dx) / cw, (p.y + dy) / chh, '#'); };
  const capC = (a, b, r) => { const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2)); for (let i = 0; i <= n; i++) discC({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, r); };
  const boxC = (x0, y0, x1, y1) => { for (let y = Math.round(Math.min(y0, y1)); y <= Math.round(Math.max(y0, y1)); y++) for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x++) put(x / cw, y / chh, '#'); };

  const rootP = P(sk.root), pelvisP = P(sk.pelvis), torsoP = P(sk.torso);
  const shoulderP = P(sk.shoulder), neckP = P(sk.neck), neckTopP = P(sk.neckTop), headP = P(sk.head);
  /** head radius in pixels, from the projected figure height */
  const topP = P({ x: sk.root.x, y: FEET_Y + HEIGHT, z: ZW }), botP = P({ x: sk.root.x, y: FEET_Y, z: ZW });
  const pxHeight = Math.abs(botP.y - topP.y);
  const headRpx = (sk.headRadius / HEIGHT) * pxHeight;
  const limbPx = (0.034) * pxHeight;

  /** NECK — drawn from its own base to its own top, so the head has something to sit on */
  capC(neckP, neckTopP, limbPx * 0.78);
  /** HEAD — a disc at the skeleton's head position, which is anchored to neckTop */
  discC(headP, headRpx);
  /** TORSO — from the shoulder line down to the pelvis, following the torso's own yaw */
  const shHalfPx = (sk.shoulderHalf / HEIGHT) * pxHeight;
  const torsoTop = { x: shoulderP.x, y: shoulderP.y };
  const torsoBot = { x: pelvisP.x, y: pelvisP.y };
  const nT = Math.max(2, Math.ceil(Math.abs(torsoBot.y - torsoTop.y)));
  for (let i = 0; i <= nT; i++) {
    const t = i / nT;
    const y = torsoTop.y + (torsoBot.y - torsoTop.y) * t;
    const hw = shHalfPx * (1 - 0.27 * t);
    const cx = torsoTop.x + (torsoBot.x - torsoTop.x) * t;
    boxC(cx - hw, y, cx + hw, y);
  }
  /**
   * ⚠ NEGATIVE SPACE BETWEEN ARM AND TORSO IS PART OF THE RECOGNITION GRAMMAR, not decoration.
   *
   * The first skeleton version anchored both arms AT the torso's edge, so the arm capsule merged into the
   * torso box and the figure rendered as one solid mass with no arm/body separation — the pose was continuous
   * but **no longer read as a person**. §10 requires the arm to remain separable from the torso.
   *
   * The anchors are moved **outward by a shoulder radius** so the limb hangs clear of the torso silhouette,
   * leaving a readable gap along its whole length. This is the minimum change that restores the grammar; the
   * torso width itself is untouched.
   */
  const armClear = limbPx * 1.15;
  const shL = { x: shoulderP.x - shHalfPx - armClear, y: shoulderP.y };
  const elbL = { x: shL.x - shHalfPx * 0.06, y: (shoulderP.y + pelvisP.y) / 2 };
  const handL = { x: elbL.x, y: pelvisP.y + limbPx * 2.4 };
  capC(shL, elbL, limbPx); capC(elbL, handL, limbPx * 0.86); discC(handL, limbPx * 0.95);
  /** RIGHT ARM — reaches toward the NAME, from its own shoulder, never from the world root */
  const shR = { x: shoulderP.x + shHalfPx + armClear, y: shoulderP.y };
  const elbR = { x: shR.x + shHalfPx * 0.06, y: (shoulderP.y + pelvisP.y) / 2 };
  const handRest = { x: elbR.x, y: pelvisP.y + limbPx * 2.4 };
  const handWorld = { x: sk.root.x + (HAND_END.x - sk.root.x) * bs.arm, y: (FEET_Y + HEIGHT * 0.44) + (HAND_END.y - (FEET_Y + HEIGHT * 0.44)) * bs.arm, z: ZW + (HAND_END.z - ZW) * bs.arm };
  const handTarget = P(handWorld);
  const handNow = { x: handRest.x + (handTarget.x - handRest.x) * 1, y: handRest.y + (handTarget.y - handRest.y) * 1 };
  const elbNow = { x: elbR.x + (handNow.x - elbR.x) * 0.5, y: elbR.y + (handNow.y - elbR.y) * 0.5 };
  capC(shR, elbNow, limbPx); capC(elbNow, handNow, limbPx * 0.86); discC(handNow, limbPx * 0.95);
  /** LEGS — each from the PELVIS to ITS OWN FOOT, so displacement is explained by the leg */
  for (const [fx, isLeft] of [[bs.leftFootX, true], [bs.rightFootX, false]]) {
    const hip = { x: pelvisP.x + (isLeft ? -shHalfPx * 0.62 : shHalfPx * 0.62), y: pelvisP.y };
    const footW = P({ x: fx, y: FEET_Y, z: ZW });
    const knee = { x: (hip.x + footW.x) / 2 + (isLeft ? -limbPx * 0.4 : limbPx * 0.4), y: (hip.y + footW.y) / 2 };
    capC(hip, knee, limbPx * 1.05); capC(knee, footW, limbPx * 0.85);
    boxC(footW.x - limbPx * 1.35, footW.y - limbPx * 0.6, footW.x + limbPx * 1.35, footW.y);
  }
  return { handWorld, armPx: handNow, skeleton: sk };
}

function drawRoom(fld) {
  const planes = Object.keys(SEM).map((id) => ({ id, quad: clipPlaneToViewport(bb, id, planesWorld[id]).screenPolygon.map((p) => [p.x * COLS, p.y * ROWS]), dir: DIRV[id], value: SEM[id] }));
  /**
   * ⚠ THE OUTLINE-ONLY ROOM WAS **DEBUG / PERFORMANCE ISOLATION ONLY** AND IS NOT PRODUCTION.
   *
   * It was introduced in 3.3H as a diagnostic isolation step, to test whether the figure was invisible
   * because it shared ink with a full-coverage floor. That question is now **closed by a different root
   * cause** (see `drawBody`: the figure was writing no glyph of its own and inheriting the room's `+`), so the
   * outline hack is reverted.
   *
   * **Canonical architecture remains `v4-directional`**, as frozen by the Phase 3.2B external gate. The
   * plane fill and the plane-specific stroke direction are restored below exactly as the canonical strategy
   * defines them. §13 of the 3.3H.1 brief: production composition must not be solved by deleting room
   * material.
   */
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

function rasterLines(lines) {
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 3) };
  const cw = W / COLS, chh = H / ROWS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = lines[r][c]; if (ch === ' ') continue;
    const g = GLYPH_BY_CODE[ch.charCodeAt(0)]; if (!g) continue;
    const v = Math.round(50 + (' .\':-+*#@'.indexOf(ch) / 9) * 205);
    for (let py = 0; py < GLYPH_H; py++) { const mr = g.rows[py]; if (!mr) continue;
      for (let pxx = 0; pxx < GLYPH_W; pxx++) { if (!(mr & (1 << (GLYPH_W - 1 - pxx)))) continue;
        const x0 = Math.round(c * cw + (pxx * cw) / GLYPH_W), x1 = Math.round(c * cw + ((pxx + 1) * cw) / GLYPH_W);
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
const reports = {};
const extremaIndices = {};
for (const score of SCORES) {
  const perf = new Performance(score);
  const pngs = []; const trace = []; const extremaFrames = []; let prevLines = null; let churn = 0, posChurn = 0, glyphChurn = 0;
  for (let f = 0; f < FRAMES; f++) {
    const t = f / (FRAMES - 1);
    const bs = bodyState(perf, t);
    const fld = createField(COLS, ROWS);
    drawRoom(fld);
    const drawn = drawBody(fld, bs);
    const lines = fieldToLines(fld);
    /**
     * ⚠ THE OLD `asciiChurnCells` METRIC WAS WRONG IN BOTH DIRECTIONS and has been replaced.
     *
     * It compared **character values only**, so it read **0** while the figure was moving with the same
     * glyph, and **748** while the rendered image was **byte-identical on every frame**. Its name gave no
     * hint which property it measured.
     *
     * `churnBetween` counts **occupancy movement** and **glyph substitution** separately, so a same-glyph
     * move is counted as movement and a static image cannot report churn. Both numbers are kept.
     */
    if (prevLines) { const ch = churnBetween(prevLines, lines); churn += ch.total; posChurn += ch.positionChurn; glyphChurn += ch.glyphChurn; }
    const png = encodePng(rasterLines(lines));
    pngs.push(png);
    /**
     * The extrema frames are captured DURING the render, because this ffmpeg build has no filter support and
     * extracting them from the h264 would give approximately-the-frame rather than the frame. The extrema
     * review asks whether the figure is readable at a specific pose, so it needs the exact raster.
     */
    extremaFrames.push({ f, png, headAngle: bs.headTurn, bodyCentre: bs.bodyCentre, arm: bs.arm, stepProgress: bs.stepProgress, contact: bs.contact, support: bs.support });
    trace.push({
      frame: f, t: +t.toFixed(4), rootX: +bs.rootX.toFixed(4), rootY: FEET_Y,
      headAngle: +bs.headTurn.toFixed(2), torsoAngle: +bs.torsoTurn.toFixed(2),
      handX: +drawn.handWorld.x.toFixed(4), handY: +drawn.handWorld.y.toFixed(4),
      handToName: +Math.hypot(drawn.handWorld.x - NAME_X, drawn.handWorld.y - NAME_Y).toFixed(4),
      leftFootX: +bs.leftFootX.toFixed(4), rightFootX: +bs.rightFootX.toFixed(4),
      support: bs.support, contact: bs.contact, bodyCentre: +bs.bodyCentre.toFixed(4),
      arm: +bs.arm.toFixed(4), stepProgress: +bs.stepProgress.toFixed(4), reachProgress: +bs.reachProgress.toFixed(4),
      orientProgress: +bs.orientProgress.toFixed(4),
    });
    prevLines = lines;
  }
  await encode(score.name, pngs);

  /** EXTREMA EXPORT — poses located from the trace, never hardcoded */
  {
    const EX = path.join(OUT, 'extrema');
    await mkdir(EX, { recursive: true });
    const tr = trace;
    const pick = {
      'neutral': 0,
      'max-head-turn': tr.reduce((b, r, i) => (Math.abs(r.headAngle) > Math.abs(tr[b].headAngle) ? i : b), 0),
      'max-weight-shift': tr.reduce((b, r, i) => (r.bodyCentre > tr[b].bodyCentre ? i : b), 0),
      'mid-step': (() => { const s = tr.filter((r) => r.stepProgress > 0.05 && r.stepProgress < 0.95); return s.length ? s[Math.floor(s.length / 2)].frame : 0; })(),
      'foot-contact': (() => { const c = tr.find((r) => r.contact); return c ? c.frame : 0; })(),
      'post-contact-settle': (() => { const c = tr.find((r) => r.contact); return c ? Math.min(tr.length - 1, c.frame + 12) : 0; })(),
      'max-reach': tr.reduce((b, r, i) => (r.arm > tr[b].arm ? i : b), 0),
      'final-hold': tr.length - 1,
    };
    const chosen = {};
    for (const [name, idx] of Object.entries(pick)) {
      chosen[name] = idx;
      await writeFile(path.join(EX, `${score.name}-${name}-f${String(idx).padStart(3, '0')}.png`), extremaFrames[idx].png);
    }
    extremaIndices[score.name] = chosen;
  }
  // metrics
  const vel = trace.map((r, i) => (i ? (r.rootX - trace[i - 1].rootX) * FPS : 0));
  const acc = vel.map((v, i) => (i ? (v - vel[i - 1]) * FPS : 0));
  const contactFrames = trace.filter((r) => r.contact).map((r) => r.frame);
  /**
   * ⚠ FOOT SLIP — the first version of this counter was WRONG and reported 26-31 "slips" on every variant.
   *
   * It checked that the support foot's x never changes. But the **moving** foot is the right foot while the
   * body is supported by the right foot — *support* means the body's weight is over it, not that the foot is
   * planted. Counting its travel as slip flagged the step itself as a defect.
   *
   * Slip is specifically: **a foot that is on the ground moving without being the travelling foot.** With one
   * step there is exactly one travelling foot (`rightFootX` moves during `FOOT_TRAVEL`) and one planted foot
   * (`leftFootX`, which must never move at all). That is what is measured now.
   */
  let slips = 0;
  for (let i = 1; i < trace.length; i++) {
    const p = trace[i - 1], q = trace[i];
    /** the left foot is planted for the whole performance — any movement is slip */
    if (Math.abs(q.leftFootX - p.leftFootX) > 1e-9) slips++;
  }
  const maxJump = Math.max(...trace.map((r, i) => (i ? Math.abs(r.rootX - trace[i - 1].rootX) : 0)));
  /** the expected per-frame root motion if the step were constant-velocity across its own window */
  const stepAction = score.actions.find((a) => a.kind === 'step');
  const stepFrames = stepAction ? Math.max(1, (stepAction.window[1] - stepAction.window[0]) * (FRAMES - 1)) : 1;
  const expectedJump = (trace[FRAMES - 1].rootX - trace[0].rootX) / stepFrames;
  const maxVel = Math.max(...vel.map(Math.abs)), maxAcc = Math.max(...acc.map(Math.abs));
  const handMonotone = (() => { const a = trace.filter((r) => r.reachProgress > 0).map((r) => r.handToName); let up = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[i - 1] + 1e-4) up++; return up; })();
  reports[score.name] = {
    score: { overlap: score.overlap, actions: score.actions.map((a) => ({ kind: a.kind, window: a.window, lead: a.lead, follow: a.follow })) },
    frames: FRAMES, seconds: SECONDS,
    maxRootJumpPerFrame: +maxJump.toFixed(5),
    expectedJumpPerFrame: +expectedJump.toFixed(5),
    /** discontinuity = the largest per-frame root move divided by the expected one; ~1-3 is normal easing */
    jumpRatio: +(maxJump / Math.max(1e-9, expectedJump)).toFixed(2),
    maxRootVelocity: +maxVel.toFixed(4), maxRootAcceleration: +maxAcc.toFixed(3),
    contactFrames, footSlipFrames: slips, plantedFootMoves: slips, handToNameIncreases: handMonotone,
    rootStart: trace[0].rootX, rootEnd: trace[FRAMES - 1].rootX,
    stepDistance: +(trace[FRAMES - 1].rootX - trace[0].rootX).toFixed(4),
    handToNameStart: trace[0].handToName, handToNameEnd: trace[FRAMES - 1].handToName,
    /**
     * ⚠ `asciiChurnCells` READ 0 ON EVERY VARIANT, and the name did not describe the measurement.
     *
     * It compared the GRID OF CHARACTERS. The floor uses one character, the figure another, the NAME
     * another — so when the figure moves, the characters are unchanged and only their POSITIONS differ. The
     * grid comparison was measuring nothing about motion.
     *
     * What matters for §14 is **cell-position churn**: how many lattice cells changed character between
     * frames, which is what a viewer sees changing. `lineChurnCells` reports that; `pixelChurn` reports the
     * rendered consequence.
     */
    lineChurnCells: churn, positionChurn: posChurn, glyphSubstitutionChurn: glyphChurn,
    uniqueFrameHashes: new Set(pngs.map((p) => createHash('sha256').update(p).digest('hex'))).size,
    trace,
  };
}
await writeFile(path.join(OUT, 'performance-report.json'), JSON.stringify(reports, null, 2));
await writeFile(path.join(OUT, 'extrema', 'extrema-frames.json'), JSON.stringify(extremaIndices, null, 2));

console.log('PHASE 3.3H — PERFORMANCE\n');
console.log(`  ${FRAMES} frames, ${SECONDS} s, ${W}x${H}, ${FPS} fps, static camera\n`);
console.log('  variant                 maxJump/f  maxVel   maxAcc   contact f  footSlip  handToName  stepDist  posChurn  glyphChurn');
for (const [n, r] of Object.entries(reports)) {
  console.log(`  ${n.padEnd(22)} ${String(r.maxRootJumpPerFrame).padStart(8)} ${String(r.maxRootVelocity).padStart(8)} ${String(r.maxRootAcceleration).padStart(8)} ${String(r.contactFrames.length).padStart(10)} ${String(r.footSlipFrames).padStart(9)} ${r.handToNameStart.toFixed(2)}->${r.handToNameEnd.toFixed(2)} ${String(r.stepDistance).padStart(8)} ${String(r.positionChurn).padStart(9)} ${String(r.glyphSubstitutionChurn).padStart(8)}`);
}
console.log('');
/**
 * ⚠ NO INVENTED ABSOLUTE THRESHOLD. The first version tested `maxRootJumpPerFrame < 0.02`, a number I made
 * up, and every variant "failed" it while being perfectly smooth. The question a discontinuity check should
 * ask is **relative**: does the largest one-frame movement exceed what the motion's own easing can produce?
 * A smoothstep over N frames peaks at about 1.5x the average, so a ratio well above that is a jump.
 */
const allOk = Object.values(reports).every((r) => r.jumpRatio < 3.0 && r.footSlipFrames === 0 && r.handToNameIncreases === 0);
for (const [n, r] of Object.entries(reports)) {
  console.log(`    ${n.padEnd(22)} root jump ratio ${String(r.jumpRatio).padStart(6)} (expected 1.0, smooth easing peaks near 1.5)  planted-foot moves ${r.plantedFootMoves}`);
}
console.log(`\n  no discontinuity, no foot slip, monotone hand approach: ${allOk ? 'PASS' : 'FAIL'}`);
