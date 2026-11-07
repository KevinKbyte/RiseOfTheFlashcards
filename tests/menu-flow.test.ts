// Requirement: the start-screen menu is a PURE state machine (src/flashcards/menu-flow.ts) that the
// 3D layer only renders. Screens: 'start' -> 'deck-select' -> ('import' -> 'dedupe'?) -> 'ready'
// -> 'playing', plus a 'mastery' text screen reachable from start. Deck select lists the bundled
// starter decks (and any imported deck) by plain-language title. Importing raw text runs JSON.parse
// then parseDeck: invalid text shows a plain error message and stays on 'import'; a deck with
// duplicate card ids opens the 'dedupe' screen driven by the deck-dedupe resolver, which lists the
// duplicate cards by prompt + answer (never bare ids), allows keep/drop per copy and bulk
// "keep first", disables Apply with the resolver's applyBlockReason text when blocked, and never
// drops cards in a single action: Apply opens a confirm step showing the drop count, Confirm
// applies, an Undo is offered afterwards, and Cancel from confirm returns to selecting. Error and
// duplicate text is plain data (the UI renders it via textContent). Every transition returns a
// new state and never mutates its input. Plan IDs: docs/plans/2026-10-28-vr-flashcard-game.md.
// Covers: M11, A10
import { describe, expect, it } from 'vitest';
import {
  backToStart,
  createMenu,
  dedupeCancelConfirm,
  dedupeConfirm,
  dedupeContinue,
  dedupeKeepFirst,
  dedupeRequestConfirm,
  dedupeSetChoice,
  dedupeUndo,
  dedupeView,
  deckOptions,
  masterySummary,
  MASTERED_STABILITY_DAYS,
  openDeckSelect,
  openImport,
  openMastery,
  selectDeck,
  setImportText,
  startPlaying,
  submitImport,
} from '../src/flashcards/menu-flow.js';
import type { MenuState } from '../src/flashcards/menu-flow.js';
import { parseDeck } from '../src/flashcards/deck-schema.js';
import type { Deck, DeckCard } from '../src/flashcards/deck-schema.js';
import type { CardState } from '../src/flashcards/scheduler.js';
import { STARTER_DECKS } from '../src/flashcards/starter-decks.js';

function c(id: string, n: number): DeckCard {
  return { id, prompt: `Prompt ${n}?`, answer: `Answer ${n}` };
}

// Indices: 0 a, 1 b, 2 a, 3 c, 4 d, 5 b, 6 e  -> groups a:[0,2], b:[1,5]
function dupDeckJson(): string {
  return JSON.stringify({
    id: 'dup-deck',
    title: 'Dup deck',
    cards: [c('a', 0), c('b', 1), c('a', 2), c('c', 3), c('d', 4), c('b', 5), c('e', 6)],
  });
}

