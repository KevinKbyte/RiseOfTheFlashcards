// Requirement: card enemies that have walked in never pile up into one blob in front of the
// player's face. Arrived enemies stand in three fixed head-relative slots at -35, 0 and +35 degrees
// from the play-forward direction, all on the hold line 0.7 m from the eye, so neighbouring 0.40 m
// wide faces (and their 0.20 m slash spheres) sit side by side without overlapping. Each new enemy
// takes the free slot nearest the bearing it spawned at; no two enemies ever share a slot, and a
// slot freed by a cleared enemy is reused by the next refill. The player still picks any enemy by
// slashing it by hand.
// Regression (w7 crowding): before the fan, every enemy parked at eye + bearing * 0.6 m with
// bearings only >= 15 degrees apart; the neighbour chord 2 * 0.6 * sin(7.5 deg) ~ 0.157 m is far
// below a 0.40 m face, so up to three faces overlapped into one blob 0.6 m from the head.
//
// API contract for src/flashcards/fan.ts (pure, no three.js / IWSDK; metres, radians unless *_DEG):
//   export const FAN_SLOT_BEARINGS_DEG: readonly number[];   // [-35, 0, 35], index = slot
//   export const ENEMY_FACE_WIDTH_M = 0.4;                   // 0.36 m card + 2 * 0.02 m rim
//   export const ENEMY_SLASH_RADIUS_M = 0.2;                 // card-slash enemy hit sphere
//   export function assignFanSlot(occupied: ReadonlySet<number>, spawnBearingRad: number): number | null;
//   export function fanSlotGoal(slot: number, eye: { x: number; z: number }, yawRad: number,
//                               reach: number): { x: number; z: number };
// Bearings are head-relative and follow src/flashcards/spawn.ts (three.js, Y up, yaw 0 faces -Z):
// a world point at bearing b (relative to yaw) lies at eye + (-sin(yaw + b), -cos(yaw + b)) * d.
// assignFanSlot: nearest free slot by wrapped angular distance; ties -> lowest index; all occupied
// -> null; non-finite bearing -> treated as 0; never mutates `occupied`. fanSlotGoal: RangeError
// for a slot index outside 0..2.
import { describe, expect, it } from 'vitest';
import { ENCOUNTER_DEFAULTS } from '../src/flashcards/encounter.js';
import {
  assignFanSlot,
  ENEMY_FACE_WIDTH_M,
  ENEMY_SLASH_RADIUS_M,
  FAN_SLOT_BEARINGS_DEG,
  fanSlotGoal,
} from '../src/flashcards/fan.js';

const DEG = Math.PI / 180;
const EPS = 1e-9;
const REACH = 0.7;

function chord(reach: number, gapDeg: number): number {
  return 2 * reach * Math.sin((gapDeg * DEG) / 2);
}

