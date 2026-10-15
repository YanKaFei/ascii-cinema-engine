/**
 * BACKEND INDEPENDENCE tests.
 *
 * These defend the reason SceneIR exists. A second renderer, written independently against
 * `SceneIR` and sharing only the glyph atlas and the quantiser, must reproduce the CPU
 * reference renderer's character decisions. If it does not, the IR is missing something the
 * first renderer was computing inline — and a GPU backend would have been a rewrite rather
 * than a backend.
 *
 * The comparison runs with additive compositing on both sides, because the spike deliberately
 * does not re-implement the depth policy. That is stated in the test rather than hidden.
 */

import { suite, test, ok, eq, near, note } from "../_harness/harness.js";
import { renderSceneFrame } from "../../src/render/cpu-renderer.js";
import { direct, assembleFilmSpecV2 } from "../../src/director/Director.js";
import { authorFilm, compileToV1 } from "../../src/director/authoring.js";
import { compileShotToSceneIR } from "../../src/scene-ir/compile.js";
import type { SceneIR } from "../../src/scene-ir/types.js";

/** Import the spike as a second renderer (a genuinely separate implementation). */
async function loadSpike(): Promise<typeof import("../../src/experiments/spike-renderer.js")> {
  return import("../../src/experiments/spike-renderer.js");
}

/** A film whose space is additive, so both renderers can be compared without occlusion. */
async function additiveScene(): Promise<{ ir: SceneIR; v1: ReturnType<typeof compileToV1> }> {
  const opts = { duration: 20, fps: 30, width: 1920, height: 1080, quality: "draft" as const };
  const r = await direct("孤独", opts);
  const authored = authorFilm(assembleFilmSpecV2(r, opts), r.shots);
  const v1 = compileToV1(authored);
  const ir = compileShotToSceneIR(v1, authored.shots[1]!);
  eq(ir.layers.every((l) => l.semantics.occlusionPolicy === "additive"), true, "scene is additive on both sides");
  return { ir, v1 };
}

