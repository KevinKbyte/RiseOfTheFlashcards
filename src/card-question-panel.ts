/**
 * The see-through question panel and its answer orbs, plus the full-view message plane used for
 * end screens. The panel flashes red for a moment whenever the target lands a hit.
 */
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RayInteractable,
  SphereGeometry,
  type Entity,
  type Vector3,
  type World,
} from '@iwsdk/core';
import type { OrbKind } from './card-menu.js';
import { paintText, textPlane } from './card-paint.js';
import { PANEL, panelYaw } from './flashcards/encounter.js';
import { orbPositions, PANEL_LAYOUT, panelPlacement } from './flashcards/panel-layout.js';

const ORB_RADIUS = 0.05;
// Panel and orb offsets in the yaw-only anchor's frame (eye at the origin, yaw 0).
const ANCHOR_ORIGIN = { x: 0, y: 0, z: 0 };
const MESSAGE_DISTANCE = 1.2;
const FLASH_SECONDS = 0.4;

// Action orbs (Start, Mastery, Back) are smaller and amber so they read as navigation, not decks.
const ORB_STYLE: Record<OrbKind, { radius: number; color: number }> = {
  deck: { radius: ORB_RADIUS, color: 0x38bdf8 },
  action: { radius: ORB_RADIUS * 0.75, color: 0xf59e0b },
};

const PANEL_BG = '#0f172a';
const PANEL_FLASH_BG = '#b91c1c';

/** A text plane MESSAGE_DISTANCE ahead of the eye on the given yaw (0 when not finite). */
export function showMessage(world: World, eye: Vector3, yaw: number, text: string | readonly string[]): Entity {
  const safeYaw = Number.isFinite(yaw) ? yaw : 0;
  const lines = typeof text === 'string' ? [text] : text;
  // Grow with the line count so each row keeps a readable height.
  const mesh = textPlane(lines, 1.2, Math.max(0.25, 0.1 * lines.length), '#1e293b');
  mesh.position.set(
    eye.x - Math.sin(safeYaw) * MESSAGE_DISTANCE,
    eye.y,
    eye.z - Math.cos(safeYaw) * MESSAGE_DISTANCE,
  );
  mesh.rotation.set(0, safeYaw, 0);
  return world.createTransformEntity(mesh);
}

export class QuestionPanel {
  private anchor: Entity | undefined;
  private panelMesh: Mesh<PlaneGeometry, MeshBasicMaterial> | undefined;
  private readonly orbLabels = new Map<Entity, string>();
  private anchorYaw = 0;
  private flashLeft = 0;

  constructor(private readonly world: World) {}

  get isOpen(): boolean {
    return this.anchor !== undefined;
  }

  hasOrb(entity: Entity): boolean {
    return this.orbLabels.has(entity);
  }

  orbs(): Iterable<Entity> {
    return this.orbLabels.keys();
  }

  labelOf(orb: Entity): string | undefined {
    return this.orbLabels.get(orb);
  }

  removeOrb(orb: Entity): void {
    orb.dispose();
    this.orbLabels.delete(orb);
  }

  // The anchor is a world-space, yaw-only frame placed once at the eye when the panel pops out
  // (never parented to the camera, never following head position); the pitched panel and the orbs
  // hang off it so one yaw update turns them together. Returns the orbs in label order.
  // `kinds[i]` styles orb i; answer orbs pass none and get the deck-orb look.
  show(
    eye: Vector3,
    headYaw: number,
    lines: readonly string[],
    labels: readonly string[],
    kinds: readonly OrbKind[] = [],
  ): Entity[] {
    this.anchorYaw = Number.isFinite(headYaw) ? headYaw : 0;
    const root = new Group();
    const pitch = (PANEL_LAYOUT.pitchBelowDeg * Math.PI) / 180;
    this.panelMesh = textPlane(lines, PANEL_LAYOUT.widthM, PANEL_LAYOUT.heightM, PANEL_BG, PANEL.opacity);
    const { center } = panelPlacement(ANCHOR_ORIGIN, 0);
    this.panelMesh.position.set(center.x, center.y, center.z);
    this.panelMesh.rotation.x = -pitch;
    root.add(this.panelMesh);
    root.position.copy(eye);
    root.rotation.set(0, this.anchorYaw, 0);
    this.anchor = this.world.createTransformEntity(root);

    const orbAt = orbPositions(ANCHOR_ORIGIN, 0, labels.length);
    return labels.map((text, i) => {
      const style = ORB_STYLE[kinds[i] ?? 'deck'];
      const sphere = new Mesh(
        new SphereGeometry(style.radius, 24, 16),
        new MeshBasicMaterial({ color: style.color }),
      );
      sphere.position.set(orbAt[i].x, orbAt[i].y, orbAt[i].z);
      const label = textPlane([text], 0.15, 0.04, '#0f172a');
      label.position.set(0, ORB_RADIUS + 0.03, 0);
      sphere.add(label);
      const entity = this.world.createTransformEntity(sphere, { parent: this.anchor });
      entity.addComponent(RayInteractable);
      this.orbLabels.set(entity, text);
      return entity;
    });
  }

  /** Turns the open panel toward the head yaw; a degenerate yaw holds it for this frame. */
  followHead(headYaw: number): void {
    const obj = this.anchor?.object3D;
    if (obj === undefined) return;
    // A degenerate head pose would make panelYaw throw.
    if (!Number.isFinite(headYaw)) return;
    this.anchorYaw = panelYaw(this.anchorYaw, headYaw);
    obj.rotation.set(0, this.anchorYaw, 0);
  }

  /** Starts the hit flash and repaints with the new lines. */
  flash(lines: readonly string[]): void {
    this.flashLeft = FLASH_SECONDS;
    this.repaint(lines);
  }

  /** Repaints with the new lines without starting a flash. */
  setLines(lines: readonly string[]): void {
    this.repaint(lines);
  }

  /** Counts down an active flash; repaints in the normal colour when it ends. */
  tickFlash(dt: number, lines: () => readonly string[]): void {
    if (this.flashLeft <= 0) return;
    this.flashLeft -= dt;
    if (this.flashLeft <= 0) this.repaint(lines());
  }

  // Orbs are child entities of the anchor, so they are disposed before it. Disposing an orb also
  // removes its child label mesh.
  clear(): void {
    for (const entity of this.orbLabels.keys()) entity.dispose();
    this.orbLabels.clear();
    this.anchor?.dispose();
    this.anchor = undefined;
    this.panelMesh = undefined;
    this.flashLeft = 0;
  }

  private repaint(lines: readonly string[]): void {
    const map = this.panelMesh?.material.map;
    if (!(map instanceof CanvasTexture)) return;
    paintText(map, lines, this.flashLeft > 0 ? PANEL_FLASH_BG : PANEL_BG);
  }
}
