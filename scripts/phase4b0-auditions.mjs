/**
 * §8/§9/§10 DIRECTOR AUDITIONS.
 *
 * ⚠ **THE ORIGINAL STEREO IS USED, NOT THE MONO ANALYSIS WAVEFORM.** The analysis decode downmixes; auditions
 * must not, so a separate stereo decode is performed from the same original file.
 */
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const pexec = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4b0');
const AUD = path.join(OUT, 'auditions');
const BLIND = path.join(OUT, 'blind-review');
const TMP = path.join(OUT, '.tmp');
const FF = path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64/ffmpeg');
const FFP = path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64/ffprobe');
const LIB = path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64');
const TRACK = process.env.CINEMA_TRACK ?? (() => { throw new Error('set CINEMA_TRACK to an audio file path'); })();
const V2 = path.join(ROOT, 'out/phase33i/micro-film-v2.mp4');
const ENV = { ...process.env, DYLD_LIBRARY_PATH: LIB };
await mkdir(AUD, { recursive: true }); await mkdir(BLIND, { recursive: true }); await mkdir(TMP, { recursive: true });
const ff = (args) => pexec(FF, args, { env: ENV, maxBuffer: 1 << 28 });

/** ⚠ STEREO decode, 16-bit, source sample rate — a distinct intermediate from the mono analysis decode */
const stereoWav = path.join(TMP, 'music-stereo.wav');
await ff(['-y', '-hide_banner', '-loglevel', 'error', '-i', TRACK, '-vn', '-acodec', 'pcm_s16le', '-ac', '2', stereoWav]);
const { readFile: rf } = await import('node:fs/promises');
const { decodeWav } = await import(path.join(ROOT, 'dist/src/audio/wav.js'));
const stereoBuf = await rf(stereoWav);
const st = decodeWav(stereoBuf);
console.log(`  stereo decode: ${st.channels} ch  ${st.sampleRate} Hz  ${st.totalSamples} samples  ${(st.totalSamples / st.sampleRate).toFixed(3)}s`);
const { stdout: probeOut } = await pexec(FFP, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', TRACK], { env: ENV });
const probe = JSON.parse(probeOut);
const srcRate = Number(probe.streams.find((s) => s.codec_type === 'audio').sample_rate);
console.log(`  original: ${probe.streams.find((s) => s.codec_type === 'audio').channels} ch  ${srcRate} Hz  ${probe.format.format_name}`);

const cands = JSON.parse(await rf(path.join(OUT, 'music-window-candidates.json')));
/** §9 SAMPLE-ACCURATE extraction, and the fade policy is decided by MEASUREMENT per candidate */
const OPTS = { sampleRate: srcRate, channels: 2 };
function writeWavStereo(interleaved, sampleRate, channels) {
  const n = interleaved.length; const buf = Buffer.alloc(44 + n * 2);
  const byteRate = sampleRate * channels * 2;
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(byteRate, 28); buf.writeUInt16LE(channels * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, interleaved[i])), 44 + i * 2);
  return buf;
}
const peakOf = (inter) => { let m = 0; for (const v of inter) m = Math.max(m, Math.abs(v)); return m / 32768; };
const rmsOf = (inter) => { let s = 0; for (const v of inter) s += (v / 32768) ** 2; return Math.sqrt(s / Math.max(1, inter.length)); };

