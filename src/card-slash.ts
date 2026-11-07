/**
 * XR adapter for the pure slash-input classifier: each frame it samples the hand index fingertips
 * (primary) and controller grip poses (secondary) from the live XRFrame, converts them to world
 * space, and returns which answer orbs or card-enemies were slashed. Trigger select stays on the
 * existing Pressed path in cards.ts as the accessibility fallback.
 */
import { Vector3, type Entity, type Mesh, type World } from '@iwsdk/core';
import { poseToWorld } from './flashcards/pose-world.js';
import { createSlashInput, stepSlashInput, type InputFrame } from './flashcards/slash-input.js';
import type { SlashTarget } from './flashcards/slash.js';
import type { Vec3 } from './flashcards/spawn.js';

// A fingertip or controller tip has physical width; the orb collider grows by this much.
const TIP_MARGIN_M = 0.02;
// Card-enemies are 0.36 x 0.5 m planes; a sphere of half their height stands in for the collider.
const ENEMY_RADIUS_M = 0.25;

export type SlashHit = { kind: 'orb'; orb: Entity } | { kind: 'enemy'; id: string };

export class CardSlash {
  private state = createSlashInput();
  private readonly pos = new Vector3();
  private readonly scale = new Vector3();

  constructor(private readonly world: World) {}

  /** Targets slashed this frame, at most one hit per target. `t` is the uncapped input clock in seconds. */
  step(
    t: number,
    orbs: Iterable<Entity>,
    enemyIds: Iterable<string>,
    enemyPosition: (id: string, out: Vector3) => boolean,
  ): SlashHit[] {
    const hits = new Map<string, SlashHit>();
    const targets: SlashTarget[] = [];
    let i = 0;
    for (const orb of orbs) {
      const obj = orb.object3D;
      if (obj === undefined) continue;
      const id = `orb:${i++}`;
      hits.set(id, { kind: 'orb', orb });
      obj.getWorldPosition(this.pos);
      targets.push({ id, pos: toVec(this.pos), radius: orbRadius(obj as Mesh, this.scale) + TIP_MARGIN_M });
    }
    for (const enemyId of enemyIds) {
      if (!enemyPosition(enemyId, this.pos)) continue;
      const id = `enemy:${enemyId}`;
      hits.set(id, { kind: 'enemy', id: enemyId });
      targets.push({ id, pos: toVec(this.pos), radius: ENEMY_RADIUS_M });
    }
    const r = stepSlashInput(this.state, this.readFrame(t), targets);
    this.state = r.state;
    return r.picks.flatMap((id) => hits.get(id) ?? []);
  }

  // Poses come in the session reference space, which is the XR origin's local space; the origin's
  // world matrix lifts them into the same world space the orbs and enemies live in.
  private readFrame(t: number): InputFrame {
    const frame: InputFrame = { t };
    const xr = this.world.xrFrame;
    const ref = this.world.xrReferenceSpace;
    const session = this.world.xrSession;
    const originObj = this.world.playerEntity.object3D;
    if (!xr || !ref || !session || !originObj) return frame;
    const origin = originObj.matrixWorld.elements;
    const hands: NonNullable<InputFrame['hands']> = {};
    const controllers: NonNullable<InputFrame['controllers']> = {};
    for (const source of session.inputSources) {
      const side = source.handedness;
      if (side !== 'left' && side !== 'right') continue;
      if (source.hand) {
        const tip = source.hand.get('index-finger-tip');
        const p = tip ? xr.getJointPose?.(tip, ref) : undefined;
        if (p) hands[side] = poseToWorld(origin, p.transform.matrix).pos;
      } else if (source.targetRayMode === 'tracked-pointer') {
        const p = xr.getPose(source.gripSpace ?? source.targetRaySpace, ref);
        if (p) controllers[side] = poseToWorld(origin, p.transform.matrix);
      }
    }
    frame.hands = hands;
    frame.controllers = controllers;
    return frame;
  }
}

function toVec(v: Vector3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

/** World-space bounding-sphere radius of an orb mesh; 0 (never hit) when it has no geometry. */
function orbRadius(mesh: Mesh, scale: Vector3): number {
  const g = mesh.geometry;
  if (g === undefined) return 0;
  if (g.boundingSphere === null) g.computeBoundingSphere();
  mesh.getWorldScale(scale);
  return (g.boundingSphere?.radius ?? 0) * Math.max(scale.x, scale.y, scale.z);
}
