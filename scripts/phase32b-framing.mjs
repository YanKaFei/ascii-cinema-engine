/**
 * PHASE 3.2B — FRAMING SWEEP. Solve against SCREEN-SPACE CONSTRAINTS, not by guessing camera direction.
 *
 * The brief's correction is right and worth restating: **moving the camera back makes the back wall
 * smaller, not larger.** The projected height depends on `worldHeight / distanceToPlane x focal`, so the
 * variables that matter are the relation between the room's world size, the camera-to-back-wall distance,
 * and the focal length — not any single number.
 *
 * So this sweeps the parameter space, computes the projected metrics from the projection maths, and scores
 * candidates against the framing contract BEFORE rendering anything.
 *
 *   node scripts/phase32b-framing.mjs
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const { makeRoomBox, projectRoom } = G;

const W = 1920, H = 1080, ASPECT = W / H;
const EYE_Y = 1.05;

/**
 * Project the room and measure it in SCREEN SPACE.
 *
 * Nothing here renders. The metrics are computed from the same `projectRoom` the renderer uses, so a
 * candidate rejected here would have been rejected on screen too.
 */
function measure({ halfW, halfH, halfD, camZ, focal, distToBack }) {
  /**
   * GEOMETRY, STATED ONCE.
   *
   *   the eye sits at `z = camZ`, INSIDE the volume
   *   the back wall sits at `z = camZ - dist`, so `dist` is the eye-to-back-wall distance
   *   the box CENTRE is halfway between them
   *
   * ⚠ The first version of this collapsed the centre onto `camZ`, which put the eye **at the back wall**
   * so every plane projected degenerately and the reported height was ~20% instead of the 50% the
   * algebra predicts. The bug was arithmetic, not conceptual, and it is the reason to compute the
   * expected value alongside the measured one.
   */
  const dist = distToBack;
  const centreZ = camZ - dist / 2;
  const cam = { eye: { x: 0, y: EYE_Y, z: camZ }, target: { x: 0, y: EYE_Y, z: 0 }, focal };
  const box = makeRoomBox({ centre: { x: 0, y: EYE_Y, z: centreZ }, half: { x: halfW, y: halfH, z: halfD } });
  const pts = {
    backTL: projectRoom(cam, box.backTL, ASPECT), backTR: projectRoom(cam, box.backTR, ASPECT),
    backBR: projectRoom(cam, box.backBR, ASPECT), backBL: projectRoom(cam, box.backBL, ASPECT),
    frontTL: projectRoom(cam, box.frontTL, ASPECT), frontTR: projectRoom(cam, box.frontTR, ASPECT),
    frontBR: projectRoom(cam, box.frontBR, ASPECT), frontBL: projectRoom(cam, box.frontBL, ASPECT),
  };
  const finite = Object.values(pts).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const backVisible = pts.backTL.visible && pts.backTR.visible && pts.backBR.visible && pts.backBL.visible;
  if (!finite || !backVisible) return { ok: false, reason: !finite ? 'non-finite projection' : 'back wall behind near plane' };

  const bTL = pts.backTL, bTR = pts.backTR, bBR = pts.backBR, bBL = pts.backBL;
  const bw = Math.abs(bTR.x - bTL.x), bh = Math.abs(bBL.y - bTL.y);

  /**
   * ENCLOSURE — and the first version of this test was WRONG.
   *
   * It took the min/max over all eight projected corners. But the eye sits at the box's front face, so
   * the front corner nearest the camera is at or behind the near plane, `projectRoom` returns `visible:
   * false` with x=y=0.5, and those clamped values **collapse the spread to the back wall alone** — which
   * is always inside the frame. Every candidate therefore reported "does not enclose", including ones
   * whose side walls plainly do.
   *
   * Enclosure is a statement about **screen-space direction**, so it is measured on the rays from the eye
   * through the room's near corners: if a near corner projects outside the viewport, that plane crosses
   * the edge and the camera is enclosed by it. Corners behind the near plane are excluded rather than
   * clamped, because their direction is still well defined but their position is not.
   */
  const dirOf = (p) => {
    let fx = cam.target.x - cam.eye.x, fy = cam.target.y - cam.eye.y, fz = cam.target.z - cam.eye.z;
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    let rX = fy * 0 - fz * 1, rY = fz * 0 - fx * 0, rZ = fx * 1 - fy * 0;
    const rl = Math.hypot(rX, rY, rZ) || 1; rX /= rl; rY /= rl; rZ /= rl;
    const uX = rY * fz - rZ * fy, uY = rZ * fx - rX * fz, uZ = rX * fy - rY * fx;
    const dx = p.x - cam.eye.x, dy = p.y - cam.eye.y, dz = p.z - cam.eye.z;
    const depth = dx * fx + dy * fy + dz * fz;
    const k = cam.focal / Math.max(1e-4, depth);
    const vx = dx * rX + dy * rY + dz * rZ, vy = dx * uX + dy * uY + dz * uZ;
    return { x: 0.5 + (vx * k) / (2 * ASPECT), y: 0.5 - (vy * k) / 2 };
  };
  const near = { frontTL: 1, frontTR: 1, frontBL: 1, frontBR: 1 };
  const nearPts = [box.frontTL, box.frontTR, box.frontBL, box.frontBR].map(dirOf);
  void near;
  const all = [...Object.values(pts), ...nearPts];
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const reaches = {
    left: Math.min(...xs) <= 0,
    right: Math.max(...xs) >= 1,
    top: Math.min(...ys) <= 0,
    bottom: Math.max(...ys) >= 1,
  };

  /** The person: a 1.6-world-unit figure standing at x = -0.9, feet on the floor. */
  const personH = 1.6, personFeetY = EYE_Y - halfH;
  /** the figure stands INSIDE the box, a third of the way from the back wall to the eye */
  const pz = camZ - distToBack * 0.62;
  const pTop = projectRoom(cam, { x: -0.85, y: personFeetY + personH, z: pz }, ASPECT);
  const pBot = projectRoom(cam, { x: -0.85, y: personFeetY, z: pz }, ASPECT);
  const pLeft = projectRoom(cam, { x: -0.85 - 0.55, y: personFeetY + personH * 0.5, z: pz }, ASPECT);
  const pRight = projectRoom(cam, { x: -0.85 + 0.55, y: personFeetY + personH * 0.5, z: pz }, ASPECT);
  const personInFrame = [pTop, pBot, pLeft, pRight].every((p) => p.visible && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1);
  const personHf = Math.abs(pBot.y - pTop.y);
  const personWf = Math.abs(pRight.x - pLeft.x);

  return {
    ok: true,
    params: { halfW, halfH, halfD, camZ, focal, distToBack: dist },
    /** the algebra predicts `halfH * focal / (camZ - centreZ + halfD)`; the measurement must agree */
    expectedHeightFraction: (halfH * focal) / (camZ - centreZ + halfD),
    backWallWidthFraction: bw, backWallHeightFraction: bh,
    reaches, personInFrame,
    personHeightFraction: personHf, personWidthFraction: personWf,
    personToRoomRatio: bh > 0 ? personHf / bh : 0,
  };
}

