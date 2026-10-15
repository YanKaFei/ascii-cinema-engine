# PHASE 3.3K — FIRST CONTRACT-DRIVEN PRODUCTION RENDER

**PHASE 3.3K = PASS.** The contract now drives an actual production render. **PHASE 3 = CLOSED.**

---

## 1. THE CAUSAL TIMEBASE ROOT CAUSE — resolved, and the compiler was wrong

The 3.3J compatibility replay disagreed with the frozen V2 film by **57 frames** on the same declared pair.
Traced to the exact frame:

| basis | cause readable | effect onset |
|---|---|---|
| **shot span** (189 frames) | 158 | 189 |
| **action window** (72 frames) | 233 | **246** |
| **what the film actually did** | 238 | **246** |

The frozen film resolved the causal landmark over the **REACH action's own window** `[7.0, 9.4] s = 72 frames`.
The 3.3J compiler resolved it over the **shot span** — 189 frames, of which **117 are unrelated dead time**
during which no part of the causal pair is active.

> ### The film was semantically right. **The 3.3J compiler was wrong**, and is corrected.

`REACH_READABLE = 0.3262` is a fraction of the **reach's own progress curve**, so `210 + 0.3262 × 72 = 233`
and the film's first `reachProgress ≥ 0.3262` is frame 238 — the difference is the smooth curve's shape, not a
basis error. The **onset** agrees exactly: **246 in both.**

**The frozen film was NOT fitted to and is NOT modified.**

## 2. TIMING DOMAIN MODEL

Causal progress may no longer infer its denominator. `CausalPair.domain` is now **required**:

```
SHOT_LOCAL · ACTION_LOCAL(actionId) · EXPRESSION_LOCAL(expressionId) · SEQUENCE_LOCAL
```

`resolveFrame(domain, progress)` resolves within the declared domain, and `describeDomain` names it. The
compiled spec carries `domain: "action-local(REACH 132..198)"`.

**A causal pair with no domain is refused with a NAMED error** — the first version crashed with
`TypeError: Cannot read properties of undefined (reading 'kind')`, a crash that named neither the shot nor the
field. **The domain is the thing whose absence caused the disagreement, so its absence is reported as exactly
that.**

### The critical invariance test — `tests/motion/timing-domain.test.mjs`, 15/15

| | REACH window | shot | readable | onset |
|---|---|---|---|---|
| **A** | 40..80 | **100 frames** | 53 | 69 |
| **B** | 140..180 | **300 frames** | 153 | 169 |

The landmarks translate by **exactly 100**; the offset into the action is **identical**; **the causal hold is
identical despite a 3× longer shot.** And the counterexample proves why: `shot-local` over a 100-frame shot
gives 49, over a 300-frame shot gives **148** — **the same action, a different answer. It is not a causal
basis.**

## 3. CONTRACT-PROOF FILM — `out/phase33k/contract-proof-film.mp4`

**3 shots · 11.00 s · 330 frames · 1920×1080 · 30 fps · silent**

> *"A person notices NAME, steps toward it, reaches, the NAME fragments, then the room begins to withdraw."*

| shot | frames | relation | camera | referenced event | onset |
|---|---|---|---|---|---|
| `S1-establish` | 0..95 | presentational | **static** | — | — |
| `S2-performance` | 96..257 | physical-causes-expression | **action-responsive** | `REACH` | f165 |
| `S3-consequence` | 258..329 | expression-only | **consequence-responsive** | `ROOM_STRUCTURAL_DECAY` | f279 |

S2's causal timing compiles to **154 / 165** in domain **`action-local(REACH 132..198)`**.

**Both repaired camera motivations are exercised by the film itself**, not by a dedicated fixture — and
neither was added merely to satisfy the test. S2's push answers the becoming-legible reach; S3's push follows
the room withdrawal only after it begins.

## 4. NO BARE CAMERA FUNCTION, NO MANUAL CAUSAL GATE

`camZFor(spec, f)` is a low-level interpolation that **consumes `spec.camera.beginsAtFrame`**. `effectGate(spec, f)`
**consumes `spec.causalTiming.effectOnsetFrame`**. The renderer contains no `cam:(u)=>...` function, no
`CAUSAL_HOLD_RATIO`, no `effectOnset` derivation.

