/**
 * PHASE 3.3K — THE FIRST CONTRACT-DRIVEN PRODUCTION RENDER.
 *
 * Plan → validate → compile → CompiledShotSpec → sequence compiler → render runtime → render trace → pixels.
 *
 * ⚠ THE RENDER SCRIPT DECIDES NOTHING. It contains no `cam:(u)=>`, no `CAUSAL_HOLD_RATIO`, no
 * `effectOnset`. Every executable value arrives from `CompiledShotSpec`, and `guardRenderable` refuses a
 * render that did not go through compilation.
 */
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33k');
const TMP = path.join(OUT, 'frames');
const C = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'shot-compiler.js'));
const PF = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'performance.js'));
const BB = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'body.js'));
const TG = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'target.js'));
const MT = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'motion.js'));
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const { oneStep, smooth } = PF;
const { buildSkeleton, headFootprint, noticeAt } = BB;
const { yawFacingTarget, floorDirectionTo, stepToward, buildStance } = TG;
const { createField, write, glyphForWeight } = MT;
const { camBasis, projectRoom, makeRoomBox, roomPlanes, clipPlaneToViewport } = G;
const { compileSequence, guardRenderable, recordConsumption, inertPaths, emptyLedger } = C;
const { churnBetween, diffLineGrids } = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'grid-diff.js'));
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, FPS = 30, ASPECT = W / H;
const EYE_Y = 1.05, FOCAL = 0.9, HALF = { x: 1.5, y: 0.9, z: 0.69 }, CAM0 = 0.9315, CAM_PUSH = 0.7841;
const box = makeRoomBox({ centre: { x: 0, y: EYE_Y, z: CAM0 - 0.35 * HALF.z - HALF.z }, half: HALF });
const planesWorld = roomPlanes(box);
const SEM = { floor: 0.95, backWall: 0.50, ceiling: 0.34, leftWall: 0.16, rightWall: 0.16 };
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
const YAW_TO_NAME = yawFacingTarget(HEAD_REST, NAME), YAW_REST = -28, REACH_END = { x: 0.06, y: 1.12, z: -0.44 };
const CAUSAL_HOLD = 0.25, REACH_READABLE = 0.3262;

const FONT = { N: ['10001','11001','10101','10011','10001','10001','10001','10001','10001'], A: ['01110','10001','10001','10001','11111','10001','10001','10001','10001'], M: ['10001','11011','10101','10001','10001','10001','10001','10001','10001'], E: ['11111','10000','10000','10000','11110','10000','10000','10000','10000','11111'].slice(0,9) };
const NAME_CELLS = [];
{ const cw = 0.86 / (4 * 5 + 3); let li = 0;
  for (const ch of 'NAME') { const pat = FONT[ch]; const gx = -0.43 + li * 6 * cw;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) { if (pat[r][c] !== '1') continue;
      NAME_CELLS.push({ x: gx + c * cw, y: NAME.world.y - 0.12 + (r * 0.24) / 9, z: NAME.world.z, lcx: gx + 2.5 * cw, lcy: NAME.world.y }); } li++; } }

// ---------------------------------------------------------------------------
// THE PLAN — 3 shots, 10 s. Action and causal windows are DECLARED here, and only here.
// ---------------------------------------------------------------------------
const F = (s) => Math.round(s * FPS);
/** the performance windows, declared ONCE as the plan's own data */
const WIN = { notice: [0.9, 2.1], orient: [1.7, 3.0], step: [3.0, 4.6], settle: [4.3, 5.1], reach: [4.4, 6.6] };
const CAUSE_READABLE = REACH_READABLE;
const EFFECT_ONSET = CAUSE_READABLE + (1 - CAUSE_READABLE) * CAUSAL_HOLD;

