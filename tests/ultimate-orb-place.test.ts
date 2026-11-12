// Requirement: the ultimate orb (shown dim for the whole run, glowing at charge >= 5; S7, ledgers-2
// H-2, decisions-2 D17) stays within reach of a player who turns or recenters, without getting in
// the way of fighting. It is re-placed from the CURRENT head pose at
// ultimateOrbPosition(eye, yaw) (src/flashcards/panel-layout.ts: just right of the question panel,
// beyond the 0.7 m hold line) when the run starts (orb becomes visible) AND on each dim -> glowing
// transition (charge reaching 5). It never moves every frame: no re-place while it stays dim, while
// it stays glowing, when the glow is cleared by firing, or while it is hidden.
// Regression (w8 capture): the old spot eye + (0.35, -0.2, -0.45) sat in the reach path from a
// lap-rest hand to the right-side enemy, so the uncharged orb swallowed the press.
//
// Contract for src/flashcards/ultimate-orb-place.ts (pure, no DOM/IWSDK/three.js):
//   export interface OrbView { visible: boolean; glowing: boolean }  // ultimateOrb(run) shape
//   export function shouldPlaceOrb(prev: OrbView, curr: OrbView): boolean;
//     prev = last frame's view ({ visible: false, glowing: false } before any run). true iff curr is
//     visible AND (prev was hidden OR prev was not glowing and curr is glowing).
// card-ultimate.ts UltimateInput.syncOrb keeps the previous view, and (re)places the orb at
// ultimateOrbPosition(eye, headYaw) whenever shouldPlaceOrb is true.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@iwsdk/core', async () => ({ ...(await import('three')), RayInteractable: {} }));

import { Object3D, Vector3 } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { UltimateInput } from '../src/card-ultimate.js';
import * as layout from '../src/flashcards/panel-layout.js';
import type { Vec3 } from '../src/flashcards/spawn';

interface OrbView {
  visible: boolean;
  glowing: boolean;
}

// Dynamic import so each test reports the missing module/export instead of one load error.
const mod: Record<string, unknown> = await import('../src/flashcards/ultimate-orb-place.js').catch(() => ({}));

function need<T>(name: string): T {
  const v = mod[name];
  if (v === undefined) throw new Error(`ultimate-orb-place does not export ${name}`);
  return v as T;
}
const shouldPlaceOrb = (prev: OrbView, curr: OrbView): boolean =>
  need<(p: OrbView, c: OrbView) => boolean>('shouldPlaceOrb')(prev, curr);

function ultimateOrbPosition(eye: Vec3, yaw: number): Vec3 {
  const fn = (layout as Record<string, unknown>).ultimateOrbPosition;
  if (typeof fn !== 'function') throw new Error('panel-layout does not export ultimateOrbPosition');
  return (fn as (e: Vec3, y: number) => Vec3)(eye, yaw);
}

const HIDDEN: OrbView = { visible: false, glowing: false };
const DIM: OrbView = { visible: true, glowing: false };
const GLOW: OrbView = { visible: true, glowing: true };

/** src/flashcards/encounter.ts reachDistance (0.7 m hold line) + 0.2 m clearance. */
const MIN_ORB_REACH = 0.9;

interface FakeEntity {
  object3D: Object3D;
  disposed: boolean;
  addComponent: () => void;
  dispose: () => void;
}

function fakeWorld(): { world: World; created: FakeEntity[] } {
  const created: FakeEntity[] = [];
  const world = {
    createTransformEntity(obj: Object3D) {
      const e: FakeEntity = {
        object3D: obj,
        disposed: false,
        addComponent: () => {},
        dispose: () => {
          e.disposed = true;
        },
      };
      created.push(e);
      return e;
    },
  };
  return { world: world as unknown as World, created };
}

/** World position of the live (undisposed) orb entity. */
function orbAt(created: FakeEntity[]): Vec3 {
  const live = created.filter((e) => !e.disposed);
  expect(live.length, 'exactly one live orb').toBe(1);
  const p = live[0].object3D.position;
  return { x: p.x, y: p.y, z: p.z };
}

function expectVec(actual: Vec3, expected: Vec3, label = ''): void {
  expect(actual.x, `${label} x`).toBeCloseTo(expected.x, 9);
  expect(actual.y, `${label} y`).toBeCloseTo(expected.y, 9);
  expect(actual.z, `${label} z`).toBeCloseTo(expected.z, 9);
}

