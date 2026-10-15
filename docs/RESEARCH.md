# RESEARCH

> **These documents were reconstructed after Phase 1 from the implemented system and
> original specification.** `RESEARCH.md` and `ARCHITECTURE.md` did not exist before or
> during Phase 1 — the Phase 1 work was driven directly from the original specification
> in the task prompt. Nothing below claims to be a pre-existing design record, and no
> pre-existing research is invented. Where this document describes a decision, it says
> whether that decision was made *before* the code (in the spec) or *discovered* by
> building it (in Phase 1).

---

## 1. The question this project is answering

Can a film be **entirely** built out of printable ASCII characters — no source images,
no generated video, no pre-rendered footage — and still read as cinema rather than as a
text-mode novelty?

The original specification was explicit about both the medium and the constraint:

> ASCII-only visual language / 黑底 / no ordinary images / no AI-generated video / no
> pre-rendered video as the main body.

That is a *medium* constraint, not an effect. It rules out the obvious approach (render
a 3D scene, then posterise it to characters) because that still starts from a raster.
So the research question became: **what is the minimal scene representation that is
native to a character grid?**

## 2. Prior art, and why none of it was used

| Approach | Why it was rejected |
|---|---|
| **Image → ASCII** (`jp2a`, `ascii-image-converter`, `chafa`) | Requires a source image. Explicitly excluded by the brief, and it makes the character grid a *derived* artefact: the visual language is whatever the photo already was. |
| **3D render → luminance → ASCII** (most ASCII shaders) | Requires a rasteriser and a shading pipeline, then throws away the sub-cell detail it just computed. The glyph grid becomes an expensive quantiser rather than the medium. |
| **ASCII art as authored text** | Not procedural. Cannot be driven by a prompt, cannot be time-varying, cannot be deterministic from a seed. |
| **Pure terminal art** (ANSI, block characters) | Not ASCII. The brief's "ASCII-only" is load-bearing: the vocabulary is exactly 0x20–0x7E. |
| **Playwright + canvas, one DOM node per cell** | 28 800 DOM nodes per frame. Rejected on measurement grounds before it was built. |

**What was kept from the prior art:** the *density ramp* idea (map luminance to a
character whose ink coverage approximates it). That idea predates this project by
decades and is used here, but it is applied to a **procedural point field** rather than
to an image.

## 3. The central representation decision

**A scene is a set of point primitives, and the character grid is the sampling lattice.**

This is the single decision the whole engine rests on. A glyph cell is 5×9 = 45
subpixels of ink. Evaluating an analytic field only *at cell centres* is not an
approximation that loses quality — it is exactly the resolution the medium has. So:

- raymarching, SDFs and mesh rasterisation are all wasted work;
- a primitive is a point with a radius, an intensity and a transform;
- softness is a *profile width*, not a blur pass;
- "blur" is a wide, low-intensity primitive;
- "depth of field" is a radius ramp.

The consequence that took longest to accept: because the lattice is coarse (240×120
cells over 1920×1080), a primitive's footprint is only 1–3 cells across. **A primitive
whose peak is narrower than one cell has a brightness that depends on where it lands
relative to the lattice.** That is not a rendering bug — it is a sampling theorem
problem, and it produced a real, silent failure (see §6.2).

## 4. How a mark becomes a character

The pipeline that was arrived at, from the brief's "ASCII-only" requirement backwards:

1. **Luminance field.** Additive splats from primitives into a `Float32Array` over the
   glyph grid.
2. **Grade.** Exposure, black point, vignette, grain, scanline — all in engine space so
   that the stills and the video share one curve.
3. **Quantise.** One luminance per cell → one glyph, chosen by *measured ink coverage*
   from an animated coverage window.
4. **Raster.** Glyph bitmap → device pixels at exactly 8×9 per cell.

Step 3 is the interesting one. Mapping luminance to a character by *coverage* rather
than by a fixed string index means:

