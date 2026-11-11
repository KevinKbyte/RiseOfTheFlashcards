// One answer per frame when several inputs hit orbs (M1, M10, ledgers-2 H-2): the first hit wins so a
// second hand cannot overwrite the answer; a later hit on the same orb only contributes the trigger
// select's gamepad so its haptic pulse still plays. Pure.

export interface OrbPick<O, P> {
  orb: O;
  gamepad: P | undefined;
}

export function mergeOrbPick<O, P>(pending: OrbPick<O, P> | null, hit: OrbPick<O, P>): OrbPick<O, P> {
  if (pending === null) return hit;
  if (pending.orb !== hit.orb) return pending;
  return { orb: pending.orb, gamepad: pending.gamepad ?? hit.gamepad };
}
