# ADR 0003 — The motion language and the visual QA harness

**Status:** accepted · **Date:** Phase 3, round 32

## Context

Phase 3 gate 10 asks for two things: a **motion language** (anticipation, overshoot, settle,
follow-through, easing families, stagger) and a **visual QA harness** with per-metric measurements
and before/after comparison.

Both were absent. Easing was five curves — `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeOutExpo`
— which can express *accelerate*, *decelerate*, or *both*, and nothing else. And every visual
judgement in this phase was made with ad-hoc scripts whose failures cost whole rounds.

## Part 1 — the motion language

### Easing families (`src/domain/schema.ts`, `src/core/easing.ts`)

Nine cinematic curves added alongside the original five: `easeInCubic`, `easeOutCubic`,
`easeInOutCubic`, `easeInQuart`, `easeOutQuint`, `easeOutBack`, `easeInOutBack`, `easeOutElastic`,
`easeOutBounce`.

**The contract is what matters: every easing is a pure function of a 0..1 progress with `f(0) = 0`
and `f(1) = 1` exactly.** That is what makes them substitutable for one another without any caller
changing, and it is asserted for all fourteen curves in `tests/motion/language.test.ts`. The
original five are additionally **pinned to literal values**, because the frozen Phase 1 film is
byte-locked against them.

`easeOutBack` overshoots to 1.10 and `easeOutElastic` to 1.37 — both deliberately non-monotone, and
the tests assert that the monotonicity check *excludes* them, since testing them for monotonicity
would be testing that the feature is absent.

### Composable primitives

Three functions express what no easing curve can, because they are not shapes of progress:

- **`anticipate(base, t, amount, window)`** — the wind-up. A subject pulls *back* before it goes.
  This is the strongest available cue that motion was intended rather than computed.
- **`stagger(base, t, index, step)`** — a per-item delay, so a group does not move as one object.
- **`settle(t, base, amplitude)`** — a decaying wobble for follow-through that is not an easing
  choice.

All three preserve `f(0) = 0` and `f(1) = 1` for every parameter, so they compose with any base
curve and cannot leave a move unfinished.

**A real bug was caught by the `settle` test.** The first implementation used
`sin(cycles * 2pi * x)`, whose first zero crossing lands at x = 0.2; the excursion was therefore
**larger late in the move than early** — the opposite of settling. The test asked whether the
deviation at 0.2 exceeded that at 0.7 and got `0.0000 > 0.0036`. The envelope is now
`(1-x)^2 * sin(pi * x^0.4)`, which peaks at x ≈ 0.1 and decays monotonically.

### Status and limitation

**The vocabulary exists, is tested, and is not yet used by the films.** The camera planner still
emits the original five easings, and the corpus is unchanged. This ADR therefore records an
*available* language, not an applied one — and the films were deliberately not re-authored in the
same round, because changing the corpus and the harness that judges it simultaneously would make
both unreadable.

## Part 2 — the visual QA harness (`scripts/visual-qa.mjs`)

### What it is for

Every visual decision in this phase was judged by ad-hoc measurement, and the failures were not
random:

| round | error | cost |
|---|---|---|
| 13–16 | a motion metric that fell automatically when the image dimmed | four rounds chasing a regression that did not exist |
| 28–29 | clip windows hardcoded to a shot whose camera was `static` | motion declared dead; the real figure was 25× higher |
| 8, 14 | measurements taken from a stale `grid.bin` | false conclusions twice |

A harness makes those mistakes *visible* rather than invisible.

### Design

- **Records provenance with every number.** Each capture stores the `grid.bin` sha256, the frame
  count, and — critically — the `measuredWindow` (which shot, which camera kind, which frame range)
  that produced the motion figures.
- **REFUSES to compare runs whose measured windows differ.** Verified by tampering with a capture's
  shot id: the harness exits 1 with
  `REFUSING: desire measured different shots (04/push-in vs 99/push-in)`. This is the single guard
  that would have prevented the rounds 28–29 error.
- **Never assumes shot 2.** It finds the first shot whose camera kind is not `static`. The corpus is
  not uniform in this respect and assuming otherwise is what went wrong.
- **Directional verdicts.** Metrics carry a notion of which direction is better, so a comparison
  prints `+`/`-` per metric; metrics with no defined direction are left blank to be judged by eye.
