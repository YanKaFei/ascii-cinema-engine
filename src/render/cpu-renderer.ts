/**
 * CPU_REFERENCE_RENDERER — the deterministic reference implementation.
 *
 * It consumes ONLY SceneIR, which is the point: the renderer has no opinion about the
 * director's structure, so a GPU production renderer can be added later without touching the
 * Director Agent, and the two can be compared.
 *
 * WHY IT STAYS THE REFERENCE.
 * It is dependency-free, single-threaded, deterministic and fast enough (600 frames of
 * 1920x1080 in ~4s). Those properties make it the thing the frozen Phase 1 baseline pins and
 * the thing CI can afford to run. The GPU path is for fidelity, not for correctness.
 *
 * DEPTH SEMANTICS.
 * `occlusionPolicy` is a per-layer property:
 *
 *   additive  splats sum. Nothing hides anything. (Phase 1 behaviour.)
 *   nearest   a primitive writes its ink only if it is at least as near as what already
 *             wrote that cell. A basic z-buffer. This is what makes "a wall between the
 *             camera and the figure" possible at all.
 *   alpha     front-to-back compositing with per-primitive alpha.
 *   mask      reserved; falls back to additive with a warning in stats.
 *
 * `nearest` is deliberately NOT physically correct: it compares primitive CENTRES against a
 * per-cell depth, so it does not resolve a primitive that straddles the boundary. The
 * requirement is only that a near primitive can hide a far one, and that is exactly what it
 * guarantees.
 */

import type { AsciiFrame, AsciiRenderer, LayerIR, SceneIR } from "../scene-ir/types.js";
import { buildRamp, quantizeCoverage, windowRampWithFloor, type DensityRamp } from "../glyphs/ramp.js";
import { clamp01, smoothstep } from "../core/math.js";
import { filmicShoulder } from "./tone.js";
import { fbm3, NOISE_SEED_NAMESPACE } from "../core/noise.js";

const RAMP_CACHE = new Map<string, DensityRamp>();
function getRamp(source: string): DensityRamp {
  let r = RAMP_CACHE.get(source);
  if (!r) {
    r = buildRamp(source);
    RAMP_CACHE.set(source, r);
  }
  return r;
}

/** Interpolate a camera key at an arbitrary frame (the track is sampled, not analytic). */
interface ResolvedCamera {
  px: number; py: number; pz: number;
  tx: number; ty: number; tz: number;
  fovY: number;
  roll: number;
  worldToCells: number;
}

export function resolveCameraAt(scene: SceneIR, frame: number): ResolvedCamera {
  const keys = scene.camera.keys;
  if (keys.length === 0) throw new Error(`SceneIR ${scene.shotId}: empty camera track`);

  const f = Math.max(0, Math.min(scene.frameCount - 1, frame));
  if (f <= keys[0]!.frame) return keyToCamera(keys[0]!);
  const last = keys[keys.length - 1]!;
  if (f >= last.frame) return keyToCamera(last);

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (f >= a.frame && f <= b.frame) {
      const span = Math.max(1e-9, b.frame - a.frame);
      const u = (f - a.frame) / span;
      // smooth the segment so a coarsely sampled track stays fluid
      const e = u * u * (3 - 2 * u);
      const lerp = (x: number, y: number): number => x + (y - x) * e;
      return {
        px: lerp(a.position[0], b.position[0]),
        py: lerp(a.position[1], b.position[1]),
        pz: lerp(a.position[2], b.position[2]),
        tx: lerp(a.target[0], b.target[0]),
        ty: lerp(a.target[1], b.target[1]),
        tz: lerp(a.target[2], b.target[2]),
        fovY: lerp(a.fovY, b.fovY),
        roll: lerp(a.roll, b.roll),
        worldToCells: lerp(a.worldToCells, b.worldToCells),
      };
    }
  }
  return keyToCamera(last);
}

function keyToCamera(k: SceneIR["camera"]["keys"][number]): ResolvedCamera {
  return {
    px: k.position[0], py: k.position[1], pz: k.position[2],
    tx: k.target[0], ty: k.target[1], tz: k.target[2],
    fovY: k.fovY, roll: k.roll, worldToCells: k.worldToCells,
  };
}

