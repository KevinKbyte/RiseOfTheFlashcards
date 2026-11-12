// Requirement: a correct answer stuns the enemy silently; the controller rumble (CARDS-012 haptic
// pulse) fires on the FINISHING slash, the one that knocks a card off the stunned target (peel or
// defeat). A trigger-select finish rumbles the pad that pressed; a controller-swing finish rumbles
// the swinging hand's pad. A hand-tracking swing has no pad and rumbles nothing (never throws). A
// slash that only reveals an enemy, a slash that does nothing, and the stun itself never rumble.
//
// New seam (src/flashcards/finish-haptic.ts, imported through the module namespace so a missing
// export, once the module exists, fails each test with a readable message):
//   finishGamepad<P>(before: Wave, next: Wave, id: string, gamepad: P | undefined): P | undefined
//     -> `gamepad` only when `next` is the slash on `id` that knocked a card off the stunned target
//   swingGamepad<P>(hand: 'left' | 'right' | undefined,
//                   pads: { left?: { gamepad?: P } | null; right?: { gamepad?: P } | null }): P | undefined
//     -> the swinging hand's gamepad; undefined for a hand-tracking swing (hand undefined)
import { describe, expect, it } from 'vitest';
import * as finishModule from '../src/flashcards/finish-haptic.js';
import { ENCOUNTER_DEFAULTS } from '../src/flashcards/encounter.js';
import { answerTarget, createWave, revealEnemy, slashEnemy, type Wave } from '../src/flashcards/wave.js';

type Hand = 'left' | 'right';
type Pads<P> = { left?: { gamepad?: P } | null; right?: { gamepad?: P } | null };

function fn<T>(name: string, sig: string): T {
  const f = (finishModule as unknown as Record<string, unknown>)[name];
  if (typeof f !== 'function') throw new Error(`finish-haptic does not export ${name}${sig}`);
  return f as T;
}

function finishGamepad<P>(before: Wave, next: Wave, id: string, gamepad: P | undefined): P | undefined {
  return fn<typeof finishGamepad<P>>('finishGamepad', '(before, next, id, gamepad)')(before, next, id, gamepad);
}

function swingGamepad<P>(hand: Hand | undefined, pads: Pads<P>): P | undefined {
  return fn<typeof swingGamepad<P>>('swingGamepad', '(hand, pads)')(hand, pads);
}

const NEAR = Object.freeze({ ...ENCOUNTER_DEFAULTS, spawnDistance: ENCOUNTER_DEFAULTS.knockbackDistance });
const PAD = { id: 'pad', hapticActuators: [{ pulse: () => true }] };

function revealed(size: number): Wave {
  const deck = ['a', 'b', 'c'].slice(0, size);
  return revealEnemy(createWave(deck, { poolSizes: [size], cfg: NEAR }), 'a');
}

// Covers: CARDS-012, CARDS-010
describe('finishGamepad: only the finishing slash rumbles', () => {
  it('a finishing slash that peels a card returns the slashing pad', () => {
    const before = answerTarget(revealed(3), true);
    const next = slashEnemy(before, 'a');
    expect(next).not.toBe(before);
    expect(finishGamepad(before, next, 'a', PAD)).toBe(PAD);
  });

  it('a finishing slash on the last card (enemy defeated) returns the slashing pad', () => {
    const before = answerTarget(revealed(1), true);
    const next = slashEnemy(before, 'a');
    expect(next.targetId).toBeNull();
    expect(finishGamepad(before, next, 'a', PAD)).toBe(PAD);
  });

  it('the stun (correct answer) never rumbles', () => {
    const before = revealed(3);
    const stunned = answerTarget(before, true);
    expect(stunned).not.toBe(before);
    expect(finishGamepad(before, stunned, 'a', PAD)).toBeUndefined();
  });

  it('a slash that only reveals an advancing enemy never rumbles', () => {
    const before = createWave(['a', 'b'], { poolSizes: [2] });
    const next = slashEnemy(before, 'a');
    expect(next.targetId).toBe('a');
    expect(finishGamepad(before, next, 'a', PAD)).toBeUndefined();
  });

  it('a slash on a revealed but not stunned target (no-op) never rumbles', () => {
    const before = revealed(3);
    const next = slashEnemy(before, 'a');
    expect(next).toBe(before);
    expect(finishGamepad(before, next, 'a', PAD)).toBeUndefined();
  });

  it('with no target at all nothing rumbles', () => {
    const empty = createWave([]);
    expect(finishGamepad(empty, slashEnemy(empty, 'a'), 'a', PAD)).toBeUndefined();
  });

  it('a finishing slash with no gamepad (hand-tracking) returns undefined without throwing', () => {
    const before = answerTarget(revealed(3), true);
    const next = slashEnemy(before, 'a');
    expect(finishGamepad(before, next, 'a', undefined)).toBeUndefined();
  });

  it('passes a gamepad without hapticActuators through unchanged (CorrectFeedback.play skips it)', () => {
    const before = answerTarget(revealed(3), true);
    const bare = {};
    expect(finishGamepad(before, slashEnemy(before, 'a'), 'a', bare)).toBe(bare);
  });
});

// Covers: CARDS-012, SX
describe('swingGamepad: a controller swing rumbles its own hand', () => {
  const left = { id: 'left-pad' };
  const right = { id: 'right-pad' };

  it('a right-controller swing picks the right pad', () => {
    expect(swingGamepad('right', { left: { gamepad: left }, right: { gamepad: right } })).toBe(right);
  });

  it('a left-controller swing picks the left pad', () => {
    expect(swingGamepad('left', { left: { gamepad: left }, right: { gamepad: right } })).toBe(left);
  });

  it('a hand-tracking swing (no handedness) picks no pad', () => {
    expect(swingGamepad(undefined, { left: { gamepad: left }, right: { gamepad: right } })).toBeUndefined();
  });

  it('a missing pad on the swinging side picks nothing', () => {
    expect(swingGamepad('right', { left: { gamepad: left } })).toBeUndefined();
    expect(swingGamepad('right', { left: { gamepad: left }, right: null })).toBeUndefined();
  });

  it('a pad without a gamepad object picks nothing', () => {
    expect(swingGamepad('left', { left: {}, right: { gamepad: right } })).toBeUndefined();
  });
});
