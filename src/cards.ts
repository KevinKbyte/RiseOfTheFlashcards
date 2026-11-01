/**
 * Passthrough (AR) flashcard page: a wave of cartoon-faced card enemies emerges from detected walls
 * (or an even ring when no walls are known) and walks toward the player along its own bearing.
 * Selecting any enemy at any distance (controller trigger, hand pinch ray, or mouse) reveals it as
 * the single target; its question pops out on a see-through panel with answer orbs below it.
 */
import {
  CanvasTexture,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Pressed,
  Quaternion,
  RayInteractable,
  SessionMode,
  SphereGeometry,
  Vector3,
  World,
  XRPlane,
  createSystem,
  type Entity,
  type WorldOptions,
} from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import {
  applyGlow,
  buildEnemy,
  createFaceParts,
  type EnemyParts,
  type FaceParts,
  type Glow,
} from './card-enemy.js';
import { CorrectFeedback } from './card-feedback.js';
import { paintText, textPlane } from './card-paint.js';
import { planeToWall, type PlaneLike } from './card-walls.js';
import { CAPITALS, pickOrbs, type Card } from './flashcards/deck.js';
import { PANEL, panelYaw } from './flashcards/encounter.js';
import { pickSpawns, SPAWN_MIN_BEARING_GAP_DEG, type Wall } from './flashcards/spawn.js';
import {
  answerTarget,
  createWave,
  isWaveCleared,
  revealEnemy,
  tickWave,
  type Wave,
} from './flashcards/wave.js';

// Orbs sit below the panel inside seated reach; offsets are in the yaw-only panel anchor's frame.
const ORB_RADIUS = 0.05;
const ORB_SPACING = 0.16;
const ORB_DOWN = 0.38;
const ORB_FORWARD = 0.5;
const PANEL_W = 0.6;
const PANEL_H = 0.28;
// At the reach line the enemy centre rides slightly above the eye line so the below-eye panel
// never hides it.
const ENEMY_RISE = 0.15;
// Emerge just in front of the wall surface rather than half inside it.
const WALL_INSET = 0.1;
const EMERGE_SECONDS = 0.6;
const MESSAGE_DISTANCE = 1.2;
const MAX_DT = 0.1;
const FLASH_SECONDS = 0.4;
const PULSE_RATE = 12;
const GAP_RAD = (SPAWN_MIN_BEARING_GAP_DEG * Math.PI) / 180;

const PANEL_BG = '#0f172a';
const PANEL_FLASH_BG = '#b91c1c';

interface EnemyView {
  entity: Entity;
  parts: EnemyParts;
  /** Emerge point (encounter at spawnDistance). */
  start: Vector3;
  /** Reach-line point (encounter at reachDistance), in front of the player on the same bearing. */
  goal: Vector3;
  age: number;
}

type TimedPlane = PlaneLike & { lastChangedTime?: number };

