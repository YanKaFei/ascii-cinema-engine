# PHASE 3.1 RECOGNITION REVIEW

**Method.** Rendered stills were inspected **without labels, titles or metadata** in a single unlabelled
contact sheet, in a fixed but non-obvious order, so that the form that produced each image was not known
at the moment of viewing. The question asked of each was the brief's question:

> **Without FilmSpec or metadata: what object would a viewer say this is?**

Ratings: **CLEAR** / **AMBIGUOUS** / **UNREADABLE**.

---

## ⚠ THE INSPECTOR IS THE AUTHOR

The brief's recognition test presumes a viewer who did not build the forms. **This review was performed
by the same agent that wrote `forms.ts`**, and that is a material limitation, not a footnote:

- I know what each form is *supposed* to be, so I am the most likely to see it
- this project's own Phase 3 record contains **sixteen wrong claims**, every one a summary written by
  this agent and found wrong by later audit
- the Phase 3.1 target is a viewer who **cannot** be told

**Therefore a CLEAR rating below is evidence of nothing more than "the author, primed, could name it."**
The ratings are recorded as a first pass and explicitly do not satisfy criterion M on their own. Passing
this criterion requires a second party, and that has not happened.

---

## Ratings

### 1. HUMAN — **UNREADABLE**

**What a viewer would say:** *"a vertical column of marks"*, *"a totem"*, or *"something tall and narrow"*.

The figure has the parts — head, shoulders, arms separated from the trunk, two legs — and at the rendered
scale they **do not compose into a person.** The negative space between the arms and body is present but
too thin to read; the whole occupies roughly **a quarter of the frame width to a third of its height**,
which is closer to a post than to a figure.

**The failure is proportion, not construction.** The skeleton is correct, the contour trace is correct,
and the individual features are all in the right places. The figure is simply **too narrow**, so the
silhouette's concavities — the thing that carried the entire reading in Appendix C — are each one or two
cells wide and disappear into the glyph grid.

**Rating: UNREADABLE.**

### 2. ROOM — **CLEAR**

**What a viewer would say:** *"a room"*, *"an interior"*, *"the inside of a box, in perspective"*.

This one works, and it works for the reason the form's own construction predicted: **the convergence
carries the reading.** The back wall sits inside the frame with four lines running out to the near
corners, floor courses recede toward it, and there is a visible opening. A rectangle alone would be a
frame; the lines coming *in* make it an enclosure.

**Rating: CLEAR.** This is the first criterion of Phase 3.1 met on the evidence.

### 3. WORD — **UNREADABLE**

**What a viewer would say:** *"a small mark on the wall"* or *"a detail"* — not *"a word"*.

`NAME` was rendered at a scale of 5 glyph-cells on the room's writing-surface anchor. With the room now
drawn at correct density and spanning the full frame, the word is **proportionally tiny** — the
letterforms occupy a few cells against a wall hundreds of cells wide, and they read as texture.

**This is a regression introduced by fixing the room.** When the room was under-drawn (146 cells), the
word was the most prominent thing in frame and read clearly. Correcting the room's density made the room
1 476 cells and left the word's absolute size unchanged, so it is now visually subordinate to the wall it
is written on.

**Rating: UNREADABLE** — and it falsifies the CLEAR rating I gave the word in the two preceding rounds,
which was measured against a room that was not actually drawing itself.

---

## Tally

| criterion | requirement | rating |
|---|---|---|
| person recognisable | **must be CLEAR** | **UNREADABLE** |
| room recognisable | **must be CLEAR** | **CLEAR** |
| diegetic word recognisable | **must be CLEAR** | **UNREADABLE** |

**PHASE 3.1 = PARTIAL.** Two of the three required forms fail the brief's own test, and the one that
passes does so only to a primed inspector.

---

## What this review changed

Three things, none of which were visible from the code:

1. **The word's CLEAR rating was false**, and it was false because it was judged against a
   **mis-rendered room**. A word is legible *relative to its surface*; the surface was not there yet, and
   fixing the surface removed the legibility. I had reported CLEAR twice before this.
2. **The human's problem is proportion, not structure** — which is a different fix from the one I
   applied last round, and would not have been found by reading the skeleton.
3. **The room is genuinely solved**, and it is the one form where the mechanism is understood rather than
   guessed: convergence, not boundary.

## Required before this criterion can pass

- a **second inspector** who has not written the forms, rating the same unlabelled sheet
- the **human widened** until its arm and leg gaps are several cells wide at the rendered scale
- the **word scaled relative to its host surface**, not in absolute glyph cells — a name on a wall must be
  sized as a fraction of the wall, which is the same class of error as the three unit traps already
  recorded

---

## Verdict

**PHASE 3.1A = PARTIAL.** The abstractions, the grammar, the ADR and the coordinate contract exist and
are measured. **One of three required forms is recognisable.** The review exists, which was itself a
required deliverable, and its first act was to falsify a claim in the previous round's report.


---

# ROUND 6 — two of the three fixed, re-measured

## HUMAN — UNREADABLE → **CLEAR**

The review diagnosed proportion rather than construction, and that was correct. The fix was a single
**lateral widening of 1.9x** (`humanForm({ widthBias })`), applied to every lateral joint coordinate with
vertical untouched, so the figure keeps its height and gains width.

| | before | after |
|---|---|---|
| lit cells | 398 | **464** |
| arm gap | 1–2 cells, disappearing into the grid | several cells, visible |
| leg gap | narrow | visible from the crotch to the feet |
| reads as | a vertical column, a totem | **a person** |

The rendered figure now shows a head above square shoulders, two arms held clear of the trunk with
**open negative space on both sides**, and a lower body divided into two legs. **This is a person**, and
it is the clearest of the three forms.

**The widening is stated as an explicit `widthBias` parameter rather than folded into the proportions
table**, because it is a deliberate departure from anatomy: the audience reads silhouette, not anatomy,
and this engine cannot afford anatomical slenderness.

## WORD — still **UNREADABLE**

Scaling the word to 22 glyph-cells did **not** fix it. Measured, the word still renders as a small mark
against a wall hundreds of cells wide.

**The reason is now clear and it is the fourth unit trap.** `wordForm`'s `scale` is passed to
`AsciiText` as a **glyph-cell size multiplier**, but the text object's *position* is the room's
`writing-surface` anchor in **world units**, and the projection then scales the whole thing by ~10.5
cells per world unit. So a `scale` of 22 produces letterforms whose size in cells is set by one unit
system while their placement is set by another, and the two do not compose.

**A name on a wall must be sized as a FRACTION OF THE WALL**, exactly as this review predicted one round
ago — not in absolute glyph cells. That is a change to `wordForm`'s contract, not to a number.

## Tally, re-measured

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **CLEAR** |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **UNREADABLE** |

**PHASE 3.1 = PARTIAL** — two of three required forms pass; the diegetic word does not.

## The four unit traps, together

They are one mistake in four costumes, and every one was found by rendering and measuring rather than by
reading code:

| # | trap | wrong | right |
|---|---|---|---|
| 1 | form size | form units are cells | form units are **world units**, ~10.5 cells each |
| 2 | line density | marks per cell | marks per **world unit** |
| 3 | lattice spacing | marks per world unit | marks per **cell** |
| 4 | **text scale** | glyph cells, positioned in world units | **must be a fraction of its host surface** |

Traps 2 and 3 are exact inverses of each other, and trap 4 is trap 1 applied to a hosted object. **The
unit contract in this engine is genuinely treacherous, and four separate features have now failed on it.**


---

# ROUND 7 — the word's real constraint, which is not the one I predicted

Last round I predicted the word failed because its scale was set in glyph cells while its position was in
world units, and that sizing it as a fraction of the wall would fix it. **That prediction was wrong, and
the measurements say so.**

## What was measured

The word was rendered at scales spanning three orders of magnitude:

| text `scale` | result |
|---|---|
| **22** | letterforms ~22 world units tall — **far larger than the entire room** (itself 7.2 units) |
| 0.55, 0.35 | **sub-cell mush.** Glyphs rasterise to about 1.75 x 3.2 cells and smear into blobs |
| 0.2 | same failure, smaller |
| **1** | **sharp but tiny** — `NAME` occupies about **4 cells** against a 240-cell frame |

**Two facts follow, and together they are the whole problem:**

1. **The only sharp size is `scale = 1`.** `rasteriseText` lays each font glyph out at its native
   **5 x 9** and multiplies by `scale`; any value other than 1 lands glyph pixels on fractional cells
   and destroys the letterform. **Scaling text is not available in this renderer at all.**
2. **At that one sharp size, a four-letter word is four cells wide** — roughly **1.7% of the frame**.
   Against a room spanning the frame, it is invisible as language.

