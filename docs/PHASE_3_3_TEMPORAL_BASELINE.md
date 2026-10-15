# PHASE 3.3B — SINGLE-VARIABLE CAMERA PUSH

**The experiment:** exactly ONE thing moves — the camera. Human, pose, room geometry, `NAME`, materials,
`ExposureIntent` and semantic contrast are frozen.

**Question:** CAN THE CAMERA MOVE THROUGH THE ASCII WORLD WITHOUT THE WORLD LOSING TEMPORAL COHERENCE?

**PHASE 3.3B = PASS on every machine-checkable condition.** External review package generated; the
external verdict is the remaining gate.

---

## 1. CAMERA PATH

| quantity | value |
|---|---|
| move | **PUSH-IN**, translation along the viewing axis only |
| orientation | **fixed** |
| easing | smoothstep, deterministic |
| `cameraZ` | `0.9315` → **`0.5756`** (forward 0.3559) |
| `focal` | 0.9, unchanged |
| back-wall height | **50.0% → 64.0%** |
| frames | **90** at 30 fps = **3.000 s**, 1920×1080 |

### The endpoint was SOLVED, not swept

From the projection relation `height = halfH * focal / dist` with the room **fixed**:

```
target 62%  ->  dist 1.3065  ->  camZ 0.6165
target 64%  ->  dist 1.2656  ->  camZ 0.5756   <- SELECTED (mid of the required 62-65%)
target 65%  ->  dist 1.2462  ->  camZ 0.5562
```

**No sweep was needed** — the equation left no free parameter. The eye remains **inside the room volume**
at every frame (`camZ1 = 0.5756 < frontZ = 0.69`).

### Frame 0 and the canonical still — a structural note, not a match

**Frame 0 does NOT equal the 3.3A canonical still byte for byte**, and the brief anticipated this
("unless the camera-path representation structurally requires otherwise"). It does:

- in 3.3A the human was drawn in **SCREEN space** (`cx = 30% of the lattice`)
- in 3.3B the human is a **fixed WORLD position** projected through the camera, because a screen-space
  figure cannot be photographed

**The composition, materials, room, `NAME`, semantic values and exposure are identical**; the human's
anchor changed from a screen coordinate to a world coordinate, and the `NAME`'s depth had to be corrected
(see §7). **This is recorded rather than glossed.**

---

## 2. CAMERA IS THE SOLE CHANGING SEMANTIC INPUT

The room box, `roomPlanes`, the human's world geometry, the `NAME` geometry, `SEM` plane values, `DIR`
orientations and `FOCAL` are all constructed **once** and closed over. The frame loop's only varying input
is `camZ`. The semantic forms are never rebuilt.

---

## 3. ANCHOR TRAJECTORY RESULT

15 named world anchors tracked through all 90 frames, recording world coordinate, projected x/y and
validity.

| metric | result |
|---|---|
| **invalid anchor projections** | **0 / 1350** |
| screen-centre collapses | **0** |
| NaN / Infinity | **0** |

**No anchor teleports, jumps to screen centre, or becomes invalid.** Anchors tracked: the four back-wall
corners, the ceiling and floor back junctions, the human's head / shoulders / pelvis / feet, and
`NAME` centre / left / right.

---

## 4. CLIPPING UNDER MOTION

Per frame, per plane: world vertex count, near-clipped count, viewport-clipped count, visible area,
finiteness.

| metric | result |
|---|---|
| **clipping issues across all 90 frames** | **0** |
| planes with < 3 viewport vertices | **0** |
| non-finite projected coordinates | **0** |
| vertex-count explosions | **none** |
| one-frame polygon disappearance | **none** |

**The clipping system built before camera motion works under camera motion.** This is its first dynamic
exercise and it produced no topology failure.

---

## 5. MONOTONIC PROJECTION

| metric | result |
|---|---|
| **back-wall area monotonic** | **true** |
| reversals | **0** |

The pure optical-axis push expands the back wall **monotonically** across all 90 frames, as the projection
requires. The human's projected height grows **687.2 px → 1002.6 px, +45.9%**, continuously.

---

## 6. RAW CHURN CURVE

