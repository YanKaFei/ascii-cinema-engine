/**
 * PHASE 3.3G — renders the Director's plan. Stage 1: ROUGH CUT. Stage 2: FINAL SILENT.
 *
 *   node scripts/phase33g-render.mjs rough|final
 */
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33g');
const STAGE = process.argv[2] === 'final' ? 'final' : 'rough';
const TMP = path.join(OUT, `frames-${STAGE}`);
const MT = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'motion.js'));
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const { createField, write, glyphForWeight, CAUSAL_HOLD_RATIO } = MT;
const { camBasis, projectRoom, makeRoomBox, roomPlanes, clipPlaneToViewport } = G;
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, FPS = 30, ASPECT = W / H;
const EYE_Y = 1.05, FOCAL = 0.9, HALF = { x: 1.5, y: 0.9, z: 0.69 };
const CAM0 = 0.9315;
/** the solved supporting push: dist1 = dist0/1.10 -> a 10% projected scale increase */
const CAM_PUSH = 0.7841;
const smoothstep = (t) => t * t * (3 - 2 * t);

const box = makeRoomBox({ centre: { x: 0, y: EYE_Y, z: CAM0 - 0.35 * HALF.z - HALF.z }, half: HALF });
const planesWorld = roomPlanes(box);
const SEM = { floor: 0.95, backWall: 0.50, ceiling: 0.34, leftWall: 0.16, rightWall: 0.16 };
const DIRV = { floor: 'vertical', leftWall: 'diagFall', rightWall: 'diagRise', backWall: 'horizontal', ceiling: 'horizontal' };
/** the 3.2B structural-decay ordering: texture -> plane material -> secondary edges -> junctions last */
const DECAY_STAGE = { texture: [0.00, 0.30], planeMaterial: [0.30, 0.55], secondaryEdges: [0.55, 0.80], junctions: [0.80, 1.00] };
const stageW = (p, [a, b]) => (p <= a ? 1 : p >= b ? 0 : 1 - smoothstep((p - a) / (b - a)));

const PERSON = { x: -0.55, feetY: EYE_Y - HALF.y, h: 1.6, zw: -0.2 };
const HAND_NEUTRAL = { x: PERSON.x + 0.26, y: PERSON.feetY + PERSON.h * 0.44, z: PERSON.zw };
const HAND_REACH = { x: 0.0, y: 1.10, z: -0.45 };
const NAME_Z = -0.64, NAME_Y = 1.30, NAME_W = 0.86, NAME_H = 0.24;
const REACH_FULL_AT = 0.55, REACH_READABLE_PROGRESS = 0.3262;
const EFFECT_ONSET = REACH_READABLE_PROGRESS + (1 - REACH_READABLE_PROGRESS) * CAUSAL_HOLD_RATIO;

const camAt = (z) => ({ eye: { x: 0, y: EYE_Y, z }, target: { x: 0, y: EYE_Y, z: 0 }, focal: FOCAL });
const projPx = (cam, p) => { const q = projectRoom(cam, p, ASPECT); return { x: q.x * W, y: q.y * H, v: q.visible }; };

