# PHASE 3.3 CLOSEOUT

**Scope:** PHASE 3.3A → 3.3I. History is **recorded, not rewritten** — failures and retractions stand as they
were reported at the time.

**Protocol note, recorded up front:** the 3.3I V1/V2 comparison was **NOT a formally clean blind A/B.** The
reviewer knew the durations from a prior engineering report, and **`clip-A = 14.033 s`, `clip-B = 16.000 s`
leak the mapping without opening the key.** It is recorded as an **EXTERNAL DIRECTORIAL A/B REVIEW.** For
future strict blind tests: an observer without prior metadata, or leak-free packaging.

---

## 1. Phase-by-phase

| phase | what it established | external status |
|---|---|---|
| **3.3A** | **zero-churn temporal baseline** — 150 static frames, 1 unique hash, 0 cell/pixel churn, 0 cross-run mismatch | — |
| **3.3B** | **camera motion** — a solved push-in; 0 clipping failures, 0 invalid anchors, monotone back-wall expansion | **PASS**; the external review found it reads as *"a static ASCII image + a camera push"* → **motion-language failure** |
| **3.3C** | **ASCII Motion Language** — 13 prototypes, 7 grammar primitives, blind-tiered | **PARTIAL** — 4 canonical expressions, 4 supporting, 5 utility |
| **3.3D** | **causal composition** — `REACH → LETTER_FRAGMENT` | **PASS** — LATE (10-frame hold) strongest |
| **3.3E** | **camera motivation** — `ACTION_RESPONSIVE` | **PASS** — VERSION B won; VERSION A a valid anticipatory alternative |
| **3.3F** | **Shot Grammar** — `ShotIntent`, `CameraMotivation`, attention hierarchy, restraint, 6 fixtures | **PASS** |
| **3.3G** | **first multi-shot micro film** — 5 shots, 14.033 s | **PASS** |
| **3.3H** | **Human Performance V1** — body hierarchy, target-directed notice/step/reach | **PASS**, after 3.3H.1–3.3H.4 |
| **3.3I** | **performance-integrated Micro Film V2** — 5 shots, 16.000 s | **PASS** |

## 2. The external failures, recorded as they happened

- **3.3B** — every machine check passed and the external review found it **does not feel like ASCII
  animation**: *"a static ASCII-styled image plus a camera push."* **A motion-language failure, not a renderer
  failure.**
- **3.3C** — the hypothesis that contour migration or trail/decay would make translation feel intrinsically
  ASCII was **refuted**. A1/A2/A3 all landed in **utility**.
- **3.3H** — the figure read as **static pose → another pose**, and the phase resolved only through four
  sub-rounds. 3.3H.3's notice was **FAIL**, its step **FAIL**. 3.3H.4 fixed both by correcting the **spatial
  blocking**.
- **3.3I** — the external result was positive, but **the A/B was not clean**, and that is recorded as a
  **methodological** failure rather than passed over.

## 3. Inert-mechanism-class defects — SIX, and they are the most transferable result

**The pattern is identical every time: a value is written but never reaches its consumer, while the code reads
as though it does.**

| # | defect | how it was caught |
|---|---|---|
| 1 | **`objectInk` never called on the native path** — `opacity` and `lifetime` were inert | printing `objects[0].opacity` for three values |
| 2 | **`prominence` dropped by `roomForm`/`humanForm`** — zero effect; `tsc` passed | printing the value |
| 3 | **`wordForm` compiled to 0 objects** — `compileForm` never called `letterformObjects` | counting objects |
| 4 | **A2's contour path was unreachable** — `markContour` wrote at priority 80 against a base fill at 100, so every write was rejected and A2 was **byte-identical to A1** | a **duplicate-hash** check |
| 5 | **`drawBody` wrote no glyph of its own** — moving body cells inherited the room's `+`, so the figure was 939 identical cells and **the raster was byte-identical on every frame** | printing the **glyph census** |
| 6 | **`CAUSAL_HOLD_RATIO` destructured from the wrong module** — it was `undefined`, `EFFECT_ONSET` was `NaN`, and `x < NaN` is **false at every frame**, so the NAME fragmented from frame 0 | the causal-ordering check |

**Three of the six were found by printing a value or looking at an image. Two by a hash comparison. One — #6 —
was the first the machine checks caught *during* the round rather than after, and only because a check existed
that asked the ordering question.** A broken comparison is silent: `x < undefined` does not throw.

