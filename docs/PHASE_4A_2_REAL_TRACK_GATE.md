# PHASE 4A.2 — REAL MUSIC VALIDATION GATE

**PHASE 4A.2 = PARTIAL — EXTERNAL AUDIO GATE PARTIALLY READY.**

The real track was analysed end to end. **The verdict is `FREE_SYNC_ONLY`: no beat grid was published, because
the support gate rejected the pulse.** That is a **correct refusal**, not a failure to analyse — but it also
**blocks the external perceptual gate**, because there is no beat-click track for a listener to judge.

**No film was opened. No cut moved, no music trimmed, looped, stretched or added, no SFX, no subtitles, no
preview rendered.**

---

## 1. REAL TRACK IDENTITY AND PROVENANCE

| | |
|---|---|
| **path** | the track named by `$CINEMA_TRACK` (an external asset, not in this repository) |
| **note** | the source directory name ends with a **trailing U+0020 space**, which is why the path is supplied by environment variable rather than hard-coded |
| **source sha256** | `8f08f5f56d7f2cd0d942b106c59b85db9cde470018a93c8ccf180022514972d0` |
| **decoded PCM sha256** | `6b3b38b54518208abce10e0a0e4011191aa4ee6c2bfa7c8badf0037a32d80d72` |
| **config sha256** | `5fcf45ae02b9cb4743cb3ede85700b01159645e13947ef52e96c44018e6d8841` |
| **analysis sha256** | `85d5f58df56617de…` |
| **duration** | **88.000 s** (from 4,224,000 decoded samples, not a header) |
| **sample rate** | 48 000 Hz |
| **channels** | source stereo; **analysis mono** (downmixed — a recorded conversion) |
| **codec / container** | `mp3` / `mp3` |
| **original bytes** | 2 121 563 — **unmodified** |

**Determinism: two full runs produced byte-identical `music-analysis.json`.**

## 2. MEASURED AUDIO FACTS

| quantity | value |
|---|---|
| energy-curve samples | **8 247** (continuous; never collapsed to LOW/MEDIUM/HIGH) |
| energy landmarks | **289** — `rise`, `peak`, `drop`, `near-silence` only |
| silence / near-silence regions | **17** |
| breath points | **1** |
| onsets detected | **600** — **6.82 onsets/second** |

## 3. INFERRED MUSICAL STRUCTURE

### Tempo candidates — ambiguity preserved, never averaged

| BPM | autocorrelation |
|---|---|
| **112.5** | 0.7205 |
| 75 | 0.6665 |
| 56.25 | 0.6472 |
| 152.027 | 0.5909 |
| 90.726 | 0.5487 |
| 64.655 | 0.5141 |

`halfDoubleAmbiguous: true`, confidence **low (0.25)**. **112.5 and 56.25 are an exact half/double pair**, which
is the ambiguity the brief requires be represented rather than resolved.

### Beat phase — explicit, and the phase search is EXPLORATORY only

| candidate | tempo | phase | support | robust | occupied beats | confidence |
|---|---|---|---|---|---|---|
| **A** | 56.25 BPM | 0.7111 s | 0.210068 | 0.180308 | 74 | medium |
| **B** | 112.5 BPM | 0.2000 s | 0.185909 | 0.145817 | **132** | medium |
| **C** | 75 BPM | 0.2000 s | 0.167888 | 0.124771 | 80 | low |

**Phase separation 1.3749, `ambiguous: false`** (rival ratio 0.7274). 72 phases evaluated.

### THE SUPPORT GATE REJECTED THE PULSE — and that is the headline

`strengthContrast = **1.1469**` against a required **1.25**. The gate's own words:

> *"UNSUPPORTED: strength contrast only 1.15x — the beats do not mark events stronger than the space between
> them."*

**Therefore `beat grid WITHHELD — 0 beats published`, `beatGridTrustworthy: false`, meter `unknown`,
downbeats `WITHHELD`.**

**The detail that matters:** the dynamic-programming tracker found **165 beats at 112.5 BPM** — *exactly* the
165 a 112.5 BPM grid over 88 s predicts. **The grid exists and is complete; the evidence that it is the pulse
does not pass the gate.** So this is not "the tracker failed" — it is **"the tracker succeeded and the
verification refused to certify it."** Those are very different findings and only the second is safe.

### Structure — after a real over-segmentation defect was found and fixed

**First run: 30 sections and 31 phrases in 88 seconds** — one section every 2.9 s, **with labels wrapping past
`SECTION_Z` and repeating `SECTION_A`, `SECTION_B`…** Two distinct sections sharing a name.

**Cause:** the minimum phrase and section lengths were **fixed small constants (1.2 s / 1.5 s)**. They are not
musical units.

