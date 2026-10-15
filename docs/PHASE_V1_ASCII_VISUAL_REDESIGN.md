# PHASE V1 — ASCII CINEMATIC VISUAL REDESIGN (FIRST GATE)

**PHASE V1 = EXTERNAL DIRECTOR GATE READY / PARTIAL.**

The director's rejection was **reproduced by measurement**, a new ASCII material and camera system was built, and
**three motion studies** were produced. **The complete 16-second V3 was NOT rendered**, as instructed.

---

## 1. THE AUDIT — the complaint is correct, and here is the evidence

| finding | measurement |
|---|---|
| **five shots, one viewpoint** | `x=0`, `target=(0,EYE_Y,0)`, `focal=0.9` for **every frame**; only `camZ` varies, within 0.15. **Four of five shots have no camera movement at all.** |
| **constant ink** | **0.0398 ± 0.0008** for frames **0–380** — 79% of the film |
| **essentially static** | mean frame-to-frame change **0.16/255 (0.06%)** |
| **ASCII as filter** | figure = uniform solid `#` block; all planes filled with the same `+`/`*`; `NAME` no heavier than the wall |
| **repetitive** | symmetric box, face-on, eye level, centred, every shot |

**V2 was not modified.** All 480 frames, its container and its hash `fb8c4175d2bdba32` are untouched.

## 2. THE NEW MATERIAL — `src/design/`

`geometry.ts` (camera, projection, near-plane clipping, shot scale), `material.ts` (glyph families,
depth-buffered `Canvas`, line/capsule/disc/box primitives with character topology), `raster.ts` (glyph-atlas
rasteriser with line weight).

**Six glyph families**, each a different alphabet: `architecture` · `figure` · `text` · `atmosphere` · `accent` ·
`detail`.

**Three mechanisms that change what ASCII *is*:**
1. **depth buffer** — a nearer material occludes a farther one
2. **character topology** — a limb is a **contour with a graded interior**, not a fill
3. **filled cells** — a glyph pixel fills its cell range

## 3. THE THREE MOTION STUDIES — 90 frames each, 1920×1080, 30 fps

| study | question | measured outcome |
|---|---|---|
| **A** KINETIC TYPOGRAPHIC SCULPTURE | can characters have volume, and can a camera reveal it? | torus knot of letterforms; camera orbits **1.05 rad** and rises; **ink 22.0% → 45.9%** on the break; **37 distinct glyphs** |
| **B** CINEMATIC ASCII SPACE | can ASCII build space with depth and parallax? | corridor; **5 materials in one frame**; camera travels **12 units** with roll; **10 distinct glyphs** across 4 families |
| **C** GLYPH FIELD TRANSFORMATION | can a mass become a readable word? | **ink 0.29% → 25.06%**; sparse field → dense coherent mass → **solid legible `NAME`** |

**No winner is selected.**

## 4. THREE MEASURED FAILURES DURING THE WORK — recorded, not hidden

Each study was rendered, inspected and **failed**, then repaired:

| study | failure | measured cause | repair |
|---|---|---|---|
| **A** | thin wireframe | **954 glyphs in 28 800 cells (3.3%)** | extrude the stroke on a **13 × 9 grid** instead of 5 sample points → 22% ink |
| **B** | **empty black frame** | the slab quads projected **outside the view** | rebuild as a **continuous corridor** of wall/floor/ceiling bands that cannot miss the view |
| **C** | **unreadable** — `NAME` as isolated marks | one glyph per bitmap pixel with **6-cell gaps** | size the word so each pixel **owns a cell range and is filled** |

**Study C's fix generalises:** *a letterform is legible when its pixels are FILLED, not sampled.*

## 5. CAMERA AND COMPOSITION CAPABILITY

`camera-comparison.json`. V2 could express **1 scale, 1 angle, 2 moves**. The new model expresses arbitrary
position, arbitrary look-at, **fov 26–74°**, **roll**, and `solveCameraForScale()` which **binary-searches the
distance that yields a requested subject-height fraction** — so *close-up* and *wide* are choosable.
Scale vocabulary: extremeCloseUp 0.85 · closeUp 0.55 · medium 0.30 · wide 0.16 · extremeWide 0.08.

**Caveat recorded:** these are **capabilities demonstrated by studies**, not yet a V3 shot list.

## 6. KNOWN LIMITATIONS — the largest first

1. **NO FIGURE HAS BEEN DRAWN IN THE NEW LANGUAGE.** All three studies are environments, sculptures and type.
   **The character-topology mechanism exists but is unproven on a body** — and the figure is the film's subject.
2. **Transitions are not demonstrated.** Form match, motion continuity and material takeover are designed but
   **not shown**, because each study is a single continuous move.
3. **B is static in tone** — ink 11.79% → 11.69% across the shot: it moves through space without changing state.
4. **A crops at the frame edges** during the orbit; a V3 shot needs framing control.
5. **No sound, no music analysis, no beat grid** was touched; nothing was synced.
6. **No engineering PASS is claimed as an artistic PASS** (see §7).

## 7. ENGINEERING vs ARTISTIC GATES — kept separate

**Engineering gates** (deterministic render, shader/renderer integrity, Phase 3 regressions) are unchanged from
Phase 3.3K and re-run below.

**Artistic gates** are **the external director's alone**: visual sophistication, composition variety, ASCII
material design, transition creativity, perceived motion, rhythmic coherence. **A successful render is not
evidence of any of them** — and this phase's own history proves it: **all three studies rendered successfully
on the first attempt and all three were visually wrong.**

## 8. REGRESSIONS

Phase 4A **76/76** · timing domain **15/15** · `tsc --noEmit` **clean** · `verify:claims` **15/15** ·
`regression:phase1` **24/24** · `regression:phase2` **6861/6861** ·
`grid.bin` **`49b4c86bcbc5677f`** · **V1 `ab39d78a40e74ba7`** · **V2 `fb8c4175d2bdba32`** ·
`contract-proof-film` **`acc609cc22a69899`** · `P1-serial` **`dd0075dacc0596ca`** ·
`v4-directional.png` **`c9585c1322e62269`** · Phase 4B0 previews and all Phase 4A outputs **untouched**.

## 9. TOOLING CONSTRAINT DISCOVERED

The bundled ffmpeg **has no filter support at all** (no `scale`, no `tile`, no `select`) **and no `rawvideo`
muxer**. **`visual-contact-sheet.png` was therefore composited by direct pixel copy in code**, not by an ffmpeg
filter graph. Recorded because any future frame-analysis work must account for it.

## 10. OPEN DEBT

1. **the figure is unproven in the new language** — the largest risk for V3
2. **transitions undemonstrated**
3. B's tonal stillness; A's edge cropping
4. **no shot list yet** — 7–9 compositions are proposed, not designed
5. **the accent colour is used but not yet justified** by a colour system
6. **the corridor is a corridor**, not the film's room — the room still has to be redesigned in the new language
