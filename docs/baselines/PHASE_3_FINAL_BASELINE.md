# PHASE 3 FINAL BASELINE — FROZEN

**Frozen at:** the close of PHASE 3.2B, on an **external blind gate returning PASS** for all five
architecture variants.
**Purpose:** the immutable visual-language reference before motion work begins. **Phase history is not
rewritten here** — Phase 3.1 remains **historically PARTIAL / failed external recognition**; Phase 3.2
supersedes it with the corrected readability architecture.

---

## 1. The external gate that closed the phase

The observer saw five shuffled 1920×1080 stills and was asked only **"What do you see?"** — no mention of
rooms, variants, or expectations.

| blind | source variant | external reading | result |
|---|---|---|---|
| `still-01` | **v4-directional** | a standing person in a room; **left wall, right wall, ceiling, floor and back wall all visible** | **STRONG PASS** |
| `still-03` | v5-hybrid | a standing person in a room; strong sense of space, grid/textured interior | **STRONG PASS** |
| `still-05` | v3-depth-density | a standing person in a room/perspective space; back wall and floor have definite structure | **STRONG PASS** |
| `still-04` | v2-edge-sparse | a standing person in a room with a digital-grid feel | PASS |
| `still-02` | v1-edge-only | a standing person in a very simplified perspective room | PASS |

**Every reading named a PERSON and an INTERIOR.** The prior failure mode — screen, grid, stage, panel,
terminal, floating box — became **secondary or absent in all five.**

---

## 2. CANONICAL representations

### CANONICAL_ARCHITECTURAL_STRATEGY = `v4-directional`

| plane | stroke direction |
|---|---|
| floor | vertical (recession) |
| leftWall | diagFall |
| rightWall | diagRise |
| backWall | horizontal |
| ceiling | sparse |

Chosen on the brief's priority order, and **convergently**: rank 1 externally, **and** the simplest
mechanically of the textured strategies — one mechanism (orientation by plane), one `dir` lookup per plane,
no per-cell distance computation. Its direction is **derived from plane geometry**, so it updates
continuously under a moving camera and has **no sampling threshold to crawl across** (unlike v3's
depth-dependent `step`).

**v1-edge-only ranked LAST.** The pre-gate hypothesis that topology alone might suffice was **refuted**:
recognition came from **topology + plane distinction**.

### Canonical human representation
**SILHOUETTE + NEGATIVE SPACE** — masses drawn as discs and capsules at 1920×1080, then sampled
contour-aware. External gate 3.2A: **CLEAR**.

### Canonical diegetic-text representation
**LETTER / GLYPH TOPOLOGY** — `letterformObjects`, run-length strips emitting closed polylines, so
letterforms are geometry rather than a magnified bitmap. External gate 3.2A: **readable**.

### The recognition grammar — frozen

| category | strategy |
|---|---|
| HUMAN | **SILHOUETTE + NEGATIVE SPACE** |
| TEXT | **LETTER / GLYPH TOPOLOGY** |
| ARCHITECTURE | **PERSPECTIVE TOPOLOGY + JUNCTION CONTINUITY + PLANE CONTRAST + FORM-SPECIFIC ASCII MATERIAL** |

**The three categories must not share one representation strategy.** Phase 3.2A's failure was sampling all
three with a subject-oriented sampler; the room became a character field.

---

## 3. Frozen subsystems

| subsystem | location | state |
|---|---|---|
| **SemanticForm architecture** | `src/semantic/{mask,architecture,room-geometry}.ts` | frozen |
| **Room topology** | `makeRoomBox` / `roomPlanes` — 8 shared world vertices, faces by **reference** | frozen · **13/13 tests PASS** |
| **Camera-space near clipping** | `clipNear` (Sutherland–Hodgman, intersections in camera space) | frozen |
| **Viewport clipping** | `clipViewport` (four half-plane clips, **not** per-vertex clamping) | frozen |
| **Projection** | `camBasis` / `toCamSpace` / `camToScreen` — invalid returns **`valid: false`**, never a fabricated coordinate | frozen |
| **Semantic plane ownership** | **REPLACE** operator, even-odd fill at pixel centres | frozen · audit **PASS** |
| **Plane priority hierarchy** | `junction 100 > contour 60 > planeEdge 50 > planeTexture 20 > atmosphere 5` | frozen |
| **Canonical framing** | `halfW 1.5`, `halfH 0.9`, `halfD 0.69`, `cameraZ 0.9315`, `focal 0.9` | frozen |
| **`ExposureIntent`** | typed; **DIRECTOR INTENT > EXPOSURE NORMALISER**; 3 tests PASS | frozen |
| **SceneIR semantic routing** | `LayerIR.semantics.forms` carries kind, role, recognition, anchors | frozen |
| **Collision audit** | `auditFormComposition` over **projected** boxes; threshold 0.35 | frozen |
| **Phase 1 artefacts** | `out/loneliness/grid.bin` | **frozen, byte-identical** |

