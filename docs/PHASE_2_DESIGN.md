# PHASE 2 DESIGN — Director DSL, Grammar, Scene IR

> Written during **Gate 2A**. This is the design contract for Phase 2's director layer.
> Where it describes something built, it exists and is tested; where it describes
> something planned, it is marked `[2B]`, `[2C]`, `[2D]`, `[2E]`.
>
> It is a *design* document, not a report. It records what the types are, why they are
> shaped that way, and which alternatives were rejected.

---

## 1. The problem, stated as a testable claim

Phase 1's failure risk is not rendering. It is this:

> Given four different concepts, does the system make four different films?

The failure mode to design against is explicit:

```
small dot → particles → humanoid → push-in → dissolve
```

If that sequence comes out of every prompt, the system has **one movie**, whatever its
feature list says. So the architecture is judged by whether different meanings are
*forced* into different structures.

**Design consequence.** Meaning has to be represented explicitly, because a system can only
differ structurally if it knows *what it is about*. That is the entire justification for
FilmSpec v2.

## 2. FilmSpec v2 — the director DSL

`src/domain/film-spec-v2.ts`

Three concerns, deliberately separated, because v1 conflated them:

| Block | Question it answers | Never contains |
|---|---|---|
| `input` | What did the user give us, and how did we decide that? | interpretation |
| `interpretation` | What is the film **about**? | pixels, cameras, durations |
| `direction` | **How** does that become a film? | per-shot realisation |

`shots[]` is the realisation. The rule: **every shot must be derivable from
`interpretation` + `direction`**, and every field in `interpretation` must be traceable to
the input.

### 2.1 Why `interpretation` is not optional

The tempting shortcut is to let the planner jump straight from prompt to shots. That is
what v1 did, and it is why v1 cannot generalise: without a stated meaning there is nothing
for a shot to *serve*, so every shot defaults to the same visual vocabulary.

Requiring an `emotionalArc`, `motifs` (each with a `development` list), `oppositions` (each
with a `staging`), a `spatialMetaphor` and a `transformationLogic` means the planner must
commit to a reading before it can commit to an image. It also makes the reading auditable
and rejectable.

### 2.2 `spatialMetaphor` + `spaceKind` — the diversity hinge

```ts
spatialMetaphor: string;
spaceKind: SpaceKind;   // closed vocabulary
```

This is the single most important pair of fields for structural diversity. Different
abstract ideas imply different *spatial* ideas, and space is what determines shot
topology:

| Input | Spatial metaphor | Space | Consequence for shots |
|---|---|---|---|
| 孤独 | a void discovered to be full | `void`, `radial-space` | wide empty frames, radial convergence |
| 欲望 | an object that retreats as you approach | `corridor` | axial pursuit, repeated approach-and-loss |
| 时间 | one place at many moments | `vertical-space` / `layered-depth` | strata, accumulation, no pursuit |
| 被遗忘的名字 | a room that holds an absence | `room` | enclosure, threshold, an empty position |

If two films share a `spaceKind`, the diversity report flags the similarity — because that
is the mechanism by which they would collapse into one movie.

### 2.3 `transformationLogic` is optional, and that matters

`transformationLogic?: {...}` — a film about a **state** (时间, arguably) has no single
one-way change, and forcing one would produce a false climax. An optional field here is a
statement that *not every film turns*, which is itself a structural difference the
diversity report can measure.

### 2.4 `provenance` and `repairs` — the LLM boundary made auditable

```ts
provenance: {
  interpreter: "deterministic" | "llm" | "preset";
  model?: string;
  planners: { id: string; summary: string }[];
  repairs: { path: string; problem: string; action: "repaired" | "defaulted" | "dropped" }[];
  seedTemplate?: string;
}
```

`repairs` is the load-bearing part. The brief's rule is that invalid LLM output must be
**rejected, repaired, or fall back — never silently ignored**. A silent ignore is
invisible; a recorded repair is not. Every repair the validator applies is written here and
surfaces in `director-report.json`.

`interpreter: "llm"` requires a named `model`, so an LLM-produced spec cannot be
unattributed.

## 3. ShotSpec v2 — a shot that knows why it exists

`src/domain/shot-spec-v2.ts`

Three fields are **required and validated**:

```ts
narrativeFunction: NarrativeFunction;  // why this shot exists in the film
intention: string;                     // what it does to the audience
visualReason: string;                  // why THIS IMAGE serves the intention
cameraReason: string;                  // why the camera behaves this way
```

plus

```ts
camera: { move: CameraMoveSpec; reason: CameraReason; reasonDetail: string; rhythmCoupling }
```

`reason` comes from a **closed vocabulary of 13 reasons**
(`increase-psychological-pressure`, `approach-inaccessible-object`, `reveal-density`,
`withdraw-from-absence`, …). "Because shot 3 always pushes in" is not on the list and
cannot be expressed. This is the camera-motivation test made structural rather than
aspirational.

