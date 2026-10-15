# PHASE 4A.4 — BEAT PHASE EVIDENCE CALIBRATION


**PHASE 4A.4 = PARTIAL / EXTERNAL REVIEW REQUIRED.**

**No production change was made.** The three experimental phase-selection methods were built, measured against
fixtures and held-out fixtures, and **all were rejected on evidence**. The existing tracker stands, the `1.25`
threshold is untouched, and no grid was promoted.

---

## 1. ROOT CAUSE — identified

**The chain promotes ACOUSTIC evidence to METRICAL status, and never had metrical evidence to begin with.**

| stage | what it actually measures | what it is used as |
|---|---|---|
| envelope energy DP path | **where the sound is loudest over time** | a beat grid |
| `strengthContrast` | **onset strength at beats vs between them** | metrical validity |
| phase sweep | **accumulated onset support** | metrical phase |
| `phaseSeparation` | **rivalry between candidate periods** | phase correctness |

**Every one of these answers *"where is the sound?"*. None answers *"where is the beat?"*.** On syncopated
material the loudest events are *deliberately* between the beats — which is exactly Fixture C, and exactly the
real track.

**Two further defects, measured:**

- **The tracker and the gate optimise different objectives** (envelope energy vs strength contrast), so a grid
  can be selected by one criterion and rejected by another. Measured on the real track: the tracker selected
  phase 0.2000 s (contrast **1.1469**, fails); phase 0.133333 s of the same period scores **1.3745** (passes).
- **The gate's decision is arbitrary at millisecond scale.** Over ±50 ms of phase shift, candidate A spans
  **1.1265 … 1.4016** and candidate B spans **1.2229 … 1.4016** — **both straddle 1.25.** Whether either passes
  depends on where the phase sits by a few milliseconds, not on the music.

## 2. STRENGTH CONTRAST AUDIT — all three weaknesses confirmed and measured

**Weakness 1 — the numerator drops uncovered beats, inflating the score.**

| phase | beat coverage | numerator excl. empty | incl. empty | inflation | contrast as implemented | with inclusive numerator |
|---|---|---|---|---|---|---|
| 0.200000 | 78.8% | 0.322092 | 0.253769 | **1.269×** | 1.1870 | **0.9352** |
| 0.133333 | 87.3% | 0.350550 | 0.305935 | 1.146× | **1.3745** | **1.1996** |
| 0.333333 | 66.1% | 0.296872 | 0.196115 | **1.514×** | 0.9787 | **0.6465** |

> **With an inclusive numerator, EVERY phase falls below 1.25.** The metric's only passing candidate on this
> track passes **because of the exclusion rule**, not because its beats carry more energy. And the inflation is
> **largest for the lowest-coverage phase** — the rule rewards grids that cover less of the music.

**Weakness 2 — the hard 0.16 s denominator boundary.**

| candidate | contrast range over ±50 ms | largest single 1.25 ms step |
|---|---|---|
| A | 1.1265 … 1.4016 (**0.2751**) | **0.0562** |
| B | 1.2229 … 1.4016 (0.1787) | 0.0470 |
| C | 0.9677 … 1.0931 (0.1254) | 0.0479 |

**A single 1.25 ms phase step moves the metric by up to 0.056** — 4.5% of the threshold, from a shift far below
any perceptual resolution.

**Weakness 3 — the `4.0` fallback.** Measured: the denominator is **never zero** on this track, so the fallback
is unused here — but it has **still never been exercised against a dense real pulse with known beats**. Its only
positive control is a bare metronome.

**Threshold unchanged. No new threshold was introduced.**

## 3. LOW-FREQUENCY EVIDENCE — valid, and it splits

**§5 first, because a filter-latency error would invalidate the whole comparison.** A synthetic impulse test at
three positions × three impulse kinds (broadband, 60 Hz, 4000 Hz):

| | result |
|---|---|
| low-band peak offset | **−24.0 … −17.3 ms** |
| high-band peak offset | **−24.0 … −17.3 ms** |
| **max low−high difference** | **0 ms** |
| verdict | **NO BAND-DEPENDENT LATENCY** |

The offsets are **the same for both bands** and are the **window-start convention** plus **hop quantisation**
(10.667 ms), not filter latency — and since they are shared, they **cancel in a phase comparison**. The 11 ms
band-split itself is a linear-phase FIR with its **group delay (N−1)/2 = 128 samples subtracted exactly**.

