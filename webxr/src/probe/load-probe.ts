/**
 * Premise e: frame-delta ring buffer (allocation-free push) and a stepped mesh load field.
 */
import { IcosahedronGeometry, Mesh, MeshStandardMaterial, type Entity, type World } from '@iwsdk/core';

const RING = 1024;
export const LOAD_STEP = 50;
export const LOAD_MAX = 1000;
const GRID = 20;
const SPACING = 0.2;

export class FrameMeter {
  private readonly buf = new Float64Array(RING);
  private head = 0;
  private count = 0;

  push(deltaMs: number): void {
    this.buf[this.head] = deltaMs;
    this.head = (this.head + 1) % RING;
    if (this.count < RING) this.count++;
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
  }

  /** Oldest-first copy; allocates, so call it off the per-frame path. */
  snapshot(): number[] {
    const out = new Array<number>(this.count);
    for (let i = 0; i < this.count; i++) out[i] = this.buf[(this.head - this.count + i + RING) % RING];
    return out;
  }
}

export class LoadField {
  private readonly entities: Entity[] = [];
  // Shared by every load mesh, so entities are disposed with disposeResources: false.
  private readonly geometry = new IcosahedronGeometry(0.05, 2);
  private readonly material = new MeshStandardMaterial({ color: 0x5aa9e6, roughness: 0.5 });

  constructor(private readonly world: World) {}

  get level(): number {
    return this.entities.length;
  }

  setLevel(level: number): void {
    const target = Math.max(0, Math.min(LOAD_MAX, level));
    while (this.entities.length < target) {
      const i = this.entities.length;
      const mesh = new Mesh(this.geometry, this.material);
      mesh.position.set(
        ((i % GRID) - GRID / 2) * SPACING,
        0.6 + Math.floor(i / GRID / 5) * SPACING,
        -2.5 - (Math.floor(i / GRID) % 5) * SPACING,
      );
      this.entities.push(this.world.createTransformEntity(mesh));
    }
    while (this.entities.length > target) {
      (this.entities.pop() as Entity).dispose({ disposeResources: false });
    }
  }

  dispose(): void {
    this.setLevel(0);
    this.geometry.dispose();
    this.material.dispose();
  }
}
