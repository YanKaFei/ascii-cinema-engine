/**
 * COMPACT TRUETYPE OUTLINE READER — the scalable typography source for R3.1.
 *
 * ⚠ **WHY THIS EXISTS, AND WHY IT IS NOT A RENDERED BITMAP TABLE.**
 *
 * The fast path would have been to rasterise a system font with an imaging library and commit the resulting
 * coverage masks. That is rejected:
 *
 *   1. **LICENSING.** Rasterised letterforms are a derivative of a licensed font design. Committing them
 *      redistributes that design. **Reading outlines at run time from a font the operator already has does not.**
 *   2. **PORTABILITY.** A macOS-only system-font path would not rebuild elsewhere.
 *
 * So this module extracts only the geometric facts — quadratic outline coordinates — from a real outline font.
 * **No font file and no rasterised font data is stored in this repository.**
 *
 * Covered: `head`, `maxp`, `loca`, `glyf`, `cmap`, `hhea`, `hmtx`. No hinting, no variation axes, no GPOS.
 */
import { readFile } from 'node:fs/promises';

const u16 = (b, o) => b.readUInt16BE(o);
const i16 = (b, o) => b.readInt16BE(o);
const u32 = (b, o) => b.readUInt32BE(o);

export class TtfFont {
  constructor(buf, tables, unitsPerEm, loca, cmap, numHMetrics, path) {
    this.buf = buf; this.tables = tables; this.unitsPerEm = unitsPerEm;
    this.loca = loca; this.cmap = cmap; this.numHMetrics = numHMetrics; this.path = path;
  }

  static async load(path) {
    const buf = await readFile(path);
    const tag = buf.toString('ascii', 0, 4);
    if (tag === 'ttcf') throw new Error(`'${path}' is a TrueType Collection; extract a single face first`);
    const sfnt = u32(buf, 0);
    if (sfnt !== 0x00010000 && tag !== 'true') {
      throw new Error(`'${path}' is not a static TrueType font (sfnt tag '${tag}')`);
    }
    const numTables = u16(buf, 4);
    const tables = {};
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      tables[buf.toString('ascii', rec, rec + 4)] = { off: u32(buf, rec + 8), len: u32(buf, rec + 12) };
    }
    for (const n of ['head', 'maxp', 'loca', 'glyf', 'cmap']) {
      if (!tables[n]) throw new Error(`'${path}' is missing the '${n}' table`);
    }
    const head = tables.head.off;
    const unitsPerEm = u16(buf, head + 18);
    const indexToLocFormat = i16(buf, head + 50);

    const locaOff = tables.loca.off, numGlyphs = u16(buf, tables.maxp.off + 4);
    const loca = [];
    for (let i = 0; i <= numGlyphs; i++) {
      loca.push(indexToLocFormat === 0 ? u16(buf, locaOff + i * 2) * 2 : u32(buf, locaOff + i * 4));
    }