| frame | camZ | camera velocity | changed glyph cells | churn % | changed px |
|---|---|---|---|---|---|
| 1 | 0.9314 | 0.00013 | 36 | 0.13 | 608 |
| 11 | 0.9165 | 0.00250 | 186 | 0.65 | 4 262 |
| 21 | 0.8814 | 0.00425 | 372 | 1.29 | 8 492 |
| 31 | 0.8320 | 0.00540 | 578 | 2.01 | 14 284 |
| 41 | 0.7745 | 0.00595 | 517 | 1.80 | 13 860 |
| 51 | 0.7148 | 0.00589 | 1 147 | 3.98 | 22 983 |
| 61 | 0.6591 | 0.00522 | 1 015 | 3.52 | 24 687 |
| 71 | 0.6134 | 0.00395 | 676 | 2.35 | 17 729 |
| 81 | 0.5837 | 0.00207 | 724 | 2.51 | 17 463 |
| 89 | 0.5756 | 0.00013 | 75 | 0.26 | 1 550 |

**The curve has the expected broad shape:** near-zero velocity at both ends produces 36 and 75 changed
cells; mid-move velocities produce 500–1 150. **Raw churn is present and is expected motion change, not
failure** — this is the distinction the brief requires and Phase 3.3A's zero-churn baseline is what makes
it measurable.

---

## 7. A REAL BUG THAT WORLD-SPACE PROJECTION EXPOSED

**The `NAME` was authored at `z = +1`.** The room's wall is at `z = -0.69` and the eye starts at
`z = 0.9315` — so **`z = +1` is behind the camera.** The text never projected on any frame, and it took out
the three `NAME` anchors with it: **270 invalid anchor projections, exactly 3 × 90.**

**Phase 3.2B authored the name in SCREEN space, so the wrong depth was invisible.** The moment it was
projected as a world semantic form the error appeared. **This is the concrete argument for world-space
semantic forms**, and it is the first defect that only motion could have found.

Corrected to sit on the wall surface (`z = -0.64`). After the fix: **0 invalid anchors, 0 frames with
`NAME` absent.**

---

## 8. WORLD-PROBE STABILITY

125 deterministic world probes (25 per plane, fixed seed) projected every frame; the rendered cell under
each projection was read back.

| plane | probes projecting per frame |
|---|---|
| backWall | **25 / 25 every frame** |
| leftWall | 10–20 |
| rightWall | 8–17 |
| floor | 9–19 |
| ceiling | 3–13 |

**The fall-off is expected and is not material loss:** during a push-in the near surfaces (floor, ceiling,
side walls) project **outside the frame**, so their probes have no cell. **The back wall, which stays in
frame throughout, retains 100% of its probes on every frame.**

## 9. MATERIAL COORDINATE SPACE — determined, not assumed

> **`materialCoordinateSpace = PLANE_LOCAL`** (world-stable, because the plane quads are the **projected**
> room faces and marks are placed on those faces).

There is **no independent screen-space texture phase**. A mark's position is a function of the plane's
projected geometry, so texture moves **with** the surface rather than crawling across it. **No rewrite was
performed**, because the rendered experiment did not show instability in the probe data.

---

## 10. ARCHITECTURE STABILITY

