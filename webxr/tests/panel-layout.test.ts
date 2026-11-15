// Requirement: the question text is never hidden behind a parked enemy. Seen from the eye, the
// question panel (incl. its top question-text line) sits wholly BELOW the face + halo of every
// enemy parked in any fan slot, with at least a 2 deg clear band between them: 2 deg is ~3.5 cm at
// the 1 m panel, enough to absorb the halted x1.08 scale-up, the additive halo bleed and small
// eye-height drift between the panel popping out and the enemy parking, so the text line stays
// readable. The whole panel stays inside a comfortable reading band from the eye line down to
// 35 deg below it (eye rotation plus a slight head tilt; it never rises above the eye line where
// enemies stand). Answer orbs hang below the panel's bottom edge, as seen from the eye, and every
// orb of a full 4-orb row is within ~0.6 m seated arm reach of the eye. The clearances are the
// same at any eye height (seated ~1.1 m, standing ~1.7 m) and any head yaw. A non-finite eye or
// yaw is rejected with a RangeError rather than placing anything at NaN.
// Glow frame (w8): a halted side-slot enemy's glow stays inside the Quest 3 view, its outer
// horizontal edge at most 55 deg from centre (half field of view), and sits at least 5 deg above
// the question panel's top edge; the halo pad is 0.10 m (was 0.18 m: outer edge 57.6 deg, gap
// 2.48 deg). The glow sizes come from src/card-enemy.ts, never re-typed here.
// (Ultimate orb placement: tests/panel-layout-ultimate-orb.test.ts.)
// Regression (w7 capture stills): the centre-slot enemy's face+halo bottom sat at about -15.2 deg
// (-17.2 deg halted, ENEMY_RISE 0.15) while the panel top edge sat at about -7.0 deg (1.0 m,
// 15 deg below, 0.28 m tall): an 8-10 deg overlap, so only the "Shields/Hits" line showed.
//
// API contract for NEW src/flashcards/panel-layout.ts (pure; no three.js / IWSDK imports; metres,
// radians; Y up, yaw 0 faces -Z like spawn.ts / fan.ts). It is the single source of these numbers
// for card-question-panel.ts and card-enemy-field.ts:
//   export interface Vec3 { x: number; y: number; z: number }
//   export const PANEL_LAYOUT: Readonly<{ widthM: 0.6; heightM: 0.28; distanceM: 1.0; pitchBelowDeg: 20 }>;
//   export const ENEMY_RISE_M = 0.25;                      // parked enemy centre above eye.y
//   export const ORB_LAYOUT: Readonly<{ downM: 0.35; forwardM: 0.42; spacingM: 0.16 }>;
//   export function panelPlacement(eye: Vec3, yawRad: number): { center: Vec3; top: Vec3; bottom: Vec3 };
//     center = eye + distanceM along the yaw-forward ray pitched pitchBelowDeg down; the panel faces
//     the eye, so top/bottom = the midpoints of its top/bottom edges (center -/+ heightM/2 along the
//     pitched panel's up axis).
//   export function parkedEnemyCenter(eye: Vec3, slotGoal: { x: number; z: number }): Vec3;
//     { x: slotGoal.x, y: eye.y + ENEMY_RISE_M, z: slotGoal.z }.
//   export function orbPositions(eye: Vec3, yawRad: number, count: number): Vec3[];
//     orb i at local (x = (i - (count-1)/2) * spacingM, y = -downM, z = -forwardM) in the yaw-only
//     frame at the eye.
//   Every function throws RangeError on a non-finite eye component, yaw or slot goal.
// src/card-enemy.ts exports ENEMY_W, ENEMY_H, HALO_PAD, HALTED_SCALE (glow quad =
// (ENEMY_W + HALO_PAD) x (ENEMY_H + HALO_PAD), x HALTED_SCALE when halted).
// ENC-003 is the panel placement spec line.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@iwsdk/core', async () => await import('three'));

import { ENEMY_H, ENEMY_W, HALO_PAD, HALTED_SCALE } from '../src/card-enemy.js';
import { ENCOUNTER_DEFAULTS, PANEL } from '../src/flashcards/encounter.js';
import { FAN_SLOT_BEARINGS_DEG, fanSlotGoal } from '../src/flashcards/fan.js';
import {
  ENEMY_RISE_M,
  ORB_LAYOUT,
  orbPositions,
  PANEL_LAYOUT,
  panelPlacement,
  parkedEnemyCenter,
  type Vec3,
} from '../src/flashcards/panel-layout.js';

