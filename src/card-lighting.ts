// Scene lights for IWSDK's lit controller/hand models. The game entry drops the scene JSON that
// carried the lights, so without these the MeshStandardMaterial controllers render solid black.
// Game meshes are MeshBasicMaterial and unaffected. No shadows: Quest fill-rate budget.
import { DirectionalLight, HemisphereLight, type Object3D } from '@iwsdk/core';

export interface SceneLights {
  dispose(): void;
}

const HEMI_INTENSITY = 1.5;
const DIR_INTENSITY = 2;

// Keyed per parent so a repeat call returns the live pair instead of stacking a second one.
const active = new WeakMap<Object3D, SceneLights>();

export function addSceneLights(scene: Object3D): SceneLights {
  if (scene == null) throw new TypeError('addSceneLights: scene is required');
  const existing = active.get(scene);
  if (existing) return existing;

  const hemi = new HemisphereLight(0xffffff, 0xdddddd, HEMI_INTENSITY);
  const dir = new DirectionalLight(0xffffff, DIR_INTENSITY);
  dir.position.set(1, 3, 2);
  hemi.castShadow = false;
  dir.castShadow = false;
  scene.add(hemi, dir);

  const handle: SceneLights = {
    dispose() {
      scene.remove(hemi, dir);
      if (active.get(scene) === handle) active.delete(scene);
    },
  };
  active.set(scene, handle);
  return handle;
}
