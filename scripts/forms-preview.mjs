/**
 * STATIC FORM PREVIEW — the three prototypes for PHASE 3.1A.
 *
 * Renders a human, a room, and a word on a wall as single frames, so the forms can be READ before any
 * film is rebuilt. This is the Phase 3.1A deliverable: "three static visual prototypes".
 *
 *   node scripts/forms-preview.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORD_SCALE = Number(process.env.WORD_SCALE ?? '1');
const OUT = path.join(ROOT, 'out', 'phase31');
const { humanForm, roomForm, wordForm, compileForm, wordLetterforms, letterformObjects } = await import(path.join(ROOT, 'dist', 'src', 'director', 'grammar', 'forms.js'));
const { renderFrameAscii } = await import(path.join(ROOT, 'dist', 'src', 'render', 'render.js'));
const { promptToFilmSpec } = await import(path.join(ROOT, 'dist', 'src', 'domain', 'planner.js'));
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { inkToDisplayByte } = await import(path.join(ROOT, 'dist', 'src', 'render', 'tone.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const NO_NOISE = { octaves: 0, frequency: 0, amplitude: 0, lacunarity: 0, gain: 0, drift: 0 };
const base = promptToFilmSpec('form preview', { duration: 20, fps: 30, width: 1920, height: 1080, quality: 'draft' });

/** One film whose only layer is the given native objects. */
function filmWith(objects) {
  return {
    ...base,
    shots: [{
      ...base.shots[0], id: '01', start: 0, duration: 3,
      density: { coverageMinStart: 2, coverageMinEnd: 2, coverageMaxStart: 20, coverageMaxEnd: 20 },
      raster: {}, transitionIn: { kind: 'cut', duration: 0 },
      camera: { ...base.shots[0].camera, kind: 'static', dollyAmount: 0, panAmount: 0, yawAmount: 0, jitter: 0, focusDistance: 2.4 },
      layers: [{
        id: 'form', kind: 'particle-field', shape: 'none', count: 1,
        bounds: { x: 0, y: 0, z: 0 }, offsetY: 0, glyphRadius: 1.2, intensity: 1,
        variation: 0, depthBias: 0, depth: 'flat', focus: 1.8, noise: NO_NOISE,
        transform: 'none', role: 'protagonist', nativeObjects: objects,
      }],
    }],
    durationInSeconds: 3,
  };
}

/** grid -> PNG at the given scale */
function raster(grid, W, H) {
  const img = { width: W, height: H, data: Buffer.alloc(W * H * 3) };
  const cw = W / grid.cols, chh = H / grid.rows;
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
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const o = (y * W + x) * 3; img.data[o] = val; img.data[o + 1] = val; img.data[o + 2] = val;
        }
      }
    }
  }
  return img;
}

/** ascii text dump, for reading the form without pixels */
function asciiArt(grid) {
  const rows = [];
  for (let y = 0; y < grid.rows; y++) {
    let s = '';
    for (let x = 0; x < grid.cols; x++) { const c = grid.cells[y * grid.cols + x]; s += c.code > 32 ? String.fromCharCode(c.code) : ' '; }
    rows.push(s.replace(/\s+$/, ''));
  }
  while (rows.length && !rows[0].trim()) rows.shift();
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  return rows;
}

await mkdir(OUT, { recursive: true });
const shots = [];

// ---- PROTOTYPE 1: HUMAN -----------------------------------------------------
{
  const form = humanForm({ role: 'protagonist', position: { x: -0.9, y: -0.35, z: 0 }, scale: 1, pose: 'stand', widthBias: 1.9 });
  const c = compileForm(form);
  const f = renderFrameAscii(filmWith(c.objects), 0);
  shots.push({ name: 'human', grid: f.grid, stats: f.stats, anchors: c.anchors });
}

// ---- PROTOTYPE 2: ROOM ------------------------------------------------------
{
  const form = roomForm({ role: 'environment', position: { x: 0, y: 1.05, z: 0 }, convergence: 0.42, opening: { atX: 0.55, width: 0.22, height: 0.5 } });
  const c = compileForm(form);
  const f = renderFrameAscii(filmWith(c.objects), 0);
  shots.push({ name: 'room', grid: f.grid, stats: f.stats, anchors: c.anchors });
}

// ---- PROTOTYPE 3: WORD ON A WALL -------------------------------------------
{
  const room = roomForm({ role: 'environment', position: { x: 0, y: 1.05, z: 0 }, convergence: 0.42, opening: null });
  const rc = compileForm(room);
  const wall = rc.anchors['writing-surface'];
  /**
   * LETTERFORMS AS GEOMETRY. The `wordForm` contour below gives the name a BOUNDED PLACE on the wall —
   * it is the diegetic object's footprint — while `letterformObjects` draws the actual letters as
   * polyline strips, which is the only way they render sharply at a readable size.
   */
  const word = compileForm(wordForm({ text: 'NAME', role: 'name', position: wall, scale: WORD_SCALE }));
  // the back wall is 7.2 world units wide; a name at ~40% of it is ~2.9 units across, and 'NAME' is
  // 4 glyphs of 5 font-pixels, so one pixel is ~0.13 units and a capital is 9 pixels = ~1.15 units.
  const letters = letterformObjects({ text: 'NAME', role: 'name', position: { x: 0, y: wall.y, z: wall.z }, height: 0.52, tracking: 0.9, align: 'centre' });
  const f = renderFrameAscii(filmWith([...rc.objects, ...word.objects, ...letters]), 0);
  shots.push({ name: 'word', grid: f.grid, stats: f.stats, anchors: rc.anchors });
}

for (const s of shots) {
  await writeFile(path.join(OUT, `proto-${s.name}.png`), encodePng(raster(s.grid, 1280, 720)));
  console.log(`\n=== PROTOTYPE: ${s.name.toUpperCase()}  (${s.stats.litCells} lit cells) ===`);
  for (const line of asciiArt(s.grid)) console.log('  ' + line);
}
console.log(`\nwrote ${shots.length} prototypes to ${path.relative(ROOT, OUT)}`);
