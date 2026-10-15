/**
 * BACKEND-INDEPENDENCE SPIKE — a SECOND renderer over SceneIR.
 *
 * NOT a GPU renderer. This is a deliberately independent implementation of the frame
 * evaluation, written to answer one question before anyone invests in WebGL: **does
 * `SceneIR` carry enough for a different renderer to reproduce the reference renderer's
 * character decisions?** If it does not, a GPU path would be a rewrite rather than a backend.
 *
 * It shares only the glyph atlas and the coverage quantiser with `cpu-renderer.ts`. The
 * camera resolution, the basis construction, the splat profile and the accumulation strategy
 * are re-implemented here from the IR alone. `tests/depth/backend.test.ts` asserts that the
 * two produce identical ASCII codes for the same IR.
 *
 * DELIBERATE GAP, STATED RATHER THAN HIDDEN: depth occlusion is not re-implemented (this
 * spike is additive only), which is why the comparison runs on an additive film. A real depth
 * buffer is the main thing a GPU backend would buy — see experiments/gpu-ascii/README.md.
 */

import { buildRamp, quantizeCoverage, windowRampWithFloor } from "../glyphs/ramp.js";
import type { LayerIR, SceneIR } from "../scene-ir/types.js";

type V3 = [number, number, number];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export interface SpikeCamera {
  p: V3;
  t: V3;
  worldToCells: number;
}

/** Resolve the camera by scanning keys. Written independently of the CPU renderer. */
export function cameraAt(scene: SceneIR, frame: number): SpikeCamera {
  const keys = scene.camera.keys;
  if (keys.length === 0) throw new Error("spike: empty camera track");
  const f = Math.max(0, Math.min(scene.frameCount - 1, frame));
  let a = keys[0]!;
  let b = keys[keys.length - 1]!;
  for (let i = 0; i < keys.length - 1; i++) {
    if (f >= keys[i]!.frame && f <= keys[i + 1]!.frame) {
      a = keys[i]!;
      b = keys[i + 1]!;
      break;
    }
  }
  const span = Math.max(1e-9, b.frame - a.frame);
  const t = smooth(clamp01((f - a.frame) / span));
  return {
    p: [lerp(a.position[0], b.position[0], t), lerp(a.position[1], b.position[1], t), lerp(a.position[2], b.position[2], t)],
    t: [lerp(a.target[0], b.target[0], t), lerp(a.target[1], b.target[1], t), lerp(a.target[2], b.target[2], t)],
    worldToCells: lerp(a.worldToCells, b.worldToCells, t),
  };
}

interface SpikeBasis {
  f: V3;
  r: V3;
  u: V3;
}

/** Orthonormal basis, derived independently of core/math. */
function basisOf(cam: SpikeCamera): SpikeBasis {
  const f = sub(cam.t, cam.p);
  const r = cross(f, [0, 1, 0]);
  const u = cross(r, f);
  return { f: norm(f), r: norm(r), u: norm(u) };
}

interface SpikeTransform {
  off: number;
  scale: number;
  alpha: number;
  size: number;
}

function transformState(layer: LayerIR, u: number): SpikeTransform {
  const tr = layer.transform;
  switch (tr.kind) {
    case "assemble": {
      const s = smooth(clamp01(u / 0.92));
      return {
        off: (1 - s) * tr.radialOffset,
        scale: 1,
        alpha: smooth(clamp01(u / 0.5)),
        size: lerp(tr.sizeScaleFrom, tr.sizeScaleTo, s),
      };
    }
    case "dissolve": {
      const s = smooth(clamp01(u));
      return {
        off: s * tr.radialOffset,
        scale: 1 + s * (tr.radialScale - 1),
        alpha: tr.alphaFrom * (1 - smooth(clamp01((u - 0.02) / 0.44))),
        size: lerp(tr.sizeScaleFrom, tr.sizeScaleTo, s),
      };
    }
    case "collapse":
    case "scatter": {
      const s = smooth(clamp01(u));
      return { off: s * tr.radialOffset, scale: 1 + s * (tr.radialScale - 1), alpha: 1, size: 1 };
    }
    case "none":
    default:
      return { off: 0, scale: 1, alpha: 1, size: 1 };
  }
}

