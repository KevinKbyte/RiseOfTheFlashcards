// Requirement (Kev decision 2026-11-07, amends the D4 "Arrived unanswered" row): an enemy strike
// that lands on the player (game-session enemyHit) ALSO writes an FSRS Again rating for the card
// that enemy carried, exactly like a wrong orb. One Again per encounter per card, shared with the
// wrong orb in either order (wrong orb then hit, or hit then wrong orb = one write); a later correct
// orb in that encounter adds no write. No write when the save could not be read (readFailed: a write
// would clobber a save we never saw), for a card that was never presented, is no longer in play, or
// is unknown, or before a run / after it ended. A new presentation of the card starts a new
// encounter, which may write a new Again (subject to the scheduler's once-per-study-day guard, so
// the test advances the clock a day). Pips still drop per run-flow rules; the correct path is
// unchanged.
// Covers: D4, D5, D14
import { describe, expect, it } from 'vitest';
import {
  correctOrb,
  createSession,
  enemyHit,
  presented,
  startRun,
  updateMenu,
  wrongOrb,
  type GameSession,
  type SessionEffect,
  type SessionStep,
} from '../src/flashcards/game-session.js';
import { openDeckSelect, selectDeck } from '../src/flashcards/menu-flow.js';
import type { Deck } from '../src/flashcards/deck-schema.js';
import { applyRating } from '../src/flashcards/scheduler.js';
import { deckCards, loadSave, type SaveStorage } from '../src/flashcards/save.js';

// 10:00 local: well clear of the 04:00 study-day rollover.
const DAY1 = new Date(2026, 10, 7, 10, 0, 0);
const DAY2 = new Date(2026, 10, 8, 10, 0, 0);

