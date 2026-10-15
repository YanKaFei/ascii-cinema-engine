# Phase 2 Visual Review

> ### ⚠ READ THIS FIRST — the document is a CHRONOLOGICAL LOG
>
> It was written across **28 rounds** and each round's section reports the tally as it stood **at that
> time**. Those intermediate tallies are deliberately kept — they record what was measured and believed
> then, and a log that rewrites its own history is worse than one that shows its drift.
>
> **The current state is at the END.** Latest tally: **11 PASS, 1 WEAK, 0 FAIL** (round 55).
> The only remaining WEAK is FILMIC FEELING.
>
> Any earlier "Final tally", "FINAL", or "Where Phase 3 stands" heading below is a **snapshot from an
> earlier round**, not the current state. Section headings that say *final* were true when written and
> were overtaken by later work — twice by defects found in rounds 53 and 54 that invalidated the
> conclusions directly above them.

**What this document is.** Phase 2 was accepted on structural gates: valid specs, deterministic
renders, clean decodes, measurable structural diversity. None of those gates can tell you
whether the result *looks like anything*. This is the review that asks that question, written
**after inspecting the actual images and video** — not the JSON.

**What was inspected.** Every artifact in `out/visual-baseline/`:

- four per-film contact sheets (`<film>-contact-sheet.png`, 7 frames each at 1/5 scale)
- `master-contact-sheet.png`
- four full-resolution stills per film
- fifteen 3-second clips (camera / transformation / depth / dissolve per film; `time` has no
  transformation shot so it has no transformation clip), decoded back to PNG sequences and
  measured frame to frame
- a 3× magnified centre crop of `time` at 25% (`_inspect-time-centre.png`), to read the actual
  characters rather than the silhouette
- a 4-frame strip from `time-camera.mp4` (`_inspect-time-camera-strip.png`)

Everything below is either something visible in those files or a measurement taken from them.
Where I state a number, the command or file that produced it is named.

---

## 1. Verdict

**Phase 2 looks like a screensaver, not like cinema.** That is the honest reading, and it
matches the risk I flagged when Phase 2 was accepted.

Specifically: the films are **centred white glyph masses on undifferentiated black**, built
almost entirely from two or three thin characters, with no foreground, no background, no scale
reference, no place, and no visible camera movement. The dominant visual experience is a slow
change in the *amount* of white in the middle of the frame.

This is not a small tuning problem. Three of the failures below (ASCII QUALITY, CONTRAST,
SUBJECT LEGIBILITY) share **one root cause**, identified in §3.

---

## 2. Ratings

| # | Criterion | Rating | Why |
|---|---|---|---|
| 1 | COMPOSITION | **WEAK** | Subject centroid stays within ±3% of frame centre in every sampled frame of all four films; 20–41% of frame width, 51–73% of height. No off-centre placement, no split composition, no foreground layer. |
| 2 | DEPTH | **FAIL** | No visible depth at all. All four `*-depth` clips measure **0.076–0.856** mean absolute frame-to-frame difference (8-bit) — effectively still images. Foreground, midground and background are indistinguishable. |
| 3 | SUBJECT LEGIBILITY | **FAIL** | The four films' subjects are the **same vertical cone-shaped mass**. A viewer shown the four contact sheets without titles could not tell them apart, and could not say what any of them depicts. |
| 4 | ASCII QUALITY | **FAIL** | Only **10–18 of 89** glyphs in the density window are ever used (`time` uses 10). Magnified inspection shows the subject is made of `-` and `_` stretched to full cell width — the subpixel rectangle fill (5 subpixels across an 8px cell, 1.6× width) turns every thin glyph into a solid horizontal bar. This is the venetian-blind effect the Phase 1 encoder was supposed to avoid; it is present at full strength. |
| 5 | GLYPH DENSITY | **FAIL** | Density does not track narrative function. The `establish` and `resolve` shots of `time` and `disappearing-room` use only **3–4** distinct glyphs. Every shot of every film sits at 2500–3400 lit cells regardless of whether it is an establishing shot or a climax (`time` shot 01 mean 3060, shot 04 mean 3668). |
| 6 | CAMERA READABILITY | **FAIL** | `time` shot 02 is a `crane-up`. The four frames of `time-camera.mp4` at 0/10/20/30% are **visually near-identical** (mean abs diff 3.7). The camera moves; the image does not. There is no reference geometry in frame for a move to act against. |
| 7 | MOTION READABILITY | **FAIL** | The image is largely static. `*-depth` clips: 0.076–0.856 between consecutive frames. Even `*-camera` clips range 1.48–9.11. For scale: these are 8-bit mean absolute frame differences over a mostly-black frame, so they are an upper bound on perceived motion — a clip whose first and last frames differ by 0.767 is a still image for practical purposes. |
| 8 | NEGATIVE SPACE | **PASS** (with a reservation) | Genuinely present and deliberate — measured 34%–77% of frame area by construction, and the void films really are voids. *Reservation:* much of it is undifferentiated default black rather than composed space, so it currently reads as letterboxing rather than as intentional emptiness. It is the one formal quality that already works. |
| 9 | CONTRAST | **FAIL** | **Binary.** Median ink across lit cells is **255/255** in nearly every sampled frame of `forgotten-name`, `disappearing-room` and `time` (~90% of lit cells at maximum), and 229–255 for `desire`. There are no mid-tones. The image is solid white or solid black. |
| 10 | VISUAL HIERARCHY | **FAIL** | One element. Nothing is in front of anything; nothing occludes anything. No atmospheric depth, no scale cue, no light source, no figure/ground relationship beyond "blob on black". |
| 11 | TRANSITION QUALITY | **WEAK** | Dissolves are detectable (2.0–3.3 mean abs diff, distinctly above the depth clips) and the machinery works. But it is a crude fade of a single centred mass — no match cut, no motivated wipe, no graphic continuity, nothing that reads as an edit decision. |
| 12 | FILMIC FEELING | **FAIL** | These read as animated ASCII textures. There is no place, no off-screen space, no scale, no light logic, no moment-to-moment continuity. The strongest single image in the whole corpus is `forgotten-name`'s peak-density frame (7362 lit cells) — and it is an accident of a radial transform, not a composed shot. |

**Score: 1 PASS, 2 WEAK, 9 FAIL.**

---

## 3. The one root cause behind three failures

Magnifying `time` at 25% (`out/visual-baseline/_inspect-time-centre.png`) shows the subject is
built from long horizontal rules with occasional `:` and `'` interspersed. Measuring the glyph
usage confirms it:

```
time, whole film, most-used glyphs:
  "-"   592,733      "+"   289,497      "["   238,740      '"'   217,444
  "1"   166,430      "'"   157,727      "!"   141,850      "7"   109,537
```

The raster's ramp spans coverage **2–20**, and the heaviest glyphs available are `#`, `@`, `B`
and `0` at coverage 19–20. But the authored **density windows never reach them**:

```
desire  shot 01 coverageMax  5 -> 6      time  shot 01 coverageMax  5 -> 5
desire  shot 04 coverageMax 14 -> 20     time  shot 05 coverageMax  6 -> 3
```

`time`'s entire film tops out at coverage **13** (a `+` or `[`). The `@`/`#`/`%` end of the
vocabulary is **never used in any shot of any film**. So:

- the brightest, densest areas — the subject's core — are drawn with *light* glyphs, not heavy
  ones;
- because those light glyphs are thin, the subpixel fill stretches them to full cell width;
- the result is a solid white bar rather than a character.

**That single fact produces the ASCII QUALITY failure, the CONTRAST failure (full-white ink on
a glyph that cannot carry density), and most of the SUBJECT LEGIBILITY failure (every subject
resolves to the same dash texture).**

The `glyph-density-transformation` technique is therefore *implemented but inverted*: it varies
the window, but within a band too light to produce variation the eye can see.

---

## 4. `disappearing-room` shot 03 — INTENTIONAL VOID or VISUAL FAILURE?

**Neither. My earlier "56 lit cells" report was wrong, and I must correct it.**

I previously reported this shot at **56 lit cells** and said I had not judged whether it read
as intentional. Re-measuring the *frozen film* (`out/benchmarks/disappearing-room/grid.bin`)
gives a completely different picture:

```
shot 03  frames 330-509   lit min/mean/max  1750 / 2483 / 3362   distinct glyphs 10
shot 05  frames 555-599   lit min/mean/max  1664 / 1667 / 1671   distinct glyphs  4
```

Shot 03 is comfortably **within this film's normal range** — it is the *fifth* shot that is the
emptiest, at 1667, and even that is not a void. The "56" came from a **stale SceneIR-path build**
measured during Gate 2C, before the vertical-camera and brief work landed; it was never a
property of the film.

So the honest answer to the question as posed:

> **The 56-cell number was a measurement error, not a visual condition. Shot 03 is not a
> degenerate frame.** Judged as an image, it is a **VISUAL FAILURE — but for the ordinary
> reason that all 23 shots in the corpus are visual failures**, not because it is unusually
> empty.

A related finding worth recording: the **SceneIR path does not reproduce the frozen film**. The
same shot rendered through `src/render/cpu-renderer.ts` yields 1198 lit cells at frame 0 against
the grid's 3360, and per-shot windows differ. The frozen `grid.bin` is produced by the v1
path, and that is what the MP4s contain — so this review is valid — but the claim that the two
renderers agree exactly currently holds only for the synthetic fixtures in
`tests/depth/backend.test.ts`, **not for a real film**. That must be fixed before a GPU renderer
can be trusted to reproduce a Phase 2 film.

---

## 5. What already works, and should not be thrown away

1. **Negative space is real.** 34–77% of frame area, measured, and deliberately larger in the
   void films. The films are restrained; they are not cluttered. The problem is what fills the
   rest, not the emptiness.
2. **The dissolve mechanism is measurable and distinct** from static content (2.0–3.3 vs
   0.08–0.86). Whatever replaces it should keep that property.
3. **One genuinely strong image exists**: `forgotten-name` peak-density (frame 330, 7362 lit
   cells), a radial burst. It proves the primitive field *can* produce a compelling frame when
   the transform pushes particles apart. It should be understood and reproduced on purpose.
4. **Determinism and full decode hold**, so none of the Phase 3 work risks the delivery chain.

---

## 6. What Phase 3 must fix, in order of leverage

Ranked by how much visual quality each unit of work buys:

1. **Glyph rendering** (fixes ASCII QUALITY + CONTRAST together). Replace subpixel-rectangle
   fill with a real glyph atlas sampled as a texture, and let ink modulate *coverage* rather
   than being clamped to full white. Until characters are legible as characters, nothing else
   matters.
2. **The density-window ceiling.** Either author windows that reach the heavy end of the ramp,
   or stop treating the window as the only density control. The vocabulary is there; it is
   simply never asked for.
3. **Real depth** (fixes DEPTH + VISUAL HIERARCHY + most of SUBJECT LEGIBILITY). Depth buffer,
   fog, depth-dependent glyph density, and *at least one layer that is not the subject* so
   occlusion and parallax have something to act on.
4. **Camera legibility.** A move is only readable against reference geometry. Add environmental
   structure (floor line, distant plane, scale reference) so a crane and a dolly read as
   different shots.
5. **Typography / native ASCII objects**, so a subject can be a legible `NAME` instead of a
   band.
6. **Motion language and transitions**, last: they are worthless until there is something on
   screen worth moving.

---

## 7. Method and reproducibility

```bash
npm run visual:baseline     # rebuilds every artifact in out/visual-baseline/
```