function personPixels(cam, reach) {
  const m = new Uint8Array(W * H);
  const put = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) return; m[yi * W + xi] = 1; };
  const top = projPx(cam, { x: PERSON.x, y: PERSON.feetY + PERSON.h, z: PERSON.zw });
  const bot = projPx(cam, { x: PERSON.x, y: PERSON.feetY, z: PERSON.zw });
  const height = Math.abs(bot.y - top.y), uu = height / 1000, cx = top.x, feet = bot.y;
  const headR = 62 * uu, shoulderY = feet - height + headR * 2.6, hipY = feet - height * 0.48;
  const sh = 118 * uu, hh = 86 * uu, limb = 34 * uu;
  const disc = (x, y, r) => { for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (Math.hypot(dx, dy) <= r) put(x + dx, y + dy); };
  const cap = (x0, y0, x1, y1, r) => { const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2)); for (let i = 0; i <= n; i++) disc(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r); };
  const box2 = (x0, y0, x1, y1) => { for (let y = Math.round(Math.min(y0, y1)); y <= Math.max(y0, y1); y++) for (let x = Math.round(Math.min(x0, x1)); x <= Math.max(x0, x1); x++) put(x, y); };
  disc(cx, feet - height + headR, headR);
  box2(cx - 26 * uu, feet - height + headR * 1.7, cx + 26 * uu, shoulderY + 6 * uu);
  for (let y = Math.round(shoulderY); y <= Math.round(hipY); y++) { const t = (y - shoulderY) / Math.max(1e-6, hipY - shoulderY), hw = sh + (hh - sh) * t; for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) put(x, y); }
  const hand = { x: HAND_NEUTRAL.x + (HAND_REACH.x - HAND_NEUTRAL.x) * reach, y: HAND_NEUTRAL.y + (HAND_REACH.y - HAND_NEUTRAL.y) * reach, z: HAND_NEUTRAL.z + (HAND_REACH.z - HAND_NEUTRAL.z) * reach };
  for (const sgn of [-1, 1]) {
    if (sgn === 1) {
      const sx = PERSON.x + 0.19, sy = PERSON.feetY + PERSON.h * 0.78;
      const mid = { x: sx + (hand.x - sx) * 0.5, y: sy + (hand.y - sy) * 0.5 - 0.10, z: HAND_NEUTRAL.z + (hand.z - HAND_NEUTRAL.z) * 0.5 };
      const A = projPx(cam, { x: sx, y: sy, z: PERSON.zw }), B = projPx(cam, mid), C = projPx(cam, hand);
      cap(A.x, A.y, B.x, B.y, limb); cap(B.x, B.y, C.x, C.y, limb * 0.86); disc(C.x, C.y, limb * 0.95);
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
    box2(fx - 46 * uu, feet - 20 * uu, fx + 46 * uu, feet, limb * 0.9);
  }
  return m;
}

const FONT = { N: ['10001','11001','10101','10011','10001','10001','10001','10001','10001'], A: ['01110','10001','10001','10001','11111','10001','10001','10001','10001'], M: ['10001','11011','10101','10001','10001','10001','10001','10001','10001'], E: ['11111','10000','10000','10000','11110','10000','10000','10000','10000','11111'].slice(0,9) };
const NAME_CELLS = [];
{ const cellW = NAME_W / (4 * 5 + 3); let li = 0;
  for (const ch of 'NAME') { const pat = FONT[ch]; const gx = -NAME_W / 2 + li * (5 + 1) * cellW, lcx = gx + 2.5 * cellW;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) { if (pat[r][c] !== '1') continue;
      NAME_CELLS.push({ x: gx + c * cellW, y: NAME_Y - NAME_H / 2 + (r * NAME_H) / 9, lcx, lcy: NAME_Y }); } li++; } }

function drawRoom(fld, cam, decay) {
  const bb = camBasis(cam, ASPECT);
  const planes = Object.keys(SEM).map((id) => ({ id, quad: clipPlaneToViewport(bb, id, planesWorld[id]).screenPolygon.map((p) => [p.x * COLS, p.y * ROWS]), dir: DIRV[id], value: SEM[id] }));
  const texW = stageW(decay, DECAY_STAGE.texture), matW = stageW(decay, DECAY_STAGE.planeMaterial), edgeW = stageW(decay, DECAY_STAGE.secondaryEdges), juncW = Math.max(0.18, stageW(decay, DECAY_STAGE.junctions));
  const RAMP = '.:+*#';
  for (const p of planes) {
    if (p.quad.length < 3) continue;
    if (texW > 0.05) {
      const g = RAMP[Math.max(0, Math.min(4, Math.round(p.value * 4)))];
      for (const [x, y] of p.quad) void x, void y;
      for (let r = 0; r < ROWS; r += 3) for (let c = 0; c < COLS; c += 3) {
        let inside = false; const px = c + 0.5, py = r + 0.5;
        for (let i = 0, j = p.quad.length - 1; i < p.quad.length; j = i++) { const xi = p.quad[i][0], yi = p.quad[i][1], xj = p.quad[j][0], yj = p.quad[j][1]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside; }
        if (inside) write(fld, c, r, { source: 'density', ch: g, weight: texW, freshness: 1 });
      }
    }
    if (matW > 0.05 || edgeW > 0.05) {
      for (let i = 0; i < p.quad.length; i++) {
        const a = p.quad[i], b = p.quad[(i + 1) % p.quad.length];
        const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
        for (let k = 0; k <= n; k++) {
          const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
          write(fld, x, y, { source: 'contour', ch: '+', weight: Math.max(matW, edgeW), freshness: 1 });
        }
      }
    }
  }
  /** MAJOR JUNCTIONS LAST — the back-wall corners never fully vanish */
  for (const corner of [box.backTL, box.backTR, box.backBR, box.backBL]) {
    const q = projPx(cam, { x: corner.x, y: corner.y, z: corner.z });
    if (q.v) write(fld, q.x / (W / COLS), q.y / (H / ROWS), { source: 'contour', ch: '+', weight: juncW, freshness: 1 });
  }
}