const DECK: Deck = {
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

function throwingReadStorage(): SaveStorage & { writes: string[] } {
  const writes: string[] = [];
  return {
    writes,
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: (k) => {
      writes.push(k);
    },
  };
}

function wrongLabel(cardId: string): string {
  const other = DECK.cards.find((c) => c.id !== cardId);
  if (!other) throw new Error('deck too small');
  return other.answer;
}

function pips(effects: readonly SessionEffect[]): number[] {
  return effects.flatMap((e) => (e.type === 'pips' ? [e.remaining] : []));
}

function started(storage: SaveStorage, clock: () => Date = () => DAY1): { session: GameSession; ids: string[] } {
  let s = createSession({ decks: [DECK], storage, clock });
  s = updateMenu(updateMenu(s, openDeckSelect), (m) => selectDeck(m, DECK.id));
  const step: SessionStep = startRun(s);
  const wave = step.effects.find((e) => e.type === 'spawnWave');
  const ids = wave?.type === 'spawnWave' ? wave.cards.map((c) => c.id) : [];
  return { session: step.session, ids };
}

const savedCard = (storage: SaveStorage, id: string) => deckCards(loadSave(storage), DECK.id)[id];

describe('enemy hit writes an FSRS Again for the struck card', () => {
  it('an enemy hit on a presented card costs one pip and writes exactly one Again', () => {
    const storage = memoryStorage();
    const { session, ids } = started(storage);
    const id = ids[0];
    const s = presented(session, id, 'e1').session;
    const hit = enemyHit(s, id);
    expect(pips(hit.effects)).toEqual([4]);
    expect(storage.writes).toHaveLength(1);
    expect(savedCard(storage, id)).toEqual(applyRating(undefined, 'again', DAY1));
  });

  it('a wrong orb then an enemy hit in the same encounter write exactly one Again', () => {
    const storage = memoryStorage();
    const { session, ids } = started(storage);
    const id = ids[0];
    let s = presented(session, id, 'e1').session;
    s = wrongOrb(s, id, wrongLabel(id)).session;
    const hit = enemyHit(s, id);
    expect(pips(hit.effects)).toEqual([]);
    expect(storage.writes).toHaveLength(1);
    expect(savedCard(storage, id)).toEqual(applyRating(undefined, 'again', DAY1));
  });

  it('an enemy hit then a wrong orb in the same encounter write exactly one Again', () => {
    const storage = memoryStorage();
    const { session, ids } = started(storage);
    const id = ids[0];
    let s = presented(session, id, 'e1').session;
    s = enemyHit(s, id).session;
    expect(storage.writes).toHaveLength(1);
    const wrong = wrongOrb(s, id, wrongLabel(id));
    expect(pips(wrong.effects)).toEqual([]);
    expect(wrong.session.run?.run.pips).toBe(4);
    expect(storage.writes).toHaveLength(1);
    expect(savedCard(storage, id)).toEqual(applyRating(undefined, 'again', DAY1));
  });

  it('two enemy hits in one encounter write one Again, even across a study-day boundary', () => {
    const storage = memoryStorage();
    let now = DAY1;
    const { session, ids } = started(storage, () => now);
    const id = ids[0];
    let s = presented(session, id, 'e1').session;
    s = enemyHit(s, id).session;
    now = DAY2;
    enemyHit(s, id);
    expect(storage.writes).toHaveLength(1);
  });

  it('an enemy hit then a correct orb in the same encounter clears the card but adds no write', () => {
    const storage = memoryStorage();
    const { session, ids } = started(storage);
    const id = ids[0];
    let s = presented(session, id, 'e1').session;
    s = enemyHit(s, id).session;
    const hit = correctOrb(s, id);
    expect(hit.session.run?.run.remaining).not.toContain(id);
    expect(storage.writes).toHaveLength(1);
    expect(savedCard(storage, id)).toEqual(applyRating(undefined, 'again', DAY1));
  });

  it('a new presentation (new encounter) allows a new Again on an enemy hit', () => {
    const storage = memoryStorage();
    let now = DAY1;
    const { session, ids } = started(storage, () => now);
    const id = ids[0];
    let s = presented(session, id, 'e1').session;
    s = enemyHit(s, id).session;
    expect(storage.writes).toHaveLength(1);
    now = DAY2;
    s = presented(s, id, 'e2').session;
    const hit = enemyHit(s, id);
    expect(pips(hit.effects)).toEqual([3]);
    expect(storage.writes).toHaveLength(2);
    expect(savedCard(storage, id)).toEqual(applyRating(applyRating(undefined, 'again', DAY1), 'again', DAY2));
  });

  it('a new presentation after a wrong orb lets an enemy hit write a new Again', () => {
    const storage = memoryStorage();
    let now = DAY1;
    const { session, ids } = started(storage, () => now);
    const id = ids[0];
    let s = presented(session, id, 'e1').session;
    s = wrongOrb(s, id, wrongLabel(id)).session;
    now = DAY2;
    s = presented(s, id, 'e2').session;
    enemyHit(s, id);
    expect(storage.writes).toHaveLength(2);
  });

  it('the enemy hit that takes the last pip still writes its Again; later hits write nothing', () => {
    const storage = memoryStorage();
    const { session, ids } = started(storage);
    let s = session;
    for (const [i, id] of ids.slice(0, 4).entries()) {
      s = presented(s, id, `e${i}`).session;
      s = wrongOrb(s, id, wrongLabel(id)).session;
    }
    expect(storage.writes).toHaveLength(4);
    s = presented(s, ids[4], 'e4').session;
    const last = enemyHit(s, ids[4]);
    expect(pips(last.effects)).toEqual([0]);
    expect(storage.writes).toHaveLength(5);
    expect(savedCard(storage, ids[4])).toEqual(applyRating(undefined, 'again', DAY1));
    enemyHit(last.session, ids[5]);
    expect(storage.writes).toHaveLength(5);
  });

  it('no write when the save could not be read (readFailed), though the pip still drops', () => {
    const storage = throwingReadStorage();
    const { session, ids } = started(storage);
    const id = ids[0];
    const s = presented(session, id, 'e1').session;
    const hit = enemyHit(s, id);
    expect(pips(hit.effects)).toEqual([4]);
    expect(storage.writes).toEqual([]);
  });

  it('no write for a card not presented, no longer in play, or unknown', () => {
    const storage = memoryStorage();
    const { session, ids } = started(storage);
    let s = presented(session, ids[0], 'e1').session;
    for (const id of [ids[1], 'stranger']) {
      const r = enemyHit(s, id);
      expect(r.session, id).toBe(s);
    }
    expect(storage.writes).toEqual([]);
    s = correctOrb(s, ids[0]).session;
    expect(storage.writes).toHaveLength(1);
    const cleared = enemyHit(s, ids[0]);
    expect(cleared.session).toBe(s);
    expect(storage.writes).toHaveLength(1);
    expect(savedCard(storage, ids[0])).toEqual(applyRating(undefined, 'good', DAY1));
  });
});
