// Requirement: the player reveals a card-enemy by slashing it with a hand (M1). A tracked fingertip
// path counts as a slash only when it moves fast enough (>= 1.0 m/s, spec S3) over a long enough
// travel distance inside a short recent time window; idle drift, tiny twitches, a single sample or a
// tracking gap never count. A slash whose path passes through a target sphere (enemy/orb centre +
// radius) hits the target reached FIRST along the path; otherwise it is a miss. After a slash
// (hit or miss) a cooldown keeps one swing from registering as several slashes.
// Units: metres, seconds. All functions are pure; the caller supplies the last slash time.
import { describe, expect, it } from 'vitest';
import {
  classifySlash,
  SLASH_COOLDOWN_S,
  SLASH_MAX_SAMPLE_GAP_S,
  SLASH_MIN_DISTANCE,
  SLASH_MIN_SPEED,
  SLASH_WINDOW_S,
  type SlashSample,
  type SlashTarget,
} from '../src/flashcards/slash';

/** Straight-line samples along +x at y=1.2, z=-0.5, evenly spaced in time. */
function line(x0: number, x1: number, t0: number, t1: number, n: number): SlashSample[] {
  const out: SlashSample[] = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1);
    out.push({ pos: { x: x0 + (x1 - x0) * f, y: 1.2, z: -0.5 }, t: t0 + (t1 - t0) * f });
  }
  return out;
}

function target(id: string, x: number, radius = 0.1, dy = 0): SlashTarget {
  return { id, pos: { x, y: 1.2 + dy, z: -0.5 }, radius };
}

// Fast clean swipe: 0.4 m in 0.2 s (2 m/s), samples every 0.05 s.
const FAST = line(-0.2, 0.2, 0, 0.2, 5);

// Covers: M1, S3
describe('slash thresholds', () => {
  it('pins the spec speed threshold and sane named constants', () => {
    expect(SLASH_MIN_SPEED).toBe(1.0);
    expect(SLASH_MIN_DISTANCE).toBeGreaterThan(0);
    expect(SLASH_WINDOW_S).toBeGreaterThan(0);
    expect(SLASH_MAX_SAMPLE_GAP_S).toBeGreaterThan(0);
    expect(SLASH_MAX_SAMPLE_GAP_S).toBeLessThan(SLASH_WINDOW_S);
    expect(SLASH_COOLDOWN_S).toBeGreaterThan(0);
  });
});

// Covers: M1, S3
describe('classifySlash gesture detection', () => {
  it('fast swipe with no targets is a miss', () => {
    expect(classifySlash(FAST, [])).toEqual({ kind: 'miss' });
  });

  it('empty input is no slash', () => {
    expect(classifySlash([], [target('a', 0)])).toEqual({ kind: 'none' });
  });

  it('a single sample is no slash', () => {
    expect(classifySlash([FAST[0]], [target('a', -0.2)])).toEqual({ kind: 'none' });
  });

  it('too slow (0.2 m in 0.24 s, ~0.83 m/s) is no slash', () => {
    const slow = line(-0.1, 0.1, 0, 0.24, 4);
    expect(classifySlash(slow, [target('a', 0)])).toEqual({ kind: 'none' });
  });

  it('too short (fast twitch of 0.04 m) is no slash', () => {
    const twitch = line(0, 0.04, 0, 0.02, 3);
    expect(classifySlash(twitch, [target('a', 0.02)])).toEqual({ kind: 'none' });
  });

  it('exactly the minimum speed counts (>= 1.0 m/s)', () => {
    // 0.1875 m in 0.1875 s; binary-exact values so the boundary is not float noise.
    const s = [0.0625, 0.125, 0.1875, 0.25].map((v) => ({ pos: { x: v, y: 1.2, z: -0.5 }, t: v }));
    expect(SLASH_MIN_DISTANCE).toBeLessThanOrEqual(0.1875);
    expect(classifySlash(s, [])).toEqual({ kind: 'miss' });
  });

  it('only the recent time window counts: a long rest then a quick swipe is a slash', () => {
    const rest = line(0, 0, 0, 1.0, 11); // stationary for 1 s, samples every 0.1 s
    const swipe = line(0.05, 0.3, 1.05, 1.2, 4); // 0.3 m from x=0 in 0.2 s
    expect(classifySlash([...rest, ...swipe], [])).toEqual({ kind: 'miss' });
  });

  it('slow drift accumulated outside the window does not make a slash', () => {
    // 1 m of travel over 2 s (0.5 m/s), samples every 0.05 s.
    const drift = line(0, 1, 0, 2, 41);
    expect(classifySlash(drift, [])).toEqual({ kind: 'none' });
  });

  it('a tracking gap splits the path: only samples after the gap count', () => {
    const s: SlashSample[] = [
      { pos: { x: 0, y: 1.2, z: -0.5 }, t: 0 },
      { pos: { x: 0.05, y: 1.2, z: -0.5 }, t: 0.05 },
      // gap of 0.15 s > SLASH_MAX_SAMPLE_GAP_S
      { pos: { x: 0.3, y: 1.2, z: -0.5 }, t: 0.2 },
      { pos: { x: 0.33, y: 1.2, z: -0.5 }, t: 0.22 },
    ];
    expect(SLASH_MAX_SAMPLE_GAP_S).toBeLessThan(0.15);
    expect(classifySlash(s, [target('a', 0.15, 0.05)])).toEqual({ kind: 'none' });
  });

  it('two samples straddling a gap are no slash', () => {
    const s = line(-0.2, 0.2, 0, 0.2, 2); // 2 m/s but 0.2 s between samples
    expect(classifySlash(s, [target('a', 0)])).toEqual({ kind: 'none' });
  });

  it('samples sharing one timestamp are no slash (no divide-by-zero)', () => {
    const s = [
      { pos: { x: 0, y: 1.2, z: -0.5 }, t: 1 },
      { pos: { x: 0.5, y: 1.2, z: -0.5 }, t: 1 },
    ];
    expect(classifySlash(s, [])).toEqual({ kind: 'none' });
  });

  it('non-finite sample coordinates are no slash', () => {
    const s = FAST.map((p, i) => (i === 2 ? { pos: { ...p.pos, x: Number.NaN }, t: p.t } : p));
    expect(classifySlash(s, [target('a', 0)])).toEqual({ kind: 'none' });
  });
});

