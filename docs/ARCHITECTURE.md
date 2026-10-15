# ARCHITECTURE

> **These documents were reconstructed after Phase 1 from the implemented system and
> original specification.** `ARCHITECTURE.md` did not exist before or during Phase 1.
> The **Current Architecture** section describes code that exists and passes tests. The
> **Target Architecture** section describes intent and is explicitly labelled as not
> built. Nothing here is retro-fitted to look as though it was designed up front.

---

# PART I — CURRENT ARCHITECTURE (as implemented, Phase 1)

Everything in Part I exists and is covered by the Phase 1 regression gate
(`npm run regression:phase1`, 24/24) and the engine invariant suite (518 965 assertions).

## I.1 The chain

```
User prompt
   │  domain/planner.ts       parsePrompt()
   ▼
FilmSpec v1                   the whole film as data
   │  domain/planner.ts       planFilm()
   ▼
ShotSpec[] v1                 camera + density arc + primitive layers
   │  scene/scene.ts          compileScene()          PURE
   ▼
Scene                         seeded primitive cloud
   │  render/frame.ts         evaluateShotFrame()     PURE
   ▼
CharGrid                      (cols × rows) of {ASCII code, ink}
   │  render/render.ts        renderSequence()
   ▼
GridSequence
   │  render/gridbin.ts       encodeGridSequence()
   ▼
grid.bin  ────┬──────────────────────────────────────────────┐
   ACGR v1    │                                              │
              │  render/encode.ts (PNG stream)               │  remotion/GlyphGrid.tsx
              ▼                                              ▼
        ffmpeg (image2pipe)                          Chromium canvas → Remotion
              │                                              │
              ▼                                              ▼
        rough-cut.mp4                            remotion-rough-cut.mp4
```

## I.2 Modules

| Path | Responsibility | Purity |
|---|---|---|
| `src/core/rng.ts` | mulberry32, `hashString` | pure |
| `src/core/noise.ts` | value noise, fBm | pure |
| `src/core/math.ts` | vec3, camera basis, **projection**, clamps | pure |
| `src/core/easing.ts` | easing curves, keyframe tracks | pure |
| `src/glyphs/atlas.ts` | hand-authored 5×9 bitmap font, 0x20–0x7E | data |
| `src/glyphs/ramp.ts` | measured-coverage density ramps, quantiser | pure |
| `src/domain/schema.ts` | FilmSpec v1 / ShotSpec v1 types + validator | pure |
| `src/domain/planner.ts` | prompt → FilmSpec, beat table | pure |
| `src/scene/scene.ts` | ShotSpec → Scene; shape seeding; visibility annotation | pure |
| `src/camera/rig.ts` | camera moves, framing invariant, jitter | pure |
| `src/render/frame.ts` | the evaluator: project → splat → grade → quantise | pure |
| `src/render/raster.ts` | glyph → framebuffer | pure |
| `src/render/png.ts` | dependency-free PNG encoder | pure |
| `src/render/tone.ts` | the shared ink→display curve | pure |
| `src/render/gridbin.ts` | `ACGR` v1 codec + CRC digests | pure |
| `src/render/encode.ts` | framebuffer → PNG stream / contact sheet | I/O |
| `src/render/timeline.ts` | frame ↔ shot addressing | pure |
| `src/render/render.ts` | the render loop, telemetry | I/O-free |
| `src/util/toolchain.ts` | locate + validate ffmpeg/ffprobe | I/O |
| `src/util/ffmpeg.ts` | encode, probe, full-decode gate | I/O |
| `src/cli/engine.ts` | subcommands: plan/render/stills/spool/encode/probe/verify/report | I/O |
| `src/cli/tests.ts` | engine invariants | test |
| `remotion/*` | the compositor renderer | Chromium |

## I.3 Invariants enforced today

1. **ASCII only.** `ramp.ts` is the sole glyph selector and can only choose within the
   declared ramp; `render/render.ts` asserts per frame that no cell escaped it and
   **throws** rather than rendering.
2. **Grid tiling.** `cols × cellW == width` and `rows × cellH == height`, validated.
3. **Contiguous timeline.** Shots must tile with no gap and sum to the duration.
4. **Camera framing.** `basis.focal === 1`; visible height `== 2 × focusDistance`.
5. **Brightness is position-independent.** Flat-topped splat core sized so the nearest
   cell centre always sits inside it.