suite("backend: SceneIR is sufficient for a second renderer", () => {
  test("the spike can be imported and produces a field of the right shape", async () => {
    const { ir } = await additiveScene();
    const spike = await loadSpike();
    const lum = spike.field(ir, 10);
    eq(lum.length, ir.cols * ir.rows, "the spike's field has one bin per cell");
    let nonzero = 0;
    for (let i = 0; i < lum.length; i++) if (lum[i]! > 0) nonzero++;
    ok(nonzero > 0, "the spike's field is not empty");
    ok(Number.isFinite(lum[Math.floor(lum.length / 2)]!), "the field is finite");
  });

  test("BOTH RENDERERS AGREE ON THE CHARACTER DECISIONS", async () => {
    const { ir } = await additiveScene();
    const spike = await loadSpike();

    const frame = 12;
    const cpuFrame = renderSceneFrame(ir, frame);
    const lum = spike.field(ir, frame);
    const { codes } = spike.codesFor(ir, frame, lum);

    // With procedural noise ON the two implementations cannot agree cell-for-cell: the reference
    // uses fBm and the spike a local value noise, and once a cell's graded value lands on the
    // STEEP part of the coverage ramp — which the Phase 2 density ceiling had made unreachable,
    // and lifting it restored — a sub-percent field difference changes the chosen glyph. That is
    // a threshold flip, not a missing quantity in the IR.
    //
    // The invariant that IS checkable with noise on, and that would catch a real defect, is
    // whether the two renderers agree on WHICH CELLS CARRY A MARK. A renderer missing a quantity
    // does not merely choose a different glyph; it lights a different set of cells.
    let glyphDiffs = 0;
    let occupancyDiffs = 0;
    const examples: string[] = [];
    for (let i = 0; i < codes.length; i++) {
      const a = cpuFrame.codes[i]!;
      const b = codes[i]!;
      const aMarked = a > 32;
      const bMarked = b > 32;
      if (aMarked !== bMarked) {
        occupancyDiffs++;
        if (examples.length < 5) {
          examples.push(
            `cell ${i % ir.cols},${Math.floor(i / ir.cols)} cpu=${aMarked ? `"${String.fromCharCode(a)}"` : "blank"} spike=${bMarked ? `"${String.fromCharCode(b)}"` : "blank"}`,
          );
        }
        continue;
      }
      if (a !== b) glyphDiffs++;
    }

    // Occupancy CAN differ, and for the same reason: the blank/not-blank decision is a CLIFF,
    // not a bin. A cell whose graded value sits one grain-width above the blank floor is marked by
    // one renderer and blank in the other, and unlike a glyph flip that is a whole mark appearing
    // or vanishing. The bound is therefore small but non-zero, and it is stated rather than
    // zeroed: three cells out of 28,800 is 0.01%.
    const occupancyAgreement = 1 - occupancyDiffs / codes.length;
    // 99.9%, not 99.99%. The bound was 99.9999% when only 3 cells differed; widening the authored
    // splat footprint 3x (to break the field's bimodality — see `authoring.ts`) moved it to 7 of
    // 28,800. A WIDER SPLAT PUTS MORE CELLS ON THE BLANK CLIFF, so more of them flip when the two
    // renderers' different procedural noise nudges the graded value across it. That is the same
    // mechanism as before, at a larger population, and the exactness claim it is guarding is made
    // separately and still holds: with noise removed the two agree on 0 of 28,800 cells.
    ok(
      occupancyAgreement >= 0.999,
      `both renderers agree on which cells carry a mark to ${(occupancyAgreement * 100).toFixed(4)}% (${occupancyDiffs} of ${codes.length} differ: ${examples.join(" | ")})`,
    );
    const agreement = 1 - glyphDiffs / codes.length;
    ok(agreement >= 0.998, `glyph choice agrees on ${(agreement * 100).toFixed(3)}% of cells (${glyphDiffs} flips)`);
    note(
      `backend independence with procedural noise ON: ${(agreement * 100).toFixed(3)}% glyph agreement ` +
        `(${glyphDiffs} flips) and ${(occupancyAgreement * 100).toFixed(4)}% occupancy agreement ` +
        `(${occupancyDiffs} cells) of ${codes.length}. Both are threshold effects at the quantiser's ` +
        `bin edges and at the blank cliff, and neither indicates a quantity missing from the IR.`,
    );
  });


  test("with noise removed, the two renderers agree EXACTLY", async () => {
    // Noise is the only known source of divergence, so removing it must give byte equality.
    // This is the sharp form of the claim: the IR carries everything else exactly.
    const { ir } = await additiveScene();
    const spike = await loadSpike();
    const quiet: typeof ir = JSON.parse(JSON.stringify(ir));
    for (const l of quiet.layers) l.noise = { octaves: 0, frequency: 0, amplitude: 0, lacunarity: 0, gain: 0, drift: 0 };

    const frame = 12;
    const cpuFrame = renderSceneFrame(quiet, frame);
    const lum = spike.field(quiet, frame);
    const { codes } = spike.codesFor(quiet, frame, lum);

    let diff = 0;
    const examples: string[] = [];
    for (let i = 0; i < codes.length; i++) {
      if (cpuFrame.codes[i] === codes[i]) continue;
      diff++;
      if (examples.length < 4) {
        examples.push(`cell ${i % quiet.cols},${Math.floor(i / quiet.cols)} cpu=${cpuFrame.codes[i]} spike=${codes[i]}`);
      }
    }
    eq(diff, 0, `byte-exact agreement with noise disabled (${examples.join(" | ")})`);
  });

  test("the two renderers agree on lit-cell count within the grain band", async () => {
    const { ir } = await additiveScene();
    const spike = await loadSpike();
    const frame = 30;
    const cpuFrame = renderSceneFrame(ir, frame);
    const lum = spike.field(ir, frame);
    const { codes } = spike.codesFor(ir, frame, lum);
    let spikeLit = 0;
    for (const c of codes) if (c > 32) spikeLit++;
    const cpuLit = cpuFrame.stats.litCells;
    // Threshold flips can move a handful of near-threshold cells; they must not change the
    // population.
    ok(
      Math.abs(cpuLit - spikeLit) <= Math.max(8, cpuLit * 0.02),
      `lit-cell counts agree (cpu ${cpuLit} vs spike ${spikeLit})`,
    );
  });

  test("the IR carries every quantity the second renderer needed", async () => {
    const { ir } = await additiveScene();
    // If any of these were missing, the spike would have had to re-derive them — which is
    // exactly the failure this test exists to catch.
    ok(ir.camera.keys.length > 1, "camera track is sampled");
    ok(ir.camera.focal === 1, "the pinhole ratio is carried and is 1");
    ok(ir.camera.keys.every((k) => Number.isFinite(k.worldToCells) && k.worldToCells > 0), "worldToCells is carried");
    ok(ir.layers.every((l) => Number.isFinite(l.glyphRadius) && Number.isFinite(l.intensity) && Number.isFinite(l.focus)), "layer optics are carried");
    ok(ir.layers.every((l) => l.primitives.every((p) => p.p.length === 3 && Number.isFinite(p.z))), "primitive geometry and rest depth are carried");
    ok(ir.density.from.coverageMax > 0 && ir.density.to.coverageMax > 0, "the density track is carried");
    ok(ir.glyph.vocabulary.length > 2, "the glyph vocabulary is carried");
    ok(ir.glyph.exposure > 0 && ir.glyph.blackPoint >= 0, "the grade parameters are carried");
  });

  test("a renderer can be selected by id through the same interface", async () => {
    const { cpuRenderer } = await import("../../src/render/cpu-renderer.js");
    eq(cpuRenderer.id, "cpu", "the CPU renderer identifies itself");
    ok(cpuRenderer.description.includes("REFERENCE"), "the CPU renderer declares itself the reference");
    const { ir } = await additiveScene();
    const viaInterface = await cpuRenderer.renderFrame(ir, 5);
    const direct0 = renderSceneFrame(ir, 5);
    // Compare a DIGEST, not the arrays: a failure on a byte plane would otherwise print
    // 28,800 numbers and bury the summary.
    const { createHash } = await import("node:crypto");
    const digest = (codes: Uint8Array): string => createHash("sha256").update(codes).digest("hex").slice(0, 16);
    eq(digest(viaInterface.codes), digest(direct0.codes), "the interface and the function agree");
  });
});

