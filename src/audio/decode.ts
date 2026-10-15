/**
 * DECODE — source metadata, normalisation to PCM, and provenance.
 *
 * Every conversion is performed by ffmpeg into a temporary file and **recorded**. **The original is never
 * written to.**
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sha256, buildSource, hashFile, type DecodeResult } from "./audio-source.js";
import { decodeWav } from "./wav.js";

const pexec = promisify(execFile);

export interface FfTools { ffmpeg: string; ffprobe: string; libPath: string }

export interface ProbeResult {
  container: string; codec: string; sampleRate: number; channels: number; bitDepth: number | null;
  durationSeconds: number | null; streams: number; hasAudio: boolean;
}

/** ffprobe the ORIGINAL. Duration here is only informational — the authority is the decoded sample count. */
export async function probe(tools: FfTools, file: string): Promise<ProbeResult> {
  const { stdout } = await pexec(tools.ffprobe, ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { env: { ...process.env, DYLD_LIBRARY_PATH: tools.libPath } });
  const j = JSON.parse(stdout) as { format?: { format_name?: string; duration?: string }; streams?: { codec_type?: string; codec_name?: string; sample_rate?: string; channels?: number; bits_per_raw_sample?: string; bits_per_sample?: number }[] };
  const audio = (j.streams ?? []).find((s) => s.codec_type === "audio");
  if (!audio) throw new Error(`probe: no audio stream in ${file}`);
  return {
    container: j.format?.format_name ?? "unknown",
    codec: audio.codec_name ?? "unknown",
    sampleRate: Number(audio.sample_rate ?? 0),
    channels: audio.channels ?? 0,
    bitDepth: audio.bits_per_raw_sample ? Number(audio.bits_per_raw_sample) : audio.bits_per_sample ?? null,
    durationSeconds: j.format?.duration ? Number(j.format.duration) : null,
    streams: (j.streams ?? []).length,
    hasAudio: true,
  };
}

/**
 * Decode to `pcm_s16le` WAV at the source's own sample rate.
 *
 * **No resampling and no channel mixing are performed here** — those would be conversions that change the
 * analysis signal, and if one were needed it would have to be recorded. The sample rate is taken from the
 * probe and passed through unchanged.
 */
export async function decodeToPcm(tools: FfTools, file: string, sampleRate: number): Promise<{ pcm: Buffer; decodedPath: string; conversions: string[] }> {
  const dir = await mkdtemp(path.join(tmpdir(), "phase4a-"));
  const decodedPath = path.join(dir, "decoded.wav");
  const conversions: string[] = [];
  try {
    await pexec(tools.ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-vn", "-acodec", "pcm_s16le", "-ar", String(sampleRate), "-ac", "1", decodedPath], { env: { ...process.env, DYLD_LIBRARY_PATH: tools.libPath } });
    conversions.push(`container audio -> pcm_s16le WAV (ffmpeg), sample rate ${sampleRate} Hz, downmixed to 1 channel`);
    const pcm = await readFile(decodedPath);
    return { pcm, decodedPath, conversions };
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
}

/** the full source contract for one file */
export async function loadSource(tools: FfTools, file: string): Promise<{ result: DecodeResult; probeResult: ProbeResult }> {
  const { hash: originalHash, bytes: originalBytes } = await hashFile(file);
  const probeResult = await probe(tools, file);
  const srcRate = probeResult.sampleRate || 44100;
  const { pcm, decodedPath, conversions } = await decodeToPcm(tools, file, srcRate);
  const decoded = decodeWav(pcm);
  const source = buildSource({
    originalPath: file, originalHash, originalBytes,
    container: probeResult.container, codec: probeResult.codec,
    decodedPath, conversions,
    sampleRate: decoded.sampleRate, channels: 1, bitDepth: decoded.bitsPerSample,
    totalSamples: decoded.totalSamples,
    decodedPcmHash: sha256(Buffer.from(decoded.pcmHashInput)),
  });
  return { result: { source, pcmBuffer: pcm }, probeResult };
}
