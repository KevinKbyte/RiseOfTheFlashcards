// Requirement: Kev's decision (2026-11-07) -- when a deck has duplicate card ids, the user gets an
// easy dedupe UI instead of a rejection. This pure, UI-agnostic module backs it: findDuplicateGroups
// lists which cards share an id (grouped by parseDeck-normalized id: trim + collapse whitespace,
// case-sensitive; each copy's card index, prompt and answer). A resolver state machine lets the user
// pick keep/drop per copy (every copy starts as "keep" -- nothing is dropped implicitly), offers a
// bulk "keep first in every group", and never drops on a single click: apply only works from an
// explicit confirm step that shows how many cards will be dropped, and an Undo afterwards restores
// the pre-apply deck and selections (house rule: confirm + Undo for every delete). The user cannot
// confirm/apply while any group still has 2+ kept copies, and cannot drop every copy of a group.
// The applied deck passes parseDeck.
// Covers: M11
import { describe, expect, it } from 'vitest';
import {
  applyResolution,
  cancelConfirm,
  canApply,
  choiceOf,
  createResolver,
  dropCount,
  findDuplicateGroups,
  keepFirstInEveryGroup,
  requestConfirm,
  setChoice,
  undoResolution,
} from '../src/flashcards/deck-dedupe.js';
import type { ResolverState } from '../src/flashcards/deck-dedupe.js';
import { parseDeck } from '../src/flashcards/deck-schema.js';
import type { Deck, DeckCard } from '../src/flashcards/deck-schema.js';

function c(id: string, n: number): DeckCard {
  return { id, prompt: `Prompt ${n}?`, answer: `Answer ${n}` };
}

function deckOf(cards: DeckCard[]): Deck {
  return { id: 'test-deck', title: 'Test deck', cards };
}

// Indices: 0 a, 1 b, 2 a, 3 c, 4 d, 5 b, 6 e  -> groups a:[0,2], b:[1,5]
function twoGroupDeck(): Deck {
  return deckOf([c('a', 0), c('b', 1), c('a', 2), c('c', 3), c('d', 4), c('b', 5), c('e', 6)]);
}

// Indices: 0 a, 1 a, 2 a, 3 b, 4 c, 5 d -> group a:[0,1,2]
function tripleDeck(): Deck {
  return deckOf([c('a', 0), c('a', 1), c('a', 2), c('b', 3), c('c', 4), c('d', 5)]);
}

function ids(state: ResolverState): string[] {
  return state.deck.cards.map((card) => card.id);
}

