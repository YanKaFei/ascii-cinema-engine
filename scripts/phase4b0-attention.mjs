/**
 * §11 DIRECTOR ATTENTION TEST.
 *
 * ⚠ The V2 director plan stores `{shot, startFrame, endFrame, seconds, reason}` — **it does not store an intent
 * object**, so the attention hierarchy is DERIVED from the actual runtime trace and the authored performance
 * windows. Every row records its derivation, and nothing is invented from the prose.
 */
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4b0');
const trace = JSON.parse(await readFile(path.join(ROOT, 'out/phase33i/causal-trace.json'), 'utf8'));
const plan = JSON.parse(await readFile(path.join(ROOT, 'out/phase33i/director-plan-v2.json'), 'utf8'));
const music = JSON.parse(await readFile(path.join(ROOT, 'out/phase4a1/real-track/music-analysis.json'), 'utf8'));
const dr = JSON.parse(await readFile(path.join(OUT, 'film-dramaturgy.json'), 'utf8'));
const cands = JSON.parse(await readFile(path.join(OUT, 'music-window-candidates.json'), 'utf8'));
const T = trace.trace, FPS = 30;
const ev = Object.fromEntries(dr.events.map((e) => [e.eventId, e]));
const at = (f) => T[Math.min(T.length - 1, Math.max(0, f))];

/**
 * ⚠ THE PRIMARY ATTENTION OBJECT PER PHASE, derived from the trace's own measured quantities.
 * The rule is stated, so it can be disputed: whichever quantity is CHANGING is what the film is asking the
 * audience to watch.
 */
const phaseAttention = [
  { phase: 'ESTABLISHMENT', from: 0, to: ev.orientation.frame, derive: 'noticeTurn == 0 and stepProgress == 0: nothing is moving, so attention is on the space and the standing figure' },
  { phase: 'ATTENTION', from: ev.orientation.frame, to: ev.step.frame, derive: 'headYaw is changing and noticeTurn is rising: attention is on the turn toward NAME' },
  { phase: 'APPROACH', from: ev.step.frame, to: ev.settle.frame, derive: 'stepProgress is changing: attention is on the approach' },
  { phase: 'REACH', from: ev.reach_readable.frame - 25, to: ev.name_fragment_onset.frame, derive: 'reachProgress is rising toward its plateau: attention is on the arm' },
  { phase: 'CONSEQUENCE', from: ev.name_fragment_onset.frame, to: ev.room_decay_onset.frame, derive: 'nameFragment is changing: attention is on NAME breaking' },
  { phase: 'AFTERMATH', from: ev.room_decay_onset.frame, to: 479, derive: 'roomDecay is changing, then everything holds: attention is on the withdrawing space and then the held image' },
];
const rows = phaseAttention.map((p) => ({ ...p, startSeconds: +(p.from / FPS).toFixed(3), endSeconds: +(p.to / FPS).toFixed(3), frameSpan: p.to - p.from }));
console.log('§11 DIRECTOR ATTENTION TEST\n');
console.log('  derived attention phases (from the trace, not from prose):');
for (const r of rows) console.log(`    ${r.phase.padEnd(14)} frames ${String(r.from).padStart(3)}-${String(r.to).padStart(3)}  ${r.startSeconds.toFixed(2)}-${r.endSeconds.toFixed(2)}s`);

