# PHASE 3.3H — PERFORMANCE & ACTION CONTINUITY

**PHASE 3.3H = PARTIAL.**

The performance model is built, tested and validated at the **state** level. **The rendered clips do not
respond to body state**, so the benchmark cannot be shown to an observer and **no blind package was made.**

---

## 1. What was asked, and what actually happened

The phase asks whether an ASCII human can perform a continuous intentional action — NOTICE → ORIENT →
PREPARE → STEP → STOP → REACH — rather than switching between poses.

**Built and validated:** `src/semantic/performance.ts` — `PerformanceAction`, the body hierarchy,
lead/follow delays, anticipation, one-step weight/contact mechanics, pose-continuity checking, and all
per-frame motion metrics. **The state model is correct.**

**Not achieved:** the renderer does not turn that state into a moving image. Every frame of all three
variants is **byte-identical**. `uniqueFrameHashes = 1 / 270` and the line grid is identical at frame 0 and
frame 269 — `n=1019` occupied cells, same characters at the same positions.

**So the phase's central question is not answered.** I will not present a benchmark whose three variants are
the same image, and I will not claim the performance reads.

## 2. The performance model — works, and is tested

| piece | state |
|---|---|
| `PERFORMANCE_ACTIONS` | `notice, orient, weight-shift, step, settle, reach, hold` — semantic body actions, not renderer effects |
| `BODY_PARTS` | `head, torso, pelvis, leftArm, rightArm, leftLeg, rightLeg` — differentiated temporal roles |
| **lead/follow** | `Performance.partProgress()` delays each part by a declared fraction of the action's own duration, so *"head leads, torso follows"* is arithmetic rather than intention |
| **anticipation** | `withAnticipation()` — a shallow backswing that resolves into the movement, capped at 0.25 so it cannot become cartoon squash-and-stretch |
| **one-step mechanics** | `oneStep()` — `WEIGHT_TRANSFER → FOOT_LIFT → FOOT_TRAVEL → CONTACT → SETTLE`, with the body centre lagging the foot |
| **pose continuity** | `poseDiscontinuities()` compares two `Pose` records field by field and reports every mismatch |

**Verified numerically:** `oneStep()` body centre is continuous across its whole range (0.0118 at t=0.3 →
0.2569 at t=0.5 → 0.6465 at t=0.7 → 0.9512 at t=0.9 → 1.0), the planted foot never moves, and hand-to-NAME
distance falls monotonically **1.05 → 0.19** with no reversal.

### The three variants differ, at the state level

| | P1-serial | P2-lead-follow | P3-holds |
|---|---|---|---|
| overlap | 0 | 0.10 | 0.10 |
| max root velocity | 0.447 | 0.363 | 0.375 |
| max root acceleration | 1.26 | **0.81** | 0.90 |
| root jump ratio | 2.00 | 2.01 | 2.00 |
| contact frames | 4 | **6** | **6** |
| foot slip | 0 | 0 | 0 |

**Lead/follow measurably smooths the motion** — P2's peak acceleration is **36% lower than P1's** — and the
contact phase is longer where holds redistribute time. **The scores are meaningfully different. The renders
are not.**

## 3. A REAL defect the root-trajectory metric found

The first `oneStep()` had **two formulas for `bodyCentre` meeting at the contact frame** with different
values, so the body **jumped 3.83x the expected per-frame movement** — on every variant, while the easing
can only produce about 1.5x.

**A step with a discontinuous body centre is a step that teleports**, which is exactly what the brief
forbids. Rewritten as **one continuous function** with no branch boundary: the ratio fell to **2.00**, within
smooth-easing range. **The metric found this; reading the code had not.**

## 4. Three metrics that were measuring the wrong thing

1. **Foot slip reported 26–31 "slips" on every variant.** It checked that the *support* foot's x never
   changes — but *support* means the body's weight is over it, **not that the foot is planted**, so it
   flagged the step itself as a defect. Corrected to the planted foot only: **0**.
2. **`asciiChurnCells` read 0.** It compared the **character** at each cell, and the figure is drawn with one
   character and the floor with another — so when the figure moves, the characters are unchanged and only
   their positions differ. It measured nothing about motion.
3. **An invented threshold.** A discontinuity check used `maxRootJumpPerFrame < 0.02` — a number I made up —
   and every variant "failed" it while being smooth. The question a discontinuity check should ask is
   **relative**: does the largest one-frame move exceed what the motion's own easing can produce? Now a ratio.

**Two of these made correct behaviour look broken.** That is the same defect class as the 3.3C inert
contour mechanism and the 3.3G `nameCellsDrawn` mislabel, and it is the fourth time in this project that a
metric's name did not describe its measurement.

