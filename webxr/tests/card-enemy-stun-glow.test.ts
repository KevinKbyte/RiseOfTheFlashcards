// Requirement: on a correct answer the stunned enemy's glow switches to a stun colour distinct from
// the answering glow (both were cyan before) and from every other glow colour: faint purple, halted
// yellow, target cyan, and the telegraph's cyan-to-red swing. The halo shares the rim colour as for
// every glow. In the running field, the stunned target's rim shows that stun colour, not cyan,
// while an answering target keeps cyan.
//
// API contract (src/card-enemy.ts, src/card-enemy-field.ts):
//   export type Glow = 'faint' | 'halted' | 'target' | 'telegraph' | 'stunned';
//   applyGlow(parts, 'stunned', pulse) sets one stun colour on rim and halo (pulse-independent
//   colour is not required, but it must stay distinct from every other glow at every pulse tested).
//   EnemyField.update(wave, dt, clock) gives the stunned target the 'stunned' glow
//   (via enemyGlow in src/flashcards/stun-look.ts, tests/stun-look.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iwsdk/core', async () => ({ ...(await import('three')), RayInteractable: {} }));
vi.mock('../src/card-paint.js', () => ({ paintText: () => {}, paintFace: () => {} }));

import { Color, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Vector3 } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { applyGlow, buildEnemy, type EnemyParts, type Glow } from '../src/card-enemy.js';
import { EnemyField } from '../src/card-enemy-field.js';
import { createEncounter, ENCOUNTER_DEFAULTS, type EncounterPhase } from '../src/flashcards/encounter.js';
import { createPool } from '../src/flashcards/pool.js';
import type { Wave } from '../src/flashcards/wave.js';

const PURPLE = new Color(0x7c3aed);
const YELLOW = new Color(0xfacc15);
const CYAN = new Color(0x22d3ee);
const RED = new Color(0xef4444);
const PULSES = [0, 0.5, 1] as const;
/** Euclidean RGB distance below which two glow colours read as the same. */
const MIN_APART = 0.15;

function enemy(): EnemyParts {
  return buildEnemy({ geometry: new PlaneGeometry(0.36, 0.5), material: new MeshBasicMaterial() });
}

function apart(a: Color, b: Color): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/** Rim colour after switching from `from` to the stun glow, so a no-op switch is caught. */
function stunColour(from: Glow, pulse: number): Color {
  const parts = enemy();
  applyGlow(parts, from, pulse);
  applyGlow(parts, 'stunned' as Glow, pulse);
  return parts.edge.color.clone();
}

// Covers: CARDS-012, CARDS-010
describe('card-enemy stun glow colour', () => {
  it.each(PULSES)('pulse %s: the stun colour is not the answering cyan', (pulse) => {
    expect(apart(stunColour('target', pulse), CYAN)).toBeGreaterThan(MIN_APART);
  });

  it.each(PULSES)('pulse %s: the stun colour differs from faint, halted and telegraph colours', (pulse) => {
    const others = [PURPLE, YELLOW, CYAN, RED, new Color().lerpColors(CYAN, RED, 0.5)];
    for (const from of ['faint', 'halted', 'target', 'telegraph'] as const) {
      const stun = stunColour(from, pulse);
      for (const other of others) expect(apart(stun, other)).toBeGreaterThan(MIN_APART);
    }
  });

  it('the halo shares the stun rim colour', () => {
    const parts = enemy();
    applyGlow(parts, 'target', 0);
    applyGlow(parts, 'stunned' as Glow, 0.3);
    expect(parts.halo.color.r).toBeCloseTo(parts.edge.color.r, 6);
    expect(parts.halo.color.g).toBeCloseTo(parts.edge.color.g, 6);
    expect(parts.halo.color.b).toBeCloseTo(parts.edge.color.b, 6);
  });
});

const CFG = ENCOUNTER_DEFAULTS;

function fieldWith(phase: EncounterPhase): { rim: Color } {
  const roots: Object3D[] = [];
  const world = {
    createTransformEntity(obj: Object3D) {
      roots.push(obj);
      return { object3D: obj, addComponent: () => {}, dispose: () => obj.removeFromParent() };
    },
  } as unknown as World;
  const field = new EnemyField(world);
  const wave = {
    active: [{ id: 'a', enc: { ...createEncounter(CFG), phase, distance: CFG.reachDistance }, pool: createPool(['a']) }],
    targetId: 'a',
    cfg: CFG,
  } as unknown as Wave;
  const eye = new Vector3(0, 1.6, 0);
  field.spawnMissing(wave, [], eye, () => 0);
  field.update(wave, 1, 0);
  if (roots.length !== 1 || !(roots[0] instanceof Mesh)) throw new Error('fixture expected one enemy rim mesh');
  const rim = (roots[0].material as MeshBasicMaterial).color.clone();
  field.destroy();
  return { rim };
}

// Covers: CARDS-012
describe('enemy field: the stunned target shows the stun glow', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('an answering target keeps the cyan rim', () => {
    expect(apart(fieldWith('answering').rim, CYAN)).toBeLessThan(1e-6);
  });

  it('a stunned target is not cyan and matches the stun glow colour', () => {
    const { rim } = fieldWith('stunned');
    expect(apart(rim, CYAN)).toBeGreaterThan(MIN_APART);
    // update() at clock 0 drives applyGlow with pulse 0.5 + 0.5 * sin(0) = 0.5.
    expect(apart(rim, stunColour('target', 0.5))).toBeLessThan(1e-6);
  });
});
