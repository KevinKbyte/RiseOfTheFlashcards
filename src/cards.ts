/**
 * VR flashcard page: each card is guarded by a cartoon-faced enemy that walks in along -Z. Selecting
 * the enemy at any distance slashes (reveals) it; the card's prompt pops out on a see-through panel
 * with answer orbs below it. Selecting an orb (controller trigger, hand pinch ray, or mouse) feeds chooseAnswer.
 */
import {
  CanvasTexture,
  Color,
  createSystem,
  DoubleSide,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Pressed,
  Quaternion,
  RayInteractable,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  World,
  type Entity,
} from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { paintFace, paintText, textPlane } from './card-paint.js';
import { CAPITALS, chooseAnswer, createDeck, type DeckState } from './flashcards/deck.js';
import {
  createEncounter,
  PANEL,
  panelYaw,
  resolveCorrect,
  slash,
  tick,
  type Encounter,
} from './flashcards/encounter.js';

// Orbs sit below the panel inside seated reach; offsets are in the yaw-only panel anchor's frame.
const ORB_RADIUS = 0.05;
const ORB_SPACING = 0.16;
const ORB_DOWN = 0.38;
const ORB_FORWARD = 0.5;
const PANEL_W = 0.6;
const PANEL_H = 0.28;
// Enemy centre rides slightly above the eye line so the below-eye panel never hides it while it is
// farther than the panel (closer than the panel it is drawn in front anyway).
const ENEMY_RISE = 0.15;
const ENEMY_W = 0.36;
const ENEMY_H = 0.5;
const ENEMY_EDGE = 0.04;
const MAX_DT = 0.1;
const FLASH_SECONDS = 0.4;
const PULSE_RATE = 12;

const EDGE_IDLE = new Color(0x7c3aed);
const EDGE_READY = new Color(0xfacc15);
const EDGE_RED = new Color(0xef4444);
const PANEL_BG = '#0f172a';
const PANEL_FLASH_BG = '#b91c1c';

