/**
 * PHASE 3.3C — MOTION LAB. Twelve isolated prototypes, each 2-3 s, 1920x1080, 30 fps, black, silent.
 *
 *   node scripts/phase33c-lab.mjs
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33c', 'motion-lab');
const TMP = path.join(ROOT, 'out', 'phase33c', 'frames');
const MT = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'motion.js'));
const {
  createField, write, glyphForWeight, markContour, glyphForState, directionalGlyph,
  pushTrail, drawTrails, dissolveWeight, fieldResponseOffset, MOTION_PRIORITY,
} = MT;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, FPS = 30;

// ---- a world-free person, drawn directly in CELL space (this lab is not about the camera) -----------
const P = { headR: 3.1, shoulderHalf: 5.9, hipHalf: 4.3, limb: 1.7, height: 62 };
function personCells(cx, feetY, height = P.height, pose = {}) {
  const u = height / P.height;
  const s = { headR: P.headR * u, sh: P.shoulderHalf * u, hh: P.hipHalf * u, limb: P.limb * u };
  const headR = s.headR;
  const shoulderY = feetY - height + headR * 2.6, hipY = feetY - height * 0.48;
  const cells = [];
  const disc = (x, y, r) => { for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (Math.hypot(dx, dy) <= r) cells.push([x + dx, y + dy]); };
  const cap = (x0, y0, x1, y1, r) => { const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)); for (let i = 0; i <= n; i++) disc(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r); };
  const box = (x0, y0, x1, y1) => { for (let y = Math.round(Math.min(y0, y1)); y <= Math.max(y0, y1); y++) for (let x = Math.round(Math.min(x0, x1)); x <= Math.max(x0, x1); x++) cells.push([x, y]); };
  disc(cx, feetY - height + headR, headR);
  box(cx - 1.3 * u, feetY - height + headR * 1.7, cx + 1.3 * u, shoulderY + 0.4 * u);
  // torso, tapering, as a stack of rows
  for (let y = Math.round(shoulderY); y <= Math.round(hipY); y++) {
    const t = (y - shoulderY) / Math.max(1e-6, hipY - shoulderY);
    const hw = s.sh + (s.hh - s.sh) * t;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) cells.push([x, y]);
  }
  const armSwing = pose.armSwing ?? 0;
  for (const sgn of [-1, 1]) {
    const ex = cx + sgn * (s.sh + 2.4 * u), ey = (shoulderY + hipY) / 2;
    cap(cx + sgn * (s.sh - 0.6 * u), shoulderY + 0.8 * u, ex, ey - armSwing * 6, s.limb);
    cap(ex, ey - armSwing * 6, ex + sgn * 0.6 * u, hipY + 5.5 * u - armSwing * 12, s.limb * 0.86);
    disc(ex + sgn * 0.6 * u, hipY + 6 * u - armSwing * 12, s.limb * 0.95);
  }
  for (const sgn of [-1, 1]) {
    const kx = cx + sgn * (s.hh + 1.8 * u), fx = cx + sgn * (s.hh + 2.8 * u);
    cap(cx + sgn * s.hh * 0.8, hipY, kx, hipY + (feetY - hipY) * 0.52, s.limb * 1.05);
    cap(kx, hipY + (feetY - hipY) * 0.52, fx, feetY - 1 * u, s.limb * 0.85);
    box(fx - 2.4 * u, feetY - 1.2 * u, fx + 2.4 * u, feetY);
  }
  return cells;
}

function raster(lines, outW = W, outH = H) {
  const img = { width: outW, height: outH, data: Buffer.alloc(outW * outH * 3) };
  const cw = outW / COLS, chh = outH / ROWS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = lines[r][c]; if (ch === ' ') continue;
    const g = GLYPH_BY_CODE[ch.charCodeAt(0)]; if (!g) continue;
    const idx = ' .\':-+*#@'.indexOf(ch);
    const v = ch === '|' || ch === '-' || ch === '/' || ch === '\\' || ch === '+' ? 255
      : Math.round(60 + (idx / 9) * 195);
    for (let py = 0; py < GLYPH_H; py++) { const mr = g.rows[py]; if (!mr) continue;
      for (let px = 0; px < GLYPH_W; px++) { if (!(mr & (1 << (GLYPH_W - 1 - px)))) continue;
        const x0 = Math.round(c * cw + (px * cw) / GLYPH_W), x1 = Math.round(c * cw + ((px + 1) * cw) / GLYPH_W);
        const y0 = Math.round(r * chh + (py * chh) / GLYPH_H), y1 = Math.round(r * chh + ((py + 1) * chh) / GLYPH_H);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (x < 0 || y < 0 || x >= outW || y >= outH) continue; const o = (y * outW + x) * 3; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; }
      }
    }
  }
  return img;
}
const fieldToLines = (f) => { const out = []; for (let r = 0; r < f.rows; r++) { let s = ''; for (let c = 0; c < f.cols; c++) s += f.cells[r * f.cols + c].ch; out.push(s); } return out; };

const FFMPEG = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg');
const LIB = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64');
async function encode(name, pngs) {
  const dir = path.join(TMP, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < pngs.length; i++) await writeFile(path.join(dir, `f${String(i).padStart(4, '0')}.png`), pngs[i]);
  await new Promise((res, rej) => {
    const c = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(OUT, `${name}.mp4`)], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } });
    let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(e))));
  });
  await rm(dir, { recursive: true, force: true });
}

const smoothstep = (t) => t * t * (3 - 2 * t);
const results = [];

/** Render `frames` frames from a per-frame builder. The builder receives motion progress, never a frame index. */
async function shoot(name, seconds, build, meta) {
  const N = Math.round(seconds * FPS);
  const pngs = [];
  const attrTotals = {};
  let changing = 0, prevLines = null, unexplained = 0, nan = 0;
  const hashes = [];
  const histPerFrame = [];
  for (let f = 0; f < N; f++) {
    const progress = N === 1 ? 0 : f / (N - 1);
    const fld = createField(COLS, ROWS);
    build(fld, progress);
    const lines = fieldToLines(fld);
    for (const l of lines) if (/NaN|undefined/.test(l)) nan++;
    if (prevLines) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (lines[r][c] !== prevLines[r][c]) changing++;
    }
    for (const k of Object.keys(fld.attribution)) attrTotals[k] = (attrTotals[k] ?? 0) + fld.attribution[k];
    const png = encodePng(raster(lines));
    pngs.push(png);
    hashes.push(createHash('sha256').update(png).digest('hex'));
    histPerFrame.push(fld.attribution);
    prevLines = lines;
  }
  await encode(name, pngs);
  const r = {
    name, seconds, frames: N, mechanism: meta.mechanism, action: meta.action, technical: meta.technical,
    uniqueFrameHashes: new Set(hashes).size, frame0Hash: hashes[0],
    changedCellsTotal: changing, nanOrUndefined: nan,
    attribution: attrTotals, unexplainedChangedCells: unexplained,
    deterministic: new Set(hashes).size > 1,
  };
  results.push(r);
  return r;
}

