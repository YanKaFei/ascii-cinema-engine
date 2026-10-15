#!/usr/bin/env node
/**
 * MINIMAL RENDER-BRIDGE REPRODUCTION.
 *
 * The 3.3H defect: the dynamic field changes (contour cells 2300 -> 2474, head-area 135 -> 57) but the line
 * grid is IDENTICAL and the raster is identical. `rasterLines` independently responds to different input.
 *
 * So the fault domain is the bridge: DYNAMIC FIELD -> fieldToLines() -> line grid.
 *
 * This test uses NO room, NO person, NO NAME, NO camera, NO animation. A blank field only.
 */
import { createHash } from 'node:crypto';
const ROOT = new URL('../../', import.meta.url).pathname;
const MT = await import(ROOT + 'dist/src/semantic/motion.js');
const { createField, write } = MT;

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };
const H = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** the bridge under test, reproduced VERBATIM from the render scripts */
const fieldToLines = (f) => { const o = []; for (let r = 0; r < f.rows; r++) { let s = ''; for (let c = 0; c < f.cols; c++) s += f.cells[r * f.cols + c].ch; o.push(s); } return o; };

const COLS = 80, ROWS = 40;
/** field occupancy hash: which cells are occupied */
const occHash = (f) => H(f.cells.map((x) => (x.ch !== ' ' ? '1' : '0')).join(''));
/** field semantic hash: position + glyph + source */
const semHash = (f) => H(f.cells.map((x, i) => (x.ch !== ' ' ? `${i}:${x.ch}:${x.source}` : '')).join(''));
const linesHash = (l) => H(l.join('\n'));
const bb = (l) => { let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0; for (let r = 0; r < l.length; r++) for (let c = 0; c < l[r].length; c++) if (l[r][c] !== ' ') { n++; if (c < x0) x0 = c; if (c > x1) x1 = c; if (r < y0) y0 = r; if (r > y1) y1 = r; } return { n, x0, x1, y0, y1 }; };

console.log('PHASE 3.3H.1 — FIELD -> LINE GRID BRIDGE\n');
console.log('CASE A/B — ONE CELL, TWO POSITIONS\n');

const A = createField(COLS, ROWS);
write(A, 20, 20, { source: 'contour', ch: '#', weight: 1, freshness: 1 });
const B = createField(COLS, ROWS);
write(B, 40, 20, { source: 'contour', ch: '#', weight: 1, freshness: 1 });

const lA = fieldToLines(A), lB = fieldToLines(B);
ok(lA.length === ROWS && lA[0].length === COLS, `fieldToLines emits ${ROWS} rows x ${COLS} cols`);
ok(lA.join('\n') !== lB.join('\n'), 'linesA !== linesB for a cell at x=20 vs x=40');
ok(occHash(A) !== occHash(B), 'field occupancy hash differs');
ok(semHash(A) !== semHash(B), 'field semantic hash differs');
ok(linesHash(lA) !== linesHash(lB), `line-grid hash differs (${linesHash(lA)} vs ${linesHash(lB)})`);

// identify exactly row/column/before/after
{
  const diffs = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (lA[r][c] !== lB[r][c]) diffs.push({ row: r, col: c, before: lA[r][c], after: lB[r][c] });
  ok(diffs.length === 2, `exactly 2 changed characters (${diffs.length})`);
  for (const d of diffs) console.log(`        row ${d.row} col ${d.col}: '${d.before}' -> '${d.after}'`);
  ok(diffs.every((d) => d.row === 20), 'both changes are on row 20');
  ok(diffs.map((d) => d.col).sort((a, b) => a - b).join(',') === '20,40', 'the changes are at columns 20 and 40 — the two written positions');
}
console.log(`  NOTE  bbox A ${JSON.stringify(bb(lA))}  bbox B ${JSON.stringify(bb(lB))}`);

// ---------------------------------------------------------------------------
console.log('\nCASE C/D — DISC TRANSLATION THROUGH THE WHOLE CHAIN\n');
const discCells = (cx, cy, r) => { const out = []; for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (Math.hypot(dx, dy) <= r) out.push([cx + dx, cy + dy]); return out; };
const mkDisc = (cx, cy) => { const f = createField(COLS, ROWS); for (const [x, y] of discCells(cx, cy, 6)) write(f, x, y, { source: 'contour', ch: '#', weight: 1, freshness: 1 }); return f; };
const DA = mkDisc(40, 20), DB = mkDisc(60, 20);

const stages = {
  fieldOccupancy: [occHash(DA), occHash(DB)],
  fieldSemantic: [semHash(DA), semHash(DB)],
  lineGrid: [linesHash(fieldToLines(DA)), linesHash(fieldToLines(DB))],
};
console.log('  stage                 hash A            hash B            changed');
for (const [k, [a, b]] of Object.entries(stages)) {
  console.log(`  ${k.padEnd(20)}  ${a}  ${b}  ${a !== b ? 'YES' : 'NO  <-- DEFECT BOUNDARY'}`);
}
ok(stages.fieldOccupancy[0] !== stages.fieldOccupancy[1], 'field occupancy hash changes with disc translation');
ok(stages.fieldSemantic[0] !== stages.fieldSemantic[1], 'field semantic hash changes with disc translation');
ok(stages.lineGrid[0] !== stages.lineGrid[1], 'LINE-GRID hash changes with disc translation');
{
  const l1 = fieldToLines(DA), l2 = fieldToLines(DB);
  const b1 = bb(l1), b2 = bb(l2);
  console.log(`  NOTE  disc bbox A x${b1.x0}..${b1.x1}  disc bbox B x${b2.x0}..${b2.x1}   (moved ${b2.x0 - b1.x0} columns)`);
  ok(b2.x0 - b1.x0 === 20, `the line-grid bounding box moved exactly 20 columns (${b1.x0} -> ${b2.x0})`);
}

