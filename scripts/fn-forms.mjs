/**
 * STEP 12 — the forgotten-name rebuild, built from SubjectForms.
 *
 * The brief requires four things, and each is a form:
 *   a RECOGNISABLE PERSON      humanForm
 *   a DIEGETIC READABLE NAME   letterformObjects, on a surface in the world
 *   an ENVIRONMENT             roomForm
 *   ERASURE / LOSS             the name's `erase`, the room's `prominence`, `preserve-emptiness`
 *
 * The story is unchanged. The beats below are the brief's own.
 *
 *   node scripts/fn-forms.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const { roomForm, humanForm, letterformObjects, compileForm, auditFormComposition } = await import(path.join(ROOT, 'dist', 'src', 'director', 'grammar', 'forms.js'));
const { renderFrameAscii } = await import(path.join(ROOT, 'dist', 'src', 'render', 'render.js'));
const { promptToFilmSpec } = await import(path.join(ROOT, 'dist', 'src', 'domain', 'planner.js'));
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { inkToDisplayByte } = await import(path.join(ROOT, 'dist', 'src', 'render', 'tone.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

/**
 * RESOLUTION, AND IT IS NOT OPTIONAL. One glyph subpixel must be at least one screen pixel or the marks
 * become isolated dots and thin contours stop reading. At 1920x1080 over a 240x120 lattice it is
 * 1.60 x 1.00 px. See the clips script for the measurement table.
 */
const W = 1920, H = 1080;
const N = { octaves: 0, frequency: 0, amplitude: 0, lacunarity: 0, gain: 0, drift: 0 };
const base = promptToFilmSpec('a name', { durationInSeconds: 20, fps: 30, width: 1920, height: 1080, quality: 'draft' });
const SY = 1.05;

