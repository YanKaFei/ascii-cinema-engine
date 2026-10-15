/** Thin wrappers around the bundled ffmpeg / ffprobe binaries. */

import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function run(
  bin: string,
  args: string[],
  opts: { input?: Uint8Array | string; cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));

    if (opts.input !== undefined) {
      child.stdin.write(opts.input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

export function probeVersion(bin: string): string {
  const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${bin} -version failed: ${r.stderr}`);
  return (r.stdout || "").split("\n")[0] ?? "";
}

/**
 * Encode a raw RGB24 stream into a video file.
 * `ffmpeg` is expected to be the bundled static build.
 */
export async function encodeRawRgbToMp4(opts: {
  ffmpeg: string;
  inputPath: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  crf: number;
  preset: string;
  inputFrameCount: number;
  env?: NodeJS.ProcessEnv;
}): Promise<RunResult> {
  const args = [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgb24",
    "-video_size",
    `${opts.width}x${opts.height}`,
    "-framerate",
    String(opts.fps),
    "-i",
    opts.inputPath,
    "-frames:v",
    String(opts.inputFrameCount),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    opts.preset,
    "-crf",
    String(opts.crf),
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-g",
    String(opts.fps * 2),
    "-movflags",
    "+faststart",
    opts.outputPath,
  ];
  const res = await run(opts.ffmpeg, args, { env: opts.env });
  if (res.code !== 0) {
    throw new Error(`ffmpeg encode failed (${res.code}):\n${res.stderr.slice(-4000)}`);
  }
  return res;
}

/** Encode one raw RGB frame to a PNG. */
export async function encodeRawRgbToPng(opts: {
  ffmpeg: string;
  input: Uint8Array;
  outputPath: string;
  width: number;
  height: number;
  env?: NodeJS.ProcessEnv;
}): Promise<RunResult> {
  const args = [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgb24",
    "-video_size",
    `${opts.width}x${opts.height}`,
    "-i",
    "pipe:0",
    "-frames:v",
    "1",
    "-compression_level",
    "6",
    "-pred",
    "mixed",
    opts.outputPath,
  ];
  const res = await run(opts.ffmpeg, args, { input: opts.input, env: opts.env });
  if (res.code !== 0) {
    throw new Error(`ffmpeg png encode failed (${res.code}):\n${res.stderr.slice(-2000)}`);
  }
  return res;
}

/** Run ffprobe and return parsed JSON for the first video stream. */
export async function ffprobeJson(
  ffprobe: string,
  file: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<any> {
  const res = await run(ffprobe, [
    "-hide_banner",
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    "-show_frames",
    "-select_streams",
    "v:0",
    file,
  ], { env });
  if (res.code !== 0) throw new Error(`ffprobe failed: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

/**
 * Fully decode a file to raw frames, discarding the output.
 * This is the "does it really decode" gate: it exercises every frame's bitstream.
 */
export async function fullDecodeCheck(opts: {
  ffmpeg: string;
  file: string;
  expectedWidth: number;
  expectedHeight: number;
  expectedFps: number;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  ok: boolean;
  decodedFrames: number;
  decodedSeconds: number;
  stderr: string;
  corruptFrames: number;
}> {
  // Full decode of every frame, re-encoded to PNG and written to a pipe we discard.
  //
  // Two constraints from the bundled ffmpeg shape this:
  //   * there is no rawvideo MUXER, so `-f rawvideo -` is impossible;
  //   * `-f null` fails with "Automatic encoder selection failed ... wrapped_avframe
  //     is probably disabled".
  // `-c:v png -f image2pipe -` satisfies both and genuinely decodes every frame's
  // bitstream (which is the point of the gate), and ffmpeg's final progress line
  // gives the authoritative decoded frame count.
  const args = [
    "-hide_banner",
    "-nostdin",
    "-v", "info",
    "-i", opts.file,
    "-an",
    "-c:v", "png",
    "-f", "image2pipe",
    "-",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(opts.ffmpeg, args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: opts.env ?? process.env,
    });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
      if (stderr.length > 4_000_000) stderr = stderr.slice(-2_000_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      // The final "frame=  N ..." progress line is the authoritative decode count.
      const matches = [...stderr.matchAll(/frame=\s*(\d+)/g)];
      const decodedFrames = matches.length > 0 ? Number(matches[matches.length - 1]![1]) : 0;

      const corruptPatterns = [
        /corrupt decoded frame/gi,
        /error while decoding/gi,
        /Invalid NAL/gi,
        /concealing \d+ errors/gi,
        /no frame!/gi,
        /Error submitting packet/gi,
        /non-existing PPS/gi,
        /decode_slice_header error/gi,
      ];
      let corrupt = 0;
      for (const p of corruptPatterns) {
        const m = stderr.match(p);
        if (m) corrupt += m.length;
      }

      resolve({
        ok: code === 0 && corrupt === 0 && decodedFrames > 0,
        decodedFrames,
        decodedSeconds: decodedFrames / opts.expectedFps,
        stderr: stderr.slice(-8000),
        corruptFrames: corrupt,
      });
    });
  });
}

export function whichFirst(candidates: string[]): string | undefined {
  for (const c of candidates) {
    const r = spawnSync(c, ["-version"], { encoding: "utf8" });
    if (r.status === 0) return c;
  }
  return undefined;
}

export const IS_MAC = process.platform === "darwin";

/**
 * Encode a raw RGB24 stream from a Node Readable directly into an MP4, with no
 * intermediate spool file.
 *
 * The engine used to write a full raw spool to disk first: 600 frames of
 * 1920x1080 RGB24 is 3.7 GB, which is both slow and needless. Piping keeps the
 * engine's memory flat and removes the temp file entirely, while still capturing
 * ffmpeg's full stderr for the report.
 */
export async function encodeRgbStreamToMp4(opts: {
  ffmpeg: string;
  input: NodeJS.ReadableStream;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  crf: number;
  preset: string;
  expectedFrames: number;
  env?: NodeJS.ProcessEnv;
  /**
   * Input container on the pipe. PNG is the only workable option with the bundled
   * ffmpeg: it is built without a rawvideo DEMUXER, so "-f rawvideo" fails with
   * "Unknown input format". `image2pipe` + the png decoder are both present.
   */
  inputFormat?: "png" | "rawvideo";
  onProgress?: (written: number) => void;
}): Promise<{ frames: number; stderr: string }> {
  const fmt = opts.inputFormat ?? "png";
  const inputArgs =
    fmt === "png"
      ? ["-f", "image2pipe", "-c:v", "png", "-framerate", String(opts.fps), "-i", "pipe:0"]
      : [
          "-f", "rawvideo",
          "-pixel_format", "rgb24",
          "-video_size", `${opts.width}x${opts.height}`,
          "-framerate", String(opts.fps),
          "-i", "pipe:0",
        ];
  const args = [
    "-hide_banner",
    "-nostdin",
    "-y",
    ...inputArgs,
    "-an",
    "-c:v", "libx264",
    "-preset", opts.preset,
    "-crf", String(opts.crf),
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level", "4.1",
    "-g", String(opts.fps * 2),
    "-movflags", "+faststart",
    opts.outputPath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(opts.ffmpeg, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: opts.env ?? process.env,
    });
    let stderr = "";
    let bytes = 0;
    const frameBytes = opts.width * opts.height * 3;

    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
      // keep only the tail; ffmpeg is chatty at -v info
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.stdout.on("data", () => {
      /* drain */
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg stream encode failed (${code}):\n${stderr.slice(-4000)}`));
        return;
      }
      // We know the exact frame count we fed in; deriving it from the byte count is
      // only meaningful for the raw RGB path.
      resolve({ frames: fmt === "png" ? opts.expectedFrames : Math.floor(bytes / frameBytes), stderr });
    });

    opts.input.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (opts.onProgress && fmt !== "png") opts.onProgress(Math.floor(bytes / frameBytes));
      if (!child.stdin.write(chunk)) {
        opts.input.pause();
        child.stdin.once("drain", () => opts.input.resume());
      }
    });
    opts.input.on("end", () => child.stdin.end());
    opts.input.on("error", reject);
    child.stdin.on("error", (err: NodeJS.ErrnoException) => {
      // EPIPE just means ffmpeg finished early; the close handler reports the truth
      if (err.code !== "EPIPE") reject(err);
    });
  });
}
