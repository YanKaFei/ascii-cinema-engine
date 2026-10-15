/**
 * PHASE 3.3H.3 — TARGETED PERCEPTUAL REPAIR.
 *
 * Three ISOLATED tests, not three competing variants:
 *   N  — NOTICE ONLY   : can an observer perceive a shift of attention?
 *   W  — ONE STEP ONLY : does it read as a step rather than sliding / splitting?
 *   NW — FULL          : notice -> orient -> step -> settle -> reach
 *
 * Timing baseline = the externally WINNING variant (clip-02 = P1-serial). Its action durations are frozen;
 * the repairs are to the NOTICE representation and the STEP / WEIGHT geometry, NOT to timing.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33h3');
const TMP = path.join(OUT, 'frames');
const PF = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'performance.js'));
const BB = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'body.js'));
const MT = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'motion.js'));
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const { oneStep, smooth, STEP_PHASES } = PF;
const { buildSkeleton, headFootprint, noticeAt } = BB;
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
const DIRV = { floor: 'vertical', leftWall: 'diagFall', rightWall: 'diagRise', backWall: 'horizontal', ceiling: 'horizontal' };
const cam = { eye: { x: 0, y: EYE_Y, z: CAMZ }, target: { x: 0, y: EYE_Y, z: 0 }, focal: FOCAL };
const bb = camBasis(cam, ASPECT);
const projPx = (p) => { const q = projectRoom(cam, p, ASPECT); return { x: q.x * W, y: q.y * H, v: q.visible }; };

const START_X = -0.95, STEP_DX = 0.42, FEET_Y = EYE_Y - HALF.y, HEIGHT = 1.6, ZW = -0.2;
const NAME_Y = 1.30, NAME_W = 0.86, NAME_H = 0.24, NAME_Z = -0.64;
const HAND_END = { x: 0.06, y: 1.12, z: -0.44 };

const FONT = { N: ['10001','11001','10101','10011','10001','10001','10001','10001','10001'], A: ['01110','10001','10001','10001','11111','10001','10001','10001','10001'], M: ['10001','11011','10101','10001','10001','10001','10001','10001','10001'], E: ['11111','10000','10000','10000','11110','10000','10000','10000','10000','11111'].slice(0,9) };
const NAME_CELLS = [];
{ const cw = NAME_W / (4 * 5 + 3); let li = 0;
  for (const ch of 'NAME') { const pat = FONT[ch]; const gx = -NAME_W / 2 + li * (5 + 1) * cw;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) { if (pat[r][c] !== '1') continue;
      NAME_CELLS.push({ x: gx + c * cw, y: NAME_Y - NAME_H / 2 + (r * NAME_H) / 9, z: NAME_Z }); } li++; } }

/** the FROZEN winning timing — P1-serial's action windows, unchanged */
const BASE = {
  notice: [0.06, 0.16], orient: [0.17, 0.33], step: [0.34, 0.55], settle: [0.56, 0.68], reach: [0.69, 0.97],
};
/** the NOTICE repair: the head leads, the torso follows, and there is a HOLD after the turn completes */
const NOTICE_HOLD = 0.40;   // 40% of the notice+orient span is spent holding the orientation

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

/**
 * THE FIGURE, with the two repairs:
 *   NOTICE  — the head is drawn with a YAW-DEPENDENT footprint (foreshortened width + a facing cue), so its
 *             orientation is silhouette information rather than a rotationally symmetric disc.
 *   STEP    — the legs follow the weight-event phasing: the pelvis shifts over the support leg, the moving
 *             foot ARCS, and the root lags the foot.
 */