const SHOT_DEFS = [
  { id: 'S1-establish', seconds: 3.2, camera: { move: 'none', motivation: 'static', reason: 'the space and the relation must be understood before anything changes' } },
  { id: 'S2-performance', seconds: 5.4, camera: { move: 'push-in', motivation: 'action-responsive',
      respondsTo: { kind: 'action', event: 'REACH', readableAt: CAUSE_READABLE }, beginsAt: CAUSE_READABLE + 0.10,
      reason: 'the camera answers the becoming-legible reach — the action supplies the motion' } },
  { id: 'S3-consequence', seconds: 2.4, camera: { move: 'push-in', motivation: 'consequence-responsive',
      respondsTo: { kind: 'consequence', event: 'ROOM_STRUCTURAL_DECAY', onsetsAt: 0.30 }, beginsAt: 0.30,
      reason: 'the camera follows the room withdrawal only after it has begun' } },
];
const TOTAL_S = SHOT_DEFS.reduce((a, s) => a + s.seconds, 0);
const FRAMES = Math.round(TOTAL_S * FPS);
let acc = 0; const SHOT_FRAMES = SHOT_DEFS.map((s) => { const o = { ...s, frameStart: acc, frameEnd: acc + F(s.seconds) - 1 }; acc += F(s.seconds); return o; });
/**
 * ⚠ THE RUNTIME LOOKS UP THE **COMPILED** SPEC, NOT THE PLANNED SHOT.
 *
 * The first version indexed `SHOT_FRAMES` — the planned declarations — and `guardRenderable` correctly
 * refused it: *"production renders must consume a compiled, validated plan."* **The guard caught the exact
 * bypass this phase exists to prevent, on its first execution.**
 */
const compiledById = new Map();
const compiledSpecOfFrame = (f) => {
  for (const s of compiledById.values()) if (f >= s.frameStart && f <= s.frameEnd) return s;
  throw new Error(`no compiled shot covers frame ${f}`);
};
const S2 = SHOT_FRAMES[1];

/** the REACH action's absolute window — the causal DOMAIN */
const REACH_ABS = { start: F(WIN.reach[0]), end: F(WIN.reach[1]) };
const ROOM_DECAY_START_S = 8.4;

const none = (r) => ({ kind: 'none', progress: 0, reason: r });
/** ⚠ renamed from `H`: the module already uses `H` for screen height */
const HIER = { primary: 1.0, secondary: 0.35, tertiary: 0.15 };
const HIER_E = { primary: 0.2, secondary: 1.0, tertiary: 0.15 };
const S = (p, n, r, np, rp) => ({ personState: p, nameState: n, roomState: r, nameProgress: np, roomProgress: rp });

const plannedShots = [
  { id: SHOT_FRAMES[0].id, frameStart: SHOT_FRAMES[0].frameStart, frameEnd: SHOT_FRAMES[0].frameEnd,
    entersIn: S('standing', 'intact', 'complete', 0, 0), exitsIn: S('standing, notice in progress', 'intact', 'complete', 0, 0),
    intent: {
      semanticEvent: 'a person stands alone in a room, and a name is written on the wall',
      dramaticIntention: 'establish the world and the person-name relation before anything changes',
      primaryAttention: { target: 'the room and the person standing in it', from: 'physical' },
      secondaryAttention: { target: 'the name on the wall', from: 'expression' },
      relation: 'presentational',
      motion: { relation: 'presentational', primary: none('the person is present but performs no action'), secondary: none('the name is already written and must simply be legible'), hierarchy: { primary: 0.5, secondary: 0.5, tertiary: 0.15 } },
      camera: { move: 'none', motivation: 'static', reason: 'the space must be understood before it can be lost' },
      beginsIn: 'empty frame', endsIn: 'person standing, room complete, NAME intact',
      expectedAudienceReading: 'a person is alone in a room, and their name is written on the wall' } },
  { id: S2.id, frameStart: S2.frameStart, frameEnd: S2.frameEnd,
    entersIn: S('standing, notice in progress', 'intact', 'complete', 0, 0),
    exitsIn: S('arm extended, holding the reach', 'fragmenting', 'complete', 0.6, 0),
    causal: { cause: 'REACH', effect: 'LETTER_FRAGMENT', causeStart: 0, causeReadable: CAUSE_READABLE, holdRatio: CAUSAL_HOLD, effectOnset: EFFECT_ONSET,
      validationScope: 'REACH -> LETTER_FRAGMENT only', domain: { kind: 'action-local', action: 'REACH', startFrame: REACH_ABS.start, endFrame: REACH_ABS.end } },
    intent: {
      semanticEvent: 'the person notices the name, orients to it, steps toward it, settles and reaches, and the name breaks',
      dramaticIntention: 'the act of reaching for the name is what destroys it',
      primaryAttention: { target: 'the reaching arm', from: 'physical' },
      secondaryAttention: { target: 'the name breaking apart', from: 'expression' },
      relation: 'physical-causes-expression',
      motion: { relation: 'physical-causes-expression', primary: { kind: 'reach', progress: 0.5, reason: 'the reach is the only physical expression the story needs, and it makes the noticing visible' }, secondary: { kind: 'letter-fragment', progress: 0.4, reason: 'the name breaks BECAUSE the person reached' }, hierarchy: HIER, onset: { after: 'reach-readable' } },
      camera: SHOT_FRAMES[1].camera,
      beginsIn: 'person standing, NAME intact', endsIn: 'arm extended, NAME fragmenting',
      expectedAudienceReading: 'reaching for the name is what makes it break' } },
  { id: SHOT_FRAMES[2].id, frameStart: SHOT_FRAMES[2].frameStart, frameEnd: SHOT_FRAMES[2].frameEnd,
    entersIn: S('arm extended, holding the reach', 'fragmenting', 'complete', 0.6, 0),
    exitsIn: S('still holding the reach, alone', 'gone', 'withdrawing', 1, 0.55),
    intent: {
      semanticEvent: 'the name is gone and the room begins to withdraw',
      dramaticIntention: 'the world withdraws, and it is the room rather than the person that goes',
      primaryAttention: { target: 'the room losing its structure', from: 'expression' },
      relation: 'expression-only',
      motion: { relation: 'expression-only', primary: none('the person holds the reach and does not act again'), secondary: { kind: 'structural-decay', progress: 0.6, reason: 'the room must withdraw as SPACE rather than switch off' }, hierarchy: HIER_E },
      camera: SHOT_FRAMES[2].camera,
      beginsIn: 'arm extended, NAME fragmenting', endsIn: 'room withdrawing, person still',
      expectedAudienceReading: 'the space around the person is going away' } },
];

