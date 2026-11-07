// Pure run-level state for one flashcard run: 12-card reservation, 5 shield pips, win/lose.
// No DOM/IWSDK imports so it runs under vitest's node environment. Every function returns a new
// state (or the same object when the action does not apply) and never mutates its input.

export const RUN_CARD_CAP = 12;
export const SHIELD_PIPS = 5;

export type RunStatus = 'active' | 'won' | 'lost' | 'practice';
export type WinTier = 'day-cleared' | 'deck-conquered';

export interface RunOptions {
  cardIds: readonly string[];
  deckMastered?: boolean;
  endless?: boolean;
}

export interface RunState {
  /** Reserved cards in deck order, at most RUN_CARD_CAP. */
  readonly cards: readonly string[];
  /** Reserved cards not yet cleared, in deck order. */
  readonly remaining: readonly string[];
  readonly pips: number;
  readonly status: RunStatus;
  readonly winTier: WinTier | null;
  /** Cards that already cost a pip: the per-encounter cap (D14/Q8). */
  readonly hitCards: readonly string[];
  readonly correct: number;
  readonly wrong: number;
  readonly deckMastered: boolean;
  readonly endless: boolean;
}

export interface RunSummary {
  outcome: RunStatus;
  winTier: WinTier | null;
  cardsTotal: number;
  cardsCleared: number;
  correct: number;
  wrong: number;
  hitsTaken: number;
  pipsLeft: number;
  accuracy: number | null;
}

export function startRun(opts: RunOptions): RunState {
  const ids = opts.cardIds;
  if (new Set(ids).size !== ids.length) throw new RangeError('startRun: duplicate card id');
  const cards = ids.slice(0, RUN_CARD_CAP);
  return {
    cards,
    remaining: cards,
    pips: SHIELD_PIPS,
    status: cards.length === 0 ? 'practice' : 'active',
    winTier: null,
    hitCards: [],
    correct: 0,
    wrong: 0,
    deckMastered: opts.deckMastered === true,
    endless: opts.endless === true,
  };
}

function inPlay(s: RunState, cardId: string): boolean {
  return s.status === 'active' && s.remaining.includes(cardId);
}

function winTierFor(s: RunState): WinTier {
  return s.deckMastered ? 'deck-conquered' : 'day-cleared';
}

export function recordCorrect(s: RunState, cardId: string): RunState {
  if (!inPlay(s, cardId)) return s;
  const remaining = s.remaining.filter((id) => id !== cardId);
  const won = remaining.length === 0 && !s.endless;
  return {
    ...s,
    remaining,
    correct: s.correct + 1,
    status: won ? 'won' : s.status,
    winTier: won ? winTierFor(s) : null,
  };
}

/** Costs one pip unless this card already cost one; the 5th pip lost ends the run. */
function takeHit(s: RunState, cardId: string): RunState {
  if (s.hitCards.includes(cardId)) return s;
  const pips = s.pips - 1;
  return {
    ...s,
    pips,
    hitCards: [...s.hitCards, cardId],
    status: pips <= 0 ? 'lost' : s.status,
  };
}

export function recordWrong(s: RunState, cardId: string): RunState {
  if (!inPlay(s, cardId)) return s;
  return takeHit({ ...s, wrong: s.wrong + 1 }, cardId);
}

export function recordEnemyHit(s: RunState, cardId: string): RunState {
  if (!inPlay(s, cardId)) return s;
  return takeHit(s, cardId);
}

export function pipsRemaining(s: RunState): number {
  return s.pips;
}

export function isRunOver(s: RunState): boolean {
  return s.status !== 'active';
}

export function runSummary(s: RunState): RunSummary {
  const answered = s.correct + s.wrong;
  return {
    outcome: s.status,
    winTier: s.winTier,
    cardsTotal: s.cards.length,
    cardsCleared: s.cards.length - s.remaining.length,
    correct: s.correct,
    wrong: s.wrong,
    hitsTaken: SHIELD_PIPS - s.pips,
    pipsLeft: s.pips,
    accuracy: answered === 0 ? null : s.correct / answered,
  };
}