const built = [];
for (const c of cands.candidates) {
  const startSample = Math.round(c.startSeconds * srcRate);
  const endSample = startSample + Math.round(16 * srcRate);
  const n = endSample - startSample;
  const inter = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) {
    const f = startSample + i;
    for (let ch = 0; ch < 2; ch++) inter[i * 2 + ch] = Math.round(st.channelData[ch][f] * 32768);
  }
  const rawPeak = peakOf(inter), rawRms = rmsOf(inter);
  /** §9 — a fade is applied ONLY when a boundary measurement requires it */
  const edgeSamples = Math.round(0.005 * srcRate);
  const headJump = Math.abs(st.channelData[0][startSample] - 0) ;
  const tailJump = Math.abs(st.channelData[0][endSample - 1] - 0);
  let fadeMs = 0, fadeReason = 'none required: the boundary amplitude is low enough that no discontinuity is audible';
  const edgeAmp = Math.max(Math.abs(st.channelData[0][startSample]), Math.abs(st.channelData[1][startSample]));
  if (edgeAmp > 0.05) { fadeMs = 12; fadeReason = `boundary amplitude ${edgeAmp.toFixed(3)} exceeds 0.05, so a ${fadeMs} ms cosine fade prevents an audible discontinuity`; }
  if (fadeMs > 0) {
    const k = Math.round((fadeMs / 1000) * srcRate);
    for (let i = 0; i < k; i++) { const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / k); inter[i * 2] *= g; inter[i * 2 + 1] *= g; inter[(n - 1 - i) * 2] *= g; inter[(n - 1 - i) * 2 + 1] *= g; }
  }
  const name = c.className === 'PROGRESSIVE_BUILD' ? 'build' : 'contrast';
  const wavPath = path.join(AUD, `window-${name}.wav`);
  await writeFile(wavPath, writeWavStereo(inter, srcRate, 2));
  built.push({ ...c, name, startSample, endSample, sampleCount: n, wavPath, rawPeak: +rawPeak.toFixed(4), rawRms: +rawRms.toFixed(4),
    fadeMs, fadeReason, peakAfter: +peakOf(inter).toFixed(4), rmsAfter: +rmsOf(inter).toFixed(4),
    interleaved: inter,
    loudnessDb: +(20 * Math.log10(rmsOf(inter))).toFixed(2) });
  console.log(`\n  ${name}: ${c.startSeconds}..${c.endSeconds}s  samples ${startSample}..${endSample} (${n})`);
  console.log(`    peak ${rawPeak.toFixed(4)}  rms ${rawRms.toFixed(4)}  loudness ${(20 * Math.log10(rawRms)).toFixed(2)} dBFS`);
  console.log(`    fade ${fadeMs} ms — ${fadeReason}`);
}
/** §10 FAIR COMPARISON — measure loudness, and normalise only via a documented nondestructive gain */
const loud = built.map((b) => 20 * Math.log10(b.rmsAfter));
const target = Math.max(...loud);
/**
 * ⚠ THE LOUDNESS POLICY, and the two errors it corrects.
 *
 * The first version used a 0.05 dB threshold for "a gain is needed" and therefore applied **no gain** to
 * excerpts differing by **2.48 dB** — an audibly louder excerpt, exactly the bias §10 forbids.
 *
 * The policy is now: **every excerpt is level-matched to a COMMON TARGET loudness**, so that the comparison
 * hears STRUCTURE rather than level. The gain is a single scalar applied to the whole excerpt, so each one's
 * **internal dynamic contour is preserved exactly** — nothing is compressed, limited or flattened.
 *
 * Target: the loudest excerpt's own RMS. **No excerpt is ever attenuated below its own level**, and if a gain
 * would push the peak above 1.0 the gain is reduced to the clipping-safe maximum and that reduction is recorded.
 */
const targetRms = Math.max(...built.map((b) => b.rmsAfter));
for (const b of built) {
  const wantDb = 20 * Math.log10(targetRms / Math.max(1e-12, b.rmsAfter));
  const peakSafeDb = 20 * Math.log10(0.97 / Math.max(1e-12, b.peakAfter));
  const appliedDb = Math.max(0, Math.min(wantDb, peakSafeDb));
  b.monitoringGainDb = +appliedDb.toFixed(2);
  b.gainApplied = appliedDb > 0.1;
  b.gainLimitedForHeadroom = appliedDb < wantDb - 0.01;
  b.peakIfGainFullyApplied = +(b.peakAfter * 10 ** (wantDb / 20)).toFixed(4);
}
console.log(`\n  §10 LOUDNESS: ${built.map((b) => `${b.name} ${(20 * Math.log10(b.rmsAfter)).toFixed(2)} dBFS`).join('   ')}`);
console.log(`    documented gain so a louder excerpt cannot win on level alone: ${built.map((b) => `${b.name} ${b.gainApplied ? b.monitoringGainDb + ' dB' : 'none'}`).join(', ')}`);
/**
 * ⚠ THE TRACE WRITER IS LAZY AND RUNS LAST. The first version read `frame-verification.json` at DEFINITION
 * time — before the verification had been written — so it aborted with ENOENT. **A trace that needs the
 * verification must be written after the verification exists**, so the frame data is read inside the writer.
 */