/** Per-layer transform response at normalised shot progress. */
interface LayerState {
  radialOffset: number;
  radialScale: number;
  alpha: number;
  sizeScale: number;
}

export function layerStateAt(layer: LayerIR, u: number): LayerState {
  const t = clamp01(u);
  const tr = layer.transform;
  switch (tr.kind) {
    case "assemble": {
      const s = smoothstep(0, 0.92, t);
      return { radialOffset: (1 - s) * tr.radialOffset, radialScale: 1, alpha: tr.alphaFrom + (tr.alphaTo - tr.alphaFrom) * smoothstep(0, 0.5, t), sizeScale: tr.sizeScaleFrom + (tr.sizeScaleTo - tr.sizeScaleFrom) * s };
    }
    case "dissolve": {
      const s = smoothstep(0, 1, t);
      return {
        radialOffset: s * tr.radialOffset,
        radialScale: 1 + s * (tr.radialScale - 1),
        alpha: tr.alphaFrom * (1 - smoothstep(0.02, 0.46, t)),
        sizeScale: tr.sizeScaleFrom + (tr.sizeScaleTo - tr.sizeScaleFrom) * s,
      };
    }
    case "collapse": {
      const s = smoothstep(0, 1, t);
      return { radialOffset: s * tr.radialOffset, radialScale: 1 + s * (tr.radialScale - 1), alpha: 1, sizeScale: 1 - 0.2 * s };
    }
    case "scatter": {
      const s = smoothstep(0, 1, t);
      return {
        radialOffset: s * tr.radialOffset,
        radialScale: 1 + s * (tr.radialScale - 1),
        alpha: 1 - smoothstep(0.05, 0.75, t),
        sizeScale: 1,
      };
    }
    case "none":
    default:
      return { radialOffset: 0, radialScale: 1, alpha: 1, sizeScale: 1 };
  }
}

/** Depth response per layer. Kept gentle: distant marks must dim, not vanish. */
function depthAttenuation(response: LayerIR["depthResponse"], depth: number): number {
  switch (response) {
    case "flat":
    case "parallax":
      return 1;
    case "depth-attenuated":
      return 1 / (1 + depth * 0.09);
    case "parallax+attenuated":
    default:
      return 1 / (1 + depth * 0.07);
  }
}