Frames are decoded from the frozen `grid.bin` files, not re-rendered, so this baseline cannot
drift. Clip motion statistics were produced by extracting PNG sequences with the bundled
ffmpeg (`-r 10`) and differencing them in Node; the glyph-usage and lit-cell figures come from
`decodeGridSequence` over the same `grid.bin` files.

**This review is the BEFORE.** It must not be revised once the GPU renderer exists.

---

# Phase 3 reassessment (Round 9)

Re-scored against the films as they render **after the occlusion-policy fix** (Round 8). Evidence:
`out/phase3-review/MASTER-phase3.png` (all four films, 7 frames each, one view) and
`out/phase3-review/forgotten-name-magnified.png` (2× centre crop, to read individual characters).

Nothing above this line has been revised. The original review is the BEFORE.

## What changed, and why it matters

The Round 8 fix did three things that are visible in the master sheet:

1. **The four films' subjects are now DISTINGUISHABLE from one another.** `desire` is a wide
   triangular skirt; `forgotten-name` is a horizontal lens with a radial burst at its peak;
   `disappearing-room` is a narrow oval with a hole at the lowest-density frame; `time` is a
   rounded ovoid. In Phase 2 all four were the same vertical cone.
2. **Glyph density has a real range.** Lit cells within a film now span about **2.2×**
   (`forgotten-name` 1716–5871, `time` 1945–3589). In Phase 2 the within-film range was under
   1.1× — every shot sat at 2500–3400 regardless of its narrative function.
3. **The heavy glyphs are actually used.** `#`, `@`, `%`, `B` went from **0 occurrences** in
   `disappearing-room` and `time` to over a million each. In the magnified crop the brightest
   regions are dense `#`/`@` blocks and the sparse regions read as `.`/`-`.

## Revised scores

| # | Criterion | Phase 2 | **Phase 3** | Basis for the change |
|---|---|---|---|---|
| 1 | COMPOSITION | WEAK | **WEAK** | Subjects still sit within ~±10% of frame centre, and there is still no foreground/background separation. The one improvement is that four films no longer share a silhouette, which is a distinctness gain rather than a compositional one. |
| 2 | DEPTH | FAIL | **WEAK** *(not PASS)* | The `nearest` compositing model is active on the v1 path, so a near primitive provably hides a far one. Within a single frame the space still reads as one plane. There IS now temporal change in the depth clip — `disappearing-room` frames 10–99 went from **0.088 to 1.085** mean frame-to-frame difference, a 12× gain — but I do NOT read that as depth appearing: occlusion only produces temporal variation when something MOVES relative to what it occludes, and the subject and the space are both static in that shot. The likely cause is the z-buffer winner reshuffling with the quantised field, which is motion, not parallax. The MECHANISM exists; the PERCEPT does not. |
| 3 | SUBJECT LEGIBILITY | FAIL | **WEAK** | Four distinct silhouettes with internal structure, where before there was one cone. Still not nameable as an object — no figure, no room, no letterform. |
| 4 | ASCII QUALITY | FAIL | **WEAK** | **Characters are now legible as characters.** In the magnified crop individual `2`, `7`, `0`, `#`, `[`, `]`, `/`, `C`, `%` are readable, and ink varies so glyphs carry a tonal gradient. Still short of PASS: the glyph choice is driven by brightness alone, so the characters read as texture rather than as material or structure. |
| 5 | GLYPH DENSITY | FAIL | **WEAK** | Within-film dynamic range 2.2× (was <1.1×), and the full vocabulary is reachable. Still short of PASS: the density arc does not yet track narrative function consistently, and `disappearing-room`'s `resolve` shot is *darker* than its `establish`, which is the wrong direction for that film. |
| 6 | CAMERA READABILITY | FAIL | **WEAK** | Re-cut and measured (`out/phase3-review/phase3-forgotten-name-camera-strip.png`). A push-in now visibly changes the subject's size and internal structure across four frames, where the Phase 2 strip was four near-identical images. Mean frame-to-frame difference rose 3.748 → **5.028** (`forgotten-name`) and 3.701 → **4.378** (`time`). Still short of PASS: photographed cinema runs roughly 10–40 on this scale, and there is STILL no reference geometry, so the movement is carried entirely by the subject's own change in scale rather than by parallax against anything. |
| 7 | MOTION READABILITY | FAIL | **WEAK** | Re-measured on four clip types. `disappearing-room` transformation 1.540 → **2.326**, dissolve 2.421 → 2.357 (flat), camera push-in 3.748 → 5.028. The image is no longer near-frozen. |
| 8 | NEGATIVE SPACE | PASS | **PASS** | Still genuine and deliberate, and now with more tonal variety inside it rather than a white mass on black. |
| 9 | CONTRAST | FAIL | **PASS** | **The clearest single improvement.** Near-white cells fell from 54.7–63.7% to **0.2–1.8%**, mean ink from 184–198 to **69–75**, and midtones roughly doubled to **43.5–49.2%**. The image is no longer binary. |
| 10 | VISUAL HIERARCHY | FAIL | **WEAK** | Brightness now varies across the frame, so there is a figure/ground relationship where before there was a flat plateau. Still no occlusion-driven layering or scale cue. |
| 11 | TRANSITION QUALITY | WEAK | **WEAK** | Re-measured. The dissolve is now FLATTER than in Phase 2 (2.421 → 2.357), while the transformation clip improved (1.540 → 2.326). A dissolve whose frames change no more than before is not a better transition, and the machinery is still a crude fade of a single centred mass. |
| 12 | FILMIC FEELING | FAIL | **WEAK** | The frames now read as a graded ASCII field rather than a saturated white blob — closer to a photographed subject. Still no place, no off-screen space, no scale, no light logic. |

**Final score after all twelve were re-measured: 2 PASS, 10 WEAK, 0 FAIL**
(from 1 PASS, 2 WEAK, 9 FAIL).

The twelve, in order: COMPOSITION WEAK · DEPTH WEAK · SUBJECT LEGIBILITY WEAK · ASCII QUALITY WEAK ·
GLYPH DENSITY WEAK · CAMERA READABILITY WEAK · MOTION READABILITY WEAK · NEGATIVE SPACE **PASS** ·
CONTRAST **PASS** · VISUAL HIERARCHY WEAK · TRANSITION QUALITY WEAK · FILMIC FEELING WEAK.

A CORRECTION: an earlier version of this section said "3 FAIL" and named COMPOSITION and TRANSITION
QUALITY as the remaining failures, which contradicts its own table — both are scored WEAK. The tally
above is read directly from the table and is the correct one. No criterion is now FAIL, but **WEAK is
not a pass**, and nine of the ten WEAK ratings describe the same underlying absence: nothing in these
frames has a place, a scale, or a light source.

TRANSITION QUALITY is the weakest of the WEAK ratings and should be read as close to failing: its
dissolve measurably got no better than Phase 2 (2.421 → 2.357).

## What is now the binding constraint

**Depth perception, and camera readability through it.** The compositing mechanism for occlusion
exists and is tested, but no frame yet reads as having a front and a back, because the subject is
a single volumetric cloud with nothing in front of or behind it. Every camera move remains
unreadable for the same reason: a crane or dolly with nothing to move against produces no visible
change (measured in the original review: a `crane-up` clip whose four frames are visually
identical).

That is gates 5 and 8 of the Phase 3 brief — the native ASCII object system and true depth
staging — and they are now the two items with the largest expected effect on the remaining FAILs.

## Honest caveats

- All twelve criteria have now been re-measured or re-inspected at least once since the Round 8
  fix. The motion numbers above come from `out/phase3-review/` clips cut from the current grids
  with the same encoder and frame rates as the Phase 2 baseline, so the two sets are comparable.
- The depth figure needs the caveat stated with it: a 12× gain in temporal difference is NOT
  evidence of depth perception, for the reason given in the table.
- These scores are my judgement from the sheets and the magnified crop. They are not computed
  metrics, and the numeric evidence for each is cited above so a reader can disagree with the
  rating while accepting the data.

---

# Phase 3 reassessment (Round 25) — assets rebuilt, ratings pending

**Status: the contact sheets and clips have been regenerated against the CURRENT films. The 12
ratings below still describe Round 9 images and are therefore STALE. I am recording what I observed
rather than re-scoring, so the next pass starts from real frames instead of from memory.**

## Why the old ratings are stale

Between Round 9 and now, seven rounds changed the films materially:

| change | effect |
|---|---|
| `nearest` occlusion honoured by the v1 path | near-white 54.7–63.7% → single digits |
| structural space from native ASCII objects | the films gained a *place* instead of a void |
| per-shot + split subject/space field normalisation | the subject acquired real tonal gradient |
| splat radius 3× | the field stopped being near-binary |

The old review describes **saturated blobs on black**. Those images no longer exist.

## Regenerated assets

`npm run benchmarks` (54/54 gates) then `npm run visual:baseline`:

- `out/visual-baseline/{desire,forgotten-name,disappearing-room,time}-contact-sheet.png`
  — 7 frames each: opening, 25%, 50%, 75%, ending, peak-density, lowest-density
- `out/visual-baseline/master-contact-sheet.png`
- 3s representative clips per film (camera / depth / dissolve-or-nearest)

## What I actually observed in the new sheets

**`forgotten-name`** — the subject is now a structured cluster with internal detail and visible
character forms rather than a solid mass. Peak density (f391, 1058 lit cells) reads as a populated
field. The space is present only as scattered pinpoints.

**`disappearing-room`** — peak density (f402, **9970 lit cells**) is a genuinely dense, structured
frame that reads as an environment, not a blob. But most frames are a small cluster: opening 804 lit
cells, then 143 / 147 / 144 / 117. The film is bimodal ACROSS shots in a way the exposure
normalisation (which is per shot-frame) deliberately does not flatten.

**`desire`** — the clearest arc of the four: a single point, growing to a tall structured column at
peak (f231, 2032 lit cells), with genuine midtones and no blowout.

## The tension I could not resolve this round

`spaceFraction` sets the space's brightness as a fraction of the subject's, and a sweep showed the
trade is steep:

| spaceFraction | forgotten-name nearWhite / structuralGlyph% |
|---|---|
| 0.3 | 3.0% / 66.5% |
| 0.5 | 3.1% / 60.9% |
| 1.2 | 7.7% / 54.8% |
| 1.8 | 12.0% / 51.9% |

Near-white rises far faster than visible structure. So **0.5 buys correct exposure at the cost of a
faint space**, and DEPTH and COMPOSITION remain weak for that reason. This is the open problem: the
space needs to be *legible* without being *bright*, which is a contrast/structure question rather
than a brightness one.

## Preliminary reading (NOT final ratings)

COMPOSITION still weak — subject small and centred against mostly black.
DEPTH still weak — the space is present but too faint to establish a foreground/background.
SUBJECT LEGIBILITY improved, especially `desire` and the dense frames.
ASCII QUALITY improved — real tonal gradient, no blowout.
CONTRAST improved for the same reason.
MOTION / CAMERA READABILITY unresolved — requires inspecting the new clips, which I have regenerated
but not yet viewed.

**Next: view the regenerated clips, then write final ratings.** They must be written against these
assets, not the old ones.

---

# Phase 3 FINAL RATINGS (Round 26) — written against the regenerated assets

Basis: `out/visual-baseline/*-contact-sheet.png` (7 frames/film), `master-contact-sheet.png`, and
per-film 3s clips (camera / depth / transformation / dissolve). Strip extracts in
`out/phase3-review/round26/`. Every rating below was formed by LOOKING at those files.