function drawBody(fld, st) {
  /**
   * ⚠ THE FIGURE WAS A UNIFORM `#` MASS, WITH NO CONTOUR LINE.
   *
   * The human recognition grammar from Phase 3.1 is **SILHOUETTE + NEGATIVE SPACE**, and it draws the
   * boundary as `|` against a `#` interior. `drawBody` marked everything `#`, so the figure rendered as a
   * featureless filled shape: the head's yaw-dependent narrowing was present in the geometry and **invisible
   * in the image**, and the notice measured only 66 changed cells across its whole clip.
   *
   * The body is therefore collected into a cell set first and written in a second pass, so a cell knows
   * whether it has an unoccupied 4-neighbour — the same morphological boundary rule the rest of this project
   * uses. **No tolerance, no threshold.**
   */
  const cells = new Set();
  const put = (x, y) => cells.add(Math.round(x) + ',' + Math.round(y));
  const cw = W / COLS, chh = H / ROWS;
  const sk = buildSkeleton(st.rootX, FEET_Y, HEIGHT, { torsoYaw: st.torsoYaw, headYaw: st.headYaw, torsoLean: 0 }, ZW);
  const P = projPx;
  const disc = (p, rx, ry) => { for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) put((p.x + dx) / cw, (p.y + dy) / chh); };
  const cap = (a, b, r) => { const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2)); for (let i = 0; i <= n; i++) disc({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, r, r); };
  const box = (x0, y0, x1, y1) => { for (let y = Math.round(Math.min(y0, y1)); y <= Math.round(Math.max(y0, y1)); y++) for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x++) put(x / cw, y / chh); };

  const shoulderP = P(sk.shoulder), pelvisP = P(sk.pelvis), neckP = P(sk.neck), neckTopP = P(sk.neckTop), headP = P(sk.head);
  const topP = P({ x: sk.root.x, y: FEET_Y + HEIGHT, z: ZW }), botP = P({ x: sk.root.x, y: FEET_Y, z: ZW });
  const pxH = Math.abs(botP.y - topP.y);
  const headRpx = (sk.headRadius / HEIGHT) * pxH, limbPx = 0.034 * pxH, shHalfPx = (sk.shoulderHalf / HEIGHT) * pxH;

  /** NECK */
  cap(neckP, neckTopP, limbPx * 0.78);
  /** HEAD — foreshortened by yaw, with a facing cue on the leading edge */
  const fp = headFootprint(st.headYaw);
  const hx = headRpx * fp.widthScale, hy = headRpx;
  disc(headP, hx, hy);
  if (fp.facingCue > 0.02) {
    const dir = Math.sign(fp.facing) || 1;
    const cueLen = headRpx * fp.facingCue;
    cap({ x: headP.x + dir * hx * 0.85, y: headP.y - hy * 0.10 }, { x: headP.x + dir * (hx * 0.85 + cueLen), y: headP.y - hy * 0.05 }, limbPx * 0.62);
  }
  /** TORSO — leans with the pelvis shift, so weight transfer is visible in the trunk */
  const leanPx = st.pelvisShift * limbPx * 1.6;
  const nT = Math.max(2, Math.ceil(Math.abs(pelvisP.y - shoulderP.y)));
  for (let i = 0; i <= nT; i++) {
    const t = i / nT;
    const y = shoulderP.y + (pelvisP.y - shoulderP.y) * t;
    const hw = shHalfPx * (1 - 0.27 * t);
    const cx = shoulderP.x + (pelvisP.x - shoulderP.x) * t + leanPx * (1 - t);
    box(cx - hw, y, cx + hw, y);
  }
  /** ARMS — kept clear of the torso so the negative space survives */
  const armClear = limbPx * 1.15;
  const shL = { x: shoulderP.x - shHalfPx - armClear + leanPx, y: shoulderP.y };
  const elbL = { x: shL.x - shHalfPx * 0.06 + leanPx * 0.4, y: (shoulderP.y + pelvisP.y) / 2 };
  const handL = { x: elbL.x + leanPx * 0.3, y: pelvisP.y + limbPx * 2.4 };
  cap(shL, elbL, limbPx); cap(elbL, handL, limbPx * 0.86); disc(handL, limbPx * 0.95, limbPx * 0.95);
  const shR = { x: shoulderP.x + shHalfPx + armClear + leanPx, y: shoulderP.y };
  const elbR = { x: shR.x + shHalfPx * 0.06 + leanPx * 0.4, y: (shoulderP.y + pelvisP.y) / 2 };
  const handRest = { x: elbR.x + leanPx * 0.3, y: pelvisP.y + limbPx * 2.4 };
  const handWorld = { x: sk.root.x + (HAND_END.x - sk.root.x) * st.arm, y: (FEET_Y + HEIGHT * 0.44) + (HAND_END.y - (FEET_Y + HEIGHT * 0.44)) * st.arm, z: ZW + (HAND_END.z - ZW) * st.arm };
  const handT = P(handWorld);
  const handNow = { x: handRest.x + (handT.x - handRest.x), y: handRest.y + (handT.y - handRest.y) };
  const elbNow = { x: elbR.x + (handNow.x - elbR.x) * 0.5, y: elbR.y + (handNow.y - elbR.y) * 0.5 };
  cap(shR, elbNow, limbPx); cap(elbNow, handNow, limbPx * 0.86); disc(handNow, limbPx * 0.95, limbPx * 0.95);
  /** LEGS — the moving foot follows the arc: horizontal travel PLUS the lift, so it leaves the ground */
  const footPx = (fx, lift) => P({ x: fx, y: FEET_Y + lift, z: ZW });
  const leftFoot = footPx(st.leftFootX, 0);
  const rightFoot = footPx(st.rightFootX, st.movingFootLift);
  for (const [footW, isLeft] of [[leftFoot, true], [rightFoot, false]]) {
    const hip = { x: pelvisP.x + (isLeft ? -shHalfPx * 0.62 : shHalfPx * 0.62) + leanPx, y: pelvisP.y };
    const knee = { x: (hip.x + footW.x) / 2 + (isLeft ? -limbPx * 0.4 : limbPx * 0.4), y: (hip.y + footW.y) / 2 };
    cap(hip, knee, limbPx * 1.05); cap(knee, footW, limbPx * 0.85);
    box(footW.x - limbPx * 1.35, footW.y - limbPx * 0.6, footW.x + limbPx * 1.35, footW.y);
  }

  /** SECOND PASS — the contour. A cell with any unoccupied 4-neighbour is boundary. */
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

