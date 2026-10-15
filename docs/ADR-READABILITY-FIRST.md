# ADR — READABILITY-FIRST SEMANTIC RENDERING

**Status:** accepted · **Phase:** 3.2A · **Supersedes:** nothing · **Amends:** the Phase 3.1 render order

---

## Context

Phase 3.1 ended with an **external blind review returning "难以理解"** — unintelligible. The pipeline was
correct and verified: the `SubjectForm` layer existed, forms routed through SceneIR, the collision audit
passed 30/30 self-checks, and every regression was green. **The image did not communicate.**

The architectural reading of that failure, which this ADR adopts:

> **ASCII conversion happens too early.**

```
OLD   SEMANTIC OBJECT -> low-level ASCII geometry -> glyph field -> HOPE recognition survives
NEW   SEMANTIC OBJECT -> RECOGNISABLE FORM -> CINEMATIC COMPOSITION -> HIGH-RES MASK -> ASCII REPRESENTS IT
```

**ASCII must be the representation of a readable image. It must not be responsible for inventing it.**

## The evidence that made this decidable

Phase 3.1 could not tell *"the form is wrong"* apart from *"ASCII lost the form"*, because **there was only
one artefact and nothing to compare it against.** This phase renders two:

| artefact | what it is |
|---|---|
| `semantic-preview` | a monochrome coverage mask, 1920×1080 — **no glyphs, no particles, no noise, no post** |
| `ascii-render` | the same mask sampled into the glyph lattice |

The comparison yields a **fault attribution** that did not previously exist:

| observation | verdict |
|---|---|
| mask unreadable | **FORM FAILURE** — ASCII must not run |
| mask readable, ASCII unreadable | **ASCII REPRESENTATION FAILURE** |

## Decision 1 — a semantic layer above `SubjectForm`

`src/semantic/mask.ts` provides the drawing vocabulary — `disc`, `capsule`, `rect`, `polygon`, `blockText`
— and renders at **1920×1080 into a `Float32Array` coverage mask**. It has **no dependency on the glyph
atlas, the lattice, the camera, SceneIR or the director.** It draws what the shot *is*.

**Primitives are masses, not outlines.** The prior failure was silhouette *contours* — hollow shapes whose
gaps were one or two cells wide. A mask draws a limb as a 30-pixel capsule and a head as a disc, so the
form is solid before anything samples it.

## Decision 2 — ASCII samples the mask, and the order is enforced

`scripts/phase32a.mjs` renders the mask first, then samples it. **The mask is a deliverable in its own
right and is inspected before the ASCII exists**, which is what makes the fault attribution possible.

## Decision 3 — the diegetic word is painted into the mask as geometry

`blockText` uses the 5×9 uppercase pattern **as a shape descriptor**, filled at a scale of tens of pixels
per font pixel. This is **not** the ASCII typeface and must not be confused with it: the ASCII typeface
draws a character *as* a one-cell glyph, which cannot exceed one cell; here the word occupies
**22% of the frame width** because it was painted at that size.

**Readability floor met:** the brief sets a 15–20% frame-width floor for a diegetic word; TEST C measures
**22.0%**.

## Decision 4 — hard readability floors, measured programmatically

`maskStats` reports coverage, bounding box, and height/width fractions of frame. Current results:

| test | subject height | glyph cells tall | word width | floor |
|---|---|---|---|---|
| A | **87%** of frame | 104 cells | — | person ≥ 30% ✓ |
| B | **61%** | 73 cells | — | person ≥ 30% ✓ |
| C | **61%** | 73 cells | **22.0%** | word ≥ 15% ✓ |

**These are gates, not aesthetics.** A subject below 30% of frame height now fails the authoring step
rather than being rendered and hoped for.

## Where recognition is lost — the measurement split

| stage | what it costs | measured |
|---|---|---|
| **FORM** | judged on `test-*-semantic.png` alone | **the masks read**: TEST A is unmistakably a person; TEST C shows a person, a perspective interior and a legible `NAME` |
| **COMPOSITION** | judged on the mask | TEST B and C place the figure clear of the word and inside the room |
| **ASCII SAMPLING** | one glyph cell averages **8×9 px = 72 px** into one character | a 300-px figure is ~73 cells; a limb is ~4 cells wide |
| **GLYPH SELECTION** | one character from a **9-step ramp** (` .:-=+*#%@`) | the silhouette survives because it is a large solid mass, not a contour |
| **RESOLUTION** | lattice fixed at **240×120** against a **1920×1080** mask | 8× scale separation |

