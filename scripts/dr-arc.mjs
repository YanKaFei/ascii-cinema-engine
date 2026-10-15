/**
 * STEP 11 — the disappearing-room ARC, built from SubjectForms.
 *
 * Six beats, story unchanged: ROOM, NAME ON WALL, PERSON, ERASURE, ROOM DISAPPEARING, ABSENCE.
 * Each beat is a separate still so each can be rated on its own.
 *
 *   node scripts/dr-arc.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
const SY = 1.05;
const SUBJ = { x: -1.35, y: SY - 1.15, z: 0.5 };   // measured in round 13: a complete 67-cell figure

/** Build one beat. `intent` is the Director's exposure direction for it. */
function beat({ room = 1, person = false, pose = 'stand', name = null, erase = 0, intent = 'auto', roomProm = 1, personProm = 1, nameProm = 1 }) {
  const objs = [];
  let roomAnchor = null;
  if (room > 0) {
    const r = roomForm({ role: 'environment', position: { x: 0, y: SY, z: 0 }, convergence: 0.42, opening: null, prominence: roomProm * room });
    const rc = compileForm(r);
    roomAnchor = rc.anchors['writing-surface'];
    // `room` < 1 thins the room's own structure: fewer floor courses, lower intensity
    objs.push(...rc.objects);
    if (name) objs.push(...letterformObjects({ text: 'NAME', role: 'name', position: roomAnchor, height: 0.52, tracking: 0.9, align: 'centre', erase }));
  }
  if (person) objs.push(...compileForm(humanForm({ role: 'protagonist', position: SUBJ, scale: 1, pose, widthBias: 1.9, prominence: personProm })).objects);
  return {
    ...base,
    shots: [{
      ...base.shots[0], id: '01', start: 0, duration: 3,
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
    }],
    durationInSeconds: 3,
  };
}

/**
 * THE HIERARCHY, DECLARED PER BEAT.
 *
 * Round 16 measured that every form competed equally for the frame, so the environment always won on
 * total ink and the arc's subject was drowned. `prominence` is the Director saying what each beat is
 * ABOUT: the room recedes as the beat becomes about the name, and further as it becomes about the
 * erasure.
 */
const BEATS = [
  { key: '1-room',       label: 'ROOM',              args: { room: 1, roomProm: 1.6 } },
  { key: '2-name',       label: 'NAME ON WALL',      args: { room: 1, name: true, roomProm: 0.55, nameProm: 2.2 } },
  { key: '3-person',     label: 'PERSON',            args: { room: 1, name: true, person: true, roomProm: 0.5, nameProm: 1.4, personProm: 2.0 } },
  { key: '4-erasure',    label: 'ERASURE',           args: { room: 1, name: true, erase: 1, person: true, pose: 'reach', roomProm: 0.45, personProm: 1.8 } },
  { key: '5-vanishing',  label: 'ROOM DISAPPEARING', args: { room: 0.25, name: true, erase: 0.8, person: true, roomProm: 0.7, nameProm: 1.5, personProm: 1.5 } },
  { key: '6-absence',    label: 'ABSENCE',           args: { room: 0, intent: 'preserve-emptiness' } },
];

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

await mkdir(path.join(ROOT, 'out', 'phase31'), { recursive: true });
const stills = [];
console.log('beat                lit   totalInk   nativeObjects');
for (const b of BEATS) {
  const film = beat(b.args);
  const f = renderFrameAscii(film, 0);
  const total = f.grid.cells.reduce((a, c) => a + c.ink, 0);
  const n = film.shots[0].layers[0].nativeObjects.length;
  console.log(`  ${b.label.padEnd(18)} ${String(f.stats.litCells).padStart(5)} ${total.toFixed(0).padStart(10)} ${String(n).padStart(14)}`);
  /**
   * 1920x1080 AND NOT LESS. One glyph subpixel must be >= one screen pixel or thin contours dissolve
   * into isolated dots. At 1920x1080 over a 240x120 lattice it is 1.60 x 1.00 px; at 960x540 it is
   * 0.80 x 0.50 and a human silhouette stops reading. This cost three rounds to establish.
   */
  await writeFile(path.join(ROOT, 'out', 'phase31', `arc-${b.key}.png`), encodePng(raster(f.grid, 1920, 1080)));
  stills.push({ ...b, lit: f.stats.litCells, ink: total });
}
console.log('\nwrote ' + stills.length + ' arc stills to out/phase31/arc-*.png');
