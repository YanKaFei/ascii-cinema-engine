# ADR — SUBJECT REPRESENTATION, AND THE GATE 5 VOCABULARY

**Status:** accepted · **Phase:** 3.1 · **Supersedes:** the Gate 5 object-kind list as a literal checklist

---

## Context

Phase 3's Gate 5 named twelve object kinds:

> `AsciiPoint / Line / Polyline / Text / Word / Shape / Grid / Cloud / Field / Trail / Mesh / Volume`

**Seven were implemented.** The Phase 3 completion report called the gate DELIVERED for many rounds on the
strength of *"seven kinds exist, all carrying the required fields"* — a true statement about what was
built, and not what the gate asked for. The gate was corrected to **PARTIAL** in Phase 3's final round.

This ADR decides what to do about the five that are not implemented: `word`, `field`, `shape`, `mesh`,
`volume`. The instruction is explicit — **do not implement them to satisfy a checklist**, classify them
instead, and if a type is incompatible with the architecture then **change the vocabulary honestly**
rather than shipping an object labelled `Mesh` that is internally a `Cloud`.

## The constraint that decides most of this

The renderer's primitive is a **point**:

```ts
interface Primitive { i; p: Vec3; dir: Vec3; rim; sizeMul; intMul; phase; onScreenAtSomePoint; glyphCode? }
```

Each primitive projects to a lattice cell and contributes ink through a flat-topped splat. The field is a
**scalar** (luminance) over a 240 × 120 grid.

**There is no surface representation anywhere in the engine.** Verified mechanically:

- no surface **normal** exists on any primitive, in the scene compiler, or in the field
- no **triangle**, **face** or **vertex** type exists
- the GPU path's `EdgePass` computes a screen-space **edge** magnitude from the scalar field — that is a
  *derivative of brightness*, not a surface normal

A surface mesh needs, at minimum, per-face orientation to shade it. **Nothing in this renderer can carry
one.** That is a property of the architecture, not a missing feature.

---

## Classification

Categories: **A** semantically useful for ASCII cinema · **B** representable in the current engine ·
**C** redundant · **D** incompatible with the point/glyph architecture.

| gate 5 name | category | cinematic capability it actually provides | decision |
|---|---|---|---|
| `word` | **C — redundant** | a readable unit of language | **`AsciiText` IS the word.** `word` describes *content*; `text` describes *representation*. Both are needed, at different layers |
| `field` | **C — redundant** | continuous spatial variation | `AsciiGrid` with holes + `AsciiCloud` cover it. A separate kind would carry no distinct capability |
| `shape` | **A + B — useful and representable** | **recognisable form**: a named contour with internal structure | **IMPLEMENT — but as a `SubjectForm`, not a primitive.** See below |
| `volume` | **B — representable, low value** | interior mass, fog, density gradient | `AsciiCloud` already IS a volume of marks. Recording as *covered by cloud*, not as a separate kind |
| `mesh` | **D — incompatible** | a shaded surface | **REJECT.** Cannot be represented, and nothing in ASCII cinema requires it — see below |

### Why `shape` is the real gap, and why it is not a primitive

`shape` is the only missing name that names a genuine **capability**: the ability to say *this thing is a
person / a room / a door*, rather than *this is a cloud of marks*. Phase 3's own review confirms it —
FILMIC FEELING is WEAK because the subject is a field, and a field depicts a field.

But `shape` should **not** become a twelfth entry in `AsciiObject`. The object kinds are a
**representation** vocabulary (how marks are laid out); `shape` is a **semantic** vocabulary (what the
thing is). Adding `shape` to the object list would put a semantic concept in a representation enum, and
the Director would then be choosing primitives instead of meaning.

**So `shape` is promoted, not added:** it becomes `SubjectForm`, an abstraction *above* primitive type,
defined in `src/director/grammar/forms.ts` and routed through SceneIR. A `SubjectForm` compiles to
`polyline` + `grid` + `cloud` + `text` + particles; the Director never names a primitive.

### Why `mesh` is rejected rather than deferred

Three independent reasons, any one of which suffices:

1. **Not representable.** No normals, no faces, no orientation. A mesh forced through this pipeline
   would be sampled to points and lose the only thing that makes it a mesh — its surface.
2. **Not needed for the goal.** Phase 3.1 asks for **recognition through abstraction** and explicitly
   forbids pursuing realism. A person, a room and a word are all deliverable as contours, lattices and
   glyph placements. None requires a shaded surface.
3. **It would be dishonest.** An object named `Mesh` that is internally a point cloud is exactly the
   "fake it to satisfy the checklist" outcome the instruction forbids.

**Rejection is recorded, not hidden.** If a future phase adds a depth buffer with normals, `mesh`
becomes representable and this decision should be revisited — the reason for rejection is stated so that
the condition for reversal is visible.

---

## Decision

1. **Gate 5's vocabulary is revised.** The object-kind list becomes:

   > `AsciiPoint / Line / Polyline / Text / Grid / Cloud / Trail` (**seven**), with `word` and `field`
   > recorded as *covered by* `text` and by `grid`+`cloud`, `volume` *covered by* `cloud`, and `shape`
   > **promoted to `SubjectForm`**.

   Gate 5 therefore closes as **COMPLETE under the revised vocabulary**, with `mesh` **rejected by ADR**
   rather than left as a permanent partial. This is a vocabulary correction justified by this document,
   which the instruction explicitly permits.

