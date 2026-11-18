// Requirement: finishing one deck must never leave every deck unplayable (user report, 2026-11-18:
// "I got stuck clicking on any deck after completing one (eg. Opposites), clicking on other decks
// afterwards doesn't do anything"). The FSRS daily New-card budget (DAILY_NEW_LIMIT = 12) is shared
// by all decks, so after one 12-card run every deck's FSRS queue is empty. When the queue is empty
// and the selected deck has cards, game-session startRun starts a practice replay over the deck's
// first RUN_CARD_CAP (12) cards in deck order as a normal active run: spawnWave carries those cards,
// a 'pips' effect is emitted and NO endScreen is emitted at start. Clearing every replay card and
// then the wave is a WIN. This holds for another deck, for the same deck replayed, and for a fresh
// session on the same storage later the same day. FSRS grading is unchanged.
// Covers tags cite plan IDs (no spec-cache in this repo).
import { describe, expect, it } from 'vitest';
import {
  correctOrb,
  createSession,
  presented,
  startRun,
  updateMenu,
  waveCleared,
  type GameSession,
  type SessionEffect,
  type SessionStep,
} from '../src/flashcards/game-session.js';
import { backToStart, openDeckSelect, selectDeck } from '../src/flashcards/menu-flow.js';
import type { Deck } from '../src/flashcards/deck-schema.js';
import type { SaveStorage } from '../src/flashcards/save.js';

// 10:00 local: well clear of the 04:00 study-day rollover.
const NOW = new Date(2026, 10, 7, 10, 0, 0);
const clock = () => NOW;

function makeDeck(id: string, title: string, n: number): Deck {
  return {
    id,
    title,
    cards: Array.from({ length: n }, (_, i) => ({
      id: `${id}-${i + 1}`,
      prompt: `${title} question ${i + 1}?`,
      answer: `${id} answer ${String.fromCharCode(97 + i)}`,
    })),
  };
}

const DECK1 = makeDeck('one', 'Deck One', 12);
const DECK2 = makeDeck('two', 'Deck Two', 12);
const DECKS: readonly Deck[] = [DECK1, DECK2];

function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

function spawned(effects: readonly SessionEffect[]): string[] | null {
  const wave = effects.find((e): e is Extract<SessionEffect, { type: 'spawnWave' }> => e.type === 'spawnWave');
  return wave ? wave.cards.map((c) => c.id) : null;
}

function endScreens(effects: readonly SessionEffect[]) {
  return effects.filter((e): e is Extract<SessionEffect, { type: 'endScreen' }> => e.type === 'endScreen');
}

function pips(effects: readonly SessionEffect[]): number[] {
  return effects.flatMap((e) => (e.type === 'pips' ? [e.remaining] : []));
}

function select(s: GameSession, deckId: string): GameSession {
  return updateMenu(updateMenu(s, openDeckSelect), (m) => selectDeck(m, deckId));
}

/** The scene's path from an end screen back to choosing a deck (src/cards.ts endRun). */
function backToDeckSelect(s: GameSession, deckId: string): GameSession {
  const menu = updateMenu(s, (m) => openDeckSelect(backToStart(m)));
  return updateMenu(menu, (m) => selectDeck(m, deckId));
}

/** Presents and correctly answers every spawned card, then clears the wave. */
function clearAll(step: SessionStep): SessionStep {
  const ids = spawned(step.effects) ?? [];
  let s = step.session;
  ids.forEach((id, i) => {
    s = presented(s, id, `e-${id}-${i}`).session;
    s = correctOrb(s, id).session;
  });
  return waveCleared(s);
}

/** A session in which deck 1 has just been completed with a win. */
function completedDeck1(storage: SaveStorage): GameSession {
  const first = startRun(select(createSession({ decks: DECKS, storage, clock }), DECK1.id));
  expect(spawned(first.effects)).toHaveLength(12);
  const end = clearAll(first);
  expect(endScreens(end.effects).map((e) => e.kind)).toEqual(['win']);
  return end.session;
}

function expectReplayStart(step: SessionStep, deck: Deck): void {
  expect(spawned(step.effects)).toEqual(deck.cards.slice(0, 12).map((c) => c.id));
  expect(pips(step.effects)).toEqual([5]);
  expect(endScreens(step.effects)).toEqual([]);
  expect(step.session.run?.run.status).toBe('active');
  expect(step.session.menu.screen).toBe('playing');
}

// Covers: M11, D5
describe('game-session: decks stay playable after the daily new-card budget is spent', () => {
  it('after completing deck 1, starting deck 2 is an active 12-card run with pips and no end screen', () => {
    const s = completedDeck1(memoryStorage());
    const step = startRun(backToDeckSelect(s, DECK2.id));
    expectReplayStart(step, DECK2);
  });

  it('replaying deck 1 right after completing it is an active 12-card run with pips and no end screen', () => {
    const s = completedDeck1(memoryStorage());
    const step = startRun(backToDeckSelect(s, DECK1.id));
    expectReplayStart(step, DECK1);
  });

  it('a fresh session on the same storage the same day can start deck 2 without an immediate end screen', () => {
    const storage = memoryStorage();
    completedDeck1(storage);
    const reloaded = createSession({ decks: DECKS, storage, clock });
    const step = startRun(select(reloaded, DECK2.id));
    expectReplayStart(step, DECK2);
  });

  it('the practice replay can be won: clearing every card then the wave shows a win', () => {
    const s = completedDeck1(memoryStorage());
    const step = startRun(backToDeckSelect(s, DECK1.id));
    expect(spawned(step.effects)).toHaveLength(12);
    const end = clearAll(step);
    const ends = endScreens(end.effects);
    expect(ends.map((e) => e.kind)).toEqual(['win']);
    expect(ends[0].text.trim().length).toBeGreaterThan(0);
  });
});
