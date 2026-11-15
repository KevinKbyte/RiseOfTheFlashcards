// Requirement: import text is size-capped like save data (MAX_IMPORT_CHARS = 1,000,000 chars, the
// same limit as MAX_SAVE_CHARS in save.ts). Text longer than the cap is rejected BEFORE JSON.parse
// with a plain-words error saying it is too large; the menu stays on 'import' and no deck is added.
// Text of exactly the cap is not rejected for size.
// Covers: M11, A10
import { describe, expect, it } from 'vitest';
import {
  cancelReplace,
  confirmReplace,
  createMenu,
  dedupeConfirm,
  dedupeContinue,
  dedupeKeepFirst,
  dedupeRequestConfirm,
  MAX_IMPORT_CHARS,
  MAX_IMPORTED_DECKS,
  openDeckSelect,
  openImport,
  replaceView,
  selectDeck,
  setImportText,
  submitImport,
  undoReplace,
} from '../src/flashcards/menu-flow.js';
import type { MenuState } from '../src/flashcards/menu-flow.js';
import type { Deck, DeckCard } from '../src/flashcards/deck-schema.js';
import { MAX_SAVE_CHARS } from '../src/flashcards/save.js';
import { STARTER_DECKS } from '../src/flashcards/starter-decks.js';

function c(id: string, n: number): DeckCard {
  return { id, prompt: `Prompt ${n}?`, answer: `Answer ${n}` };
}

function deckJson(id: string, title: string): string {
  return JSON.stringify({ id, title, cards: [c('w', 10), c('x', 11), c('y', 12), c('z', 13)] });
}

function padTo(json: string, length: number): string {
  return json + ' '.repeat(length - json.length);
}

function importing(text: string): MenuState {
  return setImportText(openImport(openDeckSelect(createMenu())), text);
}

describe('menu-flow import size cap', () => {
  it('uses the same 1,000,000-char cap as save data', () => {
    expect(MAX_IMPORT_CHARS).toBe(1_000_000);
    expect(MAX_IMPORT_CHARS).toBe(MAX_SAVE_CHARS);
  });

  it('rejects otherwise-valid deck text one char over the cap, stays on import, adds no deck', () => {
    const before = importing(padTo(deckJson('mine', 'My Deck'), MAX_IMPORT_CHARS + 1));
    const s = submitImport(before);
    expect(s.screen).toBe('import');
    expect(s.importError).toMatch(/too large/i);
    expect(s.decks).toEqual(before.decks);
    expect(s.selectedDeck).toBeNull();
  });

  it('accepts deck text of exactly the cap', () => {
    const s = submitImport(importing(padTo(deckJson('mine', 'My Deck'), MAX_IMPORT_CHARS)));
    expect(s.screen).toBe('ready');
    expect(s.selectedDeck?.id).toBe('mine');
  });

  it('rejects oversized non-JSON text with the size error, not the JSON error', () => {
    const s = submitImport(importing('x'.repeat(MAX_IMPORT_CHARS + 1)));
    expect(s.screen).toBe('import');
    expect(s.importError).toMatch(/too large/i);
  });
});