6. **No orphan primitives.** `compileScene` annotates every primitive with
   `onScreenAtSomePoint`; the test suite requires `onScreenFraction === 1` for every
   layer.
7. **Determinism.** No `Math.random`, no wall clock in the render path; scene and frame
   digests are recorded and asserted reproducible.

## I.4 The three seams (these are the load-bearing interfaces)

| Seam | Format | Why it exists |
|---|---|---|
| **FilmSpec** | JSON | The single source of truth. Everything downstream reads it and nothing re-decides the film. |
| **`grid.bin`** | `ACGR` v1 binary | Engine ↔ renderer. Byte-exact, dependency-free, identical in Node and Chromium. Also makes two independent renderers cross-checkable. |
| **Media toolchain** | `ffmpeg`/`ffprobe` process | The engine does no container muxing itself; encode and the decode gate are delegated. |

## I.5 Known structural problems with the current architecture

These are the reasons Part II exists.

| # | Problem | Consequence |
|---|---|---|
| P1 | FilmSpec v1 expresses *technical parameters*, not meaning | The spec cannot say what the film is about, so nothing downstream can reason about it |
| P2 | One beat template (`solitude-dissolution`) | Every input produces the same shot topology |
| P3 | ShotSpec has no `intention` / `visualReason` / `cameraReason` | Shots cannot be explained or audited |
| P4 | No Scene IR between ShotSpec and the renderer | `render/frame.ts` imports domain types directly; a second renderer would duplicate the director's assumptions |
| P5 | Purely additive compositing | No occlusion; near primitives cannot hide far ones |
| P6 | Renderer is not behind an interface | Only one backend exists and it is named implicitly |
| P7 | No global rhythm layer | Easing is per-shot and isolated |
| P8 | No LLM boundary | Interpretation is a hard-coded lexicon |

---

# PART II — TARGET ARCHITECTURE (Phase 2 and beyond)

> **NOT BUILT.** Nothing in Part II exists in the repository yet. Gate 2A (this gate)
> defines the types and the interfaces only. Where a component is planned but absent,
> it says `[planned]`.

## II.1 Target chain

```
                    ┌─────────────────────────────────────────────┐
 User input ───────►│  DIRECTOR AGENT            [planned 2B]     │
 (word / sentence / │  PromptClassifier                            │
  script / brief)   │  SemanticInterpreter                         │
                    │  MotifPlanner                                │
                    │  DramaturgyPlanner                           │
                    │  CompositionPlanner                          │
                    │  CameraPlanner                               │
                    │  RhythmPlanner                               │
                    │  ShotPlanner                                 │
                    └───────────────────┬─────────────────────────┘
                                        │  typed, validated
                                        ▼
                              FilmSpec v2 (DSL)
                              meaning + dramaturgy + visual metaphor
                              + space + rhythm + camera motivation
                                        │
                                        ▼
                              ShotSpec v2 (DSL)
                              narrativeFunction + intention
                              + visualReason + cameraReason
                                        │
                                        ▼
                              Scene IR                     [planned 2A → built]
                              cameraTrack, subjects, primitives,
                              transforms, densityTrack, glyphStrategy,
                              layers, depth/occlusionPolicy
                                        │
                      ┌─────────────────┴──────────────────┐
                      ▼                                    ▼
        CPU_REFERENCE_RENDERER                GPU_PRODUCTION_RENDERER
        (exists; formalised 2C)               [planned; spike in 2C/experiments]
        deterministic, CI-friendly            Three.js + GLSL, native ASCII
        pixel-independent logic               primitives, depth-aware compositor
                      │                                    │
                      └─────────────────┬──────────────────┘
                                        ▼
                                  AsciiFrame
                                        │
                                        ▼
                              Remotion timeline  →  MP4
                                        │
                                        ▼
                                       QA
                              (regression + diversity + depth gates)

                      AUDIO: explicitly out of scope for Phase 2.
```

## II.2 What changes, component by component