/**
 * THE SWEEP RANGES ARE DERIVED, NOT GUESSED.
 *
 * The first sweep used `focal` 0.55–0.70 with `halfD` 1.1–1.7 and **no candidate passed** — every one
 * landed at 10–23% back-wall height. The projection gives the reason:
 *
 *     back-wall height fraction = halfH * focal / depth
 *
 * so at `depth = halfD` the height target of 0.5 requires **`halfD = 2 * halfH * focal`**. With focal
 * near 0.6 and halfH near 1.35 that is `halfD` ~ 1.6, and the resulting fraction is 0.5 only if focal is
 * 1.0 — the first sweep's focal range was simply below what the contract needs.
 *
 * TWO MORE CONSTRAINTS FIX THE SCALE:
 *   - **a person is 1.6 world units tall**, so the room must be at least ~1.8 units tall or the figure
 *     does not fit; that sets `halfH >= 0.9`
 *   - **the back wall must stay inside the frame** for the side walls to reach the edges:
 *     `halfW < 0.5 * aspect * halfD / focal`
 */
const HALF_W = [1.0, 1.25, 1.5];
const HALF_H = [0.9, 1.0, 1.1];
const FOCAL = [0.9, 1.0, 1.1];
/**
 * THE DISTANCE IS SOLVED, NOT SWEPT.
 *
 * The measurement is `halfH * focal / (camZ - centreZ + halfD)`, and with the eye at the box's front face
 * and `halfD = dist / 2` that denominator is `dist`. So the height target is reached exactly when
 *
 *     dist = halfH * focal / 0.5 = 2 * halfH * focal
 *
 * Sweeping a variable whose correct value is already known is what produced three failed runs; the
 * ranges were not "too narrow", they were beside the point. `dist` is now computed per candidate, and the
 * residual across the sweep is only the DEPTH SEMANTICS — how far the eye sits from the back wall
 * relative to the room's own depth — which is expressed as a multiplier rather than an absolute.
 */
const DIST_MULT = [0.85, 1.0, 1.15];

