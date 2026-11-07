// Requirement: a deck imported in the menu is still there after a page reload. At the game-session
// level (src/flashcards/game-session.ts, the pure glue the scene drives), any menu change that adds
// or replaces a deck persists the imported decks through deck-store on the session's injected
// storage; a new session on the same storage (a reload) shows the bundled starter decks plus every
// imported deck in the menu deck list. Replacing a starter deck by id persists the replacement, so
// after reload that id plays the replacement's cards and per-deck FSRS progress (decks.<deckId>)
// lines up with them. Undo of a replace persists too: after Undo + reload the deck list matches the
// pre-replace state. If reading the stored decks threw, the session never writes the deck store
// (it would clobber decks it could not see); with every read throwing, nothing is written at all,
// but the import still works in memory.
// Covers: M11, A10, S2
// (Plan IDs, as the other import/menu tests cite; this repo has no .claude/spec-cache.)
import { describe, expect, it } from 'vitest';
import {
  correctOrb,
  createSession,
  masteryRows,
  presented,
  startRun,
  updateMenu,
  type GameSession,
  type SessionEffect,
} from '../src/flashcards/game-session.js';
import {
  confirmReplace,
  deckOptions,
  openDeckSelect,
  openImport,
  selectDeck,
  setImportText,
  submitImport,
  undoReplace,
} from '../src/flashcards/menu-flow.js';
import type { Deck, DeckCard } from '../src/flashcards/deck-schema.js';
import { STARTER_DECKS } from '../src/flashcards/starter-decks.js';

const NOW = new Date(2026, 10, 7, 10, 0, 0);
const clock = () => NOW;