/**
 * THE THREE TESTS. Each returns the body state at clip time `t`.
 *
 * `N` uses only the notice+orient choreography; `W` starts already oriented and performs only the step;
 * `NW` runs the full frozen sequence.
 */
const TESTS = {
  /**
   * ⚠ THE NOTICE TEST USED THE FULL-PERFORMANCE WINDOW AND THEREFORE FINISHED AT 33% OF ITS OWN CLIP.
   *
   * The notice mechanism is frozen in `BASE`, but this test's PURPOSE is to ask whether a shift of attention
   * is perceivable — which requires the orientation to occupy the test's whole duration, with a long hold
   * afterwards. Stretching the window does not retune the mechanism; it gives the mechanism a clip in which
   * it can be seen at all.
   */
  'notice-only': (t) => {
    const n = noticeAt(t, [0.05, 0.55], NOTICE_HOLD);
    /** no step, no reach */
    return { rootX: START_X, headYaw: n.headTurn * 48, torsoYaw: n.torsoTurn * 18, arm: 0, leftFootX: START_X - 0.11, rightFootX: START_X + 0.11, movingFootLift: 0, pelvisShift: 0, holding: n.holding, stepPhase: 'weight-transfer' };
  },
  'step-only': (t) => {
    /** the figure is ALREADY oriented — this test isolates the step */
    const s = oneStep(Math.max(0, Math.min(1, (t - 0.20) / 0.55)));
    return { rootX: START_X + STEP_DX * s.bodyCentre, headYaw: 48, torsoYaw: 18, arm: 0, leftFootX: START_X - 0.11, rightFootX: START_X + 0.11 + s.movingFootTravel * STEP_DX, movingFootLift: s.movingFootLift, pelvisShift: s.pelvisShift, holding: false, stepPhase: s.phase };
  },
  'full-performance': (t) => {
    const n = noticeAt(t, [BASE.notice[0], BASE.orient[1]], NOTICE_HOLD);
    const inStep = t >= BASE.step[0] && t <= BASE.settle[1];
    const s = oneStep(inStep ? (t - BASE.step[0]) / (BASE.settle[1] - BASE.step[0]) : t < BASE.step[0] ? 0 : 1);
    const r = Math.max(0, Math.min(1, (t - BASE.reach[0]) / (BASE.reach[1] - BASE.reach[0])));
    const arm = Math.max(0, Math.min(1, (s.bodyCentre - 0.15) / 0.55)) * smooth(r);
    return { rootX: START_X + STEP_DX * s.bodyCentre, headYaw: n.headTurn * 48, torsoYaw: n.torsoTurn * 18, arm, leftFootX: START_X - 0.11, rightFootX: START_X + 0.11 + s.movingFootTravel * STEP_DX, movingFootLift: s.movingFootLift, pelvisShift: s.pelvisShift, holding: n.holding, stepPhase: s.phase };
  },
};
const SECONDS = { 'notice-only': 5, 'step-only': 5, 'full-performance': 9 };

