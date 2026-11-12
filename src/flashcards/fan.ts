// Pure fan-slot geometry for arrived card enemies: no three.js / IWSDK imports so it runs under
// vitest's node environment. Bearings are head-relative and follow spawn.ts (Y up, yaw 0 faces -Z).

/** Head-relative slot bearings in degrees; index = slot. 35 deg at the 0.7 m hold line clears a face. */
export const FAN_SLOT_BEARINGS_DEG: readonly number[] = Object.freeze([-35, 0, 35]);
/** 0.36 m card plus a 0.02 m rim on each side. */
export const ENEMY_FACE_WIDTH_M = 0.4;
/** Card-slash hit sphere around an enemy centre. */
export const ENEMY_SLASH_RADIUS_M = 0.2;

const DEG = Math.PI / 180;

function wrap(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  else if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Free slot nearest the spawn bearing (ties -> lowest index); null when every slot is taken. */
export function assignFanSlot(occupied: ReadonlySet<number>, spawnBearingRad: number): number | null {
  const b = Number.isFinite(spawnBearingRad) ? spawnBearingRad : 0;
  let best: number | null = null;
  let bestDist = Infinity;
  for (let slot = 0; slot < FAN_SLOT_BEARINGS_DEG.length; slot++) {
    if (occupied.has(slot)) continue;
    const d = Math.abs(wrap(b - FAN_SLOT_BEARINGS_DEG[slot] * DEG));
    if (d < bestDist) {
      best = slot;
      bestDist = d;
    }
  }
  return best;
}

/** World x/z of a slot on the hold line `reach` metres from the eye, relative to play-forward yaw. */
export function fanSlotGoal(
  slot: number,
  eye: { x: number; z: number },
  yawRad: number,
  reach: number,
): { x: number; z: number } {
  if (!Number.isInteger(slot) || slot < 0 || slot >= FAN_SLOT_BEARINGS_DEG.length) {
    throw new RangeError(`fan slot must be an integer in 0..${FAN_SLOT_BEARINGS_DEG.length - 1}, got ${slot}`);
  }
  const a = yawRad + FAN_SLOT_BEARINGS_DEG[slot] * DEG;
  return { x: eye.x - Math.sin(a) * reach, z: eye.z - Math.cos(a) * reach };
}
