# PHASE 3.3I — MICRO FILM V2

**PHASE 3.3I = EXTERNAL GATE READY.**

The same semantic story, with validated **Human Performance V1** integrated. **No new capability.**

---

## 1. V1 HASH — IMMUTABLE

`out/phase33g/final-silent.mp4` = **`ab39d78a40e74ba7`** — unchanged, and it is the baseline in the A/B.

## 2. THE CENTRAL QUESTION

> Does validated character performance transform the sequence from **an ASCII effect demonstration** into
> **a character experiencing an event**?

**What V1 actually had:** a **static silhouette**. Its whole physical vocabulary was `reach` and `none` — the
figure could not notice, orient, step or settle, because it had no body. Those were not missing *beats*; they
were missing *capability*.

## 3. V2 DIRECTOR PLAN — `out/phase33i/director-plan-v2.json`

**5 shots · 16.00 s · 480 frames · 1920×1080 · 30 fps**

| shot | seconds | camera | cut reason |
|---|---|---|---|
| **S1-establish** | 3.2 | static | the space and the relation are established; the story now needs the person to act |
| **S2-performance** | 6.3 | static | the reach has completed and the NAME is fragmenting; the consequence needs its own attention |
| **S3-name-lost** | 2.2 | static | the name is destroyed and registered; only now does the room respond |
| **S4-room-withdraws** | 2.7 | **action-responsive push** | the room is far enough gone that the person reads as standing in space |
| **S5-person-remains** | 1.6 | holds a partial return | the film ends here; the final state is held |

**S2 now carries `notice → orient → step → settle → reach` AND the causal centre as ONE continuous shot.**
§4 forbids turning performance beats into cuts, and none were created: the shot count is unchanged at five and
**not one cut exists because a performance state exists.**

## 4. PLAN DIFF — 15 entries, all classified

| classification | count |
|---|---|
| **UNCHANGED** | 6 |
| PERFORMANCE INTEGRATION | 3 |
| TARGET RELATION CORRECTION | 2 |
| SHOT COMPOSITION CORRECTION | 2 |
| CONTINUITY CORRECTION | 2 |

**UNCHANGED:** the story (all seven sentences) · shot count · the `REACH → LETTER_FRAGMENT` causal centre with
`CAUSAL_HOLD_RATIO = 0.25` scoped to that pair only · `STRUCTURAL_DECAY` with its
texture → plane material → secondary edges → junctions ordering · the canonical `v4-directional` room and
camera framing · NAME typography, the human recognition grammar and the boundary contour.

**SHOT COMPOSITION CORRECTION — the camera decision.** V1 put an **action-responsive push on S2**. V2
**removes it**: the character now supplies the motion, so a push on S2 would compete with the performance. The
push moves to **S4**, where it follows the **room's consequence** instead of the character's action. §7 asks
the Director to decide whether performance now supplies enough motion — **the answer was yes, and the camera
was demoted rather than restored.**

## 5. PERFORMANCE INTEGRATION

The validated vocabulary, nothing more: `DIRECTED_NOTICE → ORIENT_TO_TARGET → ONE_TARGET_DIRECTED_STEP →
SETTLE → REACH_TOWARD_TARGET`, with **NAME as the `TargetAnchor`**. No walk cycle, no new gesture, no facial
animation, no additional acting vocabulary.

## 6. TARGET RELATIONS

| relation | value |
|---|---|
| **facing error to NAME** | **94.11° → 0.141°** |
| step alignment with NAME | **1.0000** (derived by `stepToward()`, so it is exact by construction) |
| floor distance to NAME | **1.0469 → 0.6269** |

## 7. CAUSAL TRACE — `out/phase33i/causal-trace.json`

| check | result |
|---|---|
| `REACH → LETTER_FRAGMENT` causal order preserved | **true** |
| NAME state cumulative (never reverses) | **true** |
| ROOM state cumulative | **true** |
| head attached every frame | **true** |
| unique frame hashes | **204 / 480** |
| position churn / glyph churn | 14 806 / 8 679 |