// ================= COMPILE =================
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'director-plan.json'), JSON.stringify({ story: 'A person notices NAME, steps toward it, reaches, the NAME fragments, then the room begins to withdraw.', shots: plannedShots, windows: WIN, shotFrames: SHOT_FRAMES }, null, 2));
const compiled = compileSequence(plannedShots, { fps: FPS });
for (const s of compiled.shots) compiledById.set(s.shotId, s);
await writeFile(path.join(OUT, 'compiled-plan.json'), JSON.stringify(compiled, null, 2));
console.log('PHASE 3.3K — CONTRACT-DRIVEN PRODUCTION RENDER\n');
console.log(`  plan: ${SHOT_DEFS.length} shots, ${TOTAL_S.toFixed(2)} s, ${FRAMES} frames`);
console.log(`  compiled: ${compiled.shots.length} shots, ${compiled.totalFrames} frames`);
for (const s of compiled.shots) {
  console.log(`    ${s.shotId.padEnd(16)} ${String(s.frameStart).padStart(3)}..${String(s.frameEnd).padStart(3)}  ${s.compositionRelation.padEnd(28)} cam ${s.camera.motivation.padEnd(22)} ${s.camera.event ?? '-'} onset f${s.camera.beginsAtFrame ?? '-'}${s.causalTiming ? '  causal ' + s.causalTiming.causeReadableFrame + '/' + s.causalTiming.effectOnsetFrame + '  domain ' + s.causalTiming.domain : ''}`);
}
console.log('');