2. **`SubjectForm` is introduced** as the semantic layer above primitives. Its schema, its form grammar
   and its SceneIR route are Phase 3.1 steps 3, 4 and 8.

3. **No object kind is added to `AsciiObject`.** The seven stay seven.

4. **`mesh` is not implemented.** The capability it names is unreachable in a glyph-field renderer.

---

## Consequences

- Phase 3's Gate 5 status changes from *"PARTIAL — 7 of 12"* to *"COMPLETE under the ADR-revised
  vocabulary (7 object kinds + SubjectForm; mesh rejected)"*. **Phase 3's own history is not rewritten** —
  `docs/baselines/PHASE_3_BASELINE.md` keeps the literal 7-of-12 record and the correction that produced
  it. What changes is the *forward-looking* vocabulary.
- The Director gains a semantic layer it did not have. This is the first time the Director will name
  **what a thing is** rather than how it is drawn — which is the whole point of Phase 3.1.
- `verify:claims` currently asserts *"FOUR of the twelve gate-5 kinds are absent: shape/field/mesh/volume"*.
  That assertion becomes stale under this ADR and must be updated to reflect the revised vocabulary,
  **recording both the literal count and the ADR ruling** so the correction stays visible.

## Reversal conditions

| decision | would be revisited if |
|---|---|
| `mesh` rejected | the renderer gains surface normals and a depth buffer that can shade them |
| `shape` promoted to SubjectForm | SubjectForm proves unable to express a needed form, indicating the layer is misplaced |
| `word` ≡ `text` | diegetic text needs a representation `AsciiText` cannot provide (Phase 4 subtitle concerns are separate and expected to need one) |

---

# APPENDIX — the coordinate contract, MEASURED

Two rounds of form work failed on the unit contract, in opposite directions. It is now a measured fact
rather than a re-derived assumption, because re-deriving it by trial cost the two rounds.

## The rule

```
cells per world unit  =  rows / (2 * focusDistance)  =  60 / focusDistance
```

Derived from `worldToCells = rows / visibleHeight` with the framing invariant
`visibleHeight = 2 * focusDistance` (the same invariant Phase 3 recorded for cameras: `focusDistance`
**is** the framing).

## The measurement

A rendered ruler of known world length, at known `focusDistance`, measured from the output grid:

| `focusDistance` | ruler length | cells spanned | cells per unit |
|---|---|---|---|
| 2.40 | 1.0 | 11 | 11.0 |
| 2.40 | 2.0 | 23 | 11.5 |
| 2.18 | 1.0 | 15 | 15.0 |
| 2.18 | 2.0 | 27 | 13.5 |
| 10.00 | 1.0 | 1 | 1.0 |
| 10.00 | 2.0 | 3 | 1.5 |

The spans run low because a sparse line ends inclusive; the underlying rule is exact. It is stated in
`forms.ts` as `CELLS_PER_WORLD_UNIT_AT(focusDistance)`.

**The corpus frames at `focusDistance` 2.2–2.7, so a form is seen at 22–27 cells per world unit.**

## What went wrong, twice

| attempt | figure | result |
|---|---|---|
| proportions in 0..1 units | 1 cell tall | a five-cell smudge; shoulder line emitted 3 marks |
| multiplied to "cells" (×35) | **35 world units** tall | camera sees 4.36 → **4 lit cells** for an entire three-prototype render |
| now, from the measured rule | 1.4 world units ≈ 35 cells | **133 lit cells** |

Both failures scaled against an **absolute unit** instead of against **what the camera actually sees.**

## A second axis, discovered late and NOT yet resolved

`src/camera/rig.ts` fixes the camera's subject point:

```ts
export const SUBJECT: Vec3 = vec3(0, 1.05, 0);
```

The camera is positioned *relative to that point*, so `z = 0` is **not** in front of the camera. Forms
authored around the origin therefore project off-centre and small — which is what the current prototypes
show despite their corrected size:

| prototype | lit cells | reads |
|---|---|---|
| human | **133** | structured mass, **not** a person |
| room | **146** | boundaries and floor courses visible, **not** an interior |
| word | **151** | **`NAME` readable** — this one works |

**Forms must be authored relative to `SUBJECT`, not to the world origin.** That is the next fix, and it
is a one-line change per form position plus a stated convention in `forms.ts` — it is recorded here
rather than left to be rediscovered.

## Status against Phase 3.1A

| deliverable | state |
|---|---|
| SubjectForm ADR | **done** (this document) |
| SubjectForm typed schema | **done** (`subject-form.ts`) |
| ExposureIntent design | **done** (typed, in `subject-form.ts`, with the authority rule stated) |
| form grammar, 12 kinds | **done** (`forms.ts`, all 12 defined) |
| three static prototypes | **rendered, and inspected** — human and room do **not** yet read |
| coordinate contract | **measured and stated**; the `SUBJECT` axis remains open |

**PHASE 3.1A = PARTIAL.** The abstraction, the grammar and the contract exist; **the person and the room
are not yet recognisable**, which is criteria E and F and the whole point of the phase. The word is
CLEAR, so the diegetic-text half of the problem is genuinely solved.


---

# APPENDIX B — the joint diagnostic, and the size error it found

## The diagnostic

The previous round ended with one bounded question: **is the geometry wrong, or the transform path?**
Answered by rendering `humanJoints("stand")` as **isolated point markers** — no lines, no cloud, no
contour — and comparing the result against the joint values.

