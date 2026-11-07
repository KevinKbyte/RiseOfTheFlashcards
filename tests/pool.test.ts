// Requirement: bigger enemies are multi-card health pools (M2). An enemy's health is the stack of
// flashcards it carries: its hit points are the cards left, the front card is the one being answered,
// and each correct answer (voice or orb) strips exactly one card (D4 "-1 card"; D11 "one correct answer
// strips one card"). The enemy is defeated when its last card is stripped. Damage never heals, a
// defeated pool takes no more damage, and overkill stops at zero. Pool sizes for a run are planned
// deterministically so every reserved card belongs to exactly one enemy: by default every third enemy
// is a 2-card enemy and the rest carry one card (spec names no sizes; agent default, tunable).
//
// API contract for src/flashcards/pool.ts (pure, immutable, no three.js/DOM):
//   export const BIG_POOL_SIZE = 2;    // cards on a bigger enemy (default)
//   export const BIG_POOL_EVERY = 3;   // every Nth spawned enemy is a bigger one (default)
//   export interface Pool { readonly cards: readonly string[]; readonly maxHp: number }
//     cards = remaining card ids, current card first; maxHp = initial card count.
//   createPool(cards: readonly string[]): Pool       // RangeError on empty or duplicate ids
//   hp(pool): number                                  // cards left
//   currentCard(pool): string | null                  // front card, null once defeated
//   isDefeated(pool): boolean                         // hp === 0
//   damage(pool, amount = 1): Pool
//     strips `amount` cards from the front; amount <= 0 or a defeated pool -> same object;
//     overkill clamps to 0 cards; RangeError when amount is not a finite integer.
//   planPoolSizes(cardCount: number, opts?: { bigSize?: number; bigEvery?: number }): number[]
//     spawn-order sizes summing to cardCount; spawn index i (0-based) gets bigSize when
//     (i + 1) % bigEvery === 0, else 1; the last enemy is truncated to the cards left.
//     RangeError when cardCount is not an integer >= 0 or bigSize/bigEvery are not integers >= 1.
// No input is ever mutated.
import { describe, expect, it } from 'vitest';
import {
  BIG_POOL_EVERY,
  BIG_POOL_SIZE,
  createPool,
  currentCard,
  damage,
  hp,
  isDefeated,
  planPoolSizes,
} from '../src/flashcards/pool.js';

// Covers: M2, D4
describe('pool: multi-card health pool', () => {
  it('a new pool has one hit point per card, current card first', () => {
    const p = createPool(['a', 'b', 'c']);
    expect(p.maxHp).toBe(3);
    expect(hp(p)).toBe(3);
    expect(p.cards).toEqual(['a', 'b', 'c']);
    expect(currentCard(p)).toBe('a');
    expect(isDefeated(p)).toBe(false);
  });

  it('a single-card pool is the ordinary one-card enemy', () => {
    const p = createPool(['a']);
    expect(hp(p)).toBe(1);
    expect(isDefeated(damage(p))).toBe(true);
  });

  it('rejects an empty pool and duplicate card ids with a RangeError', () => {
    expect(() => createPool([])).toThrow(RangeError);
    expect(() => createPool(['a', 'b', 'a'])).toThrow(RangeError);
  });

  it('one correct answer (default damage 1) strips exactly the current card', () => {
    const p = damage(createPool(['a', 'b', 'c']));
    expect(hp(p)).toBe(2);
    expect(p.cards).toEqual(['b', 'c']);
    expect(currentCard(p)).toBe('b');
    expect(p.maxHp).toBe(3);
    expect(isDefeated(p)).toBe(false);
  });

  it('is defeated only when the last card is stripped', () => {
    let p = createPool(['a', 'b']);
    p = damage(p);
    expect(isDefeated(p)).toBe(false);
    p = damage(p);
    expect(isDefeated(p)).toBe(true);
    expect(hp(p)).toBe(0);
    expect(p.cards).toEqual([]);
    expect(currentCard(p)).toBeNull();
  });

  it('overkill clamps to zero hit points', () => {
    const p = damage(createPool(['a', 'b']), 5);
    expect(hp(p)).toBe(0);
    expect(isDefeated(p)).toBe(true);
    expect(p.maxHp).toBe(2);
  });

  it('damage greater than 1 strips that many cards from the front', () => {
    const p = damage(createPool(['a', 'b', 'c', 'd']), 2);
    expect(p.cards).toEqual(['c', 'd']);
  });

  it.each([0, -1, -3])('damage %s never heals: same object returned', (amount) => {
    const p = damage(createPool(['a', 'b', 'c']));
    expect(damage(p, amount)).toBe(p);
  });

  it('a defeated pool takes no more damage: same object returned', () => {
    const p = damage(createPool(['a']));
    expect(damage(p)).toBe(p);
    expect(damage(p, 3)).toBe(p);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-integer damage %s with a RangeError',
    (amount) => {
      expect(() => damage(createPool(['a', 'b']), amount)).toThrow(RangeError);
    },
  );

  it('does not mutate the input pool or card array', () => {
    const cards = ['a', 'b', 'c'];
    const p = createPool(cards);
    const before = structuredClone(p);
    damage(p, 2);
    expect(p).toEqual(before);
    expect(cards).toEqual(['a', 'b', 'c']);
  });
});

// Covers: M2
describe('pool: planned pool sizes for a run', () => {
  it('defaults: every third enemy is a 2-card enemy', () => {
    expect(BIG_POOL_SIZE).toBe(2);
    expect(BIG_POOL_EVERY).toBe(3);
    expect(planPoolSizes(12)).toEqual([1, 1, 2, 1, 1, 2, 1, 1, 2]);
  });

  it('the sizes always sum to the card count so every card is on exactly one enemy', () => {
    for (let n = 0; n <= 30; n++) {
      const sizes = planPoolSizes(n);
      expect(sizes.reduce((a, b) => a + b, 0), `n=${n}`).toBe(n);
      for (const s of sizes) expect(s, `n=${n}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('the last enemy is truncated to the cards left', () => {
    expect(planPoolSizes(3)).toEqual([1, 1, 1]);
    expect(planPoolSizes(4)).toEqual([1, 1, 2]);
    expect(planPoolSizes(6)).toEqual([1, 1, 2, 1, 1]);
  });

  it('zero cards plan zero enemies', () => {
    expect(planPoolSizes(0)).toEqual([]);
  });

  it('honours custom bigSize and bigEvery', () => {
    expect(planPoolSizes(10, { bigSize: 3, bigEvery: 2 })).toEqual([1, 3, 1, 3, 1, 1]);
    expect(planPoolSizes(4, { bigEvery: 1 })).toEqual([2, 2]);
    expect(planPoolSizes(4, { bigSize: 1 })).toEqual([1, 1, 1, 1]);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects cardCount %s with a RangeError', (n) => {
    expect(() => planPoolSizes(n)).toThrow(RangeError);
  });

  it.each([0, -2, 1.5, Number.NaN])('rejects bigSize or bigEvery %s with a RangeError', (v) => {
    expect(() => planPoolSizes(6, { bigSize: v })).toThrow(RangeError);
    expect(() => planPoolSizes(6, { bigEvery: v })).toThrow(RangeError);
  });
});
