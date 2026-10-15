# PHASE 3.3D PLAN — PHYSICAL ACTION + ASCII EXPRESSION IN ONE SHOT

**Status:** PLAN ONLY. Nothing in this document is implemented.
**Predecessor:** `docs/ASCII_MOTION_GRAMMAR.md` — the canonical grammar, externally classified.
**Blocked from 3.3C:** the request was a type refactor and documentation only. **Phase 3.3C = COMPLETE.**

---

## 0. The question

Phase 3.3C established that **physical motion and ASCII expression are independent layers**, and classified
four expressions as canonical from isolated 2.5-second tests.

**Every one of those tests had a single mechanism in it.** So the open question is:

> **Can conventional readable action and ASCII-native semantic expression coexist in ONE shot without
> competing?**

This is not a rendering question and not a stability question. It is a **composition** question: two things
are now moving in the same frame, at different rates, meaning different things.

---

## 1. The benchmark — one short semantic action

**PERSON REACHES TOWARD NAME**

| layer | content |
|---|---|
| **PRIMARY** — physical | **`reach`** — a figure raises one arm toward the wall |
| **SECONDARY** — ASCII expression | **`letter-fragment`** — the name begins to fragment |
| **TERTIARY** — response | **`local-field-response`**, very restrained |
| camera | **STATIC** |

**Duration 3–5 s, 1920×1080, silent, no audio, no subtitles.**

### Why this action

It is the **smallest scene in which the two layers are semantically coupled.** The figure reaches, and the
name breaks — the physical action *causes* the expression. **If the two layers compete anywhere, they
compete here, and if they coexist here the grammar is composable.**

**It is also already half-built.** `humanForm` supports `reach`; `letterformObjects` produces the name as
geometry; `letter-fragment` exists as a mechanism from E1; the canonical room and its camera framing are
frozen. **Nothing new needs inventing for the benchmark to be testable** — which is the point of choosing
it over a more expressive action.

---

## 2. What is NOT in this benchmark, deliberately

- **no camera motion** — Phase 3.3B proved the camera system works; adding it would confound the
  composition result with a variable already validated
- **no `structural-decay`** — one canonical expression at a time. Running `letter-fragment` and
  `structural-decay` together would make it impossible to attribute a failure
- **no second subject** — one figure, one word
- **no walk, no turn, no enter/exit** — the physical layer stays at its simplest

---

## 3. The specific risks this benchmark exists to expose

| risk | why 3.3C could not see it |
|---|---|
| **the expression outruns the action** | every 3.3C clip had one mechanism; there was nothing to outrun |
| **the name fragments before the viewer has read it** | E1 began from a fully-established word; here the word must be read *while* an action plays |
| **the figure's reach becomes invisible against churning glyphs** | the subject and the expression occupy overlapping screen regions for the first time |
| **the action looks like it causes nothing** | if fragmentation starts on frame 0 the causal link is lost |
| **the action looks like it causes too much** | if fragmentation completes before the reach lands, the shot reads as an effect rather than an action |

**The last two are the real test.** They are opposite failures and the window between them is what a
director would call *timing*.

---

## 4. Timing — the only new authoring decision

The benchmark requires a **causal offset** that no 3.3C clip had:

```
frame 0                     reach begins
frame ~30%                  reach is clearly underway, name still intact
frame ~45-55%               LETTER_FRAGMENT begins  <- after the action is legible
frame ~80%                  reach lands near the wall
frame 100%                  the name has fragmented; the figure holds the reach
```

**The expression must begin after the physical action is legible** — otherwise the audience never sees what
is being interfered with. **This offset is the benchmark's actual subject matter**, and it should be
authored as a declared relationship (expression begins at `primary.progress > X`) rather than a frame
number, consistent with the rule that the renderer consumes intent and never infers motion from a frame
index.

---

## 5. Machine checks

Reuse what exists rather than inventing new gates:

| check | source |
|---|---|
| deterministic render, no unexplained randomness | 3.3A baseline method |
| **every changed cell attributed to a source** | `MotionField.attribution`, already implemented |
| `validateComposition` returns no problems | the 3.3C refactor |
| no NaN / invalid projection | 3.3B method |
| the subject absent on no frame | 3.3B human metric |
| the name legible at the moment the action begins | **new** — letter topology occupancy at the offset frame |
| the physical action outranks the expression in screen area | **new** — subject cells vs expression cells per frame |

**The two new checks are the ones that matter**: *was the name readable when the action started*, and *did
the action remain the larger thing on screen*. Without them the benchmark measures nothing.

---

## 6. External review questions

**Do not ask "is this stable".** Ask:

1. What is happening?
2. **What caused what?**
3. Could you read the word before it changed?
4. Did the two things feel like one event or two competing events?
5. Did the figure remain the subject of the shot, or did the effect take over?

**Question 2 is the benchmark's pass condition:** if the observer describes the reach as *causing* the
fragmentation, the layers composed. If they describe two things happening at once, the composition failed.

---

## 7. Proposed work order

| step | work | why |
|---|---|---|
| 1 | author `MotionComposition` for the benchmark and run `validateComposition` | the type model must accept it before anything is rendered |
| 2 | implement the **causal offset** as a declared relationship | the benchmark's central authoring idea |
| 3 | implement the two new machine checks | a check that is not wired in prevents nothing |
| 4 | render the benchmark at 3–5 s | first two-layer shot |
| 5 | **sweep the offset** across ~3 values | "what caused what" is a timing question; one offset cannot answer it |
| 6 | blind package with the offsets shuffled | the same method that produced the 3.3C classification |
| 7 | external review | the only thing that can accept the composition |

**Step 5 is not optional.** If the offset is the benchmark's subject matter, a single value measures the
author's guess rather than the grammar's tolerance.

---

## 8. Explicitly out of scope

- **no character walk cycle** — `reach` is the only physical motion
- **no camera motion** — validated in 3.3B, confounds this test
- **no combined canonical expressions** — one expression per shot until one shot works
- **no cinematic sequence, no music, no sound, no subtitles**
- **no re-tiering of the grammar** — the 3.3C classification stands until an external review contradicts it

---

## 9. The open risks

1. **`letter-fragment` and `reach` may be irreconcilable at this scale.** The name is ~22% of frame width;
   the figure is ~62% of frame height. They occupy adjacent regions, and a reach toward the wall brings the
   arm into the name's area. **The collision audit exists and should be run on the composed shot.**
2. **The causal offset has no precedent in this codebase.** Every mechanism so far was a function of a
   single progress value; this needs *one layer's progress to gate another's*. That is a genuine addition
   to the motion model, not a reuse of it.
3. **The blind method needs care here.** With one shot and three offsets, the observer might recognise the
   same image three times. **The offsets must be shuffled and separated by other clips**, or the method
   measures memory rather than perception.