| Current | Target | Phase |
|---|---|---|
| `FilmSpec v1` (params) | `FilmSpec v2` (meaning, dramaturgy, motifs, oppositions, spatial metaphor, transformation logic, direction strategies, acts) | **2A** |
| `ShotSpec v1` | `ShotSpec v2` (`narrativeFunction`, `intention`, `subject[]`, `space`, `composition`, `camera`, `motion[]`, `transformation`, transitions, `rhythm`, `visualReason`, `cameraReason`) | **2A** |
| — | **Scene IR** as the renderer-facing layer; domain types no longer reach the renderer | **2A design, 2C wiring** |
| — | `src/director/grammar/` — the composable visual grammar (subject, space, composition, motion, transformation, camera, editing, rhythm) | **2B** |
| `domain/planner.ts` lexicon + beat table | `src/director/*` planners; the loneliness table survives as a **reference preset**, not the default path | **2B** |
| additive splatting only | `occlusionPolicy: additive \| nearest \| alpha \| mask`; CPU renderer implements `nearest` (basic z-buffer) | **2C** |
| one implicit renderer | `interface AsciiRenderer { renderFrame(scene: SceneIR, frame: number): Promise<AsciiFrame> }` with `cpu`/`gpu` backends | **2C** |
| — | `experiments/gpu-ascii/` — Three.js + GLSL spike, one deterministic 1920×1080 still | **2C** |
| per-shot easing | global energy / tension / information-density / motion-density curves driving durations, glyph activity, camera velocity, transition length | **2B** |
| lexicon only | LLM boundary: LLM → typed JSON → **schema validation** → deterministic compiler → renderer | **2B** |
| one benchmark | 4 benchmark prompts + `director-diversity-report.json` | **2D/2E** |
| `film-spec.json`, `shot-list.json` | + `treatment.md`, `director-notes.md`, `visual-motifs.json`, `rhythm-curve.json`, `scene-ir.json`, `director-report.json` | **2E** |

## II.3 The LLM boundary (a hard interface, not a convention)

```
LLM  ──►  typed JSON (FilmSpec v2 / partial interpretation)
              │
              ▼
        ZOD / JSON-SCHEMA VALIDATION
              │
      ┌───────┼────────┐
      ▼       ▼        ▼
   accept   repair   reject → deterministic fallback
              │
              ▼
     deterministic compiler  (never an LLM)
              │
              ▼
          Scene IR  ──►  renderer  (never an LLM)
```

Rules:

- The LLM may decide **meaning, metaphor, intention, motif, dramatic arc**.
- The LLM may **never** decide per-frame pixels, per-frame camera state, or per-primitive
  position. Those are compiler outputs.
- Invalid output is **rejected, repaired, or falls back** — never silently ignored.
- Planning must be **deterministic given the same model output plus seed**, so a film can
  be re-rendered and audited without re-querying the model.

## II.4 Why Scene IR is introduced

Today `render/frame.ts` imports `domain/schema.ts` types. That means the renderer has an
opinion about the director's structure — which is exactly what makes a second backend
expensive.

Scene IR breaks that: it is the *lowest* complete description of a frame's inputs
(camera track, subjects, primitives, transforms, density track, glyph strategy, layers,
depth policy) and nothing above it. Both renderers consume only Scene IR, so:

- the Director Agent can change without touching either renderer;
- the GPU renderer can be added without touching the director;
- the CPU renderer remains the **reference implementation** used for CI, because it is
  deterministic, dependency-free and testable.

`grid.bin` is **retained** as the renderer→Remotion playback seam. Scene IR sits above
it; it does not replace it.

## II.5 Depth semantics

`occlusionPolicy` is a per-layer property in Scene IR:

| Policy | Meaning | Phase |
|---|---|---|
| `additive` | Phase 1 behaviour; splats sum, nothing hides anything | exists |
| `nearest` | Nearest primitive's contribution wins per cell (basic z-buffer) | **2C** |
| `alpha` | Front-to-back compositing with per-primitive alpha | 2C+ |
| `mask` | A layer writes a coverage mask others are clipped by | 2C+ |

The requirement is modest and explicitly *not* physically correct: **a near primitive must
be able to hide a far one.** Phase 2 adds a dedicated regression test for it.

## II.6 Renderer interface

```ts
interface AsciiRenderer {
  readonly id: "cpu" | "gpu";
  renderFrame(scene: SceneIR, frame: number): Promise<AsciiFrame>;
}
```