**The central result: the ASCII renders read as a person.** TEST A's ASCII is legible as a standing figure
with head, shoulders, arms clear of the torso, and two legs. **This is the first ASCII human in this
project's history that reads without being explained.**

**The fault attribution therefore points at FORM and COMPOSITION in Phase 3.1, not at ASCII sampling** —
the sampling preserves a solid mass perfectly well, and destroyed a thin contour.

## Not implemented in 3.2A, and deliberately

The brief lists `AdaptiveGlyphGrid`, `RecognitionFramingSpec`, cinematic blocking, composition recipes,
multi-scale ASCII, contour-following glyphs and semantic glyph families. **None is implemented.** The
brief restricts this stage to the ADR and three paired prototypes, and the prototypes show the architecture
is sound **without any of them** — which is the useful result: those items are refinements, not
preconditions.

**They are recorded here as the next work, in dependency order:**

1. **`RecognitionFramingSpec`** — the camera asking *can the subject still be read* is the highest-value
   item, because it turns the 30%-height floor into a constraint the director must satisfy at framing time.
2. **Semantic glyph families** — TEST A's ASCII uses a luminance ramp, so a limb is 4 cells of `*` and the
   interior is `=`/`+`. Contour-following glyphs (`|`, `/`, `\`) would make the silhouette *sharper* at the
   same resolution, at no cost to anything else.
3. **Multi-scale ASCII** — the mask has genuine 8× scale separation available and the current sampler
   throws it away by using one lattice for everything.
4. **Adaptive cell size** — a wide shot could use larger cells; premature until 1–3 are measured.

## Consequences

- **The engine is untouched.** The CPU renderer, GPU renderer, `SubjectForm`, `FilmSpec`, `ShotSpec`,
  SceneIR, the Director and `ExposureIntent` are all intact; `out/loneliness/grid.bin` remains
  `49b4c86bcbc5677f` and `verify:claims` remains 15/15. This ADR **adds** a layer; it removes nothing.
- **A new render order is available** and does not replace the old one:
  `Director -> FilmSpec -> ShotSpec -> SemanticForm -> mask -> ASCII sampler -> existing renderer`.
- **Fault attribution is now a first-class output.** Every future form failure can be localised to FORM,
  COMPOSITION or REPRESENTATION instead of being argued about.

## The gate this phase must pass, and cannot self-certify

**The author cannot grade final recognition** — that is the finding Phase 3.1 paid for. So:

- `out/phase32/blind/` contains **three ASCII stills only**, shuffled, unlabelled, at 1920×1080
- the folder **contains no answers**; the key is at `out/phase32/ANSWER-KEY.json`, outside it
- the observer is asked **"what do you see?"** — **not** "can you see the person?", which would prime them

| test | pass condition |
|---|---|
| A | person recognised |
| B | person **and** room recognised |
| C | person **and** room **and** `NAME` recognised |

**If any fails, PHASE 3.2 = PARTIAL regardless of anything measured here.**

## No audio

Unchanged. No music, no effects, no subtitles. **Audio must not rescue an unreadable image.**


---

# ADDENDUM — the external gate came back FAIL, and the measurement that followed

The external blind review of the first Phase 3.2A prototypes returned **"难以理解"** again. **Accepted, not
argued.** The author inspected `test-a-ascii.png` and judged it a legible figure; **the external observer,
reading the same file, could not.** That is the Phase 3.1 failure mode repeating, and it is the reason the
author's reading is not evidence.

## What the rejection forced me to measure, which I had not

Instead of re-asserting the render, I measured what the sampler actually delivers:

> the torso is one contiguous block spanning **rows 27..62 of the lattice — 35 rows of near-identical
> characters.**

**The render was a correct density map and a poor shape.** A luminance ramp carries no information about a
silhouette's **edge**, and **the edge is the shape** — the exact lesson of the Phase 3.1 silhouette work,
which found that recognition lives in the concavities. I had built a readability-first architecture and
then sampled it with the same ramp that destroyed Phase 3.1.

## The fix — contour-aware sampling, in two attempts

**Attempt 1 failed and is worth recording.** A gradient heuristic — a cell counts as an edge when its
coverage differs from its neighbours' — **marked almost every cell.** On a limb four cells wide,
"in-between" is the whole limb. Measured on TEST A it put edge glyphs across the entire figure, so the
render read as texture: **worse than the ramp it replaced.**

**Attempt 2 is morphological and needs no threshold:**
> **a boundary cell is a lit cell with at least one unlit 4-neighbour.**

Everything else lit is interior and takes the ramp, which is the ramp's correct job. Orientation comes from
where the form *continues* — lit neighbours above and below means the boundary runs vertically and is drawn
`|`; left and right, `-`; corners, `/` and `\`.

**Verified on a synthetic disc** rather than by eye: **244 edge cells** (a thin ring) against **5,008
interior**. The first attempt had produced the inverse.

## Result

`test-a-ascii.png` now renders a **solid torso, thick limbs, two separated legs and a round head** — a
silhouette rather than a density gradient.

## What this round does and does not establish

**Establishes:** the fault is in the ASCII *representation*, not only in FORM; that a gradient-based edge
detector is wrong for a mask whose features are four cells wide; and that the correct detector is
morphological.

**Does NOT establish:** that the external observer can now read it. **Two rejections in a row mean the
author's reading has no evidentiary weight, and this addendum does not offer one.** The stills have been
regenerated; `out/phase32/blind/` needs rebuilding before the gate is re-run, and **the result of that run
is the only thing that counts.**

## The pattern, now unavoidable

Four separate times in this project — the human "capsule", the word legibility, the centring offset, and
this ramp — **the author looked at an artefact, called it readable, and was wrong.** The difference this
time is that the failure was localised by measurement to a named stage instead of being argued about.


---

# PHASE 3.2B — spatial semantics: the five architecture variants, and what they show

## The external result this responds to

**PARTIAL.** Human CLEAR, `NAME` readable, **architecture FAIL**. The observer's words:

> *"a figure in front of a rectangular grid / screen / stage with a perspective ground plane"*
> *"a large rectangular character field rather than an architectural interior"*

**Accepted.** The human and the text are frozen — this phase does not touch either.

## The architectural conclusion

**Different semantic forms cannot share one ASCII representation strategy.** A human is recognised by
**silhouette**; a room by **junctions, plane segmentation and convergence**; text by **letter topology**.
Phase 3.2A sampled all three with one subject-oriented sampler, which is why the room became a field.

`src/semantic/architecture.ts` implements the architectural strategy:
`SemanticRenderStrategy` values, **line-oriented glyphs chosen by ORIENTATION never luminance**, a
**priority hierarchy** (`junction 100 > contour 60 > planeEdge 50 > planeTexture 20 > atmosphere 5`) so no
sample can erase a junction, and five material strategies.

## The five variants, measured

Semantic geometry is **identical** across all five; only ASCII material differs.

| variant | junctions | texture cells | **rear-wall fill** | subject height |
|---|---|---|---|---|
| v1 edge-only | 4 | 0 | **0.0%** | 59% |
| v2 edge+sparse | 4 | 7 294 | 35.6% | 59% |
| v3 depth-density | 4 | 7 166 | 29.6% | 59% |
| v4 directional | 4 | 9 104 | 32.6% | 59% |
| v5 hybrid | 4 | 7 272 | 35.6% | 59% |

The brief's item 8 asks for the rear-wall fill ratio, and these are it. **v1 is the 100%-reduction case.**

## What inspection of v1 shows — and it is NOT yet a pass

**The edges are drawn correctly**: the back wall is a clean rectangle with junctions at its corners, and
the subject renders as a legible figure at contour priority.

**And the composition still does not read as a room**, for two reasons visible in the render:

1. **The convergence lines are missing.** The semantic geometry defines junction segments for the back
   wall's four edges, but **not the four lines running from the back wall's corners out to the frame
   corners.** Those lines ARE the perspective — without them the back wall is a rectangle floating in
   space, which is exactly the "screen" reading the observer reported. **The single most important
   architectural feature was absent from the geometry table.**
2. **The floor material is disconnected from the wall.** The directional strokes form a hatched wedge whose
   boundary does not meet the back wall's lower edge, so the eye reads a separate shape rather than a
   receding plane.

**Both are geometry omissions, not material-strategy failures** — which is itself the finding: **the five
variants varied the material while the thing that carries architectural meaning was not in the geometry at
all.** Varying fill ratios cannot compensate for a missing vanishing structure.

## Status

**PHASE 3.2B = PARTIAL.** Five variants exist at 1920×1080 with paired semantic previews, the measured
rear-wall fill ratio spans 0.0%–35.6%, the junction priority hierarchy is implemented and verified, and
**`out/phase32b/` is not yet a valid external gate** because the geometry is incomplete.

**Not re-run externally**, and **not self-graded.** The next concrete step is stated by the measurement:
add the four convergence lines to `roomGeometry()`, attach the floor material to the wall junction, and
re-render — **then** submit to the external observer.

## Engine and frozen systems untouched

| | |
|---|---|
| `regression:phase1` | 24/24 PASS |
| `regression:phase2` | 6861/6861 PASS |
| `verify:claims` | 15/15 |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — frozen |
| human representation, `NAME` typography | **not modified** |


---

# PHASE 3.2B — GEOMETRY CORRECTION: topology is now guaranteed, scale is not yet right

## The design error, named

The previous `roomGeometry()` **authored a screen-space rectangle** and separate quads for the other
planes, and **omitted the convergence lines entirely.** The external review called it "a rectangular
screen / grid / stage" — correctly, because **a rectangle floating in space is exactly what it was.**

## `src/semantic/room-geometry.ts` — two rules, both structural

**1. ONE SET OF WORLD VERTICES.** Eight corners in world space — `backTL/TR/BR/BL` and
`frontTL/TR/BR/BL`. Every plane is a face of that box, so **every junction is the same point object by
construction.** `roomPlanes` builds each face by *reference* to those corners, never by re-listing
coordinates.

**2. PERSPECTIVE FROM PROJECTION.** Corners are projected through a camera basis; parallel world lines
converge on screen **because they are parallel in the world.** No screen-space vanishing point is authored;
`deriveVanishingPoint` computes one from two projected parallel lines when the 2D renderer needs it.

## Topology tests — 13, permanent, and they run before rendering

`assertTopology` checks **identity** (`planes.floor[0] === box.backBL`) as well as value equality, so a
duplicated coordinate that merely looks right cannot pass. The brief's nine named tests are included, plus
four that verify the planes actually reference the shared box.

**Result: 13/13 PASS.** Rendering is refused if any fails.

## The geometry oracle

`out/phase32b/geometry-debug.png` — the skeleton: the back-wall rectangle, the front envelope, **all four
convergence edges**, and a junction marker at every corner. One person. **No texture, no ASCII fill, no
NAME, no post.**

`out/phase32b/room-geometry-semantic.png` — grayscale filled planes, painted **front-to-back** so nearer
planes occlude farther ones, which is what makes the volume read.

**Both inspection results:**

| what | verdict |
|---|---|
| perspective volume with four convergence lines meeting at a derived vanishing point | **present and correct** |
| shared junctions, no duplicated coordinates | **guaranteed by the tests** |
| the room **enclosing** the camera | **NOT yet** |

## The remaining measured defect — scale, not topology

The back wall projects to **x 865..1055, y 477..603** — **190 × 126 px of a 1920×1080 frame, about 10%.**
The room therefore reads as a **perspective box floating in the middle of the frame** rather than an
interior the camera stands inside. The convergence lines are right; there is simply not enough room in
frame for the side walls, floor and ceiling to reach the frame edges and enclose the view.

**This is a camera/scale relationship, not a topology error**, and it is stated as the next measurement:
widen the box and bring the back wall closer so it occupies roughly **45–55% of frame height**, at which
point the four convergence edges cross the frame boundary and the volume encloses the camera.

## Status

**PHASE 3.2B GEOMETRY = PARTIAL.** Topology is correct and permanently tested; the oracle renders a real
perspective volume; **the scale does not yet enclose, so the five ASCII material variants were NOT
re-rendered** — the brief says to stop if the semantic image does not read as an interior, and it does not
yet read as one.

**Not self-graded. No external gate generated**, because submitting a known-deficient set would waste the
observer's attention.

## Frozen systems untouched

| | |
|---|---|
| human representation | **not modified** |
| `NAME` typography | **not modified** |
| junction priority 100 / contour 60 / planeEdge 50 / planeTexture 20 / atmosphere 5 | **kept** |
| orientation-driven architecture glyphs | **kept** |
| `regression:phase1` | 24/24 PASS |
| `verify:claims` | 15/15 |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — frozen |


---

# PHASE 3.2B — FRAMING CALIBRATION: solved, and one rendering defect left

## The relations that decide the framing

The brief's correction was right: **moving the camera back makes the back wall smaller.** From the
projection the measurement is exactly

```
back-wall height fraction = halfH * focal / dist        (with the eye at the box front)
back-wall width  fraction = halfW * focal / (aspect * dist)
```

so the height target **fixes** `dist = 2 * halfH * focal`, and the enclosure condition
`halfW < 0.5 * aspect * dist / focal` fixes the width. **Three sweeps failed before this was derived**, and
the reason is recorded because it is the round's main lesson: **a variable whose correct value follows from
an equation should be solved, not swept.** The first sweep used focal 0.55–0.70, which cannot reach a 50%
back wall at any distance in its range.

## Two implementation bugs found by the sweep, both arithmetic

1. **`centre.z` collapsed onto `camZ`**, putting the eye *at the back wall*, so every plane projected
   degenerately and the measured height was ~20% where the algebra predicted 50%. Found by computing the
   **expected** value beside the measured one.
2. **The enclosure test took min/max over all eight corners**, but the front corners are at or behind the
   near plane and `projectRoom` returns `x = y = 0.5` for them. Those clamped values **collapsed the spread
   to the back wall alone**, so every candidate reported "does not enclose" — including ones whose side
   walls plainly do. Enclosure is measured on **screen-space direction**, with behind-near corners
   excluded rather than clamped.

## The selected framing — one candidate in 81 satisfies the contract

| parameter | value |
|---|---|
| `roomHalfWidth` | 1.5 |
| `roomHalfHeight` | 0.9 |
| `roomHalfDepth` | 0.69 |
| `cameraZ` | 0.9315 |
| `focal` | 0.9 |

Measured: **back-wall height 50.0%** (contract 45–55%), **width 46.8%** (contract 40–65%),
**left/right/top/bottom all reach the viewport** = true/true/true/true, **person in frame** at 62.3%.
The full sweep is in `out/phase32b/framing-sweep.json`.

**The eye sits 0.35 of the room's depth FORWARD of the front face** — and that correction came from
inspecting the v2 oracle, where placing it exactly at the front face gave the front corners `depth ~ 0` and
drew the four convergence edges as **an X across the back wall**.

## The oracle: enclosure achieved, planes not yet visible

`out/phase32b/room-geometry-semantic-v2.png` — the back wall projects **900 × 540 px**, and the four
convergence edges now run from its corners out to all four frame corners, so **the volume encloses the
camera.** The person stands on the floor line with feet meeting it.

**One defect remains, and it is a rendering defect rather than a geometry one:** the floor and ceiling
planes render **near-black**. Their quad corners project **outside the frame**, and `polygon` clips to the
image, so those planes paint far less area than they occupy. Raising their values from 0.20/0.34 to
0.34/0.46 did **not** fix it, which confirms the cause is the clipped geometry rather than the value.

**The fix is to clip each plane's quad to the viewport before filling it**, so a plane that extends past the
frame still paints the wedge that is on screen.

## Status

**PHASE 3.2B FRAMING = PASS on the contract; the oracle is not yet a valid gate image.** The five ASCII
variants were **not** re-rendered, because the brief says to stop if the semantic oracle does not read as
an interior — and it does not read as one yet, for the reason above.

**No external gate generated. Not self-graded.**

## Frozen, and verified this round

| | |
|---|---|
| human representation, `NAME` typography | **unmodified** |
| junction priority / orientation glyphs | **kept** |
| 13 topology tests | **PASS** |
| `regression:phase1` | **24/24 PASS** |
| `verify:claims` | **15/15** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — frozen |


---

# PHASE 3.2B — CAMERA-SPACE CLIPPING, IMPLEMENTED AND TESTED

## The architectural rule, now mandatory

> **Perspective geometry that intersects the camera cannot be rasterised correctly by `project -> clamp`.**
>
> The correct order is:
>
> 1. transform to **CAMERA SPACE**
> 2. clip against the **NEAR PLANE** — in camera space, no projection involved
> 3. **project**
> 4. clip against the **VIEWPORT** — in screen space
> 5. rasterise
>
> The two clips are different operations in different spaces and **neither substitutes for the other.**
>
> **This rule is mandatory before any camera movement is introduced.**

**Why the old order failed, measured.** The renderer projected every vertex and, for a vertex behind the
camera, returned the screen centre. **Those fabricated points are inside the frame, so no viewport clamp
could remove them** — a floor whose near corners were behind the camera painted a polygon whose "near"
vertices had been snapped to the middle of the image, producing **an X drawn across the back wall**.

## Implemented

`clipNear` (Sutherland–Hodgman against `z >= near`, **intersections computed in camera space**),
`camToScreen` returning an **explicit `valid: false`** rather than a fabricated coordinate, `clipViewport`
(four half-plane clips — **not per-vertex clamping, which changes polygon topology**), `polygonArea`, and
`clipPlaneToViewport` reporting the counts and areas the brief asks for.

**Every fabricated-coordinate fallback is gone from the semantic path.**

## Permanent tests — 12, all passing

The brief's cases A–G, plus the explicit-invalid-state check. Notable results:

| test | result |
|---|---|
| A fully visible | passes through unchanged, area 0.1600 |
| B crossing an edge | clips to non-zero area; enclosing polygon clips to exactly the viewport, area 1.0000 |
| C one vertex behind | gains intersection vertices; all survivors in front of the near plane |
| D two behind | truncated polygon, all survivors valid |
| E entirely behind | clips to **empty** |
| F camera interior | floor and ceiling produce **non-zero visible wedges** (0.1759 each) |
| G small camera move | area changes **continuously** — max jump 0.0019 over five samples |
| fabricated centre | projection of a behind-camera point returns **`valid: false`** |

**One assertion was wrong and was corrected, not worked around:** test F demanded `> 4` clipped vertices,
but the floor's near corners sit at `z = 0.24` — **in front of** the near plane — so nothing needs clipping
and four vertices is correct. The assertion was the error, not the clipper.

## The v3 oracle

`out/phase32b/room-geometry-semantic-v3.png`, with measured areas:

| plane | world verts | after near clip | after viewport clip | area |
|---|---|---|---|---|
| backWall | 4 | 4 | 4 | 23.4% |
| ceiling | 4 | 4 | 4 | 17.6% |
| floor | 4 | 4 | 4 | 17.6% |
| **leftWall** | 4 | 4 | **6** | 20.7% |
| **rightWall** | 4 | 4 | **6** | 20.7% |

**The side walls gaining two vertices each is the clipping working**: their near edges cross the frame
boundary, and the result is a proper wedge rather than a collapsed quad. **No vertex is at the screen
centre, and there is no X across the back wall.**

## What remains — and it is not clipping

**The floor does not visibly reach the lower frame corners.** Its area is 17.6%, but the render shows the
lower-left and lower-right wedges still near-black while the left and right walls read. Two candidates,
**neither yet tested**:

1. **plane draw order** — `leftWall` and `rightWall` are painted *after* `floor` and their wedges may
   cover the floor's outer regions;
2. **the floor's front corners produce no visible polygon**, so only the region between the back wall's
   lower edge and the frame bottom is filled.

**A second suspicion that must be stated:** the plane values were raised as a diagnostic
(ceiling 0.42, floor 0.55) and the image changed only subtly, which suggests the **PNG encoder or the mask
compositing is not carrying the value through** — a possibility this project has been wrong about before.

## Status

**PHASE 3.2B CLIPPING = DONE and permanently tested.** The framing contract is unchanged
(back wall 50.0% × 46.8%, all four directions reach the viewport — re-measured after the clipping change).

**The five ASCII variants were NOT re-rendered**, because the oracle still does not show all five planes
correctly and the brief says to stop in that case. **No external gate generated. Not self-graded.**

## Frozen and verified

| | |
|---|---|
| room dimensions, camera framing, human, `NAME`, material strategies, glyph rules, junction priorities | **unchanged** |
| 13 topology tests | **PASS** |
| 12 clipping tests | **PASS** |
| `regression:phase1` | **24/24 PASS** |
| `verify:claims` | **15/15** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — frozen |


---

# PHASE 3.2B — PLANE OWNERSHIP AUDIT: the floor was never missing

## The three quantities the brief asked for, kept strictly distinct

| plane | clipped verts | **A** geometric | **B** raster alone | **C** final ownership | bbox |
|---|---|---|---|---|---|
| backWall | 4 | 23.4% | **23.4%** | **23.4%** | x510..1409 y270..809 |
| ceiling | 4 | 17.6% | **17.6%** | **17.6%** | x61..1858 y0..269 |
| floor | 4 | 17.6% | **17.6%** | **17.6%** | x61..1858 **y810..1079** |
| leftWall | 6 | 20.7% | **20.7%** | **20.7%** | x0..509 y0..1079 |
| rightWall | 6 | 20.7% | **20.7%** | **20.7%** | x1410..1919 y0..1079 |

**A = B = C for every plane.** The floor rasterises to **364 539 pixels — 17.6% of the frame — and reaches
y1079**, the bottom row. **The floor polygon was never missing.**

**`empty = 75 px (0.004%)`.** The five planes tile the viewport essentially perfectly, which explains why
their areas summed to 100.0%.

## The overwrite matrix — no overlap

```
empty->backWall  486000     empty->ceiling   364429     empty->floor     364539
empty->leftWall  429225     empty->rightWall 429332
```

**Every write is `empty -> plane`.** There is **no plane-to-plane overwrite anywhere**, so the suspicion
that the side walls were covering the floor is **refuted by measurement**. Draw order was never the issue
and was not changed.

## Draw order, fill rule, compositing operator — recorded, not inferred

- **draw order**: `backWall -> ceiling -> floor -> leftWall -> rightWall`
- **fill rule**: even-odd point-in-polygon at pixel centres
- **compositing operator**: **REPLACE** — each plane writes its value over whatever is there. No max, no
  add, no alpha, no normalise after fill.

## Value propagation — correct at every stage

| plane | expected | stored scalar | final PNG byte |
|---|---|---|---|
| backWall | 0.20 | **0.20** | — |
| ceiling | 0.40 | **0.40** | — |
| floor | 0.60 | **0.60** | — |
| leftWall | 0.80 | **0.80** | — |
| rightWall | 1.00 | **1.00** | — |

Sampled at each plane's own centroid, `ownerId` matched the plane in every case.

## THE ACTUAL CAUSE — CASE E, and it was a perceptual order-of-magnitude error

Sampling the **final oracle PNG** at known plane interiors gave:

| location | byte | what it actually is |
|---|---|---|
| floor interior | **35** | the floor |
| ceiling interior | 27 | the ceiling |
| backWall interior | 40 | the wall |
| leftWall interior | 22 | the wall |
| **"background" at (5,5)** | **22** | **the left wall — there is no background** |

**The side walls were painted at `0.34 -> byte 22`, the floor at `0.55 -> byte 35`, and the true background
is byte 0.** Since the side walls occupy the **full frame height at both edges**, the eye took the darker
surround for background and the floor — thirteen levels away from it — for more of the same.

**A plane that is present and correctly owned can still be invisible if it is not separated from what
surrounds it.** Every measurement in the pipeline was right; the numbers were simply too close together.

## The correction — and only CASE E permits this

Values are now chosen for **separation**, not for realism:

| plane | value | final byte |
|---|---|---|
| floor | 0.95 | **61** |
| backWall | 0.50 | 32 |
| ceiling | 0.34 | 22 |
| side walls | 0.16 | **10** |

**Floor 61 against walls 10 — a 6x separation.** The floor now reads as a distinct surface, the walls
recede to near-black so the convergence lines carry the enclosure, and the back wall sits between them.

## THE DECISION TREE, ANSWERED

| case | verdict |
|---|---|
| A rasterisation failure | **excluded** — B = A for every plane |
| B compositing/overlap failure | **excluded** — no plane-to-plane overwrite at all |
| C value propagation failure | **excluded** — stored scalars equal intended exactly |
| D post/encoding failure | **excluded** — final PNG carries the intended ordering and separation |
| **E visual value / contrast** | **CONFIRMED — this was the cause** |

## Status

**THE ORACLE NOW CONTAINS ALL FIVE PLANES CORRECTLY**: back wall visible, side walls visibly enclosing
from all four frame corners, floor filling the lower perspective region, ceiling filling the upper, no
floating rectangle, no detached wedge, no X across the back wall, no collapsed vertex.

**The five ASCII variants were still NOT re-rendered this round** — the brief restricts it to the audit.
They are now unblocked, and that is the next step, followed by `out/phase32b/blind-final/`.

**No self-grading of recognition.** No external gate generated yet.

## Frozen and verified

| | |
|---|---|
| geometry, camera, clipping, materials, human, `NAME` | **unchanged** |
| 13 topology tests | PASS |
| 12 clipping tests | PASS |
| `regression:phase1` | **24/24 PASS** |
| `verify:claims` | **15/15** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — frozen |

## Audit outputs

`out/phase32b/audit/` — five `*-only.png` isolated masks, `plane-ownership.png` + `.json`,
`overwrite-matrix.json`, `value-propagation.png` + `.json`, `raster-audit.json`.

---

# PHASE 3.2B — EXTERNAL GATE: PASS. Canonical architecture strategy selected.

## The external result, mapped to source variants

The observer saw five shuffled stills and was asked only **"What do you see?"** — no mention of rooms,
variants, or expectations. Opening the key afterwards:

| blind | source variant | external reading | result | rank |
|---|---|---|---|---|
| `still-01` | **v4-directional** | a standing person in a room; left wall, right wall, ceiling, floor and back wall all visible | **STRONG PASS** | **1** |
| `still-03` | **v5-hybrid** | a standing person in a room; strong sense of space, like an interior with a grid/textured quality | **STRONG PASS** | 2 |
| `still-05` | **v3-depth-density** | a standing person in a room/perspective space; the back wall and floor have fairly definite structure | **STRONG PASS** | 3 |
| `still-04` | **v2-edge-sparse** | a standing person in a room with a digital-grid feel, an electronic/abstracted interior | PASS | 4 |
| `still-02` | **v1-edge-only** | a standing person inside a very simplified perspective room / box-like interior | PASS | 5 |

**All five passed.** Every reading named a **person** and an **interior**; the previous failure mode —
screen, grid, stage, panel, terminal, floating box — became **secondary or absent** in every case.
**PHASE 3.2B = PASS.**

## The hypothesis, answered — and it was REFUTED

Before the gate I recorded a hypothesis: *with correct topology and framing, edge-only may already read
as a room, which would mean plane texture is secondary.*

**The external ranking contradicts it.** `v1-edge-only` — the pure topology baseline with **zero texture
cells** — ranked **LAST**. The two variants with the strongest plane separation, `v4-directional` and
`v5-hybrid`, ranked first and second.

**Recognition did not come from topology alone. It came from topology PLUS plane distinction** — which is
exactly what the ownership audit had measured, and what the semantic contrast contract encodes. **Edge-only
has no plane values to carry, so its five planes rendered as one undifferentiated field.**

## CANONICAL_ARCHITECTURAL_STRATEGY = `v4-directional`

Chosen on the brief's priority order, and the choice is **convergent rather than close**:

| criterion | v4-directional |
|---|---|
| **1. external recognition strength** | **rank 1**, and the only variant whose reading named **all five planes individually** (left wall, right wall, ceiling, floor, back wall) |
| **2. semantic clarity** | each plane carries a **plane-specific stroke direction** (`floor` vertical recession, `leftWall` diagFall, `rightWall` diagRise, `backWall` horizontal, `ceiling` sparse) — identity is structural, not tonal |
| **3. structural simplicity** | **one mechanism** — orientation by plane. No depth-dependent spacing, no hybrid composition |
| **4. temporal stability potential** | strokes follow **plane geometry**, which is a continuous function of the camera; there is no sampling threshold to cross. Depth-density (v3) has a `step` that changes with distance, which is a **quantisation that can crawl under motion** |
| **5. computational simplicity** | a single `dir` lookup per plane; no per-cell distance computation |
| **6. camera-motion compatibility** | direction is **derived from the plane**, so it updates continuously and automatically as the camera moves |

**v4 is simultaneously the externally strongest and mechanically the simplest of the textured strategies.**
The brief says to prefer that combination, and it holds here.

**The other four are retained as experimental comparison strategies, not failures.** `v3-depth-density`
ranks third and has genuine value where depth cueing matters; `v5-hybrid` ranks second and is the closest
alternative. `v1` and `v2` are the topology floor and remain useful as controls.

## THE RECOGNITION GRAMMAR — frozen

| semantic category | recognition strategy |
|---|---|
| **HUMAN** | **SILHOUETTE + NEGATIVE SPACE** |
| **TEXT** | **LETTER / GLYPH TOPOLOGY** |
| **ARCHITECTURE** | **PERSPECTIVE TOPOLOGY + JUNCTION CONTINUITY + PLANE CONTRAST + FORM-SPECIFIC ASCII MATERIAL** |

**This is now the basis of the ASCII visual grammar.** The strategic conclusion of the whole phase is that
**these three categories cannot share one representation strategy** — Phase 3.2A's failure was sampling all
three with a subject-oriented sampler, and the room became a field.

## THE SEMANTIC CONTRAST CONTRACT

> ### CANONICAL READABILITY BENCHMARK — *not* a global cinematic lighting rule

The canonical room oracle uses:

| plane | value | role |
|---|---|---|
| **floor** | **0.95** | strongest plane separation |
| **backWall** | **0.50** | medium |
| **ceiling** | **0.34** | lower |
| **sideWalls** | **0.16** | lowest |

**These are benchmark values for room readability, and nothing more.** They exist so that the five planes
are separable in a **test** image where the only question is whether the architecture reads.

**Future shots may use different lighting and exposure values.** A night interior, a high-key shot or a
silhouette will want entirely different numbers, and `ExposureIntent` exists precisely so the Director can
declare them.

**What must survive is not these values. It is semantic plane distinction** — the requirement that the
floor, the walls and the ceiling remain **separable from each other and from the background** at whatever
exposure the shot uses. The audit showed that a 13-level separation is not enough and a 6x separation
works; the *ratio* is the contract, not the numbers.

## NON-BLOCKING DIAGNOSTIC DEBT — `skeletonComponents = 100`

The brief's expectation was that the major architectural skeleton would be **one connected structure**. It
measures **100 components** on every variant.

**This is recorded as NON-BLOCKING DIAGNOSTIC DEBT and is not being fixed**, because:

- **external recognition passed for all five variants**, so the fragmentation does not prevent reading
- the shared vertices are **exact** (13/13 topology tests pass), so the geometry is connected
- the metric counts connectivity of **rasterised cells at junction priority**, and planes drawn
  independently leave junction gaps at their shared boundaries without contradicting the geometry

**The condition for revisiting it is a visible failure, not the number:** if it ever causes temporal
instability, camera-motion breakage, junction flicker or form fragmentation, fix it then. **"Fixing the
metric" without a visible failure is exactly the kind of change this project has had to undo five times.**
