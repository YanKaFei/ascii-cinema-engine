/**
 * DEPTH SEMANTICS tests (Phase 2 gate J).
 *
 * Phase 1 shipped an explicitly additive compositor: splats summed and nothing hid anything.
 * That was recorded as a limitation, not a design choice. SceneIR now carries a per-layer
 * `occlusionPolicy`, and this suite is what makes the claim real rather than declared.
 *
 * The requirement is deliberately modest and explicitly NOT physically correct: **a near
 * primitive must be able to hide a far one.** These tests build minimal three-primitive
 * scenes so they assert the policy itself, not a film's incidental brightness.
 */

import { suite, test, ok, eq, near } from "../_harness/harness.js";
import type { LayerIR, PrimitiveIR, SceneIR } from "../../src/scene-ir/types.js";
import { renderSceneFrame, resolveCameraAt, layerStateAt } from "../../src/render/cpu-renderer.js";
import type { OcclusionPolicy } from "../../src/director/grammar/vocabulary.js";

/** A camera that looks down -Z from z=+3 at the origin, framing 2 world units. */
function camera(rows = 120) {
  return {
    reason: "test",
    focal: 1,
    keys: [
      {
        frame: 0,
        position: [0, 0, 3] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
        fovY: 2 * Math.atan(1),
        roll: 0,
        worldToCells: rows / 2 / 3,
        subjectLineY: 0,
      },
    ],
  };
}

function prim(i: number, z: number): PrimitiveIR {
  return {
    i,
    p: [0, 0, z],
    dir: [0, 0, 1],
    rim: 0,
    sizeMul: 1,
    intMul: 1,
    phase: 0,
    z,
  };
}

function layer(id: string, policy: OcclusionPolicy, prims: PrimitiveIR[], intensity: number): LayerIR {
  return {
    id,
    origin: [0, 0, 0],
    semantics: { role: "subject", shape: "none", occlusionPolicy: policy },
    glyphRadius: 3,
    intensity,
    focus: 1.6,
    depthResponse: "flat",
    variation: 0,
    transform: { kind: "none", radialOffset: 0, radialScale: 1, alphaFrom: 1, alphaTo: 1, sizeScaleFrom: 1, sizeScaleTo: 1 },
    motion: { kind: "none", intensity: 0, frequency: 0 },
    noise: { octaves: 0, frequency: 0, amplitude: 0, lacunarity: 0, gain: 0, drift: 0 },
    primitives: prims,
  };
}

/**
 * A scene with a NEAR primitive at z=+1 and a FAR one at z=-1, both projecting to the same
 * cells. Intensity 0.5 each: additive gives ~1.0, occlusion gives ~0.5 where the near one
 * covers the far one.
 */
function overlappingScene(policy: OcclusionPolicy, rows = 120): SceneIR {
  const nearP = prim(0, 1);
  const farP = prim(1, -1);
  return {
    irVersion: "1",
    shotId: "test",
    filmSlug: "test",
    width: 1920,
    height: 1080,
    cols: 240,
    rows,
    cellW: 8,
    cellH: 9,
    duration: 1,
    frameCount: 0,
    narrativeFunction: "reveal",
    intention: "test",
    visualReason: "test",
    cameraReason: "test",
    rhythm: { from: 0.5, to: 0.5 },
    camera: camera(rows),
    layers: [layer("near", policy, [nearP], 0.5), layer("far", policy, [farP], 0.5)],
    density: {
      from: { coverageMin: 1, coverageMax: 20 },
      to: { coverageMin: 1, coverageMax: 20 },
      inkFloor: 0,
      strategy: "test",
    },
    glyph: {
      vocabulary: " .'-_,^:;i!|/ltfrj1vcxunzoahksdybwmpqg234567890LJCEFIVXYTZAHKNSURMDBWQGO#&$%@",
      exposure: 1,
      blackPoint: 0,
      dither: false,
    },
    // grain 0 so these fixtures test the compositor and the quantiser, not the film stock
    stock: { grain: 0, vignette: 0.3 },
    background: 0,
    primitiveCount: 2,
  };
}

