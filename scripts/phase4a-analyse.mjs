/**
 * PHASE 4A RUNNER — analyse the fixture set and produce the machine-readable outputs.
 *
 *   node scripts/phase4a-analyse.mjs [track]
 */
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4a');
const FIX = path.join(OUT, 'fixtures');
const A = await import(path.join(ROOT, 'dist', 'src', 'audio', 'analyse.js'));
const I = await import(path.join(ROOT, 'dist', 'src', 'audio', 'infer.js'));
const W = await import(path.join(ROOT, 'dist', 'src', 'audio', 'warnings.js'));
const T = await import(path.join(ROOT, 'dist', 'src', 'audio', 'timeline.js'));
const D = await import(path.join(ROOT, 'dist', 'src', 'audio', 'decode.js'));
const SUP = await import(path.join(ROOT, 'dist', 'src', 'audio', 'support.js'));
const C = await import(path.join(ROOT, 'dist', 'src', 'audio', 'clock.js'));

const tools = { ffmpeg: path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg'), ffprobe: path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffprobe'), libPath: path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64') };
const cfg = A.DEFAULT_CONFIG;

const targets = process.argv[2] ? [process.argv[2]] : (await readdir(FIX)).filter((f) => f.endsWith('.wav')).sort().map((f) => path.join(FIX, f));

console.log('PHASE 4A — MUSIC ANALYSIS\n');
console.log('  stack: ffmpeg/ffprobe for decode and metadata; ALL analysis implemented in-repo (no ML dependency)');
console.log(`  analysis version ${cfg.version}   fft ${cfg.fftSize}  hop ${cfg.hopSize}  split ${cfg.splitFrequencyHz} Hz\n`);

const results = [];
for (const file of targets) {
  const name = path.basename(file, path.extname(file));
  const dir = path.join(OUT, name);
  await mkdir(dir, { recursive: true });
  const { result } = await D.loadSource(tools, file);
  const decoded = (await import(path.join(ROOT, 'dist', 'src', 'audio', 'wav.js'))).decodeWav(result.pcmBuffer);
  const clock = new C.AudioClock(decoded.sampleRate, decoded.channels, decoded.totalSamples);
  const table = A.frameTable(decoded.mono, clock, cfg);
  const measured = A.measure(table, clock, cfg);
  const onsets = I.detectOnsets(table, clock, cfg);
  const structure = I.inferAll(table, clock, cfg, onsets);
  const warnings = W.buildWarnings(measured, structure);
  const timeline = T.buildTimeline(clock, measured, structure);
  const configHash = createHash('sha256').update(JSON.stringify(cfg)).digest('hex');
  const localTempo = SUP.localTempoCurve(structure.beats);
  const analysis = {
    durationSeconds: +clock.durationSeconds.toFixed(6),
    tempo: structure.tempo,
    localTempo, beatGrid: structure.beats, meter: structure.meter, downbeats: structure.downbeats.downbeats,
    onsets: structure.onsets, phrases: structure.phrases, sections: structure.sections,
    energyCurve: measured.energyCurve, energyLandmarks: measured.energyLandmarks,
    silenceRegions: measured.silenceRegions, breathPoints: measured.breathPoints,
    analysisWarnings: warnings,
  };
  const analysisHash = createHash('sha256').update(JSON.stringify(analysis)).digest('hex');
  const source = { ...result.source, analysisVersion: cfg.version, configHash, analysisHash };
  await writeFile(path.join(dir, 'audio-metadata.json'), JSON.stringify(source, null, 2));
  await writeFile(path.join(dir, 'music-analysis.json'), JSON.stringify(analysis, null, 2));
  await writeFile(path.join(dir, 'music-timeline.json'), JSON.stringify({ clock: { sampleRate: clock.sampleRate, channels: clock.channels, totalSamples: clock.totalSamples, durationSeconds: clock.durationSeconds }, landmarks: timeline.landmarks, syncModes: T.SYNC_MODE_SEMANTICS }, null, 2));
  await writeFile(path.join(dir, 'analysis-warnings.json'), JSON.stringify(warnings, null, 2));
  results.push({ name, file: path.basename(file), dir, clock, measured, structure, warnings, timeline, source, analysis });
  const md = W.buildWarnings(measured, structure);
  console.log(`  ${name}`);
  console.log(`    duration ${clock.durationSeconds.toFixed(3)}s   tempo ${structure.tempo.bpm} BPM (${structure.tempo.confidence.band})${structure.tempo.halfDoubleAmbiguous ? '  HALF/DOUBLE AMBIGUOUS with ' + structure.tempo.ambiguousWith.bpm : ''}`);
  console.log(`    beats ${structure.beats.length}   onsets ${structure.onsets.length}   meter ${structure.meter.meter}   phrases ${structure.phrases.length}   sections ${structure.sections.length}   breath ${measured.breathPoints.length}`);
  const sup = structure.tempo.support;
  if (sup) console.log(`    tempo support: ${sup.supported ? 'SUPPORTED' : 'UNSUPPORTED'}  onsetSupport ${(sup.onsetSupport * 100).toFixed(0)}%  events/beat ${sup.eventsPerBeat.toFixed(2)}  intervalDev ${(sup.intervalSpread * 100).toFixed(0)}%   beatGridTrustworthy=${structure.tempo.beatGridTrustworthy}`);
  if (localTempo.length > 1) console.log(`    local tempo: ${localTempo.map((p) => p.bpm.toFixed(0)).join(' -> ')} BPM`);
  console.log(`    warnings: ${md.length ? md.map((x) => x.code).join(', ') : 'none'}`);
}
await writeFile(path.join(OUT, 'analysis-summary.json'), JSON.stringify(results.map((r) => ({
  name: r.name, durationSeconds: +r.clock.durationSeconds.toFixed(4), tempoBpm: r.structure.tempo.bpm,
  tempoConfidence: r.structure.tempo.confidence, halfDoubleAmbiguous: r.structure.tempo.halfDoubleAmbiguous,
  ambiguousWith: r.structure.tempo.ambiguousWith ?? null, beatCount: r.structure.beats.length,
  onsetCount: r.structure.onsets.length, meter: r.structure.meter.meter, meterUnknown: r.structure.meter.unknown,
  downbeatCount: r.structure.downbeats.downbeats.length, phraseCount: r.structure.phrases.length,
  sectionCount: r.structure.sections.length, breathPointCount: r.measured.breathPoints.length,
  silenceRegionCount: r.measured.silenceRegions.length, landmarkCount: r.timeline.landmarks.length,
  warningCodes: r.warnings.map((w) => w.code), analysisHash: r.source.analysisHash.slice(0, 16),
  tempoSupported: r.structure.tempo.support?.supported ?? null,
  tempoOnsetSupport: r.structure.tempo.support?.onsetSupport ?? null,
  localTempoBpm: r.analysis.localTempo.map((p) => p.bpm),
})), null, 2));
console.log(`\n  ${results.length} track(s) analysed. outputs in out/phase4a/<track>/`);
