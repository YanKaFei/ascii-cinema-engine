/**
 * WAV DECODE — the only decode path needed, because ffmpeg normalises every input to `pcm_s16le` WAV first.
 *
 * Every conversion is RECORDED (see `audio-source.ts`), and the original file is never touched.
 */

export interface DecodedPcm {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  totalSamples: number;
  /** mono mixdown, the analysis signal */
  mono: Float64Array;
  /** per-channel data, kept for the contract's channel count and for future stereo features */
  channelData: Float64Array[];
  /** sha256 of the DECODED PCM bytes, which is not the same thing as the source hash */
  pcmHashInput: Buffer;
  /**
   * ⚠ THE RAW `data` CHUNK BYTES, for writing a bit-identical WAV back out.
   *
   * `pcmHashInput` is a **view** into the source buffer, so its `.byteOffset` is not zero and treating it as a
   * standalone buffer silently misaligns. The first attempt to reuse it hardcoded a 44-byte header offset,
   * which is wrong whenever a `LIST` chunk precedes `data` — it produced a **1.097** sample error. This is a
   * **copy**, so it is safe to concatenate.
   */
  pcmBytes: Buffer;
}

/** parse a RIFF/WAVE buffer. Supports PCM 16-bit and 32-bit float, which is what ffmpeg emits. */
export function decodeWav(buf: Buffer): DecodedPcm {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("decodeWav: not a RIFF/WAVE buffer — ffmpeg must normalise to pcm_s16le WAV first");
  }
  let pos = 12, fmt: { format: number; channels: number; sampleRate: number; bits: number } | undefined;
  let dataOffset = -1, dataLength = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === "data") { dataOffset = body; dataLength = Math.min(size, buf.length - body); }
    pos = body + size + (size % 2);
  }
  if (!fmt) throw new Error("decodeWav: no fmt chunk");
  if (dataOffset < 0) throw new Error("decodeWav: no data chunk");
  const { channels, sampleRate, bits, format } = fmt;
  const bytesPer = bits / 8;
  const frameBytes = bytesPer * channels;
  const totalSamples = Math.floor(dataLength / frameBytes);
  const channelData: Float64Array[] = Array.from({ length: channels }, () => new Float64Array(totalSamples));
  for (let f = 0; f < totalSamples; f++) {
    for (let c = 0; c < channels; c++) {
      const o = dataOffset + f * frameBytes + c * bytesPer;
      let v: number;
      if (format === 3) v = buf.readFloatLE(o);
      else if (bits === 16) v = buf.readInt16LE(o) / 32768;
      else if (bits === 24) { const b0 = buf[o]!, b1 = buf[o + 1]!, b2 = buf[o + 2]!; let x = (b2 << 16) | (b1 << 8) | b0; if (x & 0x800000) x -= 0x1000000; v = x / 8388608; }
      else if (bits === 32) v = buf.readInt32LE(o) / 2147483648;
      else throw new Error(`decodeWav: unsupported bit depth ${bits}`);
      channelData[c]![f] = v;
    }
  }
  const mono = new Float64Array(totalSamples);
  for (let f = 0; f < totalSamples; f++) { let s = 0; for (let c = 0; c < channels; c++) s += channelData[c]![f]!; mono[f] = s / channels; }
  return {
    sampleRate, channels, bitsPerSample: bits, totalSamples, mono, channelData,
    pcmHashInput: buf.subarray(dataOffset, dataOffset + dataLength),
    pcmBytes: Buffer.from(buf.subarray(dataOffset, dataOffset + dataLength)),
  };
}