**Fix:** both now derive from **bars** via a shared `musicalTimescale`, so the model works on the music's own
timescale. **Result: 31 phrases → 8, 30 sections → 4, labels unique.**

| section | span | mean RMS | evidence |
|---|---|---|---|
| `SECTION_A` | 0.0–35.9 s | −13.5 dB | track start |
| `SECTION_B` | 35.9–60.6 s | **−7.6 dB** | character changed **91.0%** across the boundary |
| `SECTION_C` | 60.6–82.3 s | −8.1 dB | character changed 82.7% |
| `SECTION_D` | 82.3–88.0 s | −24.6 dB | character changed 70.3% |

**Labels are neutral.** No `VERSE`/`CHORUS`/`BRIDGE` is claimed anywhere.

### Breath points — 1

`87.47 s`, room 0.981 s, medium confidence, evidence *"near-silence region of 0.98 s at −35.36 dB"*.
**One breath point in 88 seconds is a thin result**, and it sits at the very end of the track — recorded rather
than padded.

## 4. C-CLASS RISK = **PRESENT**

> **C_CLASS_RISK = YES** — via the **unsupported pulse** route, not the within-period-rivalry route.

This is the more dangerous of the two Fixture-C forms: **correct, stable, complete tempo and interval structure
that the verification refuses to certify.** A system that reported the 112.5 BPM grid as established would be
exactly the Fixture-C trap at scale.

**A defect was found here.** The first C-class report printed *"not detected"* because it consulted only
`curve.ambiguous` (rivalry **within** a period) and never the support verdict. **On a track whose pulse is not
established, that printed "not detected" — the most misleading possible output.** It now reports **both**
routes, and the real track is **YES**.

## 5. D-CLASS RISK = **UNCERTAIN**, and that is a capability gap

> **D_CLASS_RISK = UNCERTAIN — the check COULD NOT BE PERFORMED.**

`localTempoCurve` consumes the beat grid; the grid was withheld; therefore **no local tempo curve exists and no
tempo-transition test ran.** The first report printed *"not detected"*, which **claims a negative result from a
test that never executed** — the same error class as the readiness verdict below. It now says **UNCERTAIN** and
names the reason.

**Fixture D remains unresolved and is not rewritten as solved:** local tempo regions are **still not published**
and `tempoTransitionRegions` is **still not wired**.

## 6. REGIONAL READINESS = **FREE_SYNC_ONLY** (no regions assessable)

> *"NO REGIONS COULD BE ASSESSED — no beat grid was published, so there is no phase evidence to assess; a
> verdict of ready cannot be derived from the absence of evidence."*

**A serious defect was found and fixed here.** The first version folded `reduce` over an **empty** region list
with `HARD_SYNC_READY` as the seed, and the real track reported:

> `readiness HARD_SYNC_READY — 0 of 0 regions are not hard-sync ready`

**A verdict of *ready* derived from having no evidence at all** — the exact inversion of §14, on the first real
track, in the output a Director would read. It now returns `FREE_SYNC_ONLY` with an explanatory rationale.

## 7. FUTURE SYNC MAP

`future-sync-map.json` exists and carries `availableEvidence`, `allowedSyncModes`, `prohibitedSyncModes`,
`reason`, `measured`, and the note *"THIS IS NOT AN EDIT DECISION"*. It references **no video event**.

It reports **0 regions**, `overall: FREE_SYNC_ONLY` — **which is the correct output**: with the grid withheld
there is no `BEAT` evidence and no region can be cleared for any locking.

**A defect was found here too:** the map was written **inside** the `if (publishGrid)` block, so on the one real
track analysed **the required file was never produced**, and JSON wrote no `future-sync-map.json` at all
before the fix. **A required output that only appears when analysis succeeds is a required output that
disappears exactly when it is needed.**

## 8. CLICK AUDITION FILES

| file | state |
|---|---|
| `onset-click.wav` | **PRODUCED** — 600 onsets over the original |
| `beat-click.wav` | **WITHHELD** |
| `downbeat-click.wav` | **NOT PRODUCED** — meter `unknown`; emitting one would assert an unestablished bar |
| `beat-candidate-A/B/C.wav` | **NOT PRODUCED** — candidates exist, but the pulse is unsupported |

**`beat-click.wav` is withheld deliberately.** A third defect was found first: the runner generated clicks from
the **phase-search grid**, which **bypasses the support gate** — on the real track that meant clicks on an
82-beat **56.25 BPM** grid (the half-time reading) while the gate had rejected the pulse. **A grid the gate
rejected was being published through a second door, in the one artefact a listener would use to certify it.**

A clicked track on a grid the analysis itself refuses **would look like validation**. Withholding it is the
honest output, and it is why this phase is **PARTIAL**: **the external listening gate cannot run for beats.**

