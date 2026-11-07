// Study-session glue (plan D4, D5, S6a): grades one attempt via answer-outcome, applies at most one
// FSRS update per card per encounter, and persists through the injected storage. Pure over its
// inputs; the clock is always injected.
import { Rating as FsrsRating } from 'ts-fsrs';
import { answerOutcome, classifyTranscript, type AnswerState, type VoiceResult } from './answer-outcome.js';
import { orbOutcome, type AnswerMode } from './answer-mode.js';
import type { MatchCard } from './matcher.js';
import { applyRating, buildQueue, bumpCounters, type Queue, type Rating } from './scheduler.js';
import { deckCards, readSave, withEntry, writeSave, type KnownDeck, type SaveData, type SaveStorage } from './save.js';

export interface ReviewState {
  readonly save: SaveData;
  /** Deck whose progress this session reads and writes; other decks' progress is never touched. */
  readonly deckId: string;
  readonly queue: Queue;
  readonly saveFailed: boolean;
  /** Storage threw on load: writing would clobber a save we never saw, so writes are skipped. */
  readonly readFailed: boolean;
}

export type EncounterAnswer = AnswerState & { readonly didntCatch?: boolean };

export interface Encounter {
  readonly cardId: string;
  readonly answer: EncounterAnswer;
}

/**
 * 'hit': a landed enemy strike, graded as a wrong answer (Again, once per encounter).
 * An orb's mode selects the D4 orb rules; omitted, the orb grades like a voice answer.
 */
export type Attempt =
  | { kind: 'voice'; transcript: string }
  | { kind: 'orb'; label: string; mode?: AnswerMode }
  | { kind: 'hit' };

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
  /** Other decks used to place an old flat save's progress; the played deck is always included. */
  knownDecks?: readonly KnownDeck[];
}

/** Start-of-session load; a missing, corrupt or unreadable save degrades to fresh progress. */
export function loadReview(storage: SaveStorage, deck: MatchCard[], now: Date, key: ReviewKey): ReviewState {
  const { deckId } = key;
  // The played deck always adopts flat-save progress for its cards, even with knownDecks omitted.
  const known: KnownDeck[] = [...(key.knownDecks ?? []), { id: deckId, cards: deck }];
  const { save, readFailed } = readSave(storage, known);
  const queue = buildQueue({ deck, cards: deckCards(save, deckId), counters: save.counters, now });
  return { save, deckId, queue, saveFailed: readFailed, readFailed };
}

export function startEncounter(cardId: string): Encounter {
  return { cardId, answer: { againWritten: false, missed: false } };
}

function classify(attempt: Attempt, cardId: string, deck: MatchCard[]): VoiceResult {
  if (attempt.kind === 'hit') return 'wrong';
  if (attempt.kind === 'voice') return classifyTranscript({ deck, cardId, transcript: attempt.transcript });
  return deck.find((c) => c.id === cardId)?.answer === attempt.label ? 'correct' : 'wrong';
}

interface Graded {
  outcome: VoiceResult;
  rating: FsrsRating | null;
  state: EncounterAnswer;
}

/** An orb carrying a mode is scored by answer-mode's D4 orb rules; everything else by answerOutcome. */
function grade(attempt: Attempt, result: VoiceResult, answer: EncounterAnswer): Graded {
  const didntCatch = answer.didntCatch === true;
  if (attempt.kind === 'orb' && attempt.mode && (result === 'correct' || result === 'wrong')) {
    const o = orbOutcome(result, attempt.mode, { ...answer, didntCatch });
    return { outcome: result, rating: o.rating, state: o.state };
  }
  const o = answerOutcome(result, answer);
  // Didn't catch is remembered so a later voice-mode orb can rate Hard (D4 Orb correct row).
  return didntCatch || result === 'didnt-catch' ? { ...o, state: { ...o.state, didntCatch: true } } : o;
}

export function submitAnswer(state: ReviewState, encounter: Encounter, attempt: Attempt, env: ReviewEnv): SubmitResult {
  const { deck, storage, now } = env;
  const { cardId } = encounter;
  // An id outside the deck (stale save, UI bug) must not grade, write, or bump counters.
  if (!deck.some((c) => c.id === cardId)) return { state, encounter, outcome: 'wrong', rating: null };
  const result = grade(attempt, classify(attempt, cardId, deck), encounter.answer);
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
    // Null-prototype copies: a "__proto__" deck or card id is stored as data, not a prototype.
    decks: withEntry(state.save.decks, state.deckId, withEntry(cards, cardId, card)),
    counters: bumpCounters(state.save.counters, kind, now),
  };
  const saveFailed = state.readFailed || !writeSave(save, storage);
  return { ...unchanged, state: { ...state, save, saveFailed } };
}