const POSES: [Vec3, number][] = [
  [{ x: 0, y: 1.6, z: 0 }, 0],
  [{ x: 0.3, y: 1.1, z: -0.4 }, 0.7],
  [{ x: 1, y: 1.7, z: -2 }, -1.9],
  [{ x: -0.5, y: 1.6, z: 0.8 }, Math.PI],
];

// Covers: S7, H-2, D17
describe('shouldPlaceOrb: re-place at run start and on charge reaching 5 only', () => {
  it('places when the run starts (hidden -> dim)', () => {
    expect(shouldPlaceOrb(HIDDEN, DIM)).toBe(true);
  });

  it('places when charge reaches 5 (dim -> glowing), so a turned player finds it again', () => {
    expect(shouldPlaceOrb(DIM, GLOW)).toBe(true);
  });

  it('places when the orb first appears already glowing', () => {
    expect(shouldPlaceOrb(HIDDEN, GLOW)).toBe(true);
  });

  it('does not move while it stays dim or stays glowing (not every frame)', () => {
    expect(shouldPlaceOrb(DIM, DIM)).toBe(false);
    expect(shouldPlaceOrb(GLOW, GLOW)).toBe(false);
  });

  it('does not move when firing clears the glow (glowing -> dim)', () => {
    expect(shouldPlaceOrb(GLOW, DIM)).toBe(false);
  });

  it('never places a hidden orb (no run or an ended run)', () => {
    expect(shouldPlaceOrb(HIDDEN, HIDDEN)).toBe(false);
    expect(shouldPlaceOrb(DIM, HIDDEN)).toBe(false);
    expect(shouldPlaceOrb(GLOW, HIDDEN)).toBe(false);
  });

  it('a dim -> glow -> fire -> recharge sequence places at start and at each recharge only', () => {
    const views = [HIDDEN, DIM, DIM, GLOW, GLOW, DIM, DIM, GLOW, HIDDEN, DIM];
    const placedAt: number[] = [];
    for (let i = 1; i < views.length; i++) if (shouldPlaceOrb(views[i - 1], views[i])) placedAt.push(i);
    expect(placedAt).toEqual([1, 3, 7, 9]);
  });
});

// Covers: S7, H-2
describe('card-ultimate places the orb at ultimateOrbPosition from the current head pose', () => {
  for (const [eye, yaw] of POSES) {
    it(`run start places it at ultimateOrbPosition (eye y ${eye.y}, yaw ${yaw.toFixed(2)})`, () => {
      const { world, created } = fakeWorld();
      const ult = new UltimateInput(world);
      ult.syncOrb(DIM, new Vector3(eye.x, eye.y, eye.z), yaw, 0);
      const p = orbAt(created);
      expectVec(p, ultimateOrbPosition(eye, yaw), 'orb');
      expect(Math.hypot(p.x - eye.x, p.z - eye.z), 'beyond the hold line').toBeGreaterThanOrEqual(MIN_ORB_REACH);
      ult.destroy();
    });
  }

  it('an orb that first appears glowing is placed at ultimateOrbPosition too', () => {
    const [eye, yaw] = POSES[2];
    const { world, created } = fakeWorld();
    const ult = new UltimateInput(world);
    ult.syncOrb(GLOW, new Vector3(eye.x, eye.y, eye.z), yaw, 0);
    expectVec(orbAt(created), ultimateOrbPosition(eye, yaw), 'orb');
    ult.destroy();
  });

  it('stays put while dim, re-places on charge reaching 5, stays put while glowing and after firing', () => {
    const [e0, y0] = POSES[0];
    const [e1, y1] = POSES[1];
    const [e2, y2] = POSES[2];
    const { world, created } = fakeWorld();
    const ult = new UltimateInput(world);
    const v = (e: Vec3) => new Vector3(e.x, e.y, e.z);

    ult.syncOrb(DIM, v(e0), y0, 0);
    const start = ultimateOrbPosition(e0, y0);
    ult.syncOrb(DIM, v(e1), y1, 0.1);
    expectVec(orbAt(created), start, 'still dim, head moved');

    ult.syncOrb(GLOW, v(e1), y1, 0.2);
    const charged = ultimateOrbPosition(e1, y1);
    expectVec(orbAt(created), charged, 'charge reached 5');

    ult.syncOrb(GLOW, v(e2), y2, 0.3);
    expectVec(orbAt(created), charged, 'still glowing, head moved');

    ult.syncOrb(DIM, v(e2), y2, 0.4);
    expectVec(orbAt(created), charged, 'fired');
    ult.destroy();
  });

  it('a hidden orb is removed, and a new run re-places it from the new head pose', () => {
    const [e0, y0] = POSES[0];
    const [e3, y3] = POSES[3];
    const { world, created } = fakeWorld();
    const ult = new UltimateInput(world);
    ult.syncOrb(DIM, new Vector3(e0.x, e0.y, e0.z), y0, 0);
    ult.syncOrb(HIDDEN, new Vector3(e0.x, e0.y, e0.z), y0, 0.1);
    expect(created.filter((e) => !e.disposed)).toHaveLength(0);
    ult.syncOrb(DIM, new Vector3(e3.x, e3.y, e3.z), y3, 0.2);
    expectVec(orbAt(created), ultimateOrbPosition(e3, y3), 'new run');
    ult.destroy();
  });

  it('never mutates the eye it is given', () => {
    const { world } = fakeWorld();
    const ult = new UltimateInput(world);
    const eye = new Vector3(0.3, 1.1, -0.4);
    ult.syncOrb(DIM, eye, 0.7, 0);
    expect([eye.x, eye.y, eye.z]).toEqual([0.3, 1.1, -0.4]);
    ult.destroy();
  });
});

