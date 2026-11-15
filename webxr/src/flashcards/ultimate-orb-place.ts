// When the ultimate orb is placed (S7, H-2, D17). It follows the current head pose only at run start
// and when it starts glowing, so a turned player finds it again without it chasing the head every
// frame. Where: panel-layout ultimateOrbPosition. Pure.

/** The ultimateOrb(run) view shape. */
export interface OrbView {
  visible: boolean;
  glowing: boolean;
}

/** True on the frame the orb appears or goes from dim to glowing. */
export function shouldPlaceOrb(prev: OrbView, curr: OrbView): boolean {
  return curr.visible && (!prev.visible || (!prev.glowing && curr.glowing));
}