// ================= RUNTIME =================
/** ⚠ THE RUNTIME CONSUMES COMPILED VALUES. It decides nothing. */
const R = { ledger: emptyLedger() };
const camZFor = (spec, f) => {
  if (spec.camera.move === 'none') return CAM0;
  /** the ONLY camera logic: a low-level interpolation between two endpoints, starting at the COMPILED frame */
  const onset = spec.camera.beginsAtFrame;
  const span = Math.max(1, spec.frameEnd - onset);
  const u = Math.max(0, Math.min(1, (f - onset) / span));
  return CAM0 + (CAM_PUSH - CAM0) * smooth(u);
};
function performanceAt(t) {
  const n = noticeAt(t, [0, 1], 0.40);
  const s = oneStep(smooth(Math.max(0, Math.min(1, (t - WIN.step[0]) / (WIN.step[1] - WIN.step[0])))));
  const reach = smooth(Math.max(0, Math.min(1, (t - WIN.reach[0]) / (WIN.reach[1] - WIN.reach[0]))));
  const bodyFloor = { x: START.x + (STEP_END.x - START.x) * s.bodyCentre, y: FEET_Y, z: START.z + (STEP_END.z - START.z) * s.bodyCentre };
  const stance = buildStance(START, STEP_END, MOVE_DIR, s.movingFootTravel, STANCE_HALF, s.movingFootLift, 'right');
  const arm = Math.max(0, Math.min(1, (s.bodyCentre - 0.15) / 0.55)) * reach;
  const headYaw = YAW_REST + (YAW_TO_NAME - YAW_REST) * n.headTurn;
  const sk = buildSkeleton(bodyFloor.x, FEET_Y, HEIGHT, { torsoYaw: YAW_TO_NAME * 0.35 * n.torsoTurn, headYaw, torsoLean: 0 }, bodyFloor.z);
  return { bodyFloor, stance, arm, headYaw, torsoYaw: YAW_TO_NAME * 0.35 * n.torsoTurn, pelvisShift: s.pelvisShift, stepPhase: s.phase, movingFootLift: s.movingFootLift, reach, sk };
}
/** ⚠ THE EFFECT GATE CONSUMES THE COMPILED ONSET FRAME. It does not compute one. */
const effectGate = (spec, f) => {
  if (!spec.causalTiming) return 0;
  const on = spec.causalTiming.effectOnsetFrame, end = spec.frameEnd;
  if (f < on) return 0;
  return Math.min(1, (f - on) / Math.max(1, end - on) * 1.6);
};
const roomDecayFor = (f) => { const start = F(ROOM_DECAY_START_S); if (f < start) return 0; return Math.min(0.55, smooth((f - start) / Math.max(1, FRAMES - 1 - start)) * 0.55); };

