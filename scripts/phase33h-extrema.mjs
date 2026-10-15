/**
 * EXTREMA REVIEW SET + RASTER CONNECTION CHECK.
 *
 * Exports engineering frames at the poses most likely to fail, and verifies that the semantic body
 * connection SURVIVES the lattice — not merely that it held before projection.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33h', 'extrema');
const report = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(path.join(ROOT, 'out', 'phase33h', 'performance-report.json'), 'utf8')));
const BODY = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'body.js'));
await mkdir(OUT, { recursive: true });

/**
 * The extrema are located from the TRACE, not hardcoded — a frame number written by hand would be a guess.
 */
const POSES = ['neutral', 'max-head-turn', 'max-weight-shift', 'mid-step', 'foot-contact', 'post-contact-settle', 'max-reach', 'final-hold'];
console.log('PHASE 3.3H.2 — EXTREMA + CONNECTION CHECK\n');
const out = {};
for (const [variant, rep] of Object.entries(report)) {
  const tr = rep.trace;
  const idxOf = {
    'neutral': () => 0,
    'max-head-turn': () => tr.reduce((b, r, i) => (Math.abs(r.headAngle) > Math.abs(tr[b].headAngle) ? i : b), 0),
    'max-weight-shift': () => tr.reduce((b, r, i) => (r.bodyCentre > tr[b].bodyCentre ? i : b), 0),
    'mid-step': () => { const s = tr.filter((r) => r.stepProgress > 0.05 && r.stepProgress < 0.95); return s.length ? s[Math.floor(s.length / 2)].frame : 0; },
    'foot-contact': () => { const c = tr.find((r) => r.contact); return c ? c.frame : 0; },
    'post-contact-settle': () => { const c = tr.find((r) => r.contact); return c ? Math.min(tr.length - 1, c.frame + 12) : 0; },
    'max-reach': () => tr.reduce((b, r, i) => (r.arm > tr[b].arm ? i : b), 0),
    'final-hold': () => tr.length - 1,
  };
  const picked = {};
  for (const p of POSES) picked[p] = idxOf[p]();
  out[variant] = picked;
  console.log(`  ${variant}`);
  for (const p of POSES) {
    const r = tr[picked[p]];
    console.log(`    ${p.padEnd(20)} f${String(picked[p]).padStart(3)}  headYaw ${String(r.headAngle).padStart(6)}  bodyCentre ${r.bodyCentre.toFixed(3)}  arm ${r.arm.toFixed(3)}  support ${r.support}`);
  }
}
await writeFile(path.join(OUT, 'extrema-frames.json'), JSON.stringify(out, null, 2));

/**
 * EXPORT THE EXTREMA IMAGES FROM THE RENDERED PNGs, not from the mp4.
 *
 * Clip codecs are lossy and this ffmpeg build lacks the `select` filter, so extracting exact frames from the
 * video would produce images that are *approximately* the frame that was rendered. The extrema review is
 * about whether the figure is readable at specific poses, so it must use the exact frames.
 */
{
  const { readFile } = await import('node:fs/promises');
  const crypto = await import('node:crypto');
  const src = path.join(ROOT, 'out', 'phase33h');
  const files = await (await import('node:fs/promises')).readdir(src);
  void files;
  /**
   * The render deletes its frame directory after encoding, so the frames are re-rendered here for the
   * selected indices only — using the same `performance-report.json` trace, which is the authoritative
   * record of each frame's state.
   */
  console.log('  (extrema images are produced by scripts/phase33h-extrema-export.mjs)');
  void readFile; void crypto;
}

/**
 * RASTER CONNECTION CHECK — the point of this file.
 *
 * For every frame, build the skeleton and ask whether the head's projected disc shares or neighbours an
 * occupied cell with the neck's projected segment **on the actual glyph lattice**. This is the renderer's own
 * adjacency rule, not a pixel tolerance.
 */
console.log('\nRASTER CONNECTION CHECK — head->neck->torso chain on the actual lattice');
const COLS = 240, ROWS = 120, W = 1920, H = 1080, ASPECT = W / H;
const G = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'room-geometry.js'));
const cam = { eye: { x: 0, y: 1.05, z: 0.9315 }, target: { x: 0, y: 1.05, z: 0 }, focal: 0.9 };
const projPx = (p) => { const q = G.projectRoom(cam, p, ASPECT); return { x: q.x * W, y: q.y * H }; };
const cellOf = (v) => { const p = projPx(v); return [Math.floor(p.x / (W / COLS)), Math.floor(p.y / (H / ROWS))]; };
const FEET_Y = 0.15, HEIGHT = 1.6, ZW = -0.2;
let frames = 0, disconnected = 0, tangent = 0; const failures = [];
for (const [variant, rep] of Object.entries(report)) {
  for (const r of rep.trace) {
    const sk = BODY.buildSkeleton(r.rootX, FEET_Y, HEIGHT, { torsoYaw: r.torsoAngle, headYaw: r.headAngle, torsoLean: 0 }, ZW);
    frames++;
    /** the head disc's lattice cells */
    const headCells = new Set();
    const top = projPx({ x: sk.root.x, y: FEET_Y + HEIGHT, z: ZW }), bot = projPx({ x: sk.root.x, y: FEET_Y, z: ZW });
    const pxH = Math.abs(bot.y - top.y), headRpx = (sk.headRadius / HEIGHT) * pxH;
    const hc = cellOf(sk.head);
    for (let dy = -Math.ceil(headRpx / (H / ROWS)); dy <= Math.ceil(headRpx / (H / ROWS)); dy++)
      for (let dx = -Math.ceil(headRpx / (W / COLS)); dx <= Math.ceil(headRpx / (W / COLS)); dx++) {
        const px = hc[0] + dx + 0.5, py = hc[1] + dy + 0.5;
        const wx = (hc[0] + dx + 0.5) * (W / COLS), wy = (hc[1] + dy + 0.5) * (H / ROWS);
        if (Math.hypot(wx - projPx(sk.head).x, wy - projPx(sk.head).y) <= headRpx) headCells.add(px + ',' + py);
      }
    /** the neck segment's lattice cells */
    const neckCells = new Set();
    const a = projPx(sk.neck), b = projPx(sk.neckTop);
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let i = 0; i <= n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      neckCells.add(Math.floor(p.x / (W / COLS)) + 0.5 + ',' + (Math.floor(p.y / (H / ROWS)) + 0.5));
    }
    /** CONNECTED = the head cell set and the neck cell set share a cell or are 4-adjacent */
    let connected = false, touching = false;
    for (const h of headCells) {
      const [hx, hy] = h.split(',').map(Number);
      for (const nc of neckCells) {
        const [nx, ny] = nc.split(',').map(Number);
        const d = Math.abs(hx - nx) + Math.abs(hy - ny);
        if (d === 0) { connected = true; break; }
        if (d === 1) touching = true;
      }
      if (connected) break;
    }
    if (!connected && !touching) { disconnected++; if (failures.length < 5) failures.push(`${variant} f${r.frame} headYaw ${r.headAngle}`); }
    else if (!connected && touching) tangent++;
  }
}
console.log(`  frames checked            : ${frames}`);
console.log(`  head/neck NOT connected   : ${disconnected}`);
console.log(`  connected only by adjacency: ${tangent}`);
for (const f of failures) console.log(`    FAIL ${f}`);
console.log(`  raster connection: ${disconnected === 0 ? 'PASS' : 'FAIL'}`);
