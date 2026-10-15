# PHASE 3.3J — DIRECTOR PLAN → RENDER CONTRACT

**Purpose:** close the highest-priority architectural debt from the Phase 3.3 closeout.

> **THE PLANNING MODEL WAS NOT ACTUALLY ENFORCED BY THE FILM RENDER PATH.**

---

## 1. Why this phase exists

A film could contain a bare `cam:(u)=>...`, manual effect onset and manual timing **without passing through
`ShotIntent`, `CameraIntent`, `CausalTimingGrammar` or `CameraMotivation` validation.**

The 3.3I audit confirmed it by measurement: S4's camera existed **only as a function**. `validateCameraIntent`
**was never called**. So the Director system could describe correct directing rules while the renderer silently
bypassed them — **the system's documentation and its execution disagreed, and nothing detected it.**

### And seven sites independently rebuilt the causal timing

`EFFECT_ONSET` is `REACH_READABLE_PROGRESS + (1 − REACH_READABLE_PROGRESS) × CAUSAL_HOLD_RATIO`, and that
expression was **reconstructed independently in seven places.** That duplication is precisely how the `NaN`
defect reached a film: `phase33i-film.mjs` destructured `CAUSAL_HOLD_RATIO` from the **wrong module**, it was
`undefined`, `EFFECT_ONSET` became `NaN`, and **`reachProgress < NaN` is `false at every frame`** — so the NAME
fragmented from frame 0, silently.

## 2. Planning versus execution

```
ShotIntent
  ↓  validateShotIntent
  ↓  compileShotIntent
CompiledShotSpec
  ↓  guardRenderable
renderShot
```

**A render does not start from an unvalidated partial object. If compilation fails, the render fails.**
No default is silently inserted, because **a silently inserted default changes directorial meaning.**

## 3. `CompiledShotSpec`

`src/semantic/shot-compiler.ts`. Carries `shotId`, frame bounds, `semanticEvent`, `dramaticIntention`,
`expectedAudienceReading`, `primaryAttention`, **`target` with semantic provenance**, `performance`,
`compositionRelation`, `expression`, **resolved `causalTiming` frames**, `camera` with its event and onset
frame, `startWorldState`, `endWorldState`, `continuityRequirements` and the full `decisionRecord`.

## 4. Semantic provenance survives compilation

The `TargetAnchor` result is **not** collapsed into `yaw = 65.15, dx = …, dz = …`. The compiled target retains
what it *is*:

```
S2-performance    REACH_TOWARD(the name breaking apart)
```

so an audit can prove **why** a resolved value exists rather than only what it is.

## 5. Camera motivation landmarks — the audit's repair

`CameraIntent` now carries **`respondsTo`**, a semantic reference:

```ts
{ kind: "action" | "consequence" | "reveal" | "subject"; event: string; readableAt?: number; onsetsAt?: number }
```

| motivation | requires | timing relation enforced |
|---|---|---|
| **`action-responsive`** | a **`kind: "action"`** event **with a readability landmark** | camera onset **≥** the action's readable landmark |
| **`consequence-responsive`** | a **`kind: "consequence"`** event **with an onset or readable landmark** | camera onset **≥** the consequence's onset |
| **`anticipatory`** | a landmark for the **future** event | camera onset **<** that landmark |
| **`reveal`** | a `kind: "reveal"` event naming the information | — |
| **`subject-following`** | a `kind: "subject"` event naming the moving subject | — |
| **`static`** | **no** camera movement | movement must be zero |

**Field presence is not validation.** The old check asked *"is `beginsAtActionProgress` declared"* — it tested
that **a number existed**, not that a **legible physical action existed in the shot**. Validation now asks
**what event the camera is responding to**, whether that event exists, and whether the timing relation is
consistent with the declared motivation.

### The S4 case, now refused

The declaration as authored in 3.3I — `action-responsive` with no referenced event — is **refused**. And the
3.3I audit's specific finding is pinned: `action-responsive` and `consequence-responsive` used to return the
**same result**, so the validator **could not tell them apart**.

## 6. Causal timing has ONE owner

`compileShotIntent` resolves a `CausalPair` **once** into `causeReadableFrame` and `effectOnsetFrame`, and
carries **`validationScope`** so a consumer cannot mistake `0.25` for a universal constant.

**The renderer consumes these frames. It does not re-derive them.** A production shot may no longer import or
reconstruct `CAUSAL_HOLD_RATIO`.

## 7. World-state ownership

`WorldState` carries **numeric** `nameProgress` / `roomProgress`, and `compileSequence` asserts at every cut
that `startWorldState(Sn+1)` equals `endWorldState(Sn)`, and that **neither progression runs backwards.**

**Why numeric as well as textual:** the 3.3G defects were a NAME that **un-broke** across a hard cut and a ROOM
that partially **returned**. A string comparison can match while the numbers run backwards — which is exactly
how those two defects survived every per-shot validator. **A break requires an explicit, recorded
`continuityException`**, which now bypasses **every** continuity check rather than only the numeric ones.

## 8. Finite execution values

