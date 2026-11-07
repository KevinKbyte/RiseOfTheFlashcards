// Requirement: an enemy strike is dodged when, at the impact (hit) frame, the player's head has moved
// >= 20 cm laterally or downward from a baseline frozen at telegraph onset (mean head position over the
// 1.5 s before onset); forward lean never counts as a dodge, samples after impact are ignored, and an
// undecidable strike (no baseline, no hit-frame sample) lands as a hit. Before impact the result is
// "pending" so the strike code can poll it. Units match encounter.ts: meters and seconds.
// M3/D7 IDs are prototype-local (plan doc 2026-10-28-vr-flashcard-game.md; no spec-cache home yet).
import { describe, expect, it } from 'vitest';
import {
  BASELINE_WINDOW_S,
  DODGE_THRESHOLD_M,
  HIT_FRAME_MAX_AGE_S,
  frozenBaseline,
  resolveDodge,
  type HeadSample,
  type StrikeTiming,
} from '../src/flashcards/dodge.js';

const HEAD_Y = 1.5;

function still(from: number, to: number, step = 0.1, pos = { x: 0, y: HEAD_Y, z: 0 }): HeadSample[] {
  const out: HeadSample[] = [];
  for (let i = 0; from + i * step <= to + 1e-9; i++) {
    out.push({ t: from + i * step, ...pos });
  }
  return out;
}

// Telegraph onset at t=10 s, 2 s telegraph (ENCOUNTER_DEFAULTS.telegraphSeconds), impact at t=12 s.
const STRIKE: StrikeTiming = { telegraphStart: 10, impactTime: 12 };

// Covers: M3, D7
describe('dodge: constants pinned from D7', () => {
  it('uses a 20 cm displacement threshold, a 1.5 s baseline window, and a 0.1 s hit-frame tolerance', () => {
    expect(DODGE_THRESHOLD_M).toBe(0.2);
    expect(BASELINE_WINDOW_S).toBe(1.5);
    expect(HIT_FRAME_MAX_AGE_S).toBe(0.1);
  });
});

// Covers: M3, D7
describe('dodge: frozen baseline', () => {
  it('is the mean head position over the 1.5 s before telegraph onset', () => {
    const samples: HeadSample[] = [
      { t: 8.5, x: 0, y: 1.4, z: 0 },
      { t: 9.5, x: 0.2, y: 1.6, z: -0.2 },
    ];
    const b = frozenBaseline(samples, 10);
    expect(b).not.toBeNull();
    expect(b!.x).toBeCloseTo(0.1, 9);
    expect(b!.y).toBeCloseTo(1.5, 9);
    expect(b!.z).toBeCloseTo(-0.1, 9);
  });

  it('ignores samples older than the window and samples at or after onset (frozen)', () => {
    const samples: HeadSample[] = [
      { t: 8.0, x: 5, y: 5, z: 5 }, // older than onset - 1.5 s
      { t: 9.0, x: 0, y: HEAD_Y, z: 0 },
      { t: 10.0, x: 5, y: 5, z: 5 }, // at onset: after freeze
      { t: 11.0, x: -5, y: -5, z: -5 }, // during telegraph
    ];
    expect(frozenBaseline(samples, 10)).toEqual({ x: 0, y: HEAD_Y, z: 0 });
  });

  it('includes a sample exactly at onset - 1.5 s (window start inclusive)', () => {
    const samples: HeadSample[] = [
      { t: 8.5, x: 0.4, y: HEAD_Y, z: 0 },
      { t: 9.5, x: 0, y: HEAD_Y, z: 0 },
    ];
    expect(frozenBaseline(samples, 10)!.x).toBeCloseTo(0.2, 9);
  });

  it('is null when no sample falls in the baseline window', () => {
    expect(frozenBaseline([], 10)).toBeNull();
    expect(frozenBaseline([{ t: 11, x: 0, y: HEAD_Y, z: 0 }], 10)).toBeNull();
  });
});