function wrap(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  else if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

// Covers: CARDS-011
describe('fan slot geometry', () => {
  it('has three fixed slots at -35, 0 and +35 degrees', () => {
    expect([...FAN_SLOT_BEARINGS_DEG]).toEqual([-35, 0, 35]);
  });

  it('enemy faces are 0.40 m wide and slash spheres 0.20 m in radius', () => {
    expect(ENEMY_FACE_WIDTH_M).toBeCloseTo(0.4, 12);
    expect(ENEMY_SLASH_RADIUS_M).toBeCloseTo(0.2, 12);
  });

  it('neighbouring slots at the 0.7 m hold line are at least one face width apart', () => {
    for (let i = 1; i < FAN_SLOT_BEARINGS_DEG.length; i++) {
      const gap = FAN_SLOT_BEARINGS_DEG[i] - FAN_SLOT_BEARINGS_DEG[i - 1];
      expect(chord(REACH, gap)).toBeGreaterThanOrEqual(ENEMY_FACE_WIDTH_M);
    }
  });

  it('neighbouring slash spheres at the 0.7 m hold line do not overlap', () => {
    for (let i = 1; i < FAN_SLOT_BEARINGS_DEG.length; i++) {
      const gap = FAN_SLOT_BEARINGS_DEG[i] - FAN_SLOT_BEARINGS_DEG[i - 1];
      expect(2 * ENEMY_SLASH_RADIUS_M).toBeLessThanOrEqual(chord(REACH, gap));
    }
  });

  it('the hold line used by the fan is the encounter reach distance', () => {
    expect(ENCOUNTER_DEFAULTS.reachDistance).toBe(REACH);
  });

  it('enemies strike from the 0.7 m hold line: strike distance equals reach (Kev 2026-11-11)', () => {
    expect(ENCOUNTER_DEFAULTS.reachDistance).toBeGreaterThanOrEqual(ENCOUNTER_DEFAULTS.strikeDistance);
    expect(ENCOUNTER_DEFAULTS.strikeDistance).toBe(REACH);
  });

  it('regression: the old 0.6 m line with a 15 degree gap overlapped faces', () => {
    expect(chord(0.6, 15)).toBeLessThan(ENEMY_FACE_WIDTH_M);
  });

  it('regression: even the 35 degree fan would overlap faces at the old 0.6 m line', () => {
    expect(chord(0.6, 35)).toBeLessThan(ENEMY_FACE_WIDTH_M);
  });
});

// Covers: CARDS-011
describe('assignFanSlot', () => {
  it('a centred spawn takes the centre slot when the fan is empty', () => {
    expect(assignFanSlot(new Set(), 0)).toBe(1);
  });

  it('picks the free slot nearest the spawn bearing', () => {
    expect(assignFanSlot(new Set(), -30 * DEG)).toBe(0);
    expect(assignFanSlot(new Set(), 30 * DEG)).toBe(2);
    expect(assignFanSlot(new Set(), 10 * DEG)).toBe(1);
    expect(assignFanSlot(new Set([1]), 10 * DEG)).toBe(2);
    expect(assignFanSlot(new Set([1]), -10 * DEG)).toBe(0);
    expect(assignFanSlot(new Set([2]), 34 * DEG)).toBe(1);
    expect(assignFanSlot(new Set([1, 2]), 35 * DEG)).toBe(0);
  });

  it('breaks an exact tie toward the lowest slot index', () => {
    expect(assignFanSlot(new Set([1]), 0)).toBe(0);
  });

  it('measures bearing distance with wrap-around', () => {
    expect(assignFanSlot(new Set(), 2 * Math.PI + 5 * DEG)).toBe(1);
    expect(assignFanSlot(new Set(), 179 * DEG)).toBe(2);
    expect(assignFanSlot(new Set(), -179 * DEG)).toBe(0);
  });

  it('returns null when all three slots are occupied, without throwing', () => {
    expect(assignFanSlot(new Set([0, 1, 2]), 0)).toBeNull();
    expect(assignFanSlot(new Set([0, 1, 2]), Number.NaN)).toBeNull();
  });

  it('treats a non-finite spawn bearing as straight ahead', () => {
    for (const b of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(assignFanSlot(new Set(), b)).toBe(1);
      expect(assignFanSlot(new Set([1]), b)).toBe(0);
      expect(assignFanSlot(new Set([0, 1]), b)).toBe(2);
    }
  });

  it('does not mutate the occupied set', () => {
    const occupied = new Set([1]);
    assignFanSlot(occupied, 0);
    expect([...occupied]).toEqual([1]);
  });

  it('a slot freed by a cleared enemy is reused by the next refill', () => {
    const occupied = new Set<number>();
    for (const b of [0, -20 * DEG, 20 * DEG]) {
      const s = assignFanSlot(occupied, b);
      expect(s).not.toBeNull();
      occupied.add(s as number);
    }
    expect(assignFanSlot(occupied, 0)).toBeNull();
    occupied.delete(0);
    expect(assignFanSlot(occupied, 30 * DEG)).toBe(0);
  });

  it('three sequential assignments always fill three distinct slots', () => {
    const samples = [-180, -90, -35, -20, -17.5, -5, 0, 5, 12, 17.5, 25, 35, 60, 179].map(
      (d) => d * DEG,
    );
    samples.push(Number.NaN);
    for (const a of samples) {
      for (const b of samples) {
        for (const c of samples) {
          const occupied = new Set<number>();
          for (const bearing of [a, b, c]) {
            const s = assignFanSlot(occupied, bearing);
            expect(s === 0 || s === 1 || s === 2).toBe(true);
            expect(occupied.has(s as number)).toBe(false);
            occupied.add(s as number);
          }
          expect(occupied.size).toBe(3);
          expect(assignFanSlot(occupied, a)).toBeNull();
        }
      }
    }
  });
});

// Covers: CARDS-011
describe('fanSlotGoal', () => {
  const EYE = { x: 1.5, z: -2 };

  it('the centre slot stands straight ahead at exactly the reach distance', () => {
    const g = fanSlotGoal(1, EYE, 0, REACH);
    expect(g.x).toBeCloseTo(EYE.x, 12);
    expect(g.z).toBeCloseTo(EYE.z - REACH, 12);
  });

  it('every slot sits on the hold line at its own head-relative bearing', () => {
    for (const yaw of [0, 0.4, -1.3, Math.PI]) {
      for (let slot = 0; slot < 3; slot++) {
        const g = fanSlotGoal(slot, EYE, yaw, REACH);
        const dx = g.x - EYE.x;
        const dz = g.z - EYE.z;
        expect(Math.hypot(dx, dz)).toBeCloseTo(REACH, 12);
        const bearing = wrap(Math.atan2(-dx, -dz) - yaw);
        expect(bearing).toBeCloseTo(FAN_SLOT_BEARINGS_DEG[slot] * DEG, 9);
      }
    }
  });

  it('the side slots are mirror images across the forward line', () => {
    const left = fanSlotGoal(0, EYE, 0, REACH);
    const right = fanSlotGoal(2, EYE, 0, REACH);
    expect(left.x - EYE.x).toBeCloseTo(-(right.x - EYE.x), 12);
    expect(left.z).toBeCloseTo(right.z, 12);
    expect(Math.abs(left.x - EYE.x)).toBeCloseTo(REACH * Math.sin(35 * DEG), 12);
    expect(left.z).toBeCloseTo(EYE.z - REACH * Math.cos(35 * DEG), 12);
  });

  it('slot 0 (-35 deg) is on +X and slot 2 (+35 deg) on -X at yaw 0, as in spawn.ts', () => {
    expect(fanSlotGoal(0, EYE, 0, REACH).x).toBeGreaterThan(EYE.x + EPS);
    expect(fanSlotGoal(2, EYE, 0, REACH).x).toBeLessThan(EYE.x - EPS);
  });

  it('turning the play-forward yaw rotates every goal about the eye', () => {
    for (const yaw of [Math.PI / 2, -0.7, 2.5]) {
      for (let slot = 0; slot < 3; slot++) {
        const base = fanSlotGoal(slot, EYE, 0, REACH);
        const bx = base.x - EYE.x;
        const bz = base.z - EYE.z;
        const g = fanSlotGoal(slot, EYE, yaw, REACH);
        expect(g.x - EYE.x).toBeCloseTo(bx * Math.cos(yaw) + bz * Math.sin(yaw), 12);
        expect(g.z - EYE.z).toBeCloseTo(-bx * Math.sin(yaw) + bz * Math.cos(yaw), 12);
      }
    }
  });

  it('yaw 90 degrees puts the centre slot on -X', () => {
    const g = fanSlotGoal(1, EYE, Math.PI / 2, REACH);
    expect(g.x).toBeCloseTo(EYE.x - REACH, 12);
    expect(g.z).toBeCloseTo(EYE.z, 12);
  });

  it('the goal scales with the reach distance passed in', () => {
    const g = fanSlotGoal(1, EYE, 0, 1.25);
    expect(g.z).toBeCloseTo(EYE.z - 1.25, 12);
  });

  it('rejects a slot index outside 0..2', () => {
    for (const slot of [-1, 3, 1.5, Number.NaN]) {
      expect(() => fanSlotGoal(slot, EYE, 0, REACH)).toThrow(RangeError);
    }
  });
});
