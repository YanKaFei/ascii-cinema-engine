# CAMERA & DIRECTOR GRAMMAR

**Status:** canonical after the Phase 3.3E external blind review.
**Companions:** `docs/ASCII_MOTION_GRAMMAR.md` (expression grammar) · `docs/PHASE_3_3F_SHOT_GRAMMAR.md` (planning layer).
**Source:** the external review of `out/phase33e/blind-review/` resolved against the delivered hashes.

---

## 1. The finding that created this document

Phase 3.3E rendered **the same geometric camera move three times** and the external review rated the three
differently. The move was `push-in`, `cameraZ 0.9315 → 0.7841`, a solved **10.0%** projected scale
increase, in every version. **Only the timing of the move differed.**

| version | sha256 | when the camera began | external result |
|---|---|---|---|
| **VERSION B** | `346c81d19ba8df8e…` (`clip-01`) | when the reach became legible | **STRONGEST / WINNER** |
| VERSION A | `e663d35ce7a60561…` (`clip-02`) | before the action established | **PASS, second** — valid anticipatory alternative |
| static control | `7e7b29ca2ccb99b3…` (`clip-03`) | never | **VALID** — clearest action, less cinematic intention |

### The external readings, recorded

**VERSION B — STRONGEST.** *"The person reaches toward NAME. The action becomes legible first. The camera
then feels as though it moves in response to the importance of the action. NAME subsequently fragments.
Causality remains clear. The camera adds cinematic intention without outranking the physical action."*

**VERSION A — PASS, SECOND, and NOT a failure.** *"The causal reading survives. However, the camera movement
becomes perceptible slightly before the dramatic action fully establishes itself. It creates anticipation.
This is not inherently wrong, but for the tested causal intention the camera feels slightly ahead of the
subject."*

**STATIC — the cleanest control.** *"The reach → fragmentation relationship remains highly readable. The
static camera provides the cleanest action demonstration. However, it has less cinematic intention than
VERSION B."*

## 2. `CANONICAL_CAMERA_MOTIVATION = ACTION_RESPONSIVE`

The winning relationship:

```
PHYSICAL ACTION BEGINS
  → ACTION BECOMES READABLE
  → CAMERA RESPONDS
  → CAUSAL HOLD
  → ASCII CONSEQUENCE
```

⚠ **This is not `camera starts at frame 28`.** The general rule is semantic and perceptual: **camera motion
is motivated by the readable dramatic event.** In the code the camera begins at a **declared action
progress** (`beginsAtActionProgress`), and `validateCameraIntent` **refuses** an `action-responsive` intent
that does not declare one — because a motivation defined by *when relative to the action* cannot be
expressed as a frame.

## 3. ⚠ `ACTION_RESPONSIVE` IS NOT A UNIVERSAL CAMERA LAW

It is canonical **for the tested shot** `REACH → LETTER_FRAGMENT`. VERSION A demonstrated that
**anticipatory** camera is a different valid grammar, not a lesser one. The external note names the dramatic
intentions it serves, and they are recorded in `MOTIVATION_INTENT`:

| motivation | the rule it asserts | what it serves |
|---|---|---|
| **`static`** | the camera does not move for the whole shot | the action carries the shot; the cleanest demonstration; restraint |
| **`action-responsive`** | motion begins after the primary action is perceptually legible | the camera appears to answer the action; dignity granted to an action; causality with cinematic intention |
| **`anticipatory`** | motion begins before the expected event | foreboding · inevitability · danger approaching · psychological pressure · **the world knowing before the character** |
| **`consequence-responsive`** | motion begins only after the consequence has occurred | the consequence is the subject; aftermath; the camera as a late witness |
| **`subject-following`** | motion keeps a moving subject framed | sustained physical action; travel |
| **`reveal`** | motion discloses information not previously visible | a withheld fact; spatial discovery |

**`static` is a DECISION, not an absence.** Fixture B in the shot grammar declares `static` deliberately —
the room's withdrawal is the event, and a moving camera would compete with it.

## 4. `CAMERA MOVE != CAMERA MOTIVATION`

This distinction is enforced by the type model, not only documented:

```
CameraMove:         push-in
CameraMotivation:   action-responsive     →  the camera answers the action

CameraMove:         push-in
CameraMotivation:   anticipatory          →  the world knows before the character
```

**The geometry is identical. The directorial meaning is different.** `validateCameraIntent` catches the
combinations that are meaningless rather than merely unusual: a moving camera with `static` motivation, a
`none` move with `action-responsive`, or `anticipatory` declared with a late start — which would be a
different motivation wearing the wrong name.

## 5. Phase 3.3E PASS condition, answered

| condition | result |
|---|---|
| at least one camera version preserves the established causal reading | **PASS** — B and A both preserve it; effect onset f35 in all three versions |
| judged more cinematic than the static control | **PASS** — B rated STRONGEST, static rated lower on cinematic intention |
| without reducing action readability | **PASS** — the static control still rated the *clearest* action, so B added intention without a readability cost |

**The `STATIC CAMERA IS STRONGER` fallback was not needed** — recorded because the condition existed, and
because a future shot may well return it.

## 6. Machine measurements preserved

| measure | static | A | B |
|---|---|---|---|
| effect onset | f35 | f35 | f35 |
| reach readable | f28 | f28 | f28 |
| hand → NAME | 204 → 144 → 60 px | 204 → 146 → 65 px | 204 → 144 → 66 px |
| camera-induced peak per-frame screen motion | 0 px | 1.29 px | 1.65 px |
| subject hand peak per-frame screen motion | 3.48 px | 3.48 px | 3.48 px |
| **camera / subject ratio** | 0.00 | **0.37** | **0.47** |
| NAME absent frames | 0 | 0 | 0 |
| human absent frames | 0 | 0 | 0 |

**The camera's peak motion stays below the subject's in every version** — 37% and 47% — which is the
mechanical form of *"without outranking the physical action."* The §7 rejection condition was never met.

## 7. Causal hold scope — unchanged

`CAUSAL_HOLD_RATIO = 0.25` remains **the validated default for `REACH → LETTER_FRAGMENT` only.** It is not
generalised to `WALK`, `TURN`, `FALL`, `ENTER` or `EXIT`. The invariant stays:

```
CAUSE START → CAUSE READABLE → PERCEPTUALLY SUFFICIENT CAUSAL HOLD → EFFECT
```

See `docs/ASCII_MOTION_GRAMMAR.md` for why each action class has a different readable phase.
