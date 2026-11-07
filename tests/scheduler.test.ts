// Requirement: spaced repetition (FSRS-6 via ts-fsrs 6.0.0, fuzz off, no learning steps) decides
// which cards the player fights today. The study day rolls over at 04:00 LOCAL time. Today's queue
// = due reviews first, lowest retrievability first, up to a global 120 reviews/day; then New cards
// in deck order, up to 12 new/day; New stops once the review cap is hit. Daily counters are global
// (shared across deck selections) and reset when the study day changes. Rating a card writes at
// most one FSRS update per card per study day (grade lock); Easy is never emitted. All functions
// are pure and take an injected `now` (no real clock).
// No spec-cache ID exists yet for FSRS scheduling; Covers tags cite plan IDs
// (docs/plans/2026-10-28-vr-flashcard-game.md D5, M14, S2).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DAILY_NEW_LIMIT,
  DAILY_REVIEW_LIMIT,
  applyRating,
  buildQueue,
  bumpCounters,
  studyDay,
  type CardState,
  type DailyCounters,
  type Rating,
} from '../src/flashcards/scheduler.js';

// Local-time constructor on purpose: study days are local, so tests stay TZ-independent.
// Dates are kept away from DST transitions (US/EU) so 24 h == one calendar day.
const at = (y: number, mo: number, d: number, h = 10, mi = 0): Date => new Date(y, mo - 1, d, h, mi);
const NOW = at(2026, 11, 7, 10, 0);
const TODAY = '2026-11-07';

const deckOf = (n: number, prefix = 'c'): { id: string }[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));

function reviewState(opts: { lastReview: Date; due: Date; stability?: number }): CardState {
  return {
    stability: opts.stability ?? 5,
    difficulty: 5,
    state: 2,
    reps: 3,
    lapses: 0,
    due: opts.due.toISOString(),
    lastReview: opts.lastReview.toISOString(),
  };
}

/** n review cards, all due yesterday, reviewed 10 days ago. */
function dueStates(n: number, prefix = 'r'): Record<string, CardState> {
  const out: Record<string, CardState> = {};
  for (let i = 0; i < n; i++) {
    out[`${prefix}${i}`] = reviewState({ lastReview: at(2026, 10, 28), due: at(2026, 11, 6) });
  }
  return out;
}

// Covers: D5
describe('studyDay rolls over at 04:00 local time', () => {
  it('03:59 still belongs to the previous study day', () => {
    expect(studyDay(at(2026, 11, 7, 3, 59))).toBe('2026-11-06');
  });
  it('04:00 starts the new study day', () => {
    expect(studyDay(at(2026, 11, 7, 4, 0))).toBe('2026-11-07');
  });
  it('midnight and 23:59 map correctly', () => {
    expect(studyDay(at(2026, 11, 7, 0, 0))).toBe('2026-11-06');
    expect(studyDay(at(2026, 11, 7, 23, 59))).toBe('2026-11-07');
  });
  it('crosses month and year boundaries', () => {
    expect(studyDay(at(2026, 12, 1, 3, 0))).toBe('2026-11-30');
    expect(studyDay(at(2027, 1, 1, 2, 0))).toBe('2026-12-31');
  });
});

