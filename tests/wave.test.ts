// Requirement: several flashcard enemies come at the player at once (default up to 3) and the
// player chooses which one to attack first. Every active enemy walks in on its own and, if never
// revealed, waits at reach. The player may reveal (slash) any one active enemy at any distance;
// only one card is revealed at a time, and the other enemies keep walking in while it is answered.
// A correct answer removes that enemy and the next card in the deck walks in to refill the wave;
// a wrong answer leaves the revealed card in place. The wave is cleared when no enemies remain.
//
// API contract for src/flashcards/wave.ts (pure, immutable; reuses encounter.ts per enemy):
//   export const DEFAULT_MAX_ACTIVE = 3;
//   export interface WaveEnemy { readonly id: string; readonly enc: Encounter }
//   export interface Wave {
//     readonly active: readonly WaveEnemy[];   // spawn order; refills append at the end
//     readonly queue: readonly string[];       // card ids not yet spawned, deck order
//     readonly targetId: string | null;        // the single revealed enemy, if any
//     readonly maxActive: number;
//     readonly cfg: Readonly<EncounterConfig>;
//   }
//   createWave(deck: readonly string[], opts?: { maxActive?: number; cfg?: Readonly<EncounterConfig> }): Wave
//     RangeError when maxActive is not an integer >= 1 or deck contains a duplicate id;
//     invalid cfg throws via createEncounter.
//   tickWave(wave, dt): Wave                 // ticks every active encounter; RangeError on bad dt
//   revealEnemy(wave, id): Wave              // slash() that enemy; same object when not applicable
//   answerTarget(wave, correct: boolean): Wave
//     correct: target removed, targetId null, queue head spawns (refill to maxActive);
//     wrong or no target: same object returned.
//   isWaveCleared(wave): boolean             // active and queue both empty
// No input is ever mutated. encounter.ts has no grading freeze, so none is modelled here.
import { describe, expect, it } from 'vitest';
import { ENCOUNTER_DEFAULTS } from '../src/flashcards/encounter.js';
import {
  answerTarget,
  createWave,
  DEFAULT_MAX_ACTIVE,
  isWaveCleared,
  revealEnemy,
  tickWave,
  type Wave,
} from '../src/flashcards/wave.js';

const D = ENCOUNTER_DEFAULTS;
const creepSpeed = (D.knockbackDistance - D.strikeDistance) / D.creepSeconds;

function ids(w: Wave): string[] {
  return w.active.map((e) => e.id);
}

function enemy(w: Wave, id: string) {
  const e = w.active.find((x) => x.id === id);
  if (!e) throw new Error(`no active enemy ${id}`);
  return e.enc;
}

