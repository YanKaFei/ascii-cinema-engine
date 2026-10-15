# PHASE 3.3G — FIRST DIRECTED ASCII MICRO FILM

**Status:** EXTERNAL GATE READY.
**Question:** can the Director turn a **semantic story** into a coherent series of shots? Not: can the
renderer execute more effects. **No new capability was added.**

---

## 1. The story, and how it was compiled

> *"A person stands alone in a room. Their name is written on the wall. They notice it. They reach toward
> the name. The name begins to break apart. Then the room itself gradually disappears. At the end, only the
> person remains."*

**The paragraph is not a shot list.** Seven sentences became **five shots** because two pairs were combined
and one beat was isolated:

| story sentence | decision |
|---|---|
| "stands alone in a room" + "their name is written on the wall" | **combined** into S1 — both are *spatial* information about one place; splitting them would cut on no change of subject |
| "they notice it" + "they reach toward the name" | **combined** into S2 — noticing has no physical expression in the validated vocabulary; **the reach IS the noticing made visible** |
| "the name begins to break apart" | **isolated** as the causal centre — the only event in the story *caused* by the person |
| "the room itself gradually disappears" | S4 |
| "at the end, only the person remains" | S5 |

## 2. The plan

| | **S1-establish** | **S2-reach-breaks-name** | **S3-name-lost** | **S4-room-withdraws** | **S5-person-remains** |
|---|---|---|---|---|---|
| **seconds** | 3.20 | 4.33 | 2.20 | 2.70 | 1.60 |
| **frames** | 96 | 130 | 66 | 81 | 48 |
| **semantic event** | a person stands alone in a room, and a name is written on the wall | the person reaches toward the name and it begins to break | the name comes apart and almost nothing remains | the room itself gradually disappears | only the person remains |
| **dramatic intention** | establish the world and the person–name relation before anything changes | the act of reaching for the name is what destroys it | the consequence, given room to land before the world responds | the world withdraws, and it is the room rather than the person that goes | the end state |
| **relation** | `parallel` | `physical-causes-expression` | `expression-only` | `expression-only` | `expression-only` |
| **physical** | none | `reach` | none | none | none |
| **expression** | none | `letter-fragment` | `letter-fragment` | `structural-decay` | `structural-decay` |
| **camera motivation** | `static` | `action-responsive` | `static` | `consequence-responsive` | `static` |
| **camera move** | none | `push-in` | none | `push-in` (returning) | none |
| **primary attention** | the room and the person in it | the reaching arm | what is left of the name | the room losing its structure | the person, alone |
| **expected audience reading** | a person is alone in a room, and their name is on the wall | reaching for the name is what makes it break | the name is gone, and the person still holds the gesture that removed it | the space around the person is going away | everything else is gone and the person is still there |

**Durations are not equalised** — five distinct values, chosen from information density, action
readability, causal timing and ending-state recognition. **No shot exists to fill runtime.**

## 3. Shot count — 5, and why not 3 or 7

**Three** would have merged S2 and S3, putting the cause and its consequence in one shot — which is exactly
the *effect stacking* the brief forbids at a dramatic beat, and would have blurred the film's causal centre.
**Seven** would have split the two spatial sentences of S1 and the two halves of the reach, cutting twice on
no change of subject.

**S3 exists because the name's destruction needed to register before the room responded.** Without it the
audience would see the name break and the world collapse in the same breath, and could not tell which
caused which.

## 4. Continuity — the check that only a sequence can make

`ContinuityState` carries `personState` / `nameState` / `roomState` across every cut, and
`checkContinuity()` requires each shot's `entersIn` to equal the previous shot's `exitsIn`.

**Both defects the first rough cut exposed were continuity defects, and neither was visible in any per-shot
validator:**

1. **`frag` ran BACKWARDS 1.00 → 0.60** at S2→S3. The name **un-broke across a hard cut** — the brief forbids
   this outright. Cause: each shot's layer progress was treated as independent and local.
2. **`decay` ran BACKWARDS 1.00 → 0.82** at S4→S5. The room partially **returned**.

**The fix is conceptual, not a patch:** these layers are **cumulative properties of the world**, not
per-shot animations. The fragmentation continues to completion in S3; the decay continues into S5, so the
ending is **the same event arriving** rather than a new effect applied to an already-empty room. After the
fix, **all four cuts carry state with no jump.**

## 5. What the first rough cut exposed about the relation model

**S1 did not fit any of the five relations.** It has no physical action (nobody acts) and no expressive
transformation (the name is simply there). It is not causal — nothing causes anything yet.

`physical-only` was **correctly refused** for having no motion, and forcing the shot into `expression-only`
would have meant claiming an **intact, unmodified name** was an "expression" — a fiction the plan would then
have had to carry.

**`parallel` was the honest home, and its rule was wrong.** It originally required *both* layers present.
It now permits **either or both to be absent**: a **presentational** shot, where the world is in a state and
the camera observes it. The original five relations had no home for one, and the establishing shot found the
gap. This is recorded as a change to the model, not hidden as a test fix.

## 6. Restraint

**Only four mechanisms are used in the entire film:** `physical:reach`, `expression:letter-fragment`,
`expression:structural-decay`, `camera:push-in`.

