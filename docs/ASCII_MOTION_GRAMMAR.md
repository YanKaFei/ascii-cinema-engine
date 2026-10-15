# ASCII MOTION GRAMMAR

**Status:** canonical, after an external blind review of 13 prototypes.
**Supersedes:** the pre-3.3C assumption that ASCII motion was a property of how a form was rendered.
**Source of the classification:** `out/phase33c/BLIND-ANSWER-KEY.json` and the external director's review.

---

## 1. Method — the external blind review

Thirteen prototypes from the Phase 3.3C motion lab were copied **byte for byte** into
`out/phase33c/blind-review/` under a **randomised, seed-fixed mapping** as `clip-01` … `clip-13`. **No
mechanism name appeared in any filename, frame, metadata, caption or folder structure**, and the mapping
was held in `out/phase33c/BLIND-ANSWER-KEY.json`, outside the clip folder.

The observer was asked, per clip:

1. What do you see happening?
2. What is the main action?
3. Does the movement feel like the characters themselves are animating, or like a picture is simply moving?
4. Does anything feel glitchy, mechanical, decorative or arbitrary?
5. Does the movement feel intentional?
6. Would you want to watch more of this visual language?

and after all clips:

7. Which 3 clips feel most like a distinctive ASCII animation language?
8. Which 3 feel weakest or most gimmicky?
9. Which clip has the strongest potential for cinematic use?

**No mechanism, tier or expectation was supplied.**

## 2. Clip → mechanism mapping

| clip | prototype | mechanism |
|---|---|---|
| `clip-01` | C1 | step visibility (binary switch) |
| `clip-02` | C4 | glyph substitution / decay (`# * + : .`) |
| `clip-03` | A3 | translation + contour migration + trail/decay |
| `clip-04` | C2 | density dissolve |
| `clip-05` | B2 | gesture + directional glyph response |
| `clip-06` | B3 | gesture + density anticipation + local field response |
| `clip-07` | E1 | diegetic letter-topology fragmentation |
| `clip-08` | B1 | silhouette gesture |
| `clip-09` | D1 | staged structural decay |
| `clip-10` | C5 | assemble from sparse field |
| `clip-11` | C3 | contour erosion |
| `clip-12` | A1 | rigid translation |
| `clip-13` | A2 | translation + contour migration |

## 3. The external classification

### CANONICAL — TIER A

| prototype | mechanism | why it is canonical |
|---|---|---|
| **D1** | **structural decay** | stage-ordered loss of an environment |
| **E1** | **diegetic letter-topology fragmentation** | a word breaks apart while remaining legible first |
| **C5** | **assemble from sparse field** | a form emerges from characters rather than fading in |
| **C2** | **density dissolve** | a form dematerialises |

### SUPPORTING — TIER B

`C3` contour erosion · `B3` density anticipation / local field response · `B2` directional glyph response ·
`C4` glyph substitution / decay

### UTILITY — NON-CANONICAL

`A1` rigid translation · `A2` contour migration during translation · `A3` translation + trail/decay ·
`B1` basic silhouette gesture · `C1` binary visibility

**Utility mechanisms are not deleted and not failures.** They are conventional motion that carries no
distinctive ASCII meaning on its own. **They must not be presented as ASCII animation language.**

## 4. THE MAJOR FINDING — a refuted hypothesis

**Phase 3.3C's hypothesis was that adding contour migration or trail/decay to a physical translation would
make the translation feel intrinsically ASCII. The blind review refuted it.** A1, A2 and A3 all landed in
**utility**, none among the strongest results. **A2 and A3 added mechanism without improving perception.**

Therefore:

```
PHYSICAL MOTION  !=  ASCII EXPRESSION
```

They are **two independent layers**. This is now enforced in the type system, not merely stated:
`PhysicalMotionIntent` and `AsciiExpressionIntent` are separate types, and `validateComposition` **refuses**
a composition whose layers are entangled.

## 5. A corollary the review also established

**PERCEPTUAL VALUE > MECHANISM COMPLEXITY.**

`C4` glyph substitution *sounds* more ASCII-native in theory — it is literally about which character is
drawn — and **did not dominate perceptually.** `C2` density dissolve is mechanically trivial and its
perceptual result *"was stronger than its mechanical simplicity suggests."*

