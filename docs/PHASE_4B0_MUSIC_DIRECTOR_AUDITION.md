# PHASE 4B0 — MUSIC-TO-FILM DIRECTORIAL AUDITION

**PHASE 4B0 = EXTERNAL DIRECTORIAL GATE READY.**

Two contiguous 16-second music windows were selected **by measured dramaturgical contour**, laid under the
**unmodified** frozen film, and packaged for blind review. **No beat grid was consumed — none exists.**
**`syncMode = FREE_SYNC` throughout.**

---

## 1. THE FILM IS THE TIMING REFERENCE

`out/phase4b0/film-dramaturgy.json` — **11 landmarks read from `causal-trace.json`, never from the prose.**

| event | frame | seconds | shot |
|---|---|---|---|
| establishment | 0 | 0.000 | S1 |
| orientation | 37 | 1.233 | S1 |
| notice readable | 97 | 3.233 | S2 |
| step | 139 | 4.633 | S2 |
| settle | 210 | 7.000 | S2 |
| reach readable | 245 | 8.167 | S2 |
| **NAME fragmentation onset** | **246** | **8.200** | S2 |
| NAME fragmentation complete | 266 | 8.867 | S2 |
| ROOM decay onset | 364 | 12.133 | S4 |
| camera onset | 372 | 12.400 | S4 |
| final hold | 479 | 15.967 | S5 |

**Every landmark is `movability: LOCKED`.**

**Cross-check:** camera onset **372** and NAME fragmentation **246** were independently recorded during the 3.3J
and 3.3I audits. Both match exactly, from a different derivation path.

## 2. NO TIMESTAMP WAS INVENTED

The plan file `director-plan-v2.json` stores `{shot, startFrame, endFrame, seconds, reason}` — **it has no
`intent` object**, so the attention hierarchy could not be read from it. **It is derived from the trace's own
measured quantities**, and each derived phase records its derivation in `music-window-evidence.json`:

| phase | frames | derivation |
|---|---|---|
| ESTABLISHMENT | 0–37 | `noticeTurn == 0` and `stepProgress == 0` — nothing is moving |
| ATTENTION | 37–139 | `headYaw` changing, `noticeTurn` rising |
| APPROACH | 139–210 | `stepProgress` changing |
| REACH | 220–246 | `reachProgress` rising toward its plateau |
| CONSEQUENCE | 246–364 | `nameFragment` changing |
| AFTERMATH | 364–479 | `roomDecay` changing, then everything holds |

## 3. MUSIC WINDOW SELECTION — by contour, not by loudness

289 start positions scanned in 0.25 s steps. Three contour classes were defined **by measured criteria before
selection**:

| class | criterion | windows found |
|---|---|---|
| RESTRAINED_ATMOSPHERIC | `spread ≤ 8 dB` AND `onsets ≤ 90` AND `mean ≤ −12 dB` | **0** |
| PROGRESSIVE_BUILD | `buildToFragment ≥ 3 dB` AND `slope ≥ 1.5 dB` | 69 |
| CONTRAST_RELEASE | `retreatAfterFragment ≥ 4 dB` OR `releaseAtEnd ≥ 4 dB` | 117 |

**The third class is genuinely empty and is reported rather than forced.** §6 permits fewer candidates.

| chosen | class | window | boundary quality |
|---|---|---|---|
| 1 | PROGRESSIVE_BUILD | **36.25–52.25 s** | begins in a silence region; ends mid-phrase |
| 2 | CONTRAST_RELEASE | **0.25–16.25 s** | begins in a silence region; ends mid-phrase |

**Both are contiguous. No rearrangement, no looping, no time stretching, no stitching.**

**The two defaults §6 forbids were measured and neither was chosen:** the loudest 16 s is **47.75–63.75 s at
−4.82 dB**, and **neither candidate contains it**; the opening 16 s is **0–16 s**, and the CONTRAST_RELEASE
candidate starts at **0.25 s** — deliberately *after* the 0.19 s of leading digital silence, so the window begins
at the music's actual entrance rather than in silence.

## 4. THE MEASUREMENT THAT MATTERS

| | establishment → reach | at the consequence | final image | onsets/s at the end |
|---|---|---|---|---|
| **36.25–52.25 s** | −6.54 → **−6.25** | **+0.01 dB** | −6.23 dB | 8.87 |
| **0.25–16.25 s** | −24.97 → −23.15 | **+12.17 dB** | −15.46 dB | 2.35 |

> **The `PROGRESSIVE_BUILD` candidate is flat across the entire film** — a **+0.01 dB** change at the
> consequence. **Its class name describes the source music around it, not what happens under the film.**

The `CONTRAST_RELEASE` candidate **rises 12.17 dB at the exact moment NAME fragments** and then falls 4.48 dB
over the final image, with **2.35 onsets/s** at the end against 8.87.

**Neither is asserted to be better.** A flat window may be what a 16-second film wants; a 12 dB step may
overwhelm the consequence. **That is the judgement the external review is for.**

## 5. AUDIO TREATMENT — documented, reversible, minimal

