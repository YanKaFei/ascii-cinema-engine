/**
 * THE AUDIO SOURCE CONTRACT.
 *
 * ⚠ **Do not analyse a silently converted unknown file.** Every conversion is recorded, the original is
 * preserved, and the system can answer *"WHICH AUDIO DID THIS TIMELINE COME FROM?"* — §32.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface AudioSource {
  /** the path the user supplied. NEVER written to. */
  originalPath: string;
  /** sha256 of the ORIGINAL bytes */
  originalHash: string;
  originalBytes: number;
  /** the container/codec as the demuxer reported them */
  container: string;
  codec: string;
  /** the decoded intermediate, and the conversions performed to reach it */
  decodedPath: string;
  converted: boolean;
  conversions: string[];
  sampleRate: number;
  channels: number;
  bitDepth: number | null;
  /** DURATION comes from the DECODED SAMPLE COUNT, not from a container header */
  durationSeconds: number;
  totalSamples: number;
  /** sha256 of the DECODED PCM payload — a different question from the source hash */
  decodedPcmHash: string;
  /** analysis provenance */
  analysisVersion: string;
  configHash: string;
  analysisHash: string;
}

export interface DecodeResult {
  source: Omit<AudioSource, "analysisVersion" | "configHash" | "analysisHash">;
  pcmBuffer: Buffer;
}

export const sha256 = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");

/** build the source record once decoding is done, so nothing is inferred twice */
export function buildSource(args: {
  originalPath: string; originalHash: string; originalBytes: number;
  container: string; codec: string; decodedPath: string; conversions: string[];
  sampleRate: number; channels: number; bitDepth: number | null;
  totalSamples: number; decodedPcmHash: string;
}): DecodeResult["source"] {
  return {
    originalPath: args.originalPath,
    originalHash: args.originalHash,
    originalBytes: args.originalBytes,
    container: args.container,
    codec: args.codec,
    decodedPath: args.decodedPath,
    converted: args.conversions.length > 0,
    conversions: args.conversions,
    sampleRate: args.sampleRate,
    channels: args.channels,
    bitDepth: args.bitDepth,
    durationSeconds: +(args.totalSamples / args.sampleRate).toFixed(6),
    totalSamples: args.totalSamples,
    decodedPcmHash: args.decodedPcmHash,
  };
}

/** read the ORIGINAL without modifying it */
export async function hashFile(p: string): Promise<{ hash: string; bytes: number }> {
  const b = await readFile(p);
  return { hash: sha256(b), bytes: b.length };
}
