# PHASE 1 POSTMORTEM

> **These documents were reconstructed after Phase 1 from the implemented system and
> original specification.** This postmortem is written from the actual Phase 1 work
> record: what was specified, what was built, what broke, and what the numbers were.
> It does not claim a pre-existing process.

**Result: PHASE 1 = PASS.** 600/600 frames decode clean. Frozen in
[`baselines/PHASE_1_BASELINE.md`](./baselines/PHASE_1_BASELINE.md).

---

## 1. Scope as specified

The original specification asked for a *minimum working* ASCII cinema engine and was
explicit that the goal was **not feature count** but proving the vertical chain:

```
User Prompt → FilmSpec → ShotSpec → Scene → ASCII Render → Camera → Remotion → MP4
```

Fixed benchmark input `孤独`, 20 s, 1920×1080, 30 fps draft, 16:9, black ground,
ASCII-only, ≥5 shots with prescribed beats, ≥7 named techniques (push-in, lateral
camera move, depth/parallax, particle field, glyph density transformation, assemble,
dissolve), no images, no AI video, no pre-rendered video, and eight verification steps
ending in a full decode check.

## 2. What was delivered

| Deliverable | Requested | Delivered |
|---|---|---|
| Vertical chain | Prompt → MP4 | complete, each stage typed |
| Duration / res / fps | 20 s / 1920×1080 / 30 fps | exact |
| Shots | ≥5, prescribed beats | 5, beats match |
| Techniques | ≥7 named | all 7 present, audited in the report |
| Images / AI video / pre-rendered | forbidden | none used; scene is a procedural point field |
| Stills | representative | 10 (2 per shot) at 1920×1080 |
| Contact sheet | required | 2640×1140, 10 thumbnails |
| Motion samples | 3–5 s | 5 × 4.0 s, all distinct, each probed |
| Rough cut | 20 s | 600 frames, 20.000 s, 3.15 MB |
| ffprobe | required | 14 structural gates |
| Full decode | required | 600/600 frames, 0 corrupt |
| Report | required | `render-report.json` + telemetry + pipeline log |

Independent counts at freeze:

- **518 965** engine invariant assertions, 0 failures
- **24/24** Phase 1 regression gates
- **~6 900 LOC** across 29 source files
- Engine render of 600 frames: **~4.5 s**; whole pipeline: **~50 s**

## 3. Timeline shape of the work

Phase 1 did **not** proceed as design → implement → verify. It proceeded as
implement → render → discover it is wrong → re-derive the model. Roughly:

1. Glyph atlas, raster, PNG encoder, gridbin codec, domain types, planner, scene
   compiler, camera rig, evaluator — written from the spec in one pass.
2. First render: **empty frames.** Investigated.
3. Fixed projection sign, focal invariant, layer height placement, `NaN` cache seeding,
   depth-attenuation over-clipping, double-perspective radius, cell-space brightness —
   seven distinct model errors, each of which had produced a plausible-looking wrong
   image.
4. Numerically calibrated per-layer brightness against measured telemetry rather than
   guessing (`fieldP50/P90/P99/meanLit` were added to the evaluator *for this purpose*).
5. Rewrote the beat table into one explicit authoring table after two hand-edit scripts
   corrupted it.
6. Built the CLI, encoder, verifier, contact sheets, pipeline.
7. Found and fixed the `startFrame` bug that made all motion tests identical.
8. Formalised the test suite and the regression gate.

**The ratio matters: the majority of Phase 1 was spent making the *model* correct, not
adding capability.** That is the headline lesson.

## 4. The eight real defects

All eight had the same signature: **the output looked like a film, and was wrong.**

| # | Defect | Symptom | Why it was silent | Guard added |
|---|---|---|---|---|
| 1 | `project()` negated view depth | every frame black | an empty frame is a legal frame; every gate reported success | non-emptiness assertions (1 lit cell in shot 01, 1 in the last frame); `onScreenFraction` per layer |
| 2 | `focal` = cols/(2·dist) instead of a pinhole ratio of 1 | framing wrong by ≈6× (aspect × distance) | 1-unit error reads as "artistic" scale choice | `focal === 1` asserted; `visibleHeight === 2·focusDistance` asserted |
| 3 | Layer `bounds` used as a jitter half-extent for single points | the lone dot scattered off screen | "tiny dot in a void" and "empty void" look similar | `bounds` documented as *the spawn point* for `shape: "none"`; jitter reduced to 0.01 |
| 4 | Density-window cache seeded with `NaN` | density window never rebuilt; `x − NaN > ε` is false | the shot still rendered, just with a frozen vocabulary | cache seeded with `−Infinity`; comment records the trap |
| 5 | Depth attenuation `6/(depth+4)` | everything past ~2 units went black | partial scenes still looked intentional | gentle atmospheric falloff `1/(1+0.07·d)`; telemetry |
| 6 | Splat radius divided by depth a second time | every primitive collapsed to a sub-cell speck | sparse frames read as "negative space", which the brief *asks for* | single perspective divide; comment records the trap |
| 7 | Brightness divided by splat area | huge halos dominated; tuning impossible | produced a soft glow that looked deliberate | `intensity` redefined as per-cell peak; footprint authored in **glyph cells** |
| 8 | `pngFrameStream` ignored `startFrame` | all 5 motion tests byte-identical | the gate decoded 600 frames and passed — the same 120 frames five times | `startFrame` honoured in all three writers; regression gate checks sub-ranges |