// Covers: CARDS-010
describe('wave: creation', () => {
  it('defaults to 3 active enemies with the rest of the deck queued in order', () => {
    expect(DEFAULT_MAX_ACTIVE).toBe(3);
    const w = createWave(['a', 'b', 'c', 'd', 'e']);
    expect(w.maxActive).toBe(3);
    expect(ids(w)).toEqual(['a', 'b', 'c']);
    expect(w.queue).toEqual(['d', 'e']);
    expect(w.targetId).toBeNull();
    expect(isWaveCleared(w)).toBe(false);
  });

  it('each active enemy has its own fresh encounter at spawn distance', () => {
    const w = createWave(['a', 'b', 'c']);
    for (const e of w.active) {
      expect(e.enc.phase).toBe('advancing');
      expect(e.enc.distance).toBe(D.spawnDistance);
      expect(e.enc.hits).toBe(0);
    }
    expect(w.active[0].enc).not.toBe(w.active[1].enc);
  });

  it('passes a custom encounter config to every enemy', () => {
    const cfg = { ...D, spawnDistance: 5 };
    const w = createWave(['a', 'b'], { cfg });
    expect(w.cfg).toEqual(cfg);
    for (const e of w.active) expect(e.enc.distance).toBe(5);
  });

  it('a deck smaller than maxActive spawns every card and queues nothing', () => {
    const w = createWave(['a', 'b'], { maxActive: 3 });
    expect(ids(w)).toEqual(['a', 'b']);
    expect(w.queue).toEqual([]);
  });

  it('an empty deck is cleared immediately', () => {
    const w = createWave([]);
    expect(w.active).toEqual([]);
    expect(w.queue).toEqual([]);
    expect(w.targetId).toBeNull();
    expect(isWaveCleared(w)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects maxActive %s with a RangeError',
    (maxActive) => {
      expect(() => createWave(['a'], { maxActive })).toThrow(RangeError);
    },
  );

  it('rejects a deck with duplicate card ids (ids address enemies)', () => {
    expect(() => createWave(['a', 'b', 'a'])).toThrow(RangeError);
  });

  it('rejects an invalid encounter config via createEncounter', () => {
    expect(() => createWave(['a'], { cfg: { ...D, creepSeconds: 0 } })).toThrow(RangeError);
  });

  it('does not mutate the deck array', () => {
    const deck = ['a', 'b', 'c', 'd'];
    createWave(deck, { maxActive: 2 });
    expect(deck).toEqual(['a', 'b', 'c', 'd']);
  });
});

// Covers: CARDS-010
describe('wave: tick', () => {
  it('advances every active enemy', () => {
    const w = tickWave(createWave(['a', 'b', 'c']), 1);
    for (const e of w.active) {
      expect(e.enc.phase).toBe('advancing');
      expect(e.enc.distance).toBeCloseTo(D.spawnDistance - D.advanceSpeed, 10);
    }
  });

  it('unrevealed enemies halt at the reach line as slashable', () => {
    const w = tickWave(createWave(['a', 'b', 'c']), 100);
    for (const e of w.active) {
      expect(e.enc.phase).toBe('slashable');
      expect(e.enc.distance).toBe(D.reachDistance);
    }
  });

  it('does not tick queued cards (they spawn fresh later)', () => {
    let w = tickWave(createWave(['a', 'b'], { maxActive: 1 }), 100);
    w = answerTarget(revealEnemy(w, 'a'), true);
    expect(enemy(w, 'b').distance).toBe(D.spawnDistance);
  });

  it('throws RangeError on a negative or non-finite dt', () => {
    const w = createWave(['a']);
    expect(() => tickWave(w, -1)).toThrow(RangeError);
    expect(() => tickWave(w, Number.NaN)).toThrow(RangeError);
  });

  it('does not mutate the input wave', () => {
    const w = createWave(['a', 'b', 'c', 'd']);
    const before = structuredClone(w);
    tickWave(w, 1);
    expect(w).toEqual(before);
  });
});

// Covers: CARDS-010
describe('wave: reveal (choose which card to attack)', () => {
  it('reveals any active enemy far away; it keeps its distance beyond knockback', () => {
    const w = revealEnemy(createWave(['a', 'b', 'c']), 'b');
    expect(w.targetId).toBe('b');
    expect(enemy(w, 'b').phase).toBe('answering');
    expect(enemy(w, 'b').distance).toBe(D.spawnDistance);
    expect(enemy(w, 'a').phase).toBe('advancing');
    expect(enemy(w, 'c').phase).toBe('advancing');
  });

  it('revealing an enemy waiting at reach knocks it back to knockbackDistance', () => {
    const w = revealEnemy(tickWave(createWave(['a', 'b', 'c']), 100), 'c');
    expect(w.targetId).toBe('c');
    expect(enemy(w, 'c').phase).toBe('answering');
    expect(enemy(w, 'c').distance).toBe(D.knockbackDistance);
  });

  it('only one revealed at a time: revealing a second id is a no-op (same object)', () => {
    const w = revealEnemy(createWave(['a', 'b', 'c']), 'a');
    expect(revealEnemy(w, 'b')).toBe(w);
  });

  it('revealing the current target again is a no-op (same object)', () => {
    const w = revealEnemy(createWave(['a', 'b']), 'a');
    expect(revealEnemy(w, 'a')).toBe(w);
  });

  it('revealing an unknown or still-queued id is a no-op (same object)', () => {
    const w = createWave(['a', 'b', 'c', 'd']);
    expect(revealEnemy(w, 'zzz')).toBe(w);
    expect(revealEnemy(w, 'd')).toBe(w);
  });

  it('does not mutate the input wave', () => {
    const w = createWave(['a', 'b', 'c']);
    const before = structuredClone(w);
    revealEnemy(w, 'a');
    expect(w).toEqual(before);
  });
});

// Covers: CARDS-010
describe('wave: other enemies while the target is answered', () => {
  it('non-target enemies keep advancing while the target creeps at fixed speed', () => {
    const w = tickWave(revealEnemy(createWave(['a', 'b', 'c']), 'a'), 1);
    expect(enemy(w, 'a').phase).toBe('answering');
    expect(enemy(w, 'a').distance).toBeCloseTo(D.spawnDistance - creepSpeed, 10);
    expect(enemy(w, 'b').distance).toBeCloseTo(D.spawnDistance - D.advanceSpeed, 10);
    expect(enemy(w, 'c').distance).toBeCloseTo(D.spawnDistance - D.advanceSpeed, 10);
  });

  it('non-target enemies still halt at reach while the target is answered', () => {
    const w = tickWave(revealEnemy(createWave(['a', 'b']), 'a'), 5);
    expect(enemy(w, 'b').phase).toBe('slashable');
    expect(enemy(w, 'b').distance).toBe(D.reachDistance);
    expect(w.targetId).toBe('a');
  });

  it('the target stays the target after its hit lands', () => {
    let w = revealEnemy(tickWave(createWave(['a', 'b']), 100), 'a');
    w = tickWave(w, D.creepSeconds + 0.01);
    expect(enemy(w, 'a').phase).toBe('telegraph');
    w = tickWave(w, D.telegraphSeconds + 0.01);
    expect(enemy(w, 'a').phase).toBe('answering');
    expect(enemy(w, 'a').hits).toBe(1);
    expect(w.targetId).toBe('a');
  });
});

// Covers: CARDS-010
describe('wave: answering the target', () => {
  it('a correct answer removes the target, clears targetId and refills from the queue', () => {
    let w = tickWave(createWave(['a', 'b', 'c', 'd', 'e']), 1);
    w = answerTarget(revealEnemy(w, 'b'), true);
    expect(w.targetId).toBeNull();
    expect(ids(w)).toEqual(['a', 'c', 'd']);
    expect(w.queue).toEqual(['e']);
    expect(enemy(w, 'd').phase).toBe('advancing');
    expect(enemy(w, 'd').distance).toBe(D.spawnDistance);
    expect(enemy(w, 'a').distance).toBeCloseTo(D.spawnDistance - D.advanceSpeed, 10);
  });

  it('a correct answer during the telegraph still removes the target', () => {
    let w = revealEnemy(tickWave(createWave(['a', 'b']), 100), 'a');
    w = tickWave(w, D.creepSeconds + 0.01);
    expect(enemy(w, 'a').phase).toBe('telegraph');
    w = answerTarget(w, true);
    expect(ids(w)).toEqual(['b']);
    expect(w.targetId).toBeNull();
  });

  it('after a correct answer another enemy can be revealed', () => {
    let w = answerTarget(revealEnemy(createWave(['a', 'b', 'c']), 'a'), true);
    w = revealEnemy(w, 'c');
    expect(w.targetId).toBe('c');
  });

  it('a wrong answer keeps the target (same object)', () => {
    const w = revealEnemy(createWave(['a', 'b']), 'a');
    expect(answerTarget(w, false)).toBe(w);
  });

  it('answering with no target is a no-op (same object)', () => {
    const w = createWave(['a', 'b']);
    expect(answerTarget(w, true)).toBe(w);
    expect(answerTarget(w, false)).toBe(w);
  });

  it('without a queue the wave shrinks, then clears when the last enemy is answered', () => {
    let w = createWave(['a', 'b']);
    w = answerTarget(revealEnemy(w, 'a'), true);
    expect(ids(w)).toEqual(['b']);
    expect(isWaveCleared(w)).toBe(false);
    w = answerTarget(revealEnemy(w, 'b'), true);
    expect(w.active).toEqual([]);
    expect(w.queue).toEqual([]);
    expect(isWaveCleared(w)).toBe(true);
  });

  it('does not mutate the input wave', () => {
    const w = revealEnemy(createWave(['a', 'b', 'c', 'd']), 'a');
    const before = structuredClone(w);
    answerTarget(w, true);
    expect(w).toEqual(before);
  });
});

// Covers: CARDS-010
describe('wave: maxActive 1 behaves like the single-enemy loop', () => {
  it('one enemy at a time; the next card spawns only after a correct answer', () => {
    let w = createWave(['a', 'b', 'c'], { maxActive: 1 });
    expect(ids(w)).toEqual(['a']);
    expect(w.queue).toEqual(['b', 'c']);
    w = revealEnemy(w, 'a');
    w = answerTarget(w, false);
    expect(ids(w)).toEqual(['a']);
    w = answerTarget(w, true);
    expect(ids(w)).toEqual(['b']);
    w = answerTarget(revealEnemy(w, 'b'), true);
    w = answerTarget(revealEnemy(w, 'c'), true);
    expect(isWaveCleared(w)).toBe(true);
  });
});

// Requirement: bigger enemies are multi-card health pools (M2). Each spawned enemy carries a pool of
// consecutive deck cards (its id is its first card); the front card is the one answered. A correct
// answer peels one card: a multi-card target stays the revealed target until all its cards are
// peeled (D13 EN-3 follow-up), and per peel it is knocked back by the reveal rule (to
// knockbackDistance only if closer; any pending telegraph is cancelled) and starts the next card as a
// fresh encounter (hit cap per encounter, D4). Only peeling the last card defeats it, which refills
// the wave. maxActive counts enemies, not cards. Default pool size is 1, so the single-card wave
// above is unchanged.
// Contract addition: WaveEnemy gains `readonly pool: Pool` (src/flashcards/pool.ts);
//   createWave opts gain `poolSizes?: readonly number[]` indexed by spawn order (missing -> 1; the last
//   enemy is truncated to the cards left); RangeError when an entry is not an integer >= 1.
// Covers: M2, D13, CARDS-010
describe('wave: multi-card health pools', () => {
  type PoolView = { cards: readonly string[]; maxHp: number };
  const poolOf = (w: Wave, id: string): PoolView => {
    const e = w.active.find((x) => x.id === id) as unknown as { pool?: PoolView } | undefined;
    if (!e?.pool) throw new Error(`no pool on enemy ${id}`);
    return e.pool;
  };

  it('every enemy carries a 1-card pool by default', () => {
    const w = createWave(['a', 'b', 'c', 'd']);
    expect(poolOf(w, 'a').cards).toEqual(['a']);
    expect(poolOf(w, 'a').maxHp).toBe(1);
    expect(poolOf(w, 'c').cards).toEqual(['c']);
    expect(w.queue).toEqual(['d']);
  });

  it('poolSizes groups consecutive deck cards per enemy; maxActive counts enemies', () => {
    const w = createWave(['a', 'b', 'c', 'd', 'e', 'f', 'g'], { poolSizes: [1, 3, 2], maxActive: 2 });
    expect(ids(w)).toEqual(['a', 'b']);
    expect(poolOf(w, 'a').cards).toEqual(['a']);
    expect(poolOf(w, 'b').cards).toEqual(['b', 'c', 'd']);
    expect(poolOf(w, 'b').maxHp).toBe(3);
    expect(w.queue).toEqual(['e', 'f', 'g']);
  });

  it('the last enemy is truncated to the cards left in the deck', () => {
    const w = createWave(['a', 'b', 'c'], { poolSizes: [2, 3] });
    expect(ids(w)).toEqual(['a', 'c']);
    expect(poolOf(w, 'c').cards).toEqual(['c']);
    expect(w.queue).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects a pool size %s with a RangeError', (size) => {
    expect(() => createWave(['a', 'b'], { poolSizes: [1, size] })).toThrow(RangeError);
  });

  it('a correct answer peels one card; the target stays revealed with the next card', () => {
    let w = revealEnemy(createWave(['a', 'b', 'c', 'd'], { poolSizes: [3], maxActive: 1 }), 'a');
    w = answerTarget(w, true);
    expect(w.targetId).toBe('a');
    expect(ids(w)).toEqual(['a']);
    expect(poolOf(w, 'a').cards).toEqual(['b', 'c']);
    expect(enemy(w, 'a').phase).toBe('answering');
    expect(w.queue).toEqual(['d']);
  });

  it('a wrong answer peels nothing (same object)', () => {
    const w = revealEnemy(createWave(['a', 'b'], { poolSizes: [2] }), 'a');
    expect(answerTarget(w, false)).toBe(w);
  });

  it('peeling the last card defeats the enemy and refills from the queue with the next pool size', () => {
    let w = createWave(['a', 'b', 'c', 'd', 'e', 'f'], { poolSizes: [2, 1, 3], maxActive: 1 });
    w = answerTarget(revealEnemy(w, 'a'), true);
    expect(ids(w)).toEqual(['a']);
    w = answerTarget(w, true);
    expect(w.targetId).toBeNull();
    expect(ids(w)).toEqual(['c']);
    expect(poolOf(w, 'c').cards).toEqual(['c']);
    w = answerTarget(revealEnemy(w, 'c'), true);
    expect(ids(w)).toEqual(['d']);
    expect(poolOf(w, 'd').cards).toEqual(['d', 'e', 'f']);
    expect(enemy(w, 'd').distance).toBe(D.spawnDistance);
    expect(w.queue).toEqual([]);
  });

  it('other enemies cannot be revealed until the multi-card target is defeated', () => {
    let w = revealEnemy(createWave(['a', 'b', 'c'], { poolSizes: [2, 1] }), 'a');
    w = answerTarget(w, true);
    expect(revealEnemy(w, 'c')).toBe(w);
  });

  it('a peel inside knockbackDistance knocks the target back to it; farther away it keeps its distance', () => {
    let near = revealEnemy(tickWave(createWave(['a', 'b'], { poolSizes: [2] }), 100), 'a');
    near = tickWave(near, 4);
    expect(enemy(near, 'a').distance).toBeLessThan(D.knockbackDistance);
    near = answerTarget(near, true);
    expect(enemy(near, 'a').distance).toBe(D.knockbackDistance);

    let far = revealEnemy(createWave(['a', 'b'], { poolSizes: [2] }), 'a');
    far = answerTarget(far, true);
    expect(enemy(far, 'a').distance).toBe(D.spawnDistance);
  });

  it('a peel during the telegraph cancels the pending hit and starts the next card fresh', () => {
    let w = revealEnemy(tickWave(createWave(['a', 'b', 'c'], { poolSizes: [3] }), 100), 'a');
    w = tickWave(w, D.creepSeconds + 0.01);
    w = tickWave(w, D.telegraphSeconds + 0.01);
    expect(enemy(w, 'a').hits).toBe(1);
    w = tickWave(w, D.creepSeconds + 0.01);
    expect(enemy(w, 'a').phase).toBe('telegraph');
    w = answerTarget(w, true);
    expect(enemy(w, 'a').phase).toBe('answering');
    expect(enemy(w, 'a').telegraphLeft).toBe(0);
    expect(enemy(w, 'a').distance).toBe(D.knockbackDistance);
    expect(enemy(w, 'a').hits).toBe(0);
    expect(poolOf(w, 'a').cards).toEqual(['b', 'c']);
  });

  it('the wave clears only after every card of every pool is peeled', () => {
    let w = createWave(['a', 'b', 'c'], { poolSizes: [3] });
    w = revealEnemy(w, 'a');
    w = answerTarget(answerTarget(w, true), true);
    expect(isWaveCleared(w)).toBe(false);
    w = answerTarget(w, true);
    expect(isWaveCleared(w)).toBe(true);
  });

  it('does not mutate the input wave on a peel', () => {
    const w = revealEnemy(createWave(['a', 'b', 'c'], { poolSizes: [2] }), 'a');
    const before = structuredClone(w);
    answerTarget(w, true);
    expect(w).toEqual(before);
  });
});