function rasterLines(lines) {
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 3) };
  const cw = W / COLS, chh = H / ROWS;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = lines[r][c]; if (ch === ' ') continue;
    const g = GLYPH_BY_CODE[ch.charCodeAt(0)]; if (!g) continue;
    const v = Math.round(50 + (' .\':-+*#@'.indexOf(ch) / 9) * 205);
    for (let py = 0; py < GLYPH_H; py++) { const mr = g.rows[py]; if (!mr) continue;
      for (let px = 0; px < GLYPH_W; px++) { if (!(mr & (1 << (GLYPH_W - 1 - px)))) continue;
        const x0 = Math.round(c * cw + (px * cw) / GLYPH_W), x1 = Math.round(c * cw + ((px + 1) * cw) / GLYPH_W);
        const y0 = Math.round(r * chh + (py * chh) / GLYPH_H), y1 = Math.round(r * chh + ((py + 1) * chh) / GLYPH_H);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const o = (y * W + x) * 3; img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; }
      } } }
  return img;
}
const fieldToLines = (f) => { const o = []; for (let r = 0; r < f.rows; r++) { let s = ''; for (let c = 0; c < f.cols; c++) s += f.cells[r * f.cols + c].ch; o.push(s); } return o; };

const FFMPEG = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg');
const LIB = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64');
async function encode(name, pngs) {
  const dir = path.join(TMP, name);
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  for (let i = 0; i < pngs.length; i++) await writeFile(path.join(dir, `f${String(i).padStart(5, '0')}.png`), pngs[i]);
  await new Promise((res, rej) => {
    const c = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(OUT, `${name}.mp4`)], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } });
    let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(e))));
  });
  await rm(dir, { recursive: true, force: true });
}

/**
 * SHOT TABLE. Each shot supplies its OWN layer progressions as functions of its own local time — this is
 * where the plan becomes pixels. CHARACTER STATE is what makes continuity real rather than asserted:
 * the arm's pose and the name's decay are carried ACROSS cuts instead of restarting.
 */