function depthResponse(kind: LayerIR["depthResponse"], depth: number): number {
  if (kind === "flat" || kind === "parallax") return 1;
  return kind === "depth-attenuated" ? 1 / (1 + depth * 0.09) : 1 / (1 + depth * 0.07);
}

/**
 * Evaluate the luminance field.
 *
 * Accumulates into a Float64Array (the reference renderer uses Float32Array) — a deliberate
 * implementation difference, so agreement between the two is evidence about the IR rather
 * than evidence that the same code ran twice.
 */
export function field(scene: SceneIR, frame: number): Float64Array {
  const { cols, rows } = scene;
  const lum = new Float64Array(cols * rows);
  const cam = cameraAt(scene, frame);
  const b = basisOf(cam);
  const u = clamp01(frame / Math.max(1, scene.frameCount - 1));

  for (const layer of scene.layers) {
    const st = transformState(layer, u);
    if (st.alpha <= 0.001) continue;
    const [ox, oy, oz] = layer.origin;
    for (const prim of layer.primitives) {
      const off = st.off * prim.rim;
      let w: V3 = [prim.p[0] + prim.dir[0] * off, prim.p[1] + prim.dir[1] * off, prim.p[2] + prim.dir[2] * off];
      if (st.scale !== 1) {
        // scale around the LAYER's origin, matching the reference renderer
        const sc = st.scale;
        w = [ox + (w[0] - ox) * sc, oy + (w[1] - oy) * sc, oz + (w[2] - oz) * sc];
      }
      const d = sub(w, cam.p);
      const depth = dot(d, b.f);
      if (depth <= 1e-4) continue;
      const k = 1 / depth;
      const sx = dot(d, b.r) * k;
      const sy = dot(d, b.u) * k;
      const gx = sx * cam.worldToCells + cols * 0.5;
      const gy = rows * 0.5 - sy * cam.worldToCells;
      if (gx < -6 || gy < -6 || gx > cols + 6 || gy > rows + 6) continue;

      const cells = layer.glyphRadius * prim.sizeMul * st.size;
      if (cells < 0.2) continue;
      const r = Math.min(64, Math.max(0.55, cells));
      const amp = layer.intensity * prim.intMul * st.alpha * depthResponse(layer.depthResponse, depth);
      if (amp <= 0.0015) continue;

      const invR = 1 / r;
      const exp = Math.max(0.6, layer.focus * r * 0.5);
      const CORE2 = 0.0121;
      const x0 = Math.max(0, Math.floor(gx - r));
      const x1 = Math.min(cols - 1, Math.ceil(gx + r));
      const y0 = Math.max(0, Math.floor(gy - r));
      const y1 = Math.min(rows - 1, Math.ceil(gy + r));
      for (let y = y0; y <= y1; y++) {
        const dy = (y - gy) * invR;
        const dy2 = dy * dy;
        if (dy2 > 1) continue;
        for (let x = x0; x <= x1; x++) {
          const dx = (x - gx) * invR;
          const d2 = dx * dx + dy2;
          if (d2 > 1) continue;
          const wgt = d2 <= CORE2 ? 1 : Math.pow((1 - d2) / (1 - CORE2), exp);
          lum[y * cols + x]! += wgt * amp;
        }
      }
    }
  }

  // Atmospheric noise, evaluated independently of the reference renderer.
  const noiseLayer = scene.layers.find((l) => l.noise.octaves > 0);
  if (noiseLayer) {
    const ns = noiseLayer.noise;
    const wz = (frame / 30) * ns.drift;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        lum[y * cols + x]! += valueNoise(x * 0.09, y * 0.09, wz, 0x9e37) * ns.amplitude;
      }
    }
  }

  return lum;
}

