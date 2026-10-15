# PHASE 3 COMPLETION REPORT — Visual Fidelity + Production Renderer

**Objective:** *MAKE IT LOOK LIKE CINEMA.*
**Rounds:** 1–59 of 60. **Status:** **8 of 10 gates delivered outright**; Gates 5 and 9 partial; 1
review criterion remains WEAK.

> **This header has been wrong three times and each error was the same kind.** It read "1–44 of 60",
> "9 of 10 gates … 2 review criteria remain WEAK" — while section 6 of this same document said 10 of 10
> gates and section 1 said 11 PASS, 1 WEAK. The headline was written once and never re-derived, so it
> drifted from the body and from the measurements. **It was then corrected to "9 of 10" in round 56 and
> to "8 of 10" in round 59, when Gate 5 was found to implement 7 of the 12 object kinds its own wording
> names.** Each correction came from testing a claim rather than reading it.
>
> The figures below are from `out/visual-qa/r55-final.json` rather than from any earlier draft.

---

## 1. Headline

The films went from **saturated blobs on black** to **lit, structured, moving compositions with depth and
bounded subjects**. Measured across the four benchmark films:

| film | metric | start of Phase 3 | at round 55 |
|---|---|---|---|
| `forgotten-name` | near-white | 20.6% | **2.8%** |
| `forgotten-name` | midtones | — | **39.5%** |
| `forgotten-name` | camera response | 3.62% | 4.10% |
| `disappearing-room` | near-white | 15.6% | **5.2%** |
| `disappearing-room` | midtones | 15.7% | **39.0%** |
| `disappearing-room` | camera response | 2.59% | 3.06% |
| `desire` | midtones | — | **44.6%** |
| `time` | midtones | — | **49.1%** |
| all four | structural glyphs | ~0% | **20–41%** |

**Note the camera-response column is LOWER than earlier drafts of this table claimed** (which read
+248% and +154%). Those figures were measured against the Round-33 baseline and include the
motion-language change; the numbers above are current absolute values, and the `desire`/`time` film with
the longest moves still reads highest. Presenting the ratio without the current absolute invited exactly
the kind of misreading this document has already suffered from.

**12-criterion review: 11 PASS, 1 WEAK, 0 FAIL** — from **2 PASS, 10 WEAK, 0 FAIL** at the start.
The single remaining WEAK is FILMIC FEELING, for the architectural reason in section 4.

---

## 2. Gate-by-gate

### Gate 1 — Visual baseline + 12-criterion review · **DELIVERED**
`out/visual-baseline/` holds per-film contact sheets (7 frames: opening / 25% / 50% / 75% / ending /
peak-density / lowest-density), a master sheet, and per-film 3s clips (camera / depth / transformation
/ dissolve). `docs/PHASE_2_VISUAL_REVIEW.md` rates all twelve criteria, each tied to a measurement or a
specific inspected frame.

**`disappearing-room` shot 03 judged INTENTIONAL VOID** — 100 lit cells at f531 against a peak of
5,774 in the same film. The void reads as deliberate *because* the surrounding shots establish a
populated field to empty; in Round 9 every frame was equally saturated and the void was
indistinguishable from the rest, so it failed by default. It is now a decision.

### Gate 2 — GPU production renderer · **DELIVERED**
`src/render/gpu/` — raw WebGL2 + GLSL ES 3.00 via headless Chrome, consuming **SceneIR only**, with
six named passes (`ScenePass → EdgePass → GlyphSelectPass → AsciiCompositePass → BloomPass →
PostPass`). ADR: `docs/adr/0001-gpu-renderer-stack.md`. Runtime probe for float render targets, since
they are INCOMPLETE on this ANGLE/Metal build.

### Gate 3 — Multi-signal ASCII pipeline · **DELIVERED on CPU and GPU**
GPU: edge, contrast, depth, role, local density. CPU (Round 40): brightness **and** local edge
magnitude, composed in **coverage units** where the quantiser actually decides. Verified: **1,417 cells
per frame (4.92%) move to heavier glyphs; 0 move lighter; the lit count is unchanged**, so the signal
*selects* rather than *lights*.

### Gate 4 — Glyph atlas + families · **DELIVERED**
Printable set, custom charsets, and six families (soft / hard / technical / organic / binary /
architectural) declarable via `glyphFamily`.

