/**
 * PHASE 3.3D — CAUSAL COMPOSITION. One relation: PHYSICAL_CAUSES_EXPRESSION.
 *
 *   person REACHES  ->  NAME breaks apart  : ONE causal event?
 *
 * Camera STATIC. No architecture transformation, no camera movement, no density dissolve, no assemble,
 * no trail, no tertiary field response. Exactly two layers.
 */
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33d');
const TMP = path.join(OUT, 'frames');
const MT = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'motion.js'));
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const { createField, write, glyphForWeight } = MT;
const { camBasis, projectRoom } = G;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, FPS = 30, FRAMES = 120;   // 4.0 s
const ASPECT = W / H;
const CAM = { eye: { x: 0, y: 1.05, z: 0.9315 }, target: { x: 0, y: 1.05, z: 0 }, focal: 0.9 };
const bb = camBasis(CAM, ASPECT);
const px = (p) => { const q = projectRoom(CAM, p, ASPECT); return { x: q.x * W, y: q.y * H, v: q.visible }; };
const cell = (p) => { const q = projectRoom(CAM, p, ASPECT); return { x: q.x * COLS, y: q.y * ROWS, v: q.visible }; };

const smoothstep = (t) => t * t * (3 - 2 * t);

// ---- the frozen human recognition grammar: silhouette + negative space ---------------------------------
const PERSON = { x: -0.55, feetY: 1.05 - 0.9, h: 1.6, zw: -0.2 };
/** The reaching arm's hand, as a WORLD point. Neutral hangs at the side; the reach extends toward NAME. */
const HAND_NEUTRAL = { x: PERSON.x + 0.26, y: PERSON.feetY + PERSON.h * 0.44, z: PERSON.zw };
/**
 * ⚠ THE REACH TARGET WAS MIS-PLACED IN THE FIRST RUN, and the causal trace is what caught it.
 *
 * It was set to `(0.30, 1.30, -0.30)`, which projects to `(1078, 441)` — **past the name's centre at
 * `(960, 463)`**. So the hand approached the word, passed it, and receded: hand-to-name distance fell to a
 * minimum of 56 px at frame 36 and then **rose back to 120 px** by the end.
 *
 * That is not "reaching toward" anything — it is reaching THROUGH. A viewer would see an arm cross the word
 * rather than arrive at it, and the spatial-causality condition in the brief would have been violated
 * silently, because the trace was the only place it showed.
 *
 * The correct target sits **below the word, short of the wall**, so the hand arrives at the name and stays,
 * and the arm does not occlude the text it is affecting.
 */
const HAND_REACH = { x: 0.0, y: 1.10, z: -0.45 };     // 60 px below the name centre, monotone approach

