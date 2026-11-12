// Requirement: the ultimate orb never gets in the way of fighting. It sits beyond the 0.7 m hold
// line (>= 0.9 m from the eye horizontally), just right of the question panel, within +/-45 deg
// horizontally and above -35 deg elevation, and it is anchored to the panel: a moved eye or a
// turned head keeps the same panel-relative offset (rotated with yaw), so it cannot drift away from
// the panel. Seen from the eye it overlaps neither the question panel nor any answer orb, and a
// seated hand reaching straight for any parked enemy never passes through the orb's pick sphere on
// the way. Regression (w8 capture): from hand (0.23, 0.88, -0.39) the ray to the right-side enemy
// (0.40, 1.85, -0.57) hit the old orb at eye + (0.35, -0.2, -0.45) first.
//
// API contract (src/flashcards/panel-layout.ts, pure, same style as orbPositions):
//   export function ultimateOrbPosition(eye: Vec3, yawRad: number): Vec3;
//     a fixed offset from panelPlacement(eye, yawRad).center, rotated with yaw; about
//     (0.42, -0.34, -0.94) from the eye in the yaw frame. RangeError on a non-finite eye or yaw.
// Pick radius: src/card-ultimate.ts ORB_RADIUS 0.06 (line 40) at its peak pulse scale 1.2 (line 116).
import { describe, expect, it } from 'vitest';
import { ENCOUNTER_DEFAULTS } from '../src/flashcards/encounter.js';
import { FAN_SLOT_BEARINGS_DEG, fanSlotGoal } from '../src/flashcards/fan.js';
import {
  orbPositions,
  PANEL_LAYOUT,
  panelPlacement,
  parkedEnemyCenter,
  ultimateOrbPosition,
  type Vec3,
} from '../src/flashcards/panel-layout.js';

const DEG = Math.PI / 180;
const HOLD = ENCOUNTER_DEFAULTS.reachDistance;
const SEATED = 1.1;
const STANDING = 1.7;
const YAWS = [0, 0.7, -1.9, Math.PI];
const LOWEST_COMFORT_DEG = -35;
/** src/card-question-panel.ts ORB_RADIUS (answer orbs). */
const ORB_RADIUS = 0.05;
const MAX_ANSWER_ORBS = 4;
const ULT_PICK_RADIUS = 0.06 * 1.2;
/** Regression eye (w8 capture): parked enemies at y 1.85 = eye 1.6 + ENEMY_RISE_M. */
const CAPTURE_EYE: Vec3 = { x: 0, y: 1.6, z: 0 };

function eyeAt(y: number, x = 0.3, z = -0.4): Vec3 {
  return { x, y, z };
}

const ULT_EYES: Vec3[] = [CAPTURE_EYE, eyeAt(SEATED)];

/** World point -> eye-centred yaw frame (x right, y up, -z forward). */
function toLocal(eye: Vec3, yaw: number, p: Vec3): Vec3 {
  const dx = p.x - eye.x;
  const dz = p.z - eye.z;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: c * dx - s * dz, y: p.y - eye.y, z: s * dx + c * dz };
}

function elevationDeg(eye: Vec3, p: Vec3): number {
  return Math.atan2(p.y - eye.y, Math.hypot(p.x - eye.x, p.z - eye.z)) / DEG;
}