**So `wordForm` cannot make a readable name by changing a number.** My "fraction of the surface" fix
addresses a real contract problem and would not have fixed this: there is no scale at which the current
font produces readable letterforms larger than one cell per glyph.

## What this means for criterion G

**The diegetic word cannot be made CLEAR through configuration.** It needs one of:

| option | what it costs |
|---|---|
| **a larger font** — a second typeface at 3x3 or 4x4 cell blocks, so one glyph occupies several cells and stays sharp | new font data; the current atlas is frozen for the Phase 1 baseline, so it must be an *additional* set, not a change to the existing one |
| **letterforms as native objects** — build `N`, `A`, `M`, `E` from polylines at any size | more code, but no font data, and it stays ASCII-native |
| **accept a small word** and compose the shot so the word is the subject | legitimate, and it is what the current corpus does — but it does not satisfy a recognition test that asks a viewer to read it without being told where to look |

I have not chosen between them, and I am not going to pick one and claim it works without rendering it.

## Also unresolved

**The `SUBJECT` framing offset.** `wordForm` places text at the room's `writing-surface` anchor, but the
rendered result sits **well right of centre**, consistent with the camera-subject convention recorded in
Appendix A and never yet applied. Every form placed by an anchor may be affected.

## Tally, unchanged

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **CLEAR** |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **UNREADABLE** |

**PHASE 3.1 = PARTIAL.**

## The honest summary of rounds 6-7

Two rounds were spent on the word. **The first produced a correct diagnosis of a real contract defect and
a wrong prediction about its consequence. The second found the actual constraint and did not fix it.**

That is worth stating plainly rather than reporting the contract change as progress: the contract problem
is real, its fix is necessary, and **it is not sufficient.** The measurement that mattered was rendering
the word at scale 1 and looking at it.


---

# ROUND 8 — the word, rebuilt as geometry, and now legible

## What was built

`letterformObjects` in `forms.ts`. It reads the **existing** typeface, run-length encodes each glyph row
into axis-aligned strips, and emits each strip as a closed polyline drawn with a printable character.

**Why this is the right shape of solution, against the three options round 7 listed:**

- **no new font data** — the current atlas stays frozen for the Phase 1 baseline, which a second typeface
  could not have done without risk
- **sharp at any size** — the output is geometry, so it never lands on fractional cells the way a scaled
  bitmap does
- **still ASCII-native** — every strip goes through the same polyline path every other form uses; the
  bitmap is used only as a *shape to be re-drawn*, never pasted into the field

**Strips rather than stroke skeletons, deliberately:** a skeleton needs per-letter anatomy and renders as
hairlines, while run-length strips reproduce the letterform's actual weight and stay legible when a glyph
is only a few cells tall.

## The tuning, which took three renders

| attempt | what it looked like |
|---|---|
| height 1.15, tracking 0.3 | a solid block of marks — the letters merged, and it sat **above the wall's top edge** |
| height 0.62, tracking 0.55 | letters separating, still heavy; `N` and `M` indistinguishable |
| **height 0.52, tracking 0.9, centred on the wall anchor** | **four distinct letterforms, `A`'s diagonal and `E`'s crossbars visible, sitting on the wall** |

**Density was the fourth unit trap again**: each strip edge is a fraction of a world unit tall, so
`density` must be `1 / cell` to place a mark on every edge, and that value scales with the letter size
rather than being a constant.

## Result

**`NAME` is legible as four letters on a wall.** It is a diegetic object: it has a position on a named
surface, a size relative to that surface, and it is drawn from the room's own `writing-surface` anchor —
so it moves with the room and can be erased with it.

| | |
|---|---|
| lit cells | 1 696 (room 1 476 plus the word) |
| reads as | **a word**, legible, on the wall of a room |

## Tally

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **CLEAR** |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **CLEAR** |

**All three required forms now render as recognisable things.**

**PHASE 3.1A is not yet PASS**, and the reasons are unchanged and important:

1. **The inspector is the author.** Every CLEAR above was given by the agent that wrote the forms. The
   brief's test presumes a viewer who cannot be told what to look for, and that has not happened.
2. **The `SUBJECT` framing offset is still unapplied.** The word renders **right of frame centre**
   despite being anchored at the room's centre — consistent with the camera-subject convention recorded
   in ADR Appendix A, which affects every anchor-placed form.
3. **Nothing is routed through SceneIR yet** (step 8), so the CPU and GPU paths have not both been shown
   to represent these forms.
4. **No film has been rebuilt**, which the brief defers until the prototypes read — and they now do.

## Rounds 1-8, honestly

Six of the eight rounds were spent on **unit and proportion errors**, not on subject semantics: form size,
line density, lattice spacing, text scale, and lateral proportion. **The subject-form idea itself worked
quickly** — the human resolved on the first attempt at a correct size, and the room on the first attempt
at a correct density.

**The engineering obstacle in this engine is not expressiveness. It is that four separate unit systems
(world units, glyph cells, marks-per-unit density, and text scale) meet in one place with no type
distinction between them.**


---

# ROUND 9 — the `SUBJECT` offset was a misdiagnosis, retracted

Rounds 6–8 carried a note that the word rendered *right of frame centre* and attributed it to the
camera-subject convention in ADR Appendix A, "affecting every anchor-placed form". **That attribution was
wrong and is retracted.**

## What the measurement shows

| quantity | value |
|---|---|
| `roomForm` anchor `writing-surface` | `{ x: 0, y: 1.32, z: 1 }` |
| word's local x extent | **-0.968 .. +0.968, centre -0.000** |
| room's back wall | symmetric about x = 0 by construction |
| human's local x extent | -1.06 .. +1.06, centre **0.000** |

**The anchor resolves to x = 0**, which projects to the frame centre, and the word is centred on that
anchor. There is no centering defect to fix. The residual left/right asymmetry is **perspective along z**
(the anchor sits 1 world unit in front of the back wall, and the letters have depth), not a
coordinate-system error.

**The original observation came from reading a cropped ASCII dump whose crop bounds were not symmetric** —
the same failure mode as the human's "capsule" that looked like a figure in text and was not. **This is
the third time in this phase that a conclusion drawn from ASCII output rather than the rendered image has
been wrong.**

## What is actually left on the prototypes

| item | state |
|---|---|
| word centred | **no defect** — retracted |
| human centred | offset by its own placement (`x = -0.9`); **that is a composition choice, not a bug** |
| all three forms render | **yes** — human CLEAR, room CLEAR, word CLEAR |
| SceneIR routing (step 8) | **not done** |
| reduction to film | **not started** |
| second inspector | **not available** |

## The tally stands

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **CLEAR** |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **CLEAR** |

**PHASE 3.1 = PARTIAL**, on two grounds that no further rendering can resolve:

1. **the inspector is the author** — the brief's test presumes a viewer who cannot be told, and every
   CLEAR above was given by the agent that wrote the forms;
2. **PHASE 3.1A is a prototype deliverable** — steps 8–14 (SceneIR routing, `ExposureIntent` wiring,
   empty-shot semantics, both film rebuilds, the three silent clips) are untouched, and the brief
   explicitly deferred them until the prototypes read. **They now read, and those steps are next.**

## Rounds 1-9 in one line

**The subject-form abstraction was never the hard part.** Nine rounds produced a working human, room and
diegetic word, and **seven of them were spent on unit errors** — form size, line density, lattice
spacing, text scale, lateral proportion, and one misdiagnosis drawn from text rather than pixels.


---

# ROUND 12 — the three forms composed into one shot (step 11, first pass)

`scripts/disappearing-room-forms.mjs` builds a single shot containing a **ROOM**, a **PERSON** and a
**NAME ON A WALL**, all from `SubjectForm`s: **82 native objects, 1 842 lit cells.** No film rebuild yet —
this is the composition test that step 11 depends on.

## What reads

| element | rating | why |
|---|---|---|
| **ROOM** | **CLEAR** | back wall in one-point perspective, four convergence lines, floor courses, front line |
| **NAME ON WALL** | **CLEAR** | four legible letterforms, centred on the wall, sized to it, and **inside the room's space** |
| **PERSON** | **UNREADABLE** | a faint vertical structure at frame left; present, but far too dim against the room |

## The failure, and its cause

The person is drawn correctly — the skeleton, the contour trace and the widening are all as verified in
rounds 5–8 — but it is **rendered too faint relative to the room and the letters.** Measured, the
composite is dominated by the room's 11-marks-per-unit edges and the name's 50 letterform strips.

**Two plausible causes, neither yet distinguished:**

1. **Anchor placement.** The person is positioned at `z = 2.2` — *downstage*, in front of the wall — which
   is right for the story but puts it at a different depth from the room's back wall. Its screen position
   and size have not been checked against the room's floor line, so it may be standing off the floor.
