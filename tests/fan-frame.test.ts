// Requirement: once card enemies start parking in the fan, the fan stays put. Every enemy alive at
// the same time is placed from ONE shared fan frame (eye x/z + play-forward yaw) captured from the
// head when the first enemy of a non-empty field spawns; turning or moving the head while enemies
// are live never shifts where refills park, so a refill can never land on top of a live enemy and
// the fan never drifts. Only when the field is empty does the next spawn re-capture the frame from
// the live head. A degenerate (non-finite) head pose never replaces a good frame.
// Regression (w7 crowding, card-enemy-field.ts:159-161): each spawn placed its slot from the LIVE
// head yaw/eye. With slots 0..2 filled at yaw 0, clearing the centre enemy and refilling after a
// +35 deg head turn put the refill in slot 1 at world bearing +35 deg, exactly on top of the live
// slot-2 enemy.
//
// API contract added to src/flashcards/fan.ts (pure; metres, radians):
//   export type FanFrame = { eye: { x: number; z: number }; yawRad: number };
//   export function nextFanFrame(current: FanFrame | null, liveCount: number, head: FanFrame): FanFrame;
//     liveCount > 0 and current !== null -> returns `current` (same object);
//     otherwise captures `head` (equal values); non-finite head value -> `current` if any, else
//     the zero frame { eye: { x: 0, z: 0 }, yawRad: 0 }.
//   export function placeInFan(frame: FanFrame, occupied: ReadonlySet<number>,
//                              spawnBearingWorldRad: number, reach: number)
//     : { slot: number; x: number; z: number } | null;
//     slot = assignFanSlot(occupied, wrap(spawnBearingWorldRad - frame.yawRad));
//     x/z = fanSlotGoal(slot, frame.eye, frame.yawRad, reach); null when every slot is taken.
//   export function wrap(angleRad: number): number;   // same body as the private copies:
//     r = a % 2PI, then -2PI if r > PI, +2PI if r < -PI  -> result in [-PI, PI], PI and -PI kept.
// CARDS-* IDs are prototype-local (no spec-cache home yet).
import { describe, expect, it } from 'vitest';
import {
  ENEMY_FACE_WIDTH_M,
  type FanFrame,
  fanSlotGoal,
  nextFanFrame,
  placeInFan,
  wrap,
} from '../src/flashcards/fan.js';

const DEG = Math.PI / 180;
const REACH = 0.7;
const TOL = 1e-6;

function frame(x: number, z: number, yawRad: number): FanFrame {
  return { eye: { x, z }, yawRad };
}

