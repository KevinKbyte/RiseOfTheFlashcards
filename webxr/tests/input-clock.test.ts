// Requirement: slash (and palm-push) timing runs on the REAL elapsed frame time, never the game clock
// that cards.ts caps at MAX_DT = 0.1 s per frame (M1, spec S3: a slash needs >= 1.0 m/s). A frame
// hitch longer than 0.1 s must not shrink the measured time and inflate a slow hand's speed into a
// slash, and a real gap longer than SLASH_MAX_SAMPLE_GAP_S between samples must still cut the stroke,
// so a slow hand that drifts across an orb during a 0.25 s hitch picks nothing.
//
// Contract for src/flashcards/input-clock.ts (pure):
//   export function advanceInputClock(prevSeconds: number, deltaSeconds: number): number;
//     prevSeconds + deltaSeconds, UNCAPPED; a negative or non-finite delta advances by 0, so the
//     input clock never runs backwards or turns NaN. cards.ts keeps this clock beside the capped
//     game clock and passes it to CardSlash.step and CardUltimate.collect.
import { describe, expect, it } from 'vitest';
import { classifySlash, SLASH_MAX_SAMPLE_GAP_S, type SlashTarget } from '../src/flashcards/slash';
import { createSlashInput, stepSlashInput, type InputFrame } from '../src/flashcards/slash-input';
import type { Vec3 } from '../src/flashcards/spawn';

// Dynamic import so each test reports the missing module/export instead of one load error.
const inputClock: unknown = await import('../src/flashcards/input-clock.js').catch(() => ({}));

function advanceInputClock(prev: number, delta: number): number {
  const fn = (inputClock as Record<string, unknown>).advanceInputClock;
  if (typeof fn !== 'function') throw new Error('input-clock does not export advanceInputClock');
  return (fn as (p: number, d: number) => number)(prev, delta);
}

const GAME_MAX_DT = 0.1;
const DT = 1 / 72;
const Y = 1.2;
const Z = -0.5;
const at = (x: number): Vec3 => ({ x, y: Y, z: Z });
const ORB: SlashTarget = { id: 'a', pos: at(0), radius: 0.1 };

/** Feeds right-hand positions with per-frame deltas through a clock, collecting picks. */
function runHand(clock: (prev: number, d: number) => number, frames: { x: number; delta: number }[]): string[] {
  let state = createSlashInput();
  let t = 0;
  const picks: string[] = [];
  for (const f of frames) {
    t = clock(t, f.delta);
    const frame: InputFrame = { t, hands: { right: at(f.x) } };
    const r = stepSlashInput(state, frame, [ORB]);
    picks.push(...r.picks);
    state = r.state;
  }
  return picks;
}

// The hand appears at x = -0.2, then a 0.25 s hitch, then it is at x = 0.0 inside the orb:
// 0.2 m in 0.25 s real = 0.8 m/s (slow), but 0.2 m in a capped 0.1 s = 2 m/s.
const HITCH = 0.25;
const HITCH_FRAMES = [
  { x: -0.2, delta: DT },
  { x: 0.0, delta: HITCH },
];

// Covers: M1, S3
describe('advanceInputClock real frame time', () => {
  it('advances by the full delta of a hitch longer than the game MAX_DT', () => {
    expect(advanceInputClock(1, HITCH)).toBeCloseTo(1.25, 12);
    expect(advanceInputClock(1, HITCH)).toBeGreaterThan(1 + GAME_MAX_DT);
  });

  it('advances by an ordinary frame delta unchanged', () => {
    expect(advanceInputClock(2, DT)).toBeCloseTo(2 + DT, 12);
  });

  it('never runs backwards or turns NaN on a negative or non-finite delta', () => {
    expect(advanceInputClock(3, -0.5)).toBe(3);
    expect(advanceInputClock(3, Number.NaN)).toBe(3);
    expect(advanceInputClock(3, Number.POSITIVE_INFINITY)).toBe(3);
  });

  it('a slow hand across a 0.25 s hitch is not a slash on the real input clock', () => {
    expect(HITCH).toBeGreaterThan(SLASH_MAX_SAMPLE_GAP_S);
    expect(runHand(advanceInputClock, HITCH_FRAMES)).toEqual([]);
  });

  it('the same samples on the capped game clock would wrongly slash (the bug this clock prevents)', () => {
    const capped = (prev: number, d: number) => prev + Math.min(Math.max(d, 0), GAME_MAX_DT);
    expect(runHand(capped, HITCH_FRAMES)).toEqual(['a']);
    // Sanity on the pure classifier: real timestamps cut the path at the gap.
    const real = classifySlash([{ pos: at(-0.2), t: 0 }, { pos: at(0), t: HITCH }], [ORB]);
    expect(real.kind).toBe('none');
  });

  it('a fast slash at ordinary frame rate still hits on the input clock', () => {
    const frames = Array.from({ length: 41 }, (_, i) => ({ x: -0.4 + i * 1.5 * DT, delta: DT }));
    expect(runHand(advanceInputClock, frames)).toEqual(['a']);
  });
});