suite("backend: gate F/I guards (no NaN, no startFrame regression)", () => {
  test("no frame of any benchmark produces a NaN flag", async () => {
    const opts = { duration: 20, fps: 30, width: 1920, height: 1080, quality: "draft" as const };
    for (const input of ["孤独", "欲望", "时间"]) {
      const r = await direct(input, opts);
      const authored = authorFilm(assembleFilmSpecV2(r, opts), r.shots);
      const v1 = compileToV1(authored);
      const ir = compileShotToSceneIR(v1, authored.shots[0]!);
      for (let f = 0; f < Math.min(ir.frameCount, 40); f++) {
        const fr = renderSceneFrame(ir, f);
        ok(!fr.stats.hadNaN, `${input} frame ${f}: no NaN`);
        ok(Number.isFinite(fr.stats.peakInk), `${input} frame ${f}: finite peak`);
      }
    }
  });

  test("rendering a sub-range of frames addresses them absolutely", async () => {
    // The Phase 1 `startFrame` bug made every motion sample encode the film's opening. The
    // IR path has the same hazard: index 0 must mean the SHOT's frame 0, and a caller asking
    // for a later shot must get a different image.
    const opts = { duration: 20, fps: 30, width: 1920, height: 1080, quality: "draft" as const };
    const r = await direct("欲望", opts);
    const authored = authorFilm(assembleFilmSpecV2(r, opts), r.shots);
    const v1 = compileToV1(authored);
    const irs = authored.shots.map((s) => compileShotToSceneIR(v1, s));
    ok(irs.length >= 3, "the film has several shots");
    const firsts = irs.map((ir) => renderSceneFrame(ir, 0).stats.litCells);
    const distinct = new Set(firsts);
    ok(distinct.size > 1, `different shots open on different images (${firsts.join(", ")})`);
    // and the camera position must differ between shots
    const cams = irs.map((ir) => {
      const k = ir.camera.keys[0]!;
      return k.position.join(",");
    });
    ok(new Set(cams).size > 1, "different shots do not share a camera position");
  });
});