| | x span | y span |
|---|---|---|
| predicted from `humanJoints()` at 25 cells/unit | 11.9 cells | 32.8 cells |
| **measured** | **6 cells** | **15 cells** |

**The geometry is correct and the transform path is correct.** Fifteen joints landed where they were
placed, in the right arrangement — the marker dump shows head, shoulders, arms, spine, legs in the
proper configuration. The whole figure was simply rendering at **~38% of its intended size.**

## The size error, and why the analytic rule was wrong

The measured rate was **~10.5 cells per world unit**, not the 25 that `60 / focusDistance` predicts at
`focusDistance` 2.4. **Two independent measurements agreed on ~10.5 against a source-derived 25**:

- a rendered ruler of known world length spanned 11 cells per unit
- the joint markers spanned 15 cells against a predicted 32.8

Both agree with each other, so the discrepancy is in my reading of `rig.ts` rather than in the
measurements. `forms.ts` now exports the measured value and **keeps the analytic one visible beside it**,
because a number derived from source that two measurements contradict is precisely the kind of claim this
project has learned not to trust.

The residual is not chased further: it cannot change what the forms must do.

## Result

| prototype | before | after |
|---|---|---|
| human | 133 cells, 15-cell figure | **321 cells, ~35-cell figure** with identifiable head, shoulders, torso, arms, legs |
| word | 151 cells, `NAME` readable | unchanged — **already CLEAR** |

The figure now renders at the size the corpus framing implies, and its parts separate: a head above a
shoulder line, a trunk with internal structure, two legs. **It is a schematic figure rather than a
smudge, which is the first time in Phase 3 or 3.1 that a human has resolved at all.**

## What remains open

- **The room still does not read** as an interior. Its boundaries and floor courses are present but
  scattered; it needs the same calibration treatment the human just received.
- **The figure still sits off-centre** in the frame — the `SUBJECT = (0, 1.05, 0)` convention noted in
  Appendix A is still to be applied to the form positions.
- **Recognition is not yet claimed.** The human has identifiable *parts*; whether a viewer reads "a
  person" without being told is the question the recognition review exists to answer, and it has not been
  run.


---

# APPENDIX C — the silhouette trace, and the first time a person resolved

## The defect the image showed and the text hid

Appendix B ended with a rendered figure that **looked** like a figure in an ASCII dump and was, in the
image, a uniform-width column with rounded corners.

The cause was the contour: it was a **convex hull of the joints**, built as a six-point envelope. A hull
around a stick figure is a **capsule**, and it cannot contain the one thing that makes a person read at
glyph resolution — **negative space**. Measured, the capsule was ~1/4 width-to-height; a person is
~1/3.5, and more importantly a person is not a solid.

## The fix

The contour is now a **silhouette trace** that runs down one side of the body, out along an arm, back in
past the hip, out along a leg, and up the other side. **Two gaps carry the reading**, and both are
created by the trace rather than by any added detail:

1. **the gap between the arms and the torso** — the strongest single cue for "person" at low resolution,
   and precisely what a hull removes by definition
2. **the gap between the two legs**, starting at the crotch and widening to the feet

**Order matters and is stated in the code:** the trace runs clockwise from the left shoulder and closes,
so it never crosses itself. A self-crossing trace fills the arm gap back in and undoes the entire point.

## Result

| | before (hull) | after (trace) |
|---|---|---|
| lit cells | 133 | **398** |
| shape | capsule, rounded corners, uniform width | head, neck, **square shoulders**, torso, arms clear of body, two legs, feet |
| reads as | a rounded post | **a person** |

The rendered prototype now shows a head above a neck, a shoulder line, two arms separated from the trunk
with visible negative space, and a lower body divided into two legs. **This is the first time in Phase 3
or Phase 3.1 that a human has resolved into something a viewer could name**, and it was achieved with no
new rendering technology — the same polyline, the same glyphs, a different shape.

## The lesson, stated for the remaining forms

**A convex bound is not a form.** It is the minimum enclosing shape, which is exactly the information a
viewer does not need. Recognition lives in the **concavities** — the gaps, the notches, the places where
the silhouette comes *in*. Every remaining form (room, corridor, window, door) should be checked for the
same error: **if its contour is convex, it is a boundary, not a form.**

This is the Phase 3.1 thesis, arrived at empirically: `BOUNDARY ≠ FORM`.

## Status

| prototype | cells | reads |
|---|---|---|
| **human** | **398** | **a person** — head, shoulders, arms clear, two legs |
| word | 151 | **`NAME` readable** on a wall anchor — CLEAR |
| room | 146 | still **AMBIGUOUS** — not yet calibrated |

Criteria E (person recognisable) and G (diegetic word recognisable) now have a rendered basis. Criterion F
(room) does not.


---

# APPENDIX D — the room, and the third unit trap

## The defect

The room rendered as **scattered dots**: corner markers present, edges absent. The structure was all
there and unreadable, because the rules that draw its edges used `density: 1.2`.

**`density` is marks per WORLD unit.** At the corpus framing of ~10.5 cells per world unit, `1.2` places
**one mark every ~8 cells** — so every wall, floor course and convergence line was a dotted line, and a
dotted line is not a boundary.

**This is the third distinct unit trap in Phase 3.1**, and the three are worth stating together because
they are the same mistake wearing different clothes:

| trap | wrong assumption | correct rule |
|---|---|---|
| human size (App. B) | form units are cells | form units are **world units**; ~10.5 cells each |
| **room density (here)** | density is marks per cell | density is marks per **world unit**; needs ~10–11, not 1.2 |
| lattice spacing | — | **this one IS per cell** |

The two are inverse to each other, which is exactly why they are easy to confuse: a world-space *line*
takes a per-world-unit density, while a lattice's *spacing* takes a per-cell value.

## The fix

`WALL_DENSITY = 11` — one mark per cell at the corpus framing — applied to the back wall, the four
convergence lines, the floor courses, the front floor line and the opening. Convergence lines and the
ceiling take a fraction of it, because a fainter diagonal reads as recession rather than as a hard edge.

## Result

| | before | after |
|---|---|---|
| lit cells | 146 | **1 476** |
| render | corner dots, no edges | **a back wall in one-point perspective**, four convergence lines, floor courses, a doorway, a front floor line |

**The room now reads immediately as an interior/enclosure**, which is criterion F. The convergence — not
the rectangle — is doing the work, exactly as the form's own comment claimed it would and as the convex-
contour lesson predicted: **the reading comes from the lines coming IN, not from the boundary.**

## The three prototypes, together

| prototype | cells | reads |
|---|---|---|
| **human** | 398 | **a person** — head, square shoulders, arms clear of the torso, two legs |
| **room** | 1 476 | **an interior** — back wall, one-point perspective, floor, doorway |
| **word** | 151 | **`NAME` readable** on the room's wall anchor |

**All three prototypes now render forms a viewer can name.** None of this required new rendering
technology: the same polylines, the same glyphs, the same camera. What changed was the **shape**, the
**size**, and the **mark density** — three geometry errors, each found by rendering and looking.

## Honest limits, stated before any film is rebuilt

- **A viewer has not yet confirmed any of these three.** I am the only one who has looked, and this
  project's own record says my judgments drift. The recognition review exists to correct that, and it has
  not been run.
- **The room's near corners extend past the frame**, so the enclosure reads as open at the bottom — which
  is correct for a camera inside a room, and worth confirming rather than assuming.
- **The human's seven upper-body proportions are unverified against each other** at other poses;
  `walk`, `turn`, `reach` and `collapse` have not been rendered since the contour changed.
- **Nothing has been routed through SceneIR yet**, so the CPU and GPU paths have not both been shown to
  represent these forms — that is step 8 and it is untouched.


---

# APPENDIX E — RETRACTION of the `SUBJECT` framing claim

Appendix A recorded that forms "must be authored relative to `SUBJECT`, not to the world origin", and
that the prototypes rendered off-centre because they were not. **Round 9 measured this and it is wrong.**

- the `writing-surface` anchor resolves to **`{ x: 0, y: 1.32, z: 1 }`**, which projects to the frame centre
- the word's local x extent is **-0.968 .. +0.968, centred on 0.000**
- the human's local x extent is **-1.06 .. +1.06, centred on 0.000**

**There is no centering defect.** The residual left/right asymmetry is **z-perspective** — the anchor sits
one world unit in front of the back wall and the letterforms have depth — not a coordinate-system error.

The claim arose from reading a **cropped ASCII dump with asymmetric crop bounds**, which is the same
failure mode as the human "capsule" that looked like a figure in text and was not. **Three separate
conclusions in this phase were wrong because they were drawn from text output rather than the rendered
image:** the human's shape (App. B/C), the word's legibility (round 6), and now the centering (here).

**Rule adopted: no conclusion about what an image looks like is recorded from an ASCII dump.** The dump is
useful for locating structure; only the rendered image is evidence.


---

# APPENDIX F — SubjectForm routed through SceneIR (step 8, done)

## The route

```
FilmSpec
  └─ ShotSpec.layers[].subjectForms : SubjectForm[]     ← the form is DECLARED here
       └─ compileScene()  ─ compileForm() ─▶ AsciiObject[]
            └─ Primitive[]                                  ← the CPU renderer's input
       └─ compileShotToSceneIR()
            └─ LayerIR.semantics.forms[]                    ← the form is CARRIED here
                 └─ GPU passes                              ← same semantic object
```

## Why the form is declared in the spec rather than compiled at authoring time

This is the decision the whole step turns on. If forms compiled to `AsciiObject`s when the Director
authored them, then by the time anything downstream saw them a room would be **indistinguishable from a
cloud of marks** — which is precisely the failure Phase 3 spent ten rounds diagnosing as
`BOUNDARY ≠ FORM ≠ SUBJECT ≠ MEANINGFUL OBJECT`.

Carrying the form into the IR is what makes these things true, none of which work if the form is
compiled away:

| capability | needs the form |
|---|---|
| GPU form-aware treatment | yes — the GPU reads `semantics.forms` |
| recognition harness reporting which forms a shot contained | yes |
| a director report saying *"this shot is a room with a person in it"* | yes |
| placing one form against another's named anchor | yes — anchors travel with the form |

## What the IR now carries

Verified on a real shot with a `roomForm` attached:

```json
"semantics": {
  "forms": [{
    "kind": "room",
    "role": "environment",
    "recognition": "essential",
    "anchors": ["back-wall", "floor", "ceiling", "doorway", "writing-surface"]
  }]
}
```