- **no tertiary expression anywhere** — `local-field-response`, `directional-response`, `glyph-substitute`,
  `trail` and `contour migration` are all absent
- **3 of 5 shots are static** — the camera moves only in S2 (answering the action) and S4 (following the
  consequence). **A push-in is not in every shot.**
- **no restraint violation in any shot**
- the establishing shot uses **nothing at all**

## 7. Attention across the sequence

```
SPACE / PERSON  →  THE REACH  →  WHAT IS LEFT OF THE NAME  →  THE ROOM  →  THE PERSON
```

**All five primary attention targets are distinct**, and no two adjacent shots share one — so **every cut
redirects attention**. **No shot has more than one expressive transformation active.** The two
transformations that do exist are **sequenced, never simultaneous**: the name breaks (S2–S3), and only then
does the room withdraw (S4–S5).

## 8. Cross-shot causality — declared as UNVALIDATED

The story reads as though the room's disappearance follows the name's. **`CAUSAL_HOLD_RATIO = 0.25` was
validated only for `REACH → LETTER_FRAGMENT`.** Reusing it for `NAME → ROOM` would be exactly the
generalisation the 3.3E review warned against, and **no external evidence exists for that pair.**

So the Director declares **sequential dramatic consequence** — the cuts place the room's withdrawal after
the name's destruction, and the audience may read causation, but **the plan does not claim a timing law it
has not validated.**

## 9. Machine checks — 33/33

The seven required pieces of narrative information, in order; the reach before the fragmentation before the
decay; the name legible at onset; the room readable at decay onset; the person present on every frame; the
structural-decay ordering (texture → plane material → secondary edges → junctions last); camera motivation
validity; attention hierarchy; no unexplained mechanism; 5/5 distinct audience readings; no redundant shot;
no NaN; deterministic.

### Two metric bugs the traces caught

1. **`nameCellsDrawn` was measuring the wrong thing.** It keyed on `source === 'substitution'`, but
   `drawRoom` tags **plane texture** the same way — so the metric reported 77 "name" cells on a frame where
   the name had been **completely erased**. *A metric whose name does not describe its measurement is worse
   than no metric*: it made a correct render look like a defect and sent the investigation after the wrong
   subsystem. Fixed to count the name **by where it is**, not by what wrote it.
2. **`erase` never fully erased.** At `frag = 1.0` the name still had 19 cells. The ending requires the name
   to be **gone** — a partial erase leaves the final state ambiguous. The erase is now **enforced to
   completion** rather than left asymptotic.

**One invented threshold was removed.** A check requiring lattice rounding coincidences on ≤10% of frames
failed at 14% — and **that threshold was not a measured property of anything; I made it up that turn.**
Tuning it to 15% would have been fitting a check to its result. The rule is removed and the rate is
**reported, not gated**.

## 10. Rough cut vs final

`rough-cut.mp4` and `final-silent.mp4` are **byte-identical** — `ab39d78a40e74ba7…`.

**No aesthetic change was made between them.** The two defects found after the first rough cut were
**continuity errors and a metric error**, both fixed at the plan/render level and both recorded above; the
final render is the rough cut's plan with those errors corrected, not a re-tuned version. **Nothing was
changed for preference.**

## 11. Deliverables

| path | content |
|---|---|
| `out/phase33g/final-silent.mp4` | 421 frames, 1920×1080, 30 fps, **14.033 s**, silent |
| `out/phase33g/rough-cut.mp4` | byte-identical to the final |
| `out/phase33g/director-plan.json` | the plan and its full review |
| `out/phase33g/continuity-report.json` | state carried across each cut |
| `out/phase33g/shot-boundary-report.json` | shot table and frame ranges |
| `out/phase33g/attention-report.json` | attention progression |
| `out/phase33g/shot-trace.json` | per-frame layer progress and cell counts |
| `out/phase33g/machine-checks.json` | 33/33 |
| `out/phase33g/review/` | `final-silent.mp4` + one representative frame per shot |

## 12. FIRST REAL DIRECTOR FAILURE MODES — recorded, not hidden behind green checks

The brief asks for these to be faced rather than buried. What I can state from the measurements, and what I
cannot:

**Measured and satisfied:** no two adjacent shots share a primary attention target; no shot stacks two
expressive transformations; the name event and the room event are strictly sequenced; every shot's
`expectedAudienceReading` differs; no shot is flagged potentially redundant; the ending holds for 1.6 s.

**NOT established, and only an external observer can settle it:**

- **whether the film reads as a short film or as a sequence of demonstrations.** Every shot is internally
  legible and the chain is ordered, but **correct ordering is not the same as a story.**
- **whether S1 is too long.** 3.2 s of a static figure, a static room and an intact word is the film's
  longest static passage and it carries one piece of information. Machine checks cannot call it slow.
- **whether the two `letter-fragment` shots read as one continuing event or as the effect happening twice.**
  S2 and S3 share an expression by design — the fragmentation is continuous — but a viewer may see two
  separate breaking moments.
- **whether the camera's return in S4 is legible as a camera move at all.** It is small by design; it may
  simply be invisible.
- **whether the person is the subject or the room is.** In S1 the room's texture carries far more of the
  frame than the figure does, and the figure is dark against a bright floor.

**These are the questions the external review exists to answer. I am not answering them myself.**
