// Requirement: a slash swing takes the first target sphere it enters and then cools down, so the
// frame's slash targets decide what a swing can be spent on. With no revealed target every active
// enemy is a slash target (reveal early) and the answer orbs are too. While the target is answering
// (revealed, not stunned) only the orbs are targets. While the target is STUNNED its card is already
// answered: the target enemy is the only slash target and NO orb is, so a finishing swing that
// crosses a dead answer orb on the way is never used up on it.
//
// New seam (src/flashcards/slash-targets.ts, imported through the module namespace so a missing
// export, once the module exists, fails each test with a readable message):
//   slashTargets<O>(wave: Wave, orbs: readonly O[]): { orbs: readonly O[]; enemyIds: string[] }
// cards.ts collectSlash passes both results straight into CardSlash.step.
import { describe, expect, it } from 'vitest';
import * as targetsModule from '../src/flashcards/slash-targets.js';
import { ENCOUNTER_DEFAULTS } from '../src/flashcards/encounter.js';
import { answerTarget, createWave, revealEnemy, type Wave } from '../src/flashcards/wave.js';

type Targets<O> = { orbs: readonly O[]; enemyIds: string[] };

function slashTargets<O>(wave: Wave, orbs: readonly O[]): Targets<O> {
  const f = (targetsModule as unknown as Record<string, unknown>).slashTargets;
  if (typeof f !== 'function') throw new Error('slash-targets does not export slashTargets(wave, orbs)');
  return (f as (w: Wave, o: readonly O[]) => Targets<O>)(wave, orbs);
}

const NEAR = Object.freeze({ ...ENCOUNTER_DEFAULTS, spawnDistance: ENCOUNTER_DEFAULTS.knockbackDistance });
const ORBS = ['orb1', 'orb2', 'orb3'] as const;

function revealed(): Wave {
  return revealEnemy(createWave(['a', 'b', 'c'], { poolSizes: [1, 2], maxActive: 2, cfg: NEAR }), 'a');
}

// Covers: CARDS-010, M1
describe('slashTargets: orbs are not slash targets while the target is stunned', () => {
  it('stunned target: no orbs, only the target enemy', () => {
    const t = slashTargets(answerTarget(revealed(), true), ORBS);
    expect([...t.orbs]).toEqual([]);
    expect(t.enemyIds).toEqual(['a']);
  });

  it('answering target: every orb, no enemy', () => {
    const t = slashTargets(revealed(), ORBS);
    expect([...t.orbs]).toEqual([...ORBS]);
    expect(t.enemyIds).toEqual([]);
  });

  it('no target: every orb and every active enemy', () => {
    const w = createWave(['a', 'b', 'c'], { poolSizes: [1, 2], maxActive: 2 });
    const t = slashTargets(w, ORBS);
    expect([...t.orbs]).toEqual([...ORBS]);
    expect(t.enemyIds).toEqual(['a', 'b']);
  });

  it('empty wave (menu open): orbs still pass through, no enemies', () => {
    const t = slashTargets(createWave([]), ORBS);
    expect([...t.orbs]).toEqual([...ORBS]);
    expect(t.enemyIds).toEqual([]);
  });

  it('empty orb list: stays empty in every phase', () => {
    expect([...slashTargets(revealed(), []).orbs]).toEqual([]);
    expect([...slashTargets(answerTarget(revealed(), true), []).orbs]).toEqual([]);
    expect(slashTargets(answerTarget(revealed(), true), []).enemyIds).toEqual(['a']);
  });
});