const DEG = Math.PI / 180;
/** Minimum clear band between the panel top and the lowest parked face+halo, as seen from the eye. */
const MIN_GAP_DEG = 2;
/** Comfortable vertical reading band: from the eye line down to this many degrees below it. */
const LOWEST_COMFORT_DEG = -35;
/** Seated arm reach from the eye (plan ~0.6 m). */
const MAX_REACH_M = 0.6;
/** Glow quad half height, scaled by HALTED_SCALE (the largest a parked enemy draws). */
const FACE_HALO_HALF_H = ((ENEMY_H + HALO_PAD) / 2) * HALTED_SCALE;
/** Glow quad half width, halted. */
const FACE_HALO_HALF_W = ((ENEMY_W + HALO_PAD) / 2) * HALTED_SCALE;
/** src/card-question-panel.ts ORB_RADIUS (deck-orb look used by answer orbs). */
const ORB_RADIUS = 0.05;
/** src/flashcards/deck.ts MAX_ORBS: a full answer row. */
const MAX_ANSWER_ORBS = 4;
const HOLD = ENCOUNTER_DEFAULTS.reachDistance;
const SEATED = 1.1;
const STANDING = 1.7;
const YAWS = [0, 0.7, -1.9, Math.PI];

function eyeAt(y: number, x = 0.3, z = -0.4): Vec3 {
  return { x, y, z };
}

/** Elevation (deg) of `p` above the eye's horizontal plane. */
function elevationDeg(eye: Vec3, p: Vec3): number {
  return Math.atan2(p.y - eye.y, Math.hypot(p.x - eye.x, p.z - eye.z)) / DEG;
}

function panelBandDeg(eye: Vec3, yaw: number): { top: number; bottom: number } {
  const { top, bottom } = panelPlacement(eye, yaw);
  return { top: elevationDeg(eye, top), bottom: elevationDeg(eye, bottom) };
}

function enemyBandDeg(eye: Vec3, yaw: number, slot: number): { top: number; bottom: number } {
  const c = parkedEnemyCenter(eye, fanSlotGoal(slot, eye, yaw, HOLD));
  return {
    top: elevationDeg(eye, { ...c, y: c.y + FACE_HALO_HALF_H }),
    bottom: elevationDeg(eye, { ...c, y: c.y - FACE_HALO_HALF_H }),
  };
}

// Covers: ENC-003, CARDS-010, CARDS-011
describe('panel layout: question panel clear of every parked enemy face (regression: w7 panel)', () => {
  it('the panel top sits at least 2 deg below the face+halo bottom of every fan slot', () => {
    for (const yaw of YAWS) {
      const eye = eyeAt(STANDING);
      const panel = panelBandDeg(eye, yaw);
      for (let slot = 0; slot < FAN_SLOT_BEARINGS_DEG.length; slot++) {
        const enemy = enemyBandDeg(eye, yaw, slot);
        expect(
          enemy.bottom - panel.top,
          `slot ${slot} yaw ${yaw}: face+halo bottom ${enemy.bottom.toFixed(2)} deg vs panel top ${panel.top.toFixed(2)} deg`,
        ).toBeGreaterThanOrEqual(MIN_GAP_DEG);
      }
    }
  });

  it('the panel and the parked faces do not overlap vertically at all', () => {
    const eye = eyeAt(STANDING);
    const panel = panelBandDeg(eye, 0);
    for (let slot = 0; slot < FAN_SLOT_BEARINGS_DEG.length; slot++) {
      const enemy = enemyBandDeg(eye, 0, slot);
      const overlap = Math.min(panel.top, enemy.top) - Math.max(panel.bottom, enemy.bottom);
      expect(overlap, `slot ${slot} overlaps the panel by ${overlap.toFixed(2)} deg`).toBeLessThan(0);
    }
  });

  it('a parked enemy centre still rides above the eye line (the panel never hides its face)', () => {
    const eye = eyeAt(STANDING);
    for (let slot = 0; slot < FAN_SLOT_BEARINGS_DEG.length; slot++) {
      const c = parkedEnemyCenter(eye, fanSlotGoal(slot, eye, 0, HOLD));
      expect(c.y).toBeGreaterThan(eye.y);
    }
  });
});

