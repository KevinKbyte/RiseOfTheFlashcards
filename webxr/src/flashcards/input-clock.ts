// Real elapsed frame time for slash and palm-push timing (M1, S3). The game clock caps each frame
// at MAX_GAME_DT; using it for input would shrink a hitch, inflating a slow hand into a slash and
// hiding a sample gap that should cut the stroke. Pure.

/** Per-frame cap on game time, so a hitch slows creep/telegraph/flash instead of jumping them. */
export const MAX_GAME_DT = 0.1;

export interface FrameClocks {
  game: number;
  input: number;
}

/** prevSeconds + deltaSeconds, uncapped; a negative or non-finite delta advances by 0. */
export function advanceInputClock(prevSeconds: number, deltaSeconds: number): number {
  return Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? prevSeconds + deltaSeconds : prevSeconds;
}

/** Splits one raw frame delta into the capped game step `dt` and both advanced clocks. */
export function stepFrameClocks(prev: FrameClocks, deltaSeconds: number): FrameClocks & { dt: number } {
  const dt = Number.isFinite(deltaSeconds) ? Math.min(Math.max(deltaSeconds, 0), MAX_GAME_DT) : 0;
  return { game: prev.game + dt, input: advanceInputClock(prev.input, deltaSeconds), dt };
}
