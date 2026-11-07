/**
 * Passthrough (AR) flashcard page: a wave of cartoon-faced card enemies emerges from detected walls
 * (or an even ring when no walls are known) and walks toward the player along its own bearing.
 * Selecting any enemy at any distance (controller trigger, hand pinch ray, or mouse) reveals it as
 * the single target; its question pops out on a see-through panel with answer orbs below it.
 *
 * Composition root: wave state and answer outcomes live here; rendering is delegated to
 * EnemyField (enemies), QuestionPanel (panel, orbs, messages) and WallTracker (XR planes).
 */
import {
  Euler,
  Group,
  Pressed,
  Quaternion,
  RayInteractable,
  SessionMode,
  Vector3,
  World,
  XRPlane,
  createSystem,
  type Entity,
  type WorldOptions,
} from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { EnemyField } from './card-enemy-field.js';
import { CorrectFeedback } from './card-feedback.js';
import { QuestionPanel, showMessage } from './card-question-panel.js';
import { WallTracker } from './card-wall-tracker.js';
import { CAPITALS, pickOrbs, type Card } from './flashcards/deck.js';
import {
  answerTarget,
  createWave,
  isWaveCleared,
  revealEnemy,
  tickWave,
  type Wave,
} from './flashcards/wave.js';

const MAX_DT = 0.1;

function shuffled<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class CardsSystem extends createSystem({
  pressed: { required: [RayInteractable, Pressed] },
  planes: { required: [XRPlane] },
}) {
  private wave!: Wave;
  private readonly cards = new Map<string, Card>();
  private enemies!: EnemyField;
  private panel!: QuestionPanel;
  private readonly walls = new WallTracker();
  private message: Entity | undefined;
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
    this.enemies = new EnemyField(this.world);
    this.panel = new QuestionPanel(this.world);
    this.fxRoot = this.world.createTransformEntity(new Group());
    this.feedback = new CorrectFeedback(this.fxRoot.object3D!);
    this.startRun();
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => this.onPress(entity)),
      this.queries.planes.subscribe('qualify', () => this.walls.markDirty()),
      this.queries.planes.subscribe('disqualify', () => this.walls.markDirty()),
    );
  }

  // tickWave() is pure and returns a fresh wave each frame: a tiny allocation accepted for the
  // prototype in exchange for a fully unit-tested wave loop.
  update(delta: number): void {
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_DT) : 0;
    this.clock += dt;
    this.walls.refresh(this.queries.planes.entities);
    this.applyReveal();
    this.applyOrb();
    this.feedback.update(dt);
    if (this.message !== undefined) return;

    const prevHits = this.targetHits();
    this.wave = tickWave(this.wave, dt);
    if (this.targetHits() > prevHits) this.panel.flash(this.panelLines());
    else this.panel.tickFlash(dt, () => this.panelLines());
    this.enemies.spawnMissing(this.wave, this.walls.walls, this.eye, () => this.readHead());
    this.enemies.update(this.wave, dt, this.clock);
    this.updateAnchor();
  }

  destroy(): void {
    this.panel.clear();
    this.enemies.destroy();
    this.message?.dispose();
    this.message = undefined;
    this.feedback.destroy();
    this.fxRoot.dispose();
    super.destroy();
  }

  // Seam: deck selection / scheduler queue / start screen decide what enters the wave.
  private startRun(): void {
    for (const card of CAPITALS) this.cards.set(card.id, card);
    this.wave = createWave(shuffled(CAPITALS.map((c) => c.id)));
    if (isWaveCleared(this.wave)) this.onWaveCleared();
  }

  private onPress(entity: Entity): void {
    this.feedback.unlockAudio();
    const id = this.enemies.idOf(entity);
    if (id !== undefined) this.pendingEnemyId = id;
    else if (this.panel.hasOrb(entity)) {
      this.pendingOrb = entity;
      const { left, right } = this.input.xr.gamepads;
      const pad = left?.getSelecting() ? left : right?.getSelecting() ? right : undefined;
      this.pendingGamepad = pad?.gamepad;
    }
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
    const label = this.panel.labelOf(orb);
    const targetId = this.wave.targetId;
    const card = targetId === null ? undefined : this.cards.get(targetId);
    if (label === undefined || targetId === null || card === undefined) return;
    if (label !== card.answer) this.onWrongAnswer(orb);
    else this.onCorrectAnswer(targetId);
  }

  // Seam: matcher / run-state (wrong orb = hit) / scheduler grading plug in here.
  private onWrongAnswer(orb: Entity): void {
    this.panel.removeOrb(orb);
  }

  // Seam: run-state / scheduler grading plug in here.
  private onCorrectAnswer(targetId: string): void {
    this.wave = answerTarget(this.wave, true);
    if (!this.enemies.worldPosition(targetId, this.fxAt)) this.fxAt.copy(this.eye);
    this.feedback.play(this.fxAt, this.pendingGamepad);
    this.panel.clear();
    this.enemies.remove(targetId);
    if (isWaveCleared(this.wave)) this.onWaveCleared();
  }

  // Seam: end screens / save plug in here.
  private onWaveCleared(): void {
    this.message = showMessage(this.world, this.eye, this.readHead(), 'Deck cleared');
  }

  private targetHits(): number {
    const id = this.wave.targetId;
    if (id === null) return 0;
    return this.wave.active.find((e) => e.id === id)?.enc.hits ?? 0;
  }

  private readHead(): number {
    this.world.camera.getWorldPosition(this.eye);
    this.world.camera.getWorldQuaternion(this.headQuat);
    return this.headEuler.setFromQuaternion(this.headQuat, 'YXZ').y;
  }

  private showPanel(card: Card): void {
    const headYaw = this.readHead();
    const lines = this.panelLines();
    const labels = pickOrbs(card, CAPITALS, Math.random).map((orb) => orb.label);
    this.panel.show(this.eye, headYaw, lines, labels);
    this.updateAnchor();
  }

  // The head is only read while the panel is open.
  private updateAnchor(): void {
    if (this.panel.isOpen) this.panel.followHead(this.readHead());
  }

  private panelLines(): string[] {
    const id = this.wave.targetId;
    const prompt = id === null ? '' : (this.cards.get(id)?.prompt ?? '');
    return [prompt, `Hits: ${this.targetHits()}`];
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
