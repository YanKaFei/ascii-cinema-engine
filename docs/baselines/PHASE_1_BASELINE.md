# PHASE 1 BASELINE

> **Frozen:** 2026-10-04, immediately after Phase 1 was accepted (`PHASE 1 = PASS`).
> **Machine-readable copy:** [`PHASE_1_BASELINE.json`](./PHASE_1_BASELINE.json) — this
> document is the human-readable narrative; the JSON is what the gate actually reads.

**Phase 2 and every later phase must not silently break any value recorded here.**
Enforcement is automated: `npm run regression:phase1`.

---

## 1. What is being frozen

| | |
|---|---|
| Benchmark | prompt `孤独` (word mode) |
| Version | ASCII Cinema Engine v0.1.0, FilmSpec `1.0.0` |
| Renderer | `CPU_REFERENCE_RENDERER` |
| Output | 1920×1080, 30 fps, 20.000 s, 600 frames, 16:9, black ground, ASCII-only |
| Glyph grid | 240 × 120 cells @ 8 × 9 px (no remainder against 1920×1080) |
| Seed | `3912112200` (derived from the prompt, the duration, the resolution and the fps) |
| Shots | 5 |
| Engine seam | `grid.bin`, `ACGR` v1 |

## 2. Version control

**There is no commit hash, because this directory is not a git repository.** Verified:

```
$ git -C "$REPO" rev-parse --is-inside-work-tree
fatal: not a git repository (or any of the parent directories): .git
```

The baseline is therefore pinned by **content hashes** plus a **source fingerprint**.
No commit hash is invented here.

```
sourceFingerprint = b530d4bb86f5de608224492d5615d7ca3fe9728892806b783546a8626acb0cde
  = sha256( sorted sha256sum of every src/**/*.ts, remotion/**/*.ts(x), scripts/**/*.mjs )
```

The source fingerprint is **recorded, not enforced**: Phase 2 is expected to add source.
It exists so that if a later regression cannot be explained, we can check whether the
engine source at that moment is the source this baseline was taken from.

## 3. Artifact hashes

| Artifact | Bytes | sha256 |
|---|---|---|
| `rough-cut.mp4` | 3 151 323 | `64d173eb02a1c1fb7bbd5ab6649c529776f00229f7522428b785a21a797e2937` |
| `remotion-rough-cut.mp4` | 2 790 294 | `1f6f904a56ce18cb1b6540100dcec8a53177e49535a5c2abeffdf52c0276b194` |
| `grid.bin` | 34 560 564 | `49b4c86bcbc5677f5d02eb1012087aa4301615aca289b8d02c58a7cb974757e8` |
| `film-spec.json` | 15 659 | `626a6c73243e58b34a529d89023cddb1d375c9a43cae362879fc05db9b93b029` |
| `shot-list.json` | 13 816 | `1ca0d13c687cf0da8b54f5a982e565f0bc8bc729c0961d1c92f8d03004f8ede2` |
| `contact-sheet.png` | 46 675 | `a334daab0987181d9dffba48b4cbe281d131f5af674c0efa84bcbdd6d1a3a729` |

## 4. Which of those are enforced byte-for-byte, and why

| Artifact | Byte identity enforced | Reason |
|---|---|---|
| `grid.bin` | **yes** | Pure deterministic engine output. Byte identity is the strongest possible regression signal and Phase 1 was built to guarantee it. |
| `film-spec.json` | **yes** | Pure deterministic planner output. |
| `shot-list.json` | **yes** | Pure deterministic projection of the spec. |
| `contact-sheet.png` | **yes** | Pure deterministic raster + PNG encoder, no external encoder involved. |
| `rough-cut.mp4` | **no** | Encoded by the libx264 build inside `@remotion/compositor-darwin-arm64`. A toolchain upgrade could legitimately change the bitstream without changing a single frame. |
| `remotion-rough-cut.mp4` | **no** | Same reason, plus Chromium rasterisation. |

For the two MP4s the enforced contract is **structural**, not byte-level:

- 600 frames, 20.000 s, 1920×1080, `30/1`, h264, `yuv420p`
- **every frame decodes** with 0 corrupt reports, and the decoded frame count equals 600

