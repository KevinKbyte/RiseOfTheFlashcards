// Pure flashcard deck logic: no DOM/IWSDK imports so it runs under vitest's node environment.
import { matchKey } from './matcher.js';

export interface Card {
  id: string;
  prompt: string;
  answer: string;
}

export interface Orb {
  id: string;
  label: string;
}

export interface DeckState {
  /** Full original deck; distractors are drawn from it even after cards are cleared. */
  cards: readonly Card[];
  remaining: readonly Card[];
  current: Card | null;
  orbs: readonly Orb[];
  finished: boolean;
}

export type Outcome = 'correct' | 'wrong' | 'ignored';

export const CAPITALS: readonly Card[] = [
  { id: 'fr', prompt: 'Capital of France?', answer: 'Paris' },
  { id: 'jp', prompt: 'Capital of Japan?', answer: 'Tokyo' },
  { id: 'it', prompt: 'Capital of Italy?', answer: 'Rome' },
  { id: 'de', prompt: 'Capital of Germany?', answer: 'Berlin' },
  { id: 'es', prompt: 'Capital of Spain?', answer: 'Madrid' },
  { id: 'ca', prompt: 'Capital of Canada?', answer: 'Ottawa' },
  { id: 'au', prompt: 'Capital of Australia?', answer: 'Canberra' },
  { id: 'eg', prompt: 'Capital of Egypt?', answer: 'Cairo' },
  { id: 'br', prompt: 'Capital of Brazil?', answer: 'Brasilia' },
  { id: 'ke', prompt: 'Capital of Kenya?', answer: 'Nairobi' },
];

const MAX_ORBS = 4;

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickOrbs(
  card: Card & { aliases?: readonly string[] },
  deck: readonly Card[],
  rng: () => number,
): Orb[] {
  // A distractor the matcher would grade correct (alias, accent/case variant) would make two orbs right.
  const accepted = new Set([card.answer, ...(card.aliases ?? [])].map(matchKey));
  const distractors = [...new Set(deck.map((c) => c.answer))].filter((a) => !accepted.has(matchKey(a)));
  const labels = [card.answer, ...shuffle(distractors, rng).slice(0, MAX_ORBS - 1)];
  return shuffle(labels, rng).map((label, i) => ({ id: `${card.id}-orb${i}`, label }));
}

function present(cards: readonly Card[], remaining: readonly Card[], rng: () => number): DeckState {
  if (remaining.length === 0) {
    return { cards, remaining, current: null, orbs: [], finished: true };
  }
  const current = remaining[Math.floor(rng() * remaining.length)];
  return { cards, remaining, current, orbs: pickOrbs(current, cards, rng), finished: false };
}

export function createDeck(cards: readonly Card[], rng: () => number): DeckState {
  const copy = cards.map((c) => ({ ...c }));
  return present(copy, copy, rng);
}

export function chooseAnswer(
  state: DeckState,
  orbId: string,
  rng: () => number,
): { state: DeckState; outcome: Outcome } {
  const orb = state.orbs.find((o) => o.id === orbId);
  if (state.current === null || orb === undefined) {
    return { state, outcome: 'ignored' };
  }
  const current = state.current;
  if (orb.label === current.answer) {
    const remaining = state.remaining.filter((c) => c !== current);
    return { state: present(state.cards, remaining, rng), outcome: 'correct' };
  }
  return {
    state: { ...state, orbs: state.orbs.filter((o) => o.id !== orbId) },
    outcome: 'wrong',
  };
}