**The guard caught the bypass on its first execution.** The first version of the runtime indexed the *planned*
shots, and `guardRenderable` refused it:

> `render refused: the supplied object is not a CompiledShotSpec — production renders must consume a compiled, validated plan`

## 5. PLAN → COMPILED → RUNTIME TRACE

| quantity | compiled | runtime | |
|---|---|---|---|
| camera onset frame | **165** | **165** | **MATCH** |
| effect onset frame | **165** | **165** | **MATCH** |

**A definition the check had to get right:** the onset frame is where the value **begins**, not where it first
becomes nonzero. The easing value is **exactly 0 at the onset frame**, so the first version reported a
one-frame mismatch. The right test is that the value is at rest **on** the compiled frame and moves **on the
next**.

`out/phase33k/render-trace.json` carries PLAN / COMPILED / RUNTIME per shot, including semantic event, target
provenance, action window, cause readable, effect onset, camera motivation and referenced event, NAME and ROOM
progress, body root and orientation.

## 6. CAMERA / CAUSAL / TARGET / WORLD-STATE CONSUMPTION

The **runtime** reports what it actually used — not a simulation:

| path | compiled | consumed | by |
|---|---|---|---|
| `cameraIntent` | true | **true** | `camZFor` |
| `causalTiming` | true | **true** | `effectGate` |
| `targetAnchor` | true | **true** | `performanceAt` |
| `asciiExpression` | true | **true** | `drawName` |

**Inert paths: none.** Target provenance survives the full path: `REACH_TOWARD(the name breaking apart)` is in
the compiled spec, and the runtime's movement is derived from `TargetAnchor(NAME)` through `stepToward` and
`yawFacingTarget`.

## 7. PIXEL CONSEQUENCE — PLAN → RUNTIME → PIXELS

Sampled 3 frames before and after each compiled event, on the actual line grid:

| compiled event | grid |
|---|---|
| `REACH` readable | **CHANGED** |
| `LETTER_FRAGMENT` onset | **CHANGED** |
| camera onset | **CHANGED** |

## 8. PRODUCTION BYPASS AUDIT — SECOND PASS

`out/phase33k/PRODUCTION_BYPASS_AUDIT.json` — **UNEXPLAINED NEW-PRODUCTION BYPASS: 0.**

**PRODUCTION 1** (`scripts/phase33k-proof.mjs`) · **LEGACY 2** (V1, V2 — frozen) · **TEST 5** · **ENGINE 2**.

**V1 and V2 remain explicitly classified LEGACY / FROZEN BYPASS and are NOT counted as new-production
compliance.** The new film's choices are within the permitted vocabulary — no walk, camera follow, orbit,
pan, tilt, dolly zoom, whip, handheld, particle field or per-cell simulation.

## 9. DETERMINISM

Rendered twice in full:

| artefact | hash |
|---|---|
| compiled spec | `86f1f7375d2545f8…` |
| render trace | `950c21dc14b6c009…` |
| **media** | **`acc609cc22a69899…`** |

**The media hash is byte-identical across both renders** — no container-metadata excuse was needed.

## 10. REGRESSIONS

| gate | result |
|---|---|
| **timing domain** | **15/15** |
| **contract** | **37/37** |
| shot grammar | **58/58** |
| body geometry | 11/11 |
| bridge + raster contract | 26/26 |
| composition relations | 31/31 |
| causal trace | 42/42 |
| `tsc --noEmit` | clean |
| `verify:claims` | 15/15 |
| `regression:phase1` | 24/24 |
| `regression:phase2` | **6861/6861** |

**Frozen, unchanged:** `grid.bin` `49b4c86bcbc5677f` · `v4-directional.png` `c9585c1322e62269` ·
**V1 `ab39d78a40e74ba7`** · **V2 `fb8c4175d2bdba32`** · `P1-serial.mp4` `dd0075dacc0596ca`

## 11. WHAT THIS PHASE DOES NOT CLAIM

**No external aesthetic gate was run, and none is required** — this is an architectural execution gate, and
film quality, performance quality and story quality were established in earlier phases.

**The proof film is not a creative deliverable.** It is an execution proof. **V1 and V2 remain the narrative
artefacts of Phase 3.**