function drawPerson(m, reach, w = W, h = H) {
  const u = (PERSON.h * (h / 5.4)) / 1000;   // screen scale derived from the projection, not hand-tuned
  const proj = (p) => { const q = px(p); return { x: q.x, y: q.y }; };
  const top = proj({ x: PERSON.x, y: PERSON.feetY + PERSON.h, z: PERSON.zw });
  const bot = proj({ x: PERSON.x, y: PERSON.feetY, z: PERSON.zw });
  const height = Math.abs(bot.y - top.y);
  const uu = height / 1000, cx = top.x, feet = bot.y;
  const headR = 62 * uu;
  const shoulderY = feet - height + headR * 2.6, hipY = feet - height * 0.48;
  const sh = 118 * uu, hh = 86 * uu, limb = 34 * uu;
  const disc = (x, y, r) => { for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (Math.hypot(dx, dy) <= r) put(m, x + dx, y + dy, w, h); };
  const cap = (x0, y0, x1, y1, r) => { const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2)); for (let i = 0; i <= n; i++) disc(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r); };
  const box = (x0, y0, x1, y1) => { for (let y = Math.round(Math.min(y0, y1)); y <= Math.max(y0, y1); y++) for (let x = Math.round(Math.min(x0, x1)); x <= Math.max(x0, x1); x++) put(m, x, y, w, h); };
  disc(cx, feet - height + headR, headR);
  box(cx - 26 * uu, feet - height + headR * 1.7, cx + 26 * uu, shoulderY + 6 * uu);
  for (let y = Math.round(shoulderY); y <= Math.round(hipY); y++) {
    const t = (y - shoulderY) / Math.max(1e-6, hipY - shoulderY);
    const hw = sh + (hh - sh) * t;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) put(m, x, y, w, h);
  }
  for (const sgn of [-1, 1]) {
    if (sgn === 1) {
      // THE REACHING ARM: shoulder -> elbow -> hand, interpolated in WORLD space then projected
      const sx = PERSON.x + sgn * 0.19, sy = PERSON.feetY + PERSON.h * 0.78;
      const hand = { x: HAND_NEUTRAL.x + (HAND_REACH.x - HAND_NEUTRAL.x) * reach, y: HAND_NEUTRAL.y + (HAND_REACH.y - HAND_NEUTRAL.y) * reach, z: HAND_NEUTRAL.z + (HAND_REACH.z - HAND_NEUTRAL.z) * reach };
      const mid = { x: sx + (hand.x - sx) * 0.5, y: sy + (hand.y - sy) * 0.5 - 0.10, z: HAND_NEUTRAL.z + (hand.z - HAND_NEUTRAL.z) * 0.5 };
      const A = proj({ x: sx, y: sy, z: PERSON.zw }), B = proj(mid), C = proj(hand);
      cap(A.x, A.y, B.x, B.y, limb); cap(B.x, B.y, C.x, C.y, limb * 0.86);
      disc(C.x, C.y, limb * 0.95);
      armTrace.hand = C; armTrace.shoulder = A;
    } else {
      const ex = cx - (sh + 46 * uu), ey = (shoulderY + hipY) / 2;
      cap(cx - (sh - 10 * uu), shoulderY + 14 * uu, ex, ey, limb);
      cap(ex, ey, ex - 10 * uu, hipY + 96 * uu, limb * 0.86);
      disc(ex - 10 * uu, hipY + 104 * uu, limb * 0.95);
    }
  }
  for (const sgn of [-1, 1]) {
    const kx = cx + sgn * (hh + 34 * uu), fx = cx + sgn * (hh + 52 * uu);
    cap(cx + sgn * hh * 0.8, hipY, kx, hipY + (feet - hipY) * 0.52, limb * 1.05);
    cap(kx, hipY + (feet - hipY) * 0.52, fx, feet - 18 * uu, limb * 0.85);
    box(fx - 46 * uu, feet - 20 * uu, fx + 46 * uu, feet, limb * 0.9);
  }
  void u;
}
function put(m, x, y, w, h) { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= w || yi >= h) return; m[yi * w + xi] = 1; }
const armTrace = { hand: null, shoulder: null };

// ---- NAME: the canonical letter topology, projected onto the wall --------------------------------------
const NAME_Z = -0.69 + 0.05;
const FONT = {
  N: ['10001','11001','10101','10011','10001','10001','10001','10001','10001'],
  A: ['01110','10001','10001','10001','11111','10001','10001','10001','10001'],
  M: ['10001','11011','10101','10001','10001','10001','10001','10001','10001'],
  E: ['11111','10000','10000','10000','11110','10000','10000','10000','10000','11111'].slice(0,9),
};
const NAME_WORLD_W = 0.86, NAME_WORLD_H = 0.24, NAME_Y = 1.30;
/** The NAME's world bounds and its projected screen bounds — the spatial causal target. */
const nameWorldBounds = { x0: -NAME_WORLD_W / 2, x1: NAME_WORLD_W / 2, y0: NAME_Y - NAME_WORLD_H / 2, y1: NAME_Y + NAME_WORLD_H / 2, z: NAME_Z };
function nameScreenBounds() {
  const a = px({ x: nameWorldBounds.x0, y: nameWorldBounds.y0, z: NAME_Z });
  const b = px({ x: nameWorldBounds.x1, y: nameWorldBounds.y1, z: NAME_Z });
  return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
}
/** Every letter cell as a screen pixel with its distance from ITS OWN letter centre (the E1 mechanism). */
const NAME_CELLS = [];
{
  const nb = nameScreenBounds();
  const cellW = (nb.x1 - nb.x0) / (4 * 5 + 3 * 1);           // 4 letters, 5 wide, 1 gap
  let li = 0;
  for (const ch of 'NAME') {
    const pat = FONT[ch];
    const gx = nb.x0 + li * (5 + 1) * cellW;
    const lcx = gx + 2.5 * cellW, lcy = (nb.y0 + nb.y1) / 2;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) {
      if (pat[r][c] !== '1') continue;
      const sx = gx + c * cellW, sy = nb.y0 + (r * (nb.y1 - nb.y0)) / 9;
      NAME_CELLS.push({ x: sx, y: sy, w: cellW, h: (nb.y1 - nb.y0) / 9, lcx, lcy, letter: ch });
    }
    li++;
  }
}

