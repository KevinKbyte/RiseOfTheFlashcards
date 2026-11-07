// Requirement: bigger enemies are multi-card health pools (M2). An enemy's health is the stack of
// flashcards it carries: its hit points are the cards left, the front card is the one being answered,
// and each correct answer (voice or orb) strips exactly one card (D4 "-1 card"; D11 "one correct answer
// strips one card"). The enemy is defeated when its last card is stripped. Damage never heals, a
// defeated pool takes no more damage, and overkill stops at zero. Pool sizes for a run are planned
// deterministically so every reserved card belongs to exactly one enemy, per D19 wave packing: pools
// carry 1-3 cards (D14), graded waves hold 3 cards each (12 -> 4 waves, 6 -> 2), pool size ramps
// 1 -> 2 -> 3, and the last graded wave is one 3-card boss.
//
// API contract for src/flashcards/pool.ts (pure, immutable, no three.js/DOM):
//   export interface Pool { readonly cards: readonly string[]; readonly maxHp: number }
//     cards = remaining card ids, current card first; maxHp = initial card count.
//   createPool(cards: readonly string[]): Pool       // RangeError on empty or duplicate ids
//   hp(pool): number                                  // cards left
//   currentCard(pool): string | null                  // front card, null once defeated
//   isDefeated(pool): boolean                         // hp === 0
//   damage(pool, amount = 1): Pool
//     strips `amount` cards from the front; amount <= 0 or a defeated pool -> same object;
//     overkill clamps to 0 cards; RangeError when amount is not a finite integer.
//   planPoolSizes(cardCount: number): number[]
//     spawn-order sizes summing to cardCount, each 1..3, non-decreasing (ramp); for a multiple of 3
//     no pool straddles a 3-card wave; cardCount >= 3 ends in one 3-card pool (the boss).
//     RangeError when cardCount is not an integer >= 0.
// No input is ever mutated.
import { describe, expect, it } from 'vitest';
import {
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

// Covers: M2, D14, D19
describe('pool: planned pool sizes for a run (D19 wave packing)', () => {
  const RUN_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  function prefixSums(sizes: readonly number[]): number[] {
    let acc = 0;
    return sizes.map((x) => (acc += x));
  }

  it.each(RUN_SIZES)('n=%i: sizes sum to n and every pool carries 1-3 cards', (n) => {
    const sizes = planPoolSizes(n);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
    for (const x of sizes) {
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(3);
    }
  });

  it.each(RUN_SIZES)('n=%i: pool size never shrinks along spawn order (ramp 1 -> 2 -> 3)', (n) => {
    const sizes = planPoolSizes(n);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i], `index ${i} of ${sizes}`).toBeGreaterThanOrEqual(sizes[i - 1]);
  });

  it.each(RUN_SIZES.filter((n) => n >= 3))('n=%i: the last graded wave is one 3-card boss pool', (n) => {
    expect(planPoolSizes(n).at(-1)).toBe(3);
  });

  it.each(RUN_SIZES.filter((n) => n >= 4))('n=%i: the ramp starts with a 1-card enemy', (n) => {
    expect(planPoolSizes(n)[0]).toBe(1);
  });

  it.each([
    [3, 1],
    [6, 2],
    [9, 3],
    [12, 4],
  ])('n=%i packs into %i waves of 3: no pool straddles a wave boundary', (n, waves) => {
    const sums = prefixSums(planPoolSizes(n));
    const boundaries = Array.from({ length: waves }, (_, w) => 3 * (w + 1));
    for (const b of boundaries) expect(sums, `wave boundary ${b}`).toContain(b);
  });

  it('6 cards = 2 waves ramping 1 -> 2 -> 3: [1, 2] then the 3-card boss', () => {
    expect(planPoolSizes(6)).toEqual([1, 2, 3]);
  });

  it('12 cards ramp through every tier: a 1-card, a 2-card and a 3-card enemy', () => {
    const sizes = planPoolSizes(12);
    expect(sizes).toContain(1);
    expect(sizes).toContain(2);
    expect(sizes.at(-1)).toBe(3);
  });

  it('the smallest runs: 1 card is one 1-card enemy, 3 cards are one 3-card boss, 4 cards are [1, 3]', () => {
    expect(planPoolSizes(1)).toEqual([1]);
    expect(planPoolSizes(3)).toEqual([3]);
    expect(planPoolSizes(4)).toEqual([1, 3]);
  });

  it('zero cards plan zero enemies', () => {
    expect(planPoolSizes(0)).toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects cardCount %s with a RangeError', (n) => {
    expect(() => planPoolSizes(n)).toThrow(RangeError);
  });
});
