# PHASE 3.3 PLAN — MOTION & CAMERA CINEMATICS

**Status:** PLAN ONLY. Nothing in this document is implemented.
**Predecessor:** `docs/baselines/PHASE_3_FINAL_BASELINE.md` — PHASE 3 VISUAL FOUNDATION = COMPLETE.
**Purpose:** move from *"can the viewer recognise the object?"* to *"can the object move, transform and be
photographed cinematically WITHOUT LOSING RECOGNITION?"*

---

## 0. The core principle, and the constraint it implies

```
SEMANTIC SUBJECT → RECOGNISABLE FORM → BLOCKING → CAMERA → MOTION → ASCII REPRESENTATION → TEMPORAL STABILITY
```

**Recognition must survive motion. The system must never return to `motion first → meaning disappears.`**

**THE HARD CONSTRAINT THIS PHASE INHERITS.** Every recognition result Phase 3 produced is a **still-image**
result. Phase 3.2B's gate was five static frames. **A still can pass while the moving image fails**, for
reasons that do not exist in a still:

| failure mode | why a still cannot reveal it |
|---|---|
| **glyph flicker** | a cell changing character between adjacent frames with no change in the underlying form |
| **contour jitter** | a silhouette edge oscillating by one cell as the mask quantises |
| **plane texture crawling** | directional strokes shifting phase against a moving camera |
| **edge popping** | a junction appearing or vanishing when a sample crosses a threshold |
| **camera-induced glyph instability** | glyph selection driven by quantities that change faster than the form |
| **temporal aliasing** | a form moving less than one cell per frame, so it stands still then jumps |
| **recognition loss** | the form is still "there" numerically but stops reading at some point in the move |

**Therefore Phase 3.3 cannot reuse static recognition as proof of motion quality.** New gates are required,
and they are **temporal**.

---

## 1. Semantic motion

Motion is authored on the **semantic form**, never on glyphs. A `SemanticForm` gains a **motion track** —
position, orientation, scale over shot time — and the ASCII representation is regenerated from the moved
form each frame.

**Stated as a rule:** *nothing animates the glyph field directly.* A glyph change is always a **consequence**
of a semantic change. This is what keeps `motion → meaning disappears` from happening by construction.

**Open question to settle in implementation, not assumed here:** whether the semantic mask is recomputed
per frame (accurate, expensive) or the form's transform is applied to the glyph canvas (cheap, risks the
grammar breaking under rotation). The second is how Phase 3.1 failed. **This must be measured, not chosen.**

---

## 2. Character / body motion

`humanForm` already supports `stand / walk / turn / reach / collapse` as pose modifiers on one skeleton,
and the external gate passed the static `stand`. Planned work:

| motion | approach |
|---|---|
| **stand, walk, turn, reach, collapse** | existing pose modifiers, now **interpolated over time** rather than held |
| **look / orient** | head anchor rotation; needs the head to stay a disc under rotation, which it trivially does |
| **enter frame / exit frame** | a position track crossing the frame boundary; **needs the framing contract to permit a subject off-screen**, which the current 30%-height floor does not |

**The recognition floor must become time-varying.** A figure at 62% of frame height reads; the same figure
at 15% does not. So the readability floor must be **evaluated across the shot**, not at one frame — a
figure that dips below the floor for part of a move violates the gate even if its first and last frames
pass.

---

## 3. Architecture under a moving camera

This is where `skeletonComponents = 100` — currently non-blocking debt — becomes **the primary risk**,
because its stated revisit condition is exactly *"camera-motion breakage or junction flicker."*

**What must be measured before anything else:**

- does the architectural skeleton stay **one reading** as the camera translates, or do junctions separate
  visibly?
- does `v4-directional`'s stroke orientation **update continuously** with the plane, or does it flip at
  some camera angle?
- does the **plane priority hierarchy** still prevent texture from erasing a junction when the junction is
  moving?