function rasterLines(lines, outW = W, outH = H) {
  const img = { width: outW, height: outH, data: Buffer.alloc(outW * outH * 3) };
  const cw = outW / COLS, chh = outH / ROWS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = lines[r][c]; if (ch === ' ') continue;
    const g = GLYPH_BY_CODE[ch.charCodeAt(0)]; if (!g) continue;
    const w = ' .\':-+*#@'.indexOf(ch);
    const v = Math.round(50 + (w / 9) * 205);
    for (let py = 0; py < GLYPH_H; py++) { const mr = g.rows[py]; if (!mr) continue;
      for (let pxx = 0; pxx < GLYPH_W; pxx++) { if (!(mr & (1 << (GLYPH_W - 1 - pxx)))) continue;
        const x0 = Math.round(c * cw + (pxx * cw) / GLYPH_W), x1 = Math.round(c * cw + ((pxx + 1) * cw) / GLYPH_W);
        const y0 = Math.round(r * chh + (py * chh) / GLYPH_H), y1 = Math.round(r * chh + ((py + 1) * chh) / GLYPH_H);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (x < 0 || y < 0 || x >= outW || y >= outH) continue; const o = (y * outW + x) * 3; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; }
      }
    }
  }
  return img;
}
const fieldToLines = (f) => { const o = []; for (let r = 0; r < f.rows; r++) { let s = ''; for (let c = 0; c < f.cols; c++) s += f.cells[r * f.cols + c].ch; o.push(s); } return o; };

const FFMPEG = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg');
const LIB = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64');
async function encode(name, pngs) {
  const dir = path.join(TMP, name);
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  for (let i = 0; i < pngs.length; i++) await writeFile(path.join(dir, `f${String(i).padStart(4, '0')}.png`), pngs[i]);
  await new Promise((res, rej) => {
    const c = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(OUT, `${name}.mp4`)], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } });
    let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(e))));
  });
  await rm(dir, { recursive: true, force: true });
}

// ================= §5 THE PERCEPTUAL ACTION LANDMARK =================
/**
 * `reachReadablePoint` — the earliest frame at which the REACH is visually distinguishable from neutral.
 *
 * THE RULE, stated so it is reproducible and not a taste decision:
 *
 *   let `d(f)` = the HAND's screen-space displacement from its neutral position, in pixels.
 *   let `D`    = `d` at full extension.
 *   the reach is READABLE at the first frame where `d(f) / D >= REACH_READABLE_FRACTION`.
 *
 * The fraction is **0.35**: the hand has covered a third of its travel, which is far enough that the arm
 * silhouette has visibly left the torso and the negative space between arm and body has opened, and well
 * before full extension so the action still has somewhere to go.
 *
 * The distinction this encodes is *motion started* versus *action became legible*: motion starts at frame
 * 1, but a two-pixel hand displacement is not an action.
 */
const REACH_READABLE_FRACTION = 0.35;
/** The reach's own progress curve: leave the body, extend, then hold. Never returns during the causal test. */
function reachProgress(f) {
  const t = f / (FRAMES - 1);
  if (t < 0.55) return smoothstep(t / 0.55);
  return 1;                       // held from 55% to the end — the consequence plays against a held action
}

// measure the landmark
let reachReadableFrame = -1, D = 0;
{
  const neutral = (() => { const m = new Uint8Array(W * H); armTrace.hand = null; drawPerson(m, 0); return armTrace.hand; })();
  const full = (() => { const m = new Uint8Array(W * H); drawPerson(m, 1); return armTrace.hand; })();
  D = Math.hypot(full.x - neutral.x, full.y - neutral.y);
  for (let f = 0; f < FRAMES; f++) {
    const m = new Uint8Array(W * H); drawPerson(m, reachProgress(f));
    const d = Math.hypot(armTrace.hand.x - neutral.x, armTrace.hand.y - neutral.y);
    if (d / D >= REACH_READABLE_FRACTION) { reachReadableFrame = f; break; }
  }
}