// Covers: ENC-003
describe('panel layout: comfortable reading band', () => {
  it('the whole panel, top edge included, lies between the eye line and 35 deg below it', () => {
    for (const y of [SEATED, STANDING]) {
      for (const yaw of YAWS) {
        const band = panelBandDeg(eyeAt(y), yaw);
        expect(band.top, `top edge at eye ${y} yaw ${yaw}`).toBeLessThanOrEqual(0);
        expect(band.bottom, `bottom edge at eye ${y} yaw ${yaw}`).toBeGreaterThanOrEqual(LOWEST_COMFORT_DEG);
        expect(band.top).toBeGreaterThan(band.bottom);
      }
    }
  });

  it('the panel centre is the configured distance from the eye and straight ahead on the yaw', () => {
    for (const yaw of YAWS) {
      const eye = eyeAt(STANDING);
      const { center } = panelPlacement(eye, yaw);
      const d = { x: center.x - eye.x, y: center.y - eye.y, z: center.z - eye.z };
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(PANEL_LAYOUT.distanceM, 9);
      // Horizontal direction matches yaw (yaw 0 faces -Z).
      expect(Math.atan2(-d.x, -d.z)).toBeCloseTo(Math.atan2(Math.sin(yaw), Math.cos(yaw)), 9);
      expect(elevationDeg(eye, center)).toBeCloseTo(-PANEL_LAYOUT.pitchBelowDeg, 9);
    }
  });

  it('top and bottom edge midpoints are one panel height apart', () => {
    const { top, bottom } = panelPlacement(eyeAt(STANDING), 0.4);
    expect(Math.hypot(top.x - bottom.x, top.y - bottom.y, top.z - bottom.z)).toBeCloseTo(PANEL_LAYOUT.heightM, 9);
  });
});

// Covers: ENC-003, CARDS-010
describe('panel layout: answer orbs below the panel and within reach', () => {
  it('every orb of a full row hangs below the panel bottom edge as seen from the eye', () => {
    for (const yaw of YAWS) {
      const eye = eyeAt(STANDING);
      const panelBottom = panelBandDeg(eye, yaw).bottom;
      for (const orb of orbPositions(eye, yaw, MAX_ANSWER_ORBS)) {
        const orbTop = elevationDeg(eye, { ...orb, y: orb.y + ORB_RADIUS });
        expect(orbTop, `orb top ${orbTop.toFixed(2)} deg vs panel bottom ${panelBottom.toFixed(2)} deg`).toBeLessThan(
          panelBottom,
        );
      }
    }
  });

  it('every orb of a full row is within 0.6 m arm reach of the eye', () => {
    for (const yaw of YAWS) {
      const eye = eyeAt(SEATED);
      for (const orb of orbPositions(eye, yaw, MAX_ANSWER_ORBS)) {
        const reach = Math.hypot(orb.x - eye.x, orb.y - eye.y, orb.z - eye.z);
        expect(reach, `orb at ${reach.toFixed(3)} m`).toBeLessThanOrEqual(MAX_REACH_M);
      }
    }
  });

  it('orbs are spaced evenly across the yaw-right axis, centred on the forward ray', () => {
    const eye = eyeAt(STANDING, 0, 0);
    const orbs = orbPositions(eye, 0, MAX_ANSWER_ORBS);
    expect(orbs.map((o) => o.x)).toEqual([-0.24, -0.08, 0.08, 0.24].map((x) => expect.closeTo(x, 9)));
    for (const o of orbs) {
      expect(o.y).toBeCloseTo(eye.y - ORB_LAYOUT.downM, 9);
      expect(o.z).toBeCloseTo(eye.z - ORB_LAYOUT.forwardM, 9);
    }
    expect(orbPositions(eye, 0, 0)).toEqual([]);
  });
});

// Covers: ENC-003, CARDS-010
describe('panel layout: pinned numbers', () => {
  it('pins panel size, distance, pitch, enemy rise and orb offsets', () => {
    expect(PANEL_LAYOUT).toEqual({ widthM: 0.6, heightM: 0.28, distanceM: 1.0, pitchBelowDeg: 20 });
    expect(ENEMY_RISE_M).toBe(0.25);
    expect(ORB_LAYOUT).toEqual({ downM: 0.35, forwardM: 0.42, spacingM: 0.16 });
  });

  it('the exported layout objects are frozen', () => {
    expect(Object.isFrozen(PANEL_LAYOUT)).toBe(true);
    expect(Object.isFrozen(ORB_LAYOUT)).toBe(true);
  });

  it('the encounter PANEL distance and pitch agree with the layout (one source)', () => {
    expect(PANEL.distance).toBe(PANEL_LAYOUT.distanceM);
    expect(PANEL.pitchBelowDeg).toBe(PANEL_LAYOUT.pitchBelowDeg);
  });
});