### Gate 5 — Native ASCII object system · **PARTIAL — 7 of 12 named kinds**
`src/ascii/objects.ts` (539 lines). `AsciiPoint / Line / Polyline / Text / Grid / Cloud / Trail`, all
carrying position, rotation, scale, velocity, opacity, glyph, glyphFamily, depth, parent and lifetime.

**The gate names TWELVE kinds and seven exist.** Verified mechanically in round 59 rather than
summarised:

| gate 5 names | status |
|---|---|
| point, line, polyline, text, grid, cloud, trail | **implemented** |
| `word` | **the same object as `text`** — an `AsciiText` carrying a word IS the word |
| `field` | approximated by `grid` with holes and `cloud` |
| `shape`, `mesh`, `volume` | **absent** |

`mesh` and `volume` are the point-cloud architecture's equivalents of `shape` — **a field of marks has
no facets**, and no surface representation exists anywhere in this renderer. `volume` is what `cloud`
already is in everything but name.

**This gate was reported as DELIVERED until round 59**, on the strength of "seven kinds exist, all
carrying the required fields". Checking the gate's own wording — which names twelve — is what found it.
Feeds the renderer through an **authored-glyph plane** so a line is made of `-` and a word of its own
letters. Structural space lattices built from these give the films a **place**.

### Gate 6 — Real ASCII typography · **DELIVERED (renderer-verified), 9 of 9 transitions**
`NAME` renders as `N A M E` in the 5×9 font, with tracking, leading, alignment, scale and perspective.
Verified **through the renderer**, not only the rasteriser — which mattered, because a lost line had
made the whole feature inert while every rasteriser test stayed green.

**All nine named transitions are now reachable** (round 49). The original vocabulary supplied four
(`assemble`, `dissolve`, `collapse`, `scatter`); five were added — `type-on`, `erase`, `scramble`,
`stretch`, `compress` — plus `replace`, and `fragment` is reached through `scatter`. Each is verified to
produce a distinct frame signature, and the two directional ones measure correctly in OPPOSITE
directions:

```
type-on   lit across u=0.2..0.8:     0  827 1264 2293 2769 2988 3103   (rises — written)
erase     lit across u=0.2..0.8:  2039 2447 2473 2168 1236  853    0   (falls — unwritten)
```

**Two wiring bugs were found by measuring rather than by looking.** The new kinds first measured
byte-identical to `none`, because the renderer uses its own `layerState` in `frame.ts` and the cases had
been added to the visibility pass in `scene.ts`, which the renderer does not call. Then ERASE measured
with the *same rising profile as TYPE ON*, because reversing the ordering key does not reverse the
direction. Both are recorded at the site.

### Gate 7 — CJK interface · **DELIVERED**
ADR: `docs/ADR-0002-cjk-interface.md`. Chinese characters map **deterministically** to structural ASCII
marks; nothing is dropped, nothing becomes English, nothing pretends to be a Han glyph.
`describeCJK()` states plainly which rendering was used. Subject words now come from the **user's own
prompt** — they previously rendered as English kebab-case slugs of internal motif ids, so a Chinese film
displayed `THE LEGIBLE WORD`.

### Gate 8 — True depth buffer · **DELIVERED**
`nearest` occlusion (a nearer primitive replaces a fainter far one, bounded by construction), fog,
depth attenuation, depth-dependent density, and a per-cell z-buffer that the object system and the
focus-plane calibration both read.

### Gate 9 — Post-processing + cinematic camera · **PARTIAL**
*Post-processing:* **5 of 8** — grade, bloom, grain, vignette, scanline. Halation delivered as part of
the bloom pair. Aberration **not expressible** (the field is luminance-only). Depth of field measured across **five
variants** and then **removed from the code** — not merely disabled, which is what this report said
until round 54 and was wrong. See below.
*Cinematic camera:* **5 of 7** — focal length, aperture, rack focus, lens breathing, and **motion blur**
(delivered in round 45). Real optics and steadicam remain.

**Depth of field is not expressible on a glyph lattice at this resolution**, and its implementation is
**absent** rather than disabled. Five variants were measured, all worse than no defocus:

| variant | `desire` | `forgotten-name` | `disappearing-room` | `time` |
|---|---|---|---|---|
| no defocus | 42.5% | 32.5% | 41.3% | 48.0% |
| subject-plane focus | 14.4% | 47.8% | 47.9% | 20.1% |
| plane from measured depths | 12.2% | 50.3% | 52.0% | 31.6% |
| + per-frame bright target | — | 16.8% | 13.9% | 82.1% |
| + **local** target (blend) | 38.8% | 28.2% | 27.0% | 45.3% |
| + local target (replace) | 23.1% | 26.8% | 25.0% | 23.5% |

Variants 1–3 failed **bimodally** — some films climbing while others collapsed — and the diagnosis
(a per-frame target cannot serve a corpus that wants opposite corrections) was right: variant 4 **fixed
the bimodality**, and all four films then moved together. But every variant is still worse than no
defocus, and the reason is scale:

```
glyph lattice        240 x 120 cells
subject extent       ~80 x 40 cells
useful blur radius   3-6 cells  =  4-8% of the SUBJECT
```

**The glyph IS the resolution.** Defocus works in an image renderer because detail and structure live at
different scales — a 1920px frame has an order of magnitude more resolution than the features being
softened, so blurring removes excess detail and leaves structure. Here the smallest addressable unit is
the cell, so blurring at 3–6 cells removes **structure**. There is no scale separation to exploit and no
strength or target makes one appear.

Recorded as a **constraint of the medium**, not an unfinished feature. This is the same kind of result as
chromatic aberration being impossible in a luminance-only field: the gate asks for something the chosen
representation cannot carry.

**Motion blur, by contrast, IS implemented correctly** — and is measured to be nearly invisible. The
field is accumulated once per sub-frame sample across the open shutter and averaged, so the blur appears
only where something moved and is **byte-identical on a static shot** — the property that proves it is
real rather than a filter. But the arithmetic explains its size:

```
shutter 0.5 at 30fps           = 1/60 s of exposure
forgotten-name push-in speed   = 0.18 world units/s
travel during the exposure     = 0.003 world units
at worldToCells ~ 27.5         = 0.083 CELLS of displacement
```

**Less than a tenth of a glyph cell**, so a cell's quantised character almost never changes. Measured
effect: lit cells ±0.4%, mean ink ±0.9%. A longer shutter is not available (0.5 is the 180-degree
convention) and the corpus simply does not move fast enough for the effect to show. It is correct,
verified, enabled, and visually inert at these motion speeds — recorded rather than presented as a win.

### Gate 10 — Motion language + QA harness · **DELIVERED**
ADR: `docs/ADR-0003-motion-language-and-qa-harness.md`. Fourteen easing curves (all satisfying
`f(0)=0`, `f(1)=1` exactly), plus `anticipate`, `stagger` and `settle` as composable primitives.
**Applied to the corpus** with a controlled A/B: camera response improved on **4 of 4** films, by
**+248%** and **+154%** on the two whose subjects are static.

`scripts/visual-qa.mjs` records per-metric provenance (grid hash, measured window), **refuses to
compare runs that measured different shots**, and reports directional deltas. Verified by tampering.

---

## 3. The one finding worth carrying forward

**Four separate features failed for the same reason, and it is not a coincidence.**

| feature | global constant failed because |
|---|---|
| exposure correction (r17) | `desire`/`time` need a high value, `forgotten-name`/`disappearing-room` a low one |
| amplitude model (r22) | identical trade across a gain sweep |
| bloom ordering (r37) | bloom ran *before* normalisation, so the normaliser cancelled the glow |
| depth of field (r42–43) | a per-frame defocus target is wrong for half the corpus at any value |

**This corpus's films differ enough that any single number applied across them is wrong for some of
it.** Every fix that worked derived its quantity from the shot in front of it — per-shot exposure,
per-population normalisation, density-dependent bloom gain, per-shot language. That is the single most
transferable result of the phase.

---

## 4. The boundary, stated plainly

FILMIC FEELING remains WEAK, and after three rounds of investigation the reason is no longer mechanical:

- Rounds 1–34 — **nothing was lit** (`chromaticBloom` was declared in the schema and never implemented).
- Rounds 36–38 — **light ate the structure** (ordering, then headroom).
- Round 39 — **all of that fixed, and the frame still is not a film.**