// Requirement: importing a deck whose id matches an existing deck (starter or previously imported)
// never silently replaces it. The menu opens a 'confirm-replace' step naming the existing deck by
// title (replaceView). Cancel returns to 'import' with the existing deck unchanged and nothing
// added. Confirm replaces the existing deck with the new one, selects it, and goes to 'ready'; an
// Undo (undoReplace) is then offered that restores the previous deck list and previous selection
// exactly and returns to 'deck-select'. The same clash check applies when the deck arrives via the
// dedupe Continue path. Non-clashing imports are unchanged (straight to 'ready').
// Covers: M11, A10
describe('menu-flow import replace confirm', () => {
  function atReplace(): { before: MenuState; s: MenuState } {
    const before = importing(deckJson('opposites', 'My Opposites'));
    return { before, s: submitImport(before) };
  }

  it('a clash with a starter deck opens confirm-replace naming the existing deck, nothing replaced yet', () => {
    const { before, s } = atReplace();
    expect(s.screen).toBe('confirm-replace');
    expect(replaceView(s)?.existingTitle).toBe('Opposites');
    expect(s.decks).toEqual(before.decks);
  });

  it('Cancel keeps the existing deck unchanged, adds nothing, and returns to import', () => {
    const { before, s } = atReplace();
    const cancelled = cancelReplace(s);
    expect(cancelled.screen).toBe('import');
    expect(cancelled.decks).toEqual(before.decks);
    expect(cancelled.decks.find((d) => d.id === 'opposites')?.title).toBe('Opposites');
    expect(cancelled.selectedDeck).toBeNull();
  });

  it('Confirm replaces the existing deck with the new one, selects it, and goes to ready', () => {
    const s = confirmReplace(atReplace().s);
    expect(s.screen).toBe('ready');
    expect(s.selectedDeck?.title).toBe('My Opposites');
    const matching = s.decks.filter((d) => d.id === 'opposites');
    expect(matching).toHaveLength(1);
    expect(matching[0].title).toBe('My Opposites');
    expect(s.decks).toHaveLength(STARTER_DECKS.length);
  });

  it('Undo after confirm restores the previous deck list and previous selection exactly', () => {
    // Previous selection is the clashing starter deck itself, picked before opening import.
    const priorReady = selectDeck(openDeckSelect(createMenu()), 'opposites');
    const before = setImportText(openImport(openDeckSelect(priorReady)), deckJson('opposites', 'Mine'));
    const replaced = confirmReplace(submitImport(before));
    expect(replaced.selectedDeck?.title).toBe('Mine');
    const undone = undoReplace(replaced);
    expect(undone.screen).toBe('deck-select');
    expect(undone.decks).toEqual(before.decks);
    expect(undone.selectedDeck).toEqual(before.selectedDeck);
    expect(undone.selectedDeck?.title).toBe('Opposites');
  });

  it('Undo is a no-op when nothing was replaced', () => {
    const clean = submitImport(importing(deckJson('mine', 'My Deck')));
    expect(undoReplace(clean)).toBe(clean);
    const start = createMenu();
    expect(undoReplace(start)).toBe(start);
  });

  it('confirm/cancel are ignored off the confirm-replace screen', () => {
    const s = importing(deckJson('mine', 'My Deck'));
    expect(confirmReplace(s)).toBe(s);
    expect(cancelReplace(s)).toBe(s);
    expect(replaceView(s)).toBeNull();
  });

  it('a clash with a previously imported deck also asks first, and Confirm replaces it', () => {
    const first = submitImport(importing(deckJson('mine', 'My Deck')));
    const again = submitImport(setImportText(openImport(openDeckSelect(first)), deckJson('mine', 'My Deck v2')));
    expect(again.screen).toBe('confirm-replace');
    expect(replaceView(again)?.existingTitle).toBe('My Deck');
    const s = confirmReplace(again);
    expect(s.decks.filter((d) => d.id === 'mine').map((d) => d.title)).toEqual(['My Deck v2']);
    expect(s.selectedDeck?.title).toBe('My Deck v2');
  });

  it('a clash reached through the dedupe Continue path opens confirm-replace too', () => {
    const json = JSON.stringify({
      id: 'opposites',
      title: 'Dup Opposites',
      cards: [c('a', 0), c('b', 1), c('a', 2), c('c', 3), c('d', 4), c('b', 5), c('e', 6)],
    });
    const before = importing(json);
    const applied = dedupeConfirm(dedupeRequestConfirm(dedupeKeepFirst(submitImport(before))));
    const s = dedupeContinue(applied);
    expect(s.screen).toBe('confirm-replace');
    expect(replaceView(s)?.existingTitle).toBe('Opposites');
    expect(s.decks).toEqual(before.decks);
    const confirmed = confirmReplace(s);
    expect(confirmed.screen).toBe('ready');
    expect(confirmed.selectedDeck?.title).toBe('Dup Opposites');
    expect(confirmed.selectedDeck?.cards.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(undoReplace(confirmed).decks).toEqual(before.decks);
  });

  it('a non-clashing import still goes straight to ready', () => {
    const s = submitImport(importing(deckJson('brand-new', 'Brand New')));
    expect(s.screen).toBe('ready');
    expect(s.selectedDeck?.id).toBe('brand-new');
    expect(s.decks).toHaveLength(STARTER_DECKS.length + 1);
  });
});

// Requirement: the number of imported decks is capped at a low named limit (MAX_IMPORTED_DECKS,
// a small positive integer) so a player cannot grow the deck list without bound. Importing a deck
// with a NEW id when the cap is already reached is refused: no deck is added, nothing is selected,
// and importError says in plain words that the deck limit was reached, naming the number. Starter
// decks do not count toward the cap. Replacing an existing deck (same id) at the cap is still
// allowed because it does not grow the list. The dedupe Continue path obeys the same cap.
// Covers: M11, A10
describe('menu-flow import deck count cap', () => {
  function imported(n: number): Deck[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `imp-${i}`,
      title: `Imported ${i}`,
      cards: [c('w', 10), c('x', 11), c('y', 12), c('z', 13)],
    }));
  }
  function importingWith(extra: readonly Deck[], text: string): MenuState {
    const base: MenuState = { ...createMenu(), decks: [...STARTER_DECKS, ...extra] };
    return setImportText(openImport(openDeckSelect(base)), text);
  }

  it('MAX_IMPORTED_DECKS is a low positive integer', () => {
    expect(Number.isInteger(MAX_IMPORTED_DECKS)).toBe(true);
    expect(MAX_IMPORTED_DECKS).toBeGreaterThan(0);
    expect(MAX_IMPORTED_DECKS).toBeLessThanOrEqual(20);
  });

  it('one below the cap a new deck still imports', () => {
    const s = submitImport(importingWith(imported(MAX_IMPORTED_DECKS - 1), deckJson('brand-new', 'Brand New')));
    expect(s.screen).toBe('ready');
    expect(s.decks).toHaveLength(STARTER_DECKS.length + MAX_IMPORTED_DECKS);
  });

  it('at the cap a new deck is refused with a clear reason naming the limit', () => {
    const before = importingWith(imported(MAX_IMPORTED_DECKS), deckJson('brand-new', 'Brand New'));
    const s = submitImport(before);
    expect(s.screen).toBe('import');
    expect(s.decks).toEqual(before.decks);
    expect(s.selectedDeck).toBeNull();
    expect(s.importError).toMatch(/limit|maximum|too many/i);
    expect(s.importError).toContain(String(MAX_IMPORTED_DECKS));
  });

  it('starter decks do not count toward the cap', () => {
    expect(STARTER_DECKS.length).toBeGreaterThan(0);
    const s = submitImport(importingWith([], deckJson('brand-new', 'Brand New')));
    expect(s.screen).toBe('ready');
  });

  it('at the cap replacing an existing imported deck is still allowed', () => {
    const s = submitImport(importingWith(imported(MAX_IMPORTED_DECKS), deckJson('imp-0', 'Imported 0 v2')));
    expect(s.screen).toBe('confirm-replace');
    expect(confirmReplace(s).decks).toHaveLength(STARTER_DECKS.length + MAX_IMPORTED_DECKS);
  });

  it('at the cap the dedupe Continue path refuses a new deck too', () => {
    const json = JSON.stringify({
      id: 'brand-new',
      title: 'Dup Deck',
      cards: [c('a', 0), c('b', 1), c('a', 2), c('c', 3), c('d', 4), c('b', 5), c('e', 6)],
    });
    const before = importingWith(imported(MAX_IMPORTED_DECKS), json);
    const applied = dedupeConfirm(dedupeRequestConfirm(dedupeKeepFirst(submitImport(before))));
    expect(applied.screen).toBe('dedupe');
    const s = dedupeContinue(applied);
    expect(s.screen).not.toBe('ready');
    expect(s.decks).toEqual(before.decks);
    expect(s.importError).toContain(String(MAX_IMPORTED_DECKS));
  });
});