// Covers: CARDS-011
describe('wrap', () => {
  it('leaves angles already inside [-PI, PI] unchanged', () => {
    for (const a of [0, 0.5, -0.5, 3, -3]) expect(wrap(a)).toBe(a);
  });

  it('keeps both endpoints PI and -PI as given', () => {
    expect(wrap(Math.PI)).toBe(Math.PI);
    expect(wrap(-Math.PI)).toBe(-Math.PI);
  });

  it('folds angles outside the range back into [-PI, PI]', () => {
    expect(wrap(2 * Math.PI + 0.25)).toBeCloseTo(0.25, 12);
    expect(wrap(-2 * Math.PI - 0.25)).toBeCloseTo(-0.25, 12);
    expect(wrap(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 12);
    expect(wrap(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1, 12);
    expect(wrap(7 * Math.PI + 0.3)).toBeCloseTo(-Math.PI + 0.3, 9);
  });

  it('always lands in [-PI, PI]', () => {
    for (let a = -20; a <= 20; a += 0.37) {
      const r = wrap(a);
      expect(r).toBeGreaterThanOrEqual(-Math.PI);
      expect(r).toBeLessThanOrEqual(Math.PI);
      expect(Math.cos(r)).toBeCloseTo(Math.cos(a), 9);
      expect(Math.sin(r)).toBeCloseTo(Math.sin(a), 9);
    }
  });
});

// Covers: CARDS-011
describe('nextFanFrame', () => {
  const HEAD = frame(0.3, -1.2, 35 * DEG);

  it('captures the head when there is no frame yet', () => {
    const f = nextFanFrame(null, 0, HEAD);
    expect(f.eye.x).toBe(0.3);
    expect(f.eye.z).toBe(-1.2);
    expect(f.yawRad).toBe(35 * DEG);
  });

  it('captures the head when there is no frame yet even if enemies are live', () => {
    const f = nextFanFrame(null, 2, HEAD);
    expect(f.eye).toEqual({ x: 0.3, z: -1.2 });
    expect(f.yawRad).toBe(35 * DEG);
  });

  it('returns the same frame object while any enemy is live', () => {
    const current = frame(0, 0, 0);
    for (const live of [1, 2, 3]) expect(nextFanFrame(current, live, HEAD)).toBe(current);
    expect(current).toEqual(frame(0, 0, 0));
  });

  it('re-captures from the head once the field is empty', () => {
    const current = frame(0, 0, 0);
    const f = nextFanFrame(current, 0, HEAD);
    expect(f.eye).toEqual({ x: 0.3, z: -1.2 });
    expect(f.yawRad).toBe(35 * DEG);
  });

  it('a non-finite head keeps the current frame, live or empty', () => {
    const current = frame(1, 2, 0.5);
    const bad = [
      frame(Number.NaN, 0, 0),
      frame(0, Number.POSITIVE_INFINITY, 0),
      frame(0, 0, Number.NEGATIVE_INFINITY),
    ];
    for (const head of bad) {
      expect(nextFanFrame(current, 0, head)).toBe(current);
      expect(nextFanFrame(current, 2, head)).toBe(current);
    }
  });

  it('a non-finite head with no frame yields the zero frame', () => {
    for (const head of [frame(Number.NaN, 0, 0), frame(0, Number.NaN, 0), frame(0, 0, Number.NaN)]) {
      for (const live of [0, 1]) {
        const f = nextFanFrame(null, live, head);
        expect(f.eye.x).toBe(0);
        expect(f.eye.z).toBe(0);
        expect(f.yawRad).toBe(0);
      }
    }
  });
});

// Covers: CARDS-011
describe('placeInFan', () => {
  it('places from the frame eye and yaw on the hold line', () => {
    const f = frame(1.5, -2, 0.4);
    const p = placeInFan(f, new Set(), 0.4, REACH);
    expect(p).not.toBeNull();
    const { slot, x, z } = p as { slot: number; x: number; z: number };
    expect(slot).toBe(1);
    const g = fanSlotGoal(1, f.eye, f.yawRad, REACH);
    expect(x).toBeCloseTo(g.x, 12);
    expect(z).toBeCloseTo(g.z, 12);
    expect(Math.hypot(x - f.eye.x, z - f.eye.z)).toBeCloseTo(REACH, 12);
  });

  it('chooses the slot from the spawn bearing relative to the frame yaw, not world zero', () => {
    const f = frame(0, 0, 35 * DEG);
    // World bearing 35 deg is straight ahead of a frame facing 35 deg.
    expect(placeInFan(f, new Set(), 35 * DEG, REACH)?.slot).toBe(1);
    // World bearing 0 is 35 deg to the right of that frame -> slot 0 (-35 deg).
    expect(placeInFan(f, new Set(), 0, REACH)?.slot).toBe(0);
    expect(placeInFan(f, new Set(), 70 * DEG, REACH)?.slot).toBe(2);
  });

  it('wraps the relative spawn bearing across +-PI', () => {
    const f = frame(0, 0, 179 * DEG);
    expect(placeInFan(f, new Set(), -179 * DEG, REACH)?.slot).toBe(1);
  });

  it('same-frame spawns get distinct slots', () => {
    const f = frame(0.2, -0.4, -1.1);
    const occupied = new Set<number>();
    const goals: Array<{ x: number; z: number }> = [];
    for (const b of [-1.1, -1.1, -1.1]) {
      const p = placeInFan(f, occupied, b, REACH);
      expect(p).not.toBeNull();
      const placed = p as { slot: number; x: number; z: number };
      expect(occupied.has(placed.slot)).toBe(false);
      occupied.add(placed.slot);
      goals.push(placed);
    }
    expect(occupied.size).toBe(3);
    for (let i = 0; i < goals.length; i++) {
      for (let j = i + 1; j < goals.length; j++) {
        const d = Math.hypot(goals[i].x - goals[j].x, goals[i].z - goals[j].z);
        expect(d).toBeGreaterThanOrEqual(ENEMY_FACE_WIDTH_M - TOL);
      }
    }
  });

  it('returns null when every slot is taken', () => {
    expect(placeInFan(frame(0, 0, 0), new Set([0, 1, 2]), 0, REACH)).toBeNull();
  });

  it('a freed slot is reusable', () => {
    const f = frame(0, 0, 0);
    const occupied = new Set([0, 1, 2]);
    occupied.delete(1);
    const p = placeInFan(f, occupied, 30 * DEG, REACH);
    expect(p?.slot).toBe(1);
    const g = fanSlotGoal(1, f.eye, 0, REACH);
    expect(p?.x).toBeCloseTo(g.x, 12);
    expect(p?.z).toBeCloseTo(g.z, 12);
  });

  it('does not mutate the occupied set', () => {
    const occupied = new Set([2]);
    placeInFan(frame(0, 0, 0), occupied, 0, REACH);
    expect([...occupied]).toEqual([2]);
  });

  it('treats a non-finite spawn bearing as straight ahead of the frame', () => {
    expect(placeInFan(frame(0, 0, 1), new Set(), Number.NaN, REACH)?.slot).toBe(1);
  });
});

// Covers: CARDS-011
describe('shared fan frame across refills (regression: w7 crowding)', () => {
  interface Live {
    id: number;
    slot: number;
    x: number;
    z: number;
  }

  function assertFan(live: readonly Live[], f: FanFrame): void {
    for (const e of live) {
      expect(Math.abs(Math.hypot(e.x - f.eye.x, e.z - f.eye.z) - REACH)).toBeLessThan(TOL);
    }
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const d = Math.hypot(live[i].x - live[j].x, live[i].z - live[j].z);
        expect(d).toBeGreaterThanOrEqual(ENEMY_FACE_WIDTH_M - TOL);
      }
    }
  }

  it('refills after head turns 0, +35, 0, +35 deg never overlap and never move the frame', () => {
    let current: FanFrame | null = null;
    let live: Live[] = [];
    let nextId = 0;

    // The head also drifts a little so a live-eye placement would be detectable too.
    const headAt = (yawDeg: number, step: number): FanFrame => frame(0.05 * step, 0.03 * step, yawDeg * DEG);

    const spawnOne = (head: FanFrame): void => {
      current = nextFanFrame(current, live.length, head);
      const occupied = new Set(live.map((e) => e.slot));
      // The enemy spawns where the player is looking: world bearing = live head yaw.
      const p = placeInFan(current, occupied, head.yawRad, REACH);
      expect(p).not.toBeNull();
      const placed = p as { slot: number; x: number; z: number };
      live.push({ id: nextId++, ...placed });
    };

    // Initial wave at yaw 0 on an empty field.
    const h0 = headAt(0, 0);
    for (let i = 0; i < 3; i++) spawnOne(h0);
    const captured = current as unknown as FanFrame;
    expect(captured.eye).toEqual({ x: 0, z: 0 });
    expect(captured.yawRad).toBe(0);
    expect(new Set(live.map((e) => e.slot)).size).toBe(3);
    assertFan(live, captured);

    // Refills: clear one enemy (rotating which), spawn a replacement after each head turn.
    const yawSeq = [35, 0, 35, 0, 35];
    for (let step = 1; step <= yawSeq.length; step++) {
      const victim = live[step % live.length];
      live = live.filter((e) => e.id !== victim.id);
      spawnOne(headAt(yawSeq[step - 1], step));
      expect(current).toBe(captured);
      expect(live.length).toBe(3);
      assertFan(live, captured);
      // The replacement takes exactly the freed slot.
      expect(live[live.length - 1].slot).toBe(victim.slot);
      expect(live[live.length - 1].x).toBeCloseTo(victim.x, 9);
      expect(live[live.length - 1].z).toBeCloseTo(victim.z, 9);
    }
  });

  it('the specific blocker case: centre refill after a +35 deg turn stays in the centre', () => {
    const f = nextFanFrame(null, 0, frame(0, 0, 0));
    const occupied = new Set<number>();
    const live: Array<{ slot: number; x: number; z: number }> = [];
    for (let i = 0; i < 3; i++) {
      const p = placeInFan(f, occupied, 0, REACH) as { slot: number; x: number; z: number };
      occupied.add(p.slot);
      live.push(p);
    }
    expect(occupied.size).toBe(3);
    const centre = live.find((e) => e.slot === 1) as { slot: number; x: number; z: number };
    const right = live.find((e) => e.slot === 2) as { slot: number; x: number; z: number };
    const remaining = live.filter((e) => e.slot !== 1);

    const head = frame(0, 0, 35 * DEG);
    const f2 = nextFanFrame(f, remaining.length, head);
    expect(f2).toBe(f);
    const refill = placeInFan(f2, new Set(remaining.map((e) => e.slot)), head.yawRad, REACH);
    expect(refill?.slot).toBe(1);
    expect(refill?.x).toBeCloseTo(centre.x, 12);
    expect(refill?.z).toBeCloseTo(centre.z, 12);
    const d = Math.hypot((refill?.x ?? Number.NaN) - right.x, (refill?.z ?? Number.NaN) - right.z);
    expect(d).toBeGreaterThanOrEqual(ENEMY_FACE_WIDTH_M - TOL);
  });

  it('once the field is empty the next spawn re-captures the frame from the head', () => {
    type Placed = { slot: number; x: number; z: number };
    let current: FanFrame | null = null;
    let live: Placed[] = [];
    current = nextFanFrame(current, live.length, frame(0, 0, 0));
    live.push(placeInFan(current, new Set(live.map((e) => e.slot)), 0, REACH) as Placed);
    const first = current;
    current = nextFanFrame(current, live.length, frame(9, 9, 1));
    live.push(placeInFan(current, new Set(live.map((e) => e.slot)), 0, REACH) as Placed);
    expect(current).toBe(first);
    expect(live).toHaveLength(2);

    live = [];
    const turned = frame(0.4, -0.6, 35 * DEG);
    current = nextFanFrame(current, live.length, turned);
    expect(current).not.toBe(first);
    expect(current.eye).toEqual({ x: 0.4, z: -0.6 });
    expect(current.yawRad).toBe(35 * DEG);
    const p = placeInFan(current, new Set(), turned.yawRad, REACH);
    expect(p?.slot).toBe(1);
    expect(p?.x).toBeCloseTo(0.4 - Math.sin(35 * DEG) * REACH, 12);
    expect(p?.z).toBeCloseTo(-0.6 - Math.cos(35 * DEG) * REACH, 12);
  });
});
