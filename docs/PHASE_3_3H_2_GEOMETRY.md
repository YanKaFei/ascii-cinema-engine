# PHASE 3.3H.2 — PERFORMANCE GEOMETRY + EXTERNAL GATE

**PHASE 3.3H.2 = EXTERNAL GATE READY.**

The body-geometry defect is repaired **structurally**, and the machine gates pass. **PHASE 3.3H remains
PARTIAL** until an external observer can compare P1/P2/P3.

---

## 1. HEAD-NECK FIX — structural, not a screen offset

**The defect.** The performer displaced the head laterally by `sin(headTurn) * height * 0.30` while the neck
was drawn as a vertical box at the **unshifted root x**. At maximum head turn the head left the body.

**The cause was structural:** *the head was positioned relative to the world/root, not to a neck anchor.* A
screen-space offset would have hidden the symptom and left the cause in place, which the brief forbids.

### `src/semantic/body.ts` — the parent/child hierarchy

```
root -> pelvis -> torso -> shoulder -> neck -> head
                      |
                      +-> arm (from its own shoulder)
pelvis -> leg -> foot
```

**No joint reads the root except the root.** Each is computed in world space from its parent, and the chain is
projected **after** it is built, so projection cannot break it.

**The head's travel is derived from the attachment criterion, not chosen.** The criterion is that the head's
disc must overlap `neckTop`. With a rise of `headR * 0.35`:

```
horizontal <= headR * sqrt(1 - 0.35^2)     ->    0.0988 world units at 1.6 height
```

The first version used a hand-picked `headR * 1.15`, which **detached at 90 degrees**. The check found it
because it asks a structural question instead of applying a tuned tolerance.

**Strict overlap, not tangency.** `gap <= 0` accepted a gap of exactly zero, and **12 of 657 swept poses**
landed exactly on that boundary — tangent, which on an integer lattice can quantise to two components. The
bound is now `0.995` of the budget and the criterion is `gap < 0`.

| sweep | result |
|---|---|
| 1 825 poses (yaw −180..180, 5 torso yaws, 5 heights) | **0 detached** |
| worst gap | **−0.000218** — strictly overlapping |

## 2. BODY HIERARCHY STATUS

| relationship | status |
|---|---|
| head ↔ neck | **anchored** — head placed from `neckTop`, travel bounded by the attachment criterion |
| neck ↔ torso | **anchored** — neck inherits the torso's yaw and follows it |
| shoulder ↔ reaching arm | **anchored** — the arm is drawn from its own projected shoulder point, never from the root |
| pelvis ↔ legs | **anchored** — each leg runs from the pelvis to **its own foot** |
| moving foot ↔ moving leg | **anchored** — one leg per foot, drawn to that foot's position |
| support foot ↔ support leg | **anchored** — the planted foot's leg is drawn to the planted position |

**No redesign of anything already stable.** `oneStep()`, lead/follow, holds, step and reach distances and
total duration are **untouched**.

## 3. RASTER CONNECTION CHECK — the connection survives the lattice

A **structural** criterion, not a pixel tolerance: the head's projected disc cells and the neck's projected
segment cells must **share a cell** or be **4-adjacent** under the renderer's own rule.

| | |
|---|---|
| frames checked | **810** (270 × 3 variants) |
| head/neck **NOT** connected | **0** |
| connected only by adjacency | **0** |

**Every frame connects by shared cell.** Semantic geometry stays connected and the lattice does not break it.

## 4. A SECOND DEFECT, FOUND BY LOOKING — and then made measurable

The first skeleton version anchored both arms **at the torso's edge**, so the limb capsule merged into the
torso box and the figure rendered as **one solid mass with no arm/body separation** — the pose was continuous
but **no longer read as a person**. §10 requires the arm to remain separable.

**Fix:** anchors moved outward by one shoulder radius so the limb hangs clear along its whole length. The torso
width is untouched.

### §10 measured rather than eyeballed

**The reason this is measured:** in 3.3H I *inspected* the performer and concluded it read as a person. It did
not — the head was detached, and the metric that would have caught it did not exist.

| variant | arm/torso gap present | max | median | leg gap present |
|---|---|---|---|---|
| P1 | **270 / 270** | 21 cells | 3 | **270 / 270** |
| P2 | **270 / 270** | 21 cells | 3 | **270 / 270** |
| P3 | **270 / 270** | 21 cells | 3 | **270 / 270** |

An unoccupied horizontal run exists inside the figure on **every frame**, measured on the figure mask with the
room excluded. `out/phase33h/silhouette-report.json`.

**No arbitrary threshold is claimed.** These are structural counts — an unoccupied run of cells — reported as
measurements, not converted into a pass/fail constant.

## 5. EXTREMA REVIEW SET — `out/phase33h/extrema/`

**24 engineering images** (8 poses × 3 variants), poses located **from the trace, never hardcoded**:

`neutral` · `max-head-turn` · `max-weight-shift` · `mid-step` · `foot-contact` · `post-contact-settle` ·
`max-reach` · `final-hold`

They are written **during the render**, because this ffmpeg build has **no filter support** — extracting from
the h264 would give *approximately* the frame rather than the frame, and the extrema review is precisely about
specific poses.