## 4. Metrics removed because they measured the wrong property

**Fourth and fifth instances of the same failure mode: a metric whose name did not describe its measurement.**
Two of them made **correct behaviour look broken.**

| metric | what it claimed | what it actually did | fate |
|---|---|---|---|
| **`asciiChurnCells`** | character churn | compared **character values only** — read **0** while the figure moved with the same glyph, and **748** while the rendered image was **byte-identical every frame** | **deleted**, not renamed |
| **`nameCellsDrawn`** | NAME cells drawn | keyed on `source === 'substitution'`, which `roomDraw` also uses for **plane texture** — reported 77 "name" cells on a frame where the name was **fully erased** | fixed to count **by where it is** |
| **foot-slip counter** | foot slip | checked the **support** foot — but *support* means weight is over it, **not that it is planted** — so it flagged the step itself as a defect, 26–31 times | corrected to the planted foot |
| **`armExtensionPx`** | arm extension | shoulder-to-hand screen distance **shrinks then grows** as an arm extends toward the camera; read **18 "reversals" in a monotone motion** | replaced with hand-to-target distance |
| **a made-up `< 0.02` threshold** | discontinuity | **I invented it**; every smooth variant "failed" it | replaced with a **relative** ratio |

**A sixth**: an "invented 10% lattice-coincidence threshold" failed at 14%, and the honest resolution was to
**remove the rule** rather than tune it — **tuning a check to its result is fitting, not measuring.**

## 5. Validated mechanisms and capabilities

**Recognition grammar, frozen:** HUMAN = **silhouette + negative space** · TEXT = **letter topology** ·
ARCHITECTURE = **perspective topology + junction continuity + plane contrast + form-specific ASCII material**.

**Frozen subsystems:** world-space semantic forms · camera-space near clipping → projection → viewport
clipping → rasterisation · `v4-directional` architecture · `TargetAnchor` and target-directed actions ·
body hierarchy · boundary contour · weight-transfer one-step · root/foot phasing · `ExposureIntent` · SceneIR
semantic routing · collision audit · junction priority hierarchy.

**Certified capabilities:** short-form stylised ASCII narrative for a constrained vocabulary — recognisable
subject · recognisable architecture · diegetic text · target-directed attention · one target-directed step ·
reach · causal ASCII expression · structural environmental consequence · motivated camera · multi-shot
continuity.

**`HUMAN REPRESENTATION V1 = VALIDATED FOR STYLISED LIMITED PERFORMANCE.`** Validated vocabulary: `STAND`,
`DIRECTED_NOTICE`, `ORIENT_TO_TARGET`, `ONE_TARGET_DIRECTED_STEP`, `SETTLE`, `REACH`.

## 6. Scope limitations — NOT validated

- naturalistic acting · realistic locomotion · **full walking** · running · facial acting · subtle emotional
  acting · multi-person acting · complex gesture systems
- **Known aesthetic limitation, accepted:** motion remains visibly **puppet-like / abstract**. Frozen.
- **`P1-serial` does not generalise.** For *this* low-resolution abstract performer, clear temporal separation
  beat the tested lead/follow variants. **Future human representations may behave differently.**
- The mid-step foot separation is **~2× the starting stance and is inherent to a 0.42 step.** Recorded, not
  hidden.
- **`skeletonComponents = 100`** remains non-blocking diagnostic debt.

## 7. THE ARCHITECTURAL RESULT

```
STORY / DIRECTOR BRIEF
  → SEMANTIC EVENT
  → DRAMATIC INTENTION
  → TARGET
  → PERFORMANCE
  → COMPOSITION RELATION
  → ASCII EXPRESSION
  → CAUSAL TIMING
  → CAMERA MOTIVATION
  → SHOT COMPOSITION
  → EDIT CONTINUITY
  → RENDER
```

### And the principle that produced it — `NARRATIVE MOTION IS RELATIONAL`

Prefer **`ORIENT_TOWARD(target)` · `STEP_TOWARD(target)` · `REACH_TOWARD(target)`** over **`TURN(angle)` ·
`MOVE(distance)` · `REACH(progress)`**.