// Requirement: each frame splits ONE raw frame delta into two clocks (M1, S3): a capped game dt
// (<= MAX_GAME_DT = 0.1 s) that drives creep, telegraph and flash, and an UNCAPPED input clock that
// drives slash and palm-push timing. cards.ts calls stepFrameClocks once per frame and hands
// `dt`/`game` to the game consumers and `input` to CardSlash.step and CardUltimate.collect, so a
// hitch longer than 0.1 s slows the game but never shrinks the time the input classifiers see.
//
// Contract added to src/flashcards/input-clock.ts (pure):
//   export const MAX_GAME_DT = 0.1;
//   export interface FrameClocks { game: number; input: number }
//   export function stepFrameClocks(prev: FrameClocks, deltaSeconds: number): FrameClocks & { dt: number };
//     dt = delta clamped to [0, MAX_GAME_DT] (non-finite -> 0); game = prev.game + dt;
//     input = advanceInputClock(prev.input, delta). Never mutates prev.
interface FrameClocks {
  game: number;
  input: number;
}
function stepFrameClocks(prev: FrameClocks, delta: number): FrameClocks & { dt: number } {
  const fn = (inputClock as Record<string, unknown>).stepFrameClocks;
  if (typeof fn !== 'function') throw new Error('input-clock does not export stepFrameClocks');
  return (fn as (p: FrameClocks, d: number) => FrameClocks & { dt: number })(prev, delta);
}

// Covers: M1, S3
describe('stepFrameClocks capped game dt vs uncapped input time', () => {
  it('exports the game cap as 0.1 s', () => {
    expect((inputClock as Record<string, unknown>).MAX_GAME_DT).toBe(GAME_MAX_DT);
  });

  it('a 0.25 s hitch gives a capped game dt but the true input time', () => {
    const next = stepFrameClocks({ game: 5, input: 7 }, HITCH);
    expect(next.dt).toBeCloseTo(GAME_MAX_DT, 12);
    expect(next.game).toBeCloseTo(5 + GAME_MAX_DT, 12);
    expect(next.input).toBeCloseTo(7 + HITCH, 12);
  });

  it('an ordinary frame advances both clocks by the same delta', () => {
    const next = stepFrameClocks({ game: 1, input: 1 }, DT);
    expect(next.dt).toBeCloseTo(DT, 12);
    expect(next.game).toBeCloseTo(1 + DT, 12);
    expect(next.input).toBeCloseTo(1 + DT, 12);
  });

  it('a negative or non-finite delta advances neither clock and gives dt 0', () => {
    for (const d of [-0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(stepFrameClocks({ game: 2, input: 3 }, d)).toEqual({ game: 2, input: 3, dt: 0 });
    }
  });

  it('never mutates the previous clocks and keeps them diverged across hitches', () => {
    const start = { game: 0, input: 0 };
    let c: FrameClocks = start;
    for (const d of [DT, HITCH, DT, 0.5]) c = stepFrameClocks(c, d);
    expect(start).toEqual({ game: 0, input: 0 });
    expect(c.game).toBeCloseTo(2 * DT + 2 * GAME_MAX_DT, 12);
    expect(c.input).toBeCloseTo(2 * DT + HITCH + 0.5, 12);
  });
});