- Ten metrics per film: coverage, mean ink, near-white share, midtone share, structural-glyph share,
  distinct glyphs, ink p10/p50/p90, mean rows occupied, and camera-move response (both mean ink
  difference and changed-pixel share).

### Verification

Truth-tested, not just run: a self-comparison reports no deltas; a tampered capture is refused with
exit 1; and a capture with one film's midtones raised 20%, near-white cut 40% and rows halved reports
`+ nearWhiteShare`, `+ midtoneShare`, `- meanRowsOccupied` with correct signs.

## Consequences

- The motion vocabulary is available to the camera planner and to native ASCII objects, and is
  covered by tests.
- Future visual changes can be measured against a recorded baseline in one command, with the
  provenance to know whether the comparison is legitimate.
- **The films are unchanged by this ADR.** Applying the new easings to the corpus is the next step,
  and the harness now exists to judge it.

---

## Addendum — the motion language applied to the corpus, and two measurement failures it exposed

Round 33 applied the vocabulary to the films. The **controlled A/B** (see below) produced a result no
previous measurement could have.

### Failure 1 — the harness could not see an easing change

The first comparison reported **byte-identical metrics on all four films**. The cause is structural,
not incidental: **every easing satisfies `f(0)=0` and `f(1)=1`, so the endpoints of a move are
identical whatever curve drives it** — and the harness compared only the FIRST and LAST frame of the
move. It was measuring precisely the two frames an easing is guaranteed not to change.

Fixed by measuring the **path**: ink at 8 sample points across the move, yielding three figures.

| metric | what it answers |
|---|---|
| `cameraInkDiff` / `cameraChangedShare` | does the move arrive anywhere (endpoint) |
| `pathInkDiff` / `pathChangedShare` | is there motion to watch (mean consecutive step) |
| `pathPeakInkDiff` | is there a moment that reads (largest single step) |

### Failure 2 — a stale corpus

With the path metric in place, three films still measured as unchanged. The cause was mine: a scratch
render script wrote to a private directory while the harness read `out/benchmarks`, so a fresh
capture was being compared against a **stale corpus**. I reported "no effect" from that comparison
before checking which files the harness was actually reading — the same stale-input class of error
that has now cost this phase four separate rounds.

Fixed by making the corpus path explicit (`VISUAL_QA_BENCH`), which also made a genuine A/B possible
for the first time.

### The A/B itself

Render the same films twice with one variable changed — old easings and no anticipation versus the new
ones — into two directories, and compare.

| film | pathInkDiff | cameraChangedShare (endpoint) |
|---|---|---|
| `forgotten-name` | **+62.5%** | **+43.7%** |
| `disappearing-room` | **+33.3%** | +15.1% |
| `time` | **+9.9%** | +0.5% |
| `desire` | −10.4% | +0.3% |

**Improved on `pathInkDiff` for 3 of 4 and on the endpoint measure for 4 of 4.** `desire` is the
exception and is not defended: it has the longest moves and its `transform` shot now uses
`easeInOutBack`.

### `easeInOutBack` for dollies: tried and rejected, with the reason measured

The first version gave `push-in`/`pull-out` the overshoot curve. It helped cranes and push-ins and
hurt two films. The cause, measured on `disappearing-room`'s pull-out, was a **mid-move dead zone** —
the overshoot means the curve passes the same progress value twice, so the camera nearly stops:

```
frame delta in camera distance, easeInOutBack:  0.079  0.079  0.041  0.021  0.086  0.106  0.204
                                                ^^^^^^^^^^^^^ plateau (~0.9s)
frame delta in camera distance, easeInOut:      0.009  0.028  0.046  0.065  0.083  0.102  0.120
```

Replaced with `easeOutQuint`, which keeps a dolly's decisiveness — the move happens early and the
camera then holds its framing, which is how a dolly is actually operated — while staying monotone.

### Status

The motion language is now **applied to the corpus**, `npm run benchmarks` passes 54/54, and the
Phase 1 film is byte-identical. The vocabulary is no longer available-but-unused; it is in the films,
and the harness can measure it.

---

## Addendum 2 — the transform curve removed, and what the profile shift means

Round 34 diagnosed `desire`, which the previous round's A/B showed as the one film that regressed.