// ---------------------------------------------------------------------------
console.log('\nALIASING / STALE-CAPTURE BEHAVIOUR\n');
{
  const f = createField(COLS, ROWS);
  write(f, 20, 20, { source: 'contour', ch: '#', weight: 1, freshness: 1 });
  const linesA = fieldToLines(f);
  const before = linesA.join('\n');
  /** mutate the SAME field object into state B */
  write(f, 40, 20, { source: 'contour', ch: '#', weight: 1, freshness: 1 });
  const linesB = fieldToLines(f);
  ok(linesA.join('\n') === before, 'linesA is unchanged after the field is mutated (no aliasing)');
  ok(linesB.join('\n') !== before, 'linesB reflects the mutation (no stale capture)');
  ok(linesB[20][40] === '#' && linesB[20][20] === '#', 'both cells present after mutation — write is additive, not a move');
}

// ---------------------------------------------------------------------------
console.log('\nGLYPH EQUIVALENCE — position change versus glyph change\n');
{
  const f = createField(COLS, ROWS);
  write(f, 20, 20, { source: 'contour', ch: '#', weight: 1, freshness: 1 });
  const l1 = fieldToLines(f);
  const g = createField(COLS, ROWS);
  write(g, 20, 20, { source: 'contour', ch: '+', weight: 1, freshness: 1 });
  const l2 = fieldToLines(g);
  ok(linesHash(l1) !== linesHash(l2), 'a GLYPH change at the same cell changes the line grid');
  const h = createField(COLS, ROWS);
  write(h, 40, 20, { source: 'contour', ch: '#', weight: 1, freshness: 1 });
  const l3 = fieldToLines(h);
  ok(linesHash(l1) !== linesHash(l3), 'a POSITION change with the SAME glyph changes the line grid');
  ok(l1[20][20] === '#' && l3[20][40] === '#', 'the glyph is identical in both — only the position differs');
}

// (final tally and exit are at the end of the file, after the raster contract)

// ---------------------------------------------------------------------------
// RASTER CONTRACT (appended): different grid -> different pixels; same grid -> identical
// ---------------------------------------------------------------------------
const { diffLineGrids, churnBetween } = await import(ROOT + 'dist/src/semantic/grid-diff.js');
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(ROOT + 'dist/src/glyphs/atlas.js');
const rW = 1920, rH = 1080;
function raster(lines) {
  const img = { width: rW, height: rH, data: Buffer.alloc(rW * rH * 3) };
  const cw = rW / COLS, chh = rH / ROWS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = lines[r][c]; if (ch === ' ') continue;
    const g = GLYPH_BY_CODE[ch.charCodeAt(0)]; if (!g) continue;
    const v = Math.round(50 + (' .\':-+*#@'.indexOf(ch) / 9) * 205);
    for (let py = 0; py < GLYPH_H; py++) { const mr = g.rows[py]; if (!mr) continue;
      for (let px = 0; px < GLYPH_W; px++) { if (!(mr & (1 << (GLYPH_W - 1 - px)))) continue;
        const x0 = Math.round(c * cw + (px * cw) / GLYPH_W), x1 = Math.round(c * cw + ((px + 1) * cw) / GLYPH_W);
        const y0 = Math.round(r * chh + (py * chh) / GLYPH_H), y1 = Math.round(r * chh + ((py + 1) * chh) / GLYPH_H);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (x < 0 || y < 0 || x >= rW || y >= rH) continue; const o = (y * rW + x) * 3; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; }
      } } }
  return img;
}
const rasterHash = (l) => H(Buffer.from(raster(l).data).toString('binary'));
const pixDiff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };

console.log('\nRASTER CONTRACT\n');
{
  const rA = raster(fieldToLines(DA)), rB = raster(fieldToLines(DB));
  ok(rasterHash(fieldToLines(DA)) !== rasterHash(fieldToLines(DB)), 'different line grid -> different decoded pixels');
  ok(pixDiff(rA, rB) > 0, `the pixel difference is non-zero (${pixDiff(rA, rB)} bytes)`);
  ok(rasterHash(fieldToLines(DA)) === rasterHash(fieldToLines(DA)), 'same line grid -> identical raster');
  ok(pixDiff(raster(fieldToLines(DA)), raster(fieldToLines(DA))) === 0, 'same line grid -> zero differing bytes');
}

console.log('\nGRID-DIFF UTILITY — position change is a rendered change\n');
{
  const a = fieldToLines(A), b = fieldToLines(B);
  const d = diffLineGrids(a, b, 0);
  ok(d.changedPositions === 2 && d.glyphSubstitutions === 0, `a same-glyph move reports 2 POSITION changes and 0 substitutions (${d.changedPositions}/${d.glyphSubstitutions})`);
  const c = churnBetween(a, a);
  ok(c.total === 0 && c.positionChurn === 0, 'identical grids report zero churn of either kind');
  const same = churnBetween(fieldToLines(DA), fieldToLines(DA));
  ok(same.total === 0, 'a static scene reports zero churn — the check the old character-only metric could not make');
  const moved = churnBetween(fieldToLines(DA), fieldToLines(DB));
  ok(moved.positionChurn > 0, `a translating disc reports position churn (${moved.positionChurn})`);
}

console.log(`\n${pass}/${pass + fail} assertions pass (including the raster contract)`);
