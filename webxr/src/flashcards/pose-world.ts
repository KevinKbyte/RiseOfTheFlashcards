// Lifts an XR reference-space pose into world space as origin * pose (M1, H-2), so a moved or turned
// player still slashes the orbs they see. Pure, no IWSDK; 4x4 matrices are column-major (WebXR /
// three.js layout). Assumes rigid transforms (no shear), which XR origins and poses are.
import type { GripPose, Quat } from './slash-input.js';

export function poseToWorld(origin: ArrayLike<number>, pose: ArrayLike<number>): GripPose {
  const m = multiply(origin, pose);
  // Divide out per-axis scale so the rotation part is orthonormal before taking the quaternion.
  const sx = Math.hypot(m[0], m[1], m[2]) || 1;
  const sy = Math.hypot(m[4], m[5], m[6]) || 1;
  const sz = Math.hypot(m[8], m[9], m[10]) || 1;
  const quat = rotationToQuat(
    m[0] / sx, m[4] / sy, m[8] / sz,
    m[1] / sx, m[5] / sy, m[9] / sz,
    m[2] / sx, m[6] / sy, m[10] / sz,
  );
  return { pos: { x: m[12], y: m[13], z: m[14] }, quat };
}

function multiply(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

// Shepperd's method (same branch order as three.js Quaternion.setFromRotationMatrix); args row-major.
function rotationToQuat(
  m11: number, m12: number, m13: number,
  m21: number, m22: number, m23: number,
  m31: number, m32: number, m33: number,
): Quat {
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return { w: 0.25 / s, x: (m32 - m23) * s, y: (m13 - m31) * s, z: (m21 - m12) * s };
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return { w: (m32 - m23) / s, x: 0.25 * s, y: (m12 + m21) / s, z: (m13 + m31) / s };
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return { w: (m13 - m31) / s, x: (m12 + m21) / s, y: 0.25 * s, z: (m23 + m32) / s };
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return { w: (m21 - m12) / s, x: (m13 + m31) / s, y: (m23 + m32) / s, z: 0.25 * s };
}
