// Requirement: one flashcard run reserves at most 12 cards (D14) and gives the player 5 shield
// pips. A correct answer clears that card; a wrong answer (voice or orb, D4) or an enemy strike
// costs the player one pip, at most one pip per card ENCOUNTER (D14/Q8; Kev 2026-11-07: per
// encounter, not once per run). An encounter is one presentation of a card until it is cleared or
// leaves; when the same card is re-presented later (beginEncounter) it can cost a pip again, so
// even a deck of 4 or fewer cards can be lost. The run is lost when
// the 5th pip is gone; it is won when every reserved card is cleared: "Day cleared", or "Deck
// conquered" when the selection is already fully mastered (M24/D19). Endless never wins. An empty
// queue at start is a practice run with no WIN (D19). Once the run is over, nothing changes it.
// The end screen gets summary stats (D19 mastery screen, S6 run end).
//
// Spec IDs: no .claude/spec-cache in this repo, so tags cite plan IDs
// (docs/plans/2026-10-28-vr-flashcard-game*.md: D4, D14, D19, M24, S6).
//
// API contract for src/flashcards/run-state.ts (pure, immutable, no three.js/DOM):
//   export const RUN_CARD_CAP = 12;
//   export const SHIELD_PIPS = 5;
//   export type RunStatus = 'active' | 'won' | 'lost' | 'practice';
//   export type WinTier = 'day-cleared' | 'deck-conquered';
//   export interface RunOptions {
//     cardIds: readonly string[]; deckMastered?: boolean; endless?: boolean;
//   }
//   export interface RunState {
//     readonly cards: readonly string[];      // reserved, deck order, <= RUN_CARD_CAP
//     readonly remaining: readonly string[];  // not yet cleared, deck order
//     readonly pips: number;
//     readonly status: RunStatus;
//     readonly winTier: WinTier | null;
//   }
//   export interface RunSummary {
//     outcome: RunStatus; winTier: WinTier | null; cardsTotal: number; cardsCleared: number;
//     correct: number; wrong: number; hitsTaken: number; pipsLeft: number;
//     accuracy: number | null;                // correct / (correct + wrong); null if none
//   }
//   export function startRun(opts: RunOptions): RunState;   // duplicate id -> RangeError
//   export function recordCorrect(s: RunState, cardId: string): RunState;
//   export function recordWrong(s: RunState, cardId: string): RunState;
//   export function recordEnemyHit(s: RunState, cardId: string): RunState;
//   export function beginEncounter(s: RunState, cardId: string): RunState; // card (re)presented:
//     starts a new encounter, so this card may cost one pip again
//   export function pipsRemaining(s: RunState): number;
//   export function isRunOver(s: RunState): boolean;
//   export function runSummary(s: RunState): RunSummary;
// Actions that do not apply (run over, card not remaining) return the same object.
import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_CAP,
  SHIELD_PIPS,
  beginEncounter,
  isRunOver,
  pipsRemaining,
  recordCorrect,
  recordEnemyHit,
  recordWrong,
  runSummary,
  startRun,
  type RunState,
} from '../src/flashcards/run-state.js';

function deck(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `c${i + 1}`);
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

/** One hit on each of the first n cards (distinct encounters, so the per-encounter cap never bites). */
function hitCards(s: RunState, n: number): RunState {
  let out = s;
  for (let i = 0; i < n; i++) out = recordEnemyHit(out, s.cards[i]);
  return out;
}

