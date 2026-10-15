# PHASE 3.3H.3 — PERCEPTUAL PERFORMANCE REPAIR

**PHASE 3.3H.3 = EXTERNAL GATE READY.**

The winning timing is frozen, the NOTICE representation and the STEP geometry are repaired, and three
**isolated** tests replace the P1/P2/P3 comparison. **PHASE 3.3H remains PARTIAL** until an external observer
can recover the intended action order.

---

## 1. WINNING TIMING BASELINE

Opening `out/phase33h/BLIND-ANSWER-KEY.json` against the external result:

| clip | source | external |
|---|---|---|
| `clip-01.mp4` | P2-lead-follow | second |
| **`clip-02.mp4`** | **P1-serial** | **STRONGEST** |
| `clip-03.mp4` | P3-lead-follow-holds | third |

> ### **WINNING TIMING BASELINE = `P1-serial`**

**The serial baseline won.** The lead/follow overlap that 3.3H was built to test did **not** improve the
external reading, and neither did the added holds. `P1`'s action windows are frozen:

```
notice [0.06,0.16]  orient [0.17,0.33]  step [0.34,0.55]  settle [0.56,0.68]  reach [0.69,0.97]
```

**P1/P2/P3 are not compared again.** The variables from here are **NOTICE representation** and **STEP
geometry**, not timing.

## 2. NOTICE REPAIR

### The problem, in the external reviewer's words
> *"The observer did NOT spontaneously perceive a clear event equivalent to 'the person notices the NAME.'
> The sequence reads closer to: stand → begin moving → reach."*

**A turning disc is very nearly rotationally symmetric.** The head's yaw was in the geometry and carried
almost no silhouette information — the orientation was real and invisible.

### The repair — `headFootprint()` in `src/semantic/body.ts`

| cue | mechanism |
|---|---|
| **foreshortening** | the head's projected **width** narrows with yaw — a disc turned away from the camera projects narrower, so the cue is a *consequence* of the yaw rather than a decoration drawn on top of it |
| **facing cue** | a short protrusion from the disc's **leading edge**, absent when facing the camera and maximal at profile |

**No eyes, no face, no facial features.** The Phase 3.1 grammar has none and the brief forbids adding them.

**The first version was too subtle and was corrected.** It narrowed the head to 0.874 of its width at 48° — a
14% change that measured as **61 changed cells across the whole notice**. The floor is now 0.52 and the cue
0.95, so a moderate yaw produces an unmistakable change while a front-facing head stays at full width.

### The hold — attention before action
`noticeAt()` adds a **hold derived from the action's own window** (`NOTICE_HOLD = 0.40`), not a hardcoded
frame count. The 3.3H.2 timing had `hold: 0` — **a notice with no hold is not perceivable as an event**,
because the head moves and immediately continues into the step, so the audience never sees a state in which
the person *has* noticed and *has not yet acted*.

### Head leads, torso follows
The torso's progress is the head's **delayed** by 0.35 of the turn span, so the shoulder line is still
arriving when the head has settled. Verified: `torsoLagsHead = true` on every frame where both are active.

## 3. STEP / WEIGHT REPAIR

### The problem, in the external reviewer's words
> *"the step still resembles: legs opening into a wide stance + body translation, more than: weight transfer
> → foot lift → travel → contact → body recovery."*

### The cause the numbers could not show
**`rootProgress` and `footProgress` were the SAME CURVE.** Both were driven by one `smooth()` of one
parameter, so the body travelled in lockstep with the foot — which is precisely what *sliding* looks like.
**Endpoint equality (0.420 = 0.420) was satisfied and told us nothing, because endpoint equality does not
define phasing.**

### The repair — `oneStep()` rebuilt as a weight event

| quantity | old | new |
|---|---|---|
| **root** | same curve as the foot | **delayed** — the body commits only after the foot is airborne |
| **moving foot** | linear in the step parameter | **arcs** — lift rises to a peak at mid-travel and returns to zero |
| **pelvis** | not modelled | **shifts over the support leg** before anything leaves the ground |
| **separation** | maximal for much of the step | **peaks at mid-travel only** |

**Phases:** `weight-transfer (0–0.22) → foot-lift (0.22–0.38) → foot-travel (0.38–0.70) → contact (0.70–0.78) → settle (0.78–1.0)`

## 4. ROOT / FOOT PHASING — measured, not asserted

| t | foot travel | foot lift | root | **lag** | phase |
|---|---|---|---|---|---|
| 0.22 | 0.000 | 0.000 | 0.001 | −0.001 | weight-transfer |
| 0.30 | 0.074 | 0.175 | 0.037 | 0.037 | foot-lift |
| 0.38 | 0.259 | 0.303 | 0.120 | 0.139 | foot-travel |
| 0.50 | 0.624 | 0.338 | 0.306 | **0.317** | foot-travel |
| 0.62 | 0.926 | 0.175 | 0.529 | **0.397** | foot-travel |
| 0.70 | 1.000 | 0.000 | 0.678 | 0.322 | contact |
| 0.90 | 1.000 | 0.000 | 0.956 | 0.044 | settle |
| 1.00 | 1.000 | 0.000 | 1.000 | 0.000 | settle |

- **samples where foot and root are exactly equal: 22 / 101** — the curves genuinely differ (they coincide
  only at the endpoints and through the weight-transfer, where neither moves)
