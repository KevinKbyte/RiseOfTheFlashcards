/**
 * The live enemy views for a wave: spawning each new enemy at a wall point spaced away from the
 * others, walking it to its own fan slot on the reach line, glowing it per phase, and
 * mapping ray-selected entities back to enemy ids.
 */
import { RayInteractable, Vector3, type Entity, type World } from '@iwsdk/core';
import {
  applyGlow,
  buildEnemy,
  createFaceParts,
  type EnemyParts,
  type FaceParts,
  setCardCount,
} from './card-enemy.js';
import { type FanFrame, nextFanFrame, placeInFan, wrap } from './flashcards/fan.js';
import { parkedEnemyCenter } from './flashcards/panel-layout.js';
import { hp } from './flashcards/pool.js';
import { pickSpawns, SPAWN_MIN_BEARING_GAP_DEG, type Wall } from './flashcards/spawn.js';
import { enemyGlow } from './flashcards/stun-look.js';
import type { Wave } from './flashcards/wave.js';

// Emerge just in front of the wall surface rather than half inside it.
const WALL_INSET = 0.1;
const EMERGE_SECONDS = 0.6;
const PULSE_RATE = 12;
const GAP_RAD = (SPAWN_MIN_BEARING_GAP_DEG * Math.PI) / 180;

interface EnemyView {
  entity: Entity;
  parts: EnemyParts;
  /** Emerge point (encounter at spawnDistance). */
  start: Vector3;
  /** Reach-line point (encounter at reachDistance): its fan slot, fixed at spawn. */
  goal: Vector3;
  /** Fan slot held until the view is removed; null only on the no-free-slot fallback. */
  slot: number | null;
  age: number;
}