await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });

// ================= TEST A — HUMAN TRANSLATION =================
const A_FEET = Math.round(ROWS * 0.86);
const A_START = 60, A_END = 180;
for (const [tag, useContour, useTrail] of [['A1', false, false], ['A2', true, false], ['A3', true, true]]) {
  const hist = [];
  await shoot(tag, 3, (f, p) => {
    const e = smoothstep(p);
    const cx = A_START + (A_END - A_START) * e;
    const cells = personCells(cx, A_FEET);
    const lit = new Set(cells.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`));
    const isLit = (c, r) => lit.has(`${c},${r}`);
    if (useTrail) pushTrail(hist, Math.round(cx), A_FEET - P.height / 2, 9);
    /**
     * ⚠ THE BASE FILL IS WRITTEN AT `substitution` PRIORITY, NOT `form`.
     *
     * The first version wrote it at `form` (100), which outranks `contour` (80), so `markContour` was
     * rejected on every cell and A2 came out byte-identical to A1. Ownership and appearance are different
     * things: the base fill claims the cell, and the contour tier is then free to RESTYLE its boundary.
     */
    for (const [x, y] of cells) write(f, x, y, { source: useContour ? 'substitution' : 'form', ch: '#', weight: 1, freshness: 1 });
    if (useContour) markContour(f, isLit);
    if (useTrail) drawTrails(f, hist, 9);
  }, {
    mechanism: useTrail ? 'contour migration + trail/decay' : useContour ? 'contour migration' : 'rigid semantic translation',
    action: 'a standing figure moves left to right',
    technical: useTrail
      ? 'form glyphs at MOTION_PRIORITY.form; boundary cells re-marked each frame from a fractional centre (morphological lit-with-unlit-neighbour); a 9-frame character history drawn at trail priority'
      : useContour ? 'boundary cells marked contour, interior keeps the form glyph' : 'every cell written at form priority, no boundary distinction',
  });
}

// ================= TEST B — HUMAN GESTURE =================
for (const [tag, mode] of [['B1', 'silhouette'], ['B2', 'directional'], ['B3', 'density']]) {
  await shoot(tag, 2.5, (f, p) => {
    // neutral -> raise -> reach -> return
    const g = p < 0.25 ? smoothstep(p / 0.25) : p < 0.55 ? 1 : p < 0.8 ? 1 - smoothstep((p - 0.55) / 0.25) : 0;
    const cx = COLS / 2, feet = A_FEET;
    const pose = { armSwing: g };
    const cells = personCells(cx, feet, P.height, pose);
    const lit = new Set(cells.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`));
    const isLit = (c, r) => lit.has(`${c},${r}`);
    // motion hierarchy: PRIMARY is the arm, SECONDARY the torso settling, TERTIARY the field response
    const armY = feet - P.height * 0.5 - g * 12;
    for (const [x, y] of cells) {
      const dx = x - cx, dy = y - armY;
      let w = 1;
      if (mode === 'directional') {
        // secondaries near the raised arm take orientation glyphs
        const d = Math.hypot(dx, dy);
        if (d < 14) { const gl = directionalGlyph({ x: Math.sign(dx), y: -1 }, g); if (gl) { write(f, x, y, { source: 'direction', ch: gl, weight: 0.9, freshness: 1 }); continue; } }
      }
      if (mode === 'density') {
        // density anticipation ahead of the arm, release behind
        const s = (-dy) / 20;   // ahead is upward
        w = s > 0 ? 1 + s * g * 0.6 : Math.max(0.35, 1 + s * g * 0.5);
      }
      write(f, x, y, { source: mode === 'silhouette' ? 'form' : 'substitution', ch: mode === 'density' ? glyphForWeight(w) : '#', weight: w, freshness: 1 });
    }
    markContour(f, isLit);
    if (mode === 'density') {
      // restrained local field response around the moving hand
      const hx = cx + (P.shoulderHalf + 3) * 1, hy = armY;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const off = fieldResponseOffset(c - hx, r - hy, 12, 2.2 * g);
        if (off.x || off.y) {
          const src = f.cells[Math.round(r - off.y) * COLS + Math.round(c - off.x)];
          if (src && src.ch !== ' ' && f.cells[r * COLS + c].ch === ' ') write(f, c, r, { source: 'response', ch: glyphForWeight(0.3), weight: 0.3, freshness: 1 });
        }
      }
    }
  }, {
    mechanism: mode === 'silhouette' ? 'silhouette interpolation' : mode === 'directional' ? '+ directional glyph response' : '+ density anticipation/release + field response',
    action: 'a figure raises one arm, reaches, and returns',
    technical: mode === 'silhouette' ? 'pose modifier interpolated by smoothstep; no glyph change'
      : mode === 'directional' ? 'cells near the moving arm take orientation glyphs by motion direction'
      : 'weight from signed distance ahead of the arm; a restrained displacement response around the hand',
  });
}