**Sample-accurate extraction from the original stereo**, not the mono analysis waveform. The analysis decode
downmixes; auditions must not, so a **separate stereo decode** was performed from the same original file.

| | start sample | end sample | samples | fade | level-match |
|---|---|---|---|---|---|
| 36.25–52.25 s | 1 740 000 | 2 508 000 | 768 000 | **0 ms** | already at target |
| 0.25–16.25 s | 12 000 | 780 000 | 768 000 | **0 ms** | **+2.48 dB** |

**No fade was applied to either** — the boundary amplitudes were measured and neither required one. If either
had, the fade duration, gain and reason would be recorded.

**Loudness policy:** excerpts are **level-matched to a common target** so the comparison hears *structure*, not
*level*. The gain is a **single scalar per excerpt**, so **internal dynamics are untouched** — no compression,
no limiting, no flattening. A clipping guard caps any gain at peak 0.97. **The unadjusted excerpt is kept
alongside the gained one.**

## 6. THE FROZEN VISUAL PERFORMANCE IS UNCHANGED

The previews were built by **stream-copying the frozen V2 video** into a new container with the window audio.
Verification is by **PNG frame extraction and per-frame sha256**, because the bundled ffmpeg has **no `rawvideo`
muxer** — and PNG frames are a **stricter** test than raw video.

| | frames | size | result |
|---|---|---|---|
| frozen V2 | 480 | 1920×1080 | combined hash **`9d73a42493ffb085`** |
| preview 1 | 480 | 1920×1080 | **ALL 480 FRAMES IDENTICAL** |
| preview 2 | 480 | 1920×1080 | **ALL 480 FRAMES IDENTICAL** |

**No rerender. No typography, camera or effect change. `-c:v copy`.**

## 7. `FREE_SYNC` IS EXPLICIT, AND NO BEAT GRID WAS CONSUMED

Production analysis state, unchanged: **BEAT GRID WITHHELD**, **HARD_SYNC PROHIBITED**, **Fixture C UNRESOLVED**,
**Fixture D UNRESOLVED**, **human beat reference NOT AVAILABLE**.

`audition-trace.json` records `syncMode: "FREE_SYNC"` per candidate, `audioVideoOffset: 0`, and the frame
verification. **No diagnostic click candidate was used. No unverified beat hypothesis was promoted.**

**The three claim classes are kept distinct:**

| class | occurred? |
|---|---|
| `COINCIDENTAL_ALIGNMENT` — a musical event happens to fall near a landmark; nothing selected it | **possible, and not claimed either way** |
| `DIRECTORIALLY_SELECTED_ALIGNMENT` — a window was chosen because it supports the film | **yes, in the weak sense that windows were chosen for contour** |
| `HARD_SYNCHRONIZED_ALIGNMENT` — a landmark moved, or a beat used to place it | **PROHIBITED — did not occur** |

> **An onset near REACH is not evidence that REACH was authored from that onset.**

## 8. WHAT THIS PHASE DID NOT DO

No SFX. No subtitles. No voiceover. No composed music. No click tracks. **No winning window chosen.** No claim
that the film is complete. No final mixing. No beat-detector research. **V1, V2, the contract-proof film, the
original music and all Phase 4A outputs are untouched.**

## 9. REGRESSIONS

Phase 4A **76/76** · timing domain **15/15** · `tsc --noEmit` **clean** · `verify:claims` **15/15** ·
`regression:phase1` **24/24** · `regression:phase2` **6861/6861** ·
`grid.bin` **`49b4c86bcbc5677f`** · **V1 `ab39d78a40e74ba7`** · **V2 `fb8c4175d2bdba32`** ·
`contract-proof-film` **`acc609cc22a69899`** · `P1-serial` **`dd0075dacc0596ca`** ·
`v4-directional.png` **`c9585c1322e62269`** · real track **UNMODIFIED**.

## 10. OPEN DEBT

1. **The third contour class (RESTRAINED_ATMOSPHERIC) yielded no window** — the track contains no 16 s stretch
   that is simultaneously narrow in spread, sparse in onsets and quiet. Recorded, not forced.
2. **`PROGRESSIVE_BUILD` is flat under the film** — the class was assigned from the window's own energy curve
   relative to its own start, and does not predict behaviour against the film's internal structure. **The class
   naming is therefore weaker than it appears**, and this is recorded rather than renamed away.
3. **Both windows end mid-phrase** — no detected boundary justifies either ending. The music's own phrase grid
   does not align with a 16-second span anywhere in the track, which is unsurprising and not fixable by moving
   the film.
4. **Section and phrase inference remains confidence-qualified and unvalidated** — no ground truth exists for
   musical structure, and the section classifier was itself repaired twice in Phase 4A.
5. **Two §11 attention questions are not audio-measurable** and are deferred to the external review.
6. **Only two candidates exist**, so the blind review compares two rather than three.
7. **Everything downstream remains blocked on the external review** — no region may be upgraded, no window
   selected, and no sync claim strengthened until it is recorded.