// Regression (w8 review): a lost head pose (camera.getWorldPosition on a degenerate matrix) gives a
// non-finite eye; syncOrb must not throw in the frame loop, must never put the orb at a NaN spot,
// and must retry the skipped placement on the next frame whose eye is finite.
const BAD_EYES: [string, Vec3][] = [];
for (const axis of ['x', 'y', 'z'] as const) {
  for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    BAD_EYES.push([`${axis}=${v}`, { x: 0, y: 1.6, z: 0, [axis]: v }]);
  }
}

function expectFinite(p: Vec3, label: string): void {
  for (const k of ['x', 'y', 'z'] as const) expect(Number.isFinite(p[k]), `${label} ${k}=${p[k]}`).toBe(true);
}

// Covers: S7, H-2
describe('card-ultimate orb placement survives a lost head pose (non-finite eye)', () => {
  for (const [name, bad] of BAD_EYES) {
    it(`run start with eye ${name}: no throw, no NaN orb, placed once the eye is finite`, () => {
      const [eye, yaw] = POSES[1];
      const { world, created } = fakeWorld();
      const ult = new UltimateInput(world);
      expect(() => ult.syncOrb(DIM, new Vector3(bad.x, bad.y, bad.z), yaw, 0)).not.toThrow();
      expectFinite(orbAt(created), 'orb after lost pose');
      ult.syncOrb(DIM, new Vector3(eye.x, eye.y, eye.z), yaw, 0.1);
      expectVec(orbAt(created), ultimateOrbPosition(eye, yaw), 'retried placement');
      ult.destroy();
    });
  }

  it('charge reaching 5 during a lost pose re-places on the next finite frame', () => {
    const [e0, y0] = POSES[0];
    const [e2, y2] = POSES[2];
    const { world, created } = fakeWorld();
    const ult = new UltimateInput(world);
    ult.syncOrb(DIM, new Vector3(e0.x, e0.y, e0.z), y0, 0);
    const start = ultimateOrbPosition(e0, y0);
    expect(() => ult.syncOrb(GLOW, new Vector3(Number.NaN, Number.NaN, Number.NaN), y2, 0.1)).not.toThrow();
    const held = orbAt(created);
    expectFinite(held, 'orb after lost pose');
    expectVec(held, start, 'orb keeps its last good spot');
    ult.syncOrb(GLOW, new Vector3(e2.x, e2.y, e2.z), y2, 0.2);
    expectVec(orbAt(created), ultimateOrbPosition(e2, y2), 'retried placement');
    ult.syncOrb(GLOW, new Vector3(e0.x, e0.y, e0.z), y0, 0.3);
    expectVec(orbAt(created), ultimateOrbPosition(e2, y2), 'retry done, stays put while glowing');
    ult.destroy();
  });
});