const N = (s) => Math.round(s * FPS);
const SHOTS = [
  { id: 'S1-establish', frames: N(3.2), reach: () => 0, frag: () => 0, decay: () => 0, cam: () => CAM0 },
  { id: 'S2-reach-breaks-name', frames: N(4.33),
    reach: (u) => (u < REACH_FULL_AT ? smoothstep(u / REACH_FULL_AT) : 1),
    frag: (u) => { const r = u < REACH_FULL_AT ? smoothstep(u / REACH_FULL_AT) : 1; return r < EFFECT_ONSET ? 0 : Math.min(0.72, ((r - EFFECT_ONSET) / (1 - EFFECT_ONSET)) * 0.95); },
    decay: () => 0,
    cam: (u) => { const t = u <= REACH_READABLE_PROGRESS ? 0 : (u - REACH_READABLE_PROGRESS) / (1 - REACH_READABLE_PROGRESS); return CAM0 + (CAM_PUSH - CAM0) * smoothstep(t); } },
  /**
   * ⚠ THE FIRST ROUGH CUT RAN THE NAME'S FRAGMENTATION BACKWARDS AT THIS CUT.
   *
   * S2 ended at frag 1.00 and S3 began at 0.60 — the name **un-broke** across a hard cut, which the brief
   * forbids outright: *"NAME must not break in one shot then appear intact in the next."* The cause was
   * treating each shot's layer progress as independent and local.
   *
   * The fix is that these layers are **cumulative properties of the world**, not per-shot animations: the
   * fragmentation CONTINUES to completion here, and the shot's own contribution is that it holds and
   * finishes an event that is already almost over.
   */
  { id: 'S3-name-lost', frames: N(2.2), reach: () => 1, frag: (u) => 0.72 + 0.28 * smoothstep(u), decay: () => 0, cam: () => CAM_PUSH },
  { id: 'S4-room-withdraws', frames: N(2.7), reach: (u) => 1 - 0.45 * smoothstep(u), frag: () => 1,
    decay: (u) => 0.88 * smoothstep(u),
    cam: (u) => CAM_PUSH - (CAM_PUSH - CAM0) * 0.35 * smoothstep(Math.max(0, (u - 0.25) / 0.75)) },
  /**
   * ⚠ AND THE ROOM'S DECAY ALSO RAN BACKWARDS: S4 ended at 1.00 and S5 began at 0.82.
   *
   * Same cause, same fix. The structural decay is one continuous withdrawal across two shots; S4 takes it
   * most of the way and S5 completes it, so the ending is **the same event arriving** rather than a new
   * effect applied to an already-empty room.
   */
  { id: 'S5-person-remains', frames: N(1.6), reach: () => 0.55, frag: () => 1, decay: (u) => 0.88 + 0.12 * smoothstep(u), cam: () => CAM0 + (CAM_PUSH - CAM0) * 0.65 },
];

