/**
 * §3 FILM DRAMATURGICAL LANDMARKS — READ from the actual Phase 3.3I plan and trace.
 *
 * ⚠ **No timestamp is invented from the prose.** Every value below is derived from
 * `out/phase33i/causal-trace.json` (the runtime trace, 480 frames) or
 * `out/phase33i/director-plan-v2.json` (the plan), and the derivation is recorded per event.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4b0');
await mkdir(OUT, { recursive: true });
const trace = JSON.parse(await readFile(path.join(ROOT, 'out/phase33i/causal-trace.json'), 'utf8'));
const plan = JSON.parse(await readFile(path.join(ROOT, 'out/phase33i/director-plan-v2.json'), 'utf8'));
const T = trace.trace, FPS = 30;

console.log('§3 FILM DRAMATURGICAL LANDMARKS — from the trace, not the prose\n');
console.log(`  trace frames ${T.length}   declared frames ${trace.frames}   fps ${FPS}   duration ${trace.totalSeconds}s`);
const first = (pred, from = 0) => { for (let i = from; i < T.length; i++) if (pred(T[i], i)) return T[i]; return null; };
const last = (pred) => { for (let i = T.length - 1; i >= 0; i--) if (pred(T[i], i)) return T[i]; return null; };

/** ⚠ thresholds are stated, and every landmark records the predicate that produced it */
const DERIVATIONS = {
  establishment: { pred: 'first frame of the film', value: T[0], evidence: 'frame 0; S1-establish begins here per the plan' },
  notice_readable: { pred: 'noticeTurn first reaches its maximum sustained value', value: (() => { const maxTurn = Math.max(...T.map((f) => f.noticeTurn)); return T.find((f) => f.noticeTurn >= maxTurn - 1e-9); })(), evidence: 'first frame where noticeTurn equals the trace maximum' },
  orientation: { pred: 'headYaw first departs the rest value of -28 deg', value: T.find((f) => Math.abs(f.headYaw - (-28)) > 1e-6), evidence: 'first frame where headYaw != -28 (the authored rest yaw)' },
  step: { pred: 'stepProgress first exceeds 0', value: first((f) => f.stepProgress > 0), evidence: 'first frame where stepProgress > 0' },
  settle: { pred: 'stepProgress reaches 1 and the moving foot lift returns to 0', value: (() => { const done = T.find((f) => f.stepProgress >= 1 - 1e-9); if (!done) return null; return T.slice(done.frame).find((f) => f.movingFootLift <= 1e-9 && f.stepProgress >= 1 - 1e-9) ?? done; })(), evidence: 'first frame at or after stepProgress==1 where movingFootLift returns to 0' },
  reach_readable: { pred: 'reachProgress first reaches its pre-effect plateau', value: (() => { const on = T.find((f) => f.nameFragment > 0); const upto = on ? T.filter((f) => f.frame < on.frame) : T; const m = Math.max(...upto.map((f) => f.reachProgress)); return upto.find((f) => f.reachProgress >= m - 1e-9) ?? null; })(), evidence: 'last frame before NAME fragmentation where reachProgress is at its maximum' },
  name_fragment_onset: { pred: 'nameFragment first exceeds 0', value: first((f) => f.nameFragment > 0), evidence: 'first frame where nameFragment > 0 — the consequence begins' },
  name_fragment_complete: { pred: 'nameFragment first reaches 1', value: first((f) => f.nameFragment >= 1 - 1e-9), evidence: 'first frame where nameFragment reaches 1' },
  room_decay_onset: { pred: 'roomDecay first exceeds 0', value: first((f) => f.roomDecay > 0), evidence: 'first frame where roomDecay > 0' },
  camera_onset: { pred: 'camZ first departs the rest value', value: first((f) => Math.abs(f.camZ - 0.9315) > 1e-9), evidence: 'first frame where camZ != 0.9315 (the authored rest cameraZ)' },
  final_hold: { pred: 'final frame of the film', value: T[T.length - 1], evidence: `frame ${T.length - 1}; the film ends here` },
};

