# PHASE 4A.1 — REAL TRACK CALIBRATION & BEAT-PHASE GATE

**PHASE 4A.1 = REAL_TRACK_REQUIRED.**

**The track was not supplied**, so the real-track gate is open. **No film was synced, no cut moved, no SFX, no
subtitles, no music added to anything.**

Everything that does **not** depend on the track was built and tested, and it produced **two findings that
matter more than the track would have**: a **hard-sync safety defect** and a **failed phase repair** — both
measured, both recorded.

---

## 1. REAL TRACK — REQUIRED

**No user-supplied music track exists inside the project.** `out/phase4a/fixtures/*.wav` are the **synthetic**
fixtures from Phase 4A and are **not** a real track.

**Expected command:** `node scripts/phase4a1.mjs <path-to-music-track>`

**Expected input path:** any path ffmpeg can read. **The original is never modified and no copy is required** —
the source is hashed in place. On success the runner writes `out/phase4a1/real-track/` with
`audio-metadata.json`, `music-analysis.json`, `music-timeline.json`, `analysis-warnings.json`,
`sync-readiness.json`, `timeline-debug.html`, `beat-click.wav`, `downbeat-click.wav` (only when the meter is
established) and `analysis-report.md`.

**Tracks were found on the Desktop** (several third-party music folders, not reproduced here), but none
was selected and **I did not choose one**: the brief says *the user-supplied track*, and analysing a
composition reference rather than your own recording would make every downstream number about the wrong piece.

## 2. THE HARD-SYNC SAFETY DEFECT — the important result

### The first readiness implementation was unsafe

It measured **phase stability** and nothing else. **A stably wrong phase is stable.** Fixture **C** — which
sits **220.6 ms off the pulse with `beatAccuracy` F1 = 0.000** — was therefore labelled **`HARD_SYNC_READY`.**

**That is exactly the failure §14 forbids:** *"do not issue HARD_SYNC_READY from BPM confidence alone."* A
readiness verdict built only on stability and support passes every wrong-but-regular grid, and **a stable wrong
grid is the most dangerous possible output for hard synchronisation.**

### The missing gate: PHASE SEPARATION

`PhaseSupportCurve` records the support at **every phase of the winning period**, and `separation` is the best
phase's support divided by the best rival **at least a quarter period away**:

- **one clear pulse** → the winner stands well above its neighbours → `separation` high
- **two defensible phases** → a rival scores comparably → `separation` near 1 → **the grid must not be locked**

`SUPPORTED_METRICAL` now requires **phase stability AND phase separation ≥ 1.25×.**

| fixture | phase separation | readiness |
|---|---|---|
| **A** 120 BPM click | **99** (no rival) | `HARD_SYNC_READY` |
| **B** 90 BPM missing beat | **99** | `HARD_SYNC_READY` |
| **C** off-beat transients | **1.1986** | **`SOFT_SYNC_ONLY`** |
| **D** tempo change | 5.2037 | `HARD_SYNC_READY` |

**The gate caught C. Stability could not; separation does.**

## 3. BEAT PHASE AS A FIRST-CLASS SEARCH DIMENSION — and it did NOT fix C

`src/audio/grid-phase.ts`. `BeatGridCandidate` carries `tempoCandidateBpm`, `phaseOffsetSeconds`, `beats`,
`support`, `robustSupport`, `confidence` and `sourceMethod`, and `searchGridPhase` evaluates **every phase
subdivision of every tempo candidate**, ranking on **accumulated** acoustic support.

**Phases are ranked, never averaged.**

### It did not fix C, and the reason is a real finding

The search chose phase **0.228813 s** — the **220.6 ms off-beat error** — because it maximises acoustic support,
and **on fixture C the off-beat transients are acoustically strongest.** So:

> **Maximising acoustic support selects the wrong phase when the off-beat events are louder than the on-beat
> ones.** Support is necessary but not sufficient: the missing ingredient is *metrical* — something must know
> that a bar begins where it begins, and no acoustic-salience measure can supply that.

**Fixture C is therefore UNRESOLVED**, and the phase search is retained because it *is* the right structure even
though its current objective is wrong. **The honest next step is phase-hypothesis tracking across the whole
track rather than a per-phase score.**

**Phase 4A's point-sampling phase attempt was also wrong**, and this round explains why: a single loud transient
can outvote the pulse, and a sparse click track makes one missed sample decisive.

## 4. FIXTURE C STATUS — UNRESOLVED, reported as required

| metric | value |
|---|---|
| adaptive DP grid | 16 beats, **F1 0.000** |
| phase-search grid | 16 beats, **F1 0.000**, phase 0.228813 s |
| interval error | **0.15%** — the tempo is right |
| phase separation | **1.1986** — below the 1.25 margin |
| readiness | **`SOFT_SYNC_ONLY`** |

**The failure is not hidden, and no threshold was tuned to its known answer.** Its separation of 1.1986 is a
genuine measurement that happens to fall below a **stated** margin; the margin was chosen as a meaningful
separation, not fitted.

## 5. FIXTURE D STATUS — correctly withheld, with a capability gap

D is a real **100 → 140 BPM change**. `trackBeatsAdaptive` segments the envelope into tempo regions and tracks
each with its own period, which fixed the earlier 62% jitter down to **35%** — still above the support
threshold, so **no beat grid is published for D.**

**Audited as §17 asks: this is PARTLY correct withholding and PARTLY a capability gap.**

- **Correct withholding**: a single period genuinely cannot describe a tempo change, and §17 explicitly says
  *"do not force a global grid across 100 BPM → 140 BPM."* **Withholding is the right behaviour.**
