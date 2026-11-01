// Requirement: card enemies emerge from the real walls of the player's room. Each detected WebXR
// plane the runtime labels 'vertical' becomes one world-space wall (centre, facing normal, width
// along the floor, height up the wall) that the spawn picker can place enemies on; floor, ceiling,
// unlabelled, empty, too-small (< 3 points) and non-finite polygons give no wall. The plane polygon
// lies in plane-local x/z with local +Y as the normal, and the plane entity's pose places it in the
// world. Bad runtime data never becomes a wall: a pose giving a non-finite centre or normal, a
// zero-area polygon (width or height under 1e-3 m), an extent over 50 m or non-finite (huge
// coordinates overflow), or a 'vertical' label whose posed normal is mostly up/down (|normal.y| >
// 0.7) all give null.
//
// API contract for src/card-walls.ts:
//   export interface PlaneLike { orientation?: string; polygon: ReadonlyArray<{ x: number; z: number }> }
//   export function planeToWall(plane: PlaneLike, object: Object3D): Wall | null
import { describe, expect, it, vi } from 'vitest';

vi.mock('@iwsdk/core', async () => await import('three'));

import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { planeToWall, type PlaneLike } from '../src/card-walls.js';
import { pickSpawns, type Vec3 } from '../src/flashcards/spawn.js';

function rect(x0: number, x1: number, z0: number, z1: number): PlaneLike['polygon'] {
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
}

function vertical(polygon: PlaneLike['polygon']): PlaneLike {
  return { orientation: 'vertical', polygon };
}

/** A plane entity whose pose is given directly as a world matrix (matrixAutoUpdate off). */
function posed(position: Vector3, rotation: Euler): Object3D {
  const obj = new Object3D();
  obj.matrixAutoUpdate = false;
  obj.matrix.compose(position, new Quaternion().setFromEuler(rotation), new Vector3(1, 1, 1));
  obj.matrixWorldNeedsUpdate = true;
  return obj;
}

/** Local +Y tipped onto world +Z by +90 deg about X, then yawed about Y: a wall facing `yaw`. */
function wallPose(position: Vector3, yawRad: number): Object3D {
  return posed(position, new Euler(Math.PI / 2, yawRad, 0, 'YXZ'));
}

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
}