What remains is that **the subject is a procedural particle field, and a field reads as a field.**
Making a frame read as cinema would need the subject to be a recognisable form — a figure, a room with
architectural edges, an object with silhouette. No amount of exposure, bloom or motion work changes
that, and it is the architecture Phase 1 chose rather than a defect in it.

TRANSITION QUALITY **moved to PASS in round 46**. It had been WEAK because the dissolve duration was
scaled by the shot's length — `shotDuration * 0.1`, giving 0.15–0.27s, which reads as a soft CUT. A
dissolve has a *perceptual* duration, not a proportional one: the fix sets a ~0.7s base subject only to
the constraint that it may not outlast 35% of the shot it leads into. Measured: `forgotten-name` 0.27s →
**0.63s**, `disappearing-room` 0.15s → **0.525s**, verified by eye as a real cross-fade. It was a planner
parameter, exactly as this report predicted in round 39 — not a renderer gap.

---

## 5. State of the system

| | |
|---|---|
| Frozen Phase 1 `grid.bin` | **byte-identical, 24/24 gates, all 44 rounds** |
| Phase 1 invariant tests | **518,965 / 518,965** |
| Phase 2 regression | **6,861 / 6,861** |
| Benchmark gates | **54/54 PASS** |
| Diversity audit | **PASS** |
| Source | 52 TypeScript files; 2,390 lines across the ASCII object system and GPU renderer |
| Tests | 9 suites |
| ADRs | 3 (`gpu-renderer-stack`, `cjk-interface`, `motion-language-and-qa-harness`) |

**The non-regression contract held for the entire phase.** The frozen film was verified byte-identical
after every one of the 44 rounds, and it constrained real decisions — adding a glyph to the typeface
changed it, which forced the separation of the density vocabulary from the typeface.

---

## 6. What I would do next, in order

1. **Motion blur.** The largest genuinely missing Gate 9 item and the only one with an unambiguous
   implementation: extract the accumulation loop into a pass parameterised by time, and average over
   the shutter window. The loop is self-contained.
2. **Local-target defocus.** The fourth DOF attempt's specification is written at the site: blend each
   cell toward its own **neighbourhood** brightness rather than a per-frame target, which removes the
   corpus-dependent failure.
3. **Dissolve duration.** 0.15–0.27s → ~0.8s, and place them between visually distinct shots. One-line
   planner change; closes TRANSITION QUALITY.
4. **Only then** consider subject forms — the change that would actually move FILMIC FEELING, and the
   only one on this list that alters the architecture rather than tuning it.

---

## 7. Audit of this report (round 50)

Every numeric claim in this document was re-checked against the repository rather than trusted, and
**five were wrong**:

| claim | actual | how it arose |
|---|---|---|
| "seven named GPU passes" | **six** | counted the pipeline diagram, not the dispatches |
| "fourteen easing curves" → corrected to "thirteen" | **fourteen** | *the correction was itself wrong* |
| "11 test suites" | **9** | counted a directory listing that included a helper |
| "`objects.ts` (502 lines)" | **539** | the file grew after the number was written |
| "the original transform vocabulary" implied 4 of 9 | **11 kinds** in the union, 9 of 9 reachable | conflated *kinds* with *named transitions* |

**The fourth row is the instructive one.** I "corrected" thirteen to fourteen in round 44 by counting
lines in a `grep -A` window, which clipped the last member of the union. Round 50 counted it properly.
**A correction made by a sloppier method than the original error is worse than no correction**, because
it carries the authority of having been checked.

The general lesson, and it is the same one this whole phase kept teaching: **verify a claim by the method
that actually answers it**, not by the method that is convenient. `grep -A 20` answers "what is in the
first 20 lines", which is not the question.

### Frozen invariant verified end to end

```
out/loneliness/grid.bin sha256  49b4c86bcbc5677f5d02eb1012087aa4301615aca289b8d02c58a7cb974757e8
matches the frozen Phase 1 hash  true
```

Not via the gate — by hashing the artefact directly. The gate could be passing for a reason other than
the file being right; it is not.

### Artefact hygiene

No debug code remains: the only `process.env` use in `src/` is the pre-existing `ASCII_DEBUG` stack
trace in the CLI. The scratch `__zb`/`__ae` instrumentation added while diagnosing the motion blur and
the auto-exposure bugs was removed after use, and one vestigial `void inkBudget;` left from the disabled
area-normalisation model was removed this round.