    const cmapOff = tables.cmap.off;
    const nSub = u16(buf, cmapOff + 2);
    let best = -1, bestScore = -1;
    for (let i = 0; i < nSub; i++) {
      const rec = cmapOff + 4 + i * 8;
      const platform = u16(buf, rec), encoding = u16(buf, rec + 2), sub = cmapOff + u32(buf, rec + 4);
      if (u16(buf, sub) !== 4) continue;
      const score = platform === 3 && encoding === 1 ? 2 : 1;
      if (score > bestScore) { bestScore = score; best = sub; }
    }
    if (best < 0) throw new Error(`'${path}' has no cmap format 4 subtable`);
    const cmap = new Map();
    const segX2 = u16(buf, best + 6), seg = segX2 / 2;
    const endO = best + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
    for (let s = 0; s < seg; s++) {
      const end = u16(buf, endO + s * 2), start = u16(buf, startO + s * 2);
      const delta = i16(buf, deltaO + s * 2), rangeOff = u16(buf, rangeO + s * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end && c !== 0x10000; c++) {
        let g;
        if (rangeOff === 0) g = (c + delta) & 0xffff;
        else {
          const gi = rangeO + s * 2 + rangeOff + (c - start) * 2;
          if (gi + 1 >= buf.length) continue;
          g = u16(buf, gi);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g !== 0) cmap.set(c, g);
      }
    }
    const numHMetrics = tables.hhea ? u16(buf, tables.hhea.off + 34) : numGlyphs;
    return new TtfFont(buf, tables, unitsPerEm, loca, cmap, numHMetrics, path);
  }

  get em() { return this.unitsPerEm; }
  glyphIndex(ch) { return this.cmap.get(ch.codePointAt(0)) ?? 0; }
  advance(gid) {
    const h = this.tables.hmtx;
    if (!h) return this.unitsPerEm;
    return u16(this.buf, h.off + Math.min(gid, this.numHMetrics - 1) * 4);
  }

  /**
   * THE OUTLINE as flattened polygons. TrueType stores quadratic B-splines with on-curve and off-curve points and
   * an implied midpoint between consecutive off-curve points; this resolves both, then flattens.
   */
  outline(gid, steps = 8) {
    const b = this.buf, glyfOff = this.tables.glyf.off;
    const start = this.loca[gid] ?? 0, end = this.loca[gid + 1] ?? 0;
    const empty = { contours: [], advanceWidth: this.advance(gid), unitsPerEm: this.unitsPerEm, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 }, composite: false };
    if (end <= start) return empty;
    const g = glyfOff + start;
    const numberOfContours = i16(b, g);
    const bbox = { x0: i16(b, g + 2), y0: i16(b, g + 4), x1: i16(b, g + 6), y1: i16(b, g + 8) };
    if (numberOfContours < 0) return { ...empty, bbox, composite: true };
    if (numberOfContours === 0) return { ...empty, bbox };
    let p = g + 10;
    const endPts = [];
    for (let i = 0; i < numberOfContours; i++) { endPts.push(u16(b, p)); p += 2; }
    const nPts = endPts[endPts.length - 1] + 1;
    p += 2 + u16(b, p);
    const flags = [];
    while (flags.length < nPts) {
      const f = b[p++];
      flags.push(f);
      if (f & 8) { let r = b[p++]; while (r--) flags.push(f); }
    }
    const xs = []; let x = 0;
    for (const f of flags) {
      if (f & 2) { const d = b[p++]; x += f & 16 ? d : -d; }
      else if (!(f & 16)) { x += i16(b, p); p += 2; }
      xs.push(x);
    }
    const ys = []; let y = 0;
    for (const f of flags) {
      if (f & 4) { const d = b[p++]; y += f & 32 ? d : -d; }
      else if (!(f & 32)) { y += i16(b, p); p += 2; }
      ys.push(y);
    }
    const contours = [];
    let s = 0;
    for (const e of endPts) {
      const pts = [];
      for (let i = s; i <= e; i++) pts.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) !== 0 });
      s = e + 1;
      const out = [];
      const n = pts.length;
      if (!n) { contours.push(out); continue; }
      let startIdx = pts.findIndex((q) => q.on);
      const startPt = startIdx >= 0 ? pts[startIdx] : { x: (pts[0].x + pts[n - 1].x) / 2, y: (pts[0].y + pts[n - 1].y) / 2, on: true };
      if (startIdx < 0) startIdx = 0;
      out.push({ x: startPt.x, y: startPt.y });
      let cur = startPt, i = startIdx;
      for (let k = 0; k < n + 1; k++) {
        const nxt = pts[(i + 1) % n];
        if (nxt.on) { out.push({ x: nxt.x, y: nxt.y }); cur = nxt; i = (i + 1) % n; continue; }
        const aft = pts[(i + 2) % n];
        const ex = aft.on ? aft.x : (nxt.x + aft.x) / 2;
        const ey = aft.on ? aft.y : (nxt.y + aft.y) / 2;
        for (let t = 1; t <= steps; t++) {
          const u = t / steps, iu = 1 - u;
          out.push({ x: iu * iu * cur.x + 2 * iu * u * nxt.x + u * u * ex, y: iu * iu * cur.y + 2 * iu * u * nxt.y + u * u * ey });
        }
        cur = { x: ex, y: ey };
        i = (i + (aft.on ? 2 : 1)) % n;
      }
      contours.push(out);
    }
    return { contours, advanceWidth: this.advance(gid), unitsPerEm: this.unitsPerEm, bbox, composite: false };
  }
}

