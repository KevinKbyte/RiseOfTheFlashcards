/**
 * Pure statistics helpers for the device-spike probe (no DOM, no IWSDK).
 */

/** Linear-interpolated percentile over a sorted copy; input is not mutated. */
export function percentile(values: readonly number[], p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 100) {
    throw new RangeError(`percentile p must be within [0, 100], got ${p}`);
  }
  const n = values.length;
  if (n === 0) {
    return NaN;
  }
  if (n === 1) {
    return values[0];
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** Root mean square of a sample buffer; empty buffer -> 0. */
export function rms(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / n);
}

/**
 * Per-frame fps percentiles; the first `skipFirst` raw entries (warm-up after a reset) are skipped
 * by position, then non-positive or non-finite deltas are dropped.
 */
export function fpsFromFrameDeltas(
  deltasMs: readonly number[],
  skipFirst = 0,
): {
  p50: number;
  p5: number;
  frames: number;
} {
  const fps: number[] = [];
  for (const d of deltasMs.slice(skipFirst)) {
    if (Number.isFinite(d) && d > 0) {
      fps.push(1000 / d);
    }
  }
  if (fps.length === 0) {
    return { p50: NaN, p5: NaN, frames: 0 };
  }
  return {
    p50: percentile(fps, 50),
    p5: percentile(fps, 5),
    frames: fps.length,
  };
}