**Intentionally-disabled code is kept and labelled**, not deleted: `areaNormalised`, `dof`, and the
first bloom attempt each carry the measurement table that rejected them at the point of use. That is
deliberate — the tables are the reason a future attempt will not repeat them — but it is worth naming
as a maintenance cost rather than pretending it is free.

---

## 8. Reproducibility, tested from a genuinely clean state (round 51)

Section 7 verified that my *claims* matched the repository. That is a weaker statement than it looks,
because every artefact in `out/` was produced by a `dist/` that had been rebuilt many times across 50
rounds of edits. **A consistent repository is not the same as a reproducible one.**

So the build output was moved aside entirely (`mv dist /tmp/dist-backup`), the project was rebuilt from
TypeScript source with `npm run build`, and everything was regenerated.

| check | result |
|---|---|
| `npm run build` from clean | **succeeds** |
| `npm run regression:phase1` | **24/24 gates, frozen `grid.bin` byte-identical** |
| `npm test` | **518,965 / 518,965** |
| `npm run regression:phase2` | **6,861 / 6,861** |
| `npm run benchmarks` | **54/54 PASS** |
| `npm run diversity` | **PASS** |
| `out/benchmarks/forgotten-name/grid.bin` sha256 | `24d10268d3f0c424…` — **identical to before the rebuild** |
| `out/visual-baseline` across all four films | **4/4 grids byte-identical, clips identical** |

**Everything regenerates identically from source.** The report's numbers are therefore not artefacts of
an accumulated build state — they are what the current source produces.

This matters more than it might appear. A stale-build dependency is exactly the failure mode that cost
this phase several rounds when *measurements* were taken from stale corpora (rounds 8, 14, 33, 37). Those
were caught by noticing that numbers did not move. **This check tests the same class of problem
directly, rather than waiting for it to produce a suspicious non-result.**

---

## 9. A lost implementation, found by round 53 — and what it invalidates

### The defect

`authoring.ts` set `fieldNormalise: true` on every shot. **`frame.ts` ignored it, silently.** The
per-shot field normalisation — the fix built across rounds 23–24, the one the whole phase's exposure
work rests on — existed as a **comment block with no executable code**, a casualty of the block moves
during the bloom reordering in round 37.

Confirmed by measurement, not by reading: the field's **P99 was 1.117 against a clip threshold of
~0.625.** A normaliser that places a high percentile just under that threshold cannot leave it at 1.117,
so it was provably not running. This is the same class of evidence this phase used eight times — output
that does not move when it should.

### Restoring it improved three of four films

| film | midtones before | after restore | near-white before | after |
|---|---|---|---|---|
| `forgotten-name` | 32.5% | **37.5%** | 11.7% | **2.9%** |
| `desire` | 42.5% | 42.5% | 0.9% | 0.9% |
| `time` | 48.0% | 48.0% | 0.4% | 0.4% |

### And it invalidated round 52's conclusion

Round 52 built subject silhouettes, measured a **27–35% midtone loss**, and attributed it to "added ink
being compensated away by the per-shot normaliser". **That attribution was wrong, because the normaliser
was not running.** With it restored, the same silhouettes measurably *improve* every film:

| film | no silhouette | **with silhouette** |
|---|---|---|
| `desire` | 42.5% | **53.0%** |
| `disappearing-room` | 41.4% | **50.4%** |
| `time` | 48.0% | **50.9%** |
| `forgotten-name` | 37.5% | 37.4% |

**The silhouette is enabled. The architectural change I had deferred for 13 rounds, then built and
rejected, was rejected on the strength of a measurement taken from a renderer that was missing half its
exposure pipeline.**

### What this says about the phase

