// One answer per frame when several inputs hit orbs (M1, M10, ledgers-2 H-2): the first hit wins so a
// second hand cannot overwrite the answer. Pure.

export function mergeOrbPick<O>(pending: O | null, hit: O): O {
  return pending ?? hit;
}