/**
 * Film grain for one cell.
 *
 * The spike uses the SAME hash as the reference renderer on purpose: grain is part of the
 * film's look, carried by the IR, so reproducing it is not "sharing an implementation" — it is
 * reading a parameter. (The noise FIELD is different: that is a procedural texture the spike
 * may legitimately evaluate differently, which is why the backend comparison tolerates
 * threshold flips and only requires exactness once noise is removed.)
 */
function grainAt(x: number, y: number, frame: number): number {
  let h = Math.imul(x + 0x1f, 0x27d4eb2d) ^ Math.imul(y + 0x7b, 0x165667b1) ^ Math.imul(frame + 1, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** A tiny local value-noise, so the spike does not share the reference fBm implementation. */
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const h = (a: number, b2: number, c: number): number => {
    let n = Math.imul(a + 0x1f, 0x27d4eb2d) ^ Math.imul(b2 + 0x7b, 0x165667b1) ^ Math.imul(c, 0x9e3779b1) ^ seed;
    n = Math.imul(n ^ (n >>> 15), 0x85ebca6b) >>> 0;
    return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
  };
  const l = (a: number, b2: number, t: number): number => a + (b2 - a) * t;
  const c00 = l(h(xi, yi, zi), h(xi + 1, yi, zi), xf);
  const c10 = l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf);
  const c01 = l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf);
  const c11 = l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf);
  return l(l(c00, c10, yf), l(c01, c11, yf), zf);
}

export interface SpikeCodes {
  codes: Uint8Array;
  ink: Uint8Array;
}

/** Quantise to ASCII codes. Shares only the ramp and quantiser with the reference. */
export function codesFor(scene: SceneIR, frame: number, lum: Float64Array): SpikeCodes {
  const { cols, rows } = scene;
  const ramp = buildRamp(scene.glyph.vocabulary);
  const u = clamp01(frame / Math.max(1, scene.frameCount - 1));
  const k = smooth(u);
  const lo = lerp(scene.density.from.coverageMin, scene.density.to.coverageMin, k);
  const hi = lerp(scene.density.from.coverageMax, scene.density.to.coverageMax, k);
  const resolved = windowRampWithFloor(ramp, lo, hi);
  const window = resolved.entries;
  const blankBelow = resolved.blankBelow;

  const codes = new Uint8Array(cols * rows);
  const ink = new Uint8Array(cols * rows);
  const cx = (cols - 1) * 0.5;
  const cy = (rows - 1) * 0.5;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let v = lum[y * cols + x]!;
      if (!(v > 0)) continue;
      const nx = (x - cx) / Math.max(1, cx);
      const ny = (y - cy) / Math.max(1, cy);
      const rr = Math.hypot(nx, ny) * 0.7071;
      v *= 1 - scene.stock.vignette * clamp01(rr * rr);
      if (scene.stock.grain > 0) v += (grainAt(x, y, frame) - 0.5) * scene.stock.grain;
      v = (v - scene.glyph.blackPoint) * scene.glyph.exposure;
      if (v <= 0 || v < scene.density.inkFloor) continue;
      if (v > 1.4) v = 1.4;
      const value = clamp01(v);
      // Same blank-floor rule as the reference renderer. Both must agree that a value below
      // the lightest glyph is NOT a glyph.
      if (value <= blankBelow) continue;
      // ABSOLUTE-coverage mapping, matching cpu-renderer.ts:
      //     coverage = lo + (hi - lo) * value
      // `quantize(value, window)` instead maps value across the WINDOW's own coverage range,
      // which is a different function whenever the window does not span 2..20. With the Phase 2
      // density ceiling that difference was invisible (every window was narrow and light); with
      // the ceiling lifted, the two renderers disagreed on solidly-lit cells and the backend
      // test caught it. The two must agree by construction, not by luck of the window width.
      const coverage = lo + (hi - lo) * value;
      const code = quantizeCoverage(coverage, ramp, window);
      codes[y * cols + x] = code;
      ink[y * cols + x] = Math.max(1, Math.round(value * 255));
    }
  }
  return { codes, ink };
}