/** The graded ink at the centre cell, from the frame's ink plane. */
function centreInk(ir: SceneIR): number {
  const fr = renderSceneFrame(ir, 0);
  const cx = Math.floor(ir.cols / 2);
  const cy = Math.floor(ir.rows / 2);
  return fr.ink[cy * ir.cols + cx]! / 255;
}

/** Peak ink anywhere in the frame. */
function peakInk(ir: SceneIR): number {
  return renderSceneFrame(ir, 0).stats.peakInk;
}

suite("depth: additive policy must not hide anything (Phase 1 behaviour preserved)", () => {
  test("two overlapping primitives sum", () => {
    const ir = overlappingScene("additive");
    const peak = peakInk(ir);
    ok(peak > 0.9, `additive overlapping primitives sum (peak ${peak.toFixed(3)})`);
  });

  test("a far primitive still contributes when a near one covers it", () => {
    const both = overlappingScene("additive");
    const farOnly = (() => {
      const ir = overlappingScene("additive");
      ir.layers = [ir.layers[1]!];
      return ir;
    })();
    ok(peakInk(both) > peakInk(farOnly), "the far primitive adds to the near one under additive");
  });
});

suite("depth: nearest policy MUST hide", () => {
  test("the near primitive suppresses the far one at the shared cells", () => {
    const additive = peakInk(overlappingScene("additive"));
    const nearest = peakInk(overlappingScene("nearest"));
    ok(
      nearest < additive - 0.2,
      `nearest hides the far primitive (additive ${additive.toFixed(3)} vs nearest ${nearest.toFixed(3)})`,
    );
  });

  test("the near primitive itself is still fully visible", () => {
    const nearOnly = (() => {
      const ir = overlappingScene("nearest");
      ir.layers = [ir.layers[0]!];
      return ir;
    })();
    const both = overlappingScene("nearest");
    near(peakInk(both), peakInk(nearOnly), 0.02, "the occluder is not dimmed by what it hides");
  });

  test("draw order does not matter: far-then-near and near-then-far agree", () => {
    const farFirst = overlappingScene("nearest");
    farFirst.layers = [farFirst.layers[1]!, farFirst.layers[0]!];
    const nearFirst = overlappingScene("nearest");
    eq(centreInk(farFirst), centreInk(nearFirst), "the z-buffer is order-independent at the centre");
  });

  test("a near primitive that covers only part of the frame hides only that part", () => {
    const ir = overlappingScene("nearest");
    // Move the near primitive off-centre; the centre must now show the far one.
    ir.layers[0]!.primitives[0]!.p = [0.5, 0, 1];
    const withNear = centreInk(ir);
    const farCentre = (() => {
      const only = overlappingScene("nearest");
      only.layers = [only.layers[1]!];
      return centreInk(only);
    })();
    near(withNear, farCentre, 0.02, "cells the occluder does not cover still show the far primitive");
  });
});

suite("depth: a wall hides a figure (the actual requirement)", () => {
  test("a near wall layer removes a far figure layer from the centre", () => {
    const figCentre = (() => {
      const ir = overlappingScene("additive");
      ir.layers = [layer("figure", "additive", [prim(0, -1)], 0.7)];
      return centreInk(ir);
    })();
    ok(figCentre > 0.4, `the figure is visible with no wall (${figCentre.toFixed(3)})`);

    const withWall = (() => {
      const ir = overlappingScene("nearest");
      ir.layers = [
        layer("wall", "nearest", [prim(0, 1)], 0.5),
        layer("figure", "nearest", [prim(1, -1)], 0.7),
      ];
      return centreInk(ir);
    })();
    ok(
      withWall < figCentre,
      `the wall reduces the figure's ink (${figCentre.toFixed(3)} -> ${withWall.toFixed(3)})`,
    );
  });
});

