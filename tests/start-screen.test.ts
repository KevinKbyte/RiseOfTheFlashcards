// Requirement: the game opens on a start screen, not straight on deck select. The start screen
// shows a title, a Start button and a mastery summary built from the per-deck saved progress
// (plain words with deck titles, never bare deck ids; an empty save reads "no progress yet").
// Start goes to deck select, the mastery button goes to the mastery screen, and back from either
// returns to the start screen. A corrupt or unreadable save still shows the start screen and never
// throws. The view model is pure plain data so src/cards.ts only renders it.
//
// API contract for src/flashcards/start-screen.ts (pure, no three.js/DOM):
//   export type StartActionId = 'start' | 'mastery';
//   export interface StartAction { id: StartActionId; label: string }
//   export interface StartScreenView { title: string; actions: StartAction[]; masteryLines: string[] }
//   export function startScreenView(s: GameSession): StartScreenView | null; // null unless menu is 'start'
//   export function pressStart(s: GameSession): GameSession;   // start -> deck-select, else same object
//   export function pressMastery(s: GameSession): GameSession; // start -> mastery, else same object
//   export function pressBack(s: GameSession): GameSession;    // deck-select | mastery -> start
// Covers tags cite plan IDs (no spec-cache in this repo), as menu-flow/game-session tests do.
import { describe, expect, it } from 'vitest';
import {
  correctOrb,
  createSession,
  masteryText,
  presented,
  startRun,
  updateMenu,
  type GameSession,
  type SessionEffect,
} from '../src/flashcards/game-session.js';
import { selectDeck } from '../src/flashcards/menu-flow.js';
import type { Deck } from '../src/flashcards/deck-schema.js';
import type { SaveStorage } from '../src/flashcards/save.js';
import { pressBack, pressMastery, pressStart, startScreenView } from '../src/flashcards/start-screen.js';

// 10:00 local: well clear of the 04:00 study-day rollover.
const NOW = new Date(2026, 10, 7, 10, 0, 0);
const clock = () => NOW;
const SAVE_KEY = 'flashcards.fsrs.save';

function makeDeck(id: string, title: string, n: number): Deck {
  return {
    id,
    title,
    cards: Array.from({ length: n }, (_, i) => ({
      id: `${id}-c${i + 1}`,
      prompt: `Question number ${i + 1}?`,
      answer: `answer ${String.fromCharCode(97 + i)}`,
    })),
  };
}

const SPANISH = makeDeck('deck-es-01', 'Spanish Basics', 4);
const CAPITALS = makeDeck('deck-geo-02', 'World Capitals', 3);
const DECKS: readonly Deck[] = [SPANISH, CAPITALS];