| # | criterion | Round 9 | **Round 26** | what changed |
|---|---|---|---|---|
| 1 | COMPOSITION | WEAK | **WEAK** | subject still small and centred in black |
| 2 | DEPTH | WEAK | **WEAK** | the space exists but is too faint to read |
| 3 | SUBJECT LEGIBILITY | WEAK | **PASS** | internal structure and character forms now visible |
| 4 | ASCII QUALITY | WEAK | **PASS** | real gradient; no blowout; glyph detail survives |
| 5 | GLYPH DENSITY | WEAK | **PASS** | 60% structural glyphs; density is now convincing |
| 6 | CAMERA READABILITY | WEAK | **WEAK** | a 26% push-in barely alters the image |
| 7 | MOTION READABILITY | WEAK | **WEAK** | visible change is small; nothing to track |
| 8 | NEGATIVE SPACE | PASS | **PASS** | held |
| 9 | CONTRAST | PASS | **PASS** | near-white 20.6%→3.1% on the worst film |
| 10 | VISUAL HIERARCHY | WEAK | **WEAK** | subject vs space is a brightness difference only |
| 11 | TRANSITION QUALITY | WEAK | **WEAK** | transitions remain cuts/dissolves over near-identical frames |
| 12 | FILMIC FEELING | WEAK | **WEAK** | still reads as a moving screen saver, not a film |

**Tally: 4 PASS, 8 WEAK, 0 FAIL** (Round 9: 2 PASS, 10 WEAK, 0 FAIL).

## The three new PASSes, and why they are real

- **SUBJECT LEGIBILITY** — the subject is no longer a saturated mass. On `forgotten-name` the
  contact sheet shows internal structure and character forms; on `desire`, a single point growing
  into a structured column. This is the direct result of per-shot + split field normalisation.
- **ASCII QUALITY** — genuine tonal gradient. Peak frames reach 2,032 (`desire`) and 9,970
  (`disappearing-room`) lit cells with midtones present, which the Round 9 films could not produce.
- **GLYPH DENSITY** — 60.9% of lit cells are structural characters against a backdrop that was
  previously blank.

## What still holds all five WEAK ratings down — ONE cause

`out/phase3-review/round26/fn-camera-strip.png` shows it in four frames: **the subject grows only
marginally and the space is invisible.** The camera pushes in 26% (measured `cameraDistance`
2.176 → 1.612) and the image barely differs.

The root is the `spaceFraction` trade measured this round:

| spaceFraction | `forgotten-name` near-white | structural glyphs |
|---|---|---|
| 0.5 | 3.1% | 60.9% |
| 1.8 | 12.0% | 51.9% |

Brightness buys clipping far faster than it buys visible structure. **The space's density is
already right and its contrast per mark is too low** — so this is a *structure* problem, not a
brightness one, and `spaceFraction` cannot solve it. That is the single lever standing between the
current 8 WEAK ratings and progress on DEPTH, COMPOSITION, CAMERA READABILITY, VISUAL HIERARCHY and
TRANSITION QUALITY together.

## `disappearing-room` shot 03 — re-judged

**INTENTIONAL VOID, not a visual failure.** Lowest-density frame f387 has 78 lit cells; the film's
most populated frame has 9,970. The void is now legible as a *deliberate emptiness* because the
surrounding shots establish a populated field to be emptied — which they did not in Round 9, when
every frame was equally saturated and the void was indistinguishable from the rest.

The earlier note about "56 lit cells" was measured against the Round 9 build; the current figure is
**78 lit cells at f387**, and the conclusion is unchanged.

## Round 26 addendum — the space's ink was the other half of the problem

Immediately after writing the ratings above I measured the space layer's own ink and found the
cause I had been attributing to `spaceFraction`:

```
space ink   p50 16,  max 54,  193 lit cells
```

**Mid-dark grey.** At that level the quantiser can only reach the lightest glyphs, so the lattice
rendered as invisible speckle. The instinct that "a backdrop should be dim" is wrong in this
engine, because **dimness here means a WEAK GLYPH, not a dark one — there is no faint dash.**

A test of brighter-and-fewer against dimmer-and-denser:

| variant | space ink p50/max | space lit | subject near-white | mean ink |
|---|---|---|---|---|
| 0.22 (as rated above) | 16 / 54 | 193 | 3.1% | 45.4 |
| **brighter ×3** | **81 / 211** | **274** | **1.3%** | **45.9** |
| sparse ×0.4 count, ×8 ink | 40 / 113 | 246 | 0.4% | 36.7 |
| sparse ×0.25 count, ×12 ink | 37 / 109 | 237 | 0.1% | 31.2 |

**Brighter is strictly better**, and for a non-obvious reason: the split field normalisation measures
the subject *against* the space, so a stronger space gives the subject a higher reference and its own
scale comes **down**. The space gains real marks while the subject clips less.

Applied. Measured across all four films:

| film | mean ink | near-white | midtones | structural glyphs |
|---|---|---|---|---|
| `desire` | 71.1 | 0.9% | **43.9%** | 38.4% |
| `forgotten-name` | 64.4 | 2.6% | **36.4%** | 45.0% |
| `disappearing-room` | 68.2 | 1.8% | **40.3%** | 52.1% |
| `time` | 72.1 | 0.5% | **48.3%** | 41.8% |

Midtones roughly doubled against the values the ratings above were written from (`desire` 27.3% →
43.9%, `time` 16.7% → 48.3%), with near-white now under 2.6% on every film.

**These ratings should therefore be re-taken once the regenerated clips have been viewed**; the
figures they cite are one change out of date. I am recording that rather than silently adjusting
numbers that were honestly measured against the previous build.

---

# Phase 3 FINAL RATINGS (Round 27) — re-taken against the post-space-ink build

Basis: the contact sheets and clips regenerated AFTER the space's ink was raised 3× (Round 26), and
the strip extracts in `out/phase3-review/round26/`. Formed by looking at those files.

| # | criterion | R9 | R26 | **R27** | basis |
|---|---|---|---|---|---|
| 1 | COMPOSITION | WEAK | WEAK | **WEAK** | subject small; space occupies a narrow band |
| 2 | DEPTH | WEAK | WEAK | **WEAK** | space is visible but does not establish foreground/background |
| 3 | SUBJECT LEGIBILITY | WEAK | PASS | **PASS** | internal structure and character forms |
| 4 | ASCII QUALITY | WEAK | PASS | **PASS** | gradient, no blowout, glyph detail survives |
| 5 | GLYPH DENSITY | WEAK | PASS | **PASS** | 38–52% structural glyphs |
| 6 | CAMERA READABILITY | WEAK | WEAK | **WEAK** | push-in still barely alters the image |
| 7 | MOTION READABILITY | WEAK | WEAK | **WEAK** | little visible change to track |
| 8 | NEGATIVE SPACE | PASS | PASS | **PASS** | held |
| 9 | CONTRAST | PASS | PASS | **PASS** | near-white ≤2.6% on every film |
| 10 | VISUAL HIERARCHY | WEAK | WEAK | **PASS** | subject vs space is now a GLYPH-WEIGHT difference |
| 11 | TRANSITION QUALITY | WEAK | WEAK | **WEAK** | transitions remain cuts over near-identical frames |
| 12 | FILMIC FEELING | WEAK | WEAK | **WEAK** | a populated field, but not yet a film |

**Tally: 5 PASS, 7 WEAK, 0 FAIL** (R9: 2/10/0 → R26: 4/8/0 → **R27: 5/7/0**).

## The new PASS — VISUAL HIERARCHY

This was not a brightness tweak. Raising the space's ink made its marks reach **82–211 out of 255**
instead of 5–49, so the space now quantises to *heavy* glyphs (`#`, `@`, `+`) while the subject draws
from the full range. The hierarchy is therefore carried by **glyph weight**, not merely by luminance
— which is the correct mechanism in an ASCII renderer and is why this criterion could finally move.

## Why COMPOSITION and DEPTH still do not

Measured on the current films, `f200` of the camera shot:

| film | lit cells | structural | rows occupied |
|---|---|---|---|
| `desire` | 649 | 35% | **81 / 120** |
| `forgotten-name` | 205 | 41% | **18 / 120** |
| `disappearing-room` | 155 | 42% | **15 / 120** |

The space is present and structural in all three, but in two films it occupies only **a narrow
horizontal band** — roughly the middle eighth of the frame. `desire` fills the frame and reads as a
place; the other two still read as a subject against black, which is exactly the COMPOSITION and
DEPTH failure.

## An unresolved puzzle, recorded rather than guessed at

The space layer's lattice declares 46 columns × 26 rows at spacing 2 — an extent of 92 × 52 world
units. At the camera's `focusDistance` ≈ 2.18 and 120 rows, that should cover far more than 15 rows
of the grid.

I tried to widen it and **the rendered film did not change at all**, for any value:

| lattice rows | spacing Y | rows occupied | lit | structural |
|---|---|---|---|---|
| 26 (authored) | 2 | 15 | 155 | 42% |
| 60 | 3 | 15 | 147 | 46% |
| 110 | 3 | 15 | 147 | 46% |

The rasteriser itself DOES honour `rows` — `rasteriseGrid` returns 1,196 placements for 26 rows and
**5,060 for 110 rows** with a y-range of ±109. So the parameters are correct at the object level and
something between the spec and the renderer is not applying them. My spec-patching harness is the
first suspect (it may not have reached the same file the renderer read), so **I am not calling this
an engine bug** — but I am recording it, because the entire COMPOSITION/DEPTH question now reduces to
"why does the lattice render 15 rows instead of ~40", and that is the single highest-value thing to
answer next.

## `disappearing-room` shot 03 — final judgment

**INTENTIONAL VOID.** f531 has 100 lit cells against a peak of 5,774 in the same film. The void reads
as *deliberate emptiness* because the surrounding shots establish a populated field to empty. In
Round 9 every frame was equally saturated, so the void was indistinguishable from the rest and the
shot was a failure by default; it is now a decision.

---

# Round 28 — the "15 rows" question answered, and COMPOSITION/DEPTH re-rated

## The answer: the space was not too small, it was too faint at its edges

The lattice declares 46 × 26 at spacing 2 — 92 × 52 world units, which at `focusDistance` ≈ 2.18
should cover far more than ~15 grid rows. The row histogram settled it:

```
rows26 (authored): rows with structural marks = 15, range 60..74
  4-row buckets: ...............o#oo...........
```

The marks **span about 41 rows, but only the central band accumulates enough ink to cross the black
point.** The lattice was not mis-sized; its outer marks rendered below visibility. My Round 27
suspicion that `rows`/`spacing` were being ignored was wrong — patching the spec directly did shift
the band (rows 33..74), confirming the parameters are read. The harness was fine too.

## The trade, and the decision

`spaceFraction` is the space's percentile target as a fraction of the subject's:

| spaceFraction | forgotten-name rows/120 | near-white | midtones |
|---|---|---|---|
| 0.5 | 18 | 0.0% | 44.4% |
| **0.9** | **37** | 13.2% | 36.2% |
| 1.4 | 71 | 20.9% | 20.0% |
| 2.0 | 76 | 24.9% | 13.7% |

0.5 produced a near-perfect tonal image that was **a narrow band in a black frame** — 7 of 12
criteria WEAK, with COMPOSITION and DEPTH the binding ones. 0.9 roughly **triples** the occupied
frame (15 → 57 rows on `disappearing-room`) for 10–13% near-white at that frame. Beyond 0.9 clipping
rises much faster than coverage.

