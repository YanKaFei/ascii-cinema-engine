/**
 * Glyph families and atlas LAYOUT — shared between Node and the browser.
 *
 * This module deliberately has NO Node dependencies. The browser page needs the layout and the
 * family runs, but it must not pull in the PNG encoder, which imports `node:zlib`. Keeping the
 * shared data separate from the baking code is what lets one module serve both sides — the
 * alternative was a browser build step, and the ADR explains why there is no bundler.
 *
 * The bitmaps themselves come from the same hand-authored 5x9 font the CPU reference uses, so
 * the two renderers share a typeface by construction rather than by coincidence.
 */

import { GLYPH_BY_CODE, ASCII_VOCABULARY } from "../../glyphs/atlas.js";

/** Bitmap dimensions of one glyph in the source font. */
export const GLYPH_W = 5;
export const GLYPH_H = 9;

/** Intra-cell padding, in atlas pixels, so linear filtering cannot bleed between glyphs. */
export const PAD = 2;

/**
 * CHARACTER FAMILIES.
 *
 * A film should not be forced to speak in one typeface. These are ordered light -> heavy, which
 * the density quantiser relies on: the atlas exposes each family as a run of slots, and the
 * shader indexes into the run using the film's own coverage value.
 *
 * `soft`      punctuation and low-coverage marks; air, dust, distance
 * `hard`      blocky and saturated; mass, impact, presence
 * `technical` brackets, slashes and digits; structure, machinery, measurement
 * `organic`   curves and apostrophes; growth, flesh, weather
 * `binary`    two glyphs only; signal, data, machine vision
 * `architectural` rules and corners; walls, floors, edges, scale
 */
export const GLYPH_FAMILIES = {
  soft: " .'`,^:;~-_",
  hard: "#@%&$8BWMQ",
  technical: "[]{}()<>/\\|=+*0123456789",
  organic: "\"ijltfrJLTcsuz)(}{",
  binary: "01",
  architectural: "-_|/\\[]+= .",
} as const;

export type GlyphFamily = keyof typeof GLYPH_FAMILIES;

export const FAMILY_NAMES = Object.keys(GLYPH_FAMILIES) as GlyphFamily[];

/** Validate that every family character exists in the font. */
export function validateFamilies(): string[] {
  const problems: string[] = [];
  for (const [name, chars] of Object.entries(GLYPH_FAMILIES)) {
    for (const ch of chars) {
      if (!GLYPH_BY_CODE[ch.charCodeAt(0)]) problems.push(`${name}: missing glyph "${ch}"`);
    }
  }
  return problems;
}


export interface AtlasLayout {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  width: number;
  height: number;
  /** code -> slot index in the atlas grid */
  slotOf: Record<number, number>;
  slots: number[];
  /** normalised padding inside one atlas cell */
  padU: number;
  padV: number;
}

/**
 * Lay the whole printable set into a grid atlas.
 *
 * One slot per printable ASCII code (0x20..0x7E), plus the family runs appended so the shader
 * can index a family without a second texture. `scale` is chosen so a glyph's bitmap is large
 * enough that linear filtering reproduces its shape cleanly: at 8x, a 5x9 bitmap is 40x72
 * texels, far more resolution than the largest on-screen cell.
 */
export function layoutAtlas(scale = 8): AtlasLayout {
  const codes: number[] = [];
  for (let c = 0x20; c <= 0x7e; c++) if (GLYPH_BY_CODE[c]) codes.push(c);

  const allSlots: number[] = [];
  const slotOf: Record<number, number> = {};
  for (const code of codes) {
    slotOf[code] = allSlots.length;
    allSlots.push(code);
  }
  for (const name of FAMILY_NAMES) {
    for (const ch of GLYPH_FAMILIES[name]) {
      const code = ch.charCodeAt(0);
      if (!(code in slotOf)) {
        slotOf[code] = allSlots.length;
        allSlots.push(code);
      }
    }
  }

  const cols = 16;
  const rows = Math.ceil(allSlots.length / cols);
  const cellW = GLYPH_W * scale + PAD * 2;
  const cellH = GLYPH_H * scale + PAD * 2;

  return {
    cols,
    rows,
    cellW,
    cellH,
    width: cols * cellW,
    height: rows * cellH,
    slotOf,
    slots: allSlots,
    padU: PAD / cellW,
    padV: PAD / cellH,
  };
}

/** Slot index for a character, or the space slot. */
export function slotForCode(layout: AtlasLayout, code: number): number {
  return layout.slotOf[code] ?? layout.slotOf[32] ?? 0;
}

/**
 * The slot run for a family.
 *
 * The run is CONTIGUOUS and ordered light -> heavy *within the family's own declaration order*,
 * which is what lets the shader map a coverage value onto a slot by interpolation. `printable`
 * returns the full printable ordering.
 */
export function familyRun(layout: AtlasLayout, family: GlyphFamily | "printable"): number[] {
  if (family === "printable") {
    const run: number[] = [];
    for (let c = 0x20; c <= 0x7e; c++) {
      if (layout.slotOf[c] === undefined) continue;
      run.push(layout.slotOf[c]);
    }
    return run;
  }
  return Array.from(GLYPH_FAMILIES[family], (ch) => slotForCode(layout, ch.charCodeAt(0)));
}
