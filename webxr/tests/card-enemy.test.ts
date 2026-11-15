// Requirement: the player can tell card-enemies apart at a glance. Walking enemies glow faintly in
// purple; an enemy waiting at the reach line glows brightly in yellow and is drawn slightly larger
// (x1.08); the revealed target glows brightly in cyan; while the target telegraphs an attack its
// glow swings from cyan (pulse 0) to red (pulse 1). The halo always shares the rim colour. Each
// enemy is its own mesh set; the face texture is shared and never freed with one enemy.
//
// API contract for src/card-enemy.ts (renderer-free parts only):
//   export type Glow = 'faint' | 'halted' | 'target' | 'telegraph';
//   export function buildEnemy(face: FaceParts): EnemyParts;   // { root, edge, halo }
//   export function applyGlow(parts: EnemyParts, glow: Glow, pulse: number): number; // scale
import { describe, expect, it, vi } from 'vitest';

vi.mock('@iwsdk/core', async () => await import('three'));

import { Color, Mesh, MeshBasicMaterial, PlaneGeometry } from '@iwsdk/core';
import { applyGlow, buildEnemy, type EnemyParts, type FaceParts } from '../src/card-enemy.js';

const PURPLE = new Color(0x7c3aed);
const YELLOW = new Color(0xfacc15);
const CYAN = new Color(0x22d3ee);
const RED = new Color(0xef4444);

function fakeFace(): FaceParts {
  return { geometry: new PlaneGeometry(0.36, 0.5), material: new MeshBasicMaterial() };
}

function enemy(): EnemyParts {
  return buildEnemy(fakeFace());
}

function expectColor(actual: Color, expected: Color): void {
  expect(actual.r).toBeCloseTo(expected.r, 6);
  expect(actual.g).toBeCloseTo(expected.g, 6);
  expect(actual.b).toBeCloseTo(expected.b, 6);
}

// Covers: CARDS-010
describe('card-enemy glow states', () => {
  it('a new enemy starts as a faint purple walker', () => {
    const parts = enemy();
    expectColor(parts.edge.color, PURPLE);
    expectColor(parts.halo.color, PURPLE);
    expect(parts.halo.opacity).toBeCloseTo(0.12, 9);
  });

  it('faint: purple rim, faint halo, normal size', () => {
    const parts = enemy();
    applyGlow(parts, 'target', 0);
    expect(applyGlow(parts, 'faint', 0)).toBe(1);
    expectColor(parts.edge.color, PURPLE);
    expect(parts.halo.opacity).toBeCloseTo(0.12, 9);
  });

  it('halted: yellow rim, bright halo, scaled up 1.08', () => {
    const parts = enemy();
    expect(applyGlow(parts, 'halted', 0)).toBeCloseTo(1.08, 9);
    expectColor(parts.edge.color, YELLOW);
    expect(parts.halo.opacity).toBeCloseTo(0.6, 9);
  });

  it('target: cyan rim, bright halo, normal size', () => {
    const parts = enemy();
    expect(applyGlow(parts, 'target', 0)).toBe(1);
    expectColor(parts.edge.color, CYAN);
    expect(parts.halo.opacity).toBeCloseTo(0.6, 9);
  });

  it('telegraph: cyan at pulse 0, red at pulse 1, halfway between at pulse 0.5', () => {
    const parts = enemy();
    expect(applyGlow(parts, 'telegraph', 0)).toBe(1);
    expectColor(parts.edge.color, CYAN);
    applyGlow(parts, 'telegraph', 1);
    expectColor(parts.edge.color, RED);
    applyGlow(parts, 'telegraph', 0.5);
    expectColor(parts.edge.color, new Color().lerpColors(CYAN, RED, 0.5));
    expect(parts.halo.opacity).toBeCloseTo(0.6, 9);
  });

  it.each(['faint', 'halted', 'target', 'telegraph'] as const)('%s: the halo matches the rim colour', (glow) => {
    const parts = enemy();
    applyGlow(parts, glow, 0.3);
    expectColor(parts.halo.color, parts.edge.color);
  });

  it('glow state is per enemy: changing one leaves another untouched', () => {
    const face = fakeFace();
    const a = buildEnemy(face);
    const b = buildEnemy(face);
    applyGlow(a, 'target', 0);
    expectColor(b.edge.color, PURPLE);
    expect(a.edge).not.toBe(b.edge);
    expect(a.halo).not.toBe(b.halo);
  });
});

// Covers: CARDS-010
describe('card-enemy meshes', () => {
  it('reuses the shared face geometry and material and marks that mesh runtime-only', () => {
    const face = fakeFace();
    const parts = buildEnemy(face);
    const faceMeshes = parts.root.children.filter(
      (c): c is Mesh => c instanceof Mesh && c.geometry === face.geometry,
    );
    expect(faceMeshes).toHaveLength(1);
    expect(faceMeshes[0].material).toBe(face.material);
    expect(faceMeshes[0].userData.iwsdkRuntimeOnly).toBe(true);
  });

  it('the rim mesh is the root and uses the edge material', () => {
    const parts = enemy();
    expect(parts.root.material).toBe(parts.edge);
  });

  it('only the shared face mesh is runtime-only, so the per-enemy meshes are freed with the entity', () => {
    const parts = enemy();
    const runtimeOnly = parts.root.children.filter((c) => c.userData.iwsdkRuntimeOnly === true);
    expect(runtimeOnly).toHaveLength(1);
    expect(parts.root.userData.iwsdkRuntimeOnly).not.toBe(true);
  });
});