**A moving camera changes the projected geometry every frame**, so every clip in the pipeline
(near-plane clipping, viewport clipping, rasterisation) runs per frame on geometry that is constantly
crossing its own thresholds. **This is the highest-risk area in the phase.**

---

## 4. Temporal ASCII stability — proposed as a FIRST-CLASS GATE

Proposed metrics, each computed over a shot's frames:

| metric | definition | proposed gate |
|---|---|---|
| **glyph churn** | fraction of cells whose character changes between consecutive frames | must track the semantic change — measured against a **static-camera, static-form control**, where it must be ~0 |
| **form churn ratio** | glyph churn **inside** the subject's box vs churn in the background | background churn is flicker, not motion |
| **contour jitter** | per-frame displacement of the silhouette's boundary cells | must be monotone with the form's own motion |
| **recognition floor over time** | subject height fraction **every frame** | must stay above the floor for the whole shot |
| **structure retention** | junction cells present per frame vs the static reference | must not collapse mid-move |

**The control is the important part.** A static camera on a static form must produce **zero** glyph churn.
Any non-zero value there is flicker by definition, and it is the cleanest possible detector.

---

## 5. Camera grammar

| move | cinematic use | technical risk | needs |
|---|---|---|---|
| **STATIC** | the baseline; already the only tested case | none | — |
| **PUSH IN** | emphasis, reveal | low | subject scale grows; **recognition floor must hold** |
| **PULL OUT** | isolation, loss | **medium** | subject shrinks toward the floor |
| **TRUCK L/R** | parallax, following | medium | plane edges slide across the viewport clip |
| **PAN** | scanning | medium | the room must extend past the frame; **architecture leaves and enters** |
| **TILT** | vertical reveal | medium | ceiling and floor enter frame |
| **CRANE / PEDESTAL** | elevation change | **high** | the eye height moves relative to the room's own height |
| **ORBIT** | spatial understanding | **high** | **the side walls swap roles**; `dir` per plane may need to change |
| **FOLLOW** | character-centric | medium | depends on character motion (§2) |
| **HANDHELD** | immediacy | **high** | jitter is **exactly** what causes glyph flicker |
| **WHIP** | transition energy | **high** | fast motion + temporal aliasing |
| **DOLLY ZOOM** | disorientation | **high** | scale and perspective move oppositely; the room's framing contract breaks by design |

**Classification summary:**

- **cinematically useful, technically safe:** static, push in, truck, pan, tilt
- **useful, needs geometry support:** crane/pedestal (eye height), orbit (plane role swap), follow
- **needs temporal-stability support before it can be attempted:** handheld, whip, dolly zoom

**Do not implement all because they are listed.** The plan's recommendation is to implement **push in**
first, because it is the only move that changes the projected geometry **continuously and monotonically**
with no new geometry requirement — the cleanest possible test of the temporal gate.

---

## 6. Shot composition under motion

Phase 3.2B froze a **static** framing contract. Under motion the equivalent must be **time-varying**:

- the readability floor (subject ≥ 30% of frame height) evaluated **per frame**
- the enclosure condition (all four planes reach the viewport) — **is it required every frame, or only at
  the shot's establishing moment?** A pan deliberately breaks enclosure, so the contract must distinguish
  *establishing* frames from *travelling* frames
- the collision audit currently runs on **static** projected boxes; it must run **per frame**, and a
  collision that occurs mid-move matters even if both ends are clear

---

## 7. Transitions

The engine has 9 of 9 named transition kinds reachable, and Phase 1 already ships a dissolve. Under the
readability architecture a transition is a **semantic** operation:

- **within a shot:** a form changes state (assemble, fragment, erase, dissolve)
- **between shots:** one shot's semantic scene gives way to the next

**The recognition question for a transition is whether BOTH sides read** — a dissolve from a readable frame
to a readable frame passes through frames that may read as neither. **Proposed gate:** sample the dissolve's
midpoint and require the subjects to remain identifiable, or explicitly declare the dissolve *intentionally
illegible*.

