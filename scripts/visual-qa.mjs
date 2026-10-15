/**
 * VISUAL QA HARNESS.
 *
 * Phase 3 gate 10 requires "a visual QA harness with per-metric measurements and before/after
 * comparison". This is it.
 *
 * WHAT IT SOLVES. Every visual decision in this phase was judged by ad-hoc measurement scripts,
 * several of which were wrong in ways that cost whole rounds:
 *
 *   - a motion metric that fell automatically when an image dimmed, so "added a backdrop" looked
 *     like "the film stopped moving" (rounds 13-16);
 *   - clip windows hardcoded to the wrong shot, so ninety frames of a STATIC camera were measured
 *     and motion was declared dead (rounds 28-29);
 *   - three separate measurements taken from a stale `grid.bin` (rounds 8, 14).
 *
 * A harness makes those mistakes visible rather than invisible: it records WHICH films, WHICH frames
 * and WHICH build produced every number, and it refuses to compare runs whose inputs differ.
 *
 * USAGE
 *   node scripts/visual-qa.mjs capture <label>      write out/visual-qa/<label>.json
 *   node scripts/visual-qa.mjs compare <a> <b>      per-metric deltas, with verdicts
 *   node scripts/visual-qa.mjs list                 available captures
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const QA = path.join(ROOT, 'out', 'visual-qa');
// Point the harness at any corpus, so a controlled A/B is possible: render the same films with one
// variable changed into a second directory and compare. Without this, a change can only be compared
// against the LAST capture of the CURRENT corpus, which cannot isolate anything.
const BENCH = process.env.VISUAL_QA_BENCH
  ? path.resolve(ROOT, process.env.VISUAL_QA_BENCH)
  : path.join(ROOT, 'out', 'benchmarks');
const FILMS = ['desire', 'forgotten-name', 'disappearing-room', 'time'];
const FPS = 30;

const { decodeGridSequence } = await import(path.join(ROOT, 'dist', 'src', 'render', 'gridbin.js'));
const { renderFrameAscii } = await import(path.join(ROOT, 'dist', 'src', 'render', 'render.js'));
const { GLYPH_BY_CODE } = await import(path.join(ROOT, 'dist', 'src', 'glyphs', 'atlas.js'));

/**
 * GLYPH-LEVEL METRICS, added because a whole class of change was invisible without them.
 *
 * Round 40 turned on combined-score glyph selection on the CPU path — brightness AND edge magnitude
 * deciding the character. Every aggregate this harness measured came back BYTE-IDENTICAL across all
 * four films: lit cells, mean ink, near-white share, midtone share. The change was real (1,417 cells
 * per frame moved to heavier glyphs) and the harness could not see any of it.
 *
 * The reason is that the change is a REDISTRIBUTION. `inkToDisplayByte` derives the drawn brightness
 * from the glyph's own coverage, so swapping a cell from `.` to `#` changes which CHARACTER is drawn
 * while leaving total ink fixed. Any metric built on luminance is therefore blind to it — and the
 * Phase 3 brief's Gate 3 is specifically about which character is chosen.
 *
 * These three metrics close that hole:
 *   meanGlyphCoverage   the average ink of the CHOSEN characters; rises when selection goes heavier
 *   heavyShare          share drawn from the heaviest quarter of the typeface
 *   glyphEntropy        how evenly the character set is used; falls when a few marks dominate
 */
function glyphStats(seq) {
  let n = 0;
  let covSum = 0;
  let heavy = 0;
  const hist = new Map();
  const coverages = [];
  for (const g of Object.values(GLYPH_BY_CODE)) if (g && g.coverage > 0) coverages.push(g.coverage);
  coverages.sort((a, b) => a - b);
  const heavyFloor = coverages.length ? coverages[Math.floor(coverages.length * 0.75)] : 0;
  for (let i = 0; i < seq.codes.length; i++) {
    const code = seq.codes[i];
    if (code <= 32) continue;
    const g = GLYPH_BY_CODE[code];
    const cov = g ? g.coverage : 0;
    n++;
    covSum += cov;
    if (cov >= heavyFloor) heavy++;
    hist.set(code, (hist.get(code) ?? 0) + 1);
  }
  let entropy = 0;
  if (n > 0) {
    for (const count of hist.values()) {
      const p = count / n;
      entropy -= p * Math.log2(p);
    }
  }
  return {
    meanGlyphCoverage: n ? covSum / n : 0,
    heavyShare: n ? heavy / n : 0,
    glyphEntropy: entropy,
    glyphHistogram: [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([code, count]) => `${String.fromCharCode(code)}:${count}`).join(' '),
  };
}

