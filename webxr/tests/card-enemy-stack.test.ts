// Requirement (stack fight, Kev 2026-11-12): each card-enemy visibly carries its stack of cards:
// one card mesh per card it still holds, so the player sees the stack shrink as cards are knocked
// off. Only one enemy fights at a time, so a lone enemy entering an empty field parks in the centre
// slot of the fan straight ahead, even when it walks in from a wall off to the side.
//
// New seams (imported through the module namespace so a missing export fails readably):
//   card-enemy.ts        setCardCount(parts: EnemyParts, n: number): void
//                        stack card meshes are tagged userData.stackCard; exactly n are visible
//   card-enemy-field.ts  update(wave) shows hp(pool) stack cards per enemy; the first spawn into
//                        an empty field takes fan slot 1 (the centre)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iwsdk/core', async () => ({ ...(await import('three')), RayInteractable: {} }));
vi.mock('../src/card-paint.js', () => ({ paintText: () => {}, paintFace: () => {} }));

import { MeshBasicMaterial, Object3D, PlaneGeometry, Vector3 } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import * as cardEnemyModule from '../src/card-enemy.js';
import { buildEnemy, type EnemyParts, type FaceParts } from '../src/card-enemy.js';
import { EnemyField } from '../src/card-enemy-field.js';
import { createEncounter, ENCOUNTER_DEFAULTS } from '../src/flashcards/encounter.js';
import { FAN_SLOT_BEARINGS_DEG, fanSlotGoal } from '../src/flashcards/fan.js';
import { ENEMY_RISE_M } from '../src/flashcards/panel-layout.js';
import { createPool, damage, type Pool } from '../src/flashcards/pool.js';
import type { Wall } from '../src/flashcards/spawn.js';
import type { Wave } from '../src/flashcards/wave.js';

const CFG = ENCOUNTER_DEFAULTS;
const HOLD = CFG.reachDistance;

function setCardCount(parts: EnemyParts, n: number): void {
  const f = (cardEnemyModule as unknown as Record<string, unknown>).setCardCount;
  if (typeof f !== 'function') throw new Error('card-enemy does not export setCardCount(parts, n)');
  (f as (p: EnemyParts, n: number) => void)(parts, n);
}

/** Stack card meshes the player can see under `root`. */
function visibleStackCards(root: Object3D): number {
  let n = 0;
  root.traverseVisible((o) => {
    if (o.userData.stackCard === true) n++;
  });
  return n;
}

function fakeFace(): FaceParts {
  return { geometry: new PlaneGeometry(0.36, 0.5), material: new MeshBasicMaterial() };
}

interface FakeEntity {
  object3D: Object3D;
  addComponent: () => void;
  dispose: () => void;
}

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

/** A wave whose enemies have all arrived at the hold line, each carrying the given pool. */
function arrivedWave(enemies: readonly { id: string; pool: Pool }[]): Wave {
  const active = enemies.map(({ id, pool }) => ({
    id,
    pool,
    enc: { ...createEncounter(CFG), phase: 'slashable' as const, distance: HOLD },
  }));
  return { active, queue: [], queueSizes: [], targetId: null, maxActive: 1, cfg: CFG } as unknown as Wave;
}

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

function rootOf(field: EnemyField, byObject: Map<Object3D, FakeEntity>, id: string): Object3D {
  const entry = [...byObject].find(([, e]) => field.idOf(e as never) === id);
  if (!entry) throw new Error(`no live view for ${id}`);
  return entry[0];
}

function slotOf(p: Vector3, frameEye: Vector3, frameYaw: number): number {
  for (let slot = 0; slot < FAN_SLOT_BEARINGS_DEG.length; slot++) {
    const g = fanSlotGoal(slot, frameEye, frameYaw, HOLD);
    if (Math.hypot(p.x - g.x, p.z - g.z) < 1e-6 && Math.abs(p.y - (frameEye.y + ENEMY_RISE_M)) < 1e-6) return slot;
  }
  return -1;
}

// Covers: CARDS-010
describe('card-enemy stack: one visible card mesh per remaining card', () => {
  function enemy(): EnemyParts {
    return buildEnemy(fakeFace());
  }

  it('shows exactly n stack cards for a 5-card boss and a 3-card regular', () => {
    const boss = enemy();
    setCardCount(boss, 5);
    expect(visibleStackCards(boss.root)).toBe(5);
    const regular = enemy();
    setCardCount(regular, 3);
    expect(visibleStackCards(regular.root)).toBe(3);
  });

  it('shrinks as cards are knocked off, down to a single card', () => {
    const parts = enemy();
    setCardCount(parts, 5);
    setCardCount(parts, 4);
    expect(visibleStackCards(parts.root)).toBe(4);
    setCardCount(parts, 1);
    expect(visibleStackCards(parts.root)).toBe(1);
  });

  it('shows no stack card at zero', () => {
    const parts = enemy();
    setCardCount(parts, 3);
    setCardCount(parts, 0);
    expect(visibleStackCards(parts.root)).toBe(0);
  });
});

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

// Covers: CARDS-010, ENC-001
describe('enemy field: the stack follows the pool', () => {
  it('after update the enemy shows hp(pool) stack cards, and fewer once a card is knocked off', () => {
    const head = new Head(new Vector3(0, 1.6, 0), 0);
    const { world, byObject } = fakeWorld();
    field = new EnemyField(world);
    let pool = createPool(['a', 'b', 'c']);
    let wave = arrivedWave([{ id: 'a', pool }]);
    field.spawnMissing(wave, [], head.eye, head.read);
    field.update(wave, 1, 0);
    expect(visibleStackCards(rootOf(field, byObject, 'a'))).toBe(3);

    pool = damage(pool);
    wave = arrivedWave([{ id: 'a', pool }]);
    field.update(wave, 1, 0);
    expect(visibleStackCards(rootOf(field, byObject, 'a'))).toBe(2);
  });
});

// Covers: ENC-001, CARDS-010
describe('enemy field: a lone enemy takes the centre slot', () => {
  it('parks in fan slot 1 even when it spawns from a wall off to the side', () => {
    const head = new Head(new Vector3(0, 1.6, 0), 0);
    const sideWall: Wall = {
      center: { x: -1.2, y: 1.5, z: -2 },
      normal: { x: 0, y: 0, z: 1 },
      width: 0.1,
      height: 1,
    };
    field = new EnemyField(fakeWorld().world);
    const wave = arrivedWave([{ id: 'a', pool: createPool(['a']) }]);
    field.spawnMissing(wave, [sideWall], head.eye, head.read);
    field.update(wave, 1, 0);
    const out = new Vector3();
    expect(field.worldPosition('a', out)).toBe(true);
    expect(slotOf(out, head.pos, 0)).toBe(1);
  });
});