---

## 8. Recognition preservation

The phase's central rule, expressed as an authoring constraint:

> **Every motion must be accompanied by a per-frame readability check, and a motion that breaks recognition
> is a failed motion even if its endpoints pass.**

This inverts the current authoring order. Today a shot is composed, then measured. In Phase 3.3 the
**readability check must run during authoring** — the same way the collision audit now runs on beats.

---

## 9. Motion hierarchy

When several things move, a viewer can track only a few. Proposed declared hierarchy, per shot:

1. **primary subject motion** — the one thing the shot is about
2. **camera motion** — must not compete with (1) at the same rate
3. **secondary subject motion** — supporting
4. **environment motion** — architecture change, atmosphere
5. **glyph-level motion** — density shift, character flow

**The rule to enforce:** if (2) and (1) move at similar rates, the shot reads as neither. This is a
declarable constraint, not a rendering one.

---

## 10. Benchmark clips — proposed

Each **3–5 seconds, 1920×1080, silent**, no music.

### Benchmark A — PERSON WALKS INTO ROOM
**Tests:** human recognition under motion, room stability, static camera or gentle track.
**Rationale:** the simplest possible motion against a fixed background, so any glyph churn is attributable
to the subject alone.

### Benchmark B — PERSON APPROACHES NAME ON WALL
**Tests:** blocking, diegetic text, depth, camera push, occlusion.
**Rationale:** exercises the **occlusion** relationship the external gate already confirmed statically, now
with both the figure and the camera moving.

### Benchmark C — ROOM DISAPPEARS AROUND PERSON
**Tests:** architecture transformation, `ExposureIntent`, semantic emptiness, recognition → absence.
**Rationale:** exercises `preserve-emptiness` (measured at 5 lit cells) as a **motion**, which is where the
Phase 3 regression lived.

---

## 11. Proposed order of work

| step | work | why first |
|---|---|---|
| 1 | **static-camera, static-form control** and its temporal metrics | establishes the **zero-churn baseline**; without it, flicker cannot be distinguished from motion |
| 2 | **motion tracks on `SemanticForm`**, mask recomputed per frame | the mechanism everything else depends on |
| 3 | **temporal gate** implemented and run on step 1's control | the gate must exist before the thing it gates |
| 4 | **push in** — the safest move, continuous and monotonic | first real camera motion, against a proven gate |
| 5 | **walk** — first character motion | first subject motion |
| 6 | Benchmark A | first clip |
| 7 | **orbit** and the `skeletonComponents` revisit | the debt's stated revisit condition |
| 8 | Benchmarks B and C | |

**Steps 1 and 3 precede any motion because a temporal gate that does not exist cannot reject anything.**
This is the same ordering lesson the collision audit taught: **a check that is not wired in prevents
nothing.**

---

## 12. Explicitly out of scope for Phase 3.3

- **audio** — no music, no sync, no SFX, no subtitles. That is a later phase.
- **photoreal detail** — the grammar is silhouette, glyph topology and perspective topology
- **implementing the whole camera vocabulary** — the plan classifies; implementation follows measurement

---

## 13. The open risks, stated

1. **`skeletonComponents = 100`** — recorded as non-blocking debt **specifically because its revisit
   condition is camera-motion breakage**, which this phase introduces. It is the most likely first failure.
2. **Per-frame mask recomputation cost** — 90 frames × 1920×1080 masks may be slow enough to change how
   shots are authored. Unmeasured.
3. **The framing contract is static.** A pan or pull-out breaks it by design, so the contract must become
   time-varying before those moves are attempted.
4. **Rotation is untested in the whole grammar.** Every form so far is authored facing the camera. An orbit
   rotates the *camera* rather than the form, which sidesteps the problem — **but only if the forms stay
   camera-facing, which is a real constraint on what the director can express.**