### Relaxing a byte-identity gate

If a future phase deliberately changes the visual algorithm — a new splat profile, a
different quantizer, an intentional re-grade — `grid.bin` **will** legitimately differ.
To relax it:

1. set the flag to `false` in `PHASE_1_BASELINE.json`;
2. record the reason in `enforceByteIdentityRationale`;
3. move the old hash into `hashes.previous` so the change is auditable.

Silently downgrading the gate is the failure mode this baseline exists to prevent, so
the regression script prints **every** gate it evaluated and fails loudly rather than
skipping.

## 5. Test count at freeze

```
npm test  ->  dist/src/cli/tests.js  ->  518 965 / 518 965 assertions passed, 0 failures
```

These are the Phase 1 **engine invariants** (glyph-atlas ASCII legality, ramp
monotonicity, schema validation, RNG/noise determinism, projection orientation, camera
focal invariance, scene determinism, per-frame ASCII-only emission, dissolve collapse,
`gridbin` round-trip and corruption rejection, whole-film byte-identical re-render,
tone-curve non-clipping, PNG structure). They are separate from the regression gate:
the invariants test *properties*, the regression gate tests *this exact film*.

## 6. Regression command

```bash
npm run regression:phase1
```

It re-runs the frozen benchmark into `.regression/phase1/` and asserts 24 gates:
spec invariants, seed stability, shot identity, `grid.bin` byte identity, self
determinism across two renders, container/codec/resolution/fps/frame-count/duration,
full decode of every frame, and byte identity of `film-spec.json` and `shot-list.json`.
Result is written to `out/regression-phase1.json`.

**Current status at freeze: 24/24 PASS.**

```
PASS  film spec validates                            version 1.0.0
PASS  width is 1920                                  1920
PASS  height is 1080                                 1080
PASS  fps is 30                                      30
PASS  duration is 20s                                20s
PASS  shot count is 5                                5
PASS  glyph grid is 240x120 @ 8x9                    240x120 @ 8x9
PASS  seed is unchanged                              3912112200 vs 3912112200
PASS  shot ids/starts/durations/cameras unchanged    01:0+4:static 02:4+4:static 03:8+4:lateral-right ...
PASS  grid.bin is byte-identical                     49b4c86bcbc5677f (34560564 bytes)
PASS  re-render is deterministic                     49b4c86bcbc5677f
PASS  container is mp4/mov                           h264
PASS  resolution is 1920x1080                        1920x1080
PASS  frame rate is 30/1                             30/1
PASS  pixel format is yuv420p                        yuv420p
PASS  frame count is 600                             600
PASS  duration is 20.000s                            20s
PASS  every frame decodes                            600 frames, 0 corrupt
PASS  decoded frame count equals 600                 600
PASS  no corrupt decode reports                      0
PASS  film-spec.json is byte-identical               626a6c73243e58b3
PASS  shot-list.json is byte-identical               1ca0d13c687cf0da
PASS  scene digests present for all 5 shots          01=3f5f4e31 02=2853384d 03=46ecf4ea 04=1bf5b1b5 05=80eb5c2e
PASS  frame digests recorded                         271e0f74
```

## 7. Scene digests (the determinism witness)

| Shot | Scene digest |
|---|---|
| 01 | `3f5f4e31` |
| 02 | `2853384d` |
| 03 | `46ecf4ea` |
| 04 | `1bf5b1b5` |
| 05 | `80eb5c2e` |

## 8. What Phase 2 is allowed to change

Allowed without touching this baseline:

- everything under `src/director/`, `src/scene-ir/`, `tests/`, `docs/`, `experiments/`
- new FilmSpec/ShotSpec versions, **as long as the v1 planner path still produces the
  same spec for `孤独`**

Requires an explicit baseline update (with the reason recorded):

- any change to the v1 loneliness beat table
- any change to the splat profile, quantizer, tone curve, or grading constants

**Not allowed at all:**

- a Phase 2 change that makes `npm run regression:phase1` fail and is then "fixed" by
  weakening the gate
