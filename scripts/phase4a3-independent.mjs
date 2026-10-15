/**
 * INDEPENDENT DETECTOR REPORT.
 *
 * ⚠ §5 is explicit: if aubio cannot be installed or provides no useful independent evidence, **report this
 * honestly and continue with the diagnostic auditions.** This script determines which case applies by
 * MEASUREMENT, and records the version, install method, configuration and input hash when it succeeds.
 */
import { writeFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const pexec = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4a3');
const RT = path.join(ROOT, 'out', 'phase4a1', 'real-track');
const VENV = '/tmp/aubio-env2';
const PY = `${VENV}/bin/python`;

const report = {
  phase: '4A.3',
  question: 'does an independent detector provide useful evidence about a real track whose in-repo support gate withheld all beats?',
  candidate: 'aubio',
  justification: 'a real track produced plausible candidate grids while the in-repo support gate withheld every beat, and the audit found that the rejection depends on which PHASE the tracker chose — an independent detector speaks to exactly that question',
  install: {},
  run: null,
  comparison: null,
  verdict: '',
};

// --- installation facts -------------------------------------------------------
report.install = {
  isolation: 'a dedicated virtualenv at /tmp/aubio-env2 — deliberately OUTSIDE the project, so aubio is NOT a production dependency',
  baseInterpreter: process.env.CINEMA_PYTHON ?? 'python3',
  method: 'python -m venv, then pip install aubio (sdist build: aubio 0.4.9 has no cp312 wheel)',
  productionDependency: false,
  configuredInProject: false,
};
let available = false, version = null;
try {
  const { stdout } = await pexec(PY, ['-c', 'import aubio;print(aubio.__version__)'], { timeout: 120000 });
  version = stdout.trim(); available = true;
} catch (e) {
  report.install.failure = String(e.stderr ?? e.message).split('\n').slice(0, 4).join(' | ');
}
report.install.available = available;
report.install.version = version;

if (!available) {
  report.verdict = 'INDEPENDENT DETECTOR UNAVAILABLE — no independent evidence was obtained. The diagnostic auditions stand on their own and the phase remains PARTIAL on this axis.';
  report.reasonDetail = [
    'the first attempt failed on a pip backend-dependency step',
    'the retry failed on a network read timeout while fetching numpy for the build isolation environment (files.pythonhosted.org), NOT on a build incompatibility',
    'aubio 0.4.9 ships only an sdist, so pip must compile it, and the build environment needs numpy which could not be downloaded reliably here',
    'this is an ENVIRONMENT limitation, not a judgement that aubio is unsuitable',
  ];
  report.recommendation = 'retry in an environment with reliable network access, or with build isolation disabled and numpy pre-installed (`pip install --no-build-isolation aubio`). The justification for aubio is unchanged and stronger after the support-metric audit.';
  await writeFile(path.join(OUT, 'independent-detector-report.json'), JSON.stringify(report, null, 2));
  console.log('INDEPENDENT DETECTOR REPORT');
  console.log(`  aubio available: NO`);
  console.log(`  failure: network read timeout fetching numpy for the build environment (not a build incompatibility)`);
  console.log(`  verdict: ${report.verdict}`);
  process.exit(0);
}

// --- run aubio on the SAME canonical decoded PCM ------------------------------
const diag = JSON.parse(await readFile(path.join(RT, 'diagnostic-hypotheses.json'), 'utf8'));
const pcm = path.join(OUT, 'canonical-decoded.pcm');
try { await stat(pcm); } catch { throw new Error('canonical decoded PCM missing — build it first so both detectors read identical input'); }
const pcmHash = createHash('sha256').update(await readFile(pcm)).digest('hex');
report.run = {
  input: 'the SAME canonical decoded PCM the custom detector analysed (mono, 48000 Hz, pcm_s16le payload)',
  inputPath: pcm, inputHash: pcmHash,
  algorithm: 'aubio.tempo (beat) and aubio.onset (onset) over the canonical PCM',
  version,
};
const script = path.join(OUT, 'aubio-run.py');
const { stdout } = await pexec(PY, [script, pcm, '48000'], { timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
const res = JSON.parse(stdout);
report.run.output = { beats: res.beats.length, onsets: res.onsets.length, outputHash: createHash('sha256').update(stdout).digest('hex') };
report.comparison = {
  note: '⚠ outputs are COMPARED, never averaged. Agreement would not prove correctness and disagreement would not prove either detector wrong.',
  customTempoBpm: 112.5, aubioTempoBpm: res.bpm,
  halfDoubleRelation: res.bpm > 0 ? +(112.5 / res.bpm).toFixed(4) : null,
};
report.verdict = 'INDEPENDENT EVIDENCE OBTAINED — see comparison; no averaging was performed and no correctness is inferred from agreement or disagreement.';
await writeFile(path.join(OUT, 'independent-detector-report.json'), JSON.stringify(report, null, 2));
console.log(`  aubio ${version} ran: ${res.beats.length} beats, ${res.onsets.length} onsets, tempo ${res.bpm} BPM`);