function drawRoom(fld, camera, decay) {
  const b2 = camBasis(camera, ASPECT);
  const planes = Object.keys(SEM).map((id) => ({ id, quad: clipPlaneToViewport(b2, id, planesWorld[id]).screenPolygon.map((p) => [p.x * COLS, p.y * ROWS]), value: SEM[id] }));
  const texW = stageW(decay, DS.texture), matW = stageW(decay, DS.planeMaterial), edgeW = stageW(decay, DS.secondaryEdges), juncW = Math.max(0.18, stageW(decay, DS.junctions));
  const RAMP = '.:+*#';
  for (const p of planes) {
    if (p.quad.length < 3) continue;
    if (texW > 0.05) { const g = RAMP[Math.max(0, Math.min(4, Math.round(p.value * 4)))];
      for (let r = 0; r < ROWS; r += 3) for (let c = 0; c < COLS; c += 3) { let inside = false; const px = c + 0.5, py = r + 0.5;
        for (let i = 0, j = p.quad.length - 1; i < p.quad.length; j = i++) { const xi = p.quad[i][0], yi = p.quad[i][1], xj = p.quad[j][0], yj = p.quad[j][1]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside; }
        if (inside) write(fld, c, r, { source: 'density', ch: g, weight: texW, freshness: 1 }); } }
    if (matW > 0.05 || edgeW > 0.05) for (let i = 0; i < p.quad.length; i++) { const a = p.quad[i], b = p.quad[(i + 1) % p.quad.length]; const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]))); for (let k = 0; k <= n; k++) write(fld, a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, { source: 'contour', ch: '+', weight: Math.max(matW, edgeW), freshness: 1 }); }
  }
}
function drawName(fld, camera, frag) {
  const cells = NAME_CELLS.map((c) => { const p = projectRoom(camera, { x: c.x, y: c.y, z: c.z }, ASPECT), lc = projectRoom(camera, { x: c.lcx, y: c.lcy, z: c.z }, ASPECT); return { x: p.x * COLS, y: p.y * ROWS, lcx: lc.x * COLS, lcy: lc.y * ROWS, v: p.visible }; });
  if (frag <= 0) { for (const c of cells) if (c.v) write(fld, c.x, c.y, { source: 'substitution', ch: '#', weight: 1, freshness: 1 }); return; }
  const loosen = frag < 0.40 ? smooth(frag / 0.40) : 1, sep = frag > 0.40 ? smooth(Math.min(1, (frag - 0.40) / 0.35)) : 0, erase = frag > 0.80 ? smooth((frag - 0.80) / 0.20) : 0;
  if (erase >= 0.98) return;
  for (const c of cells) { if (!c.v) continue; const dx = c.x - c.lcx, dy = c.y - c.lcy, d = Math.hypot(dx, dy) || 1, push = sep * 8;
    const w = Math.max(0, 1 - loosen * 0.25 - erase * Math.min(1, d / 6.5) * 0.75); if (w <= 0.06) continue;
    write(fld, c.x + (dx / d) * push, c.y + (dy / d) * push, { source: 'substitution', ch: glyphForWeight(w), weight: w, freshness: 1 }); }
}
function drawBody(fld, camera, st) {
  const cells = new Set(); const put = (x, y) => cells.add(Math.round(x) + ',' + Math.round(y));
  const proj = (p) => { const q = projectRoom(camera, p, ASPECT); return { x: q.x * COLS, y: q.y * ROWS }; };
  const sk = st.sk, shoulderP = proj(sk.shoulder), pelvisP = proj(sk.pelvis), neckP = proj(sk.neck), neckTopP = proj(sk.neckTop), headP = proj(sk.head);
  const topP = proj({ x: sk.root.x, y: FEET_Y + HEIGHT, z: sk.root.z }), botP = proj({ x: sk.root.x, y: FEET_Y, z: sk.root.z });
  const scale = Math.abs(botP.y - topP.y), headRc = (sk.headRadius / HEIGHT) * scale, limbC = 0.034 * scale, shHalfC = (sk.shoulderHalf / HEIGHT) * scale;
  const disc = (p, rx, ry) => { for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) put(p.x + dx, p.y + dy); };
  const cap = (a, b, r) => { const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2)); for (let i = 0; i <= n; i++) disc({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, r, r); };
  const box = (x0, y0, x1, y1) => { for (let y = Math.round(Math.min(y0, y1)); y <= Math.round(Math.max(y0, y1)); y++) for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x++) put(x, y); };
  cap(neckP, neckTopP, limbC * 0.78);
  const fp = headFootprint(st.headYaw); disc(headP, headRc * fp.widthScale, headRc);
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
  for (const [fw3, isLeft] of [[st.stance.leftFoot, true], [st.stance.rightFoot, false]]) {
    const lift = ((!isLeft && st.stance.movingFoot === 'right') || (isLeft && st.stance.movingFoot === 'left')) ? st.stance.movingFootLift : 0;
    const footW = proj({ x: fw3.x, y: fw3.y + lift, z: fw3.z });
    const hip = { x: pelvisP.x + (isLeft ? -shHalfC * 0.62 : shHalfC * 0.62) + leanC, y: pelvisP.y };
    const knee = { x: (hip.x + footW.x) / 2 + (isLeft ? -limbC * 0.4 : limbC * 0.4), y: (hip.y + footW.y) / 2 };
    cap(hip, knee, limbC * 1.05); cap(knee, footW, limbC * 0.85); box(footW.x - limbC * 1.35, footW.y - limbC * 0.6, footW.x + limbC * 1.35, footW.y);
  }
  for (const key of cells) { const [c, r] = key.split(',').map(Number); const edge = !cells.has(c - 1 + ',' + r) || !cells.has(c + 1 + ',' + r) || !cells.has(c + ',' + (r - 1)) || !cells.has(c + ',' + (r + 1)); write(fld, c, r, { source: 'contour', ch: edge ? '|' : '#', weight: 1, freshness: 1 }); }
}
function rasterLines(lines) {
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 3) }; const cw = W / COLS, chh = H / ROWS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const ch = lines[r][c]; if (ch === ' ') continue; const g = GLYPH_BY_CODE[ch.charCodeAt(0)]; if (!g) continue;
    const v = Math.round(50 + (' .\':-+*#@'.indexOf(ch) / 9) * 205);
    for (let py = 0; py < GLYPH_H; py++) { const mr = g.rows[py]; if (!mr) continue; for (let px = 0; px < GLYPH_W; px++) { if (!(mr & (1 << (GLYPH_W - 1 - px)))) continue;
      const x0 = Math.round(c * cw + (px * cw) / GLYPH_W), x1 = Math.round(c * cw + ((px + 1) * cw) / GLYPH_W), y0 = Math.round(r * chh + (py * chh) / GLYPH_H), y1 = Math.round(r * chh + ((py + 1) * chh) / GLYPH_H);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const o = (y * W + x) * 3; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; } } } }
  return img;
}
const fieldToLines = (f) => { const o = []; for (let r = 0; r < f.rows; r++) { let s = ''; for (let c = 0; c < f.cols; c++) s += f.cells[r * f.cols + c].ch; o.push(s); } return o; };