interface MemStorage {
  data: Map<string, string>;
  sets: string[];
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function mem(): MemStorage {
  const data = new Map<string, string>();
  const sets: string[] = [];
  return {
    data,
    sets,
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      sets.push(k);
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

function card(id: string, n: number): DeckCard {
  return { id, prompt: `Imported prompt ${n}?`, answer: `Imported answer ${n}` };
}

function importedDeck(id: string, title: string): Deck {
  return { id, title, cards: [card(`${id}-1`, 1), card(`${id}-2`, 2), card(`${id}-3`, 3), card(`${id}-4`, 4)] };
}

const STARTER = STARTER_DECKS[0];
const REPLACEMENT: Deck = {
  id: STARTER.id,
  title: 'My Own Capitals',
  cards: [card('r1', 1), card('r2', 2), card('r3', 3), card('r4', 4)],
};

function session(storage: MemStorage): GameSession {
  return createSession({ decks: STARTER_DECKS, storage, clock });
}

function imported(s: GameSession, deck: Deck): GameSession {
  return updateMenu(s, (m) => submitImport(setImportText(openImport(openDeckSelect(m)), JSON.stringify(deck))));
}

function deckById(s: GameSession, id: string): Deck | undefined {
  return s.menu.decks.find((d) => d.id === id);
}

function spawnedIds(effects: readonly SessionEffect[]): string[] {
  const wave = effects.find((e): e is Extract<SessionEffect, { type: 'spawnWave' }> => e.type === 'spawnWave');
  return wave ? wave.cards.map((c) => c.id) : [];
}

describe('imported decks survive reload', () => {
  it('reload shows every starter deck plus the imported deck', () => {
    const storage = mem();
    const s = imported(session(storage), importedDeck('mine', 'My Deck'));
    expect(s.menu.selectedDeck?.id).toBe('mine');

    const reloaded = session(storage);
    const ids = deckOptions(reloaded.menu).map((o) => o.id);
    for (const starter of STARTER_DECKS) expect(ids).toContain(starter.id);
    expect(ids).toContain('mine');
    expect(deckById(reloaded, 'mine')).toEqual(importedDeck('mine', 'My Deck'));
  });

  it('reload restores several imported decks', () => {
    const storage = mem();
    imported(imported(session(storage), importedDeck('one', 'One')), importedDeck('two', 'Two'));
    const reloaded = session(storage);
    expect(deckById(reloaded, 'one')).toEqual(importedDeck('one', 'One'));
    expect(deckById(reloaded, 'two')).toEqual(importedDeck('two', 'Two'));
    expect(reloaded.menu.decks).toHaveLength(STARTER_DECKS.length + 2);
  });

  it('a restored imported deck is selectable and playable after reload', () => {
    const storage = mem();
    imported(session(storage), importedDeck('mine', 'My Deck'));
    const reloaded = updateMenu(updateMenu(session(storage), openDeckSelect), (m) => selectDeck(m, 'mine'));
    expect(reloaded.menu.selectedDeck?.id).toBe('mine');
    const ids = spawnedIds(startRun(reloaded).effects);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith('mine-')).toBe(true);
  });

  it('a __proto__ deck id is restored like any other', () => {
    const storage = mem();
    imported(session(storage), importedDeck('__proto__', 'Proto'));
    expect(deckById(session(storage), '__proto__')).toEqual(importedDeck('__proto__', 'Proto'));
    expect(({} as Record<string, unknown>).cards).toBeUndefined();
  });

  it('with no stored decks, a fresh session lists exactly the starters', () => {
    expect(session(mem()).menu.decks).toEqual(STARTER_DECKS);
  });
});

describe('replacing a starter deck persists', () => {
  function replaced(storage: MemStorage): GameSession {
    const asking = imported(session(storage), REPLACEMENT);
    expect(asking.menu.screen).toBe('confirm-replace');
    return updateMenu(asking, confirmReplace);
  }

  it('after reload the starter id has the replacement cards and title', () => {
    const storage = mem();
    replaced(storage);
    const reloaded = session(storage);
    expect(deckById(reloaded, STARTER.id)).toEqual(REPLACEMENT);
    expect(reloaded.menu.decks.filter((d) => d.id === STARTER.id)).toHaveLength(1);
    expect(reloaded.menu.decks).toHaveLength(STARTER_DECKS.length);
  });

  it('per-deck progress after reload counts against the replacement cards', () => {
    const storage = mem();
    const ready = updateMenu(updateMenu(replaced(storage), openDeckSelect), (m) => selectDeck(m, STARTER.id));
    const run = startRun(ready);
    const [first] = spawnedIds(run.effects);
    expect(['r1', 'r2', 'r3', 'r4']).toContain(first);
    const shown = presented(run.session, first, 'enc-1').session;
    correctOrb(shown, first);

    const row = masteryRows(session(storage)).find((r) => r.deckId === STARTER.id);
    expect(row?.title).toBe(REPLACEMENT.title);
    expect((row?.newCount ?? 0) + (row?.learningCount ?? 0) + (row?.masteredCount ?? 0)).toBe(4);
    expect(row?.newCount).toBe(3);
  });

  it('undo of a replace persists: after reload the deck list matches the pre-replace state', () => {
    const storage = mem();
    const before = session(storage).menu.decks;
    const undone = updateMenu(replaced(storage), undoReplace);
    expect(undone.menu.decks).toEqual(before);
    expect(session(storage).menu.decks).toEqual(before);
  });

  it('undo of replacing an imported deck restores the original imported deck after reload', () => {
    const storage = mem();
    const original = importedDeck('mine', 'Original');
    const s = imported(session(storage), original);
    const replacement = { ...importedDeck('mine', 'Second'), cards: [card('n1', 5), card('n2', 6), card('n3', 7), card('n4', 8)] };
    const confirmed = updateMenu(imported(s, replacement), confirmReplace);
    expect(deckById(session(storage), 'mine')).toEqual(replacement);
    updateMenu(confirmed, undoReplace);
    expect(deckById(session(storage), 'mine')).toEqual(original);
  });
});

describe('deck persistence when storage reads fail', () => {
  it('never writes the deck store after a failed read, but the import works in memory', () => {
    const sets: string[] = [];
    const storage = {
      data: new Map<string, string>(),
      sets,
      getItem: (): string | null => {
        throw new Error('storage unavailable');
      },
      setItem: (k: string) => void sets.push(k),
      removeItem: () => undefined,
    };
    const s = imported(createSession({ decks: STARTER_DECKS, storage, clock }), importedDeck('mine', 'My Deck'));
    expect(deckById(s, 'mine')).toEqual(importedDeck('mine', 'My Deck'));
    expect(sets).toEqual([]);
  });
});
