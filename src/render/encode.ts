/**
 * Pixel and file output: framebuffers, PNG stills, contact sheets, raw frame spools.
 *
 * All of this operates on the byte-exact GridSequence, so stills, contact sheets
 * and the encoded video are all generated from the same decisions.
 */

import { mkdir, writeFile, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { createFrameBuffer, rasterize, createCharGrid, type FrameBuffer } from "./raster.js";
import { GLYPH_BY_CODE } from "../glyphs/atlas.js";
import { blackImage, blitMax, downscale, encodePng, strokeRect, type RgbImage } from "./png.js";
import { inkToDisplayByte } from "./tone.js";
import type { GridSequence } from "./gridbin.js";
import type { FilmSpec } from "../domain/schema.js";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function fileSize(p: string): Promise<number> {
  try {
    return (await stat(p)).size;
  } catch {
    return -1;
  }
}

/**
 * Render one frame of a GridSequence into an RGB framebuffer, applying the shared
 * tone curve. This is the canonical "what does frame N look like" function.
 */
export function framebufferForFrame(
  seq: GridSequence,
  frameIndex: number,
  fb: FrameBuffer,
): FrameBuffer {
  const { cols, rows } = seq;
  const cells = cols * rows;
  const base = frameIndex * cells;
  const { data } = fb;

  // Background is authored as pure black; the byte buffer is cleared once.
  data.fill(0);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = base + y * cols + x;
      const code = seq.codes[i]!;
      if (code <= 32) continue;
      const value = seq.values[i]! / 255;
      const glyph = GLYPH_BY_CODE[code];
      if (!glyph || glyph.ch.charCodeAt(0) !== code) continue;
      const px0 = x * 8;
      const py0 = y * 9;
      const level = inkToDisplayByte(value);
      for (let r = 0; r < 9; r++) {
        const mask = glyph.rows[r]!;
        if (mask === 0) continue;
        const rowBase = (py0 + r) * fb.width * 3;
        for (let c = 0; c < 5; c++) {
          if ((mask & (1 << (4 - c))) === 0) continue;
          const o = rowBase + (px0 + c) * 3;
          data[o] = level;
          data[o + 1] = level;
          data[o + 2] = level;
        }
      }
    }
  }
  return fb;
}

export function frameBufferToRgbImage(fb: FrameBuffer): RgbImage {
  return { width: fb.width, height: fb.height, data: fb.data };
}

export function makeFrameBuffer(film: FilmSpec): FrameBuffer {
  return createFrameBuffer(film.width, film.height);
}

/** Write a still PNG for one frame. */
export async function writeStill(
  seq: GridSequence,
  film: FilmSpec,
  frameIndex: number,
  outPath: string,
): Promise<number> {
  const fb = createFrameBuffer(film.width, film.height);
  framebufferForFrame(seq, frameIndex, fb);
  const png = encodePng(frameBufferToRgbImage(fb));
  await ensureDir(path.dirname(outPath));
  await writeFile(outPath, png);
  return png.length;
}

export interface ContactSheetOptions {
  /** thumbnails per row */
  columns: number;
  thumbWidth: number;
  thumbHeight: number;
  gutter: number;
  /** border level 0..255 */
  border: number;
}

export interface ContactSheetEntry {
  frame: number;
  label: string;
  shotId: string;
  reason: string;
  /** ink coverage of the frame, for the report */
  coverage: number;
}

/**
 * Build a contact sheet: one thumbnail per requested frame, laid out on a black
 * field with a thin border so each still reads as a separate frame.
 */
export async function writeContactSheet(
  seq: GridSequence,
  shots: Array<{ frame: number; label: string; shotId: string; reason: string; coverage: number }>,
  outPath: string,
  opts: ContactSheetOptions,
): Promise<{ width: number; height: number; bytes: number; cellWidth: number; cellHeight: number }> {
  const n = shots.length;
  const columns = Math.min(opts.columns, Math.max(1, n));
  const rows = Math.ceil(n / columns);
  const cellW = opts.thumbWidth + opts.gutter * 2;
  const cellH = opts.thumbHeight + opts.gutter * 2;
  const width = columns * cellW;
  const height = rows * cellH;

  const sheet = blackImage(width, height);
  const fb = createFrameBuffer(seq.cols * 8, seq.rows * 9);

  for (let i = 0; i < n; i++) {
    const entry = shots[i]!;
    framebufferForFrame(seq, entry.frame, fb);
    const thumb = downscale(frameBufferToRgbImage(fb), opts.thumbWidth, opts.thumbHeight);
    const cx = (i % columns) * cellW + opts.gutter;
    const cy = Math.floor(i / columns) * cellH + opts.gutter;
    blitMax(sheet, thumb, cx, cy);
    strokeRect(sheet, cx - 1, cy - 1, opts.thumbWidth + 2, opts.thumbHeight + 2, 1, opts.border);
  }

  const png = encodePng(sheet);
  await ensureDir(path.dirname(outPath));
  await writeFile(outPath, png);
  return { width, height, bytes: png.length, cellWidth: cellW, cellHeight: cellH };
}

