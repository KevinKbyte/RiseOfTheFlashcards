// Pure ultimate input rules (D7, S7, ledgers-2 H-2, decisions-2 D17): two-palm push classifier,
// controller grip squeeze edge, ultimate orb ready-glow, and the per-frame fire gate. No DOM/IWSDK
// imports; never mutates input.
import { fireUltimate, type GameSession, type SessionEffect } from './game-session.js';
import { ULTIMATE_CHARGE, type RunState } from './run-state.js';
import type { Vec3 } from './spawn.js';
import { ultimateKnockback, type Wave } from './wave.js';

/** D7: both palms travel the push distance in under 0.3 s. */
export const PALM_PUSH_WINDOW_S = 0.3;
/** D7 "X cm", tuned in S7: 15 cm is a deliberate shove, not hand jitter or a slash wind-up. */
export const PALM_PUSH_MIN_DISTANCE = 0.15;
// A palm counts as facing forward within ~45 degrees of play-forward.
const FACING_MIN_COS = Math.SQRT1_2;
// Float slack so a sample exactly at the window edge is not lost to rounding.
const EPS = 1e-9;

export interface PalmSample {
  pos: Vec3;
  /** Unit-ish vector out of the palm. */
  normal: Vec3;
  /** Seconds. */
  t: number;
}

export interface GripState {
  left: boolean;
  right: boolean;
}

export type UltimateRequest = 'palm-push' | 'grip' | 'orb';

export interface UltimateFrame {
  session: GameSession;
  wave: Wave;
  effects: readonly SessionEffect[];
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const finiteVec = (v: Vec3): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

function unit(v: Vec3): Vec3 | null {
  const len = Math.hypot(v.x, v.y, v.z);
  return finiteVec(v) && len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : null;
}

/** One hand pushed: in the window ending at its newest sample, forward travel >= distance and the palm faces forward. */
function handPushed(samples: readonly PalmSample[], fwd: Vec3): boolean {
  if (samples.length < 2) return false;
  const newest = samples[samples.length - 1];
  const window = samples.filter((s) => s.t >= newest.t - PALM_PUSH_WINDOW_S - EPS && s.t <= newest.t);
  if (window.length < 2) return false;
  if (!window.every((s) => Number.isFinite(s.t) && finiteVec(s.pos) && finiteVec(s.normal))) return false;
  const normal = unit(newest.normal);
  if (normal === null || dot(normal, fwd) < FACING_MIN_COS) return false;
  // Travel from the rearmost point in the window, so a pull-back then push still measures the push.
  const rearmost = Math.min(...window.map((s) => dot(s.pos, fwd)));
  return dot(newest.pos, fwd) - rearmost >= PALM_PUSH_MIN_DISTANCE;
}

export function classifyPalmPush(left: readonly PalmSample[], right: readonly PalmSample[], forward: Vec3): boolean {
  const fwd = unit(forward);
  if (fwd === null || left.length === 0 || right.length === 0) return false;
  const tl = left[left.length - 1].t;
  const tr = right[right.length - 1].t;
  if (!Number.isFinite(tl) || !Number.isFinite(tr) || Math.abs(tl - tr) > PALM_PUSH_WINDOW_S + EPS) return false;
  return handPushed(left, fwd) && handPushed(right, fwd);
}

/** Any grip press edge (false -> true); a held grip never repeats. */
export function gripSqueezed(prev: GripState, curr: GripState): boolean {
  return (curr.left && !prev.left) || (curr.right && !prev.right);
}

/** D17 ready-glow: shown and lit only while the run is active at full charge. */
export function ultimateOrb(run: RunState | null): { visible: boolean; glowing: boolean } {
  const ready = run !== null && run.status === 'active' && run.charge >= ULTIMATE_CHARGE;
  return { visible: ready, glowing: ready };
}

/** Fires at most once per frame, and only with a strike-slot target to knock back. */
export function resolveUltimate(
  session: GameSession,
  wave: Wave,
  requests: readonly UltimateRequest[],
  opts?: { spawnDistance?: number },
): UltimateFrame {
  const same: UltimateFrame = { session, wave, effects: [] };
  const id = wave.targetId;
  if (requests.length === 0 || id === null || !wave.active.some((e) => e.id === id)) return same;
  const step = fireUltimate(session);
  if (step.session === session) return same;
  return { session: step.session, wave: ultimateKnockback(wave, opts ?? {}), effects: step.effects };
}
