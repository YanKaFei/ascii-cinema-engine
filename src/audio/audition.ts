/**
 * CLICK-TRACK AUDITION — an AUDIBLE diagnostic.
 *
 * ⚠ **This exists because the DSP cannot settle a perceptual question.** Fixture C's grid is internally perfect
 * and acoustically wrong, and **no interval metric can see the difference.** A listener hearing the music with
 * clicks either on the pulse or off it can decide in seconds what the analysis cannot decide at all.
 *
 * The source timing is **not altered**: the original samples are copied through and a short click is mixed in
 * at the detected event times.
 */
import type { BeatEvent } from "./analysis-types.js";
import type { OnsetEvent } from "./analysis-types.js";

export interface AuditionOptions {
  /** click length in seconds */
  clickSeconds: number;
  /** click amplitude, 0..1 of full scale */
  amplitude: number;
  /** a distinguishable frequency; downbeats use a higher, louder click */
  frequencyHz: number;
  sampleRate: number;
  /** sample index offset added to every click, for sign convention checks */
  offsetSamples?: number;
}

export const DEFAULT_AUDITION: Omit<AuditionOptions, "sampleRate"> = { clickSeconds: 0.03, amplitude: 0.7, frequencyHz: 1800 };

/** mix one click into a copy of the source */
function mixClick(out: Float32Array, atSeconds: number, opts: AuditionOptions, amplitudeScale = 1): void {
  const start = Math.round(atSeconds * opts.sampleRate) + (opts.offsetSamples ?? 0);
  const len = Math.round(opts.clickSeconds * opts.sampleRate);
  const amp = opts.amplitude * amplitudeScale;
  for (let i = 0; i < len; i++) {
    const j = start + i;
    if (j < 0 || j >= out.length) continue;
    /** a fast-decaying tone burst: unmistakable against music and short enough to localise by ear */
    const env = Math.exp(-i / (len / 6));
    out[j] += amp * env * Math.sin((2 * Math.PI * opts.frequencyHz * i) / opts.sampleRate);
  }
}

/**
 * ⚠ THE EXACT PCM PAYLOAD, when one is available.
 *
 * `encodeWav` quantises `Float32 -> Int16`, which for a source that was **already** int16 is a round-trip that
 * does not return the original sample: the real track's "unmodified" reference measured a **3.05e-05**
 * difference against the decoded PCM. **A file labelled *unmodified* must be byte-identical, not nearly
 * identical** — and a reference whose level differs from the music inside the candidates is not a valid
 * control, however small the error.
 *
 * This returns the already-decoded int16 payload verbatim, so the reference IS the decoded audio.
 */
export function pcmPayloadWav(payload: Buffer, sampleRate: number, channels = 1): Buffer {
  const bitsPerSample = 16;
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  header.write("RIFF", 0); header.writeUInt32LE(36 + payload.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32); header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36); header.writeUInt32LE(payload.length, 40);
  return Buffer.concat([header, payload]);
}

/** write a mono 16-bit WAV */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i]! * 32767))), 44 + i * 2);
  return buf;
}

/**
 * Music + a click at every detected beat.
 *
 * @param downbeatTimes when supplied, those beats get a **louder, higher** click so a listener can distinguish
 *   beat from bar. **If downbeat confidence is LOW the caller must not pass them** — presenting an unestablished
 *   downbeat as established is the failure this parameter would otherwise invite.
 */
export function beatClickTrack(mono: Float64Array, beats: BeatEvent[], sampleRate: number, downbeatTimes?: number[], opts: Partial<AuditionOptions> = {}): Buffer {
  const o: AuditionOptions = { ...DEFAULT_AUDITION, sampleRate, ...opts };
  const out = Float32Array.from(mono);
  const down = new Set((downbeatTimes ?? []).map((t) => Math.round(t * 1000)));
  for (const b of beats) {
    const isDown = down.has(Math.round(b.timeSeconds * 1000));
    mixClick(out, b.timeSeconds, { ...o, frequencyHz: isDown ? o.frequencyHz * 1.6 : o.frequencyHz }, isDown ? 1.35 : 1);
  }
  return encodeWav(out, sampleRate);
}

/**
 * Music + a click at every detected ONSET — a SEPARATE diagnostic.
 *
 * ⚠ §11: beat clicks and onset clicks must not be mixed into one ambiguous file. **This exists specifically so
 * a listener can hear that BEAT ≠ ONSET.**
 */
export function onsetClickTrack(mono: Float64Array, onsets: OnsetEvent[], sampleRate: number, opts: Partial<AuditionOptions> = {}): Buffer {
  const o: AuditionOptions = { ...DEFAULT_AUDITION, sampleRate, frequencyHz: 2600, amplitude: 0.5, ...opts };
  const out = Float32Array.from(mono);
  for (const on of onsets) mixClick(out, on.timeSeconds, o, 0.5 + 0.5 * on.strength);
  return encodeWav(out, sampleRate);
}
