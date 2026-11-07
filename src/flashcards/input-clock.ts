// Real elapsed frame time for slash and palm-push timing (M1, S3). The game clock in cards.ts caps
// each frame at MAX_DT; using it for input would shrink a hitch, inflating a slow hand into a slash
// and hiding a sample gap that should cut the stroke. Pure.

/** prevSeconds + deltaSeconds, uncapped; a negative or non-finite delta advances by 0. */
export function advanceInputClock(prevSeconds: number, deltaSeconds: number): number {
  return Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? prevSeconds + deltaSeconds : prevSeconds;
}
