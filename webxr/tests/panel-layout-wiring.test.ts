// Requirement: what the player sees matches the layout contract. The live question panel, its
// answer orbs and every parked enemy are placed from src/flashcards/panel-layout.ts (the single
// source of the panel/enemy clearance numbers), so the panel-clear-of-enemy-faces guarantee locked
// in tests/panel-layout.test.ts holds in the running game, not only on paper: the panel mesh centre
// is panelPlacement(eye, yaw).center, orb i is orbPositions(eye, yaw, n)[i], and an enemy parked on
// the hold line has its centre at parkedEnemyCenter(eye, slotGoal).y = eye.y + ENEMY_RISE_M.
// Regression (w7 panel): card-question-panel.ts and card-enemy-field.ts each carried private
// copies (PANEL_W/H, ORB_DOWN/FORWARD, ENEMY_RISE 0.15), so the two sides drifted into overlap.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iwsdk/core', async () => ({ ...(await import('three')), RayInteractable: {} }));
// Canvas painting needs a DOM; the layout only cares about plane size and placement.
vi.mock('../src/card-paint.js', async () => {
  const three = await import('three');
  return {
    paintText: () => {},
    paintFace: () => {},
    textPlane: (_lines: readonly string[], w: number, h: number) =>
      new three.Mesh(new three.PlaneGeometry(w, h), new three.MeshBasicMaterial()),
  };
});

import { Object3D, Vector3 } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { EnemyField } from '../src/card-enemy-field.js';
import { QuestionPanel } from '../src/card-question-panel.js';
import { createEncounter, ENCOUNTER_DEFAULTS } from '../src/flashcards/encounter.js';
import { ENEMY_RISE_M, orbPositions, panelPlacement } from '../src/flashcards/panel-layout.js';
import { createPool } from '../src/flashcards/pool.js';
import type { Wave } from '../src/flashcards/wave.js';

interface FakeEntity {
  object3D: Object3D;
  addComponent: () => void;
  dispose: () => void;
}

function fakeWorld(): { world: World; created: FakeEntity[] } {
  const created: FakeEntity[] = [];
  const world = {
    createTransformEntity(obj: Object3D, opts?: { parent?: FakeEntity }) {
      opts?.parent?.object3D.add(obj);
      const e: FakeEntity = { object3D: obj, addComponent: () => {}, dispose: () => obj.removeFromParent() };
      created.push(e);
      return e;
    },
  };
  return { world: world as unknown as World, created };
}

function worldPos(o: Object3D): Vector3 {
  o.updateWorldMatrix(true, false);
  return o.getWorldPosition(new Vector3());
}

beforeEach(() => {
  // createFaceParts draws into a canvas; a bare stand-in is enough without a renderer.
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Covers: ENC-003, CARDS-010
describe('question panel takes its placement from panel-layout', () => {
  for (const [eyeY, yaw] of [
    [1.1, 0],
    [1.7, 0.8],
    [1.6, -2.4],
  ] as const) {
    it(`panel centre and orbs match the layout (eye ${eyeY} m, yaw ${yaw})`, () => {
      const { world, created } = fakeWorld();
      const panel = new QuestionPanel(world);
      const eye = new Vector3(0.2, eyeY, -0.3);
      const labels = ['a', 'b', 'c', 'd'];
      const orbs = panel.show(eye, yaw, ['Capital of France?', 'Shields 3  Hits 0'], labels);

      const anchor = created[0].object3D;
      const panelMesh = anchor.children[0];
      const expected = panelPlacement(eye, yaw).center;
      const got = worldPos(panelMesh);
      expect(got.x).toBeCloseTo(expected.x, 6);
      expect(got.y).toBeCloseTo(expected.y, 6);
      expect(got.z).toBeCloseTo(expected.z, 6);

      const want = orbPositions(eye, yaw, labels.length);
      orbs.forEach((orb, i) => {
        const p = worldPos((orb as unknown as FakeEntity).object3D);
        expect(p.x, `orb ${i} x`).toBeCloseTo(want[i].x, 6);
        expect(p.y, `orb ${i} y`).toBeCloseTo(want[i].y, 6);
        expect(p.z, `orb ${i} z`).toBeCloseTo(want[i].z, 6);
      });
      panel.clear();
    });
  }
});

// Covers: CARDS-010, CARDS-011
describe('enemy field parks enemies at the panel-layout rise', () => {
  for (const eyeY of [1.1, 1.7]) {
    it(`a parked enemy centre sits ENEMY_RISE_M above an eye at ${eyeY} m`, () => {
      const { world } = fakeWorld();
      const field = new EnemyField(world);
      const cfg = ENCOUNTER_DEFAULTS;
      const enc = { ...createEncounter(cfg), phase: 'slashable' as const, distance: cfg.reachDistance };
      const wave = { active: [{ id: 'e1', enc, pool: createPool(['e1']) }], targetId: null, cfg } as unknown as Wave;
      const eye = new Vector3(0, eyeY, 0);
      field.spawnMissing(wave, [], eye, () => 0);
      field.update(wave, 1, 0);
      const out = new Vector3();
      expect(field.worldPosition('e1', out)).toBe(true);
      expect(out.y).toBeCloseTo(eyeY + ENEMY_RISE_M, 6);
      expect(Math.hypot(out.x, out.z)).toBeCloseTo(cfg.reachDistance, 6);
      field.destroy();
    });
  }
});
