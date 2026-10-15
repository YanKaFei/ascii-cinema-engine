# experiments/gpu-ascii — backend-independence spike

## Status: SPIKE, not a GPU renderer

This directory exists to answer ONE question before anyone invests in a WebGL/Three.js
pipeline: **is `SceneIR` actually renderer-agnostic, or does the CPU renderer quietly own
decisions that a second backend would have to re-derive?**

If the IR is real, a second renderer written against it — sharing no code with
`src/render/cpu-renderer.ts` except the glyph atlas and the quantiser — must produce
byte-identical ASCII codes for the same `SceneIR`. If it does not, the IR is incomplete and
a GPU path would be a rewrite rather than a backend.

## What `spike.mjs` is

A standalone second renderer that:

- reads a `SceneIR` from `scene-ir.json`,
- resolves the camera track, splats primitives with its own implementation,
- quantises with the shared ramp,
- rasterises glyphs with the shared 5x9 bitmap atlas,
- writes a deterministic 1920x1080 PNG using the engine's own PNG encoder.

It is **not** GPU-accelerated, and it is **not** a production path. It is the smallest thing
that can falsify the claim above. Reproducing the CPU renderer's character decisions through
a separately written rasteriser is the evidence; the GPU part is the NEXT step, and it is
gated on this passing.

## Why this order

The expensive part of a GPU migration is not the shader. It is discovering, halfway through,
that the IR is missing a quantity the shader needs and that the CPU renderer was computing it
inline. That failure mode costs a rewrite. This spike costs an hour and rules it out.

## The GPU path this de-risks

```
SceneIR
  │
  ├── CPU_REFERENCE_RENDERER   (exists; deterministic; pins the Phase 1 baseline)
  │
  └── GPU_PRODUCTION_RENDERER  (future)
        Three.js scene
          ├── one InstancedBufferGeometry of quads, one instance per lit glyph cell
          ├── per-instance attributes: cell x/y, ASCII code, ink
          ├── a glyph atlas texture (the same 5x9 bitmaps, uploaded once)
          ├── GLSL: sample atlas -> composite -> apply grade in linear space
          └── depth: a depth buffer replaces the CPU zbuffer; `nearest` becomes
                     GL_LESS with depth writes, which is the same semantics the CPU
                     renderer implements by hand
        Compositor
          └── reads back a framebuffer, hands it to Remotion or ffmpeg
```

What the GPU path would buy, in order of value:

1. **Depth-correct compositing with per-fragment occlusion** instead of the CPU's
   per-primitive-centre test. The CPU policy only promises "a near primitive can hide a far
   one"; a depth buffer gives the real thing for free.
2. **Sub-cell softness.** The CPU renderer's splat profile is evaluated on cell centres, so
   the finest detail it can express is one cell. A shader can accumulate at pixel resolution
   and *then* quantise, which is the difference between "ASCII as a filter" and "ASCII as a
   sampling of a continuous field".
3. **Speed**, which matters only if shot counts or resolutions grow by an order of magnitude.

## Running the spike

```bash
node experiments/gpu-ascii/spike.mjs --ir out/direct/<slug>/scene-ir.json --out /tmp/spike.png
node dist/tests/regression/index.js    # includes the backend-independence assertion
```
