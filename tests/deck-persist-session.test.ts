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
import { MAX_CARDS, MAX_FIELD_CHARS, MAX_ID_CHARS } from '../src/flashcards/deck-schema.js';
import {
  DECK_STORE_BACKUP_KEY,
  DECK_STORE_KEY,
  DECK_STORE_VERSION,
  MAX_DECK_STORE_CHARS,
  readDecks,
} from '../src/flashcards/deck-store.js';
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

function mem(initial: Record<string, string> = {}): MemStorage {
  const data = new Map(Object.entries(initial));
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

function stored(decks: Deck[]): string {
  return JSON.stringify({ version: DECK_STORE_VERSION, decks });
}

/** A max-size deck: MAX_CARDS cards with max-length id/prompt/answer. */
function hugeDeck(tag: string): Deck {
  const pad = (s: string, n: number) => s + 'x'.repeat(Math.max(0, n - s.length));
  return {
    id: tag,
    title: `Huge ${tag}`,
    cards: Array.from({ length: MAX_CARDS }, (_, i) => ({
      id: pad(`${tag}-${i}-`, MAX_ID_CHARS),
      prompt: pad(`Prompt ${i} `, MAX_FIELD_CHARS),
      answer: pad(`Answer ${i} `, MAX_FIELD_CHARS),
    })),
  };
}

// Requirement: the stored deck list may hold two decks with the same id (localStorage is
// user-editable). The menu then shows that id exactly once, using the LAST stored deck with it,
// so deck ids in the menu are always unique.
// Covers: M11, A10, S2
describe('duplicate stored deck ids', () => {
  it('an imported id stored twice shows once, last wins', () => {
    const storage = mem({ [DECK_STORE_KEY]: stored([importedDeck('dup', 'First'), importedDeck('dup', 'Second')]) });
    const s = session(storage);
    expect(s.menu.decks.filter((d) => d.id === 'dup')).toHaveLength(1);
    expect(deckById(s, 'dup')?.title).toBe('Second');
    expect(s.menu.decks).toHaveLength(STARTER_DECKS.length + 1);
  });

  it('a starter id stored twice replaces the starter once, last wins', () => {
    const first = { ...REPLACEMENT, title: 'First Replacement' };
    const storage = mem({ [DECK_STORE_KEY]: stored([first, REPLACEMENT]) });
    const s = session(storage);
    expect(s.menu.decks.filter((d) => d.id === STARTER.id)).toHaveLength(1);
    expect(deckById(s, STARTER.id)).toEqual(REPLACEMENT);
    expect(s.menu.decks).toHaveLength(STARTER_DECKS.length);
  });

  it('menu deck ids are unique', () => {
    const storage = mem({
      [DECK_STORE_KEY]: stored([importedDeck('a', 'A1'), REPLACEMENT, importedDeck('a', 'A2'), REPLACEMENT]),
    });
    const ids = session(storage).menu.decks.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// Requirement: a deck-store save failure is visible, not swallowed. The session exposes
// deckSaveError: null when the last deck save succeeded (and on a fresh session), 'too-large'
// when the imported decks exceed the store cap, and 'failed' when storage threw or the backup
// slot was already full so the live payload could not be replaced. A later successful save
// clears it back to null. The import itself still works in memory.
// Covers: M11, A10, S2
describe('deck save failures are surfaced on the session', () => {
  it('a fresh session has no save error', () => {
    expect(session(mem()).deckSaveError).toBeNull();
  });

  it('a successful save leaves deckSaveError null', () => {
    expect(imported(session(mem()), importedDeck('mine', 'Mine')).deckSaveError).toBeNull();
  });

  it('decks over the store cap report too-large and stay in memory', () => {
    const huge: Deck[] = [];
    while (stored(huge).length <= MAX_DECK_STORE_CHARS) huge.push(hugeDeck(`h${huge.length}`));
    const s = updateMenu(session(mem()), (m) => ({ ...m, decks: [...m.decks, ...huge] }));
    expect(s.deckSaveError).toBe('too-large');
    expect(s.menu.decks).toHaveLength(STARTER_DECKS.length + huge.length);
  });

  it('a throwing setItem reports failed, and the import still works in memory', () => {
    const base = mem();
    const storage = {
      ...base,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    const s = imported(createSession({ decks: STARTER_DECKS, storage, clock }), importedDeck('mine', 'Mine'));
    expect(s.deckSaveError).toBe('failed');
    expect(deckById(s, 'mine')).toEqual(importedDeck('mine', 'Mine'));
  });

  it('a full backup slot over an unreadable live payload reports failed', () => {
    const storage = mem({ [DECK_STORE_KEY]: '{second corrupt', [DECK_STORE_BACKUP_KEY]: '{first corrupt' });
    const s = imported(session(storage), importedDeck('mine', 'Mine'));
    expect(s.deckSaveError).toBe('failed');
    expect(storage.data.get(DECK_STORE_KEY)).toBe('{second corrupt');
  });

  it('a later successful save clears the error', () => {
    const base = mem();
    let fail = true;
    const storage = {
      ...base,
      setItem: (k: string, v: string) => {
        if (fail) throw new Error('quota exceeded');
        base.setItem(k, v);
      },
    };
    const failed = imported(createSession({ decks: STARTER_DECKS, storage, clock }), importedDeck('one', 'One'));
    expect(failed.deckSaveError).toBe('failed');
    fail = false;
    const ok = imported(failed, importedDeck('two', 'Two'));
    expect(ok.deckSaveError).toBeNull();
    expect(deckById(session(base), 'two')).toEqual(importedDeck('two', 'Two'));
  });
});

// Requirement: a menu change that leaves the deck list equal in content to the current one (a new
// array with the same decks) does not write the deck store: storage.setItem is not called.
// Covers: M11, A10, S2
describe('no redundant deck-store write', () => {
  it('an equal-content starter list does not call setItem', () => {
    const storage = mem();
    updateMenu(session(storage), (m) => ({ ...m, decks: m.decks.map((d) => ({ ...d })) }));
    expect(storage.sets).toEqual([]);
  });

  it('an equal-content list with a stored import does not call setItem', () => {
    const storage = mem({ [DECK_STORE_KEY]: stored([importedDeck('mine', 'Mine')]) });
    updateMenu(session(storage), (m) => ({ ...m, decks: [...m.decks] }));
    expect(storage.sets).toEqual([]);
  });

  it('a changed list still writes', () => {
    const storage = mem();
    imported(session(storage), importedDeck('mine', 'Mine'));
    expect(storage.sets).toContain(DECK_STORE_KEY);
  });
});

// Requirement: the deck store is read once per page. createSession accepts an optional preloaded
// read (SessionEnv.storedDecks, a readDecks result); given one it does not read DECK_STORE_KEY
// again, so every session built from that read agrees on the deck list. If that shared read
// failed (readFailed: true), NO session built from it writes the deck store, even when storage
// would read fine now.
// Covers: M11, A10, S2
describe('one shared deck-store read per page', () => {
  function counting(initial: Record<string, string> = {}) {
    const base = mem(initial);
    const reads: string[] = [];
    return {
      ...base,
      reads,
      getItem: (k: string) => {
        reads.push(k);
        return base.getItem(k);
      },
    };
  }

  it('sessions built from a preloaded read do not re-read the deck store', () => {
    const storage = counting({ [DECK_STORE_KEY]: stored([importedDeck('mine', 'Mine')]) });
    const storedDecks = readDecks(storage);
    storage.reads.length = 0;
    createSession({ decks: STARTER_DECKS, storage, clock, storedDecks });
    createSession({ decks: STARTER_DECKS, storage, clock, storedDecks });
    expect(storage.reads.filter((k) => k === DECK_STORE_KEY)).toEqual([]);
  });

  it('two sessions from the same read agree even if storage changed in between', () => {
    const storage = mem({ [DECK_STORE_KEY]: stored([importedDeck('mine', 'Mine')]) });
    const storedDecks = readDecks(storage);
    const a = createSession({ decks: STARTER_DECKS, storage, clock, storedDecks });
    storage.data.set(DECK_STORE_KEY, stored([importedDeck('other', 'Other')]));
    const b = createSession({ decks: STARTER_DECKS, storage, clock, storedDecks });
    expect(b.menu.decks).toEqual(a.menu.decks);
    expect(deckById(b, 'mine')).toEqual(importedDeck('mine', 'Mine'));
    expect(deckById(b, 'other')).toBeUndefined();
  });

  it('a failed shared read stops every session from writing the deck store', () => {
    const storage = mem({ [DECK_STORE_KEY]: stored([importedDeck('unseen', 'Unseen')]) });
    const storedDecks = { decks: [], readFailed: true };
    const a = createSession({ decks: STARTER_DECKS, storage, clock, storedDecks });
    const b = createSession({ decks: STARTER_DECKS, storage, clock, storedDecks });
    imported(a, importedDeck('one', 'One'));
    imported(b, importedDeck('two', 'Two'));
    expect(storage.sets.filter((k) => k === DECK_STORE_KEY)).toEqual([]);
    expect(readDecks(storage).decks.map((d) => d.id)).toEqual(['unseen']);
  });
});