**A simpler grammar is preferred where external perception is stronger.** The tier list is ordered by
perception, not by sophistication.

## 6. The canonical expressions and their semantic uses

### STRUCTURAL_DECAY — best demonstrated by D1
**Use:** absence · memory loss · world withdrawal · collapse of environment · psychological emptiness
**Priority, and it is the whole mechanism:** texture → plane material → secondary edges → **major
structural junctions last.** If everything faded together the room would read as a dissolve rather than as
a structure being lost. Junctions are floored so the structure never fully vanishes.

### LETTER_TOPOLOGY_FRAGMENTATION — best demonstrated by E1
**Use:** forgotten name · language breakdown · identity loss · unstable signifier · erasure
**Requirement:** letter readability is preserved through the **initial** phase of the transformation. The
first 40% changes weight only; separation begins after that, and cells are displaced outward from **each
letter's own centre** so the letter core survives longest.

### ASSEMBLE_FROM_FIELD — best demonstrated by C5
**Use:** appearance · emergence · memory formation · body formation · materialisation
**Requirement:** this must remain **characters becoming form**, not an opacity fade-in. Weight rises from
the core outward until the form is complete.

### DENSITY_DISSOLVE — best demonstrated by C2
**Use:** disappearance · weakening · distance · loss · dematerialisation
**Note:** **do not overcomplicate it.** Its perceptual result exceeded its mechanical simplicity; the
temptation to enrich it is exactly the error the A-tier results warn against.

## 7. The motion hierarchy

```
PRIMARY    physical action      what happens
SECONDARY  ASCII expression     how the medium says what it means
TERTIARY   field response       restrained, enriching only
```

`validateComposition` enforces three properties:

- **an ASCII expression may not lead a shot with no physical action** — a supporting expression cannot
  carry a shot alone
- **the physical action must outrank the ASCII expression** in the hierarchy, or the eye will not know
  which action matters
- **every layer carries a stated reason**

**This structure exists to prevent the failure the brief names twice: everything moving at once.**

## 8. Engineering history preserved — the inert contour mechanism

**The first blind package contained `clip-12` and `clip-13` byte-identical** — A1 (rigid translation) and
A2 (translation + contour migration).

Tracing it: `markContour` writes at `contour` priority **80**, while a subject's base fill was written at
`form` priority **100**, so **every contour write was rejected.** Measured attribution was
`contour-written = 0` and **A2 tested nothing at all.**

**The design flaw was conflating *cell ownership* with *glyph appearance*.** `form` should mean "this cell
is the subject and nothing may remove it"; the base fill now goes in at `substitution` priority so the
contour tier is free to restyle its own boundary. After the fix A2's contour attribution is **26,394**
(was 0) and no two clips are identical.

**This is the fourteenth inert mechanism found in this project, and it was caught by a duplicate-hash
check — not by reading the code.** It is recorded here rather than erased because the record of a mechanism
that never ran is the most transferable thing this round produced.

**Note on its later classification:** A2 was rated **utility** *after* the fix, on a clip where contour
migration genuinely ran. The inert version was never reviewed.

## 9. The type model

`src/semantic/motion.ts`

| export | content |
|---|---|
| `PHYSICAL_MOTIONS` | `none, translate, walk, turn, reach, fall, enter, exit` |
| `ASCII_EXPRESSIONS` | the 4 canonical + 4 supporting + `none` |
| `EXPRESSION_TIER` | the external classification, **in the type model rather than only in a document** |
| `mayLead(expr)` | whether an expression may lead a shot or only enrich one |
| `MotionComposition` | `{ primary, secondary, tertiary?, hierarchy }` |
| `validateComposition(m)` | returns the reasons a composition is malformed |

The seven grammar primitives from the lab (`markContour`, `glyphForState`, `densityAt`,
`directionalGlyph`, `pushTrail`/`drawTrails`, `dissolveWeight`, `fieldResponseOffset`) remain the
implementation layer beneath the expressions, with `MOTION_PRIORITY` governing ownership.

## 10. What this does not claim

