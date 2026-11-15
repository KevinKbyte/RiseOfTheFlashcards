// Requirement: an answer orb is answered once per frame even when two inputs hit orbs in the same
// frame (two hands slashing, or a select plus a slash on another orb; M1, M10 select fallback,
// ledgers-2 H-2). The FIRST hit of the frame wins and later hits are ignored, so a second hand
// cannot overwrite the answer.
//
// Contract for src/flashcards/orb-pick.ts (pure, generic over the orb type; no gamepad field):
//   export function mergeOrbPick<O>(pending: O | null, hit: O): O;   // returns pending ?? hit
import { describe, expect, it } from 'vitest';
import { mergeOrbPick } from '../src/flashcards/orb-pick.js';

interface Orb {
  readonly label: string;
}

const A: Orb = Object.freeze({ label: 'A' });
const B: Orb = Object.freeze({ label: 'B' });
const C: Orb = Object.freeze({ label: 'C' });

// Covers: M1, M10, H-2
describe('mergeOrbPick first hit wins', () => {
  it('the first hit of the frame is taken when nothing is pending', () => {
    expect(mergeOrbPick<Orb>(null, A)).toBe(A);
  });

  it('a second hand hitting another orb does not overwrite the first hit', () => {
    const first = mergeOrbPick<Orb>(null, A);
    expect(mergeOrbPick<Orb>(first, B)).toBe(A);
  });

  it('a later hit on the same orb keeps that orb', () => {
    expect(mergeOrbPick<Orb>(A, A)).toBe(A);
  });

  it('the first pick of three hits survives, in any later order', () => {
    let p = mergeOrbPick<Orb>(null, B);
    p = mergeOrbPick<Orb>(p, A);
    p = mergeOrbPick<Orb>(p, C);
    expect(p).toBe(B);
  });

  it('works for primitive orb ids too', () => {
    expect(mergeOrbPick<string>(null, 'x')).toBe('x');
    expect(mergeOrbPick<string>('x', 'y')).toBe('x');
  });
});