// Covers: D5, M14
describe('buildQueue: daily limits', () => {
  it('exports the default 12 new / 120 reviews budget', () => {
    expect(DAILY_NEW_LIMIT).toBe(12);
    expect(DAILY_REVIEW_LIMIT).toBe(120);
  });

  it('empty deck -> empty queue stamped with the study day', () => {
    const q = buildQueue({ deck: [], cards: {}, counters: null, now: NOW });
    expect(q.day).toBe(TODAY);
    expect(q.reviewIds).toEqual([]);
    expect(q.newIds).toEqual([]);
    expect(q.ids).toEqual([]);
  });

  it('all-new deck -> first 12 in deck order', () => {
    const deck = deckOf(20);
    const q = buildQueue({ deck, cards: {}, counters: null, now: NOW });
    expect(q.reviewIds).toEqual([]);
    expect(q.newIds).toEqual(deck.slice(0, 12).map((c) => c.id));
    expect(q.ids).toEqual(q.newIds);
  });

  it('exactly 12 new -> all 12; 13 new -> 12', () => {
    expect(buildQueue({ deck: deckOf(12), cards: {}, counters: null, now: NOW }).newIds).toHaveLength(12);
    expect(buildQueue({ deck: deckOf(13), cards: {}, counters: null, now: NOW }).newIds).toHaveLength(12);
  });

  it('121 due reviews -> capped at exactly 120', () => {
    const cards = dueStates(121);
    const q = buildQueue({ deck: deckOf(121, 'r'), cards, counters: null, now: NOW });
    expect(q.reviewIds).toHaveLength(120);
  });

  it('exactly 120 due reviews hits the review cap -> no New today', () => {
    const cards = dueStates(120);
    const deck = [...deckOf(120, 'r'), ...deckOf(5, 'n')];
    const q = buildQueue({ deck, cards, counters: null, now: NOW });
    expect(q.reviewIds).toHaveLength(120);
    expect(q.newIds).toEqual([]);
  });

  it('119 due reviews -> all 119 reviews, then 12 New, reviews first', () => {
    const cards = dueStates(119);
    const deck = [...deckOf(20, 'n'), ...deckOf(119, 'r')];
    const q = buildQueue({ deck, cards, counters: null, now: NOW });
    expect(q.reviewIds).toHaveLength(119);
    expect(q.newIds).toEqual(deckOf(12, 'n').map((c) => c.id));
    expect(q.ids).toEqual([...q.reviewIds, ...q.newIds]);
  });

  it('ignores saved states for cards not in the selected deck', () => {
    const cards = dueStates(3);
    const q = buildQueue({ deck: [{ id: 'r0' }], cards, counters: null, now: NOW });
    expect(q.reviewIds).toEqual(['r0']);
  });
});

// Covers: D5
describe('buildQueue: global daily counters', () => {
  it('new already studied today reduces the new allowance (10 done -> 2 left)', () => {
    const counters: DailyCounters = { day: TODAY, newCount: 10, reviewCount: 0 };
    const q = buildQueue({ deck: deckOf(20), cards: {}, counters, now: NOW });
    expect(q.newIds).toEqual(['c0', 'c1']);
  });

  it('12 new already done today -> no New', () => {
    const counters: DailyCounters = { day: TODAY, newCount: 12, reviewCount: 0 };
    expect(buildQueue({ deck: deckOf(20), cards: {}, counters, now: NOW }).newIds).toEqual([]);
  });

  it('reviews already done reduce the review allowance; filling it stops New', () => {
    const counters: DailyCounters = { day: TODAY, newCount: 0, reviewCount: 100 };
    const deck = [...deckOf(30, 'r'), ...deckOf(5, 'n')];
    const q = buildQueue({ deck, cards: dueStates(30), counters, now: NOW });
    expect(q.reviewIds).toHaveLength(20);
    expect(q.newIds).toEqual([]);
  });

  it('reviews already done but allowance not filled -> New still offered', () => {
    const counters: DailyCounters = { day: TODAY, newCount: 0, reviewCount: 100 };
    const deck = [...deckOf(5, 'r'), ...deckOf(15, 'n')];
    const q = buildQueue({ deck, cards: dueStates(5), counters, now: NOW });
    expect(q.reviewIds).toHaveLength(5);
    expect(q.newIds).toHaveLength(12);
  });

  it('review cap already reached today -> nothing at all', () => {
    const counters: DailyCounters = { day: TODAY, newCount: 0, reviewCount: 120 };
    const deck = [...deckOf(5, 'r'), ...deckOf(5, 'n')];
    const q = buildQueue({ deck, cards: dueStates(5), counters, now: NOW });
    expect(q.ids).toEqual([]);
  });

  it('counters from a previous study day are ignored (fresh budget)', () => {
    const counters: DailyCounters = { day: '2026-11-06', newCount: 12, reviewCount: 120 };
    const q = buildQueue({ deck: deckOf(20), cards: {}, counters, now: NOW });
    expect(q.newIds).toHaveLength(12);
  });

  it('counters stamped 11-06 still apply at 03:59 on 11-07 (same study day)', () => {
    const counters: DailyCounters = { day: '2026-11-06', newCount: 12, reviewCount: 0 };
    const q = buildQueue({ deck: deckOf(20), cards: {}, counters, now: at(2026, 11, 7, 3, 59) });
    expect(q.newIds).toEqual([]);
  });
});