function azimuthDeg(eye: Vec3, yaw: number, p: Vec3): number {
  const l = toLocal(eye, yaw, p);
  return Math.atan2(l.x, -l.z) / DEG;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

type P2 = { u: number; v: number };

/** Perspective projection from the eye in the yaw frame (x/-z, y/-z). */
function project(eye: Vec3, yaw: number, p: Vec3): P2 {
  const l = toLocal(eye, yaw, p);
  return { u: l.x / -l.z, v: l.y / -l.z };
}

/** Projected square bounding a sphere's silhouette (centre +/- r / depth). */
function sphereQuad(eye: Vec3, yaw: number, c: Vec3, r: number): P2[] {
  const p = project(eye, yaw, c);
  const k = r / -toLocal(eye, yaw, c).z;
  return [
    { u: p.u - k, v: p.v - k },
    { u: p.u + k, v: p.v - k },
    { u: p.u + k, v: p.v + k },
    { u: p.u - k, v: p.v + k },
  ];
}

/** The question panel's four corners, projected. */
function panelQuad(eye: Vec3, yaw: number): P2[] {
  const { top, bottom } = panelPlacement(eye, yaw);
  const h = PANEL_LAYOUT.widthM / 2;
  const rx = Math.cos(yaw) * h;
  const rz = -Math.sin(yaw) * h;
  const at = (p: Vec3, s: number): P2 => project(eye, yaw, { x: p.x + rx * s, y: p.y, z: p.z + rz * s });
  return [at(bottom, -1), at(bottom, 1), at(top, 1), at(top, -1)];
}

/** Separating-axis test for two convex polygons; touching counts as overlap. */
function convexOverlap(a: P2[], b: P2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const ax = { u: q.v - p.v, v: p.u - q.u };
      const span = (pts: P2[]) => pts.map((t) => t.u * ax.u + t.v * ax.v);
      const sa = span(a);
      const sb = span(b);
      if (Math.max(...sa) < Math.min(...sb) || Math.max(...sb) < Math.min(...sa)) return false;
    }
  }
  return true;
}

function segmentPointDistance(a: Vec3, b: Vec3, p: Vec3): number {
  const d = sub(b, a);
  const len2 = d.x * d.x + d.y * d.y + d.z * d.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y + (p.z - a.z) * d.z) / len2));
  return Math.hypot(a.x + d.x * t - p.x, a.y + d.y * t - p.y, a.z + d.z * t - p.z);
}

/** Seated hands as eye-relative offsets in the yaw frame (hand y 0.85..1.35 for a 1.6 m eye). */
function handGrid(eye: Vec3, yaw: number): Vec3[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const out: Vec3[] = [];
  for (const lx of [-0.35, -0.175, 0, 0.175, 0.35]) {
    for (const hy of [0.85, 0.95, 1.05, 1.15, 1.25, 1.35]) {
      for (const lz of [-0.15, -0.25, -0.35, -0.5]) {
        out.push({ x: eye.x + lx * c + lz * s, y: eye.y + (hy - CAPTURE_EYE.y), z: eye.z - lx * s + lz * c });
      }
    }
  }
  return out;
}