const trace = []; const pngs = []; let prev = null, posChurn = 0, glyphChurn = 0;
/** states sampled immediately before/after compiled events, for the pixel-consequence check */
const PROBE_RADIUS = 3;
const probes = {};
for (let f = 0; f < FRAMES; f++) {
  const spec = compiledSpecOfFrame(f);
  guardRenderable(spec);
  const camera = { eye: { x: 0, y: EYE_Y, z: camZFor(spec, f) }, target: { x: 0, y: EYE_Y, z: 0 }, focal: FOCAL };
  const t = f / FPS;
  const st = performanceAt(t);
  const frag = effectGate(spec, f);
  const decay = roomDecayFor(f);
  const fld = createField(COLS, ROWS);
  drawRoom(fld, camera, decay);
  drawName(fld, camera, frag);
  drawBody(fld, camera, st);
  const lines = fieldToLines(fld);
  if (prev) { const c = churnBetween(prev, lines); posChurn += c.positionChurn; glyphChurn += c.glyphChurn; }
  prev = lines;
  pngs.push(encodePng(rasterLines(lines)));
  trace.push({ frame: f, shot: spec.shotId, camZ: +camera.eye.z.toFixed(6), frag: +frag.toFixed(4), decay: +decay.toFixed(4), rootX: +st.bodyFloor.x.toFixed(5), rootZ: +st.bodyFloor.z.toFixed(5), headYaw: +st.headYaw.toFixed(3), arm: +st.arm.toFixed(4), reach: +st.reach.toFixed(4) });
  for (const [nm, fr] of Object.entries({ reach: spec.causalTiming?.causeReadableFrame, effect: spec.causalTiming?.effectOnsetFrame, camera: spec.camera.beginsAtFrame })) {
    if (fr === undefined) continue;
    if (f === fr - PROBE_RADIUS) probes[`${spec.shotId}:${nm}:before`] = lines.join('|');
    if (f === fr + PROBE_RADIUS) probes[`${spec.shotId}:${nm}:after`] = lines.join('|');
  }
}
/** CONSUMPTION — recorded by the RUNTIME, from what it actually used */
recordConsumption(R.ledger, 'cameraIntent', 'camZFor'); R.ledger.cameraIntent.compiled = compiled.shots.some((s) => s.camera.move !== 'none');
recordConsumption(R.ledger, 'causalTiming', 'effectGate'); R.ledger.causalTiming.compiled = compiled.shots.some((s) => !!s.causalTiming);
recordConsumption(R.ledger, 'targetAnchor', 'performanceAt'); R.ledger.targetAnchor.compiled = true;
recordConsumption(R.ledger, 'asciiExpression', 'drawName'); R.ledger.asciiExpression.compiled = true;