| Backend | Status | Role |
|---|---|---|
| `CPU_REFERENCE_RENDERER` | **exists** (formalised in 2C) | Deterministic, simple, testable, CI-friendly. Reference implementation. The Phase 1 `grid.bin` path must keep working through it. |
| `GPU_PRODUCTION_RENDERER` | **[planned]** — spike only in 2C | Three.js + GLSL, native ASCII primitives, depth-aware compositor. High-fidelity production path. |

The GPU path is **not** allowed to replace the CPU path in Phase 2. The CPU renderer is
what the regression baseline pins.

## II.7 Quality gates for Phase 2

Phase 2 can only pass when all of these hold:

| | Gate |
|---|---|
| A | `npm run regression:phase1` still passes |
| B | 4 benchmark prompts generate valid FilmSpec v2 |
| C | all FilmSpecs pass schema validation |
| D | all films render completely |
| E | full decode clean |
| F | no NaN anywhere in fields or camera state |
| G | no glyph outside the declared ramp |
| H | no camera-behind-scene regression |
| I | no `startFrame` regression |
| J | depth occlusion regression passes |
| K | diversity report shows meaningful structural differences |
| L | no benchmark-specific conditional (`if (prompt === "欲望")`) |
| M | no new theme requires editing renderer code |
| N | every camera move has a `cameraReason` |
| O | every shot has a `narrativeFunction` |

Gate K is the one that matters most. Gates A–J and L–O are hygiene; **K is the actual
claim** — that this is a director system and not a template generator.

---

# III. Gate 2C — depth semantics and the renderer abstraction

## III.1 The layer that makes a second renderer possible

Before 2C the renderer imported `domain/schema.ts` and derived its own geometry, so it had an
opinion about the director's structure and could not be replaced. `src/scene-ir/` fixes that
by naming the lowest complete description of a frame's inputs.

```
FilmSpec v2 ──compile──> SceneIR ──┬──> CPU_REFERENCE_RENDERER   (src/render/cpu-renderer.ts)
                                   └──> SPIKE renderer            (src/experiments/spike-renderer.ts)
```

`SceneIR` carries: output geometry, a sampled `CameraTrack` (one key per frame or two), the
per-layer primitive cloud **with its rest-pose view depth**, per-layer optics (`glyphRadius`,
`intensity`, `focus`, `depthResponse`), the `TransformIR` and `MotionIR` ramps, the density
track, the glyph vocabulary and grade, and **`stock`** (grain and vignette).

### The two quantities whose absence was a real defect

Both were found by writing a second renderer and diffing characters, which is the entire
reason that exercise was worth doing before touching a GPU:

1. **`LayerIR.origin`.** Radial transforms scale a population around the *layer's* origin, not
   the world origin. Without the origin in the IR a renderer had to guess, and scaling around
   the world origin drifts the whole cloud: an isolated mark moved eight cells sideways and a
   dissolve emptied a shot.
2. **`SceneIR.stock`.** Grain and vignette were hardcoded inside the CPU renderer. The IR said
   nothing about them, so a renderer built from the IR alone produced a *different character*
   on any cell whose graded value sat near a quantiser bin boundary. `(0.5041 − 0.085) × 1.85
   = 0.7752` landed exactly on the boundary between `-` and `!`, and ±0.015 of grain decided
   which. The IR is defined as the lowest complete description of a frame's inputs; omitting
   the film stock was a defect, not a difference of taste.

## III.2 Depth semantics

`occlusionPolicy` is a property of the **space's meaning**, not a renderer switch:

| Space | Policy | Why |
|---|---|---|
| `void`, `plane`, `field` | `additive` | nothing to occlude; splats sum |
| `room`, `corridor`, `tunnel`, `vertical-space` | `nearest` | real near/far separation must be able to hide |

An `atmosphere` or `parallax-background` layer is always `additive` regardless of the space,
because a background wash that occludes would make the strata a lie.

`nearest` is a **per-primitive-centre z-buffer**, and it is deliberately *not* physically
correct. The contract it must satisfy is only: *a near primitive must be able to hide a far
one*, order-independently. `tests/depth/occlusion.test.ts` asserts exactly that on minimal
three-primitive scenes, plus the negative cases (additive must not hide; an occluder must not
dim itself; partial coverage hides only the covered cells).

## III.3 The quantiser defect that 2C uncovered