/** Build one beat from forms. Every beat states what it is ABOUT via prominence. */
function beat({ room = 0.5, name = null, erase = 0, nameScale = 1, person = null, intent = 'normal' }) {
  const objs = [];
  let wall = { x: 0, y: SY + 0.27, z: 1 };
  if (room > 0.001) {
    const rc = compileForm(roomForm({ role: 'environment', position: { x: 0, y: SY, z: 0 }, convergence: 0.42, opening: null, prominence: room }));
    wall = rc.anchors['writing-surface'] ?? wall;
    objs.push(...rc.objects);
  }
  if (name !== null) {
    objs.push(...letterformObjects({ text: name, role: 'name', position: wall, height: 0.62 * nameScale, tracking: 0.9, align: 'centre', erase }));
  }
  if (person) {
    objs.push(...compileForm(humanForm({ role: 'protagonist', position: person.at, scale: 1, pose: person.pose, widthBias: 1.9, prominence: person.prom })).objects);
  }
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

/**
 * THE FIGURE'S PLACEMENT, AND WHY IT IS x = -1.9 RATHER THAN -0.55.
 *
 * My cold pass through the blind study found the NAME **not clearly readable** where the figure overlaps
 * it, and the brief's TEST B names the condition: *"word and figure are spatially distinct"*.
 *
 * Measured, against a room whose normaliser couples every column (so the room had to be removed to get a
 * clean reading):
 *
 *   a 2.0-unit line     -> 23 cells   =>  11.5 cells per world unit
 *   a 0.9-unit line     -> 11 cells
 *   the figure at widthBias 1.9 -> ~12 cells
 *   `NAME` at height 0.62       -> ~11 cells
 *
 * A standing figure spans the frame VERTICALLY, so **vertical separation is impossible** — measured, the
 * name's 9 rows sit entirely inside the figure's 81 rows at every height tried. The separation must
 * therefore be LATERAL, and the centres must be at least (11 + 12) / 2 = **12 cells = ~1.0 world unit**
 * apart. The name is centred at x = 0, so the figure goes to **x = -1.9**, which puts their centres
 * 1.9 units apart with margin.
 *
 * This is a LAYOUT CONSTRAINT the form layer does not express: `subjectForms` carry positions and
 * anchors and NOTHING checks whether two forms collide, which is why the name ended up behind the figure
 * with no warning.
 */
const STILL = { x: -1.9, y: SY - 1.15, z: 0.5 };
const BEATS = [
  // the person exists alone, in a world that is not yet an environment
  { key: '1-person', label: 'A PERSON', args: { room: 0, person: { at: STILL, pose: 'stand', prom: 2.2 }, intent: 'normal' } },
  // an environment appears, and the name is written on its wall
  { key: '2-name', label: 'THE NAME APPEARS', args: { room: 0.6, name: 'NAME', person: { at: STILL, pose: 'stand', prom: 1.6 }, nameScale: 1.0 } },
  // the name is the subject: the room recedes, the name is weighted up
  { key: '3-name-subject', label: 'THE NAME AS SUBJECT', args: { room: 0.35, name: 'NAME', nameScale: 1.15, person: { at: STILL, pose: 'reach', prom: 1.4 } } },
  // erasure: the name goes, the person remains
  { key: '4-erasure', label: 'ERASURE', args: { room: 0.5, name: 'NAME', erase: 1, person: { at: STILL, pose: 'stand', prom: 2.0 } } },
  // loss: the environment is gone too and only the person is left
  { key: '5-loss', label: 'LOSS', args: { room: 0, person: { at: STILL, pose: 'stand', prom: 2.0 }, intent: 'preserve-darkness' } },
];

await mkdir(path.join(ROOT, 'out', 'phase31'), { recursive: true });
console.log('beat                    lit   totalInk   objects   resolution   composition audit');
let anyCollision = false;
for (const b of BEATS) {
  const film = beat(b.args);
  const f = renderFrameAscii(film, 0);
  const total = f.grid.cells.reduce((a, c) => a + c.ink, 0);
  /**
   * THE COMPOSITION IS AUDITED, NOT ASSUMED. `worldToCells` is the round-29 MEASUREMENT (11.5), passed in
   * rather than derived — an analytic derivation of it disagreed with two independent measurements.
   */
  const audit = auditFormComposition({
    forms: [
      ...(b.args.room > 0.001 ? [roomForm({ role: 'environment', position: { x: 0, y: SY, z: 0 }, prominence: b.args.room })] : []),
      ...(b.args.name !== null && b.args.name !== undefined ? [{ kind: 'word', role: 'name', position: { x: 0, y: SY + 0.27, z: 1 }, scale: 1, contour: { points: [] }, depth: 'flat', recognition: 'essential', anchors: [] }] : []),
      ...(b.args.person ? [humanForm({ role: 'protagonist', position: b.args.person.at, scale: 1, pose: b.args.person.pose, widthBias: 1.9, prominence: b.args.person.prom })] : []),
    ],
    cols: 240, rows: 120, worldToCells: 11.5,
  });
  if (audit.collisions.length) anyCollision = true;
  const verdict = audit.collisions.length
    ? 'COLLIDES ' + audit.collisions.map((c) => `${c.a}/${c.b} ${(c.fraction * 100).toFixed(0)}%`).join(', ')
    : audit.offscreen.length
      ? 'offscreen ' + audit.offscreen.map((o) => o.role).join(',')
      : 'clear';
  console.log(`  ${b.label.padEnd(22)} ${String(f.stats.litCells).padStart(5)} ${total.toFixed(0).padStart(10)} ${String(film.shots[0].layers[0].nativeObjects.length).padStart(9)}   ${W}x${H}   ${verdict}`);
  await writeFile(path.join(ROOT, 'out', 'phase31', `fn-${b.key}.png`), encodePng(raster(f.grid, W, H)));
}
if (anyCollision) console.log('\n  ⚠ at least one beat has a form drawn through another -- the marks will not read');
console.log('\nwrote 5 stills to out/phase31/fn-*.png at ' + W + 'x' + H);
