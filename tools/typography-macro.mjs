/**
 * MACRO LETTER TOPOLOGY — real font outlines, and nothing else.
 *
 * ⚠ **THE TWO SCALES, STATED ONCE.**
 *
 *   MACRO LETTER TOPOLOGY   the outline of N A M E: strokes, counters, outer contour, spacing, bounding box.
 *                           This comes from a real font's quadratic outlines rasterised to a coverage field.
 *   MICRO ASCII GLYPH       the character drawn in one output cell, its weight and orientation.
 *                           This is chosen FROM the macro field; it is not the macro field.
 *
 * R3's failure was collapsing the two: one pixel of a 5x9 bitmap was enlarged into a block of identical `#`.
 * **A mask pixel is not a glyph.** This module produces only the macro layer.
 */
import { TtfFont, coverageMask, macroField } from './ttf-outline.mjs';

/** Ordered preference. The licence note is recorded in the render output, not hidden. */
export const FONT_CANDIDATES = [
  { path: '/System/Library/Fonts/Supplemental/Arial Bold.ttf', name: 'Arial Bold', weight: 'bold' },
  { path: '/System/Library/Fonts/Supplemental/Helvetica.ttc', name: 'Helvetica', weight: 'regular' },
  { path: '/System/Library/Fonts/Supplemental/Verdana Bold.ttf', name: 'Verdana Bold', weight: 'bold' },
  { path: '/System/Library/Fonts/Geneva.ttf', name: 'Geneva', weight: 'regular' },
];

let cachedFont = null, cachedInfo = null, cachedCapUnits = null;

/**
 * CAP HEIGHT IN FONT UNITS, measured from the font's OWN `H` and `O` rather than assumed. `H` gives the flat cap
 * line; `O` overshoots it slightly, so the flat one is the honest cap height.
 */
function fontCapHeightUnits(font) {
  if (cachedCapUnits) return cachedCapUnits;
  const h = font.outline(font.glyphIndex('H'));
  cachedCapUnits = h.bbox.y1 > 0 ? h.bbox.y1 : font.em * 0.72;
  return cachedCapUnits;
}
/** Load the first available outline font. **Only the path and face name are recorded — no font data is stored.** */
export async function loadFont(explicitPath) {
  if (cachedFont && !explicitPath) return { font: cachedFont, info: cachedInfo };
  const candidates = explicitPath ? [{ path: explicitPath, name: explicitPath.split('/').pop(), weight: 'explicit' }] : FONT_CANDIDATES;
  const errors = [];
  for (const c of candidates) {
    try {
      const font = await TtfFont.load(c.path);
      if (!explicitPath) { cachedFont = font; cachedInfo = { path: c.path, name: c.name, weight: c.weight, unitsPerEm: font.em }; }
      return { font, info: { path: c.path, name: c.name, weight: c.weight, unitsPerEm: font.em } };
    } catch (e) { errors.push(`${c.path}: ${e.message}`); }
  }
  throw new Error(`no usable outline font found:\n  ${errors.join('\n  ')}`);
}

/**
 * LAY OUT A WORD in macro space using the font's OWN advances, so letter spacing and the baseline are the
 * designer's rather than invented.
 *
 * Returns a single macro coverage field for the whole word plus per-letter boxes, which is what makes
 * "two adjacent letters must not merge" a measurable property rather than an assertion.
 */
