// Requirement: an enemy's lives are the cards left in its stack, shown to the player as
// `Cards <remaining>/<total>` (e.g. a fresh 5-card boss reads "Cards 5/5", after one card is
// knocked off "Cards 4/5").
//
// New seam (imported through the module namespace so a missing export fails readably):
//   pool.ts  livesLabel(remaining: number, total: number): string  // 'Cards r/t'
import { describe, expect, it } from 'vitest';
import * as poolModule from '../src/flashcards/pool.js';
import { createPool, damage, hp } from '../src/flashcards/pool.js';

function livesLabel(remaining: number, total: number): string {
  const f = (poolModule as unknown as Record<string, unknown>).livesLabel;
  if (typeof f !== 'function') throw new Error('pool does not export livesLabel(remaining, total)');
  return (f as (r: number, t: number) => string)(remaining, total);
}

// Covers: M2, CARDS-010
describe('stack pool: lives label', () => {
  it('reads Cards remaining/total for a fresh stack', () => {
    expect(livesLabel(5, 5)).toBe('Cards 5/5');
    expect(livesLabel(3, 3)).toBe('Cards 3/3');
  });

  it('counts down as cards are knocked off', () => {
    let pool = createPool(['a', 'b', 'c', 'd', 'e']);
    pool = damage(pool);
    expect(livesLabel(hp(pool), pool.maxHp)).toBe('Cards 4/5');
  });

  it('shows the boundaries: a single card and an emptied stack', () => {
    expect(livesLabel(1, 1)).toBe('Cards 1/1');
    expect(livesLabel(0, 4)).toBe('Cards 0/4');
  });
});