// three.js yaw convention (yaw 0 faces -Z), matching spawn.ts.
function bearing(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

export class EnemyField {
  private readonly views = new Map<string, EnemyView>();
  private readonly enemyIds = new Map<Entity, string>();
  // Built once and shared by every enemy; owned (and disposed) here, not by the enemy entities.
  private face: FaceParts | undefined;
  // Captured when an enemy spawns into an empty field; held while any view is live. A slot is
  // freed simply by remove() dropping its view.
  private fanFrame: FanFrame | null = null;

  constructor(private readonly world: World) {}

  idOf(entity: Entity): string | undefined {
    return this.enemyIds.get(entity);
  }

  /** Copies the enemy's world position into `out`; false when the enemy has no live view. */
  worldPosition(id: string, out: Vector3): boolean {
    const obj = this.views.get(id)?.entity.object3D;
    if (obj === undefined) return false;
    obj.getWorldPosition(out);
    return true;
  }

  // readHead() refreshes `eye`; it is only called when an enemy actually needs a view.
  spawnMissing(wave: Wave, walls: readonly Wall[], eye: Vector3, readHead: () => number): void {
    let headYaw: number | null = null;
    for (const enemy of wave.active) {
      if (this.views.has(enemy.id)) continue;
      if (headYaw === null) {
        headYaw = readHead();
        // pickSpawns rejects a degenerate head pose; try again next frame.
        if (![headYaw, eye.x, eye.y, eye.z].every(Number.isFinite)) return;
      }
      this.spawn(enemy.id, walls, eye, headYaw, wave.cfg.reachDistance);
    }
  }

  // Encounter distance maps linearly onto each enemy's own emerge-to-reach segment, so enemies from
  // near and far walls share the wave's timing.
  update(wave: Wave, dt: number, clock: number): void {
    const { spawnDistance, reachDistance } = wave.cfg;
    const span = spawnDistance - reachDistance;
    const pulse = 0.5 + 0.5 * Math.sin(clock * PULSE_RATE);
    for (const { id, enc, pool } of wave.active) {
      const view = this.views.get(id);
      const obj = view?.entity.object3D;
      if (view === undefined || obj === undefined) continue;
      const t = span > 0 ? Math.min(Math.max((enc.distance - reachDistance) / span, 0), 1) : 0;
      obj.position.lerpVectors(view.goal, view.start, t);
      const scale = applyGlow(view.parts, enemyGlow(enc.phase, id === wave.targetId), pulse);
      setCardCount(view.parts, hp(pool));
      view.age += dt;
      obj.scale.setScalar(scale * Math.min(view.age / EMERGE_SECONDS, 1));
    }
  }

  remove(id: string): void {
    const view = this.views.get(id);
    if (view === undefined) return;
    this.enemyIds.delete(view.entity);
    view.entity.dispose();
    this.views.delete(id);
  }

  destroy(): void {
    for (const id of [...this.views.keys()]) this.remove(id);
    this.face?.material.map?.dispose();
    this.face?.material.dispose();
    this.face?.geometry.dispose();
    this.face = undefined;
  }

  // Ask for enough spaced candidates that at least one clears every active enemy's bearing (each
  // active bearing can block at most two picks spaced >= the gap), then take the most central one
  // that does; if none does (ring fallback), take the one farthest from its nearest neighbour.
  private spawn(
    id: string,
    walls: readonly Wall[],
    eye: Vector3,
    headYaw: number,
    reach: number,
  ): void {
    const head = { position: { x: eye.x, y: eye.y, z: eye.z }, yawRad: headYaw };
    const points = pickSpawns(walls, head, 2 * this.views.size + 1);
    let chosen = points[0].position;
    let chosenGap = -1;
    for (const { position } of points) {
      const gap = this.nearestBearingGap(eye, position.x, position.z);
      if (gap >= GAP_RAD) {
        chosen = position;
        break;
      }
      if (gap > chosenGap) {
        chosen = position;
        chosenGap = gap;
      }
    }

    const dx = chosen.x - eye.x;
    const dz = chosen.z - eye.z;
    const dist = Math.hypot(dx, dz);
    const ux = dist > 0 ? dx / dist : -Math.sin(headYaw);
    const uz = dist > 0 ? dz / dist : -Math.cos(headYaw);
    const startDist = Math.max(dist - WALL_INSET, reach);
    const start = new Vector3(eye.x + ux * startDist, chosen.y, eye.z + uz * startDist);
    // Park in the free fan slot nearest the spawn bearing so arrived faces never overlap. Slots are
    // placed from the shared fan frame, not the live head, so refills never drift onto a neighbour.
    this.fanFrame = nextFanFrame(this.fanFrame, this.views.size, { eye: { x: eye.x, z: eye.z }, yawRad: headYaw });
    const occupied = new Set<number>();
    for (const view of this.views.values()) if (view.slot !== null) occupied.add(view.slot);
    // A lone enemy (one stack at a time) parks straight ahead in the centre slot, whatever wall it
    // walked in from.
    const aim = this.views.size === 0 ? this.fanFrame.yawRad : Math.atan2(-ux, -uz);
    const placed = placeInFan(this.fanFrame, occupied, aim, reach);
    const slot = placed === null ? null : placed.slot;
    // No free slot: places off the live eye; reachable only if maxActive > 3 (FAN_SLOT_BEARINGS_DEG).
    const g = placed ?? { x: eye.x + ux * reach, z: eye.z + uz * reach };
    // Rides above the eye line, clear of the below-eye question panel (panel-layout.ts).
    const c = parkedEnemyCenter(eye, g);
    const goal = new Vector3(c.x, c.y, c.z);

    this.face ??= createFaceParts();
    const parts = buildEnemy(this.face);
    // Fixed for the whole walk, squared to the eye from the slot where the face is read.
    parts.root.rotation.set(0, Math.atan2(eye.x - goal.x, eye.z - goal.z), 0);
    parts.root.position.copy(start);
    parts.root.scale.setScalar(0);
    const entity = this.world.createTransformEntity(parts.root);
    entity.addComponent(RayInteractable);
    this.views.set(id, { entity, parts, start, goal, slot, age: 0 });
    this.enemyIds.set(entity, id);
  }

  /** Smallest absolute bearing difference (rad) from the eye to any live enemy; Infinity if none. */
  private nearestBearingGap(eye: Vector3, x: number, z: number): number {
    const b = bearing(eye.x, eye.z, x, z);
    let min = Infinity;
    for (const view of this.views.values()) {
      const p = view.entity.object3D?.position ?? view.start;
      const gap = Math.abs(wrap(bearing(eye.x, eye.z, p.x, p.z) - b));
      if (gap < min) min = gap;
    }
    return min;
  }
}