// Covers: D14
describe('startRun', () => {
  it('exposes the fixed counts: 12-card cap and 5 shield pips', () => {
    expect(RUN_CARD_CAP).toBe(12);
    expect(SHIELD_PIPS).toBe(5);
  });

  it('reserves every card of a deck smaller than the cap, in deck order, with full pips', () => {
    const s = startRun({ cardIds: deck(5) });
    expect(s.cards).toEqual(deck(5));
    expect(s.remaining).toEqual(deck(5));
    expect(s.pips).toBe(5);
    expect(pipsRemaining(s)).toBe(5);
    expect(s.status).toBe('active');
    expect(s.winTier).toBeNull();
    expect(isRunOver(s)).toBe(false);
  });

  it('reserves exactly 12 cards from a 12-card deck', () => {
    expect(startRun({ cardIds: deck(12) }).cards).toEqual(deck(12));
  });

  it('caps a larger deck at its first 12 cards', () => {
    const s = startRun({ cardIds: deck(13) });
    expect(s.cards).toEqual(deck(12));
    expect(s.remaining).toEqual(deck(12));
    expect(runSummary(s).cardsTotal).toBe(12);
  });

  it('treats an empty queue at start as a practice run: over at once, no WIN', () => {
    const s = startRun({ cardIds: [] });
    expect(s.status).toBe('practice');
    expect(s.winTier).toBeNull();
    expect(isRunOver(s)).toBe(true);
    expect(s.pips).toBe(5);
  });

  it('rejects a deck with a duplicate card id', () => {
    expect(() => startRun({ cardIds: ['a', 'b', 'a'] })).toThrow(RangeError);
  });

  it('does not mutate the input array', () => {
    const ids = deepFreeze(deck(14));
    expect(() => startRun({ cardIds: ids })).not.toThrow();
    expect(ids).toHaveLength(14);
  });
});

// Covers: D4, D14
describe('recording answers and hits', () => {
  it('a correct peel removes only that card and costs no pip', () => {
    const s = recordCorrect(startRun({ cardIds: deck(3) }), 'c2');
    expect(s.remaining).toEqual(['c1', 'c3']);
    expect(s.pips).toBe(5);
    expect(s.status).toBe('active');
  });

  it('a wrong answer costs one pip and keeps the card in play (D4 Voice/Orb wrong)', () => {
    const s = recordWrong(startRun({ cardIds: deck(3) }), 'c1');
    expect(s.pips).toBe(4);
    expect(s.remaining).toEqual(deck(3));
  });

  it('an enemy hit costs one pip and keeps the card in play', () => {
    const s = recordEnemyHit(startRun({ cardIds: deck(3) }), 'c1');
    expect(pipsRemaining(s)).toBe(4);
    expect(s.remaining).toEqual(deck(3));
  });

  it('caps pip loss at one per encounter, across wrong answers and enemy hits', () => {
    let s = startRun({ cardIds: deck(3) });
    s = recordWrong(s, 'c1');
    s = recordWrong(s, 'c1');
    s = recordEnemyHit(s, 'c1');
    expect(s.pips).toBe(4);
    s = recordEnemyHit(s, 'c2');
    expect(s.pips).toBe(3);
  });

  it('ignores answers and hits for a card that is not in play', () => {
    const s0 = recordCorrect(startRun({ cardIds: deck(3) }), 'c1');
    expect(recordCorrect(s0, 'c1')).toBe(s0);
    expect(recordWrong(s0, 'c1')).toBe(s0);
    expect(recordEnemyHit(s0, 'c1')).toBe(s0);
    expect(recordEnemyHit(s0, 'nope')).toBe(s0);
  });

  it('never mutates the state it is given', () => {
    const s0 = deepFreeze(startRun({ cardIds: deck(3) }));
    const s1 = recordWrong(s0, 'c1');
    const s2 = recordEnemyHit(s1, 'c2');
    const s3 = recordCorrect(s2, 'c1');
    expect(s0.pips).toBe(5);
    expect(s0.remaining).toEqual(deck(3));
    expect(s3.remaining).toEqual(['c2', 'c3']);
    expect(s3.pips).toBe(3);
  });
});