- **Capability gap**: **local grids ARE supportable** — the two regions are individually metrical — and the
  implementation does not yet publish them as **separate tempo regions**. That is the gap.

**The phase-search grid for D is 16 beats at F1 0.611**, and its readiness reports a single
`SUPPORTED_METRICAL` region, **which is itself wrong** — a region covering a tempo change should be
`TEMPO_TRANSITION`. The `tempoTransitionRegions` parameter exists and is **not yet driven by the adaptive
segmenter's output.** Recorded as open debt.

## 6. REGIONAL STRUCTURE AND READINESS

`src/audio/sync-readiness.ts`. Five region kinds — `SUPPORTED_METRICAL`, `AMBIGUOUS_METRICAL`, `NON_METRICAL`,
`TEMPO_TRANSITION`, `LOW_EVIDENCE` — and three readiness levels **named exactly as the brief names them**:
`HARD_SYNC_READY`, `SOFT_SYNC_ONLY`, `FREE_SYNC_ONLY`.

`localPhaseStability` re-searches the phase **inside each 10-second window** and reports the drift, so
**tempo-stable-phase-drifting is distinguishable from tempo-changing.**

**The track verdict is the WORST region**, because a sync decision spans the whole edit and one unsafe span
makes the lock unsafe.

**A naming defect the typechecker caught:** I had written the tuple with `SOFT_SYNC_READY`, a name the brief
**does not use**, and every `SOFT_SYNC_ONLY` assignment was rejected. **The vocabulary now matches the brief.**

## 7. CLICK AUDITION — the audible diagnostic

`out/phase4a1/audition/`. **The DSP cannot settle a perceptual question**, and fixture C's grid is internally
perfect and acoustically wrong — **no interval metric can see the difference.** A listener can.

| file | purpose |
|---|---|
| `<fixture>-beats-click.wav` | do the clicks land on the musical pulse? |
| `<fixture>-beat-candidate-A/B/C.wav` | **when the phase is ambiguous, each candidate is offered separately** rather than one silently chosen |
| `<fixture>-downbeats-click.wav` | louder and higher (2880 Hz at 1.35×) — **omitted entirely when the meter is UNKNOWN**, because presenting an unestablished bar would assert one |
| `<fixture>-onsets-click.wav` | a **separate file**, so BEAT and ONSET are never conflated into one ambiguous diagnostic |

**The source timing is unaltered**; the original samples are copied through with clicks mixed in.

**A contradiction in my own output was caught and fixed:** the audition printed *"phase separated"* for C while
the readiness verdict simultaneously called it `AMBIGUOUS_METRICAL` — **two outputs of the same run disagreeing
about the same fact.** The label was reading `phaseAmbiguous` (a comparison across *different* periods) instead
of `curve.ambiguous` (the rivalry *within* the winning period, which is what governs hard-sync safety).

## 8. BASELINE DETECTOR STATUS = **NONE**

§18 asks for an **empirical** evaluation, not a reflex either way. Measured:

| interpreter | numpy | scipy | librosa | aubio | essentia | madmom | soundfile |
|---|---|---|---|---|---|---|---|
| `.venv` | 2.0.2 | — | — | — | — | — | — |
| `.venv-film` | 2.0.2 | — | — | — | — | — | — |
| `.venv312` | 2.5.3 | — | — | — | — | — | — |
| system `python3` | — | — | — | — | — | — | — |

**No deterministic external analyser is installed.** `torch` 2.8.0 exists in `.venv` but is a **heavyweight ML
dependency that provides no beat detector on its own**, and §18 forbids adding one merely for prestige.

**Recorded as `NONE`, with the reason, and with the condition for revisiting: if the custom detector produces a
failure that an independent detector would have caught — and fixture C is a candidate — installing `aubio` (the
lightest, a C extension built at install time) becomes justified.** §18 explicitly allows wrapping an external
detector with `sourceMethod`, `config`, `evidence`, `confidence` and provenance.

## 9. NO FILM WAS SYNCED

Not loaded, not cut, not moved, not scored, no SFX, no subtitles. **This phase ends before the first visual sync
decision.**

## 10. REGRESSIONS

Phase 4A **76/76** · timing domain **15/15** · `tsc --noEmit` **clean** · `verify:claims` **15/15** ·
`regression:phase1` **24/24** · `regression:phase2` **6861/6861** ·
`grid.bin` **`49b4c86bcbc5677f`** · **V1 `ab39d78a40e74ba7`** · **V2 `fb8c4175d2bdba32`** ·
`contract-proof-film.mp4` **`acc609cc22a69899`** — **all unchanged.**

## 11. OPEN DEBT

1. **REAL TRACK REQUIRED** — the gate this phase exists for is open.
2. **Fixture C unresolved** — the phase search maximises acoustic support, which **selects the off-beat when
   off-beat events are louder.** The missing ingredient is metrical, not acoustic.
3. **Fixture D publishes no grid**, and **local tempo regions are not yet emitted** even though both regions are
   individually metrical.
4. **`tempoTransitionRegions` is not driven by the adaptive segmenter**, so D's readiness wrongly reports one
   `SUPPORTED_METRICAL` region where it should report `TEMPO_TRANSITION`.
5. **Phase 4A's point-sampling phase attempt remains wrong** and is superseded by `searchGridPhase`; the old
   path is still present in `trackBeatsAdaptive`'s re-phasing step and **did not help** — it mildly degraded A.
6. **Baseline detector `NONE`** — no independent disagreement evidence exists.
7. **Downbeat is never validated** — no fixture has bar structure, so `downbeats-click.wav` was never produced
   for any fixture and the meter code remains exercised-but-unvalidated.