2. **Ink balance.** The room and the name both deposit at full intensity with high mark density; the
   person's 13 objects carry thinner coverage. Nothing balances them, and nothing is *supposed* to yet —
   that is the job of the shot's own exposure direction, which step 11 must declare.

**Neither is fixed this round.** Guessing between them without measuring is the error this phase has made
repeatedly, and it has a cheap test: render the person alone at the same `z = 2.2` and measure its screen
extent against the room's floor line.

## What this round establishes

- **`SubjectForm` composes.** Three forms, 82 objects, one coherent frame — the layer works as designed.
- **The room and the name hold their CLEAR ratings inside a populated shot**, not only in isolation. That
  matters: every previous CLEAR was measured on a prototype containing one form.
- **The person does not**, and that is now the single blocking item for step 11.

## Tally

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **UNREADABLE in composition** (CLEAR in isolation) |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **CLEAR** |

**PHASE 3.1 = PARTIAL.** A form that reads alone and not in company is not yet a form the Director can
use, and saying so is the point of running the composition test before rebuilding the film.


---

# ROUND 13 — the person's depth, measured; all three forms now read together

## The measurement that decided it

Round 12 left two candidate causes for the faint figure: **anchor placement** or **ink balance**. One
render distinguishes them — the person alone, at three depths, against a room whose back wall is at
`z = 0` and whose floor anchor is at `z = 1.6`.

| person `z` | lit cells | bbox x | height |
|---|---|---|---|
| **2.2** | 151 | **0..84** | **112 cells** |
| 0.5 | 614 | 88..117 | 67 cells |
| 0 | 479 | 94..118 | 53 cells |

**It was anchor placement, and the number is decisive.** At `z = 2.2` the figure is **112 cells tall and
clipped at the left frame edge** — it was never faint, **most of it was off-screen.** Chasing "ink
balance" would have been the fifth unit error in this phase.

`z = 0.5` puts a complete **67-cell figure centred in the room**, correctly proportioned against a
3.6-unit back wall.

## The result

`out/phase31/shot-room-person-name.png` — **2 176 lit cells, 82 native objects:**

| element | rating | what is on screen |
|---|---|---|
| **ROOM** | **CLEAR** | back wall in one-point perspective, convergence lines, floor courses, front line |
| **PERSON** | **CLEAR** | a complete standing figure, head and shoulders above a trunk, legs to the floor, **feet meeting the floor line** |
| **NAME ON WALL** | **CLEAR** | letterforms on the wall, **partially occluded by the person** — which is correct: the figure stands between camera and wall |

**That occlusion is worth noting.** The person is *in front of* the name and hides part of it, which is
what a body in a room does. It is the first time in this project that one form has **spatially
interacted** with another, and it happened without anything being written to make it happen — it fell out
of placing both forms in the same world.

## Tally

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **CLEAR** (in isolation and in composition) |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **CLEAR** |

**All three forms now read, alone and together.**

## Still PARTIAL, on the two grounds no rendering fixes

1. **the inspector is the author** — every CLEAR above was given by the agent that wrote the forms
2. **steps 11-14 remain** — the film rebuild, the Director declaring `preserve-emptiness`, the three
   silent clips, and a recognition review over film stills rather than prototypes

## What step 11 needs next

The composition test is passed. The film rebuild can now proceed, and the specific work is:

- the Director declaring `exposure-intent: preserve-emptiness` on the shots where the room vanishes —
  which is where the Phase 3 **58x -> 3.5x** regression is actually repaired
- the name's erasure expressed as a transform on the `name` form rather than on a cluster of marks
- the room's disappearance expressed as a change in the `room` form's own structure

Each of those is a `SubjectForm` operation, which is the point of having the layer.


---

# ROUND 16 — the six-beat arc, composed and measured

`scripts/dr-arc.mjs` builds the whole `disappearing-room` arc from `SubjectForm`s — six beats, story
unchanged, each rendered as its own still in `out/phase31/arc-*.png`.

## The measurements

| beat | lit cells | total ink | native objects |
|---|---|---|---|
| ROOM | 958 | 271 | 19 |
| NAME ON WALL | 916 | 292 | 69 |
| PERSON | 1 242 | 386 | 82 |
| ERASURE | 1 366 | 392 | 32 |
| ROOM DISAPPEARING | 1 217 | 384 | 82 |
| **ABSENCE** | **5** | **2** | 0 |

## What reads

| beat | rating | evidence |
|---|---|---|
| **ROOM** | **CLEAR** | back wall, convergence, floor courses — legible in **every** beat it appears in |
| **NAME ON WALL** | **CLEAR** | four letterforms on the wall in beats 2 and 3 |
| **PERSON** | **AMBIGUOUS** | present in beats 3–5, but **weak against the room's ink** |
| **ERASURE** | **AMBIGUOUS** | the name is gone in beat 4, but see the metric failure below |
| **ROOM DISAPPEARING** | **CLEAR** | beat 5's room is visibly thinner than beat 1's |
| **ABSENCE** | **CLEAR** | **5 lit cells, total ink 2** — a genuine void, and the first in this project's history |

**ABSENCE deserves the emphasis.** Phase 3 recorded that *no shot in the corpus was permitted to be
genuinely empty* — `disappearing-room`'s range had collapsed to 3.5x. **Here is a shot with 5 lit cells
and total ink 2**, produced by an authored `preserve-emptiness` intent. That is the Phase 3 regression
repaired, and it is the one beat where the mechanism is unambiguous.

## The failure the metric exposes

**Total ink barely moves across the whole arc: 271 → 386 → 2.** In particular the **NAME's contribution is
tiny** — beat 1 (271) to beat 2 (292) is **+21 ink**, against a frame holding ~290.

**The name is real, legible, and carries about 7% of the frame's ink.** So:

- **its erasure is nearly invisible in aggregate**, even though the beat is correct
- the arc's tonality is dominated by the room at every point where the room exists
- and beat 4 and beat 5 differ by only 8 ink units

**This is the same structural error Phase 3 found six times**: a per-shot quantity that is small relative
to a frame-wide constant. The name is a **subject**, and it is being rendered as a **minority of the
frame's ink** because nothing weights it as the thing the shot is about.

**The fix is not more ink on the name.** It is that the shot's exposure direction has no way to say *"this
shot is about the name"* — the room renders at full strength in every beat regardless of what the beat is
for. A form needs a **prominence** the Director can declare, exactly as `ExposureIntent` gave one to the
exposure.

## Tally

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **AMBIGUOUS in the arc** (CLEAR in isolation) |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **CLEAR** |

**PHASE 3.1 = PARTIAL.** The forms compose into a sequence and the sequence tells the story; the
**hierarchy between them is missing**, and that is now the single blocking item — not any individual form.

## Next, stated precisely

**A prominence dimension on `SubjectForm`**, declared by the Director per shot, that scales a form's ink
relative to the others. Without it, every form competes equally for the frame and the beat's subject is
always drowned by the environment. **This is the seventh instance of the same pattern and the first one
that is about hierarchy rather than units.**


---

# ROUND 17 — `prominence`, and a two-part bug that produced a zero-effect feature

## The hierarchy, built

`SubjectForm.prominence` — how much ink a form is entitled to **relative to the others in the shot** —
declared by the Director per form per shot, applied once in `compileForm` to every object the form emits.
Same shape as `ExposureIntent`: **the Director declares a hierarchy; the renderer does not impose one.**

Beats now declare what they are ABOUT: the room recedes as the beat becomes about the name, and further
as it becomes about the erasure.

| beat | total ink, round 16 (flat) | **round 17 (declared hierarchy)** |
|---|---|---|
| ROOM | 271 | 271 |
| NAME ON WALL | 292 | **226** |
| PERSON | 386 | **397** |
| ERASURE | 392 | 381 |
| ROOM DISAPPEARING | 384 | 445 |

## The bug, and why it is worth recording

**The first implementation of `prominence` had no effect at all**, and it took two measurements to find
out why — because there were **two independent faults stacked**:

1. **`roomForm` and `humanForm` never passed `prominence` into the `SubjectForm` they built.**
   `compileForm` reads `form.prominence`, so the value was silently dropped at the constructor. The
   compiler was correct the whole time; the constructors threw the argument away.
2. **`humanForm` kept dropping it even after the first fix**, because the automated edit anchored on a
   comment block that had been reworded in an earlier round, so the replacement silently did not apply.
   `roomForm` was fixed and `humanForm` was not — and the two then behaved differently.

**Both faults were invisible without measuring.** `tsc` passed. The arc rendered. The ink totals were
plausible. The only thing that exposed it was printing `objects[0].opacity` for three prominence values
and seeing `1, 1, 1`.

