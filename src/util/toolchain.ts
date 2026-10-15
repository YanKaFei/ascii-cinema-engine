/**
 * Locates the media toolchain.
 *
 * This engine needs a real ffmpeg and ffprobe for the verification gates (stills,
 * contact sheet, motion tests, encode, probe, full decode). Instead of adding a
 * second binary distribution, we reuse the ones Remotion already ships for its own
 * render pipeline (`@remotion/compositor-<platform>`), so the engine and the
 * renderer genuinely share one toolchain.
 *
 * Resolution order:
 *   1. FFMEG_BIN / FFPROBE_BIN env overrides
 *   2. the Remotion compositor package for this platform
 *   3. ffmpeg / ffprobe on PATH
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);

export interface MediaToolchain {
  ffmpeg: string;
  ffprobe: string;
  source: "env" | "remotion-compositor" | "path";
  /** ffmpeg version banner, first line */
  ffmpegVersion: string;
  ffprobeVersion: string;
  /**
   * Extra environment the binaries need in order to start.
   *
   * The Remotion compositor's ffmpeg links libav*.dylib by BARE NAME with no rpath
   * and no @loader_path, so it only resolves them via dyld's cwd fallback. That
   * silent dependency on the caller's working directory makes it work from a shell
   * and abort with SIGABRT (`Library not loaded: libavdevice.dylib`) when spawned
   * from Node with any other cwd. Setting DYLD_LIBRARY_PATH to the binary's own
   * directory is the fix; verification is the version probe, which must succeed.
   */
  env: NodeJS.ProcessEnv;
}

function platformPackageName(): string {
  const p = process.platform;
  const a = process.arch;
  if (p === "darwin") return `@remotion/compositor-darwin-${a}`;
  if (p === "win32") return `@remotion/compositor-win32-${a}`;
  return `@remotion/compositor-linux-${a}-gnu`;
}

function tryResolvePackageDir(pkg: string): string | undefined {
  try {
    return path.dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    return undefined;
  }
}

function libEnvFor(bin: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const dir = path.dirname(path.resolve(bin));
  const inherited = base.DYLD_LIBRARY_PATH ?? "";
  return {
    ...base,
    DYLD_LIBRARY_PATH: inherited ? `${dir}:${inherited}` : dir,
    // also cover Linux / generic loaders
    LD_LIBRARY_PATH: inherited ? `${dir}:${inherited}` : dir,
  };
}

function probe(bin: string): string | undefined {
  try {
    const r = spawnSync(bin, ["-hide_banner", "-version"], {
      encoding: "utf8",
      timeout: 20000,
      env: libEnvFor(bin),
    });
    if (r.status !== 0) return undefined;
    return (r.stdout || "").split("\n")[0];
  } catch {
    return undefined;
  }
}

function executableIn(dir: string, name: string): string | undefined {
  const candidate = path.join(dir, name);
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return undefined;
}

let cached: MediaToolchain | undefined;

export function resolveToolchain(): MediaToolchain {
  if (cached) return cached;

  const envFfmpeg = process.env.FFMPEG_BIN;
  const envFfprobe = process.env.FFPROBE_BIN;
  if (envFfmpeg && envFfprobe && existsSync(envFfmpeg) && existsSync(envFfprobe)) {
    const v = probe(envFfmpeg);
    if (v) {
      cached = {
        ffmpeg: envFfmpeg,
        ffprobe: envFfprobe,
        source: "env",
        ffmpegVersion: v,
        ffprobeVersion: probe(envFfprobe) ?? "unknown",
        env: libEnvFor(envFfmpeg),
      };
      return cached;
    }
  }

  const dir = tryResolvePackageDir(platformPackageName());
  if (dir) {
    const ffmpeg = executableIn(dir, "ffmpeg");
    const ffprobe = executableIn(dir, "ffprobe");
    if (ffmpeg && ffprobe) {
      const v = probe(ffmpeg);
      const pv = probe(ffprobe);
      if (v && pv) {
        cached = {
          ffmpeg,
          ffprobe,
          source: "remotion-compositor",
          ffmpegVersion: v,
          ffprobeVersion: pv,
          env: libEnvFor(ffmpeg),
        };
        return cached;
      }
    }
  }

  // Last resort: PATH
  const v = probe("ffmpeg");
  const pv = probe("ffprobe");
  if (v && pv) {
    cached = {
      ffmpeg: "ffmpeg",
      ffprobe: "ffprobe",
      source: "path",
      ffmpegVersion: v,
      ffprobeVersion: pv,
      env: process.env,
    };
    return cached;
  }

  throw new Error(
    "No usable ffmpeg/ffprobe found. Looked for the Remotion compositor package " +
      `(${platformPackageName()}) and for ffmpeg on PATH. ` +
      "Set FFMPEG_BIN and FFPROBE_BIN to override.",
  );
}

/** True when the toolchain lists a given capability in its build configuration. */
export function hasEncoder(versionBanner: string, encoder: string): boolean {
  return versionBanner.includes(`--enable-encoder=${encoder}`);
}

export function listCompositorVariants(): string[] {
  try {
    const nm = path.dirname(require.resolve("@remotion/renderer/package.json"));
    const root = path.dirname(nm);
    return readdirSync(root).filter((d) => d.startsWith("compositor-"));
  } catch {
    return [];
  }
}