function memoryStorage(initial?: string): SaveStorage {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SAVE_KEY, initial);
  return {
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

function throwingStorage(): SaveStorage {
  return {
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: () => {
      throw new Error('storage unavailable');
    },
  };
}

function fresh(storage: SaveStorage = memoryStorage()): GameSession {
  return createSession({ decks: DECKS, storage, clock });
}

function spawned(effects: readonly SessionEffect[]): string[] {
  const wave = effects.find((e): e is Extract<SessionEffect, { type: 'spawnWave' }> => e.type === 'spawnWave');
  return wave ? wave.cards.map((c) => c.id) : [];
}

/** Plays one correct answer on SPANISH so the storage holds real saved progress. */
function storageWithProgress(): SaveStorage {
  const storage = memoryStorage();
  const s = updateMenu(pressStart(fresh(storage)), (m) => selectDeck(m, SPANISH.id));
  const run = startRun(s);
  const first = spawned(run.effects)[0];
  correctOrb(presented(run.session, first, 'e1').session, first);
  return storage;
}

function hasBareId(text: string): boolean {
  return DECKS.some((d) => text.includes(d.id) || d.cards.some((c) => text.includes(c.id)));
}

// Covers: M11
describe('start screen comes before deck select', () => {
  it('a new session opens on the start screen, not deck select', () => {
    expect(fresh().menu.screen).toBe('start');
    expect(startScreenView(fresh())).not.toBeNull();
  });

  it('shows a title and a Start action', () => {
    const view = startScreenView(fresh());
    if (!view) throw new Error('no start view');
    expect(view.title.trim().length).toBeGreaterThan(0);
    expect(hasBareId(view.title)).toBe(false);
    const start = view.actions.find((a) => a.id === 'start');
    expect(start?.label).toBe('Start');
    expect(view.actions.map((a) => a.id)).toContain('mastery');
  });

  it('an empty save reads "no progress yet" in plain words', () => {
    const view = startScreenView(fresh());
    if (!view) throw new Error('no start view');
    expect(view.masteryLines.length).toBeGreaterThan(0);
    expect(view.masteryLines.join(' ').toLowerCase()).toContain('no progress yet');
    expect(view.masteryLines.some(hasBareId)).toBe(false);
  });

  it('saved progress shows per-deck mastery by deck title, not "no progress yet"', () => {
    const s = fresh(storageWithProgress());
    const view = startScreenView(s);
    if (!view) throw new Error('no start view');
    const spanishRow = masteryText(s).find((t) => t.startsWith(`${SPANISH.title}:`));
    expect(spanishRow).toBeDefined();
    expect(view.masteryLines).toContain(spanishRow);
    expect(view.masteryLines.join(' ').toLowerCase()).not.toContain('no progress yet');
    expect(view.masteryLines.some(hasBareId)).toBe(false);
  });

  it('is null when the menu is not on the start screen', () => {
    expect(startScreenView(pressStart(fresh()))).toBeNull();
    expect(startScreenView(pressMastery(fresh()))).toBeNull();
  });
});

// Covers: M11
describe('start screen navigation', () => {
  it('Start goes to deck select', () => {
    expect(pressStart(fresh()).menu.screen).toBe('deck-select');
  });

  it('the mastery action goes to the mastery screen', () => {
    expect(pressMastery(fresh()).menu.screen).toBe('mastery');
  });

  it('back from deck select or mastery returns to the start screen', () => {
    const fromDecks = pressBack(pressStart(fresh()));
    expect(fromDecks.menu.screen).toBe('start');
    expect(startScreenView(fromDecks)).not.toBeNull();
    expect(pressBack(pressMastery(fresh())).menu.screen).toBe('start');
  });

  it('Start and mastery do nothing off the start screen', () => {
    const decks = pressStart(fresh());
    expect(pressStart(decks)).toBe(decks);
    expect(pressMastery(decks)).toBe(decks);
  });

  it('never mutates the session it is given', () => {
    const s = fresh();
    const before = JSON.stringify(s);
    pressStart(s);
    pressMastery(s);
    pressBack(pressStart(s));
    startScreenView(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

// Covers: M11
describe('start screen with a bad save', () => {
  it('a corrupt save still shows the start screen without throwing', () => {
    for (const raw of ['{not json', '[]', '{"version":999,"decks":"x"}', '\u0000']) {
      const s = fresh(memoryStorage(raw));
      expect(s.menu.screen).toBe('start');
      let view: ReturnType<typeof startScreenView> = null;
      expect(() => {
        view = startScreenView(s);
      }).not.toThrow();
      expect(view).not.toBeNull();
      expect(view!.actions.map((a) => a.id)).toContain('start');
      expect(view!.masteryLines.length).toBeGreaterThan(0);
    }
  });

  it('an unreadable storage still shows the start screen without throwing', () => {
    const s = fresh(throwingStorage());
    expect(() => startScreenView(s)).not.toThrow();
    const view = startScreenView(s);
    expect(view?.actions.find((a) => a.id === 'start')?.label).toBe('Start');
    expect(view?.masteryLines.length).toBeGreaterThan(0);
    expect(pressStart(s).menu.screen).toBe('deck-select');
  });
});