### Canonical framing — measured

| quantity | value | contract |
|---|---|---|
| back-wall height | **50.0%** of frame | 45–55% |
| back-wall width | **46.8%** | 40–65% |
| left/right/top/bottom reach viewport | **true / true / true / true** | required |
| person in frame | **yes**, 62.3% of frame height | required |

---

## 4. Hashes of canonical visual artefacts

| artefact | sha256 |
|---|---|
| `out/phase32b/variants/v4-directional.png` — **canonical architecture** | `c9585c1322e622692890ab712275e31d08b40be4fec84ddb952418097c380047` |
| `out/phase32b/blind-final/still-01.png` — same bytes, blind identity | `c9585c1322e622692890ab712275e31d08b40be4fec84ddb952418097c380047` |
| `out/phase32b/variants/v4-directional-semantic.png` | `c08fe8946378946237b2fbb5333e981f330b3651cf7b7d3d62c0ed7c593d9a2d` |
| `out/phase32b/room-geometry-semantic-v3.png` — canonical room oracle | `525b652823fbbb2925ec1f676902f5288091c36ee0fbe7c2d8cb5f015d8f0be6` |
| `out/phase32/test-a-semantic.png` — canonical human mask | `f7803ba8f5650eb74b6e53af4431ee916d10de055084084fcfed519df7b0810b` |
| `out/phase32/test-a-ascii.png` — canonical human ASCII | `e721d25a682e317afac625078603c20a9a07977a949617bc42e179e8baffa9a1` |
| **`out/loneliness/grid.bin` — PHASE 1 FROZEN** | `49b4c86bcbc5677f5d02eb1012087aa4301615aca289b8d02c58a7cb974757e8` |
| `out/benchmarks/forgotten-name/grid.bin` | `fec81ef59183cbf47f8a99328929ea6b9445ed3e377e48e55bea6e08bc97da61` |
| `out/benchmarks/disappearing-room/grid.bin` | `74a943ae2de8c881aedb356e21d308c4e21de91a2e06b7eb322a29fee4f38885` |

---

## 5. Gates at freeze

| gate | result |
|---|---|
| topology tests (shared vertices, identity + value) | **13/13 PASS** |
| clipping tests (brief cases A–G) | **12/12 PASS** |
| plane ownership audit | **PASS** — `empty = 75 px (0.004%)`, A = B = C per plane, **zero** plane-to-plane overwrite |
| `regression:phase1` | **24/24 PASS** |
| `regression:phase2` | **6861/6861 PASS** |
| `verify:claims` | **15/15** |
| `tsc --noEmit` | **clean** |

---

## 6. The semantic contrast contract

> ### CANONICAL READABILITY BENCHMARK — *not* a global cinematic lighting rule

| plane | value |
|---|---|
| floor | **0.95** |
| backWall | **0.50** |
| ceiling | **0.34** |
| sideWalls | **0.16** |

**Future shots may use different lighting and exposure values** — a night interior or a silhouette will want
entirely different numbers, and `ExposureIntent` exists so the Director can declare them.

**What must survive is semantic plane distinction**: the requirement that floor, walls and ceiling remain
**separable from each other and from the background** at whatever exposure the shot uses. The audit
established that a 13-level separation is insufficient and a 6x ratio works. **The ratio is the contract,
not the numbers.**

---

## 7. Non-blocking diagnostic debt

**`skeletonComponents = 100`** on every variant, against the brief's expectation of one connected
structure.

**Recorded as debt, not fixed**, because external recognition passed for all five variants, the shared
vertices are exact (13/13 topology), and the metric counts connectivity of **rasterised cells at junction
priority** — planes drawn independently leave junction gaps at shared boundaries without contradicting the
geometry.

**Condition for revisiting: a visible failure**, not the number. Specifically, if it produces temporal
instability, camera-motion breakage, junction flicker or form fragmentation.

---

## 8. What Phase 3 now claims, and what it does not

### PHASE 3 — VISUAL FOUNDATION = COMPLETE

The engine can represent, in **code-only ASCII**:

- a **readable person**
- a **readable interior**
- **readable diegetic text**
- **semantic emptiness** (a shot measured at 5 lit cells)
- **depth relationships**
- **occlusion** (a name occluded by a figure standing in front of it)
- **perspective**
- **form-specific ASCII grammar**

### It does NOT mean the films are cinematic yet

**It means the visual language is sufficiently readable to begin directing motion.** A still image can pass
while a moving image fails, so **static recognition is not evidence of motion quality** — which is the
first constraint Phase 3.3 inherits.

### Phase 3.1 remains historically PARTIAL

Failed external recognition (`"难以理解"`). Not rewritten. Phase 3.2 supersedes it.
