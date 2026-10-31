// Requirement: an encounter config with a creep duration that is zero, negative, or not a finite
// number is rejected up front, so the enemy can never creep at an infinite or NaN speed.
// CARDS-* IDs are prototype-local (no spec-cache home yet).
import { describe, expect, it } from 'vitest';
import { createEncounter, ENCOUNTER_DEFAULTS } from '../src/flashcards/encounter.js';

// Covers: CARDS-004
describe('encounter config and creation: creepSeconds guard', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'createEncounter rejects creepSeconds %s with a RangeError',
    (creepSeconds) => {
      expect(() => createEncounter({ ...ENCOUNTER_DEFAULTS, creepSeconds })).toThrow(RangeError);
    },
  );
});