export class CardsSystem extends createSystem({
  pressed: { required: [RayInteractable, Pressed] },
}) {
  private state!: DeckState;
  private enc: Encounter | null = null;
  private enemy: Entity | undefined;
  private enemyEdge: MeshBasicMaterial | undefined;
  private readonly enemyBase = new Vector3();
  // Built once and shared by every enemy; owned (and disposed) here, not by the enemy entity.
  private face: { geometry: PlaneGeometry; material: MeshBasicMaterial } | undefined;
  private anchor: Entity | undefined;
  private panelMesh: Mesh<PlaneGeometry, MeshBasicMaterial> | undefined;
  private message: Entity | undefined;
  private readonly orbIds = new Map<Entity, string>();
  private anchorYaw = 0;
  private flashLeft = 0;
  private clock = 0;
  private readonly eye = new Vector3();
  private readonly headQuat = new Quaternion();
  private readonly headEuler = new Euler(0, 0, 0, 'YXZ');
  // Press is recorded in the query callback and applied in update(), so entities are never
  // disposed while the input system is still dispatching to them.
  // One slot per frame: of two same-frame presses (both hands) only the last is kept; acceptable.
  private pendingOrbId: string | null = null;
  private pendingSlash = false;

  init(): void {
    this.state = createDeck(CAPITALS, Math.random);
    this.present();
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => {
        if (entity === this.enemy) this.pendingSlash = true;
        else this.pendingOrbId = this.orbIds.get(entity) ?? null;
      }),
    );
  }

  // tick() is pure and returns a fresh state each frame: a tiny allocation accepted for the
  // prototype in exchange for a fully unit-tested encounter loop.
  update(delta: number): void {
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_DT) : 0;
    this.clock += dt;
    this.applySlash();
    if (this.applyOrb()) return;
    if (this.enc === null) return;

    const prevHits = this.enc.hits;
    this.enc = tick(this.enc, dt);
    if (this.enc.hits > prevHits) {
      this.flashLeft = FLASH_SECONDS;
      this.repaintPanel();
    } else if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      if (this.flashLeft <= 0) this.repaintPanel();
    }
    this.updateEnemy();
    this.updateAnchor();
  }

  destroy(): void {
    this.clearEncounter();
    this.message?.dispose();
    this.message = undefined;
    this.face?.material.map?.dispose();
    this.face?.material.dispose();
    this.face?.geometry.dispose();
    this.face = undefined;
    super.destroy();
  }

  // Selecting the enemy stands in for a slash; a real swing gesture is a later slice. slash()
  // returns the same object when the phase does not allow it (already revealed or cleared).
  private applySlash(): void {
    if (!this.pendingSlash) return;
    this.pendingSlash = false;
    if (this.enc === null) return;
    const next = slash(this.enc);
    if (next === this.enc) return;
    this.enc = next;
    this.showPanel();
  }

  /** Returns true when the encounter was replaced, so the rest of the frame is skipped. */
  private applyOrb(): boolean {
    if (this.pendingOrbId === null) return false;
    const orbId = this.pendingOrbId;
    this.pendingOrbId = null;
    const { state, outcome } = chooseAnswer(this.state, orbId, Math.random);
    this.state = state;
    if (outcome === 'wrong') this.removeOrb(orbId);
    if (outcome !== 'correct') return false;
    if (this.enc !== null) this.enc = resolveCorrect(this.enc);
    this.clearEncounter();
    this.present();
    return true;
  }

  private present(): void {
    if (this.state.current === null) {
      const mesh = textPlane(['Deck cleared'], 1.2, 0.25, '#1e293b');
      mesh.position.set(0, 1.65, -1.2);
      this.message = this.world.createTransformEntity(mesh);
      return;
    }
    this.enc = createEncounter();
    this.spawnEnemy();
  }

  private spawnEnemy(): void {
    this.world.camera.getWorldPosition(this.eye);
    this.enemyBase.set(this.eye.x, this.eye.y + ENEMY_RISE, this.eye.z);
    this.enemyEdge = new MeshBasicMaterial({ color: EDGE_IDLE, side: DoubleSide });
    const edge = new Mesh(
      new PlaneGeometry(ENEMY_W + ENEMY_EDGE, ENEMY_H + ENEMY_EDGE),
      this.enemyEdge,
    );
    // Card back faces the player; the prompt stays hidden until the slash pops it out.
    const back = new Mesh(
      new PlaneGeometry(ENEMY_W, ENEMY_H),
      new MeshBasicMaterial({ color: 0x1e1b4b, side: DoubleSide }),
    );
    back.position.z = 0.005;
    edge.add(back);
    const face = this.faceParts();
    const faceMesh = new Mesh(face.geometry, face.material);
    faceMesh.position.z = 0.01;
    // Runtime-only so entity dispose skips the shared face resources (destroy() frees them).
    faceMesh.userData.iwsdkRuntimeOnly = true;
    edge.add(faceMesh);
    this.enemy = this.world.createTransformEntity(edge);
    this.enemy.addComponent(RayInteractable);
    this.updateEnemy();
  }

  private faceParts(): { geometry: PlaneGeometry; material: MeshBasicMaterial } {
    if (this.face !== undefined) return this.face;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = Math.round((256 * ENEMY_H) / ENEMY_W);
    paintFace(canvas);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    // alphaTest (not blending) keeps the face in the opaque pass with depth writes, so it never
    // mis-sorts against the see-through panel.
    const material = new MeshBasicMaterial({ map, alphaTest: 0.5 });
    this.face = { geometry: new PlaneGeometry(ENEMY_W, ENEMY_H), material };
    return this.face;
  }

  private updateEnemy(): void {
    const obj = this.enemy?.object3D;
    if (this.enc === null || obj === undefined || this.enemyEdge === undefined) return;
    obj.position.set(this.enemyBase.x, this.enemyBase.y, this.enemyBase.z - this.enc.distance);
    const color = this.enemyEdge.color;
    if (this.enc.phase === 'slashable') {
      color.copy(EDGE_READY);
      obj.scale.setScalar(1.08);
    } else if (this.enc.phase === 'telegraph') {
      color.lerpColors(EDGE_IDLE, EDGE_RED, 0.5 + 0.5 * Math.sin(this.clock * PULSE_RATE));
      obj.scale.setScalar(1);
    } else {
      color.copy(EDGE_IDLE);
      obj.scale.setScalar(1);
    }
  }

  private readHead(): number {
    this.world.camera.getWorldPosition(this.eye);
    this.world.camera.getWorldQuaternion(this.headQuat);
    return this.headEuler.setFromQuaternion(this.headQuat, 'YXZ').y;
  }

  // The anchor is a world-space, yaw-only frame placed once at the eye when the panel pops out
  // (never parented to the camera, never following head position); the pitched panel and the orbs
  // hang off it so one yaw update turns them together.
  private showPanel(): void {
    if (this.state.current === null) return;
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

    const { orbs } = this.state;
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
      this.orbIds.set(entity, orb.id);
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
    return [this.state.current?.prompt ?? '', `Hits: ${this.enc?.hits ?? 0}`];
  }

  private repaintPanel(): void {
    const map = this.panelMesh?.material.map;
    if (!(map instanceof CanvasTexture)) return;
    paintText(map, this.panelLines(), this.flashLeft > 0 ? PANEL_FLASH_BG : PANEL_BG);
  }

  // Disposing the sphere entity also removes its child label mesh.
  private removeOrb(orbId: string): void {
    for (const [entity, id] of this.orbIds) {
      if (id !== orbId) continue;
      entity.dispose();
      this.orbIds.delete(entity);
      return;
    }
  }

  // Orbs are child entities of the anchor, so they are disposed before it.
  private clearEncounter(): void {
    for (const entity of this.orbIds.keys()) entity.dispose();
    this.orbIds.clear();
    this.anchor?.dispose();
    this.anchor = undefined;
    this.panelMesh = undefined;
    this.enemy?.dispose();
    this.enemy = undefined;
    this.enemyEdge = undefined;
    this.enc = null;
    this.flashLeft = 0;
  }
}

// level/assets: undefined drop the probe scene and its preload manifest so this page starts empty.
World.create(document.getElementById('scene-container') as HTMLDivElement, {
  ...projectOptions,
  level: undefined,
  assets: undefined,
}).then((world) => {
  world.registerSystem(CardsSystem);
});