function cleanDeckJson(): string {
  return JSON.stringify({ id: 'mine', title: 'My Deck', cards: [c('a', 0), c('b', 1), c('c', 2), c('d', 3)] });
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function importing(text: string): MenuState {
  return setImportText(openImport(openDeckSelect(createMenu())), text);
}

function atDedupe(): MenuState {
  return submitImport(importing(dupDeckJson()));
}

describe('menu-flow navigation', () => {
  it('starts on the start screen with nothing selected', () => {
    const s = createMenu();
    expect(s.screen).toBe('start');
    expect(s.selectedDeck).toBeNull();
  });

  it('goes start -> deck-select -> ready -> playing for a starter deck', () => {
    const select = openDeckSelect(createMenu());
    expect(select.screen).toBe('deck-select');
    const ready = selectDeck(select, 'opposites');
    expect(ready.screen).toBe('ready');
    expect(ready.selectedDeck?.id).toBe('opposites');
    expect(startPlaying(ready).screen).toBe('playing');
  });

  it('lists starter decks by plain-language title', () => {
    const options = deckOptions(openDeckSelect(createMenu()));
    expect(options).toEqual(STARTER_DECKS.map((d) => ({ id: d.id, title: d.title })));
    expect(options.map((o) => o.title)).toEqual(['World Capitals', 'Opposites', 'Basic Science']);
  });

  it('ignores selecting an unknown deck id', () => {
    const select = openDeckSelect(createMenu());
    expect(selectDeck(select, 'no-such-deck')).toBe(select);
  });

  it('cannot start playing before a deck is ready', () => {
    const start = createMenu();
    expect(startPlaying(start)).toBe(start);
    const select = openDeckSelect(start);
    expect(startPlaying(select)).toBe(select);
  });

  it('opens the import screen from deck select with empty text and no error', () => {
    const s = openImport(openDeckSelect(createMenu()));
    expect(s.screen).toBe('import');
    expect(s.importText).toBe('');
    expect(s.importError).toBeNull();
  });

  it('backToStart returns to the start screen from any menu screen', () => {
    expect(backToStart(openDeckSelect(createMenu())).screen).toBe('start');
    expect(backToStart(openMastery(createMenu())).screen).toBe('start');
    expect(backToStart(importing('x')).screen).toBe('start');
  });

  it('never mutates its input state', () => {
    const s = deepFreeze(importing(dupDeckJson()));
    const snapshot = JSON.stringify(s);
    const dedupe = submitImport(s);
    deepFreeze(dedupe);
    const before = JSON.stringify(dedupe);
    const steps = [
      () => dedupeSetChoice(dedupe, 2, 'drop'),
      () => dedupeKeepFirst(dedupe),
      () => dedupeRequestConfirm(dedupeKeepFirst(dedupe)),
      () => selectDeck(openDeckSelect(s), 'opposites'),
      () => backToStart(s),
    ];
    for (const step of steps) expect(step).not.toThrow();
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(JSON.stringify(dedupe)).toBe(before);
  });
});

describe('menu-flow import', () => {
  it('rejects text that is not JSON with a plain message and stays on import', () => {
    const s = submitImport(importing('not json {'));
    expect(s.screen).toBe('import');
    expect(s.importError).toBe('deck text is not valid JSON');
  });

  it('rejects empty text and stays on import', () => {
    const s = submitImport(importing(''));
    expect(s.screen).toBe('import');
    expect(typeof s.importError).toBe('string');
    expect(s.importError).not.toBe('');
  });

  it('shows the parseDeck error verbatim for an invalid deck and keeps the typed text', () => {
    const text = JSON.stringify({ id: 'x', title: 'X', cards: [] });
    const s = submitImport(importing(text));
    expect(s.screen).toBe('import');
    expect(s.importError).toBe('deck must have at least one card');
    expect(s.importText).toBe(text);
  });

  it('editing the text clears a previous error', () => {
    const failed = submitImport(importing('nope'));
    expect(setImportText(failed, 'nope2').importError).toBeNull();
  });

  it('a clean deck is added to the deck list, selected, and goes to ready', () => {
    const s = submitImport(importing(cleanDeckJson()));
    expect(s.screen).toBe('ready');
    expect(s.selectedDeck?.id).toBe('mine');
    expect(deckOptions(s).map((o) => o.title)).toContain('My Deck');
  });

  it('keeps markup in titles and errors as plain data (no escaping, no HTML)', () => {
    const title = '<img src=x onerror=alert(1)>';
    const json = JSON.stringify({ id: 'xss', title, cards: [c('a', 0), c('b', 1), c('c', 2), c('d', 3)] });
    const s = submitImport(importing(json));
    expect(deckOptions(s).find((o) => o.id === 'xss')?.title).toBe(title);
  });

  it('a deck with duplicate ids opens the dedupe screen', () => {
    const s = atDedupe();
    expect(s.screen).toBe('dedupe');
    expect(dedupeView(s).phase).toBe('selecting');
  });
});

// Covers: M11
describe('menu-flow dedupe screen', () => {
  it('lists each duplicate group with prompt + answer per copy, all kept initially', () => {
    const view = dedupeView(atDedupe());
    expect(view.groups).toEqual([
      {
        id: 'a',
        copies: [
          { index: 0, prompt: 'Prompt 0?', answer: 'Answer 0', choice: 'keep' },
          { index: 2, prompt: 'Prompt 2?', answer: 'Answer 2', choice: 'keep' },
        ],
      },
      {
        id: 'b',
        copies: [
          { index: 1, prompt: 'Prompt 1?', answer: 'Answer 1', choice: 'keep' },
          { index: 5, prompt: 'Prompt 5?', answer: 'Answer 5', choice: 'keep' },
        ],
      },
    ]);
    expect(view.dropCount).toBe(0);
  });

  it('Apply is disabled while any group still keeps 2+ copies', () => {
    const view = dedupeView(atDedupe());
    expect(view.canApply).toBe(false);
    const s = dedupeRequestConfirm(atDedupe());
    expect(dedupeView(s).phase).toBe('selecting');
  });

  it('per-copy drop updates the choice shown', () => {
    const s = dedupeSetChoice(atDedupe(), 2, 'drop');
    const copy = dedupeView(s).groups[0].copies[1];
    expect(copy).toEqual({ index: 2, prompt: 'Prompt 2?', answer: 'Answer 2', choice: 'drop' });
    expect(dedupeView(s).dropCount).toBe(1);
  });

  it('bulk keep-first marks later copies drop and enables Apply', () => {
    const view = dedupeView(dedupeKeepFirst(atDedupe()));
    expect(view.groups.flatMap((g) => g.copies.map((x) => x.choice))).toEqual(['keep', 'drop', 'keep', 'drop']);
    expect(view.canApply).toBe(true);
    expect(view.applyBlockReason).toBeNull();
    expect(view.dropCount).toBe(2);
  });

  it('shows the applyBlockReason text and keeps Apply disabled when kept answers are too few', () => {
    // Distinct answers: X, Y, Z, W; dropping the W copy of 'a' leaves only 3 distinct answers.
    const json = JSON.stringify({
      id: 'lossy',
      title: 'Lossy',
      cards: [
        { id: 'a', prompt: 'P0?', answer: 'W' },
        { id: 'a', prompt: 'P1?', answer: 'X' },
        { id: 'b', prompt: 'P2?', answer: 'Y' },
        { id: 'c', prompt: 'P3?', answer: 'Z' },
      ],
    });
    const s = dedupeKeepFirst(submitImport(importing(json)));
    const flipped = dedupeSetChoice(dedupeSetChoice(s, 1, 'keep'), 0, 'drop');
    const view = dedupeView(flipped);
    expect(view.canApply).toBe(false);
    expect(view.applyBlockReason).toBe('Kept cards need at least 4 distinct answers');
    expect(dedupeView(dedupeRequestConfirm(flipped)).phase).toBe('selecting');
  });

  it('Apply goes to a confirm step showing the drop count, without dropping anything yet', () => {
    const s = dedupeRequestConfirm(dedupeKeepFirst(atDedupe()));
    const view = dedupeView(s);
    expect(s.screen).toBe('dedupe');
    expect(view.phase).toBe('confirming');
    expect(view.dropCount).toBe(2);
    expect(view.canUndo).toBe(false);
  });

  it('Cancel from confirm returns to selecting with choices intact', () => {
    const s = dedupeCancelConfirm(dedupeRequestConfirm(dedupeKeepFirst(atDedupe())));
    const view = dedupeView(s);
    expect(view.phase).toBe('selecting');
    expect(view.dropCount).toBe(2);
  });

  it('Confirm applies the drop and then offers Undo, staying on the dedupe screen', () => {
    const s = dedupeConfirm(dedupeRequestConfirm(dedupeKeepFirst(atDedupe())));
    const view = dedupeView(s);
    expect(s.screen).toBe('dedupe');
    expect(view.phase).toBe('applied');
    expect(view.canUndo).toBe(true);
  });

  it('Confirm is ignored unless the confirm step is open (no single-action drop)', () => {
    const selecting = dedupeKeepFirst(atDedupe());
    expect(dedupeConfirm(selecting)).toBe(selecting);
  });

  it('Undo restores the selecting phase with prior choices', () => {
    const s = dedupeUndo(dedupeConfirm(dedupeRequestConfirm(dedupeKeepFirst(atDedupe()))));
    const view = dedupeView(s);
    expect(view.phase).toBe('selecting');
    expect(view.groups).toHaveLength(2);
    expect(view.dropCount).toBe(2);
  });

  it('Continue after apply adds the deduped deck, selects it, and goes to ready', () => {
    const s = dedupeContinue(dedupeConfirm(dedupeRequestConfirm(dedupeKeepFirst(atDedupe()))));
    expect(s.screen).toBe('ready');
    expect(s.selectedDeck?.cards.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(parseDeck(s.selectedDeck).ok).toBe(true);
    expect(deckOptions(s).map((o) => o.title)).toContain('Dup deck');
  });

  it('Continue is ignored before the drop is applied', () => {
    const confirming = dedupeRequestConfirm(dedupeKeepFirst(atDedupe()));
    expect(dedupeContinue(confirming)).toBe(confirming);
  });

  it('dedupe actions are ignored off the dedupe screen', () => {
    const start = createMenu();
    expect(dedupeSetChoice(start, 0, 'drop')).toBe(start);
    expect(dedupeKeepFirst(start)).toBe(start);
    expect(dedupeConfirm(start)).toBe(start);
    expect(dedupeUndo(start)).toBe(start);
  });
});

// Requirement: a plain-text mastery screen summarizes each deck from scheduler state: New = no
// stored state or FSRS state 0; Mastered = FSRS state 2 (Review) with stability >=
// MASTERED_STABILITY_DAYS (21 days, the conventional "mature card" interval); Learning = every
// other stored state (Learning 1, Relearning 3, or Review below the stability threshold).
// Covers: D5
describe('menu-flow mastery summary', () => {
  const deck: Deck = {
    id: 'm',
    title: 'Mastery deck',
    cards: [c('n1', 0), c('n2', 1), c('l1', 2), c('l2', 3), c('l3', 4), c('m1', 5)],
  };
  function st(state: CardState['state'], stability: number): CardState {
    return {
      stability,
      difficulty: 5,
      state,
      reps: 1,
      lapses: 0,
      due: '2026-11-08T00:00:00.000Z',
      lastReview: '2026-11-07T00:00:00.000Z',
    };
  }

  it('uses a 21-day stability threshold for mastered', () => {
    expect(MASTERED_STABILITY_DAYS).toBe(21);
  });

  it('counts new / learning / mastered per deck and renders a plain-text line', () => {
    const cards: Record<string, CardState> = {
      n2: st(0, 0),
      l1: st(1, 2),
      l2: st(3, 30),
      l3: st(2, MASTERED_STABILITY_DAYS - 0.01),
      m1: st(2, MASTERED_STABILITY_DAYS),
    };
    expect(masterySummary([deck], cards)).toEqual([
      {
        deckId: 'm',
        title: 'Mastery deck',
        newCount: 2,
        learningCount: 3,
        masteredCount: 1,
        text: 'Mastery deck: 2 new, 3 learning, 1 mastered',
      },
    ]);
  });

  it('reports every card as new when there is no scheduler state', () => {
    const rows = masterySummary(STARTER_DECKS, {});
    expect(rows.map((r) => r.text)).toEqual([
      'World Capitals: 12 new, 0 learning, 0 mastered',
      'Opposites: 12 new, 0 learning, 0 mastered',
      'Basic Science: 12 new, 0 learning, 0 mastered',
    ]);
  });

  it('returns an empty list for no decks', () => {
    expect(masterySummary([], {})).toEqual([]);
  });

  it('ignores prototype-named ids (own-property lookup only)', () => {
    const proto: Deck = { id: 'p', title: 'P', cards: [c('toString', 0)] };
    expect(masterySummary([proto], {})[0].newCount).toBe(1);
  });

  it('opens the mastery screen from start', () => {
    expect(openMastery(createMenu()).screen).toBe('mastery');
  });
});