// Covers: D5
describe('buildQueue: due rules and review order', () => {
  it('card due at 04:00 today: not due at 03:59, due at 04:00', () => {
    const cards = { a: reviewState({ lastReview: at(2026, 11, 1), due: at(2026, 11, 7, 4, 0) }) };
    const deck = [{ id: 'a' }];
    expect(buildQueue({ deck, cards, counters: null, now: at(2026, 11, 7, 3, 59) }).reviewIds).toEqual([]);
    expect(buildQueue({ deck, cards, counters: null, now: at(2026, 11, 7, 4, 0) }).reviewIds).toEqual(['a']);
  });

  it('due before the next 04:00 counts as today; due at the next 04:00 does not', () => {
    const cards = {
      early: reviewState({ lastReview: at(2026, 11, 1), due: at(2026, 11, 8, 3, 59) }),
      later: reviewState({ lastReview: at(2026, 11, 1), due: at(2026, 11, 8, 4, 0) }),
    };
    const q = buildQueue({ deck: [{ id: 'early' }, { id: 'later' }], cards, counters: null, now: NOW });
    expect(q.reviewIds).toEqual(['early']);
  });

  it('a card already reviewed this study day is not queued again (grade lock)', () => {
    const cards = { a: reviewState({ lastReview: at(2026, 11, 7, 5, 0), due: at(2026, 11, 7, 6, 0) }) };
    expect(buildQueue({ deck: [{ id: 'a' }], cards, counters: null, now: NOW }).reviewIds).toEqual([]);
  });

  it('due reviews are ordered by lowest retrievability first', () => {
    // elapsed/stability: hi = 1 (most retained), mid = 2, lo = 5 (least retained)
    const cards = {
      hi: reviewState({ lastReview: at(2026, 11, 4), due: at(2026, 11, 6), stability: 3 }),
      lo: reviewState({ lastReview: at(2026, 10, 28), due: at(2026, 11, 6), stability: 2 }),
      mid: reviewState({ lastReview: at(2026, 10, 18), due: at(2026, 11, 6), stability: 10 }),
    };
    const q = buildQueue({ deck: [{ id: 'hi' }, { id: 'mid' }, { id: 'lo' }], cards, counters: null, now: NOW });
    expect(q.reviewIds).toEqual(['lo', 'mid', 'hi']);
  });
});

interface VectorStep {
  rating: 1 | 2 | 3 | 4;
  review: string;
  expect: { state: number; stability: number; difficulty: number; due: string };
}
interface VectorCase {
  id: string;
  steps: VectorStep[];
}
const vectors = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/fsrs/vectors.json', import.meta.url)), 'utf8'),
) as { cases: VectorCase[] };
const RATING: Record<number, Rating> = { 1: 'again', 2: 'hard', 3: 'good' };
// Easy is never emitted by the game (D5), so cases that use rating 4 are out of scope here.
const replayable = vectors.cases.filter((c) => c.steps.every((s) => s.rating !== 4));