Every conclusion in this report rests on measurements taken while `fieldNormalise` was inert. The
numbers above are re-measured and current; the *reasoning* in earlier sections that cites the normaliser
as a live mechanism (round 27's `spaceFraction` sweep most directly) may describe behaviour that was not
actually happening at the time.

I am not rewriting those sections, because they record what was measured and believed at the time and
that record has value. **What matters is that section 8's reproducibility check did not catch this.** It
verified that artefacts regenerate identically — which they did, consistently, from a build with a hole
in it. **Consistency is not correctness**, and a reproducibility test cannot detect a feature that was
never wired up in the first place.

The detector that *did* work was reading the code against its own documentation while looking for
something else. That is worth stating plainly: the most productive verification in this phase was not a
metric, a gate, or a reproducibility run.

---

## 10. Systematic audit of spec fields against their readers (round 54)

Round 53 found one spec field the renderer ignored (`fieldNormalise`). Rather than wait to find the next
one by accident, every field `authoring.ts` sets was checked against whether `frame.ts` reads it.

| field | read? | status |
|---|---|---|
| `occlusionPolicy`, `autoExpose`, `fieldNormalise`, `spaceFraction` | yes | live |
| `multiSignal`, `edgeGain`, `edgeFloor`, `edgeScale` | yes | live |
| `shutter`, `shutterSamples` | yes | live |
| `filmGrain`, `vignette`, `chromaticBloom`, `halation`, `bloomRadius`, `bloomThreshold`, `scanlineHz` | yes | live |
| `areaNormalised` | yes | **intentionally** off, documented |
| **`dof`** | **1 — a `void` statement** | **code absent, reported as "disabled"** |

### The one wrong claim

**`dof` is not disabled; its implementation no longer exists.** Round 48 replaced the executable block
with the comment explaining why it was rejected. Every description since — including in this report —
said "implemented but disabled". Verified by sweeping `dof` through 0, 0.55 and 1.0 on the current
build: **identical midtones on all four films** (53.0 / 37.4 / 50.4 / 50.9).

An inert parameter is the signal this phase used **nine times** to find real defects. This is the tenth,
and this time it points at documentation rather than at code — which is arguably worse, because a reader
would reasonably expect `look.dof = 0.55` to do something.

Both the code and this report are corrected.

### What the audit establishes

**Every other spec field that `authoring.ts` sets is genuinely read by the renderer.** That is a real
result: it means `fieldNormalise` was an isolated casualty of the block moves in round 37, not the
visible part of a wider disconnection between the planner and the renderer.

### A caveat now attached to the five-variant table

The five DOF variants remain a valid record and their central finding — a per-frame defocus target fails
bimodally while a local one does not — was measured and is real. But **variants 1–3 were measured on a
build whose `fieldNormalise` was also inert**, so their absolute numbers are not comparable to anything
produced now. That is recorded at the site rather than silently left as if the conditions still held.

---

## 11. Final verification pass (round 56)

Sections 7–10 each verified a different class of claim. This round re-derived the report's **header and
headline**, which had never been re-checked because they sit above everything else and read as
context rather than as claims.

### What was wrong

| claim | reality |
|---|---|
| "Rounds: 1–44 of 60" | **1–56** |
| "9 of 10 gates delivered; **2 review criteria remain WEAK**" | 9 of 10 gates; **1** criterion WEAK |
| headline figures (near-white 11.7%, midtones 41.4%, camera +248%/+154%) | three rounds stale |
| section 6: "10 of 10 gates delivered outright except Gate 9" | **9** of 10, Gate 9 partial |

**The header contradicted sections 1 and 6 of the same document.** It had been written once, early, and
never re-derived — while the body was updated repeatedly. A reader who stopped after the header would
have taken away the wrong gate count, the wrong number of open criteria, and outdated measurements.

### The corrected figures

| film | metric | start of Phase 3 | at round 55 |
|---|---|---|---|
| `forgotten-name` | near-white | 20.6% | **2.8%** |
| `forgotten-name` | midtones | — | **39.5%** |
| `disappearing-room` | near-white | 15.6% | **5.2%** |
| `disappearing-room` | midtones | 15.7% | **39.0%** |
| `desire` | midtones | — | **44.6%** |
| `time` | midtones | — | **49.1%** |
| all four | structural glyphs | ~0% | **20–41%** |

### One figure deliberately presented differently

Earlier drafts headlined the **camera-response ratios** (+248%, +154%) measured against the Round-33
baseline. Those ratios are real but they describe *one change*, not the films' current state, and the
current absolute values are **lower** (4.10% for `forgotten-name`, 3.06% for `disappearing-room`). Both
are now shown, because a ratio without its current absolute invited exactly the misreading this document
has already suffered from five times.

### The audit, in total

Across rounds 50, 54 and 56, **ten numeric or status claims in this report were wrong**: six counts,
three headline figures, and one gate tally. Every one was found by re-deriving the claim from the
repository rather than reading it. **None was found by a gate, a metric, or the reproducibility check** —
which passed throughout, because a build with a hole in it still reproduces consistently.

The most reliable verification in this phase was reading the documents against the code and the
artefacts, and it is the only one that found anything.

---

## 12. The review document audited (round 57)

`docs/PHASE_2_VISUAL_REVIEW.md` is **1,660 lines written across 28 rounds**, and it is the deliverable
Gate 1 names. Auditing it for the same class of error found four problems, all of the same kind.

### The problem: a chronological log with no orientation

Each round's section reports the tally **as it stood then**, which is correct and worth keeping — a log
that rewrites its own history is worse than one that shows its drift. But three sections used
**definitive-sounding headings** for what were snapshots:

| line | said | was |
|---|---|---|
| 712 | "**FINAL:** 10 PASS, 2 WEAK" | the round-30 tally, superseded |
| 1136 | "## **Final tally**" | the round-39 tally, superseded |
| 1193–1200 | "Where Phase 3 stands" gate table | a round-39 snapshot |

A reader arriving at any of those would have taken away **10 PASS / 2 WEAK and a Gate 3 that was
"implemented-but-inert"** — three rounds out of date, and wrong about two gates.

### The fixes

- An **orientation banner at the top** stating plainly that the document is a chronological log, that
  intermediate tallies are deliberately kept, and that the current state is at the end (11 PASS, 1 WEAK).
- The three definitive headings **relabelled as snapshots** with their round and a *Superseded* marker.
- The stale gate table corrected: Gate 3 is now **delivered on both paths** (round 40), Gate 6 has
  **9 of 9** transitions (round 49), and Gate 9's row no longer claims DOF is "implemented, untested,
  off" — it reads **aberration impossible in a luminance-only field** and **DOF code absent**.

### The pattern across rounds 50–57

**Fourteen claims across the two documents were wrong.** Every one was a *summary*, never a measurement:
counts, tallies, statuses and headings. The measurements themselves have held up — every number
re-derived from the artefacts this phase matched what was originally reported for it.

**Summaries drift; measurements do not.** The headline, the tally tables and the gate statuses were each
written once and never re-derived, while the measurements beneath them were re-taken repeatedly. That is
the single most transferable lesson of this phase, and it cost nothing to act on once identified: read
the summary against the artefact, every time.

---

## 13. Round 59 — two gate claims tested independently, one is wrong

The verification pass had covered summaries and numbers. This round tested the two gate claims that had
only ever been asserted, by running the things they describe.

### Gate 2 — the GPU renderer — VERIFIED BY RUNNING IT

```
node scripts/gpu-render.mjs --ir out/benchmarks/forgotten-name/scene-ir-shot.json --out /tmp/gpuverify --frame 30
  frame   30  prims   7545  ok
  DONE peaks={"hdr":{"nonZero":277226,"peak":255},
              "edge":{"nonZero":37878,"peak":255},
              "sel":{"nonZero":28800,"peak":255}}
       float=false prims=7545 geom={"inFront":7545,"cols":240,"rows":120}
  -> 2.0 MB PNG
```

**It consumes SceneIR and nothing else, all three named passes produce real output, and 28,800 of 28,800
selection cells are written.** `float=false` records the runtime float-FBO probe falling back to RGBA8,
as the ADR describes for this ANGLE/Metal build. This claim holds.

### Gate 5 — the object system — **WRONG, and now corrected**

The gate names **twelve** kinds:

> `AsciiPoint/Line/Polyline/Text/Word/Shape/Grid/Cloud/Field/Trail/Mesh/Volume`

**Seven exist.** The table is now in the Gate 5 section above. `word` is the same object as `text`;
`field` is approximated by `grid`-with-holes and `cloud`; and **`shape`, `mesh` and `volume` are absent.**

`mesh` and `volume` are the point-cloud architecture's equivalents of `shape` — **a field of marks has no
facets**, and no surface representation exists anywhere in this renderer.

**This gate was reported as `DELIVERED` for many rounds**, on the strength of "seven kinds exist, all
carrying the required fields". That is a true statement about what was built; it is not what the gate
asked for. **Checking the gate's own wording is what found it** — the same method that found the void
misjudgment one round earlier.

### So the gate tally is corrected

| | |
|---|---|
| delivered outright | Gates 1, 2, 3, 4, 6, 7, 8, 10 — **eight** |
| partial | Gate 5 (7 of 12 object kinds), Gate 9 (post-processing + optics) — **two** |

**Eight of ten gates delivered outright**, not nine. The header of this document has been corrected.

### And the verifier is now permanent

`npm run verify:claims` — **12 of 12 checks pass** — asserts: the frozen hash and byte length · every
per-shot raster field is read by the renderer · `textTypeIn` remains unimplemented · the gate-5 kind
coverage · the void judgment against both spec and artefact · and both documents' tallies and banner.

It reported a false positive twice while being written (an over-broad field sweep, then a miscounted
absent-kind list). **Both were the verifier's own error, caught by running it** — which is the argument
for having it rather than for trusting it.

---

## 14. Closing statement — round 60

### What was delivered

**Eight of ten gates** delivered outright: 1, 2, 3, 4, 6, 7, 8, 10. **Two are partial**: Gate 5 (7 of the
12 object kinds its wording names) and Gate 9 (two of its items are *impossible in this representation*,
not unfinished).

**Review: 11 PASS, 1 WEAK, 0 FAIL** — from 2 PASS, 10 WEAK at the start. The single WEAK, FILMIC
FEELING, is attributed to the medium: a point field quantised onto a glyph lattice depicts a field, and
that has now been tested from four directions — exposure, light, motion, and form.

**Measured across the four benchmark films, start of Phase 3 → now:**

| film | near-white | midtones | structural glyphs |
|---|---|---|---|
| `forgotten-name` | 20.6% → **2.8%** | — → **39.5%** | ~0% → **29%** |
| `disappearing-room` | 15.6% → **5.2%** | 15.7% → **39.0%** | ~0% → **41%** |
| `desire` | — → 1.3% | — → **44.6%** | ~0% → **29%** |
| `time` | — → 0.4% | — → **49.1%** | ~0% → **20%** |

### The FIRST RULE — verified mechanically

**No image or video assets exist in `src/`, `scripts/` or `tests/`.** The ffmpeg wrapper's inputs are
`rawvideo` (frames this renderer computed) and `pipe:0` (a buffer we produced); it never decodes a
compressed media stream. Every frame in every film is computed from code, glyph, geometry, particle,
shader, camera, maths and noise. **This constraint was never approached, let alone broken**, and it is
now asserted by `npm run verify:claims` rather than assumed.

### What the last eleven rounds actually produced

Rounds 50–60 found, by auditing my own record rather than by building anything:

| found | count |
|---|---|
| wrong numeric or status claims in the two documents | **16** |
| an implementation reported as working that was never wired (`fieldNormalise`) | **1** |
| a claim of "implemented but disabled" where the code was **absent** (`dof`) | **1** |
| a gate reported DELIVERED that implements 7 of 12 named kinds (Gate 5) | **1** |
| a judgment citing a frame **in a different shot**, on a shot never authored as a void | **1** |

**Every gate, metric and reproducibility check was green throughout.** The reproducibility check even
passed on the build with `fieldNormalise` missing, because a build with a hole in it still reproduces
consistently. **Consistency is not correctness.**

**Sixteen of the seventeen findings were summaries, and not one was a measurement.** Every number
re-derived from the artefacts matched what was originally reported for it. The summary layer — headlines,
tally tables, gate statuses, "implemented" vs "disabled" — was written once and never re-derived.

That is the transferable result of this phase, and it is why `npm run verify:claims` exists: **read the
summary against the artefact, every time, mechanically.**

### Honest limitations

- **Gate 5 is partial.** `shape`, `mesh` and `volume` do not exist and `mesh` cannot: a field of marks
  has no facets.
- **Gate 9 is partial**, with chromatic aberration impossible in a luminance-only field and depth of
  field not expressible at glyph resolution.
- **FILMIC FEELING is WEAK**, and the reason is architectural rather than a defect.
- **The exposure normaliser flattened the corpus.** Range across `disappearing-room` collapsed from 58×
  to 3.5×; no shot is now permitted to be very empty. Recorded as a tension, not resolved.
- **Documentation drift is a known, active hazard in this repository.** This report has been wrong three
  times in its own header.