// Covers: D4, D14
describe('per-encounter pip cap (Kev 2026-11-07: one pip per encounter, not per run)', () => {
  it('two wrong answers in one encounter cost exactly 1 pip', () => {
    let s = beginEncounter(startRun({ cardIds: deck(3) }), 'c1');
    s = recordWrong(s, 'c1');
    s = recordWrong(s, 'c1');
    expect(s.pips).toBe(4);
    expect(s.wrong).toBe(2);
  });

  it('the same card re-presented in a new encounter costs another pip when missed again', () => {
    let s = beginEncounter(startRun({ cardIds: deck(3) }), 'c1');
    s = recordWrong(s, 'c1');
    expect(s.pips).toBe(4);
    s = beginEncounter(s, 'c1');
    s = recordWrong(s, 'c1');
    expect(s.pips).toBe(3);
    s = recordEnemyHit(s, 'c1'); // still the second encounter: capped
    expect(s.pips).toBe(3);
  });

  it('an enemy hit in a new encounter also costs a pip again', () => {
    let s = recordEnemyHit(startRun({ cardIds: deck(3) }), 'c2');
    s = recordEnemyHit(beginEncounter(s, 'c2'), 'c2');
    expect(s.pips).toBe(3);
  });

  it('a 4-card deck can reach the 5th pip and LOSE', () => {
    let s = startRun({ cardIds: deck(4) });
    for (const id of deck(4)) s = recordWrong(beginEncounter(s, id), id);
    expect(s.pips).toBe(1);
    expect(s.status).toBe('active');
    s = recordWrong(beginEncounter(s, 'c1'), 'c1');
    expect(s.pips).toBe(0);
    expect(s.status).toBe('lost');
    expect(isRunOver(s)).toBe(true);
    expect(runSummary(s).hitsTaken).toBe(5);
  });

  it('a 1-card deck missed in 5 separate encounters is lost', () => {
    let s = startRun({ cardIds: ['a'] });
    for (let i = 0; i < 5; i++) s = recordWrong(beginEncounter(s, 'a'), 'a');
    expect(s.status).toBe('lost');
  });

  it('beginning an encounter costs no pip and does not clear or remove the card', () => {
    const s0 = startRun({ cardIds: deck(3) });
    const s1 = beginEncounter(recordWrong(s0, 'c1'), 'c1');
    expect(s1.pips).toBe(4);
    expect(s1.remaining).toEqual(deck(3));
    expect(s1.status).toBe('active');
  });

  it('beginEncounter ignores cards not in play and runs that are over', () => {
    const cleared = recordCorrect(startRun({ cardIds: deck(3) }), 'c1');
    expect(beginEncounter(cleared, 'c1')).toBe(cleared);
    expect(beginEncounter(cleared, 'nope')).toBe(cleared);
    const won = recordCorrect(startRun({ cardIds: ['a'] }), 'a');
    expect(beginEncounter(won, 'a')).toBe(won);
    const practice = startRun({ cardIds: [] });
    expect(beginEncounter(practice, 'a')).toBe(practice);
  });

  it('beginEncounter never mutates the state it is given', () => {
    const s0 = deepFreeze(recordWrong(startRun({ cardIds: deck(3) }), 'c1'));
    const s1 = recordWrong(beginEncounter(s0, 'c1'), 'c1');
    expect(s0.pips).toBe(4);
    expect(s1.pips).toBe(3);
  });
});

// Covers: D14, S6
describe('losing the run', () => {
  it('stays active after the 4th hit with 1 pip left', () => {
    const s = hitCards(startRun({ cardIds: deck(8) }), 4);
    expect(s.pips).toBe(1);
    expect(s.status).toBe('active');
    expect(isRunOver(s)).toBe(false);
  });

  it('ends the run as lost on exactly the 5th hit', () => {
    const s = hitCards(startRun({ cardIds: deck(8) }), 5);
    expect(s.pips).toBe(0);
    expect(s.status).toBe('lost');
    expect(s.winTier).toBeNull();
    expect(isRunOver(s)).toBe(true);
  });

  it('a wrong answer can be the 5th hit', () => {
    let s = hitCards(startRun({ cardIds: deck(8) }), 4);
    s = recordWrong(s, 'c5');
    expect(s.status).toBe('lost');
  });

  it('ignores every action once the run is lost; pips never go below 0', () => {
    const over = hitCards(startRun({ cardIds: deck(8) }), 5);
    expect(recordEnemyHit(over, 'c6')).toBe(over);
    expect(recordWrong(over, 'c7')).toBe(over);
    expect(recordCorrect(over, 'c8')).toBe(over);
    expect(pipsRemaining(over)).toBe(0);
  });

  it('ends at 0 pips in Endless mode too', () => {
    const s = hitCards(startRun({ cardIds: deck(8), endless: true }), 5);
    expect(s.status).toBe('lost');
  });
});

