# ADR 0001 — GPU production renderer technology stack

- **Status:** Accepted
- **Date:** Phase 3, gate 2
- **Context:** Phase 3 gate 2 requires a real `GPU_PRODUCTION_RENDERER` that consumes `SceneIR`
  and nothing else.

## Decision

**Raw WebGL2 + GLSL ES 3.00, driven by headless Chrome, with Three.js available but not used as
the scene layer for the ASCII pipeline.**

The renderer lives in `src/render/gpu/` and is executed in a WebGL2 context. Three.js 0.169 is
installed and will be used where it earns its place (see "When Three.js will be used" below).

## Why not Three.js as the renderer core

The pipeline this renderer must implement is not a mesh scene graph. It is:

| pass | what it actually needs |
|---|---|
| `ScenePass` | additive point splats into an HDR float target, one instanced draw |
| `DepthPass` | a real depth attachment, `DEPTH_COMPONENT24` |
| `EdgePass` | fullscreen, reads the depth + normal targets |
| `LuminancePass` | fullscreen, local contrast over a neighbourhood |
| `GlyphSelectPass` | fullscreen, quantises coverage and writes a slot index per cell |
| `AsciiCompositePass` | instanced quads, one per cell, sampling the glyph atlas |
| `PostPass` | fullscreen chain: bloom, grain, vignette, aberration, halation |

That is **seven hand-written shader programs and full control of render-target formats and
blending**. Three.js's value is scene-graph traversal, material abstraction and render-target
management — of which this pipeline uses essentially none, while still needing to drop to raw
GLSL, raw `WebGLRenderTarget` formats and explicit blending for every pass. Concretely:

1. **Render-target format control.** HDR accumulation needs `RGBA16F` with additive blending and
   no automatic sRGB conversion. Three.js applies colour management and tone mapping to
   `WebGLRenderer` output by default; disabling it correctly for a multi-pass pipeline is more
   code than creating the framebuffer directly.
2. **No scene graph is required.** `SceneIR` is already a flat list of layers, each a flat list
   of primitives with a camera track. There is nothing to traverse.
3. **Determinism.** The renderer must be bit-reproducible for visual regression. Fewer layers of
   implicit state between the input and the framebuffer is easier to prove deterministic.
4. **Dependency surface.** Three.js is ~600 KB. It is installed for the operations below, but the
   ASCII pipeline should not depend on it to draw seven fullscreen quads.

It is worth stating explicitly that **this is not a rejection of Three.js**. It is a decision
about *which layer* benefits from it.

## When Three.js will be used

Three.js is installed and the import map serves it. It will be adopted for the scene layer when
`SceneIR` grows constructs that are genuinely a scene graph rather than a primitive list:

- `AsciiMesh` and `AsciiVolume` native objects (gate 5), which need a mesh/geometry abstraction;
- any future ray-marched or SDF-based space, where `MeshStandardMaterial`-class shading helps;
- `@remotion/three` integration if the Remotion path is ever swapped to render GPU frames
  in-process rather than via headless Chrome.

At that point the split would be: **Three.js builds and shades the scene into the HDR target;
the ASCII passes (`EdgePass` → `AsciiCompositePass` → `PostPass`) stay raw GLSL**, because they
are the part that is specific to this engine and has no Three.js equivalent.

*Revisit trigger:* if the ASCII passes themselves start needing Three.js internals, this ADR is
wrong and should be superseded.

## Why headless Chrome rather than a Node GL binding

- A **hardware-accelerated** context is available and verified: Chrome 154 on this machine
  reports `ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max)`, `maxTex 16384`,
  `DEPTH_BITS 24`, `MAX_SAMPLES 4`, and `readPixels` returns exact values.
- Node GL bindings (`gl`, `headless-gl`) are typically **GL ES 2.0** only, and would block
  `RGBA16F` accumulation, `textureLod` and `texelFetch`, all of which this pipeline needs.
- Chrome is already a project dependency: Remotion pins it in `remotion.config.ts`.
- The same page can later be loaded by Remotion for an in-process path, so the renderer is
  shared rather than reimplemented.

**Cost accepted:** process orchestration and a local HTTP server (`scripts/gpu-serve.mjs`).
Frames are POSTed back to that server, so a single Chrome instance renders a whole batch rather
than one process spawn per frame.

## Determinism and verification strategy

The GPU renderer must be checkable against the CPU reference. Two levels:

1. **`--deterministic` mode** disables anything with sampling jitter, uses `premultipliedAlpha:
   false`, `antialias: false`, `preserveDrawingBuffer: true`, and a fixed `powerPreference`.
   Two runs of the same `SceneIR` must produce byte-identical PNGs.
2. **Visual QA harness** (gate 10) measures per-metric differences between the CPU reference and
   the GPU production renderer, and between Phase 2 and Phase 3, rather than asserting pixel
   equality — the two renderers are *supposed* to differ, and the harness quantifies how.

## Consequences

- The renderer owns its GL state explicitly, which is more code but fully auditable.
- No bundler is required: the page is an ES module served over HTTP with an import map, so
  `src/render/gpu/*.js` is shipped as-is and `node_modules/three` is reachable without a build.
- The renderer's TypeScript types come from `@types/three` only where Three.js is used.