await mkdir(OUT, { recursive: true }); await mkdir(TMP, { recursive: true });
const reports = {};
for (const [name, fn] of Object.entries(TESTS)) {
  const FR = SECONDS[name] * FPS;
  const pngs = []; const trace = []; let prev = null, posChurn = 0, glyphChurn = 0;
  for (let f = 0; f < FR; f++) {
    const t = f / (FR - 1);
    const st = fn(t);
    const fld = createField(COLS, ROWS);
    drawRoom(fld);
    drawBody(fld, st);
    const lines = fieldToLines(fld);
    if (prev) { const c = churnBetween(prev, lines); posChurn += c.positionChurn; glyphChurn += c.glyphChurn; }
    prev = lines;
    pngs.push(encodePng(rasterLines(lines)));
    const sk = buildSkeleton(st.rootX, FEET_Y, HEIGHT, { torsoYaw: st.torsoYaw, headYaw: st.headYaw, torsoLean: 0 }, ZW);
    trace.push({ frame: f, t: +t.toFixed(4), rootX: +st.rootX.toFixed(4), headYaw: +st.headYaw.toFixed(3), torsoYaw: +st.torsoYaw.toFixed(3), arm: +st.arm.toFixed(4), leftFootX: +st.leftFootX.toFixed(4), rightFootX: +st.rightFootX.toFixed(4), movingFootLift: +st.movingFootLift.toFixed(4), pelvisShift: +st.pelvisShift.toFixed(4), holding: st.holding, stepPhase: st.stepPhase, headAttached: BB.headIsAttached(sk), headWidthScale: +headFootprint(st.headYaw).widthScale.toFixed(4), facingCue: +headFootprint(st.headYaw).facingCue.toFixed(4) });
  }
  await encode(name, pngs);
  const rootVel = trace.map((r, i) => (i ? (r.rootX - trace[i - 1].rootX) * FPS : 0));
  const pelvisVel = trace.map((r, i) => (i ? (r.pelvisShift - trace[i - 1].pelvisShift) * FPS : 0));
  reports[name] = {
    frames: FR, seconds: SECONDS[name],
    uniqueHashes: new Set(pngs.map((p) => createHash('sha256').update(p).digest('hex'))).size,
    positionChurn: posChurn, glyphChurn,
    headAttachedEveryFrame: trace.every((r) => r.headAttached),
    orientationSpanDeg: +(Math.max(...trace.map((r) => r.headYaw)) - Math.min(...trace.map((r) => r.headYaw))).toFixed(2),
    torsoLagsHead: trace.filter((r) => r.torsoYaw > 0.01 && r.headYaw > 0.01).every((r, i, a) => i === 0 || r.headYaw >= r.torsoYaw - 1e-6),
    holdFrames: trace.filter((r) => r.holding).length,
    supportFootSlip: (() => { let n = 0; for (let i = 1; i < trace.length; i++) if (Math.abs(trace[i].leftFootX - trace[i - 1].leftFootX) > 1e-9) n++; return n; })(),
    footLiftMax: +Math.max(...trace.map((r) => r.movingFootLift)).toFixed(4),
    footLiftFrames: trace.filter((r) => r.movingFootLift > 0.001).length,
    rootJumpRatio: (() => { const stepFrames = Math.max(1, (BASE.step[1] - BASE.step[0]) * (FR - 1)); const exp = (trace[FR - 1].rootX - trace[0].rootX) / stepFrames; const mx = Math.max(...trace.map((r, i) => (i ? Math.abs(r.rootX - trace[i - 1].rootX) : 0))); return exp > 1e-6 ? +(mx / exp).toFixed(2) : null; })(),
    rootStart: trace[0].rootX, rootEnd: trace[FR - 1].rootX,
    maxRootVel: +Math.max(...rootVel.map(Math.abs)).toFixed(4),
    maxPelvisVel: +Math.max(...pelvisVel.map(Math.abs)).toFixed(4),
    phases: [...new Set(trace.map((r) => r.stepPhase))],
    /** the lag between the foot's travel and the root's, sampled at mid-step */
    midStepLag: (() => { const m = trace.filter((r) => r.stepPhase === 'foot-travel'); if (!m.length) return null; const r = m[Math.floor(m.length / 2)]; return +((r.rightFootX - (START_X + 0.11)) / STEP_DX - (r.rootX - START_X) / STEP_DX).toFixed(4); })(),
    trace,
  };
}
await writeFile(path.join(OUT, 'tests-report.json'), JSON.stringify(reports, null, 2));

console.log('PHASE 3.3H.3 — TARGETED TESTS\n');
console.log('  test                frames  unique  posChurn  glyphChurn  headAttached  orientSpan  holdF  slip');
for (const [n, r] of Object.entries(reports)) {
  console.log(`  ${n.padEnd(20)} ${String(r.frames).padStart(5)} ${String(r.uniqueHashes).padStart(7)} ${String(r.positionChurn).padStart(9)} ${String(r.glyphChurn).padStart(11)} ${String(r.headAttachedEveryFrame).padStart(13)} ${String(r.orientationSpanDeg).padStart(9)} ${String(r.holdFrames).padStart(6)} ${String(r.supportFootSlip).padStart(5)}`);
}
console.log('');
console.log('  STEP PHASING:');
for (const n of ['step-only', 'full-performance']) {
  const r = reports[n];
  console.log(`    ${n.padEnd(18)} liftMax ${r.footLiftMax}  liftFrames ${r.footLiftFrames}  midStepLag ${r.midStepLag}  rootJumpRatio ${r.rootJumpRatio}  phases ${r.phases.join(', ')}`);
}
console.log('');
const okAll = Object.values(reports).every((r) => r.uniqueHashes > 1 && r.headAttachedEveryFrame && r.supportFootSlip === 0);
console.log(`  all tests: motion reaches image, head attached every frame, no foot slip: ${okAll ? 'PASS' : 'FAIL'}`);
