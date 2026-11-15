// Pure multi-card health pool (M2): an enemy's hit points are the flashcards it still carries, the
// front card is the one being answered, and each correct answer strips one card. No three.js/DOM;
// every function returns a new pool (or the same object when nothing changes) and never mutates.

/** D19: the final enemy (boss) carries this many cards (also the D14 max pool size). */
export const BOSS_POOL_SIZE = 5;

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

/** Cards per regular (non-boss) stack. */
const STACK_SIZE = 3;
/** Below this many cards a run has no boss: a 5-card boss needs at least one regular stack before it. */
const BOSS_MIN_CARDS = BOSS_POOL_SIZE + STACK_SIZE;

/**
 * Spawn-order stack sizes summing to cardCount (D19, stacks fought one at a time): regular stacks of
 * 3, then one 5-card boss once cardCount >= 8. A leftover 1 card joins the last regular stack (4); a
 * leftover 2 is its own stack, placed first.
 */
export function planPoolSizes(cardCount: number): number[] {
  if (!Number.isInteger(cardCount) || cardCount < 0) {
    throw new RangeError(`cardCount must be an integer >= 0, got ${cardCount}`);
  }
  const boss = cardCount >= BOSS_MIN_CARDS ? [BOSS_POOL_SIZE] : [];
  const rest = cardCount - boss.length * BOSS_POOL_SIZE;
  const regular = Array<number>(Math.floor(rest / STACK_SIZE)).fill(STACK_SIZE);
  const extra = rest % STACK_SIZE;
  if (extra === 2) regular.unshift(2);
  else if (extra === 1 && regular.length > 0) regular[regular.length - 1] += 1;
  else if (extra === 1) regular.push(1);
  return [...regular, ...boss];
}

/** HUD lives text for a stack: the cards it still carries out of its starting count. */
export function livesLabel(remaining: number, total: number): string {
  return `Cards ${remaining}/${total}`;
}