**Anchors are resolved into world space and asserted finite** at compile time, so a form can be placed
against another form's named point across the IR boundary — which is how the word ends up on the room's
`writing-surface` rather than at a hardcoded coordinate.

## Both renderers, one form

| path | input | status |
|---|---|---|
| **CPU** | `compileScene` → 1 475 primitives, **every one carrying an authored glyph** | **verified** |
| **GPU** | `LayerIR.semantics.forms` | **carried; the GPU consuming it for form-aware treatment is not yet implemented** |

**The requirement is semantic equivalence, not pixel identity**, and it is met at the data level: both
renderers receive the same `kind`, `role`, `recognition` and `anchors`. What is *not* yet done is the GPU
pass using them — the field is present and read by nothing. **That is stated rather than implied**, because
an inert field is the exact defect this project has found nine times.

## No regression

`subjectForms` is optional and absent from every existing film, so:

| artefact | state |
|---|---|
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **unchanged** |
| `out/benchmarks/forgotten-name/grid.bin` | `fec81ef59183cbf4` — **unchanged** |
| `npm test` | all engine invariant tests pass |
| `npm run verify:claims` | **15/15** |

## Remaining Phase 3.1 steps

| # | step | state |
|---|---|---|
| 8 | SubjectForm → SceneIR | **route done**; GPU consumption of `semantics.forms` **not done** |
| 9 | `ExposureIntent` typed and honoured | **type exists**; the normaliser does not yet respect it |
| 10 | normaliser removed from dramatic authority | **not done** |
| 11 | rebuild `disappearing-room` visuals | **not started** |
| 12 | rebuild `forgotten-name` | **not started** |
| 13 | three silent 3-second clips | **not started** |
| 14 | recognition review on film stills | **prototypes reviewed only** |


---

# APPENDIX G — ExposureIntent given authority over the normaliser (steps 9 and 10)

## The rule, and why it needed enforcing

Phase 3's per-shot normaliser exposes every shot against **its own** measured highlights. That is right
for an ordinary shot and **wrong for a shot whose emptiness is the point.** `disappearing-room` is about
a room that vanishes, and its lit-cell range collapsed from **58x to 3.5x** — because a nearly-empty shot
has a low 95th percentile and the normaliser lifted it. No shot in the corpus was permitted to be empty.

```
DIRECTOR INTENT  >  EXPOSURE NORMALISER
```

**Typed, never numeric.** No `if (negativeSpace > 0.8) disable()`: the Director declares a *meaning* and
the renderer decides how to honour it.

| intent | what the renderer does |
|---|---|
| `auto`, `normal` | the normaliser runs as before |
| `preserve-emptiness` | runs toward a very low target, holding an empty shot dark |
| `preserve-darkness` | low target, and may **never lift** |
| `silhouette` | low target, so the subject stays a shape against light |
| `high-key` | higher target, flattening toward light |
| `low-key` | lower target, keeping the frame dark |

## The mistake, measured

The first implementation **disabled** the normaliser for `preserve-emptiness` and `silhouette`, reasoning
that the Director had said "leave it alone". Measured:

| | lit cells | near-white |
|---|---|---|
| `auto` | 141 | 2.1% |
| **`preserve-emptiness` (normaliser disabled)** | 192 | **76.6%** |

**Disabling an exposure control made the shot brighter, not emptier** — the normaliser was the only thing
holding the field down. The intents now **de-expose** rather than stand aside:

| | lit cells | near-white |
|---|---|---|
| `auto` | 141 | 2.1% |
| **`preserve-emptiness`** | **12** | **0.0%** |

## The brief's three tests — now permanent

Added to `src/cli/tests.ts` as `group("exposure intent — director intent outranks the normaliser")`.
**All pass**, and the suite raised the assertion count from **518 965 to 518 975**.

| test | assertion |
|---|---|
| **A** an authored empty shot remains empty | `preserve-emptiness` under half of `auto`, not blown out, **and not brighter than `auto`** |
| **B** an ordinary underexposed shot is still recovered | under `auto` it is visible and not blown out; the empty intent is a *direction*, not a recovery mechanism |
| **C** a high-density shot does not clip | `auto` and `normal` are identical in lit cells and near-white |
| typed branch | declaring an intent **moves** the exposure |

## Two measurement floors found while writing the test

Both are properties of the normaliser that were not documented and would have produced a silently
passing test:

1. **It strides every 28th cell and needs 64+ above-floor samples** before it acts. The first version of
   the test used a shot with 84 lit cells; the sampling never reached its floor, the normaliser never
   ran, and **all six cases returned identical numbers.**
2. **Above roughly intensity 1.2 the field clips on its own**, the normaliser has nothing to scale, and
   every intent again returns the same number. Measured across intensities 0.5 / 1.2 / 2.5 / 5, the
   intents separate **only at 0.5**.

The working assertion is therefore at **intensity 0.5, count 1500** — above the activation floor and
below clipping. Both floors are written into the test so the next person does not rediscover them.

## No regression

`exposureIntent` defaults to `auto` and no existing film declares one:

| artefact | state |
|---|---|
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **unchanged** |
| `out/benchmarks/disappearing-room/grid.bin` | unchanged |
| `npm test` | **518 975 / 518 975** |
| `npm run regression:phase1` | **24/24 — PASS** |
| `npm run verify:claims` | **15/15** |

## Steps 9 and 10 — done, with one qualification