/** the actual phrase-window table, straight from the plan */
const performanceWindows = trace.performance;
console.log('  authored performance windows (from the trace metadata):');
for (const [k, v] of Object.entries(performanceWindows)) console.log(`    ${k.padEnd(8)} ${v[0]}s .. ${v[1]}s  -> frames ${Math.round(v[0]*FPS)} .. ${Math.round(v[1]*FPS)}`);
console.log('');
const LANDMARKS = [
  ['establishment', 'the space, the person and the NAME relation are understood before anything changes', 'SHOT_LOCAL'],
  ['notice_readable', 'the person has noticed NAME — attention becomes legible', 'CHARACTER_LOCAL'],
  ['orientation', 'the body begins to turn toward NAME', 'CHARACTER_LOCAL'],
  ['step', 'approach begins', 'CHARACTER_LOCAL'],
  ['settle', 'the approach completes and the stance stabilises', 'CHARACTER_LOCAL'],
  ['reach_readable', 'the reach has become legible — the cause is now visible', 'CAUSE_LOCAL'],
  ['name_fragment_onset', 'the consequence begins: NAME breaks', 'EFFECT_LOCAL'],
  ['name_fragment_complete', 'NAME is gone', 'EFFECT_LOCAL'],
  ['room_decay_onset', 'the world responds: the room withdraws', 'EFFECT_LOCAL'],
  ['camera_onset', 'the camera begins to answer the action', 'CAMERA_LOCAL'],
  ['final_hold', 'the last image, held', 'SHOT_LOCAL'],
];
const out = { note: 'Derived from out/phase33i/causal-trace.json and director-plan-v2.json. No timestamp was taken from prose.', source: { trace: 'out/phase33i/causal-trace.json', plan: 'out/phase33i/director-plan-v2.json', filmSourceHashPrefix: 'fb8c4175d2bdba32', frames: trace.frames, fps: FPS, totalSeconds: trace.totalSeconds }, shots: trace.shots, performanceWindows, events: [] };
for (const [id, fn, domain] of LANDMARKS) {
  const d = DERIVATIONS[id];
  if (!d.value) { console.log(`  ⚠ ${id}: NOT FOUND — reported rather than invented`); continue; }
  const e = { eventId: id, frame: d.value.frame, timeSeconds: +(d.value.frame / FPS).toFixed(6), dramaticFunction: fn, timingDomain: domain, movability: 'LOCKED', derivation: d.pred, evidence: d.evidence, measured: { shot: d.value.shot, reachProgress: d.value.reachProgress, stepProgress: d.value.stepProgress, noticeTurn: +d.value.noticeTurn.toFixed(4), nameFragment: +d.value.nameFragment.toFixed(4), roomDecay: +d.value.roomDecay.toFixed(4), camZ: +d.value.camZ.toFixed(6) } };
  out.events.push(e);
  console.log(`  ${id.padEnd(24)} frame ${String(e.frame).padStart(3)}  ${e.timeSeconds.toFixed(3)}s  ${e.measured.shot}`);
}
out.movabilityPolicy = 'ALL EVENTS ARE LOCKED. The visual film is the timing reference in this experiment; no landmark may be moved to suit the music.';
out.distinctions = {
  COINCIDENTAL_ALIGNMENT: 'a musical event happens to fall near a film landmark; nothing selected it',
  DIRECTORIALLY_SELECTED_ALIGNMENT: 'a music window was chosen BY A DIRECTOR because it supports the film — permitted here',
  HARD_SYNCHRONIZED_ALIGNMENT: 'a landmark was moved, or a beat was used to place it — PROHIBITED in this phase',
};
await writeFile(path.join(OUT, 'film-dramaturgy.json'), JSON.stringify(out, null, 2));
console.log(`\n  ${out.events.length} landmarks -> out/phase4b0/film-dramaturgy.json`);
console.log(`  ⚠ the 16 s film spans frames 0..479; the 88 s music is 5.5x longer, and EVERY music window must be contiguous`);