**Why, in one measurement:** the 3.3H.3 step validated `rootX` moved **0.420**. It was **purely lateral**
(`dz = 0`) and never approached the wall at all. **`rootX` moving 0.420 is compatible with walking toward the
target, across it, or away from it** — and the validation could not tell the difference. *A displacement is
meaningless without a direction.*

## 8. Camera motivation audit — S4 (the recorded open item)

**AUDIT 1 — the declaration.** `director-plan-v2.json` records S4 as
`{shot, startFrame, endFrame, seconds, reason}`. **A `CameraIntent` object does not exist for S4** — the camera
is authored in `scripts/phase33i-film.mjs` as a bare `cam:(u)=>...` function with **no `move`, no
`motivation`, no `beginsAtActionProgress`.** **`validateCameraIntent` was never called.**

**AUDIT 2 — the exact onset.** First moving frame **372** (`camZ 0.93143`), at **local u = 0.25 of S4**. At
that frame: **`roomDecay = 0.0399`** (the room consequence, just begun) while **`reachProgress = 1`** and
**`stepProgress = 1`**. **The reach completed at frame 281; S4 begins at frame 351. There is no physical
action in S4 and none in progress.**

**AUDIT 3 — the validator.** Given the intent as authored in prose
(`action-responsive`, `beginsAtActionProgress: 0.0399`) it returns **ACCEPTED** — and it returns **ACCEPTED for
`consequence-responsive` with the same field.** **The two motivations are indistinguishable to
`validateCameraIntent`.** The check that exists is *"action-responsive requires an onset"*, which tests that a
number is **declared**, not that a legible physical action **exists** in the shot. **`consequence-responsive` is
not required to declare anything at all.**

### Verdict

| outcome | verdict |
|---|---|
| **A** — camera behaviour correct, metadata label wrong | **CONFIRMED** — the camera is **consequence-responsive** |
| **B** — the validator allows an invalid action-responsive declaration | **CONFIRMED, and worse than stated**: validator **was never invoked**, and **cannot distinguish the two motivations** even when it is |
| **C** — a qualifying physical action exists in S4 | **REFUTED** — no physical action is present or in progress |

**Recorded as A + B.** Outcome C is refuted by the trace.

**A regression test is added** (`tests/motion/shot-grammar.test.mjs`, *CAMERA MOTIVATION — the S4 AUDIT*,
5 assertions) that **pins the gap** so it cannot silently close or widen unnoticed.

**No engine change was made.** The brief permits documentation and test changes and forbids altering the
rendered V2; the camera's **rendered behaviour is correct**, only its label is wrong. **A real fix requires
`consequence-responsive` to declare a consequence landmark so an action-motivated onset cannot satisfy it** —
recorded as open debt, not implemented.

## 9. FROZEN ARTEFACT HASHES

| artefact | sha256 |
|---|---|
| `out/loneliness/grid.bin` — **Phase 1** | `49b4c86bcbc5677f5d02eb1012087aa4301615aca289b8d02c58a7cb974757e8` |
| `out/phase32b/variants/v4-directional.png` — **canonical architecture** | `c9585c1322e622692890ab712275e31d08b40be4fec84ddb952418097c380047` |
| `out/phase33a/control-static.mp4` | `52172069e49cb9f3…` |
| `out/phase33b/camera-push.mp4` | `a3917f991d571d43…` |
| `out/phase33d/causal-late.mp4` — causal winner | `1392f5b6567fce77…` |
| `out/phase33e/version-B.mp4` — camera winner | `346c81d19ba8df8e…` |
| `out/phase33e/version-A.mp4` | `e663d35ce7a60561…` |
| `out/phase33e/static-camera-control.mp4` | `7e7b29ca2ccb99b3…` |
| `out/phase33g/final-silent.mp4` — **Micro Film V1** | `ab39d78a40e74ba7…` |
| `out/phase33h/P1-serial.mp4` — winning timing | `dd0075dacc0596ca…` |
| `out/phase33i/micro-film-v2.mp4` — **Micro Film V2** | `fb8c4175d2bdba32…` |

**`out/phase33g/rough-cut.mp4` was OVERWRITTEN, not preserved.** Its first version (hash `f8cf80ec80337a28`,
with `frag` and `decay` running backwards at two cuts) was replaced at the same path. **Its only record is the
hash and the description of its defects.** Not reconstructed. **Procedural lesson: a rough cut that is evidence
of a failure should be written to a distinct path before it is fixed.**

