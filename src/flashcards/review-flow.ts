// Study-session glue (plan D4, D5, S6a): grades one attempt via answer-outcome, applies at most one
// FSRS update per card per encounter, and persists through the injected storage. Pure over its
// inputs; the clock is always injected.
import { Rating as FsrsRating } from 'ts-fsrs';
import { answerOutcome, classifyTranscript, type AnswerState, type VoiceResult } from './answer-outcome.js';
import type { MatchCard } from './matcher.js';
import { applyRating, buildQueue, bumpCounters, type Queue, type Rating } from './scheduler.js';
import { deckCards, readSave, writeSave, type KnownDeck, type SaveData, type SaveStorage } from './save.js';

export interface ReviewState {
  readonly save: SaveData;
  /** Deck whose progress this session reads and writes; other decks' progress is never touched. */
  readonly deckId: string;
  readonly queue: Queue;
  readonly saveFailed: boolean;
  /** Storage threw on load: writing would clobber a save we never saw, so writes are skipped. */
  readonly readFailed: boolean;
}

export interface Encounter {
  readonly cardId: string;
  readonly answer: AnswerState;
}

export type Attempt = { kind: 'voice'; transcript: string } | { kind: 'orb'; label: string };

export interface ReviewEnv {
  deck: MatchCard[];
  storage: SaveStorage;
  now: Date;
}

export interface SubmitResult {
  state: ReviewState;
  encounter: Encounter;
  outcome: VoiceResult;
  rating: Rating | null;
}

const RATING: Partial<Record<FsrsRating, Rating>> = {
  [FsrsRating.Again]: 'again',
  [FsrsRating.Hard]: 'hard',
  [FsrsRating.Good]: 'good',
};

export interface ReviewKey {
  deckId: string;
  /** Decks used to place an old flat save's progress; omitted, that progress is kept as orphans. */
  knownDecks?: readonly KnownDeck[];
}

/** Start-of-session load; a missing, corrupt or unreadable save degrades to fresh progress. */
export function loadReview(storage: SaveStorage, deck: MatchCard[], now: Date, key: ReviewKey): ReviewState {
  const { deckId } = key;
  const { save, readFailed } = readSave(storage, key.knownDecks);
  const queue = buildQueue({ deck, cards: deckCards(save, deckId), counters: save.counters, now });
  return { save, deckId, queue, saveFailed: readFailed, readFailed };
}

export function startEncounter(cardId: string): Encounter {
  return { cardId, answer: { againWritten: false, missed: false } };
}

function classify(attempt: Attempt, cardId: string, deck: MatchCard[]): VoiceResult {
  if (attempt.kind === 'voice') return classifyTranscript({ deck, cardId, transcript: attempt.transcript });
  return deck.find((c) => c.id === cardId)?.answer === attempt.label ? 'correct' : 'wrong';
}

export function submitAnswer(state: ReviewState, encounter: Encounter, attempt: Attempt, env: ReviewEnv): SubmitResult {
  const { deck, storage, now } = env;
  const { cardId } = encounter;
  // An id outside the deck (stale save, UI bug) must not grade, write, or bump counters.
  if (!deck.some((c) => c.id === cardId)) return { state, encounter, outcome: 'wrong', rating: null };
  const result = answerOutcome(classify(attempt, cardId, deck), encounter.answer);
  const next = { ...encounter, answer: result.state };
  const rating = result.rating === null ? null : (RATING[result.rating] ?? null);
  const unchanged = { state, encounter: next, outcome: result.outcome, rating };
  if (rating === null) return unchanged;

  const cards = deckCards(state.save, state.deckId);
  const prev = Object.prototype.hasOwnProperty.call(cards, cardId) ? cards[cardId] : undefined;
  const card = applyRating(prev, rating, now);
  // applyRating returns prev itself when the card was already rated this study day: nothing to write.
  if (card === prev) return { ...unchanged, rating: null };

  const kind = prev === undefined || prev.state === 0 ? 'new' : 'review';
  const save: SaveData = {
    ...state.save,
    // Computed keys define own properties, so a "__proto__" deck id is stored as data, not a prototype.
    decks: { ...state.save.decks, [state.deckId]: { ...cards, [cardId]: card } },
    counters: bumpCounters(state.save.counters, kind, now),
  };
  const saveFailed = state.readFailed || !writeSave(save, storage);
  return { ...unchanged, state: { ...state, save, saveFailed } };
}
