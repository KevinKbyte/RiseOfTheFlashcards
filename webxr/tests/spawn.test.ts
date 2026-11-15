// Requirement: card enemies emerge from the real walls of the player's room. Each spawn point lies
// on a detected wall, 1.2-3.5 m from the player's head (horizontally) and within 35 degrees either
// side of the direction the player is facing, and no two spawns sit closer than 15 degrees apart.
// When the room offers too few such wall points (or no walls at all), the remaining enemies spawn
// on a 2.5 m ring around the player, spread evenly across that same forward arc. Same inputs always
// give the same spawns.
//
// API contract for src/flashcards/spawn.ts (pure, no three.js; plain {x,y,z}, metres, radians):
//   export interface Vec3 { x: number; y: number; z: number }
//   export interface Wall { center: Vec3; normal: Vec3; width: number; height: number } // vertical plane
//   export interface HeadPose { position: Vec3; yawRad: number }
//   export interface SpawnPoint { position: Vec3; source: 'wall' | 'ring' }
//   export const SPAWN_MIN_DISTANCE = 1.2, SPAWN_MAX_DISTANCE = 3.5, SPAWN_HALF_ARC_DEG = 35,
//                SPAWN_MIN_BEARING_GAP_DEG = 15, RING_FALLBACK_DISTANCE = 2.5;
//   pickSpawns(walls: readonly Wall[], head: HeadPose, count: number): SpawnPoint[]  // length === count
// Yaw convention (three.js, Y up): yaw 0 faces -Z; the forward vector is (-sin yaw, 0, -cos yaw),
// so the bearing of a point is atan2(-(p.x - head.x), -(p.z - head.z)).
// Wall points satisfy distance, arc and the gap rule among wall spawns, and lie inside the wall
// rectangle. Ring points: k ring fills sit at head height, bearings yaw + (-35 + 70 * (i + 0.5) / k)
// degrees for i = 0..k-1 (the gap rule is not enforced between ring and wall spawns).
// RangeError: non-finite head yaw/position, count not an integer >= 0.
import { describe, expect, it } from 'vitest';
import {
  pickSpawns,
  RING_FALLBACK_DISTANCE,
  SPAWN_HALF_ARC_DEG,
  SPAWN_MAX_DISTANCE,
  SPAWN_MIN_BEARING_GAP_DEG,
  SPAWN_MIN_DISTANCE,
  type HeadPose,
  type SpawnPoint,
  type Vec3,
  type Wall,
} from '../src/flashcards/spawn.js';

const DEG = Math.PI / 180;
const EPS = 1e-6;
const HEAD: HeadPose = { position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 };

