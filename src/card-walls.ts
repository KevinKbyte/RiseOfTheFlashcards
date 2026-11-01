// Converts detected WebXR planes into world-space spawn walls for spawn.ts.
import { Quaternion, Vector3, type Object3D } from '@iwsdk/core';
import type { Wall } from './flashcards/spawn.js';

/** The slice of a WebXR XRPlane this module reads. */
export interface PlaneLike {
  orientation?: string;
  /** Plane-local points; the polygon lies in local x/z and local +Y is the plane normal. */
  polygon: ReadonlyArray<{ x: number; z: number }>;
}

const center = new Vector3();
const axisX = new Vector3();
const axisZ = new Vector3();
const normal = new Vector3();
const quat = new Quaternion();

const MIN_EXTENT = 1e-3;
const MAX_EXTENT = 50;
const MAX_NORMAL_Y = 0.7;

// NaN-safe: a non-finite extent fails both comparisons.
function isSaneExtent(e: number): boolean {
  return e >= MIN_EXTENT && e <= MAX_EXTENT;
}

/**
 * World-space wall for a vertical plane, or null for horizontal/degenerate planes. `object` is the
 * plane entity's object3D, posed at the plane origin by SceneUnderstandingSystem.
 */
export function planeToWall(plane: PlaneLike, object: Object3D): Wall | null {
  if (plane.orientation !== 'vertical' || plane.polygon.length < 3) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of plane.polygon) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  object.updateWorldMatrix(true, false);
  object.getWorldQuaternion(quat);
  center.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  object.localToWorld(center);
  axisX.set(1, 0, 0).applyQuaternion(quat);
  axisZ.set(0, 0, 1).applyQuaternion(quat);
  normal.set(0, 1, 0).applyQuaternion(quat);
  // On a vertical plane one in-plane axis runs along the floor and the other runs up the wall;
  // the runtime does not promise which, so pick by how vertical each axis is.
  const xIsUp = Math.abs(axisX.y) > Math.abs(axisZ.y);
  const extentX = maxX - minX;
  const extentZ = maxZ - minZ;
  const vals = [center.x, center.y, center.z, normal.x, normal.y, normal.z];
  if (!vals.every(Number.isFinite)) return null;
  if (!isSaneExtent(extentX) || !isSaneExtent(extentZ)) return null;
  // Labelled vertical but posed mostly facing up/down: bad runtime data, not a wall.
  if (Math.abs(normal.y) > MAX_NORMAL_Y) return null;
  return {
    center: { x: center.x, y: center.y, z: center.z },
    normal: { x: normal.x, y: normal.y, z: normal.z },
    width: xIsUp ? extentZ : extentX,
    height: xIsUp ? extentX : extentZ,
  };
}
