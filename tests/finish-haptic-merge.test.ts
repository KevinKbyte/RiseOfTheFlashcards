// Requirement: when a trigger press and a controller swing hit the SAME enemy in the same frame, the
// finishing-slash rumble (CARDS-012 haptic pulse) goes to the pad that PRESSED, not the swinging
// hand's pad. If the earlier pending entry has no pad, is for a different enemy, or does not exist,
// the swing's entry is used as-is.
//
// Seam (src/flashcards/finish-haptic.ts, imported through the module namespace so a missing export
// fails each test with a readable message):
//   mergePendingEnemy<P>(prev: { id: string; gamepad: P | undefined } | null,
//                        hit: { id: string; gamepad: P | undefined }): { id: string; gamepad: P | undefined }
import { describe, expect, it } from 'vitest';
import * as finishModule from '../src/flashcards/finish-haptic.js';

type Pending = { id: string; gamepad: string | undefined };
type Merge = (prev: Pending | null, hit: Pending) => Pending;

function merge(prev: Pending | null, hit: Pending): Pending {
  const fn = (finishModule as unknown as { mergePendingEnemy?: Merge }).mergePendingEnemy;
  if (typeof fn !== 'function') throw new Error('finish-haptic.ts does not export mergePendingEnemy');
  return fn(prev, hit);
}

// Covers: CARDS-012
describe('mergePendingEnemy: press pad wins over a same-frame swing on the same enemy', () => {
  it('uses the swing entry when nothing is pending', () => {
    expect(merge(null, { id: 'e1', gamepad: 'swingPad' })).toEqual({ id: 'e1', gamepad: 'swingPad' });
  });

  it('keeps the press pad when the swing hits the same enemy', () => {
    expect(merge({ id: 'e1', gamepad: 'pressPad' }, { id: 'e1', gamepad: 'swingPad' })).toEqual({
      id: 'e1',
      gamepad: 'pressPad',
    });
  });

  it('uses the swing pad when the earlier same-enemy entry has no pad', () => {
    expect(merge({ id: 'e1', gamepad: undefined }, { id: 'e1', gamepad: 'swingPad' })).toEqual({
      id: 'e1',
      gamepad: 'swingPad',
    });
  });

  it('uses the swing entry entirely when it hits a different enemy', () => {
    expect(merge({ id: 'e1', gamepad: 'pressPad' }, { id: 'e2', gamepad: 'swingPad' })).toEqual({
      id: 'e2',
      gamepad: 'swingPad',
    });
  });

  it('keeps the press pad when a hand-tracking swing (no pad) hits the same enemy', () => {
    expect(merge({ id: 'e1', gamepad: 'pressPad' }, { id: 'e1', gamepad: undefined })).toEqual({
      id: 'e1',
      gamepad: 'pressPad',
    });
  });

  it('yields no pad when neither entry has one', () => {
    expect(merge({ id: 'e1', gamepad: undefined }, { id: 'e1', gamepad: undefined })).toEqual({
      id: 'e1',
      gamepad: undefined,
    });
  });
});