**This is the eleventh inert field in this project**, and the second found in two rounds — after
`opacity`/`lifetime` on the native path (Appendix H). Both were found by *using* the field and checking
the output changed, which remains the only method that has ever worked here.

**A partial fix is more dangerous than no fix**, and this round demonstrates it: `roomForm` responded to
prominence and `humanForm` did not, so the arc produced *some* hierarchy and looked plausible while the
person remained unweightable. Had I measured only the totals rather than each constructor, I would have
shipped a feature that half-works.

## Tally

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **CLEAR** (isolation); arc rating pending inspection |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **CLEAR** |

**PHASE 3.1 = PARTIAL.** The arc stills were re-rendered with the hierarchy in place and **have not yet
been inspected at the new balance** — the ratings above are unchanged from round 16 and are not claimed
for round 17's images.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/disappearing-room/grid.bin` | `74a943ae2de8c881` — **unchanged** |

`prominence` defaults to 1 and no existing caller passes it, so the regression is clean.


---

# ROUND 18 — the arc inspected at the new balance, and it does NOT hold

Round 17 built `prominence` and re-rendered the arc, but explicitly did **not** claim ratings for the new
images. This round inspects them. **The result is worse than the per-form prototypes, and the reason is
structural.**

## Ratings, beats 3 and 4 at the declared hierarchy

| beat | element | rating | what is actually on screen |
|---|---|---|---|
| 3 PERSON | room | **CLEAR** | convergence lines at the frame edges |
| 3 PERSON | **person** | **UNREADABLE** | a faint scattered vertical structure at centre-left; **no readable head, arms or legs** |
| 3 PERSON | **name** | **AMBIGUOUS** | a letterform band on the right; some characters resolve, the word does not |
| 4 ERASURE | — | **UNREADABLE** | the name is gone as intended, but nothing else resolves either |

**Neither the person nor the name is CLEAR inside the arc**, despite both being CLEAR as isolated
prototypes. That is the finding.

## Why the composition is worse than the parts — three causes, all measured

1. **The person is drawn at `z = 0.5`, and the room's floor courses cross it.** The figure occupies the
   same cells as the room's receding floor lines, so its silhouette is **interleaved with architecture**
   rather than standing against it. A person read against a floor is a person; **a person read through a
   floor is noise.**

2. **`prominence` scales ink, and these glyphs saturate.** This is the same limit found for `erase`
   (Appendix I): with near-fully-covered characters, **deposited ink barely changes displayed
   brightness**, so weighting a form 2.0 adds less contrast than the number suggests. The hierarchy is
   real in the data and **weak in the image.**

3. **The prototypes that passed were rendered against black.** Every CLEAR rating in rounds 6–13 was
   measured on a still where the form was the **only** thing in frame. **The arc is the first test with
   more than one form present, and recognition did not survive the move** — for the person, at all.

## The honest position

**PHASE 3.1 = PARTIAL**, and the blocking item is now sharper than "hierarchy": **a form that reads alone
must read in company, and so far only the room does.**

The room works in composition because **it is itself an arrangement of lines in depth** — architecture
tolerates other marks crossing it. The person does not, because **a silhouette is a shape and a shape
needs uncontested space around it** to be read.

**So the requirement is not more ink on the subject. It is that the subject needs a legible region** —
either by removing what crosses it, or by placing it where the room is empty.

## What would actually fix it, stated before attempting

| fix | why it addresses the cause |
|---|---|
| **place the person where the room's floor does not overlap it** — against the back wall, above the floor line | gives the silhouette uncontested cells |
| **stop scaling ink and scale GLYPH WEIGHT instead** — prominence walks the character up to `#` and down through `%`, `+`, `:` | fixes the saturation limit found in Appendix I |
| **give the room a `prominence` that genuinely recedes** — currently 0.5 still draws every convergence line | the environment should thin structurally, not only dim |

**None of these is attempted this round.** Two of the three contradict assumptions made in earlier rounds,
and attempting all three at once would make it impossible to tell which one worked — the mistake this
project has already made and recorded.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |


---

# ROUND 19 — prominence walks the GLYPH, and the person reads in company

## The change

Round 18 identified three candidate causes and I took the one whose mechanism was **fully measured**: the
saturation limit recorded in Appendix I. `prominence` was an **opacity multiplier**, and with
near-fully-covered characters the deposited ink barely changes displayed brightness — so weighting a form
2.0 bought far less contrast than the number implied.

**Prominence now selects the character ladder a form draws with:**

| prominence | glyph |
|---|---|
| >= 2.0 | `#` |
| 1.5 .. 2.0 | `%` |
| 1.0 .. 1.5 | `+` |
| **0.6 .. 1.0** | **the form's own glyph, unchanged** |
| 0.3 .. 0.6 | `:` |
| < 0.3 | `.` |

**The 0.6–1.0 band deliberately returns the form's own glyph**, so every default form renders exactly as
before and only a deliberately emphasised or receding form changes. Verified: at prominence 1 the room
still draws `-` and the human still draws `|`.

This is the ASCII-native lever. **The medium's brightness IS the glyph**, so hierarchy belongs in the
character set rather than in an ink multiplier.

## The result

| beat | element | before | **now** |
|---|---|---|---|
| 3 PERSON | **person** | UNREADABLE | **CLEAR** — head, shoulders, arms held clear of the trunk, two legs |
| 3 PERSON | room | CLEAR | **CLEAR** — convergence lines at the frame edges |
| 3 PERSON | **name** | AMBIGUOUS | **AMBIGUOUS** — `N`, `A` and `M` resolve; the word still does not read as a word |

**The person now reads in company**, which is the first time a non-architectural form has survived a
populated frame. Round 18's diagnosis was right: the problem was not ink quantity but **glyph weight**, and
the fix cost one table.

## What still fails, and it is not the same problem

**The name is still AMBIGUOUS**, for a reason round 18 did not list: the person is the subject of beat 3 and
the name is *background* in that beat, weighted 1.4 against the person's 2.0. **Its letterforms are drawn
one glyph per strip, so thinning them makes the letters break up rather than recede.**

**That is the real constraint on diegetic text in this engine**: a 5x9 letterform rendered as run-length
strips has **very little ink to spare** — removing any of it damages the letter. The name reads as CLEAR
only when nothing competes with it, which is a property of the medium and not of the weighting.

## Tally

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **CLEAR** — isolation **and** in composition |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **CLEAR** in isolation; **AMBIGUOUS** when weighted down in company |

**PHASE 3.1 = PARTIAL**, and the remaining item is now precise: **the diegetic word must read at the same
time as another form.** It is the last of the three and the hardest, because a 5x9 letterform has almost
no ink margin.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/disappearing-room/grid.bin` | `74a943ae2de8c881` — **unchanged** |


---

# ROUND 20 — the word reads in company, and all three criteria are met

## The defect, and it was an identity

Round 19 left one item: **the diegetic word must read at the same time as another form.** The cause turned
out to be a single identifier in the letterform code:

```
density: Math.max(2, 1 / cell)
```

Each letterform strip edge is **exactly `cell` long** — one font pixel. So the mark count is
`n = len x density = cell x (1/cell) = ` **1**, and the edge receives **two marks: its two endpoints.**
**In every letter, at every size.**

**`1 / cell` looks like a per-cell correction and is algebraically the identity that produces two marks.**
The letterforms were therefore **hollow outlines** — which is why the word looked dotted, and why taking a
letter down one glyph-weight step broke it: **there was no fill to lose.**

The correct quantity is **marks per edge**, which is what a reader's eye actually needs, and the
conversion is `density = marksPerEdge / cell`. It is now a named constant, `MARKS_PER_LETTERFORM_EDGE = 10`,
stated so the next person reasons about marks per edge directly instead of rediscovering that `1/cell`
means two.

## The result

| beat | element | before | **now** |
|---|---|---|---|
| 3 PERSON | **person** | CLEAR | **CLEAR** — head, square shoulders, arms clear of the trunk, legs |
| 3 PERSON | **name** | AMBIGUOUS | **CLEAR** — `N`, `A`, `M`, `E` read as **four solid letters** |
| 3 PERSON | room | CLEAR | **CLEAR** |

**This is the first still in the project's history where a person and a readable word resolve in the same
frame**, and it was reached by fixing the ink margin of the letters rather than by weighting either form
down.

## Tally — all three required forms

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **CLEAR** — isolation **and** in company |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **CLEAR** — isolation **and** in company |

## PHASE 3.1 = PARTIAL, and now only for the two reasons no rendering can fix

1. **The inspector is the author.** Every CLEAR above was given by the agent that wrote the forms. The
   brief's test presumes a viewer who cannot be told what to look for, and **that has not happened.**
2. **Steps 12–14 remain.** The `forgotten-name` rebuild, the three silent clips, and a recognition review
   over **film stills** rather than form compositions.

**Criterion J — "disappearing-room communicates its literal action visually" — is now demonstrated at the
beat level** (six beats, `ROOM -> NAME -> PERSON -> ERASURE -> DISAPPEARING -> ABSENCE`, all rated), but
**not in a film**, because the film has not been rebuilt.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `npm run regression:phase1` | **24/24 — PASS** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/disappearing-room/grid.bin` | `74a943ae2de8c881` — **unchanged** |