## 9. EXTERNAL LISTENING REVIEW — WHAT CAN AND CANNOT BE ASKED

**Answerable now:** `onset-click.wav` — do the 600 clicks coincide with the transients you hear?
`timeline-debug.html` — do the 4 section boundaries (0.0 / 35.9 / 60.6 / 82.3 s) match where you hear the
music change? Is `SECTION_B` (35.9–60.6 s, −7.6 dB) the loudest part? Is 87.47 s the only place the track
breathes?

**NOT answerable yet** — and this is the gate that remains open: *do beat clicks sit on the pulse? do they lock
onto an off-beat pattern? do they drift? which regions are safe for exact sync?* **Those need
`beat-click.wav`, which cannot honestly exist until the pulse is supported.**

## 10. BASELINE DETECTOR NEEDED = **YES**

The real track exposes exactly the uncertainty §13 describes, and it is a **measured** one:

- the DP tracker produced a **complete 165-beat grid at 112.5 BPM** — the correct count for that tempo;
- the verification **rejected it on a strength-contrast margin of 1.1469 vs 1.25**;
- the material is **dense and percussive** — **6.82 onsets/second, 3.64 onsets per beat** — which is precisely
  the condition under which a *mean-strength* contrast test can **under-read a real pulse**, because the
  between-beat space is crowded with genuine events.

**So the question an independent detector would settle is narrow and material: is the 112.5 BPM pulse real, or
is the rejection correct?** Recommend the lightest justified option, **`aubio`** — **not installed in this
round**, as instructed.

## 11. OUTPUTS

`out/phase4a1/real-track/`: `audio-metadata.json` · `music-analysis.json` · `music-timeline.json` ·
`analysis-warnings.json` · `sync-readiness.json` · `future-sync-map.json` · `timeline-debug.html` (**234 KB,
all layers plus regional readiness and the sync map**) · `onset-click.wav` · `analysis-report.md`.

## 12. REGRESSIONS

Phase 4A **76/76** · timing domain **15/15** · `tsc --noEmit` **clean** · `verify:claims` **15/15** ·
`regression:phase1` **24/24** · `regression:phase2` **6861/6861** ·
`grid.bin` **`49b4c86bcbc5677f`** · **V1 `ab39d78a40e74ba7`** · **V2 `fb8c4175d2bdba32`** ·
`contract-proof-film.mp4` **`acc609cc22a69899`** · `P1-serial.mp4` **`dd0075dacc0596ca`** — **all unchanged.**

## 13. ENGINE LIMITATIONS — SEPARATE FROM THE REAL TRACK, UNCHANGED

| | status |
|---|---|
| **FIXTURE C** | **UNRESOLVED.** Correct tempo, wrong phase; `beatAccuracy` F1 **0.000**; separation **1.1986**; `SOFT_SYNC_ONLY`. **The beat detector is NOT solved.** |
| **FIXTURE D** | **UNRESOLVED.** Local tempo regions not published; `tempoTransitionRegions` not wired; D still reports one `SUPPORTED_METRICAL` region where it should report `TEMPO_TRANSITION`. |

**Real-track refusal does not resolve C, and real-track success would not have either.**

## 14. WARNINGS RAISED ON THE REAL TRACK

`PERCUSSION_ABSENT` (severe) · `TEMPO_UNRESOLVED` (severe) · `TEMPO_AMBIGUOUS` (caution) ·
`TEMPO_LOW_CONFIDENCE` (caution) · `TIME_SIGNATURE_UNCLEAR` (caution) ·
`MULTIPLE_PULSE_INTERPRETATIONS` (caution) · `SECTION_INFERENCE_WEAK` (info)

**Seven warnings, two severe.** The analysis is telling the Director, in its own output, **not to hard-sync this
track.**

## 15. OPEN DEBT

1. **The external beat-audition gate cannot run** — no `beat-click.wav`, because the support gate refused.
2. **Five defects were found on the first real track**, all now fixed and all recorded above: the support-gate
   bypass through the phase search · `HARD_SYNC_READY` from an empty region list · the future-sync map written
   only on success · C-class reported from one route only · D-class claiming a negative from a test that never
   ran. **A sixth: 30 sections with wrapping labels**, from fixed non-musical minimums.
3. **The strength-contrast threshold may be wrong for dense music** — 6.82 onsets/s crowds the between-beat
   space, so the test may under-read a genuine pulse. **This is the empirical question `aubio` would settle.**
4. **Only 1 breath point in 88 s**, at the very end — thin, and likely a real limitation of the silence-based
   detector on dense material.
5. **Fixtures C and D unchanged** — see §13.
6. **Downbeats remain unvalidated**, so `downbeat-click.wav` has never been produced for any track.