export async function macroWord(text, opts = {}) {
  const { capHeightCells = 30, tracking = 0.04, spaceAdvance = 0.34, samples = 3 } = opts;
  const { font, info } = await loadFont(opts.fontPath);
  const upper = String(text).toUpperCase();
  const upe = font.em;
  const spaceUnits = upe * spaceAdvance;

  /**
   * ⚠ THE WHOLE WORD SHARES ONE ORIGIN AND ONE SCALE, AND THIS IS THE BASELINE FIX.
   *
   * The first version gave every glyph its OWN mask with its own bounding box, so each letter was centred inside
   * its own box. **A letter whose bbox is short then floated and one whose bbox is tall sank — the baseline was
   * not shared.** Measured: `NAME` showed `N`, `A`, `M` on different rows.
   *
   * The word is now laid out in ONE macro frame: a union bounding box computed from the font's own glyph boxes,
   * one scale, and every glyph rasterised at its pen position expressed in that frame.
   */
  const glyphs = [];
  let penUnits = 0, totalUnits = 0;
  for (const ch of upper) {
    if (ch === ' ') { glyphs.push({ ch, blank: true, penUnits, advance: spaceUnits, outline: null }); penUnits += spaceUnits + upe * tracking; continue; }
    const gid = font.glyphIndex(ch);
    const o = font.outline(gid);
    glyphs.push({ ch, gid, blank: false, penUnits, advance: o.advanceWidth, outline: o });
    penUnits += o.advanceWidth + upe * tracking;
  }
  totalUnits = penUnits;
  if (totalUnits <= 0) return { text: upper, w: 0, h: 0, cells: new Float32Array(0), letters: [], font: info };

  /** the union box in FONT UNITS across every glyph, placed at its own pen offset */
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  for (const g of glyphs) {
    if (g.blank) continue;
    const b = g.outline.bbox;
    gx0 = Math.min(gx0, g.penUnits + b.x0); gx1 = Math.max(gx1, g.penUnits + b.x1);
    gy0 = Math.min(gy0, b.y0); gy1 = Math.max(gy1, b.y1);
  }
  if (!Number.isFinite(gx0)) { gx0 = 0; gx1 = totalUnits; gy0 = 0; gy1 = upe * 0.72; }
  const boxW = Math.max(1, gx1 - gx0), boxH = Math.max(1, gy1 - gy0);

  /**
   * ⚠ THE SCALE IS DRIVEN BY CAP HEIGHT, NOT BY THE UNION BOX HEIGHT — and getting this wrong stretched the word.
   *
   * The first version scaled by the union box height, which spans ascender to descender. For `NAME` — four
   * capital letters with no descender — the union box is much taller than the letters, so the SAME height budget
   * bought far more horizontal extent: the word measured **118x30 macro cells**, an aspect of 3.9 against a
   * natural `NAME` aspect near 2.4. **The word was stretched, and `I` was a solid 6x30 bar** because a narrow
   * letter with a tall box scales its stroke horizontally.
   *
   * The scale is now set so the CAP HEIGHT — taken from the font's own `H` and `O`, not from a glyph's bbox —
   * occupies a fixed fraction of the macro rows. That is the typographic convention and it removes the stretch.
   */
  const capUnits = fontCapHeightUnits(font);
  const leadingRows = Math.max(2, Math.round(capHeightCells * 0.16));
  const scale = (capHeightCells - leadingRows * 2) / capUnits;
  const w = Math.max(1, Math.round(boxW * scale));
  const h = capHeightCells;
  /** the baseline row: cap height sits at the top, descenders below it, all inside the shared frame */
  const baselineRow = leadingRows + (capHeightCells - leadingRows * 2);
  /** vertical origin so that font y=0 maps to `baselineRow` */
  const verticalOrigin = baselineRow;
  const cells = new Float32Array(w * h);

  const letters = [];
  for (const g of glyphs) {
    if (g.blank) {
      letters.push({ char: g.ch, index: letters.length, gid: 0, blank: true, x0: Math.round((g.penUnits - gx0) * scale), x1: Math.round((g.penUnits + g.advance - gx0) * scale), columns: null, contourCount: 0, outlinePoints: 0, advanceUnits: g.advance });
      continue;
    }
    const b = g.outline.bbox;
    /** the glyph's own box in macro cells, inside the shared frame */
    const cx0 = Math.round((g.penUnits + b.x0 - gx0) * scale);
    /** ⚠ the baseline is shared: a glyph's font-unit y maps through ONE origin, so nothing drifts or descends past the frame */
    const cy0 = Math.round(verticalOrigin - b.y1 * scale);
    const cw = Math.max(1, Math.round((b.x1 - b.x0) * scale));
    const chh = Math.max(1, Math.round((b.y1 - b.y0) * scale));
    /** never rasterise outside the shared frame */
    const clipTop = Math.max(0, -cy0);
    const clipBot = Math.max(0, cy0 + chh - h);
    if (clipTop + clipBot >= chh) continue;
    /** rasterise the letter into exactly its own box so the shared frame is respected exactly */
    const m = coverageMask(g.outline, cw, chh, { samples, padding: 0 });
    const occupied = [];
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
      const v = m.cells[y * cw + x];
      if (v <= 0) continue;
      const wx = cx0 + x, wy = cy0 + y;
      if (wy < 0 || wy >= h) continue;
      if (wx < 0 || wx >= w || wy < 0 || wy >= h) continue;
      const i = wy * w + wx;
      cells[i] = Math.max(cells[i], v);
      occupied.push(wx);
    }
    letters.push({
      char: g.ch, index: letters.length, gid: g.gid, blank: false,
      x0: cx0, x1: cx0 + cw,
      columns: occupied.length ? [Math.min(...occupied), Math.max(...occupied)] : [cx0, cx0],
      contourCount: g.outline.contours.length,
      outlinePoints: g.outline.contours.reduce((a, c) => a + c.length, 0),
      advanceUnits: g.advance,
    });
  }
  return { text: upper, w, h, cells, letters, font: info, tracking, scale, capUnits, baselineRow, boxUnits: { w: boxW, h: boxH } };
}