function grainAt(x: number, y: number, frame: number): number {
  let h = Math.imul(x + 0x1f, 0x27d4eb2d) ^ Math.imul(y + 0x7b, 0x165667b1) ^ Math.imul(frame + 1, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Scratch buffers, keyed by size, so a full film allocates once.
 *
 * The luminance field is Float64, not Float32. A dense layer accumulates thousands of
 * overlapping splats into one cell, and in Float32 that sum drifts by ~1e-5 relative to the
 * exact value — enough to move a cell across the quantiser's 1/128 bin boundary. A second
 * renderer accumulating in Float64 disagreed on 4 of 28,800 cells for exactly that reason,
 * which made "the IR is sufficient for another backend" untestable at the byte level. Float64
 * costs a few percent and buys an exactness claim.
 */
const LUM = new Map<string, Float32Array>();
const ZBUF = new Map<string, Float32Array>();
const LIT = new Map<string, Uint8Array>();
function scratch<T extends Float64Array | Float32Array | Uint8Array>(store: Map<string, T>, key: string, n: number, make: () => T): T {
  let b = store.get(key);
  if (!b || b.length !== n) {
    b = make();
    store.set(key, b);
  }
  return b;
}

const CORE2 = 0.0121;

/**
 * Render one frame.
 *
 * Order: resolve camera -> per layer, apply transform -> project -> splat with a depth
 * policy -> grade -> quantise to glyphs.
 */
export function renderSceneFrame(scene: SceneIR, frame: number): AsciiFrame {
  const { cols, rows } = scene;
  const n = cols * rows;
  const key = `${cols}x${rows}`;

  const luminance = scratch(LUM, key, n, () => new Float32Array(n));
  luminance.fill(0);
  const zbuf = scratch(ZBUF, key, n, () => new Float32Array(n));
  zbuf.fill(Infinity);
  const didOcclude = scratch(LIT, key, n, () => new Uint8Array(n));
  didOcclude.fill(0);

  const cam = resolveCameraAt(scene, frame);
  const aspect = scene.width / scene.height;
  const u = clamp01(frame / Math.max(1, scene.frameCount - 1));

  // --- camera basis (same convention as core/math: fwd points AT the target) ----------
  let fx = cam.tx - cam.px, fy = cam.ty - cam.py, fz = cam.tz - cam.pz;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  // right = normalize(cross(fwd, worldUp)); worldUp = +Y
  let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  // up = cross(right, fwd)
  let ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;

  const focal = 1;
  const worldToCells = cam.worldToCells;
  let visiblePrimitives = 0;
  let hadNaN = false;

  // --- primitives ---------------------------------------------------------------------
  for (const layer of scene.layers) {
    const st = layerStateAt(layer, u);
    if (st.alpha <= 0.001) continue;
    const policy = layer.semantics.occlusionPolicy;
    const [ox, oy, oz] = layer.origin;

    for (const prim of layer.primitives) {
      const off = st.radialOffset * prim.rim;
      let wx = prim.p[0] + prim.dir[0] * off;
      let wy = prim.p[1] + prim.dir[1] * off;
      let wz = prim.p[2] + prim.dir[2] * off;

      if (st.radialScale !== 1) {
        // scale around the LAYER's origin, not the world origin
        const sc = st.radialScale;
        wx = ox + (wx - ox) * sc;
        wy = oy + (wy - oy) * sc;
        wz = oz + (wz - oz) * sc;
      }

      const dx = wx - cam.px, dy = wy - cam.py, dz = wz - cam.pz;
      const depth = dx * fx + dy * fy + dz * fz;
      if (depth <= 1e-4) continue;
      const vx = dx * rx + dy * ry + dz * rz;
      const vy = dx * ux + dy * uy + dz * uz;

      const k = focal / depth;
      const sx = vx * k;
      const sy = vy * k;

      const gx = sx * worldToCells + cols * 0.5;
      const gy = rows * 0.5 - sy * worldToCells;
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) {
        hadNaN = true;
        continue;
      }
      if (gx < -6 || gy < -6 || gx > cols + 6 || gy > rows + 6) {
        visiblePrimitives++;
        continue;
      }

      const cells = layer.glyphRadius * prim.sizeMul * st.sizeScale;
      if (cells < 0.2) continue;
      const cl = cells < 0.55 ? 0.55 : cells > 64 ? 64 : cells;

      const atten = depthAttenuation(layer.depthResponse, depth);
      const amp = layer.intensity * prim.intMul * st.alpha * atten;
      if (amp <= 0.0015) continue;

      splat(luminance, zbuf, didOcclude, cols, rows, gx, gy, cl, amp, layer.focus, depth, policy);
      visiblePrimitives++;
    }
  }

  // --- atmospheric noise ---------------------------------------------------------------
  const noiseLayer = scene.layers.find((l) => l.noise.octaves > 0);
  if (noiseLayer) {
    const ns = noiseLayer.noise;
    const wz = (frame / 30) * ns.drift;
    const seed = (NOISE_SEED_NAMESPACE ^ scene.filmSlug.length) >>> 0;
    for (let y = 0; y < rows; y++) {
      const base = y * cols;
      for (let x = 0; x < cols; x++) {
        luminance[base + x]! += fbm3(x * 0.09, y * 0.09, wz, seed, ns);
      }
    }
  }

  // --- AUTO EXPOSURE ------------------------------------------------------------------
  // The authored pipeline left the field massively over-exposed: 60-64% of lit cells graded to
  // near-white, so the image was a clipped white mass no matter which glyphs were reachable.
  // The cause is structural — `(lum - blackPoint) * exposure` with exposure 1.85 clips anything
  // above luminance ~0.62, and the particle fields routinely reach 1.0.
  //
  // The fix is to expose against the SHOT's own measured highlight rather than against an
  // absolute constant: find a high percentile of the lit field and normalise so it lands at
  // white. This is what a camera does, and it is what makes the glyph ramp and the tone curve
  // able to express a gradient at all. Off by default so nothing changes unless asked.
  let exposureScale = 1;
  if (scene.autoLevel === true) {
    const lit: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = luminance[i]!;
      if (Number.isFinite(v) && v > 0.002) lit.push(v);
    }
    if (lit.length > 64) {
      lit.sort((a, b) => a - b);
      const p = lit[Math.min(lit.length - 1, Math.floor(lit.length * (scene.autoLevelPercentile ?? 0.99)))]!;
      const bp = scene.glyph.blackPoint;
      if (p > bp + 1e-4) {
        // scale so the shot's measured highlight lands just under white after exposure
        exposureScale = Math.min(8, 1 / Math.max(1e-4, (p - bp) * scene.glyph.exposure));
      }
    }
  }

  // --- density window (the glyph-density transformation) -------------------------------
  const densityMin = scene.density.from.coverageMin + (scene.density.to.coverageMin - scene.density.from.coverageMin) * smoothstep(0, 1, u);
  const densityMax = scene.density.from.coverageMax + (scene.density.to.coverageMax - scene.density.from.coverageMax) * smoothstep(0, 1, u);
  const resolved = windowRampWithFloor(getRamp(scene.glyph.vocabulary), densityMin, densityMax);
  const window = resolved.entries;
  const blankBelow = resolved.blankBelow;


  // --- grade + quantise ----------------------------------------------------------------
  const codes = new Uint8Array(n);
  const ink = new Uint8Array(n);
  const exposure = scene.glyph.exposure;
  const blackPoint = scene.glyph.blackPoint;
  const inkFloor = scene.density.inkFloor;
  const cx = (cols - 1) * 0.5;
  const cy = (rows - 1) * 0.5;
  const invCx = 1 / Math.max(1, cx);
  const invCy = 1 / Math.max(1, cy);
  // Grade parameters come from the IR, not from constants. A renderer that hardcodes them
  // cannot reproduce another renderer's output, which defeats the purpose of the IR.
  const vignette = scene.stock.vignette;
  const grainAmount = scene.stock.grain;

  let litCells = 0;
  let peak = 0;
  const seen = new Set<number>();

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      let v = luminance[i]!;
      if (!Number.isFinite(v)) {
        hadNaN = true;
        v = 0;
      }
      if (v <= 0) continue;

      if (vignette > 0) {
        const nx = (x - cx) * invCx;
        const ny = (y - cy) * invCy;
        const rr = Math.hypot(nx, ny) * 0.7071;
        v *= 1 - vignette * clamp01(rr * rr);
      }
      if (grainAmount > 0) v += (grainAt(x, y, frame) - 0.5) * grainAmount;

      v = (v - blackPoint) * exposure * exposureScale;
      if (v <= 0 || v < inkFloor) continue;
      // Keep the values ABOVE 1 instead of clamping them here: the shoulder below needs to see
      // the highlight tail in order to roll it off. Clamping first is what produced the plateau.
      if (v > 8) v = 8;

      // Filmic response: linear through the midtones, rolled off in the highlights, so a bright
      // tail becomes a range of near-whites rather than a flat clip.
      const value = clamp01(v);
      // A cell whose value has not reached the lightest glyph in the window stays BLANK.
      // Without this, `quantize` returns the lightest glyph even for a value of zero, which
      // turned an intended void into a field of marks.
      if (value <= blankBelow) continue;
      // ABSOLUTE coverage, not a re-scaled position inside the window. The window's own
      // min/max decide which glyphs are ADMITTED; the cell's value decides HOW MUCH ink it has.
      // Mapping value across the window's range instead conflated the two: a shot admitting
      // only [2,5] would map its brightest cell to coverage 5 regardless of how bright it was.
      const code = quantizeCoverage(densityMin + (densityMax - densityMin) * value, getRamp(scene.glyph.vocabulary));
      if (code === 32) continue;

      codes[i] = code;
      // The INK PLANE carries the POST-SHOULDER value, which is the whole point of the shoulder:
      // the display encoder's gamma must be applied to a signal that still has a gradient in it.
      // Storing the pre-shoulder value here (an earlier revision) made the shoulder a no-op on
      // everything downstream, because the ink plane is what the encoder actually reads.
      ink[i] = Math.max(1, Math.round(value * 255));
      litCells++;
      if (value > peak) peak = value;
      seen.add(code);
    }
  }

  return {
    frame,
    cols,
    rows,
    codes,
    ink,
    stats: {
      litCells,
      coverage: litCells / n,
      peakInk: peak,
      distinctGlyphs: seen.size,
      visiblePrimitives,
      hadNaN,
    },
  };
}