// Covers: D5, S2
describe('applyRating wraps FSRS-6 (parity with the py-fsrs vectors)', () => {
  it('has replayable (Again/Hard/Good-only) vector cases', () => {
    expect(replayable.length).toBeGreaterThanOrEqual(5);
  });

  for (const c of replayable) {
    it(`replays case ${c.id}`, () => {
      let card: CardState | undefined;
      c.steps.forEach((step, i) => {
        const where = `case ${c.id} step ${i}`;
        card = applyRating(card, RATING[step.rating], new Date(step.review));
        expect(card.state, `${where}: state`).toBe(step.expect.state);
        const relS = Math.abs(card.stability - step.expect.stability) / step.expect.stability;
        expect(relS, `${where}: stability ${card.stability}`).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(card.difficulty - step.expect.difficulty), `${where}: difficulty`).toBeLessThanOrEqual(1e-4);
        expect(Math.floor(Date.parse(card.due) / 1000), `${where}: due ${card.due}`).toBe(
          Math.floor(Date.parse(step.expect.due) / 1000),
        );
        expect(card.lastReview, `${where}: lastReview`).toBe(new Date(step.review).toISOString());
        expect(card.reps, `${where}: reps`).toBe(i + 1);
      });
    });
  }
});

// Covers: D5
describe('applyRating: grade lock and purity', () => {
  it('a brand-new card rated Good becomes a Review card due on a later study day', () => {
    const s = applyRating(undefined, 'good', NOW);
    expect(s.state).toBe(2);
    expect(s.reps).toBe(1);
    expect(s.lapses).toBe(0);
    expect(s.lastReview).toBe(NOW.toISOString());
    expect(studyDay(new Date(s.due)) > TODAY).toBe(true);
  });

  it('Again on a Review card counts a lapse', () => {
    const first = applyRating(undefined, 'good', at(2026, 11, 1));
    const lapsed = applyRating(first, 'again', NOW);
    expect(lapsed.lapses).toBe(first.lapses + 1);
    expect(lapsed.reps).toBe(first.reps + 1);
  });

  it('a second rating in the same study day is ignored (max one FSRS write per card per day)', () => {
    const first = applyRating(undefined, 'good', NOW);
    expect(applyRating(first, 'again', at(2026, 11, 7, 22, 0))).toEqual(first);
    expect(applyRating(first, 'again', at(2026, 11, 8, 3, 59))).toEqual(first);
  });

  it('the lock lifts at the next 04:00', () => {
    const first = applyRating(undefined, 'good', NOW);
    const second = applyRating(first, 'again', at(2026, 11, 8, 4, 0));
    expect(second.reps).toBe(2);
    expect(second.lastReview).toBe(at(2026, 11, 8, 4, 0).toISOString());
  });

  it('does not mutate the input state', () => {
    const first = Object.freeze(applyRating(undefined, 'good', at(2026, 11, 1)));
    const snapshot = { ...first };
    applyRating(first, 'hard', NOW);
    expect(first).toEqual(snapshot);
  });
});

// Covers: D5
describe('bumpCounters: global daily counters', () => {
  it('starts a fresh counter from null', () => {
    expect(bumpCounters(null, 'new', NOW)).toEqual({ day: TODAY, newCount: 1, reviewCount: 0 });
    expect(bumpCounters(null, 'review', NOW)).toEqual({ day: TODAY, newCount: 0, reviewCount: 1 });
  });

  it('accumulates within the same study day', () => {
    const c: DailyCounters = { day: TODAY, newCount: 3, reviewCount: 7 };
    expect(bumpCounters(c, 'review', NOW)).toEqual({ day: TODAY, newCount: 3, reviewCount: 8 });
    expect(c.reviewCount).toBe(7);
  });

  it('resets when the study day changed', () => {
    const c: DailyCounters = { day: '2026-11-06', newCount: 12, reviewCount: 120 };
    expect(bumpCounters(c, 'new', NOW)).toEqual({ day: TODAY, newCount: 1, reviewCount: 0 });
  });

  it('03:59 still bumps the previous study day', () => {
    const c: DailyCounters = { day: '2026-11-06', newCount: 2, reviewCount: 0 };
    expect(bumpCounters(c, 'new', at(2026, 11, 7, 3, 59))).toEqual({ day: '2026-11-06', newCount: 3, reviewCount: 0 });
  });
});