- the vocabulary can be filtered by measured ink (see §5), and
- **animating the coverage window is a visual transformation in its own right** — the
  same luminance field reads as punctuation at one moment and as dense type later. That
  became the "glyph density transformation" technique. It was *discovered* while
  building the quantiser, not planned.

## 5. Why the font had to be hand-authored

No system font can be sampled reliably: the engine cannot assume any particular font is
installed, cannot assume hinting or anti-aliasing behaviour, and needs a
**deterministic ink measurement per glyph** to build density ramps.

So a 5×9 bitmap font covering 0x20–0x7E was authored by hand
(`src/glyphs/atlas.ts`). Two discoveries came out of that:

1. **Measured coverage is not what you expect.** `W` and `M` measure 20 lit subpixels in
   this atlas, `@` measures 21, and many punctuation glyphs are lighter than they look.
   An authored ramp of "light to heavy" characters turned out to contain glyphs out of
   order. The ramps are therefore built by *sorting on measured coverage*, never by
   trusting the intended order. A validator rejects any window whose bounds exceed the
   atlas maximum.
2. **5×9 is not 8×9.** The cell is 8×9 device pixels but the glyph is 5×9, so a glyph
   subpixel is 1.6×1 device pixels. Scaling a 5×9-per-cell texture to 16:9 stretches
   every glyph by 16:9 ÷ (5:9) ≈ 3.2×, which reads as venetian blinds. The glyphs must be
   drawn as *rectangles* at the cell's own pixel scale. This cost a full debugging cycle
   (see §6.4).

## 6. What building it taught (the four real bugs)

Each of these produced a film that *looked plausible* and was wrong. They are recorded
here because they are the actual research output of Phase 1: they are the ways this
representation fails silently.

### 6.1 Depth was negated, so the entire film rendered black

`project()` computed the view-space depth and then negated it, on the mistaken
reasoning that "the camera looks down −Z". Since `fwd` already pointed *from* the camera
*at* the subject, the sign was already correct. Every primitive was therefore classified
as behind the camera and discarded.

**Why it was silent:** an empty frame is a legal frame. Nothing threw. The density
window, the camera, the encoder and the decode gate all reported success.

**Lesson:** a renderer whose failure mode is "black" needs an explicit non-emptiness
invariant, not just a decode check. Phase 1 added one (`shot 01 renders exactly one lit
cell`, `the last frame is a single character`, per-layer `onScreenFraction`).

### 6.2 `focal` conflated a perspective ratio with a cells-per-unit scale

There are two distinct quantities:

- the pinhole ratio in `s = focal · v / depth` — must be **1.0**, because the camera
  *distance* is the framing control;
- cells per world unit, constant per shot, derived from the framing at rest.

Folding the second into the first double-counted the distance, and deriving it from the
grid **width** instead of the grid **height** introduced the aspect ratio as a further
≈3.2× error. Framing was wrong by ~6× while looking superficially fine.

**Lesson:** units must be named in the type system, not just in comments. Phase 1 ended
up with `focusDistance` *being* the framing (visible height = 2 × focusDistance) and a
separate `worldToCells`, and the camera rig's invariant is asserted in tests.

### 6.3 A sub-cell primitive's brightness depended on the lattice

The lone dot of shot 01 landed on a cell boundary. With a needle-sharp `(1−d²)^e`
profile it received **0.10 of its nominal amplitude and vanished**; on other frames the
same dot appeared fine. The fix was to give the splat a **flat-topped core** whose radius
cannot exceed the distance to the nearest cell centre:

```
w(d) = 1                              for d ≤ core
w(d) = ((1−d²)/(1−core²))^e           for d > core
```

so "amplitude" means "the value inside the core", exactly and position-independently.

A second-order consequence: a flat top has a *shoulder*, so an isolated dot still lights
its neighbour faintly. With a two-glyph density window that neighbour still rounds to a
character, and "one glyph in a void" becomes two. This is why the spec carries a
per-shot `inkFloor`. **It is a partial-volume problem and it does not have a clean
solution at this lattice resolution; the floor is the honest acknowledgement of that.**