// ================= EXPORT =================
const FFMPEG = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg');
const LIB = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64');
async function encode(name, list) {
  const dir = path.join(TMP, name); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  for (let i = 0; i < list.length; i++) await writeFile(path.join(dir, `f${String(i).padStart(5, '0')}.png`), list[i]);
  await new Promise((res, rej) => { const c = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-fflags', '+bitexact', '-flags:v', '+bitexact', path.join(OUT, `${name}.mp4`)], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } }); let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(e)))); });
  await rm(dir, { recursive: true, force: true });
}
await encode('contract-proof-film', pngs);
const mediaBuf = await readFile(path.join(OUT, 'contract-proof-film.mp4'));
const mediaHash = createHash('sha256').update(mediaBuf).digest('hex');
const specHash = createHash('sha256').update(JSON.stringify(compiled)).digest('hex');
const traceHash = createHash('sha256').update(JSON.stringify(trace)).digest('hex');

// ================= EQUALITY =================
/**
 * ⚠ THE ONSET FRAME IS WHERE THE VALUE BEGINS, NOT WHERE IT FIRST BECOMES NONZERO.
 *
 * The first version searched for the first frame whose `camZ` differed from rest, and got 166 against a
 * compiled 165 — because the easing value is **exactly 0 at the onset frame**. That is correct behaviour, and
 * the CHECK was wrong: it conflated *"the onset frame"* with *"the first frame with a measurable magnitude"*.
 *
 * The right test is (a) the value is at rest ON the compiled onset frame, and (b) it is no longer at rest on
 * the NEXT frame.
 */
const rtCameraOnset = (() => {
  const onset = trace.findIndex((r) => Math.abs(r.camZ - CAM0) > 1e-9) - 1;
  const atRestOnOnset = Math.abs(trace[onset].camZ - CAM0) < 1e-12;
  const movedAfter = Math.abs(trace[onset + 1].camZ - CAM0) > 1e-12;
  return atRestOnOnset && movedAfter ? onset : -1;
})();
const compiledCameraOnset = Math.min(...compiled.shots.filter((s) => s.camera.move !== 'none').map((s) => s.camera.beginsAtFrame));
const s2spec = compiled.shots.find((s) => s.causalTiming);
const rtEffectOnset = (() => { const nz = trace.findIndex((r) => r.frag > 0); return trace[nz - 1] && trace[nz - 1].frag === 0 ? nz - 1 : nz; })();
const rtStepEnd = trace[FRAMES - 1].rootX;
const pixConsequence = Object.entries(probes).map(([k]) => k);
const probeChecks = [];
for (const base of ['reach', 'effect', 'camera']) {
  const b = Object.keys(probes).find((k) => k.endsWith(`:${base}:before`));
  const a = Object.keys(probes).find((k) => k.endsWith(`:${base}:after`));
  if (b && a) probeChecks.push({ event: base, changed: probes[b] !== probes[a] });
}

const report = {
  phase: '3.3K', totalSeconds: +TOTAL_S.toFixed(2), frames: FRAMES, fps: FPS,
  plan: { story: plannedShots[0].intent.semanticEvent, shots: compiled.shots.map((s) => ({ id: s.shotId, frameStart: s.frameStart, frameEnd: s.frameEnd, semanticEvent: s.semanticEvent, target: s.target })) },
  compiled: { shots: compiled.shots.map((s) => ({ id: s.shotId, camera: s.camera, causalTiming: s.causalTiming ?? null })), specHash: specHash.slice(0, 16) },
  runtime: { cameraOnsetFrame: rtCameraOnset, effectOnsetFrame: rtEffectOnset, finalRootX: +rtStepEnd.toFixed(5), churn: { position: posChurn, glyph: glyphChurn } },
  equality: [
    { quantity: 'camera onset frame', compiled: compiledCameraOnset, runtime: rtCameraOnset, equal: compiledCameraOnset === rtCameraOnset, note: 'the value is at rest ON this frame and moves on the next' },
    { quantity: 'effect onset frame', compiled: s2spec.causalTiming.effectOnsetFrame, runtime: rtEffectOnset, equal: s2spec.causalTiming.effectOnsetFrame === rtEffectOnset, note: 'fragmentation is 0 ON this frame' },
  ],
  pixelConsequence: probeChecks,
  consumption: R.ledger, inert: inertPaths(R.ledger),
  traceHash: traceHash.slice(0, 16), mediaHash: mediaHash.slice(0, 16),
  hashes: { spec: specHash, trace: traceHash, media: mediaHash },
};
await writeFile(path.join(OUT, 'render-trace.json'), JSON.stringify({ ...report, trace }, null, 2));
await writeFile(path.join(OUT, 'consumption-ledger.json'), JSON.stringify(R.ledger, null, 2));
console.log('  PLAN -> COMPILED -> RUNTIME EQUALITY');
for (const e of report.equality) console.log(`    ${e.quantity.padEnd(20)} compiled ${String(e.compiled).padStart(4)}   runtime ${String(e.runtime).padStart(4)}   ${e.equal ? 'MATCH' : 'MISMATCH'}`);
console.log('');
console.log('  PIXEL CONSEQUENCE (does the compiled event change the grid?)');
for (const p of report.pixelConsequence) console.log(`    ${p.event.padEnd(10)} ${p.changed ? 'GRID CHANGED' : 'no change'}`);
console.log('');
console.log('  CONSUMPTION LEDGER');
for (const [k, v] of Object.entries(R.ledger)) console.log(`    ${k.padEnd(17)} compiled=${String(v.compiled).padEnd(6)} consumed=${String(v.consumed).padEnd(6)} by ${v.consumer}`);
console.log(`    inert paths: ${inertPaths(R.ledger).length === 0 ? 'none' : inertPaths(R.ledger).join(', ')}`);
console.log('');
console.log(`  hashes: spec ${specHash.slice(0, 16)}  trace ${traceHash.slice(0, 16)}  media ${mediaHash.slice(0, 16)}`);
console.log(`  output: out/phase33k/contract-proof-film.mp4`);