- **maximum lag of the root behind the foot: 0.3973**
- **foot lift peaks at 0.338 and returns to 0** — the foot leaves the ground and lands

**No arbitrary realism threshold is claimed.** The phasing claim is the comparison of the two curves.

## 5. A THIRD DEFECT FOUND BY LOOKING

**The figure rendered as a uniform `#` mass with no contour line.** The human recognition grammar established
in Phase 3.1 is **SILHOUETTE + NEGATIVE SPACE**, and it draws the boundary as `|` against a `#` interior.
`drawBody` marked everything `#`, so the head's yaw-dependent narrowing was **present in the geometry and
invisible in the image**.

The body is now collected into a cell set and written in a **second pass**, so a cell knows whether it has an
unoccupied 4-neighbour — the same morphological boundary rule the rest of this project uses. **No tolerance,
no threshold.** Glyph churn rose from 81 to **5 728** on the full performance as the contour became visible.

## 6. THE THREE TESTS

They are **not competing variants** — each isolates one perceptual question, using the frozen `P1` timing.

| test | duration | what it isolates |
|---|---|---|
| **N — notice-only** | 5 s | *can an observer perceive a shift of attention?* Head turns, torso follows, holds. **No step, no reach.** |
| **W — step-only** | 5 s | *does it read as a step rather than sliding or splitting?* Already oriented. **No notice, no reach.** |
| **NW — full-performance** | 9 s | the complete sequence with both repairs |

**The notice test uses a stretched window.** ⚠ Its first version reused the full-performance window and
therefore finished at 33% of its own clip — the clip was 5 s and the notice occupied 1.6 s of it. **Stretching
the window does not retune the mechanism**; it gives the mechanism a clip in which it can be seen at all.

## 7. MACHINE GATES

| gate | notice | step | full |
|---|---|---|---|
| unique frame hashes | 32 / 150 | 82 / 150 | **194 / 270** |
| position churn | 66 | 3 884 | 4 393 |
| glyph churn | 81 | 4 949 | 5 728 |
| **head attached every frame** | **true** | **true** | **true** |
| **support foot slip** | **0** | **0** | **0** |
| orientation span | **48°** | — | **48°** |
| torso follows head | **true** | — | **true** |
| hold frames | 29 | — | 29 |
| foot lift max | — | 0.3497 | 0.3498 |
| foot-lift frames | — | 40 | 44 |
| **mid-step lag (foot behind root)** | — | **0.3614** | **0.3633** |
| root jump ratio | — | 0.72 | 1.17 |
| phases reached | — | **all five** | **all five** |

**No pose reset. No NaN. No teleport.** `headAttachedEveryFrame` is the structural check from 3.3H.2, applied
to every frame of all three tests.

### The notice is present in the pixels, measured

The head's own row-width profile, before versus after the orientation:

```
 y=288     taken from x 514..597  ->  x 546..613
 y=252     taken from x 514..597  ->  x 554..621
```

**The silhouette's rows shift and narrow in the rendered image** — the cue is not merely in the geometry.

## 8. EXTERNAL REVIEW PACKAGE — `out/phase33h3/review/`

| clip | resolution | frames | duration |
|---|---|---|---|
| `notice-only.mp4` | 1920×1080 | 150 | 5.000 s |
| `step-only.mp4` | 1920×1080 | 150 | 5.000 s |
| `full-performance.mp4` | 1920×1080 | 270 | 9.000 s |

All silent, static camera, canonical `v4-directional` room, intact NAME, no supernatural transformation.
`out/phase33h3/REVIEW-GUIDE.md` carries the questions and **states that the intended sequence must not be
given to the observer before asking**.

## 9. BODY HIERARCHY / SILHOUETTE STATUS

The six parent/child relationships from 3.3H.2 are unchanged and still anchored. The contour pass is new and
uses the project's existing morphological boundary rule, so **negative space is now visible as a distinct
edge** rather than implied by a filled mass.

## 10. REGRESSIONS

| gate | result |
|---|---|
| body geometry | **11/11** |
| bridge + raster contract | **26/26** |
| composition relations | **31/31** |
| shot grammar | **51/51** |
| causal trace | **42/42** |
| 3.3A temporal baseline | unique hashes 1, cross-run 0 |
| `tsc --noEmit` | clean |
| `verify:claims` | **15/15** |
| `regression:phase1` | **24/24** |
| `regression:phase2` | **6861/6861** |
| `loneliness/grid.bin` | `49b4c86bcbc5677f` — frozen |
| `v4-directional.png` | `c9585c1322e62269` — unchanged |
| `phase33g/final-silent.mp4` | `ab39d78a40e74ba7` — unchanged |
| `phase33h/P1-serial.mp4` | `dd0075dacc0596ca` — the frozen winning timing |

## 11. WHAT I AM NOT CLAIMING

**I am not claiming the notice now reads, or that the step now reads.** The head's silhouette measurably
changes, the torso measurably follows, the root measurably lags the foot and the foot measurably leaves the
ground — **all of that is structure, and 3.3H.2 already proved that structural correctness does not imply
perceptual legibility.** The external review is the only thing that can settle it.

**No aesthetic score was invented**, and no threshold was tuned to make a measurement pass.

## 12. STOP CONDITION

**No NAME fragmentation, no room decay, no camera motion, no audio, no music, no SFX, no subtitles.** No
micro-film v2. The three clips isolate perceptual questions and are not a sequence.
