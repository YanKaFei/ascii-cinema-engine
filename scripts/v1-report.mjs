/** PHASE V1 — contact sheet, camera/composition comparison, ASCII material analysis. */
import { writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'v1');
const { encodePng } = await import(path.join(ROOT, 'dist/src/render/png.js'));
const { decodeWav } = await import(path.join(ROOT, 'dist/src/audio/wav.js'));

// ---- VISUAL QUALITY AUDIT: the V2 measurements, recorded ----------------
const audit = JSON.parse(await readFile(path.join(OUT, 'v2-audit.json'), 'utf8'));
const metrics = JSON.parse(await readFile(path.join(OUT, 'study-metrics.json'), 'utf8'));
const studies = ['study-A-kinetic-typographic-sculpture', 'study-B-cinematic-ascii-space', 'study-C-glyph-field-transformation'];

/** ---- CONTACT SHEET: sample frames from each study, labelled, in one image ---- */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);
const FF = path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64/ffmpeg');
const LIB = path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64');
const TMP = path.join(OUT, '.contact');
const { mkdir, rm } = await import('node:fs/promises');
await rm(TMP, { recursive: true, force: true }); await mkdir(TMP, { recursive: true });

/**
 * ⚠ THE CONTACT SHEET IS COMPOSED IN CODE, not by an ffmpeg filter.
 * The bundled ffmpeg **has no filter support at all** (a known limitation of this toolchain), so a `tile`
 * graph cannot be used. Frames are extracted, then composited by direct pixel copy.
 */
const readPng = async (p) => {
  const { stdout } = await pexec(path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64/ffmpeg'), ['-v','error','-i',p,'-f','image2pipe','-vcodec','png','-'], { encoding: 'buffer', maxBuffer: 1<<28, env: { ...process.env, DYLD_LIBRARY_PATH: LIB } });
  return stdout;
};
/** a minimal PNG reader/writer is not needed: the frames are composited as RAW by decoding to BMP-free RGBA via ffmpeg */
import { createHash as ch } from 'node:crypto';
const dirFor = (s) => path.join(TMP, s);
const COLS = 3, ROWS = 3, CW = 640, CH = 360;
const sheet = { width: CW * COLS, height: CH * ROWS, data: Buffer.alloc(CW * COLS * CH * ROWS * 3, 8) };
const labels = [];
for (let si = 0; si < studies.length; si++) {
  const d = dirFor(studies[si]); await mkdir(d, { recursive: true });
  const src = path.join(OUT, 'studies', `${studies[si]}.mp4`);
  await pexec(FF, ['-y','-hide_banner','-loglevel','error','-i',src,'-vf','scale=640:360','-frames:v','90', path.join(d,'f%03d.png')], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } }).catch(async () => {
    /** no filter support: extract full size and we will not scale */
    await pexec(FF, ['-y','-hide_banner','-loglevel','error','-i',src,'-frames:v','90', path.join(d,'f%03d.png')], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } });
  });
  const files = (await readdir(d)).filter((f) => f.endsWith('.png')).sort();
  const picks = [0, Math.floor(files.length / 2), files.length - 1];
  for (let k = 0; k < 3; k++) {
    const p = path.join(d, files[picks[k]] ?? files[0]);
    /** decode to raw rgb24 through ffmpeg, then blit */
    const { stdout } = await pexec(FF, ['-v','error','-i',p,'-vf',`scale=${CW}:${CH}`,'-f','rawvideo','-pix_fmt','rgb24','-'], { encoding:'buffer', maxBuffer: 1<<28, env:{...process.env, DYLD_LIBRARY_PATH: LIB} }).catch(async () => ({ stdout: Buffer.alloc(0) }));
    if (stdout.length < CW * CH * 3) { labels.push({ study: studies[si], frame: picks[k], note: 'scale filter unavailable; frame not blitted' }); continue; }
    const row = si, col = k;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const s = (y * CW + x) * 3, d2 = (((row * CH + y) * CW * COLS) + (col * CW + x)) * 3;
      sheet.data[d2] = stdout[s]; sheet.data[d2+1] = stdout[s+1]; sheet.data[d2+2] = stdout[s+2];
    }
    labels.push({ study: studies[si], frame: picks[k], row, col });
  }
}
const sheetOk = labels.filter((l) => !l.note).length;
if (sheetOk > 0) await writeFile(path.join(OUT, 'visual-contact-sheet.png'), encodePng(sheet));
console.log(`  visual-contact-sheet.png: ${sheetOk}/9 cells blitted (ffmpeg here has NO filter support, so scaling may be unavailable)`);

/** ---- ASCII MATERIAL ANALYSIS ---- */
await writeFile(path.join(OUT, 'ascii-material-analysis.json'), JSON.stringify({
  question: 'is ASCII acting as a MATERIAL, or as a uniform filter applied to everything?',
  v2Measurement: audit.material,
  studyMeasurement: metrics.samples.map((s) => ({ study: s.study, frame: s.frame, inkCoverage: s.inkCoverage, distinctGlyphs: s.glyphs?.distinct, familyCensus: s.glyphs?.byFamily, materialCensus: s.census })),
  mechanisms: {
    glyphFamilies: 'six families (architecture, figure, text, atmosphere, accent, detail) draw from DIFFERENT alphabets, so a material is recognisable by its characters, not only by position',
    depthBuffer: 'a nearer material occludes a farther one, so foreground/middle/background are genuinely separate rather than painted in array order',
    characterTopology: 'the figure and limbs are emitted as CONTOURS with a graded interior, so local form chooses the glyph instead of one repeated fill character',
    filledCells: 'a glyph pixel becomes a FILLED rectangle across its cell range, so a letterform is solid rather than dotted — measured as the fix that made study C legible',
  },
  v2DefectsFound: [
    'the figure was a uniform solid block of "#" with no interior structure',
    'every architectural plane was filled edge-to-edge with the same +/* texture, so no plane had identity',
    'the NAME carried no more graphic weight than the wall behind it, and was barely legible',
    'all five shots shared x=0, target=(0,EYE_Y,0), focal=0.9, camZ within 0.15 — so no camera choice existed',
    'ink coverage was 0.0398 +/- 0.0008 for frames 0-380, i.e. 79% of the film at constant ink',
  ],
}, null, 2));
console.log('  ascii-material-analysis.json written');

/** ---- CAMERA / COMPOSITION COMPARISON ---- */
const cam = JSON.parse(await readFile(path.join(OUT, 'camera-comparison.json'), 'utf8'));
console.log('  camera-comparison.json (written by the study runner)');
