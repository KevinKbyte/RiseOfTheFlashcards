// Pure question-panel / parked-enemy layout: no three.js / IWSDK imports so it runs under vitest's
// node environment. Single source of the numbers that keep the panel (and its top text line) below
// every parked enemy's face + halo, as seen from the eye. Metres, radians; Y up, yaw 0 faces -Z.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// 20 deg down at 1 m puts the 0.28 m panel at about -12 to -28 deg, clear of the centre-slot face +
// halo (bottom about -9.5 deg at the 0.7 m hold line with ENEMY_RISE_M 0.25).
export const PANEL_LAYOUT = Object.freeze({
  widthM: 0.6,
  heightM: 0.28,
  distanceM: 1.0,
  pitchBelowDeg: 20,
} as const);

/** Parked enemy centre height above eye.y. */
export const ENEMY_RISE_M = 0.25;

// Offsets in the yaw-only frame at the eye; the outer orb of a 4-orb row stays inside ~0.6 m reach.
export const ORB_LAYOUT = Object.freeze({
  downM: 0.35,
  forwardM: 0.42,
  spacingM: 0.16,
} as const);

function assertFinite(...values: number[]): void {
  if (!values.every(Number.isFinite)) throw new RangeError('panel-layout: non-finite input');
}

export function panelPlacement(eye: Vec3, yawRad: number): { center: Vec3; top: Vec3; bottom: Vec3 } {
  assertFinite(eye.x, eye.y, eye.z, yawRad);
  const pitch = (PANEL_LAYOUT.pitchBelowDeg * Math.PI) / 180;
  const fx = -Math.sin(yawRad);
  const fz = -Math.cos(yawRad);
  // Forward ray pitched down; the panel faces the eye, so its up axis is that ray rotated +90 deg.
  const fwdH = Math.cos(pitch);
  const fwdY = -Math.sin(pitch);
  const upH = Math.sin(pitch);
  const upY = Math.cos(pitch);
  const d = PANEL_LAYOUT.distanceM;
  const half = PANEL_LAYOUT.heightM / 2;
  const center = { x: eye.x + fx * fwdH * d, y: eye.y + fwdY * d, z: eye.z + fz * fwdH * d };
  const along = (s: number): Vec3 => ({
    x: center.x + fx * upH * s,
    y: center.y + upY * s,
    z: center.z + fz * upH * s,
  });
  return { center, top: along(half), bottom: along(-half) };
}

export function parkedEnemyCenter(eye: Vec3, slotGoal: { x: number; z: number }): Vec3 {
  assertFinite(eye.x, eye.y, eye.z, slotGoal.x, slotGoal.z);
  return { x: slotGoal.x, y: eye.y + ENEMY_RISE_M, z: slotGoal.z };
}

// Right of the question panel edge (half width 0.3 m) and past the 0.7 m hold line, so a hand reaching
// for a parked enemy never passes through the orb (w8 capture: the old eye-relative spot did).
const ULTIMATE_ORB_RIGHT_M = 0.42;

/** The ultimate orb: panel centre + ULTIMATE_ORB_RIGHT_M to the yaw-frame right. */
export function ultimateOrbPosition(eye: Vec3, yawRad: number): Vec3 {
  const { center } = panelPlacement(eye, yawRad);
  return {
    x: center.x + ULTIMATE_ORB_RIGHT_M * Math.cos(yawRad),
    y: center.y,
    z: center.z - ULTIMATE_ORB_RIGHT_M * Math.sin(yawRad),
  };
}

export function orbPositions(eye: Vec3, yawRad: number, count: number): Vec3[] {
  assertFinite(eye.x, eye.y, eye.z, yawRad);
  const sin = Math.sin(yawRad);
  const cos = Math.cos(yawRad);
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const lx = (i - (count - 1) / 2) * ORB_LAYOUT.spacingM;
    const lz = -ORB_LAYOUT.forwardM;
    // Rotate the local offset about +Y by yaw (three.js convention).
    out.push({ x: eye.x + lx * cos + lz * sin, y: eye.y - ORB_LAYOUT.downM, z: eye.z - lx * sin + lz * cos });
  }
  return out;
}
