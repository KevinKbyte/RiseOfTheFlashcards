// Requirement: an answer orb is answered once per frame even when two inputs hit orbs in the same
// frame (two hands slashing, or a trigger select plus a slash on another orb; M1, M10 select
// fallback, ledgers-2 H-2). The FIRST hit of the frame wins and later hits are ignored, so a second
// hand cannot overwrite the answer; when a later hit lands on the same orb, the orb stays picked and
// the trigger select's gamepad is kept so its haptic pulse still plays.
//
// Contract for src/flashcards/orb-pick.ts (pure, generic over orb and gamepad types):
//   export interface OrbPick<O, P> { orb: O; gamepad: P | undefined }
//   export function mergeOrbPick<O, P>(pending: OrbPick<O, P> | null, hit: OrbPick<O, P>): OrbPick<O, P>;
//     pending null -> hit; pending on another orb -> pending unchanged; same orb -> that orb with
//     pending.gamepad ?? hit.gamepad. Never mutates its inputs.
import { describe, expect, it } from 'vitest';

interface OrbPick<O, P> {
  orb: O;
  gamepad: P | undefined;
}

// Dynamic import so each test reports the missing module/export instead of one load error.
const orbPick: unknown = await import('../src/flashcards/orb-pick.js').catch(() => ({}));

function mergeOrbPick<O, P>(pending: OrbPick<O, P> | null, hit: OrbPick<O, P>): OrbPick<O, P> {
  const fn = (orbPick as Record<string, unknown>).mergeOrbPick;
  if (typeof fn !== 'function') throw new Error('orb-pick does not export mergeOrbPick');
  return (fn as (p: OrbPick<O, P> | null, h: OrbPick<O, P>) => OrbPick<O, P>)(pending, hit);
}

const PAD_L = { id: 'left-pad' };
const PAD_R = { id: 'right-pad' };

// Covers: M1, M10, H-2
describe('mergeOrbPick first hit wins', () => {
  it('the first hit of the frame is taken when nothing is pending', () => {
    expect(mergeOrbPick(null, { orb: 'A', gamepad: undefined })).toEqual({ orb: 'A', gamepad: undefined });
    expect(mergeOrbPick(null, { orb: 'A', gamepad: PAD_L })).toEqual({ orb: 'A', gamepad: PAD_L });
  });

  it('a second hand slashing another orb does not overwrite the first slash', () => {
    const first = mergeOrbPick(null, { orb: 'A', gamepad: undefined });
    expect(mergeOrbPick(first, { orb: 'B', gamepad: undefined })).toEqual({ orb: 'A', gamepad: undefined });
  });

  it('a slash on another orb after a trigger select keeps the select and its gamepad', () => {
    const select = { orb: 'A', gamepad: PAD_L };
    expect(mergeOrbPick(select, { orb: 'B', gamepad: undefined })).toEqual({ orb: 'A', gamepad: PAD_L });
  });

  it('a slash on the same orb as a trigger select keeps the select gamepad for haptics', () => {
    const select = { orb: 'A', gamepad: PAD_L };
    expect(mergeOrbPick(select, { orb: 'A', gamepad: undefined })).toEqual({ orb: 'A', gamepad: PAD_L });
  });

  it('a select arriving after a slash on the same orb contributes its gamepad', () => {
    const slash = { orb: 'A', gamepad: undefined };
    expect(mergeOrbPick<string, typeof PAD_R>(slash, { orb: 'A', gamepad: PAD_R })).toEqual({ orb: 'A', gamepad: PAD_R });
  });

  it('the first pick of three hits survives, in any later order', () => {
    let p = mergeOrbPick(null, { orb: 'B', gamepad: PAD_R });
    p = mergeOrbPick(p, { orb: 'A', gamepad: undefined });
    p = mergeOrbPick(p, { orb: 'C', gamepad: PAD_L });
    expect(p).toEqual({ orb: 'B', gamepad: PAD_R });
  });

  it('never mutates the pending pick or the hit', () => {
    const pending = Object.freeze({ orb: 'A', gamepad: undefined });
    const hit = Object.freeze({ orb: 'A', gamepad: PAD_L });
    expect(() => mergeOrbPick<string, typeof PAD_L>(pending, hit)).not.toThrow();
    expect(pending).toEqual({ orb: 'A', gamepad: undefined });
    expect(hit).toEqual({ orb: 'A', gamepad: PAD_L });
  });
});
