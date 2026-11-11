// Where and when the ultimate orb is placed (S7, H-2, D17). It follows the current head pose only at
// run start and when it starts glowing, so a turned player finds it again without it chasing the
// head every frame. Pure.
import type { Vec3 } from './spawn.js';

/** The ultimateOrb(run) view shape. */
export interface OrbView {
  visible: boolean;
  glowing: boolean;
}

/** Head-local metres in the head-yaw frame: right of and below eye level, inside seated reach. */
export const ULTIMATE_ORB_OFFSET: Vec3 = { x: 0.35, y: -0.2, z: -0.45 };

/** True on the frame the orb appears or goes from dim to glowing. */
export function shouldPlaceOrb(prev: OrbView, curr: OrbView): boolean {
  return curr.visible && (!prev.visible || (!prev.glowing && curr.glowing));
}

/** eye + ULTIMATE_ORB_OFFSET rotated about +Y by headYaw (non-finite yaw counts as 0). */
export function orbPosition(eye: Vec3, headYaw: number): Vec3 {
  const yaw = Number.isFinite(headYaw) ? headYaw : 0;
  const { x, y, z } = ULTIMATE_ORB_OFFSET;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: eye.x + x * c + z * s, y: eye.y + y, z: eye.z - x * s + z * c };
}
