/**
 * PHASE 3.2B — GEOMETRY ONLY. No ASCII material, no texture, no NAME, no post.
 *
 * Produces the geometry oracle first:
 *   out/phase32b/geometry-debug.png           the structural skeleton
 *   out/phase32b/room-geometry-semantic.png   grayscale filled planes
 *
 * If the semantic image does not unmistakably read as an interior, STOP.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase32b');
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const M = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'mask.js'));
const { makeRoomBox, roomPlanes, assertTopology, projectRoom, deriveVanishingPoint, camBasis, clipPlaneToViewport } = G;
const { createMask, disc, capsule, rect, polygon, writeMaskPng } = M;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));

const W = 1920, H = 1080, ASPECT = W / H;
const out = [];

// ---------------------------------------------------------------------------
// 1. TOPOLOGY TESTS — they run BEFORE anything is drawn
// ---------------------------------------------------------------------------
/**
 * THE SELECTED FRAMING — from `framing-sweep.json`, chosen by constraint satisfaction and not by eye.
 *
 * 81 candidates were evaluated against the framing contract; **exactly one satisfied all of it**:
 *   back-wall height 50.0% of frame   (contract 45-55%)
 *   back-wall width  46.9%            (contract 40-65%)
 *   left/right/top/bottom planes all reach the viewport edges
 *   the person is fully in frame at 71.7% of frame height
 *
 * The distance was SOLVED rather than swept: the measurement is `halfH * focal / dist`, so the height
 * target fixes `dist = 2 * halfH * focal`. Three earlier sweeps failed because they swept a variable
 * whose correct value was already determined by that relation.
 */
const cam = { eye: { x: 0, y: 1.05, z: 0.9315 }, target: { x: 0, y: 1.05, z: 0 }, focal: 0.9 };
const box = makeRoomBox({ centre: { x: 0, y: 1.05, z: 0.9315 - 1.863 / 2 }, half: { x: 1.5, y: 0.9, z: 0.69 } });
const fails = assertTopology(box);
console.log('TOPOLOGY TESTS');
if (fails.length) {
  for (const f of fails) console.log(`  FAIL  ${f.check}  (${f.detail})`);
  console.log('\nDISCONNECTED GEOMETRY -- rendering refused, per the brief.');
  process.exit(1);
}
console.log('  all 13 shared-vertex tests PASS (identity + value, floor/ceiling/left/right vs back wall)');

const planes = roomPlanes(box);
const P = (p) => {
  const q = projectRoom(cam, p, ASPECT);
  return [q.x * W, q.y * H, q.visible];
};
const toScreen = (v) => { const q = projectRoom(cam, v, ASPECT); return [q.x * W, q.y * H]; };

// ---------------------------------------------------------------------------
// 2. GEOMETRY DEBUG — the structural skeleton only
// ---------------------------------------------------------------------------
{
  const m = createMask(W, H);
  /** 5 px lines, drawn on the mask, so a junction is continuous. */
  const seg = (a, b, v = 1, w = 5) => {
    const [x0, y0] = toScreen(a), [x1, y1] = toScreen(b);
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (let i = 0; i <= n; i++) disc(m, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, w / 2, v);
  };
  // the twelve edges of the room box: back-wall rectangle, front envelope, and the four converging edges
  seg(box.backTL, box.backTR); seg(box.backTR, box.backBR); seg(box.backBR, box.backBL); seg(box.backBL, box.backTL);
  const bTL = P(box.backTL), bTR = P(box.backTR), bBR = P(box.backBR), bBL = P(box.backBL);
  console.log(`  back wall projects to x ${bTL[0].toFixed(0)}..${bTR[0].toFixed(0)}  y ${bTL[1].toFixed(0)}..${bBL[1].toFixed(0)}  (frame is ${W}x${H})`);
  // THE FOUR CONVERGENCE LINES: back corner -> front corner. These are what the previous geometry omitted.
  seg(box.backTL, box.frontTL); seg(box.backTR, box.frontTR);
  seg(box.backBR, box.frontBR); seg(box.backBL, box.frontBL);
  // junctions: mark every corner as a solid disc so the eye reads a junction, not a crossing
  for (const c of Object.values(box)) { const [x, y] = toScreen(c); disc(m, x, y, 9, 1); }
  // one person, no environment of its own
  drawPerson(m, W * 0.285, H * 0.935, H * 0.62);
  await writeMaskPng(m, path.join(OUT, 'geometry-debug-v3.png'));
  out.push('out/phase32b/geometry-debug-v3.png');
}