### 3.1 `visualForm` on subjects — the semantic/physical bridge

```ts
subjects: { id, description, visualForm: SubjectKind, role: SubjectRole, text?, prominence }[]
```

`description` is semantic ("the name that was erased"); `visualForm` is physical
(`word`, `figure`, `void`, `boundary`…). This is how a semantic subject becomes renderable
without the planner inventing a renderer.

`text` is required when `visualForm` is `word` or `glyph`, and it is **ASCII-validated** —
the medium's constraint reaches all the way up into the DSL.

### 3.2 `causedBy` — causal camera/transformation

```ts
transformation: { kind, subjectId, becomes, from, to, dramaticPurpose,
                  causedBy: "camera" | "subject" | "environment" | "time" | "external" }
```

Benchmark C requires that "camera and transformation have a causal relationship". A free-text
claim would be unverifiable; `causedBy` makes the relation a checked enum, so the report can
assert it and the diversity report can measure it.

### 3.3 Rhythm is sampled, not invented per shot

```ts
rhythm: { energy, tension, informationDensity, motionDensity,
          source: "curve" | "override", overrideReason? }
```

`source: "curve"` means these were sampled from the film-level curves in
`direction.rhythm`. `override` requires a reason. That is how rhythm becomes a global layer
instead of isolated per-shot easing, while still permitting a deliberate departure.

## 4. The visual grammar

`src/director/grammar/vocabulary.ts`

A **closed vocabulary**, not free text:

| Category | Count | Examples |
|---|---|---|
| `SUBJECT_KINDS` | 11 | point, glyph, word, figure, crowd, field, structure, architecture, void, boundary, trail |
| `SPACE_KINDS` | 10 | void, plane, corridor, tunnel, room, field, layered-depth, radial-space, vertical-space, infinite-grid |
| `COMPOSITION_KINDS` | 10 | centered, isolated, symmetrical, asymmetrical, edge-weighted, negative-space, compression, expansion, foreground-obstruction, deep-axis |
| `MOTION_KINDS` | 11 | drift, orbit, converge, diverge, pulse, flicker, fall, rise, flow, tremble, hold |
| `TRANSFORMATION_KINDS` | 12 | assemble, disassemble, fragment, merge, replace, erode, grow, collapse, multiply, vanish, invert, crossfade-density |
| `CAMERA_REASONS` | 13 | see §3 |
| `NARRATIVE_FUNCTIONS` | 9 | establish, introduce, pursue, reveal, transform, rupture, collapse, resolve, open |
| `TRANSITION_KINDS` | 4 | cut, dissolve, match-cut, fade-through-void |
| `OCCLUSION_POLICIES` | 4 | additive, nearest, alpha, mask |

### 4.1 Why closed, and the bug that proved it

A closed vocabulary gives three things: unknown terms become **errors** rather than
silently ignored fields; diversity becomes **measurable** as term distributions; and the
cinematographic vocabulary stays independent of its implementation, so a GPU renderer needs
no new grammar.

This was not theoretical. While writing the v2 preset, a shot was briefly given
`spaceKind: "compression"` — a **composition** term used where a **space** term belongs.
The compiler rejected it. A free-string field would have accepted it, and the meaning would
have been silently lost.

A second instance of the same class was found in the validator: it had its own local copy
of the space list, which had already drifted from the grammar by omitting `tunnel`. The
validator now imports the grammar as the single source of truth.

### 4.2 A category error the design now prevents

`compression` is a composition; `compressing` space is a consequence of camera + composition,
not a space. Keeping the categories disjoint means the planner has to say *how* the space is
compressed, which is a directorial decision, rather than naming a feeling.

## 5. Scene IR

`src/scene-ir/types.ts`

### 5.1 Why

In Phase 1, `render/frame.ts` imported `domain/schema.ts`. The renderer therefore had an
opinion about the director's structure — the exact thing that makes a second backend
expensive.

Scene IR is the **lowest complete description of a frame's inputs** and nothing above it:

```
FilmSpec v2 → ShotSpec v2 → SceneIR → renderer → AsciiFrame → grid.bin → Remotion
```

`grid.bin` is retained as the renderer→playback seam. Scene IR sits **above** it; it does
not replace it.

### 5.2 Camera is a sampled track, not a move description

```ts
camera: { reason: string; focal: number; keys: CameraKey[] }
CameraKey = { frame, position, target, fovY, roll, worldToCells, subjectLineY }
```

The compiler samples the track at frame resolution, so **the renderer never evaluates
easing or framing maths**. This is deliberate: Phase 1's worst bugs were geometry
re-derivations in multiple places. If camera geometry exists in exactly one place
(compiler) and is consumed as data, two renderers cannot disagree about it. `focal` is
carried and asserted to be 1.

### 5.3 Units are named in the type

```ts
glyphRadius: number;   // in CELLS
intensity: number;     // luminance per cell at a primitive's centre
worldToCells: number;  // cells per world unit
```