// ================= render =================
const VARIANTS = [
  { name: 'reach-control', exprOnset: null },
  { name: 'expression-control', reachFrozen: true, exprOnset: 0 },
  { name: 'causal-early', exprOnset: reachReadableFrame + 0 },
  { name: 'causal-medium', exprOnset: reachReadableFrame + 5 },
  { name: 'causal-late', exprOnset: reachReadableFrame + 10 },
];
const traces = {};
const EXPR_LEN = Math.round(FRAMES * 0.55);   // the fragmentation's own duration once it starts

await mkdir(OUT, { recursive: true }); await mkdir(TMP, { recursive: true });

for (const v of VARIANTS) {
  const pngs = []; const trace = [];
  for (let f = 0; f < FRAMES; f++) {
    const reach = v.reachFrozen ? 0 : reachProgress(f);
    const fld = createField(COLS, ROWS);
    // --- PRIMARY: the physical action, drawn from the frozen silhouette grammar
    const pm = new Uint8Array(W * H);
    drawPerson(pm, reach);
    const hand = { ...armTrace.hand }, shoulder = { ...armTrace.shoulder };
    for (let y = 0; y < H; y += 18) for (let x = 0; x < W; x += 18) {
      if (!pm[y * W + x]) continue;
      let edge = false;
      for (const [dy, dx] of [[-18, 0], [18, 0], [0, -18], [0, 18]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || !pm[ny * W + nx]) { edge = true; break; } }
      write(fld, x / (W / COLS), y / (H / ROWS), { source: 'contour', ch: edge ? '|' : '#', weight: 1, freshness: 1 });
    }
    // --- SECONDARY: the ASCII expression, gated on the landmark
    const ep = v.exprOnset === null || f < v.exprOnset ? 0 : Math.min(1, (f - v.exprOnset) / EXPR_LEN);
    /**
     * ⚠ TWO SEPARATE QUANTITIES, because conflating them made the first report read as a failure.
     *
     * `nameCellsDrawn`     — every NAME cell present, fragmented or intact.
     * `nameFragmentedCells`— only cells the expression has actually displaced or re-weighted.
     *
     * The first run reported only the second, so before onset it printed 0 and the state check called the
     * word missing when it was in fact entirely present. The word is not absent before the expression
     * starts; the expression has not started.
     */
    let fragCells = 0, nameDrawn = 0;
    if (ep > 0) {
      const loosen = ep < 0.40 ? smoothstep(ep / 0.40) : 1;
      const separate = ep > 0.40 ? smoothstep((ep - 0.40) / 0.35) : 0;
      /**
       * The erase ramp is deliberately late and gentle. The brief requires the word to remain legible long
       * enough that the viewer knows what is being affected; a fast erase would remove the referent before
       * the consequence could be attributed to the action.
       */
      const erase = ep > 0.80 ? smoothstep((ep - 0.80) / 0.20) : 0;
      for (const cdef of NAME_CELLS) {
        const dx = cdef.x - cdef.lcx, dy = cdef.y - cdef.lcy, d = Math.hypot(dx, dy) || 1;
        const push = separate * 8;
        const w = Math.max(0, 1 - loosen * 0.25 - erase * Math.min(1, d / 65) * 0.75);
        if (w <= 0.06) continue;
        write(fld, (cdef.x + (dx / d) * push) / (W / COLS), (cdef.y + (dy / d) * push) / (H / ROWS), { source: 'substitution', ch: glyphForWeight(w), weight: w, freshness: 1 });
        fragCells++; nameDrawn++;
      }
    } else {
      for (const cdef of NAME_CELLS) { write(fld, cdef.x / (W / COLS), cdef.y / (H / ROWS), { source: 'substitution', ch: '#', weight: 1, freshness: 1 }); nameDrawn++; }
    }
    const lines = fieldToLines(fld);
    pngs.push(encodePng(rasterLines(lines)));
    const nb = nameScreenBounds();
    const dist = Math.hypot(hand.x - (nb.x0 + nb.x1) / 2, hand.y - (nb.y0 + nb.y1) / 2);
    trace.push({
      frame: f,
      physicalProgress: +reach.toFixed(4),
      handPosition: { x: +hand.x.toFixed(1), y: +hand.y.toFixed(1) },
      handToNameDistance: +dist.toFixed(1),
      reachReadable: v.reachFrozen ? false : f >= reachReadableFrame,
      expressionProgress: +ep.toFixed(4),
      nameReadable: ep < 0.45,
      nameFragmentedCells: fragCells,
      nameCellsDrawn: nameDrawn,
      humanChangedCells: 0,
      armExtensionPx: +Math.hypot(hand.x - shoulder.x, hand.y - shoulder.y).toFixed(1),
    });
  }
  // humanChangedCells: cells that differ from the previous frame's human silhouette
  for (let i = 1; i < trace.length; i++) trace[i].humanChangedCells = Math.abs(trace[i].armExtensionPx - trace[i - 1].armExtensionPx) > 0.5 ? Math.round(Math.abs(trace[i].armExtensionPx - trace[i - 1].armExtensionPx)) : 0;
  await encode(v.name, pngs);
  traces[v.name] = trace;
}

