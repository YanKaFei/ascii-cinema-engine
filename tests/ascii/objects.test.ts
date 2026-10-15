/**
 * NATIVE ASCII OBJECTS.
 *
 * The claim under test: an object placed in the world KNOWS what character it is, so a line is
 * made of `-` and a word is made of its own letters. That is the difference between ASCII as a
 * filter over a rendered field and ASCII as the material.
 */

import { suite, test, ok, eq, near } from "../_harness/harness.js";
import {
  rasteriseObject,
  rasteriseText,
  measureText,
  objectAlive,
  objectInk,
  type AsciiText,
  type AsciiLine,
  type AsciiGrid,
  type AsciiTrail,
} from "../../src/ascii/objects.js";
import { GLYPH_BY_CODE, TYPEFACE } from "../../src/glyphs/atlas.js";

/** Render placements into an ASCII-art preview for inspection. */
function preview(placements: Array<{ p: { x: number; y: number }; code: number }>): string[] {
  if (placements.length === 0) return [];
  const xs = placements.map((p) => Math.round(p.p.x));
  const ys = placements.map((p) => Math.round(-p.p.y));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const grid = Array.from({ length: y1 - y0 + 1 }, () => new Array<string>(x1 - x0 + 1).fill(" "));
  placements.forEach((p, i) => {
    grid[ys[i]! - y0]![xs[i]! - x0] = String.fromCharCode(p.code);
  });
  return grid.map((r) => r.join("").replace(/\s+$/, ""));
}

const textAt = (over: Partial<AsciiText> = {}): AsciiText => ({
  kind: "text",
  id: "t",
  text: "NAME",
  position: { x: 0, y: 0, z: 0 },
  tracking: 2,
  ...over,
});

suite("ascii objects: typography renders as READABLE LETTERFORMS", () => {
  test("NAME rasterises to the shape of the word", () => {
    const art = preview(rasteriseText(textAt()));
    // The defining property: the word is recognisable by its own pixels. Asserted against the
    // bitmap font's own rows rather than a hand-copied string, so it cannot drift silently.
    ok(art.length >= 7, `text is at least 7 rows tall (got ${art.length})`);
    const expected = ["N", "A", "M", "E"].map((ch) => {
      const g = TYPEFACE[ch.charCodeAt(0)]!;
      return g.rows.map((mask) =>
        Array.from({ length: 5 }, (_, c) => ((mask & (1 << (4 - c))) === 0 ? " " : ch)).join(""),
      );
    });
    // each letter's first row must appear in the rendered art
    for (let li = 0; li < 4; li++) {
      const letterRow = expected[li]![0]!;
      ok(
        art[0]!.includes(letterRow),
        `row 0 contains letter ${li}'s top row (${JSON.stringify(letterRow)}) in ${JSON.stringify(art[0])}`,
      );
    }
  });

  test("the word is built from its OWN characters, not a fill", () => {
    const codes = new Set(rasteriseText(textAt()).map((p) => p.code));
    for (const ch of ["N", "A", "M", "E"]) {
      ok(codes.has(ch.charCodeAt(0)), `the output contains "${ch}"`);
    }
    eq(codes.size, 4, "and nothing else");
  });

  test("a fill character replaces the letters when asked", () => {
    const codes = new Set(rasteriseText(textAt({ fill: "#" })).map((p) => p.code));
    eq(codes.size, 1, "one character only");
    eq([...codes][0], 35, "and it is #");
  });

  test("tracking and leading change the extent", () => {
    const tight = measureText(textAt({ tracking: 0 }));
    const loose = measureText(textAt({ tracking: 4 }));
    ok(loose.widthCells > tight.widthCells, `more tracking is wider (${tight.widthCells} -> ${loose.widthCells})`);
    const two = measureText(textAt({ text: "A\nB", leading: 3 }));
    const twoTight = measureText(textAt({ text: "A\nB", leading: 0 }));
    ok(two.heightCells > twoTight.heightCells, "more leading is taller");
  });

  test("alignment shifts a SHORT line within a wider block", () => {
    // A single line has ZERO centring offset — it defines the block width — so alignment only
    // moves anything when one line is narrower than another.
    //
    // THE TRAP, which made two earlier versions of this test assert nothing: the rasteriser lays
    // the nth line at `y = -(n * (GLYPH_H + leading) + gy)`, so line rows OVERLAP modulo the line
    // pitch and cannot be separated by a single y value. Grouping by `floor(-y / pitch)` recovers
    // the line index, and that is what this test does.
    const pitch = 9 + 1; // GLYPH_H + leading
    const twoLine = (align: "left" | "centre" | "right") =>
      textAt({ text: ["NAME", "I"].join(String.fromCharCode(10)), tracking: 2, align });

    const xsOfLine = (align: "left" | "centre" | "right", lineIndex: number): number[] => {
      const all = rasteriseText(twoLine(align));
      return all.filter((p) => Math.floor(-p.p.y / pitch) === lineIndex).map((p) => p.p.x);
    };

    const leftXs = xsOfLine("left", 1);
    const centreXs = xsOfLine("centre", 1);
    const rightXs = xsOfLine("right", 1);
    ok(leftXs.length > 0, `the second line produced glyphs (${leftXs.length})`);
    eq(leftXs.length, rightXs.length, "the short line has the same number of glyphs under either alignment");

    const leftMin = Math.min(...leftXs);
    const centreMin = Math.min(...centreXs);
    const rightMin = Math.min(...rightXs);
    ok(rightMin > leftMin, `right-align pushes the short line right (${leftMin} -> ${rightMin})`);
    ok(centreMin > leftMin && centreMin < rightMin, `centre sits between (${leftMin} < ${centreMin} < ${rightMin})`);
  });

  test("position, rotation and scale place the word in the world", () => {
    const at = rasteriseText(textAt({ position: { x: 10, y: -4, z: 2 } }));
    const min = Math.min(...at.map((p) => p.p.x));
    ok(min >= 10, `shifted to x >= 10 (min ${min})`);
    const scaled = rasteriseText(textAt({ scale: 2 }));
    const base = rasteriseText(textAt());
    const span = (a: typeof base) => Math.max(...a.map((p) => p.p.x)) - Math.min(...a.map((p) => p.p.x));
    near(span(scaled), span(base) * 2, 1e-6, "scale 2 doubles the extent");
  });
});

