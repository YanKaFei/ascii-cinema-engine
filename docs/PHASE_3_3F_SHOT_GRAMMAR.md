# PHASE 3.3F — SHOT GRAMMAR

**Status:** COMPLETE. Architecture and director-policy consolidation — **no new visual mechanism, nothing
rendered.**
**Predecessors:** `docs/CAMERA_AND_DIRECTOR_GRAMMAR.md` · `docs/ASCII_MOTION_GRAMMAR.md`
**Type model:** `src/semantic/motion.ts`

---

## 1. What this phase consolidates

Every visual mechanism the project needs is now validated. Phase 3.3F builds **no new mechanism** and
renders **no new clip**. It gathers the validated components into a **director-level planning layer**, so
the pipeline can reason about a shot as meaning before it reasons about a mechanism.

```
SEMANTIC EVENT
  ↓
DRAMATIC INTENTION
  ↓
PHYSICAL ACTION
  ↓
COMPOSITION RELATION
  ↓
ASCII EXPRESSION
  ↓
CAUSAL TIMING
  ↓
CAMERA MOTIVATION
  ↓
CAMERA MOVE
  ↓
SHOT COMPOSITION
```

**The ordering is the safeguard, not a diagram.** Because the semantic event and the dramatic intention are
declared *before* any mechanism, the system **cannot select an effect merely because the effect exists** —
the failure the brief names directly, and one this project has already paid for: the motion lab built four
mechanisms before anything established that they carried meaning, and three of them were later classified
utility.

---

## 2. `ShotIntent` — the planning layer

`ShotIntent` answers the six required questions as typed fields:

| the brief asks | the field |
|---|---|
| **WHAT** is happening? | `semanticEvent` — stated with no reference to a mechanism |
| **WHY** does this shot exist? | `dramaticIntention` |
| **WHAT** should the viewer notice first? | `primaryAttention` / `secondaryAttention` / `tertiaryResponse` |
| **WHAT** changes because of what? | `relation` (`CompositionRelation`) |
| **HOW** should ASCII express the event? | `motion.secondary` (`AsciiExpressionIntent`), with its reason |
| **WHY** should the camera move — or stay still? | `camera` (`CameraIntent`) with `motivation` |

Plus `beginsIn` / `endsIn`, so a shot can be **checked against its own stated intention** rather than
against a feeling.

**This is machine-readable planning, not user-facing prose.** `ShotSpec` compiles from it.

## 3. Attention hierarchy

```ts
primaryAttention    // exactly one
secondaryAttention  // optional
tertiaryResponse    // optional
```

`validateAttention()` **refuses** the cases that break the hierarchy:

- **a camera holding PRIMARY attention in a causal shot** — the camera would become the event rather than
  support it, which is the §7 dominance failure expressed at the planning layer instead of in pixels
- primary and secondary naming the **same target**
- a shot with **no declared primary attention**, meaning nothing is the subject

**This is the planning-layer form of the rule the whole motion-hierarchy idea exists for: everything moving
at once.**

## 4. The director decision contract

`explainShot(intent)` returns all ten required fields:

1. semantic event · 2. primary physical action · 3. ASCII expression and its semantic reason ·
4. causal relation · 5. causal timing landmark · 6. camera motivation · 7. camera move ·
8. attention hierarchy · 9. expected beginning state · 10. expected ending state

**Producing the record is how a plan is checked for gaps: a field that cannot be filled is a decision that
has not been made.** All four fixtures produce a complete record.

---

## 5. DIRECTING RESTRAINT — `CAPABILITY DOES NOT IMPLY USE`

> **A shot uses the minimum number of mechanisms necessary to communicate its dramatic intention.**

The Director must not add camera movement, an ASCII expression, a field response, a trail, a glitch or a
transition **merely because each is available.**

**This is checkable, and `restraintReport()` is the check.** It does not forbid a mechanism — it demands that
a mechanism carry a reason, and it **names the shot's declared dramatic intention as the thing the reason
must serve.** It reports which mechanisms are in use, which are available and **deliberately unused**, and
refuses a reason that appeals to capability:

| reason | verdict |
|---|---|
| *"the camera exists to keep the walking figure framed"* | accepted — names an intention |
| *"no ASCII expression is required for a plain arrival"* | accepted, and the layer stays unused |
| *"added for visual interest"* | **RESTRAINT VIOLATION** |

**The limitation is stated rather than hidden:** this is a **weak** check. It cannot judge prose, and it must
not pretend to. What it can do is refuse a mechanism with no reason at all, and refuse a shot whose only
reasons are generic capability statements. The generic list — `available`, `visual interest`, `looks good`,
`for variety`, `because we can`, `default` — is deliberately short and explicit.

**`STATIC` is a first-class directorial result.** The system can conclude **`STATIC CAMERA IS STRONGER FOR
THIS SHOT`** and record it. Two of the six fixtures do exactly that, each with a stated reason.
**Static is never fallback behaviour.**

---

## 6. The six planning fixtures

The purpose is to prove the model **does not force the same grammar onto every event.** All six compile
cleanly and every one produces a **distinct plan signature.**