`quantize(v, window)` maps a value onto a glyph *within the window*, and a window's lightest
member is a real inking glyph (`.` at coverage 2), never the blank at 0. So `quantize(0, w)`
returned `.` — a luminance of **zero** produced a mark. In a viewport of thousands of
near-zero cells that turned an intended void into a field of apostrophes.

The fix is a blank floor: the midpoint between blank and the lightest glyph, in the window's own
scale, `lo / (2·(hi − lo))`.

**It is opt-in, and that is load-bearing.** The Phase 1 film's shots 01 and 02 use windows of
`[1,2]` and `[2,3]`, whose correct floor is ~1.0 — applying it globally blanked almost the
entire frozen film and changed `grid.bin`. Since `grid.bin` is a byte-frozen contract, the
legacy path keeps the behaviour it was frozen with (`windowRamp`, floor 0) and the new path
opts in via `windowRampWithFloor`. A latent quantiser bug is preserved on the old path *by
design*, and the reason is recorded at the call site rather than left for someone to
rediscover.

## III.4 The renderer seam

```ts
export interface AsciiRenderer {
  id: "cpu" | "gpu";
  description: string;
  renderFrame(scene: SceneIR, frame: number): Promise<AsciiFrame>;
  renderShot(scene: SceneIR, onProgress?: (done: number, total: number) => void): Promise<AsciiFrame[]>;
}
```

`AsciiFrame` carries `codes`, `ink` and telemetry including `hadNaN`, so gate F (no NaN) is a
property of the render output rather than something a test has to infer.

## III.5 The GPU path, and what it would actually buy

`experiments/gpu-ascii/` is a **spike, not a GPU renderer**: a second CPU implementation whose
only purpose is to falsify the claim that `SceneIR` is sufficient. It fails loudly on the two
missing fields above, which is why it was written first.

A real WebGL/Three.js backend is de-risked but not started. In order of value it would buy:

1. **per-fragment depth** — a real depth buffer replaces the CPU's per-primitive-centre test;
2. **pixel-resolution accumulation before quantisation** — the CPU splat evaluates on cell
   centres, so its finest detail is one cell, whereas a shader can sample a continuous field
   and *then* choose glyphs;
3. **speed**, which only matters if shot count or resolution grows by an order of magnitude.

## III.6 Gate 2C status

| | Requirement | Status |
|---|---|---|
| J | depth occlusion regression passes | PASS — `tests/depth/occlusion.test.ts` |
| — | SceneIR compiles from ShotSpec v2 | PASS — `src/scene-ir/compile.ts` |
| — | `AsciiRenderer` implemented | PASS — `cpuRenderer` |
| — | renderer is backend-independent | PASS — `tests/depth/backend.test.ts`, byte-exact once procedural noise is removed |
| — | GPU spike | SPIKE ONLY — deliberate, documented |

---

# IV. Gate 2D/2E — the four input modes, the benchmarks, and the diversity audit

## IV.1 Four modes, four different KINDS of input

The mode is chosen structurally by `PromptClassifier` (sentence count, clause count, event
markers, dialogue markers, production markers) and never by looking for particular words.

| mode | what it is | what changes downstream |
|---|---|---|
| `word` | a concept or condition, no events | arc and space come entirely from the concept |
| `sentence` | one proposition with an event | a turn exists and is placed |
| `script` | a sequence of events | split into `scriptUnits`, each a beat |
| `director-brief` | production constraints | **constraints are obeyed, not interpreted** |

### The brief mode was a lie until it parsed its own input

An earlier implementation classified a brief correctly, reported `mode: "director-brief"`, and
then ignored everything in it: `shot 2: 6 seconds, slow push-in` produced neither 6 seconds nor
a push-in. A mode that changes nothing is a false statement in the report.

`src/director/brief.ts` parses directives into facts the planners must honour:

- a declared **shot count** overrides the tempo-derived count (3 declared shots produce 3 shots,
  not 5);
- a declared **duration** replaces the rhythm-derived one, and durations are **not** rescaled
  when they already sum to the declared total (rescaling silently undid the constraint:
  5+6+9 became 3.6+4.4+6.5);
- a declared **camera move** is honoured by selecting a reason that *implies* that move, never
  by overwriting the reason. A camera that pushes in while its reason says "the subject carries
  all the change" is a false justification, which is worse than no reason;
