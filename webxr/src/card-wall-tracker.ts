/**
 * Keeps the wall list in sync with detected XR planes: rebuilt when a plane appears or disappears
 * (markDirty) or when any plane's lastChangedTime moves (a grown or corrected plane).
 */
import { XRPlane, type Entity } from '@iwsdk/core';
import { planeToWall, type PlaneLike } from './card-walls.js';
import type { Wall } from './flashcards/spawn.js';

type TimedPlane = PlaneLike & { lastChangedTime?: number };

// NaN never equals itself, so a NaN timestamp would force a wall rebuild every frame.
function changedTime(plane: TimedPlane): number | undefined {
  const t = plane.lastChangedTime;
  return Number.isFinite(t) ? t : undefined;
}

export class WallTracker {
  walls: Wall[] = [];
  private dirty = true;
  // lastChangedTime per XRPlane at the last rebuild.
  private readonly planeTimes = new WeakMap<object, number | undefined>();

  markDirty(): void {
    this.dirty = true;
  }

  refresh(planes: Iterable<Entity>): void {
    if (this.dirty || this.changed(planes)) this.rebuild(planes);
  }

  private rebuild(planes: Iterable<Entity>): void {
    this.dirty = false;
    this.walls = [];
    for (const entity of planes) {
      const plane = entity.getValue(XRPlane, '_plane') as TimedPlane | undefined;
      const obj = entity.object3D;
      if (plane === undefined || obj === undefined) continue;
      this.planeTimes.set(plane, changedTime(plane));
      const wall = planeToWall(plane, obj);
      if (wall !== null) this.walls.push(wall);
    }
  }

  // A few planes at most, one WeakMap lookup each per frame.
  private changed(planes: Iterable<Entity>): boolean {
    for (const entity of planes) {
      const plane = entity.getValue(XRPlane, '_plane') as TimedPlane | undefined;
      if (plane !== undefined && this.planeTimes.get(plane) !== changedTime(plane)) return true;
    }
    return false;
  }
}