| | **A** | **B** | **C** | **D** | **E** | **F** |
|---|---|---|---|---|---|---|
| **semantic event** | a person reaches toward a name and it breaks | a room withdraws around a still person | a person enters a room | the room collapses before the person reacts | a person walks a corridor, nothing supernatural | a written word disappears, the person does not react |
| **dramatic intention** | reaching destroys the thing reached for | the world leaves before the person does | arrival | the world knows before the character | ordinary passage; a world behaving normally | loss without witness |
| **relation** | `physical-causes-expression` | `expression-only` | `physical-only` | `expression-causes-physical` | **`physical-only`** | **`expression-only`** |
| **physical** | `reach` | **none** | `enter` | `turn` | `walk` | **none** |
| **expression** | `letter-fragment` | `structural-decay` | **none** | `structural-decay` | **none** | `density-dissolve` |
| **hierarchy** | physical leads | expression leads | physical leads | expression leads | physical leads | expression leads |
| **onset gate** | `reach-readable` | — | — | `expression-readable` | — | — |
| **camera motivation** | `action-responsive` | **`static`** | `subject-following` | `anticipatory` | `subject-following` | **`static`** |
| **camera move** | `push-in` | **`none`** | `truck` | `push-in` | `truck` | **`none`** |
| **expected audience reading** | reaching for the name is what destroys it | the world withdraws and the person is left in it | someone has arrived | the world knew before the character did | someone is walking down a corridor, and the world is ordinary | something was erased and nobody noticed |

**What the six collectively prove:**

- **four distinct composition relations** in use, and **not one of them is forced**
- **four distinct camera motivations**; **only 2 of 6 fixtures use a `push-in`**, so the planner is not
  defaulting to one move
- **two fixtures use NO ASCII expression** (C, E) — the Director does not add decay because it can
- **two fixtures invent NO physical action** (B, F) — absence of action is a valid plan, and this is the D1
  case the corrected composition model exists to allow
- **two fixtures declare `static` deliberately** (B, F), each with a reason: in F a moving camera *"would
  supply a reaction the shot denies"*
- **fixture D gates on `expression-readable`**, so the gate names the **cause**, not a generic wait
- **fixture E exists specifically to prove not every shot needs an ASCII effect**

**Every fixture also declares `expectedAudienceReading`** — what the audience should take from the shot. It
is the field that catches a plan drifting from its intention: a shot can execute every declared mechanism
correctly and still say the wrong thing, and nothing else in the model would notice.

---

## 7. `CameraMotivation` — separate from `CameraMove`

Six motivations, each carrying the dramatic intentions it serves. Full detail in
`docs/CAMERA_AND_DIRECTOR_GRAMMAR.md` §3.

`validateCameraIntent()` refuses what is **meaningless** rather than merely unusual: a moving camera with
`static` motivation; a `none` move with `action-responsive`; `action-responsive` without a declared action
progress — since that motivation *is* its timing, it cannot be expressed as a frame; and `anticipatory`
declared with a late start, which would be a different motivation wearing the wrong name.

## 8. Explicitly NOT in this phase

**No rendering. No motion-lab clips. No 10–15 second sequence.** And no:

- walking implementation · camera follow implementation · new ASCII expressions
- audio · music · SFX · subtitles

---

## 9. PASS CONDITION

| # | condition | result |
|---|---|---|
| 1 | shot planning separates semantic event from visual mechanism | **PASS** — `semanticEvent` and `dramaticIntention` are strings with no mechanism reference |
| 2 | `PhysicalMotion` and `ASCIIExpression` remain independent | **PASS** — separate types; fixture B has one and not the other; fixture C the reverse |
| 3 | all five `CompositionRelation` types remain valid | **PASS** — 5 declared, all semantically documented |
| 4 | `CausalTimingGrammar` represented without universal frame constants | **PASS** — onset is gated on a **named landmark**; `action-responsive` without an action progress is refused |
| 5 | `CameraMotivation` separate from `CameraMove` | **PASS** — two types, and two fixtures share a move under different motivations |
| 6 | `STATIC` is a valid deliberate choice | **PASS** — fixture B declares it with a reason and validates |
| 7 | attention hierarchy is explicit | **PASS** — three slots; a camera primary in a causal shot is refused |
| 8 | the four fixtures compile to meaningfully different shot plans | **PASS** — 6 fixtures, 4 relations, 4 motivations, 3 moves, 4 expressions, all 6 signatures distinct |
| 10 | director restraint is represented | **PASS** — `restraintReport()` names unused capability and refuses capability-based reasons |
| 9 | no existing regression breaks | **PASS** — see §9 |

## 10. Regressions

`50/50` shot-grammar assertions · `27/27` composition-relation assertions · `42/42` causal-trace
assertions · 3.3A baseline unique hashes 1 / cross-run 0 · clipping 12/12 · `tsc` clean ·
`verify:claims` 15/15 · `regression:phase2` 6861/6861 · `regression:phase1` 24/24 ·
`loneliness/grid.bin` frozen.

## 11. One inert mechanism removed during this phase

A first version of `validateAttention` computed a `primaries` count and immediately `void`ed it — **dead
code that read like a check.** It was removed rather than left in place, because **an inert mechanism that
appears to validate is worse than no mechanism at all.** That is the same defect class as the A2 contour bug
recorded in `docs/ASCII_MOTION_GRAMMAR.md` §8, caught this time before delivery rather than by a
duplicate-hash check.

## 12. The open question for the next phase

The grammar can now **plan** a shot. What it has not done is **plan a sequence** — several shots whose
intentions relate. The pieces that will be needed are not yet designed:

- **how one shot's `endsIn` becomes the next shot's `beginsIn`**, and what happens when they disagree
- **whether attention may migrate across a cut**, and if so whether the migration is declared
- **how a shot's dramaticIntention composes into a scene's intention** rather than being asserted per shot
- **whether the camera motivation may change WITHIN a shot**, which the current model does not allow

**None of that is in scope here.** It is recorded because the decision contract's `beginsIn` / `endsIn`
fields were written with it in mind.
