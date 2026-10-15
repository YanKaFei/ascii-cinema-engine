# PHASE 3.3H.4 — TARGETED BLOCKING & GAZE LEGIBILITY

**PHASE 3.3H.4 = EXTERNAL GATE READY.**

**Timing is frozen** (`P1-serial`). This round changed **where** the orientation and the step happen, so that
both express a relationship to the NAME. `PHASE 3.3H` remains PARTIAL until the external review.

---

## 1. THE EXTERNAL FINDING, AND WHAT IT ACTUALLY WAS

> *"THE CHARACTER'S SCREEN-SPACE BLOCKING DOES NOT CLEARLY EXPRESS A RELATIONSHIP TO THE TARGET."*

That diagnosis was correct, and the audit found a concrete cause underneath it:

**The 3.3H.3 notice validated `headYaw` changed — not that the head faced the NAME. The step validated
`rootX` moved 0.420 — a displacement with no direction.**

`rootX` moving 0.420 is compatible with walking toward the target, across it, or away from it. The old
validation could not tell the difference, and neither could the render: the step was **purely lateral**
(`dz = 0`), so it moved right along x and never approached the wall at all.

> **A displacement is meaningless without a direction.**

## 2. TARGET ANCHOR — `src/semantic/target.ts`

`TargetAnchor` carries the NAME's actual world position and extent. Every orient / step / reach decision is now
measured against it. **No target direction is inferred from a generic yaw constant.**

### The yaw is SOLVED, not chosen

| | |
|---|---|
| direction from the start to the NAME | `(x 0.907, z −0.420)` — mostly **lateral**, and *away* from the camera in z |
| **yaw that faces it, solved** | **65.15°** |
| yaw used in 3.3H.3 | **48°** — a constant that happened to look right |

**The facing convention was wrong in the first version and is fixed once, here.** Under
`facing(y) = (sin y, cos y)` the solved yaw came out at **114.85°**, which faces the opposite z half-plane:
the head would have been declared *"facing the target"* while pointing **away from the wall**. With
`facing(y) = (sin y, −cos y)` the solved yaw is **65.15°** and the dot product with the true direction is
**1.000000**.

`facingErrorDeg()` is now monotone and zero at the target:

```
yaw   0 -> 65.15 deg error
yaw  30 -> 35.15
yaw  45 -> 20.15
yaw  65.15 ->  0.00     <- the NAME
yaw  90 -> 24.85
```

## 3. BLOCKING TRACE — `out/phase33h4/blocking-trace.json`

Per frame, for all three tests: body floor position, head world position, head yaw, torso yaw,
**facing error to the NAME**, **floor distance to the NAME**, **step alignment**, projected height, foot
separation in **world and screen** space, arm, step phase, moving-foot lift, head attachment.

**`out/phase33h4/BLOCKING-DIAGRAM.md`** renders the floor plane from above — camera, person start, person
end, NAME plane, step vector, and the straight line from start to the NAME. **The step vector and the
start→NAME vector coincide.** The diagram makes it immediately obvious that the 3.3H.3 step went **across**
the shot while the 3.3H.4 step goes **at the target**.

## 4. STEP DIRECTION

| | 3.3H.3 | **3.3H.4** |
|---|---|---|
| step vector | `(dx 0.420, dz 0.000)` | `(dx 0.381, dz −0.176)` |
| direction to the NAME | `(0.907, −0.420)` | `(0.907, −0.420)` |
| **alignment (cosine)** | 0.907 | **1.0000** |
| moves toward the wall in z? | **no — dz = 0** | **yes** |

The endpoint is **derived by `stepToward()`**, so the alignment is **exactly 1.0 by construction** rather than
by tuning. Distance reduction: **0.420 world units**.

## 5. CAMERA RELATION

The step moves **away** from the camera in z (`−0.20 → −0.377`), not toward it. **The 3.3H.3 step was purely
lateral and never changed depth at all.**

## 6. SCREEN SCALE TRACE — the *"person becomes much larger"* complaint, measured

| test | projected height start | end | ratio |
|---|---|---|---|
| notice-only-v2 | 687 px | 687 px | **1.0000** |
| step-only-v2 | 687 px | 595 px | **0.8651** |
| full-performance-v2 | 687 px | 595 px | **0.8651** |

**The figure does not grow — it gets 13.5% SMALLER**, because the step now moves *away* from the camera.

**The 3.3H.3 figure did not grow either**: its projected height was constant at 687.2 px, since it stayed at a
constant depth. **So the reported size increase was not a scale change.** §8 forbids fixing scale directly and
none was needed — the perception came from the **stance**, which is audited next.

