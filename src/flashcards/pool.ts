// Pure multi-card health pool (M2): an enemy's hit points are the flashcards it still carries, the
// front card is the one being answered, and each correct answer strips one card. No three.js/DOM;
// every function returns a new pool (or the same object when nothing changes) and never mutates.

/** Cards on a bigger enemy (spec names no size; agent default, tunable). */
export const BIG_POOL_SIZE = 2;
/** Every Nth spawned enemy is a bigger one. */
export const BIG_POOL_EVERY = 3;

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

function requirePositiveInt(name: string, v: number): void {
  if (!Number.isInteger(v) || v < 1) throw new RangeError(`${name} must be an integer >= 1, got ${v}`);
}

/** Spawn-order pool sizes summing to cardCount, so every card belongs to exactly one enemy. */
export function planPoolSizes(cardCount: number, opts: { bigSize?: number; bigEvery?: number } = {}): number[] {
  const bigSize = opts.bigSize ?? BIG_POOL_SIZE;
  const bigEvery = opts.bigEvery ?? BIG_POOL_EVERY;
  if (!Number.isInteger(cardCount) || cardCount < 0) {
    throw new RangeError(`cardCount must be an integer >= 0, got ${cardCount}`);
  }
  requirePositiveInt('bigSize', bigSize);
  requirePositiveInt('bigEvery', bigEvery);
  const sizes: number[] = [];
  let left = cardCount;
  while (left > 0) {
    const size = Math.min((sizes.length + 1) % bigEvery === 0 ? bigSize : 1, left);
    sizes.push(size);
    left -= size;
  }
  return sizes;
}
