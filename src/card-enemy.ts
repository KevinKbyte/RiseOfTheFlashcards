// Enemy card visuals: a card back with a cartoon face, a solid rim, and an additive halo for glow.
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { paintFace } from './card-paint.js';

const ENEMY_W = 0.36;
const ENEMY_H = 0.5;
const ENEMY_EDGE = 0.04;
const HALO_PAD = 0.18;
const HALTED_SCALE = 1.08;

const EDGE_IDLE = new Color(0x7c3aed);
const EDGE_READY = new Color(0xfacc15);
const EDGE_TARGET = new Color(0x22d3ee);
const EDGE_RED = new Color(0xef4444);
// Faint for walkers so the target and enemies waiting at the reach line stand out.
const HALO_FAINT = 0.12;
const HALO_BRIGHT = 0.6;

export type Glow = 'faint' | 'halted' | 'target' | 'telegraph';

export interface FaceParts {
  geometry: PlaneGeometry;
  material: MeshBasicMaterial;
}

export interface EnemyParts {
  root: Mesh;
  edge: MeshBasicMaterial;
  halo: MeshBasicMaterial;
}

/** Shared by every enemy; the caller owns and disposes it. */
export function createFaceParts(): FaceParts {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = Math.round((256 * ENEMY_H) / ENEMY_W);
  paintFace(canvas);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  // alphaTest (not blending) keeps the face in the opaque pass with depth writes, so it never
  // mis-sorts against the see-through panel.
  const material = new MeshBasicMaterial({ map, alphaTest: 0.5 });
  return { geometry: new PlaneGeometry(ENEMY_W, ENEMY_H), material };
}

/** Per-enemy meshes; everything except the shared face is freed by entity dispose. */
export function buildEnemy(face: FaceParts): EnemyParts {
  const edge = new MeshBasicMaterial({ color: EDGE_IDLE, side: DoubleSide });
  const root = new Mesh(new PlaneGeometry(ENEMY_W + ENEMY_EDGE, ENEMY_H + ENEMY_EDGE), edge);
  const halo = new MeshBasicMaterial({
    color: EDGE_IDLE,
    transparent: true,
    opacity: HALO_FAINT,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const haloMesh = new Mesh(
    new PlaneGeometry(ENEMY_W + HALO_PAD, ENEMY_H + HALO_PAD),
    halo,
  );
  haloMesh.position.z = -0.005;
  root.add(haloMesh);
  // Card back faces the player; the prompt stays hidden until the reveal pops it out.
  const back = new Mesh(
    new PlaneGeometry(ENEMY_W, ENEMY_H),
    new MeshBasicMaterial({ color: 0x1e1b4b, side: DoubleSide }),
  );
  back.position.z = 0.005;
  root.add(back);
  const faceMesh = new Mesh(face.geometry, face.material);
  faceMesh.position.z = 0.01;
  // Runtime-only so entity dispose skips the shared face resources.
  faceMesh.userData.iwsdkRuntimeOnly = true;
  root.add(faceMesh);
  return { root, edge, halo };
}

/** `pulse` in [0, 1] drives the telegraph colour swing. Returns the glow's scale multiplier. */
export function applyGlow(parts: EnemyParts, glow: Glow, pulse: number): number {
  const color = parts.edge.color;
  switch (glow) {
    case 'faint':
      color.copy(EDGE_IDLE);
      parts.halo.opacity = HALO_FAINT;
      break;
    case 'halted':
      color.copy(EDGE_READY);
      parts.halo.opacity = HALO_BRIGHT;
      break;
    case 'target':
      color.copy(EDGE_TARGET);
      parts.halo.opacity = HALO_BRIGHT;
      break;
    case 'telegraph':
      color.lerpColors(EDGE_TARGET, EDGE_RED, pulse);
      parts.halo.opacity = HALO_BRIGHT;
      break;
  }
  parts.halo.color.copy(color);
  return glow === 'halted' ? HALTED_SCALE : 1;
}