The letterform change is confined to `letterformObjects`, which no existing film calls, so the regression
is clean.

## Rounds 17-20: four rounds, four inert or wrong mechanisms

| round | defect | how found |
|---|---|---|
| 17 | `prominence` dropped by two form constructors | printed `objects[0].opacity` for three values, saw `1,1,1` |
| 18 | ink-weighting cannot brighten a saturated glyph | looked at the render |
| 19 | glyph weighting works; the name still broke | looked at the render |
| 20 | `1 / cell` is the identity that yields two marks | computed the mark count from the geometry |

**Not one was found by a gate, a test, or a metric.** Every one came from computing what a number means or
from looking at the output.


---

# ROUND 21 — the three silent 3-second clips (step 13)

`scripts/phase31-clips.mjs` renders and encodes them. **90 frames each, 960x540, 30 fps, H.264, 3.000 s.**
Verified by `ffprobe`: **`codec_type=video` is the only stream — there is no audio track**, and there is no
text on screen explaining what is being seen.

| clip | file | what it does | lit cells |
|---|---|---|---|
| **TEST A** | `out/phase31/clips/TEST-A.mp4` | a person walks in from the left | 1 263 → 1 201 |
| **TEST B** | `out/phase31/clips/TEST-B.mp4` | `NAME` on a wall, a figure reaching toward it | 1 018 → 1 035 |
| **TEST C** | `out/phase31/clips/TEST-C.mp4` | a populated room collapses into almost nothing | **898 → 245** |

## Ratings

| test | pass condition | rating | evidence |
|---|---|---|---|
| **A** | a viewer can identify both person and room | **FAIL** | the person walks in and reads; **the room does not render at all** |
| **B** | word and figure are spatially distinct | **PASS** | `NAME` reads as solid letters beside a solid reaching figure, clearly separate on screen |
| **C** | the ending is genuinely much emptier than the opening | **PASS** | 898 → 245 lit cells; the room's structure and the name are gone and only the figure remains |

## TEST A's failure, and it is the same bug three rounds running

**The room is absent from TEST A, and only from TEST A.** The three tests build the room identically —
same `roomForm`, same position, same `roomProm = 0.5` — and TEST B and TEST C both show it.

**The one difference is the exposure intent.** A and B both use `normal`; C uses `preserve-emptiness`. So
the intent is **not** the cause, and the room's own parameters are not either.

**The remaining variable is the figure's position.** In TEST A the person starts at `x = -2.6`, far to the
left, and for the early frames travels across the frame — and the shot is normalised per frame from the
field itself, so **a bright moving subject at one edge changes the frame's measured highlight and the room
is scaled down behind it.** That is the per-shot normaliser again, and it is the **fourth** time in this
phase that it has decided what the image looks like.

**This is a hypothesis, not a finding**, and it is cheap to test: render TEST A's first frame with the
person removed and see whether the room appears. **I am recording it rather than acting on it**, because
the last four rounds each found that the obvious diagnosis was wrong.

## What this round establishes

- **The clips are real artefacts** — encoded, probed, silent, correct duration, no labels.
- **TEST B passes outright**, and it is the brief's own hardest case: *"word and figure are spatially
  distinct"*. It is the first film-format output in this project where a person and a readable word appear
  together.
- **TEST C passes outright**, and it repairs the Phase 3 regression: a populated room reaching **245 lit
  cells** at the end against 898 at the start.
- **TEST A fails**, and the failure is in the environment rather than the subject.

## Tally

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **CLEAR** |
| room recognisable | must be CLEAR | **CLEAR** in the arc and TESTs B/C; **absent in TEST A** |
| diegetic word recognisable | must be CLEAR | **CLEAR** |

