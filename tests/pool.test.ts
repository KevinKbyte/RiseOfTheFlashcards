// Requirement: bigger enemies are multi-card health pools (M2). An enemy's health is the stack of
// flashcards it carries: its hit points are the cards left, the front card is the one being answered,
// and each correct answer (voice or orb) strips exactly one card (D4 "-1 card"; D11 "one correct answer
// strips one card"). The enemy is defeated when its last card is stripped. Damage never heals, a
// defeated pool takes no more damage, and overkill stops at zero. Pool sizes for a run are planned
// deterministically so every reserved card belongs to exactly one enemy, as stacks fought one at a
// time: regular stacks carry 3 cards and the final enemy (boss) carries 5. With 8 or more cards the
// last stack is the 5-card boss and the rest are 3s; under 8 cards there is no boss, only 3s. A
// leftover 1 card joins the last regular stack (4); a leftover 2 is its own stack, placed first.
// Examples: 12 -> 3,4,5; 13 -> 2,3,3,5; 11 -> 3,3,5; 8 -> 3,5; 7 -> 3,4; 5 -> 2,3; 4 -> 4;
// 20 -> 3,3,3,3,3,5; 1 -> 1; 2 -> 2; 0 -> [].
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
//     spawn-order stack sizes summing to cardCount per the stack rule above.
//     export const BOSS_POOL_SIZE = 5;
//     RangeError when cardCount is not an integer >= 0.
// No input is ever mutated.
import { describe, expect, it } from 'vitest';
import {
  BOSS_POOL_SIZE,
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
describe('pool: planned stack sizes for a run (one stack at a time, 5-card boss)', () => {
  const RUN_SIZES = Array.from({ length: 30 }, (_, i) => i + 1);

  it('the boss stack carries 5 cards', () => {
    expect(BOSS_POOL_SIZE).toBe(5);
  });

  it.each([
    [12, [3, 4, 5]],
    [13, [2, 3, 3, 5]],
    [11, [3, 3, 5]],
    [8, [3, 5]],
    [7, [3, 4]],
    [5, [2, 3]],
    [4, [4]],
    [20, [3, 3, 3, 3, 3, 5]],
    [1, [1]],
    [2, [2]],
  ])('n=%i packs into %j', (n, expected) => {
    expect(planPoolSizes(n)).toEqual(expected);
  });

  it.each(RUN_SIZES)('n=%i: sizes sum to n', (n) => {
    expect(planPoolSizes(n).reduce((a, b) => a + b, 0)).toBe(n);
  });

  it.each(RUN_SIZES.filter((n) => n >= 8))('n=%i: the last stack is the 5-card boss, the only one', (n) => {
    const sizes = planPoolSizes(n);
    expect(sizes.at(-1)).toBe(5);
    expect(sizes.filter((x) => x === 5)).toHaveLength(1);
  });

  it.each(RUN_SIZES.filter((n) => n < 8))('n=%i: under 8 cards there is no 5-card boss', (n) => {
    expect(planPoolSizes(n)).not.toContain(5);
  });

  it.each(RUN_SIZES.filter((n) => n >= 3))(
    'n=%i: regular stacks are 3s except one leftover (a 4 last or a 2 first)',
    (n) => {
      const sizes = planPoolSizes(n);
      const regular = n >= 8 ? sizes.slice(0, -1) : sizes;
      const odd = regular.map((x, i) => [x, i] as const).filter(([x]) => x !== 3);
      expect(odd.length, `sizes ${sizes}`).toBeLessThanOrEqual(1);
      for (const [x, i] of odd) {
        if (x === 4) expect(i, `sizes ${sizes}`).toBe(regular.length - 1);
        else if (x === 2) expect(i, `sizes ${sizes}`).toBe(0);
        else throw new Error(`unexpected regular stack ${x} in ${sizes}`);
      }
    },
  );

  it('zero cards plan zero enemies', () => {
    expect(planPoolSizes(0)).toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects cardCount %s with a RangeError', (n) => {
    expect(() => planPoolSizes(n)).toThrow(RangeError);
  });
});
