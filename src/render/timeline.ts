/**
 * Timeline: maps a global frame index onto (shot, seconds into shot).
 *
 * The engine is frame-addressed, never wall-clock-addressed, which is what makes
 * the output identical across machines and lets us render a 4-second motion test
 * with exactly the same code path as the full 20-second film.
 */

import type { FilmSpec, ShotSpec } from "../domain/schema.js";

export interface FrameAddress {
  /** global frame index, 0-based */
  frame: number;
  /** index into film.shots */
  shotIndex: number;
  shot: ShotSpec;
  /** seconds into this shot */
  localTime: number;
  /** normalized 0..1 position within this shot */
  progress: number;
}

export interface ShotFrameRange {
  shotIndex: number;
  shot: ShotSpec;
  /** inclusive */
  firstFrame: number;
  /** exclusive */
  endFrame: number;
  frameCount: number;
}

export function totalFrames(film: FilmSpec): number {
  return Math.round(film.durationInSeconds * film.fps);
}

export function shotRanges(film: FilmSpec): ShotFrameRange[] {
  const total = totalFrames(film);
  return film.shots.map((shot, i) => {
    const first = Math.round(shot.start * film.fps);
    const last = i === film.shots.length - 1 ? total : Math.round((shot.start + shot.duration) * film.fps);
    const end = Math.max(first + 1, Math.min(total, last));
    return { shotIndex: i, shot, firstFrame: first, endFrame: end, frameCount: end - first };
  });
}

export function addressFrame(film: FilmSpec, frame: number): FrameAddress {
  const total = totalFrames(film);
  const f = Math.max(0, Math.min(total - 1, frame));
  const ranges = shotRanges(film);
  let chosen = ranges[0]!;
  for (const r of ranges) {
    if (f >= r.firstFrame && f < r.endFrame) {
      chosen = r;
      break;
    }
    if (f >= r.firstFrame) chosen = r;
  }
  const localFrames = f - chosen.firstFrame;
  const localTime = localFrames / film.fps;
  const progress = Math.max(0, Math.min(1, localTime / Math.max(1e-6, chosen.shot.duration)));
  return {
    frame: f,
    shotIndex: chosen.shotIndex,
    shot: chosen.shot,
    localTime,
    progress,
  };
}

/** Absolute film time of a frame, in seconds. */
export function frameTime(film: FilmSpec, frame: number): number {
  return frame / film.fps;
}

export interface FrameSelection {
  label: string;
  frame: number;
  shotIndex: number;
  /** the shot this frame belongs to */
  shot: ShotSpec;
  reason: string;
}

/**
 * Representative frames for the contact sheet: for every shot, the point where the
 * beat is most legible (usually just before the end of the shot, after the move
 * has completed).
 */
export function representativeFrames(film: FilmSpec): FrameSelection[] {
  const out: FrameSelection[] = [];
  for (const r of shotRanges(film)) {
    const picks: Array<{ u: number; reason: string }> = [
      { u: 0.06, reason: "opening state of the beat" },
      { u: 0.82, reason: "climax of the beat, after the authored move has resolved" },
    ];
    for (const p of picks) {
      const frame = Math.min(r.endFrame - 1, r.firstFrame + Math.round((r.endFrame - r.firstFrame - 1) * p.u));
      out.push({
        label: `shot-${r.shot.id}-u${String(Math.round(p.u * 100)).padStart(2, "0")}`,
        frame,
        shotIndex: r.shotIndex,
        shot: r.shot,
        reason: p.reason,
      });
    }
  }
  return out;
}