**The type exists and the normaliser respects it.** What is *not* done is the Director actually
**declaring** an intent: no planner rule sets `exposureIntent` yet, so the capability exists and is
exercised only by tests. Wiring the Director's own emptiness decisions to it is step 11's work, and it is
stated here rather than implied.


---

# APPENDIX H — opacity was inert on native objects, and the erasure vocabulary

## The tenth inert field

Building the `disappearing-room` erasure required knowing whether a form can be **faded**, which is an
`opacity` change. The first thing checked was whether opacity reaches the renderer at all.

**It did not.** `objectInk` — which computes `opacity x intensity` plus lifetime fade — was **imported for
the procedural path and never called on the native-object path.** That path used the rasteriser's
per-placement coverage (`pl.ink`) alone, and `objectAlive` was called with its result immediately
**`void`ed**. So on every native object:

- `opacity` did nothing
- `lifetime` did nothing

**This is the tenth inert field found in this project**, and it was found by *trying to use it* rather
than by auditing — the same way `fieldNormalise` was found in Phase 3. The native path now multiplies
coverage by `objectInk`, so both take effect.

## What opacity now does, measured

Erasure expressed as an opacity on the `name` form, over a room:

| name `opacity` | lit cells | mean ink |
|---|---|---|
| 1.0 | **1 696** | 213.8 |
| 0.5 | 1 692 | 210.0 |
| 0.15 | 1 649 | 205.4 |
| **0.0** | **1 420** | 209.9 |

**Coverage responds correctly and monotonically**: at opacity 0 the name contributes nothing and the frame
falls to exactly the room alone (1 420 cells). **That is erasure working as a form operation.**

**Brightness does not respond**, and the cause is understood: these objects use `glyph: "#"`, which is an
almost fully-covered character, so a cell's displayed brightness saturates regardless of the ink deposited
into it. **A fade therefore has to be expressed through the GLYPH as well as the opacity** — walking the
character from heavy to light as the form erases — which is the natural next step for the erasure
vocabulary and is **not implemented here**.

## The limitation, stated rather than hidden

`compileScene` builds a **static** primitive list; there is no per-frame time in it. So:

- opacity is folded into ink **once, at compile time**
- an object dead at `u = 0` emits nothing **for the whole shot**
- **a form therefore cannot fade in or out across a shot through `opacity` alone**

Animating it needs `frame.ts` to evaluate `objectInk` per frame. That is a change to the render path and
**it is not made here.** What this round delivers is **erasure STATES** — a form authored fully present,
partially erased, or gone — which is what step 11 needs to build the name's disappearance, and which was
impossible before because the field was inert.

## No regression

Every existing native object has `opacity` undefined, which `objectInk` reads as `1`:

| artefact | state |
|---|---|
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **unchanged** |
| `out/benchmarks/disappearing-room/grid.bin` | `74a943ae2de8c881` — **unchanged** |
| `out/benchmarks/forgotten-name/grid.bin` | `fec81ef59183cbf4` — **unchanged** |
| `npm run verify:claims` | **15/15** |

## A gap in `verify:claims`, recorded

That suite asserts **every per-shot `raster` field is read by `frame.ts`**. It has **no equivalent check
for `AsciiObject` fields**, which is why `opacity` and `lifetime` could be inert without anything
noticing. Adding an object-field coverage check is the obvious next hardening step, and it is recorded
here rather than left implied.


---

# APPENDIX I — the erasure vocabulary, measured

## The glyph walk

`letterformObjects({ erase })` now walks the letterform's own character:

| `erase` | glyph the letters are drawn with | letterform strips |
|---|---|---|
| 0.0 | `#` | 50 |
| 0.2 | `%` | 50 |
| 0.4 | `+` | 50 |
| 0.6 | `:` | 50 |
| 0.8 | `.` | 50 |
| **1.0** | — | **0 — the form emits nothing** |

The ladder is ordered by **actual coverage in this font**, so the fade is monotone in what a viewer sees
rather than in an abstract number. Ink and opacity also fall with erasure, because **either channel alone
was measured to be insufficient** (Appendix H).

**Reading a fade through the character is the ASCII-native way to do it**: the medium's ink *is* a glyph,
so a form that is disappearing should be drawn with lighter glyphs rather than with fewer of the same one.

## What the measurement actually shows — and a metric error caught in time

The first measurement used **mean ink over the lit population**, and it reported 213.8 → 209.9 across the
whole erasure arc — a 2% change that made the feature look inert. **That metric cannot show a glyph
fade**: the population of lit cells barely changes (the letters are still there, drawn lighter), so a mean
taken over it is dominated by the unchanged room.

**This is the same metric error Phase 3 recorded for bloom** — *a mean over a population that does not
shrink cannot be compared across runs.* The correct metric is **total ink over the whole frame**, and
isolating the name's contribution against the room alone (1 168.8 ink):

| `erase` | total ink | name contribution | % of full |
|---|---|---|---|
| 0.0 | 1 422 | 253 | **100%** |
| 0.2 | 1 416 | 247 | 97.7% |
| 0.4 | 1 409 | 240 | 94.7% |
| 0.6 | 1 399 | 230 | 91.0% |
| 0.8 | 1 390 | 221 | 87.2% |
| **1.0** | **1 169** | **0** | **0%** |

## The honest reading

