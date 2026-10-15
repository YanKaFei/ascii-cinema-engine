/**
 * AUDIO TIME DOMAINS AND THE MASTER CLOCK.
 *
 * ⚠ WHY THIS FILE EXISTS FIRST. Phase 3's single most expensive defect class was **implicit timing domains**:
 * the 3.3J compiler resolved a causal landmark over the shot span, the film resolved it over the action
 * window, and the two disagreed by 57 frames from the same declared pair. Phase 4 inherits that lesson before
 * it analyses a single sample.
 *
 * **Every timing value carries or implies an explicit domain. Nothing is mixed casually.**
 */

export const AUDIO_TIME_DOMAINS = [
  /** the canonical authority: seconds from the beginning of the DECODED source */
  "audio-seconds",
  /** the lossless discrete reference */
  "audio-sample-index",
  /** musical pulse ordinal — ordinal only, never a coordinate */
  "musical-beat-index",
  /** bar ordinal */
  "musical-bar-index",
  /** progress 0..1 within a phrase */
  "phrase-local",
  /** progress 0..1 within a section */
  "section-local",
  /** video frame index — a RELATED domain, converted explicitly, never used for analysis */
  "video-frame",
] as const;
export type AudioTimeDomain = (typeof AUDIO_TIME_DOMAINS)[number];

/** A time value that announces its own domain. */
export interface TimeValue {
  value: number;
  domain: AudioTimeDomain;
}

export const t = (value: number, domain: AudioTimeDomain): TimeValue => ({ value, domain });

/**
 * THE MASTER AUDIO CLOCK.
 *
 * **Authority: seconds from the beginning of the decoded source, with sample index as the lossless discrete
 * reference.** Every conversion lives here, so no subsystem computes its own.
 */
export class AudioClock {
  constructor(public readonly sampleRate: number, public readonly channels: number, public readonly totalSamples: number) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error(`AudioClock: invalid sample rate ${sampleRate}`);
    if (!Number.isInteger(totalSamples) || totalSamples < 0) throw new Error(`AudioClock: invalid total samples ${totalSamples}`);
  }
  /** DURATION is derived from the discrete reference, not from a container header. */
  get durationSeconds(): number { return this.totalSamples / this.sampleRate; }
  secondsToSamples(s: number): number { return Math.round(s * this.sampleRate); }
  samplesToSeconds(n: number): number { return n / this.sampleRate; }
  /** video frames are a RELATED domain; the conversion is explicit and lives here */
  secondsToVideoFrame(s: number, fps: number): number { return Math.round(s * fps); }
  videoFrameToSeconds(f: number, fps: number): number { return f / fps; }
  /** beat ordinals are NOT coordinates; this only converts a KNOWN beat period */
  beatToSeconds(beatIndex: number, secondsPerBeat: number, originSeconds = 0): number { return originSeconds + beatIndex * secondsPerBeat; }
  /** progress within a span, for phrase-local and section-local domains */
  static localProgress(seconds: number, startSeconds: number, endSeconds: number): number {
    const span = endSeconds - startSeconds;
    if (!(span > 0)) return 0;
    return Math.max(0, Math.min(1, (seconds - startSeconds) / span));
  }
  /** clamp into the source's real extent */
  clampSeconds(s: number): number { return Math.max(0, Math.min(this.durationSeconds, s)); }
}

/** Assert a value is a usable time in the canonical domain. */
export function assertAudioSeconds(v: unknown, where: string): asserts v is number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new Error(`${where}: '${String(v)}' is not a finite non-negative time in audio-seconds`);
  }
}
