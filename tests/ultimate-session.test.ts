// Requirement: the cards scene forwards "the ultimate fired" to the game session like its other seam
// events (presented, wrongOrb, correctOrb, enemyHit). Once the run has 5 charge (5 correct outcomes,
// plan D4/D7), firing resets charge to 0 and returns one `ultimate` effect telling the scene to
// knock the strike-slot enemy back (wave ultimateKnockback). The ultimate itself removes 0 cards,
// costs no pip and writes no FSRS rating (S2 "knockback -> 0 cards removed and no rating"). Below 5
// charge, before a run, or after the run ended, it does nothing (same session, no effects).
//
// Contract addition for src/flashcards/game-session.ts:
//   SessionEffect gains { type: 'ultimate' }.
//   export function fireUltimate(s: GameSession): SessionStep;
//     run active and charge >= 5 -> run charge 0, effects [{ type: 'ultimate' }];
//     otherwise the same session and no effects. review/save untouched.
// Covers tags cite plan IDs (docs/plans/2026-10-28-vr-flashcard-game.md: M4, D4, D7, S2, S7).
import { describe, expect, it } from 'vitest';
import * as gameSession from '../src/flashcards/game-session.js';
import {
  correctOrb,
  createSession,
  presented,
  startRun,
  updateMenu,
  wrongOrb,
  type GameSession,
  type SessionStep,
} from '../src/flashcards/game-session.js';
import type { Deck } from '../src/flashcards/deck-schema.js';
import { openDeckSelect, selectDeck } from '../src/flashcards/menu-flow.js';
import type { SaveStorage } from '../src/flashcards/save.js';

// 10:00 local: well clear of the 04:00 study-day rollover.
const NOW = new Date(2026, 10, 7, 10, 0, 0);
const clock = () => NOW;

const BIG: Deck = {
  id: 'big',
  title: 'Big Deck',
  cards: Array.from({ length: 14 }, (_, i) => ({
    id: `big-${i + 1}`,
    prompt: `Question number ${i + 1}?`,
    answer: `answer ${String.fromCharCode(97 + i)}`,
  })),
};

function memoryStorage(): SaveStorage & { writes: string[] } {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      writes.push(k);
      data.set(k, v);
    },
  };
}

function fireUltimate(s: GameSession): SessionStep {
  const fn = (gameSession as unknown as Record<string, unknown>).fireUltimate;
  if (typeof fn !== 'function') throw new Error('game-session does not export fireUltimate(s)');
  return (fn as (s: GameSession) => SessionStep)(s);
}

function chargeOf(s: GameSession): number | undefined {
  return (s.run?.run as { charge?: number } | undefined)?.charge;
}

function ready(storage: SaveStorage): GameSession {
  const s = createSession({ decks: [BIG], storage, clock });
  return updateMenu(updateMenu(s, openDeckSelect), (m) => selectDeck(m, BIG.id));
}

function started(storage: SaveStorage): { session: GameSession; ids: string[] } {
  const step = startRun(ready(storage));
  const wave = step.effects.find((e) => e.type === 'spawnWave') as { cards: { id: string }[] } | undefined;
  return { session: step.session, ids: wave ? wave.cards.map((c) => c.id) : [] };
}

/** Present + correct orb on the first n reserved cards. */
function answerCorrect(s: GameSession, ids: string[], n: number): GameSession {
  let out = s;
  for (let i = 0; i < n; i++) {
    out = presented(out, ids[i], `e${i}`).session;
    out = correctOrb(out, ids[i]).session;
  }
  return out;
}

// Covers: M4, D4, D7, S2, S7
describe('game-session: fireUltimate seam', () => {
  it('correct orbs charge the run: 5 correct -> charge 5', () => {
    const { session, ids } = started(memoryStorage());
    expect(chargeOf(session)).toBe(0);
    expect(chargeOf(answerCorrect(session, ids, 5))).toBe(5);
  });

  it('at 5 charge it resets charge to 0 and emits one ultimate effect', () => {
    const { session, ids } = started(memoryStorage());
    const charged = answerCorrect(session, ids, 5);
    const fired = fireUltimate(charged);
    expect(fired.session).not.toBe(charged);
    expect(chargeOf(fired.session)).toBe(0);
    expect(fired.effects).toEqual([{ type: 'ultimate' }]);
  });

  it('removes 0 cards, costs no pip and writes no rating', () => {
    const storage = memoryStorage();
    const { session, ids } = started(storage);
    let charged = answerCorrect(session, ids, 5);
    charged = presented(charged, ids[5], 'e5').session;
    const writesBefore = storage.writes.length;
    const fired = fireUltimate(charged);
    expect(fired.session.run?.run.remaining).toEqual(charged.run?.run.remaining);
    expect(fired.session.run?.run.pips).toBe(charged.run?.run.pips);
    expect(fired.session.review).toBe(charged.review);
    expect(fired.session.encounters).toBe(charged.encounters);
    expect(storage.writes.length).toBe(writesBefore);
  });

  it('a wrong orb adds no charge', () => {
    const { session, ids } = started(memoryStorage());
    let s = answerCorrect(session, ids, 4);
    s = presented(s, ids[4], 'e4').session;
    s = wrongOrb(s, ids[4], BIG.cards.find((c) => c.id !== ids[4])!.answer).session;
    expect(chargeOf(s)).toBe(4);
    const r = fireUltimate(s);
    expect(r.session).toBe(s);
    expect(r.effects).toEqual([]);
  });

  it('below 5 charge it changes nothing', () => {
    const { session, ids } = started(memoryStorage());
    for (const s of [session, answerCorrect(session, ids, 4)]) {
      const r = fireUltimate(s);
      expect(r.session).toBe(s);
      expect(r.effects).toEqual([]);
    }
  });

  it('before a run it changes nothing', () => {
    const pre = ready(memoryStorage());
    const r = fireUltimate(pre);
    expect(r.session).toBe(pre);
    expect(r.effects).toEqual([]);
  });

  it('after the run is lost it changes nothing, even when charged', () => {
    const { session, ids } = started(memoryStorage());
    let s = answerCorrect(session, ids, 5);
    for (let i = 5; i < 10; i++) {
      s = presented(s, ids[i], `e${i}`).session;
      s = wrongOrb(s, ids[i], BIG.cards.find((c) => c.id !== ids[i])!.answer).session;
    }
    expect(s.run?.run.status).toBe('lost');
    expect(chargeOf(s)).toBe(5);
    const r = fireUltimate(s);
    expect(r.session).toBe(s);
    expect(r.effects).toEqual([]);
  });
});