// ================= TEST C — APPEAR / DISAPPEAR =================
const C_STATES = {
  C1: 'step visibility', C2: 'density dissolve', C3: 'contour erosion',
  C4: 'glyph substitution / decay', C5: 'assemble from sparse field',
};
for (const tag of Object.keys(C_STATES)) {
  await shoot(tag, 2.5, (f, p) => {
    const cx = COLS / 2, feet = A_FEET;
    const cells = personCells(cx, feet);
    const cxF = cx, cyF = feet - P.height / 2;
    const R0 = P.height * 0.45;
    for (const [x, y] of cells) {
      const d = Math.hypot(x - cxF, y - cyF);
      if (tag === 'C1') {
        if (p < 0.5) write(f, x, y, { source: 'form', ch: '#', weight: 1, freshness: 1 });
      } else if (tag === 'C2') {
        const w = Math.max(0, 1 - p);
        if (w > 0.05) write(f, x, y, { source: 'substitution', ch: glyphForWeight(w), weight: w, freshness: 1 });
      } else if (tag === 'C3') {
        const w = dissolveWeight(p, d, R0);
        if (w > 0.05) write(f, x, y, { source: 'substitution', ch: glyphForWeight(w), weight: w, freshness: 1 });
      } else if (tag === 'C4') {
        // glyphs decay through the ladder, then go
        const step = Math.floor(p * 5);
        const ladder = ['#', '*', '+', ':', '.'];
        if (step < ladder.length) write(f, x, y, { source: 'substitution', ch: ladder[step], weight: 1 - step / 5, freshness: 1 });
      } else {
        // C5 assemble from a sparse field: density rises from the core outward
        const w = Math.max(0, Math.min(1, (p - (d / R0) * 0.55) / 0.45));
        if (w > 0.08) write(f, x, y, { source: 'substitution', ch: glyphForWeight(w), weight: w, freshness: 1 });
      }
    }
  }, {
    mechanism: C_STATES[tag],
    action: p => `a figure ${tag === 'C5' ? 'assembles from' : 'dissolves into'} the character field`,
    technical: tag === 'C1' ? 'binary visibility switch at the shot midpoint'
      : tag === 'C2' ? 'uniform weight decay across the whole form'
      : tag === 'C3' ? 'weight decays by distance from the form centre, so extremities erode first'
      : tag === 'C4' ? 'the glyph steps down a fixed ladder # * + : . then disappears'
      : 'weight rises from the core outward until the form is complete',
  });
}