- a declared **transition** wins over the derived one;
- **global constraints** (silence, no dialogue, no movement) are carried into the spec so they
  are auditable rather than merely logged.

## IV.2 The benchmarks

Four films, four input modes, each rendered and fully decoded. The decisive gate is the
**decode**: every earlier stage can report success while producing an unplayable film, which is
precisely what Phase 1's `startFrame` bug did while every unit test passed.

| dir | mode | shots | space | cameras | decoded |
|---|---|---|---|---|---|
| `desire` | word | 8 | corridor | static, push-in | 600/600, 0 corrupt |
| `forgotten-name` | sentence | 5 | room | static, push-in, pull-out | 600/600, 0 corrupt |
| `disappearing-room` | script | 5 | room | static, pull-out | 600/600, 0 corrupt |
| `time` | word | 5 | vertical-space | static, crane-up, crane-down | 600/600, 0 corrupt |
| `brief-lockdown` | director-brief | 3 | — | static, push-in | validated, not rendered |

A director brief is validated rather than rendered: its claim is that constraints are obeyed,
not that it produces new imagery, so rendering it would test nothing the other four do not.

## IV.3 The diversity audit, and what "different" means

`scripts/diversity-report.mjs` exists to falsify one claim: *the same system, faced with
different concepts, really does make different films.* It is separate from the benchmark gate
because **a system that emitted the same film for every prompt would pass every validity gate.**
Validity is not the claim; difference is.

Difference is measured on the nine axes a director decides — shot count, primary space, camera
behaviour set, composition set, narrative-function sequence, transformation set, technique set,
negative-space profile, occlusion policy — weighted, with space/camera/function/transformation
counting double. Not pixels: a seeded randomiser makes pixels differ for free and it means
nothing.

Current measurement across the four rendered films:

- **12/12 checks pass**
- **77% mean pairwise structural distance**
- closest pair (`forgotten-name` vs `disappearing-room`) still differs on **5 of 9 axes**
- three distinct spaces, four distinct camera sets, four distinct function sequences
- 7 distinct camera reasons in use

### A gap this audit actually caught

The first run failed the check *"no two films share a camera-behaviour set"*: `欲望` and `时间`
both came out as `{static, push-in}`. The cause was real — `diminish-subject`/`meet-subject`
were only ever *offered* for a `vertical-space` or `field`, and were never *preferred* for any
narrative function, so the vertical vocabulary existed but could never be selected. `时间`
reads `temporal: accumulation` in a `vertical-space`, and a film about duration stacking up is
exactly what a crane expresses. With vertical movement preferred for accumulation films, the
sets became `{static, crane-up, crane-down}` and the check passes on its own terms.

That is the audit doing its job: not a threshold being relaxed, but a gap in the director being
found and closed.

## IV.4 Director materials

`scripts/director-materials.mjs` writes, per film:

| file | what it is |
|---|---|
| `treatment.md` | the idea, oppositions, motifs, act structure, and how it is made |
| `director-notes.md` | per-shot: why it exists, why it looks like that, why the camera does that |
| `visual-motifs.json` | the motif ledger with an appearance count counted from the shot specs |
| `rhythm-curve.json` | the four global curves plus each shot's sampled values |
| `director-report.json` | provenance, the determinism rule, and a per-shot justification audit |

Every sentence is read out of `film-spec-v2.json`. Nothing is written by hand, so a claim the
spec does not justify cannot appear — and any claim can be falsified against the JSON.

## IV.5 Gate 2D/2E status

| | Requirement | Status |
|---|---|---|
| B | 4 benchmark prompts generate valid FilmSpec v2 | PASS — 54/54 benchmark gates |
| C | all FilmSpecs pass schema validation | PASS |
| D | all films render completely | PASS — 600 frames each |
| E | full decode clean | PASS — 4/4 films, 0 corrupt reports |
| K | diversity report shows structural differences | PASS — 12/12, 77% mean distance |
| L | no benchmark-specific conditional | PASS — scanned, 0 found |
| M | no new theme requires a renderer edit | PASS — concepts are declarative rows |
| N | every camera move has a `cameraReason` | PASS — 100% across all films |
| O | every shot has a `narrativeFunction` | PASS — 100% across all films |
