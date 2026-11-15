// Requirement: in the game, IWSDK's lit controller and hand models are visible instead of solid
// black. The game entry drops the scene JSON that used to carry the lights, so the game adds its
// own: exactly one near-white hemisphere light and one near-white directional light placed above
// the player, neither casting shadows (Quest performance), with no tint on passthrough colours.
// Adding them twice never doubles the pair; the returned handle removes both lights, is safe to
// dispose twice, and a later call adds a fresh pair. A missing scene is a TypeError.
//
// API contract for src/card-lighting.ts (imports three via '@iwsdk/core', like other src modules):
//   export interface SceneLights { dispose(): void }
//   export function addSceneLights(scene: Object3D): SceneLights;
import { describe, expect, it, vi } from 'vitest';

vi.mock('@iwsdk/core', async () => await import('three'));

import { Color, DirectionalLight, Group, HemisphereLight, Object3D, Scene, Vector3 } from '@iwsdk/core';
import { addSceneLights } from '../src/card-lighting.js';

function lightsIn(root: Object3D): { hemi: HemisphereLight[]; dir: DirectionalLight[] } {
  const hemi: HemisphereLight[] = [];
  const dir: DirectionalLight[] = [];
  root.traverse((o) => {
    if ((o as HemisphereLight).isHemisphereLight) hemi.push(o as HemisphereLight);
    if ((o as DirectionalLight).isDirectionalLight) dir.push(o as DirectionalLight);
  });
  return { hemi, dir };
}

function expectNearWhite(c: Color): void {
  expect(c.r).toBeGreaterThanOrEqual(0.8);
  expect(c.g).toBeGreaterThanOrEqual(0.8);
  expect(c.b).toBeGreaterThanOrEqual(0.8);
}

// Covers: CARDS-010
describe('addSceneLights: adds one hemisphere and one directional light', () => {
  it('adds exactly one HemisphereLight and one DirectionalLight to a Scene and returns a handle', () => {
    const scene = new Scene();
    const handle = addSceneLights(scene);
    expect(handle).toBeTruthy();
    const { hemi, dir } = lightsIn(scene);
    expect(hemi).toHaveLength(1);
    expect(dir).toHaveLength(1);
  });

  it('works on any Object3D parent, not only a Scene', () => {
    const group = new Group();
    addSceneLights(group);
    const { hemi, dir } = lightsIn(group);
    expect(hemi).toHaveLength(1);
    expect(dir).toHaveLength(1);
  });

  it('uses finite, sane intensities', () => {
    const scene = new Scene();
    addSceneLights(scene);
    const { hemi, dir } = lightsIn(scene);
    const h = hemi[0].intensity;
    const d = dir[0].intensity;
    expect(Number.isFinite(h)).toBe(true);
    expect(Number.isFinite(d)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0.5);
    expect(h).toBeLessThanOrEqual(3);
    expect(d).toBeGreaterThanOrEqual(0.5);
    expect(d).toBeLessThanOrEqual(5);
  });

  it('places the directional light above the player and away from the origin', () => {
    const scene = new Scene();
    addSceneLights(scene);
    scene.updateMatrixWorld(true);
    const p = lightsIn(scene).dir[0].getWorldPosition(new Vector3());
    expect(p.y).toBeGreaterThan(1);
    expect(p.length()).toBeGreaterThan(0);
  });

  it('uses near-white light colours so passthrough colours are not tinted', () => {
    const scene = new Scene();
    addSceneLights(scene);
    const { hemi, dir } = lightsIn(scene);
    expectNearWhite(hemi[0].color);
    expectNearWhite(dir[0].color);
  });

  it('casts no shadows', () => {
    const scene = new Scene();
    addSceneLights(scene);
    const { hemi, dir } = lightsIn(scene);
    expect(hemi[0].castShadow).toBe(false);
    expect(dir[0].castShadow).toBe(false);
  });
});

// Covers: CARDS-010
describe('addSceneLights: idempotent per scene', () => {
  it('a second call on the same scene adds no second pair and keeps the same light instances', () => {
    const scene = new Scene();
    addSceneLights(scene);
    const first = lightsIn(scene);
    addSceneLights(scene);
    const second = lightsIn(scene);
    expect(second.hemi).toHaveLength(1);
    expect(second.dir).toHaveLength(1);
    expect(second.hemi[0]).toBe(first.hemi[0]);
    expect(second.dir[0]).toBe(first.dir[0]);
  });

  it('separate scenes each get their own pair', () => {
    const a = new Scene();
    const b = new Scene();
    addSceneLights(a);
    addSceneLights(b);
    expect(lightsIn(a).hemi).toHaveLength(1);
    expect(lightsIn(b).hemi).toHaveLength(1);
    expect(lightsIn(a).hemi[0]).not.toBe(lightsIn(b).hemi[0]);
  });
});

// Covers: CARDS-010
describe('addSceneLights: dispose', () => {
  it('dispose() removes both lights from the scene', () => {
    const scene = new Scene();
    const handle = addSceneLights(scene);
    handle.dispose();
    const { hemi, dir } = lightsIn(scene);
    expect(hemi).toHaveLength(0);
    expect(dir).toHaveLength(0);
  });

  it('calling dispose() twice is safe', () => {
    const scene = new Scene();
    const handle = addSceneLights(scene);
    handle.dispose();
    expect(() => handle.dispose()).not.toThrow();
    expect(lightsIn(scene).hemi).toHaveLength(0);
  });

  it('dispose() leaves unrelated children of the scene in place', () => {
    const scene = new Scene();
    const other = new Object3D();
    scene.add(other);
    addSceneLights(scene).dispose();
    expect(other.parent).toBe(scene);
  });

  it('after dispose(), addSceneLights adds a fresh pair', () => {
    const scene = new Scene();
    const handle = addSceneLights(scene);
    const before = lightsIn(scene);
    handle.dispose();
    addSceneLights(scene);
    const after = lightsIn(scene);
    expect(after.hemi).toHaveLength(1);
    expect(after.dir).toHaveLength(1);
    expect(after.hemi[0]).not.toBe(before.hemi[0]);
    expect(after.dir[0]).not.toBe(before.dir[0]);
  });
});

// Covers: CARDS-010
describe('addSceneLights: boundary checks', () => {
  it('throws TypeError for a null scene', () => {
    expect(() => addSceneLights(null as unknown as Object3D)).toThrow(TypeError);
  });

  it('throws TypeError for an undefined scene', () => {
    expect(() => addSceneLights(undefined as unknown as Object3D)).toThrow(TypeError);
  });
});