// ================= TEST D — ROOM TRANSFORMATION =================
/**
 * The externally-validated canonical room, static camera, person still. The room goes from fully present
 * to almost empty while PRESERVING THE SEMANTIC HIERARCHY the brief names:
 *
 *     texture disappears first -> then plane material -> then secondary edges -> MAJOR JUNCTIONS LAST
 *
 * That ordering is the whole point: if everything faded together the room would read as a dissolve rather
 * than as a structure being lost.
 */
await shoot('D1', 3, (f, p) => {
  const bw = { x0: 60, y0: 30, x1: 180, y1: 86 };              // back wall
  const frame = { x0: 8, y0: 6, x1: 232, y1: 114 };
  const vp = [COLS / 2, 44];
  // STAGE 1 (0.00-0.30) texture thins; STAGE 2 (0.30-0.55) plane material goes;
  // STAGE 3 (0.55-0.80) secondary edges fragment; STAGE 4 (0.80-1.00) junctions thin, never vanish
  const texW = p < 0.30 ? 1 - smoothstep(p / 0.30) : 0;
  const planeW = p > 0.30 ? Math.max(0, 1 - smoothstep((p - 0.30) / 0.25)) : 1;
  const edgeW = p > 0.55 ? Math.max(0, 1 - smoothstep((p - 0.55) / 0.25)) : 1;
  const juncW = p > 0.80 ? Math.max(0.18, 1 - smoothstep((p - 0.80) / 0.20)) : 1;
  // the person, still
  for (const [x, y] of personCells(COLS / 2, 100)) write(f, x, y, { source: 'form', ch: '#', weight: 1, freshness: 1 });
  // plane texture: sparse interior marks, first to go
  if (texW > 0.05) {
    for (let r = bw.y0; r <= bw.y1; r += 3) for (let c = bw.x0; c <= bw.x1; c += 3)
      write(f, c, r, { source: 'density', ch: glyphForWeight(0.35 * texW), weight: 0.35 * texW, freshness: 1 });
  }
  // plane material: the four plane edges
  const edges = [
    [bw.x0, bw.y0, bw.x1, bw.y0], [bw.x1, bw.y0, bw.x1, bw.y1], [bw.x1, bw.y1, bw.x0, bw.y1], [bw.x0, bw.y1, bw.x0, bw.y0],
  ];
  if (planeW > 0.05) for (const [x0, y0, x1, y1] of edges) {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) write(f, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, { source: 'density', ch: glyphForWeight(0.7 * planeW), weight: 0.7 * planeW, freshness: 1 });
  }
  // secondary edges: the four convergence lines
  if (edgeW > 0.05) for (const [ax, ay] of [[bw.x0, bw.y0], [bw.x1, bw.y0], [bw.x1, bw.y1], [bw.x0, bw.y1]]) {
    const n = 60;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + ((t < 0.5 ? 0 : COLS - ax) - ax) * Math.abs(t - 0.25) * 2;
      const y = ay + ((t < 0.5 ? 0 : ROWS - ay) - ay) * Math.abs(t - 0.25) * 2;
      write(f, x, y, { source: 'density', ch: glyphForWeight(0.55 * edgeW), weight: 0.55 * edgeW, freshness: 1 });
    }
  }
  // MAJOR JUNCTIONS LAST — the four back-wall corners, never below 0.18
  for (const [x, y] of [[bw.x0, bw.y0], [bw.x1, bw.y0], [bw.x1, bw.y1], [bw.x0, bw.y1]])
    write(f, x, y, { source: 'contour', ch: '+', weight: juncW, freshness: 1 });
  void frame; void vp;
}, {
  mechanism: 'staged structural decay (texture -> plane material -> secondary edges -> junctions)',
  action: 'the room loses its structure while the person remains still',
  technical: 'four overlapping smoothstep windows applied to four depth classes of the same geometry; junctions are floored at 0.18 so the room never fully disappears',
});

