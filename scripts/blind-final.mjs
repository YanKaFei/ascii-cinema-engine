/**
 * BLIND STUDY — FINAL, rendered through the FORM pipeline only.
 *
 *   SubjectForm.text -> wordForm -> compileForm -> SceneIR -> renderer
 *
 * THIS SCRIPT CALLS `letterformObjects` NOWHERE. Every word is a `wordForm({ text })` inside a
 * `subjectForms` array, compiled by `compileScene`. That is asserted below, by reading this file.
 *
 *   node scripts/blind-final.mjs
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTDIR = path.join(ROOT, 'out', 'phase31', 'blind-final');
const F = await import(path.join(ROOT, 'dist', 'src', 'director', 'grammar', 'forms.js'));
const { renderFrameAscii } = await import(path.join(ROOT, 'dist', 'src', 'render', 'render.js'));
const { promptToFilmSpec } = await import(path.join(ROOT, 'dist', 'src', 'domain', 'planner.js'));
const { compileScene } = await import(path.join(ROOT, 'dist', 'src', 'scene', 'scene.js'));
const { encodePng } = await import(path.join(ROOT, 'dist', 'src', 'render', 'png.js'));
const { inkToDisplayByte } = await import(path.join(ROOT, 'dist', 'src', 'render', 'tone.js'));
const { GLYPH_BY_CODE, GLYPH_W, GLYPH_H } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

const W = 1920, H = 1080;
const SY = 1.05;
const N = { octaves: 0, frequency: 0, amplitude: 0, lacunarity: 0, gain: 0, drift: 0 };
const base = promptToFilmSpec('film', { durationInSeconds: 20, fps: 30, width: 1920, height: 1080, quality: 'draft' });

const FIG = { x: -1.9, y: SY - 1.15, z: 0.5 };

/** One beat, expressed ENTIRELY as SubjectForms. */
function formsFor(b) {
  const forms = [];
  if (b.room > 0.001) {
    forms.push(F.roomForm({ role: 'environment', position: { x: 0, y: SY, z: 0 }, convergence: 0.42, opening: null, prominence: b.room }));
  }
  if (b.name) {
    const wall = { x: 0, y: SY + 0.27, z: 1 };
    const wf = F.wordForm({ text: b.name, role: 'name', position: wall, scale: b.nameScale ?? 1 });
    if (b.erase) wf.erase = b.erase;
    forms.push(wf);
  }
  if (b.person) {
    forms.push(F.humanForm({ role: 'protagonist', position: FIG, scale: 1, pose: b.pose ?? 'stand', widthBias: 1.9, prominence: b.prom }));
  }
  return forms;
}

/** A film whose layer carries subjectForms — NO nativeObjects anywhere. */
function filmFor(b) {
  return {
    ...base,
    shots: [{
      ...base.shots[0], id: '01', start: 0, duration: 3,
      density: { coverageMinStart: 2, coverageMinEnd: 2, coverageMaxStart: 20, coverageMaxEnd: 20 },
      raster: { fieldNormalise: true, exposureIntent: b.intent ?? 'normal' },
      transitionIn: { kind: 'cut', duration: 0 },
      camera: { ...base.shots[0].camera, kind: 'static', focusDistance: 2.4, dollyAmount: 0, panAmount: 0, yawAmount: 0, jitter: 0 },
      layers: [{
        id: 'world', kind: 'particle-field', shape: 'none', count: 1,
        bounds: { x: 0, y: 0, z: 0 }, offsetY: 0, glyphRadius: 1.2, intensity: 1,
        variation: 0, depthBias: 0, depth: 'flat', focus: 1.8, noise: N,
        transform: 'none', role: 'environment',
        subjectForms: formsFor(b),
      }],
    }],
    durationInSeconds: 3,
  };
}

const BEATS = [
  { key: 'a', room: 0,    person: true, prom: 2.2, name: null },
  { key: 'b', room: 0.6,  person: true, prom: 1.6, name: 'NAME', nameScale: 1.0 },
  { key: 'c', room: 0.35, person: true, prom: 1.4, name: 'NAME', nameScale: 1.15, pose: 'reach' },
  { key: 'd', room: 0.5,  person: true, prom: 2.0, name: 'NAME', erase: 1 },
  { key: 'e', room: 0,    person: true, prom: 2.0, name: null, intent: 'preserve-darkness' },
  { key: 'f', room: 0.5,  person: false, name: null },
  // NOTE: this beat previously duplicated beat 'd' (room 0.5, erase 1) and produced a BYTE-IDENTICAL
  // still. Eight stills in which two are the same wastes an inspector's attention, so this one is a
  // PARTIAL erasure -- a distinct state the pipeline supports and none of the others show.
  { key: 'g', room: 0.5,  person: true, prom: 2.0, name: 'NAME', erase: 0.5 },
  { key: 'h', room: 0,    person: false, name: null, intent: 'preserve-emptiness' },
];

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

// ---- verification accumulators ---------------------------------------------
const checks = [];
const ok = (cond, label, detail = '') => { checks.push({ pass: !!cond, label, detail }); };