**No cinematic quality is claimed for any clip.** The tier list records what an external observer found
distinctive, not what the author prefers. **A canonical expression is one that carried meaning on its own
in a 2.5-second isolated test** — whether the four can coexist in a shot is the open question Phase 3.3D
exists to answer.


---

# CAUSAL TIMING — THE VALIDATED DEFAULT AND ITS SCOPE

**Added after the Phase 3.3D external blind review.** This section exists to prevent a specific misuse.

## The invariant, which is general

```
CAUSE_ACTION_START
  -> CAUSE_BECOMES_READABLE
  -> PERCEPTUALLY SUFFICIENT CAUSAL HOLD
  -> EFFECT_ONSET
```

**The hold is a PERCEPTUAL requirement, not a duration.** A cause must be legible for long enough that the
audience has registered it before the consequence begins. That requirement holds for every causal
composition, whatever the action.

## ⚠ `CAUSAL_HOLD_RATIO = 0.25` IS NOT A UNIVERSAL CONSTANT

It is a **validated default for one tested composition**:

| | |
|---|---|
| **cause** | `REACH` |
| **effect** | `LETTER_FRAGMENT` |
| **shot length** | 130 frames (4.33 s) |
| **external evidence** | the 10-frame hold was rated the strongest causal reading; the 5-frame hold placed second; the 1-frame hold was read as two unrelated events |

**It must not be promoted to a general causal timing constant.** Every action class has its own
**perceptually readable phase**, and a hold ratio expressed against that phase will differ between them:

| action class | why its readable phase differs |
|---|---|
| **reach** | the hand leaves the torso, and the negative space opening is legible almost immediately — a short phase with an early landmark |
| **walk** | legibility comes from stride establishment, not from the first movement, so the landmark sits later and the phase is different |
| **turn** | the landmark is a change of orientation, which is a discrete event rather than a continuous displacement |
| **fall** | legibility may arrive *very* early and be nearly instantaneous, so a ratio against a short phase yields a hold of a few frames |
| **enter / exit** | legibility is spatial (crossing a boundary), not a progress fraction |

**Each new action class must have its own `reachReadablePoint` measured**, and its own hold ratio validated
externally. **`0.25` is a starting hypothesis for an untested action, not an answer.**

**The function that should not change is `deriveCausalTiming`.** It takes the landmark and the legible phase
as inputs and returns the onset. The ratio is a parameter **precisely so it can differ per composition.**

## What the number means and what it does not

- **Does** record: for `REACH -> LETTER_FRAGMENT`, a hold of roughly a quarter of the cause's readable phase
  produced the strongest external causal reading.
- **Does not** record: that a quarter is right for anything else, or that the hold should be computed in
  frames. On a longer shot the same 10-frame delay would be a smaller proportion and would weaken.


---

# CAMERA RESULT — THE PHASE 3.3E EXTERNAL REVIEW

The motion grammar document covers **what the medium expresses**. The camera result belongs with it, because
the camera turned out to be a **motivation** problem rather than a geometry problem.

**Three renders, one geometry, three external ratings.** `push-in`, `cameraZ 0.9315 -> 0.7841`, a solved
10.0% scale increase, identical in all three. Only the timing differed.

| version | sha256 | external result |
|---|---|---|
| **VERSION B** — camera begins when the reach is legible | `346c81d19ba8df8e…` | **STRONGEST / WINNER** — *"the camera moves in response to the importance of the action"* |
| VERSION A — camera begins before the action establishes | `e663d35ce7a60561…` | **PASS, second** — *"slightly ahead of the subject"*; a valid anticipatory alternative |
| static control | `7e7b29ca2ccb99b3…` | **VALID** — the cleanest action, less cinematic intention |

**`CANONICAL_CAMERA_MOTIVATION = ACTION_RESPONSIVE`, scoped to `REACH -> LETTER_FRAGMENT`.**

**VERSION A is not recorded as a failure.** It demonstrated a different camera motivation. Anticipation
serves foreboding, inevitability, danger approaching, psychological pressure, and the world knowing before
the character — and it remains a valid choice for those intentions.

**Full detail:** `docs/CAMERA_AND_DIRECTOR_GRAMMAR.md` and `docs/PHASE_3_3F_SHOT_GRAMMAR.md`.