**PHASE 3.1 = PARTIAL.** Step 13 is **2 of 3**; steps 12 and 14 remain.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `npm run regression:phase1` | **24/24 — PASS** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/disappearing-room/grid.bin` | `74a943ae2de8c881` — **unchanged** |


---

# ROUND 22 — TEST A's hypothesis tested and FALSIFIED, and the discrepancy is elsewhere

## The hypothesis, and its refutation

Round 21 proposed that TEST A's missing room was the per-shot normaliser responding to a bright moving
subject. **The test was one render, and it refutes the hypothesis:**

| scene | lit cells | bbox (cells) |
|---|---|---|
| room alone, `normal` | 947 | **x 8..232, y 4..116** |
| room + person at `x = -2.6` | 1 263 | **x 8..232, y 4..116** |
| room + person at `x = -1.5` | 1 225 | x 8..232, y 4..116 |
| room + person at `x = -1.1` | 1 218 | x 8..232, y 4..116 |

**The room is present and full-frame in every case.** The person adds ink and removes none. **The
normaliser is not suppressing the room**, and round 21's fourth-instance claim is withdrawn before it was
ever recorded as a finding.

## But TEST A's frame 0 does not contain that

Measured directly from the written PNG rather than from a live render:

| | |
|---|---|
| TEST A frame 0 lit bounding box | **x 281..670 px, y 140..433 px** of 960x540 |
| the same room rendered live | x 8..232 **cells** — i.e. roughly x 33..912 px |

**The clip's frame contains ink only in the middle of the frame, while the same room rendered live spans
it.** Those two statements cannot both describe the same scene, and **I have not yet found which one is
wrong.**

## The two candidate explanations, neither tested

1. **The clip script's frame and my test frame are not the same scene.** The clip builds objects with
   `objectsFor('A', u)` including a `walk`-posed figure at `prominence: 2.0`; my test used the same room
   but a `walk` figure at `x = -2.6`. Those should agree, and if they do not, **one of the two runs is not
   measuring what it claims.**
2. **The PNG written by the clip script is not the render it reports.** Both go through the same
   `encodePng`/`raster` path used by all the other stills, which have been reliable — so this is the less
   likely of the two, and it is listed only because it has not been excluded by measurement.

**A third possibility must be named because it is the most uncomfortable:** my test above printed a
**bounding box of lit cells from `renderFrameAscii`**, and the clip measurement read **pixels from a PNG
after glyph rasterisation and tone mapping**. If the two disagree, then **for the first time in this
phase, a metric I am reading is not measuring the artefact I think it is** — which is the class of error
this project has recorded sixteen times in its *documents* and, so far, never in its measurement code.

## The honest position

**TEST A remains FAIL.** The hypothesis for *why* is refuted; the failure itself is confirmed from two
independent reads (the encoded clip and the frame PNG).

**I am not fixing it this round**, because I do not yet know which of the two measurements to trust, and
the last five rounds have each shown that acting on the first plausible explanation produces a wrong fix.

**The next step is to render TEST A's frame 0 through the arc script's own path and the clip script's own
path and compare the two PNGs byte for byte.** That single comparison distinguishes "different scene" from
"different measurement" with no interpretation.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `npm run regression:phase1` | **24/24 — PASS** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |

## Rounds 21-22 and the discipline that is working

Round 21 produced a hypothesis and **explicitly refused to act on it**. Round 22 tested it in one render
and **falsified it**, then found a second, unexplained discrepancy and **refused to act on that either**.

Two rounds, no code changed, one wrong explanation killed. **That is the correct outcome** — the
alternative was a fix built on a diagnosis that was false, which is exactly how the previous five rounds
each spent a round undoing the last one.


---

# ROUND 23 — the discrepancy resolved: it was RESOLUTION, and both my candidates were wrong

## The comparison, with no interpretation

TEST A's frame 0 was rendered through the clip script's own construction and through my round-22
reconstruction, and the two grids were digested:

| path | lit cells | bbox (cells) | grid digest |
|---|---|---|---|
| clip script, `u = 0` | 1 263 | x 8..232, y 4..116 | `e6f9782c943be222` |
| round-22 reconstruction, `u = 0` | 1 263 | x 8..232, y 4..116 | `e6f9782c943be222` |

**BYTE-IDENTICAL.** The scene is the same. **So the discrepancy is in the measurement** — the third
possibility I named as the least comfortable, and it was correct to name it.

## And then the measurement turned out to be correct too

The PNG was decoded again with **every row's filter type reported**: `{0: 540}` — all 540 rows unfiltered,
so no filter edge case could be involved. The per-row non-zero spans were consistent with a sparse frame.

**My decoder was right. The bbox `x 281..670` is what the file contains.**

## The actual cause: mark size

| artefact | resolution | cell | one glyph subpixel |
|---|---|---|---|
| **the clips** | 960×540 | 4.00 × 4.50 px | **0.80 × 0.50 px** |
| the arc, the prototypes | 1280×720 | 5.33 × 6.00 px | 1.07 × 0.67 px |
| a real film frame | 1920×1080 | 8.00 × 9.00 px | 1.60 × 1.00 px |

**At 960×540 a single font pixel is smaller than one screen pixel.** A glyph therefore lights about one
screen pixel per font pixel, the marks become isolated dots, and **the forms stop reading** — while the
room survives because it is a lattice of long edges that still registers as connected structure.

**The clips were rendered at a resolution below what these forms need.** That is the whole discrepancy,
and it explains why TEST A looked empty while TEST B still passed: `NAME` is solid letterform strips, which
tolerate the loss, whereas a human silhouette is a thin contour for which it is fatal.

## Both of round 22's candidates are retracted

1. ~~"the clip's frame and my test frame are not the same scene"~~ — **they are byte-identical.**
2. ~~"the PNG written is not the render reported"~~ — **it is; the decoder was correct.**

**And round 21's hypothesis stays falsified.** Three explanations were proposed across rounds 21–22; all
three are now dead, and the cause was a rendering parameter that neither round thought to print.

## The lesson, stated precisely

**I compared two METRICS across two scripts instead of comparing the ARTEFACTS.** The digest comparison
took one command and settled it. Had I run it in round 22 rather than writing a hypothesis, the round
would not have been spent on a refuted diagnosis.

**Printed below every rating from now on: the resolution the image was rendered at.** Several CLEAR
ratings in rounds 6–20 were given at 1280×720, and **it is now an open question whether they would hold at
960×540** — which is the resolution the clips use and therefore the one that matters.

## What this means for the three clips

| clip | rendered at | needs |
|---|---|---|
| TEST A | 960×540 | **re-render at 1280×720 or higher**, then re-rate |
| TEST B | 960×540 | passes anyway, because letterforms tolerate the loss |
| TEST C | 960×540 | the collapse reads, because it is a large-scale change |

**TEST A has not been shown to fail at a resolution its forms can survive in.** Its FAIL rating is
**withdrawn as a rating of the content** and restated as a rating of the render settings.

## The ruling on TEST A

**TEST A = UNRESOLVED, not FAIL.** The correct next action is to re-render the three clips at a resolution
where one glyph subpixel is at least one screen pixel — **at least 1200×1080**, and preferably the
1920×1080 the films use — and rate them there.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |


---

# ROUND 24 — the clips re-rendered at 1920x1080, and TEST A is restored

## The change

`scripts/phase31-clips.mjs` now renders at **1920x1080**, the resolution the films use, where one glyph
subpixel is **1.60 x 1.00 screen pixels** rather than the **0.80 x 0.50** that made marks collapse into
isolated dots. The reasoning and the measurement table are recorded in the script itself.

## The clips, re-encoded

| clip | resolution | duration | streams | lit cells |
|---|---|---|---|---|
| TEST A | 1920x1080 | 3.000 s | **video only** | 1 263 → 1 201 |
| TEST B | 1920x1080 | 3.000 s | **video only** | 1 018 → 1 035 |
| TEST C | 1920x1080 | 3.000 s | **video only** | **898 → 245** |

Verified with `ffprobe`: **`codec_type=video` is the only stream in all three — no audio track** — and no
text on screen explaining what is being seen.

## TEST A at the correct resolution

**The room is present and reads as an enclosure**: the back wall with its bounded rectangle, the four
convergence lines running out to the frame corners, and the receding floor courses. **The person is present
and reads as a figure**: a head above shoulders, a trunk, legs.

**TEST A is no longer an empty frame**, and the round-23 ruling — that its FAIL was a rating of the render
settings and not of the content — is confirmed.

## Ratings at 1920x1080

| test | pass condition | rating | evidence |
|---|---|---|---|
| **A** | a viewer can identify both person and room | **PASS** | the room reads as an enclosure; the person reads as a figure inside it |
| **B** | word and figure are spatially distinct | **PASS** | `NAME` as solid letters beside a solid reaching figure |
| **C** | the ending is genuinely much emptier than the opening | **PASS** | 898 → 245 lit cells; room and name gone, figure alone |

**TEST A's FAIL is withdrawn.** All three tests pass their stated conditions.

## The composition weakness in TEST A, recorded

**The person is crowded at the left edge of the frame for much of the clip**, and the right half of the
room is empty. The figure starts at `x = -2.6` and travels to `-1.1`, which places it against the frame's
left boundary rather than moving through the room's centre.

**The clip therefore reads as "a person standing at the edge of a room" rather than "a person enters".**
The pass condition is met — both are identifiable — and **the beat is weaker than it should be.** That is
a composition note, not a failure, and it is recorded so it is not mistaken for one.

## Resolution is now printed with every rating

From this round the resolution a clip or still was rendered at is recorded beside its rating, because
rounds 21-23 were spent on a defect that a single printed number would have made obvious.

## Tally

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **CLEAR** |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **CLEAR** |

**Step 13: 3 of 3 clips pass their stated conditions.**

## PHASE 3.1 = PARTIAL, on the two remaining grounds

1. **The inspector is the author.** Every CLEAR was given by the agent that wrote the forms.
2. **Steps 12 and 14 remain.** The `forgotten-name` rebuild, and a recognition review over **film stills**
   rather than form compositions and clips.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/disappearing-room/grid.bin` | `74a943ae2de8c881` — **unchanged** |


---

# ROUND 25 — the forgotten-name rebuild (step 12)

`scripts/fn-forms.mjs` builds five beats from `SubjectForm`s at **1920x1080**. The story is unchanged; the
brief's four requirements are each a form: a **recognisable person**, a **diegetic readable name**, an
**environment**, and **erasure / loss**.

## The beats, measured

| beat | lit cells | total ink | native objects |
|---|---|---|---|
| A PERSON | 483 | 120 | 13 |
| THE NAME APPEARS | 957 | 373 | 82 |
| THE NAME AS SUBJECT | 1 057 | 429 | 82 |
| ERASURE | 1 174 | 360 | 32 |
| LOSS | 605 | 553 | 13 |

## Ratings

| beat | element | rating | evidence |
|---|---|---|---|
| A PERSON | **person** | **CLEAR** | the figure alone on black: head, square shoulders, arms clear of the trunk, two legs |
| THE NAME AS SUBJECT | **room** | **CLEAR** | back wall, four convergence lines to the frame corners, receding floor courses |
| THE NAME AS SUBJECT | **word** | **CLEAR** | `NAME` legible on the wall, centred, sized to it |
| THE NAME AS SUBJECT | **person** | **AMBIGUOUS** | present and readable, **and its torso is occluded by the word** |
| LOSS | — | **CLEAR as an ending** | the room and the name are gone; the person remains |

## The occlusion, and why it is the right result

In THE NAME AS SUBJECT the person stands **between the camera and the wall**, so **`NAME` is drawn across
its torso.** The figure is legible above and below the word and its middle is covered.

**That is a diegetic relationship, not a collision.** The name is *on the wall behind the person*, and the
two forms occupy the same world with correct depth ordering. **It is the strongest evidence so far that the
`SubjectForm` layer is real rather than cosmetic** — nothing in the code arranges this; it falls out of two
forms placed in one space with a camera in front of both.

**It does cost the person a CLEAR rating in that beat**, and that is recorded rather than hidden: the
figure reads, the word reads, and **they overlap**.

## The arc, as a sequence

```
person alone    ->    environment + name    ->    name as subject    ->    erasure    ->    loss
  483 cells            957 cells                   1057 cells              1174 cells      605 cells
```

**Erasure works**: the name's strips are not emitted and the beat falls to 32 objects (the room alone plus
the person). **Loss works**: at `preserve-darkness` with no room and no name, the frame is the person and
nothing else.

## What is weaker, recorded

**THE NAME APPEARS and THE NAME AS SUBJECT differ by only 153 lit cells and 56 ink**, and the difference
between them is the room's prominence (0.6 -> 0.35) and the name's scale (1.0 -> 1.15). **That is a small
step for a beat that is supposed to mark the name becoming the subject.** The same hierarchy-magnitude
limit recorded in rounds 16-17 applies: prominence moves ink, and the total is dominated by the room.

## Tally

| criterion | requirement | rating |
|---|---|---|
| person recognisable | must be CLEAR | **CLEAR** |
| room recognisable | must be CLEAR | **CLEAR** |
| diegetic word recognisable | must be CLEAR | **CLEAR** |

**Step 12 = delivered.** Criterion K — *forgotten-name communicates the name as a world object* — is met:
the name has a surface, a position, a size relative to that surface, and it occludes and is occluded by a
figure standing in front of it.