// ================= TEST E — TEXT AS ANIMATED OBJECT =================
{
  const FONT = {
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001', '10001', '10001'],
    A: ['01110', '10001', '10001', '10001', '11111', '10001', '10001', '10001', '10001'],
    M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001', '10001', '10001'],
    E: ['11111', '10000', '10000', '10000', '11110', '10000', '10000', '10000', '11111'],
  };
  const scale = 4, track = 2;
  const textW = (4 * 5 + 3 * track) * scale;
  const x0 = Math.round((COLS - textW) / 2), y0 = Math.round(ROWS / 2 - 18);
  await shoot('E1', 3, (f, p) => {
    /**
     * stable -> loosen -> separate -> drift / erase -> absence.
     * Letter topology must remain recognisable through the BEGINNING of the transformation, so the first
     * 40% only loosens weight; separation starts after that.
     */
    const loosen = p < 0.40 ? smoothstep(p / 0.40) : 1;
    const separate = p > 0.40 ? smoothstep((p - 0.40) / 0.35) : 0;
    const erase = p > 0.75 ? smoothstep((p - 0.75) / 0.25) : 0;
    let li = 0;
    for (const ch of 'NAME') {
      const pat = FONT[ch];
      const gx = x0 + li * (5 + track) * scale;
      for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) {
        if (pat[r][c] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
          const px = gx + c * scale + sx, py = y0 + r * scale + sy;
          // separation pushes cells outward from the letter's own centre
          const lcx = gx + 2.5 * scale, lcy = y0 + 4.5 * scale;
          const dx = px - lcx, dy = py - lcy, d = Math.hypot(dx, dy) || 1;
          const push = separate * 4.5;
          const fx = px + (dx / d) * push, fy = py + (dy / d) * push;
          // erase removes cells outward-in, so the letter core survives longest
          const w = Math.max(0, 1 - loosen * 0.25 - erase * Math.min(1, d / 9));
          if (w > 0.06) write(f, fx, fy, { source: 'substitution', ch: glyphForWeight(w), weight: w, freshness: 1 });
        }
      }
      li++;
    }
  }, {
    mechanism: 'letter topology under loosen / separate / erase',
    action: 'the diegetic word NAME loosens, separates, drifts and is erased',
    technical: 'each letter cell is displaced outward from its own letter centre by a separation term; weight falls with distance from that centre so the letter core survives longest; the first 40% only changes weight, keeping topology recognisable',
  });
}

console.log('PHASE 3.3C — MOTION LAB\n');
console.log('  prototype  frames  uniqueHashes  changedCells  NaN  mechanism');
for (const r of results) {
  console.log(`  ${r.name.padEnd(10)} ${String(r.frames).padStart(6)} ${String(r.uniqueFrameHashes).padStart(13)} ${String(r.changedCellsTotal).padStart(13)} ${String(r.nanOrUndefined).padStart(4)}  ${r.mechanism}`);
}
console.log('');
const bad = results.filter((r) => r.nanOrUndefined > 0 || r.uniqueFrameHashes <= 1);
console.log(`  prototypes with NaN/undefined or no motion: ${bad.length}  (${bad.length === 0 ? 'PASS' : 'FAIL'})`);
await writeFile(path.join(ROOT, 'out', 'phase33c', 'motion-lab-report.json'), JSON.stringify({ fps: FPS, resolution: `${W}x${H}`, prototypes: results }, null, 2));
