// Requirement: arrived card-enemies park in the fixed three-slot fan (ENC-001, amended
// 2026-11-11): the fan is anchored to the head position and facing captured when the first enemy
// of an empty field arrives and stays put until the field is empty, so a refill after a defeat
// parks in the freed slot of that SAME fan even if the player has since turned or stepped; no two
// live enemies share a slot; and every parked enemy is turned to face the player's eye.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iwsdk/core', async () => ({ ...(await import('three')), RayInteractable: {} }));
vi.mock('../src/card-paint.js', () => ({ paintText: () => {}, paintFace: () => {} }));

import { Object3D, Vector3 } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { EnemyField } from '../src/card-enemy-field.js';
import { createEncounter, ENCOUNTER_DEFAULTS } from '../src/flashcards/encounter.js';
import { FAN_SLOT_BEARINGS_DEG, fanSlotGoal } from '../src/flashcards/fan.js';
import { ENEMY_RISE_M } from '../src/flashcards/panel-layout.js';
import { createPool } from '../src/flashcards/pool.js';
import type { Wave } from '../src/flashcards/wave.js';

interface FakeEntity {
  object3D: Object3D;
  addComponent: () => void;
  dispose: () => void;
}

const CFG = ENCOUNTER_DEFAULTS;
const HOLD = CFG.reachDistance;

function fakeWorld(): { world: World; byObject: Map<Object3D, FakeEntity> } {
  const byObject = new Map<Object3D, FakeEntity>();
  const world = {
    createTransformEntity(obj: Object3D) {
      const e: FakeEntity = { object3D: obj, addComponent: () => {}, dispose: () => obj.removeFromParent() };
      byObject.set(obj, e);
      return e;
    },
  };
  return { world: world as unknown as World, byObject };
}

/** A wave whose enemies have all arrived (encounter at the reach line). */
function arrivedWave(ids: readonly string[]): Wave {
  const active = ids.map((id) => ({
    id,
    enc: { ...createEncounter(CFG), phase: 'slashable' as const, distance: HOLD },
    pool: createPool([id]),
  }));
  return { active, targetId: null, cfg: CFG } as unknown as Wave;
}

/** Head stand-in: readHead() copies the pose into the shared eye, like cards.ts readHead(). */
class Head {
  readonly eye = new Vector3();
  constructor(
    public pos: Vector3,
    public yaw: number,
  ) {}
  read = (): number => {
    this.eye.copy(this.pos);
    return this.yaw;
  };
}

function step(field: EnemyField, head: Head, ids: readonly string[]): Wave {
  const wave = arrivedWave(ids);
  field.spawnMissing(wave, [], head.eye, head.read);
  field.update(wave, 1, 0);
  return wave;
}

function parked(field: EnemyField, id: string): Vector3 {
  const out = new Vector3();
  expect(field.worldPosition(id, out), `${id} has a live view`).toBe(true);
  return out;
}

/** Fan slot index whose hold-line goal (in the given frame) matches `p`; -1 if none. */
function slotOf(p: Vector3, frameEye: Vector3, frameYaw: number): number {
  for (let slot = 0; slot < FAN_SLOT_BEARINGS_DEG.length; slot++) {
    const g = fanSlotGoal(slot, frameEye, frameYaw, HOLD);
    if (Math.hypot(p.x - g.x, p.z - g.z) < 1e-6 && Math.abs(p.y - (frameEye.y + ENEMY_RISE_M)) < 1e-6) return slot;
  }
  return -1;
}

function occupiedSlots(field: EnemyField, ids: readonly string[], frameEye: Vector3, frameYaw: number): number[] {
  return ids.map((id) => slotOf(parked(field, id), frameEye, frameYaw)).sort((a, b) => a - b);
}

let field: EnemyField | undefined;

beforeEach(() => {
  // createFaceParts draws into a canvas; a bare stand-in is enough without a renderer.
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});

afterEach(() => {
  field?.destroy();
  field = undefined;
  vi.unstubAllGlobals();
});