// Covers: M11
describe('findDuplicateGroups', () => {
  it('returns no groups when every id is unique', () => {
    expect(findDuplicateGroups([c('a', 0), c('b', 1), c('c', 2)])).toEqual([]);
  });

  it('returns no groups for an empty card list', () => {
    expect(findDuplicateGroups([])).toEqual([]);
  });

  it('groups copies by id with each copy index, prompt and answer, groups in first-seen order', () => {
    expect(findDuplicateGroups(twoGroupDeck().cards)).toEqual([
      {
        id: 'a',
        copies: [
          { index: 0, prompt: 'Prompt 0?', answer: 'Answer 0' },
          { index: 2, prompt: 'Prompt 2?', answer: 'Answer 2' },
        ],
      },
      {
        id: 'b',
        copies: [
          { index: 1, prompt: 'Prompt 1?', answer: 'Answer 1' },
          { index: 5, prompt: 'Prompt 5?', answer: 'Answer 5' },
        ],
      },
    ]);
  });

  it('puts 3+ copies of one id in a single group', () => {
    const groups = findDuplicateGroups(tripleDeck().cards);
    expect(groups).toHaveLength(1);
    expect(groups[0].copies.map((copy) => copy.index)).toEqual([0, 1, 2]);
  });

  it('matches ids the way parseDeck normalizes them: surrounding and internal whitespace collapse', () => {
    const groups = findDuplicateGroups([c('ch 1', 0), c('  ch\t 1 ', 1), c('x', 2)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('ch 1');
    expect(groups[0].copies.map((copy) => copy.index)).toEqual([0, 1]);
  });

  it('treats ids that differ only by case as distinct, as parseDeck does', () => {
    expect(findDuplicateGroups([c('a', 0), c('A', 1), c('b', 2)])).toEqual([]);
  });

  it('does not mutate its input', () => {
    const cards = twoGroupDeck().cards;
    const snapshot = JSON.parse(JSON.stringify(cards));
    findDuplicateGroups(cards);
    expect(cards).toEqual(snapshot);
  });
});

// Covers: M11
describe('dedupe resolver: selecting copies', () => {
  it('starts in the selecting phase with every copy kept and the groups listed', () => {
    const state = createResolver(twoGroupDeck());
    expect(state.phase).toBe('selecting');
    expect(state.groups.map((g) => g.id)).toEqual(['a', 'b']);
    for (const i of [0, 1, 2, 5]) expect(choiceOf(state, i)).toBe('keep');
    expect(dropCount(state)).toBe(0);
    expect(canApply(state)).toBe(false);
  });

  it('a deck with no duplicates has no groups and nothing to resolve', () => {
    const state = createResolver(deckOf([c('a', 0), c('b', 1), c('c', 2), c('d', 3)]));
    expect(state.groups).toEqual([]);
    expect(dropCount(state)).toBe(0);
  });

  it('lets the user drop one copy and keep the other, per group', () => {
    let state = createResolver(twoGroupDeck());
    state = setChoice(state, 0, 'drop');
    expect(choiceOf(state, 0)).toBe('drop');
    expect(choiceOf(state, 2)).toBe('keep');
    expect(dropCount(state)).toBe(1);
    expect(canApply(state)).toBe(false);
    state = setChoice(state, 5, 'drop');
    expect(dropCount(state)).toBe(2);
    expect(canApply(state)).toBe(true);
  });

  it('lets the user change their mind back to keep', () => {
    let state = setChoice(createResolver(twoGroupDeck()), 2, 'drop');
    state = setChoice(state, 2, 'keep');
    expect(choiceOf(state, 2)).toBe('keep');
    expect(dropCount(state)).toBe(0);
  });

  it('refuses to drop the last kept copy of a group', () => {
    let state = setChoice(createResolver(twoGroupDeck()), 0, 'drop');
    state = setChoice(state, 2, 'drop');
    expect(choiceOf(state, 2)).toBe('keep');
    expect(choiceOf(state, 0)).toBe('drop');
  });

  it('with 3 copies: cannot apply while 2 are kept, and cannot drop all 3', () => {
    let state = setChoice(createResolver(tripleDeck()), 1, 'drop');
    expect(canApply(state)).toBe(false);
    state = setChoice(state, 2, 'drop');
    expect(canApply(state)).toBe(true);
    state = setChoice(state, 0, 'drop');
    expect(choiceOf(state, 0)).toBe('keep');
    expect(dropCount(state)).toBe(2);
  });

  it('bulk "keep first in every group" keeps the first copy and drops the rest', () => {
    const state = keepFirstInEveryGroup(createResolver(tripleDeck()));
    expect([0, 1, 2].map((i) => choiceOf(state, i))).toEqual(['keep', 'drop', 'drop']);
    expect(dropCount(state)).toBe(2);
    expect(canApply(state)).toBe(true);
  });

  it('bulk keep-first overrides earlier per-copy picks across all groups', () => {
    let state = setChoice(createResolver(twoGroupDeck()), 0, 'drop');
    state = keepFirstInEveryGroup(state);
    expect([0, 2, 1, 5].map((i) => choiceOf(state, i))).toEqual(['keep', 'drop', 'keep', 'drop']);
  });

  it('selection functions are pure: the previous state is unchanged', () => {
    const before = createResolver(twoGroupDeck());
    const after = keepFirstInEveryGroup(before);
    expect(choiceOf(before, 2)).toBe('keep');
    expect(choiceOf(after, 2)).toBe('drop');
  });
});

// Covers: M11
describe('dedupe resolver: confirm, apply, undo', () => {
  it('apply without the confirm step drops nothing (no single-click delete)', () => {
    const ready = keepFirstInEveryGroup(createResolver(twoGroupDeck()));
    const state = applyResolution(ready);
    expect(state.phase).toBe('selecting');
    expect(state.deck.cards).toHaveLength(7);
  });

  it('cannot enter the confirm step while a group still has 2+ kept copies', () => {
    const state = requestConfirm(setChoice(createResolver(twoGroupDeck()), 0, 'drop'));
    expect(state.phase).toBe('selecting');
  });

  it('the confirm step shows how many cards will be dropped', () => {
    const state = requestConfirm(keepFirstInEveryGroup(createResolver(tripleDeck())));
    expect(state.phase).toBe('confirming');
    expect(dropCount(state)).toBe(2);
    expect(state.deck.cards).toHaveLength(6);
  });

  it('cancelling the confirm step returns to selecting with selections intact', () => {
    const state = cancelConfirm(requestConfirm(keepFirstInEveryGroup(createResolver(twoGroupDeck()))));
    expect(state.phase).toBe('selecting');
    expect(choiceOf(state, 2)).toBe('drop');
    expect(state.deck.cards).toHaveLength(7);
  });

  it('apply after confirm yields a clean deck in original order that passes parseDeck', () => {
    let state = setChoice(createResolver(twoGroupDeck()), 0, 'drop');
    state = setChoice(state, 5, 'drop');
    state = applyResolution(requestConfirm(state));
    expect(state.phase).toBe('applied');
    expect(ids(state)).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(state.deck.cards[1]).toEqual(c('a', 2));
    const parsed = parseDeck(state.deck);
    expect(parsed.ok).toBe(true);
  });

  it('undo after apply restores the pre-apply deck and the selections', () => {
    const original = twoGroupDeck();
    let state = setChoice(createResolver(original), 2, 'drop');
    state = setChoice(state, 1, 'drop');
    const applied = applyResolution(requestConfirm(state));
    const undone = undoResolution(applied);
    expect(undone.phase).toBe('selecting');
    expect(undone.deck).toEqual(original);
    expect([0, 2, 1, 5].map((i) => choiceOf(undone, i))).toEqual(['keep', 'drop', 'drop', 'keep']);
    expect(dropCount(undone)).toBe(2);
  });

  it('apply is pure: the confirming state still holds the full deck', () => {
    const confirming = requestConfirm(keepFirstInEveryGroup(createResolver(twoGroupDeck())));
    applyResolution(confirming);
    expect(confirming.phase).toBe('confirming');
    expect(confirming.deck.cards).toHaveLength(7);
  });

  it('undo before apply is a no-op', () => {
    const state = keepFirstInEveryGroup(createResolver(twoGroupDeck()));
    const undone = undoResolution(state);
    expect(undone.phase).toBe('selecting');
    expect(choiceOf(undone, 2)).toBe('drop');
    expect(undone.deck.cards).toHaveLength(7);
  });

  it('resolves the deck carried by parseDeck\'s duplicates result end to end', () => {
    const result = parseDeck({
      id: 'd',
      title: 'D',
      cards: [c('a', 0), c(' a ', 1), c('b', 2), c('c', 3), c('d', 4)],
    });
    if (result.ok || !('kind' in result) || result.kind !== 'duplicates') {
      throw new Error(`expected a duplicates result, got ${JSON.stringify(result)}`);
    }
    const state = applyResolution(requestConfirm(keepFirstInEveryGroup(createResolver(result.deck))));
    expect(ids(state)).toEqual(['a', 'b', 'c', 'd']);
    expect(parseDeck(state.deck).ok).toBe(true);
  });
});
