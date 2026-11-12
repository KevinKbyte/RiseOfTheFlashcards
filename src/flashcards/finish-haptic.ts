// Which gamepad rumbles for a slash (CARDS-012): only the finishing slash, the one that knocks a card
// off a stunned target, pulses; the stun, a reveal and a no-op slash stay silent. Pure.
import type { Wave } from './wave';

type Hand = 'left' | 'right';

/** `gamepad` when `next` is the slash on `id` that knocked a card off the target stunned in `before`. */
export function finishGamepad<P>(before: Wave, next: Wave, id: string, gamepad: P | undefined): P | undefined {
  if (next === before || before.targetId !== id) return undefined;
  const target = before.active.find((e) => e.id === id);
  return target?.enc.phase === 'stunned' ? gamepad : undefined;
}

/** The swinging controller's gamepad; undefined for a hand-tracking swing (no handedness). */
export function swingGamepad<P>(
  hand: Hand | undefined,
  pads: { left?: { gamepad?: P } | null; right?: { gamepad?: P } | null },
): P | undefined {
  return hand === undefined ? undefined : (pads[hand]?.gamepad ?? undefined);
}