## 7. THE SPLIT STANCE — cause found, by measuring rather than tuning

### Two earlier stance models were wrong, and both produced the defect

| version | what it did | measured separation |
|---|---|---|
| **v1** | feet authored as **absolute x** while the pelvis followed `bodyCentre`; the pelvis moved 0.420 and the rear foot never followed | **2.91× start** |
| **v2** | feet relative to the body, but sized by `stanceWidth × 3.5 = 0.40` while the body travelled 0.42 — a step length apart **in a different sense** | **1.99×** |
| **v3 (here)** | the two feet are placed at **the step's own start and end points**, offset laterally by the stance half-width | **2.04×** |

**v3 is geometrically correct and the remaining ~2× is inherent**: the feet are one step length apart at
mid-step because **the body is one step length from where it started**. A 0.42 step *is* a 2× foot separation.
The report therefore records the cause and **does not reduce step width to make a number smaller** — §11
explicitly forbids that.

**What v1 and v2 genuinely fixed**, and v3 keeps: the feet are now **coherent with the pelvis** — they are
placed relative to the body's own path, not to fixed world coordinates — so the legs are never stretched
between a moving pelvis and an abandoned foot.

## 8. NOTICE V2 — a relational event

The head yaw is now interpolated from a rest pose that is **clearly not target-directed** (`−28°`) toward the
**solved** target yaw (`65.15°`), with the torso following at 35% of it.

| test | facing error start | **min** | end |
|---|---|---|---|
| notice-only-v2 | **94.11°** | **0.222°** | 2.08° |
| full-performance-v2 | **94.11°** | **0.126°** | 3.663° |

**A 94° facing error becomes 0.2°** — the head genuinely comes to face the NAME, and the residual 2–4° is the
head's own position moving as the body steps, which is the correct behaviour.

**The notice no longer passes because the head *changed shape*; it passes because the head's facing direction
became aligned with the NAME**, and that is what the trace reports.

## 9. MACHINE REPORT

| test | unique hashes | position churn | glyph churn | head attached | phases |
|---|---|---|---|---|---|
| notice-only-v2 | 37 / 150 | 66 | 81 | **every frame** | — |
| step-only-v2 | 52 / 150 | 3 796 | 4 715 | **every frame** | **all five** |
| full-performance-v2 | **196 / 270** | 4 273 | 5 493 | **every frame** | **all five** |

**The weight model is preserved**: `WEIGHT_TRANSFER → FOOT_LIFT → FOOT_TRAVEL → CONTACT → SETTLE`, root lag,
pelvis shift, foot arc, support-foot planting — **all five phases reached in both step tests**, and the
support foot does not slip.

**No score is produced.** §17 asks for the components, and they are all in `blocking-trace.json`.

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
| `phase33h/P1-serial.mp4` | `dd0075dacc0596ca` — the frozen timing baseline |

## 11. REVIEW PACKAGE — `out/phase33h4/review/`

| clip | frames | duration |
|---|---|---|
| `notice-only-v2.mp4` | 150 | 5.000 s |
| `step-only-v2.mp4` | 150 | 5.000 s |
| `full-performance-v2.mp4` | 270 | 9.000 s |

All 1920×1080, silent, **static camera**, canonical `v4-directional` room, intact NAME.

**Questions:** NOTICE *"What changed about the person's attention?"* · STEP *"Where does the person move, and
how?"* · FULL *"Describe what happens from beginning to end."* `REVIEW-GUIDE.md` forbids stating the intended
sequence before asking.

**No cinematic help was used** — no camera push, follow, cut, close-up, sound or subtitle.

## 12. §19 — THIS IS THE FINAL PERFORMANCE LAB ROUND

**If 3.3H.4 fails, I will not open a 3.3H.5.** The protocol from here is the one the brief specifies:

- **record the unresolved abstraction limit** of the current human representation, and
- take an explicit design decision — **A: accept stylised limited performance**, or **B: redesign the human
  representation as a separate subsystem.**

**My assessment, offered as a judgement rather than a measurement:** the target relationship is now correct
and *measurably* correct — alignment 1.0000, facing error 94° → 0.2°. What remains unresolved is whether an
**abstract disc-and-capsule figure with no face** can express *directed attention* at all, given that the only
cues available are silhouette foreshortening and a facing protrusion. **That is a representational question,
not a blocking or timing question, and it is the one I would put to the external review explicitly.**

**No threshold was invented and no metric was tuned to pass.** Where a measurement still looks wrong — the
2× foot separation — the **cause is recorded and the geometry is not shrunk to hide it.**