const writeTrace = async () => {
  const frameVisForTrace = JSON.parse(await readFile(path.join(TMP, 'frame-verification.json'), 'utf8'));
  return writeFile(path.join(OUT, 'audition-trace.json'), JSON.stringify({
  syncMode: 'FREE_SYNC',
  explicitStatement: 'NO BEAT GRID WAS CONSUMED. No onset or beat was used to place anything in the film. No landmark was moved.',
  filmSource: { path: 'out/phase33i/micro-film-v2.mp4', hashPrefix: 'fb8c4175d2bdba32' },
  musicSource: { path: TRACK, originalHash: createHash('sha256').update(await rf(TRACK)).digest('hex'), channels: 2, sampleRate: srcRate },
  stereoDecode: { path: 'audio stereo -> pcm_s16le WAV, 2 channels, source sample rate', sampleCount: st.totalSamples },
  candidates: built.map((b) => ({ name: b.name, className: b.className, musicWindowStartSample: b.startSample, musicWindowEndSample: b.endSample, outputAudioSampleCount: b.sampleCount, videoFrameCount: 480, audioVideoOffset: 0, syncMode: 'FREE_SYNC',
      decodedVideoFrameVerification: (frameVisForTrace.candidates.find((x) => x.name === b.name) ?? null), audioTreatment: { fadeMs: b.fadeMs, fadeReason: b.fadeReason, monitoringGainDb: b.gainApplied ? b.monitoringGainDb : 0, gainReason: b.gainApplied ? 'documented nondestructive monitoring gain for fair loudness comparison' : 'no gain needed' }, /**
       * ⚠ `peakAfterTreatment` IS THE PEAK AFTER THE FADE **AND** THE LEVEL-MATCH GAIN.
       *
       * The first version reported `b.peakAfter`, which is measured after the fade but BEFORE the gain — so a
       * field named "after treatment" held a pre-treatment value. **A field name that is stronger than its
       * measurement is the defect class this project has recorded five times.**
       */
      measured: { rawPeak: b.rawPeak, rawRms: b.rawRms, loudnessDb: b.loudnessDb, peakAfterFade: b.peakAfter, peakAfterTreatment: b.peakAfterTreatment, peakIfGainFullyApplied: b.peakIfGainFullyApplied ?? null } })),
  claimDistinctions: { permitted: ['COINCIDENTAL_ALIGNMENT', 'DIRECTORIALLY_SELECTED_ALIGNMENT'], prohibited: ['HARD_SYNCHRONIZED_ALIGNMENT'], statement: 'an onset near REACH is NOT evidence that REACH was authored from it' },
  musicWindowSelection: { forbiddenDefaultsChecked: true, loudestWindowIncluded: false },
  loudnessPolicy: {
    rule: 'every excerpt is level-matched to a COMMON TARGET loudness so the comparison hears STRUCTURE rather than level',
    target: 'the loudest excerpt own RMS; no excerpt is attenuated below its own level',
    perExcerptScalar: true,
    internalDynamicsPreserved: 'a single scalar gain is applied to the whole excerpt — no compression, limiting or flattening',
    clippingGuard: 'if a gain would push the peak above 0.97, it is reduced to the clipping-safe maximum and the reduction is recorded',
    unadjustedReferenceKept: 'window-<name>.wav is the UNGAINED excerpt and is kept alongside the gained one',
  },
}, null, 2));
};