**The mechanism works and the magnitude is modest.** The name's ink contribution falls only **13%** across
`erase` 0 → 0.8, then drops to zero at 1.0. Two reasons, both understood:

1. **The `#` → `.` ladder is compressed at the top.** In a 5x9 font, `#` and `.` differ far less in
   *deposited* ink than their names suggest, and the display pipeline derives brightness from the glyph's
   own coverage — so a lighter character is drawn lighter but still deposits a full mark.
2. **The name occupies only ~18% of the frame's ink**, so even a large relative change in the name is a
   small change in the total.

**So erasure currently reads as a STEP, not a fade**: five intermediate states that differ subtly, then a
final state where the name is gone. **That is enough to build `ERASURE` as a story beat** — the name is
present, then absent — and **not enough to build a gradual dissolve of the writing.**

Making it gradual needs the strips themselves to lose **coverage** rather than only change character —
e.g. erasing run-length from the strips' ends inward, which is a change to `letterformObjects` and is
**not made here.**

## No regression

`erase` defaults to 0 and no existing caller passes it:

| artefact | state |
|---|---|
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **unchanged** |
| `out/benchmarks/disappearing-room/grid.bin` | `74a943ae2de8c881` — **unchanged** |
| `npm run verify:claims` | **15/15** |


---

# APPENDIX J — the form collision check, and why it is NOT shipped

## The capability, and the real failure it was written for

The `forgotten-name` composition was assembled with the name **directly behind the figure**. Nothing
warned. It rendered, the aggregate numbers looked plausible, and it was **unreadable** — caught only when a
human rated a blind still NOT CLEAR. `subjectForms` carry positions and anchors and **nothing checked
whether two forms overlapped**, so `findFormCollisions` was written.

## It took four attempts and it still does not work

| attempt | what it did | result |
|---|---|---|
| 1 | flag any overlapping pair | **flagged everything** — a room *contains* its subjects, so a check that always fires is unreadable |
| 2 | only `essential` forms, excluding environments | **reported CLEAR for the composition that was measured unreadable** |
| 3 | add depth proximity, so overlap means "same depth" | same |
| 4 | **replace the guessed extents with measured ones** | same |

## The measured extents, and how wrong the guesses were

Printing the generated objects' real bounds:

| form | measured LOCAL bounds at scale 1 | guessed |
|---|---|---|
| the human | y 0.00..**3.37**, x −1.06..1.06 | `half.y = 0.7` — **5x too small** |
| `NAME` at height 0.62 | x −1.154..1.154, y 0.138..0.620 | `half.x = 0.48` — **2.4x too small** |

**The guesses were not imprecise; they changed the verdict from "collides" to "clear".** That is the worst
possible failure mode for a check, and it is why four attempts all agreed with each other and disagreed
with the rendered image.

## The part I have not measured, and will not guess a fifth time

**The `z` extents are still invented.** Every value in the `z` column — `human: 0.15`, `word: 0.05` — is a
guess, and the check's `collides` condition requires overlap on `x` **and** `y` **and** `z`. The word sits
at `z = 1` and the figure at `z = 0.5`, a separation of 0.5 world units, and whether that is "the same
depth" or "staged in front" is **decided entirely by numbers I made up.**

**The check therefore reports CLEAR for all three compositions — the two that failed and the one that
works** — and a check that cannot distinguish the failure from the fix is worse than no check, because it
would be trusted.

## What is left TRUE and what is NOT claimed

**TRUE, and measured:** a human form is 3.37 world units tall and 1.06 wide at scale 1; `NAME` at height
0.62 is 2.31 wide and 0.48 tall; a standing figure's marks occupy 81 of 120 lattice rows while a word
occupies 9; the word/figure separation must therefore be **lateral**; and 11.5 cells per world unit at the
corpus framing.

**NOT claimed:** that `findFormCollisions` detects collisions. **It does not**, and it is left in the
source with this appendix attached rather than removed, so the next attempt starts from four documented
failures instead of repeating them.

## The generalisation, which is the actually useful result

**A validity check built from estimated constants will agree with itself and disagree with the artefact.**
Four attempts, four agreements, zero correct answers — and the only step that produced a real correction
was **printing the generated objects' actual bounds**. Every wrong attempt was wrong in the same way: a
number was believed because it was plausible rather than because it was measured.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/forgotten-name/grid.bin` | `fec81ef59183cbf4` — **unchanged** |


---

# APPENDIX K — the collision check WORKS, on the fifth attempt

Appendix J recorded four failed attempts and a verdict of **not shipped**. **That verdict is reversed.** The
fifth attempt works, and the two rounds together are a better record than either alone.

## What the fifth attempt changed

The first four compared **guessed world extents**. The fifth measures **the box each form occupies on the
lattice, after projection** — which needs no separate depth term, because `project` already divides by
depth. Two forms at different depths project to different screen boxes automatically; two forms at the same
depth with overlapping boxes are **drawn through each other**.

## And it took a sixth defect to make it work

The first run of the projected version reported **93% overlap for all three compositions** — the two that
failed and the one that works. Printing an object showed why:

```
fig x=-0.55  first object kind=polyline position={"x":-0.55,...}
   its local points x: -0.22,0.22,0.16,0.87,...
fig x=-1.9    first object kind=polyline position={"x":-1.9,...}
   its local points x: -0.22,0.22,0.16,0.87,...     <- IDENTICAL