// Covers: M3, D7
describe('dodge: resolveDodge outcome', () => {
  it('standing still through the telegraph is a hit', () => {
    const r = resolveDodge(still(8, 12), STRIKE, 12);
    expect(r.outcome).toBe('hit');
    expect(r.displacement).toBeCloseTo(0, 9);
  });

  it('leaning 30 cm sideways by the hit frame is a dodge', () => {
    const samples = [...still(8, 11), { t: 12, x: 0.3, y: HEAD_Y, z: 0 }];
    const r = resolveDodge(samples, STRIKE, 12);
    expect(r.outcome).toBe('dodged');
    expect(r.displacement).toBeCloseTo(0.3, 9);
  });

  it('ducking 30 cm by the hit frame is a dodge', () => {
    const samples = [...still(8, 11), { t: 12, x: 0, y: HEAD_Y - 0.3, z: 0 }];
    expect(resolveDodge(samples, STRIKE, 12).outcome).toBe('dodged');
  });

  it('combines lateral and downward as Euclidean distance in the lateral/vertical plane', () => {
    // 0.15 lateral + 0.15 down = ~0.212 m >= 0.2, though neither axis alone reaches it.
    const samples = [...still(8, 11), { t: 12, x: 0.15, y: HEAD_Y - 0.15, z: 0 }];
    const r = resolveDodge(samples, STRIKE, 12);
    expect(r.outcome).toBe('dodged');
    expect(r.displacement).toBeCloseTo(Math.hypot(0.15, 0.15), 6);
  });

  it('ignores forward lean along the default play-forward axis (-Z)', () => {
    const samples = [...still(8, 11), { t: 12, x: 0, y: HEAD_Y, z: -0.5 }];
    const r = resolveDodge(samples, STRIKE, 12);
    expect(r.outcome).toBe('hit');
    expect(r.displacement).toBeCloseTo(0, 9);
  });

  it('drops the forward axis given by the strike, not world Z', () => {
    // Play-forward is +X here, so a 0.5 m move along X is forward lean (ignored)...
    const fwdX: StrikeTiming = { ...STRIKE, forward: { x: 1, z: 0 } };
    const lean = [...still(8, 11), { t: 12, x: 0.5, y: HEAD_Y, z: 0 }];
    expect(resolveDodge(lean, fwdX, 12).outcome).toBe('hit');
    // ...and a 0.3 m move along Z is lateral (dodge).
    const side = [...still(8, 11), { t: 12, x: 0, y: HEAD_Y, z: 0.3 }];
    expect(resolveDodge(side, fwdX, 12).outcome).toBe('dodged');
  });

  it('exactly 20 cm counts as a dodge (>= threshold)', () => {
    const samples = [...still(8, 11), { t: 12, x: 0.2, y: HEAD_Y, z: 0 }];
    expect(resolveDodge(samples, STRIKE, 12).outcome).toBe('dodged');
  });

  it('19 cm is a hit', () => {
    const samples = [...still(8, 11), { t: 12, x: 0.19, y: HEAD_Y, z: 0 }];
    expect(resolveDodge(samples, STRIKE, 12).outcome).toBe('hit');
  });

  it('judges only the hit frame: a lean that returns to center before impact is a hit', () => {
    const samples = [
      ...still(8, 10.5),
      { t: 11, x: 0.4, y: HEAD_Y, z: 0 },
      { t: 12, x: 0, y: HEAD_Y, z: 0 },
    ];
    expect(resolveDodge(samples, STRIKE, 12).outcome).toBe('hit');
  });

  it('a lean held from telegraph start through a 2 s telegraph is a dodge', () => {
    const samples = [...still(8, 9.9), ...still(10, 12, 0.1, { x: 0.25, y: HEAD_Y, z: 0 })];
    expect(resolveDodge(samples, STRIKE, 12).outcome).toBe('dodged');
  });

  it('ignores samples after impact (a late lean does not dodge)', () => {
    const samples = [...still(8, 12), { t: 12.05, x: 0.5, y: HEAD_Y, z: 0 }];
    expect(resolveDodge(samples, STRIKE, 12.5).outcome).toBe('hit');
  });

  it('is order-insensitive: shuffled samples give the same result', () => {
    const samples = [...still(8, 11), { t: 12, x: 0.3, y: HEAD_Y, z: 0 }];
    const reversed = samples.slice().reverse();
    expect(resolveDodge(reversed, STRIKE, 12)).toEqual(resolveDodge(samples, STRIKE, 12));
  });
});

