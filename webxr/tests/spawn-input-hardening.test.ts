// Requirement: bad wall data can never stall or corrupt enemy spawning. A finite but absurdly wide
// wall (e.g. 1e6 m) is handled with bounded work rather than sampling it every 5 cm end to end, and
// pickSpawns still returns exactly `count` spawns. A wall with a non-finite centre, height or normal
// contributes no wall spawns, so every returned spawn has finite coordinates and the shortfall is
// filled from the 2.5 m ring fallback.
//
// API contract (src/flashcards/spawn.ts): pickSpawns(walls, head, count): SpawnPoint[], length === count.
import { describe, expect, it } from 'vitest';
import { pickSpawns, type HeadPose, type SpawnPoint, type Wall } from '../src/flashcards/spawn.js';

const HEAD: HeadPose = { position: { x: 0, y: 1.5, z: 0 }, yawRad: 0 };
// Bounded-work proxy: per-sample distance checks. A huge wall must not cost millions of them.
const WORK_BUDGET = 100_000;

function frontWall(over: Partial<Wall> = {}): Wall {
  return {
    center: { x: 0, y: 1.5, z: -2 },
    normal: { x: 0, y: 0, z: 1 },
    width: 2,
    height: 2.5,
    ...over,
  };
}

/** Runs fn with Math.hypot counted; throws as soon as the budget is exceeded. Always restores. */
function withHypotBudget<T>(budget: number, fn: () => T): { result: T; calls: number } {
  const original = Math.hypot;
  let calls = 0;
  Math.hypot = (...args: number[]): number => {
    calls += 1;
    if (calls > budget) throw new Error(`Math.hypot work budget ${budget} exceeded`);
    return original(...args);
  };
  try {
    return { result: fn(), calls };
  } finally {
    Math.hypot = original;
  }
}

function allFinite(spawns: SpawnPoint[]): boolean {
  return spawns.every((s) => [s.position.x, s.position.y, s.position.z].every(Number.isFinite));
}

// Covers: CARDS-011
describe('pickSpawns: huge walls cost bounded work', () => {
  it('a 1e6 m wide wall stays within the work budget and still returns exactly count spawns', () => {
    const { result } = withHypotBudget(WORK_BUDGET, () =>
      pickSpawns([frontWall({ width: 1e6 })], HEAD, 3),
    );
    expect(result).toHaveLength(3);
    expect(allFinite(result)).toBe(true);
  });
});

// Covers: CARDS-011
describe('pickSpawns: non-finite walls contribute no wall spawns', () => {
  it.each([
    ['NaN center.x', frontWall({ center: { x: Number.NaN, y: 1.5, z: -2 } })],
    ['NaN center.y', frontWall({ center: { x: 0, y: Number.NaN, z: -2 } })],
    ['NaN center.z', frontWall({ center: { x: 0, y: 1.5, z: Number.NaN } })],
    ['NaN height', frontWall({ height: Number.NaN })],
    ['Infinity normal.x', frontWall({ normal: { x: Number.POSITIVE_INFINITY, y: 0, z: 1 } })],
  ])('%s: no wall spawns, all spawns finite ring fills', (_label, wall) => {
    const spawns = pickSpawns([wall], HEAD, 2);
    expect(spawns).toHaveLength(2);
    expect(spawns.filter((s) => s.source === 'wall')).toHaveLength(0);
    expect(allFinite(spawns)).toBe(true);
  });

  it('a NaN wall next to a good wall: the good wall still supplies a finite wall spawn', () => {
    const bad = frontWall({ center: { x: Number.NaN, y: 1.5, z: -2 } });
    const spawns = pickSpawns([bad, frontWall()], HEAD, 1);
    expect(spawns).toHaveLength(1);
    expect(spawns[0].source).toBe('wall');
    expect(allFinite(spawns)).toBe(true);
  });
});