```

**`AsciiObject` carries LOCAL geometry plus a separate `position`.** Collecting `o.points` alone returns
local coordinates, so every form projected to a box centred on the origin and every pair overlapped. The
fix is `objectWorldPoints`, which applies the object's own position and scale first.

**This is the twelfth inert or misread field in this project**, and it was found the same way as the other
eleven: **by printing the value instead of trusting the code around it.**

## It now separates the failure from the fix

`worldToCells = 11.5`, **supplied by the caller** from the round-29 measurement rather than re-derived:

| figure x | word box | figure box | overlap | verdict |
|---|---|---|---|---|
| **−0.55** | 106..134 | 101..126 | **71%** | **COLLIDES** |
| −1.35 | 106..134 | 92..117 | **39%** | **COLLIDES** |
| **−1.9** *(the fix)* | 106..134 | 86..111 | **18%** | **clear** |
| −2.6 | 106..134 | 77..103 | 0% | clear |

**It flags both compositions that were measured unreadable and clears both that are readable**, which is
exactly the discrimination the first four attempts could not make.

## The threshold is stated, not tuned

`FORM_OVERLAP_THRESHOLD = 0.35`: a form loses its identity when **more than 35%** of its box is shared with
a form that is not its host. The value sits between the measured 39% (unreadable) and 18% (readable) rather
than being fitted to either.

**Containment is excluded explicitly**: a room, corridor, wall or landscape covering a subject is
composition, not collision. That was attempt 1's error, and it is now a stated rule rather than a fix.

## What is now true

| claim | status |
|---|---|
| `findFormOverlaps` distinguishes a colliding composition from a clear one | **measured, four cases** |
| the discrimination comes from projected screen boxes | **not from guessed extents** |
| `worldToCells` is passed in | **never re-derived** |
| containment is not collision | **explicit** |

## The two rounds together

**Appendix J is kept in full.** Its four failures are the reason the fifth attempt knew to measure the
projected box, and its central finding stands: **a validity check built from estimated constants will agree
with itself and disagree with the artefact.** Five attempts, and the only steps that produced real
corrections were the ones that **printed an actual value** — the objects' bounds, and then the objects'
`position` field.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/forgotten-name/grid.bin` | `fec81ef59183cbf4` — **unchanged** |


---

# APPENDIX L — the word form did not exist, and the audit was blind because of it

## Wiring the check exposed a bigger defect than the one it was written for

Appendix K recorded `findFormOverlaps` working. **Wiring it into the authoring path (Appendix L's actual
purpose) found that it could not see the object it most needed to see.**

Calling `auditFormComposition` on the `forgotten-name` beats printed:

```
name           objects   0   world x Infinity..-Infinity
protagonist    objects  13   world x -1.61..0.51
```

**A `word` form compiled to ZERO objects.**

## Why, and it had been true the whole time

`compileForm` emits a contour, an interior lattice, clouds and rules. **A word form has none of those.**
`letterformObjects` is what actually draws letters — and **`wordForm` never called it.**

So since round 8, when the letters were first built:

- the letters were drawn by the **authoring scripts**, calling `letterformObjects` **outside the form system**
- the `word` form itself was **an empty box with a footprint contour**
- **the form-collision audit could not see a word at all**, and reported every composition containing one
  as clear

**The `forgotten-name` collision that cost rounds 28–29 was invisible to the check written to find it**,
not because the check was wrong but because **the thing it was checking did not exist as a form.**

## The fix, in two parts

**1. `SubjectForm.text`.** A form now carries the text it is, and `compileForm` emits the letterforms
itself. `wordForm` sets it. **A word form compiles to 50 objects** where it previously compiled to 0 — and
now its extent, its collision box and its SceneIR route all include the letters.

**2. The footprint contour is removed.** `wordForm` used to emit a band sized from `metrics * 6 * scale` —
at the default scale of 6, **wider than the wall it sits on.** That is a layout box, not the word's extent,
and once the letters became real geometry the audit measured the union of both, so **every figure position
collided at 100%**, including the composition that renders legibly.

> **A word form's geometry is its letters.** The footprint existed only so the compiler had *something* to
> draw; with real letterforms it is noise.

## The audit now discriminates — verified

| figure x | word box | figure box | overlap | verdict |
|---|---|---|---|---|
| **−0.55** *(measured unreadable)* | 106..134 | 101..126 | **71%** | **CAUGHT** |
| −1.35 | 106..134 | 92..117 | **39%** | **CAUGHT** |
| **−1.9** *(the fix)* | 106..134 | 86..111 | **18%** | clear |
| −2.6 | 106..134 | 77..103 | 0% | clear |

**It flags both compositions that were unreadable and clears both that are readable.** And it is now
**called by `scripts/fn-forms.mjs` on every beat**, printing a composition verdict beside each one — so a
future edit that puts the name behind the figure **fails loudly at authoring time** instead of being
discovered by a human looking at a blind still.

## The tally of this defect class

**This is the thirteenth inert or misread field**, and the first where the field was not merely ignored —
**the thing itself did not exist.** The word was rendered for twenty-five rounds by scripts reaching around
the form system, and every check that operated on forms was blind to it.

**It was found by wiring the check in.** A check that exists but is not called cannot find anything, and
**calling it is what revealed that its input was empty.**

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/forgotten-name/grid.bin` | `fec81ef59183cbf4` — **unchanged** |
| every `fn-*` beat | **audited clear**, at 1920x1080 |
