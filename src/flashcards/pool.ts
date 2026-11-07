// Pure multi-card health pool (M2): an enemy's hit points are the flashcards it still carries, the
// front card is the one being answered, and each correct answer strips one card. No three.js/DOM;
// every function returns a new pool (or the same object when nothing changes) and never mutates.

/** D19: the last graded wave is one boss pool of this many cards (also the D14 max pool size). */
export const BOSS_POOL_SIZE = 3;

export interface Pool {
  /** Remaining card ids, current card first. */
  readonly cards: readonly string[];
  /** Initial card count. */
  readonly maxHp: number;
}

export function createPool(cards: readonly string[]): Pool {
  if (cards.length === 0) throw new RangeError('a pool needs at least one card');
  if (new Set(cards).size !== cards.length) throw new RangeError('pool contains a duplicate card id');
  return { cards: cards.slice(), maxHp: cards.length };
}

export function hp(pool: Pool): number {
  return pool.cards.length;
}

export function currentCard(pool: Pool): string | null {
  return pool.cards[0] ?? null;
}

export function isDefeated(pool: Pool): boolean {
  return hp(pool) === 0;
}

export function damage(pool: Pool, amount = 1): Pool {
  if (!Number.isInteger(amount)) throw new RangeError(`damage must be a finite integer, got ${amount}`);
  if (amount <= 0 || isDefeated(pool)) return pool;
  return { cards: pool.cards.slice(amount), maxHp: pool.maxHp };
}

/**
 * Spawn-order pool sizes summing to cardCount (D19 wave packing): pools of 1-3, non-decreasing,
 * ending in one 3-card boss once cardCount >= 3. The pre-boss cards open with a [1, 2] wave and
 * continue in 3s, so a multiple of 3 packs into whole 3-card waves; a remainder of 1 or 2 widens the
 * opening ramp ([1, 1, 2] / [1, 2, 2]) instead of breaking the ramp.
 */
export function planPoolSizes(cardCount: number): number[] {
  if (!Number.isInteger(cardCount) || cardCount < 0) {
    throw new RangeError(`cardCount must be an integer >= 0, got ${cardCount}`);
  }
  const boss = cardCount >= BOSS_POOL_SIZE ? [BOSS_POOL_SIZE] : [];
  const rest = cardCount - boss.length * BOSS_POOL_SIZE;
  const fullWaves = Math.floor(rest / 3);
  const extra = rest % 3;
  if (fullWaves === 0) return [...Array<number>(extra).fill(1), ...boss];
  const ramp = extra === 0 ? [1, 2] : extra === 1 ? [1, 1, 2] : [1, 2, 2];
  return [...ramp, ...Array<number>(fullWaves - 1).fill(3), ...boss];
}
