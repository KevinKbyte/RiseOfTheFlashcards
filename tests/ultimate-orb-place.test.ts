// Requirement: the ultimate orb (shown dim for the whole run, glowing at charge >= 5; S7, ledgers-2
// H-2, decisions-2 D17) stays within reach of a player who turns or recenters. It is re-placed
// relative to the CURRENT head pose (head-yaw offset, the same ORB_OFFSET card-ultimate.ts uses
// today) when the run starts (orb becomes visible) AND on each dim -> glowing transition (charge
// reaching 5). It never moves every frame: no re-place while it stays dim, while it stays glowing,
// when the glow is cleared by firing, or while it is hidden.
//
// Contract for src/flashcards/ultimate-orb-place.ts (pure, no DOM/IWSDK/three.js):
//   export interface OrbView { visible: boolean; glowing: boolean }  // ultimateOrb(run) shape
//   export const ULTIMATE_ORB_OFFSET: Vec3;   // { x: 0.35, y: -0.2, z: -0.45 } head-local metres
//   export function shouldPlaceOrb(prev: OrbView, curr: OrbView): boolean;
//     prev = last frame's view ({ visible: false, glowing: false } before any run). true iff curr is
//     visible AND (prev was hidden OR prev was not glowing and curr is glowing).
//   export function orbPosition(eye: Vec3, headYaw: number): Vec3;
//     eye + ULTIMATE_ORB_OFFSET rotated about +Y by headYaw (three.js yaw: +90 deg turns forward -Z
//     to -X); y is not rotated; a non-finite yaw counts as 0. Never mutates eye.
// card-ultimate.ts syncOrb keeps the previous view, and (re)places the orb at orbPosition(eye, yaw)
// whenever shouldPlaceOrb is true.
import { describe, expect, it } from 'vitest';
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
const orbPosition = (eye: Vec3, yaw: number): Vec3 => need<(e: Vec3, y: number) => Vec3>('orbPosition')(eye, yaw);

const HIDDEN: OrbView = { visible: false, glowing: false };
const DIM: OrbView = { visible: true, glowing: false };
const GLOW: OrbView = { visible: true, glowing: true };

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
}

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
describe('orbPosition: head-yaw offset from the current head pose', () => {
  const EYE: Vec3 = { x: 1, y: 1.6, z: -2 };

  it('keeps the existing head-local offset constants', () => {
    expect(need<Vec3>('ULTIMATE_ORB_OFFSET')).toEqual({ x: 0.35, y: -0.2, z: -0.45 });
  });

  it('at yaw 0 sits at eye + offset (right, below, in front)', () => {
    expectVec(orbPosition(EYE, 0), { x: 1.35, y: 1.4, z: -2.45 });
  });

  it('follows a 90 degree left turn: in front becomes -X, right becomes -Z', () => {
    expectVec(orbPosition(EYE, Math.PI / 2), { x: 1 - 0.45, y: 1.4, z: -2 - 0.35 });
  });

  it('follows a turn to face backwards (yaw pi)', () => {
    expectVec(orbPosition(EYE, Math.PI), { x: 1 - 0.35, y: 1.4, z: -2 + 0.45 });
  });

  it('keeps the same reach at any yaw (horizontal distance from the eye is constant)', () => {
    const reach = Math.hypot(0.35, 0.45);
    for (const yaw of [-2.5, -1, 0.3, 1.7, 3]) {
      const p = orbPosition(EYE, yaw);
      expect(Math.hypot(p.x - EYE.x, p.z - EYE.z)).toBeCloseTo(reach, 9);
      expect(p.y).toBeCloseTo(1.4, 9);
    }
  });

  it('treats a non-finite yaw as 0 and never mutates the eye', () => {
    const eye = { ...EYE };
    expectVec(orbPosition(eye, Number.NaN), { x: 1.35, y: 1.4, z: -2.45 });
    expect(eye).toEqual(EYE);
  });
});