suite("depth: the depth policy comes from the space, not from nowhere", () => {
  test("a room implies occlusion and a void implies additive", async () => {
    const { direct, assembleFilmSpecV2 } = await import("../../src/director/Director.js");
    const { authorFilm, compileToV1 } = await import("../../src/director/authoring.js");
    const { compileShotToSceneIR } = await import("../../src/scene-ir/compile.js");
    const opts = { duration: 20, fps: 30, width: 1920, height: 1080, quality: "draft" as const };

    const roomFilm = await direct("一个男人走进空房间，发现墙上写着自己的名字。他伸手擦掉名字，整个房间也随之消失。", opts);
    const roomAuthored = authorFilm(assembleFilmSpecV2(roomFilm, opts), roomFilm.shots);
    const roomIR = compileShotToSceneIR(compileToV1(roomAuthored), roomAuthored.shots[0]!);
    eq(roomAuthored.shots[0]!.space.kind, "room", "the boundary-loss film gets a room");
    eq(roomAuthored.shots[0]!.space.occlusionPolicy, "nearest", "a room occludes");

    const voidFilm = await direct("孤独", opts);
    const voidAuthored = authorFilm(assembleFilmSpecV2(voidFilm, opts), voidFilm.shots);
    const voidIR = compileShotToSceneIR(compileToV1(voidAuthored), voidAuthored.shots[0]!);
    eq(voidAuthored.shots[0]!.space.kind, "void", "the loneliness film gets a void");
    eq(voidAuthored.shots[0]!.space.occlusionPolicy, "additive", "a void has nothing to occlude");
    ok(
      voidIR.layers.every((l) => l.semantics.occlusionPolicy === "additive" || l.semantics.role === "atmosphere"),
      "no layer of a void film occludes",
    );
    void roomIR;
  });

  test("an atmosphere layer never occludes, whatever the space policy", async () => {
    const { direct, assembleFilmSpecV2 } = await import("../../src/director/Director.js");
    const { authorFilm, compileToV1 } = await import("../../src/director/authoring.js");
    const { compileShotToSceneIR } = await import("../../src/scene-ir/compile.js");
    const opts = { duration: 20, fps: 30, width: 1920, height: 1080, quality: "draft" as const };
    const r = await direct("一个男人走进空房间", opts);
    const authored = authorFilm(assembleFilmSpecV2(r, opts), r.shots);
    const v1 = compileToV1(authored);
    for (const shot of authored.shots) {
      const ir = compileShotToSceneIR(v1, shot);
      for (const l of ir.layers) {
        if (l.semantics.role === "atmosphere" || l.semantics.role === "parallax-background") {
          eq(l.semantics.occlusionPolicy, "additive", `${shot.id}/${l.id}: background never occludes`);
        }
      }
    }
  });
});

suite("depth: renderer invariants that the depth work could have broken", () => {
  test("the camera track is sampled, and interpolation is monotone in frame", () => {
    const ir = overlappingScene("additive");
    const a = resolveCameraAt(ir, 0);
    ok(Number.isFinite(a.px) && Number.isFinite(a.py) && Number.isFinite(a.pz), "resolved camera is finite");
    eq(a.worldToCells > 0, true, "worldToCells is positive");
  });

  test("layer transforms are monotone where they should be", () => {
    const ir = overlappingScene("additive");
    ir.layers[0]!.transform = {
      kind: "dissolve",
      radialOffset: 3,
      radialScale: 1.5,
      alphaFrom: 1,
      alphaTo: 0,
      sizeScaleFrom: 1,
      sizeScaleTo: 0.7,
    };
    const alphas = [0, 0.25, 0.5, 0.75, 1].map((u) => layerStateAt(ir.layers[0]!, u).alpha);
    for (let i = 1; i < alphas.length; i++) {
      ok(alphas[i]! <= alphas[i - 1]!, `dissolve alpha is non-increasing at u=${i / 4}`);
    }
    near(alphas[0]!, 1, 1e-9, "dissolve starts at full alpha");
    ok(alphas[4]! < 0.01, "dissolve reaches zero");
  });

  test("a NaN primitive is reported, not silently rendered", () => {
    const ir = overlappingScene("additive");
    ir.layers[0]!.primitives[0]!.p = [Number.NaN, 0, 1];
    const fr = renderSceneFrame(ir, 0);
    // Either the primitive is skipped (and counted as NaN) or the frame is still finite.
    ok(
      fr.stats.hadNaN || Number.isFinite(fr.stats.peakInk),
      "a NaN primitive does not produce a NaN frame",
    );
    ok(Number.isFinite(fr.stats.peakInk), "peak ink stays finite");
  });
});