**Then the comparison, using onset TIMES and strengths per band:**

| candidate | phase | contrast | low-align | high-align | broadband-align |
|---|---|---|---|---|---|
| **A** | 0.200000 | 1.1870 | **0.2366** | 0.2871 | 0.2538 |
| **B** | 0.133333 | **1.3745** | 0.2258 | **0.3304** | **0.3059** |
| C | 0.333333 | 0.9787 | 0.2071 | 0.2252 | 0.1961 |

**The external observation is REPRODUCED: A aligns best with the low-frequency pulse.**

**But the split is real and it is not close in the same way:**

| band | winner | winner over runner-up | as % of spread |
|---|---|---|---|
| **low-frequency** | **A** | 0.0108 | **36.6%** |
| high-frequency | **B** | **0.0433** | **41.2%** |
| broadband | **B** | **0.0521** | **47.4%** |

**The low-frequency advantage is 4× smaller in absolute terms than the broadband advantage**, and it is
**region-dependent**: `early → A` for both bands, `middle → A`, `late → B`. Window wins: **A 5, B 4.**

**A bass transient is an acoustic event, not a metrical position.** The low-frequency result is evidence that
A's beats coincide with bass onsets — **not** that A is the beat.

## 4. METRICAL EVIDENCE — two methods built, both rejected

**`src/audio/metrical.ts`** — both use **onset TIMES only** for the density term, so amplitude cannot win.

1. **Metrical density** — peak-to-trough inter-onset-interval density × beat coverage.
2. **Accent hierarchy** — recurrence (inverse CV of onsets-per-beat) × accent share × coverage.

**Real track result — both agree, and it is a tie:**

| method | best phase | score | **margin over runner-up** | abstained |
|---|---|---|---|---|
| metrical density | 0.144444 | 1.0545 | **1.0058 (0.6%)** | no |
| accent hierarchy | 0.144444 | 0.3025 | **1.0342 (3.4%)** | no |
| strength contrast | 0.711111 | 0.2101 | — | — |

**Both rank 0.144444 #1 and 0.133333 #2, and the top eight phases span 0.122222 … 0.177778 s — a ~55 ms
plateau.** A 0.6% margin is **a tie, not a selection.**

> **THE METRICAL PHASE OF THIS TRACK IS UNCERTAIN ACROSS ROUGHLY 55 ms. That is the honest answer.**

**And the wider verdict is negative — the methods LOSE the ability to abstain:**

| | baseline | metrical density | accent hierarchy |
|---|---|---|---|
| **false grids on non-metrical material** | **0 / 2** | **2 / 2** | **2 / 2** |
| improved | — | A (0.968→1.000), C (0→1.000) | A, D (+0.016) |
| **regressed** | — | **B (0.957→0.522), D (0.651→0.186), held-out 150 (0.543→0.407)** | **B (0.957→0.522), held-out 150 (0.543→0.516)** |

**§9's critical requirement is violated.** Two of the three "improvements" are also artefacts:

- **C's F1 1.000 comes from `peakToTrough = 99`** — the code's cap for *"no onset falls half a period away"*.
  On **any** sparse click track that is guaranteed, and it flags off-beat phases as strongly as on-beat ones.
- **The held-out 96 BPM fixture, built to the same construction, also returns `p2t 99` and still scores F1
  0.000.** So the C result does **not** transfer.

## 5. HELD-OUT TEST RESULTS — no transfer

Two fixtures generated **before the methods were finalised**, with ground truth **sealed** in
`heldout-ground-truth.json` and **never passed to the methods**:

| fixture | construction | baseline F1 | metrical F1 | accent F1 |
|---|---|---|---|---|
| **96 BPM, 3:1 subdivision, beat 2.6× quieter** | metrical beat **quieter** than the off-beat events | **0.000** | **0.000** | **0.000** |
| **150 BPM, irregular syncopation** | no constant subdivision explains the loud events | **0.543** | 0.407 | 0.516 |

**Neither method improves the held-out material.** The 96 BPM case — the closest analogue to Fixture C, at a
tempo and subdivision ratio neither method had seen — is **0.000 for all three**.

## 6. FIXTURE C RESULT — UNRESOLVED

`F1 = 0.000`, `phaseSeparation = 1.1986`. **The apparent F1 1.000 from the metrical search is the `p2t = 99`
artefact**, demonstrated by the held-out 96 BPM fixture returning the same `p2t = 99` and F1 0.000.

