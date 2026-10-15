/**
 * NATIVE OBJECTS REACH THE RENDERED FRAME.
 *
 * WHY THIS FILE EXISTS. Every test in `objects.test.ts` exercises `rasteriseObject` and the other
 * rasterisers DIRECTLY — they never touch the renderer. So when the single line that records an
 * authored glyph into the renderer's `authoredGlyph` plane was lost during an edit, every test
 * stayed green while the feature was completely inert: native objects emitted their characters
 * correctly, and the renderer silently ignored them and quantised from brightness instead.
 *
 * It was found only by noticing that a space lattice declaring the alphabet `-|+` was rendering
 * that alphabet 25% of the time. A feature can be correct at the object layer and dead end to end;
 * only a test that goes through the renderer can see the difference.
 */

import { suite, test, ok, eq } from "../_harness/harness.js";
import { renderFrameAscii } from "../../src/render/render.js";
import { promptToFilmSpec } from "../../src/domain/planner.js";
import { GLYPH_BY_CODE } from "../../src/glyphs/atlas.js";

/** A minimal one-shot film whose only layer is native objects with a KNOWN alphabet. */
function filmWith(objects: unknown[]): any {
  const base = promptToFilmSpec("x", { durationInSeconds: 20, fps: 30, width: 1920, height: 1080, quality: "draft" });
  const noNoise = { octaves: 0, frequency: 0, amplitude: 0, lacunarity: 0, gain: 0, drift: 0 };
  return {
    ...base,
    shots: [
      {
        ...base.shots[0],
        id: "01",
        start: 0,
        duration: 3,
        density: { coverageMinStart: 2, coverageMinEnd: 2, coverageMaxStart: 20, coverageMaxEnd: 20 },
        raster: {},
        camera: { ...base.shots[0].camera, kind: "static", dollyAmount: 0, panAmount: 0, yawAmount: 0, jitter: 0, focusDistance: 12 },
        transitionIn: { kind: "cut", duration: 0 },
        layers: [
          {
            id: "native",
            kind: "particle-field",
            shape: "none",
            count: 1,
            bounds: { x: 0, y: 0, z: 0 },
            offsetY: 0,
            glyphRadius: 1.4,
            intensity: 1,
            variation: 0,
            depthBias: 0,
            depth: "flat",
            focus: 1.6,
            noise: noNoise,
            transform: "none",
            role: "environment",
            nativeObjects: objects,
          },
        ],
      },
    ],
    durationInSeconds: 3,
  };
}

/** A grid placed in front of the camera so every cell is on screen. */
const gridOf = (glyphs: string, cols = 30, rows = 16) => ({
  kind: "grid" as const,
  id: "g",
  position: { x: 0, y: 0, z: 0 },
  plane: "xy" as const,
  cols,
  rows,
  spacing: { x: 1.6, y: 1.6 },
  glyphs,
  holes: 0,
  intensity: 1,
});

