// Requirement: the ultimate (M4) charges as the player answers. Every correct outcome adds 1 charge
// (voice or orb, assisted or not; plan D4 "Ultimate charge"); a wrong answer or an enemy strike adds
// nothing. The ultimate can fire once charge reaches 5 (D7 "Ultimate (charge >=5)"); a 6th correct
// while charged still lets it fire (S7). Firing resets charge to 0 (S7 "charge 0 after firing").
// Below 5, or once the run is over, firing does nothing.
//
// Contract addition for src/flashcards/run-state.ts:
//   export const ULTIMATE_CHARGE = 5;
//   RunState gains `readonly charge: number` (startRun -> 0; recordCorrect -> +1).
//   export function fireUltimate(s: RunState): RunState;
//     charge >= ULTIMATE_CHARGE and run active -> { ...s, charge: 0 }; otherwise the same object.
// Covers tags cite plan IDs (docs/plans/2026-10-28-vr-flashcard-game.md: M4, D4, D7, S7).
import { describe, expect, it } from 'vitest';
import * as runState from '../src/flashcards/run-state.js';
import {
  recordCorrect,
  recordEnemyHit,
  recordWrong,
  startRun,
  type RunState,
} from '../src/flashcards/run-state.js';

type Charged = RunState & { readonly charge: number };

function fireUltimate(s: RunState): RunState {
  const fn = (runState as unknown as Record<string, unknown>).fireUltimate;
  if (typeof fn !== 'function') throw new Error('run-state does not export fireUltimate(s)');
  return (fn as (s: RunState) => RunState)(s);
}

function chargeOf(s: RunState): number {
  return (s as Charged).charge;
}

function deck(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `c${i + 1}`);
}

/** Correct answers on the first n cards of the run. */
function corrects(s: RunState, n: number): RunState {
  let out = s;
  for (let i = 0; i < n; i++) out = recordCorrect(out, s.cards[i]);
  return out;
}

// Covers: M4, D4, D7, S7
describe('ultimate charge', () => {
  it('exports ULTIMATE_CHARGE = 5', () => {
    expect((runState as unknown as Record<string, unknown>).ULTIMATE_CHARGE).toBe(5);
  });

  it('a new run starts with charge 0', () => {
    expect(chargeOf(startRun({ cardIds: deck(3) }))).toBe(0);
    expect(chargeOf(startRun({ cardIds: [] }))).toBe(0);
  });

  it('each correct outcome adds 1 charge', () => {
    let s = startRun({ cardIds: deck(8) });
    for (let i = 1; i <= 4; i++) {
      s = recordCorrect(s, `c${i}`);
      expect(chargeOf(s), `after ${i} correct`).toBe(i);
    }
  });

  it('a wrong answer and an enemy hit leave charge unchanged', () => {
    let s = corrects(startRun({ cardIds: deck(8) }), 2);
    s = recordWrong(s, 'c3');
    expect(chargeOf(s)).toBe(2);
    s = recordEnemyHit(s, 'c4');
    expect(chargeOf(s)).toBe(2);
  });

  it('fires at exactly 5 and resets charge to 0, keeping the rest of the run', () => {
    const s = corrects(startRun({ cardIds: deck(8) }), 5);
    expect(chargeOf(s)).toBe(5);
    const fired = fireUltimate(s);
    expect(fired).not.toBe(s);
    expect(chargeOf(fired)).toBe(0);
    expect(fired.remaining).toEqual(s.remaining);
    expect(fired.pips).toBe(s.pips);
    expect(fired.correct).toBe(s.correct);
    expect(fired.status).toBe('active');
  });

  it('a 6th correct while charged keeps counting and the ultimate still fires', () => {
    const s = corrects(startRun({ cardIds: deck(8) }), 6);
    expect(chargeOf(s)).toBe(6);
    expect(chargeOf(fireUltimate(s))).toBe(0);
  });

  it('below 5 charge firing returns the same object', () => {
    const fresh = startRun({ cardIds: deck(8) });
    expect(fireUltimate(fresh)).toBe(fresh);
    const four = corrects(fresh, 4);
    expect(fireUltimate(four)).toBe(four);
  });

  it('charge rebuilds from 0 after firing', () => {
    let s = fireUltimate(corrects(startRun({ cardIds: deck(8) }), 5));
    s = recordCorrect(s, 'c6');
    expect(chargeOf(s)).toBe(1);
    expect(fireUltimate(s)).toBe(s);
  });

  it('once the run is over firing returns the same object, even when charged', () => {
    const won = corrects(startRun({ cardIds: deck(5) }), 5);
    expect(won.status).toBe('won');
    expect(chargeOf(won)).toBe(5);
    expect(fireUltimate(won)).toBe(won);

    let lost = corrects(startRun({ cardIds: deck(12) }), 5);
    for (let i = 6; i <= 10; i++) lost = recordEnemyHit(lost, `c${i}`);
    expect(lost.status).toBe('lost');
    expect(chargeOf(lost)).toBe(5);
    expect(fireUltimate(lost)).toBe(lost);

    const practice = startRun({ cardIds: [] });
    expect(fireUltimate(practice)).toBe(practice);
  });

  it('never mutates the state it is given', () => {
    const s = Object.freeze(corrects(startRun({ cardIds: deck(8) }), 5));
    fireUltimate(s);
    expect(chargeOf(s)).toBe(5);
  });
});