// Covers: D19, M24
describe('winning the run', () => {
  it('clearing every reserved card wins "Day cleared" by default', () => {
    let s = startRun({ cardIds: deck(3) });
    s = recordCorrect(s, 'c1');
    s = recordCorrect(s, 'c2');
    expect(s.status).toBe('active');
    s = recordCorrect(s, 'c3');
    expect(s.status).toBe('won');
    expect(s.winTier).toBe('day-cleared');
    expect(isRunOver(s)).toBe(true);
  });

  it('wins "Deck conquered" when the selection is already fully mastered', () => {
    let s = startRun({ cardIds: deck(2), deckMastered: true });
    s = recordCorrect(recordCorrect(s, 'c1'), 'c2');
    expect(s.status).toBe('won');
    expect(s.winTier).toBe('deck-conquered');
  });

  it('a run with hits taken still wins if the queue is cleared before 0 pips', () => {
    let s = startRun({ cardIds: deck(2) });
    s = recordWrong(s, 'c1');
    s = recordEnemyHit(s, 'c2');
    s = recordCorrect(recordCorrect(s, 'c1'), 'c2');
    expect(s.status).toBe('won');
    expect(s.pips).toBe(3);
  });

  it('wins only on the cards reserved under the cap, not the overflow', () => {
    let s = startRun({ cardIds: deck(15) });
    for (const id of deck(12)) s = recordCorrect(s, id);
    expect(s.status).toBe('won');
  });

  it('never wins in Endless mode, even with the queue cleared', () => {
    let s = startRun({ cardIds: deck(2), endless: true, deckMastered: true });
    s = recordCorrect(recordCorrect(s, 'c1'), 'c2');
    expect(s.status).toBe('active');
    expect(s.winTier).toBeNull();
    expect(isRunOver(s)).toBe(false);
  });

  it('ignores every action once the run is won', () => {
    const won = recordCorrect(startRun({ cardIds: ['a'] }), 'a');
    expect(recordEnemyHit(won, 'a')).toBe(won);
    expect(recordWrong(won, 'a')).toBe(won);
    expect(recordCorrect(won, 'a')).toBe(won);
  });
});

// Covers: D19, S6
describe('runSummary', () => {
  it('reports the end-screen stats for a lost run', () => {
    let s = startRun({ cardIds: deck(10) });
    s = recordWrong(s, 'c1');
    s = recordCorrect(s, 'c1');
    s = recordCorrect(s, 'c2');
    s = recordCorrect(s, 'c3');
    s = recordWrong(s, 'c4');
    s = recordWrong(s, 'c4'); // same encounter: counted as an answer, no extra pip
    s = hitCards(s, 7); // c1-c3 already cleared (ignored), c4 already hit (capped): +3 pips lost
    expect(runSummary(s)).toEqual({
      outcome: 'lost',
      winTier: null,
      cardsTotal: 10,
      cardsCleared: 3,
      correct: 3,
      wrong: 3,
      hitsTaken: 5,
      pipsLeft: 0,
      accuracy: 0.5,
    });
  });

  it('reports a won run with the win tier and perfect accuracy', () => {
    let s = startRun({ cardIds: deck(2), deckMastered: true });
    s = recordCorrect(recordCorrect(s, 'c1'), 'c2');
    expect(runSummary(s)).toEqual({
      outcome: 'won',
      winTier: 'deck-conquered',
      cardsTotal: 2,
      cardsCleared: 2,
      correct: 2,
      wrong: 0,
      hitsTaken: 0,
      pipsLeft: 5,
      accuracy: 1,
    });
  });

  it('reports null accuracy when nothing was answered', () => {
    const sum = runSummary(startRun({ cardIds: [] }));
    expect(sum.outcome).toBe('practice');
    expect(sum.cardsTotal).toBe(0);
    expect(sum.accuracy).toBeNull();
  });
});
