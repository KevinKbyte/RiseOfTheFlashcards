// Pure presentation decisions for a wave transition (M2): which card, if any, becomes newly current
// and must be presented, and what a correct answer did to the target. No three.js/DOM; never mutates.
import { currentCard } from './pool.js';
import { isWaveCleared, type Wave } from './wave.js';

export type CorrectOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'peeled'; readonly enemyId: string; readonly presentCardId: string }
  | { readonly kind: 'defeated'; readonly enemyId: string; readonly waveCleared: boolean };

function targetCard(wave: Wave): string | null {
  const id = wave.targetId;
  const target = id === null ? undefined : wave.active.find((e) => e.id === id);
  return target === undefined ? null : currentCard(target.pool);
}

/** The after-wave target's current card when the target or its current card changed, else null. */
export function cardToPresent(before: Wave, after: Wave): string | null {
  const card = targetCard(after);
  if (card === null) return null;
  return after.targetId !== before.targetId || card !== targetCard(before) ? card : null;
}

/** Classifies `after = answerTarget(before, true)`: a peel keeps the target, a defeat removes it. */
export function correctOutcome(before: Wave, after: Wave): CorrectOutcome {
  const enemyId = before.targetId;
  if (enemyId === null) return { kind: 'none' };
  if (!after.active.some((e) => e.id === enemyId)) {
    return { kind: 'defeated', enemyId, waveCleared: isWaveCleared(after) };
  }
  const presentCardId = after.targetId === enemyId ? cardToPresent(before, after) : null;
  return presentCardId === null ? { kind: 'none' } : { kind: 'peeled', enemyId, presentCardId };
}
