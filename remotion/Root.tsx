import React from "react";
import { Composition, getStaticFiles } from "remotion";
import { AsciiFilm, FALLBACK_META } from "./AsciiFilm";

/**
 * Remotion entry point.
 *
 * Composition geometry is taken from the engine's grid-meta.json when present, so
 * the renderer is driven by the FilmSpec rather than by constants that could drift.
 * `getStaticFiles()` is synchronous and runs at bundle time, which is exactly when
 * the composition has to be declared.
 */

function readMetaFromStatic(): { fps: number; width: number; height: number; durationInSeconds: number } {
  try {
    const files = getStaticFiles();
    const hit = files.find((f) => f.name.endsWith("grid-meta.json"));
    if (hit) {
      const contents = (hit as unknown as { contents?: string }).contents;
      if (typeof contents === "string") {
        const parsed = JSON.parse(contents);
        return {
          fps: Number(parsed.fps) || FALLBACK_META.fps,
          width: Number(parsed.width) || FALLBACK_META.width,
          height: Number(parsed.height) || FALLBACK_META.height,
          durationInSeconds: Number(parsed.durationInSeconds) || FALLBACK_META.durationInSeconds,
        };
      }
    }
  } catch {
    // fall through
  }
  return {
    fps: FALLBACK_META.fps,
    width: FALLBACK_META.width,
    height: FALLBACK_META.height,
    durationInSeconds: FALLBACK_META.durationInSeconds,
  };
}

export const RemotionRoot: React.FC = () => {
  const meta = readMetaFromStatic();
  return (
    <Composition
      id="AsciiFilm"
      component={AsciiFilm}
      durationInFrames={Math.max(1, Math.round(meta.durationInSeconds * meta.fps))}
      fps={meta.fps}
      width={meta.width}
      height={meta.height}
    />
  );
};
