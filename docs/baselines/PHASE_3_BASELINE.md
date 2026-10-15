# PHASE 3 BASELINE — FROZEN

**Frozen at:** round 60 of 60, on acceptance of Phase 3 as PARTIAL.
**Purpose:** the immutable starting point for Phase 3.1. Phase 3 history is **not** rewritten here; this
document records state, not narrative. The narrative lives in `docs/PHASE_3_COMPLETION.md` and
`docs/PHASE_2_VISUAL_REVIEW.md`, both unchanged by this freeze.

**Status vocabulary:** `DELIVERED` / `PARTIAL` / `WEAK`. Phase 3 is **PARTIAL — 8 of 10 gates
delivered outright**.

---

## 1. Renderer state

| | |
|---|---|
| Glyph lattice | **240 × 120** cells, cell 8 × 9 px, 5 × 9 bitmap font, printable ASCII 0x20–0x7E |
| Frozen Phase 1 spec | seed `3912112200`, 5 shots × 4 s, 30 fps, 1920 × 1080 |
| CPU path | `src/render/frame.ts` → `evaluateShotFrame` → `grid.bin` via the `ACGR v1` gridbin seam |
| GPU path | `src/render/gpu/` — raw WebGL2 + GLSL ES 3.00, headless Chrome, **SceneIR only** |
| GPU passes | `ScenePass → EdgePass → GlyphSelectPass → AsciiCompositePass → BloomPass → PostPass` (six) |
| Float FBOs | **INCOMPLETE on this ANGLE/Metal build** — runtime probe falls back to RGBA8 (`float=false`) |
| Occlusion | `nearest` (nearer primitive REPLACES a fainter far one, bounded by construction) |
| Glyph selection | CPU: brightness **+ local edge magnitude**, composed in coverage units. GPU: edge, contrast, depth, role, density |
| Easing vocabulary | 14 curves, all satisfying `f(0)=0`, `f(1)=1` exactly |
| Transition vocabulary | 11 `TransformKind` members; **9 of 9** Gate-6 named transitions reachable |
| Object kinds | **7 of the 12** Gate-5 names: `point line polyline text grid cloud trail` |

### Exposure pipeline — and its current authority problem

| stage | behaviour |
|---|---|
| `autoExpose` | per-shot-frame scale from the field's own lit values |
| `fieldNormalise` | **restored in round 53** after being lost in round 37. Split subject/space: subject to the clip threshold, space to a fraction of it |
| `spaceFraction` | 0.9 |
| bloom / halation | 0.45 / 0.3, applied **after** normalisation so the glow is not compensated away |
| motion blur | `shutter: 0.5`, 3 sub-frame samples — **correct, measured visually inert at this corpus's motion speed** |

> **KNOWN DEFECT CARRIED INTO 3.1.** The per-shot normaliser has **dramatic authority it should not
> have**: it flattens between-shot contrast, and no shot is permitted to be genuinely empty. Measured:
> `disappearing-room`'s lit-cell range collapsed from **58× to 3.5×** (release 424…1 466). This is Phase
> 3.1 step 9/10's subject matter.

---

## 2. Benchmark hashes

`grid.bin` is 34,560,564 bytes in every case (34 560 000 payload + header).

| film | `grid.bin` sha256 | frames |
|---|---|---|
| `desire` | `7289ccf80129492b9236a4e660edcebc9a29d08dd6381db5113b0ae989601f68` | 600 |
| `forgotten-name` | `fec81ef59183cbf47f8a99328929ea6b9445ed3e377e48e55bea6e08bc97da61` | 600 |
| `disappearing-room` | `74a943ae2de8c881aedb356e21d308c4e21de91a2e06b7eb322a29fee4f38885` | 600 |
| `time` | `35251f3af0fe7c8090922b0805e737b66d8aaa51a0a1097f04ee3049899445fc` | 600 |
| **`loneliness` — FROZEN, MUST NOT CHANGE** | `49b4c86bcbc5677f5d02eb1012087aa4301615aca289b8d02c58a7cb974757e8` | 600 |

**`loneliness` has been byte-identical through all 60 rounds of Phase 3**, verified by hashing the
artefact directly and by the 24-gate Phase 1 regression.

**Provenance:** `npm run visual:baseline` — each capture records the `grid.bin` sha256 and the measured
window (which shot, which camera kind, which frames) that produced every motion figure, and refuses to
compare runs whose windows differ.

---

## 3. Visual metrics — `out/visual-qa/r55-final.json`

| film | meanInk | nearWhite | midtones | structural | glyphCov | rows | camEnd |
|---|---|---|---|---|---|---|---|
| `desire` | 70.1 | 1.3% | **44.6%** | 28.8% | 11.21 | 91/120 | 8.26% |
| `forgotten-name` | 66.0 | 2.8% | **39.5%** | 29.2% | 11.26 | 78/120 | 4.10% |
| `disappearing-room` | 73.2 | 5.2% | **39.0%** | 41.4% | 10.62 | 85/120 | 3.06% |
| `time` | 71.5 | 0.4% | **49.1%** | 20.3% | 9.83 | 87/120 | 6.64% |

**Start of Phase 3 → frozen:** near-white `forgotten-name` 20.6% → 2.8%; midtones `disappearing-room`
15.7% → 39.0%; structural glyphs ~0% → 20–41%.

### Form in the frozen corpus — the number 3.1 exists to change

`disappearing-room`, whole film: **lit cells 424 minimum (f330) … 1 466 maximum (f378) = 3.5×.**
No void exists anywhere in the corpus.