Three of Phase 1's eight defects were one class: a quantity authored in one unit
interpreted in another. Naming the unit in the comment is not enough; the design rule is
that the *only* place a world-unit footprint exists is the compiler, and Scene IR carries
cells.

### 5.4 Depth policy is a first-class layer property

```ts
semantics: { subjectId?, role, shape, occlusionPolicy: "additive" | "nearest" | "alpha" | "mask" }
```

`additive` is Phase 1's behaviour (splats sum; nothing hides anything). `nearest` is a basic
z-buffer and is what Gate 2C implements, with a dedicated regression test. The requirement
is modest and explicitly not physically correct: **a near primitive must be able to hide a
far one.**

### 5.5 The renderer interface

```ts
interface AsciiRenderer {
  readonly id: "cpu" | "gpu";
  readonly description: string;
  renderFrame(scene: SceneIR, frame: number): Promise<AsciiFrame>;
  renderShot(scene: SceneIR, onProgress?): Promise<AsciiFrame[]>;
}
```

| backend | status | role |
|---|---|---|
| `cpu` | **exists** (formalised 2C) | `CPU_REFERENCE_RENDERER`. Deterministic, dependency-free, CI-friendly. The reference implementation and what the Phase 1 baseline pins. |
| `gpu` | **[2C]** spike only | `GPU_PRODUCTION_RENDERER`. Three.js + GLSL. Not allowed to replace `cpu` in Phase 2. |

`AsciiFrame.stats.hadNaN` exists so the "no NaN" gate is a property of the renderer's
output rather than a separate scan.

## 6. Validation and the repair ledger

`src/domain/validate-v2.ts`

Two levels:

- **`errors`** — the spec cannot be compiled. Unknown grammar term, missing reason, a
  non-ASCII `word` subject, an act owning a nonexistent shot, non-contiguous shots, a
  curve that is not sorted or leaves 0..1.
- **`repairs`** — safe, recorded fixes. Each carries `path`, `problem` and
  `action: repaired | defaulted | dropped`, and is copied into
  `FilmSpecV2.provenance.repairs`.

What is repaired automatically is deliberately narrow: a missing *transition* reason, a cut
with a nonzero duration, a non-finite seed. Anything semantic — a missing
`visualReason`, an unknown transformation — **fails validation** so it is impossible to
ship a film whose meaning was silently dropped.

`applySafeRepairs` re-runs validation afterwards, so `ok` reflects the repaired state rather
than the pre-repair state.

## 7. The v2 → v1 compiler

`src/domain/v2-to-v1.ts`

v2 is the meaning-bearing representation; v1 is the executable one the Phase 1 CPU renderer
consumes. This is an ordinary IR arrangement, and it is what lets Phase 2 be additive rather
than a rewrite.

The non-regression guarantee, asserted in `tests/regression/v2-roundtrip.test.ts`:

```
buildLonelinessPresetV2()  →  filmSpecV2ToV1()  →  renderSequence()  →  encodeGridSequence()
                                                                              │
                                                                  sha256 == 49b4c86b…
                                                          (the frozen Phase 1 baseline)
```

The preset does **not** restate camera/density/layer authoring. It reads the exported
`LONELINESS_BEATS` table, so the preset and the Phase 1 planner cannot drift apart. Two
bugs were caught by this during 2A:

1. The preset restated the seed formula with the *slug* instead of the raw word, silently
   producing a different film. The rule is now a shared exported function.
2. The v2 round-trip initially produced a different grid because of that seed divergence;
   byte-identity is asserted rather than approximated.

## 8. What Scene IR will change in 2C (and what it will not)

Will change: `render/frame.ts` consumes `SceneIR` instead of `domain/schema.ts`;
`cpu-renderer.ts` and `gpu-renderer.ts` implement `AsciiRenderer`; `nearest` occlusion
lands; `grid.bin` is produced from `AsciiFrame[]`.

Will **not** change: `grid.bin`'s format, the Phase 1 baseline, the determinism guarantee,
the ASCII-only assertion, or the CLI's external interface. The adapter chain means the
Phase 1 film continues to render byte-identically through the new path, and that is a gate.

## 9. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Free-string shot descriptions | Not validatable, not measurable, and the "compression as a space" bug would have shipped silently. |
| Let the LLM emit ShotSpecs directly | Removes the compiler, so per-frame decisions become non-deterministic and unauditable. The LLM boundary is meaning-only. |
| Delete v1 and rewrite on v2 | Destroys the frozen baseline and the reference implementation. Phase 2 must be additive. |
| Make Scene IR the FilmSpec | Collapses meaning and realisation back into one type, which is exactly v1's defect. |
| Per-shot rhythm only | Cannot express a film-level release/tail; rhythm must be a global layer that shots are cut to. |
| Encode occlusion into the renderer as a flag | Depth policy is a property of a *layer's meaning* (is this the far plane, or a thing in front?), so it belongs in the IR. |
