// Pure slash-gesture classifier (M1): decides whether a tracked fingertip path is a slash and which
// target sphere it hit first. No three.js; plain {x,y,z} in metres, time in seconds. The caller owns
// sample buffering and the last-slash time, so this stays stateless.
import type { Vec3 } from './spawn';

export interface SlashSample {
  pos: Vec3;
  t: number;
}

export interface SlashTarget {
  id: string;
  pos: Vec3;
  radius: number;
}

export type SlashResult = { kind: 'none' } | { kind: 'miss' } | { kind: 'hit'; targetId: string };

/** Spec S3: a slash needs at least 1.0 m/s. */
export const SLASH_MIN_SPEED = 1.0;
export const SLASH_MIN_DISTANCE = 0.15;
export const SLASH_WINDOW_S = 0.25;
/** A longer gap between samples means tracking was lost; the path restarts after it. */
export const SLASH_MAX_SAMPLE_GAP_S = 0.1;
export const SLASH_COOLDOWN_S = 0.4;

const NONE: SlashResult = { kind: 'none' };

function finiteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/** Parameter in [0,1] where segment a->b first touches the sphere, or null if it never does. */
function segmentEntry(a: Vec3, b: Vec3, c: Vec3, r: number): number | null {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
  const cc = fx * fx + fy * fy + fz * fz - r * r;
  if (cc <= 0) return 0;
  const aa = dx * dx + dy * dy + dz * dz;
  if (aa === 0) return null;
  const bb = 2 * (fx * dx + fy * dy + fz * dz);
  const disc = bb * bb - 4 * aa * cc;
  if (disc < 0) return null;
  const t = (-bb - Math.sqrt(disc)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}

/** Recent contiguous path: samples inside the time window, cut at the latest tracking gap. */
function recentPath(samples: SlashSample[]): SlashSample[] {
  const last = samples[samples.length - 1];
  const start = last.t - SLASH_WINDOW_S;
  let i = samples.length - 1;
  while (i > 0) {
    const prev = samples[i - 1];
    const dt = samples[i].t - prev.t;
    // Negated form so a NaN time also cuts the path.
    if (!(prev.t >= start) || !(dt >= 0 && dt <= SLASH_MAX_SAMPLE_GAP_S)) break;
    i--;
  }
  return samples.slice(i);
}

export function classifySlash(
  samples: SlashSample[],
  targets: SlashTarget[],
  lastSlashAt: number | null = null,
): SlashResult {
  if (samples.length < 2) return NONE;
  // Only the in-window path is validated: stale bad samples outside it never block a slash.
  const path = recentPath(samples);
  if (path.length < 2) return NONE;
  if (!path.every((s) => Number.isFinite(s.t) && finiteVec(s.pos))) return NONE;

  // A last-slash time after the newest sample (clock reset) or NaN applies no cooldown.
  const latest = path[path.length - 1].t;
  if (
    lastSlashAt !== null &&
    lastSlashAt <= latest &&
    latest - lastSlashAt < SLASH_COOLDOWN_S
  ) {
    return NONE;
  }

  const duration = path[path.length - 1].t - path[0].t;
  if (!(duration > 0)) return NONE;

  let length = 0;
  for (let i = 1; i < path.length; i++) length += dist(path[i - 1].pos, path[i].pos);
  if (length < SLASH_MIN_DISTANCE || length / duration < SLASH_MIN_SPEED) return NONE;

  // Segments are walked in path order, so the first segment with any entry holds the winner.
  // A slowly crossing segment cannot hit, even inside an otherwise fast window.
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (dist(a.pos, b.pos) / (b.t - a.t) < SLASH_MIN_SPEED) continue;
    let bestT = Infinity;
    let bestId: string | null = null;
    for (const tg of targets) {
      if (!finiteVec(tg.pos) || !Number.isFinite(tg.radius) || tg.radius <= 0) continue;
      const t = segmentEntry(path[i - 1].pos, path[i].pos, tg.pos, tg.radius);
      if (t !== null && t < bestT) {
        bestT = t;
        bestId = tg.id;
      }
    }
    if (bestId !== null) return { kind: 'hit', targetId: bestId };
  }
  return { kind: 'miss' };
}