// Covers: ENC-003, CARDS-010
describe('panel layout: eye height and bad input', () => {
  it('seated and standing eyes get identical clearances', () => {
    for (const yaw of YAWS) {
      const seatedPanel = panelBandDeg(eyeAt(SEATED), yaw);
      const standingPanel = panelBandDeg(eyeAt(STANDING), yaw);
      expect(seatedPanel.top).toBeCloseTo(standingPanel.top, 9);
      expect(seatedPanel.bottom).toBeCloseTo(standingPanel.bottom, 9);
      for (let slot = 0; slot < FAN_SLOT_BEARINGS_DEG.length; slot++) {
        const a = enemyBandDeg(eyeAt(SEATED), yaw, slot);
        const b = enemyBandDeg(eyeAt(STANDING), yaw, slot);
        expect(a.bottom - seatedPanel.top).toBeCloseTo(b.bottom - standingPanel.top, 9);
        expect(a.bottom - seatedPanel.top).toBeGreaterThanOrEqual(MIN_GAP_DEG);
      }
    }
  });

  it('positions scale with the eye: moving the eye moves everything by the same offset', () => {
    const a = panelPlacement(eyeAt(SEATED, 0, 0), 0.3).center;
    const b = panelPlacement(eyeAt(STANDING, 1, -2), 0.3).center;
    expect(b.x - a.x).toBeCloseTo(1, 9);
    expect(b.y - a.y).toBeCloseTo(STANDING - SEATED, 9);
    expect(b.z - a.z).toBeCloseTo(-2, 9);
  });

  it('rejects a non-finite eye or yaw with a RangeError', () => {
    const bad = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const v of bad) {
      expect(() => panelPlacement(eyeAt(v), 0)).toThrow(RangeError);
      expect(() => panelPlacement({ x: v, y: 1.6, z: 0 }, 0)).toThrow(RangeError);
      expect(() => panelPlacement({ x: 0, y: 1.6, z: v }, 0)).toThrow(RangeError);
      expect(() => panelPlacement(eyeAt(1.6), v)).toThrow(RangeError);
      expect(() => orbPositions(eyeAt(v), 0, 4)).toThrow(RangeError);
      expect(() => orbPositions(eyeAt(1.6), v, 4)).toThrow(RangeError);
      expect(() => parkedEnemyCenter(eyeAt(v), { x: 0, z: -0.7 })).toThrow(RangeError);
      expect(() => parkedEnemyCenter(eyeAt(1.6), { x: v, z: -0.7 })).toThrow(RangeError);
    }
  });
});

/** Quest 3 half horizontal field of view. */
const HALF_FOV_DEG = 55;
/** Minimum clear band between a side-slot glow bottom and the panel top, as seen from the eye. */
const MIN_SIDE_GLOW_GAP_DEG = 5;
const SIDE_SLOTS = FAN_SLOT_BEARINGS_DEG.flatMap((b, slot) => (b === 0 ? [] : [slot]));

/** Horizontal angle (deg) of `p` from the yaw-forward ray at the eye; + is to the right. */
function azimuthDeg(eye: Vec3, yaw: number, p: Vec3): number {
  const dx = p.x - eye.x;
  const dz = p.z - eye.z;
  const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  const fwd = -(Math.sin(yaw) * dx + Math.cos(yaw) * dz);
  return Math.atan2(right, fwd) / DEG;
}

// Covers: ENC-003, CARDS-010
describe('panel layout: thinner glow frame keeps side slots in view and clear of the panel', () => {
  it('src/card-enemy.ts exports the glow sizes: 0.36 x 0.5 face, 0.10 m halo pad, x1.08 halted', () => {
    expect(ENEMY_W).toBe(0.36);
    expect(ENEMY_H).toBe(0.5);
    expect(HALO_PAD).toBe(0.1);
    expect(HALTED_SCALE).toBe(1.08);
  });

  it('a halted side-slot glow outer edge is within 55 deg of centre (Quest 3 half FOV)', () => {
    expect(SIDE_SLOTS.length).toBeGreaterThan(0);
    for (const y of [SEATED, STANDING]) {
      for (const yaw of YAWS) {
        const eye = eyeAt(y);
        for (const slot of SIDE_SLOTS) {
          const c = parkedEnemyCenter(eye, fanSlotGoal(slot, eye, yaw, HOLD));
          const dist = Math.hypot(c.x - eye.x, c.z - eye.z);
          // The card faces the eye, so its outer edge is half a glow width beside the centre.
          const outer = Math.abs(azimuthDeg(eye, yaw, c)) + Math.atan2(FACE_HALO_HALF_W, dist) / DEG;
          expect(
            outer,
            `eye y ${y} slot ${slot} yaw ${yaw}: outer glow edge ${outer.toFixed(2)} deg`,
          ).toBeLessThanOrEqual(HALF_FOV_DEG);
        }
      }
    }
  });

  it('a halted side-slot glow bottom sits at least 5 deg above the question panel top', () => {
    for (const y of [SEATED, STANDING]) {
      for (const yaw of YAWS) {
        const eye = eyeAt(y);
        const panelTop = panelBandDeg(eye, yaw).top;
        for (const slot of SIDE_SLOTS) {
          const glowBottom = enemyBandDeg(eye, yaw, slot).bottom;
          expect(
            glowBottom - panelTop,
            `slot ${slot} eye ${y} yaw ${yaw}: glow bottom ${glowBottom.toFixed(2)} vs panel top ${panelTop.toFixed(2)} deg`,
          ).toBeGreaterThanOrEqual(MIN_SIDE_GLOW_GAP_DEG);
        }
      }
    }
  });
});