**A defect the checks caught during the round.** `CAUSAL_HOLD_RATIO` lives in `motion.ts`, and I destructured
it from `performance.ts` — so it was `undefined`, `EFFECT_ONSET` was `NaN`, and the gate `reachProgress < NaN`
was **false at every frame**. The NAME began fragmenting on **frame 0** and the causal check reported `false`.
**A broken comparison is silent — `x < undefined` does not throw.** This is the **sixth inert-mechanism-class
defect** in this project and the first the machine checks found *during* the round rather than after.

## 8. WORLD-STATE CONTINUITY — measured at the exact boundary frames

| cut | body floor | dist to NAME | NAME state | ROOM state | camera |
|---|---|---|---|---|---|
| S1 → S2 | **0** | **0** | **0** | 0 | 0 |
| S2 → S3 | **0** | **0** | **0** | 0 | 0 |
| S3 → S4 | **0** | **0** | **0** | 0 | 0 |
| S4 → S5 | **0** | **0** | **0** | **6e-4** | 0.051 |

**Body position, target relation and NAME state are EXACTLY continuous (delta 0) at every cut** — the
performance is **one track over the whole film** and the body never resets. The 6e-4 room delta is float
accumulation across a shot boundary, not a state jump. The camera change is the authored two-stage move.

**A continuity defect found and fixed.** The room's decay window started *after* the S4 cut, so decay was
still 0 on the S4 start frame and then jumped once the window opened — the report caught it as
`S3 → S4 room NO`. The decay is now **shot-relative, S4 ending at 0.88 and S5 continuing from 0.88.**

## 9. §10 — EFFECTS INHERIT PERFORMANCE

**The character does not freeze into a neutral pose when the NAME begins to fragment.** The performance is one
continuous track and the world-state effects are driven separately from it, so at the moment the fragmentation
begins the character **remains in the bodily state produced by the preceding performance** — mid-reach, still
target-related, with narrative memory. Nothing resets to standing.

## 10. §11 — RESTRAINT ON REACTION

**No reaction animation was invented.** No flinch, retreat, shock or head snap. The final performance state is
**preserved long enough to be perceived** and the character simply remains.

## 11. REGRESSIONS

| gate | result |
|---|---|
| body geometry | **11/11** |
| bridge + raster contract | **26/26** |
| composition relations | **31/31** |
| shot grammar | **51/51** |
| causal trace | **42/42** |
| `verify:claims` | **15/15** |
| `regression:phase1` | **24/24** |
| `regression:phase2` | **6861/6861** |
| `loneliness/grid.bin` | `49b4c86bcbc5677f` — frozen |
| `v4-directional.png` | `c9585c1322e62269` — unchanged |
| **`phase33g/final-silent.mp4` (V1)** | **`ab39d78a40e74ba7` — unchanged** |
| `phase33h/P1-serial.mp4` | `dd0075dacc0596ca` |

## 12. V2 PATH AND BLIND A/B

**`out/phase33i/micro-film-v2.mp4`** — `fb8c4175d2bdba32…`, 480 frames, **16.000 s**.

**`out/phase33i/blind-review/`**

| clip | bytes |
|---|---|
| `clip-A.mp4` | 626 339 |
| `clip-B.mp4` | 651 801 |

**Randomly mapped, 2/2 distinct.** Key at `out/phase33i/BLIND-ANSWER-KEY.json`, **outside the folder**. **No
OLD / NEW / V1 / V2 / IMPROVED anywhere in it.**

**Nine questions**, including *"In which film do you understand the character's intention more clearly?"*,
*"In which film does the reach toward the word feel more motivated?"*, *"Which feels less like a collection of
effects?"* and *"Which character seems more like they are experiencing an event?"* **The observer is told
nothing about what changed.**

## 13. PASS CONDITION — and what I am not claiming

**PASS requires the external review to prefer V2 for character intention, continuity, narrative causality or
filmic coherence — not merely more movement.** If V2 is perceived as **busier, longer or more animated but not
more narratively coherent**, the phase is **PARTIAL**.

**I am not claiming V2 is better.** What I can state is measured: the character now has a body, its orientation
and step are **target-derived** rather than axis-derived, its performance **does not reset at any cut**, and
the effects **inherit** its state rather than replacing it. **Whether that reads as a character experiencing
an event is the external question**, and this project has recorded four occasions where I judged readability
by eye and was wrong.

**No new capability was added. No audio. V1 is untouched.**