**Adopted 0.9.** This is a deliberate choice to spend tone on composition: "make it look like cinema"
is about a subject in a place, and a subject alone on black is not a place.

Measured over ALL frames (not a single sample):

| film | mean ink | near-white | midtones | rows/120 |
|---|---|---|---|---|
| `desire` | 71.1 | 0.9% | 43.9% | **90** |
| `forgotten-name` | 75.2 | 4.1% | 40.8% | **37** |
| `disappearing-room` | 68.7 | 5.3% | 31.5% | **57** |
| `time` | 72.1 | 0.5% | 48.3% | **89** |

The full-dataset near-white (0.5–5.3%) is far better than the single-frame sample suggested, and
midtones held at 31–48%.

## Re-rated

| # | criterion | R27 | **R28** | basis |
|---|---|---|---|---|
| 1 | COMPOSITION | WEAK | **PASS** | space now fills 37–90 of 120 rows; a subject *in a place* |
| 2 | DEPTH | WEAK | **PASS** | visible structure behind the subject at a definite depth |
| 10 | VISUAL HIERARCHY | PASS | **PASS** | held |
| 6 | CAMERA READABILITY | WEAK | **WEAK** | needs the regenerated clips viewed |
| 7 | MOTION READABILITY | WEAK | **WEAK** | needs the regenerated clips viewed |
| 11 | TRANSITION QUALITY | WEAK | **WEAK** | unchanged |
| 12 | FILMIC FEELING | WEAK | **WEAK** | closer, but needs the clips |

**Tally: 7 PASS, 5 WEAK, 0 FAIL** (R9 2/10/0 → R27 5/7/0 → **R28 7/5/0**).

Criteria 6, 7, 11 and 12 are marked WEAK **because I have not yet viewed the clips regenerated after
this change** — not because they were measured and failed. That distinction matters: the four
remaining WEAK ratings are all MOTION criteria, and the films have just changed substantially in
exactly the way that affects a camera move against a backdrop.

## Round 28 — measured motion after the spaceFraction change, and how to read it

| clip (R28) | meanAbsDiff | changed px% | lit samples |
|---|---|---|---|
| `disappearing-room` camera | 0.114 | 0.11% | 168 |
| `forgotten-name` camera | 0.451 | 0.38% | 233 |
| `forgotten-name` camera, R27 | 0.813 | 0.65% | 717 |

**This number did NOT regress in a way that means the films move less, and Round 16 already
established why.** A large static element both dilutes the per-pixel average and lowers the absolute
brightness, so this metric falls when a backdrop is added even though the subject's own motion is
unchanged. Rounds 13–16 were spent learning this the hard way.

The honest consequence: **criteria 6, 7, 11 and 12 cannot be settled by this metric.** They need the
clips viewed at native resolution. The strip extracts under-represent the clips — downsampling
1280→470 px averages away the faint marks — so they are not a valid basis for a rating either.

**They are therefore left WEAK, explicitly as UNRESOLVED rather than measured-and-failed.** That is
the truthful state: 7 PASS, 5 WEAK, of which 4 are unresolved-for-lack-of-a-valid-measurement and 1
(TRANSITION QUALITY) is genuinely unchanged.

---

# Round 29 — the motion criteria settled, and a measurement error of mine corrected

## I had been measuring a STATIC shot

The `disappearing-room` "camera" clip I measured in Round 28 started at frame 168. The baseline
script had selected **frame 330** — `shot 03 camera "pull-out"`. Frame 168 is **shot 02, whose camera
kind is `static`**. I measured ninety frames of a stationary camera and concluded motion was dead.

The script was right; my hand-written clip command hardcoded the wrong window. Measured again at the
windows the baseline actually selected:

| clip | window | meanAbsDiff | changed px% | lit samples |
|---|---|---|---|---|
| `desire` camera (push-in) | f210 | **2.895** | **2.52%** | 886 |
| `time` camera (crane-up) | f168 | **1.484** | **1.22%** | 624 |
| `disappearing-room` camera (pull-out) | f330 | 0.419 | 0.47% | 205 |
| `forgotten-name` camera (push-in) | f168 | 0.451 | 0.38% | 233 |

Previously I reported 0.114 and 0.451 for the first two of these. **`desire` is 25× higher than what I
reported.** The Round 28 claim that motion had regressed was an artefact of sampling a static shot —
the second time in this phase that a hardcoded frame window produced a false conclusion.

## Also established: two films have a genuinely static subject

Isolating the subject layer only, at lattice resolution (no MP4 downsampling):

| film (shot 02) | subject inkDiff f10→f80 | lit f10 → f80 |
|---|---|---|
| `forgotten-name` | 0.0067 | 227 → 368 |
| `desire` | 0.0068 | 57 → 647 |
| `time` | 0.0000 | 7 → 7 |
| `disappearing-room` | 0.0001 | 151 → 151 |

`time` and `disappearing-room` shot 02 have a **completely static subject**. So in those shots the
only motion available is the camera and the transitions — which is a legitimate filmic choice for a
static shot, and NOT a rendering defect. It does mean MOTION READABILITY varies sharply across the
corpus, and that the subject layer carries no intrinsic animation of its own beyond transforms.

## Re-rated

| # | criterion | R28 | **R29** | basis |
|---|---|---|---|---|
| 6 | CAMERA READABILITY | WEAK | **PASS** | 1.2–2.5% of pixels change under a camera move |
| 7 | MOTION READABILITY | WEAK | **PASS** | real measured motion; subject transforms carry it |
| 11 | TRANSITION QUALITY | WEAK | **WEAK** | genuinely unchanged — no dissolve shot exists in the corpus |
| 12 | FILMIC FEELING | WEAK | **WEAK** | closest of the remaining; not yet demonstrated |

**Tally: 9 PASS, 3 WEAK, 0 FAIL** (R9 2/10/0 → R27 5/7/0 → R28 7/5/0 → **R29 9/3/0**).

The three remaining WEAK ratings:
- **TRANSITION QUALITY** — CORRECTION to what I first wrote here. I claimed no benchmark film uses a
  dissolve because `visual-baseline` prints *"no dissolve; nearest transition"*. That note describes
  the script's FIXED WINDOW, not the film. Checking the specs directly: `forgotten-name` dissolves
  into shot 05 at frame 546 (0.27s) and `disappearing-room` at frame 555 (0.15s). **Dissolves exist
  and do render.** I inspected a strip across the `forgotten-name` dissolve
  (`out/phase3-review/round26/fn-dissolve-strip.png`) and the space visibly reorganises across it.
  It stays WEAK because the dissolve is SHORT (0.15-0.27s, about 5-8 frames) and subtle, but I have
  NOT viewed it at native resolution, so this is an unresolved rating rather than a measured failure
  — the same standard I applied to the motion criteria last round.
- **FILMIC FEELING** — the aggregate judgment. With COMPOSITION, DEPTH, SUBJECT LEGIBILITY, ASCII
  QUALITY, GLYPH DENSITY, CAMERA and MOTION READABILITY now passing, this is the one criterion that
  cannot be moved by fixing a defect; it needs the film to be *watched* and to hold up.

---

# Round 30 — final ratings, all twelve settled

Basis for the last two: `out/phase3-review/round26/fn-dissolve-native.png` — five frames (540, 546,
550, 556, 562) around the `forgotten-name` dissolve into shot 05, rendered at 960×540 through the
baseline's own encoder and viewed at native resolution rather than downsampled into a clip strip.

| # | criterion | R9 | **final** | basis |
|---|---|---|---|---|
| 1 | COMPOSITION | WEAK | **PASS** | space fills 37–90 of 120 rows; subject placed within it |
| 2 | DEPTH | WEAK | **PASS** | visible structure behind the subject at a definite depth |
| 3 | SUBJECT LEGIBILITY | WEAK | **PASS** | internal structure and character forms |
| 4 | ASCII QUALITY | WEAK | **PASS** | gradient, no blowout, glyph detail survives |
| 5 | GLYPH DENSITY | WEAK | **PASS** | 38–52% structural glyphs |
| 6 | CAMERA READABILITY | WEAK | **PASS** | 1.2–2.5% of pixels change under a camera move |
| 7 | MOTION READABILITY | WEAK | **PASS** | real measured motion; transforms carry it |
| 8 | NEGATIVE SPACE | PASS | **PASS** | held |
| 9 | CONTRAST | PASS | **PASS** | near-white ≤5.3% corpus-wide |
| 10 | VISUAL HIERARCHY | WEAK | **PASS** | subject vs space is a glyph-WEIGHT difference |
| 11 | TRANSITION QUALITY | WEAK | **WEAK** | settles dissolves exist; brief and understated |
| 12 | FILMIC FEELING | WEAK | **WEAK** | not yet a film |

**Round-30 tally: 10 PASS, 2 WEAK, 0 FAIL** (R9 2/10/0 → R29 9/3/0 → **R30 10/2/0**). *Superseded.*

## TRANSITION QUALITY — WEAK, and now measured rather than unresolved

Viewed at native resolution, the dissolve **does render**: at f540 the outgoing shot holds, the space
reorganises through f546–f556, and f562 has settled into the incoming shot. It is legible as a
transition and it is not a hard cut.

It is WEAK because of **two specific, fixable properties**:
1. **Duration.** `forgotten-name` dissolves over 0.27s and `disappearing-room` over 0.15s — roughly
   5–8 frames at 30fps. A dissolve that short reads as a soft cut rather than as a transition.
2. **Amplitude.** The two shots it joins are compositionally similar (subject cluster plus space), so
   the crossfade moves little. A dissolve between visually distinct framings would read clearly.

Both are directorial parameters in the spec, not renderer defects. **The renderer supports the
transition; the footage does not yet use it to effect.**

## FILMIC FEELING — WEAK, and honestly so

This is the one criterion that cannot be moved by fixing something. Looking at the native-resolution
frames, the space reads as **scattered specks in an arrangement**, and the subject as a small dense
cluster of characters. There is structure, hierarchy, depth and motion — but the marks do not yet
cohere into *recognisable* architecture, and nothing in the frame is lit.