/**
 * COVERAGE MASK — the MACRO LETTER TOPOLOGY.
 *
 * ⚠ **MACRO vs MICRO IS THE CENTRAL DISTINCTION OF R3.1.** This function produces the MACRO layer: how much of a
 * macro cell is inside the letter, using the non-zero winding rule on the flattened contours. It says nothing
 * about which ASCII character will be drawn. **A pixel of a letter mask is not an ASCII glyph**, and R3's failure
 * came from treating one 5x9 bitmap pixel as an enormous uniform block.
 *
 * @param w,h macro grid dimensions
 * @param samples supersampling per axis for anti-aliased coverage
 */
export function coverageMask(outline, w, h, opts = {}) {
  const { samples = 3, padding = 0.06, letter = '' } = opts;
  const outlineBox = outline.bbox;
  const ow = outlineBox.x1 - outlineBox.x0, oh = outlineBox.y1 - outlineBox.y0;
  if (ow <= 0 || oh <= 0) return { cells: new Float32Array(w * h), w, h, box: outlineBox };
  const pad = padding * oh;
  const scale = Math.min(w / (ow + pad * 2), h / (oh + pad * 2));
  const ox = (w - ow * scale) / 2 - outlineBox.x0 * scale;
  const oy = (h - oh * scale) / 2 + outlineBox.y1 * scale;
  const txf = (p) => ({ x: p.x * scale + ox, y: oy - p.y * scale });
  const polys = outline.contours.map((c) => c.map(txf));
  const cells = new Float32Array(w * h);
  const inv = 1 / (samples * samples);
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    let hit = 0;
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      const px = cx + (sx + 0.5) / samples, py = cy + (sy + 0.5) / samples;
      if (insideNonZero(polys, px, py)) hit++;
    }
    cells[cy * w + cx] = hit * inv;
  }
  return { cells, w, h, box: outlineBox, letter };
}

/** the non-zero winding rule over a set of closed contours — this is what preserves a letter's COUNTER */
export function insideNonZero(polys, px, py) {
  let wind = 0;
  for (const poly of polys) {
    const n = poly.length;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      if (a.y <= py) {
        if (b.y > py && cross(a, b, px, py) > 0) wind++;
      } else if (b.y <= py && cross(a, b, px, py) < 0) wind--;
    }
  }
  return wind !== 0;
}
const cross = (a, b, x, y) => (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);

/**
 * MACRO CELL FIELD — per-cell coverage AND stroke orientation.
 *
 * **Orientation is what lets a stroke be built from directional ASCII material** rather than from a uniform
 * fill: the gradient of the coverage field points across the stroke, so its perpendicular is along it.
 */
export function macroField(mask) {
  const { cells, w, h } = mask;
  const out = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : cells[yy * w + xx]);
    const gx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
    const gy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
    const mag = Math.hypot(gx, gy);
    out[i] = {
      coverage: cells[i],
      edgeMagnitude: mag,
      /** direction ALONG the stroke, in degrees */
      strokeAngleDeg: (Math.atan2(gx, -gy) * 180) / Math.PI,
      isEdge: mag > 0.28,
      isInside: cells[i] > 0.5 && mag <= 0.28,
    };
  }
  return out;
}
