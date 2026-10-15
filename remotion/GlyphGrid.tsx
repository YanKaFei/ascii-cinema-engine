import React, { useCallback, useEffect, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { decodeGridbin, inkToDisplayUnit, type GridSequence } from "./gridbin";

/**
 * GlyphGrid — the Remotion half of the pipeline.
 *
 * Responsibilities are deliberately narrow: rasterize the engine's character grid
 * into a canvas, apply the compositing grade (vignette, grain, scanline) and hand
 * the result to Remotion's renderer. NO cinematography is recomputed here; the
 * engine already decided every character cell.
 *
 * GEOMETRY, which is the whole trick:
 * the canvas is authored at the OUTPUT resolution and each glyph cell is drawn into
 * exactly `cellW x cellH` device pixels (8x9 at 1080p). A 5x9 glyph bitmap has no
 * square subpixels on an 8x9 cell, so every lit subpixel is drawn as a
 * `cellW/5 x cellH/9` rectangle — 1.6 x 1 device pixels. Painting rectangles instead
 * of texels is what keeps the cell square and the type crisp. Scaling a 5x9-per-cell
 * texture up to 16:9 instead stretches every glyph horizontally, which reads as
 * venetian blinds.
 */

const cache = new Map<string, GridSequence>();

async function loadGrid(url: string): Promise<GridSequence> {
  const hit = cache.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  const seq = decodeGridbin(new Uint8Array(await res.arrayBuffer()));
  cache.set(url, seq);
  return seq;
}

export interface GlyphGridProps {
  gridPath: string;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  width: number;
  height: number;
  /** film frame that grid frame 0 corresponds to */
  startFrame?: number;
  look: {
    filmGrain: number;
    vignette: number;
    chromaticBloom: number;
    scanlineHz: number;
  };
}

export const GlyphGrid: React.FC<GlyphGridProps> = ({
  gridPath,
  cols,
  rows,
  cellW,
  cellH,
  width,
  height,
  startFrame = 0,
  look,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const url = staticFile(gridPath);
  const [seq, setSeq] = useState<GridSequence | null>(() => cache.get(url) ?? null);
  const [handle] = useState(() => delayRender(`loading ${gridPath}`));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGrid(url)
      .then((s) => {
        if (!cancelled) {
          setSeq(s);
          continueRender(handle);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          continueRender(handle);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, handle]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !seq) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    const gridFrame = frame + startFrame;
    if (gridFrame < 0 || gridFrame >= seq.frameCount) return;

    const subW = cellW / 5;
    const subH = cellH / 9;
    const cells = seq.cols * seq.rows;
    const base = gridFrame * cells;

    // Group by fill level so fillStyle is set once per distinct ink value rather
    // than once per lit subpixel. A busy frame has ~30k lit subpixels but only a few
    // hundred distinct levels.
    const byLevel = new Map<number, number[]>();
    for (let y = 0; y < seq.rows; y++) {
      for (let x = 0; x < seq.cols; x++) {
        const code = seq.codes[base + y * seq.cols + x]!;
        if (code <= 32) continue;
        const glyph = seq.glyphByCode.get(code);
        if (!glyph) continue;
        const level = Math.max(
          1,
          Math.round(inkToDisplayUnit(seq.values[base + y * seq.cols + x]! / 255) * 255),
        );
        let bucket = byLevel.get(level);
        if (!bucket) {
          bucket = [];
          byLevel.set(level, bucket);
        }
        const px0 = x * cellW;
        const py0 = y * cellH;
        for (let r = 0; r < 9; r++) {
          const mask = glyph.rows[r]!;
          if (mask === 0) continue;
          const py = py0 + r * subH;
          for (let c = 0; c < 5; c++) {
            if ((mask & (1 << (4 - c))) === 0) continue;
            bucket.push(px0 + c * subW, py);
          }
        }
      }
    }

    for (const [level, rects] of byLevel) {
      ctx.fillStyle = `rgb(${level},${level},${level})`;
      for (let i = 0; i < rects.length; i += 2) {
        ctx.fillRect(rects[i]!, rects[i + 1]!, subW, subH);
      }
    }
  }, [seq, frame, startFrame, cols, rows, cellW, cellH, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  const vignetteBg =
    look.vignette > 0
      ? `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) ${Math.round(
          (1 - look.vignette) * 100,
        )}%, rgba(0,0,0,${Math.min(0.95, look.vignette + 0.3)}) 100%)`
      : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: "100%", height: "100%", display: "block" }}
      />

      {vignetteBg ? <AbsoluteFill style={{ background: vignetteBg, pointerEvents: "none" }} /> : null}

      {look.scanlineHz > 0 ? (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,0.030) 0px, rgba(255,255,255,0.030) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px)",
            opacity: 0.6 + 0.4 * Math.sin((frame / fps) * look.scanlineHz * Math.PI * 2),
          }}
        />
      ) : null}

      {look.filmGrain > 0 ? <Grain amount={look.filmGrain} seed={frame} /> : null}

      {error ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "flex-start",
            padding: 40,
            color: "#ff5f5f",
            fontFamily: "monospace",
            fontSize: 28,
          }}
        >
          <div>grid load failed: {error}</div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * Deterministic film grain, seeded from the frame index only, so a re-render is
 * identical and the grain does not crawl between identical frames.
 *
 * Kept deliberately subtle: heavier settings on a mostly-black frame read as
 * horizontal banding rather than as grain.
 */
const Grain: React.FC<{ amount: number; seed: number }> = ({ amount, seed }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(size, size);
    let h = (seed * 1103515245 + 12345) >>> 0;
    for (let i = 0; i < size * size; i++) {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      const v = 128 + (((h >>> 16) & 0xff) - 128) * amount * 4;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    setSrc(canvas.toDataURL());
  }, [amount, seed]);

  if (!src) return null;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        backgroundImage: `url(${src})`,
        backgroundRepeat: "repeat",
        opacity: 0.18,
        mixBlendMode: "overlay",
      }}
    />
  );
};