// Covers: CARDS-011
describe('planeToWall: detected vertical planes become spawn walls', () => {
  it('a wall tipped upright facing +Z: normal +Z, local z runs up the wall so it is the height', () => {
    const wall = planeToWall(
      vertical(rect(-1, 1, -0.75, 0.75)),
      wallPose(new Vector3(0, 1.5, -2), 0),
    );
    expect(wall).not.toBeNull();
    expectVec(wall!.center, { x: 0, y: 1.5, z: -2 });
    expectVec(wall!.normal, { x: 0, y: 0, z: 1 });
    expect(wall!.width).toBeCloseTo(2, 9);
    expect(wall!.height).toBeCloseTo(1.5, 9);
  });

  it('a wall yawed 90 deg to the player\'s left faces +X, sits at bearing +90 deg, and yields a spawn on it', () => {
    const wall = planeToWall(
      vertical(rect(-1, 1, -0.75, 0.75)),
      wallPose(new Vector3(-2, 1.5, 0), Math.PI / 2),
    );
    expect(wall).not.toBeNull();
    expectVec(wall!.center, { x: -2, y: 1.5, z: 0 });
    expectVec(wall!.normal, { x: 1, y: 0, z: 0 });
    // Bearing convention from spawn.ts: atan2(-(p.x - head.x), -(p.z - head.z)), yaw 0 faces -Z.
    const bearing = Math.atan2(-wall!.center.x, -wall!.center.z);
    expect(bearing).toBeCloseTo(Math.PI / 2, 9);
    // The normal points back at a player standing at the origin.
    expect(wall!.normal.x * -wall!.center.x + wall!.normal.z * -wall!.center.z).toBeGreaterThan(0);

    const head = { position: { x: 0, y: 1.5, z: 0 }, yawRad: Math.PI / 2 };
    const [spawn] = pickSpawns([wall!], head, 1);
    expect(spawn.source).toBe('wall');
    expect(spawn.position.x).toBeCloseTo(-2, 6);
    expect(spawn.position.y).toBeCloseTo(1.5, 6);
    expect(spawn.position.z).toBeCloseTo(0, 6);
  });

  it('when local x runs up the wall instead of z, width and height swap to stay floor-wise and up-wise', () => {
    // +90 deg about Z: local X -> world +Y (up), local Y (normal) -> world -X.
    const wall = planeToWall(
      vertical(rect(-0.75, 0.75, -1, 1)),
      posed(new Vector3(3, 1.2, 0), new Euler(0, 0, Math.PI / 2)),
    );
    expect(wall).not.toBeNull();
    expectVec(wall!.normal, { x: -1, y: 0, z: 0 });
    expect(wall!.width).toBeCloseTo(2, 9);
    expect(wall!.height).toBeCloseTo(1.5, 9);
  });

  it('a translated plane with an off-origin polygon maps its bbox centre through the pose', () => {
    const obj = wallPose(new Vector3(1, 0.5, -3), 0);
    const wall = planeToWall(vertical(rect(1, 3, 0, 2)), obj);
    expect(wall).not.toBeNull();
    // Local bbox centre (2, 0, 1); local z maps to world -Y under the upright tip, x stays x.
    expectVec(wall!.center, { x: 3, y: -0.5, z: -3 });
    const viaPose = new Vector3(2, 0, 1).applyMatrix4(new Matrix4().copy(obj.matrixWorld));
    expectVec(wall!.center, viaPose);
    expect(wall!.width).toBeCloseTo(2, 9);
    expect(wall!.height).toBeCloseTo(2, 9);
  });

  it('honours a parent transform as well as the plane\'s own pose', () => {
    const parent = new Object3D();
    parent.position.set(0, 0, -1);
    const child = new Object3D();
    child.position.set(0, 1.5, -2);
    child.rotation.set(Math.PI / 2, 0, 0);
    parent.add(child);
    const wall = planeToWall(vertical(rect(-1, 1, -0.5, 0.5)), child);
    expect(wall).not.toBeNull();
    expectVec(wall!.center, { x: 0, y: 1.5, z: -3 });
    expectVec(wall!.normal, { x: 0, y: 0, z: 1 });
  });

  it('a wall is a fresh plain object each call, not a shared mutable buffer', () => {
    const a = planeToWall(vertical(rect(-1, 1, -0.5, 0.5)), wallPose(new Vector3(0, 1, -2), 0));
    const b = planeToWall(vertical(rect(-1, 1, -0.5, 0.5)), wallPose(new Vector3(5, 1, -2), 0));
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.center.x).toBeCloseTo(0, 9);
    expect(b!.center.x).toBeCloseTo(5, 9);
    expect(a!.center).not.toBe(b!.center);
  });
});

// Covers: CARDS-011
describe('planeToWall: planes that cannot host a wall give null', () => {
  const pose = (): Object3D => wallPose(new Vector3(0, 1.5, -2), 0);

  it.each(['horizontal', undefined, 'Vertical', ''])('orientation %s is rejected (floors, ceilings, unknown)', (orientation) => {
    expect(planeToWall({ orientation, polygon: rect(-1, 1, -1, 1) }, pose())).toBeNull();
  });

  it('an empty polygon is rejected', () => {
    expect(planeToWall(vertical([]), pose())).toBeNull();
  });

  it('a polygon with fewer than 3 points is rejected', () => {
    expect(planeToWall(vertical([{ x: 0, z: 0 }]), pose())).toBeNull();
    expect(planeToWall(vertical([{ x: 0, z: 0 }, { x: 1, z: 1 }]), pose())).toBeNull();
  });

  it('exactly 3 points is enough for a wall', () => {
    const wall = planeToWall(vertical([{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 1 }]), pose());
    expect(wall).not.toBeNull();
    expect(wall!.width).toBeCloseTo(2, 9);
    expect(wall!.height).toBeCloseTo(1, 9);
  });

  it.each([
    ['NaN x', { x: Number.NaN, z: 0 }],
    ['NaN z', { x: 0, z: Number.NaN }],
    ['Infinity x', { x: Number.POSITIVE_INFINITY, z: 0 }],
    ['-Infinity z', { x: 0, z: Number.NEGATIVE_INFINITY }],
  ])('a polygon point with %s is rejected', (_label, bad) => {
    const polygon = [...rect(-1, 1, -0.5, 0.5), bad];
    expect(planeToWall(vertical(polygon), pose())).toBeNull();
  });

  it('a NaN point first in the polygon is still rejected (not masked by later finite points)', () => {
    const polygon = [{ x: Number.NaN, z: Number.NaN }, ...rect(-1, 1, -0.5, 0.5)];
    expect(planeToWall(vertical(polygon), pose())).toBeNull();
  });
});