await mkdir(OUT, { recursive: true }); await mkdir(TMP, { recursive: true });
const all = []; const shotReport = [];
for (const shot of SHOTS) {
  const startFrame = all.length;
  let prev = null;
  for (let f = 0; f < shot.frames; f++) {
    const u = shot.frames === 1 ? 0 : f / (shot.frames - 1);
    const reach = shot.reach(u), fp = shot.frag(u), decay = shot.decay(u), camZ = shot.cam(u);
    const cam = camAt(camZ);
    const fld = createField(COLS, ROWS);
    drawRoom(fld, cam, decay);
    const pm = personPixels(cam, reach);
    for (let y = 0; y < H; y += 18) for (let x = 0; x < W; x += 18) {
      if (!pm[y * W + x]) continue;
      let edge = false;
      for (const [dy, dx] of [[-18, 0], [18, 0], [0, -18], [0, 18]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || !pm[ny * W + nx]) { edge = true; break; } }
      write(fld, x / (W / COLS), y / (H / ROWS), { source: 'contour', ch: edge ? '|' : '#', weight: 1, freshness: 1 });
    }
    if (fp > 0) {
      const loosen = fp < 0.40 ? smoothstep(fp / 0.40) : 1, separate = fp > 0.40 ? smoothstep(Math.min(1, (fp - 0.40) / 0.35)) : 0, erase = fp > 0.80 ? smoothstep((fp - 0.80) / 0.20) : 0;
      for (const c of NAME_CELLS) {
        const p = projPx(cam, { x: c.x, y: c.y, z: NAME_Z }), lc = projPx(cam, { x: c.lcx, y: c.lcy, z: NAME_Z });
        if (!p.v) continue;
        const dx = p.x - lc.x, dy = p.y - lc.y, d = Math.hypot(dx, dy) || 1, push = separate * 8;
        /**
         * ⚠ `erase` NEVER FULLY ERASED, and the trace showed it: at `frag = 1.0` the name still had 19
         * cells drawn. The erase term subtracted at most `1 * 0.75 = 0.75` from a weight that had already
         * lost `0.25` to loosening, landing at 0.00 for cells near their own letter centre — but the
         * shifted positions used for drawing are not the positions the distance `d` is measured from, so
         * the cells that survived were the ones whose SURFACE position sits far from their letter centre.
         *
         * The ending requires the name to be GONE. A partial erase leaves the film's final state ambiguous:
         * the audience would see fragments of a word that the story says has been destroyed. The erase is
         * therefore **enforced to completion** rather than left asymptotic.
         */
        const eraseFactor = erase >= 0.98 ? 0 : erase;
        const w = Math.max(0, 1 - loosen * 0.25 - eraseFactor * Math.min(1, d / 65) * 0.75);
        if (w <= 0.06 || erase >= 0.98) continue;
        write(fld, (p.x + (dx / d) * push) / (W / COLS), (p.y + (dy / d) * push) / (H / ROWS), { source: 'substitution', ch: glyphForWeight(w), weight: w, freshness: 1 });
      }
    } else {
      for (const c of NAME_CELLS) { const p = projPx(cam, { x: c.x, y: c.y, z: NAME_Z }); if (p.v) write(fld, p.x / (W / COLS), p.y / (H / ROWS), { source: 'substitution', ch: '#', weight: 1, freshness: 1 }); }
    }
    const lines = fieldToLines(fld);
    const png = encodePng(rasterLines(lines));
    all.push({ shot: shot.id, u, png, lines });
    /**
     * ⚠ `nameCellsDrawn` WAS COUNTING THE WRONG THING, and the trace is how it was caught.
     *
     * It keyed on `source === 'substitution'` — but `drawRoom` tags **plane texture** as `substitution`
     * too. So the metric labelled "NAME cells drawn" was really "substitution cells of any kind", and it
     * reported 77 cells on the final frame where the name had in fact been **completely erased**.
     *
     * A metric whose name does not describe its measurement is worse than no metric: it made a correct
     * render look like a defect and sent the investigation after the wrong subsystem. The fix is to count
     * the name by **where it is**, not by what wrote it.
     */
    const nameCellKeys = new Set();
    for (const nc of NAME_CELLS) {
      const p = projPx(cam, { x: nc.x, y: nc.y, z: NAME_Z });
      if (p.v) nameCellKeys.add(Math.floor(p.x / (W / COLS)) + ',' + Math.floor(p.y / (H / ROWS)));
    }
    let personCells = 0, roomCells = 0, junctionCells = 0, nameDrawn = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = lines[r][c]; if (ch === ' ') continue;
      const src = fld.cells[r * COLS + c].source;
      if (src === 'contour' && ch === '|') { personCells++; continue; }
      if (src === 'contour') { junctionCells++; roomCells++; continue; }
      if (nameCellKeys.has(c + ',' + r)) { nameDrawn++; continue; }
      if (src === 'density' || src === 'substitution') roomCells++;
    }
    shotReport.push({ shot: shot.id, frame: startFrame + f, u: +u.toFixed(4), reach: +reach.toFixed(4), frag: +fp.toFixed(4), decay: +decay.toFixed(4), camZ: +camZ.toFixed(5), personCells, roomCells, junctionCells, nameCellsDrawn: nameDrawn, nameFragmentedCells: fp > 0 ? nameDrawn : 0 });
    prev = lines;
  }
  void prev;
}

const name = STAGE === 'final' ? 'final-silent' : 'rough-cut';
await encode(name, all.map((a) => a.png));
const hashes = all.map((a) => createHash('sha256').update(a.png).digest('hex'));
const shotBounds = [];
{ let acc = 0; for (const s of SHOTS) { shotBounds.push({ shot: s.id, startFrame: acc, endFrame: acc + s.frames - 1, frames: s.frames, seconds: +(s.frames / FPS).toFixed(3) }); acc += s.frames; } }