// Covers: M1, S3
describe('classifySlash target intersection', () => {
  it('path through a target centre hits it', () => {
    expect(classifySlash(FAST, [target('enemy-1', 0)])).toEqual({ kind: 'hit', targetId: 'enemy-1' });
  });

  it('hits a small target lying between two samples (segment test, not point test)', () => {
    const s = line(-0.15, 0.15, 0, 0.1, 2); // one 0.3 m segment, 3 m/s
    expect(classifySlash(s, [target('orb', 0, 0.03)])).toEqual({ kind: 'hit', targetId: 'orb' });
  });

  it('path passing just inside the radius hits; just outside misses', () => {
    expect(classifySlash(FAST, [target('a', 0, 0.2, 0.19)])).toEqual({ kind: 'hit', targetId: 'a' });
    expect(classifySlash(FAST, [target('a', 0, 0.2, 0.21)])).toEqual({ kind: 'miss' });
  });

  it('fast swipe that clears every target is a miss', () => {
    expect(classifySlash(FAST, [target('a', 0, 0.1, 0.5), target('b', 1.0)])).toEqual({
      kind: 'miss',
    });
  });

  it('with several targets on the path, hits the one reached first along the path', () => {
    const near = target('first', -0.1, 0.05);
    const far = target('second', 0.15, 0.05);
    expect(classifySlash(FAST, [far, near])).toEqual({ kind: 'hit', targetId: 'first' });
    expect(classifySlash(FAST, [near, far])).toEqual({ kind: 'hit', targetId: 'first' });
  });

  it('path order decides, not list order: reversing the swipe hits the other target', () => {
    const reversed = line(0.2, -0.2, 0, 0.2, 5);
    const left = target('left', -0.1, 0.05);
    const right = target('right', 0.15, 0.05);
    expect(classifySlash(reversed, [left, right])).toEqual({ kind: 'hit', targetId: 'right' });
  });

  it('a target crossed only before the time window is not hit', () => {
    // Slow approach through target 'old' at x=0 long ago, then a fast swipe far away from it.
    const approach = line(-0.5, 0.5, 0, 2, 41);
    const swipe = line(0.6, 0.9, 2.05, 2.2, 4);
    expect(classifySlash([...approach, ...swipe], [target('old', 0, 0.1)])).toEqual({
      kind: 'miss',
    });
  });

  it('does not mutate inputs', () => {
    const samples = line(-0.2, 0.2, 0, 0.2, 5);
    const targets = [target('a', 0)];
    const before = JSON.stringify({ samples, targets });
    classifySlash(samples, targets);
    expect(JSON.stringify({ samples, targets })).toBe(before);
  });
});

// Covers: M1
describe('classifySlash cooldown (one swing = one slash)', () => {
  it('a swing still in progress after a slash does not register again', () => {
    // Slash registered at t=0.2; next frame of the same swing arrives at t=0.25.
    const cont = [...FAST, { pos: { x: 0.3, y: 1.2, z: -0.5 }, t: 0.25 }];
    expect(classifySlash(cont, [target('a', 0.1)], 0.2)).toEqual({ kind: 'none' });
  });

  it('cooldown also suppresses misses', () => {
    expect(classifySlash(FAST, [], 0.1)).toEqual({ kind: 'none' });
  });

  it('a new swing after the cooldown has elapsed registers', () => {
    const last = 0.2 - SLASH_COOLDOWN_S - 0.05;
    expect(classifySlash(FAST, [target('a', 0)], last)).toEqual({ kind: 'hit', targetId: 'a' });
  });

  it('null last-slash time means no cooldown', () => {
    expect(classifySlash(FAST, [target('a', 0)], null)).toEqual({ kind: 'hit', targetId: 'a' });
  });
});
