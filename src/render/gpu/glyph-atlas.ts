/**
 * GPU glyph atlas BAKING (Node only).
 *
 * Split out of `families.ts` because this file needs the PNG encoder, and the PNG encoder needs
 * `node:zlib`, which the browser cannot load. The page imports `families.ts`; the bake script
 * imports this file.
 */

import { GLYPH_BY_CODE } from "../../glyphs/atlas.js";
import { blackImage, encodePng, type RgbImage } from "../png.js";
import { GLYPH_W, GLYPH_H, PAD, FAMILY_NAMES, familyRun, layoutAtlas, slotForCode, type AtlasLayout } from "./families.js";

export * from "./families.js";


/** The atlas as a single-channel ink image (white glyph on black). */
export function bakeAtlasImage(layout: AtlasLayout, scale = 8): RgbImage {
  const img = blackImage(layout.width, layout.height);

  layout.slots.forEach((code, slot) => {
    const glyph = GLYPH_BY_CODE[code];
    if (!glyph) return;
    const col = slot % layout.cols;
    const row = Math.floor(slot / layout.cols);
    const ox = col * layout.cellW + PAD;
    const oy = row * layout.cellH + PAD;

    for (let gy = 0; gy < GLYPH_H; gy++) {
      const mask = glyph.rows[gy] ?? 0;
      if (!mask) continue;
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if ((mask & (1 << (GLYPH_W - 1 - gx))) === 0) continue;
        for (let sy = 0; sy < scale; sy++) {
          const py = oy + gy * scale + sy;
          if (py < 0 || py >= layout.height) continue;
          for (let sx = 0; sx < scale; sx++) {
            const px = ox + gx * scale + sx;
            if (px < 0 || px >= layout.width) continue;
            const o = (py * layout.width + px) * 3;
            img.data[o] = 255;
            img.data[o + 1] = 255;
            img.data[o + 2] = 255;
          }
        }
      }
    }
  });

  return img;
}

export interface AtlasBundle {
  png: Uint8Array;
  meta: {
    version: "1";
    width: number;
    height: number;
    cols: number;
    rows: number;
    cellW: number;
    cellH: number;
    scale: number;
    glyphW: number;
    glyphH: number;
    padU: number;
    padV: number;
    families: Record<string, number[]>;
    printableRun: number[];
    slotCoverage: number[];
  };
}

/**
 * Bake the atlas and its metadata.
 *
 * `slotCoverage` is what lets the GPU honour a density window: the quantiser picks a slot whose
 * measured coverage is closest to the requested one, exactly as the CPU ramp does.
 */
export function bakeAtlas(scale = 8, layout: AtlasLayout = layoutAtlas(scale)): AtlasBundle {
  const img = bakeAtlasImage(layout, scale);
  const families: Record<string, number[]> = {};
  for (const name of FAMILY_NAMES) families[name] = familyRun(layout, name);

  return {
    png: encodePng(img),
    meta: {
      version: "1",
      width: layout.width,
      height: layout.height,
      cols: layout.cols,
      rows: layout.rows,
      cellW: layout.cellW,
      cellH: layout.cellH,
      scale,
      glyphW: GLYPH_W,
      glyphH: GLYPH_H,
      padU: layout.padU,
      padV: layout.padV,
      families,
      printableRun: familyRun(layout, "printable"),
      slotCoverage: layout.slots.map((code) => GLYPH_BY_CODE[code]?.coverage ?? 0),
    },
  };
}
