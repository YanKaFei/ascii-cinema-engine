/**
 * SceneIR -> GPU buffers.
 *
 * This is the Node-side half of the GPU renderer, and it is the ONLY place that interprets
 * SceneIR for the GPU. The page receives flat interleaved floats and a camera; it never sees
 * the IR's structure. That keeps the "consumes SceneIR only" claim checkable: the page's input
 * is a buffer, and the buffer is produced here.
 *
 * Two things are deliberately shared with the CPU reference rather than re-derived:
 *
 *   - the per-primitive COVERAGE, which is `intensity * intMul * depthResponse`, the same
 *     expression `cpu-renderer.ts` uses. If the two disagreed here, "visual difference" would
 *     be a units bug rather than a rendering difference, and the before/after comparison in
 *     gate 10 would be meaningless.
 *   - the camera basis, via `makeBasis`, so both renderers agree on which way is right.
 */

import { makeBasis } from "../../core/math.js";
import type { GpuScene } from "./GpuRenderer.js";
import { familyRun, layoutAtlas, type GlyphFamily } from "./families.js";

/** Minimal structural shape of the parts of SceneIR this bridge reads. */
export interface IRLike {
  width: number;
  height: number;
  cols: number;
  rows: number;
  frameCount: number;
  camera: {
    keys: Array<{
      frame: number;
      position: [number, number, number];
      target: [number, number, number];
      fovY: number;
      roll: number;
      worldToCells: number;
    }>;
  };
  layers: Array<{
    id: string;
    origin: [number, number, number];
    semantics: { role?: string; occlusionPolicy: string };
    glyphRadius: number;
    intensity: number;
    focus: number;
    depthResponse: string;
    primitives: Array<{
      p: [number, number, number];
      sizeMul: number;
      intMul: number;
      z: number;
    }>;
  }>;
  density: { from: { coverageMin: number; coverageMax: number }; to: { coverageMin: number; coverageMax: number } };
  glyph: { vocabulary: string; exposure: number; blackPoint: number; dither: boolean };
  stock: { grain: number; vignette: number };
  background: number;
}

