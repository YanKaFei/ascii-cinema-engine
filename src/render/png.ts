/**
 * Minimal, dependency-free PNG encoder (RGB8, non-interlaced, filter 0).
 *
 * The engine needs to write stills and contact sheets without pulling in an image
 * library, and the file has to be byte-identical across runs.
 */

import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc, false);
  return out;
}

export interface RgbImage {
  width: number;
  height: number;
  /** tightly packed RGB8, length = width*height*3 */
  data: Uint8Array;
}

/** Encode an RGB image as PNG bytes. */
export function encodePng(img: RgbImage): Uint8Array {
  const { width, height, data } = img;
  if (data.length !== width * height * 3) {
    throw new Error(`encodePng: data length ${data.length} != ${width * height * 3}`);
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width, false);
  dv.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // raw scanlines with a leading filter byte of 0
  const stride = width * 3;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Create an all-black RGB image. */
export function blackImage(width: number, height: number): RgbImage {
  return { width, height, data: new Uint8Array(width * height * 3) };
}

/**
 * Blit a source image into a destination at (dx, dy) using a max blend, so sheets
 * and composites never lose the brightest mark.
 */
export function blitMax(dst: RgbImage, src: RgbImage, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const so = (y * src.width + x) * 3;
      const to = (ty * dst.width + tx) * 3;
      for (let c = 0; c < 3; c++) {
        const v = src.data[so + c]!;
        if (v > dst.data[to + c]!) dst.data[to + c] = v;
      }
    }
  }
}

/** Draw a 1px-ish rectangle outline (used for contact-sheet gutters). */
export function strokeRect(
  img: RgbImage,
  x0: number,
  y0: number,
  w: number,
  h: number,
  thickness: number,
  level: number,
): void {
  for (let t = 0; t < thickness; t++) {
    const ys = [y0 + t, y0 + h - 1 - t];
    for (const y of ys) {
      if (y < 0 || y >= img.height) continue;
      for (let x = Math.max(0, x0); x < Math.min(img.width, x0 + w); x++) {
        const o = (y * img.width + x) * 3;
        img.data[o] = level;
        img.data[o + 1] = level;
        img.data[o + 2] = level;
      }
    }
    const xs = [x0 + t, x0 + w - 1 - t];
    for (const x of xs) {
      if (x < 0 || x >= img.width) continue;
      for (let y = Math.max(0, y0); y < Math.min(img.height, y0 + h); y++) {
        const o = (y * img.width + x) * 3;
        img.data[o] = level;
        img.data[o + 1] = level;
        img.data[o + 2] = level;
      }
    }
  }
}

/** Nearest-neighbour downscale, used to make contact-sheet thumbnails. */
export function downscale(src: RgbImage, targetW: number, targetH: number): RgbImage {
  const out = blackImage(targetW, targetH);
  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / targetH));
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / targetW));
      const so = (sy * src.width + sx) * 3;
      const to = (y * targetW + x) * 3;
      out.data[to] = src.data[so]!;
      out.data[to + 1] = src.data[so + 1]!;
      out.data[to + 2] = src.data[so + 2]!;
    }
  }
  return out;
}
