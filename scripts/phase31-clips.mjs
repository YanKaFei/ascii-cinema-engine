/**
 * STEP 13 — THREE SILENT 3-SECOND CLIPS.
 *
 *   TEST A  a person enters an ASCII room
 *   TEST B  a readable word on a wall, a figure reaching toward it
 *   TEST C  a populated room collapses into almost nothing
 *
 * No sound. No labels. No text on screen explaining what is being seen. 90 frames each at 30 fps.
 *
 *   node scripts/phase31-clips.mjs
 */
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase31', 'clips');
const FRAMES = path.join(ROOT, 'out', 'phase31', 'frames');
const { roomForm, humanForm, letterformObjects, compileForm } = await import(path.join(ROOT, 'dist', 'src', 'director', 'grammar', 'forms.js'));
const { renderFrameAscii } = await import(path.join(ROOT, 'dist', 'src', 'render', 'render.js'));
const { promptToFilmSpec } = await import(path.join(ROOT, 'dist', 'src', 'domain', 'planner.js'));
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { inkToDisplayByte } = await import(path.join(ROOT, 'dist', 'src', 'render', 'tone.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

/**
 * RESOLUTION, AND WHY IT IS 1920x1080.
 *
 * The clips were first rendered at 960x540, and TEST A read as an empty frame. Two rounds were spent on
 * hypotheses — a normaliser response, then a measurement error — before a digest comparison proved the
 * two render paths byte-identical and a per-row filter audit proved the decoder correct.
 *
 * **The cause was the render size.** At 960x540 one glyph SUBPIXEL is **0.80 x 0.50 screen pixels** —
 * smaller than a pixel — so marks become isolated dots. A room survives that, because it is a lattice of
 * long connected edges; **a human silhouette does not, because it is a thin contour.** TEST B passed at
 * the same size simply because solid letterform strips tolerate the loss.
 *
 *   resolution   one glyph subpixel
 *    960x540      0.80 x 0.50 px   <- the clips were here
 *   1280x720      1.07 x 0.67 px
 *   1920x1080     1.60 x 1.00 px   <- the films, and now the clips
 *
 * So the clips render at the resolution the FILMS use, which is also the only setting in which rating
 * them says anything about the forms rather than about the render settings.
 */
const W = 1920, H = 1080, FPS = 30, SECS = 3, FRAMES_N = FPS * SECS;
const FFMPEG = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg');
const FFMPEG_LIB = path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64');
const N = { octaves: 0, frequency: 0, amplitude: 0, lacunarity: 0, gain: 0, drift: 0 };
const base = promptToFilmSpec('a room', { durationInSeconds: 20, fps: 30, width: 1920, height: 1080, quality: 'draft' });
const SY = 1.05;

/** Native objects for one moment of a clip. */
function objectsFor(test, u) {
  const objs = [];
  // ---- the room ------------------------------------------------------------
  // TEST C: the room thins and finally goes; the others hold it as environment
  const roomProm = test === 'C' ? Math.max(0, 1 - u * 1.15) : 0.5;
  if (roomProm > 0.001) {
    const rc = compileForm(roomForm({ role: 'environment', position: { x: 0, y: SY, z: 0 }, convergence: 0.42, opening: null, prominence: roomProm }));
    objs.push(...rc.objects);
  }
  // ---- the name on the wall ------------------------------------------------
  const wall = { x: 0, y: SY + 0.27, z: 1 };
  if (test === 'B') {
    // the name is the subject of TEST B, so it is weighted up and never erased
    objs.push(...letterformObjects({ text: 'NAME', role: 'name', position: wall, height: 0.65, tracking: 1.0, align: 'centre', erase: 0 }));
  } else if (test === 'C') {
    // the name goes with the room
    objs.push(...letterformObjects({ text: 'NAME', role: 'name', position: wall, height: 0.52, tracking: 0.9, align: 'centre', erase: Math.min(1, Math.max(0, (u - 0.45) * 2.2)) }));
  }
  // ---- the person ----------------------------------------------------------
  // TEST A: enters from the left. TEST B: stands, reaching toward the wall.
  // TEST C: present, then the room's collapse leaves it alone in the dark.
  if (test === 'A') {
    const x = -2.6 + u * 1.5;                         // walks in to about x = -1.1
    const pose = u < 0.15 ? 'walk' : u > 0.75 ? 'stand' : 'walk';
    objs.push(...compileForm(humanForm({ role: 'protagonist', position: { x, y: SY - 1.15, z: 0.5 }, scale: 1, pose, widthBias: 1.9, prominence: 2.0 })).objects);
  } else if (test === 'B') {
    const pose = u > 0.3 ? 'reach' : 'stand';
    objs.push(...compileForm(humanForm({ role: 'protagonist', position: { x: -1.5, y: SY - 1.15, z: 1.4 }, scale: 1, pose, widthBias: 1.9, prominence: 2.0 })).objects);
  } else {
    objs.push(...compileForm(humanForm({ role: 'protagonist', position: { x: -1.35, y: SY - 1.15, z: 0.5 }, scale: 1, pose: 'stand', widthBias: 1.9, prominence: 1.8 })).objects);
  }
  return objs;
}

function filmFor(objs, intent) {
  return { ...base, shots: [{
    ...base.shots[0], id: '01', start: 0, duration: SECS,
    density: { coverageMinStart: 2, coverageMinEnd: 2, coverageMaxStart: 20, coverageMaxEnd: 20 },
    raster: { fieldNormalise: true, exposureIntent: intent },
    transitionIn: { kind: 'cut', duration: 0 },
    camera: { ...base.shots[0].camera, kind: 'static', focusDistance: 2.4, dollyAmount: 0, panAmount: 0, yawAmount: 0, jitter: 0 },
    layers: [{
      id: 'world', kind: 'particle-field', shape: 'none', count: 1,
      bounds: { x: 0, y: 0, z: 0 }, offsetY: 0, glyphRadius: 1.2, intensity: 1,
      variation: 0, depthBias: 0, depth: 'flat', focus: 1.8, noise: N,
      transform: 'none', role: 'environment', nativeObjects: objs,
    }],
  }], durationInSeconds: SECS };
}

function raster(grid, w, h) {
  const img = { width: w, height: h, data: Buffer.alloc(w * h * 3) };
  const cw = w / grid.cols, chh = h / grid.rows;
  for (let cy = 0; cy < grid.rows; cy++) for (let cx = 0; cx < grid.cols; cx++) {
    const cell = grid.cells[cy * grid.cols + cx];
    if (cell.code <= 32) continue;
    const g = GLYPH_BY_CODE[cell.code]; if (!g) continue;
    const val = inkToDisplayByte(Math.round(cell.ink * 255));
    for (let py = 0; py < GLYPH_H; py++) {
      const mask = g.rows[py]; if (!mask) continue;
      for (let px = 0; px < GLYPH_W; px++) {
        if (!(mask & (1 << (GLYPH_W - 1 - px)))) continue;
        const x0 = Math.round(cx * cw + px * cw / GLYPH_W), x1 = Math.round(cx * cw + (px + 1) * cw / GLYPH_W);
        const y0 = Math.round(cy * chh + py * chh / GLYPH_H), y1 = Math.round(cy * chh + (py + 1) * chh / GLYPH_H);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const o = (y * w + x) * 3; img.data[o] = val; img.data[o + 1] = val; img.data[o + 2] = val;
        }
      }
    }
  }
  return img;
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const c = spawn(FFMPEG, args, { cwd: ROOT, env: { ...process.env, DYLD_LIBRARY_PATH: FFMPEG_LIB }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = ''; c.stderr.on('data', (d) => (err += d)); c.on('error', reject);
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}\n${err.slice(-800)}`))));
  });
}

await mkdir(OUT, { recursive: true });
const TESTS = {
  A: { title: 'person enters an ASCII room', intent: 'normal' },
  B: { title: 'readable word on a wall, figure reaching', intent: 'normal' },
  C: { title: 'populated room collapses into almost nothing', intent: 'preserve-emptiness' },
};

for (const [key, meta] of Object.entries(TESTS)) {
  const dir = path.join(FRAMES, key);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  let first = 0, last = 0;
  for (let f = 0; f < FRAMES_N; f++) {
    const u = f / (FRAMES_N - 1);
    const film = filmFor(objectsFor(key, u), meta.intent);
    const r = renderFrameAscii(film, 0);
    let lit = 0; for (const c of r.grid.cells) if (c.code > 32) lit++;
    if (f === 0) first = lit;
    if (f === FRAMES_N - 1) last = lit;
    await writeFile(path.join(dir, `f${String(f).padStart(4, '0')}.png`), encodePng(raster(r.grid, W, H)));
  }
  const mp4 = path.join(OUT, `TEST-${key}.mp4`);
  await ffmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS),
    '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '18', mp4]);
  console.log(`TEST ${key}  ${meta.title}`);
  console.log(`   ${FRAMES_N} frames  ${W}x${H}  ${FPS}fps  lit cells ${first} -> ${last}`);
  console.log(`   -> ${path.relative(ROOT, mp4)}`);
}
console.log('\nno audio track, no labels, no explanatory text on screen.');