**The cause was `easeInOutBack` on the `transform` function.** `desire` shot 04 is a transform, so it
kept the overshoot curve after dollies were moved off it — and it had the identical mid-move plateau:

```
per-step camera travel, desire shot 04:  0.171  0.018  0.171  0.389  0.365  0.121  0.029
                                         ^^^^^^^^^^^^^ plateau
old easeInOut:                           0.027  0.070  0.128  0.182  0.166  0.134  0.075
```

`easeInOutBack` was chosen for transforms on the reasoning that a transformation is the move the
audience is meant to watch, so the camera should be eventful too. **That reasoning is wrong**: a
transform is already the most eventful thing in the frame, and an eventful camera on top of it
produces a plateau — the camera appearing to stall mid-move. `transform` now gets no special curve.

### Final A/B: old easing → motion language

| film | pathInkDiff | pathPeakInkDiff | cameraChangedShare |
|---|---|---|---|
| `desire` | −27.3% | **+21.9%** | +0.1% |
| `forgotten-name` | **+62.5%** | **+26.9%** | **+43.7%** |
| `disappearing-room` | **+33.3%** | −9.9% | **+15.1%** |
| `time` | **+9.9%** | **+17.7%** | +0.5% |

**Improved on 3 of 4 films for mean path motion, 3 of 4 for peak step, and 4 of 4 for endpoint camera
response.**

### The remaining trade, stated rather than hidden

`desire` improves on PEAK (+21.9%) and falls on MEAN (−27.3%), and `disappearing-room` does the
reverse. That is not noise; it is a **profile shift**, and it is the intended one:

- `easeInOut` is symmetric — it accelerates into the middle and out again, so its largest step sits
  mid-move and its mean is high.
- `easeOutQuint` front-loads — a large committed step early, then a long hold on the framing. A
  higher peak, a lower mean, and the shape a dolly is actually operated with.

A metric that averages steps will always prefer the symmetric curve. **The mean is therefore the
weaker of the two figures for judging a camera move**, and `pathPeakInkDiff` — "is there a moment that
reads" — is the one that tracks the intent. Recording that here because the next person to read a
`pathInkDiff` regression should check whether the peak moved the other way before treating it as a
fault, which is exactly what I failed to do for one round.

---

## Addendum 3 — glyph-level metrics, closing a blind spot the harness had

Round 40 turned on combined-score glyph selection on the CPU path and **the harness reported
byte-identical results on all four films** — lit cells, mean ink, near-white share, midtone share all
unchanged. The change was real: 1,417 cells per frame moved to heavier glyphs.

The reason is that the change is a **redistribution**. `inkToDisplayByte` derives the drawn brightness
from the glyph's own coverage, so swapping a cell from `.` to `#` changes *which character is drawn*
while leaving total ink fixed. **Every metric built on luminance is structurally blind to it**, and
Gate 3 is specifically about which character is chosen.

Three metrics are now recorded per film:

| metric | what it moves on |
|---|---|
| `meanGlyphCoverage` | the average ink of the CHOSEN characters; rises when selection goes heavier |
| `heavyShare` | share drawn from the heaviest quarter of the typeface |
| `glyphEntropy` | how evenly the character set is used; falls when a few marks dominate |

plus a top-12 `glyphHistogram`, printed on capture.

### Verified against the change it was built for

`forgotten-name`, whole corpus:

| build | meanGlyphCoverage | heavyShare |
|---|---|---|
| `multiSignal` off (brightness only) | 9.146 | 15.7% |
| `multiSignal` on (combined score) | **12.505** | **34.8%** |

**+37% on mean glyph coverage and 2.2× on heavy share** — where every previous metric read zero.

### Pinned by test

`tests/ascii/native-render.test.ts` now asserts that combined-score selection yields **heavier**
glyphs, and — the property that made the change invisible — that it does **not** change how many cells
are lit. A regression that made the signal *add light* rather than *select a character* would be a
different and wrong behaviour, so it is pinned explicitly.

### Why this is worth more than the metric

The blind spot is the reason a real, visible improvement (round 40's outline comparison) produced zero
signal in every automated check for a whole round. **A harness that cannot see a class of change will
report that class of change as a no-op** — and this phase has already spent rounds chasing metrics
whose denominators moved under them. Recording the gap, not just filling it, because the next such gap
will be found the same way.