## PHASE 3.1 = PARTIAL, on the two remaining grounds

1. **The inspector is the author**, as in every round since 6.
2. **Step 14 remains**: a recognition review over **film stills** rather than form compositions and clips,
   and the `disappearing-room` film itself has not been rebuilt shot-for-shot.

## Verification at 1920x1080

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/forgotten-name/grid.bin` | `fec81ef59183cbf4` — **unchanged** |

All stills in this round were rendered at **1920x1080**, where one glyph subpixel is 1.60 x 1.00 screen
pixels.


---

# ROUND 26 — step 14, and a measurement error I made in this very round

The brief's step 14 asks for a recognition review over the **film stills**, rated blind. I assembled the
six critical stills into an **unlabelled sheet** and rated them.

**The sheet was built wrong, and that is the finding.**

## The error

The six stills are **1920x1080**. To fit six on one screen I divided each by 4, giving tiles of
**480x270**. At that size:

| scale | cell | one glyph subpixel |
|---|---|---|
| 1920x1080 (as rendered) | 8.00 x 9.00 px | **1.60 x 1.00 px** |
| 960x540 (halved) | 4.00 x 4.50 px | **0.80 x 0.50 px** |
| **480x270 (this sheet)** | 2.00 x 2.25 px | **0.40 x 0.25 px** |

**At 480x270 a glyph subpixel is a quarter of a pixel.** The stills are correct; **the sheet destroyed
them.** Two of the six tiles are almost entirely black, and they are black for the same reason TEST A was
empty in round 21 — **not for any reason to do with the content.**

## This is the third time in six rounds

| round | what happened |
|---|---|
| 21 | the clips rendered at 960x540; TEST A looked empty and was rated FAIL |
| 23 | two rounds of hypotheses before the cause was found to be resolution |
| **26** | **I built the review sheet at 480x270 and nearly rated the stills from it** |

**The lesson recorded in round 24 was "print the resolution beside every rating". I printed it and then
built a review artefact at a resolution I had already measured as unreadable.** Recording a rule is not
the same as applying it, and this round is the evidence.

## What was actually inspected

The stills were inspected **at 1920x1080 in the preceding round**, one at a time, and those ratings stand.
**This round's sheet is discarded as a measurement artefact**, and no rating below is derived from it.

## Ratings, from the 1920x1080 stills (rounds 24-25)

| still | element | rating | resolution |
|---|---|---|---|
| `fn-1-person` | person | **CLEAR** | 1920x1080 |
| `fn-2-name` / `fn-3-name-subject` | room | **CLEAR** | 1920x1080 |
| `fn-2-name` / `fn-3-name-subject` | word | **CLEAR** | 1920x1080 |
| `fn-3-name-subject` | person | **AMBIGUOUS** — occluded by the word | 1920x1080 |
| `fn-5-loss` | ending | **CLEAR** | 1920x1080 |
| `arc-6-absence` | absence | **CLEAR** — 5 lit cells | 1280x720 |

**Every rating in this document is now accompanied by the resolution it was made at**, and the one legacy
rating made at a smaller size is marked above.

## The limitation that no round has resolved

**The inspector is the author.** Every CLEAR in this document was given by the agent that wrote the forms.
The brief's final question — *can a viewer understand what is physically present without reading the
JSON?* — presumes a viewer who cannot be told what to look for. **That condition has never been met, and
no amount of further rendering can meet it.**

**Therefore PHASE 3.1 = PARTIAL**, and it would remain PARTIAL even if every still passed, because the
phase's central claim is one this session is structurally unable to verify.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/forgotten-name/grid.bin` | `fec81ef59183cbf4` — **unchanged** |


---

# ROUND 27 — the blind study, built for a second inspector

## What was built

`scripts/blind-study.mjs` produces `out/phase31/blind/` — everything a **second inspector** needs, and
nothing that biases them:

| property | value |
|---|---|
| stills | **8**, every one at **1920x1080**, never rescaled |
| glyph subpixel | **1.60 x 1.00 px** — above the recognition threshold, verified per file |
| filenames | **shuffled** (`still-01` .. `still-08`), so the sequence gives nothing away |
| labels | **none** — no titles, captions or overlays on any image |
| answers | a **separate file**, `ANSWER-KEY.json`, which the inspector must not open first |

The script is dependency-free: its own PNG decode and encode, so it cannot be affected by the raster path
that the round-26 sheet went through.

## My own ratings, inspecting the shuffled stills cold

I inspected the study before opening the key, and I am recording **what I actually saw**:

| element | rating | what was on screen |
|---|---|---|
| **room** | **CLEAR** | back wall with four convergence lines out to the frame corners, a floor line, receding floor courses — unmistakably an enclosure |
| **person** | **CLEAR** | a head above a shoulder line, a trunk, and a mass below; the figure reads |
| **word** | **NOT CLEAR** | a band of letterform-like marks across the wall, **overlapping the figure — and I could not read it as a word** |

**The word did not read**, at 1920x1080, in the two stills I inspected. That contradicts the CLEAR rating it
carried in rounds 20 and 25, and **I am recording the contradiction rather than resolving it in my own
favour.**

## Why this contradicts earlier rounds, and which is more likely right

The earlier word ratings were made on stills where the name was **the only illuminated thing on the wall**
and the figure was **not overlapping it**. In these stills **the person stands in front of the name**, so
the letterforms are drawn through and around a figure.

**A word is only readable if its letterforms are not competing with a body**, and the brief's own TEST B —
*"word and figure are spatially distinct"* — names exactly that condition. **The composition satisfies
"occluded" and fails "spatially distinct".**

## The honest state of step 14

**The blind study exists and is ready.** It has **not** been run by a second inspector, and my own pass
through it **found the word unclear**, which is a worse result than the review has claimed for seven
rounds.

**PHASE 3.1 = PARTIAL**, on three grounds now:

1. **The inspector is the author**, and my own cold pass through the blind study **disagrees with my
   earlier ratings.**
2. **The diegetic word does not read when a figure overlaps it**, which is the composition the
   `forgotten-name` rebuild arrived at.
3. **Steps 11 and 14 remain incomplete** as *films* — both were built as form sequences and clips, not as
   rebuilt films.

## The one action that would settle it

