// Pure dodge resolver for enemy strikes (M3/D7). Units match encounter.ts: meters and seconds.

export const DODGE_THRESHOLD_M = 0.2;
export const BASELINE_WINDOW_S = 1.5;
export const HIT_FRAME_MAX_AGE_S = 0.1;

// Absorbs float drift in generated sample times (e.g. 8 + 40 * 0.1 !== 12).
const TIME_EPS = 1e-9;

export interface HeadSample {
  t: number;
  x: number;
  y: number;
  z: number;
}

export interface StrikeTiming {
  telegraphStart: number;
  impactTime: number;
  /** Horizontal play-forward direction; movement along it never counts. Defaults to -Z. */
  forward?: { x: number; z: number };
}

export type DodgeOutcome = 'pending' | 'dodged' | 'hit';

export interface DodgeResult {
  outcome: DodgeOutcome;
  displacement: number | null;
}

export function frozenBaseline(
  samples: readonly HeadSample[],
  telegraphStart: number,
): { x: number; y: number; z: number } | null {
  const from = telegraphStart - BASELINE_WINDOW_S;
  let n = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const s of samples) {
    if (s.t >= from - TIME_EPS && s.t < telegraphStart) {
      n++;
      x += s.x;
      y += s.y;
      z += s.z;
    }
  }
  return n === 0 ? null : { x: x / n, y: y / n, z: z / n };
}

export function resolveDodge(
  samples: readonly HeadSample[],
  strike: StrikeTiming,
  now: number,
): DodgeResult {
  const { telegraphStart, impactTime } = strike;
  if (!(impactTime > telegraphStart)) {
    throw new RangeError('impactTime must be after telegraphStart');
  }
  const fwd = strike.forward ?? { x: 0, z: -1 };
  const len = Math.hypot(fwd.x, fwd.z);
  if (!Number.isFinite(len) || len === 0) {
    throw new RangeError('forward must be a finite, non-zero vector');
  }
  const pending = now < impactTime;
  const evalTime = pending ? now : impactTime;
  const undecided: DodgeResult = { outcome: pending ? 'pending' : 'hit', displacement: null };

  const baseline = frozenBaseline(samples, telegraphStart);
  if (!baseline) return undecided;

  let frame: HeadSample | null = null;
  for (const s of samples) {
    if (s.t <= evalTime + TIME_EPS && (!frame || s.t > frame.t)) frame = s;
  }
  if (!frame || evalTime - frame.t > HIT_FRAME_MAX_AGE_S + TIME_EPS) return undecided;

  const dx = frame.x - baseline.x;
  const dz = frame.z - baseline.z;
  // Horizontal component perpendicular to forward (2D cross product with the unit forward).
  const lateral = (dx * fwd.z - dz * fwd.x) / len;
  const displacement = Math.hypot(lateral, frame.y - baseline.y);

  if (pending) return { outcome: 'pending', displacement };
  return { outcome: displacement >= DODGE_THRESHOLD_M ? 'dodged' : 'hit', displacement };
}