// (1) this script must not author letterforms out of band
{
  const self = await readFile(new URL(import.meta.url));
  const src = self.toString();
  const calls = (src.match(/letterformObjects\s*\(/g) ?? []).length;
  ok(calls === 0, 'no out-of-band letterformObjects authoring in this script', `occurrences: ${calls}`);
  const usesForms = /subjectForms\s*:/.test(src);
  ok(usesForms, 'every layer is authored via subjectForms');
  const noNative = !/nativeObjects\s*:/.test(src);
  ok(noNative, 'no nativeObjects anywhere -- the form path is the only path');
}

// (2) wordForm must compile to real objects
{
  const wf = F.wordForm({ text: 'NAME', role: 'name', position: { x: 0, y: 1.32, z: 1 } });
  const n = F.compileForm(wf).objects.length;
  ok(n > 0, 'wordForm({text}) compiles to more than 0 objects', `objects: ${n}`);
  const wfNoText = F.wordForm({ text: '', role: 'name', position: { x: 0, y: 1.32, z: 1 } });
  ok(F.compileForm(wfNoText).objects.length === 0, 'and a wordForm with no text compiles to 0 (the field is doing the work)');
}

await rm(OUTDIR, { recursive: true, force: true });
await mkdir(OUTDIR, { recursive: true });

// deterministic shuffle over the eight beats
const order = [...BEATS.keys()];
{
  let s = 20260101;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
}

const key = [];
const rows = [];
for (let n = 0; n < order.length; n++) {
  const b = BEATS[order[n]];
  const forms = formsFor(b);

  // (3) the collision audit is really called, on every beat
  const audit = F.auditFormComposition({ forms, cols: 240, rows: 120, worldToCells: 11.5 });
  ok(audit.collisions.length === 0, `composition audit PASS for beat ${b.key}`, audit.collisions.map((c) => `${c.a}/${c.b} ${(c.fraction * 100).toFixed(0)}%`).join(', '));

  const film = filmFor(b);
  // (4) the form path must produce primitives through the SCENE COMPILER
  const scene = compileScene(film, film.shots[0]);
  const prims = scene.layers[0]?.prims.length ?? 0;
  ok(prims > 0, `compileScene produced primitives for beat ${b.key}`, `prims: ${prims}`);

  const frame = renderFrameAscii(film, 0);
  const name = `still-${String(n + 1).padStart(2, '0')}.png`;
  const png = encodePng(raster(frame.grid, W, H));
  await writeFile(path.join(OUTDIR, name), png);

  const sha = createHash('sha256').update(png).digest('hex');
  key.push({ still: name, beat: b.key, description: describe(b), width: W, height: H, sha256: sha, primitives: prims });
  rows.push({ name, sha, lit: frame.stats.litCells });
}

function describe(b) {
  if (b.room === 0 && b.person && !b.name) return b.intent === 'preserve-darkness' ? 'a person alone, environment gone' : 'a person alone';
  if (b.room === 0 && !b.person) return 'an intentional void';
  if (!b.person && !b.name) return 'an empty room';
  if (b.person && b.name && b.erase) return 'a room and a person, the name erased';
  if (b.person && b.name) return 'a room, a name on its wall, and a figure';
  if (b.name) return 'a room with a name written on its wall';
  return 'a room';
}

// (4b) all eight stills must be DISTINCT -- two identical images waste an inspector's attention
{
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.sha)) ok(false, `still ${r.name} is byte-identical to ${seen.get(r.sha)}`);
    else seen.set(r.sha, r.name);
  }
  ok(seen.size === rows.length, 'all eight stills are distinct', `unique: ${seen.size}/${rows.length}`);
}

// (5) every still must decode at exactly 1920x1080
for (const r of rows) {
  const buf = await readFile(path.join(OUTDIR, r.name));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  ok(w === 1920 && h === 1080, `resolution 1920x1080 for ${r.name}`, `${w}x${h}`);
}

await writeFile(path.join(OUTDIR, 'ANSWER-KEY.json'), JSON.stringify({
  note: 'Do NOT open before rating. Every still was rendered through SubjectForm.text -> wordForm -> compileForm -> SceneIR -> renderer.',
  resolution: '1920x1080', glyphSubpixel: '1.60 x 1.00 px', renderer: 'CPU reference, out-of-band authoring: none',
  key,
}, null, 2));

// ---- report ----------------------------------------------------------------
console.log('BLIND STUDY READY\n');
for (const r of rows) console.log(`  out/phase31/blind-final/${r.name}   sha256 ${r.sha}   lit ${r.lit} cells`);
console.log(`  out/phase31/blind-final/ANSWER-KEY.json\n`);

const failed = checks.filter((c) => !c.pass);
console.log(`pipeline verification: ${checks.length - failed.length}/${checks.length} checks pass`);
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.label}${c.detail ? `  (${c.detail})` : ''}`);
if (failed.length) { console.log('\nFAILED CHECKS PRESENT'); process.exitCode = 1; }
