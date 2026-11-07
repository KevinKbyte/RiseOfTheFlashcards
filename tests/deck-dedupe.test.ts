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
  applyBlockReason,
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
import { MIN_DISTINCT_ANSWERS, parseDeck } from '../src/flashcards/deck-schema.js';
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

// Requirement: dropping a duplicate copy must never leave a deck that fails parseDeck. Copies that
// share an id can carry different answers, so dropping one can remove a distinct answer: e.g. cards
// a:"A", a:"B", c:"C", d:"D" have 4 distinct answers (parseDeck reports kind 'duplicates'), but
// whichever `a` is kept leaves only 3, below MIN_DISTINCT_ANSWERS (4). The resolver must refuse to
// confirm/apply such a selection, and expose `applyBlockReason(state): string | null` so the dedupe
// UI can say why: null when the kept cards satisfy the distinct-answers minimum, otherwise a short
// message naming the minimum ("4") and "distinct answers". Distinct answers are counted exactly as
// parseDeck counts them (whitespace-normalized, case-insensitive). A selection whose kept copies
// still give >= 4 distinct answers applies as before and the applied deck passes parseDeck.
// Covers: M11
describe('dedupe resolver: kept copies must keep the distinct-answers minimum', () => {
  function card(id: string, answer: string, n: number): DeckCard {
    return { id, prompt: `Prompt ${n}?`, answer };
  }

  // Indices: 0 a:"A", 1 a:"B", 2 c:"C", 3 d:"D" -> group a:[0,1]; 4 distinct answers total.
  function lossyDeck(): Deck {
    return deckOf([card('a', 'A', 0), card('a', 'B', 1), card('c', 'C', 2), card('d', 'D', 3)]);
  }

  function keptDeck(state: ResolverState): Deck {
    return { ...state.deck, cards: state.deck.cards.filter((_, i) => choiceOf(state, i) === 'keep') };
  }

  it('fixture sanity: parseDeck reports the lossy deck as duplicates, not a distinct-answers error', () => {
    const result = parseDeck(lossyDeck());
    expect(result.ok).toBe(false);
    expect('kind' in result && result.kind).toBe('duplicates');
  });

  it('keep-first in every group on the lossy deck cannot apply; confirm stays in selecting', () => {
    const state = keepFirstInEveryGroup(createResolver(lossyDeck()));
    expect(parseDeck(keptDeck(state)).ok).toBe(false);
    expect(canApply(state)).toBe(false);
    expect(requestConfirm(state).phase).toBe('selecting');
  });

  it('keeping the other copy instead is equally blocked', () => {
    const state = setChoice(createResolver(lossyDeck()), 0, 'drop');
    expect(choiceOf(state, 0)).toBe('drop');
    expect(canApply(state)).toBe(false);
    const after = applyResolution(requestConfirm(state));
    expect(after.phase).toBe('selecting');
    expect(after.deck.cards).toHaveLength(4);
  });

  it('applyBlockReason names the distinct-answers minimum when the kept cards fall short', () => {
    const state = keepFirstInEveryGroup(createResolver(lossyDeck()));
    const reason = applyBlockReason(state);
    expect(typeof reason).toBe('string');
    expect(reason).toMatch(/distinct answers/i);
    expect(reason).toContain(String(MIN_DISTINCT_ANSWERS));
  });

  it('applyBlockReason is null for a resolved selection that keeps enough distinct answers', () => {
    const state = keepFirstInEveryGroup(createResolver(twoGroupDeck()));
    expect(canApply(state)).toBe(true);
    expect(applyBlockReason(state)).toBeNull();
  });

  it('regression guard: copies with differing answers still apply when >= 4 distinct answers remain', () => {
    // 0 a:"A", 1 a:"B", 2 c:"C", 3 d:"D", 4 e:"E" -> 5 distinct; any kept `a` leaves 4.
    const deck = deckOf([
      card('a', 'A', 0),
      card('a', 'B', 1),
      card('c', 'C', 2),
      card('d', 'D', 3),
      card('e', 'E', 4),
    ]);
    for (const drop of [0, 1]) {
      const state = setChoice(createResolver(deck), drop, 'drop');
      expect(canApply(state)).toBe(true);
      expect(applyBlockReason(state)).toBeNull();
      const applied = applyResolution(requestConfirm(state));
      expect(applied.phase).toBe('applied');
      expect(applied.deck.cards).toHaveLength(4);
      expect(parseDeck(applied.deck).ok).toBe(true);
    }
  });

  it('counts distinct answers case-insensitively, as parseDeck does', () => {
    // 0 a:"Delta", 1 a:"Epsilon", 2 b:"Alpha", 3 c:"Beta", 4 d:"delta"
    // keep 0 -> Delta/Alpha/Beta/delta = 3 case-insensitive (blocked); keep 1 -> 4 (applies).
    const deck = deckOf([
      card('a', 'Delta', 0),
      card('a', 'Epsilon', 1),
      card('b', 'Alpha', 2),
      card('c', 'Beta', 3),
      card('d', 'delta', 4),
    ]);
    const keepFirst = keepFirstInEveryGroup(createResolver(deck));
    expect(parseDeck(keptDeck(keepFirst)).ok).toBe(false);
    expect(canApply(keepFirst)).toBe(false);
    expect(applyBlockReason(keepFirst)).toMatch(/distinct answers/i);

    const keepSecond = setChoice(createResolver(deck), 0, 'drop');
    expect(canApply(keepSecond)).toBe(true);
    expect(applyBlockReason(keepSecond)).toBeNull();
    expect(parseDeck(applyResolution(requestConfirm(keepSecond)).deck).ok).toBe(true);
  });

  it('counts distinct answers after parseDeck whitespace normalization', () => {
    // Unnormalized deck handed straight to the resolver: " Alpha " and "Alpha" are one answer.
    const deck = deckOf([
      card('a', 'Gamma', 0),
      card('a', 'Delta', 1),
      card('b', '  alpha ', 2),
      card('c', 'Alpha', 3),
      card('d', 'Beta', 4),
      card('e', 'gamma\t', 5),
    ]);
    // keep 0 -> Gamma/alpha/Alpha/Beta/gamma = 3 normalized (blocked); keep 1 -> 4 (applies).
    const keepFirst = keepFirstInEveryGroup(createResolver(deck));
    expect(parseDeck(keptDeck(keepFirst)).ok).toBe(false);
    expect(canApply(keepFirst)).toBe(false);

    const keepSecond = setChoice(createResolver(deck), 0, 'drop');
    expect(canApply(keepSecond)).toBe(true);
    expect(parseDeck(keptDeck(keepSecond)).ok).toBe(true);
  });
});
