// Duplicate-id resolver (M11): backs the dedupe UI shown when parseDeck returns kind 'duplicates'.
// Pure state machine, never mutates. House rule for deletes: no single-click drop -- apply only
// works from an explicit confirm step, and Undo restores the pre-apply deck and selections.
import { findDuplicateGroups } from './deck-schema.js';
import type { Deck, DuplicateGroup } from './deck-schema.js';

export { findDuplicateGroups };

export type Choice = 'keep' | 'drop';

interface Selection {
  deck: Deck;
  groups: DuplicateGroup[];
  /** Indexed by card index in deck.cards; absent means 'keep'. */
  choices: readonly Choice[];
}

export interface ResolverState extends Selection {
  phase: 'selecting' | 'confirming' | 'applied';
  /** The selection that was applied; set only in the 'applied' phase, for Undo. */
  previous?: Selection;
}

export function createResolver(deck: Deck): ResolverState {
  return { phase: 'selecting', deck, groups: findDuplicateGroups(deck.cards), choices: [] };
}

export function choiceOf(state: ResolverState, cardIndex: number): Choice {
  return state.choices[cardIndex] ?? 'keep';
}

export function dropCount(state: ResolverState): number {
  return state.choices.filter((choice) => choice === 'drop').length;
}

function keptIn(state: ResolverState, group: DuplicateGroup): number {
  return group.copies.filter((copy) => choiceOf(state, copy.index) === 'keep').length;
}

function withChoices(state: ResolverState, edits: ReadonlyArray<[number, Choice]>): ResolverState {
  const choices = [...state.choices];
  for (const [index, choice] of edits) choices[index] = choice;
  return { ...state, choices };
}

export function setChoice(state: ResolverState, cardIndex: number, choice: Choice): ResolverState {
  if (state.phase !== 'selecting') return state;
  const group = state.groups.find((g) => g.copies.some((copy) => copy.index === cardIndex));
  if (!group) return state;
  const droppingLastKept =
    choice === 'drop' && choiceOf(state, cardIndex) === 'keep' && keptIn(state, group) === 1;
  if (droppingLastKept) return state;
  return withChoices(state, [[cardIndex, choice]]);
}

export function keepFirstInEveryGroup(state: ResolverState): ResolverState {
  if (state.phase !== 'selecting') return state;
  const edits = state.groups.flatMap((group) =>
    group.copies.map((copy, i): [number, Choice] => [copy.index, i === 0 ? 'keep' : 'drop']),
  );
  return withChoices(state, edits);
}

/** True once every duplicate group has exactly one kept copy. */
export function canApply(state: ResolverState): boolean {
  return state.groups.length > 0 && state.groups.every((group) => keptIn(state, group) === 1);
}

export function requestConfirm(state: ResolverState): ResolverState {
  if (state.phase !== 'selecting' || !canApply(state)) return state;
  return { ...state, phase: 'confirming' };
}

export function cancelConfirm(state: ResolverState): ResolverState {
  if (state.phase !== 'confirming') return state;
  return { ...state, phase: 'selecting' };
}

export function applyResolution(state: ResolverState): ResolverState {
  if (state.phase !== 'confirming') return state;
  const { deck, groups, choices } = state;
  const cards = deck.cards.filter((_, index) => choiceOf(state, index) === 'keep');
  return {
    phase: 'applied',
    deck: { ...deck, cards },
    groups: [],
    choices: [],
    previous: { deck, groups, choices },
  };
}

export function undoResolution(state: ResolverState): ResolverState {
  if (state.phase !== 'applied' || !state.previous) return state;
  return { phase: 'selecting', ...state.previous };
}
