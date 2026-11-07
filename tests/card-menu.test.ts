// Requirement: the in-headset menu heading tracks where the player is. After a run ends the deck
// select screen is titled "Play again?", but once the player goes Back to the start screen that
// replay heading is spent: pressing Start again opens deck select under the start title, never a
// stale "Play again?". The heading carried between menu presses is computed by a pure helper so
// src/cards.ts only stores and renders it.
//
// API contract for src/card-menu.ts (pure, no three.js/DOM):
//   export function menuHeadingAfterNav(heading: string, s: GameSession): string;
//     // s is the session AFTER a nav press; on the start screen it resets to START_TITLE,
//     // otherwise it returns `heading` unchanged.
// Covers tags cite plan IDs (no spec-cache in this repo), as start-screen tests do.
// Covers: M11
import { describe, expect, it } from 'vitest';
import { menuHeadingAfterNav, menuLayout } from '../src/card-menu.js';
import { createSession, updateMenu, type GameSession } from '../src/flashcards/game-session.js';
import { backToStart, openDeckSelect } from '../src/flashcards/menu-flow.js';
import type { Deck } from '../src/flashcards/deck-schema.js';
import type { SaveStorage } from '../src/flashcards/save.js';
import { pressBack, pressMastery, pressStart, START_TITLE } from '../src/flashcards/start-screen.js';

const NOW = new Date(2026, 10, 7, 10, 0, 0);
const REPLAY = 'Play again?';

function makeDeck(id: string, title: string): Deck {
  return {
    id,
    title,
    cards: Array.from({ length: 4 }, (_, i) => ({ id: `${id}-c${i}`, prompt: `Q${i}?`, answer: `a${i}` })),
  };
}

const DECKS: readonly Deck[] = [makeDeck('deck-a', 'Deck A'), makeDeck('deck-b', 'Deck B')];

function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

function fresh(): GameSession {
  return createSession({ decks: DECKS, storage: memoryStorage(), clock: () => NOW });
}

/** The menu state cards.ts endRun leaves behind: deck select after a run. */
function afterRun(): GameSession {
  return updateMenu(fresh(), (m) => openDeckSelect(backToStart(m)));
}

/** Applies a nav press the way cards.ts does, carrying the heading through the helper. */
function nav(s: GameSession, heading: string, press: (s: GameSession) => GameSession) {
  const next = press(s);
  return { s: next, heading: menuHeadingAfterNav(heading, next) };
}

describe('menu heading after replay', () => {
  it('deck select after a run is titled "Play again?"', () => {
    expect(menuLayout(afterRun(), REPLAY).lines[0]).toBe(REPLAY);
  });

  it('replay -> Back -> Start shows the start title on deck select, not "Play again?"', () => {
    const back = nav(afterRun(), REPLAY, pressBack);
    expect(back.s.menu.screen).toBe('start');
    const start = nav(back.s, back.heading, pressStart);
    expect(start.s.menu.screen).toBe('deck-select');
    const lines = menuLayout(start.s, start.heading).lines;
    expect(lines[0]).toBe(START_TITLE);
    expect(lines).not.toContain(REPLAY);
  });

  it('replay -> Back -> Mastery -> Back -> Start also shows the start title', () => {
    let step = nav(afterRun(), REPLAY, pressBack);
    step = nav(step.s, step.heading, pressMastery);
    step = nav(step.s, step.heading, pressBack);
    step = nav(step.s, step.heading, pressStart);
    expect(step.s.menu.screen).toBe('deck-select');
    expect(menuLayout(step.s, step.heading).lines[0]).toBe(START_TITLE);
  });

  it('keeps the heading when the press lands off the start screen', () => {
    const decks = pressStart(fresh());
    expect(menuHeadingAfterNav(REPLAY, decks)).toBe(REPLAY);
    expect(menuHeadingAfterNav(REPLAY, pressMastery(fresh()))).toBe(REPLAY);
  });

  it('resets to the start title whenever the press lands on the start screen', () => {
    expect(menuHeadingAfterNav(REPLAY, fresh())).toBe(START_TITLE);
    expect(menuHeadingAfterNav('anything', pressBack(pressStart(fresh())))).toBe(START_TITLE);
  });
});

// Requirement: action orbs (Start, Mastery, Back) look different from deck orbs so the player can
// tell navigation from "start a run with this deck". Every menu pick carries a plain-data
// orbKind ('action' | 'deck') that src/cards.ts passes to the panel for styling.
//
// API contract for src/card-menu.ts:
//   MenuLayout.picks[i].orbKind: 'action' | 'deck'
// Covers: M11
describe('menu orb kinds', () => {
  it('Start and Mastery on the start screen are action orbs', () => {
    const { picks } = menuLayout(fresh(), START_TITLE);
    expect(picks.map((p) => p.label)).toEqual(['Start', 'Mastery']);
    expect(picks.map((p) => p.orbKind)).toEqual(['action', 'action']);
  });

  it('Back on the mastery screen is an action orb', () => {
    const { picks } = menuLayout(pressMastery(fresh()), START_TITLE);
    expect(picks.map((p) => [p.label, p.orbKind])).toEqual([['Back', 'action']]);
  });

  it('deck select: every deck is a deck orb and Back is an action orb', () => {
    const { picks } = menuLayout(pressStart(fresh()), START_TITLE);
    expect(picks.map((p) => [p.label, p.orbKind])).toEqual([
      ['Deck A', 'deck'],
      ['Deck B', 'deck'],
      ['Back', 'action'],
    ]);
  });

  it('orbKind agrees with the pick: deck picks are deck orbs, nav picks are action orbs', () => {
    for (const s of [fresh(), pressMastery(fresh()), pressStart(fresh()), afterRun()]) {
      for (const p of menuLayout(s, REPLAY).picks) {
        expect(p.orbKind).toBe(p.pick.kind === 'deck' ? 'deck' : 'action');
      }
    }
  });
});