// Covers: ENC-003, S7
describe('ultimate orb beyond the hold line (regression: orb in the reach path)', () => {
  it('sits at least 0.2 m beyond the hold line horizontally', () => {
    for (const eye of ULT_EYES) {
      for (const yaw of YAWS) {
        const o = ultimateOrbPosition(eye, yaw);
        const h = Math.hypot(o.x - eye.x, o.z - eye.z);
        expect(h, `eye y ${eye.y} yaw ${yaw}: ${h.toFixed(3)} m`).toBeGreaterThanOrEqual(HOLD + 0.2);
      }
    }
  });

  it('the reported capture reach (hand to right-side enemy) misses the orb pick sphere', () => {
    const hand = { x: 0.23, y: 0.88, z: -0.39 };
    const enemy = parkedEnemyCenter(CAPTURE_EYE, fanSlotGoal(0, CAPTURE_EYE, 0, HOLD));
    expect(enemy.x).toBeCloseTo(0.4, 2);
    expect(enemy.y).toBeCloseTo(1.85, 9);
    expect(enemy.z).toBeCloseTo(-0.57, 2);
    const miss = segmentPointDistance(hand, enemy, ultimateOrbPosition(CAPTURE_EYE, 0));
    expect(miss, `ray passes ${miss.toFixed(3)} m from the orb`).toBeGreaterThan(ULT_PICK_RADIUS);
  });

  it('no seated hand-to-parked-enemy segment passes within the orb pick radius', () => {
    for (const eye of ULT_EYES) {
      for (const yaw of YAWS) {
        const orb = ultimateOrbPosition(eye, yaw);
        for (let slot = 0; slot < FAN_SLOT_BEARINGS_DEG.length; slot++) {
          const enemy = parkedEnemyCenter(eye, fanSlotGoal(slot, eye, yaw, HOLD));
          for (const hand of handGrid(eye, yaw)) {
            const miss = segmentPointDistance(hand, enemy, orb);
            expect(
              miss,
              `eye y ${eye.y} yaw ${yaw} slot ${slot} hand (${hand.x.toFixed(2)}, ${hand.y.toFixed(2)}, ${hand.z.toFixed(2)})`,
            ).toBeGreaterThan(ULT_PICK_RADIUS);
          }
        }
      }
    }
  });

  it('seen from the eye, the orb overlaps neither the question panel nor any answer orb', () => {
    for (const eye of ULT_EYES) {
      for (const yaw of YAWS) {
        const orb = sphereQuad(eye, yaw, ultimateOrbPosition(eye, yaw), ULT_PICK_RADIUS);
        expect(convexOverlap(orb, panelQuad(eye, yaw)), `panel, eye y ${eye.y} yaw ${yaw}`).toBe(false);
        for (const a of orbPositions(eye, yaw, MAX_ANSWER_ORBS)) {
          expect(convexOverlap(orb, sphereQuad(eye, yaw, a, ORB_RADIUS)), `answer orb, eye y ${eye.y} yaw ${yaw}`).toBe(false);
        }
      }
    }
  });

  it('stays within +/-45 deg horizontally and above -35 deg elevation', () => {
    for (const eye of ULT_EYES) {
      for (const yaw of YAWS) {
        const o = ultimateOrbPosition(eye, yaw);
        expect(Math.abs(azimuthDeg(eye, yaw, o))).toBeLessThanOrEqual(45);
        expect(elevationDeg(eye, o)).toBeGreaterThanOrEqual(LOWEST_COMFORT_DEG);
      }
    }
  });

  it('sits about (0.42, -0.34, -0.94) from the eye in the yaw frame', () => {
    const eye = eyeAt(STANDING);
    const l = toLocal(eye, 0.6, ultimateOrbPosition(eye, 0.6));
    expect(l.x).toBeCloseTo(0.42, 1);
    expect(l.y).toBeCloseTo(-0.34, 1);
    expect(l.z).toBeCloseTo(-0.94, 1);
  });
});

// Covers: ENC-003, S7
describe('ultimate orb is anchored to the question panel', () => {
  it('its offset from the panel centre is unchanged when the eye moves', () => {
    for (const yaw of YAWS) {
      const e1 = eyeAt(SEATED, 0, 0);
      const e2 = eyeAt(STANDING, 1, -2);
      const a = sub(ultimateOrbPosition(e1, yaw), panelPlacement(e1, yaw).center);
      const b = sub(ultimateOrbPosition(e2, yaw), panelPlacement(e2, yaw).center);
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
      expect(b.z).toBeCloseTo(a.z, 9);
    }
  });

  it('its panel-relative offset rotates with yaw and stays right of the panel edge', () => {
    const eye = eyeAt(STANDING);
    const origin = { x: 0, y: 0, z: 0 };
    const local = (yaw: number) =>
      toLocal(origin, yaw, sub(ultimateOrbPosition(eye, yaw), panelPlacement(eye, yaw).center));
    const ref = local(0);
    expect(ref.x).toBeGreaterThan(PANEL_LAYOUT.widthM / 2);
    for (const yaw of YAWS) {
      const l = local(yaw);
      expect(l.x).toBeCloseTo(ref.x, 9);
      expect(l.y).toBeCloseTo(ref.y, 9);
      expect(l.z).toBeCloseTo(ref.z, 9);
    }
  });

  it('rejects a non-finite eye or yaw with a RangeError', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => ultimateOrbPosition(eyeAt(v), 0)).toThrow(RangeError);
      expect(() => ultimateOrbPosition({ x: v, y: 1.6, z: 0 }, 0)).toThrow(RangeError);
      expect(() => ultimateOrbPosition({ x: 0, y: 1.6, z: v }, 0)).toThrow(RangeError);
      expect(() => ultimateOrbPosition(eyeAt(1.6), v)).toThrow(RangeError);
    }
  });
});
