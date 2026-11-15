// Requirement: on a correct answer (stun) the enemy lunges with a short ease from where it stands
// (where the ENC-002 2.0 m push-back left it, or farther out after an early reveal) to the 0.7 m
// hold line, so a hand slash (0.20 m slash sphere) always reaches it. The lunge takes LUNGE_S =
// 0.3 s (build default, eased): at the stun the enemy is still where it stood, strictly between
// mid-lunge, exactly on the hold line from LUNGE_S on, and it stays there. It only ever moves
// toward the player and never past the hold line; a stun at or inside the hold line does not move
// it outward. The stunned enemy still cannot strike (no telegraph, no hit), and the 8 s answer
// window and all other encounter numbers are unchanged. Time advances only through explicit dt.
//
// New seam (read through the module namespace so a missing export fails with a readable message):
//   src/flashcards/encounter.ts  export const LUNGE_S = 0.3;   // seconds, stun -> hold line
//   tick(enc, dt) on a 'stunned' encounter eases enc.distance from its stun-time distance to
//   enc.cfg.reachDistance (the hold line) over LUNGE_S of accumulated dt, then holds it there.
//   The eased position depends only on the total time since the stun, not on how dt is split.
//   stun(enc) itself does not move the enemy (the lunge starts on the next tick).
import { describe, expect, it } from 'vitest';
import * as encounterModule from '../src/flashcards/encounter.js';
import {
  createEncounter,
  ENCOUNTER_DEFAULTS,
  slash,
  stun,
  tick,
  type Encounter,
  type EncounterConfig,
} from '../src/flashcards/encounter.js';
import { answerTarget, createWave, revealEnemy, slashEnemy, tickWave, type Wave } from '../src/flashcards/wave.js';

const D = ENCOUNTER_DEFAULTS;
const HOLD = D.reachDistance;

function lungeS(): number {
  const v = (encounterModule as unknown as Record<string, unknown>).LUNGE_S;
  if (typeof v !== 'number') throw new Error('encounter does not export LUNGE_S (number, seconds)');
  return v;
}

/** Revealed at the hold line: knocked back to knockbackDistance (2.0 m), answering. */
function answeringAtKnockback(cfg: Readonly<EncounterConfig> = D): Encounter {
  const enc = slash(tick(createEncounter(cfg), 10));
  if (enc.phase !== 'answering') throw new Error(`fixture expected answering, got ${enc.phase}`);
  return enc;
}

function stunnedAtKnockback(): Encounter {
  const enc = stun(answeringAtKnockback());
  if (enc.phase !== 'stunned') throw new Error(`fixture expected stunned, got ${enc.phase}`);
  return enc;
}

function inTelegraph(cfg: Readonly<EncounterConfig> = D): Encounter {
  const enc = tick(answeringAtKnockback(cfg), cfg.creepSeconds + 0.5);
  if (enc.phase !== 'telegraph') throw new Error(`fixture expected telegraph, got ${enc.phase}`);
  return enc;
}

// Covers: ENC-006
describe('encounter lunge: unchanged numbers', () => {
  it('LUNGE_S is the 0.3 s build default', () => {
    expect(lungeS()).toBe(0.3);
  });

  it('the 8 s answer window and the other encounter numbers are unchanged', () => {
    expect(D.creepSeconds).toBe(8);
    expect(D.reachDistance).toBe(0.7);
    expect(D.strikeDistance).toBe(0.7);
    expect(D.knockbackDistance).toBe(2.0);
    expect(D.telegraphSeconds).toBe(2);
    expect(D.spawnDistance).toBe(3.0);
    expect(D.advanceSpeed).toBe(1.0);
  });
});

