/**
 * VR flashcard page: the current card's prompt floats ahead, answer orbs sit below it.
 * Selecting an orb (controller trigger, hand pinch ray, or mouse) feeds chooseAnswer.
 */
import {
  CanvasTexture,
  createSystem,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  SphereGeometry,
  SRGBColorSpace,
  World,
  type Entity,
} from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { CAPITALS, chooseAnswer, createDeck, type DeckState } from './flashcards/deck.js';

const ORB_RADIUS = 0.1;
const ORB_SPACING = 0.32;
const ORB_Y = 1.25;
const ORB_Z = -0.9;

function textPlane(text: string, width: number, height: number, bg: string): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * height) / width);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(canvas.height * 0.4)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * 0.95);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ map: texture }));
}

export class CardsSystem extends createSystem({
  pressed: { required: [RayInteractable, Pressed] },
}) {
  private state!: DeckState;
  private prompt: Entity | undefined;
  private readonly orbIds = new Map<Entity, string>();
  // Press is recorded in the query callback and applied in update(), so entities are never
  // disposed while the input system is still dispatching to them.
  // One slot per frame: of two same-frame presses (both hands) only the last is kept; acceptable.
  private pendingOrbId: string | null = null;

  init(): void {
    this.state = createDeck(CAPITALS, Math.random);
    this.render();
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => {
        this.pendingOrbId = this.orbIds.get(entity) ?? null;
      }),
    );
  }

  update(): void {
    if (this.pendingOrbId === null) return;
    const orbId = this.pendingOrbId;
    this.pendingOrbId = null;
    const { state, outcome } = chooseAnswer(this.state, orbId, Math.random);
    this.state = state;
    if (outcome === 'correct') this.render();
    else if (outcome === 'wrong') this.removeOrb(orbId);
  }

  destroy(): void {
    this.clearEntities();
    super.destroy();
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

  private clearEntities(): void {
    this.prompt?.dispose();
    this.prompt = undefined;
    for (const entity of this.orbIds.keys()) entity.dispose();
    this.orbIds.clear();
  }

  private render(): void {
    this.clearEntities();

    const text = this.state.current?.prompt ?? 'Deck cleared';
    const promptMesh = textPlane(text, 1.2, 0.25, '#1e293b');
    promptMesh.position.set(0, 1.65, -1.2);
    this.prompt = this.world.createTransformEntity(promptMesh);

    const { orbs } = this.state;
    orbs.forEach((orb, i) => {
      const sphere = new Mesh(
        new SphereGeometry(ORB_RADIUS, 24, 16),
        new MeshBasicMaterial({ color: 0x38bdf8 }),
      );
      sphere.position.set((i - (orbs.length - 1) / 2) * ORB_SPACING, ORB_Y, ORB_Z);
      const label = textPlane(orb.label, 0.3, 0.08, '#0f172a');
      label.position.set(0, ORB_RADIUS + 0.06, 0);
      sphere.add(label);
      const entity = this.world.createTransformEntity(sphere);
      entity.addComponent(RayInteractable);
      this.orbIds.set(entity, orb.id);
    });
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
