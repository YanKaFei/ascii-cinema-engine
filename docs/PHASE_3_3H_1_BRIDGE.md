# PHASE 3.3H.1 — FIELD → LINE GRID RENDER BRIDGE

**PHASE 3.3H.1 = PASS.** The bridge is repaired, the raster contract is formally closed, and the performer's
motion now reaches the image.

**PHASE 3.3H remains PARTIAL** — it becomes complete only when an external observer can compare P1/P2/P3.
That is **3.3H.2**.

---

## 1. MINIMAL CELL REPRO — PASS

Blank field, no room, no person, no NAME, no camera, no animation framework. One occupied cell.

| | |
|---|---|
| case A | cell (20, 20) |
| case B | cell (40, 20) |
| same glyph | `#` |
| same priority, same source | `contour` |

`linesA !== linesB`, **exactly 2 changed characters**, identified precisely:

```
row 20 col 20: '#' -> ' '
row 20 col 40: ' ' -> '#'
```

Both on row 20, at exactly the two written columns. `fieldOccupancy`, `fieldSemantic` and `lineGrid` hashes
all differ.

## 2. DISC REPRO — every stage changes

Disc radius 6 at (40, 20) versus (60, 20):

| stage | hash A | hash B | changed |
|---|---|---|---|
| field occupancy | `36dd97f8ba56e51b` | `81cba09908f11c96` | **YES** |
| field semantic (position+glyph+source) | `675f31ed2084d2d0` | `aa6fdc56eeae70d5` | **YES** |
| line grid | `7923956ad8691415` | `949c6fc0970c3be1` | **YES** |

The line-grid bounding box moved **exactly 20 columns** (`x34..46` → `x54..66`), matching the translation.

**No stage failed to change, so the defect was not in the bridge itself** — it was in what the render was
putting *into* the field. That is what the boundary measurement found.

## 3. ALIASING AND STALE CAPTURE — clean

`linesA` is unchanged after the field is mutated into state B (no aliasing), and `linesB` reflects the
mutation (no stale capture). Glyph change at one position and **position change with an identical glyph**
both change the line grid.

## 4. THE BUG — ROOT CAUSE

**`drawBody` wrote no glyph of its own.**

```js
const put = (x, y, ch, src) => write(fld, x, y, { source: src ?? 'contour', ch, weight: 1, freshness: 1 });
//                                                                   ^^ undefined
```

**None of the body's draw helpers passed a `ch`.** `write()` falls back to the cell's existing character when
`cell.ch` is undefined, and the field is created empty — so a body cell in a `' '` position stays `' '`. But
`drawRoom` runs **first** and has already placed plane-edge `+` marks where the figure stands, so **the figure
inherited `+` on every cell it touched.**

### Measured consequence, at the function boundary

| frame | glyph census |
|---|---|
| f0 | `+@contour` **939**, `#@substitution` **80** |
| f135 | `+@contour` **939**, `#@substitution` **80** |
| f269 | `+@contour` **939**, `#@contour` **27**, `#@substitution` **53** |

**`+@contour` was 939 at frame 0 and 939 at frame 269.** The figure was 939 cells of the *same character*, so
moving it changed **nothing** in the line grid — while `preFieldHash` changed at every frame, because the
`source` field differed (`contour` vs `substitution`) even though the character did not.

`preFieldHash` varied, `postLineHash` was constant. **That is the defect boundary, measured rather than
inferred.**

## 5. THE FIX

One line — the body writes its own glyphs:

```js
const put = (x, y, ch, src) => write(fld, x, y, { source: src ?? 'contour', ch: ch ?? '#', ... });
```

`#` for the silhouette interior and `|` for its edge — **the two characters the human recognition grammar has
used since Phase 3.1.** `drawBody` never specified them, so the grammar was never actually applied to the
performer.

**Immediately after the fix:**

| frame | preFieldHash | postLineHash | occupied |
|---|---|---|---|
| f0 | `a60d2896507c` | `c1b59e24c03c` | 2380 |
| f135 | `8877c2fca875` | `76351160b7b2` | 2498 |
| f269 | `c070095554f4` | `d8307f990035` | 2527 |

**Field hash AND line hash both vary per frame.** The bridge carries motion.

## 6. RASTER CONTRACT — formally closed

| assertion | result |
|---|---|
| different line grid → different decoded pixels | **PASS** — **199 332** differing bytes |
| same line grid → identical raster | **PASS** — 0 differing bytes |
| a same-glyph move reports **position** change, not substitution | **PASS** — 2 positions, 0 substitutions |
| a static scene reports **zero** churn of either kind | **PASS** |

`tests/render/field-to-lines.test.mjs` — **26/26**, including the contract.

## 7. A MISLEADING METRIC REPLACED

`src/semantic/grid-diff.ts` — `diffLineGrids()` and `churnBetween()`.