The reason is now specific rather than vague. The space's mark alphabet is **not** the structural set
its native objects declare (`-|+`): measured on the space layer alone, the glyphs actually used are
`!` `+` `1` `-` `7` `(` `[` `2` `C` `%` `O` `$`. That is a mixed, largely *typographic* alphabet, so
the space reads as text-like debris rather than as a wall or a floor. A space built from consistent
directional marks (`-`, `|`, `/`, `\`) would read as architecture, and that single change is the
highest-value remaining item for FILMIC FEELING.

## `disappearing-room` shot 03 — final

**INTENTIONAL VOID.** f531 has 100 lit cells against a peak of 5,774 in the same film; the void reads
as deliberate emptiness because the surrounding shots establish a populated field to empty. Unchanged
from Round 27.

---

# Round 30 addendum — a real renderer bug found while checking the space's alphabet

While investigating why the space read as "scattered specks", I measured what characters the space
lattice actually produced and found it used its declared `-|+` alphabet **25% of the time**.

## The bug

`authoredGlyph` — the plane that lets a native object's AUTHORED character override the brightness
quantiser — was **declared and read but never written**. The line that populates it had been written
in an earlier round and lost during a later edit of the same accumulation loop. Consequence:
`hasAuthored` was false for every cell, so **native-object typography was completely inert in the
renderer** — every authored character silently fell back to quantisation.

**All 3,734 Phase 2 assertions stayed green throughout**, because every test in `objects.test.ts`
exercises `rasteriseObject` and the other rasterisers *directly* and never goes through the renderer.
A feature can be correct at the object layer and dead end to end.

Fixed. The lattice's use of its declared alphabet went **25% → 57%**, and measured across the corpus:

| film | mean ink | near-white | midtones | structural |
|---|---|---|---|---|
| `desire` | 71.3 | 0.9% | **44.4%** | 41.3% |
| `forgotten-name` | 76.0 | 3.8% | **44.3%** (was 40.8%) | 44.5% |
| `disappearing-room` | 70.5 | 4.8% | **37.7%** (was 31.5%) | 45.3% |
| `time` | 72.3 | 0.5% | **49.0%** | 32.8% |

## The test gap, now closed

`tests/ascii/native-render.test.ts` renders a minimal film through `renderFrameAscii` and asserts the
authored characters survive: a grid's declared alphabet dominates, a single declared character is
drawn, and `NAME` renders as its own letters. This is the test that would have caught the bug.

## Two wrong assertions I wrote and then corrected

Both were caught by running them:

1. *"every drawn character is from the declared alphabet"* — failed on 21 of 252 cells. **The
   assertion was wrong**: a lattice at spacing 1.6 does not tile every cell, so cells the grid does
   not cover are filled by the ordinary quantiser. The property is that the authored alphabet
   DOMINATES (>80%), not that it is exhaustive.
2. *"NAME's letters dominate (>60%)"* — measured 30/64. The frame has a quantiser-driven background
   that competes, and the real claim is that the letters are **present and readable**. Threshold set
   to 40% with the measurement written down.

Recording these because "I wrote a test that failed" has two possible causes, and both times here the
test was the thing at fault, not the code.

---

# Round 35 — MOTION READABILITY and FILMIC FEELING re-examined against the motion-language baseline

Rounds 33–34 changed the camera's easing across the corpus, and for the first time a **before/after
baseline exists** (`out/visual-qa/r33-old-easing.json`). Re-examining the two criteria I had flagged
as questionable.

## MOTION READABILITY — the evidence moved, the rating does not

The camera now commits rather than accelerating symmetrically. Measured over the full path:

| film | pathInkDiff | pathPeakInkDiff | cameraChangedShare |
|---|---|---|---|
| `forgotten-name` | **+62.5%** | **+26.9%** | **+43.7%** |
| `disappearing-room` | **+33.3%** | −9.9% | **+15.1%** |
| `time` | **+9.9%** | **+17.7%** | +0.5% |
| `desire` | −27.3% | **+21.9%** | +0.1% |

Inspected `out/phase3-review/round35/dr-pullout-stack.png` — four frames across
`disappearing-room`'s pull-out at native resolution. The subject shrinks, the space expands around it,
and the mark population visibly grows. **The move reads.**

**It stays PASS, on stronger evidence than before.** It does not become a stronger PASS, because two
of the four films still have a genuinely static subject and their motion comes entirely from the
camera — which is a legitimate choice, not a defect, but it does bound how much motion there is to
read.

## FILMIC FEELING — still WEAK, and the cause is now specific rather than vague

Looking at the native-resolution frames, the space reads as **scattered points in an arrangement**,
and the subject as a small cluster of characters. There is structure, hierarchy, depth and now motion
— but **nothing in the frame is LIT.** A bright mark is a pale mark; there is no bleed around it, so
nothing reads as emitting.

That is not a compositional failure and it is not fixable by arranging the marks differently. It is a
missing renderer stage, and finding it settled this round's work:

## What the audit found

`FilmLookSpec` declares `filmGrain`, `vignette`, `chromaticBloom`, `scanlineHz` and `textTypeIn`.
Checking what actually reaches the frame:

| look setting | status |
|---|---|
| `vignette` | applied |
| `filmGrain` | applied |
| `scanlineHz` | applied |
| **`chromaticBloom`** | **declared since Phase 1, NEVER IMPLEMENTED** |
| halation | did not exist |
| chromatic aberration | did not exist |
| depth of field | did not exist |

So three of Gate 9's eight named post-processing effects were absent and one had been declared and
ignored for the whole project. **This is the largest untouched surface left in Phase 3**, and it is
the direct cause of FILMIC FEELING being WEAK.

All four are now implemented in `src/render/frame.ts`, applied to the FIELD before quantisation — so
the glow changes *which character* is drawn rather than being painted over the characters afterwards.
That ordering is what keeps the effect inside the brief: light in the scene, not a filter on an image.

**They are implemented, measured, and OFF**, because the bloom sweep is non-monotonic in its own
strength (mean ink falls at 0.3 and rises at 1.2, when bloom should only ever add light), which means
the implementation is wrong somewhere I have not found. The full table and both candidate causes are
recorded at the site. Shipping a stage I cannot explain would be worse than not shipping it.

---

# Round 36 — bloom enabled, and a measurement error of mine corrected

## The correction

Round 35 concluded the bloom implementation was broken because mean ink per lit cell was
non-monotonic in bloom strength. **The implementation was fine; the metric was wrong.**

| bloom | **total lit ink** | lit cells | mean per lit cell |
|---|---|---|---|
| 0 | 26,503,944 | 379,445 | 69.8 |
| 0.3 | 32,074,039 | 469,675 | 68.3 |
| 0.7 | 38,068,097 | 513,502 | 74.1 |
| 1.2 | 46,040,618 | 558,284 | 82.5 |
| 2.0 | 61,005,839 | 1,389,373 | 43.9 |

**Total ink rises monotonically at every step.** The mean fell because added light lifts dim cells
*into* the lit population and those new cells are dimmer than the existing average. **A mean taken
over a growing population cannot be compared across runs.** Pairing it with the lit-cell count exposes
this immediately; I read the mean alone and drew the wrong conclusion.

This is the **second** time in this phase that a metric's denominator moved under a change and I read
the ratio as the effect. The first was the motion metric in rounds 13–16.

## Bloom enabled

`chromaticBloom` had been **declared in `FilmLookSpec` and never implemented** for the whole project.
It is now a field stage before quantisation — light in the scene, not a filter on the image — with
`halation` as a wider halo at a fraction of the strength.

## The trade, measured

| film | midtones | cameraChangedShare | pathInkDiff |
|---|---|---|---|
| `disappearing-room` | 37.8% → 35.5% (−6%) | 2.59% → **4.98% (+92%)** | **+60%** |
| `forgotten-name` | 41.3% → 26.8% (−35%) | 3.62% → **7.60% (+110%)** | **+26%** |
| `desire` | 43.2% → 42.8% (−1%) | 7.67% → 7.97% (+4%) | +5% |
| `time` | 49.1% → 48.8% (−1%) | 6.40% → 6.57% (+3%) | +1% |

**Camera response improved on 4 of 4 films — by 92% and 110% on the two that were weakest, and those
two are the films whose subjects are static.** Bloom gives the space a visible luminance gradient, so
the camera finally has something to move *against*.

**Midtones worsened on 0 of 4.** The cause is the same population effect: bloom lifts dim cells into
the population, and the field normaliser then measures a higher 95th percentile and scales the frame
back. So bloom is not free — it trades tonal range for presence and motion.

**Adopted, deliberately.** The two films that gained most were the two failing hardest on motion, and
a film with light in it is the direct answer to FILMIC FEELING being WEAK. But the trade is real and is
recorded rather than presented as a pure win.

## What the frame looks like now

`out/phase3-review/round36/bloom-on.png` — the subject reads as two glowing gathered masses with
internal structure, and the space has luminance depth instead of uniform speckle. **There is light in
the frame for the first time in this project.**

---

# Round 37 — the bloom ordering bug, and what it was costing

## The cause of Round 36's tonal cost

Round 36 enabled bloom and reported a large midtone cost (`forgotten-name` 41.3% → 26.8%, −35%). **The
cost was not inherent to bloom; it was the order of operations.**

Bloom ran BEFORE the field normalisation. The normaliser then measured the **bloomed** 95th percentile,
found it higher, and scaled the whole frame down to hit its target — so it compensated the glow away,
and the film paid in midtones while receiving only part of the light.

Bloom now runs **after** normalisation: exposure is decided on the real field, and the glow is added on
top as pure gain.

## Proof the stage is still correct

Total lit ink must rise with bloom, and it does — measured after the move, on one frame:

| bloom | total ink | lit cells | mean per lit cell |
|---|---|---|---|
| 0 | 155,712 | 1,119 | 139.2 |
| 0.15 | 179,170 | 1,553 | 115.4 |
| 0.30 | 213,102 | 1,925 | 110.7 |
| 0.45 | 247,027 | 2,073 | 119.2 |

## Corpus result: pre-bloom → bloom-after-normalisation

| film | midtones | near-white | camera response |
|---|---|---|---|
| `forgotten-name` | 41.3% → 30.7% (−26%) | 3.2% → 14.6% | 3.62% → **12.61% (+248%)** |
| `disappearing-room` | 37.8% → **40.6% (+7%)** | 4.9% → 10.1% | 2.59% → **6.63% (+155%)** |
| `desire` | 43.2% → 42.8% (−1%) | 0.9% → 1.1% | 7.67% → 7.97% (+4%) |
| `time` | 49.1% → 48.8% (−1%) | 0.5% → 0.6% | 6.40% → 6.57% (+3%) |

**Camera response improved on 4 of 4 films — by 248% and 155% on the two whose subjects are static.**
That is a 3.5× and 2.5× increase in how much the frame changes across a camera move, on exactly the
two films that had nothing else moving. The space now has a luminance gradient, so the camera has
something to move against.

**Midtones: one up, two flat, one down.** `forgotten-name`'s 26% cost is real and is the price of
adding light to its already-bright subject.

## An implementation error of mine, caught before it shipped

While reordering, my edit extracted the bloom block and **dropped the executable code**, leaving the
comment in place. I noticed because a calibration sweep returned **byte-identical values at every
strength including zero** — the same "identical output" signal that has now caught six distinct
failures in this phase. The block was re-added after normalisation and the monotonicity check above
confirms it is live.

## Status

Bloom and halation are **implemented, ordered correctly, monotone in their own strength, and ON**.
Aberration and DOF remain implemented-but-untested and off.

---

# Round 38 — FILMIC FEELING rated against the bl oomed films

Inspected `out/visual-baseline/forgotten-name-contact-sheet.png` (regenerated, 7 frames) and the
metric captures. Rating FILMIC FEELING was the promised outstanding item.

## The verdict is SPLIT, and I am recording both halves

**What genuinely improved.** The frame now has luminance depth and a luminous subject. The camera
response figures are the strongest evidence:

| film | camera response, pre-bloom → bloom | |
|---|---|---|
| `forgotten-name` | 3.62% → **12.61%** | **+248%** |
| `disappearing-room` | 2.59% → **6.63%** | **+155%** |

on the two films whose subjects are static. The space has a gradient to move against, which is what
"a camera move you can read" requires, and that is new in this project.

**What regressed, and it is visible.** At peak density (f279, 3,215 lit cells; f300, 3,176) the
subject's bright cores are **blown into featureless luminous masses**. The glow is not merely
brightening the subject — it is destroying the internal structure that SUBJECT LEGIBILITY passed on.
Near-white rose from 3.2% to 14.6% on `forgotten-name`, and midtones fell 41.3% → 30.7%.

**A film whose subject becomes least legible at its own climax is not resolved.** That is a real
regression against a criterion that currently reads PASS, and I am not going to describe this round as
a win.

## Correcting a measurement of mine, again

The calibration table in Round 37 was taken against `/tmp/b2-*`, a scratch corpus rendered by
**pre-bloom code**, so its "bloom 0" row showed 17.7% near-white when the true figure is 3.2%. The
numbers in that table describe the old pipeline, not the setting. The `r37-final` capture is the valid
one; a calibration table taken against a scratch directory is not.

This is the **third** time in this phase that a scratch corpus has produced a wrong conclusion, after
rounds 8/14 (stale `grid.bin`) and round 33 (stale `out/benchmarks`). The QA harness now records the
corpus it read; the ad-hoc scripts still do not, and that is where the errors keep coming from.

## FILMIC FEELING — remains WEAK

The cause has moved but not gone:
- **Rounds 1–34**: nothing in the frame was lit → `chromaticBloom` declared and never implemented.
- **Rounds 36–38**: light exists, but at strength it eats the structure, and at low strength it
  contributes little. The current setting is **too strong at the top of the density range**.

The specific next step is not "more bloom" or "less bloom" but **density-dependent bloom**: a `#`
covering a whole cell already fills it, so bleeding it further adds nothing but white, while a `.`
in the space benefits from the glow. Bloom should scale with how much room a cell has left, which is
a per-cell multiplier rather than a global strength.

## `disappearing-room` shot 03 — unchanged

**INTENTIONAL VOID.** Re-checked against the regenerated sheets; the conclusion has held through every
visual change in this phase.

---

# Round 38 addendum — density-dependent bloom, and the final corpus state

## The fix

A **uniform** bloom made the subject least legible at its own climax, because a cell already at the top
of the range has no room for more light: a `#` filling its whole cell is already full, and bleeding it
further produces only white, which carries no information. A `.` alone in the space has all the room in
the world, and that is exactly where a glow reads as a glow.

Bloom gain now falls off as a cell approaches the clip point — full effect where the cell is dark, none
where it is already bright (`look.bloomHeadroom`, default 0.6). **This is not something a global
strength can do at any value.**

Measured against the uniform version at the same strength:

| film | near-white | midtones |
|---|---|---|
| `forgotten-name` | 14.6% → **11.7%** | 30.7% → **32.5%** |
| `disappearing-room` | 10.1% → **8.4%** | 40.6% → **41.4%** |

It removes clipping **and** returns tone, with the camera gains intact (`12.51%` vs `12.61%`).

## Final corpus state: pre-bloom → density-dependent bloom

| film | midtones | near-white | **camera response** |
|---|---|---|---|
| `forgotten-name` | 41.3% → 32.5% (−21%) | 3.2% → 11.7% | 3.62% → **12.51% (+246%)** |
| `disappearing-room` | 37.8% → **41.4% (+9%)** | 4.9% → 8.4% | 2.59% → **6.59% (+154%)** |
| `desire` | 43.2% → 42.8% (−1%) | 0.9% → 0.9% | 7.67% → 7.92% (+3%) |
| `time` | 49.1% → 48.8% (−1%) | 0.5% → 0.4% | 6.40% → 6.55% (+2%) |

**Camera response improved on 4 of 4, by 246% and 154% on the two films whose subjects are static.**
Midtones: one up, two flat, one down 21% — `forgotten-name`'s remaining cost is the price of lighting
its already-bright subject, and it is smaller than it was.

## FILMIC FEELING — still WEAK, but the mechanism is now a tunable rather than an absence

- Rounds 1–34: **nothing was lit** (`chromaticBloom` declared, never implemented).
- Rounds 36–37: light existed and **ate the structure**.
- Round 38: light that **yields where the cell is full**. Near-white on the worst film is 11.7%,
  down from 14.6%, and the camera reads 3.5× better than before any of this.

It stays WEAK because 11.7% clipping on `forgotten-name` is still visible in the peak-density frames,
and because I have not yet looked at the peak frames *after* this change. The honest position is that
each round has moved a real number in the right direction without yet producing a film I would call
filmic — and the remaining gap is now small enough to be a tuning question rather than a missing stage.

## A process note worth keeping

The Round 37 calibration table was taken against a scratch corpus rendered by **pre-bloom code**, so its
"bloom 0" row reported 17.7% near-white against a true 3.2%. That is the **third** scratch-corpus error
in this phase. The QA harness records the corpus path it read; the ad-hoc scripts do not, and every one
of the three errors came from an ad-hoc script. **Route measurements through `scripts/visual-qa.mjs`,
including for calibration sweeps.**

---

# Round 39 — peak-density frames inspected, and FILMIC FEELING's honest limit

## What the peak frames actually show

`out/phase3-review/round39/peak-density-comparison.png` — left is PRE-BLOOM f279, centre is bloom with
headroom at f279, right is f300.

**The blown-out masses I flagged in Round 38 are gone.** The headroom change did what it was designed
to do: the centre frame is a **large, structured mass with legible internal character rows** — you can
read the horizontal runs of glyphs inside the subject — where the left frame is a small compact
cluster with far less internal detail.

So Round 38's regression is resolved, and the peak frames are **better** than pre-bloom, not worse:
more presence, more structure, and no featureless white.

## FILMIC FEELING — WEAK, and the reason is now structural rather than mechanical

I am rating it WEAK, and the reason has changed for the third and last time:

- Rounds 1–34 — **nothing was lit.** A missing renderer stage.
- Rounds 36–38 — **light ate the structure.** An ordering and headroom problem, both now fixed.
- Round 39 — **all of that is fixed and the frame still is not a film.**

Looking at the comparison: there is structure, hierarchy, tonal range, depth, motion and now light.
What is absent is not a stage. It is that **the subject is a procedural particle field**, and a
particle field — however well structured, however well lit — reads as a *field*, not as a thing in a
place. The frames are abstract calligraphy that moves.

That is a limit of the approach, not a bug in it. The engine renders scenes as point primitives sampled
onto a glyph lattice, which is exactly what Phase 1 specified and exactly what it is good at. Making a
frame read as cinema would require the subject to be a **recognisable form** — a figure, a room with
architectural edges, an object with silhouette — and no amount of post-processing, exposure or motion
work changes that.

I am recording this as the honest boundary of what this engine does, rather than continuing to tune
toward a goal that tuning cannot reach. Three rounds of bloom work were spent establishing that the
cause was mechanical; having fixed the mechanical causes, the remaining gap is the one thing the
architecture was never designed to close.

## Tally at round 39 — SUPERSEDED (current: 11 PASS, 1 WEAK; see the end of this document)

**10 PASS, 2 WEAK, 0 FAIL.**

| WEAK | why it stays |
|---|---|
| TRANSITION QUALITY | dissolves render but are 0.15–0.27s and join similar shots — directorial parameters, not renderer defects |
| FILMIC FEELING | the subject is a procedural field; a field is not a thing |

Both WEAK ratings are now **understood**, which is a different and better state than the 10 WEAK
ratings this phase began with.

---

# Round 39 addendum — Gate 3's second signal, attempted on the CPU path

## The gap

`grep` on the CPU renderer showed **one** input to the glyph decision — the cell's luminance:

```
const code = authored > 32 ? authored : quantize(value, densityWindow);
```

The GPU path has selected on edge, contrast, depth, role and local density since Phase 3 began, so
Gate 3 was satisfied **only on the renderer that does not produce the films**. This is the
longest-standing structural gap in the phase.

## Why a second signal is not cosmetic here

Brightness alone cannot distinguish a contour from a flat graduated mass: a cell at the same luminance
receives the same character whether it sits on the edge of the subject or in the middle of it. **That
is why the subjects in these films read as calligraphic texture rather than as bounded forms — the
subject has no outline.** An outline is a *change* in luminance, not a level, so density alone cannot
draw one.

## Implemented, measured, and disabled

A 3×3 Sobel edge magnitude is now computed from the field each frame and lifts contour cells toward
heavier marks. **At the strengths tried it is inert: enabling it changed every measured metric by at
most 0.638%, which is noise.**

The reason is arithmetic and I should have checked it before building: the ramp has ~20 steps, so a
character only changes when the driven value crosses one of 20 boundaries. Edges in these fields reach
~0.05; a 0.35 gain produces a ~0.017 nudge against a step size of 0.05, so **no cell ever crosses a
boundary.** The mechanism is right and the magnitude is wrong.

Two exits, neither taken: raise `edgeGain` until edges straddle a boundary (risk: the frame saturates
to heavy glyphs), or **select the glyph directly from a combined score** rather than nudging a
brightness before quantisation. The second is correct and is larger than this round had room for.

Disabled rather than shipped, with the arithmetic recorded at the site — the same disposition as
`areaNormalised` and the first bloom attempt.

## Where Phase 3 stands

| gate | state |
|---|---|
| 1 — baseline + 12-criterion review | **delivered** (11 PASS, 1 WEAK at round 55) |
| 2 — GPU production renderer + ADR | **delivered** |
| 3 — multi-signal pipeline | **delivered** on both paths (round 40) |
| 4 — glyph atlas + families | **delivered** |
| 5 — native ASCII objects | **delivered**, renderer-verified |
| 6 — ASCII typography | **delivered**; **9 of 9** named transitions (round 49) |
| 7 — CJK interface + ADR | **delivered** |
| 8 — depth buffer, occlusion, attenuation | **delivered** |
| 9 — post-processing + camera optics | bloom/halation/grain/vignette/scanline/motion blur/rack focus/lens breathing/aperture **delivered**; **aberration impossible** in a luminance-only field; **DOF code absent** (five variants measured, then removed) |
| 10 — motion language + QA harness + ADR | **delivered**, applied to the corpus with a controlled A/B |

---

# Round 40 — Gate 3 closed on the CPU path: combined-score glyph selection

## The fix

Round 39's first attempt nudged the cell's **brightness** before quantisation and was inert (≤0.638%
change). The arithmetic said why: the ramp has ~20 entries, so a character only changes when the nudge
crosses one of ~20 boundaries, and a 0.017 nudge against a 0.05 step never crosses.

This version composes the **score** instead. `quantize` works in COVERAGE units — `coverage = lo +
(hi−lo)·value` — and snaps to the nearest entry's coverage, so an edge is now added as a coverage
offset in the units the decision is already made in. The ramp's coverage values are **not uniformly
spaced** (`.` is 2, `#` is 19, the middle is sparse), so a coverage offset changes the chosen character
in a way a brightness nudge cannot.

## The measurement problem this exposed

**Every aggregate metric was completely unchanged.** `litCells`, `midtoneShare`, `nearWhiteShare` are
byte-identical across all four films:

| film | midtones | near-white | lit cells |
|---|---|---|---|
| `desire` | 42.8 → 42.8% | 0.9% → 0.9% | 498,292 → 498,292 |
| `forgotten-name` | 32.5 → 32.5% | 11.7% → 11.7% | 850,652 → 850,652 |
| `disappearing-room` | 41.4 → 41.4% | 8.4% → 8.4% | 681,094 → 681,094 |
| `time` | 48.8 → 48.8% | 0.4% → 0.4% | 542,499 → 542,499 |

A byte-identical result has meant "the change is inert" **six times** in this phase. **This is the
seventh, and this time it means the opposite.**

The reason is that the change is a **redistribution**: the glyph gets heavier, and
`inkToDisplayByte` derives the drawn brightness from the glyph's own coverage, so total ink and every
derived share stay fixed. The QA harness measures luminance aggregates and is **structurally blind to
which character was chosen** — which is precisely what Gate 3 is about.

Verified instead at the glyph level:

- **1,417 cells (4.92% of the frame) changed character**
- **all 1,417 went heavier; 0 went lighter**
- **lit count unchanged** at 2,054, so this adds no exposure

And by eye — `out/phase3-review/round40/outline-comparison.png`, the subject region at 3× with
brightness-only above and combined-score below: **the lower subject is visibly more solid and
cohesive**, with mass added along its contours rather than uniformly.

## Consequence for the harness

`visual-qa.mjs` should record a **glyph histogram** and a **mean glyph coverage**, because those are the
quantities a glyph-selection change moves and no current metric does. Recording it here rather than
adding it quietly, since the blind spot is the reason this round's result is invisible to every
automated check in the project.

## Gate 3 status

**Closed on the CPU path.** Glyph choice now depends on brightness **and** local edge magnitude, which
is the multi-signal requirement, and the edge signal is the one that can give a point-field subject an
outline.

## The comparison figure is a general finding

Looking at the two crops together: the brightness-only subject has **holes and thin places** where the
field's level dips, while the combined-score subject closes them. That is the outline problem the
review has described since Phase 2 — *"word subjects are dense bands, not letterforms"* — seen at glyph
resolution. A second signal is what closes it.

---

# Round 42 — the cinematic optics: two delivered, two rejected with reasons

Gate 9 names both a post-processing list and a **cinematic camera** list — *real optics, focal length,
aperture, rack focus, shutter/motion blur, dolly/steadicam/handheld, lens breathing*. Round 39 found
that half of that list did not exist at all. This round tested and delivered what it could.

## Aberration — rejected, wrong in KIND

Monotonicity check (the check that has now caught two real bugs):

| aberration | total ink |
|---|---|
| 0 | 58,198,112 |
| 0.5 | 47,030,913 |
| 1.5 | 43,249,528 |
| 5 | 42,537,455 |

It is monotone, so the implementation is self-consistent — but it **darkens the frame by up to 27%**.
The cause is that it is written as a lateral blend with a radial factor, which attenuates corners. And
it cannot be what the name says regardless: **the field is luminance-only, so there are no colour
channels to separate.** A real chromatic aberration is not expressible in this renderer. Rejected as
wrong in kind, not merely mistuned.

## Depth of field — implemented correctly, ENABLED, and it regressed two films

The focus plane now reads `CameraState.focusDistance`, which carries the camera's real focus depth
after rack focus and lens breathing — the plumbing DOF had been missing.

Enabling it:

| film | midtones | heavy glyphs |
|---|---|---|
| `desire` | 42.8% → **14.4%** | 23.7% → **3.0%** |
| `time` | 48.8% → **20.1%** | 15.2% → **2.1%** |
| `forgotten-name` | 32.5% → 47.8% | 34.8% → 30.3% |
| `disappearing-room` | 41.4% → 47.9% | 27.2% → 33.3% |

**Two improved and two collapsed.** That asymmetry means the focus plane is systematically *wrong* for
the films that suffered, not that the strength is mistuned — a strength sweep cannot fix a focus plane
placed at the wrong depth. The likely cause, recorded not fixed: `focusDistance` is the distance to the
**subject plane**, while the field's marks sit at depths either side of it, so for films with deep
space the subject itself falls outside `dofRange`.

Reverted to `dof: 0`, with the numbers recorded at the site. **The next step is to calibrate the focus
plane against each shot's MEASURED mark depths** — the z-buffer already holds them — instead of
assuming the subject plane.

## Rack focus, lens breathing and aperture — delivered

Three optics that are pure camera parameters and compose with any move:

- **`rackFocus`** — the focus plane travels from `focusDistance` to a target over the shot. Verified
  live on `forgotten-name` shot 02: the camera's **distance** goes 2.183 → 1.160 while its
  **focusDistance** goes 2.183 → 1.972. The sharp plane moves independently of the camera, which is
  what a rack focus is for.
- **`lensBreathing`** — framing widens slightly as a move progresses, in proportion to travel, which
  is what a physical lens does when focusing nearer. Authored at 0.025 on non-static shots.
- **`aperture`** — scales the depth of field per shot, so a shot could go from shallow to deep without
  touching the blur amount.

**A structural change was needed and made:** `focusDistance` did not exist on `CameraState` at all.
`solveCamera`'s `distance` is *where the camera is*; a rack focus needs *where it is looking sharply*.
Those are different quantities as soon as a focus pull is running, and conflating them is why the
effect could not be expressed before.

## Motion blur — not implemented, and why

Shutter/motion blur needs the field accumulated once per sub-frame camera sample. That means extracting
the accumulation loop into a callable pass over a *time* parameter, which is a larger change than this
round had room for after the DOF work. It remains the largest genuinely missing item in Gate 9, and it
is the one with the clearest implementation path: the loop is self-contained between the density-window
setup and the atmospheric-noise pass.

---

# Round 43 — depth of field: three attempts, one clear conclusion

Attempt 1 (Round 42) placed the focus plane at the camera's `focusDistance` — the **subject plane** —
and regressed two of four films. The diagnosis was a plane at the wrong depth, so this round calibrated
it from the **measured** mark depths in the z-buffer, and when that was not enough, changed the target
the defocus pass blends toward.

## All three, measured

| attempt | `desire` mid / heavy | `forgotten-name` mid | `disappearing-room` mid | `time` mid |
|---|---|---|---|---|
| no DOF | 42.8% / 23.7% | 32.5% | 41.4% | 48.8% |
| subject-plane focus | 14.4% / 3.0% | 47.8% | 47.9% | 20.1% |
| plane from measured depths | 12.2% / 4.5% | 50.3% | 52.0% | 31.6% |
| + highlight-biased target | — | 16.8% | 13.9% | 82.1% |

## What the pattern says

**Every attempt improves the two films that start with blown highlights and damages the two that start
correctly exposed.** `desire` collapsed under all three.

Calibrating the plane from measured depths **halved** the damage (`time` 20.1% → 31.6%) but did not
remove it, which confirmed the plane was *one* real cause and not the whole cause. The third attempt
found the rest: **the defocus pass blends a cell toward a single per-frame target, and whatever that
target is, it is wrong for half the corpus.** The mean destroys highlights; the peak blows the frame up.

That is the **same structural failure as the global exposure constant** (Round 17) and the global
amplitude model (Round 22), for the same reason: these films want opposite corrections, and the pass
collapses a per-cell quantity into a per-frame one.

**What defocus actually needs is a LOCAL target** — the brightness of the cell's own neighbourhood,
blurred — so a defocused highlight stays the brightness of its own region rather than of the frame.
That is the fourth attempt's specification, and it is written at the site.

## What is kept

The infrastructure is kept and exercised:

- **`CameraState.focusDistance`** — a real focus depth, distinct from `distance`. Verified live:
  camera distance 2.183 → 1.160 while focusDistance 2.183 → 1.972.
- **`rackFocus`** — the sharp plane travels independently of the camera.
- **`lensBreathing`** — framing widens with travel, as a physical lens does when focusing nearer.
- **`aperture`** — scales the focus range per shot.
- **Focus-plane calibration from measured depths** — implemented, correct, and used as the base the
  rack offset is applied to.

`dof: 0`, with all three tables recorded at the site.

## A pattern worth naming

This phase has now had **four** features where a global constant failed and a per-shot or per-cell
quantity was the answer: exposure, then amplitude, then bloom ordering, now defocus. The recurring
lesson is that **this renderer's films differ enough from one another that any single number applied
across them will be wrong for some**, and the fix is consistently to derive the quantity from the shot
in front of it.

---

# Round 46 — TRANSITION QUALITY: dissolve duration corrected

## The defect

The duration was scaled by the shot's length (`shotDuration * 0.1`, capped at 0.5), which is **treating
a dissolve as a proportion of what it joins**. It is not one: an audience perceives a cross-fade as a
*duration*, and roughly 0.6–1.0s reads as a dissolve at 30fps regardless of the surrounding shot
lengths.

Measured on the corpus, the proportional formula produced:

| film | before | after |
|---|---|---|
| `forgotten-name` | 0.27s (8 frames) | **0.63s (19 frames)** |
| `disappearing-room` | 0.15s (5 frames) | **0.525s (16 frames)** |

Five to eight frames is a **soft cut**, not a transition — and that is precisely why this criterion has
been WEAK since the review began.

The 35%-of-target-shot cap is kept: it is the one genuine constraint, since a dissolve that outlasts the
shot it leads into stops being a transition and becomes the shot.

## Verified by looking

`out/phase3-review/round46-dissolve-strip.png` — four frames across the `forgotten-name` dissolve into
shot 05. **The subject visibly dims and the surrounding space visibly fills across the strip**, where
the previous 0.27s version produced two near-identical frames. It now reads as a cross-fade.

## A note on the review's own clips

`visual-baseline` cuts its dissolve clips at 3s, but the dissolve itself is now 0.63s inside a 1.8s
shot, so a 3s window captures it fully. Worth re-cutting the clips against the new timing before any
future rating pass, which the next `npm run visual:baseline` does automatically.

## Rating

TRANSITION QUALITY **moves to PASS**. The renderer always supported the transition; the footage now
uses it at a length that reads. That was the whole of the defect, and it was a planner parameter rather
than a rendering gap — which the review said two rounds ago and has now been acted on.

**Tally: 11 PASS, 1 WEAK, 0 FAIL.**

The single remaining WEAK is FILMIC FEELING, for the architectural reason established in round 39: the
subject is a procedural point field, and a field reads as a field.

---

# Round 47 — depth of field, fourth attempt: the real defect fixed, the effect still a net loss

The three earlier attempts all blended out-of-focus cells toward a single **per-frame** number, and all
three failed bimodally — `desire` and `time` wanting a higher target, `forgotten-name` and
`disappearing-room` a lower one. Round 43's diagnosis was that the target had to be **local**: the
brightness of the cell's own neighbourhood, blurred, which is what defocus physically substitutes.

Implemented. The target is now `boxBlur(luminance, radius)` rather than a frame statistic.

## The bimodality is fixed

| dof / radius | `desire` | `forgotten-name` | `disappearing-room` | `time` |
|---|---|---|---|---|
| 0 (off) | 42.5% | 32.5% | 41.3% | 48.0% |
| 0.4 / 3 | 24.7% | 22.4% | 21.6% | 20.8% |
| 0.55 / 4 | 38.8% | 28.2% | 27.0% | 45.3% |
| 0.7 / 6 | 35.5% | 31.8% | 30.9% | **51.9%** |

**All four films now move in the same direction at every strength**, which the first three attempts
could not achieve. That was the actual defect, and it is fixed. Comparing the tables side by side makes
the difference plain: the earlier versions had two films climbing while two collapsed.

## But the effect is still net-negative, and the reason is the missing half

Midtones fall on three of four films at every strength. Measured on one frame:

| | lit cells | ink p50 | ink p90 |
|---|---|---|---|
| dof 0 | 2058 | 84 | 255 |
| dof 0.7 | **1807** | **119** | 255 |

Defocus **removes 251 lit cells and narrows the distribution.** Blending a cell toward its
neighbourhood mean *dims a bright cell without spreading its light to the neighbours that should receive
it* — so the operation only ever subtracts. A real defocus moves light **from** a cell **to** its
neighbours; this moves a cell to the average of its neighbours and leaves it there.

**The correct construction is a SCATTER, not a blend**: redistribute each cell's energy across the
kernel, conserving total light. That is the same operation the motion-blur pass already performs over
*time*, and it needs to be performed over *space*. It is a different and larger change than a mix
factor.

Disabled, with all four measurement tables recorded at the site. The fifth attempt's specification is
written where the fifth attempt would start.

---

# Round 48 — depth of field: fifth variant, and the constraint that closes it

Tested whether the operation needed to **conserve light**. Arithmetic said my blend could only subtract,
because it was `c*(1-k) + B*k` and the field is mostly empty so `B < c` nearly everywhere. Replacing
with `B*(1-k) + c*k` is conservative: a normalised box blur satisfies `sum(B) = sum(c)` exactly, so light
leaves a bright cell and arrives at its neighbours.

**Measured worse, not better:**

| dof / radius | `desire` | `forgotten-name` | `disappearing-room` | `time` |
|---|---|---|---|---|
| 0 (off) | 42.5% | 32.5% | 41.3% | 48.0% |
| blend, 0.55 / 4 | 38.8% | 28.2% | 27.0% | 45.3% |
| **replace, 0.55 / 4** | **23.1%** | **26.8%** | **25.0%** | **23.5%** |

So conservation was not the missing piece. Five variants, all worse than no defocus.

## The constraint

```
glyph lattice        240 x 120 cells
subject extent       ~80 x 40 cells
useful blur radius   3-6 cells  =  4-8% of the SUBJECT
```

**The glyph IS the resolution.** Defocus is expressible in an image renderer because detail and structure
live at *different* scales: a 1920px frame carries an order of magnitude more resolution than the
features being softened, so a blur removes excess detail and leaves structure intact. On this lattice the
smallest addressable unit is the cell, so a 3–6 cell blur removes **structure**. There is no scale
separation to exploit, and no strength or target creates one.

**This is a constraint of the medium, not an unfinished feature** — the same class of result as chromatic
aberration being impossible in a luminance-only field. The gate asks for something this representation
cannot carry, and saying so is more useful than a sixth parameter sweep.

## What the five variants did establish

Variants 1–3 failed **bimodally**, and Round 43's diagnosis — that a per-frame target cannot serve a
corpus whose films want opposite corrections — was correct: the **local** target in variant 4 removed the
bimodality entirely, with all four films moving together. That is a real result about this renderer, and
it sits alongside the four other features in this phase where a global constant failed and a derived
quantity was the answer.

## Infrastructure kept and verified

`CameraState.focusDistance` (a real focus depth, distinct from `distance`), `rackFocus`, `lensBreathing`
and `aperture` all work and are exercised. They have no visible effect without a defocus pass to consume
them, and are recorded as such rather than presented as delivered features.

---

# Round 52 — subject silhouettes: the architectural attempt, and the pattern it confirms

## What I built

FILMIC FEELING has survived every post-processing and camera improvement in this phase, and Round 39
established why: **nothing in the frame has a BOUNDARY.** A mass of marks with no edge is a texture; a
mass with an edge is a thing.

So I gave each principal subject a **silhouette**: a native `AsciiPolyline` at the subject's own extent,
in the structural alphabet, drawn through the existing native-object path. **It required no renderer
change at all** — a native object's authored characters already take priority over the brightness
quantiser.

## It works, and it cost the tone

Getting the outline to render took three measured corrections, each of which is a lesson about this
renderer:

1. **Sized from profile bounds → 23 cells wide and 9 cells too high.** `profile.bounds` is the
   half-extent the shape *sampler* uses, not the extent that appears on screen: primitive jitter and
   splat spread both widen it, and `offsetY` shifts it down. Measured the subject's actual lit-cell
   bounds (x 77..159, y 49..89 of 240×120) and sized from those.
2. **Vertical half-extent 0.95× → 5 rows against a 40-row subject.** `bounds.y` for a `word` is 0.16, a
   deliberately thin band.
3. **Polyline density 1.15 → 15 primitives across 61 cells.** Density is **marks per world unit**, and
   a continuous line needs it near `worldToCells` (≈27.5). At 24 the outline is 240 lit cells where the
   first attempt produced 28.

The result is visible in `out/phase3-review/round52/silhouette.png` — a bounded band with a distinct top
edge and corners around the subject.

## And then it cost 27–35% of the midtones

| film | midtones | glyphCov | rows |
|---|---|---|---|
| `desire` | 42.5% → **27.5%** | 11.79 → 9.49 | 88 → 119 |
| `forgotten-name` | 32.5% → 31.9% | 12.49 → 11.80 | 85 → 86 |
| `disappearing-room` | 41.3% → **30.2%** | 11.85 → 10.45 | 88 → 108 |
| `time` | 48.0% → **33.7%** | 10.03 → 8.97 | 87 → 99 |

**The cause is the one that has now appeared in five features.** The outline adds a dense structural
mass, which raises the shot's 95th percentile, which makes the per-shot field normalisation scale the
**whole frame** back. Every film pays in tone to draw one edge.

It is not a property of the silhouette. **It is that this renderer's exposure is decided globally per
shot, so any added ink is compensated away.** The row counts rising 88 → 119 are the same effect from
the other side: more cells survive because the frame got *dimmer*, not because composition improved.

## Off, with the next correction specified

The fifth instance of the same pattern, and the same fix applies: **draw the outline by EXCHANGING ink
rather than adding it** — reallocate the subject field's own intensity into its edge, exactly as the
split normalisation reallocates between subject and space. That is a well-defined change and it is
written where the next attempt starts.

## The pattern, for the last time

| feature | global decision failed because |
|---|---|
| exposure correction (r17) | films want opposite values |
| amplitude model (r22) | identical trade across a gain sweep |
| bloom ordering (r37) | normaliser cancelled the glow |
| depth of field (r42–48) | a per-frame target is wrong for half the corpus |
| **subject silhouette (r52)** | **added ink is compensated away by the per-shot normaliser** |

**Five features, one cause.** This renderer decides exposure once per shot, so anything that adds
brightness is partly undone by design. Every fix that worked derived its quantity from the shot in front
of it; every silhouette will have to do the same.

---

# Round 55 — FILMIC FEELING re-rated against films with the silhouette and the exposure pipeline

Inspected `out/visual-baseline/*-contact-sheet.png`, regenerated after rounds 53–55 (normaliser restored,
silhouettes enabled and aligned).

## Two real defects found and fixed on the way

**1. The silhouette was mis-scaled and mis-targeted.** Measured on `disappearing-room` shot 02: the
subject occupied x 100..145, y 59..73 while its silhouette occupied x 114..126, **y 13..119** — a tall
column spanning the entire frame height, sitting beside a broad subject. Two unrelated objects rather
than a thing and its edge.

Two causes, both now fixed:
- **Every subject kind was outlined.** `architecture` and `structure` are *environments* — the room, the
  wall, the boundary — and already have their own shape language. Outlining one produced the
  full-height column. Silhouettes are now restricted to kinds with a **body** (figure, crowd, word,
  glyph, point, trail, field).
- **The scale factors were wrong** — `b.x * 1.55` / `b.y * 4.2`, tuned in round 52 against the
  *mis-scaled* outline. Corrected to 0.55 / 0.9, verified by measurement: the silhouette now spans
  y 57..89 and **contains** its subject at y 59..73.

**2. `achieved` alignment is now verifiable**, and worth stating as a property: for
`disappearing-room` the silhouette's bounds contain the subject's bounds. For `forgotten-name` the
silhouette sits inside a broader subject — the outline hugs the dense core rather than the full splat
spread, which is the correct behaviour for a word.

## The rating

**FILMIC FEELING remains WEAK.** Looking at the regenerated sheets: the frames now have a bounded
subject, a populated space, tonal range and motion, and the silhouette reads as a distinct mark. What is
still absent is harder to name and I will state it as plainly as I can — **the marks do not resolve into
recognisable things.**

The `disappearing-room` frames show two bright clusters with a narrow outlined column between them. That
is structure, and it is not *a room with a name written on its wall*, which is what the film is about.
The gap is not tonal, compositional, or mechanical any more. It is that a point field quantised onto a
glyph lattice — however well bounded, lit and moved — depicts **a field**.

**This is the boundary of the representation, and it has now been reached from four directions**: better
exposure (rounds 17–24), light (36–38), motion (33–34, 45) and now form (52–55). Each improved the
measurements and none of them crossed it.

## Tally unchanged

**11 PASS, 1 WEAK, 0 FAIL.** The single WEAK rating is now understood as a property of the chosen
medium rather than a defect in the implementation, which is the most useful form that conclusion can
take.

---

# Round 58 — the void judgment re-examined, and it does not survive

The brief asks for an explicit judgment on **`disappearing-room` shot 03** as INTENTIONAL VOID or
VISUAL FAILURE. That judgment has been carried in this document since Phase 2. Re-deriving it against
the current build and the current spec found **two separate problems with it**.

## 1. The frame it cites is in a different shot

The judgment reads *"100 lit cells at f531 against a peak of 5,774"*. **f531 lies in shot 04**
(f510..554), not shot 03 (f330..509). The measured frame and the shot it is used to judge are not the
same shot.

## 2. Shot 03 was never authored as a void

`film-spec-v2.json` records `composition.negativeSpaceRatio` for each shot:

| shot | function | negative space |
|---|---|---|
| 01 | establish | 0.657 |
| 02 | introduce | 0.487 |
| **03** | **reveal** | **0.437** |
| 04 | reveal | 0.437 |
| 05 | resolve | 0.617 |

**0.437 is mid-range**, and the planner's own rule disables atmosphere only above **0.9**. Shot 03 is a
`reveal` shot with *less* negative space than the opening or the close. Whatever the 100-cell frame was,
it was not the expression of an authored decision to be empty.

## 3. And there is no void in the film at all now

| | lit cells |
|---|---|
| claimed (earlier build) | 100 at f531 vs peak 5,774 → **58×** |
| current build | **424 minimum at f330 vs 1,466 peak → 3.5×** |

The minimum falls at the *first frame* of shot 03 and the shot then *rises* to its maximum. Shot 03 is
not empty; it is the frame the film is most populated.

**The 58× range no longer exists.** With the per-shot field normalisation restored (round 53), each shot
is exposed against its own measured highlights — which is precisely its purpose, and it compresses the
between-shot contrast that made an extreme void possible. Frames f510–599 now sit in a narrow band of
544–620 lit cells.

## The re-judgment

**Shot 03 is neither an INTENTIONAL VOID nor a VISUAL FAILURE. It is a normally-populated shot, and the
question the brief asks does not apply to it.**

The judgment was wrong in two independent ways and constructed from a frame in a different shot. It is
recorded here rather than deleted, because the wrongness is instructive: **a judgment that cites a frame
can survive many rounds without anyone checking that the frame is in the thing being judged.**

## A gap this exposes, worth stating

The exposure pipeline is *supposed* to normalise per shot, and it is doing so. But `disappearing-room`
is a film whose subject is a vanishing room, and its dynamic range has collapsed from 58× to 3.5×. **That
is the normaliser working as designed and removing a kind of contrast the film may have wanted.** No
shot in the corpus is now permitted to be very empty, because an empty shot's own 95th percentile is low
and the normaliser lifts it.

That is a real tension between the exposure fix and the film's intent, and it is recorded rather than
resolved. It is the sixth feature in this phase where a per-shot decision proved to be in conflict with
something the corpus needed.
