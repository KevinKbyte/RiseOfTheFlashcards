// Requirement: firing the ultimate knocks the strike-slot enemy back (plan D4 "Ultimate (knockback)"
// row, ENC-006). The strike-slot enemy is the revealed target, whether it is creeping toward the
// strike slot or already telegraphing there. It is pushed back toward its own spawn: at most to its
// wall spawn distance, or the 2.5 m ring fallback when it has no wall (D8/CARDS-011), and never
// pulled forward if it is already farther. Its in-flight attack is cancelled (the only allowed
// cancel) and the telegraph reset, so no hit lands from it. 0 cards are removed, no rating is
// written, and the encounter keeps its state: hit cap, health pool, and its reservation of the
// strike slot (it stays the revealed target, so a creeping enemy keeps its panel and creep resumes
// from the new distance). Other enemies and the queue are untouched. No strike-slot enemy -> nothing
// happens.
//
// Contract addition for src/flashcards/wave.ts (pure, immutable):
//   export function ultimateKnockback(wave: Wave, opts?: { spawnDistance?: number }): Wave;
//     spawnDistance = the target's wall spawn distance (m); default RING_FALLBACK_DISTANCE (2.5).
//     Target enc -> phase 'answering', telegraphLeft 0, distance max(current, spawnDistance);
//     hits, pool, targetId, other enemies, queue unchanged. No target -> the same object.
//     RangeError when spawnDistance is not finite and > 0.
// Covers tags cite plan IDs (docs/plans/2026-10-28-vr-flashcard-game.md: D4, S7) plus ENC-006 /
// CARDS-011 from the game spec cache.
import { describe, expect, it } from 'vitest';
import { ENCOUNTER_DEFAULTS } from '../src/flashcards/encounter.js';
import { RING_FALLBACK_DISTANCE } from '../src/flashcards/spawn.js';
import * as waveModule from '../src/flashcards/wave.js';
import { answerTarget, createWave, revealEnemy, tickWave, type Wave } from '../src/flashcards/wave.js';

const D = ENCOUNTER_DEFAULTS;
const creepSpeed = (D.knockbackDistance - D.strikeDistance) / D.creepSeconds;

function ultimateKnockback(w: Wave, opts?: { spawnDistance?: number }): Wave {
  const fn = (waveModule as unknown as Record<string, unknown>).ultimateKnockback;
  if (typeof fn !== 'function') throw new Error('wave does not export ultimateKnockback(wave, opts?)');
  return (fn as (w: Wave, opts?: { spawnDistance?: number }) => Wave)(w, opts);
}

function find(w: Wave, id: string) {
  const e = w.active.find((x) => x.id === id);
  if (!e) throw new Error(`no active enemy ${id}`);
  return e;
}

/** Three enemies waiting at reach; 'a' revealed (knocked back to 2 m, creeping). */
function revealedAtReach(deck = ['a', 'b', 'c', 'd']): Wave {
  return revealEnemy(tickWave(createWave(deck, { maxActive: 3 }), 100), 'a');
}

/** A correct answer stuns the target; the finishing slash knocks its top card off. */
function answerAndFinish(w: Wave): Wave {
  const answered = answerTarget(w, true);
  if (answered.targetId === null) return answered;
  const slash = (waveModule as unknown as { slashEnemy?: (w: Wave, id: string) => Wave }).slashEnemy;
  if (typeof slash !== 'function') throw new Error('wave does not export slashEnemy(wave, id)');
  return slash(answered, answered.targetId);
}

/** 'a' has crept into the strike slot and is mid-telegraph. */
function telegraphing(deck?: string[]): Wave {
  const w = tickWave(revealedAtReach(deck), D.creepSeconds + 0.01);
  if (find(w, 'a').enc.phase !== 'telegraph') throw new Error('setup: a is not telegraphing');
  return w;
}