await writeFile(path.join(OUT, 'shot-boundary-report.json'), JSON.stringify({ stage: STAGE, fps: FPS, resolution: `${W}x${H}`, totalFrames: all.length, totalSeconds: +(all.length / FPS).toFixed(3), shots: shotBounds, uniqueFrameHashes: new Set(hashes).size }, null, 2));
await writeFile(path.join(OUT, 'continuity-report.json'), JSON.stringify({
  note: 'character state carried across cuts: the arm pose and the name decay are functions of the SHOT, continued from where the previous shot left them, never reset',
  transitions: SHOTS.slice(1).map((s, i) => ({ from: SHOTS[i].id, to: s.id, transition: 'hard cut', leftAtReach: SHOTS[i].reach(1), entersAtReach: s.reach(0), leftAtFrag: SHOTS[i].frag(1), entersAtFrag: s.frag(0), leftAtDecay: SHOTS[i].decay(1), entersAtDecay: s.decay(0) })),
}, null, 2));
await writeFile(path.join(OUT, 'shot-trace.json'), JSON.stringify(shotReport, null, 2));
await writeFile(path.join(OUT, 'attention-report.json'), JSON.stringify({
  note: 'within-shot attention comes from the plan; across the sequence it moves as reported in director-plan.json',
  perShot: JSON.parse(await readFile(path.join(OUT, 'director-plan.json'), 'utf8')).report.attention,
  progression: JSON.parse(await readFile(path.join(OUT, 'director-plan.json'), 'utf8')).report.attention.order,
}, null, 2));

/** representative frames for the external review package, written from the same shot table */
if (STAGE === 'final') {
  const REV = path.join(OUT, 'review');
  await mkdir(REV, { recursive: true });
  await writeFile(path.join(REV, 'final-silent.mp4'), await readFile(path.join(OUT, 'final-silent.mp4')));
  /** one establishing frame, one at the reach, one at the name break, one mid-decay, one final */
  const picks = [0, shotBounds[1].startFrame + 30, shotBounds[1].endFrame, shotBounds[3].startFrame + 40, all.length - 1];
  const labels = ['S1-establish', 'S2-reach', 'S2-name-breaks', 'S4-room-withdraws', 'S5-person-remains'];
  for (let i = 0; i < picks.length; i++) {
    await writeFile(path.join(REV, `frame-${String(picks[i]).padStart(3, '0')}-${labels[i]}.png`), all[picks[i]].png);
  }
  console.log(`  review package: out/phase33g/review/ (final-silent.mp4 + ${picks.length} frames)`);
}

console.log(`PHASE 3.3G — ${STAGE.toUpperCase()}\n`);
console.log(`  ${all.length} frames, ${(all.length / FPS).toFixed(2)} s, ${W}x${H}, ${FPS} fps`);
console.log(`  unique frame hashes: ${new Set(hashes).size} / ${all.length}`);
console.log('');
console.log('  shot                    frames   seconds   start..end');
for (const s of shotBounds) console.log(`  ${s.shot.padEnd(22)} ${String(s.frames).padStart(6)} ${String(s.seconds).padStart(8)}   ${s.startFrame}..${s.endFrame}`);
console.log('');
console.log('  CONTINUITY AT CUTS (state must carry, not reset):');
const cr = JSON.parse(await readFile(path.join(OUT, 'continuity-report.json'), 'utf8'));
for (const t of cr.transitions) {
  const okR = Math.abs(t.leftAtReach - t.entersAtReach) < 0.5, okF = Math.abs(t.leftAtFrag - t.entersAtFrag) < 0.05, okD = Math.abs(t.leftAtDecay - t.entersAtDecay) < 0.05;
  console.log(`    ${t.from} -> ${t.to}   reach ${t.leftAtReach.toFixed(2)}->${t.entersAtReach.toFixed(2)} ${okR ? 'ok' : 'JUMP'}   frag ${t.leftAtFrag.toFixed(2)}->${t.entersAtFrag.toFixed(2)} ${okF ? 'ok' : 'JUMP'}   decay ${t.leftAtDecay.toFixed(2)}->${t.entersAtDecay.toFixed(2)} ${okD ? 'ok' : 'JUMP'}`);
}
const nan = shotReport.some((r) => !Number.isFinite(r.reach) || !Number.isFinite(r.frag) || !Number.isFinite(r.decay) || !Number.isFinite(r.camZ));
console.log(`\n  NaN / non-finite: ${nan ? 'FOUND (FAIL)' : 'none (PASS)'}`);
console.log(`  output: out/phase33g/${name}.mp4`);
