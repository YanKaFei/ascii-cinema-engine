import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { GlyphGrid } from "./GlyphGrid";

/**
 * AsciiFilm — the composition body.
 *
 * Geometry and look come from the engine's artifacts in public/renders/<slug>/:
 *   grid-meta.json  fps, size, duration, cell geometry, look
 *   grid.bin        the character decisions
 *
 * Constants below are only a Studio fallback so `remotion studio` opens on
 * something meaningful before the first engine render. The CLI always passes
 * --fps/--width/--height/--duration explicitly, so a render can never silently use
 * the fallback.
 */

export const FALLBACK_META = {
  slug: "loneliness",
  fps: 30,
  width: 1920,
  height: 1080,
  durationInSeconds: 20,
  cellW: 8,
  cellH: 9,
  gridFrameCount: 0,
  gridStartFrame: 0,
  look: {
    filmGrain: 0.03,
    vignette: 0.3,
    chromaticBloom: 0,
    scanlineHz: 0,
  },
};

export interface GridMetaFile {
  slug: string;
  fps: number;
  width: number;
  height: number;
  durationInSeconds: number;
  cellW: number;
  cellH: number;
  gridFrameCount: number;
  gridStartFrame: number;
  look?: {
    filmGrain: number;
    vignette: number;
    chromaticBloom: number;
    scanlineHz: number;
  };
}

const metaCache = new Map<string, GridMetaFile>();

export async function loadMeta(url: string): Promise<GridMetaFile> {
  const hit = metaCache.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const meta = (await res.json()) as GridMetaFile;
  metaCache.set(url, meta);
  return meta;
}

/**
 * Set REMOTION_DEBUG_SLATE=1 to burn a frame/time slate into the picture. Off by
 * default so no deliverable ever carries it.
 */
const SHOW_SLATE = false;

export const AsciiFilm: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const metaUrl = staticFile("renders/loneliness/grid-meta.json");
  const [meta, setMeta] = useState<GridMetaFile | null>(metaCache.get(metaUrl) ?? null);
  const [failed, setFailed] = useState(false);
  const [handle] = useState(() => delayRender("loading grid-meta.json"));

  useEffect(() => {
    let cancelled = false;
    loadMeta(metaUrl)
      .then((m) => {
        if (!cancelled) {
          setMeta(m);
          continueRender(handle);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          continueRender(handle);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [metaUrl, handle]);

  const m = meta ?? FALLBACK_META;
  const cols = Math.round(m.width / m.cellW);
  const rows = Math.round(m.height / m.cellH);
  const look = m.look ?? FALLBACK_META.look;

  if (failed) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          color: "#ff5f5f",
          fontFamily: "monospace",
          fontSize: 28,
          padding: 40,
          justifyContent: "flex-end",
        }}
      >
        <div>engine artifact missing: public/renders/loneliness/grid-meta.json</div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <GlyphGrid
        gridPath="renders/loneliness/grid.bin"
        cols={cols}
        rows={rows}
        cellW={m.cellW}
        cellH={m.cellH}
        width={m.width}
        height={m.height}
        startFrame={0}
        look={look}
      />
      {SHOW_SLATE ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "flex-start",
            padding: 18,
            fontFamily: "monospace",
            fontSize: 18,
            color: "#3a3a3a",
          }}
        >
          <div>
            f{String(frame).padStart(4, "0")} / t={(frame / fps).toFixed(2)}s
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