function wrap(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  else if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

function horizDist(p: Vec3, head: HeadPose): number {
  return Math.hypot(p.x - head.position.x, p.z - head.position.z);
}

/** Signed bearing of p relative to the head's facing, radians in [-PI, PI]. */
function relBearing(p: Vec3, head: HeadPose): number {
  const b = Math.atan2(-(p.x - head.position.x), -(p.z - head.position.z));
  return wrap(b - head.yawRad);
}

function onWall(p: Vec3, w: Wall): boolean {
  const dx = p.x - w.center.x;
  const dy = p.y - w.center.y;
  const dz = p.z - w.center.z;
  const n = Math.hypot(w.normal.x, w.normal.z);
  const nx = w.normal.x / n;
  const nz = w.normal.z / n;
  const planeDist = dx * nx + dz * nz;
  const along = dx * -nz + dz * nx; // horizontal tangent
  return (
    Math.abs(planeDist) < 1e-3 &&
    Math.abs(along) <= w.width / 2 + 1e-3 &&
    Math.abs(dy) <= w.height / 2 + 1e-3
  );
}

function bySource(spawns: SpawnPoint[], source: SpawnPoint['source']): SpawnPoint[] {
  return spawns.filter((s) => s.source === source);
}

function expectQualifyingWallSpawn(s: SpawnPoint, walls: Wall[], head: HeadPose): void {
  expect(walls.some((w) => onWall(s.position, w))).toBe(true);
  const d = horizDist(s.position, head);
  expect(d).toBeGreaterThanOrEqual(SPAWN_MIN_DISTANCE - EPS);
  expect(d).toBeLessThanOrEqual(SPAWN_MAX_DISTANCE + EPS);
  expect(Math.abs(relBearing(s.position, head))).toBeLessThanOrEqual(SPAWN_HALF_ARC_DEG * DEG + EPS);
}

function expectPairwiseGap(spawns: SpawnPoint[], head: HeadPose): void {
  for (let i = 0; i < spawns.length; i++) {
    for (let j = i + 1; j < spawns.length; j++) {
      const gap = Math.abs(wrap(relBearing(spawns[i].position, head) - relBearing(spawns[j].position, head)));
      expect(gap).toBeGreaterThanOrEqual(SPAWN_MIN_BEARING_GAP_DEG * DEG - EPS);
    }
  }
}

function expectRingBearings(ring: SpawnPoint[], head: HeadPose): void {
  const k = ring.length;
  const got = ring.map((s) => relBearing(s.position, head)).sort((a, b) => a - b);
  const want = Array.from({ length: k }, (_, i) => (-35 + (70 * (i + 0.5)) / k) * DEG);
  got.forEach((b, i) => expect(b).toBeCloseTo(want[i], 6));
  for (const s of ring) {
    expect(horizDist(s.position, head)).toBeCloseTo(RING_FALLBACK_DISTANCE, 6);
    expect(s.position.y).toBeCloseTo(head.position.y, 6);
  }
}

/** Vertical wall facing the player straight ahead (-Z) at the given distance. */
function wallAhead(dist: number, width: number): Wall {
  return { center: { x: 0, y: 1.5, z: -dist }, normal: { x: 0, y: 0, z: 1 }, width, height: 3 };
}

// Covers: CARDS-011
describe('spawn: constants', () => {
  it('exports the D8 spawn rule constants', () => {
    expect(SPAWN_MIN_DISTANCE).toBe(1.2);
    expect(SPAWN_MAX_DISTANCE).toBe(3.5);
    expect(SPAWN_HALF_ARC_DEG).toBe(35);
    expect(SPAWN_MIN_BEARING_GAP_DEG).toBe(15);
    expect(RING_FALLBACK_DISTANCE).toBe(2.5);
  });
});

// Covers: CARDS-011
describe('spawn: wall points', () => {
  it('a wide wall ahead supplies every spawn, all qualifying and >= 15 deg apart', () => {
    const walls = [wallAhead(2.5, 6)];
    const spawns = pickSpawns(walls, HEAD, 3);
    expect(spawns).toHaveLength(3);
    expect(bySource(spawns, 'wall')).toHaveLength(3);
    for (const s of spawns) expectQualifyingWallSpawn(s, walls, HEAD);
    expectPairwiseGap(spawns, HEAD);
  });

  it('respects head position and yaw (facing -X picks the -X wall, not the -Z one)', () => {
    const head: HeadPose = { position: { x: 1, y: 1.6, z: 1 }, yawRad: Math.PI / 2 };
    const sideWall: Wall = {
      center: { x: -1.5, y: 1.5, z: 1 },
      normal: { x: 1, y: 0, z: 0 },
      width: 6,
      height: 3,
    };
    const frontWall: Wall = { ...wallAhead(1.5, 6), center: { x: 1, y: 1.5, z: -1.5 } };
    const walls = [frontWall, sideWall];
    const spawns = pickSpawns(walls, head, 2);
    expect(bySource(spawns, 'wall')).toHaveLength(2);
    for (const s of spawns) {
      expectQualifyingWallSpawn(s, [sideWall], head);
      expect(onWall(s.position, frontWall)).toBe(false);
    }
    expectPairwiseGap(spawns, head);
  });

  it('a narrow wall fits one spawn; the rest fall back to the ring', () => {
    const walls = [wallAhead(2.5, 0.4)];
    const spawns = pickSpawns(walls, HEAD, 3);
    expect(spawns).toHaveLength(3);
    const wall = bySource(spawns, 'wall');
    expect(wall).toHaveLength(1);
    expectQualifyingWallSpawn(wall[0], walls, HEAD);
    expectRingBearings(bySource(spawns, 'ring'), HEAD);
  });

  it('a wall just inside the max distance qualifies', () => {
    const walls = [wallAhead(3.4, 0.4)];
    const spawns = pickSpawns(walls, HEAD, 1);
    expect(bySource(spawns, 'wall')).toHaveLength(1);
    expectQualifyingWallSpawn(spawns[0], walls, HEAD);
  });
});

// Covers: CARDS-011
describe('spawn: ring fallback', () => {
  it('no walls: all spawns on the 2.5 m ring, spread evenly across the arc', () => {
    const spawns = pickSpawns([], HEAD, 3);
    expect(spawns).toHaveLength(3);
    expect(bySource(spawns, 'ring')).toHaveLength(3);
    expectRingBearings(spawns, HEAD);
  });

  it('a single ring spawn sits straight ahead', () => {
    const spawns = pickSpawns([], HEAD, 1);
    expect(spawns[0].source).toBe('ring');
    expect(relBearing(spawns[0].position, HEAD)).toBeCloseTo(0, 6);
  });

  it('the ring follows head position and yaw', () => {
    const head: HeadPose = { position: { x: -2, y: 1.4, z: 3 }, yawRad: -2.5 };
    expectRingBearings(pickSpawns([], head, 4), head);
  });

  it('a wall behind the player is ignored', () => {
    const behind: Wall = { center: { x: 0, y: 1.5, z: 2.5 }, normal: { x: 0, y: 0, z: -1 }, width: 6, height: 3 };
    const spawns = pickSpawns([behind], HEAD, 2);
    expect(bySource(spawns, 'ring')).toHaveLength(2);
    expectRingBearings(spawns, HEAD);
  });

  it('a wall too close (under 1.2 m everywhere) is ignored', () => {
    const spawns = pickSpawns([wallAhead(0.8, 1)], HEAD, 2);
    expect(bySource(spawns, 'ring')).toHaveLength(2);
    expectRingBearings(spawns, HEAD);
  });

  it('a wall too far (beyond 3.5 m everywhere) is ignored', () => {
    const spawns = pickSpawns([wallAhead(3.6, 6)], HEAD, 2);
    expect(bySource(spawns, 'ring')).toHaveLength(2);
    expectRingBearings(spawns, HEAD);
  });
});

// Covers: CARDS-011
describe('spawn: edge cases and purity', () => {
  it('count 0 returns an empty list', () => {
    expect(pickSpawns([wallAhead(2.5, 6)], HEAD, 0)).toEqual([]);
    expect(pickSpawns([], HEAD, 0)).toEqual([]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('head yaw %s throws RangeError', (yawRad) => {
    expect(() => pickSpawns([], { ...HEAD, yawRad }, 1)).toThrow(RangeError);
  });

  it('a non-finite head position throws RangeError', () => {
    expect(() => pickSpawns([], { position: { x: Number.NaN, y: 1.6, z: 0 }, yawRad: 0 }, 1)).toThrow(
      RangeError,
    );
  });

  it.each([-1, 1.5, Number.NaN])('count %s throws RangeError', (count) => {
    expect(() => pickSpawns([], HEAD, count)).toThrow(RangeError);
  });

  it('is deterministic and does not mutate its inputs', () => {
    const walls = [wallAhead(2.5, 6), wallAhead(2.5, 0.4)];
    const head: HeadPose = { position: { x: 0.3, y: 1.6, z: -0.2 }, yawRad: 0.2 };
    const wallsBefore = structuredClone(walls);
    const headBefore = structuredClone(head);
    const a = pickSpawns(walls, head, 4);
    const b = pickSpawns(walls, head, 4);
    expect(a).toEqual(b);
    expect(walls).toEqual(wallsBefore);
    expect(head).toEqual(headBefore);
  });
});