Defects 3, 4, 6 and 7 are all instances of **one class**: a quantity authored in one
unit silently interpreted in another (world vs cells; spawn point vs half-extent;
ratio vs scale). That class is why the target architecture names its units in the type
system and separates Scene IR from the domain DSL.

Defect 8 is a different class and the most dangerous: **a verification gate that could
not distinguish its own inputs.** It reported PASS by testing the same thing five times.

## 5. What went right

- **The representation choice was correct.** "Scene = point primitives; grid = sampling
  lattice" survived contact with every bug above. No rewrite was needed, only corrections
  to the projection/scaling maths. Building the whole film in ~4.5 s of engine time is a
  direct consequence.
- **Instrument-then-tune.** Adding `fieldP50/P90/P99/meanLit`, `visiblePrimitives`,
  `onScreenFraction` and pre-grade coverage to the evaluator turned un-tunable visual
  guessing into two-point numerical calibration. This should have been done *before*
  authoring the first beat table.
- **The binary seam.** `grid.bin` made the engine and Remotion genuinely independent
  (they produced 3.15 MB and 2.79 MB videos with the same 600 decoded frames), and made
  the ASCII-only guarantee mechanically checkable per frame rather than by inspection.
- **Refusing to invent design docs.** No `RESEARCH.md`/`ARCHITECTURE.md` were fabricated
  mid-Phase-1 to make the project look planned. They are written now, labelled as
  reconstructions.

## 6. What went wrong (process)

1. **No telemetry until late.** Several bugs were found by rendering images and looking
   at them, which is slow and unreliable. Measurement should have come first.
2. **Fragile hand-editing of the beat table.** Two Python patch scripts silently
   corrupted `planner.ts` (a brace-matching bug replaced the wrong object; a regex missed
   a duplicate key). Both were repaired only because a later render looked wrong.
   *Lesson:* authoring data should live in one explicit table with unique keys, and the
   table should be validated — which is what it was finally rewritten into.
3. **No baseline before changes.** Every tuning iteration overwrote the previous output,
   so "did that make it better or worse" was answered from memory. The Phase 1 baseline
   and `regression:phase1` exist so Phase 2 does not repeat this.
4. **Stale artifact confusion.** Re-rendering from an old `film-spec.json` after changing
   the planner produced several rounds of "the fix did not work" when the fix was fine and
   the *spec* was stale. The pipeline now always re-plans before rendering.
5. **Environmental traps cost real time.** The bundled ffmpeg's missing rpath and missing
   rawvideo muxer/demuxer both presented as engine failures. Both are now documented in
   `README.md` and encoded in `util/toolchain.ts`.

## 7. Honest limitations carried into Phase 2

- **No occlusion.** Purely additive compositing. Recorded as a limitation, not a choice.
- **One template, one theme.** The `solitude-dissolution` beat table is the only
  structure. Every input produces the same shot topology.
- **No explanation.** Shots carry `intent` and `techniques`, but the system cannot answer
  *why this shot, why this camera, why this rhythm*. Self-reported technique labels are
  not reasoning.
- **No global rhythm.** Easing is per-shot and isolated; there is no film-level curve.
- **Humanoid is abstract, not anatomical.** At 240×120 cells with soft splats this is a
  resolution limit; the brief asks only for "模糊的人形", so it was accepted.
- **No pixel-level renderer test.** The two renderers are compared by decoded frame count,
  size and spot-checked stills — not by a pixel diff.
- **`grid.bin` is 34 MB for 20 s**, uncompressed by design so it stays byte-diffable.
- **No audio**, by scope.

## 8. Transferable lessons

1. **A renderer whose failure mode is "black" needs a non-emptiness invariant.** Decode
   checks and schema validation cannot catch an empty frame.
2. **Derive quantities from one authoritative relation, then assert that relation.**
   Three separate bugs came from re-deriving the same geometry in three places with
   different units.
3. **Author brightness in the resolution of the medium, not in world units.** Authoring
   footprint in glyph cells is what finally made tuning predictable.
4. **A sub-cell mark on a coarse lattice is a partial-volume problem.** A flat-topped core
   makes amplitude exact; the residual shoulder may still need an explicit floor.
5. **A gate that cannot distinguish its inputs is worse than no gate.** Assert that the
   motion samples differ from each other.
6. **Measure before authoring.** The tuning loop must exist before the first art pass.
7. **Do not let toolchain quirks masquerade as engine bugs.** Probe the toolchain
   explicitly at startup and fail loudly.

## 9. Handoff to Phase 2

Phase 1 answered: *can a film be made of ASCII, deterministically, end to end?* Yes.

Phase 1 did **not** answer: *can the system make a different film?* The 8 defects above
were all model errors, not generality errors — generality was never attempted, because
the brief deliberately restricted Phase 1 to one benchmark.

Phase 2's risk is therefore **not** rendering. Rendering is proven and fast. The risk is
building a system that takes four different prompts and returns one movie. That is why
Phase 2's pass condition is a **structural diversity report**, and why "more effects" is
explicitly out of scope.