**Not blind-review assets.**

## 6. P1 / P2 / P3 — after the geometry fix

| variant | unique frame hashes | position churn | glyph churn |
|---|---|---|---|
| **P1-serial** | **146 / 270** | 4 558 | 637 |
| **P2-lead-follow** | **174 / 270** | 4 584 | 651 |
| **P3-lead-follow-holds** | **148 / 270** | 4 563 | 657 |

**The obsolete `asciiChurnCells` is not used anywhere.** Position churn and glyph substitution are reported
separately by `churnBetween`.

## 7. FOOT CONTACT / ROOT CONTINUITY / HAND TRAJECTORY

| gate | P1 | P2 | P3 |
|---|---|---|---|
| contact frames | 4 | **6** | **6** |
| **foot slip (planted foot)** | **0** | **0** | **0** |
| root jump ratio | 2.00 | 2.01 | 2.00 |
| root travel | 0.420 | 0.420 | 0.420 |
| moving-foot travel | **0.420** | **0.420** | **0.420** |
| planted-foot travel | **0.000** | **0.000** | **0.000** |
| hand→NAME | 1.050 → 0.190 | 1.050 → 0.190 | 1.050 → 0.190 |
| hand→NAME reversals | **0** | **0** | **0** |

**Foot travel corresponds exactly to body displacement** (0.420 both), and the planted foot does not move at
all. **No unexplained pose reset. No NaN.**

## 8. CANONICAL ROOM STATUS — ACTIVE

**`v4-directional` with its plane fill and plane-specific stroke directions**, exactly as frozen by the Phase
3.2B external gate. **Not** the outline-only debug mode. Human motion remains visible against it — position
churn of 4 558–4 584 cells per variant is motion the canonical room does not hide.

## 9. BLIND PACKAGE — `out/phase33h/blind-review/`

| clip | sha256 | bytes |
|---|---|---|
| `clip-01.mp4` | `be0ad9f2759eff87…` | 602 959 |
| `clip-02.mp4` | `dd0075dacc0596ca…` | 592 288 |
| `clip-03.mp4` | `be0ad9f2759eff87…` → `763d5abeb5514dcc…` | 596 491 |

**3/3 distinct**, randomised mapping, all 1920×1080, **270 frames, 9.000 s, silent, static camera, intact NAME
and room, no supernatural transformation.**
Key at `out/phase33h/BLIND-ANSWER-KEY.json`, **outside the folder**. No SERIAL / LEAD-FOLLOW / HOLDS anywhere
in it.

## 10. MACHINE GATES

| gate | result |
|---|---|
| motion reaches line grid | **PASS** — 146–174 unique hashes of 270 |
| motion reaches raster | **PASS** |
| no NaN / invalid geometry | **PASS** |
| no unexplained pose reset | **PASS** |
| **no detached head** | **PASS** — 0 of 1 825 swept poses; 0 of 810 rendered frames |
| no detached limb from hierarchy failure | **PASS** — all six relationships anchored |
| support foot slip | **0** |
| root trajectory continuous | **PASS** — jump ratio 2.00, within smooth easing |
| hand-to-NAME monotonic during reach | **PASS** — 0 reversals |
| foot travel corresponds to body displacement | **PASS** — 0.420 = 0.420 |
| canonical room unchanged | **PASS** |

## 11. THE 3.3H.1 LESSON — preserved, unrewritten

**`drawBody` did not provide its own glyph, so moving body cells inherited existing room characters.**

This was an **inert-mechanism-class defect**: the semantic state changed and the visible representation did not.
`write()` fell back to the cell's existing character when `ch` was undefined, and `drawRoom` had already placed
`+` marks where the figure stood — so the figure became 939 identical `+` cells that moved without changing a
single rendered pixel.

**The render bridge itself was correct.** `fieldToLines` faithfully serialised a field whose glyphs were
already wrong. **The consumer input was wrong.** This is **not** recorded as a `fieldToLines` defect and must
not be rewritten as one.

**Fifth inert-mechanism-class defect in this project.** Same pattern every time: *a value written but never
reaching its consumer, while the code reads as though it does.*

## 12. REGRESSIONS

| gate | result |
|---|---|
| bridge + raster contract | **26/26** |
| **body geometry** | **11/11** |
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

## 13. WHAT I AM NOT CLAIMING

**I am not claiming the figure reads as human.** I looked at the extrema frames and the figure carries much more
ink than the Phase 3.1 figure did — head, neck, torso, arms and legs are present and structurally connected,
but whether that reads as *a person performing* rather than *a connected mass* is **exactly the question the
external review exists to answer**, and this project has recorded four separate occasions where I judged
readability by eye and was wrong.

**No aesthetic threshold was invented.** The negative-space numbers are reported as measurements; no constant
was chosen to make them pass.

## 14. STOP CONDITION

**No walking, no camera movement, no NAME fragmentation, no room decay, no new ASCII motion grammar, no audio.**
The experiment remains `P1 = serial` vs `P2 = lead/follow` vs `P3 = lead/follow + holds`, with **only geometry
changed**, identically across all three.