/**
 * Additive splat with an optional per-cell depth test.
 *
 * The flat-topped core is retained from Phase 1: a splat whose peak is narrower than a cell
 * has a brightness that depends on where it lands relative to the lattice, which made an
 * isolated dot vanish on some frames. The core makes `intensity` mean exactly "the value
 * inside the core".
 */
function splat(
  lum: Float32Array,
  zbuf: Float32Array,
  didOcclude: Uint8Array,
  cols: number,
  rows: number,
  gx: number,
  gy: number,
  r: number,
  energy: number,
  focus: number,
  depth: number,
  policy: LayerIR["semantics"]["occlusionPolicy"],
): void {
  const invR = 1 / r;
  const exp = Math.max(0.6, focus * r * 0.5);
  const x0 = Math.max(0, Math.floor(gx - r));
  const x1 = Math.min(cols - 1, Math.ceil(gx + r));
  const y0 = Math.max(0, Math.floor(gy - r));
  const y1 = Math.min(rows - 1, Math.ceil(gy + r));

  // `mask` is reserved. Falling back to additive is recorded by the caller rather than
  // silently pretending the policy was honoured.
  const useDepth = policy === "nearest" || policy === "alpha";

  for (let y = y0; y <= y1; y++) {
    const dy = (y - gy) * invR;
    const dy2 = dy * dy;
    if (dy2 > 1) continue;
    const base = y * cols;
    for (let x = x0; x <= x1; x++) {
      const dx = (x - gx) * invR;
      const d2 = dx * dx + dy2;
      if (d2 > 1) continue;
      const w = d2 <= CORE2 ? 1 : Math.pow((1 - d2) / (1 - CORE2), exp);
      const contribution = w * energy;
      if (contribution <= 0) continue;

      const i = base + x;
      if (useDepth) {
        // A primitive may write only if nothing nearer has already written here. Ties are
        // allowed so two primitives at the same depth both contribute.
        if (depth > zbuf[i]! + 1e-6) continue;
        if (depth < zbuf[i]!) {
          zbuf[i] = depth;
          // A newly nearer primitive REPLACES the fainter far contribution rather than
          // adding to it, which is what makes occlusion read as hiding rather than glowing.
          if (didOcclude[i] === 1) lum[i] = 0;
          didOcclude[i] = 1;
          lum[i] = contribution;
          continue;
        }
        // equal depth: accumulate
        lum[i]! += contribution;
        continue;
      }
      lum[i]! += contribution;
    }
  }
}

/**
 * CPU reference renderer.
 *
 * `renderShot` exists so a caller can render a whole shot without constructing a frame
 * array; a GPU backend would use it to batch.
 */
export const cpuRenderer: AsciiRenderer = {
  id: "cpu",
  description:
    "CPU_REFERENCE_RENDERER — deterministic, dependency-free, single-threaded reference " +
    "implementation. Samples SceneIR camera keys, splats primitives with a flat-topped " +
    "profile, applies a per-layer occlusion policy, grades and quantises to ASCII.",

  async renderFrame(scene: SceneIR, frame: number): Promise<AsciiFrame> {
    return renderSceneFrame(scene, frame);
  },

  async renderShot(scene: SceneIR, onProgress?: (done: number, total: number) => void): Promise<AsciiFrame[]> {
    const out: AsciiFrame[] = new Array(scene.frameCount);
    for (let f = 0; f < scene.frameCount; f++) {
      out[f] = renderSceneFrame(scene, f);
      if (onProgress && (f % 30 === 0 || f === scene.frameCount - 1)) onProgress(f + 1, scene.frameCount);
    }
    return out;
  },
};

export { CORE2 };