// Covers: ENC-006
describe('encounter lunge: a stunned enemy eases to the hold line', () => {
  it('stun itself leaves the enemy where it stands (2.0 m after the push-back)', () => {
    const enc = stunnedAtKnockback();
    expect(enc.distance).toBe(D.knockbackDistance);
    expect(tick(enc, 0).distance).toBe(D.knockbackDistance);
  });

  it('is exactly on the hold line at t = LUNGE_S', () => {
    const out = tick(stunnedAtKnockback(), lungeS());
    expect(out.phase).toBe('stunned');
    expect(out.distance).toBe(HOLD);
  });

  it('stays exactly on the hold line long after the lunge', () => {
    let enc = tick(stunnedAtKnockback(), lungeS() + 0.01);
    expect(enc.distance).toBe(HOLD);
    for (let i = 0; i < 50; i++) enc = tick(enc, 1);
    expect(enc.distance).toBe(HOLD);
    expect(enc.phase).toBe('stunned');
  });

  it('mid-lunge it is strictly between where it stood and the hold line', () => {
    const mid = tick(stunnedAtKnockback(), lungeS() / 2).distance;
    expect(mid).toBeLessThan(D.knockbackDistance);
    expect(mid).toBeGreaterThan(HOLD);
  });

  it('moves only toward the player and never past the hold line', () => {
    let enc = stunnedAtKnockback();
    let prev = enc.distance;
    for (let i = 0; i < 40; i++) {
      enc = tick(enc, 0.01);
      expect(enc.distance).toBeLessThanOrEqual(prev);
      expect(enc.distance).toBeGreaterThanOrEqual(HOLD);
      prev = enc.distance;
    }
    expect(enc.distance).toBe(HOLD);
  });

  it('the eased position depends only on the time since the stun, not on frame size', () => {
    const t = lungeS() * 0.4;
    const once = tick(stunnedAtKnockback(), t).distance;
    let split = stunnedAtKnockback();
    for (let i = 0; i < 4; i++) split = tick(split, t / 4);
    expect(split.distance).toBeCloseTo(once, 9);
  });

  it('a stun farther out after an early reveal still arrives in LUNGE_S', () => {
    const early = stun(slash(createEncounter()));
    expect(early.distance).toBe(D.spawnDistance);
    const mid = tick(early, lungeS() / 2).distance;
    expect(mid).toBeLessThan(D.spawnDistance);
    expect(mid).toBeGreaterThan(HOLD);
    expect(tick(early, lungeS()).distance).toBe(HOLD);
  });

  it('a stun already on the hold line (during the telegraph) stays there', () => {
    const enc = stun(inTelegraph());
    expect(enc.distance).toBe(HOLD);
    expect(tick(enc, lungeS() / 2).distance).toBe(HOLD);
    expect(tick(enc, 5).distance).toBe(HOLD);
  });

  it('a stun inside the hold line is not pushed back out to it', () => {
    const cfg = Object.freeze({ ...D, strikeDistance: 0.5 });
    const enc = stun(inTelegraph(cfg));
    expect(enc.distance).toBe(0.5);
    expect(tick(enc, lungeS() / 2).distance).toBe(0.5);
    expect(tick(enc, 5).distance).toBe(0.5);
  });

  it('does not mutate its input mid-lunge', () => {
    const enc = tick(stunnedAtKnockback(), lungeS() / 3);
    const snapshot = { ...enc };
    tick(enc, lungeS() / 3);
    expect(enc).toEqual(snapshot);
  });
});

// Covers: ENC-006
describe('encounter lunge: the stunned enemy still cannot strike', () => {
  it('no telegraph and no hit during or after the lunge, however long the player waits', () => {
    let enc = stunnedAtKnockback();
    for (let i = 0; i < 200; i++) {
      enc = tick(enc, 0.05);
      expect(enc.phase).toBe('stunned');
      expect(enc.telegraphLeft).toBe(0);
    }
    expect(enc.hits).toBe(0);
    for (let i = 0; i < 20; i++) enc = tick(enc, 10);
    expect(enc.phase).toBe('stunned');
    expect(enc.hits).toBe(0);
  });

  it.each([-0.01, Number.NaN, Number.POSITIVE_INFINITY])('rejects dt = %s while lunging', (dt) => {
    expect(() => tick(stunnedAtKnockback(), dt)).toThrow(RangeError);
  });
});

// Covers: ENC-006, CARDS-004
describe('wave lunge: a correct answer brings the target to the hold line', () => {
  function stunnedTarget(): Wave {
    let w = tickWave(createWave(['a', 'b'], { poolSizes: [2] }), 10);
    if (w.targetId !== 'a') throw new Error('fixture expected the parked enemy to be revealed');
    w = answerTarget(w, true);
    return w;
  }

  function target(w: Wave) {
    const e = w.active.find((x) => x.id === 'a');
    if (!e) throw new Error('no active enemy a');
    return e;
  }

  it('the stunned target lunges from 2.0 m to the hold line within LUNGE_S and stays there', () => {
    let w = stunnedTarget();
    expect(target(w).enc.distance).toBe(D.knockbackDistance);
    const mid = target(tickWave(w, lungeS() / 2)).enc.distance;
    expect(mid).toBeLessThan(D.knockbackDistance);
    expect(mid).toBeGreaterThan(HOLD);
    w = tickWave(w, lungeS());
    expect(target(w).enc.distance).toBe(HOLD);
    w = tickWave(w, 30);
    expect(target(w).enc.distance).toBe(HOLD);
    expect(target(w).enc.phase).toBe('stunned');
    expect(target(w).enc.hits).toBe(0);
  });

  it('a finishing slash mid-lunge still knocks one card off and the next card is pushed back', () => {
    const w = slashEnemy(tickWave(stunnedTarget(), lungeS() / 2), 'a');
    expect(target(w).pool.cards).toEqual(['b']);
    expect(target(w).enc.phase).toBe('answering');
    expect(target(w).enc.distance).toBe(D.knockbackDistance);
  });

  it('an early-revealed target stunned from spawn distance also ends on the hold line', () => {
    let w = answerTarget(revealEnemy(createWave(['a']), 'a'), true);
    expect(target(w).enc.distance).toBe(D.spawnDistance);
    w = tickWave(w, lungeS());
    expect(target(w).enc.distance).toBe(HOLD);
  });
});
