// Requirement: a stunned encounter with no recorded stun distance (`stunFrom` undefined, e.g. one
// built by hand rather than through stun()) is treated as already at the hold line: tick() never
// changes its distance, for any dt, whether time arrives in one big step or many small ones, so it
// cannot lunge by a frame-size-dependent amount. Its stun clock (`stunElapsed`) still advances by
// the dt it is given, and it stays stunned.
import { describe, expect, it } from 'vitest';
import { createEncounter, ENCOUNTER_DEFAULTS, LUNGE_S, tick, type Encounter } from '../src/flashcards/encounter.js';

const D = ENCOUNTER_DEFAULTS;

/** Hand-built stunned encounter at `distance` with no stunFrom. */
function unanchored(distance: number, stunElapsed?: number): Encounter {
  const base: Encounter = { ...createEncounter(D), phase: 'stunned', distance };
  return stunElapsed === undefined ? base : { ...base, stunElapsed };
}

const DISTANCES = [D.knockbackDistance, D.spawnDistance, 1.2] as const;
const DTS = [0.016, 0.1, LUNGE_S / 2, LUNGE_S, 1, 10] as const;

// Covers: ENC-006
describe('encounter stun without stunFrom: no lunge', () => {
  for (const distance of DISTANCES) {
    it.each(DTS)(`at ${distance} m, one tick of %s s leaves the distance unchanged`, (dt) => {
      const out = tick(unanchored(distance), dt);
      expect(out.phase).toBe('stunned');
      expect(out.distance).toBe(distance);
    });

    it(`at ${distance} m, many small ticks never move it`, () => {
      let enc = unanchored(distance);
      for (let i = 0; i < 60; i += 1) {
        enc = tick(enc, 1 / 72);
        expect(enc.distance).toBe(distance);
      }
      expect(enc.phase).toBe('stunned');
    });
  }

  it('one big step and many small steps end at the same (unchanged) distance', () => {
    const once = tick(unanchored(D.knockbackDistance), 0.6).distance;
    let split = unanchored(D.knockbackDistance);
    for (let i = 0; i < 6; i += 1) split = tick(split, 0.1);
    expect(once).toBe(D.knockbackDistance);
    expect(split.distance).toBe(once);
  });

  it('stunElapsed still advances by the dt given, starting from 0 when absent', () => {
    const a = tick(unanchored(D.knockbackDistance), 0.1);
    expect(a.stunElapsed).toBeCloseTo(0.1, 12);
    const b = tick(a, 0.25);
    expect(b.stunElapsed).toBeCloseTo(0.35, 12);
  });

  it('stunElapsed advances from an existing value too', () => {
    const out = tick(unanchored(D.knockbackDistance, 0.05), 0.1);
    expect(out.stunElapsed).toBeCloseTo(0.15, 12);
    expect(out.distance).toBe(D.knockbackDistance);
  });

  it('tick does not mutate the input encounter', () => {
    const enc = Object.freeze(unanchored(D.knockbackDistance));
    tick(enc, 0.1);
    expect(enc.distance).toBe(D.knockbackDistance);
    expect(enc.stunElapsed).toBeUndefined();
  });
});