/** Characters that read as STRUCTURE rather than as texture. */
const STRUCTURAL = new Set('-|+/\\'.split('').map((c) => c.charCodeAt(0)));

/** Which shot actually carries a camera move — never assume shot 2. */
function cameraShotOf(spec) {
  const s = (spec.shots || []).find((x) => x.camera?.kind && x.camera.kind !== 'static');
  return s ?? spec.shots?.[0];
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** Every metric, with the frame and shot each was taken from recorded alongside it. */
async function measureFilm(name) {
  const gridPath = path.join(BENCH, name, 'grid.bin');
  const bytes = new Uint8Array(await readFile(gridPath));
  const seq = decodeGridSequence(bytes);
  const cells = seq.cols * seq.rows;

  // ---- whole-corpus ink statistics -----------------------------------------
  let lit = 0, sumInk = 0, nearWhite = 0, mid = 0, structural = 0, blank = 0;
  const glyphUse = new Map();
  for (let i = 0; i < seq.values.length; i++) {
    const code = seq.codes[i];
    if (code <= 32) { blank++; continue; }
    const v = seq.values[i];
    lit++;
    sumInk += v;
    if (v >= 240) nearWhite++;
    if (v >= 64 && v < 192) mid++;
    if (STRUCTURAL.has(code)) structural++;
    glyphUse.set(code, (glyphUse.get(code) ?? 0) + 1);
  }

  // ---- spatial extent of marks, per frame ---------------------------------
  const rowsOccupied = [];
  for (let f = 0; f < seq.frameCount; f += 10) {
    const occ = new Set();
    for (let y = 0; y < seq.rows; y++) {
      for (let x = 0; x < seq.cols; x++) {
        if (seq.codes[f * cells + y * seq.cols + x] > 32) { occ.add(y); break; }
      }
    }
    rowsOccupied.push(occ.size);
  }

  // ---- camera-move response, on the CORRECT shot --------------------------
  const spec = JSON.parse(await readFile(path.join(BENCH, name, 'film-spec.json'), 'utf8'));
  const camShot = cameraShotOf(spec);
  const camFrom = Math.round((camShot.start ?? 0) * FPS);
  const camSpan = Math.min(90, Math.max(1, Math.round((camShot.duration ?? 3) * FPS) - 1));
  /**
   * CAMERA RESPONSE, MEASURED ALONG THE PATH RATHER THAN END TO END.
   *
   * The first version of this compared only the FIRST and LAST frame of the move. That cannot see a
   * change of EASING, and the reason is structural rather than incidental: every easing satisfies
   * `f(0)=0` and `f(1)=1`, so the endpoints of a move are IDENTICAL whatever curve drives it. An
   * entire motion-language rollout measured as zero change — byte-identical metrics on all four
   * films — because the measurement only looked at the two frames the easing is guaranteed not to
   * move.
   *
   * The path is what an easing changes, so the path is what gets measured: ink at each of
   * `PATH_SAMPLES` points across the move, from which three separate figures follow.
   *
   *   endpoint   how much the image differs from start to finish — does the move arrive anywhere
   *   path       mean difference between CONSECUTIVE samples — is there motion to watch
   *   peak       the largest single-step difference — is there a moment that reads
   *
   * `path` is the one that responds to easing: an easeIn curve concentrates its travel late, an
   * easeOut concentrates it early, and a curve with anticipation has a visible reverse at the start.
   */
  const PATH_SAMPLES = 8;
  const pathFrames = [];
  for (let k = 0; k <= PATH_SAMPLES; k++) {
    pathFrames.push(renderFrameAscii(spec, camFrom + Math.round((camSpan * k) / PATH_SAMPLES)));
  }
  let motionInk = 0, motionChanged = 0, motionSamples = 0;
  {
    const ca = pathFrames[0].grid.cells;
    const cb = pathFrames[pathFrames.length - 1].grid.cells;
    let changed = 0;
    for (let i = 0; i < ca.length; i++) {
      const d = Math.abs(Math.round(ca[i].ink * 255) - Math.round(cb[i].ink * 255));
      motionInk += d;
      if (d > 16 || ca[i].code !== cb[i].code) changed++;
      motionSamples++;
    }
    motionInk /= motionSamples;
    motionChanged = changed / motionSamples;
  }
  let pathInk = 0, pathChanged = 0, pathPeak = 0, pathSteps = 0;
  for (let k = 1; k < pathFrames.length; k++) {
    const ca = pathFrames[k - 1].grid.cells;
    const cb = pathFrames[k].grid.cells;
    let step = 0, changed = 0;
    for (let i = 0; i < ca.length; i++) {
      const d = Math.abs(Math.round(ca[i].ink * 255) - Math.round(cb[i].ink * 255));
      step += d;
      if (d > 16 || ca[i].code !== cb[i].code) changed++;
    }
    step /= ca.length;
    const chShare = changed / ca.length;
    pathInk += step;
    pathChanged += chShare;
    pathPeak = Math.max(pathPeak, step);
    pathSteps++;
  }
  pathInk /= Math.max(1, pathSteps);
  pathChanged /= Math.max(1, pathSteps);

  const inks = [];
  for (let i = 0; i < seq.values.length; i++) if (seq.codes[i] > 32) inks.push(seq.values[i]);
  inks.sort((x, y) => x - y);

  const gs = glyphStats(seq);

  return {
    grid: { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), frames: seq.frameCount, cols: seq.cols, rows: seq.rows },
    // recorded so a comparison can refuse to compare different films
    measuredWindow: { cameraShot: camShot.id, cameraKind: camShot.camera?.kind, fromFrame: camFrom, toFrame: camFrom + camSpan },
    metrics: {
      litCells: lit,
      coverage: lit / seq.values.length,
      meanInk: lit ? sumInk / lit : 0,
      nearWhiteShare: lit ? nearWhite / lit : 0,
      midtoneShare: lit ? mid / lit : 0,
      structuralShare: lit ? structural / lit : 0,
      distinctGlyphs: glyphUse.size,
      inkP10: percentile(inks, 0.1),
      inkP50: percentile(inks, 0.5),
      inkP90: percentile(inks, 0.9),
      meanRowsOccupied: rowsOccupied.reduce((a, b) => a + b, 0) / Math.max(1, rowsOccupied.length),
      // glyph-level: the quantities a glyph-SELECTION change moves and a luminance metric cannot
      meanGlyphCoverage: gs.meanGlyphCoverage,
      heavyShare: gs.heavyShare,
      glyphEntropy: gs.glyphEntropy,
      glyphHistogram: gs.glyphHistogram,
      cameraInkDiff: motionInk,
      cameraChangedShare: motionChanged,
      // path metrics: these are what respond to a change of easing
      pathInkDiff: pathInk,
      pathChangedShare: pathChanged,
      pathPeakInkDiff: pathPeak,
    },
  };
}