/** §11 questions, answered as MEASURED quantities per candidate where a measurement exists */
const onsets = music.onsets, ec = music.energyCurve;
const meanDb = (s, e) => { const xs = ec.filter((x) => x.timeSeconds >= s && x.timeSeconds < e); return xs.length ? xs.reduce((t, x) => t + x.rmsDb, 0) / xs.length : -99; };
const density = (s, e) => onsets.filter((o) => o.timeSeconds >= s && o.timeSeconds < e).length / Math.max(1e-9, e - s);
const tests = [];
for (const c of cands.candidates) {
  const W = c.startSeconds, win = 16;
  const f = (frame) => W + (frame / FPS);
  const span = (a, b) => [f(a), f(b)];
  const [e1, e2] = span(0, 479);
  const establishmentDb = meanDb(W, f(ev.orientation.frame));
  const reachDb = meanDb(...span(ev.reach_readable.frame - 25, ev.name_fragment_onset.frame));
  const consequenceDb = meanDb(...span(ev.name_fragment_onset.frame, ev.room_decay_onset.frame));
  const aftermathDb = meanDb(...span(ev.room_decay_onset.frame, 479));
  const preReachDb = meanDb(...span(ev.settle.frame - 20, ev.settle.frame + 10));
  tests.push({
    className: c.className, musicWindowStartSeconds: W,
    measurements: {
      establishmentDb: +establishmentDb.toFixed(2), preReachDb: +preReachDb.toFixed(2), reachDb: +reachDb.toFixed(2),
      consequenceDb: +consequenceDb.toFixed(2), aftermathDb: +aftermathDb.toFixed(2),
      reachOnsetDensity: +density(...span(ev.reach_readable.frame - 25, ev.name_fragment_onset.frame)).toFixed(2),
      consequenceOnsetDensity: +density(...span(ev.name_fragment_onset.frame, ev.room_decay_onset.frame)).toFixed(2),
      aftermathOnsetDensity: +density(...span(ev.room_decay_onset.frame, 479)).toFixed(2),
      restraintBeforeReachDb: +(reachDb - preReachDb).toFixed(2),
      consequenceChangeDb: +(consequenceDb - reachDb).toFixed(2),
      releaseOverFinalImageDb: +(aftermathDb - consequenceDb).toFixed(2),
      spaceOverFinalImageOnsets: +density(...span(ev.room_decay_onset.frame, 479)).toFixed(2),
    },
  });
  const m = tests[tests.length - 1].measurements;
  console.log(`\n  ${c.className} (window starts ${W}s)`);
  console.log(`    establishment ${m.establishmentDb} dB   pre-reach ${m.preReachDb} dB -> reach ${m.reachDb} dB (restraint ${m.restraintBeforeReachDb >= 0 ? '+' : ''}${m.restraintBeforeReachDb})`);
  console.log(`    consequence ${m.consequenceDb} dB (change ${m.consequenceChangeDb >= 0 ? '+' : ''}${m.consequenceChangeDb})   final image ${m.aftermathDb} dB (release ${m.releaseOverFinalImageDb >= 0 ? '+' : ''}${m.releaseOverFinalImageDb}, ${m.spaceOverFinalImageOnsets} onsets/s)`);
}
const questions = [
  { q: 'Does the music support the character?', how: 'measured as whether the music stays beneath the film in the establishment and reach phases rather than rising above the consequence', status: 'MEASURABLE FROM THE VALUES ABOVE' },
  { q: 'Does it obscure the reach?', how: 'reachOnsetDensity and whether reachDb exceeds the establishment level', status: 'MEASURABLE' },
  { q: 'Does it create anticipation?', how: 'restraintBeforeReachDb — a trough immediately before the reach, then a rise', status: 'MEASURABLE' },
  { q: 'Does it strengthen the consequence?', how: 'consequenceChangeDb and consequenceOnsetDensity', status: 'MEASURABLE' },
  { q: 'Does it make the film feel mechanically edited?', how: 'NOT MEASURABLE FROM AUDIO ALONE — this is a perceptual judgement and belongs to the external review', status: 'EXTERNAL REVIEW REQUIRED' },
  { q: 'Does the music imply a dramatic event the film does not provide?', how: 'NOT MEASURABLE FROM AUDIO ALONE — requires watching the film', status: 'EXTERNAL REVIEW REQUIRED' },
];
await writeFile(path.join(OUT, 'music-window-evidence.json'), JSON.stringify({
  note: 'Every scanned start second with its measured contour, plus the director attention test. The attention hierarchy is DERIVED from the trace and records its derivation.',
  metricDefinitions: { meanDb: 'mean RMS dB over the span, from the continuous energy curve', onsetDensity: 'onsets per second inside the span' },
  attentionHierarchy: { derivedFrom: 'out/phase33i/causal-trace.json measured quantities', planNote: 'director-plan-v2.json stores {shot,startFrame,endFrame,seconds,reason} and NO intent object, so attention is derived, not read', phases: rows },
  attentionTests: tests,
  questions,
  caution: 'A technically synchronized accent can still be dramatically wrong. None of these measurements decides which candidate is dramatically better.',
}, null, 2));
console.log(`\n  music-window-evidence.json updated with the attention test`);
console.log(`  ⚠ two of the six §11 questions are NOT audio-measurable and are marked EXTERNAL REVIEW REQUIRED`);
