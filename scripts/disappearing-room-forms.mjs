/**
 * STEP 11 — the disappearing-room shot built from SubjectForms.
 *
 * Story unchanged. What changes is that the shot now contains a ROOM, a PERSON and a NAME ON A WALL
 * as declared forms rather than as clusters of marks.
 *
 *   node scripts/disappearing-room-forms.mjs [frame]
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const { roomForm, humanForm, letterformObjects, compileForm } = await import(path.join(ROOT, 'dist', 'src', 'director', 'grammar', 'forms.js'));
const { renderFrameAscii } = await import(path.join(ROOT, 'dist', 'src', 'render', 'render.js'));
const { promptToFilmSpec } = await import(path.join(ROOT, 'dist', 'src', 'domain', 'planner.js'));
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { inkToDisplayByte } = await import(path.join(ROOT, 'dist', 'src', 'render', 'tone.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const N = { octaves: 0, frequency: 0, amplitude: 0, lacunarity: 0, gain: 0, drift: 0 };
const base = promptToFilmSpec('a room', { durationInSeconds: 20, fps: 30, width: 1920, height: 1080, quality: 'draft' });

// ---- the three forms -------------------------------------------------------
const SUBJECT_Y = 1.05;                    // where the camera looks; the room is built around it
const room = roomForm({
  role: 'environment',
  position: { x: 0, y: SUBJECT_Y, z: 0 },
  convergence: 0.42,
  opening: null,
  exposure: { kind: 'normal', reason: 'the room is present and must read as an enclosure' },
});
const rc = compileForm(room);
const wall = rc.anchors['writing-surface'];

/**
 * THE PERSON'S DEPTH, MEASURED RATHER THAN GUESSED.
 *
 * The first composition put the figure at `z = 2.2` and it read as a faint smear. Measured in isolation
 * at three depths, against a room whose back wall sits at `z = 0` and whose floor anchor is at
 * `z = 1.6`:
 *
 *   z = 2.2   151 lit cells   bbox x 0..84    HEIGHT 112 CELLS  <- clipped off the frame edge
 *   z = 0.5   614 lit cells   bbox x 88..117  height  67 cells  <- a complete figure, centred
 *   z = 0     479 lit cells   bbox x 94..118  height  53 cells  <- smaller, against the wall
 *
 * `z = 2.2` is too far downstage: the figure scales up past the frame and is cut off at the left edge,
 * which is why it looked faint — most of it was off-screen, not dim. **`z = 0.5` puts a complete
 * 67-cell figure in the middle of the room**, which is both readable and correctly proportioned against
 * a 3.6-unit back wall.
 */
const person = humanForm({
  role: 'protagonist',
  position: { x: -1.35, y: SUBJECT_Y - 1.15, z: 0.5 },
  scale: 1,
  pose: 'stand',
  widthBias: 1.9,
});
const pc = compileForm(person);

// the name on the wall, sized as a fraction of the wall itself
const letters = letterformObjects({
  text: 'NAME', role: 'name', position: wall, height: 0.52, tracking: 0.9, align: 'centre',
});

const objects = [...rc.objects, ...pc.objects, ...letters];

function filmWith(objs) {
  return { ...base, shots: [{
    ...base.shots[0], id: '01', start: 0, duration: 3,
    density: { coverageMinStart: 2, coverageMinEnd: 2, coverageMaxStart: 20, coverageMaxEnd: 20 },
    raster: {}, transitionIn: { kind: 'cut', duration: 0 },
    camera: { ...base.shots[0].camera, kind: 'static', focusDistance: 2.4, dollyAmount: 0, panAmount: 0, yawAmount: 0, jitter: 0 },
    layers: [{
      id: 'world', kind: 'particle-field', shape: 'none', count: 1,
      bounds: { x: 0, y: 0, z: 0 }, offsetY: 0, glyphRadius: 1.2, intensity: 1,
      variation: 0, depthBias: 0, depth: 'flat', focus: 1.8, noise: N,
      transform: 'none', role: 'environment', nativeObjects: objs,
    }],
  }], durationInSeconds: 3 };
}

const f = renderFrameAscii(filmWith(objects), 0);
console.log(`ROOM + PERSON + NAME  ->  ${f.stats.litCells} lit cells, ${objects.length} native objects`);
console.log(`  room ${rc.objects.length} objects, person ${pc.objects.length}, letters ${letters.length}`);

// dump the grid as art so the composition can be read
const rows = [];
for (let y = 0; y < f.grid.rows; y++) {
  let s = '';
  for (let x = 0; x < f.grid.cols; x++) { const c = f.grid.cells[y * f.grid.cols + x]; s += c.code > 32 ? String.fromCharCode(c.code) : ' '; }
  rows.push(s.replace(/\s+$/, ''));
}
while (rows.length && !rows[0].trim()) rows.shift();
while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
console.log('');
for (const r of rows) console.log('  ' + r);

// PNG
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
const { writeFile, mkdir } = await import('node:fs/promises');
await mkdir(path.join(ROOT, 'out', 'phase31'), { recursive: true });
await writeFile(path.join(ROOT, 'out', 'phase31', 'shot-room-person-name.png'), encodePng(raster(f.grid, 1280, 720)));
console.log('\nwrote out/phase31/shot-room-person-name.png');