// Covers: D4, S7, ENC-006, CARDS-011
describe('wave: ultimate knockback on the strike-slot enemy', () => {
  it('pushes a telegraphing enemy back to the 2.5 m ring fallback by default', () => {
    const w = ultimateKnockback(telegraphing());
    const a = find(w, 'a').enc;
    expect(a.distance).toBe(RING_FALLBACK_DISTANCE);
    expect(RING_FALLBACK_DISTANCE).toBe(2.5);
  });

  it('pushes it back to its wall spawn distance when one is given', () => {
    const w = ultimateKnockback(telegraphing(), { spawnDistance: 3.2 });
    expect(find(w, 'a').enc.distance).toBe(3.2);
  });

  it('cancels the in-flight attack: telegraph reset, back to creeping, no hit lands', () => {
    const w = ultimateKnockback(telegraphing());
    const a = find(w, 'a').enc;
    expect(a.phase).toBe('answering');
    expect(a.telegraphLeft).toBe(0);
    // Without the ultimate the telegraph would expire within this tick and land a hit.
    expect(find(tickWave(telegraphing(), D.telegraphSeconds), 'a').enc.hits).toBe(1);
    const later = find(tickWave(w, D.telegraphSeconds), 'a').enc;
    expect(later.hits).toBe(0);
    expect(later.phase).toBe('answering');
    expect(later.distance).toBeCloseTo(RING_FALLBACK_DISTANCE - creepSpeed * D.telegraphSeconds, 10);
  });

  it('a creeping enemy is pushed the same way, keeps its panel (stays the target) and creeps on from there', () => {
    const creeping = tickWave(revealedAtReach(), 2);
    expect(find(creeping, 'a').enc.phase).toBe('answering');
    expect(find(creeping, 'a').enc.distance).toBeLessThan(RING_FALLBACK_DISTANCE);
    const w = ultimateKnockback(creeping);
    expect(w.targetId).toBe('a');
    expect(find(w, 'a').enc.phase).toBe('answering');
    expect(find(w, 'a').enc.distance).toBe(RING_FALLBACK_DISTANCE);
    expect(find(tickWave(w, 1), 'a').enc.distance).toBeCloseTo(RING_FALLBACK_DISTANCE - creepSpeed, 10);
  });

  it('never pulls an enemy forward that is already beyond its spawn distance', () => {
    // Revealed at the 3.0 m spawn, before walking in: farther than the 2.5 m ring.
    const w0 = revealEnemy(createWave(['a', 'b']), 'a');
    expect(find(w0, 'a').enc.distance).toBe(D.spawnDistance);
    const w = ultimateKnockback(w0);
    expect(find(w, 'a').enc.distance).toBe(D.spawnDistance);
    expect(find(w, 'a').enc.phase).toBe('answering');
  });

  it('removes 0 cards and keeps the slot reservation: pool, targetId, queue unchanged', () => {
    const before = telegraphing(['a', 'b', 'c', 'd', 'e']);
    const w = ultimateKnockback(before);
    expect(w.targetId).toBe('a');
    expect(find(w, 'a').pool).toEqual(find(before, 'a').pool);
    expect(w.active.map((e) => e.id)).toEqual(before.active.map((e) => e.id));
    expect(w.queue).toEqual(before.queue);
  });

  it('keeps a multi-card enemy pool and the hit cap already taken in this encounter', () => {
    // 'a' is a 2-card enemy; a strike lands (hits 1), then the ultimate fires.
    let w = createWave(['a', 'a2', 'b'], { poolSizes: [2, 1] });
    w = revealEnemy(tickWave(w, 100), 'a');
    w = tickWave(w, D.creepSeconds + 0.01);
    w = tickWave(w, D.telegraphSeconds);
    expect(find(w, 'a').enc.hits).toBe(1);
    const fired = ultimateKnockback(w);
    expect(find(fired, 'a').enc.hits).toBe(1);
    expect(find(fired, 'a').pool.cards).toEqual(['a', 'a2']);
    // A correct answer afterwards still peels exactly one card.
    expect(find(answerAndFinish(fired), 'a').pool.cards).toEqual(['a2']);
  });

  it('leaves every non-target enemy untouched', () => {
    const before = telegraphing();
    const w = ultimateKnockback(before);
    for (const id of ['b', 'c']) expect(find(w, id), id).toBe(find(before, id));
  });

  it('with no strike-slot enemy it returns the same object', () => {
    const idle = tickWave(createWave(['a', 'b', 'c'], { maxActive: 3 }), 1);
    expect(idle.targetId).toBeNull();
    expect(ultimateKnockback(idle)).toBe(idle);
    expect(ultimateKnockback(idle, { spawnDistance: 3 })).toBe(idle);
    const empty = createWave([]);
    expect(ultimateKnockback(empty)).toBe(empty);
  });

  it('rejects a spawn distance that is not finite and > 0', () => {
    const w = telegraphing();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(() => ultimateKnockback(w, { spawnDistance: bad }), String(bad)).toThrow(RangeError);
    }
  });

  it('does not mutate the input wave', () => {
    const w = telegraphing();
    const before = structuredClone(w);
    ultimateKnockback(w);
    expect(w).toEqual(before);
  });
});
