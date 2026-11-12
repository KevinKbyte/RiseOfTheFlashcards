// A frame's slash targets (CARDS-010, M1). With no revealed target every active enemy is a target
// (reveal early) and so are the orbs; while the target answers only the orbs are; while it is stunned
// its card is answered, so only the target enemy is and a finishing swing is never spent on a dead orb.
// Pure.
import type { Wave } from './wave';

export function slashTargets<O>(wave: Wave, orbs: readonly O[]): { orbs: readonly O[]; enemyIds: string[] } {
  const target = wave.targetId === null ? undefined : wave.active.find((e) => e.id === wave.targetId);
  if (target === undefined) return { orbs, enemyIds: wave.active.map((e) => e.id) };
  if (target.enc.phase === 'stunned') return { orbs: [], enemyIds: [target.id] };
  return { orbs, enemyIds: [] };
}