// Covers: ENC-001, CARDS-010
describe('enemy field: fan slot occupancy across spawn, remove and refill', () => {
  it('three spawns fill the three fan slots of the frame captured at the first spawn', () => {
    const head = new Head(new Vector3(0.3, 1.6, -0.4), 0.5);
    field = new EnemyField(fakeWorld().world);
    step(field, head, ['a', 'b', 'c']);
    expect(occupiedSlots(field, ['a', 'b', 'c'], head.pos, 0.5)).toEqual([0, 1, 2]);
  });

  it('remove frees exactly that enemy\'s slot and leaves the others parked where they were', () => {
    const head = new Head(new Vector3(0, 1.6, 0), 0);
    field = new EnemyField(fakeWorld().world);
    step(field, head, ['a', 'b', 'c']);
    const before = new Map(['a', 'b', 'c'].map((id) => [id, slotOf(parked(field!, id), head.pos, 0)]));
    field.remove('b');
    expect(field.worldPosition('b', new Vector3())).toBe(false);
    const wave = arrivedWave(['a', 'c']);
    field.update(wave, 1, 0);
    expect(slotOf(parked(field, 'a'), head.pos, 0)).toBe(before.get('a'));
    expect(slotOf(parked(field, 'c'), head.pos, 0)).toBe(before.get('c'));
    expect(occupiedSlots(field, ['a', 'c'], head.pos, 0)).not.toContain(before.get('b'));
  });

  it('a refill after a head turn and step parks in the freed slot of the SAME frame', () => {
    const frameEye = new Vector3(0, 1.6, 0);
    const head = new Head(frameEye.clone(), 0);
    field = new EnemyField(fakeWorld().world);
    step(field, head, ['a', 'b', 'c']);
    const freed = slotOf(parked(field, 'b'), frameEye, 0);
    field.remove('b');

    // Player turns 50 deg and steps 0.3 m before the refill arrives.
    head.pos = new Vector3(0.3, 1.6, 0.2);
    head.yaw = 0.9;
    step(field, head, ['a', 'c', 'd']);

    expect(slotOf(parked(field, 'd'), frameEye, 0), 'refill parks in the held frame').toBe(freed);
    expect(occupiedSlots(field, ['a', 'c', 'd'], frameEye, 0)).toEqual([0, 1, 2]);
  });

  it('once the field empties, the next spawn captures a fresh frame from the current head', () => {
    const head = new Head(new Vector3(0, 1.6, 0), 0);
    field = new EnemyField(fakeWorld().world);
    step(field, head, ['a']);
    field.remove('a');

    head.pos = new Vector3(1, 1.6, -1);
    head.yaw = -1.2;
    step(field, head, ['b']);
    expect(slotOf(parked(field, 'b'), head.pos, -1.2)).toBeGreaterThanOrEqual(0);
  });
});

// Covers: ENC-001, ENC-007
describe('enemy field: parked enemies face the eye', () => {
  function expectFacesEye(root: Object3D, goal: Vector3, eye: Vector3, label: string): void {
    // A plane's front (+Z local) rotated by the root's yaw must point from the slot to the eye.
    const yaw = root.rotation.y;
    const want = Math.atan2(eye.x - goal.x, eye.z - goal.z);
    expect(Math.abs(root.rotation.x), `${label} pitch`).toBeCloseTo(0, 9);
    expect(Math.abs(root.rotation.z), `${label} roll`).toBeCloseTo(0, 9);
    expect(Math.sin(yaw), `${label} facing x`).toBeCloseTo(Math.sin(want), 9);
    expect(Math.cos(yaw), `${label} facing z`).toBeCloseTo(Math.cos(want), 9);
  }

  for (const yaw of [0, 0.8, -2.4]) {
    it(`each of the three parked enemies is squared to the eye (frame yaw ${yaw})`, () => {
      const head = new Head(new Vector3(0.2, 1.6, -0.3), yaw);
      const { world, byObject } = fakeWorld();
      field = new EnemyField(world);
      step(field, head, ['a', 'b', 'c']);
      for (const [obj, entity] of byObject) {
        const id = field.idOf(entity as never);
        if (id === undefined) continue;
        expectFacesEye(obj, parked(field, id), head.pos, id);
      }
      expect([...byObject.values()].filter((e) => field!.idOf(e as never) !== undefined)).toHaveLength(3);
    });
  }

  it('a refill faces the eye it spawned from, even after the player moved', () => {
    const head = new Head(new Vector3(0, 1.6, 0), 0);
    const { world, byObject } = fakeWorld();
    field = new EnemyField(world);
    step(field, head, ['a', 'b', 'c']);
    field.remove('a');
    head.pos = new Vector3(0.4, 1.6, 0.3);
    head.yaw = 0.6;
    step(field, head, ['b', 'c', 'd']);
    const entry = [...byObject].find(([, e]) => field!.idOf(e as never) === 'd');
    expect(entry).toBeDefined();
    expectFacesEye(entry![0], parked(field, 'd'), head.pos, 'd');
  });
});