`assertFinite` and `collectNumbers` walk the whole compiled spec, including nested values. **A non-finite
executable number is a hard failure with its path named.** The `x < NaN` defect must be impossible to execute
silently — because **`NaN` does not throw; it propagates, and a comparison against it is silently `false`.**

## 9. Consumption tracing

`ConsumptionLedger` records, for four critical paths, whether the **runtime reported consuming** what the
compiler produced:

```
CameraIntent      → CameraCompiler → CameraRuntime
CausalTiming      → EffectGate
TargetAnchor      → PerformanceCompiler → BodyRuntime
AsciiExpressionIntent → ExpressionRuntime
```

`inertPaths()` returns compiled-but-unconsumed paths. **Deliberately not a generic framework** — four paths,
because those are the four whose inertness has already cost this project six defects.

## 10. Production bypass policy

`outputs/phase33j/PRODUCTION_BYPASS_AUDIT.json` — every location where a production path could author camera,
causal timing, world state or target geometry outside the compilation path.

| classification | policy |
|---|---|
| **PRODUCTION** | must compile through the contract |
| **LEGACY** | frozen media; not migrated |
| **TEST** | scoped experiment; may remain |
| **ENGINE** | a mechanism, not a directing decision |

**Found: 1 PRODUCTION, 1 LEGACY, 5 TEST, 2 ENGINE. Unexplained production bypass: 0.**

**Both film render paths are recorded as KNOWN, JUSTIFIED bypasses:** V1 and V2 are **frozen artefacts** —
`ab39d78a40e74ba7` and `fb8c4175d2bdba32` — and editing them would change a frozen media hash, which the brief
forbids. **New production films must compile through the contract.**

## 11. V2 compatibility fixture

`outputs/phase33j/v2-compatibility.json`. `director-plan-v2.json` was replayed through the contract.
**V2 was not re-rendered and neither the film nor the plan file was modified.**

| pass | result |
|---|---|
| **1 — the plan as authored in 3.3I** | **REFUSED** — S4 declared `action-responsive` with no referenced event |
| **2 — with the S4 metadata correction** | **ACCEPTED** — 5 shots, 480 frames |

**The proposed correction, recorded but not applied to the frozen plan:** `consequence-responsive`, event
`ROOM_STRUCTURAL_DECAY`, `onsetsAt 0.25`.

### The compatibility comparison, reported honestly

| quantity | contract | frozen | agree |
|---|---|---|---|
| S4 camera onset frame | **371** | 372 | **yes** (within one frame) |
| S2 cause readable frame | 157 | 238 | **NO** |
| S2 effect onset frame | 189 | 246 | **NO** |

**The two causal landmarks disagree, and that is the phase's finding rather than a regression.** The film
applied the landmark to a **performance window** `[7.0, 9.4] s`; the contract applies it to the **shot span**.
**Same declared pair, two independent derivations** — the duplication this phase removes.

## 12. The inert-mechanism regression strategy

Targeted tests for the project's most transferable failure: **a value written but never reaching its consumer.**

| simulated | how the test detects it |
|---|---|
| `CameraIntent` declared but the runtime ignores it | the ledger records it compiled and unconsumed → `inertPaths` flags it |
| `CausalTiming` compiled but the gate ignores it | same |
| `TargetAnchor` compiled but movement uses a constant vector | same |
| `AsciiExpressionIntent` declared but the runtime is unchanged | same |

**The tests fail before the simulated consumer is connected and pass once it reports consumption** — so they
test **consumption**, not field existence, which is exactly what the six historical defects evaded.

## 13. No overengineering

**The renderer was not rewritten. No node graph. No event bus. Remotion and SceneIR are untouched.** The change
is a compilation layer between the plan and the render, plus validation strong enough that the plan cannot be
bypassed.

## 14. Two defects found in my own harnesses during this round

Recorded because the pattern matters:

1. **`validateCameraIntent` returns a problem list; it does not throw.** I wrapped it in a `rejects()` helper
   that expected a throw, so **every camera assertion failed while the validator was correct.** The harness was
   wrong, not the code.
2. **My "fixed" verification branch set `action-responsive` again** — the very thing the audit identified —
   so it failed to compile, and the script **printed nothing**, because its branches covered only
   `failure && !fixed` and `compiled`. **A check that silently produces no output looks like a pass.** An
   explicit branch was added so it can never be silent again.

**And one misleading diagnostic in the compiler itself:** the frame-bounds check reported *"non-integer frame
bounds"* for an **undefined** bound. `Number.isInteger(undefined)` is `false`, so the error fired naming the
**wrong cause** and sent the investigation after a rounding bug instead of a key mismatch. **A diagnostic that
names the wrong cause is worse than no diagnostic**; absence and non-integrality are now reported separately.

## 15. What this phase does not claim

**It does not migrate the two frozen films, and it does not prove a new film renders through the contract.**
It creates the enforcement, proves it by compilation and by negative test, and records every remaining bypass
with its justification. **Proving it end-to-end requires a new production film, which is not in this phase.**