suite("ascii objects: the FONT ITSELF is complete", () => {
  test("every printable non-space character has pixels", () => {
    // A REGRESSION TEST FOR A REAL FONT BUG. `GLYPH_BY_CODE` falls back to a BLANK for any
    // character with no pattern, so a missing glyph is indistinguishable from a space — it renders
    // as nothing, silently. The capital `I` was absent from the table and went unnoticed until a
    // typography test happened to use the word "I" and produced zero placements, which read as a
    // layout bug rather than a missing letter.
    const blank: string[] = [];
    for (let c = 0x21; c <= 0x7e; c++) {
      const glyph = TYPEFACE[c];
      ok(glyph !== undefined, `0x${c.toString(16)} has an entry`);
      const mask = glyph!.rows.reduce((a, r) => a | (r ?? 0), 0);
      if (mask === 0) blank.push(String.fromCharCode(c));
    }
    eq(blank.length, 0, `no printable character renders as nothing (blank: ${JSON.stringify(blank.join(""))})`);
  });

  test("uppercase A-Z are all present and distinct", () => {
    const seen = new Map<string, number>();
    for (let c = 0x41; c <= 0x5a; c++) {
      const glyph = TYPEFACE[c]!;
      const key = glyph.rows.join(",");
      ok(glyph.coverage > 0, `${String.fromCharCode(c)} has ink`);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    eq(dupes.length, 0, `no two capitals share a bitmap (${dupes.length} collisions)`);
  });
});

suite("ascii objects: the other kinds emit the right characters", () => {
  test("a line is made of its own glyph", () => {
    const l: AsciiLine = { kind: "line", id: "l", position: { x: 0, y: 0, z: 0 }, from: { x: 0, y: 0, z: 0 }, to: { x: 4, y: 0, z: 0 }, density: 1, glyph: "=" };
    const out = rasteriseObject(l);
    ok(out.length >= 5, "covers the span");
    eq(new Set(out.map((p) => p.code)).size, 1, "one character");
    eq([...new Set(out.map((p) => p.code))][0], 61, "and it is =");
  });

  test("a grid fills a lattice and can be holed", () => {
    const g: AsciiGrid = { kind: "grid", id: "g", position: { x: 0, y: 0, z: 0 }, cols: 8, rows: 4, spacing: { x: 2, y: 2 }, glyphs: "-|" };
    const solid = rasteriseObject(g);
    eq(solid.length, 32, "8x4 lattice");
    const holed = rasteriseObject({ ...g, holes: 0.5, seed: 7 });
    ok(holed.length < solid.length, `holes remove cells (${solid.length} -> ${holed.length})`);
  });

  test("a trail fades along its length", () => {
    const t: AsciiTrail = { kind: "trail", id: "tr", position: { x: 0, y: 0, z: 0 }, length: 5, direction: { x: 1, y: 0, z: 0 }, falloff: 1 };
    const out = rasteriseObject(t);
    eq(out.length, 5, "five glyphs");
    ok(out[0]!.ink > out[4]!.ink, `ink falls off along the trail (${out[0]!.ink.toFixed(2)} -> ${out[4]!.ink.toFixed(2)})`);
  });

  test("every kind produces at least one placement", () => {
    const objs = [
      { kind: "point" as const, id: "p", position: { x: 0, y: 0, z: 0 }, count: 5, spread: { x: 2, y: 2, z: 0 } },
      { kind: "line" as const, id: "l", position: { x: 0, y: 0, z: 0 }, from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0, z: 0 } },
      { kind: "polyline" as const, id: "pl", position: { x: 0, y: 0, z: 0 }, points: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }, { x: 4, y: 0, z: 0 }] },
      { kind: "text" as const, id: "t", position: { x: 0, y: 0, z: 0 }, text: "HI" },
      { kind: "grid" as const, id: "g", position: { x: 0, y: 0, z: 0 }, cols: 2, rows: 2 },
      { kind: "cloud" as const, id: "c", position: { x: 0, y: 0, z: 0 }, count: 10, bounds: { x: 1, y: 1, z: 1 } },
      { kind: "trail" as const, id: "tr", position: { x: 0, y: 0, z: 0 }, length: 3, direction: { x: 1, y: 0, z: 0 } },
    ];
    for (const o of objs) {
      const out = rasteriseObject(o);
      ok(out.length > 0, `${o.kind} emits placements`);
      ok(out.every((p) => p.code >= 32 && p.code <= 126), `${o.kind} emits printable ASCII only`);
      ok(out.every((p) => Number.isFinite(p.p.x) && Number.isFinite(p.p.y) && Number.isFinite(p.p.z)), `${o.kind} positions are finite`);
    }
  });
});

suite("ascii objects: lifetime and ink", () => {
  test("lifetime gates existence and fades the ends", () => {
    const o = { kind: "point" as const, id: "p", position: { x: 0, y: 0, z: 0 }, count: 1, lifetime: { from: 0.25, to: 0.75 } };
    const shotSeconds = 20;
    eq(objectAlive(o, 0.1), false, "not yet born");
    eq(objectAlive(o, 0.5), true, "alive in the middle");
    eq(objectAlive(o, 0.9), false, "already gone");
    ok(objectInk(o, 0.5, shotSeconds) > objectInk(o, 0.26, shotSeconds), "fades in");
    ok(objectInk(o, 0.5, shotSeconds) > objectInk(o, 0.74, shotSeconds), "fades out");
    near(objectInk(o, 0.5, shotSeconds), 1, 1e-9, "full ink in the middle");
  });

  test("an object with no lifetime is always present at full ink", () => {
    const o = { kind: "point" as const, id: "p", position: { x: 0, y: 0, z: 0 }, count: 1 };
    eq(objectAlive(o, 0), true, "alive at the start");
    eq(objectAlive(o, 1), true, "alive at the end");
    near(objectInk(o, 0.5, 20), 1, 1e-9, "full ink");
  });
});