/** per-cell classification of the macro field: edge / inside / outside, with stroke direction */
export function classify(macro) {
  const field = macroField({ cells: macro.cells, w: macro.w, h: macro.h });
  let edge = 0, inside = 0, outside = 0;
  for (const c of field) { if (c.isEdge) edge++; else if (c.isInside) inside++; else outside++; }
  return { field, census: { edge, inside, outside, total: macro.w * macro.h } };
}

/**
 * MICRO GLYPH MATERIAL — the ASCII character chosen for one macro cell.
 *
 * ⚠ **THIS IS THE MICRO LAYER, AND IT IS CHOSEN FROM THE MACRO STRUCTURE RATHER THAN FILLED.**
 *
 *   EDGE cells      get a DIRECTIONAL character from the stroke angle, so a contour is drawn by material whose
 *                   orientation matches the stroke. This is what keeps a letter readable at large scale.
 *   INSIDE cells    get a very light material, so the letter's COUNTER and its mass are distinguished and the
 *                   interior does not compete with the contour.
 *   OUTSIDE cells   are empty — this is the negative space the order requires.
 */
/**
 * ⚠ STROKE MATERIAL IS DENSE AND INTERIOR MATERIAL IS ABSENT, AND THAT ASYMMETRY IS THE WHOLE DESIGN.
 *
 * The first version put `|` on edges and `.` on every inside cell, giving **49% ink coverage** — the counters
 * filled in and `N A M E` read as four filled bands. **A letter is recognised by its STROKE, not by its area.**
 *
 * So: edges carry a heavy glyph, and the interior is EMPTY unless a thin structural spine is needed to keep a
 * wide stroke from looking like two separate contours. That drops coverage to roughly a quarter of the box and
 * makes the counter — the negative space the order requires — do the work of recognition.
 */
export const DIRECTIONAL_RAMP = [
  { deg: 0, chars: ['=', '='] },      // horizontal stroke
  { deg: 45, chars: ['/', '/'] },     // rising diagonal
  { deg: 90, chars: ['|', 'I'] },     // vertical stroke
  { deg: 135, chars: ['\\', '\\'] },  // falling diagonal
];