## 7. FIXTURE D RESULT — UNRESOLVED, and a distinct issue

**Audited as §8 asks: the proposed phase methods do NOT assume constant tempo in principle** — a phase is
defined within a period, not within a track. **But they are searched at ONE period**, so they cannot address a
tempo transition at all.

**The blocker is unchanged and earlier in the chain: `localTempoCurve` consumes a published beat grid, and D
publishes none, so `tempoTransitionRegions` remains unwired.** D's improvement on fixed-tempo music would not
imply tempo transitions are solved, and **no such improvement was demonstrated anyway.**

## 8. INDEPENDENT DETECTOR STATUS = **UNAVAILABLE**

`aubio` could not be installed: **two attempts both failed on network read timeouts fetching numpy** for pip's
build-isolation environment. `aubio 0.4.9` ships only an sdist. **§10 forbids repeated retries, so retries
stopped**, and one accessible-path check (a system binary) also found nothing.

**No third-party detector output exists, and none is treated as ground truth.**

## 9. BASELINE vs CANDIDATE — the verdict

| method | verdict |
|---|---|
| **BASELINE** (DP + strengthContrast) | **RETAINED.** Best F1 on clean pulses, and **the only method that abstains correctly on ambient material (0/2 false grids)** |
| metrical density | **REJECTED** — 2/2 false grids, 3 regressions, C win is an artefact |
| accent hierarchy | **REJECTED** — 2/2 false grids, 2 regressions |

**§11 governs: no defensible improvement was demonstrated, so the existing tracker is retained and this phase is
PARTIAL.** No `argmax(strengthContrast)` repair was made. **No listener's preferred candidate was hard-coded.**

## 10. HUMAN REFERENCE STATUS = **NONE PROVIDED**

No annotations exist, so **no region can be upgraded** and readiness stays **`FREE_SYNC_ONLY`** for all 88
seconds. A tap/annotation procedure is specified in `HUMAN_ANNOTATION_GUIDE.md`.


---

## APPENDIX — §16 artefact index

| artefact | contents |
|---|---|
| `out/phase4a4/BASELINE_VS_CANDIDATE.json` | three methods scored against ground truth on 8 fixtures, with improvement and regression lists |
| `out/phase4a4/PHASE_EVIDENCE_AUDIT.json` | the 8 evidence layers, each with independence, selection/validation role and limitation |
| `out/phase4a4/STRENGTH_CONTRAST_AUDIT.json` | coverage inflation, denominator-boundary sensitivity, fallback audit, new metric definitions |
| `out/phase4a4/METRICAL_EVIDENCE_REPORT.md` | this document |
| `out/phase4a4/FIXTURE_REGRESSIONS.json` | Fixture C and D status, held-out results, abstention counts |
| `out/phase4a4/REAL_TRACK_COMPARISON.json` | band-split alignment for the three controlled phases with DSP timing provenance |
| `out/phase4a4/HUMAN_ANNOTATION_GUIDE.md` | the tap/timecode procedure and what each outcome would change |
| `out/phase4a4/PRODUCTION_SAFETY_REPORT.json` | 7/7 safety checks, and the list of things not performed |
| `out/phase4a4/dsp-impulse-test.json` | the synthetic impulse alignment test proving no band-dependent latency |
| `out/phase4a4/fixtures/` | the two held-out syncopated fixtures with sealed ground truth |

## APPENDIX — new metrics, named for what they measure

| metric | exact measurement |
|---|---|
| `beatCoverage` | fraction of predicted beats with at least one onset within the support window |
| `nearBeatOnsetStrength` | mean over **all** predicted beats of the max onset strength within the window, **including zeros** |
| `offBeatOnsetStrength` | mean onset strength of events farther than 2× the window from any beat |
| `phaseStability` | maximum local phase deviation across windows, in seconds and as a fraction of the period |
| `phaseSeparation` | best phase support ÷ best rival at least a quarter period away |
| `metricSensitivityToSmallShifts` | range and largest single-step change under ±50 ms of phase shift in 1.25 ms steps |
| `peakToTrough` | IOI-histogram density at the phase ÷ density half a period away — **capped at 99, which is an artefact floor, not a strong result** |
| `recurrence` | 1/(1+CV) of onsets-per-beat — 1 means perfectly even recurrence |
| `accentShare` | fraction of beats that are the strongest position in their own neighbourhood |
