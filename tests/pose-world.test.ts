// Requirement: hand and controller poses arrive in the XR session reference space, which is the XR
// origin's local space; before slash classification each pose is lifted into world space (where the
// orbs and card-enemies live) as origin * pose (M1, SX/H-2 controller slash). A moved or turned
// player (recenter, D8 play-forward yaw) must still slash the orbs they see, so position AND
// orientation compose through the origin's world matrix.
//
// Contract for src/flashcards/pose-world.ts (pure, no IWSDK; 4x4 matrices column-major, 16 numbers,
// the WebXR / three.js layout):
//   export function poseToWorld(origin: ArrayLike<number>, pose: ArrayLike<number>): GripPose;
//     world matrix = origin * pose, decomposed to { pos, quat } (GripPose from slash-input.ts).
//   CardSlash.toWorld delegates to it.
import { describe, expect, it } from 'vitest';
import type { GripPose, Quat } from '../src/flashcards/slash-input';

// Dynamic import so each test reports the missing module/export instead of one load error.
const poseWorld: unknown = await import('../src/flashcards/pose-world.js').catch(() => ({}));

function poseToWorld(origin: ArrayLike<number>, pose: ArrayLike<number>): GripPose {
  const fn = (poseWorld as Record<string, unknown>).poseToWorld;
  if (typeof fn !== 'function') throw new Error('pose-world does not export poseToWorld');
  return (fn as (o: ArrayLike<number>, p: ArrayLike<number>) => GripPose)(origin, pose);
}

/** Column-major rotation about +Y by `deg` degrees, then translation (tx, ty, tz). */
function yawThenMove(deg: number, tx = 0, ty = 0, tz = 0): number[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, tx, ty, tz, 1];
}

/** Quaternions q and -q are the same rotation. */
function expectSameRotation(q: Quat, e: Quat): void {
  const d = Math.abs(q.x * e.x + q.y * e.y + q.z * e.z + q.w * e.w);
  expect(d).toBeCloseTo(1, 6);
}

const H = Math.SQRT1_2;

// Covers: M1, H-2
describe('poseToWorld lifts reference-space poses by the XR origin', () => {
  it('an identity origin passes the pose through', () => {
    const w = poseToWorld(yawThenMove(0), yawThenMove(0, 0.5, 1.2, -0.3));
    expect(w.pos.x).toBeCloseTo(0.5, 6);
    expect(w.pos.y).toBeCloseTo(1.2, 6);
    expect(w.pos.z).toBeCloseTo(-0.3, 6);
    expectSameRotation(w.quat, { x: 0, y: 0, z: 0, w: 1 });
  });

  it('a moved origin translates the pose position', () => {
    const w = poseToWorld(yawThenMove(0, 1, 0, -2), yawThenMove(0, 0.5, 1.2, 0));
    expect(w.pos.x).toBeCloseTo(1.5, 6);
    expect(w.pos.y).toBeCloseTo(1.2, 6);
    expect(w.pos.z).toBeCloseTo(-2, 6);
  });

  it('a turned and moved origin rotates the pose position before translating (origin * pose)', () => {
    // Yaw 90 deg maps local +x to world -z: (0.5, 1.2, 0) -> (0, 1.2, -0.5), then + (1, 0, -2).
    const w = poseToWorld(yawThenMove(90, 1, 0, -2), yawThenMove(0, 0.5, 1.2, 0));
    expect(w.pos.x).toBeCloseTo(1, 6);
    expect(w.pos.y).toBeCloseTo(1.2, 6);
    expect(w.pos.z).toBeCloseTo(-2.5, 6);
    expectSameRotation(w.quat, { x: 0, y: H, z: 0, w: H });
  });

  it('origin and pose orientations compose', () => {
    const w = poseToWorld(yawThenMove(90), yawThenMove(90));
    expectSameRotation(w.quat, { x: 0, y: 1, z: 0, w: 0 });
  });

  it('is not pose * origin: the origin yaw rotates the pose translation', () => {
    // pose * origin would leave the translation at (0.5, 0, 0); origin * pose rotates it to -z.
    const w = poseToWorld(yawThenMove(90), yawThenMove(0, 0.5, 0, 0));
    expect(w.pos.x).toBeCloseTo(0, 6);
    expect(w.pos.z).toBeCloseTo(-0.5, 6);
  });
});