## 10. OPEN TECHNICAL DEBT

1. **`consequence-responsive` has no landmark requirement** and is indistinguishable from `action-responsive`
   to the validator. **The S4 audit's real fix.**
2. **Films bypass the Shot Grammar.** V2 authored its camera as a bare function, so **the grammar's camera
   validation never ran on the actual film.** A planning model that is not wired into the render path prevents
   nothing — the same lesson as the collision audit and the inert contour mechanism.
3. **`skeletonComponents = 100`** — non-blocking; revisit only on a visible temporal failure.
4. **Mid-step foot separation ~2×** — inherent to the step distance, recorded.
5. **`npm run verify:claims` has no `AsciiObject` field-coverage check** — a recorded gap that allowed
   inert-field defects 1–3 to survive.
6. **The A/B packaging leaked duration.** Future blind tests need leak-free packaging or a metadata-naive
   observer.
7. **Motion remains puppet-like** — an accepted representational limit, not a defect to tune.

## 11. What Phase 3.3 does and does not claim

**Claims:** the engine can plan, perform, photograph and cut a **short stylised ASCII narrative** whose event
chain an unprimed observer can recover, using only code-generated glyphs.

**Does not claim:** naturalistic acting · realistic locomotion · cinematic storytelling generally · that any
of the validated constants transport to a different human representation or action class.

**Phase 3.1 remains historically PARTIAL** (failed external recognition). **Not rewritten.** Phase 3.2
superseded it.


---

# ADDENDUM — PHASE 3.3J AND 3.3K

**Prior history above is not rewritten.** This addendum records two phases that closed the debt the closeout
identified.

## 3.3J — the contract

The closeout named the highest-priority debt: **the planning model was not enforced by the film render path.**
A film could contain a bare `cam:(u)=>...` and manual effect onset without passing through `ShotIntent`,
`CameraIntent`, `CausalTimingGrammar` or `CameraMotivation` validation. The 3.3I audit confirmed it —
`validateCameraIntent` **was never called** on the film — and **seven scripts independently reconstructed
`EFFECT_ONSET`**, which is how a `NaN` causal timing reached a film silently.

**3.3J created the enforcement:**

```
ShotIntent → validateShotIntent → compileShotIntent → CompiledShotSpec → guardRenderable → renderShot
```

- **`CameraIntent.respondsTo`** — a moving camera must **name the event it responds to**, with a landmark; the
  two motivations can no longer accept each other's event kind
- **causal timing has one owner**, carrying its `validationScope`
- **world-state continuity is compiled**, with numeric progression so a NAME cannot un-break at a cut
- **finite execution values** — `NaN` is a hard failure with its path named
- **`ConsumptionLedger`** — targets the six inert-mechanism defects directly
- **production bypass audit** — every direct authoring site classified

## 3.3K — the contract drives a real render

**3.3J proved compilation; 3.3K proved execution.** And it first resolved the causal timebase disagreement:

| basis | cause readable | effect onset |
|---|---|---|
| shot span (189 frames) | 158 | 189 |
| **action window (72 frames)** | 233 | **246** |
| what the frozen film did | 238 | **246** |

**The film was semantically right and the 3.3J compiler was wrong** — a shot span contains unrelated dead time.
`CausalPair.domain` is now **required**, and the invariance test proves it: the same REACH window inside a
100-frame shot and a 300-frame shot produces landmarks translated by **exactly** the shot translation, with an
**identical causal hold**.

**`out/phase33k/contract-proof-film.mp4`** — 3 shots, 11.00 s, 330 frames — is the **first film whose entire
directing logic executed through the contract.** Compiled and runtime onsets **match exactly** (165 / 165);
all four consumption paths report real runtime use with **no inert paths**; three compiled events produce
**measurable grid changes**; and two full renders produce a **byte-identical media hash**.

**The guard caught the bypass on its first execution**, refusing a runtime that indexed planned shots instead
of compiled ones.

## PHASE 3 = CLOSED

**V1 `ab39d78a40e74ba7` and V2 `fb8c4175d2bdba32` remain the narrative artefacts of Phase 3** and are
**unchanged**. `grid.bin` remains `49b4c86bcbc5677f`.

**Phase 3.1 remains historically PARTIAL** (failed external recognition). **Not rewritten.**
