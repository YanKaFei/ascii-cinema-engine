import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const ROOT = decodeURIComponent(new URL('../../../', import.meta.url).pathname);
const OUT = path.join(ROOT, 'out', 'phase4a');
const T = await import(path.join(ROOT, 'dist', 'src', 'audio', 'timeline.js'));
const CLK = await import(path.join(ROOT, 'dist', 'src', 'audio', 'clock.js'));
export async function readFileSet() {
  const gt = JSON.parse(await readFile(path.join(OUT, 'fixtures', 'ground-truth.json'), 'utf8'));
  const names = (await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory() && d.name !== 'fixtures').map((d) => d.name);
  const analysis = {}, warnings = {}, timeline = {}, source = {}, queries = {};
  for (const n of names) {
    const dir = path.join(OUT, n);
    try {
      analysis[n] = JSON.parse(await readFile(path.join(dir, 'music-analysis.json'), 'utf8'));
      warnings[n] = JSON.parse(await readFile(path.join(dir, 'analysis-warnings.json'), 'utf8'));
      timeline[n] = JSON.parse(await readFile(path.join(dir, 'music-timeline.json'), 'utf8'));
      source[n] = JSON.parse(await readFile(path.join(dir, 'audio-metadata.json'), 'utf8'));
    } catch { continue; }
  }
  /** rebuild the live timeline objects for the query API, so queries run against the real implementation */
  const C = await import(path.join(ROOT, 'dist', 'src', 'audio', 'clock.js'));
  for (const n of Object.keys(analysis)) {
    const a = analysis[n], s = source[n];
    const clock = new C.AudioClock(s.sampleRate, s.channels, s.totalSamples);
    queries[n] = { clock, measured: { energyCurve: a.energyCurve, energyLandmarks: a.energyLandmarks, silenceRegions: a.silenceRegions, breathPoints: a.breathPoints, windowSize: 2048, hopSize: 512, splitFrequencyHz: 250 },
      structure: { tempo: a.tempo, beats: a.beatGrid, meter: a.meter, downbeats: { beatsPerBar: a.meter.beatsPerBar, downbeats: a.downbeats, confidence: a.meter.confidence, unknown: a.meter.unknown }, onsets: a.onsets, phrases: a.phrases, sections: a.sections },
      landmarks: timeline[n].landmarks };
  }
  const gtf = {};
  for (const f of gt.fixtures) gtf[f.name] = f.groundTruth;
  return { analysis, warnings, timeline, source, queries, groundTruth: { fixtures: gtf }, T: { ...T, AUDIO_TIME_DOMAINS: CLK.AUDIO_TIME_DOMAINS, AudioClock: CLK.AudioClock } };
}