The old `asciiChurnCells` compared **character values only**, so it read **0** while the figure moved with
the same glyph **and 748 while the rendered image was byte-identical on every frame.** It was wrong in both
directions and its name gave no hint which property it measured.

The replacement reports **occupancy movement** and **glyph substitution** separately. A same-glyph move is
counted as movement; a static image cannot report churn. The old metric is **not kept under a new name** — it
is gone, because a metric that measures the wrong thing is not improved by relabelling.

## 8. HUMAN-ONLY PROBE — PASS

Performer alone on black, no room, no NAME, 30 frames, neutral → orient → partial step.

| | |
|---|---|
| unique line-grid hashes | **27 / 30** |
| unique raster hashes | **27 / 30** |
| exported | `out/phase33h1/human-probe-frame-{000,015,029}.png` |

**Motion reaches the image.**

### A silhouette defect found by looking, and NOT fixed this round

**The head is detached from the torso.** The probe's `headTurn` displaces the head laterally by up to 30% of
body height, while the neck is drawn as a vertical box at the *unshifted* root x — so at maximum turn the head
floats free of the body. **The figure is not human at motion extrema**, which violates the §13 readability
requirement.

This is a **probe-stage geometry defect**, not a bridge defect, and it is **recorded rather than patched**
inside a diagnostic script. It is the first item of 3.3H.2.

## 9. CANONICAL ROOM STATUS — RESTORED

The `filled planes → outlines only` change was **DEBUG / PERFORMANCE ISOLATION ONLY** and has been **reverted**.

Its diagnostic question is closed by the real root cause: the figure was invisible because it **inherited the
room's `+` glyph**, not because it shared ink with a full-coverage floor. §13's requirement is met — production
composition was **not** solved by deleting room material.

**Canonical architecture remains `v4-directional`**, exactly as frozen by the Phase 3.2B external gate: the
plane fill and the plane-specific stroke directions are restored byte-for-byte. The performance clips were
re-rendered with the canonical room and all render gates still pass, so the fix does not depend on the hack.

## 10. PERFORMANCE RENDER GATES — PASS (with the canonical room)

| variant | unique frame hashes | position churn | glyph churn | contact frames | foot slip | root jump ratio |
|---|---|---|---|---|---|---|
| **P1-serial** | **190 / 270** | 5 658 | 856 | 4 | **0** | 2.00 |
| **P2-lead-follow** | **215 / 270** | 5 684 | 860 | 6 | **0** | 2.01 |
| **P3-holds** | **165 / 270** | 5 598 | 844 | 6 | **0** | 2.00 |

**Root trajectory corresponds to visible displacement:** `rootX` −0.950 → −0.530 (0.420), the **moving foot
travels exactly 0.420**, and the **planted foot moves 0.000**. **Hand-to-NAME falls 1.050 → 0.190.** No
unexplained reset.

**No blind package was created.** Per the brief, the three clips must be genuinely visually distinct before an
observer is asked, and **the detached-head defect means the performer is not yet reliably human at motion
extrema.** That is 3.3H.2's first task.

## 11. FROZEN — unchanged

`PerformanceIntent`, lead/follow timing, `oneStep()`, reach, P1/P2/P3 timing, root trajectory, pose
continuity. **No camera, no ASCII expression, no walk cycle, no new performance action.** The pipeline was
repaired **in place** — no bypass, no special rendering path for 3.3H. The intended chain now works:
`semantic state → field → fieldToLines → rasterLines → image`.

## 12. REGRESSIONS

| gate | result |
|---|---|
| `field-to-lines` bridge + raster contract | **26/26** |
| composition relations | **31/31** |
| shot grammar | **51/51** |
| causal trace | **42/42** |
| 3.3A temporal baseline | unique hashes 1, cross-run 0 |
| `tsc --noEmit` | clean |
| `verify:claims` | **15/15** |
| `regression:phase1` | **24/24** |
| `regression:phase2` | **6861/6861** |
| `loneliness/grid.bin` | `49b4c86bcbc5677f` — frozen |
| `v4-directional.png` | `c9585c1322e62269` — unchanged |
| `phase33g/final-silent.mp4` | `ab39d78a40e74ba7` — unchanged |
| `phase33e/version-B.mp4` | `346c81d19ba8df8e` — unchanged |

## 13. THE LESSON, recorded because it is the transferable part

**The defect was invisible to every metric this project had, and visible in one glyph census.**

Three separate metrics were wrong in this phase and each sent the investigation after a different subsystem:
`asciiChurnCells` read 0 for real motion, the foot-slip counter flagged the step as a defect, and a hand-made
`< 0.02` threshold failed smooth motion. **The fix took one line and was found by printing which characters
were actually in the field** — the simplest possible measurement, attempted last.

**Fifth inert-mechanism-class defect in this project** (after the A2 contour path, the `objectInk` opacity
field, `prominence`, and the missing `scene.ts` ink multiply). The pattern is the same every time: **a value
that is written but never reaches its consumer, while the code reads as though it does.**
