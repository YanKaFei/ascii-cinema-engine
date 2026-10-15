/**
 * REGRESSION: FilmSpec v2 must not change the film.
 *
 * This is the strongest statement the v2 DSL can make about non-regression: the
 * loneliness preset, compiled down to FilmSpec v1 and rendered through the unchanged
 * Phase 1 CPU renderer, must produce a BYTE-IDENTICAL `grid.bin` to the frozen Phase 1
 * baseline.
 *
 * If this fails, either the adapter dropped something the renderer reads, or the preset's
 * authoring drifted from the Phase 1 beat table. Both are real bugs; neither is a
 * "close enough" result.
 */

import { createHash } from "node:crypto";
import { suite, test, ok, eq, deepEq, near, note } from "../_harness/harness.js";
import { buildLonelinessPresetV2 } from "../../src/domain/preset-loneliness-v2.js";
import { filmSpecV2ToV1, legacySeedForWordMode } from "../../src/domain/v2-to-v1.js";
import { promptToFilmSpec } from "../../src/domain/planner.js";
import { validateFilmSpecV2 } from "../../src/domain/validate-v2.js";
import { validateFilmSpec } from "../../src/domain/schema.js";
import { renderSequence } from "../../src/render/render.js";
import { encodeGridSequence } from "../../src/render/gridbin.js";

const FROZEN_GRID_SHA256 =
  "49b4c86bcbc5677f5d02eb1012087aa4301615aca289b8d02c58a7cb974757e8";
const FROZEN_SEED = 3912112200;

function gridHash(film: Parameters<typeof renderSequence>[0]): { hash: string; digests: Record<string, string> } {
  const r = renderSequence(film, { startFrame: 0, endFrame: 600 });
  return {
    hash: createHash("sha256").update(encodeGridSequence(r.sequence)).digest("hex"),
    digests: r.sceneDigests,
  };
}

const presetOptions = { duration: 20, fps: 30, width: 1920, height: 1080, quality: "draft" as const };

suite("regression: v2 round-trip preserves the Phase 1 film", () => {
  const v2 = buildLonelinessPresetV2(presetOptions);
  const v1FromV2 = filmSpecV2ToV1(v2);
  const v1Direct = promptToFilmSpec("孤独", {
    durationInSeconds: 20,
    width: 1920,
    height: 1080,
    fps: 30,
    quality: "draft",
    aspect: "16:9",
  });

  test("the v2 preset validates with zero errors and zero repairs", () => {
    const v = validateFilmSpecV2(v2);
    if (!v.ok) {
      const errs = v.issues.filter((i) => i.level === "error").map((i) => `${i.path}: ${i.message}`);
      throw new Error(`v2 preset is invalid:\n  ${errs.join("\n  ")}`);
    }
    eq(v.repairs.length, 0, "no repairs were needed");
    eq(v.issues.filter((i) => i.level === "error").length, 0, "no errors");
  });

  test("the compiled v1 spec validates", () => {
    const v = validateFilmSpec(v1FromV2);
    ok(v.ok, `compiled v1 spec is valid (${v.issues.map((i) => i.message).join("; ")})`);
  });

  test("seed derivation is shared, not restated", () => {
    const expected = legacySeedForWordMode("孤独", 20, 1920, 1080, 30);
    eq(expected, FROZEN_SEED, "the shared seed rule reproduces the frozen seed");
    eq(v2.seed, FROZEN_SEED, "the v2 preset carries the frozen seed");
    eq(v1FromV2.seed, v1Direct.seed, "v2 adapter and v1 planner agree on the seed");
  });

  test("timeline survives the adapter", () => {
    deepEq(
      v1FromV2.shots.map((s) => [s.id, Math.round(s.start * 1e6), Math.round(s.duration * 1e6)]),
      v1Direct.shots.map((s) => [s.id, Math.round(s.start * 1e6), Math.round(s.duration * 1e6)]),
      "shot ids, starts and durations match exactly",
    );
    near(v1FromV2.durationInSeconds, 20, 1e-9, "duration");
    eq(v1FromV2.shots.length, 5, "shot count");
  });

  test("grid.bin is BYTE-IDENTICAL to the frozen Phase 1 baseline", () => {
    const fromV2 = gridHash(v1FromV2);
    eq(fromV2.hash, FROZEN_GRID_SHA256, "v2 adapter produces the frozen grid hash");
  });

  test("grid.bin is byte-identical to the v1 planner path", () => {
    const a = gridHash(v1FromV2);
    const b = gridHash(v1Direct);
    eq(a.hash, b.hash, "adapter and planner produce the same grid");
  });

  test("scene digests are unchanged", () => {
    const a = gridHash(v1FromV2);
    const b = gridHash(v1Direct);
    deepEq(a.digests, b.digests, "per-shot scene digests match");
    deepEq(a.digests, {
      "01": "3f5f4e31",
      "02": "2853384d",
      "03": "46ecf4ea",
      "04": "1bf5b1b5",
      "05": "80eb5c2e",
    }, "scene digests match the frozen baseline exactly");
  });

  test("the adapter is total for everything the renderer reads", () => {
    // Spot-check the fields the v1 renderer actually consumes from each shot.
    v1FromV2.shots.forEach((s, i) => {
      const d = v1Direct.shots[i]!;
      eq(s.camera.kind, d.camera.kind, `shot ${s.id} camera kind`);
      near(s.camera.focusDistance, d.camera.focusDistance, 1e-12, `shot ${s.id} focusDistance`);
      near(s.camera.fovDeg, d.camera.fovDeg, 1e-12, `shot ${s.id} fovDeg`);
      eq(s.layers.length, d.layers.length, `shot ${s.id} layer count`);
      s.layers.forEach((l, li) => {
        const dl = d.layers[li]!;
        eq(l.id, dl.id, `shot ${s.id} layer ${li} id`);
        eq(l.count, dl.count, `shot ${s.id} layer ${l.id} count`);
        near(l.glyphRadius, dl.glyphRadius, 1e-12, `shot ${s.id} layer ${l.id} glyphRadius`);
        near(l.intensity, dl.intensity, 1e-12, `shot ${s.id} layer ${l.id} intensity`);
        near(l.focus, dl.focus, 1e-12, `shot ${s.id} layer ${l.id} focus`);
        eq(l.transform, dl.transform, `shot ${s.id} layer ${l.id} transform`);
        eq(l.depth, dl.depth, `shot ${s.id} layer ${l.id} depth`);
        deepEq(l.bounds, dl.bounds, `shot ${s.id} layer ${l.id} bounds`);
        deepEq(l.noise, dl.noise, `shot ${s.id} layer ${l.id} noise`);
      });
      deepEq(s.density, d.density, `shot ${s.id} density arc`);
    });
  });

  test("the preset is deterministic across builds", () => {
    eq(
      JSON.stringify(buildLonelinessPresetV2(presetOptions)),
      JSON.stringify(buildLonelinessPresetV2(presetOptions)),
      "two builds produce identical JSON",
    );
  });

  test("v2 keeps the v1 technique labels in sync for the report", () => {
    v1FromV2.shots.forEach((s, i) => {
      deepEq(s.techniques, v1Direct.shots[i]!.techniques, `shot ${s.id} techniques`);
    });
  });

  note("the v2 DSL is additive: it compiles to the same film, byte for byte");
});
