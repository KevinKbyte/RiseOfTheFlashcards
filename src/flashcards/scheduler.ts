// Pure FSRS-6 scheduling (ts-fsrs 6.0.0): no clock reads -- every function takes an injected `now`.
// Config mirrors tests/fsrs-vectors.test.ts, which proves parity with py-fsrs for these settings.
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs';

export const DAILY_NEW_LIMIT = 12;
export const DAILY_REVIEW_LIMIT = 120;
/** Local hour at which the study day rolls over. */
const DAY_ROLLOVER_HOUR = 4;
const DAY_MS = 86_400_000;

/** 0 New, 1 Learning, 2 Review, 3 Relearning (ts-fsrs State values). */
export type FsrsState = 0 | 1 | 2 | 3;

/** Persisted per-card FSRS state; dates are ISO strings so it round-trips through JSON. */
export interface CardState {
  stability: number;
  difficulty: number;
  state: FsrsState;
  reps: number;
  lapses: number;
  due: string;
  lastReview: string;
}

/** Global (cross-deck) daily budget usage, stamped with the study day it belongs to. */
export interface DailyCounters {
  day: string;
  newCount: number;
  reviewCount: number;
}

/** The game never emits Easy (D5). */
export type Rating = 'again' | 'hard' | 'good';

export interface QueueInput {
  deck: readonly { id: string }[];
  cards: Readonly<Record<string, CardState>>;
  counters: DailyCounters | null;
  now: Date;
}

export interface Queue {
  day: string;
  reviewIds: string[];
  newIds: string[];
  ids: string[];
}

const GRADE: Record<Rating, Grade> = { again: 1, hard: 2, good: 3 };

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 365,
    enable_fuzz: false,
    // Short-term stays on: with empty step lists ts-fsrs hands (re)learning to FSRS, matching py-fsrs.
    enable_short_term: true,
    learning_steps: [],
    relearning_steps: [],
  }),
);

/** Calendar date (local) of the study day `now` falls in, as its local midnight. */
function studyDayStart(now: Date): Date {
  const offset = now.getHours() < DAY_ROLLOVER_HOUR ? 1 : 0;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Study day key `YYYY-MM-DD`; the day rolls over at 04:00 local time. */
export function studyDay(now: Date): string {
  const d = studyDayStart(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The instant the current study day ends (next 04:00 local). */
function studyDayEnd(now: Date): number {
  const d = studyDayStart(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, DAY_ROLLOVER_HOUR).getTime();
}

function reviewedToday(s: CardState, now: Date): boolean {
  return studyDay(new Date(s.lastReview)) === studyDay(now);
}

function isNew(s: CardState | undefined): boolean {
  return s === undefined || s.state === 0;
}

/** Monotone proxy for FSRS retrievability: R falls as elapsed/stability grows. */
function forgettingRatio(s: CardState, now: Date): number {
  return (now.getTime() - Date.parse(s.lastReview)) / DAY_MS / s.stability;
}

function todaysCounters(counters: DailyCounters | null, now: Date): DailyCounters {
  const day = studyDay(now);
  return counters !== null && counters.day === day ? counters : { day, newCount: 0, reviewCount: 0 };
}

function dueReviewIds(input: QueueInput, limit: number): string[] {
  const end = studyDayEnd(input.now);
  const due = input.deck
    .map((c) => ({ id: c.id, s: input.cards[c.id] }))
    .filter(({ s }) => !isNew(s) && Date.parse(s.due) < end && !reviewedToday(s, input.now))
    .map(({ id, s }) => ({ id, r: forgettingRatio(s, input.now) }));
  due.sort((a, b) => b.r - a.r);
  return due.slice(0, Math.max(0, limit)).map((d) => d.id);
}

/** Today's queue: due reviews (lowest retrievability first), then New cards in deck order. */
export function buildQueue(input: QueueInput): Queue {
  const used = todaysCounters(input.counters, input.now);
  const reviewLeft = DAILY_REVIEW_LIMIT - used.reviewCount;
  const reviewIds = dueReviewIds(input, reviewLeft);
  const newLeft = reviewIds.length < reviewLeft ? DAILY_NEW_LIMIT - used.newCount : 0;
  const newIds = input.deck
    .filter((c) => isNew(input.cards[c.id]))
    .slice(0, Math.max(0, newLeft))
    .map((c) => c.id);
  return { day: used.day, reviewIds, newIds, ids: [...reviewIds, ...newIds] };
}

function toCard(s: CardState): Card {
  const lastReview = new Date(s.lastReview);
  const due = new Date(s.due);
  return {
    due,
    stability: s.stability,
    difficulty: s.difficulty,
    scheduled_days: Math.round((due.getTime() - lastReview.getTime()) / DAY_MS),
    learning_steps: 0,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: lastReview,
  };
}

function fromCard(c: Card, now: Date): CardState {
  return {
    stability: c.stability,
    difficulty: c.difficulty,
    state: c.state as FsrsState,
    reps: c.reps,
    lapses: c.lapses,
    due: c.due.toISOString(),
    lastReview: now.toISOString(),
  };
}

/** One FSRS update; a card already rated this study day is returned unchanged (grade lock). */
export function applyRating(prev: CardState | undefined, rating: Rating, now: Date): CardState {
  if (prev !== undefined && reviewedToday(prev, now)) return prev;
  const card = prev === undefined ? createEmptyCard(now) : toCard(prev);
  return fromCard(scheduler.next(card, now, GRADE[rating]).card, now);
}

/** Count one New or Review card against today's global budget (resets on a new study day). */
export function bumpCounters(counters: DailyCounters | null, kind: 'new' | 'review', now: Date): DailyCounters {
  const c = todaysCounters(counters, now);
  return kind === 'new' ? { ...c, newCount: c.newCount + 1 } : { ...c, reviewCount: c.reviewCount + 1 };
}
