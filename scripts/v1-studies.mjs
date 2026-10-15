/**
 * PHASE V1 — THREE ART-DIRECTION MOTION STUDIES.
 *
 * ⚠ THREE MEASURED FAILURES IN THE FIRST RENDER, and what each taught:
 *
 *   A  structurally real but SPARSE — 954 glyphs in 28 800 cells (3.3%), so it read as a thin line drawing.
 *      Fix: extrude the stroke across five depth offsets and place several glyphs per skeleton point, so the
 *      sculpture has SURFACE rather than a wire.
 *   B  EMPTY — the slab quads projected outside the frame, and the final render was a few floor lines on black.
 *      Fix: build an actual CORRIDOR (two walls, floor, ceiling) as continuous quad bands that necessarily cross
 *      the view, so the camera travels THROUGH geometry rather than past it.
 *   C  UNREADABLE — the letterforms were about one glyph wide, so `NAME` rendered as isolated marks.
 *      Fix: size the word so each bitmap pixel owns several glyph cells, and map it orthographically so its
 *      legibility cannot depend on projection.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'v1', 'studies');
const TMP = path.join(ROOT, 'out', 'v1', '.tmp');
const G = await import(path.join(ROOT, 'dist/src/design/geometry.js'));
const M = await import(path.join(ROOT, 'dist/src/design/material.js'));
const R = await import(path.join(ROOT, 'dist/src/design/raster.js'));
const { encodePng } = await import(path.join(ROOT, 'dist/src/render/png.js'));

const W = 1920, H = 1080, COLS = 240, ROWS = 120, FPS = 30, ASPECT = W / H;
const BG = { r: 5, g: 5, b: 7 }, INK = { r: 248, g: 248, b: 242 }, ACCENT = { r: 255, g: 92, b: 48 };
const FF = path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64/ffmpeg');
const LIB = path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64');
const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const SX = (x) => (x * 0.5 + 0.5) * (COLS - 1);
const SY = (y) => (0.5 - y * 0.5) * (ROWS - 1);

async function encodePngs(dir, name, frames) {
  await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  for (let i = 0; i < frames.length; i++) await writeFile(path.join(dir, `f${String(i).padStart(4, '0')}.png`), frames[i]);
  await new Promise((res, rej) => {
    const c = spawn(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', path.join(OUT, `${name}.mp4`)], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } });
    let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(e))));
  });
  await rm(dir, { recursive: true, force: true });
}
const report = [];

// ===========================================================================
// STUDY A — KINETIC TYPOGRAPHIC SCULPTURE
// ===========================================================================
async function studyA() {
  const FRAMES = 90, frames = [];
  /**
   * ⚠ THE STROKE IS EXTRUDED. A torus knot drawn as a single-glyph-wide line is a WIREFRAME; sampling it across
   * five depth offsets and several lateral offsets gives it **surface**, which is what makes the camera orbit
   * reveal volume rather than rotate a drawing.
   */
  const knot = [];
  const P = 2, Q = 3, N = 900;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const r = 1 + 0.40 * Math.cos(Q * t);
    knot.push(G.v3(r * Math.cos(P * t), 0.40 * Math.sin(Q * t), r * Math.sin(P * t)));
  }
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
  for (let f = 0; f < FRAMES; f++) {
    const u = f / (FRAMES - 1);
    const cv = new M.Canvas({ cols: COLS, rows: ROWS });
    const brk = smooth((u - 0.58) / 0.34);
    const orbit = u * 1.05 - 0.38;
    /** ⚠ closer camera and a WIDER lens were needed: the first version framed the knot at about 45% of height */
    const cam = {
      position: G.v3(Math.sin(orbit) * 2.15, 0.55 + u * 0.75, Math.cos(orbit) * 2.15),
      target: G.v3(0, 0, 0), up: G.v3(0, 1, 0),
      fovDegrees: 40 + u * 12, rollDegrees: 2.5 - u * 11, aspect: ASPECT, near: 0.05,
    };
    const b = G.camBasis(cam);
    const spin = u * 0.5;
    const ca = Math.cos(spin), sa = Math.sin(spin);
    /**
     * ⚠ THE STROKE IS SAMPLED ON A GRID, NOT AT FIVE POINTS.
     *
     * Twenty-one discrete depth/lateral offsets left **gaps between the samples**, because each sample writes a
     * single cell and the depth buffer then blocks the neighbour. **Interpolating across the stroke instead of
     * sampling its extremes fills the stroke**, so the sculpture reads as a solid ribbon rather than a dotted
     * outline.
     */
    const DEPTH_STEPS = 13, LAT_STEPS = 9;
    const DEPTH_SPAN = 0.075, LAT_SPAN = 0.052;
    let placed = 0;
    for (let i = 0; i < knot.length; i++) {
      const k = knot[i];
      const rot = G.v3(k.x * ca - k.z * sa, k.y, k.x * sa + k.z * ca);
      const out = G.norm(rot);
      const burst = brk * (1.5 + 0.9 * Math.sin(i * 0.7));
      const swirl = brk * 1.4;
      for (let li = 0; li < LAT_STEPS; li++) {
        const lat = (li / (LAT_STEPS - 1) - 0.5) * 2;             // -1 .. 1
        for (let di = 0; di < DEPTH_STEPS; di++) {
          const dn = (di / (DEPTH_STEPS - 1) - 0.5) * 2;          // -1 .. 1
          const dz = dn * DEPTH_SPAN;
          const jitter = Math.sin(i * 0.31 + u * 5 + lat) * swirl * 0.55;
          const pos = G.v3(
            rot.x + out.x * burst + jitter + lat * LAT_SPAN,
            rot.y + out.y * burst + Math.cos(i * 0.23 + u * 4.4) * swirl * 0.35 + lat * LAT_SPAN,
            rot.z + out.z * burst + Math.sin(i * 0.41 + u * 4.8) * swirl * 0.55 + dz,
          );
          const pr = G.project(b, pos);
          if (!pr.visible) continue;
          const shade = Math.max(0.3, Math.min(1, 2.9 / (1 + pr.depth)));
          const ch = glyphs[(i * 7 + Math.floor(u * 12) + li) % glyphs.length];
          const fam = brk > 0.45 ? 'atmosphere' : 'text';
          const wrote = cv.write(SX(pr.x), SY(pr.y), ch, fam, (brk > 0.45 ? 0.75 : 1) * shade, pr.depth, brk > 0.45 ? 'field' : 'sculpture');
          if (wrote) placed++;
        }
      }
    }
    /** a horizon rule: gives the orbit something to move against, so rotation is FELT */
    for (let x = 0; x < COLS; x++) cv.write(x, SY(-0.62), '·', 'detail', 0.16, 900, 'rule');
    frames.push(encodePng(R.rasterise(cv.toLines(), { width: W, height: H, cols: COLS, rows: ROWS, background: BG, ink: INK, accent: ACCENT, accentChars: new Set(['#', '@']) })));
    if (f === 0 || f === 44 || f === FRAMES - 1) report.push({ study: 'A', frame: f, inkCoverage: +cv.inkCoverage().toFixed(4), placed, census: cv.census(), glyphs: cv.glyphCensus() });
  }
  await encodePngs(path.join(TMP, 'A'), 'study-A-kinetic-typographic-sculpture', frames);
}

