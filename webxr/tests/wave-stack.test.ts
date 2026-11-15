// Requirement: the fight is one enemy at a time, each carrying a stack of flashcards. The enemy
// walks in and shows its top card by itself when it parks at the hold line (knocked back to
// knockbackDistance, which opens the answer window); a slash before that reveals it early. A
// correct answer in time stuns the enemy: its attack stops, no strike lands, there is no time
// limit, and it lunges to the 0.7 m hold line (ENC-006 amendment). Any slash on a stunned enemy knocks exactly one card off its stack, then its next card
// shows by itself, or the enemy falls on its last card and the next enemy walks in. A slash on a
// revealed enemy that is not stunned does nothing, and the ultimate never finishes a stunned card.
// The wave is cleared only after the last card of the last enemy is knocked off.
//
// New seams (named by the approved design; imported through the module namespace so a missing
// export fails each test with a readable message instead of breaking the file):
//   wave.ts       slashEnemy(wave, id): Wave   // reveal an advancing enemy, knock a card off a
//                                              // stunned target, else return the same object
//                 tickWave auto-reveals the enemy that parks at the hold line
//                 answerTarget(wave, true) stuns the target instead of removing its card
//   encounter.ts  phase 'stunned'; stun(enc): Encounter
import { describe, expect, it } from 'vitest';
import * as encounterModule from '../src/flashcards/encounter.js';
import { createEncounter, ENCOUNTER_DEFAULTS, slash, tick, type Encounter } from '../src/flashcards/encounter.js';
import { currentCard, hp } from '../src/flashcards/pool.js';
import * as waveModule from '../src/flashcards/wave.js';
import {
  answerTarget,
  createWave,
  isWaveCleared,
  revealEnemy,
  tickWave,
  ultimateKnockback,
  type Wave,
} from '../src/flashcards/wave.js';

const D = ENCOUNTER_DEFAULTS;
/** Long enough for a fresh enemy to walk from spawnDistance to the hold line. */
const WALK_IN = (D.spawnDistance - D.reachDistance) / D.advanceSpeed + 0.2;
/** Spawns at the hold distance, so an early reveal starts the creep exactly creepSeconds from a strike. */
const NEAR = Object.freeze({ ...D, spawnDistance: D.knockbackDistance });

function slashEnemy(w: Wave, id: string): Wave {
  const f = (waveModule as unknown as Record<string, unknown>).slashEnemy;
  if (typeof f !== 'function') throw new Error('wave does not export slashEnemy(wave, id)');
  return (f as (w: Wave, id: string) => Wave)(w, id);
}

function stun(enc: Encounter): Encounter {
  const f = (encounterModule as unknown as Record<string, unknown>).stun;
  if (typeof f !== 'function') throw new Error('encounter does not export stun(enc)');
  return (f as (e: Encounter) => Encounter)(enc);
}

function enemy(w: Wave, id: string) {
  const e = w.active.find((x) => x.id === id);
  if (!e) throw new Error(`no active enemy ${id}`);
  return e;
}

/** One enemy carrying a 3-card stack a, b, c (revealed early with the existing revealEnemy). */
function revealedStack(): Wave {
  return revealEnemy(createWave(['a', 'b', 'c'], { poolSizes: [3], cfg: NEAR }), 'a');
}

function stunnedStack(): Wave {
  return answerTarget(revealedStack(), true);
}

