/**
 * Hand-authored 5x9 bitmap font covering the printable ASCII range (0x20-0x7E).
 *
 * Design constraints (from the ASCII-only visual language):
 *  - Cell is exactly 5x9 pixels. 1920/240 = 8 px wide, 1080/120 = 9 px tall,
 *    so a 240x120 glyph grid maps 1:1 onto 1920x1080 with zero remainder.
 *  - Only the printable ASCII range may ever emit ink. No images, no vector art.
 *
 * Each glyph is stored as 9 row masks. Row `r` uses the low 5 bits of `rows[r]`,
 * bit 4 = leftmost column. This is the same convention as the classic 5x7
 * text-mode fonts, extended to 9 rows so the cell aspect ratio stays 5:9.
 */

export const GLYPH_W = 5;
export const GLYPH_H = 9;

/** Ink coverage per glyph, measured in lit subpixels. Used to build ramps. */
export interface GlyphDef {
  /** The character this glyph renders. */
  ch: string;
  /** 9 row masks, low 5 bits each. */
  rows: number[];
  /** Number of lit subpixels (0..45). */
  coverage: number;
}

type Pattern = readonly string[];

const patterns: Record<string, Pattern> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "00100", "00100", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00000", "00100", "00100", "01000", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "`": ["01000", "00100", "00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "00000", "11111", "00000", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  ":": ["00000", "00100", "00100", "00000", "00000", "00100", "00100", "00000", "00000"],
  ";": ["00000", "00100", "00100", "00000", "00000", "00100", "00100", "01000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00100", "00000", "00100", "00000"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  "i": ["00100", "00000", "01100", "00100", "00100", "00100", "00100", "01110", "00000"],
  "l": ["01100", "00100", "00100", "00100", "00100", "00100", "00100", "01110", "00000"],
  "/": ["00001", "00010", "00010", "00100", "00100", "01000", "01000", "10000", "00000"],
  "\\": ["10000", "01000", "01000", "00100", "00100", "00010", "00010", "00001", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "01000", "00100", "00010", "00000"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00010", "00100", "01000", "00000"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01000", "01110", "00000"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "00010", "01110", "00000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010", "00000", "00000"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000", "00000", "00000"],
  "=": ["00000", "00000", "11111", "00000", "00000", "11111", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000", "00000", "00000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000", "00000", "00000"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000", "00000", "00000"],
  "~": ["00000", "00000", "01001", "10110", "00000", "00000", "00000", "00000", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00100", "00000", "00100", "00000"],
  "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100", "00000", "00000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011", "00000", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101", "00000", "00000"],
  "#": ["01010", "11111", "01010", "01010", "01010", "11111", "01010", "00000", "00000"],
  "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01110", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110", "00000", "00000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110", "00000", "00000"],
  "9": ["01110", "10001", "10001", "01111", "00001", "10001", "01110", "00000", "00000"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110", "00000", "00000"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110", "00000", "00000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101", "00000", "00000"],
  "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01111", "00000", "00000"],
  "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110", "00000", "00000"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110", "00000", "00000"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110", "00000", "00000"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110", "00000", "00000"],
  "g": ["00000", "00000", "01111", "10001", "01111", "00001", "01110", "00000", "00000"],
  "q": ["00000", "00000", "01111", "10001", "10001", "01111", "00001", "00001", "00000"],
  "p": ["00000", "00000", "11110", "10001", "10001", "11110", "10000", "10000", "00000"],
  "d": ["00001", "00001", "01111", "10001", "10001", "10001", "01111", "00000", "00000"],
  "b": ["10000", "10000", "11110", "10001", "10001", "10001", "11110", "00000", "00000"],
  "m": ["00000", "00000", "11010", "10101", "10101", "10101", "10101", "00000", "00000"],
  "w": ["00000", "00000", "10001", "10001", "10101", "10101", "01010", "00000", "00000"],
  "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001", "00000", "00000"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001", "00000", "00000"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001", "00000", "00000"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001", "00000", "00000"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000", "00000", "00000"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000", "00000", "00000"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111", "00000", "00000"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001", "00000", "00000"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001", "00000", "00000"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001", "00000", "00000"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100", "00000", "00000"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001", "00000", "00000"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100", "00000", "00000"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100", "00000", "00000"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111", "00000", "00000"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110", "00000", "00000"],
  "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100", "00000", "00000"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111", "00000", "00000"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110", "00000", "00000"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111", "00000", "00000"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110", "00000", "00000"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010", "00000", "00000"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110", "00000", "00000"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000", "00000", "00000"],
  "r": ["00000", "00000", "10110", "11001", "10000", "10000", "10000", "00000", "00000"],
  "t": ["00100", "00100", "01110", "00100", "00100", "00100", "00011", "00000", "00000"],
  "f": ["00110", "01001", "01000", "11100", "01000", "01000", "01000", "00000", "00000"],
  "j": ["00010", "00000", "00110", "00010", "00010", "00010", "10010", "01100", "00000"],
  "y": ["00000", "00000", "10001", "10001", "10001", "01111", "00001", "01110", "00000"],
  "n": ["00000", "00000", "11110", "10001", "10001", "10001", "10001", "00000", "00000"],
  "u": ["00000", "00000", "10001", "10001", "10001", "10001", "01111", "00000", "00000"],
  "h": ["10000", "10000", "11110", "10001", "10001", "10001", "10001", "00000", "00000"],
  "k": ["10000", "10000", "10010", "10100", "11000", "10100", "10010", "00000", "00000"],
  "z": ["00000", "00000", "11111", "00010", "00100", "01000", "11111", "00000", "00000"],
  "x": ["00000", "00000", "10001", "01010", "00100", "01010", "10001", "00000", "00000"],
  "v": ["00000", "00000", "10001", "10001", "10001", "01010", "00100", "00000", "00000"],
  "c": ["00000", "00000", "01111", "10000", "10000", "10000", "01111", "00000", "00000"],
  "e": ["00000", "00000", "01110", "10001", "11111", "10000", "01110", "00000", "00000"],
  "a": ["00000", "00000", "01110", "00001", "01111", "10001", "01111", "00000", "00000"],
  "o": ["00000", "00000", "01110", "10001", "10001", "10001", "01110", "00000", "00000"],
  "s": ["00000", "00000", "01111", "10000", "01110", "00001", "11110", "00000", "00000"],
};

/** Ordered list of glyphs by ascending ink coverage, then by code point. */
export const GLYPHS: GlyphDef[] = Object.entries(patterns)
  .map(([ch, rows]) => {
    let coverage = 0;
    const masks = rows.map((row) => {
      let m = 0;
      for (let c = 0; c < GLYPH_W; c++) {
        if (row.charCodeAt(c) === 49) {
          m |= 1 << (GLYPH_W - 1 - c);
          coverage++;
        }
      }
      return m;
    });
    return { ch, rows: masks, coverage };
  })
  .sort((a, b) => (a.coverage - b.coverage) || (a.ch.charCodeAt(0) - b.ch.charCodeAt(0)));

/**
 * GLYPHS THAT WERE MISSING FROM `patterns`, kept SEPARATE on purpose.
 *
 * "I" was absent from the table above. The lookup falls back to a BLANK for any character with no
 * pattern, so the capital I rendered as nothing at all — silently. It was found only because a
 * typography test used the word "I" as a short second line and it produced zero placements, which
 * read as a layout bug rather than a missing letter. `{` and `}` were missing for the same reason.
 *
 * WHY NOT JUST ADD THEM ABOVE. `GLYPHS` is sorted by ink coverage, and `buildRamp` derives the
 * glyph ramp from that order. A new pattern changes the sort, which changes the ramp, which changes
 * the Phase 1 film byte-for-byte — and the frozen-baseline gate correctly failed when I did exactly
 * that. The two concerns are genuinely separate: the RAMP is a density vocabulary fixed by the
 * frozen film, while the LOOKUP is a typeface that needs to be complete.
 *
 * NOTE this is a seam that should be closed properly: the ramp ought to be an explicit, versioned
 * list rather than a derivation of whatever the typeface happens to contain. Until then, adding a
 * glyph to the typeface must not touch the ramp.
 */
const supplementalPatterns: Record<string, Pattern> = {
  "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111", "00000", "00000"],
  "{": ["00110", "00100", "00100", "01000", "00100", "00100", "00110", "00000", "00000"],
  "}": ["01100", "00100", "00100", "00010", "00100", "00100", "01100", "00000", "00000"],
};

/** Turn a pattern's string rows into masks and a coverage count. */
function toGlyphDef(ch: string, rows: Pattern): GlyphDef {
  let coverage = 0;
  const masks = rows.map((row) => {
    let m = 0;
    for (let c = 0; c < GLYPH_W; c++) {
      if (row.charCodeAt(c) === 49) {
        m |= 1 << (GLYPH_W - 1 - c);
        coverage++;
      }
    }
    return m;
  });
  return { ch, rows: masks, coverage };
}

/** Lookup table indexed by ASCII code (0x20..0x7E). */
export const GLYPH_BY_CODE: GlyphDef[] = (() => {
  const table: GlyphDef[] = new Array(128);
  const blank: GlyphDef = { ch: " ", rows: new Array(GLYPH_H).fill(0), coverage: 0 };
  for (let i = 0; i < 128; i++) table[i] = blank;
  for (const g of GLYPHS) table[g.ch.charCodeAt(0)] = g;
  return table;
})();

/**
 * THE COMPLETE TYPEFACE — the frozen `GLYPH_BY_CODE` plus the glyphs that were missing from it.
 *
 * WHY THERE ARE TWO TABLES, and it is not redundancy. `GLYPH_BY_CODE` is what `buildRamp` reads to
 * derive the glyph-density ramp, and that ramp is fixed by the byte-frozen Phase 1 film. Adding the
 * missing capital `I` to it CHANGED THE FROZEN FILM — the gate caught it, twice, with the grid
 * hash moving from `49b4c86b…` to `04fbeb53…` and the file growing by 18 bytes.
 *
 * The two concerns are genuinely different:
 *
 *   GLYPH_BY_CODE  the density VOCABULARY a composited field may be quantised into. Frozen.
 *   TYPEFACE       the CHARACTERS a native ASCII object may spell with. Must be complete, because a
 *                  missing letter is not a style — it renders as literally nothing.
 *
 * Native objects draw from TYPEFACE because they are not quantising a field; they are writing.
 *
 * THE PROPER FIX, not done here: the ramp should be an explicit versioned list rather than a
 * derivation of whatever the typeface contains. Until then, this separation keeps the frozen film
 * frozen while letting the typeface be correct.
 */
export const TYPEFACE: GlyphDef[] = (() => {
  const table = GLYPH_BY_CODE.slice();
  for (const [ch, rows] of Object.entries(supplementalPatterns)) {
    table[ch.charCodeAt(0)] = toGlyphDef(ch, rows);
  }
  return table;
})();

/** Look up a character in the complete typeface. */
export function glyphFor(ch: string): GlyphDef | undefined {
  return TYPEFACE[ch.charCodeAt(0)];
}

/**
 * The full vocabulary of the ASCII-only visual language. Every glyph the engine
 * can ever emit is a member of this range.
 */
export const ASCII_VOCABULARY: string = (() => {
  let s = "";
  for (let c = 0x20; c <= 0x7e; c++) s += String.fromCharCode(c);
  return s;
})();

/** Assert every glyph really is printable ASCII (32..126). */
for (const g of GLYPHS) {
  const code = g.ch.charCodeAt(0);
  if (code < 32 || code > 126) {
    throw new Error(`Glyph atlas contains non-printable-ASCII glyph: ${JSON.stringify(g.ch)}`);
  }
  if (g.rows.length !== GLYPH_H) {
    throw new Error(`Glyph ${g.ch} does not have ${GLYPH_H} rows`);
  }
}

/**
 * Density ramps, ordered from lightest ink to heaviest. Each ramp is a subset of
 * the ASCII vocabulary. A ramp is the contract between "how bright is this cell"
 * and "which character is drawn there".
 */
export const DEFAULT_RAMP = " .':;i!|/(l1tfjr[]{}-<>+*=vxcunzoahksdybwmpqdgEUJCLZOFGDSBQRNMPAHKVXYTW0123456789#&$%@";

export const RAMP_SPARSE = " .':;i!|/lt1frj()[]{}<>-+=*^~?vxcunzoahksdybwmpqd";
export const RAMP_DENSE = " .-~:;=+*i!|/lt1frj()[]{}<>vxcunzoahksdybwmpqd#&$%@";

/** Resolve a ramp string into glyphs, skipping any char the atlas lacks. */
export function resolveRamp(ramp: string): GlyphDef[] {
  const out: GlyphDef[] = [];
  for (const ch of ramp) {
    const g = GLYPH_BY_CODE[ch.charCodeAt(0)];
    if (g && g.ch === ch) out.push(g);
  }
  if (out.length < 2) throw new Error(`Ramp resolved to fewer than 2 glyphs: ${JSON.stringify(ramp)}`);
  return out;
}

export const GLYPH_COUNT = GLYPHS.length;