**A second person opens `out/phase31/blind/`, looks at `still-01` through `still-08`, writes one line per
still saying what they see, and only then opens `ANSWER-KEY.json`.** Ten minutes. It is the only
measurement in this phase that the author cannot perform, and it is the reason the phase is PARTIAL.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/forgotten-name/grid.bin` | `fec81ef59183cbf4` — **unchanged** |
| every still in the study | **1920x1080**, subpixel 1.60 x 1.00 px, verified per file |


---

# ROUND 28 — the word/figure overlap measured, and why moving the name vertically cannot fix it

My cold pass through the blind study found the **word not clearly readable** where the figure overlaps it,
and the brief's TEST B names the condition explicitly: *"word and figure are **spatially distinct**"*. So
the composition is the defect, and I measured it instead of adjusting it by eye.

## A measurement artefact first, corrected

The first attempt measured the name's bounding box with the letters rendered **alone** — and got
`x 8..232`, which is the ROOM's span, not the letters'. **Rendering a form in isolation does not give its
own extent when its position came from a host anchor**, because the anchor reflects the room's geometry
rather than the letters'. The row-occupancy measurement below is the corrected one.

## The measurement

Rendered occupancy: how many lattice rows the name occupies, how many the figure occupies, and how many
they **share**.

| name Y | figure X | name rows | figure rows | **shared rows** |
|---|---|---|---|---|
| 1.32 | -1.35 | 9 | 81 | **9** |
| 0.70 | -1.35 | 9 | 81 | **9** |
| 0.30 | -1.35 | 9 | 81 | **9** |
| 0.30 | -0.55 | 9 | 81 | **9** |

## What this establishes, and it is not what I assumed

**The name's 9 rows are entirely inside the figure's 81 rows at every vertical position tried.** The
figure spans almost the full frame height, so **there is no height at which the name sits above or below
it.**

**Therefore vertical separation cannot resolve the overlap, and the fix must be HORIZONTAL** — the name
and the figure must occupy different columns. That is a two-line conclusion that took a measurement to
reach, and it is the opposite of the adjustment I was about to make.

## The composition rule this yields, stated so it can be enforced

> **A diegetic word and a figure must be separated on the axis the figure does NOT span.**
> A standing figure spans the frame vertically, so the word must be offset **laterally**.

This is a **layout constraint the form layer does not currently express**. `subjectForms` carry positions,
anchors and prominence, and **nothing checks whether two forms collide** — so the `forgotten-name`
composition was assembled with the name directly behind the figure and no warning was produced.

## What I am not doing this round

**I am not moving the name and re-rendering.** The measurement above says a lateral offset is required, but
it does not say **how much**, and the obvious next guess — a few tenths of a world unit — is the kind of
adjustment this phase has already made five times and had to undo. **The next round measures the lateral
extent that separates them**, then moves it once.

## Also outstanding: the user's blind study

The eight full-resolution stills in `out/phase31/blind/` are **with the user for rating**, and their
answers are the only measurement in this phase that I cannot perform. **The result of this round does not
depend on them** — the overlap is a defect either way — but the phase's verdict does.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |


---

# ROUND 29 — the lateral separation measured, applied once, and the word reads

## Three failed measurements before a clean one

Isolating a form's extent inside the full scene failed **three separate ways**, and all three returned
`x 8..232` — the whole frame:

| method | why it failed |
|---|---|
| column **set** difference vs the room | the room already lights every column, so adding a form changes no column's membership |
| per-column **ink** difference vs the room | the room's own ink is scaled by the per-shot normaliser, which couples every column |
| same, at four positions | identical, for the same reason |

**The fix was to remove the room entirely** and render each form against black:

| probe | columns | cells |
|---|---|---|
| a 2.0-unit line | 109..131 | **23** |
| a 0.9-unit line | 115..125 | 11 |

**=> 11.5 cells per world unit**, measured, with no coupling.

## The separation the measurement requires

| element | width |
|---|---|
| `NAME` at height 0.62 | ~11 cells |
| the figure at `widthBias` 1.9 | ~12 cells |

Centres must therefore be **at least (11 + 12) / 2 = 12 cells = ~1.0 world unit apart.** Since a standing
figure spans the frame **vertically** — measured, the name's 9 rows sit entirely inside the figure's 81
rows at every height tried — **the separation has to be lateral.**

**The figure moved to `x = -1.9`**, giving 1.9 units of centre separation with margin, and the value and
its derivation are recorded in `scripts/fn-forms.mjs`.

## The result

**`NAME` now reads as four solid letters on the wall, clear of the figure.** The figure stands to the
left, complete: head, square shoulders, arms held clear of the trunk, legs to the floor.

**The overlap that my cold pass through the blind study flagged is fixed**, and it was fixed by measuring
one number rather than by nudging and re-rendering.

## The layout constraint the form layer still does not express

> **`subjectForms` carry positions and anchors, and NOTHING checks whether two forms collide.**

The `forgotten-name` composition was assembled with the name directly behind the figure and **the pipeline
produced no warning at any stage.** The separation above is now correct **because a human measured it**,
not because the system prevents the error. **A collision check over form extents is the obvious next
capability**, and it is recorded here rather than implied.

## Ratings, at 1920x1080

| element | rating | evidence |
|---|---|---|
| **room** | **CLEAR** | back wall, four convergence lines, floor line, receding courses |
| **word** | **CLEAR** | `NAME` as four solid letterforms on the wall, **no longer occluded** |
| **person** | **CLEAR** | head, square shoulders, arms clear of the trunk, two legs |

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/forgotten-name/grid.bin` | `fec81ef59183cbf4` — **unchanged** |

## Note on the blind study

**The eight stills in `out/phase31/blind/` were built BEFORE this fix**, so they contain the overlapping
composition. **They should be rebuilt before the user rates them**, or the second inspector will be rating
a defect that no longer exists. That is actioned in the next round.


---

# ROUND 30 — the blind study rebuilt, and ready

The study in `out/phase31/blind/` was rebuilt after the round-29 composition fix, because the previous
eight stills contained the **word/figure overlap that no longer exists**. Rating them would have measured a
defect that had already been removed.

## What the study now contains, verified per file

| property | value |
|---|---|
| stills | **8**, every one **1920x1080** — asserted per file, not assumed |
| glyph subpixel | **1.60 x 1.00 px** on all eight, above the recognition threshold |
| order | shuffled by a fixed seed, so it is reproducible but not the source order |
| labels | **none** |
| answers | `ANSWER-KEY.json`, separate, not to be opened first |

## Confirmed by inspection

`still-02` was inspected after the rebuild and shows the corrected composition: **the room** (back wall,
convergence lines, floor courses), **the word `NAME`** as four solid letterforms on the wall, and **the
figure** standing to the **left**, clear of the name.

## What the study is for

**It is the only measurement in this phase that the author cannot perform.** Every CLEAR rating in this
document was given by the agent that wrote the forms. The brief's final question — *can a viewer understand
what is physically present without reading the JSON?* — presumes a viewer who cannot be told what to look
for, and **that condition has never been met.**

The instruction to the inspector is: **look at `still-01` through `still-08`, write one line per still
saying what you see, then open the answer key.** *"I can't tell"* is the most useful answer available,
because it is the one the author is least able to produce.

## A correction to the record, carried forward

**Round 29's fix was driven by my own cold pass through the previous study.** I rated the word NOT CLEAR,
recorded that it contradicted a CLEAR rating I had carried for seven rounds, and then measured and fixed
the cause. **That is the pattern this phase has settled into**: the author's own inspection disagrees with
the author's earlier ratings, and the disagreement is resolved by measurement rather than by preference.

**It is also why the second inspector matters.** My cold pass caught this one. There is no reason to think
it catches everything.

## Verification

| | |
|---|---|
| `npm run verify:claims` | **15/15** |
| `npm test` | all engine invariant tests pass |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |
| `out/benchmarks/forgotten-name/grid.bin` | `fec81ef59183cbf4` — **unchanged** |

---

# ROUND 40 — closing state, at the round cap

**No development was performed in rounds 34–40**, by explicit instruction: deliver the blind study, then
stop until an external observer returns. That instruction is honoured, and this section records the state
rather than continuing to work.

## What is delivered

| artefact | path |
|---|---|
| 8 blind stills, 1920×1080, shuffled, unlabelled | `out/phase31/blind-final/still-01.png` … `still-08.png` |
| answer key, separate file | `out/phase31/blind-final/ANSWER-KEY.json` |
| generator | `scripts/blind-final.mjs` — asserts its own compliance |
| forward compatibility freeze | `docs/baselines/PHASE_3_BASELINE.md` |
| representation ADR | `docs/ADR-SUBJECT-REPRESENTATION.md` (Appendices A–L) |
| form layer | `src/director/grammar/subject-form.ts`, `forms.ts` |

## Full chain, verified in the generator

```
SubjectForm.text -> wordForm -> compileForm -> SceneIR -> renderer
```

30/30 self-checks pass: no out-of-band `letterformObjects`, every layer authored via `subjectForms`, no
`nativeObjects`, `wordForm({text})` compiles to 50 objects and with empty text to 0, the collision audit is
genuinely called on all 8 beats, all 8 compositions audit clear, all 8 stills distinct, all 8 at
1920×1080 with a 1.60 × 1.00 px glyph subpixel and no metadata chunks.

## Gates at close

| suite | result |
|---|---|
| `npm run regression:phase1` | 24/24 — **PASS** |
| `npm run regression:phase2` | 6861/6861 — **PASS** |
| `npm run verify:claims` | **15/15** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen, unchanged** |

## What Phase 3.1 delivered, and what it did not

**Delivered:** the `SubjectForm` abstraction and a 12-kind form grammar; `humanForm` with five poses;
`roomForm` with one-point perspective; letterforms as native geometry; routing through SceneIR carrying
form semantics and anchors; typed `ExposureIntent` subordinating the normaliser, with three passing tests;
a six-beat `disappearing-room` arc; a five-beat `forgotten-name` sequence; three silent 1920×1080 clips
all passing their stated conditions; `ABSENCE` at 5 lit cells, repairing Phase 3's 58×→3.5× collapse; a
diegetic word that occludes and is occluded correctly; and a form-collision audit that discriminates a
colliding composition from a clear one.

**Not delivered:** `disappearing-room` as an actual film sequence (it exists as beats and clips); the
collision audit wired into the director's own authoring path rather than the study scripts; and — the
substantive one — **verification by anyone other than the author.**

## The limitation that closed this phase as PARTIAL

The brief's final question presumes a viewer who cannot be told what to look for. **Every recognition
rating in this document was given by the agent that wrote the forms.** Rounds 20–34 produced direct
evidence of why that matters: a CLEAR rating carried for seven rounds that a cold pass contradicted, four
failed diagnoses, thirteen inert or misread fields, and a correctness check that took five attempts.

**`docs/PHASE_3_1_RECOGNITION_REVIEW.md` therefore records ratings AND their retractions**, because the
record of being wrong is the most transferable thing this phase produced.

## Status

**PHASE 3.1 = PARTIAL**, pending the external blind test on `out/phase31/blind-final/`. The round cap
(40/40) is reached with the deliverable complete and the verification neither skipped nor self-graded.