---

## 4. Review ratings — 11 PASS, 1 WEAK, 0 FAIL

| # | criterion | rating |
|---|---|---|
| 1 | COMPOSITION | **PASS** |
| 2 | DEPTH | **PASS** |
| 3 | SUBJECT LEGIBILITY | **PASS** |
| 4 | ASCII QUALITY | **PASS** |
| 5 | GLYPH DENSITY | **PASS** |
| 6 | CAMERA READABILITY | **PASS** |
| 7 | MOTION READABILITY | **PASS** |
| 8 | NEGATIVE SPACE | **PASS** |
| 9 | CONTRAST | **PASS** |
| 10 | VISUAL HIERARCHY | **PASS** |
| 11 | TRANSITION QUALITY | **PASS** (dissolve 0.15–0.27 s → **0.63 s / 0.525 s**) |
| 12 | **FILMIC FEELING** | **WEAK** |

**FILMIC FEELING is the whole of Phase 3.1's subject matter.** Its cause is recorded and is not
tonal, compositional or mechanical: **the subject is a procedural point field, and a field depicts a
field.** Reached independently from four directions and crossed by none — exposure (r17–24), light
(r36–38), motion (r33–34, 45), form (r52–55).

### The judgment on `disappearing-room` shot 03 — CORRECTED

The Phase 3 brief required an explicit ruling: INTENTIONAL VOID or VISUAL FAILURE. The answer at freeze
is **NEITHER**:

- the comment frame cited (`f531`) lies in **shot 04**, not shot 03;
- shot 03's authored `composition.negativeSpaceRatio` is **0.437** — mid-range, and *lower* than shots 01
  (0.657) and 05 (0.617). It was never authored as a void;
- and the current film contains no void at all.

---

## 5. Gate status

| gate | status | note |
|---|---|---|
| 1 visual baseline + 12-criterion review | **DELIVERED** | 1 731-line review; void judgment now corrected |
| 2 GPU production renderer + ADR | **DELIVERED** | verified by running it: 7 545 prims → PNG, all passes live |
| 3 multi-signal pipeline | **DELIVERED** | CPU brightness+edge, GPU five-signal |
| 4 glyph atlas + families | **DELIVERED** | six families |
| **5 native object system** | **PARTIAL** | **7 of 12 named kinds.** `shape`, `mesh`, `volume` absent; `word` ≡ `text`; `field` ≈ `grid`+`cloud` |
| 6 ASCII typography | **DELIVERED** | `NAME` renderer-verified; 9 of 9 transitions |
| 7 CJK interface + ADR | **DELIVERED** | deterministic symbolic; no English placeholders |
| 8 depth buffer / occlusion | **DELIVERED** | |
| **9 post-processing + optics** | **PARTIAL** | bloom, halation, grain, vignette, scanline, motion blur, rack focus, lens breathing, aperture **delivered**. **Aberration impossible** (luminance-only field). **DOF code absent** (five variants measured) |
| 10 motion language + QA harness + ADR | **DELIVERED** | applied to corpus with controlled A/B; harness refuses invalid comparisons |

**8 of 10 delivered outright.**

### Corrections of record carried forward

Phase 3's final rounds found, by auditing its own documents: **16 wrong numeric/status claims**, one
implementation reported working but never wired (`fieldNormalise`, lost r37, found r53), one "implemented
but disabled" whose code was **absent** (`dof`), one gate reported DELIVERED implementing 7 of 12 named
kinds, and one ruling citing a frame in a different shot. **Every gate, metric and reproducibility check
was green throughout.** Sixteen of the seventeen were **summaries, never measurements**.

---

## 6. `verify:claims` state

`npm run verify:claims` — **15 of 15 pass.**

| group | asserts |
|---|---|
| frozen Phase 1 | `out/loneliness/grid.bin` hash **and** byte length |
| spec wiring | every per-shot `raster` field is read by `frame.ts`; `textTypeIn` remains unimplemented |
| gate 5 coverage | 7 kinds implemented, 4 absent (`shape field mesh volume`) |
| void judgment | shot 03 not authored as a void; no void in the current film |
| documents | both tallies agree; review carries its orientation banner; no unlabelled `FINAL:` tally |
| **FIRST RULE** | no image/video assets in `src/ scripts/ tests/`; ffmpeg inputs are `rawvideo` and `pipe:0` only |

**Regression state at freeze**

| suite | result |
|---|---|
| `npm test` | 518 965 / 518 965 |
| `npm run regression:phase1` | 24/24 — `loneliness` byte-identical |
| `npm run regression:phase2` | 6 861 / 6 861 |
| `npm run benchmarks` | 54/54 PASS |
| `npm run diversity` | PASS |

---

## 7. What Phase 3.1 must add, stated against this baseline

Phase 3 produced **boundaries** — a silhouette that contains its subject, a lattice that fills the frame,
a word that renders as its own letters.

**A boundary is not a form.**

```
BOUNDARY  ≠  FORM  ≠  SUBJECT  ≠  MEANINGFUL OBJECT
```

- a rectangle around particles is not a **room**
- a contour around a cluster is not a **person**
- a dense band of marks is not a **written name**

The measurement that Phase 3.1 is judged on is therefore **not** in this document's tables: it is
whether a viewer, given a still and no metadata, can say **what is physically present in the shot.**

Phase 3 reached the limit of what a boundary can express. Phase 3.1 begins at form.