// Covers: M3, D7
describe('dodge: undecidable strikes land as hits', () => {
  it('no samples at all -> hit with null displacement', () => {
    expect(resolveDodge([], STRIKE, 12)).toEqual({ outcome: 'hit', displacement: null });
  });

  it('no baseline samples (tracking began after onset) -> hit with null displacement', () => {
    const samples = still(10.5, 12, 0.1, { x: 0.5, y: HEAD_Y, z: 0 });
    expect(resolveDodge(samples, STRIKE, 12)).toEqual({ outcome: 'hit', displacement: null });
  });

  it('latest pre-impact sample older than 0.1 s -> hit with null displacement', () => {
    const samples = [...still(8, 11), { t: 11.85, x: 0.5, y: HEAD_Y, z: 0 }];
    expect(resolveDodge(samples, STRIKE, 12)).toEqual({ outcome: 'hit', displacement: null });
  });

  it('a sample exactly 0.1 s before impact still counts as the hit frame', () => {
    const samples = [...still(8, 11), { t: 11.9, x: 0.5, y: HEAD_Y, z: 0 }];
    expect(resolveDodge(samples, STRIKE, 12).outcome).toBe('dodged');
  });
});

// Covers: M3, D7
describe('dodge: pending before impact', () => {
  it('reports pending before the impact time, with the current displacement', () => {
    const samples = [...still(8, 10.9), { t: 11, x: 0.3, y: HEAD_Y, z: 0 }];
    const r = resolveDodge(samples, STRIKE, 11);
    expect(r.outcome).toBe('pending');
    expect(r.displacement).toBeCloseTo(0.3, 9);
  });

  it('pending carries null displacement when nothing is decidable yet', () => {
    expect(resolveDodge([], STRIKE, 11)).toEqual({ outcome: 'pending', displacement: null });
  });

  it('resolves (not pending) exactly at the impact time', () => {
    expect(resolveDodge(still(8, 12), STRIKE, 12).outcome).not.toBe('pending');
  });
});

// Covers: M3, D7
describe('dodge: telegraph shorter than a human reaction window', () => {
  // No special case: a short telegraph resolves by displacement like any other, so a player
  // already leaning at onset dodges and a standing player is hit (no auto-dodge outside the
  // accessibility toggle).
  const SHORT: StrikeTiming = { telegraphStart: 10, impactTime: 10.2 };

  it('a player already leaning before onset is still judged against the frozen baseline', () => {
    // Baseline window is upright; the lean starts at onset and is held at impact.
    const samples = [...still(8.5, 9.9), ...still(10, 10.2, 0.1, { x: 0.3, y: HEAD_Y, z: 0 })];
    expect(resolveDodge(samples, SHORT, 10.2).outcome).toBe('dodged');
  });

  it('a standing player is hit by a short telegraph', () => {
    expect(resolveDodge(still(8.5, 10.2), SHORT, 10.2).outcome).toBe('hit');
  });

  it('rejects a strike whose impact is not after telegraph onset', () => {
    expect(() => resolveDodge([], { telegraphStart: 10, impactTime: 10 }, 10)).toThrow(RangeError);
    expect(() => resolveDodge([], { telegraphStart: 10, impactTime: 9 }, 10)).toThrow(RangeError);
  });
});