// Covers: CARDS-010, CARDS-004
describe('wave stack: the enemy shows its card at the hold line', () => {
  it('reveals the parked enemy by itself and knocks it back to knockbackDistance', () => {
    const w = tickWave(createWave(['a', 'b', 'c'], { poolSizes: [3] }), WALK_IN);
    expect(w.targetId).toBe('a');
    expect(enemy(w, 'a').enc.phase).toBe('answering');
    expect(enemy(w, 'a').enc.distance).toBe(D.knockbackDistance);
  });

  it('lands a strike only after creepSeconds + telegraphSeconds from the auto-reveal', () => {
    let w = tickWave(createWave(['a', 'b', 'c'], { poolSizes: [3] }), WALK_IN);
    w = tickWave(w, D.creepSeconds - 0.01);
    expect(enemy(w, 'a').enc.hits).toBe(0);
    w = tickWave(w, 0.02);
    expect(enemy(w, 'a').enc.phase).toBe('telegraph');
    w = tickWave(w, D.telegraphSeconds - 0.01);
    expect(enemy(w, 'a').enc.hits).toBe(0);
    w = tickWave(w, 0.02);
    expect(enemy(w, 'a').enc.hits).toBe(1);
    expect(currentCard(enemy(w, 'a').pool)).toBe('a');
  });

  it('a slash while the enemy is still walking in reveals it early', () => {
    const w = createWave(['a', 'b', 'c'], { poolSizes: [3] });
    const out = slashEnemy(w, 'a');
    expect(out.targetId).toBe('a');
    expect(enemy(out, 'a').enc.phase).toBe('answering');
    expect(hp(enemy(out, 'a').pool)).toBe(3);
  });
});

// Covers: CARDS-010, CARDS-004
describe('wave stack: a correct answer stuns the enemy', () => {
  it('puts the target in the stunned phase with its stack unchanged', () => {
    const w = stunnedStack();
    expect(w.targetId).toBe('a');
    expect(enemy(w, 'a').enc.phase).toBe('stunned');
    expect(enemy(w, 'a').pool.cards).toEqual(['a', 'b', 'c']);
  });

  it('never adds hits while stunned, however long the player waits', () => {
    let w = stunnedStack();
    for (let i = 0; i < 100; i++) w = tickWave(w, 1);
    expect(enemy(w, 'a').enc.phase).toBe('stunned');
    expect(enemy(w, 'a').enc.hits).toBe(0);
    expect(enemy(w, 'a').pool.cards).toEqual(['a', 'b', 'c']);
  });

  it('a correct answer during the telegraph cancels the pending strike', () => {
    let w = tickWave(revealedStack(), D.creepSeconds + 0.5);
    expect(enemy(w, 'a').enc.phase).toBe('telegraph');
    w = answerTarget(w, true);
    w = tickWave(w, D.telegraphSeconds + 5);
    expect(enemy(w, 'a').enc.phase).toBe('stunned');
    expect(enemy(w, 'a').enc.hits).toBe(0);
  });

  it('a wrong answer changes nothing, the strike lands, then a correct answer still stuns', () => {
    let w = revealedStack();
    expect(answerTarget(w, false)).toBe(w);
    w = tickWave(w, D.creepSeconds + 0.1);
    w = tickWave(w, D.telegraphSeconds + 0.1);
    expect(enemy(w, 'a').enc.hits).toBe(1);
    expect(currentCard(enemy(w, 'a').pool)).toBe('a');
    w = answerTarget(w, true);
    expect(enemy(w, 'a').enc.phase).toBe('stunned');
    expect(hp(enemy(w, 'a').pool)).toBe(3);
    w = slashEnemy(w, 'a');
    expect(enemy(w, 'a').pool.cards).toEqual(['b', 'c']);
  });
});

