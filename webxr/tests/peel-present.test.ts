// Requirement: every new current card is presented to the player exactly once (M2). Revealing an
// enemy presents its front card; a correct answer that peels a multi-card enemy keeps it as the target
// and presents its next card as a new encounter; a correct answer on the last card defeats the enemy
// (it leaves the wave, nothing is presented) and may clear the wave. A wrong answer (retry) and a
// strike/hit flash leave the same card current, so they never present it again.
//
// API contract for src/flashcards/peel-present.ts (pure, no three.js/DOM; extracted from the
// onCorrectAnswer / presentTarget decision in src/cards.ts):
//   cardToPresent(before: Wave, after: Wave): string | null
//     the after-wave target's current card id when the target or its current card changed between
//     before and after; null when there is no target after, or the same card is still current.
//   correctOutcome(before: Wave, after: Wave): CorrectOutcome   // after = slash after stun
//     { kind: 'none' }                                        no target before, or nothing changed
//     { kind: 'peeled'; enemyId; presentCardId }              same target, next card now current
//     { kind: 'defeated'; enemyId; waveCleared: boolean }     target left the wave
// Neither function mutates its inputs.
import { describe, expect, it } from 'vitest';
import { correctOutcome, cardToPresent } from '../src/flashcards/peel-present.js';
import { answerTarget, createWave, revealEnemy, tickWave, type Wave } from '../src/flashcards/wave.js';
import * as waveModule from '../src/flashcards/wave.js';

/** A correct answer stuns the target; the finishing slash knocks its top card off. */
function answerAndFinish(w: Wave): Wave {
  const answered = answerTarget(w, true);
  if (answered.targetId === null) return answered;
  const slash = (waveModule as unknown as { slashEnemy?: (w: Wave, id: string) => Wave }).slashEnemy;
  if (typeof slash !== 'function') throw new Error('wave does not export slashEnemy(wave, id)');
  return slash(answered, answered.targetId);
}

/** Creep to the strike point (telegraph), then let the telegraph land one hit. */
function strike(w: Wave): Wave {
  return tickWave(tickWave(w, 100), 100);
}

/** One 3-card enemy, revealed. */
function revealedPool(): Wave {
  return revealEnemy(createWave(['a', 'b', 'c'], { poolSizes: [3] }), 'a');
}

// Covers: M2, CARDS-010
describe('peel-present: cardToPresent (one presented event per new current card)', () => {
  it('revealing an enemy presents its front card', () => {
    const before = createWave(['a', 'b', 'c'], { poolSizes: [3] });
    expect(cardToPresent(before, revealEnemy(before, 'a'))).toBe('a');
  });

  it('a correct answer that peels a pool presents the next card', () => {
    const before = revealedPool();
    expect(cardToPresent(before, answerAndFinish(before))).toBe('b');
  });

  it('a wrong answer (retry) presents nothing: the same card is still current', () => {
    const before = revealedPool();
    expect(cardToPresent(before, answerTarget(before, false))).toBeNull();
  });

  it('a strike / hit flash presents nothing: a landed strike keeps the same card', () => {
    const before = revealedPool();
    const after = strike(before);
    expect(after.active.find((e) => e.id === 'a')?.enc.hits ?? 0).toBeGreaterThan(0);
    expect(cardToPresent(before, after)).toBeNull();
  });

  it('a repaint of an unchanged wave presents nothing', () => {
    const w = revealedPool();
    expect(cardToPresent(w, w)).toBeNull();
  });

  it('defeating the last card presents nothing (no target remains)', () => {
    let w = revealedPool();
    w = answerAndFinish(answerAndFinish(w));
    expect(cardToPresent(w, answerAndFinish(w))).toBeNull();
  });

  it('a full fight presents each pool card exactly once, in order', () => {
    const shown: string[] = [];
    let w = createWave(['a', 'b', 'c'], { poolSizes: [3] });
    const go = (next: Wave) => {
      const id = cardToPresent(w, next);
      if (id !== null) shown.push(id);
      w = next;
    };
    go(revealEnemy(w, 'a'));
    go(answerTarget(w, false));
    go(strike(w));
    go(answerAndFinish(w));
    go(answerTarget(w, false));
    go(w);
    go(answerAndFinish(w));
    go(strike(w));
    go(answerAndFinish(w));
    expect(shown).toEqual(['a', 'b', 'c']);
  });
});

// Covers: M2, CARDS-010
describe('peel-present: correctOutcome (peel keeps the target, defeat removes it)', () => {
  it('a peel keeps the enemy as the target and presents its next card', () => {
    const before = revealedPool();
    expect(correctOutcome(before, answerAndFinish(before))).toEqual({
      kind: 'peeled',
      enemyId: 'a',
      presentCardId: 'b',
    });
  });

  it('the last card defeats the enemy; the wave is cleared when nothing else remains', () => {
    const before = answerAndFinish(answerAndFinish(revealedPool()));
    expect(correctOutcome(before, answerAndFinish(before))).toEqual({
      kind: 'defeated',
      enemyId: 'a',
      waveCleared: true,
    });
  });

  it('a defeated enemy with more cards queued does not clear the wave', () => {
    const before = revealEnemy(createWave(['a', 'b'], { poolSizes: [1, 1], maxActive: 1 }), 'a');
    expect(correctOutcome(before, answerAndFinish(before))).toEqual({
      kind: 'defeated',
      enemyId: 'a',
      waveCleared: false,
    });
  });

  it('a single-card enemy is defeated, never peeled', () => {
    const before = revealEnemy(createWave(['a', 'b', 'c'], { maxActive: 3 }), 'b');
    const out = correctOutcome(before, answerAndFinish(before));
    expect(out).toEqual({ kind: 'defeated', enemyId: 'b', waveCleared: false });
  });

  it('no target before means no outcome', () => {
    const w = createWave(['a', 'b', 'c']);
    expect(correctOutcome(w, answerAndFinish(w))).toEqual({ kind: 'none' });
  });

  it('an unchanged wave (wrong answer) is no outcome', () => {
    const before = revealedPool();
    expect(correctOutcome(before, answerTarget(before, false))).toEqual({ kind: 'none' });
  });

  it('does not mutate either wave', () => {
    const before = revealedPool();
    const after = answerAndFinish(before);
    const snapB = JSON.stringify(before);
    const snapA = JSON.stringify(after);
    correctOutcome(before, after);
    cardToPresent(before, after);
    expect(JSON.stringify(before)).toBe(snapB);
    expect(JSON.stringify(after)).toBe(snapA);
  });
});