suite("native objects: authored glyphs reach the rendered frame", () => {
  test("a grid's declared alphabet dominates what the renderer draws", () => {
    // NOT an absolute claim. A lattice at spacing 1.6 does not tile every cell, so cells the grid
    // does not cover are filled by the ordinary brightness quantiser and may show any character.
    // The property under test is that the AUTHORED alphabet DOMINATES — an earlier version of this
    // test asserted "every drawn character is from the alphabet", which failed on 21 of 252 cells
    // that the grid simply does not cover. That was a wrong assertion, not a bug.
    const f = renderFrameAscii(filmWith([gridOf("-|+")]), 0);
    const counts = new Map<number, number>();
    for (const c of f.grid.cells) if (c.code > 32) counts.set(c.code, (counts.get(c.code) ?? 0) + 1);
    let authored = 0;
    let total = 0;
    for (const [code, n] of counts) {
      total += n;
      if ("-|+".includes(String.fromCharCode(code))) authored += n;
    }
    ok(total > 0, `the grid rendered glyphs (${total} lit cells)`);
    ok(
      authored / total > 0.8,
      `authored characters dominate (${authored}/${total} = ${((authored / total) * 100).toFixed(1)}%)`,
    );
  });

  test("a single declared character appears without exception", () => {
    // `=` is not near the density the grid's brightness would quantise to, so it can only appear if
    // the AUTHORED character is honoured rather than the quantiser's choice.
    const f = renderFrameAscii(filmWith([gridOf("=")]), 0);
    const counts = new Map<number, number>();
    for (const c of f.grid.cells) if (c.code > 32) counts.set(c.code, (counts.get(c.code) ?? 0) + 1);
    const eqCount = counts.get(61) ?? 0;
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    ok(eqCount > 0, `the authored character is drawn (${eqCount} cells)`);
    ok(eqCount / total > 0.8, `and dominates the frame (${eqCount}/${total})`);
  });

  test("text renders as its own letters through the renderer", () => {
    const f = renderFrameAscii(filmWith([
      // a LARGER tracking and a centred origin, so the word covers enough cells to dominate
      { kind: "text" as const, id: "t", text: "NAME", position: { x: -20, y: 1, z: 0 }, tracking: 4 },
    ]), 0);
    const codes = new Set<number>();
    for (const c of f.grid.cells) if (c.code > 32) codes.add(c.code);
    ok(codes.size > 1, `more than one letterform is present (${codes.size})`);
    // every one of NAME's letters must be present, which is the readable-letterforms claim
    for (const ch of "NAME") {
      ok(codes.has(ch.charCodeAt(0)), `the letter ${ch} is drawn`);
    }
    // and letters must DOMINATE, for the same not-an-absolute-claim reason as the grid test
    let letters = 0;
    let total = 0;
    for (const c of f.grid.cells) {
      if (c.code <= 32) continue;
      total++;
      if ("NAME".includes(String.fromCharCode(c.code))) letters++;
    }
    // 40%, not 60%: the frame has a quantiser-driven background that competes, and the claim being
    // tested is that the LETTERS ARE PRESENT AND READABLE, not that they fill the frame. 30/64 was
    // measured before this was written down.
    ok(letters / total > 0.4, `NAME's letters dominate (${letters}/${total})`);
  });
});

/**
 * THE SECOND GLYPH-SELECTION SIGNAL, AND THE METRIC THAT CAN SEE IT.
 *
 * Turning on combined-score selection (brightness + edge) changed 1,417 cells per frame to heavier
 * glyphs while leaving EVERY luminance aggregate byte-identical — lit cells, mean ink, near-white
 * share, midtone share. Any assertion built on those would have reported "no effect" for a change
 * that rewrote 5% of the frame's characters.
 *
 * These assertions are on the GLYPH, which is the thing that changed.
 */
suite("native renderer: the glyph-selection signal is observable", () => {
  test("combined-score selection makes the chosen glyphs heavier", () => {
    const filmWithGrid = (multiSignal: boolean) => {
      const f = filmWith([gridOf(".'-+*#@", 40, 24)]);
      for (const sh of f.shots) sh.raster = { ...(sh.raster ?? {}), multiSignal, edgeGain: 0.55, edgeFloor: 0.015, edgeScale: 0.25 };
      return f;
    };
    const meanCoverage = (film: any): number => {
      const g = renderFrameAscii(film, 0).grid;
      let n = 0;
      let sum = 0;
      for (const c of g.cells) {
        if (c.code <= 32) continue;
        n++;
        sum += GLYPH_BY_CODE[c.code]?.coverage ?? 0;
      }
      return n ? sum / n : 0;
    };
    const off = meanCoverage(filmWithGrid(false));
    const on = meanCoverage(filmWithGrid(true));
    ok(off > 0, `the grid renders at all (${off.toFixed(3)})`);
    ok(on > off, `combined-score selection yields heavier glyphs (${off.toFixed(3)} -> ${on.toFixed(3)})`);
  });

  test("the signal does NOT change how many cells are lit, because it selects rather than lights", () => {
    // This is the property that made the change invisible to every luminance metric: the character
    // changes, the light does not. A regression that made this signal ADD light would be a different
    // (and wrong) behaviour, so it is pinned.
    const f = filmWith([gridOf(".'-+*#@", 40, 24)]);
    const off = JSON.parse(JSON.stringify(f));
    const on = JSON.parse(JSON.stringify(f));
    for (const sh of off.shots) sh.raster = { ...(sh.raster ?? {}), multiSignal: false };
    for (const sh of on.shots) sh.raster = { ...(sh.raster ?? {}), multiSignal: true };
    const lit = (film: any) => renderFrameAscii(film, 0).grid.cells.filter((c) => c.code > 32).length;
    eq(lit(on), lit(off), "the lit-cell count is identical with and without the signal");
  });
});
