/**
 * PLANE OWNERSHIP / COMPOSITING AUDIT.
 *
 * Three quantities per plane, kept strictly distinct:
 *   A  geometric polygon area          (from the clipper)
 *   B  rasterised candidate pixels     (plane drawn ALONE, nothing else)
 *   C  final visible ownership         (plane ID buffer after all planes)
 *
 * Plus the overwrite matrix and a value-propagation probe. Diagnosis only — no tuning.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase32b', 'audit');
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const { makeRoomBox, roomPlanes, camBasis, clipPlaneToViewport, polygonArea } = G;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));

const W = 1920, H = 1080, FRAME = W * H, ASPECT = W / H;
const cam = { eye: { x: 0, y: 1.05, z: 0.9315 }, target: { x: 0, y: 1.05, z: 0 }, focal: 0.9 };
const box = makeRoomBox({ centre: { x: 0, y: 1.05, z: 0.9315 - 1.863 / 2 }, half: { x: 1.5, y: 0.9, z: 0.69 } });
const planes = roomPlanes(box);
const bb = camBasis(cam, ASPECT);

/**
 * THE DRAW ORDER — recorded, not changed.
 * IDs: 0 empty, 1 backWall, 2 ceiling, 3 floor, 4 leftWall, 5 rightWall.
 */
const ID = { backWall: 1, ceiling: 2, floor: 3, leftWall: 4, rightWall: 5 };
const NAME = ["empty", "backWall", "ceiling", "floor", "leftWall", "rightWall"];
const DRAW_ORDER = ["backWall", "ceiling", "floor", "leftWall", "rightWall"];

// ---------------------------------------------------------------------------
// §9 polygon fill rule + winding check
// ---------------------------------------------------------------------------
/** Point-in-polygon by the EVEN-ODD rule — the same rule the mask's `polygon()` uses. */
function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
function selfIntersects(poly) {
  const seg = (a, b, c, d) => {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  };
  const n = poly.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (i === j || (i + 1) % n === j || (j + 1) % n === i) continue;
    if (seg(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// A — geometric area, from the clipper
// ---------------------------------------------------------------------------
const clipped = {};
for (const p of DRAW_ORDER) clipped[p] = clipPlaneToViewport(bb, p, planes[p]);

// ---------------------------------------------------------------------------
// B — rasterise each plane ALONE, and C — composite into an ID buffer
// ---------------------------------------------------------------------------
const ownership = new Int32Array(FRAME);          // 0 = empty
const overwrite = {};                              // "prev->new" -> count
const candidates = {};                             // plane -> pixel count (alone)
const aloneMask = {};                              // plane -> Uint8Array
const bbox = {};

for (const name of DRAW_ORDER) {
  const poly = clipped[name].screenPolygon.map((pt) => ({ x: pt.x * W, y: pt.y * H }));
  const alone = new Uint8Array(FRAME);
  let count = 0;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  if (poly.length >= 3) {
    const minY = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.y))));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(...poly.map((p) => p.y))));
    for (let y = minY; y <= maxY; y++) {
      for (let x = 0; x < W; x++) {
        if (!pointInPoly(x + 0.5, y + 0.5, poly)) continue;
        const i = y * W + x;
        alone[i] = 1; count++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        const prevId = ownership[i];
        const key = `${NAME[prevId]}->${name}`;
        overwrite[key] = (overwrite[key] ?? 0) + 1;
        ownership[i] = ID[name];
      }
    }
  }
  aloneMask[name] = alone;
  candidates[name] = count;
  bbox[name] = count ? { x0, y0, x1, y1 } : null;
  // write the isolated mask
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 3) };
  for (let i = 0; i < FRAME; i++) if (alone[i]) { img.data[i * 3] = 255; img.data[i * 3 + 1] = 255; img.data[i * 3 + 2] = 255; }
  await writeFile(path.join(OUT, `${name.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}-only.png`), encodePng(img));
}

// ownership image + counts
const finalCounts = new Array(6).fill(0);
const DEBUG_COLOR = [[0, 0, 0], [255, 255, 255], [90, 90, 90], [170, 170, 170], [60, 60, 60], [130, 130, 130]];
{
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 3) };
  for (let i = 0; i < FRAME; i++) {
    const id = ownership[i];
    finalCounts[id]++;
    const c = DEBUG_COLOR[id];
    img.data[i * 3] = c[0]; img.data[i * 3 + 1] = c[1]; img.data[i * 3 + 2] = c[2];
  }
  await writeFile(path.join(OUT, "plane-ownership.png"), encodePng(img));
}