const cmd = process.argv[2] ?? 'help';

if (cmd === 'capture') {
  const label = process.argv[3] ?? `run-${Date.now()}`;
  await mkdir(QA, { recursive: true });
  const films = {};
  for (const name of FILMS) {
    try {
      films[name] = await measureFilm(name);
    } catch (e) {
      films[name] = { error: String(e).slice(0, 200) };
    }
  }
  const capture = {
    label,
    takenAt: new Date().toISOString(),
    sourceFingerprint: createHash('sha256')
      .update(await readFile(path.join(ROOT, 'package.json')))
      .digest('hex')
      .slice(0, 16),
    films,
  };
  const file = path.join(QA, `${label}.json`);
  await writeFile(file, JSON.stringify(capture, null, 2));
  console.log(`captured ${label} -> ${path.relative(ROOT, file)}`);
  for (const [n, f] of Object.entries(films)) {
    if (f.error) { console.log(`  ${n.padEnd(20)} ERROR ${f.error}`); continue; }
    const m = f.metrics;
    console.log(`    top glyphs: ${f.metrics.glyphHistogram ?? f.glyphHistogram ?? "-"}`);
    console.log(
      `  ${n.padEnd(20)} ink ${m.meanInk.toFixed(1).padStart(5)}  mid ${(m.midtoneShare * 100).toFixed(1).padStart(5)}%  rows ${m.meanRowsOccupied.toFixed(0).padStart(3)}  glyphCov ${m.meanGlyphCoverage.toFixed(2).padStart(5)}  heavy ${(m.heavyShare * 100).toFixed(1).padStart(5)}%  camEnd ${(m.cameraChangedShare * 100).toFixed(2).padStart(6)}%`,
    );
  }
} else if (cmd === 'compare') {
  const [, , , aLabel, bLabel] = process.argv;
  if (!aLabel || !bLabel) { console.error('usage: compare <a> <b>'); process.exit(2); }
  const a = JSON.parse(await readFile(path.join(QA, `${aLabel}.json`), 'utf8'));
  const b = JSON.parse(await readFile(path.join(QA, `${bLabel}.json`), 'utf8'));

  // REFUSE to compare runs whose inputs differ — this is the harness's core protection
  let refused = false;
  for (const name of Object.keys(a.films)) {
    const fa = a.films[name], fb = b.films[name];
    if (!fb || fa.error || fb.error) continue;
    const wa = fa.measuredWindow, wb = fb.measuredWindow;
    if (wa.cameraShot !== wb.cameraShot || wa.cameraKind !== wb.cameraKind) {
      console.error(`REFUSING: ${name} measured different shots (${wa.cameraShot}/${wa.cameraKind} vs ${wb.cameraShot}/${wb.cameraKind})`);
      refused = true;
    }
  }
  if (refused) process.exit(1);

  console.log(`compare  ${a.label}  ->  ${b.label}\n`);
  const KEYS = Object.keys(a.films[FILMS[0]].metrics);
  const HIGHER_IS_BETTER = { meanInk: null, midtoneShare: true, structuralShare: true, distinctGlyphs: true, meanRowsOccupied: true, cameraChangedShare: true, pathChangedShare: true, pathInkDiff: true, pathPeakInkDiff: true, nearWhiteShare: false, meanGlyphCoverage: null, heavyShare: null, glyphEntropy: null, cameraInkDiff: null, coverage: null, litCells: null, inkP10: null, inkP50: null, inkP90: null };
  for (const name of FILMS) {
    const fa = a.films[name], fb = b.films[name];
    if (!fa || !fb || fa.error || fb.error) { console.log(`${name}: skipped`); continue; }
    console.log(name);
    for (const k of KEYS) {
      const va = fa.metrics[k], vb = fb.metrics[k];
      if (va === vb) continue;
      const pct = va === 0 ? Infinity : ((vb - va) / Math.abs(va)) * 100;
      const dir = HIGHER_IS_BETTER[k];
      let verdict = '  ';
      if (dir === true) verdict = vb > va ? ' +' : ' -';
      else if (dir === false) verdict = vb < va ? ' +' : ' -';
      const unit = k.endsWith('Share') ? '%' : '';
      const mul = unit ? 100 : 1;
      console.log(`  ${verdict} ${k.padEnd(19)} ${(va * mul).toFixed(unit ? 1 : 1)}${unit} -> ${(vb * mul).toFixed(unit ? 1 : 1)}${unit}  (${Number.isFinite(pct) ? (pct >= 0 ? '+' : '') + pct.toFixed(1) : 'n/a'}%)`);
    }
    console.log('');
  }
  console.log('  + better   - worse   (blank = no direction defined; judge by eye)');
} else if (cmd === 'list') {
  try {
    const files = (await readdir(QA)).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const c = JSON.parse(await readFile(path.join(QA, f), 'utf8'));
      console.log(`  ${c.label.padEnd(28)} ${c.takenAt}`);
    }
  } catch { console.log('  (no captures yet)'); }
} else {
  console.log('visual QA harness\n  capture <label>     measure the corpus into out/visual-qa/<label>.json\n  compare <a> <b>     per-metric deltas with a refusal to compare different shots\n  list                available captures');
}