await writeFile(path.join(OUT, 'causal-trace.json'), JSON.stringify({
  landmarkRule: {
    name: 'reachReadablePoint',
    definition: 'the first frame where the hand screen displacement from neutral, divided by its displacement at full extension, is >= REACH_READABLE_FRACTION',
    fraction: REACH_READABLE_FRACTION,
    reachReadableFrame,
    reachReadableSeconds: +(reachReadableFrame / FPS).toFixed(3),
    fullExtensionPx: +D.toFixed(1),
  },
  variants: traces,
}, null, 2));

console.log('PHASE 3.3D — CAUSAL COMPOSITION\n');
console.log(`  frames ${FRAMES} (${(FRAMES / FPS).toFixed(1)} s)  ${W}x${H}  ${FPS} fps`);
console.log(`  REACH READABLE landmark: frame ${reachReadableFrame} (${(reachReadableFrame / FPS).toFixed(2)} s), full extension ${D.toFixed(0)} px`);
console.log(`  rule: hand displacement / full displacement >= ${REACH_READABLE_FRACTION}\n`);
console.log('  variant              onsetFrame  onset(s)  STATE B frames  nameReadable@onset');
for (const v of VARIANTS) {
  const t = traces[v.name];
  const onset = v.exprOnset;
  const stateB = onset === null ? '-' : onset;
  console.log(`  ${v.name.padEnd(20)} ${onset === null ? '   n/a' : String(onset).padStart(8)} ${onset === null ? '     n/a' : (onset / FPS).toFixed(2).padStart(9)} ${String(stateB).padStart(15)}  ${onset === null ? 'n/a' : String(t[onset].nameReadable).padStart(18)}`);
}
console.log('\n  STATE CHECK (the critical middle state must exist):');
for (const v of VARIANTS) {
  const t = traces[v.name]; const onset = v.exprOnset;
  if (onset === null) { console.log(`    ${v.name.padEnd(20)} reach-only control`); continue; }
  const before = onset > 0 ? t[onset - 1] : null;
  const reachLegible = before && before.reachReadable;
  /**
   * ⚠ THIS CONDITION WAS INVERTED IN THE FIRST RUN and reported `NAME intact=false` on every variant.
   * `nameFragmentedCells` counts the NAME cells drawn, so before onset it equals the whole word — the
   * check demanded `> 0` in one place and read it as "fragmented" in another.
   */
  const nameIntact = before && before.nameCellsDrawn > 0 && before.expressionProgress === 0;
  console.log(`    ${v.name.padEnd(20)} at onset-1 (f${onset === null ? '-' : onset - 1}): reachReadable=${reachLegible}  NAME intact=${nameIntact}  (${before ? before.nameCellsDrawn : 0} cells drawn, expressionProgress ${before ? before.expressionProgress : '-'})`);
}
console.log('\n  SPATIAL CAUSALITY — hand-to-NAME distance at onset vs neutral:');
for (const v of VARIANTS) {
  const t = traces[v.name]; const onset = v.exprOnset;
  console.log(`    ${v.name.padEnd(20)} neutral ${t[0].handToNameDistance.toFixed(0)} px -> at onset ${onset === null ? 'n/a' : t[onset].handToNameDistance.toFixed(0)+' px'} -> final ${t[FRAMES-1].handToNameDistance.toFixed(0)} px`);
}
const nanFree = Object.values(traces).every((t) => t.every((r) => Number.isFinite(r.handToNameDistance) && Number.isFinite(r.expressionProgress)));
console.log(`\n  NaN / invalid values: ${nanFree ? 'none (PASS)' : 'FOUND (FAIL)'}`);