// Covers: CARDS-010, CARDS-004
describe('wave stack: slashing a stunned enemy knocks one card off', () => {
  it('one slash takes the top card off and the next card shows by itself', () => {
    const w = slashEnemy(stunnedStack(), 'a');
    expect(w.targetId).toBe('a');
    expect(enemy(w, 'a').pool.cards).toEqual(['b', 'c']);
    expect(enemy(w, 'a').enc.phase).toBe('answering');
    expect(enemy(w, 'a').enc.distance).toBeGreaterThanOrEqual(D.knockbackDistance);
  });

  it('a double slash drops only one card', () => {
    const once = slashEnemy(stunnedStack(), 'a');
    const twice = slashEnemy(once, 'a');
    expect(twice).toBe(once);
    expect(hp(enemy(twice, 'a').pool)).toBe(2);
  });

  it('a slash on a revealed enemy that is not stunned returns the same object', () => {
    const w = revealedStack();
    expect(slashEnemy(w, 'a')).toBe(w);
  });

  it('a slash on an unknown id returns the same object', () => {
    const w = stunnedStack();
    expect(slashEnemy(w, 'nope')).toBe(w);
  });

  it('the ultimate on a stunned target keeps the stack and the stun', () => {
    const w = ultimateKnockback(stunnedStack());
    expect(enemy(w, 'a').enc.phase).toBe('stunned');
    expect(enemy(w, 'a').pool.cards).toEqual(['a', 'b', 'c']);
  });

  it('the enemy falls on its last card and the next enemy walks in, not revealed', () => {
    let w = createWave(['a', 'b'], { poolSizes: [1, 1] });
    expect(w.active.map((e) => e.id)).toEqual(['a']);
    w = slashEnemy(answerTarget(revealEnemy(w, 'a'), true), 'a');
    expect(w.active.map((e) => e.id)).toEqual(['b']);
    expect(w.targetId).toBeNull();
    expect(enemy(w, 'b').enc.phase).toBe('advancing');
    expect(isWaveCleared(w)).toBe(false);
  });

  it('knocking off the last card of the last enemy clears the wave', () => {
    let w = createWave(['a', 'b'], { poolSizes: [2] });
    w = slashEnemy(answerTarget(revealEnemy(w, 'a'), true), 'a');
    expect(isWaveCleared(w)).toBe(false);
    w = answerTarget(w, true);
    expect(isWaveCleared(w)).toBe(false);
    w = slashEnemy(w, 'a');
    expect(isWaveCleared(w)).toBe(true);
  });
});

// Covers: CARDS-004, ENC-006
describe('encounter: stunned phase', () => {
  function answering(): Encounter {
    return slash(createEncounter(NEAR));
  }

  function inTelegraph(): Encounter {
    const enc = tick(answering(), D.creepSeconds + 0.5);
    if (enc.phase !== 'telegraph') throw new Error(`fixture expected telegraph, got ${enc.phase}`);
    return enc;
  }

  it('stun works from answering', () => {
    const enc = answering();
    const out = stun(enc);
    expect(out.phase).toBe('stunned');
    expect(out.hits).toBe(enc.hits);
    expect(out.distance).toBe(enc.distance);
  });

  it('stun works from the telegraph and cancels it', () => {
    const out = stun(inTelegraph());
    expect(out.phase).toBe('stunned');
    expect(out.telegraphLeft).toBe(0);
    expect(out.hits).toBe(0);
  });

  it('stun does not apply while the enemy is still walking in', () => {
    const enc = createEncounter();
    expect(stun(enc)).toBe(enc);
  });

  // ENC-006 lunge amendment: a stunned enemy no longer freezes where it is; ticking it lunges it to
  // the hold line (pinned in tests/encounter-lunge.test.ts). It still never strikes.
  it('slash on a stunned enemy returns the same object; ticking it ends on the hold line with no strike', () => {
    const enc = stun(inTelegraph());
    expect(slash(enc)).toBe(enc);
    const later = tick(enc, 50);
    expect(later.phase).toBe('stunned');
    expect(later.distance).toBe(D.reachDistance);
    expect(later.telegraphLeft).toBe(0);
    expect(later.hits).toBe(0);
  });

  it('an enemy stunned at the 2 m push-back does not stay frozen there', () => {
    const later = tick(stun(answering()), 50);
    expect(later.phase).toBe('stunned');
    expect(later.distance).toBe(D.reachDistance);
    expect(later.hits).toBe(0);
  });

  it('does not mutate its input', () => {
    const enc = answering();
    const snapshot = { ...enc };
    stun(enc);
    expect(enc).toEqual(snapshot);
  });
});