// ===========================================================================
// STUDY B — CINEMATIC ASCII SPACE
// ===========================================================================
/**
 * ⚠ REBUILT AS A CORRIDOR. The first version placed discrete slabs beside the path, and they projected outside
 * the frame — the render was a few floor lines on black. **A corridor made of continuous bands cannot miss the
 * view**, and it gives the travelling camera walls, a floor and a ceiling to move past.
 *
 * Three depth bands use DIFFERENT families and move at different rates, which is what produces parallax.
 */
async function studyB() {
  const FRAMES = 90, frames = [];
  const HALFW = 1.75, CEIL = 1.9, DEPTH = 26;
  for (let f = 0; f < FRAMES; f++) {
    const u = f / (FRAMES - 1);
    const cv = new M.Canvas({ cols: COLS, rows: ROWS });
    const z0 = -u * 12;
    const cam = {
      position: G.v3(Math.sin(u * 1.9) * 0.35, 0.95 + Math.sin(u * 1.2) * 0.10, z0 + 4.2),
      target: G.v3(Math.sin(u * 1.9 + 0.6) * 0.30, 0.92, z0), up: G.v3(0, 1, 0),
      fovDegrees: 62, rollDegrees: Math.sin(u * 1.6) * 2.6, aspect: ASPECT, near: 0.05,
    };
    const b = G.camBasis(cam);
    const quad = (pts, o) => {
      for (let k = 0; k < pts.length; k++) {
        const s = G.clipSegment(b, pts[k], pts[(k + 1) % pts.length]);
        if (!s) continue;
        const a1 = G.project(b, s[0]), a2 = G.project(b, s[1]);
        if (!a1.visible || !a2.visible) continue;
        M.line(cv, SX(a1.x), SY(a1.y), SX(a2.x), SY(a2.y), o);
      }
    };
    /** the corridor is built in repeating 2-unit bays from just behind the camera to the far depth */
    for (let i = -2; i < DEPTH; i++) {
      const za = z0 + i * 2.0, zb = za + 2.0;
      const fade = Math.max(0.12, Math.min(1, 1 - (i + 2) / (DEPTH + 3)));
      /**
       * WALL bands — architecture family, heavy.
       *
       * ⚠ DRAWN AS A LADDER OF VERTICALS, NOT AS ONE EDGE. The first version projected each band edge as a
       * single line segment, and because a segment's projected length in glyph cells can be shorter than its
       * pixel length, the wall corners rendered as **dotted** rather than solid. Subdividing each band into
       * several vertical strips gives a continuous surface.
       */
      const STRIPS = 5;
      for (const sx of [-HALFW, HALFW]) {
        for (let k = 0; k < STRIPS; k++) {
          const zz = za + ((k + 0.5) / STRIPS) * (zb - za);
          const s = G.clipSegment(b, G.v3(sx, 0, zz), G.v3(sx, CEIL, zz));
          if (!s) continue;
          const p1 = G.project(b, s[0]), p2 = G.project(b, s[1]);
          if (!p1.visible || !p2.visible) continue;
          M.line(cv, SX(p1.x), SY(p1.y), SX(p2.x), SY(p2.y), { family: 'architecture', ink: 0.42 * fade + 0.14, depth: 8 + i + k * 0.01, material: 'wall' });
        }
      }
      /** structural RIBS — detail family, hairlines, the mid ground */
      for (const sx of [-HALFW, HALFW]) {
        const s = G.clipSegment(b, G.v3(sx, 0, za), G.v3(sx, CEIL, za));
        if (!s) continue;
        const p1 = G.project(b, s[0]), p2 = G.project(b, s[1]);
        if (p1.visible && p2.visible) M.line(cv, SX(p1.x), SY(p1.y), SX(p2.x), SY(p2.y), { family: 'detail', ink: 0.85, depth: 4 + i, material: 'rib' });
      }
      for (const sy of [0, CEIL]) {
        const s = G.clipSegment(b, G.v3(-HALFW, sy, za), G.v3(HALFW, sy, za));
        if (!s) continue;
        const p1 = G.project(b, s[0]), p2 = G.project(b, s[1]);
        if (p1.visible && p2.visible) M.line(cv, SX(p1.x), SY(p1.y), SX(p2.x), SY(p2.y), { family: 'detail', ink: 0.7, depth: 4 + i, material: 'rib' });
      }
      /** FLOOR lattice — the strongest depth cue, running toward the viewer, subdivided so it reads solid */
      for (let ix = -4; ix <= 4; ix++) {
        for (let k = 0; k < 3; k++) {
          const t0 = k / 3, t1 = (k + 1) / 3;
          const s = G.clipSegment(b, G.v3(ix * 0.42, 0, za + t0 * (zb - za)), G.v3(ix * 0.42, 0, za + t1 * (zb - za)));
          if (!s) continue;
          const p1 = G.project(b, s[0]), p2 = G.project(b, s[1]);
          if (p1.visible && p2.visible) M.line(cv, SX(p1.x), SY(p1.y), SX(p2.x), SY(p2.y), { family: 'architecture', ink: 0.4 * fade + 0.12, depth: 10 + i + t0 * 0.01, material: 'floor' });
        }
      }
      /** a lamp on the left wall every third bay — a moving graphic accent, not decoration */
      if (i % 3 === 0) {
        const s = G.clipSegment(b, G.v3(-HALFW, CEIL * 0.72, za + 0.6), G.v3(-HALFW + 0.50, CEIL * 0.72, za + 0.6));
        if (s) {
          const p1 = G.project(b, s[0]), p2 = G.project(b, s[1]);
          if (p1.visible && p2.visible) M.line(cv, SX(p1.x), SY(p1.y), SX(p2.x), SY(p2.y), { family: 'accent', ink: 0.95, depth: 3 + i, material: 'lamp' });
        }
      }
    }
    /** NEAR band: sparse particles streaming past the lens, the fastest parallax of all */
    for (let i = 0; i < 130; i++) {
      const t = ((i * 0.37 + u * 3.3) % 1);
      const zz = z0 + 0.25 + t * 2.2;
      const a = i * 2.399, rad = 0.75 + (i % 7) * 0.17;
      const pr = G.project(b, G.v3(Math.cos(a) * rad, 0.9 + Math.sin(a * 1.7) * 0.62, zz));
      if (!pr.visible) continue;
      cv.write(SX(pr.x), SY(pr.y), ['·', "'", '`', '˙'][i % 4], 'atmosphere', Math.max(0.15, 1 - t), pr.depth, 'near-particles');
    }
    frames.push(encodePng(R.rasterise(cv.toLines(), { width: W, height: H, cols: COLS, rows: ROWS, background: BG, ink: INK, accent: ACCENT, accentChars: new Set(['/']) })));
    if (f === 0 || f === 44 || f === FRAMES - 1) report.push({ study: 'B', frame: f, inkCoverage: +cv.inkCoverage().toFixed(4), census: cv.census(), glyphs: cv.glyphCensus() });
  }
  await encodePngs(path.join(TMP, 'B'), 'study-B-cinematic-ascii-space', frames);
}