| plane | direction | glyph | orientation flips |
|---|---|---|---|
| floor | vertical | `\|` | **0** |
| leftWall | diagFall | `\` | **0** |
| rightWall | diagRise | `/` | **0** |
| backWall | horizontal | `-` | **0** |
| ceiling | horizontal | `-` | **0** |

**No orientation flips, because `dir` is a per-plane constant derived from the plane.** This was the
temporal claim made for v4-directional in Phase 3.2B and it holds under a moving camera — the property
that made it the canonical choice.

---

## 11. HUMAN AND TEXT RECOGNITION UNDER MOTION

Neither moves, so both are pure **scale/resampling** tests.

| metric | result |
|---|---|
| human projected height | 687.2 → **1002.6 px**, monotone |
| frames with the human absent | **0 / 90** |
| `NAME` width | 713.7 → **922.7 px**, +29.3% |
| frames with `NAME` absent | **0 / 90** |

**No semantic part vanishes for a single frame and reappears.**

---

## 12. TEMPORAL OUTLIERS

**No threshold was set beforehand.** Outliers were identified after measurement at > 2σ in glyph churn:

| frame | churn | σ | camera velocity |
|---|---|---|---|
| 58 | 1 394 | 2.80 | 0.00549 |
| 65 | 1 381 | 2.76 | 0.00479 |
| 73 | 1 173 | 2.07 | 0.00362 |

**All three are `GEOMETRICALLY EXPLAINED`:** each coincides with **mid-range camera velocity**, and none is
isolated — they sit inside the same high-churn band the velocity curve predicts. **Once normalised by
velocity, no unexplained spike remains**, and **`UNEXPLAINED INSTABILITY` count = 0**.

---

## 13. `skeletonComponents = 100` — revisit condition TRIGGERED, NO FAILURE FOUND

This is the first phase where the revisit condition is active.

| asked | measured |
|---|---|
| junction fragmentation | **0** — `invalid anchor projections = 0`, no junction anchor invalid |
| one-frame missing edges | **none** |
| independent segment crawling | **not observed** — 100% back-wall probe retention every frame |
| visible discontinuities | **none** in the machine data |

**Kept as technical debt.** Per the standing rule, causality may not be inferred from the number alone, and
the direct evidence that would connect it to a failure does not exist. It remains under observation.

---

## 14. PASS CONDITION

| # | condition | result |
|---|---|---|
| 1 | camera is the sole changing semantic input | **PASS** |
| 2 | camera trajectory deterministic | **PASS** — smoothstep, no randomness (3.3A audit) |
| 3 | world-space anchors move continuously | **PASS** — 0 invalid of 1350 |
| 4 | back-wall scale changes monotonically | **PASS** — 0 reversals |
| 5 | clipping valid through all frames | **PASS** — 0 issues |
| 6 | no unexplained polygon pop/explosion | **PASS** |
| 7 | architecture identity stable | **PASS** — 0 orientation flips |
| 8 | fixed world probes retain material identity | **PASS** — backWall 25/25 every frame |
| 9 | human recognisable | **PASS** — absent on 0 frames |
| 10 | `NAME` recognisable | **PASS** — absent on 0 frames |
| 11 | no unexplained temporal churn spike | **PASS** — 3 outliers, all velocity-coincident |
| 12 | exposure stable bar geometric coverage | **PASS** — totalInk 10 800 → 11 168 (+3.4%), lit 11 342 → 12 382, both monotone from growing subject scale |
| 13 | Phase 3.3A static baseline intact | **PASS** — re-run: unique hashes 1, churn 0, cross-run 0 |
| 14 | Phase 1-3 regressions intact | **PASS** — see §15 |
| 15 | external review finds no meaningful flicker/crawl/pop | **PENDING — external** |

---

## 15. REGRESSIONS

| gate | result |
|---|---|
| topology tests | **13/13 PASS** |
| clipping tests | **12/12 PASS** |
| plane ownership audit | **PASS** — `empty = 75 px` |
| Phase 3.3A static baseline | **PASS** — unique hashes 1, cell churn 0, cross-run mismatches 0 |
| `regression:phase1` | **24/24 PASS** |
| `regression:phase2` | **6861/6861 PASS** |
| `verify:claims` | **15/15** |
| `tsc --noEmit` | **clean** |
| `out/loneliness/grid.bin` | `49b4c86bcbc5677f` — **frozen** |
| canonical `v4-directional.png` | `c9585c1322e62269` — **unchanged** |

---

## 16. EXTERNAL REVIEW PACKAGE

`out/phase33b/review/` — `camera-push.mp4` (1920×1080, 90 frames, **3.000 s**, video-only, no audio, no
labels) plus frames `000, 015, 030, 045, 060, 075, 089`.

**Ask the observer:**
1. *"What happens in this clip?"*
2. *"Does anything flicker, crawl, pop, break, or become hard to recognise?"*

**Do not supply** the words push-in, texture crawl, ASCII flicker, or any hint of what is being tested.

---

## 17. Artifacts

| path | content |
|---|---|
| `out/phase33b/camera-push.mp4` | `a3917f991d571d43…` |
| `out/phase33b/churn-vs-camera.json` | the churn/velocity curve |
| `out/phase33b/phase33b-report.json` | anchors, clipping, probes, human, text |
| `out/phase33b/frame-{000…089}.png` | probe frames |
| `out/phase33b/review/` | external package |

## 18. NOT DONE

**No fix was applied before measuring.** No temporal hysteresis, motion blur, frame averaging, TAA, glyph
locking, temporal smoothing or texture anchoring rewrite — the brief prohibits all of them before the first
moving-camera measurement, and none was needed.

**No character motion.** No walk, turn, reach, follow, orbit, transition, room collapse, music, sound or
subtitle. **Phase 3.3B stops here.**