// Covers: CARDS-011
describe('planeToWall: bad runtime data never becomes a wall', () => {
  const upright = (): Object3D => wallPose(new Vector3(0, 1.5, -2), 0);

  it('a pose with a NaN translation (non-finite centre) gives null', () => {
    const obj = upright();
    obj.matrix.elements[12] = Number.NaN;
    expect(planeToWall(vertical(rect(-1, 1, -0.5, 0.5)), obj)).toBeNull();
  });

  it('a pose with a NaN rotation (non-finite normal) gives null', () => {
    const obj = posed(new Vector3(0, 1.5, -2), new Euler(Number.NaN, 0, 0));
    expect(planeToWall(vertical(rect(-1, 1, -0.5, 0.5)), obj)).toBeNull();
  });

  it('a pose with an infinite translation gives null', () => {
    const obj = upright();
    obj.matrix.elements[14] = Number.POSITIVE_INFINITY;
    expect(planeToWall(vertical(rect(-1, 1, -0.5, 0.5)), obj)).toBeNull();
  });

  it('collinear points (zero height) give null', () => {
    const polygon = [{ x: -1, z: 0 }, { x: 0, z: 0 }, { x: 1, z: 0 }];
    expect(planeToWall(vertical(polygon), upright())).toBeNull();
  });

  it('coincident points (zero width and height) give null', () => {
    const polygon = [{ x: 0.5, z: 0.5 }, { x: 0.5, z: 0.5 }, { x: 0.5, z: 0.5 }];
    expect(planeToWall(vertical(polygon), upright())).toBeNull();
  });

  it('a sliver under 1e-3 m in either extent gives null; 1e-2 m is accepted', () => {
    expect(planeToWall(vertical(rect(-1, 1, 0, 5e-4)), upright())).toBeNull();
    expect(planeToWall(vertical(rect(0, 5e-4, -1, 1)), upright())).toBeNull();
    expect(planeToWall(vertical(rect(-1, 1, 0, 1e-2)), upright())).not.toBeNull();
  });

  it('an extent over 50 m gives null; 49.9 m is accepted', () => {
    expect(planeToWall(vertical(rect(-25.05, 25.05, -1, 1)), upright())).toBeNull();
    expect(planeToWall(vertical(rect(-1, 1, -25.05, 25.05)), upright())).toBeNull();
    expect(planeToWall(vertical(rect(-24.95, 24.95, -1, 1)), upright())).not.toBeNull();
  });

  it('coordinates at +/-1e300 (finite points, absurd extent) give null', () => {
    expect(planeToWall(vertical(rect(-1e300, 1e300, -1, 1)), upright())).toBeNull();
  });

  it('coordinates at +/-1e308 whose extent overflows to Infinity give null', () => {
    expect(planeToWall(vertical(rect(-1, 1, -1e308, 1e308)), upright())).toBeNull();
  });

  it('a vertical-labelled plane whose identity pose leaves the normal pointing up gives null', () => {
    expect(planeToWall(vertical(rect(-1, 1, -0.5, 0.5)), new Object3D())).toBeNull();
  });

  it('a vertical-labelled plane tilted 50 deg off upright (|normal.y| ~0.77) gives null; 30 deg (0.5) is accepted', () => {
    const tilted = (deg: number): Object3D =>
      posed(new Vector3(0, 1.5, -2), new Euler(Math.PI / 2 - (deg * Math.PI) / 180, 0, 0));
    expect(planeToWall(vertical(rect(-1, 1, -0.5, 0.5)), tilted(50))).toBeNull();
    const ok = planeToWall(vertical(rect(-1, 1, -0.5, 0.5)), tilted(30));
    expect(ok).not.toBeNull();
    expect(Math.abs(ok!.normal.y)).toBeCloseTo(0.5, 9);
  });
});