/** Depth response, matching cpu-renderer.ts exactly. */
function depthAttenuation(kind: string, depth: number): number {
  switch (kind) {
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

/**
 * Colour by semantic role.
 *
 * The ASCII stage uses this as a hierarchy signal: at equal luminance a protagonist should
 * outrank an atmosphere particle. It is also the seed of gate 3's "SCENE COLOUR" input. Values
 * are deliberately near-monochrome — this is an ASCII film, and colour is a subtle channel, not
 * a paint bucket.
 */
const ROLE_COLOR: Record<string, [number, number, number]> = {
  protagonist: [1.0, 1.0, 1.0],
  "object-of-desire": [1.0, 0.97, 0.9],
  evidence: [0.95, 0.97, 1.0],
  absence: [0.4, 0.4, 0.45],
  environment: [0.72, 0.78, 0.9],
  atmosphere: [0.5, 0.55, 0.7],
  "parallax-background": [0.45, 0.5, 0.65],
  boundary: [0.85, 0.88, 0.95],
};

const ROLE_ID: Record<string, number> = {
  protagonist: 1,
  "object-of-desire": 0.85,
  evidence: 0.8,
  boundary: 0.7,
  environment: 0.5,
  "parallax-background": 0.35,
  atmosphere: 0.25,
  absence: 0.1,
};

/** Interpolate the camera track with the same smoothing the CPU renderer uses. */
function cameraAt(ir: IRLike, frame: number) {
  const keys = ir.camera.keys;
  const f = Math.max(0, Math.min(ir.frameCount - 1, frame));
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
  const u = Math.max(0, Math.min(1, (f - a.frame) / span));
  const e = u * u * (3 - 2 * u);
  const L = (x: number, y: number): number => x + (y - x) * e;
  return {
    position: [L(a.position[0], b.position[0]), L(a.position[1], b.position[1]), L(a.position[2], b.position[2])] as [number, number, number],
    target: [L(a.target[0], b.target[0]), L(a.target[1], b.target[1]), L(a.target[2], b.target[2])] as [number, number, number],
    fovY: L(a.fovY, b.fovY),
    roll: L(a.roll, b.roll),
    worldToCells: L(a.worldToCells, b.worldToCells),
  };
}

export interface BridgeOptions {
  /** which glyph family the film speaks in */
  family?: GlyphFamily | "printable";
  frame?: number;
  /** multiply all primitive sizes: a super-sampling control */
  glyphScale?: number;
  /** exponential depth-fog rate; 0 disables depth-dependent density */
  depthFog?: number;
  /** multiplies every splat's screen radius */
  pointScale?: number;
}

/**
 * Convert one frame of a SceneIR shot into GPU-ready buffers.
 *
 * Primitives behind the camera or with non-positive coverage are dropped here rather than in
 * the shader, so the GPU never receives work it will discard.
 */
export function buildGpuScene(ir: IRLike, opts: BridgeOptions = {}): GpuScene {
  const frame = opts.frame ?? 0;
  const cam = cameraAt(ir, frame);
  const aspect = ir.width / ir.height;
  const basis = makeBasis(
    { x: cam.position[0], y: cam.position[1], z: cam.position[2] },
    { x: cam.target[0], y: cam.target[1], z: cam.target[2] },
    cam.fovY,
    aspect,
    cam.roll,
  );

  // count what will survive
  let live = 0;
  const perLayer: number[] = [];
  for (const layer of ir.layers) {
    let n = 0;
    for (const prim of layer.primitives) {
      const dx = prim.p[0] - cam.position[0];
      const dy = prim.p[1] - cam.position[1];
      const dz = prim.p[2] - cam.position[2];
      const depth = dx * basis.fwd.x + dy * basis.fwd.y + dz * basis.fwd.z;
      if (depth <= 1e-4) continue;
      const cov = layer.intensity * prim.intMul * depthAttenuation(layer.depthResponse, depth);
      if (cov <= 0.0015) continue;
      n++;
    }
    perLayer.push(n);
    live += n;
  }

  const data = new Float32Array(live * 9);
  let o = 0;
  ir.layers.forEach((layer, li) => {
    const role = layer.semantics.role ?? "environment";
    const col = ROLE_COLOR[role] ?? ROLE_COLOR.environment!;
    const roleId = ROLE_ID[role] ?? 0.5;
    void li;
    for (const prim of layer.primitives) {
      const dx = prim.p[0] - cam.position[0];
      const dy = prim.p[1] - cam.position[1];
      const dz = prim.p[2] - cam.position[2];
      const depth = dx * basis.fwd.x + dy * basis.fwd.y + dz * basis.fwd.z;
      if (depth <= 1e-4) continue;
      const cov = layer.intensity * prim.intMul * depthAttenuation(layer.depthResponse, depth);
      if (cov <= 0.0015) continue;

      // size in CELLS, so the shader converts to pixels using the output cell size
      const sizeCells = layer.glyphRadius * prim.sizeMul * (opts.glyphScale ?? 1);
      data[o++] = prim.p[0];
      data[o++] = prim.p[1];
      data[o++] = prim.p[2];
      data[o++] = col[0];
      data[o++] = col[1];
      data[o++] = col[2];
      data[o++] = sizeCells;
      data[o++] = cov;
      data[o++] = roleId;
    }
  });

  // density window at this frame, interpolated as SceneIR's density TRACK describes
  const u = Math.max(0, Math.min(1, frame / Math.max(1, ir.frameCount - 1)));
  const k = u * u * (3 - 2 * u);
  const coverageMin = ir.density.from.coverageMin + (ir.density.to.coverageMin - ir.density.from.coverageMin) * k;
  const coverageMax = ir.density.from.coverageMax + (ir.density.to.coverageMax - ir.density.from.coverageMax) * k;

  // slot run for the film's family
  const layout = layoutAtlas(8);
  const family = opts.family ?? "printable";
  const run = familyRun(layout, family as GlyphFamily | "printable");
  const slotBase = run[0] ?? 0;

  return {
    width: ir.width,
    height: ir.height,
    cols: ir.cols,
    rows: ir.rows,
    count: live,
    data: data.subarray(0, o),
    camera: {
      position: cam.position,
      // The BASIS is carried explicitly. Letting the page re-derive it (from the primitive
      // centroid, say) is a second source of truth for orientation, and it disagreeing with the
      // CPU reference is exactly the class of bug that produced Phase 1's black frames.
      right: [basis.right.x, basis.right.y, basis.right.z],
      up: [basis.up.x, basis.up.y, basis.up.z],
      forward: [basis.fwd.x, basis.fwd.y, basis.fwd.z],
      fovY: cam.fovY,
      near: 0.05,
      // far enough to include the framing distance several times over, so fog is the only
      // thing that fades distance rather than the far plane clipping it
      far: Math.max(20, cam.worldToCells > 0 ? (2 * ir.rows) / cam.worldToCells * 8 : 200),
      worldToCells: cam.worldToCells,
    },
    grade: {
      exposure: ir.glyph.exposure,
      blackPoint: ir.glyph.blackPoint,
      vignette: ir.stock.vignette,
      grain: ir.stock.grain,
      // Phase 3 defaults: subtle, and all of them parameterised rather than baked in
      bloom: 0.55,
      halation: 0.35,
      aberration: 0.02,
      scanline: 0.0,
    },
    density: { coverageMin, coverageMax },
    slotBase,
    slotCount: run.length,
    background: ir.background ?? 0,
    edgeBoost: 0.45,
    // Depth fog is OFF by default. At 0.035 a primitive two units away already lost ~7% of its
    // ink, and because the figure sits FURTHER from the camera than the wall behind it in several
    // shots, fog darkened the subject more than its surroundings — producing a black hole in the
    // middle of the frame where the subject should be. Depth-dependent density is a deliberate
    // choice now, not a constant that silently eats the subject.
    depthFog: opts.depthFog ?? 0,
    pointScale: opts.pointScale ?? 1,
  };
}

/**
 * Compact wire format for the page.
 *
 * Float32 payloads travel base64-encoded in one JSON document, which avoids a second fetch and
 * keeps a frame's inputs atomic.
 */
export interface GpuSceneWire {
  meta: Omit<GpuScene, "data">;
  /** base64 of the Float32Array buffer */
  dataB64: string;
  frameIndex: number;
}

/**
 * Base64 of a byte array, environment-agnostic.
 *
 * Node has `Buffer` and the browser has `btoa`/`atob`; this module is imported by BOTH (the
 * bake script and the render page), so it must not assume either. Using `Buffer` here is what
 * produced `ReferenceError: Buffer is not defined` in the page.
 */
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    const b = Buffer.from(b64, "base64");
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeWire(scene: GpuScene, frameIndex: number): GpuSceneWire {
  const bytes = new Uint8Array(scene.data.buffer, scene.data.byteOffset, scene.data.byteLength);
  const { data: _drop, ...meta } = scene;
  void _drop;
  return { meta, dataB64: toBase64(bytes), frameIndex };
}

export function decodeWire(w: GpuSceneWire): GpuScene {
  const bytes = fromBase64(w.dataB64);
  // copy into an aligned buffer: a Float32Array view requires 4-byte alignment and the decoded
  // byte array gives no such guarantee
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const data = new Float32Array(copy.buffer);
  return { ...w.meta, data };
}