/**
 * INTERIOR SPINE — a light interior material on cells that are DEEP inside a stroke.
 *
 * `depth` is the distance to the nearest edge cell. Only cells beyond a threshold receive material, so a thin
 * stroke gets none and a thick stem gets a faint core instead of a filled block.
 */
export function spineFor(macro, field, x, y, opts = {}) {
  const { minDepth = 2, glyph = ':' } = opts;
  const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= macro.w || yy >= macro.h ? null : field[yy * macro.w + xx]);
  let d = 0;
  for (let r = 1; r <= minDepth; r++) {
    let hitEdge = false;
    for (let dx = -r; dx <= r && !hitEdge; dx++) for (let dy = -r; dy <= r && !hitEdge; dy++) {
      const c = at(x + dx, y + dy);
      if (!c || c.coverage <= 0.06 || c.isEdge) hitEdge = true;
    }
    if (hitEdge) break;
    d = r;
  }
  return d >= minDepth ? { glyph, weight: 0.22, role: 'spine' } : { glyph: ' ', weight: 0, role: 'inside' };
}

export function microGlyphFor(cell, opts = {}) {
  const { lightInside = true, edgeChars = true } = opts;
  if (cell.coverage <= 0.06) return { glyph: ' ', weight: 0, role: 'outside' };
  if (cell.isEdge && edgeChars) {
    const a = ((cell.strokeAngleDeg % 180) + 180) % 180;
    let best = DIRECTIONAL_RAMP[0], bestD = 1e9;
    for (const d of DIRECTIONAL_RAMP) {
      const dist = Math.min(Math.abs(a - d.deg), 180 - Math.abs(a - d.deg));
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return { glyph: best.chars[0], weight: Math.min(1, 0.55 + cell.edgeMagnitude * 0.9), role: 'edge', strokeAngleDeg: a };
  }
  /**
   * ⚠ THE INTERIOR IS EMPTY BY DEFAULT. A thin spine is drawn only where the stroke is THICK and the cell is
   * far from any edge, which keeps a wide stem reading as one stroke without filling the counter.
   */
  if (!lightInside) return { glyph: ' ', weight: 0, role: 'inside' };
  return { glyph: ' ', weight: 0, role: 'inside' };
}

/**
 * READABILITY DIAGNOSTIC — the measurements that make "is it readable" checkable rather than asserted.
 *
 * `minLetterGap` is the number of empty macro columns between adjacent letters' occupied columns. **Two letters
 * that touch have merged**, and that is a defect this detects.
 */
export function readability(macro) {
  const nonBlank = macro.letters.filter((l) => !l.blank);
  const gaps = [];
  for (let i = 1; i < nonBlank.length; i++) {
    const a = nonBlank[i - 1], b = nonBlank[i];
    gaps.push(b.columns[0] - a.columns[1] - 1);
  }
  /** stroke continuity: the fraction of edge cells that have at least one edge neighbour of the same angle family */
  const { field } = classify(macro);
  let edgeCells = 0, continuous = 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= macro.w || y >= macro.h ? null : field[y * macro.w + x]);
  for (let y = 0; y < macro.h; y++) for (let x = 0; x < macro.w; x++) {
    const c = at(x, y);
    if (!c || !c.isEdge) continue;
    edgeCells++;
    const fam = (a) => Math.round((((a % 180) + 180) % 180) / 45) % 4;
    const f = fam(c.strokeAngleDeg);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = at(x + dx, y + dy);
      if (n && n.isEdge && fam(n.strokeAngleDeg) === f) { continuous++; break; }
    }
  }
  return {
    text: macro.text,
    macroGrid: `${macro.w}x${macro.h}`,
    letters: nonBlank.length,
    minLetterGap: gaps.length ? Math.min(...gaps) : null,
    letterGaps: gaps,
    lettersMerged: gaps.some((g) => g < 0),
    strokesContinuousFraction: edgeCells ? continuous / edgeCells : 0,
    inkCoverage: [...macro.cells].filter((v) => v > 0.5).length / (macro.w * macro.h),
  };
}