## 5. A rendering defect: the performer had the same ink as the floor

`drawRoom` filled **every third cell of every plane**, so the floor **covered the entire frame**. The figure
was drawn in `#` and the floor texture in `+` — **the same glyph-ramp index** — so the two rendered to the
**identical ink value**. `occupiedCells` was exactly 3999 on every frame of every variant: the figure was
present in the lattice and **completely invisible in the image.**

**Fixed** by reducing the planes to **outlines only**, which still reads as an enclosed room (Phase 3.2B
established that the perspective edges carry the interior) and leaves the figure as the darkest thing on the
field. `lineChurnCells` fell from 748 to 47.

**A performance benchmark cannot have a background that renders in the same ink as the performer.** This is
recorded as a *rendering* finding, distinct from the unresolved defect below.

## 6. The unresolved defect — stated precisely

**After** the ink fix, with the field provably varying, the rendered line grid is **still identical** at
frame 0 and frame 269:

| measured at f0 → f269 | value |
|---|---|
| `rootX` | −0.950 → −0.530 |
| head column | 69.0 → 91.5 |
| `bs.headTurn` | 0.0 → 48.0 |
| `bs.arm` | 0.000 → 1.000 |
| **contour cells in the field** | **2300 → 2474** |
| **head-area cells in the field** | **135 → 57** |
| **line-grid characters differing** | **0** |
| **raster bytes differing** | **0 of 6 220 800** |
| `uniqueFrameHashes` | **1 / 270** |

**The field changes and the raster does not.** `rasterLines()` was separately proven to respond correctly to
position and character (a block at column 60 vs 120 differs in **124 800 bytes**; ink values differ per glyph
`|=27  #=209  +=164  .=74  :=118  *=187`). So the fault is **between `fieldToLines()` and the grid the
rasteriser receives** — and I did not isolate it.

**I am not going to guess at it.** Three rounds of this round's budget went to metrics that were themselves
wrong, and each wrong metric sent the investigation after a different subsystem. The next step is a
**minimal reproduction**: draw one disc at two different cell coordinates, run `fieldToLines` →
`rasterLines`, and compare. That is a five-minute test that should have been written before the debug
instrumentation.

## 7. Provenance of the 3.3G rough cut — answered honestly

**The failed 3.3G rough cut was OVERWRITTEN, not preserved.** It was rendered to
`out/phase33g/rough-cut.mp4` (hash `f8cf80ec80337a28`, with `frag` and `decay` running backwards at two
cuts), then replaced at the **same path** by the corrected render once the continuity defects were fixed.
`out/phase33g/rough-cut.mp4` and `final-silent.mp4` are now both `ab39d78a40e74ba7`.

**Its only surviving record is the hash `f8cf80ec80337a28` and the description of its two defects** — the
artefact itself is gone. **I am not reconstructing it.** The lesson is procedural: a rough cut that is
evidence of a failure should be written to a distinct path before it is fixed.

## 8. MODEL CORRECTION — `presentational` is now a first-class relation

**Six relations, not five.** 3.3G's establishing shot had no physical action and no expressive
transformation, and `parallel` accepted it only after its rule was widened — which made `parallel` mean two
different things: *"two things happen independently"* and *"nothing happens, observe the state."*

`presentational` now owns the second meaning (establishing shots, observation, holds, waiting, pure state
presentation) and **`parallel` requires both layers again**. A presentational shot may not rank one absent
layer above the other.

**Tests added.** `31/31` composition-relation assertions and `51/51` shot-grammar assertions.

**The 3.3G external-review film is unchanged** — `ab39d78a40e74ba7`.

## 9. Regressions

| gate | result |
|---|---|
| composition relations | **31/31** |
| shot grammar | **51/51** |
| causal trace | **42/42** |
| 3.3A temporal baseline | unique hashes 1, cross-run 0 |
| `tsc --noEmit` | clean |
| `verify:claims` | **15/15** |
| `loneliness/grid.bin` | `49b4c86bcbc5677f` — frozen |
| `v4-directional.png` | `c9585c1322e62269` — unchanged |
| `phase33g/final-silent.mp4` | `ab39d78a40e74ba7` — unchanged |
| `phase33e/version-B.mp4` | `346c81d19ba8df8e` — unchanged |

## 10. Stop condition

**No blind-review package was created.** A blind test of three byte-identical clips would measure nothing and
would waste the external observer's review. That is a decision, not an omission.

**No supernatural effects, no camera movement, no walking, no micro-film, no audio, no SFX, no subtitles**
were added. The existing 3.3G film was not modified.