// ===========================================================================
// STUDY C — GLYPH FIELD TRANSFORMATION
// ===========================================================================
/**
 * ⚠ THE WORD IS SIZED IN GLYPH CELLS, NOT WORLD UNITS. The first version produced letterforms about ONE glyph
 * wide, so `NAME` was a scatter of marks. **Legibility is a matter of how many cells a letterform owns**, so
 * the target rectangle is expressed directly in the lattice and mapped orthographically — the camera still
 * pushes in, but as a SCALE on that mapping rather than as a projection that can wreck the letterforms.
 */
async function studyC() {
  const FRAMES = 90, frames = [];
  const WORD = 'NAME';
  const FONT = { N: ['10001','11001','10101','10011','10001','10001','10001','10001','10001'], A: ['01110','10001','10001','10001','11111','10001','10001','10001','10001'], M: ['10001','11011','10101','10001','10001','10001','10001','10001','10001'], E: ['11111','10000','10000','10000','11110','10000','10000','10000','11111'] };
  /**
   * ⚠ EACH BITMAP PIXEL OWNS A CELL RANGE AND IS FILLED ACROSS IT.
   *
   * The first version wrote ONE glyph per bitmap pixel, which for a 176-cell-wide word means each pixel owns
   * about seven columns — so `NAME` rendered as isolated `#` with six-cell gaps and was unreadable. **A
   * letterform is legible when its pixels are filled, not sampled.** Each `1` in the font now becomes a FILLED
   * rectangle whose corners are also recorded, so both the transformation and the final form are solid.
   */
  const CW = 176, CH = 63, CX = (COLS - CW) / 2, CY = 40;
  const UNIT = CW / (WORD.length * 6 - 1);           // one font-column, including the inter-letter gap
  const cellW = UNIT, cellH = CH / 9;
  const targets = [];
  for (let li = 0; li < WORD.length; li++) {
    const pat = FONT[WORD[li]];
    const gx0 = CX + li * 6 * UNIT;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) if (pat[r][c] === '1')
      targets.push({ gx0: gx0 + c * cellW, gy0: CY + r * cellH, gw: cellW, gh: cellH,
        gx: gx0 + (c + 0.5) * cellW, gy: CY + (r + 0.5) * cellH });
  }
  /** sources: a coherent ribbon mass low and left, with real structure */
  const sources = targets.map((_, i) => { const a = i * 0.618; return { gx: COLS / 2 + Math.cos(a) * 74, gy: ROWS * 0.80 + Math.sin(i * 0.37) * 11, phase: a }; });
  const glyphs = 'NMAE#*+=-:.^~'.split('');
  for (let f = 0; f < FRAMES; f++) {
    const u = f / (FRAMES - 1);
    const cv = new M.Canvas({ cols: COLS, rows: ROWS });
    const t = smooth((u - 0.10) / 0.72);
    /** a slight overshoot gives the transformation MOMENTUM rather than a linear ease */
    const over = Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.10) / 0.72))) * 0.05;
    /** the push-in is an orthographic SCALE about the word's centre, so legibility cannot depend on projection */
    const scale = 1 + 0.16 * smooth(u / 0.85);
    const cxm = COLS / 2, cym = CY + CH / 2;
    const forming = t < 0.5;
    for (let i = 0; i < targets.length; i++) {
      const s = sources[i], tg = targets[i];
      const swirl = (1 - t) * 26;
      const wob = Math.sin(u * 7 + i * 0.7) * swirl * 0.5;
      const px = s.gx + (tg.gx - s.gx) * t + wob * Math.sin(s.phase);
      const py = s.gy + (tg.gy - s.gy) * t + wob * Math.cos(s.phase * 1.3) + over * 6;
      /** the scale is applied about the word's centre */
      const qx = cxm + (px - cxm) * scale, qy = cym + (py - cym) * scale;
      if (forming) {
        /** a single travelling mark: the MASS, deliberately sparse so the field reads as material */
        cv.write(qx, qy, glyphs[i % glyphs.length], 'atmosphere', 0.35 + 0.55 * t, 1, 'mass');
      } else {
        /** ⚠ FILLED RECTANGLE, so the letterform is solid rather than dotted */
        const w = Math.max(1, tg.gw * scale), h = Math.max(1, tg.gh * scale);
        for (let yy = Math.floor(qy - h / 2); yy < Math.ceil(qy + h / 2); yy++)
          for (let xx = Math.floor(qx - w / 2); xx < Math.ceil(qx + w / 2); xx++)
            cv.write(xx, yy, '#', 'text', 0.98, 1, 'word', true);
      }
    }
    if (t > 0.88) {
      const k = (t - 0.88) / 0.12;
      for (let x = 0; x < COLS; x++) { const sx = x / (COLS - 1); if (Math.abs(sx - 0.5) < 0.42 * k) cv.write(x, CY + CH + 6, '/', 'accent', 0.9 * k, 0.1, 'rule', true); }
    }
    frames.push(encodePng(R.rasterise(cv.toLines(), { width: W, height: H, cols: COLS, rows: ROWS, background: BG, ink: INK, accent: ACCENT, accentChars: new Set(['/', '#']) })));
    if (f === 0 || f === 44 || f === FRAMES - 1) {
      report.push({ study: 'C', frame: f, inkCoverage: +cv.inkCoverage().toFixed(4), census: cv.census(), glyphs: cv.glyphCensus() });
      if (f === FRAMES - 1) { console.log('    C final frame — letterform legibility check (every 3rd row, "#" = ink):'); for (let r = CY - 1; r < CY + CH + 1; r += 3) { let s = ''; for (let c = CX - 2; c < CX + CW + 2; c += 1) s += cv.resolved(c, r).ch; console.log('      ' + s.replace(/ /g, '.')); } }
    }
  }
  await encodePngs(path.join(TMP, 'C'), 'study-C-glyph-field-transformation', frames);
}

await mkdir(OUT, { recursive: true }); await mkdir(TMP, { recursive: true });
console.log('PHASE V1 — ART-DIRECTION MOTION STUDIES (rebuilt)\n');
console.log('  study A — KINETIC TYPOGRAPHIC SCULPTURE'); await studyA();
console.log('  study B — CINEMATIC ASCII SPACE'); await studyB();
console.log('  study C — GLYPH FIELD TRANSFORMATION'); await studyC();
await writeFile(path.join(ROOT, 'out/v1/study-metrics.json'), JSON.stringify({ note: 'measured per study: ink coverage, material census, glyph family census', samples: report }, null, 2));
console.log('\n  3 studies written; metrics in out/v1/study-metrics.json');