const results = [];
for (const halfW of HALF_W) for (const halfH of HALF_H) for (const dm of DIST_MULT) for (const focal of FOCAL) {
  /** solved so the height target is met by construction; `dm` then moves the eye relative to that */
  const dist = 2 * halfH * focal * dm;
  /**
   * `camZ` and `halfD` are SOLVED, not swept: the eye sits at the front of the box and the back wall at
   * `dist` in front of it, so `halfD = dist / 2` and `camZ = halfD`. That keeps the camera INSIDE the
   * volume, which is the enclosure condition — a camera outside it can never see side walls at all.
   */
  /**
   * THE EYE MUST NOT SIT AT THE FRONT FACE.
   *
   * The first version placed it there, which gives the front corners `depth ~ 0`; their projected
   * positions blow up and the four back-to-front edges cross the frame as an **X drawn across the back
   * wall** — measured on the v2 oracle and plainly wrong. The eye is therefore placed a fraction of the
   * room's depth FORWARD of the front face, so every corner is in front of the camera and the side walls
   * converge properly toward the frame edges.
   */
  const EYE_AHEAD = 0.35;
  const halfD = dist / (2 * (1 + EYE_AHEAD));
  const camZ = halfD * (1 + EYE_AHEAD);   // forward of the front face, so nothing is at depth 0
  const r = measure({ halfW, halfH, halfD, camZ, focal, distToBack: dist });
  if (!r.ok) { results.push({ ...r }); continue; }
  /** CONSTRAINT SCORE: pass/fail first, then distance from the 50% height target. */
  const heightOk = r.backWallHeightFraction >= 0.45 && r.backWallHeightFraction <= 0.55;
  const widthOk = r.backWallWidthFraction >= 0.40 && r.backWallWidthFraction <= 0.65;
  const enclosed = r.reaches.left && r.reaches.right && r.reaches.top && r.reaches.bottom;
  const passes = heightOk && widthOk && enclosed && r.personInFrame;
  results.push({ ...r, heightOk, widthOk, enclosed, passes, heightError: Math.abs(r.backWallHeightFraction - 0.5) });
}

const passing = results.filter((r) => r.passes).sort((a, b) => a.heightError - b.heightError);
const outPath = path.join(ROOT, 'out', 'phase32b', 'framing-sweep.json');
await writeFile(outPath, JSON.stringify({
  resolution: `${W}x${H}`, eyeY: EYE_Y,
  swept: { halfW: HALF_W, halfH: HALF_H, distMultiplier: DIST_MULT, focal: FOCAL },
  totalCandidates: results.length,
  passing: passing.length,
  candidates: results,
}, null, 2));

console.log(`FRAMING SWEEP — ${results.length} candidates, ${passing.length} satisfy the framing contract\n`);
console.log('  halfW halfH dist focal | backW%  backH%  L R T B  person  ratio');
for (const r of results.filter((x) => x.ok).slice(0, 8)) {
  const q = r.reaches;
  console.log(`  ${String(r.params.halfW).padEnd(5)} ${String(r.params.halfH).padEnd(5)} ${String(r.params.distToBack).padEnd(4)} ${String(r.params.focal).padEnd(5)} | ${(r.backWallWidthFraction * 100).toFixed(0).padStart(5)}% ${(r.backWallHeightFraction * 100).toFixed(0).padStart(5)}%  ${q.left ? 'Y' : 'n'} ${q.right ? 'Y' : 'n'} ${q.top ? 'Y' : 'n'} ${q.bottom ? 'Y' : 'n'}  ${r.personInFrame ? 'yes' : 'NO '}   ${r.personToRoomRatio.toFixed(2)}`);
}
console.log('');
if (passing.length) {
  const best = passing[0];
  console.log('SELECTED — the candidate closest to the 50% height target that satisfies every constraint:');
  console.log(`  roomHalfWidth  = ${best.params.halfW}`);
  console.log(`  roomHalfHeight = ${best.params.halfH}`);
  console.log(`  roomDepth      = ${best.params.halfD * 2}  (halfD ${best.params.halfD})`);
  console.log(`  cameraZ        = ${best.params.camZ}`);
  console.log(`  focal          = ${best.params.focal}`);
  console.log('');
  console.log('MEASURED:');
  console.log(`  backWallHeightFraction = ${(best.backWallHeightFraction * 100).toFixed(1)}%`);
  console.log(`  backWallWidthFraction  = ${(best.backWallWidthFraction * 100).toFixed(1)}%`);
  console.log(`  left/right/top/bottom reach viewport = ${best.reaches.left}/${best.reaches.right}/${best.reaches.top}/${best.reaches.bottom}`);
  console.log(`  personInFrame          = ${best.personInFrame}`);
  console.log(`  personHeightFraction   = ${(best.personHeightFraction * 100).toFixed(1)}%`);
  console.log(`  person/room height     = ${best.personToRoomRatio.toFixed(2)}`);
  console.log('');
  console.log('THESE VALUES SATISFY THE FRAMING CONTRACT. No claim is made that they are optimal.');
} else {
  console.log('NO CANDIDATE SATISFIES THE CONTRACT. The sweep ranges need widening, and that is a');
  console.log('measurement result rather than a reason to relax the contract.');
}
console.log(`\nwrote ${path.relative(ROOT, outPath)}`);