### 6.4 Scaling a 5×9 texture into an 8×9 cell

Described in §5.2. The visible symptom was horizontal banding that looked like an
intentional scanline effect, which is exactly why it survived a first review.

### 6.5 Sub-range rendering silently encoded the wrong frames

`pngFrameStream` accepted a `startFrame` and ignored it. Every motion test therefore
encoded the film's *opening*, and all five 4-second samples were **byte-identical**
(same sha256). The pre-flight gate "passed" by testing the same 120 frames five times.

**Lesson:** a verification gate that cannot distinguish its own inputs is worse than no
gate. Phase 1's regression gate now checks that the motion samples are mutually distinct
in spirit; Phase 2 should check it explicitly.

## 7. The toolchain discovery

There is no system ffmpeg on the machine this was built on. Rather than add a second
binary distribution, the engine reuses **the ffmpeg/ffprobe that Remotion ships**
(`@remotion/compositor-<platform>`). That build has two properties that both present as
engine bugs:

1. its `ffmpeg` links `libav*.dylib` **by bare name with no rpath and no `@loader_path`**,
   so it only resolves them through dyld's cwd fallback. Spawned from Node with any other
   cwd it aborts with `SIGABRT: Library not loaded`. Running it from a shell "works",
   which is what makes this so confusing.
2. it is built with a **minimal muxer/demuxer set**: no rawvideo demuxer and no rawvideo
   muxer. `-f rawvideo` fails with "Unknown input format", and `-f null` fails because
   automatic encoder selection for `wrapped_avframe` is disabled.

**Consequences that shaped the architecture:** frames are streamed to the encoder as PNG
`image2pipe`, and the "does it really decode" gate decodes to PNG and discards it.

## 8. Why the engine/Remotion seam is a binary, not a component

Remotion is a React video renderer: it runs the composition in Chromium. It cannot run
Node filesystem code, and re-implementing the whole cinematography inside a React
component would put the film's logic in the renderer.

So the seam is a **binary character grid** (`grid.bin`, `ACGR` v1): the engine decides,
for every cell of every frame, which ASCII glyph is drawn and how brightly; Remotion
rasterises that decision, composites, and encodes. Two properties fall out:

- byte-exact and dependency-free, so the same grid renders identically in Node and
  Chromium;
- two independent renderers (the engine's own PNG path and Remotion's Chromium path)
  that can be cross-checked against each other. In Phase 1 they produced 3.15 MB and
  2.79 MB videos with the same 600 decoded frames.

## 9. What Phase 1 deliberately did not solve

- **Occlusion.** The splat field is purely additive. A near primitive does not hide a
  far one. Depth is conveyed by perspective, attenuation and parallax only. This is
  recorded as a limitation, not a design choice, and Phase 2 addresses it.
- **Generality.** Phase 1 has exactly one beat template (`solitude-dissolution`) and one
  theme (`loneliness`). It is a *vertical slice*, not a director. The lexicon is an
  extension point, but the structure is fixed.
- **Explanation.** Shots carry `techniques` and `intent`, but the engine cannot answer
  *why this shot, why this camera, why this rhythm*.
- **Rhythm as a global layer.** Each shot has its own easing; there is no film-level
  energy/tension curve.
- **Audio.** Not attempted.

## 10. The open problem Phase 2 addresses

Phase 1 proved: *a film can be made of ASCII, deterministically, end to end.*

It did not prove: *the system can make a **different** film.*

The failure mode to avoid is a system that, given any input, produces
`dot → particles → humanoid → push-in → dissolve`. That is one movie with many inputs.
Phase 2's research question is therefore:

> What is the minimal **composable visual grammar** such that different concepts
> necessarily produce structurally different films — while every camera move, every
> transformation and every rhythm choice remains *explainable*?

See `docs/ARCHITECTURE.md` for the target design.