// ---------------------------------------------------------------------------
// §7 value propagation — a distinct scalar per plane, then sample interior pixels
// ---------------------------------------------------------------------------
const VALUES = { backWall: 0.20, ceiling: 0.40, floor: 0.60, leftWall: 0.80, rightWall: 1.00 };
const scalar = new Float32Array(FRAME);
for (const name of DRAW_ORDER) {
  const poly = clipped[name].screenPolygon.map((pt) => ({ x: pt.x * W, y: pt.y * H }));
  if (poly.length < 3) continue;
  const minY = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.y))));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(...poly.map((p) => p.y))));
  for (let y = minY; y <= maxY; y++) for (let x = 0; x < W; x++) {
    if (pointInPoly(x + 0.5, y + 0.5, poly)) scalar[y * W + x] = VALUES[name];
  }
}
{
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 3) };
  for (let i = 0; i < FRAME; i++) {
    const v = Math.round(Math.max(0, Math.min(1, scalar[i])) * 255);
    img.data[i * 3] = v; img.data[i * 3 + 1] = v; img.data[i * 3 + 2] = v;
  }
  await writeFile(path.join(OUT, "value-propagation.png"), encodePng(img));
}
/** Sample the centre of each plane's own bbox, which is interior for a convex clipped quad. */
const propagation = [];
for (const name of DRAW_ORDER) {
  const poly = clipped[name].screenPolygon;
  if (poly.length < 3) { propagation.push({ plane: name, expected: VALUES[name], sampled: null, note: "no polygon" }); continue; }
  const cx = poly.reduce((a, p) => a + p.x, 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p.y, 0) / poly.length;
  const px = Math.round(cx * W), py = Math.round(cy * H);
  const stored = scalar[py * W + px];
  propagation.push({ plane: name, expected: VALUES[name], samplePixel: [px, py], storedScalar: +stored.toFixed(4), ownerId: ownership[py * W + px], owner: NAME[ownership[py * W + px]] });
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------
const rasterAudit = {
  framePixels: FRAME, resolution: `${W}x${H}`,
  drawOrder: DRAW_ORDER,
  fillRule: "even-odd point-in-polygon at pixel centres (the same rule the mask's polygon() uses)",
  compositingOperator: "REPLACE — each plane writes its value over whatever is there (no max, no add, no alpha, no normalise)",
  planes: DRAW_ORDER.map((name) => {
    const poly = clipped[name].screenPolygon;
    const sa = signedArea(poly);
    return {
      plane: name,
      A_geometric: {
        clippedVertices: poly.length,
        camClippedVertices: clipped[name].camClippedVertices,
        areaFraction: +clipped[name].area.toFixed(4),
        signedArea: +sa.toFixed(5),
        winding: sa > 0 ? "counter-clockwise" : "clockwise",
        selfIntersecting: poly.length >= 3 ? selfIntersects(poly) : null,
      },
      B_rasterAlone: {
        pixels: candidates[name],
        fraction: +(candidates[name] / FRAME).toFixed(4),
        bbox: bbox[name],
      },
      C_finalOwnership: {
        pixels: finalCounts[ID[name]],
        fraction: +(finalCounts[ID[name]] / FRAME).toFixed(4),
      },
    };
  }),
  emptyPixels: finalCounts[0],
  emptyFraction: +(finalCounts[0] / FRAME).toFixed(4),
};

await writeFile(path.join(OUT, "raster-audit.json"), JSON.stringify(rasterAudit, null, 2));
await writeFile(path.join(OUT, "plane-ownership.json"), JSON.stringify({
  counts: Object.fromEntries(DRAW_ORDER.map((n) => [n, finalCounts[ID[n]]])),
  empty: finalCounts[0],
  fractions: Object.fromEntries(DRAW_ORDER.map((n) => [n, +(finalCounts[ID[n]] / FRAME).toFixed(4)])),
  emptyFraction: +(finalCounts[0] / FRAME).toFixed(4),
}, null, 2));
await writeFile(path.join(OUT, "overwrite-matrix.json"), JSON.stringify(overwrite, null, 2));
await writeFile(path.join(OUT, "value-propagation.json"), JSON.stringify({ values: VALUES, propagation }, null, 2));

console.log('PLANE OWNERSHIP / COMPOSITING AUDIT\n');
console.log('  draw order:', DRAW_ORDER.join(' -> '));
console.log('  fill rule : even-odd point-in-polygon at pixel centres');
console.log('  compositing operator: REPLACE\n');
console.log('  plane      clippedVerts  A geometric  B raster-alone   C final own   bbox');
for (const p of rasterAudit.planes) {
  const b = p.B_rasterAlone.bbox;
  console.log(`  ${p.plane.padEnd(10)} ${String(p.A_geometric.clippedVertices).padStart(10)}   ${(p.A_geometric.areaFraction * 100).toFixed(1).padStart(9)}%  ${(p.B_rasterAlone.fraction * 100).toFixed(1).padStart(11)}%  ${(p.C_finalOwnership.fraction * 100).toFixed(1).padStart(9)}%   ${b ? `x${b.x0}..${b.x1} y${b.y0}..${b.y1}` : "none"}`);
}
console.log(`\n  EMPTY pixels: ${finalCounts[0]} (${rasterAudit.emptyFraction * 100}%)`);
console.log('\n  OVERWRITE MATRIX (prev -> new : count)');
for (const k of Object.keys(overwrite).sort()) console.log(`    ${k.padEnd(26)} ${overwrite[k]}`);
console.log('\n  VALUE PROPAGATION');
for (const r of propagation) console.log(`    ${r.plane.padEnd(10)} expected ${r.expected}  stored ${r.storedScalar}  pixel ${r.samplePixel}  owner ${r.owner}`);
