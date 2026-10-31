// Requirement: the device probe turns raw timings and audio samples into the numbers its
// verdicts judge -- percentiles (linear interpolation), RMS loudness, and frame-rate p50/p5 --
// without mutating inputs and without inventing data when there is none. Frame-rate stats can
// skip the first N warm-up frames after a reset (shader compile / load hitches are not steady state).
import { describe, expect, it } from 'vitest';
import { fpsFromFrameDeltas, percentile, rms } from '../src/probe/stats.js';

// Covers: SPIKE-b, SPIKE-e
describe('percentile', () => {
  it('interpolates linearly between the two nearest ranks', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5, 10);
    expect(percentile([0, 10], 10)).toBeCloseTo(1, 10);
    expect(percentile([10, 20, 30, 40, 50], 25)).toBeCloseTo(20, 10);
  });

  it('returns the minimum at p=0 and the maximum at p=100', () => {
    expect(percentile([7, 3, 9, 1], 0)).toBe(1);
    expect(percentile([7, 3, 9, 1], 100)).toBe(9);
  });

  it('sorts before ranking, so input order does not matter', () => {
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([3, 5, 1], 50)).toBe(3);
  });

  it('does not mutate the input array', () => {
    const input = [5, 1, 4, 2, 3];
    percentile(input, 50);
    expect(input).toEqual([5, 1, 4, 2, 3]);
  });

  it('returns NaN for an empty array', () => {
    expect(percentile([], 50)).toBeNaN();
  });

  it('returns the single value for a one-element array at any p', () => {
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 5)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });

  it('throws RangeError for p below 0, above 100, or NaN', () => {
    expect(() => percentile([1, 2, 3], -1)).toThrow(RangeError);
    expect(() => percentile([1, 2, 3], 100.0001)).toThrow(RangeError);
    expect(() => percentile([1, 2, 3], Number.NaN)).toThrow(RangeError);
  });
});

// Covers: SPIKE-a
describe('rms', () => {
  it('is sqrt(mean(x^2))', () => {
    expect(rms([3, 4])).toBeCloseTo(Math.sqrt(12.5), 10);
    expect(rms([1, -1, 1, -1])).toBeCloseTo(1, 10);
  });

  it('accepts typed arrays (ArrayLike)', () => {
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5, 6);
  });

  it('is 0 for silence and for an empty buffer', () => {
    expect(rms([0, 0, 0])).toBe(0);
    expect(rms([])).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});

// Covers: SPIKE-e
describe('fpsFromFrameDeltas', () => {
  it('converts deltas to per-frame fps and reports p50, p5 and frame count', () => {
    // fps = [62.5, 50]; p50 = 56.25; p5 = 50 + 0.05 * 12.5 = 50.625
    const r = fpsFromFrameDeltas([16, 20]);
    expect(r.frames).toBe(2);
    expect(r.p50).toBeCloseTo(56.25, 10);
    expect(r.p5).toBeCloseTo(50.625, 10);
  });

  it('drops zero, negative and non-finite deltas before computing', () => {
    const r = fpsFromFrameDeltas([0, -5, Number.NaN, Number.POSITIVE_INFINITY, 10]);
    expect(r.frames).toBe(1);
    expect(r.p50).toBeCloseTo(100, 10);
    expect(r.p5).toBeCloseTo(100, 10);
  });

  it('returns NaN, NaN, 0 when no deltas survive', () => {
    for (const deltas of [[], [0, -1, Number.NaN]]) {
      const r = fpsFromFrameDeltas(deltas);
      expect(r.frames).toBe(0);
      expect(r.p50).toBeNaN();
      expect(r.p5).toBeNaN();
    }
  });

  it('does not mutate the input array', () => {
    const deltas = [20, 0, 16];
    fpsFromFrameDeltas(deltas);
    expect(deltas).toEqual([20, 0, 16]);
  });

  it('skipFirst ignores the first N raw deltas (warm-up after reset) before computing', () => {
    // 10 warm-up hitches at 100 ms (10 fps) then steady 16 ms (62.5 fps)
    const deltas = [...Array(10).fill(100), 16, 16, 16];
    const r = fpsFromFrameDeltas(deltas, 10);
    expect(r.frames).toBe(3);
    expect(r.p5).toBeCloseTo(62.5, 10);
    expect(r.p50).toBeCloseTo(62.5, 10);
  });

  it('skipFirst defaults to 0 (all deltas count)', () => {
    const deltas = [...Array(10).fill(100), 16, 16, 16];
    expect(fpsFromFrameDeltas(deltas).frames).toBe(13);
    expect(fpsFromFrameDeltas(deltas, 0).frames).toBe(13);
  });

  it('skipFirst counts raw positions, including deltas that would have been dropped', () => {
    const r = fpsFromFrameDeltas([0, Number.NaN, 100, 20], 2);
    expect(r.frames).toBe(2);
  });

  it('skipFirst at or beyond the input length yields NaN, NaN, 0', () => {
    for (const skip of [3, 50]) {
      const r = fpsFromFrameDeltas([16, 16, 16], skip);
      expect(r.frames).toBe(0);
      expect(r.p50).toBeNaN();
      expect(r.p5).toBeNaN();
    }
  });

  it('skipFirst does not mutate the input array', () => {
    const deltas = [100, 100, 16];
    fpsFromFrameDeltas(deltas, 2);
    expect(deltas).toEqual([100, 100, 16]);
  });
});