// NaN never equals itself, so a NaN timestamp would force a wall rebuild every frame.
function changedTime(plane: TimedPlane): number | undefined {
  const t = plane.lastChangedTime;
  return Number.isFinite(t) ? t : undefined;
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function wrap(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  else if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

// three.js yaw convention (yaw 0 faces -Z), matching spawn.ts.
function bearing(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

export class CardsSystem extends createSystem({
  pressed: { required: [RayInteractable, Pressed] },
  planes: { required: [XRPlane] },
}) {
  private wave!: Wave;
  private readonly cards = new Map<string, Card>();
  private readonly views = new Map<string, EnemyView>();
  private readonly enemyIds = new Map<Entity, string>();
  private walls: Wall[] = [];
  private wallsDirty = true;
  // lastChangedTime per XRPlane at the last rebuild: a grown or corrected plane must refresh walls.
  private readonly planeTimes = new WeakMap<object, number | undefined>();
  // Built once and shared by every enemy; owned (and disposed) here, not by the enemy entities.
  private face: FaceParts | undefined;
  private anchor: Entity | undefined;
  private panelMesh: Mesh<PlaneGeometry, MeshBasicMaterial> | undefined;
  private message: Entity | undefined;
  private readonly orbLabels = new Map<Entity, string>();
  private anchorYaw = 0;
  private flashLeft = 0;
  private clock = 0;
  private readonly eye = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly headEuler = new Euler(0, 0, 0, 'YXZ');
  // Presses are recorded in the query callback and applied in update(), so entities are never
  // disposed while the input system is still dispatching to them.
  // One slot per kind per frame: of two same-frame presses only the last is kept; acceptable.
  private pendingEnemyId: string | null = null;
  private pendingOrb: Entity | null = null;
  // Captured in the press callback, while the answering trigger or pinch is still held.
  private pendingGamepad: Gamepad | undefined;
  private fxRoot!: Entity;
  private feedback!: CorrectFeedback;
  private readonly fxAt = new Vector3();

  init(): void {
    this.fxRoot = this.world.createTransformEntity(new Group());
    this.feedback = new CorrectFeedback(this.fxRoot.object3D!);
    for (const card of CAPITALS) this.cards.set(card.id, card);
    this.wave = createWave(shuffled(CAPITALS.map((c) => c.id)));
    if (isWaveCleared(this.wave)) this.showCleared();
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => {
        this.feedback.unlockAudio();
        const id = this.enemyIds.get(entity);
        if (id !== undefined) this.pendingEnemyId = id;
        else if (this.orbLabels.has(entity)) {
          this.pendingOrb = entity;
          const { left, right } = this.input.xr.gamepads;
          const pad = left?.getSelecting() ? left : right?.getSelecting() ? right : undefined;
          this.pendingGamepad = pad?.gamepad;
        }
      }),
      this.queries.planes.subscribe('qualify', () => {
        this.wallsDirty = true;
      }),
      this.queries.planes.subscribe('disqualify', () => {
        this.wallsDirty = true;
      }),
    );
  }

  // tickWave() is pure and returns a fresh wave each frame: a tiny allocation accepted for the
  // prototype in exchange for a fully unit-tested wave loop.
  update(delta: number): void {
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_DT) : 0;
    this.clock += dt;
    if (this.wallsDirty || this.planesChanged()) this.rebuildWalls();
    this.applyReveal();
    this.applyOrb();
    this.feedback.update(dt);
    if (this.message !== undefined) return;

    const prevHits = this.targetHits();
    this.wave = tickWave(this.wave, dt);
    if (this.targetHits() > prevHits) {
      this.flashLeft = FLASH_SECONDS;
      this.repaintPanel();
    } else if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      if (this.flashLeft <= 0) this.repaintPanel();
    }
    this.spawnMissing();
    this.updateEnemies(dt);
    this.updateAnchor();
  }

  destroy(): void {
    this.clearPanel();
    for (const id of [...this.views.keys()]) this.removeEnemy(id);
    this.message?.dispose();
    this.message = undefined;
    this.face?.material.map?.dispose();
    this.face?.material.dispose();
    this.face?.geometry.dispose();
    this.face = undefined;
    this.feedback.destroy();
    this.fxRoot.dispose();
    super.destroy();
  }

  private rebuildWalls(): void {
    this.wallsDirty = false;
    this.walls = [];
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as TimedPlane | undefined;
      const obj = entity.object3D;
      if (plane === undefined || obj === undefined) continue;
      this.planeTimes.set(plane, changedTime(plane));
      const wall = planeToWall(plane, obj);
      if (wall !== null) this.walls.push(wall);
    }
  }

  // A few planes at most, one WeakMap lookup each per frame.
  private planesChanged(): boolean {
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as TimedPlane | undefined;
      if (plane !== undefined && this.planeTimes.get(plane) !== changedTime(plane)) return true;
    }
    return false;
  }

  // Selecting an enemy stands in for a slash; a real swing gesture is a later slice. revealEnemy()
  // returns the same wave when another enemy is already the target or the phase does not allow it.
  private applyReveal(): void {
    const id = this.pendingEnemyId;
    if (id === null) return;
    this.pendingEnemyId = null;
    const next = revealEnemy(this.wave, id);
    if (next === this.wave) return;
    this.wave = next;
    const card = this.cards.get(id);
    if (card !== undefined) this.showPanel(card);
  }

  private applyOrb(): void {
    const orb = this.pendingOrb;
    if (orb === null) return;
    this.pendingOrb = null;
    const label = this.orbLabels.get(orb);
    const targetId = this.wave.targetId;
    const card = targetId === null ? undefined : this.cards.get(targetId);
    if (label === undefined || targetId === null || card === undefined) return;
    if (label !== card.answer) {
      orb.dispose();
      this.orbLabels.delete(orb);
      return;
    }
    this.wave = answerTarget(this.wave, true);
    const enemyObj = this.views.get(targetId)?.entity.object3D;
    if (enemyObj !== undefined) enemyObj.getWorldPosition(this.fxAt);
    else this.fxAt.copy(this.eye);
    this.feedback.play(this.fxAt, this.pendingGamepad);
    this.clearPanel();
    this.removeEnemy(targetId);
    if (isWaveCleared(this.wave)) this.showCleared();
  }

  private targetHits(): number {
    const id = this.wave.targetId;
    if (id === null) return 0;
    return this.wave.active.find((e) => e.id === id)?.enc.hits ?? 0;
  }

  private spawnMissing(): void {
    let headYaw: number | null = null;
    for (const enemy of this.wave.active) {
      if (this.views.has(enemy.id)) continue;
      if (headYaw === null) {
        headYaw = this.readHead();
        // pickSpawns rejects a degenerate head pose; try again next frame.
        if (![headYaw, this.eye.x, this.eye.y, this.eye.z].every(Number.isFinite)) return;
      }
      this.spawnEnemy(enemy.id, headYaw);
    }
  }

  // Ask for enough spaced candidates that at least one clears every active enemy's bearing (each
  // active bearing can block at most two picks spaced >= the gap), then take the most central one
  // that does; if none does (ring fallback), take the one farthest from its nearest neighbour.
  private spawnEnemy(id: string, headYaw: number): void {
    const head = { position: { x: this.eye.x, y: this.eye.y, z: this.eye.z }, yawRad: headYaw };
    const points = pickSpawns(this.walls, head, 2 * this.views.size + 1);
    let chosen = points[0].position;
    let chosenGap = -1;
    for (const { position } of points) {
      const gap = this.nearestBearingGap(position.x, position.z);
      if (gap >= GAP_RAD) {
        chosen = position;
        break;
      }
      if (gap > chosenGap) {
        chosen = position;
        chosenGap = gap;
      }
    }

    const dx = chosen.x - this.eye.x;
    const dz = chosen.z - this.eye.z;
    const dist = Math.hypot(dx, dz);
    const ux = dist > 0 ? dx / dist : -Math.sin(headYaw);
    const uz = dist > 0 ? dz / dist : -Math.cos(headYaw);
    const reach = this.wave.cfg.reachDistance;
    const startDist = Math.max(dist - WALL_INSET, reach);
    const start = new Vector3(
      this.eye.x + ux * startDist,
      chosen.y,
      this.eye.z + uz * startDist,
    );
    const goal = new Vector3(
      this.eye.x + ux * reach,
      this.eye.y + ENEMY_RISE,
      this.eye.z + uz * reach,
    );

    this.face ??= createFaceParts();
    const parts = buildEnemy(this.face);
    // Face the player for the whole walk; the bearing never changes.
    parts.root.rotation.set(0, Math.atan2(-ux, -uz), 0);
    parts.root.position.copy(start);
    parts.root.scale.setScalar(0);
    const entity = this.world.createTransformEntity(parts.root);
    entity.addComponent(RayInteractable);
    this.views.set(id, { entity, parts, start, goal, age: 0 });
    this.enemyIds.set(entity, id);
  }

  /** Smallest absolute bearing difference (rad) from the eye to any live enemy; Infinity if none. */
  private nearestBearingGap(x: number, z: number): number {
    const b = bearing(this.eye.x, this.eye.z, x, z);
    let min = Infinity;
    for (const view of this.views.values()) {
      const p = view.entity.object3D?.position ?? view.start;
      const gap = Math.abs(wrap(bearing(this.eye.x, this.eye.z, p.x, p.z) - b));
      if (gap < min) min = gap;
    }
    return min;
  }

  // Encounter distance maps linearly onto each enemy's own emerge-to-reach segment, so enemies from
  // near and far walls share the wave's timing.
  private updateEnemies(dt: number): void {
    const { spawnDistance, reachDistance } = this.wave.cfg;
    const span = spawnDistance - reachDistance;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * PULSE_RATE);
    for (const { id, enc } of this.wave.active) {
      const view = this.views.get(id);
      const obj = view?.entity.object3D;
      if (view === undefined || obj === undefined) continue;
      const t = span > 0 ? Math.min(Math.max((enc.distance - reachDistance) / span, 0), 1) : 0;
      obj.position.lerpVectors(view.goal, view.start, t);
      let glow: Glow = 'faint';
      if (id === this.wave.targetId) glow = enc.phase === 'telegraph' ? 'telegraph' : 'target';
      else if (enc.phase === 'slashable') glow = 'halted';
      const scale = applyGlow(view.parts, glow, pulse);
      view.age += dt;
      obj.scale.setScalar(scale * Math.min(view.age / EMERGE_SECONDS, 1));
    }
  }

  private removeEnemy(id: string): void {
    const view = this.views.get(id);
    if (view === undefined) return;
    this.enemyIds.delete(view.entity);
    view.entity.dispose();
    this.views.delete(id);
  }

  private readHead(): number {
    this.world.camera.getWorldPosition(this.eye);
    this.world.camera.getWorldQuaternion(this.headQuat);
    return this.headEuler.setFromQuaternion(this.headQuat, 'YXZ').y;
  }

  private showCleared(): void {
    const yaw = this.readHead();
    const safeYaw = Number.isFinite(yaw) ? yaw : 0;
    const mesh = textPlane(['Deck cleared'], 1.2, 0.25, '#1e293b');
    mesh.position.set(
      this.eye.x - Math.sin(safeYaw) * MESSAGE_DISTANCE,
      this.eye.y,
      this.eye.z - Math.cos(safeYaw) * MESSAGE_DISTANCE,
    );
    mesh.rotation.set(0, safeYaw, 0);
    this.message = this.world.createTransformEntity(mesh);
  }

  // The anchor is a world-space, yaw-only frame placed once at the eye when the panel pops out
  // (never parented to the camera, never following head position); the pitched panel and the orbs
  // hang off it so one yaw update turns them together.
  private showPanel(card: Card): void {
    const headYaw = this.readHead();
    this.anchorYaw = Number.isFinite(headYaw) ? headYaw : 0;
    const root = new Group();
    const pitch = (PANEL.pitchBelowDeg * Math.PI) / 180;
    this.panelMesh = textPlane(this.panelLines(), PANEL_W, PANEL_H, PANEL_BG, PANEL.opacity);
    this.panelMesh.position.set(
      0,
      -PANEL.distance * Math.sin(pitch),
      -PANEL.distance * Math.cos(pitch),
    );
    this.panelMesh.rotation.x = -pitch;
    root.add(this.panelMesh);
    root.position.copy(this.eye);
    root.rotation.set(0, this.anchorYaw, 0);
    this.anchor = this.world.createTransformEntity(root);

    const orbs = pickOrbs(card, CAPITALS, Math.random);
    orbs.forEach((orb, i) => {
      const sphere = new Mesh(
        new SphereGeometry(ORB_RADIUS, 24, 16),
        new MeshBasicMaterial({ color: 0x38bdf8 }),
      );
      sphere.position.set((i - (orbs.length - 1) / 2) * ORB_SPACING, -ORB_DOWN, -ORB_FORWARD);
      const label = textPlane([orb.label], 0.15, 0.04, '#0f172a');
      label.position.set(0, ORB_RADIUS + 0.03, 0);
      sphere.add(label);
      const entity = this.world.createTransformEntity(sphere, { parent: this.anchor });
      entity.addComponent(RayInteractable);
      this.orbLabels.set(entity, orb.label);
    });
    this.updateAnchor();
  }

  private updateAnchor(): void {
    const obj = this.anchor?.object3D;
    if (obj === undefined) return;
    const headYaw = this.readHead();
    // A degenerate head pose would make panelYaw throw; hold the panel for this frame instead.
    if (!Number.isFinite(headYaw)) return;
    this.anchorYaw = panelYaw(this.anchorYaw, headYaw);
    obj.rotation.set(0, this.anchorYaw, 0);
  }

  private panelLines(): string[] {
    const id = this.wave.targetId;
    const prompt = id === null ? '' : (this.cards.get(id)?.prompt ?? '');
    return [prompt, `Hits: ${this.targetHits()}`];
  }

  private repaintPanel(): void {
    const map = this.panelMesh?.material.map;
    if (!(map instanceof CanvasTexture)) return;
    paintText(map, this.panelLines(), this.flashLeft > 0 ? PANEL_FLASH_BG : PANEL_BG);
  }

  // Orbs are child entities of the anchor, so they are disposed before it. Disposing an orb also
  // removes its child label mesh.
  private clearPanel(): void {
    for (const entity of this.orbLabels.keys()) entity.dispose();
    this.orbLabels.clear();
    this.anchor?.dispose();
    this.anchor = undefined;
    this.panelMesh = undefined;
    this.flashLeft = 0;
  }
}

// Passthrough for this page only: the probe page shares iwsdk.config.json, so the AR session, plane
// detection, and scene understanding are overridden here rather than in the shared config.
// planeDetection: true requests the feature as optional, so a headset with no Space Setup still
// starts a session (enemies then use the ring fallback). level/assets: undefined drop the probe
// scene and its preload manifest; with no level there is no background, so the AR renderer's
// transparent clear shows the room.
type XRConfig = Exclude<WorldOptions['xr'], false | undefined>;
const baseXr: XRConfig = projectOptions.xr || {};

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  ...projectOptions,
  level: undefined,
  assets: undefined,
  xr: {
    ...baseXr,
    sessionMode: SessionMode.ImmersiveAR,
    features: { ...baseXr.features, planeDetection: true },
  },
  features: { ...projectOptions.features, sceneUnderstanding: true },
}).then((world) => {
  world.registerSystem(CardsSystem);
});