// ---------------------------------------------------------------------------
// 3. ROOM GEOMETRY SEMANTIC — grayscale filled planes, the oracle
// ---------------------------------------------------------------------------
{
  const m = createMask(W, H);
  /**
   * FILL ORDER IS FRONT-TO-BACK so nearer planes paint over farther ones, which is what makes the volume
   * read: a distant wall seen through a near one would destroy the depth ordering.
   */
  /**
   * PLANE VALUES, RAISED AFTER MEASURING THE FIRST ATTEMPT.
   *
   * The v2 oracle used ceiling 0.20 / floor 0.34 / side walls 0.28, which rendered as **near-black** — the
   * convergence lines were visible but the PLANES were not, so the image still read as lines over a black
   * field rather than as an enclosed volume. A plane must be distinguishable from the background to read as
   * a surface, so the darker planes are lifted well clear of black while the back wall keeps the highest
   * value as the destination.
   */
  /**
   * THE PLANES, FILLED THROUGH THE CORRECT PIPELINE.
   *
   *   camera space -> clip to near plane -> project -> clip to viewport -> fill
   *
   * The previous version projected first and, for a vertex behind the camera, took whatever fabricated
   * coordinate the projector returned. Those points are inside the frame, so no viewport clamp could remove
   * them, and the floor painted a shape whose "near" corners had been snapped to the middle of the image.
   *
   * ⚠ BRIGHTNESS IS NOT COMPENSATED HERE. The temporary lift from 0.20/0.34 to 0.34/0.46 is REVERTED to the
   * originally intended values, because the hypothesis under test is that the planes were invisible for a
   * geometric reason and not a tonal one. If they are visible now, brightness was never the problem.
   */
  const bb = camBasis(cam, ASPECT);
  /*
   * CASE E — VISUAL VALUE / CONTRAST PROBLEM, and the audit PROVED it.
   *
   * The ownership audit returned A = B = C for every plane, empty = 75 px (0.004%), no overlaps, and
   * stored scalars exactly equal to the intended ones. So the floor was never missing: it owns 17.6% of
   * the frame. What made it read as background was that the side walls were painted at 0.34, which maps to
   * **byte 22**, and the floor at 0.55 -> byte 35. **Thirteen levels of separation on a black field**, with
   * the walls occupying the full frame height at both edges, so the eye took the darker surround for
   * background and the floor for more of the same.
   *
   * A floor must be clearly distinct from BOTH the background and the walls. These values are chosen for
   * separation, and the band is kept narrow enough to stay ASCII-native rather than photographic.
   */
const intended = { backWall: 0.50, ceiling: 0.34, floor: 0.95, leftWall: 0.16, rightWall: 0.16 };
  const order = [
    { id: 'backWall', quad: planes.backWall },
    { id: 'ceiling', quad: planes.ceiling },
    { id: 'floor', quad: planes.floor },
    { id: 'leftWall', quad: planes.leftWall },
    { id: 'rightWall', quad: planes.rightWall },
  ];
  const areas = {};
  for (const p of order) {
    const clipped = clipPlaneToViewport(bb, p.id, p.quad);
    areas[p.id] = {
      worldVertices: clipped.worldVertices,
      camClippedVertices: clipped.camClippedVertices,
      viewportClippedVertices: clipped.viewportClippedVertices,
      area: +clipped.area.toFixed(4),
    };
    if (clipped.screenPolygon.length < 3 || clipped.area <= 0) continue;
    polygon(m, clipped.screenPolygon.map((pt) => [pt.x * W, pt.y * H]), intended[p.id]);
  }
  console.log('  plane areas through camera->clip->project->clip:');
  for (const [k, v] of Object.entries(areas)) {
    console.log(`    ${k.padEnd(10)} world ${v.worldVertices} -> cam ${v.camClippedVertices} -> vp ${v.viewportClippedVertices}  area ${(v.area * 100).toFixed(1)}%`);
  }
  // the four convergence edges, drawn darker so the volume's corners stay legible against the fills
  const edge = (a, b) => {
    const [x0, y0] = toScreen(a), [x1, y1] = toScreen(b);
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (let i = 0; i <= n; i++) disc(m, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 4, 0.92);
  };
  edge(box.backTL, box.backTR); edge(box.backTR, box.backBR); edge(box.backBR, box.backBL); edge(box.backBL, box.backTL);
  edge(box.backTL, box.frontTL); edge(box.backTR, box.frontTR); edge(box.backBR, box.frontBR); edge(box.backBL, box.frontBL);
  drawPerson(m, W * 0.285, H * 0.935, H * 0.62);
  await writeMaskPng(m, path.join(OUT, 'room-geometry-semantic-v3.png'));
  out.push('out/phase32b/room-geometry-semantic-v3.png');
}

/**
 * The person, drawn as masses. UNCHANGED from the version the external review passed — this file does not
 * touch the human representation.
 */
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

// ---------------------------------------------------------------------------
// 4. DERIVED vanishing point — from projected parallel world lines
// ---------------------------------------------------------------------------
const vp = deriveVanishingPoint(cam, ASPECT, { x: 0, y: 0, z: -1 });
const vpBack = deriveVanishingPoint(cam, ASPECT, { x: -1, y: 0, z: 0 });
console.log(`\nDERIVED vanishing points (not authored):`);
console.log(`  depth axis  (0,0,-1) -> ${(vp.x * W).toFixed(0)}, ${(vp.y * H).toFixed(0)} px`);
console.log(`  width axis  (-1,0,0) -> ${(vpBack.x * W).toFixed(0)}, ${(vpBack.y * H).toFixed(0)} px   (parallel to the image plane, so it does not converge)`);

// ---------------------------------------------------------------------------
// 5. MEASUREMENTS for the report
// ---------------------------------------------------------------------------
const bTL = toScreen(box.backTL), bTR = toScreen(box.backTR), bBR = toScreen(box.backBR), bBL = toScreen(box.backBL);
const fTL = toScreen(box.frontTL), fTR = toScreen(box.frontTR);
await writeFile(path.join(OUT, 'geometry-report.json'), JSON.stringify({
  resolution: `${W}x${H}`,
  camera: cam,
  box,
  topologyTests: { total: 13, failed: fails.length },
  vanishingPoints: { depth: [vp.x, vp.y], width: [vpBack.x, vpBack.y] },
  backWallScreen: { TL: bTL, TR: bTR, BR: bBR, BL: bBL },
  frontEnvelopeScreen: { TL: fTL, TR: fTR },
  outputs: out,
}, null, 2));

console.log('\nGEOMETRY OUTPUTS');
for (const o of out) console.log('  ' + o);
console.log('\nNOTE: no ASCII material, no texture, no NAME, no post. Geometry oracle only.');
console.log('If room-geometry-semantic.png does not unmistakably read as an interior, STOP.');