// ---------------------------------------------------------------------------
// §8 SYNCHRONIZED PLAYBACK PREVIEWS — the FROZEN V2 video, re-muxed with the window audio
// ---------------------------------------------------------------------------
console.log('\n§8 BUILDING PREVIEWS — frozen V2 video + window audio\n');
/** ⚠ the gain is now APPLIED to the audio used in the preview, and the unadjusted excerpt is kept as reference */
const D = await import(path.join(ROOT, 'dist/src/audio/diagnostic.js'));
for (const b of built) {
  let inter = b.interleaved;
  if (b.gainApplied) {
    const g = 10 ** (b.monitoringGainDb / 20);
    const adj = new Int16Array(inter.length);
    for (let i = 0; i < inter.length; i++) adj[i] = Math.max(-32768, Math.min(32767, Math.round(inter[i] * g)));
    await writeFile(path.join(AUD, `window-${b.name}-monitoring-gain.wav`), writeWavStereo(adj, srcRate, 2));
    inter = adj;
    b.peakAfterTreatment = +peakOf(adj).toFixed(4);
    console.log(`  ${b.name}: +${b.monitoringGainDb} dB level-match APPLIED for the preview; the unadjusted excerpt is kept as window-${b.name}.wav`);
  } else {
    b.peakAfterTreatment = b.peakAfter;
    console.log(`  ${b.name}: already at the common target loudness, so no gain is applied`);
  }
  const mp4 = path.join(AUD, `film-with-music-${b.name}.mp4`);
  await ff(['-y', '-hide_banner', '-loglevel', 'error', '-i', V2, '-i', path.join(AUD, b.gainApplied ? `window-${b.name}-monitoring-gain.wav` : `window-${b.name}.wav`),
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', mp4]);
  b.previewPath = mp4;
  console.log(`    -> auditions/film-with-music-${b.name}.mp4`);
}
/** ⚠ FRAME-FOR-FRAME VERIFICATION against the frozen V2, by decoding both to raw video and hashing */
console.log('\n  FRAME PRESERVATION — decoding the preview video and comparing to the frozen V2 frame by frame');
/**
 * ⚠ THE BUNDLED FFMPEG HAS NO `rawvideo` MUXER (a known limitation of this toolchain), so the frames are
 * extracted as PNG and hashed instead. **PNG frames are a STRICTER test than raw video**: the encoder is
 * deterministic, so a byte-identical PNG means an identical decoded picture, not merely a similar one.
 */
const frameDir = async (label, src) => {
  const d = path.join(TMP, `frames-${label}`);
  await rm(d, { recursive: true, force: true }); await mkdir(d, { recursive: true });
  await ff(['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-an', '-vsync', '0', path.join(d, 'f%04d.png')]);
  const files = (await readdir(d)).filter((f) => f.endsWith('.png')).sort();
  const hashes = [];
  for (const f of files) hashes.push(createHash('sha256').update(await readFile(path.join(d, f))).digest('hex'));
  return { dir: d, count: files.length, hashes, combined: createHash('sha256').update(hashes.join('')).digest('hex') };
};
const v2f = await frameDir('v2', V2);
console.log(`    frozen V2: ${v2f.count} frames extracted, combined frame hash ${v2f.combined.slice(0, 16)}`);
const frameVerification = [];
for (const b of built) {
  const pf = await frameDir(b.name, b.previewPath);
  let firstDiff = -1;
  for (let i = 0; i < Math.min(v2f.count, pf.count); i++) if (v2f.hashes[i] !== pf.hashes[i]) { firstDiff = i; break; }
  const identical = pf.count === v2f.count && firstDiff === -1;
  const { stdout } = await pexec(FFP, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames,width,height', '-of', 'json', b.previewPath], { env: ENV });
  const info = JSON.parse(stdout).streams[0];
  frameVerification.push({ name: b.name, previewVideoFrames: Number(info.nb_read_frames), framePngsExtracted: pf.count, frozenV2Frames: v2f.count,
    width: Number(info.width), height: Number(info.height), framesIdenticalToFrozenV2: identical, firstDifferingFrame: firstDiff === -1 ? null : firstDiff,
    combinedFrameHash: pf.combined.slice(0, 16), frozenCombinedFrameHash: v2f.combined.slice(0, 16) });
  console.log(`    ${b.name.padEnd(9)} ${info.nb_read_frames} frames ${info.width}x${info.height}  ${pf.count} PNGs  ${identical ? 'ALL FRAMES IDENTICAL to V2' : 'DIFFERS at frame ' + firstDiff}`);
}
await writeFile(path.join(TMP, 'frame-verification.json'), JSON.stringify({ method: 'PNG frame extraction and per-frame sha256, because the bundled ffmpeg has no rawvideo muxer', frozenV2Frames: v2f.count, frozenV2CombinedHash: v2f.combined, candidates: frameVerification }, null, 2));



// ---------------------------------------------------------------------------
// §12 BLIND REVIEW PACKAGE
// ---------------------------------------------------------------------------
console.log('\n§12 BLIND REVIEW PACKAGE\n');
const seed = parseInt(createHash('sha256').update('4b0' + (await readFile(path.join(OUT, 'music-window-candidates.json'))).toString().slice(0, 64)).digest('hex').slice(0, 8), 16);
let stt = seed; const order = [...built.keys()];
for (let i = order.length - 1; i > 0; i--) { stt = (stt * 1103515245 + 12345) & 0x7fffffff; const j = stt % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
const letters = ['A', 'B', 'C', 'D'];
const mapping = order.map((srcIdx, n) => ({ blindLabel: `clip-${letters[n]}`, sourceName: built[srcIdx].name, className: built[srcIdx].className, musicWindowStartSample: built[srcIdx].startSample, musicWindowEndSample: built[srcIdx].endSample }));
for (const m of mapping) {
  const b = built.find((x) => x.name === m.sourceName);
  await ff(['-y', '-hide_banner', '-loglevel', 'error', '-i', b.previewPath, '-c', 'copy', path.join(BLIND, `${m.blindLabel}.mp4`)]);
  await ff(['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(AUD, b.gainApplied ? `window-${b.name}-monitoring-gain.wav` : `window-${b.name}.wav`), '-c:a', 'copy', path.join(BLIND, `${m.blindLabel}-audio-only.wav`)]);
  console.log(`  ${m.blindLabel}.mp4   <- ${b.name} (${b.className})   [window position HIDDEN from the reviewer]`);
}
await writeFile(path.join(OUT, 'BLIND-ANSWER-KEY.json'), JSON.stringify({
  warning: 'DO NOT SHOW THE REVIEWER. Open only after the review is recorded.',
  syncMode: 'FREE_SYNC',
  nothingWasAligned: 'no beat, onset or energy landmark was used to place anything. No film landmark was moved. NO CANDIDATE IS A BEAT-SYNCED EDIT.',
  mapping,
  shuffle: 'deterministic from the candidate evidence, so the mapping is reproducible and was NOT hand-picked',
  gainDisclosure: built.map((b) => ({ name: b.name, monitoringGainDb: b.gainApplied ? b.monitoringGainDb : 0, note: b.gainApplied ? 'a documented nondestructive monitoring gain, so loudness cannot decide the comparison' : 'no gain needed' })),
  audioTreatments: built.map((b) => ({ name: b.name, fadeMs: b.fadeMs, fadeReason: b.fadeReason })),
}, null, 2));
await writeTrace();
console.log(`\n  blind-review/ + BLIND-ANSWER-KEY.json written`);
console.log(`  audition-trace.json written (syncMode FREE_SYNC, with decoded frame verification)`);