/**
 * Spool a frame range as raw RGB24 to a file. ffmpeg then encodes from that file,
 * which keeps the engine free of any video muxing and makes the encode step
 * independently re-runnable.
 */
export async function writeRawRgbSpool(
  seq: GridSequence,
  film: FilmSpec,
  startFrame: number,
  endFrame: number,
  outPath: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ frames: number; bytes: number; path: string }> {
  const frameBytes = film.width * film.height * 3;
  const count = endFrame - startFrame;
  const fb = createFrameBuffer(film.width, film.height);
  const buf = Buffer.allocUnsafe(frameBytes * count);

  for (let i = 0; i < count; i++) {
    framebufferForFrame(seq, startFrame + i, fb);
    Buffer.from(fb.data.buffer, fb.data.byteOffset, fb.data.byteLength).copy(buf, i * frameBytes);
    if (onProgress && (i % 30 === 0 || i === count - 1)) onProgress(i + 1, count);
  }

  await ensureDir(path.dirname(outPath));
  await writeFile(outPath, buf);
  return { frames: count, bytes: buf.length, path: outPath };
}

/** Remove a spool file, ignoring absence. */
export async function removeQuietly(p: string): Promise<void> {
  await rm(p, { force: true });
}

/** Read a GridSequence frame as ASCII text, for logs and reports. */
export function gridFrameToText(seq: GridSequence, frameIndex: number, inkThreshold = 1): string {
  const { cols, rows } = seq;
  const base = frameIndex * cols * rows;
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      const i = base + y * cols + x;
      const code = seq.codes[i]!;
      line += code > 32 && seq.values[i]! >= inkThreshold ? String.fromCharCode(code) : " ";
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines.join("\n");
}

/** A character grid for one frame, for callers that want to re-rasterize. */
export function gridSlice(seq: GridSequence, frameIndex: number) {
  const grid = createCharGrid(seq.cols, seq.rows);
  const base = frameIndex * seq.cols * seq.rows;
  for (let i = 0; i < seq.cols * seq.rows; i++) {
    const cell = grid.cells[i]!;
    cell.code = seq.codes[base + i]!;
    cell.ink = seq.values[base + i]! / 255;
  }
  return grid;
}

export { rasterize };


/**
 * Produce a Node Readable that yields the raw RGB24 bytes of a frame range, without
 * ever materialising the whole sequence in memory.
 *
 * Frames are generated lazily, a batch at a time, so peak memory is O(batch) rather
 * than O(frames * frameBytes).
 */
export function rgbFrameStream(
  seq: GridSequence,
  film: FilmSpec,
  startFrame: number,
  endFrame: number,
  batchFrames = 8,
): Readable {
  const frameBytes = film.width * film.height * 3;
  const total = endFrame - startFrame;
  let emitted = 0;

  return new Readable({
    highWaterMark: frameBytes * batchFrames,
    read(): void {
      if (emitted >= total) {
        this.push(null);
        return;
      }
      const n = Math.min(batchFrames, total - emitted);
      const buf = Buffer.allocUnsafe(frameBytes * n);
      const fb = createFrameBuffer(film.width, film.height);
      for (let i = 0; i < n; i++) {
        framebufferForFrame(seq, startFrame + emitted + i, fb);
        Buffer.from(fb.data.buffer, fb.data.byteOffset, fb.data.byteLength).copy(buf, i * frameBytes);
      }
      emitted += n;
      this.push(buf);
    },
  });
}

/**
 * Produce a Node Readable of PNG-encoded frames for a frame range.
 *
 * This is the frame feed for the encoder. PNG rather than raw RGB24 because the
 * bundled ffmpeg has NO rawvideo demuxer (it is built with a minimal muxer/demuxer
 * set), but it does have `image2pipe` and the PNG decoder. PNG also cuts the pipe
 * traffic by ~100x on this material, which is almost entirely black.
 */
export function pngFrameStream(
  seq: GridSequence,
  film: FilmSpec,
  startFrame: number,
  endFrame: number,
  batchFrames = 6,
): Readable {
  const total = endFrame - startFrame;
  let emitted = 0;

  return new Readable({
    highWaterMark: 1 << 22,
    read(): void {
      if (emitted >= total) {
        this.push(null);
        return;
      }
      const n = Math.min(batchFrames, total - emitted);
      const fb = createFrameBuffer(film.width, film.height);
      const chunks: Buffer[] = [];
      for (let i = 0; i < n; i++) {
        // startFrame MUST be added here; without it every sub-range re-encodes the
        // opening of the film and all motion tests come out byte-identical.
        framebufferForFrame(seq, startFrame + emitted + i, fb);
        chunks.push(Buffer.from(encodePng(frameBufferToRgbImage(fb))));
      }
      emitted += n;
      this.push(Buffer.concat(chunks));
    },
  });
}
